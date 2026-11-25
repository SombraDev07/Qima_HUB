// Migrações do sistema Viagem (Postgres). Nunca altere uma já aplicada — crie a próxima versão.
// Os dados das pessoas (CPF, RG, BU…) vêm e voltam para o banco de pessoas da Contratação (contratacao_banco).
const TABELAS = ['viagem_bus', 'viagem_pedidos', 'viagem_passageiros', 'viagem_anexos', 'viagem_historico'];

export default [
  {
    version: 1,
    async up(db) {
      await db.exec(`
        CREATE TABLE viagem_bus (id SERIAL PRIMARY KEY, nome TEXT NOT NULL UNIQUE, ativo BOOLEAN NOT NULL DEFAULT TRUE);
        INSERT INTO viagem_bus (nome) VALUES ('Consumer Products (CP)');

        CREATE TABLE viagem_pedidos (
          id                SERIAL PRIMARY KEY,
          codigo            TEXT UNIQUE,
          solicitante_id    INTEGER NOT NULL,
          solicitante_nome  TEXT NOT NULL,
          solicitante_email TEXT,
          origem            TEXT NOT NULL,
          origem_uf         TEXT NOT NULL,
          destino           TEXT NOT NULL,
          destino_uf        TEXT NOT NULL,
          transporte        TEXT NOT NULL CHECK (transporte IN ('onibus','aviao')),
          data_ida          DATE NOT NULL,
          data_volta        DATE,
          horario           TEXT NOT NULL,          -- HH:MM
          obs               TEXT,
          status            TEXT NOT NULL DEFAULT 'pendente'
                            CHECK (status IN ('pendente','agendando','agendado','recusado','cancelado')),
          motivo_recusa     TEXT,
          obs_central       TEXT,
          aceito_por        TEXT,
          aceito_at         TIMESTAMPTZ,
          agendado_por      TEXT,
          agendado_at       TIMESTAMPTZ,
          created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX viagem_pedidos_status ON viagem_pedidos (status);
        CREATE INDEX viagem_pedidos_solic ON viagem_pedidos (solicitante_id, status);
        CREATE INDEX viagem_pedidos_criado ON viagem_pedidos (created_at);

        -- Passageiros: cópia dos dados no momento do pedido (o banco de pessoas pode mudar depois)
        CREATE TABLE viagem_passageiros (
          id          SERIAL PRIMARY KEY,
          pedido_id   INTEGER NOT NULL REFERENCES viagem_pedidos(id) ON DELETE CASCADE,
          ordem       INTEGER NOT NULL DEFAULT 0,
          pessoa_id   INTEGER,                    -- contratacao_banco.id
          nome        TEXT NOT NULL,
          cpf         TEXT NOT NULL,              -- só os 11 dígitos
          rg          TEXT NOT NULL,
          nascimento  DATE NOT NULL,
          email       TEXT NOT NULL,
          telefone    TEXT NOT NULL,
          bu          TEXT NOT NULL,
          poltrona    TEXT,
          localizador TEXT,                       -- preenchido pela central
          valor       NUMERIC(12,2)
        );
        CREATE INDEX viagem_passageiros_pedido ON viagem_passageiros (pedido_id);

        -- Passagens/bilhetes anexados pela central
        CREATE TABLE viagem_anexos (
          id         SERIAL PRIMARY KEY,
          pedido_id  INTEGER NOT NULL REFERENCES viagem_pedidos(id) ON DELETE CASCADE,
          nome       TEXT NOT NULL,
          mime       TEXT NOT NULL,
          arquivo    TEXT NOT NULL,
          tamanho    INTEGER NOT NULL,
          created_by INTEGER,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX viagem_anexos_pedido ON viagem_anexos (pedido_id);

        CREATE TABLE viagem_historico (
          id         SERIAL PRIMARY KEY,
          pedido_id  INTEGER NOT NULL,
          user_id    INTEGER,
          user_nome  TEXT,
          acao       TEXT NOT NULL,
          detalhe    TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX viagem_hist_pedido ON viagem_historico (pedido_id);

        -- Só o servidor do HUB lê e grava (a API pública do Supabase fica fechada)
        ${TABELAS.map((t) => `ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;`).join('\n        ')}
      `);
    },
  },
];
