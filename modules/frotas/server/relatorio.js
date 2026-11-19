// Relatório do Frotas para a Administração: pedidos criados no período, veículos e chamados do período.
import { PEDIDO_STATUS, VEICULO_STATUS, CHAMADO_TIPO, CHAMADO_STATUS, ANGULOS } from './regras.js';

export default async function relatorio({ db, entre, periodo }) {
  const pedidos = await db.all(`SELECT * FROM frotas_pedidos WHERE ${entre('created_at')} ORDER BY id`, ...periodo);
  // veículos criados no período ou devolvidos/alterados nele (a devolução é uma data; a alteração, data e hora)
  const veic = await db.all(`SELECT v.*, p.codigo AS pedido_codigo FROM frotas_veiculos v LEFT JOIN frotas_pedidos p ON p.id = v.pedido_id
    WHERE ${entre('v.created_at')} OR (v.data_devolucao IS NOT NULL AND v.data_devolucao BETWEEN ?::date AND ?::date)
      OR (v.data_devolucao IS NULL AND ${entre('v.updated_at')}) ORDER BY v.id`, ...periodo, ...periodo, ...periodo);
  const ch = await db.all(`SELECT c.*, v.codigo_reserva FROM frotas_chamados c JOIN frotas_veiculos v ON v.id = c.veiculo_id WHERE ${entre('c.created_at')} ORDER BY c.id`, ...periodo);
  const sup = Object.fromEntries((await db.all('SELECT nome, superior FROM frotas_colaboradores')).map((c) => [c.nome.toLowerCase(), c.superior]));
  const lst = veic.map((v) => Number(v.id)).join(',') || '0'; // ids vindos do banco, só números
  const fotos = Object.fromEntries((await db.all(`SELECT veiculo_id, COUNT(DISTINCT angulo) AS n FROM frotas_fotos WHERE veiculo_id IN (${lst}) GROUP BY veiculo_id`)).map((f) => [f.veiculo_id, f.n]));

  return {
    solicitante: {
      columns: [{ label: 'Pedido', width: 10 }, { label: 'Lote', width: 14 }, { label: 'Criado em', type: 'datetime', width: 17 }, { label: 'Enviado em', type: 'datetime', width: 17 },
        { label: 'Solicitante', width: 24 }, { label: 'E-mail', width: 26 }, { label: 'Retirada', type: 'date' }, { label: 'Local', width: 13 },
        { label: 'Categoria', width: 9 }, { label: 'Motorista', width: 22 }, { label: 'Motivo', type: 'texto', width: 34 }, { label: 'Status', width: 11 },
        { label: 'Resposta da central', type: 'texto', width: 30 }],
      rows: pedidos.map((p) => [p.codigo, p.lote, p.created_at, p.enviado_at, p.solicitante_nome, p.solicitante_email, p.data_retirada, p.local, p.categoria,
        p.motorista, p.motivo, PEDIDO_STATUS[p.status] || p.status, p.resposta]),
    },
    central: {
      columns: [{ label: 'Pedido', width: 10 }, { label: 'Reserva', width: 12 }, { label: 'Status', width: 11 }, { label: 'Placa', width: 10 }, { label: 'Modelo', width: 16 },
        { label: 'Motorista', width: 22 }, { label: 'Superior', width: 20 }, { label: 'Responsável', width: 22 }, { label: 'Local', width: 13 },
        { label: 'Categoria', width: 9 }, { label: 'Modalidade', width: 10 }, { label: 'Valor do contrato', type: 'money' }, { label: 'Cartão', width: 10 },
        { label: 'Retirada', type: 'date' }, { label: 'Km retirada', width: 10 }, { label: 'Devolução', type: 'date' }, { label: 'Km devolução', width: 10 },
        { label: 'Km rodado', width: 9 }, { label: `Fotos (de ${ANGULOS.length})`, width: 8 }, { label: 'Motivo', type: 'texto', width: 30 }],
      rows: veic.map((v) => [v.pedido_codigo, v.codigo_reserva, VEICULO_STATUS[v.status] || v.status, v.placa, v.modelo, v.motorista,
        sup[String(v.motorista || '').toLowerCase()] || null, v.responsavel_nome, v.local, v.categoria, v.modalidade, v.valor_contrato, v.cartao,
        v.data_retirada, v.km_retirada, v.data_devolucao, v.km_devolucao, v.km_devolucao !== null && v.km_retirada !== null ? v.km_devolucao - v.km_retirada : null,
        fotos[v.id] || 0, v.motivo]),
    },
    extras: [{
      name: 'Chamados',
      columns: [{ label: 'Chamado', width: 10 }, { label: 'Tipo', width: 22 }, { label: 'Status', width: 20 }, { label: 'Aberto em', type: 'datetime', width: 17 },
        { label: 'Solicitante', width: 22 }, { label: 'Reserva', width: 11 }, { label: 'Placa', width: 10 }, { label: 'Motorista', width: 22 },
        { label: 'Motivo', type: 'texto', width: 34 }, { label: 'Detalhe', type: 'texto', width: 30 }, { label: 'Agendado para', type: 'date' },
        { label: 'Local', width: 26 }, { label: 'Resposta / resultado', type: 'texto', width: 30 }, { label: 'Finalizado em', type: 'datetime', width: 17 }],
      rows: ch.map((c) => [c.codigo, CHAMADO_TIPO[c.tipo], CHAMADO_STATUS[c.status], c.created_at, c.solicitante_nome, c.codigo_reserva, c.placa, c.motorista, c.motivo,
        [c.tipo_manutencao, c.condutor_novo && `Novo condutor: ${c.condutor_novo}`, c.km_devolucao && `Km devolução: ${c.km_devolucao}`, c.placa_devolucao && `Devolver: ${c.placa_devolucao}`].filter(Boolean).join('\n'),
        c.data_servico, c.local_servico, c.resultado || c.resposta, c.finalizado_at]),
    }],
  };
}
