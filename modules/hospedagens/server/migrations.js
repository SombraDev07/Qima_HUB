// Migrações do banco do sistema Hospedagens (Postgres).
// NUNCA altere uma migração já aplicada em produção — crie a próxima versão.
// As versões 1 e 2 eram as do SQLite; a 3 recria as tabelas no Postgres.
const TABELAS = ['hospedagens_pessoas', 'hospedagens_projetos', 'hospedagens_hoteis', 'hospedagens_pedidos', 'hospedagens_hospedes',
  'hospedagens_quartos', 'hospedagens_quarto_hospedes', 'hospedagens_solicitacoes', 'hospedagens_anexos', 'hospedagens_historico'];

export default [
  {
    version: 3,
    async up(db) {
      await db.exec(`
        -- Banco de pessoas que podem ser hospedadas
        CREATE TABLE hospedagens_pessoas (
          id         SERIAL PRIMARY KEY,
          nome       TEXT NOT NULL,
          email      TEXT,
          funcao     TEXT,
          cidade     TEXT,
          ativo      BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX hospedagens_pessoas_nome ON hospedagens_pessoas (lower(nome));

        CREATE TABLE hospedagens_projetos (
          id    SERIAL PRIMARY KEY,
          nome  TEXT NOT NULL UNIQUE,
          ativo BOOLEAN NOT NULL DEFAULT TRUE
        );
        INSERT INTO hospedagens_projetos (nome) VALUES ('Harvest 2027'), ('Monitoramento 2027'), ('Fibra');

        CREATE TABLE hospedagens_hoteis (
          id            SERIAL PRIMARY KEY,
          nome          TEXT NOT NULL,
          cidade        TEXT NOT NULL,
          uf            TEXT NOT NULL,
          endereco      TEXT,
          email         TEXT,
          telefone      TEXT,
          valor_s       NUMERIC(12,2) NOT NULL DEFAULT 0,
          valor_d       NUMERIC(12,2) NOT NULL DEFAULT 0,
          valor_t       NUMERIC(12,2) NOT NULL DEFAULT 0,
          valor_q       NUMERIC(12,2) NOT NULL DEFAULT 0,
          quartos       INTEGER NOT NULL DEFAULT 0,
          garagem       TEXT NOT NULL DEFAULT 'gratis' CHECK (garagem IN ('gratis','paga','nao')),
          garagem_valor NUMERIC(12,2),
          obs           TEXT,
          ativo         BOOLEAN NOT NULL DEFAULT TRUE,
          created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX hospedagens_hoteis_cidade ON hospedagens_hoteis (cidade, uf);

        CREATE TABLE hospedagens_pedidos (
          id                SERIAL PRIMARY KEY,
          codigo            TEXT UNIQUE,
          solicitante_id    INTEGER NOT NULL,
          solicitante_nome  TEXT NOT NULL,
          solicitante_email TEXT,
          cidade            TEXT NOT NULL,
          uf                TEXT NOT NULL,
          data_inicio       DATE NOT NULL,
          data_fim          DATE NOT NULL,
          projeto           TEXT,
          garagem           TEXT NOT NULL DEFAULT 'sem',
          obs               TEXT,
          status            TEXT NOT NULL DEFAULT 'pendente'
                            CHECK (status IN ('rascunho','pendente','ajustado','em_andamento','finalizado','cancelado')),
          created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX hospedagens_pedidos_status ON hospedagens_pedidos (status);
        CREATE INDEX hospedagens_pedidos_solic ON hospedagens_pedidos (solicitante_id, status);
        CREATE INDEX hospedagens_pedidos_criado ON hospedagens_pedidos (created_at);

        CREATE TABLE hospedagens_hospedes (
          id         SERIAL PRIMARY KEY,
          pedido_id  INTEGER NOT NULL REFERENCES hospedagens_pedidos(id) ON DELETE CASCADE,
          pessoa_id  INTEGER,
          nome       TEXT NOT NULL,
          email      TEXT,
          tipo       TEXT NOT NULL DEFAULT 'colaborador' CHECK (tipo IN ('colaborador','open')),
          status     TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','checkout','cancelado')),
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX hospedagens_hospedes_pedido ON hospedagens_hospedes (pedido_id);

        -- Cada linha é um "trecho" de quarto (um check-out parcial gera um novo trecho)
        CREATE TABLE hospedagens_quartos (
          id                 SERIAL PRIMARY KEY,
          pedido_id          INTEGER NOT NULL REFERENCES hospedagens_pedidos(id) ON DELETE CASCADE,
          codigo             TEXT NOT NULL,
          hotel_id           INTEGER REFERENCES hospedagens_hoteis(id),
          data_in            DATE,
          data_out           DATE,
          diaria             NUMERIC(12,2) NOT NULL DEFAULT 0,
          diaria_manual      BOOLEAN NOT NULL DEFAULT FALSE,
          situacao           TEXT NOT NULL DEFAULT 'novo'
                             CHECK (situacao IN ('novo','enviado','alterado','prorrogado','finalizado')),
          enviado            BOOLEAN NOT NULL DEFAULT FALSE,
          obs                TEXT,
          origem_id          INTEGER,
          -- financeiro
          fin_extra          NUMERIC(12,2) NOT NULL DEFAULT 0,
          fin_extra_obs      TEXT,
          fin_extrato_id     TEXT,
          fin_extrato_status TEXT NOT NULL DEFAULT 'Em Aberto',
          fin_extrato_ini    DATE,
          fin_extrato_fim    DATE,
          fin_dt_solicitacao DATE,
          fin_po             TEXT,
          fin_dt_abertura    DATE,
          fin_dt_nf          DATE,
          fin_nf             TEXT,
          fin_vencimento     DATE,
          fin_status_pg      TEXT NOT NULL DEFAULT 'Pendente',
          fin_obs            TEXT,
          created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX hospedagens_quartos_pedido ON hospedagens_quartos (pedido_id);
        CREATE INDEX hospedagens_quartos_hotel ON hospedagens_quartos (hotel_id);

        CREATE TABLE hospedagens_quarto_hospedes (
          quarto_id  INTEGER NOT NULL REFERENCES hospedagens_quartos(id) ON DELETE CASCADE,
          hospede_id INTEGER NOT NULL REFERENCES hospedagens_hospedes(id) ON DELETE CASCADE,
          slot       INTEGER NOT NULL,
          PRIMARY KEY (quarto_id, hospede_id)
        );
        CREATE INDEX hospedagens_qh_hospede ON hospedagens_quarto_hospedes (hospede_id);

        -- Pedidos de ajuste do solicitante para a central (cancelar, prorrogar, check-out, editar)
        CREATE TABLE hospedagens_solicitacoes (
          id            SERIAL PRIMARY KEY,
          pedido_id     INTEGER NOT NULL REFERENCES hospedagens_pedidos(id) ON DELETE CASCADE,
          quarto_id     INTEGER,
          hospede_id    INTEGER,
          tipo          TEXT NOT NULL CHECK (tipo IN ('cancelar','prorrogar','checkout','editar','cancelar_pedido')),
          data          DATE,
          obs           TEXT,
          status        TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','confirmada','recusada','retirada')),
          resposta      TEXT,
          criado_por    INTEGER,
          resolvido_por INTEGER,
          resolvido_at  TIMESTAMPTZ,
          created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX hospedagens_solic_pedido ON hospedagens_solicitacoes (pedido_id, status);
        CREATE INDEX hospedagens_solic_status ON hospedagens_solicitacoes (status, quarto_id);

        CREATE TABLE hospedagens_anexos (
          id         SERIAL PRIMARY KEY,
          quarto_id  INTEGER NOT NULL REFERENCES hospedagens_quartos(id) ON DELETE CASCADE,
          nome       TEXT NOT NULL,
          mime       TEXT,
          arquivo    TEXT NOT NULL,
          tamanho    INTEGER,
          created_by INTEGER,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX hospedagens_anexos_quarto ON hospedagens_anexos (quarto_id);

        CREATE TABLE hospedagens_historico (
          id         SERIAL PRIMARY KEY,
          pedido_id  INTEGER NOT NULL REFERENCES hospedagens_pedidos(id) ON DELETE CASCADE,
          user_id    INTEGER,
          user_nome  TEXT,
          acao       TEXT NOT NULL,
          detalhe    TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX hospedagens_hist_pedido ON hospedagens_historico (pedido_id);

        -- Só o servidor do HUB lê e grava (a API pública do Supabase fica fechada)
        ${TABELAS.map((t) => `ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;`).join('\n        ')}
      `);
    },
  },
  {
    // O banco de pessoas passa a ser o da Contratação (contratacao_banco). O cadastro antigo
    // fica desativado (não é apagado) e os pessoa_id antigos, que apontavam para ele, são limpos.
    version: 4,
    async up(db) {
      await db.exec(`
        UPDATE hospedagens_pessoas SET ativo = FALSE;
        UPDATE hospedagens_hospedes SET pessoa_id = NULL WHERE pessoa_id IS NOT NULL;
      `);
    },
  },
];
