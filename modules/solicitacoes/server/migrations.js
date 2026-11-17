// Migrações do sistema Solicitações (Postgres). Nunca altere uma já aplicada — crie a próxima versão.
// A versão 1 era a do SQLite; a 2 recria as tabelas no Postgres.
const TABELAS = ['solicitacoes_projetos', 'solicitacoes_pedidos', 'solicitacoes_linhas', 'solicitacoes_arquivos', 'solicitacoes_mensagens'];

export default [
  {
    version: 2,
    async up(db) {
      await db.exec(`
        CREATE TABLE solicitacoes_projetos (id SERIAL PRIMARY KEY, nome TEXT NOT NULL, ativo BOOLEAN NOT NULL DEFAULT TRUE);
        CREATE UNIQUE INDEX solicitacoes_projetos_nome ON solicitacoes_projetos (lower(nome));
        INSERT INTO solicitacoes_projetos (nome) VALUES ('Harvest 2027');

        CREATE TABLE solicitacoes_pedidos (
          id               SERIAL PRIMARY KEY,
          codigo           TEXT UNIQUE,
          solicitante_id   INTEGER NOT NULL,
          solicitante_nome TEXT NOT NULL,
          solicitante_email TEXT,
          projeto          TEXT NOT NULL,
          tipo             TEXT NOT NULL,   -- exclusao | insercao | acumulado
          subtipo          TEXT,            -- insercao | correcao (só acumulado)
          status           TEXT NOT NULL DEFAULT 'pendente', -- pendente|analise|correcao|feito|cancelado
          cod_visita       TEXT,
          id_carga         TEXT,
          motivo           TEXT,
          titulo           TEXT,
          descricao        TEXT,
          data_inicial     DATE,
          data_final       DATE,
          obs_central      TEXT,
          responsavel_id   INTEGER,         -- quem da central pegou o pedido
          responsavel_nome TEXT,
          concluido_at     TIMESTAMPTZ,
          created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX solicitacoes_pedidos_sol ON solicitacoes_pedidos (solicitante_id, status);
        CREATE INDEX solicitacoes_pedidos_status ON solicitacoes_pedidos (status, updated_at);
        CREATE INDEX solicitacoes_pedidos_criado ON solicitacoes_pedidos (created_at);

        -- Linhas do Acumulado · Correção (uma por visita)
        CREATE TABLE solicitacoes_linhas (
          id          SERIAL PRIMARY KEY,
          pedido_id   INTEGER NOT NULL REFERENCES solicitacoes_pedidos(id) ON DELETE CASCADE,
          ordem       INTEGER NOT NULL,
          cod_visita  TEXT NOT NULL,
          documento   TEXT,               -- CPF/CNPJ só com dígitos
          data        DATE,
          negativa    INTEGER NOT NULL DEFAULT 0,
          declarada   INTEGER NOT NULL DEFAULT 0,
          positiva    INTEGER NOT NULL DEFAULT 0,
          participante INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX solicitacoes_linhas_ped ON solicitacoes_linhas (pedido_id, ordem);

        -- Planilhas anexadas (sobem antes do pedido e são ligadas a ele ao enviar)
        CREATE TABLE solicitacoes_arquivos (
          id          SERIAL PRIMARY KEY,
          pedido_id   INTEGER REFERENCES solicitacoes_pedidos(id),
          dono_id     INTEGER NOT NULL,
          nome        TEXT NOT NULL,
          arquivo     TEXT NOT NULL,
          mime        TEXT,
          tamanho     INTEGER,
          ativo       BOOLEAN NOT NULL DEFAULT TRUE, -- false = substituído por outra planilha
          created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX solicitacoes_arquivos_ped ON solicitacoes_arquivos (pedido_id);

        -- Conversa entre solicitante e central (e avisos automáticos)
        CREATE TABLE solicitacoes_mensagens (
          id          SERIAL PRIMARY KEY,
          pedido_id   INTEGER NOT NULL REFERENCES solicitacoes_pedidos(id) ON DELETE CASCADE,
          papel       TEXT NOT NULL,      -- solicitante | central | sistema
          autor_id    INTEGER,
          autor_nome  TEXT,
          texto       TEXT NOT NULL,
          lida        BOOLEAN NOT NULL DEFAULT FALSE,
          created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX solicitacoes_mensagens_ped ON solicitacoes_mensagens (pedido_id, papel, lida);

        -- Só o servidor do HUB lê e grava (a API pública do Supabase fica fechada)
        ${TABELAS.map((t) => `ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;`).join('\n        ')}
      `);
    },
  },
];
