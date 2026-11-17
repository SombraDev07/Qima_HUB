// Relatório das Solicitações para a Administração (criadas no período), com a conversa completa.
import { STATUS, tipoLabel, fmtDoc } from './regras.js';

const FUSO_MS = Number(process.env.QIMA_FUSO_HORAS ?? -3) * 3600000;
const quando = (s) => {
  const d = new Date(Date.parse(String(s).replace(' ', 'T') + 'Z') + FUSO_MS);
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
};

export default async function relatorio({ db, entre, periodo }) {
  const ps = await db.all(`SELECT * FROM solicitacoes_pedidos WHERE ${entre('created_at')} ORDER BY id`, ...periodo);
  const lista = ps.length ? ps.map((p) => Number(p.id)).join(',') : '0'; // ids vindos do banco, só números
  const msgs = await db.all(`SELECT pedido_id, papel, autor_nome, texto, created_at FROM solicitacoes_mensagens WHERE pedido_id IN (${lista}) ORDER BY id`);
  const arqs = await db.all(`SELECT pedido_id, nome, ativo FROM solicitacoes_arquivos WHERE pedido_id IN (${lista}) ORDER BY id`);
  const linhas = await db.all(`SELECT l.pedido_id, l.ordem, l.cod_visita, l.documento, l.data, l.negativa, l.declarada, l.positiva, l.participante, p.codigo
    FROM solicitacoes_linhas l JOIN solicitacoes_pedidos p ON p.id = l.pedido_id WHERE l.pedido_id IN (${lista}) ORDER BY l.pedido_id, l.ordem`);
  const conversa = (pid, { soPessoas = false } = {}) => msgs.filter((m) => m.pedido_id === pid && (!soPessoas || m.papel !== 'sistema'))
    .map((m) => (m.papel === 'sistema' ? `[${quando(m.created_at)}] ${m.texto}` : `[${quando(m.created_at)}] ${m.autor_nome} (${m.papel === 'central' ? 'Central' : 'Solicitante'}): ${m.texto}`))
    .join('\n');

  return {
    solicitante: {
      columns: [{ label: 'ID', width: 10 }, { label: 'Criada em', type: 'datetime', width: 17 }, { label: 'Solicitante', width: 24 }, { label: 'E-mail', width: 26 },
        { label: 'Projeto', width: 14 }, { label: 'Tipo', width: 24 }, { label: 'Código da visita', width: 15 }, { label: 'ID da carga', width: 13 },
        { label: 'Título', width: 24 }, { label: 'Período de', type: 'date' }, { label: 'Período até', type: 'date' }, { label: 'Motivo', type: 'texto', width: 30 },
        { label: 'Descrição / observação', type: 'texto', width: 40 }, { label: 'Linhas', width: 7 }, { label: 'Planilha', width: 28 }, { label: 'Status', width: 18 }],
      rows: ps.map((p) => [p.codigo, p.created_at, p.solicitante_nome, p.solicitante_email, p.projeto, tipoLabel(p), p.cod_visita, p.id_carga, p.titulo,
        p.data_inicial, p.data_final, p.motivo, p.descricao, linhas.filter((l) => l.pedido_id === p.id).length || null,
        arqs.filter((a) => a.pedido_id === p.id).map((a) => `${a.nome}${a.ativo ? '' : ' (anterior)'}`).join('\n'), STATUS[p.status] || p.status]),
    },
    central: {
      columns: [{ label: 'ID', width: 10 }, { label: 'Tipo', width: 24 }, { label: 'Solicitante', width: 22 }, { label: 'Status', width: 18 },
        { label: 'Atendido por', width: 20 }, { label: 'Concluído em', type: 'datetime', width: 17 }, { label: 'Última movimentação', type: 'datetime', width: 17 },
        { label: 'Devolvida para correção (vezes)', width: 12 }, { label: 'Mensagens', width: 10 }, { label: 'Observação da central', type: 'texto', width: 36 },
        { label: 'Conversa', type: 'texto', width: 90 }],
      rows: ps.map((p) => [p.codigo, tipoLabel(p), p.solicitante_nome, STATUS[p.status] || p.status, p.responsavel_nome, p.concluido_at, p.updated_at,
        msgs.filter((m) => m.pedido_id === p.id && m.papel === 'sistema' && m.texto.startsWith('Devolvida para correção')).length || null,
        msgs.filter((m) => m.pedido_id === p.id && m.papel !== 'sistema').length || null, p.obs_central, conversa(p.id)]),
    },
    extras: [{
      name: 'Linhas da correção',
      columns: [{ label: 'ID', width: 10 }, { label: 'Linha', width: 6 }, { label: 'Código da visita', width: 16 }, { label: 'CNPJ / CPF', width: 20 }, { label: 'Data', type: 'date' },
        { label: 'Negativa' }, { label: 'Declarada' }, { label: 'Positiva' }, { label: 'Participante' }],
      rows: linhas.map((l) => [l.codigo, l.ordem, l.cod_visita, fmtDoc(l.documento), l.data, l.negativa, l.declarada, l.positiva, l.participante]),
    }],
  };
}
