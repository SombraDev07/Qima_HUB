// Gera imagem PNG de DANFE FICTÍCIO (NF de semente de soja) para testes.
// Os dados vão embutidos no bloco tEXt "qima-demo" — o conector de IA "demo" lê esse bloco.
import { F, semAcento, png } from './cupom.mjs';

export function danfePng(nf) {
  const W = 1000; const H = 1340;
  const g = Buffer.alloc(W * H, 250);
  let s = nf.seed || 11;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < g.length; i++) g[i] = 246 - Math.floor(rnd() * 9);
  const dot = (x, y, v = 35) => { if (x >= 0 && y >= 0 && x < W && y < H) g[y * W + x] = Math.min(g[y * W + x], v + Math.floor(rnd() * 25)); };
  const txt = (x, y, t, S = 2) => {
    [...semAcento(t)].forEach((ch, ci) => {
      (F[ch] || F[' ']).forEach((bits, cx) => { for (let cy = 0; cy < 7; cy++) if (bits & (1 << cy)) for (let a = 0; a < S; a++) for (let b = 0; b < S; b++) dot(x + ci * 6 * S + cx * S + a, y + cy * S + b); });
    });
  };
  const box = (x, y, w, h, rot) => {
    for (let i = x; i <= x + w; i++) { dot(i, y, 90); dot(i, y + h, 90); }
    for (let j = y; j <= y + h; j++) { dot(x, j, 90); dot(x + w, j, 90); }
    if (rot) txt(x + 6, y + 5, rot, 1);
  };
  const campo = (x, y, w, h, rot, valor, S = 2) => { box(x, y, w, h, rot); if (valor !== undefined && valor !== null) txt(x + 8, y + h - 7 * S - 6, String(valor), S); };
  const br = (n, d = 2) => n.toFixed(d).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const fmtDoc = (d) => (d.length === 14 ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` : `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`);
  const dataBr = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

  // canhoto
  box(20, 20, 960, 70);
  txt(30, 30, `RECEBEMOS DE ${nf.emitente.nome} OS PRODUTOS CONSTANTES NA NOTA FISCAL INDICADA`, 1);
  txt(30, 45, `DESTINATARIO ${nf.produtor.nome}  VALOR TOTAL ${br(nf.valorTotal)}`, 1);
  box(790, 20, 190, 70); txt(820, 30, 'NF-E', 2); txt(800, 52, `N ${br(nf.numero, 0)}`, 2); txt(830, 72, `SERIE ${nf.serie}`, 1);

  // emitente + DANFE + chave
  box(20, 105, 440, 150); txt(40, 125, nf.emitente.nome, 2); txt(40, 160, nf.emitente.endereco, 1); txt(40, 175, `${nf.emitente.cidade} - ${nf.emitente.uf}`, 1);
  box(470, 105, 150, 150, 'DANFE'); txt(480, 125, 'DOCUMENTO AUXILIAR', 1); txt(480, 137, 'DA NOTA FISCAL', 1); txt(480, 149, 'ELETRONICA', 1);
  txt(480, 175, '1 - SAIDA', 1); txt(480, 200, `N ${br(nf.numero, 0)}`, 2); txt(480, 225, `SERIE ${nf.serie}`, 2);
  box(630, 105, 350, 60);
  for (let i = 0; i < 300; i += 3) if (rnd() > 0.35) for (let j = 0; j < 40; j++) dot(650 + i, 115 + j, 20);
  campo(630, 170, 350, 40, 'CHAVE DE ACESSO', nf.chave.replace(/(\d{4})/g, '$1 ').trim(), 1);
  campo(630, 215, 350, 40, 'CONSULTA', 'WWW.NFE.FAZENDA.GOV.BR/PORTAL', 1);

  campo(20, 265, 600, 40, 'NATUREZA DA OPERACAO', 'VENDA DE PRODUCAO DO ESTABELECIMENTO', 2);
  campo(630, 265, 350, 40, 'PROTOCOLO DE AUTORIZACAO', `${nf.chave.slice(0, 15)} ${dataBr(nf.data)}`, 1);
  campo(20, 310, 300, 40, 'INSCRICAO ESTADUAL', nf.emitente.ie, 2);
  campo(330, 310, 290, 40, 'INSC. ESTADUAL DO SUBST.', '', 2);
  campo(630, 310, 350, 40, 'CNPJ', fmtDoc(nf.emitente.cnpj), 2);

  // destinatário
  txt(20, 362, 'DESTINATARIO / REMETENTE', 2);
  campo(20, 385, 600, 44, 'NOME / RAZAO SOCIAL', nf.produtor.nome, 2);
  campo(630, 385, 200, 44, 'CPF / CNPJ', fmtDoc(nf.produtor.doc), 2);
  campo(840, 385, 140, 44, 'DATA DA EMISSAO', dataBr(nf.data), 2);
  campo(20, 434, 600, 44, 'ENDERECO', nf.produtor.endereco, 2);
  campo(630, 434, 350, 44, 'BAIRRO / DISTRITO', 'INTERIOR', 2);
  campo(20, 483, 520, 44, 'MUNICIPIO', nf.produtor.municipio, 2);
  campo(550, 483, 70, 44, 'UF', nf.produtor.uf, 2);
  campo(630, 483, 350, 44, 'INSCRICAO ESTADUAL', nf.produtor.ie, 2);

  // impostos
  txt(20, 540, 'CALCULO DO IMPOSTO', 2);
  campo(20, 562, 230, 40, 'BASE DE CALCULO', '0,00', 2);
  campo(260, 562, 230, 40, 'VALOR DO ICMS', '0,00', 2);
  campo(500, 562, 230, 40, 'DESCONTO', br(nf.desconto), 2);
  campo(740, 562, 240, 40, 'VALOR TOTAL NOTA', br(nf.valorTotal), 2);

  // transporte
  txt(20, 615, 'TRANSPORTADOR / VOLUMES TRANSPORTADOS', 2);
  campo(20, 637, 300, 40, 'QUANTIDADE', br(nf.itens.reduce((a, i) => a + i.qtd, 0)), 2);
  campo(330, 637, 200, 40, 'ESPECIE', 'SACO', 2);
  campo(540, 637, 200, 40, 'PESO BRUTO', br(nf.pesoLiquido + 15), 2);
  campo(750, 637, 230, 40, 'PESO LIQUIDO', br(nf.pesoLiquido), 2);

  // produtos
  txt(20, 692, 'DADOS DOS PRODUTOS / SERVICOS', 2);
  const cols = [[20, 'COD.'], [100, 'DESCRICAO DOS PRODUTOS/SERVICOS'], [560, 'NCM/SH'], [640, 'UNID'], [700, 'QUANTIDADE'], [800, 'V.UNIT'], [890, 'V.TOTAL']];
  box(20, 712, 960, 26); cols.forEach(([x, t]) => txt(x + 4, 720, t, 1));
  let y = 745;
  nf.itens.forEach((it) => {
    const linhas = [];
    let resto = semAcento(it.descricao);
    while (resto.length) { linhas.push(resto.slice(0, 37)); resto = resto.slice(37); }
    txt(24, y, it.codigo, 2);
    linhas.forEach((l, k) => txt(104, y + k * 18, l, 2));
    txt(564, y, it.ncm, 1); txt(644, y, it.unidade, 2); txt(704, y, br(it.qtd), 2); txt(804, y, br(it.vunit, 4), 1); txt(894, y, br(it.qtd * it.vunit), 1);
    y += Math.max(1, linhas.length) * 18 + 14;
  });
  box(20, 738, 960, y - 738);

  // dados adicionais
  campo(20, y + 15, 960, 80, 'DADOS ADICIONAIS', nf.adicionais || 'DOCUMENTO EMITIDO POR ME OPTANTE PELO SIMPLES NACIONAL', 2);

  const dados = {
    legivel: true, numero_nf: String(nf.numero), serie: String(nf.serie), chave_acesso: nf.chave,
    emitente_nome: nf.emitente.nome, emitente_doc: nf.emitente.cnpj, produtor_nome: nf.produtor.nome, produtor_doc: nf.produtor.doc,
    data_emissao: nf.data, municipio: nf.produtor.municipio, uf: nf.produtor.uf, peso_liquido: nf.pesoLiquido.toFixed(2),
    germinacao_geral: nf.germAdicional ? String(nf.germAdicional) : '',
    itens: nf.itens.map((i) => ({
      descricao: i.descricao, cultivar: i.cultivar || '', unidade: i.unidade, quantidade: i.qtd.toFixed(2),
      sementes_por_unidade: i.spu ? String(i.spu) : '', germinacao: i.germ ? String(i.germ) : '', eh_soja: !!i.soja,
    })),
    observacao: '',
  };
  const json = JSON.stringify(dados).replace(/[\u0080-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
  return png(W, H, g, json);
}
