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

/** Distritos válidos (o solicitante escolhe um ao enviar a NF). */
export const DISTRITOS = ['Maringá', 'Londrina', 'Cornélio Procópio', 'Campo Mourão'];

/** Parâmetros do sistema e seus valores iniciais (a central altera em Configurações). */
export const PARAMETROS = { germinacao_padrao: 92, espacamento_m: 0.45, sementes_por_metro: 13, produtividade_sc_ha: 70, kg_por_saca: 60, pms_g: 250 };

export async function config(db) {
  const c = { ...PARAMETROS };
  for (const r of await db.all('SELECT chave, valor FROM nota_nf_config')) if (r.chave in PARAMETROS && Number(r.valor) > 0) c[r.chave] = Number(r.valor);
  return { ...c, sementes_por_kg: 1_000_000 / c.pms_g }; // 1 kg = 1.000.000 g ÷ PMS (250 g) = 4.000 sementes
}

// ------------------------------------------------------------------ área e volume potencial (planilha "Cálculo volume potencial NF")
//   sementes totais   = quantidade × sementes por unidade
//   sementes por ha   = (10.000 ÷ espaçamento) × sementes por metro × (1 + (1 − germinação))
//   área potencial ha = sementes totais ÷ sementes por ha
//   volume potencial  = área × 70 sc/ha × 60 kg (sempre)
// Sementes por unidade: a da NF; em kg, 4.000 por kg; em saco/bag sem esse dado, (peso líquido ÷ nº de sacos) × 4.000 por kg.
const UN_SACO = /^(SC|SCS|SACO|SACOS|SACA|SACAS|BAG|BAGS|BIGBAG|BIG BAG|BB)$/;
const UN_KG = /^(KG|KGS|QUILO|QUILOS)$/;
const limpaUn = (u) => String(u || '').trim().toUpperCase().replace(/[.\s]+$/g, '').replace(/\.$/, '');
export const ehSaco = (u) => UN_SACO.test(limpaUn(u));
export const ehKg = (u) => UN_KG.test(limpaUn(u));

/** Um resultado por item (mesma ordem de "itens"). Item que não é soja ou sem como calcular: campos nulos. */
export function potencial(itens, nota, cfg) {
  const inc = itens.filter((i) => i.incluido);
  const totalSacos = inc.filter((i) => ehSaco(i.unidade)).reduce((s, i) => s + (Number(i.quantidade) || 0), 0);
  const pesoSaco = Number(nota?.peso_liquido) > 0 && totalSacos > 0 ? Number(nota.peso_liquido) / totalSacos : null;
  const baseHa = (10000 / cfg.espacamento_m) * cfg.sementes_por_metro;
  const vazio = { spu: null, origem: null, sementes_tot: null, sementes_ha: null, area_potencial: null, volume_potencial: null };
  return itens.map((i) => {
    const q = Number(i.quantidade);
    if (!i.incluido || !(q > 0)) return vazio;
    let spu = null; let origem = null;
    if (ehKg(i.unidade)) { spu = cfg.sementes_por_kg; origem = 'padrão por kg'; }
    else if (Number(i.sementes_por_unidade) > 0) { spu = Number(i.sementes_por_unidade); origem = 'da NF'; }
    else if (ehSaco(i.unidade) && pesoSaco) { spu = pesoSaco * cfg.sementes_por_kg; origem = 'peso líquido ÷ sacos'; }
    if (!spu) return vazio;
    const germ = (Number(i.germinacao) > 0 ? Number(i.germinacao) : cfg.germinacao_padrao) / 100;
    const sementesHa = baseHa * (1 + (1 - germ));
    const tot = q * spu;
    const area = tot / sementesHa;
    return { spu: Math.round(spu), origem, sementes_tot: Math.round(tot), sementes_ha: Math.round(sementesHa), area_potencial: area, volume_potencial: area * cfg.produtividade_sc_ha * cfg.kg_por_saca };
  });
}
export const somaPotencial = (pots) => ({
  area_potencial: pots.reduce((s, p) => s + (p.area_potencial || 0), 0),
  volume_potencial: pots.reduce((s, p) => s + (p.volume_potencial || 0), 0),
});

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
  if (!n.distrito) add('sem_distrito', 'Sem distrito');
  if (!n.produtor_nome) add('sem_produtor', 'Sem nome do produtor');
  if (!isDate(n.data_emissao)) add('sem_data', 'Sem data de emissão');
  else if (n.data_emissao > hoje()) add('data_futura', 'Data de emissão no futuro');
  const inc = itens.filter((i) => i.incluido);
  if (!inc.length) add('sem_soja', 'Nenhum item de semente de soja', 'red');
  if (inc.some((i) => i.germinacao_padrao)) add('germ_padrao', `Germinação não informada — usado ${cfg.germinacao_padrao}%`);
  const pots = potencial(itens, n, cfg);
  if (itens.some((i, k) => i.incluido && !pots[k].spu)) add('sem_spu', 'Item sem sementes por unidade (ex.: 160K) e sem como calcular pelo peso líquido');
  else if (itens.some((i, k) => i.incluido && !i.sementes_por_unidade && pots[k].spu)) add('spu_calculado', 'Sementes por unidade calculadas (kg ou peso líquido ÷ sacos)', 'amber');
  if (inc.some((i) => !(i.quantidade > 0))) add('sem_qtd', 'Item sem quantidade', 'red');
  if (parecidas) add('duplicada', `${parecidas} NF parecida(s) no banco`, 'red');
  return out;
}

export const STATUS_LABEL = { rascunho: 'Rascunho', aguardando: 'Aguardando central', validada: 'Validada', recusada: 'Recusada', substituida: 'Substituída', cancelada: 'Cancelada' };

// ------------------------------------------------------------------ planilha de potencial (uma linha por item de soja)
const STATUS_PLANILHA = { aguardando: 'Em validação', validada: 'Validada', recusada: 'Recusada', rascunho: 'Rascunho', substituida: 'Substituída', cancelada: 'Cancelada' };
const COL_POTENCIAL = [
  { label: 'ID', width: 11 }, { label: 'Quem subiu', width: 22 }, { label: 'Data/hora do upload', type: 'datetime', width: 17 }, { label: 'Emitente', width: 30 },
  { label: 'CNPJ emitente', width: 19 }, { label: 'Produtor', width: 28 }, { label: 'CNPJ/CPF produtor', width: 19 }, { label: 'Data de emissão', type: 'date' },
  { label: 'Distrito', width: 17 }, { label: 'Município', width: 18 }, { label: 'Cultivar', width: 16 }, { label: 'Área potencial (ha)', width: 14 }, { label: 'Vol. potencial (kg)', width: 16 },
  { label: 'Unidade', width: 9 }, { label: 'Qtde', width: 10 }, { label: 'Sementes/unidade', width: 14 }, { label: 'Tx germinação (%)', width: 12 }, { label: 'Validação', width: 17 },
  { label: 'Status', width: 14 }, { label: 'Nº NF', width: 10 }, { label: 'Chave ID', width: 46 },
  { label: 'Detalhe da validação', type: 'texto', width: 40 }, { label: 'Origem das sementes/unidade', width: 20 },
];
const arred = (n, d = 2) => (n == null ? null : Math.round(n * 10 ** d) / 10 ** d);

/** Folha "Potencial" no padrão pedido: uma linha por item de soja, com área e volume potencial, distrito e validação. */
export async function folhaPotencial(db, notas) {
  const cfg = await config(db);
  const todos = notas.length ? await db.all(`SELECT * FROM nota_nf_itens WHERE nota_id IN (${ids(notas.map((n) => n.id))}) ORDER BY nota_id, ordem, id`) : [];
  const dups = await duplicadosDe(db, notas);
  const rows = [];
  for (const n of notas) {
    const its = todos.filter((i) => i.nota_id === n.id);
    const pot = potencial(its, n, cfg);
    const al = alertas(n, its, cfg, dups.get(n.id).length);
    const validacao = al.some((a) => a.nivel === 'red') ? 'Erro identificado' : 'OK';
    its.forEach((i, k) => {
      if (!i.incluido) return;
      rows.push([n.codigo, n.dono_nome, n.enviado_at || n.created_at, n.emitente_nome, fmtDoc(n.emitente_doc), n.produtor_nome, fmtDoc(n.produtor_doc), n.data_emissao, n.distrito, n.municipio,
        i.cultivar, arred(pot[k].area_potencial), arred(pot[k].volume_potencial), i.unidade, i.quantidade, pot[k].spu, i.germinacao, validacao, STATUS_PLANILHA[n.status] || n.status,
        n.numero_nf, n.chave_acesso, al.map((a) => a.texto).join('; '), pot[k].origem]);
    });
  }
  return { name: 'Potencial', columns: COL_POTENCIAL, rows };
}
