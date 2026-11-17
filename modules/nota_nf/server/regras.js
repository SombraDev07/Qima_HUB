// Regras de negócio do Nota NF: semente de soja, chave de acesso, germinação, duplicidade.

export class RuleError extends Error {
  constructor(msg, status = 400) { super(msg); this.status = status; }
}

export const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
export const hoje = () => new Date().toISOString().slice(0, 10);
export const soDigitos = (s) => String(s ?? '').replace(/\D/g, '');
export const codigoNota = (id) => `NF-${String(id).padStart(5, '0')}`;
export const brDate = (s) => (isDate(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '');
export const UFS = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'];
const UF_IBGE = { 11: 'RO', 12: 'AC', 13: 'AM', 14: 'RR', 15: 'PA', 16: 'AP', 17: 'TO', 21: 'MA', 22: 'PI', 23: 'CE', 24: 'RN', 25: 'PB', 26: 'PE', 27: 'AL', 28: 'SE', 29: 'BA', 31: 'MG', 32: 'ES', 33: 'RJ', 35: 'SP', 41: 'PR', 42: 'SC', 43: 'RS', 50: 'MS', 51: 'MT', 52: 'GO', 53: 'DF' };

export function parseNumero(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v ?? '').trim().replace(/[^\d,.-]/g, '');
  if (!s) return null;
  // "3.080,00" → 3080 · "3080.00" → 3080 · "20,00" → 20
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : (/^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, '') : s));
  return Number.isFinite(n) ? n : null;
}

export function fmtDoc(d) {
  d = soDigitos(d);
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  return d;
}

export function docValido(d) {
  d = soDigitos(d);
  if (d.length === 11) {
    if (/^(\d)\1{10}$/.test(d)) return false;
    const dv = (n) => { let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
    return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
  }
  if (d.length === 14) {
    if (/^(\d)\1{13}$/.test(d)) return false;
    const calc = (n) => { const w = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; const s = w.reduce((a, x, i) => a + x * Number(d[i]), 0); const r = s % 11; return r < 2 ? 0 : 11 - r; };
    return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
  }
  return false;
}

/** Dígito verificador da chave de acesso (módulo 11). */
export function dvChave(ch43) {
  let peso = 2; let soma = 0;
  for (let i = ch43.length - 1; i >= 0; i--) { soma += Number(ch43[i]) * peso; peso = peso === 9 ? 2 : peso + 1; }
  const r = soma % 11;
  return r < 2 ? 0 : 11 - r;
}
export const chaveValida = (ch) => /^\d{44}$/.test(ch || '') && dvChave(ch.slice(0, 43)) === Number(ch[43]);
export function chaveInfo(ch) {
  if (!/^\d{44}$/.test(ch || '')) return null;
  return { uf: UF_IBGE[Number(ch.slice(0, 2))] || null, aamm: ch.slice(2, 6), cnpj: ch.slice(6, 20), modelo: ch.slice(20, 22), serie: String(Number(ch.slice(22, 25))), numero: String(Number(ch.slice(25, 34))) };
}

// ------------------------------------------------------------------ itens: soja / líquido / sementes / germinação
const UNIDADE_LIQUIDA = /^(LT|LTS|L|LITRO|LITROS|ML|GL|GAL|GALAO|GALÃO|BD|BOMBONA)$/i;
const DESC_LIQUIDA = /\b(LT|LTS|LITROS?|ML)\b|INOCUL|ADITIVO|FUNGIC|INSETIC|HERBIC|BIOLOG|ENRAIZ|ADJUV|FOLIAR|LIQUID/i;

export function sementesPorUnidade(desc) {
  const s = String(desc || '').toUpperCase();
  let m = s.match(/(\d{2,3})\s*K\b/); // 160K
  if (m) return Number(m[1]) * 1000;
  m = s.match(/\b(\d{2,3})[.,]000\b/); // 160.000
  if (m) return Number(m[1]) * 1000;
  m = s.match(/\b(\d{2,3})\s*MIL\b/); // 160 MIL
  if (m) return Number(m[1]) * 1000;
  return null;
}

export function germinacaoDe(texto) {
  const m = String(texto || '').toUpperCase().match(/GERM\w*\.?\s*(?:MIN\w*\.?\s*)?[:=-]?\s*(\d{2,3}(?:[.,]\d)?)\s*%?/);
  if (!m) return null;
  const g = Number(m[1].replace(',', '.'));
  return g > 0 && g <= 100 ? g : null;
}

export function cultivarDe(desc) {
  const m = String(desc || '').toUpperCase().match(/\b([A-Z]{1,4}\s?\d{4}[A-Z0-9 ]{0,8}?(?:IPRO|RR2?|RG|I2X|E3|CE|XTD)?)\b/);
  return m ? m[1].trim() : null;
}

/** Decide se a linha entra (semente de soja) e completa sementes/germinação. */
export function classificarItem(it, cfg, germGeral = null) {
  const desc = String(it.descricao || '').trim();
  const unidade = String(it.unidade || '').trim().toUpperCase();
  const soja = /SOJA/i.test(desc) || it.eh_soja === true;
  const liquido = UNIDADE_LIQUIDA.test(unidade) || DESC_LIQUIDA.test(desc);
  let incluido = soja && !liquido;
  let motivo = null;
  if (!soja) motivo = 'Não é soja';
  else if (liquido) motivo = 'Produto líquido (LT)';
  if (typeof it.incluido === 'boolean' || it.incluido === 0 || it.incluido === 1) {
    // escolha manual (solicitante/central) prevalece
    incluido = !!it.incluido;
    motivo = incluido ? null : (it.motivo_exclusao || motivo || 'Excluído manualmente');
  }
  const spu = Number(it.sementes_por_unidade) > 0 ? Math.round(Number(it.sementes_por_unidade)) : sementesPorUnidade(desc);
  let germ = parseNumero(it.germinacao);
  let padrao = false;
  if (!(germ > 0 && germ <= 100)) germ = germinacaoDe(desc) ?? germGeral;
  if (!(germ > 0 && germ <= 100)) { germ = cfg.germinacao_padrao; padrao = true; }
  if (it.germinacao_padrao && Number(it.germinacao) === cfg.germinacao_padrao) padrao = true;
  return {
    descricao: desc,
    cultivar: String(it.cultivar || '').trim() || cultivarDe(desc),
    unidade: unidade || null,
    quantidade: parseNumero(it.quantidade),
    sementes_por_unidade: spu || null,
    germinacao: germ,
    germinacao_padrao: padrao,
    incluido,
    motivo_exclusao: incluido ? null : motivo,
  };
}

export function totais(itens) {
  const inc = itens.filter((i) => i.incluido);
  const quantidade = inc.reduce((s, i) => s + (i.quantidade || 0), 0);
  const sementes = inc.reduce((s, i) => s + (i.quantidade || 0) * (i.sementes_por_unidade || 0), 0);
  const viaveis = inc.reduce((s, i) => s + (i.quantidade || 0) * (i.sementes_por_unidade || 0) * ((i.germinacao || 0) / 100), 0);
  return { itens_soja: inc.length, itens_ignorados: itens.length - inc.length, quantidade, sementes: Math.round(sementes), viaveis: Math.round(viaveis) };
}

// As funções abaixo recebem "db": o banco (pg) ou, dentro de transação, o "t".
/** Lista de ids para usar em "IN (...)": só inteiros positivos; vazia vira "0" (não casa com nada). */
export const ids = (xs) => xs.map(Number).filter((n) => Number.isInteger(n) && n > 0).join(',') || '0';

export async function config(db) {
  const r = await db.get("SELECT valor FROM nota_nf_config WHERE chave = 'germinacao_padrao'");
  return { germinacao_padrao: Number(r?.valor) || 92 };
}

/** Grava uma ou várias linhas de histórico num INSERT só. Cada item: [notaId, acao, detalhe]. */
export async function logs(db, user, itens) {
  if (!itens.length) return;
  await db.run(`INSERT INTO nota_nf_historico (nota_id, user_id, user_nome, acao, detalhe) VALUES ${itens.map(() => '(?, ?, ?, ?, ?)').join(', ')}`,
    ...itens.flatMap(([notaId, acao, detalhe = '']) => [notaId, user?.id ?? null, user?.name ?? 'sistema', acao, detalhe]));
}
export const log = (db, notaId, user, acao, detalhe = '') => logs(db, user, [[notaId, acao, detalhe]]);

/**
 * NFs parecidas já existentes no banco, para VÁRIAS notas de uma vez (uma consulta, não 3 por nota).
 * Considera NFs enviadas de qualquer pessoa e os rascunhos do próprio dono; a nota que esta substitui não conta.
 * Devolve Map(id da nota → lista de parecidas, cada uma com "motivos").
 */
export async function duplicadosDe(db, notas) {
  const out = new Map(notas.map((n) => [n.id, []]));
  if (!notas.length) return out;
  const FOTO = '(n.hash = a.hash OR (n.hash_original IS NOT NULL AND n.hash_original = COALESCE(a.hash_original, a.hash)))';
  const CHAVE = '(length(a.chave_acesso) = 44 AND n.chave_acesso = a.chave_acesso)';
  const NF = '(a.emitente_doc IS NOT NULL AND a.numero_nf IS NOT NULL AND n.emitente_doc = a.emitente_doc AND n.numero_nf = a.numero_nf)';
  const rows = await db.all(`
    SELECT a.id AS de, n.id, n.codigo, n.numero_nf, n.emitente_nome, n.produtor_nome, n.data_emissao, n.status, n.dono_nome,
      ${FOTO} AS m_foto, ${CHAVE} AS m_chave, ${NF} AS m_nf
    FROM nota_nf_notas a
    JOIN nota_nf_notas n ON n.id <> a.id AND n.id <> COALESCE(a.substitui_id, -1)
      AND n.status NOT IN ('cancelada','substituida') AND (n.status <> 'rascunho' OR n.dono_id = a.dono_id)
      AND (${FOTO} OR ${CHAVE} OR ${NF})
    WHERE a.id IN (${ids(notas.map((n) => n.id))}) ORDER BY n.id`);
  for (const { de, m_foto, m_chave, m_nf, ...r } of rows) {
    out.get(de).push({ ...r, motivos: [m_foto && 'Mesma foto', m_chave && 'Mesma chave de acesso', m_nf && 'Mesmo emitente e número'].filter(Boolean) });
  }
  return out;
}

/** Alertas da NF. "parecidas" = quantas NFs parecidas existem no banco. */
export function alertas(n, itens, cfg, parecidas = 0) {
  const out = [];
  const add = (tipo, texto, nivel = 'amber') => out.push({ tipo, texto, nivel });
  if (n.ia_status === 'falhou') add('ia_falhou', 'A IA não conseguiu ler esta NF');
  if (!n.chave_acesso) add('sem_chave', 'Sem chave de acesso');
  else if (!chaveValida(n.chave_acesso)) add('chave_invalida', 'Chave de acesso inválida (dígito verificador não confere)', 'red');
  else {
    const c = chaveInfo(n.chave_acesso);
    if (n.emitente_doc && c.cnpj !== n.emitente_doc) add('chave_cnpj', 'CNPJ do emitente diferente do que está na chave', 'red');
    if (n.numero_nf && c.numero !== String(Number(n.numero_nf))) add('chave_numero', `Número da NF diferente do que está na chave (${c.numero})`, 'red');
    if (isDate(n.data_emissao) && c.aamm !== n.data_emissao.slice(2, 4) + n.data_emissao.slice(5, 7)) add('chave_data', 'Mês/ano da emissão diferente do que está na chave');
  }
  if (n.emitente_doc && !docValido(n.emitente_doc)) add('emitente_doc', 'CNPJ do emitente inválido');
  if (n.produtor_doc && !docValido(n.produtor_doc)) add('produtor_doc', 'CPF/CNPJ do produtor inválido');
  if (!n.numero_nf) add('sem_numero', 'Sem número da NF');
  if (!n.produtor_nome) add('sem_produtor', 'Sem nome do produtor');
  if (!isDate(n.data_emissao)) add('sem_data', 'Sem data de emissão');
  else if (n.data_emissao > hoje()) add('data_futura', 'Data de emissão no futuro');
  const inc = itens.filter((i) => i.incluido);
  if (!inc.length) add('sem_soja', 'Nenhum item de semente de soja', 'red');
  if (inc.some((i) => i.germinacao_padrao)) add('germ_padrao', `Germinação não informada — usado ${cfg.germinacao_padrao}%`);
  if (inc.some((i) => !i.sementes_por_unidade)) add('sem_spu', 'Item sem sementes por unidade (ex.: 160K)');
  if (inc.some((i) => !(i.quantidade > 0))) add('sem_qtd', 'Item sem quantidade', 'red');
  if (parecidas) add('duplicada', `${parecidas} NF parecida(s) no banco`, 'red');
  return out;
}

export const STATUS_LABEL = { rascunho: 'Rascunho', aguardando: 'Aguardando central', validada: 'Validada', recusada: 'Recusada', substituida: 'Substituída', cancelada: 'Cancelada' };
