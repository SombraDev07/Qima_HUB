// Migrações do banco do sistema Despesas (Postgres). Nunca altere uma já aplicada — crie a próxima versão.
// A versão 1 era a do SQLite; a 2 recria as tabelas no Postgres.
const TABELAS = ['despesas_config', 'despesas_tipos', 'despesas_centros', 'despesas_perfis', 'despesas_pedidos', 'despesas_notas', 'despesas_historico'];

export default [
  {
    version: 2,
    async up(db) {
      await db.exec(`
        CREATE TABLE despesas_config (chave TEXT PRIMARY KEY, valor TEXT);
        INSERT INTO despesas_config VALUES ('dias_limite', '30');

        CREATE TABLE despesas_tipos (id SERIAL PRIMARY KEY, nome TEXT NOT NULL UNIQUE, ativo BOOLEAN NOT NULL DEFAULT TRUE);
        INSERT INTO despesas_tipos (nome) VALUES ('Alimentação'), ('Hospedagem'), ('Combustível'), ('Transporte / Táxi / App'),
          ('Pedágio'), ('Estacionamento'), ('Material'), ('Outros');

        CREATE TABLE despesas_centros (id SERIAL PRIMARY KEY, nome TEXT NOT NULL UNIQUE, ativo BOOLEAN NOT NULL DEFAULT TRUE);
        INSERT INTO despesas_centros (nome) VALUES ('Geral'), ('Harvest 2027'), ('Monitoramento 2027'), ('Fibra');

        -- Preferências do colaborador (último PIX usado etc.)
        CREATE TABLE despesas_perfis (
          user_id      INTEGER PRIMARY KEY,
          pix_tipo     TEXT,
          pix_chave    TEXT,
          centro_custo TEXT
        );

        CREATE TABLE despesas_pedidos (
          id                SERIAL PRIMARY KEY,
          codigo            TEXT UNIQUE,
          solicitante_id    INTEGER NOT NULL,
          solicitante_nome  TEXT NOT NULL,
          solicitante_email TEXT,
          centro_custo      TEXT,
          pix_tipo          TEXT,
          pix_chave         TEXT,
          obs_solicitante   TEXT,
          obs_central       TEXT,
          status            TEXT NOT NULL DEFAULT 'aguardando'
                            CHECK (status IN ('aguardando','aprovado','parcial','reprovado','cancelado')),
          total_declarado   NUMERIC(12,2) NOT NULL DEFAULT 0,
          total_aprovado    NUMERIC(12,2) NOT NULL DEFAULT 0,
          analisado_at      TIMESTAMPTZ,
          pago_em           DATE,
          pagamento_obs     TEXT,
          created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX despesas_pedidos_solic ON despesas_pedidos (solicitante_id, status);
        CREATE INDEX despesas_pedidos_status ON despesas_pedidos (status);
        CREATE INDEX despesas_pedidos_criado ON despesas_pedidos (created_at);

        -- Cada foto/arquivo é uma nota com ID único (DESP-00001)
        CREATE TABLE despesas_notas (
          id              SERIAL PRIMARY KEY,
          codigo          TEXT UNIQUE,
          dono_id         INTEGER NOT NULL,
          pedido_id       INTEGER REFERENCES despesas_pedidos(id) ON DELETE CASCADE,
          substitui_id    INTEGER,
          arquivo         TEXT NOT NULL,
          nome_original   TEXT,
          mime            TEXT NOT NULL,
          tamanho         INTEGER,
          hash            TEXT NOT NULL,
          hash_original   TEXT,
          valor           NUMERIC(12,2),
          data            DATE,
          tipo            TEXT,
          centro_custo    TEXT,
          motivo          TEXT,
          emitente        TEXT,
          cnpj            TEXT,
          numero_nf       TEXT,
          chave_acesso    TEXT,
          ia_status       TEXT NOT NULL DEFAULT 'indisponivel' CHECK (ia_status IN ('ok','falhou','indisponivel')),
          ia_valor        NUMERIC(12,2),
          ia_data         DATE,
          ia_json         TEXT,
          ia_obs          TEXT,
          status          TEXT NOT NULL DEFAULT 'rascunho'
                          CHECK (status IN ('rascunho','aguardando','ok','recusada','substituida','cancelada')),
          valor_aprovado  NUMERIC(12,2),
          motivo_recusa   TEXT,
          editado_central BOOLEAN NOT NULL DEFAULT FALSE,
          analisado_por   INTEGER,
          analisado_at    TIMESTAMPTZ,
          created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX despesas_notas_pedido ON despesas_notas (pedido_id, status);
        CREATE INDEX despesas_notas_dono ON despesas_notas (dono_id, status);
        CREATE INDEX despesas_notas_subst ON despesas_notas (substitui_id);
        -- usados na busca de notas parecidas (duplicidade)
        CREATE INDEX despesas_notas_hash ON despesas_notas (hash);
        CREATE INDEX despesas_notas_hash_orig ON despesas_notas (hash_original);
        CREATE INDEX despesas_notas_nf ON despesas_notas (cnpj, numero_nf);
        CREATE INDEX despesas_notas_chave ON despesas_notas (chave_acesso);

        CREATE TABLE despesas_historico (
          id         SERIAL PRIMARY KEY,
          pedido_id  INTEGER REFERENCES despesas_pedidos(id) ON DELETE CASCADE,
          nota_id    INTEGER,
          user_id    INTEGER,
          user_nome  TEXT,
          acao       TEXT NOT NULL,
          detalhe    TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX despesas_hist_pedido ON despesas_historico (pedido_id);

        -- Só o servidor do HUB lê e grava (a API pública do Supabase fica fechada)
        ${TABELAS.map((t) => `ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;`).join('\n        ')}
      `);
    },
  },
];
