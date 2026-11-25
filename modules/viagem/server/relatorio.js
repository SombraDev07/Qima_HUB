// Relatório do Viagem para a Administração (pedidos criados no período).
import { STATUS_LABEL, TRANSPORTE, fmtCpf } from './regras.js';

export default async function relatorio({ db, entre, periodo }) {
  const pedidos = await db.all(`SELECT * FROM viagem_pedidos WHERE ${entre('created_at')} ORDER BY id`, ...periodo);
  const lista = pedidos.map((p) => Number(p.id)).join(',') || '0'; // ids vindos do banco, só números
  const pass = await db.all(`SELECT * FROM viagem_passageiros WHERE pedido_id IN (${lista}) ORDER BY pedido_id, ordem, id`);
  const porId = new Map(pedidos.map((p) => [p.id, p]));
  const trecho = (p) => `${p.origem}/${p.origem_uf} → ${p.destino}/${p.destino_uf}`;

  return {
    solicitante: {
      columns: [{ label: 'Pedido', width: 11 }, { label: 'Criado em', type: 'datetime', width: 17 }, { label: 'Solicitante', width: 24 }, { label: 'E-mail', width: 26 },
        { label: 'Trecho', width: 36 }, { label: 'Transporte', width: 10 }, { label: 'Saída', type: 'date' }, { label: 'Horário', width: 8 }, { label: 'Volta', type: 'date' },
        { label: 'Passageiros', width: 10 }, { label: 'Observações', type: 'texto', width: 36 }, { label: 'Status', width: 18 }],
      rows: pedidos.map((p) => [p.codigo, p.created_at, p.solicitante_nome, p.solicitante_email, trecho(p), TRANSPORTE[p.transporte], p.data_ida, p.horario, p.data_volta,
        pass.filter((x) => x.pedido_id === p.id).length, p.obs, STATUS_LABEL[p.status] || p.status]),
    },
    central: {
      columns: [{ label: 'Pedido', width: 11 }, { label: 'Passageiro', width: 26 }, { label: 'CPF', width: 15 }, { label: 'RG', width: 13 }, { label: 'Nascimento', type: 'date' },
        { label: 'E-mail', width: 26 }, { label: 'Telefone', width: 14 }, { label: 'BU', width: 22 }, { label: 'Trecho', width: 36 }, { label: 'Transporte', width: 10 },
        { label: 'Saída', type: 'date' }, { label: 'Volta', type: 'date' }, { label: 'Poltrona pedida', width: 9 }, { label: 'Localizador', width: 14 },
        { label: 'Valor da passagem', type: 'money' }, { label: 'Status', width: 18 }, { label: 'Aceito por', width: 20 }, { label: 'Agendado por', width: 20 },
        { label: 'Agendado em', type: 'datetime', width: 17 }, { label: 'Motivo da recusa', type: 'texto', width: 30 }, { label: 'Observação da central', type: 'texto', width: 30 }],
      rows: pass.map((x) => {
        const p = porId.get(x.pedido_id);
        return [p.codigo, x.nome, fmtCpf(x.cpf), x.rg, x.nascimento, x.email, x.telefone, x.bu, trecho(p), TRANSPORTE[p.transporte], p.data_ida, p.data_volta,
          x.poltrona, x.localizador, x.valor, STATUS_LABEL[p.status] || p.status, p.aceito_por, p.agendado_por, p.agendado_at, p.motivo_recusa, p.obs_central];
      }),
    },
  };
}
