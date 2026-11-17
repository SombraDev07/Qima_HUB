// Leitura da nota por IA (usa o conector de IA do núcleo, se houver um configurado).
import { isDate, parseValor, soDigitos } from './regras.js';

const SCHEMA = (tipos) => ({
  type: 'object',
  additionalProperties: false,
  required: ['legivel', 'valor_total', 'data_emissao', 'emitente', 'cnpj', 'numero_nf', 'chave_acesso', 'tipo', 'observacao'],
  properties: {
    legivel: { type: 'boolean', description: 'true se for um comprovante de despesa legível' },
    valor_total: { type: 'string', description: 'Valor total pago, só números com ponto decimal, ex: "39.90". Vazio se não achar.' },
    data_emissao: { type: 'string', description: 'Data da compra no formato AAAA-MM-DD. Vazio se não achar.' },
    emitente: { type: 'string', description: 'Razão social ou nome do estabelecimento' },
    cnpj: { type: 'string', description: 'CNPJ do emitente, só dígitos' },
    numero_nf: { type: 'string', description: 'Número da nota/cupom (NFC-e, NF-e ou recibo), só dígitos' },
    chave_acesso: { type: 'string', description: 'Chave de acesso de 44 dígitos, só dígitos. Vazio se não houver.' },
    tipo: { type: 'string', enum: tipos, description: 'Tipo de despesa mais provável' },
    observacao: { type: 'string', description: 'Algo que a central deveria saber (ex.: nota rasgada, valor riscado). Vazio se nada.' },
  },
});

const INSTRUCOES = (tipos) => `Você está lendo a foto ou PDF de um comprovante de despesa brasileiro (cupom fiscal NFC-e, nota fiscal, recibo ou comprovante de pagamento) enviado para reembolso.
Extraia os campos pedidos. Regras:
- valor_total: o valor TOTAL efetivamente pago (não subtotal, não troco). Use ponto como separador decimal.
- data_emissao: a data da compra/emissão (AAAA-MM-DD). Se o ano estiver com 2 dígitos, assuma 20XX.
- cnpj, numero_nf e chave_acesso: apenas dígitos.
- tipo: escolha um entre: ${tipos.join(', ')}.
- Se um campo não estiver visível, devolva string vazia. Não invente valores.
- legivel = false se a imagem não for um comprovante ou estiver ilegível.`;

/** Retorna os campos lidos (já normalizados) ou { ia_status: 'indisponivel'|'falhou' }. */
export async function lerNota(ai, buffer, mime, tipos) {
  if (!ai.disponivel()) return { ia_status: 'indisponivel' };
  try {
    const r = await ai.extrair({ buffer, mime, instrucoes: INSTRUCOES(tipos), schema: SCHEMA(tipos) });
    if (!r || r.legivel === false) return { ia_status: 'falhou', ia_json: JSON.stringify(r ?? null), ia_obs: 'Comprovante ilegível ou não reconhecido' };
    const valor = parseValor(r.valor_total);
    const data = isDate(r.data_emissao) ? r.data_emissao : null;
    const tipo = tipos.includes(r.tipo) ? r.tipo : null;
    const chave = soDigitos(r.chave_acesso);
    return {
      ia_status: 'ok',
      ia_json: JSON.stringify(r),
      ia_obs: r.observacao || null,
      ia_valor: valor,
      ia_data: data,
      valor,
      data,
      tipo,
      emitente: String(r.emitente || '').trim() || null,
      cnpj: soDigitos(r.cnpj) || (chave.length === 44 ? chave.slice(6, 20) : null),
      numero_nf: soDigitos(r.numero_nf).replace(/^0+/, '') || null,
      chave_acesso: chave.length === 44 ? chave : null,
    };
  } catch (e) {
    console.error('[despesas] leitura por IA falhou:', e.message);
    return { ia_status: 'falhou', ia_obs: 'Falha na leitura automática' };
  }
}
