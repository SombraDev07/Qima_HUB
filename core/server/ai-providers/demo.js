// Conector de IA de DEMONSTRAÇÃO — não usa nenhum serviço externo.
// Só "lê" os cupons fictícios gerados por scripts/lib/cupom.mjs (dados embutidos no PNG).
// Qualquer outra foto retorna erro, e a nota segue em modo manual.
// Ligue com QIMA_AI_PROVIDER=demo (ex.: no arquivo .env). Nunca use em produção.

function lerTextoPng(buf) {
  if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  let p = 8;
  while (p + 8 <= buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('ascii', p + 4, p + 8);
    if (type === 'tEXt') {
      const data = buf.subarray(p + 8, p + 8 + len).toString('latin1');
      const [key, val] = data.split('\0');
      if (key === 'qima-demo') return val;
    }
    if (type === 'IEND') break;
    p += 12 + len;
  }
  return null;
}

export default {
  async extrair({ buffer }) {
    await new Promise((r) => setTimeout(r, 600)); // simula o tempo de leitura
    const txt = lerTextoPng(buffer);
    if (!txt) throw new Error('demo: só lê os cupons de teste gerados pelo sistema');
    return JSON.parse(txt);
  },
};
