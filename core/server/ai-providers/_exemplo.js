// MODELO de conector de IA. Copie para <nome>.js e ligue com QIMA_AI_PROVIDER=<nome>.
//
// Contrato: export default { extrair(req) } onde req =
//   buffer     Buffer com o arquivo (JPEG/PNG/WEBP ou PDF)
//   mime       'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf'
//   instrucoes texto em português dizendo o que extrair
//   schema     JSON Schema do objeto de resposta (todos os campos são string ou boolean)
// e o retorno é o objeto já parseado, no formato do schema.
// Lance um Error se a leitura falhar — o sistema segue em modo manual para aquela nota.

export default {
  async extrair({ buffer, mime, instrucoes, schema }) {
    // Exemplo genérico (ajuste ao serviço escolhido):
    // const r = await fetch(process.env.MINHA_IA_URL, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.MINHA_IA_KEY}` },
    //   body: JSON.stringify({ arquivo_base64: buffer.toString('base64'), mime, instrucoes, schema }),
    // });
    // if (!r.ok) throw new Error(`IA respondeu ${r.status}`);
    // return await r.json();
    throw new Error('Conector de exemplo — implemente a chamada ao serviço de IA');
  },
};
