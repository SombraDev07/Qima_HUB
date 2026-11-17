// Relatório do Nota NF para a Administração (NFs enviadas no período; rascunhos ficam de fora).
import { STATUS_LABEL, fmtDoc, totais } from './regras.js';

const IA = { ok: 'Lida pela IA', falhou: 'IA não conseguiu ler', indisponivel: 'Manual' };

export default async function relatorio({ db, entre, periodo }) {
  const notas = await db.all(`SELECT * FROM nota_nf_notas WHERE status <> 'rascunho' AND ${entre('COALESCE(enviado_at, created_at)')} ORDER BY id`, ...periodo);
  const lista = notas.map((n) => Number(n.id)).join(',') || '0'; // ids vindos do banco, só números
  const itens = await db.all(`SELECT i.*, n.codigo FROM nota_nf_itens i JOIN nota_nf_notas n ON n.id = i.nota_id WHERE i.nota_id IN (${lista}) ORDER BY i.nota_id, i.ordem`);
  const tot = (id) => totais(itens.filter((i) => i.nota_id === id));

  return {
    solicitante: {
      columns: [{ label: 'ID', width: 10 }, { label: 'Enviada em', type: 'datetime', width: 17 }, { label: 'Enviada por', width: 22 }, { label: 'E-mail', width: 24 },
        { label: 'Arquivo', width: 24 }, { label: 'Nº NF', width: 10 }, { label: 'Série', width: 6 }, { label: 'Chave de acesso', width: 46 },
        { label: 'Emitente', width: 26 }, { label: 'CPF/CNPJ emitente', width: 19 }, { label: 'Produtor', width: 26 }, { label: 'CPF/CNPJ produtor', width: 19 },
        { label: 'Emissão', type: 'date' }, { label: 'Município', width: 18 }, { label: 'UF', width: 5 }, { label: 'Peso líquido (kg)' },
        { label: 'Observação do solicitante', type: 'texto', width: 30 }],
      rows: notas.map((n) => [n.codigo, n.enviado_at || n.created_at, n.dono_nome, n.dono_email, n.nome_original, n.numero_nf, n.serie, n.chave_acesso,
        n.emitente_nome, fmtDoc(n.emitente_doc), n.produtor_nome, fmtDoc(n.produtor_doc), n.data_emissao, n.municipio, n.uf, n.peso_liquido, n.obs_solicitante]),
    },
    central: {
      columns: [{ label: 'ID', width: 10 }, { label: 'Nº NF', width: 10 }, { label: 'Produtor', width: 26 }, { label: 'Status', width: 16 }, { label: 'Leitura', width: 18 },
        { label: 'Editada pela central', width: 10 }, { label: 'Analisada em', type: 'datetime', width: 17 }, { label: 'Itens de soja', width: 8 },
        { label: 'Itens ignorados', width: 8 }, { label: 'Quantidade (sacos)' }, { label: 'Sementes', width: 14 }, { label: 'Sementes viáveis', width: 14 },
        { label: 'Motivo da recusa', type: 'texto', width: 28 }, { label: 'Observação da central', type: 'texto', width: 30 }],
      rows: notas.map((n) => {
        const t = tot(n.id);
        return [n.codigo, n.numero_nf, n.produtor_nome, STATUS_LABEL[n.status] || n.status, IA[n.ia_status] || n.ia_status, n.editado_central ? 'Sim' : 'Não',
          n.analisado_at, t.itens_soja, t.itens_ignorados, t.quantidade, t.sementes, t.viaveis, n.motivo_recusa, n.obs_central];
      }),
    },
    extras: [{
      name: 'Itens',
      columns: [{ label: 'ID da NF', width: 10 }, { label: 'Descrição', width: 44 }, { label: 'Cultivar', width: 16 }, { label: 'Unidade', width: 8 },
        { label: 'Quantidade' }, { label: 'Sementes/unidade', width: 12 }, { label: 'Germinação %', width: 11 }, { label: 'Germinação padrão (92%)', width: 12 },
        { label: 'Entra no cálculo', width: 10 }, { label: 'Motivo de ficar de fora', width: 22 }],
      rows: itens.map((i) => [i.codigo, i.descricao, i.cultivar, i.unidade, i.quantidade, i.sementes_por_unidade, i.germinacao, i.germinacao_padrao ? 'Sim' : 'Não',
        i.incluido ? 'Sim' : 'Não', i.motivo_exclusao]),
    }],
  };
}
