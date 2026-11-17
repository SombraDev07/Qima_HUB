// Migrações do sistema Contratação (Postgres). Nunca altere uma já aplicada — crie a próxima versão.
// A versão 1 era a do SQLite; a 2 recria as tabelas no Postgres.
const TABELAS = ['contratacao_projetos', 'contratacao_funcoes', 'contratacao_regioes', 'contratacao_banco', 'contratacao_pedidos',
  'contratacao_anexos', 'contratacao_demissoes', 'contratacao_historico'];

export default [
  {
    version: 2,
    async up(db) {
      await db.exec(`
        CREATE TABLE contratacao_projetos (id SERIAL PRIMARY KEY, nome TEXT NOT NULL UNIQUE, ativo BOOLEAN NOT NULL DEFAULT TRUE);
        INSERT INTO contratacao_projetos (nome) VALUES ('Harvest 2027'), ('Monitoramento 2027'), ('Fibra Projeto 2027');

        CREATE TABLE contratacao_funcoes (id SERIAL PRIMARY KEY, nome TEXT NOT NULL UNIQUE, ativo BOOLEAN NOT NULL DEFAULT TRUE);
        INSERT INTO contratacao_funcoes (nome) VALUES ('Auditor'), ('Líder');

        -- Distrito/região por cidade (sem cadastro: o distrito é a UF)
        CREATE TABLE contratacao_regioes (cidade TEXT NOT NULL, uf TEXT NOT NULL, regiao TEXT NOT NULL, PRIMARY KEY (cidade, uf));
        INSERT INTO contratacao_regioes VALUES
          ('Rondonópolis','MT','Sul'), ('Cuiabá','MT','Central'), ('Várzea Grande','MT','Central'),
          ('Nova Esperança','MT','Norte'), ('Alta Floresta','MT','Norte'), ('Sinop','MT','Norte'), ('Sorriso','MT','Norte');

        -- Banco de pessoas (candidatos / colaboradores)
        CREATE TABLE contratacao_banco (
          id             SERIAL PRIMARY KEY,
          nome           TEXT NOT NULL,
          email          TEXT,              -- sempre em minúsculas
          cpf            TEXT,
          nascimento     DATE,
          telefone       TEXT,
          funcao         TEXT,
          cidade         TEXT,
          uf             TEXT,
          regiao         TEXT,
          projeto        TEXT NOT NULL DEFAULT 'Todos',
          cnh            BOOLEAN NOT NULL DEFAULT FALSE,
          movel          BOOLEAN NOT NULL DEFAULT FALSE,
          experiencia    BOOLEAN NOT NULL DEFAULT FALSE,
          contratado     BOOLEAN NOT NULL DEFAULT FALSE,
          demitido       BOOLEAN NOT NULL DEFAULT FALSE,
          data_disponivel DATE,
          obs            TEXT,
          created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE UNIQUE INDEX contratacao_banco_email ON contratacao_banco (lower(email));

        -- Pedidos de vaga
        CREATE TABLE contratacao_pedidos (
          id                SERIAL PRIMARY KEY,
          codigo            TEXT UNIQUE,
          solicitante_id    INTEGER NOT NULL,
          solicitante_nome  TEXT NOT NULL,
          solicitante_email TEXT,
          projeto           TEXT,
          funcao            TEXT NOT NULL,
          cidade            TEXT,
          uf                TEXT,
          distrito          TEXT,
          data_desejada     DATE NOT NULL,
          semana            INTEGER,
          qtd               INTEGER NOT NULL,
          cnh               BOOLEAN NOT NULL DEFAULT FALSE,
          movel             BOOLEAN NOT NULL DEFAULT FALSE,
          experiencia       BOOLEAN NOT NULL DEFAULT FALSE,
          observacao        TEXT,
          status            TEXT NOT NULL DEFAULT 'pendente'
                            CHECK (status IN ('rascunho','pendente','em_recrutamento','parcial','atendida','finalizado','cancelado','recusado')),
          enviado_at        TIMESTAMPTZ,
          created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX contratacao_pedidos_status ON contratacao_pedidos (status);
        CREATE INDEX contratacao_pedidos_solic ON contratacao_pedidos (solicitante_id, status);
        CREATE INDEX contratacao_pedidos_criado ON contratacao_pedidos (created_at);

        -- Pessoas anexadas à vaga
        CREATE TABLE contratacao_anexos (
          id         SERIAL PRIMARY KEY,
          pedido_id  INTEGER NOT NULL REFERENCES contratacao_pedidos(id) ON DELETE CASCADE,
          banco_id   INTEGER NOT NULL REFERENCES contratacao_banco(id),
          data_vinc  DATE NOT NULL DEFAULT CURRENT_DATE,
          UNIQUE (pedido_id, banco_id)
        );
        CREATE INDEX contratacao_anexos_banco ON contratacao_anexos (banco_id);

        -- Pedidos de demissão (solicitante → RH)
        CREATE TABLE contratacao_demissoes (
          id            SERIAL PRIMARY KEY,
          banco_id      INTEGER NOT NULL,
          pedido_id     INTEGER,
          nome          TEXT NOT NULL,
          email         TEXT,
          projeto       TEXT,
          tipo          TEXT NOT NULL CHECK (tipo IN ('empresa','colaborador')),
          gestor        TEXT NOT NULL,
          solicitante_id INTEGER,
          solicitante_email TEXT,
          data_prevista DATE,
          ultimo_dia    DATE,
          aviso         TEXT,
          justificativa TEXT,
          obs           TEXT,
          status        TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','aceita','recusada')),
          resposta      TEXT,
          resolvido_por INTEGER,
          resolvido_at  TIMESTAMPTZ,
          created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX contratacao_demissoes_status ON contratacao_demissoes (status, banco_id);

        CREATE TABLE contratacao_historico (
          id         SERIAL PRIMARY KEY,
          pedido_id  INTEGER,
          banco_id   INTEGER,
          user_id    INTEGER,
          user_nome  TEXT,
          acao       TEXT NOT NULL,
          detalhe    TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX contratacao_hist_pedido ON contratacao_historico (pedido_id);

        -- Só o servidor do HUB lê e grava (a API pública do Supabase fica fechada)
        ${TABELAS.map((t) => `ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;`).join('\n        ')}
      `);
    },
  },
];
