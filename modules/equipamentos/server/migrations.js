// Migrações do sistema Equipamentos (Postgres). Nunca altere uma já aplicada: crie a próxima versão.
export default [
  {
    version: 1,
    async up(db) {
      await db.exec(`
        -- Parque de equipamentos (notebook, celular, monitor, chip)
        CREATE TABLE equipamentos_itens (
          id             SERIAL PRIMARY KEY,
          tipo           TEXT NOT NULL,
          modelo         TEXT NOT NULL,
          patrimonio     TEXT NOT NULL,
          serie          TEXT,
          status         TEXT NOT NULL DEFAULT 'estoque', -- estoque | reservado | em_uso | devolucao_pendente | baixado
          base           TEXT NOT NULL,
          data_compra    DATE,
          valor          NUMERIC(12,2) NOT NULL DEFAULT 0,
          colaborador    TEXT,
          projeto        TEXT,
          superior       TEXT,
          inicio         DATE,
          fim            DATE,
          obs            TEXT,
          solicitacao_id INTEGER,  -- solicitação que reservou / enviou o equipamento
          solicitante_id INTEGER,  -- quem pediu (só ele enxerga o responsável em "Responsáveis")
          created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE UNIQUE INDEX equipamentos_itens_pat ON equipamentos_itens (lower(patrimonio));
        CREATE INDEX equipamentos_itens_estoque ON equipamentos_itens (tipo, status, base);
        CREATE INDEX equipamentos_itens_sol ON equipamentos_itens (solicitacao_id);
        CREATE INDEX equipamentos_itens_solicitante ON equipamentos_itens (solicitante_id, status);

        -- Pedidos da Operação
        CREATE TABLE equipamentos_solicitacoes (
          id               SERIAL PRIMARY KEY,
          codigo           TEXT UNIQUE,
          solicitante_id   INTEGER NOT NULL,
          solicitante_nome TEXT NOT NULL,
          solicitante_email TEXT,
          colaborador      TEXT,
          cpf              TEXT,
          projeto          TEXT NOT NULL,
          base             TEXT NOT NULL,
          retirada         DATE,
          devolucao        DATE,
          obs              TEXT,
          origem_id        INTEGER,   -- pedido de troca: de qual solicitação veio
          status           TEXT NOT NULL DEFAULT 'rascunho', -- rascunho | enviado | reservado | em_uso | devolucao_pendente | devolvido
          enviado_at       TIMESTAMPTZ,
          created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX equipamentos_solic_dono ON equipamentos_solicitacoes (solicitante_id, status);
        CREATE INDEX equipamentos_solic_status ON equipamentos_solicitacoes (status, created_at);

        CREATE TABLE equipamentos_solicitacao_itens (
          id             SERIAL PRIMARY KEY,
          solicitacao_id INTEGER NOT NULL REFERENCES equipamentos_solicitacoes(id) ON DELETE CASCADE,
          tipo           TEXT NOT NULL,
          motivo         TEXT,
          qtd            INTEGER NOT NULL CHECK (qtd > 0)
        );
        CREATE INDEX equipamentos_sitens_sol ON equipamentos_solicitacao_itens (solicitacao_id);

        -- Histórico de cada equipamento (quem usou, devolução, baixa…)
        CREATE TABLE equipamentos_historico (
          id             SERIAL PRIMARY KEY,
          equipamento_id INTEGER NOT NULL REFERENCES equipamentos_itens(id) ON DELETE CASCADE,
          acao           TEXT NOT NULL,
          detalhe        TEXT,
          usuario_nome   TEXT,
          created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX equipamentos_hist_eq ON equipamentos_historico (equipamento_id, id);
        CREATE INDEX equipamentos_hist_data ON equipamentos_historico (created_at);

        -- só o servidor do HUB lê e grava (a API pública do Supabase fica fechada)
        ALTER TABLE equipamentos_itens ENABLE ROW LEVEL SECURITY;
        ALTER TABLE equipamentos_solicitacoes ENABLE ROW LEVEL SECURITY;
        ALTER TABLE equipamentos_solicitacao_itens ENABLE ROW LEVEL SECURITY;
        ALTER TABLE equipamentos_historico ENABLE ROW LEVEL SECURITY;
      `);
    },
  },
];
