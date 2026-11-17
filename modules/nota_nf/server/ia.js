// Leitura da NF (DANFE) por IA — usa o conector de IA do núcleo, se houver.
import { isDate, parseNumero, soDigitos, UFS } from './regras.js';

const S = (description) => ({ type: 'string', description });
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['legivel', 'numero_nf', 'serie', 'chave_acesso', 'emitente_nome', 'emitente_doc', 'produtor_nome', 'produtor_doc',
    'data_emissao', 'municipio', 'uf', 'peso_liquido', 'germinacao_geral', 'itens', 'observacao'],
  properties: {
    legivel: { type: 'boolean', description: 'true se for uma nota fiscal (DANFE) legível' },
    numero_nf: S('Número da NF, só dígitos (ex.: "61407")'),
    serie: S('Série da NF'),
    chave_acesso: S('Chave de acesso de 44 dígitos, só dígitos'),
    emitente_nome: S('Razão social do EMITENTE (quem vendeu/emitiu a NF, ex.: a cooperativa)'),
    emitente_doc: S('CNPJ do emitente, só dígitos'),
    produtor_nome: S('Nome/Razão social do DESTINATÁRIO (o produtor)'),
    produtor_doc: S('CPF ou CNPJ do destinatário (produtor), só dígitos'),
    data_emissao: S('Data de emissão no formato AAAA-MM-DD'),
    municipio: S('Município do destinatário (produtor)'),
    uf: S('UF do destinatário, 2 letras'),
    peso_liquido: S('Peso líquido total em kg, ex.: "3080.00"'),
    germinacao_geral: S('Germinação (%) se aparecer FORA da descrição dos itens (ex.: dados adicionais). Só o número. Vazio se não houver.'),
    itens: {
      type: 'array',
      description: 'TODAS as linhas de produto da NF, na ordem (inclusive as que não são soja)',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['descricao', 'cultivar', 'unidade', 'quantidade', 'sementes_por_unidade', 'germinacao', 'eh_soja'],
        properties: {
          descricao: S('Descrição completa do produto, como está na NF'),
          cultivar: S('Cultivar/variedade da semente (ex.: "NA 5909 RG"). Vazio se não for semente.'),
          unidade: S('Unidade (ex.: SACO, SC, KG, LT)'),
          quantidade: S('Quantidade, ex.: "20.00"'),
          sementes_por_unidade: S('Sementes por unidade/saco quando informado na descrição: "160K" → "160000"; "160.000" → "160000". Vazio se não houver.'),
          germinacao: S('Germinação (%) se informada na descrição da linha. Só o número. Vazio se não houver.'),
          eh_soja: { type: 'boolean', description: 'true se a linha for SEMENTE DE SOJA (não produtos líquidos como inoculantes em litros)' },
        },
      },
    },
    observacao: S('Algo que a central deveria saber. Vazio se nada.'),
  },
};

const INSTRUCOES = `Você está lendo a foto ou PDF de uma nota fiscal brasileira (DANFE) de venda/remessa de SEMENTES DE SOJA para um produtor rural.
Extraia os campos pedidos. Regras:
- Emitente = quem emitiu a NF (bloco do topo, ex.: cooperativa). Produtor = destinatário/remetente.
- Município e UF são os do DESTINATÁRIO (produtor).
- Liste TODAS as linhas de "Dados dos produtos/serviços". Para cada uma informe se é semente de soja (eh_soja).
  Produtos líquidos (unidade LT/litro, inoculantes, defensivos) NÃO são soja.
- sementes_por_unidade: geralmente aparece na descrição como "160K" ou "160.000" (sementes por saco).
- germinacao: procure "GERM", "GERMINAÇÃO" na descrição; se aparecer só nos dados adicionais, use germinacao_geral.
- CPF, CNPJ, chave e número: apenas dígitos. Números com ponto decimal. Se não houver, string vazia. Não invente.`;

/** Retorna dados normalizados da NF, ou { ia_status: 'indisponivel'|'falhou' }. */
export async function lerNF(ai, buffer, mime) {
  if (!ai.disponivel()) return { ia_status: 'indisponivel' };
  try {
    const r = await ai.extrair({ buffer, mime, instrucoes: INSTRUCOES, schema: SCHEMA });
    if (!r || r.legivel === false) return { ia_status: 'falhou', ia_json: JSON.stringify(r ?? null), ia_obs: 'NF ilegível ou não reconhecida' };
    const uf = String(r.uf || '').trim().toUpperCase();
    return {
      ia_status: 'ok',
      ia_json: JSON.stringify(r),
      ia_obs: r.observacao || null,
      numero_nf: soDigitos(r.numero_nf).replace(/^0+/, '') || null,
      serie: soDigitos(r.serie).replace(/^0+/, '') || null,
      chave_acesso: soDigitos(r.chave_acesso).length === 44 ? soDigitos(r.chave_acesso) : null,
      emitente_nome: String(r.emitente_nome || '').trim() || null,
      emitente_doc: soDigitos(r.emitente_doc) || null,
      produtor_nome: String(r.produtor_nome || '').trim() || null,
      produtor_doc: soDigitos(r.produtor_doc) || null,
      data_emissao: isDate(r.data_emissao) ? r.data_emissao : null,
      municipio: String(r.municipio || '').trim() || null,
      uf: UFS.includes(uf) ? uf : null,
      peso_liquido: parseNumero(r.peso_liquido),
      germinacao_geral: parseNumero(r.germinacao_geral),
      itens: Array.isArray(r.itens) ? r.itens : [],
    };
  } catch (e) {
    console.error('[nota_nf] leitura por IA falhou:', e.message);
    return { ia_status: 'falhou', ia_obs: 'Falha na leitura automática' };
  }
}
