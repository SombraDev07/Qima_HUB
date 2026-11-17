// Fotos e anexos dos sistemas. Cada sistema recebe ctx.arquivos:
//   await arquivos.salvar(nome, buffer, mime)   guarda o arquivo
//   await arquivos.enviar(res, nome)            devolve o arquivo na resposta (cabeçalhos ficam a cargo da rota)
//   await arquivos.ler(nome)                    devolve um Buffer (para montar ZIPs)
//   arquivos.apagar(nome)                       apaga sem nunca dar erro (limpeza)
//
// Com SUPABASE_URL + SUPABASE_SERVICE_KEY o arquivo vai para um bucket PRIVADO do Supabase Storage
// (qima-arquivos/<sistema>/<nome>); a chave secreta nunca sai do servidor. Sem elas (desenvolvimento)
// usa a pasta local data/uploads/<sistema>. Na Vercel o disco não guarda nada, então sem a chave o envio é recusado.
import fs from 'node:fs';
import path from 'node:path';

const BUCKET = (process.env.QIMA_BUCKET || 'qima-arquivos').trim();
const base = () => (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
const segredo = () => (process.env.SUPABASE_SERVICE_KEY || '').trim();

export const storageAtivo = () => !!(base() && segredo());
export const BUCKET_ARQUIVOS = BUCKET;

// Chaves novas (sb_secret_…) não são JWT: vão só em "apikey". A chave antiga (service_role, JWT) vai nos dois.
const cabecalho = () => (segredo().startsWith('sb_') ? { apikey: segredo() } : { Authorization: `Bearer ${segredo()}`, apikey: segredo() });
const prazo = () => AbortSignal.timeout(50_000);

export function arquivosDoModulo(chave, filesDir) {
  const url = (nome) => `${base()}/storage/v1/object/${BUCKET}/${chave}/${encodeURIComponent(nome)}`;
  const local = (nome) => path.join(filesDir, path.basename(nome));
  const exigeArmazenamento = () => {
    if (!storageAtivo() && process.env.VERCEL) throw new Error('Armazenamento de arquivos não configurado (falta SUPABASE_SERVICE_KEY)');
  };

  return {
    onde: storageAtivo() ? `Supabase Storage (${BUCKET}/${chave})` : `pasta local (${filesDir})`,

    async salvar(nome, buffer, mime) {
      exigeArmazenamento();
      if (!storageAtivo()) { await fs.promises.mkdir(filesDir, { recursive: true }); await fs.promises.writeFile(local(nome), buffer); return; }
      const r = await fetch(url(nome), { method: 'POST', headers: { ...cabecalho(), 'Content-Type': mime || 'application/octet-stream', 'x-upsert': 'false' }, body: buffer, signal: prazo() });
      if (!r.ok) throw new Error(`Storage recusou o arquivo (${r.status}): ${(await r.text()).slice(0, 160)}`);
    },

    async ler(nome) {
      exigeArmazenamento();
      if (!storageAtivo()) return fs.promises.readFile(local(nome));
      const r = await fetch(url(nome), { headers: cabecalho(), signal: prazo() });
      if (!r.ok) throw Object.assign(new Error(`Arquivo não encontrado no Storage (${r.status})`), { status: r.status === 404 || r.status === 400 ? 404 : 502 });
      return Buffer.from(await r.arrayBuffer());
    },

    async enviar(res, nome) {
      if (!storageAtivo()) {
        exigeArmazenamento();
        return res.sendFile(local(nome), (err) => { if (err && !res.headersSent) res.status(404).json({ error: 'Arquivo não encontrado' }); });
      }
      let buf;
      try { buf = await this.ler(nome); } catch (e) {
        if (e.status === 404) return res.status(404).json({ error: 'Arquivo não encontrado' });
        throw e;
      }
      return res.send(buf);
    },

    apagar(nome) {
      try {
        if (!storageAtivo()) return fs.promises.rm(local(nome), { force: true }).catch(() => {});
        return fetch(url(nome), { method: 'DELETE', headers: cabecalho(), signal: prazo() }).then(() => {}).catch(() => {});
      } catch { return Promise.resolve(); }
    },
  };
}
