// Relatório da Contratação para a Administração (pedidos de vaga e demissões criados no período).
import { STATUS, situacao, fmtCpf } from './regras.js';

const sim = (b) => (b ? 'Sim' : 'Não');

export default async function relatorio({ db, entre, periodo }) {
  const pedidos = await db.all(`SELECT * FROM contratacao_pedidos WHERE ${entre('created_at')} ORDER BY id`, ...periodo);
  const lista = pedidos.length ? pedidos.map((p) => Number(p.id)).join(',') : '0'; // ids vindos do banco, só números
  const anexos = await db.all(`SELECT a.pedido_id, a.data_vinc, b.nome, b.cpf FROM contratacao_anexos a JOIN contratacao_banco b ON b.id = a.banco_id
    WHERE a.pedido_id IN (${lista}) ORDER BY b.nome`);
  const dem = await db.all(`SELECT * FROM contratacao_demissoes WHERE ${entre('created_at')} ORDER BY id`, ...periodo);

  return {
    solicitante: {
      columns: [{ label: 'Pedido', width: 10 }, { label: 'Criado em', type: 'datetime', width: 17 }, { label: 'Enviado em', type: 'datetime', width: 17 },
        { label: 'Solicitante', width: 24 }, { label: 'E-mail', width: 26 }, { label: 'Projeto', width: 18 }, { label: 'Função', width: 10 },
        { label: 'Cidade', width: 20 }, { label: 'UF', width: 5 }, { label: 'Distrito', width: 10 }, { label: 'Início desejado', type: 'date' },
        { label: 'Semana', width: 7 }, { label: 'Quantidade', width: 9 }, { label: 'Experiência', width: 9 }, { label: 'CNH', width: 6 },
        { label: 'Mobilidade', width: 9 }, { label: 'Observação', type: 'texto', width: 40 }],
      rows: pedidos.map((p) => [p.codigo, p.created_at, p.enviado_at, p.solicitante_nome, p.solicitante_email, p.projeto, p.funcao, p.cidade, p.uf, p.distrito,
        p.data_desejada, p.semana, p.qtd, sim(p.experiencia), sim(p.cnh), p.movel ? 'MÓVEL' : 'LOCAL', p.observacao]),
    },
    central: {
      columns: [{ label: 'Pedido', width: 10 }, { label: 'Status', width: 20 }, { label: 'Situação', width: 9 }, { label: 'Quantidade', width: 9 },
        { label: 'Atendidas', width: 9 }, { label: 'Faltam', width: 7 }, { label: 'Pessoas anexadas', type: 'texto', width: 40 },
        { label: 'Último anexo em', type: 'date' }, { label: 'Atualizado em', type: 'datetime', width: 17 }],
      rows: pedidos.map((p) => {
        const an = anexos.filter((a) => a.pedido_id === p.id);
        return [p.codigo, STATUS[p.status] || p.status, p.status === 'rascunho' ? '' : situacao(p), p.qtd, an.length, Math.max(0, p.qtd - an.length),
          an.map((a) => `${a.nome}${a.cpf ? ` (${fmtCpf(a.cpf)})` : ''}`).join('\n'), an.map((a) => a.data_vinc).sort().at(-1) || null, p.updated_at];
      }),
    },
    extras: [{
      name: 'Demissões',
      columns: [{ label: 'Pedido em', type: 'datetime', width: 17 }, { label: 'Nome', width: 24 }, { label: 'Projeto', width: 16 }, { label: 'Iniciativa', width: 12 },
        { label: 'Gestor', width: 22 }, { label: 'Data prevista', type: 'date' }, { label: 'Último dia', type: 'date' }, { label: 'Aviso', width: 14 },
        { label: 'Justificativa', width: 20 }, { label: 'Observação', type: 'texto', width: 32 }, { label: 'Status', width: 10 },
        { label: 'Resposta do RH', type: 'texto', width: 30 }, { label: 'Resolvido em', type: 'datetime', width: 17 }],
      rows: dem.map((d) => [d.created_at, d.nome, d.projeto, d.tipo === 'empresa' ? 'Empresa' : 'Colaborador', d.gestor, d.data_prevista, d.ultimo_dia, d.aviso,
        d.justificativa, d.obs, d.status, d.resposta, d.resolvido_at]),
    }],
  };
}
