// Relatório do sistema Equipamentos para a Administração e para a Central.
//  - aba do solicitante: solicitações criadas no período
//  - aba da central: parque de equipamentos (situação atual)
//  - extra: movimentações do histórico no período
import { STATUS_EQ, STATUS_REQ, codigoSolicitacao } from './regras.js';

export default async function relatorio({ db, entre, periodo }) {
  const sols = await db.all(`SELECT * FROM equipamentos_solicitacoes WHERE ${entre('created_at')} ORDER BY id`, ...periodo);
  const lista = sols.length ? sols.map((s) => Number(s.id)).join(',') : '0'; // ids vindos do banco, só números
  const itens = await db.all(`SELECT solicitacao_id, tipo, qtd FROM equipamentos_solicitacao_itens WHERE solicitacao_id IN (${lista}) ORDER BY id`);
  const resumo = (id) => itens.filter((i) => i.solicitacao_id === id).map((i) => `${i.qtd}× ${i.tipo}`).join(', ');

  const eqs = await db.all(`SELECT e.*, s.codigo AS solicitacao FROM equipamentos_itens e
    LEFT JOIN equipamentos_solicitacoes s ON s.id = e.solicitacao_id ORDER BY e.tipo, e.patrimonio`);
  const mov = await db.all(`SELECT h.created_at, h.acao, h.detalhe, h.usuario_nome, e.patrimonio, e.tipo, e.modelo
    FROM equipamentos_historico h JOIN equipamentos_itens e ON e.id = h.equipamento_id
    WHERE ${entre('h.created_at')} ORDER BY h.id LIMIT 20000`, ...periodo);

  return {
    solicitante: {
      columns: [{ label: 'Código', width: 10 }, { label: 'Criada em', type: 'datetime', width: 17 }, { label: 'Solicitante', width: 24 }, { label: 'E-mail', width: 26 },
        { label: 'Projeto', width: 16 }, { label: 'Base', width: 14 }, { label: 'Retirada', type: 'date' }, { label: 'Devolução prevista', type: 'date' },
        { label: 'Colaborador', width: 24 }, { label: 'Itens', width: 34 }, { label: 'Observação', type: 'texto', width: 34 }, { label: 'Status', width: 18 }],
      rows: sols.map((s) => [s.codigo || codigoSolicitacao(s.id), s.created_at, s.solicitante_nome, s.solicitante_email, s.projeto, s.base, s.retirada, s.devolucao,
        s.colaborador, resumo(s.id), s.obs, STATUS_REQ[s.status] || s.status]),
    },
    central: {
      columns: [{ label: 'Patrimônio', width: 16 }, { label: 'Tipo', width: 16 }, { label: 'Modelo', width: 20 }, { label: 'Nº série / IMEI', width: 20 }, { label: 'Status', width: 18 },
        { label: 'Base', width: 14 }, { label: 'Data de compra', type: 'date' }, { label: 'Valor', type: 'money' }, { label: 'Colaborador', width: 24 }, { label: 'Projeto', width: 16 },
        { label: 'Superior', width: 20 }, { label: 'Início', type: 'date' }, { label: 'Fim', type: 'date' }, { label: 'Solicitação', width: 11 }, { label: 'Observação', type: 'texto', width: 34 }],
      rows: eqs.map((e) => [e.patrimonio, e.tipo, e.modelo, e.serie, STATUS_EQ[e.status] || e.status, e.base, e.data_compra, Number(e.valor) || 0, e.colaborador, e.projeto,
        e.superior, e.inicio, e.fim, e.solicitacao, e.obs]),
    },
    extras: [{
      name: 'Movimentações',
      columns: [{ label: 'Quando', type: 'datetime', width: 17 }, { label: 'Patrimônio', width: 16 }, { label: 'Tipo', width: 16 }, { label: 'Modelo', width: 20 },
        { label: 'Ação', width: 22 }, { label: 'Detalhe', type: 'texto', width: 50 }, { label: 'Feito por', width: 22 }],
      rows: mov.map((m) => [m.created_at, m.patrimonio, m.tipo, m.modelo, m.acao, m.detalhe, m.usuario_nome]),
    }],
  };
}
