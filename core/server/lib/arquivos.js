// Fotos e anexos dos sistemas. Cada sistema recebe ctx.arquivos:
//   await arquivos.salvar(nome, buffer, mime)        guarda o arquivo
//   await arquivos.enviar(res, nome)                 devolve o arquivo na resposta (cabeçalhos ficam a cargo da rota)
//   await arquivos.ler(nome)                         devolve um Buffer
//   await arquivos.lerVarios(nomes)                  vários de uma vez (6 em paralelo); ausente vira null
//   await arquivos.entregarDownload(res, nome, buf)  download de arquivo gerado (ZIP): direto se pequeno, por link temporário se grande
//   arquivos.apagar(nome)                            apaga sem nunca dar erro (limpeza)
//
// Com SUPABASE_URL + SUPABASE_SERVICE_KEY o arquivo vai para um bucket PRIVADO do Supabase Storage
// (qima-arquivos/<sistema>/<nome>); a chave secreta nunca sai do servidor. Sem elas (desenvolvimento)
// usa a pasta local data/uploads/<sistema>. Na Vercel o disco não guarda nada, então sem a chave o envio é recusado.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { conferirArquivo, dimensoes } from './tipoArquivo.js';

const BUCKET = (process.env.QIMA_BUCKET || 'qima-arquivos').trim();
const base = () => (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
const segredo = () => (process.env.SUPABASE_SERVICE_KEY || '').trim();

export const storageAtivo = () => !!(base() && segredo());
export const BUCKET_ARQUIVOS = BUCKET;

// A Vercel recusa respostas de função acima de ~4,5 MB; acima disto o download vai por link temporário do Storage.
const LIMITE_RESPOSTA = 3.5 * 1024 * 1024;
const VALIDADE_LINK_S = 600; // 10 minutos
const IDADE_MAX_TEMP_MS = 30 * 60 * 1000;

// Chaves novas (sb_secret_…) não são JWT: vão só em "apikey". A chave antiga (service_role, JWT) vai nos dois.
const cabecalho = () => (segredo().startsWith('sb_') ? { apikey: segredo() } : { Authorization: `Bearer ${segredo()}`, apikey: segredo() });
const prazo = () => AbortSignal.timeout(50_000);

/** Nome seguro para o cabeçalho Content-Disposition (ASCII + versão UTF-8). */
const dispo = (nome) => `attachment; filename="${nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(nome)}`;

export function arquivosDoModulo(chave, filesDir) {
  const url = (nome) => `${base()}/storage/v1/object/${BUCKET}/${chave}/${encodeURIComponent(nome)}`;
  const local = (nome) => path.join(filesDir, path.basename(nome));
  const exigeArmazenamento = () => {
    if (!storageAtivo() && process.env.VERCEL) throw new Error('Armazenamento de arquivos não configurado (falta SUPABASE_SERVICE_KEY)');
  };

  const api = {
    onde: storageAtivo() ? `Supabase Storage (${BUCKET}/${chave})` : `pasta local (${filesDir})`,

    /** Confere o conteúdo real do arquivo enviado (veja tipoArquivo.js). null = ok; senão, a mensagem para a pessoa. */
    conferir: (buffer, mime) => conferirArquivo(buffer, mime),
    /** Largura e altura de uma imagem lidas do cabeçalho (sem decodificar), ou null. */
    dimensoes: (buffer, mime) => dimensoes(buffer, mime),

    async salvar(nome, buffer, mime) {
      exigeArmazenamento();
      // trava de segurança: nada que venha de fora é guardado sem conferir o conteúdo (os temporários são gerados pelo servidor)
      if (!String(nome).startsWith('_tmp-')) {
        const erro = conferirArquivo(buffer, mime);
        if (erro) throw Object.assign(new Error(erro), { status: 400, expose: true });
      }
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

    /** Lê vários arquivos, 6 de cada vez. Devolve uma lista na mesma ordem; o que não existe vira null. */
    async lerVarios(nomes) {
      const saida = new Array(nomes.length).fill(null);
      let proximo = 0;
      const trabalhador = async () => {
        while (proximo < nomes.length) {
          const k = proximo++;
          try { saida[k] = await api.ler(nomes[k]); } catch { saida[k] = null; }
        }
      };
      await Promise.all(Array.from({ length: Math.min(6, nomes.length) }, trabalhador));
      return saida;
    },

    async enviar(res, nome) {
      if (!storageAtivo()) {
        exigeArmazenamento();
        return res.sendFile(local(nome), (err) => { if (err && !res.headersSent) res.status(404).json({ error: 'Arquivo não encontrado' }); });
      }
      let buf;
      try { buf = await api.ler(nome); } catch (e) {
        if (e.status === 404) return res.status(404).json({ error: 'Arquivo não encontrado' });
        throw e;
      }
      return res.send(buf);
    },

    /**
     * Entrega um arquivo GERADO pelo servidor (ex.: ZIP de fotos).
     * Pequeno: vai direto na resposta. Grande (e com Storage): é guardado como temporário, e o navegador
     * é redirecionado a um link assinado que vale 10 minutos. Os temporários antigos são apagados a cada uso.
     */
    async entregarDownload(res, nomeDownload, buffer, mime = 'application/zip') {
      if (!storageAtivo() || buffer.length <= LIMITE_RESPOSTA) {
        res.setHeader('Content-Type', mime);
        res.setHeader('Content-Disposition', dispo(nomeDownload));
        return res.send(buffer);
      }
      await api.limparTemporarios();
      const nomeTemp = `_tmp-${Date.now()}-${crypto.randomBytes(5).toString('hex')}${path.extname(nomeDownload) || '.bin'}`;
      await api.salvar(nomeTemp, buffer, mime);
      const r = await fetch(`${base()}/storage/v1/object/sign/${BUCKET}/${chave}/${encodeURIComponent(nomeTemp)}`, {
        method: 'POST', headers: { ...cabecalho(), 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: VALIDADE_LINK_S }), signal: prazo(),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.signedURL) { api.apagar(nomeTemp); throw new Error(`Storage não gerou o link de download (${r.status})`); }
      return res.redirect(302, `${base()}/storage/v1${d.signedURL}&download=${encodeURIComponent(nomeDownload)}`);
    },

    /** Apaga os arquivos temporários (ZIPs) com mais de 30 minutos. Nunca dá erro. */
    async limparTemporarios() {
      if (!storageAtivo()) return;
      try {
        const r = await fetch(`${base()}/storage/v1/object/list/${BUCKET}`, {
          method: 'POST', headers: { ...cabecalho(), 'Content-Type': 'application/json' }, body: JSON.stringify({ prefix: chave, search: '_tmp-', limit: 200 }), signal: prazo(),
        });
        if (!r.ok) return;
        const lista = await r.json();
        const velhos = (Array.isArray(lista) ? lista : []).filter((o) => o.name?.startsWith('_tmp-') && Date.now() - Date.parse(o.created_at || 0) > IDADE_MAX_TEMP_MS);
        await Promise.all(velhos.map((o) => api.apagar(o.name)));
      } catch { /* limpeza é só um bônus */ }
    },

    apagar(nome) {
      try {
        if (!storageAtivo()) return fs.promises.rm(local(nome), { force: true }).catch(() => {});
        return fetch(url(nome), { method: 'DELETE', headers: cabecalho(), signal: prazo() }).then(() => {}).catch(() => {});
      } catch { return Promise.resolve(); }
    },
  };
  return api;
}
