// Relatório do Hospedagens para a Administração (pedidos criados no período).
const ST = { rascunho: 'Rascunho', pendente: 'Novo', ajustado: 'Ajustado', em_andamento: 'Em andamento', finalizado: 'Finalizado', cancelado: 'Cancelado' };
const SIT = { novo: 'Novo', enviado: 'Enviado', alterado: 'Alterado', prorrogado: 'Prorrogado', finalizado: 'Finalizado' };
const AJ = { cancelar: 'Cancelar hóspede', prorrogar: 'Prorrogar', checkout: 'Check-out', editar: 'Editar', cancelar_pedido: 'Cancelar pedido' };
const noites = (a, b) => (a && b ? Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 86400000)) : null);

export default async function relatorio({ db, entre, periodo }) {
  const pedidos = await db.all(`SELECT * FROM hospedagens_pedidos WHERE ${entre('created_at')} ORDER BY id`, ...periodo);
  const lista = pedidos.map((p) => Number(p.id)).join(',') || '0'; // ids vindos do banco, só números
  const hosp = await db.all(`SELECT pedido_id, nome, status FROM hospedagens_hospedes WHERE pedido_id IN (${lista}) ORDER BY id`);
  const porPedido = (pid) => hosp.filter((h) => h.pedido_id === pid);
  const quartos = await db.all(`SELECT q.*, h.nome AS hotel_nome, h.cidade AS hotel_cidade, h.uf AS hotel_uf, p.codigo AS pedido_codigo, p.status AS pedido_status
    FROM hospedagens_quartos q JOIN hospedagens_pedidos p ON p.id = q.pedido_id LEFT JOIN hospedagens_hoteis h ON h.id = q.hotel_id
    WHERE q.pedido_id IN (${lista}) ORDER BY q.pedido_id, q.codigo, q.id`);
  const ocup = await db.all(`SELECT qh.quarto_id, hs.nome FROM hospedagens_quarto_hospedes qh JOIN hospedagens_hospedes hs ON hs.id = qh.hospede_id
    WHERE hs.pedido_id IN (${lista}) ORDER BY qh.slot`);
  const ajustes = await db.all(`SELECT s.*, p.codigo FROM hospedagens_solicitacoes s JOIN hospedagens_pedidos p ON p.id = s.pedido_id WHERE s.pedido_id IN (${lista}) ORDER BY s.id`);

  return {
    solicitante: {
      columns: [{ label: 'Pedido', width: 10 }, { label: 'Criado em', type: 'datetime', width: 17 }, { label: 'Solicitante', width: 24 }, { label: 'E-mail', width: 26 },
        { label: 'Cidade', width: 20 }, { label: 'UF', width: 5 }, { label: 'Início', type: 'date' }, { label: 'Fim', type: 'date' }, { label: 'Noites', width: 7 },
        { label: 'Projeto', width: 18 }, { label: 'Garagem', width: 9 }, { label: 'Qtd hóspedes', width: 8 }, { label: 'Hóspedes', type: 'texto', width: 40 },
        { label: 'Observação', type: 'texto', width: 40 }, { label: 'Ajustes pedidos', width: 9 }, { label: 'Status', width: 13 }],
      rows: pedidos.map((p) => {
        const hs = porPedido(p.id);
        return [p.codigo, p.created_at, p.solicitante_nome, p.solicitante_email, p.cidade, p.uf, p.data_inicio, p.data_fim, noites(p.data_inicio, p.data_fim),
          p.projeto, p.garagem, hs.length, hs.map((h) => `${h.nome}${h.status !== 'ativo' ? ` (${h.status})` : ''}`).join('\n'), p.obs,
          ajustes.filter((a) => a.pedido_id === p.id).length, ST[p.status] || p.status];
      }),
    },
    central: {
      columns: [{ label: 'Pedido', width: 10 }, { label: 'Quarto', width: 9 }, { label: 'Status pedido', width: 13 }, { label: 'Situação quarto', width: 12 },
        { label: 'Hotel', width: 26 }, { label: 'Cidade hotel', width: 18 }, { label: 'Check-in', type: 'date' }, { label: 'Check-out', type: 'date' }, { label: 'Noites', width: 7 },
        { label: 'Ocupantes', type: 'texto', width: 36 }, { label: 'Diária', type: 'money' }, { label: 'Extra', type: 'money' }, { label: 'Total', type: 'money' },
        { label: 'Enviado ao solicitante', width: 10 }, { label: 'Extrato', width: 12 }, { label: 'Status extrato', width: 12 }, { label: 'PO', width: 12 },
        { label: 'NF', width: 12 }, { label: 'Data NF', type: 'date' }, { label: 'Vencimento', type: 'date' }, { label: 'Status pagamento', width: 12 },
        { label: 'Obs. quarto', type: 'texto', width: 30 }, { label: 'Obs. financeiro', type: 'texto', width: 30 }],
      rows: quartos.map((q) => {
        const n = noites(q.data_in, q.data_out);
        return [q.pedido_codigo, q.codigo, ST[q.pedido_status] || q.pedido_status, SIT[q.situacao] || q.situacao, q.hotel_nome,
          q.hotel_cidade ? `${q.hotel_cidade} - ${q.hotel_uf}` : '', q.data_in, q.data_out, n, ocup.filter((o) => o.quarto_id === q.id).map((o) => o.nome).join('\n'),
          q.diaria, q.fin_extra || null, n !== null ? Math.round((n * q.diaria + (q.fin_extra || 0)) * 100) / 100 : null, q.enviado ? 'Sim' : 'Não',
          q.fin_extrato_id, q.fin_extrato_status, q.fin_po, q.fin_nf, q.fin_dt_nf, q.fin_vencimento, q.fin_status_pg, q.obs, q.fin_obs];
      }),
    },
    extras: [{
      name: 'Ajustes',
      columns: [{ label: 'Pedido', width: 10 }, { label: 'Tipo', width: 16 }, { label: 'Data', type: 'date' }, { label: 'Observação', type: 'texto', width: 36 },
        { label: 'Status', width: 11 }, { label: 'Resposta da central', type: 'texto', width: 36 }, { label: 'Pedido em', type: 'datetime', width: 17 }, { label: 'Resolvido em', type: 'datetime', width: 17 }],
      rows: ajustes.map((a) => [a.codigo, AJ[a.tipo] || a.tipo, a.data, a.obs, a.status, a.resposta, a.created_at, a.resolvido_at]),
    }],
  };
}
