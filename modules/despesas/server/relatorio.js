// Relatório do Despesas para a Administração (pedidos de reembolso criados no período).
import { STATUS_LABEL, NOTA_LABEL, fmtCnpj } from './regras.js';

const IA = { ok: 'Lida pela IA', falhou: 'IA não conseguiu ler', indisponivel: 'Manual' };

export default async function relatorio({ db, entre, periodo }) {
  const pedidos = await db.all(`SELECT * FROM despesas_pedidos WHERE ${entre('created_at')} ORDER BY id`, ...periodo);
  const lista = pedidos.map((p) => Number(p.id)).join(',') || '0'; // ids vindos do banco, só números
  const notas = await db.all(`SELECT n.*, p.codigo AS pedido_codigo, p.status AS pedido_status, p.total_aprovado, p.pago_em, p.pagamento_taxa, p.obs_central, p.solicitante_nome
    FROM despesas_notas n JOIN despesas_pedidos p ON p.id = n.pedido_id WHERE n.pedido_id IN (${lista}) ORDER BY n.pedido_id, n.id`);
  const qtd = (pid) => notas.filter((n) => n.pedido_id === pid && n.status !== 'substituida').length;

  return {
    solicitante: {
      columns: [{ label: 'Pedido', width: 11 }, { label: 'Criado em', type: 'datetime', width: 17 }, { label: 'Colaborador', width: 24 }, { label: 'E-mail', width: 26 },
        { label: 'Centro de custo', width: 16 }, { label: 'Tipo PIX', width: 10 }, { label: 'Chave PIX', width: 24 }, { label: 'Notas', width: 7 },
        { label: 'Total declarado', type: 'money' }, { label: 'Observação do colaborador', type: 'texto', width: 36 }, { label: 'Status', width: 16 }],
      rows: pedidos.map((p) => [p.codigo, p.created_at, p.solicitante_nome, p.solicitante_email, p.centro_custo, p.pix_tipo, p.pix_chave, qtd(p.id),
        p.total_declarado, p.obs_solicitante, STATUS_LABEL[p.status] || p.status]),
    },
    central: {
      columns: [{ label: 'Pedido', width: 11 }, { label: 'Nota (ID da foto)', width: 13 }, { label: 'Colaborador', width: 22 }, { label: 'Data da despesa', type: 'date' },
        { label: 'Tipo', width: 14 }, { label: 'Centro de custo', width: 14 }, { label: 'Motivo', type: 'texto', width: 28 }, { label: 'Emitente', width: 24 },
        { label: 'CNPJ', width: 19 }, { label: 'Nº NF', width: 10 }, { label: 'Chave de acesso', width: 46 }, { label: 'Valor declarado', type: 'money' },
        { label: 'Valor aprovado', type: 'money' }, { label: 'Situação da nota', width: 12 }, { label: 'Motivo da recusa', type: 'texto', width: 28 },
        { label: 'Leitura', width: 18 }, { label: 'Editada pela central', width: 10 }, { label: 'Analisada em', type: 'datetime', width: 17 },
        { label: 'Status do pedido', width: 16 }, { label: 'Total aprovado do pedido', type: 'money' }, { label: 'Pago em', type: 'date' },
        { label: 'Taxa do pagamento (pedido)', type: 'money' }, { label: 'Total pago do pedido', type: 'money' },
        { label: 'Observação da central', type: 'texto', width: 32 }],
      rows: notas.map((n) => [n.pedido_codigo, n.codigo, n.solicitante_nome, n.data, n.tipo, n.centro_custo, n.motivo, n.emitente, fmtCnpj(n.cnpj), n.numero_nf,
        n.chave_acesso, n.valor, n.valor_aprovado, NOTA_LABEL[n.status] || n.status, n.motivo_recusa, IA[n.ia_status] || n.ia_status, n.editado_central ? 'Sim' : 'Não',
        n.analisado_at, STATUS_LABEL[n.pedido_status] || n.pedido_status, n.total_aprovado, n.pago_em,
        n.pago_em ? n.pagamento_taxa || 0 : null, n.pago_em ? n.total_aprovado + (n.pagamento_taxa || 0) : null, n.obs_central]),
    },
  };
}
