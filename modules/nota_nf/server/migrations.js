// Migrações do sistema Nota NF (Postgres). Nunca altere uma já aplicada — crie a próxima versão.
// A versão 1 era a do SQLite; a 2 recria as tabelas no Postgres.
const TABELAS = ['nota_nf_config', 'nota_nf_notas', 'nota_nf_itens', 'nota_nf_historico'];

export default [
  {
    version: 2,
    async up(db) {
      await db.exec(`
        CREATE TABLE nota_nf_config (chave TEXT PRIMARY KEY, valor TEXT);
        INSERT INTO nota_nf_config VALUES ('germinacao_padrao', '92');

        -- Cada arquivo (foto/PDF) é uma NF com ID único (NF-00001)
        CREATE TABLE nota_nf_notas (
          id              SERIAL PRIMARY KEY,
          codigo          TEXT UNIQUE,
          dono_id         INTEGER NOT NULL,
          dono_nome       TEXT NOT NULL,
          dono_email      TEXT,
          substitui_id    INTEGER,
          arquivo         TEXT NOT NULL,
          nome_original   TEXT,
          mime            TEXT NOT NULL,
          tamanho         INTEGER,
          hash            TEXT NOT NULL,
          hash_original   TEXT,
          status          TEXT NOT NULL DEFAULT 'rascunho'
                          CHECK (status IN ('rascunho','aguardando','validada','recusada','substituida','cancelada')),
          ia_status       TEXT NOT NULL DEFAULT 'indisponivel' CHECK (ia_status IN ('ok','falhou','indisponivel')),
          ia_json         TEXT,
          ia_obs          TEXT,
          numero_nf       TEXT,
          serie           TEXT,
          chave_acesso    TEXT,
          emitente_nome   TEXT,
          emitente_doc    TEXT,
          produtor_nome   TEXT,
          produtor_doc    TEXT,
          data_emissao    DATE,
          municipio       TEXT,
          uf              TEXT,
          peso_liquido    NUMERIC(14,3),
          obs_solicitante TEXT,
          obs_central     TEXT,
          motivo_recusa   TEXT,
          editado_central BOOLEAN NOT NULL DEFAULT FALSE,
          analisado_por   INTEGER,
          analisado_at    TIMESTAMPTZ,
          enviado_at      TIMESTAMPTZ,
          created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX nota_nf_notas_dono ON nota_nf_notas (dono_id, status);
        CREATE INDEX nota_nf_notas_status ON nota_nf_notas (status);
        CREATE INDEX nota_nf_notas_subst ON nota_nf_notas (substitui_id);
        -- usados na busca de NFs parecidas (duplicidade)
        CREATE INDEX nota_nf_notas_chave ON nota_nf_notas (chave_acesso);
        CREATE INDEX nota_nf_notas_nf ON nota_nf_notas (emitente_doc, numero_nf);
        CREATE INDEX nota_nf_notas_hash ON nota_nf_notas (hash);
        CREATE INDEX nota_nf_notas_hash_orig ON nota_nf_notas (hash_original);

        -- Linhas de produto da NF. incluido = true → semente de soja (entra nos totais)
        CREATE TABLE nota_nf_itens (
          id                   SERIAL PRIMARY KEY,
          nota_id              INTEGER NOT NULL REFERENCES nota_nf_notas(id) ON DELETE CASCADE,
          ordem                INTEGER NOT NULL DEFAULT 0,
          descricao            TEXT NOT NULL,
          cultivar             TEXT,
          unidade              TEXT,
          quantidade           NUMERIC(14,3),
          sementes_por_unidade INTEGER,
          germinacao           NUMERIC(6,2),
          germinacao_padrao    BOOLEAN NOT NULL DEFAULT FALSE,
          incluido             BOOLEAN NOT NULL DEFAULT TRUE,
          motivo_exclusao      TEXT
        );
        CREATE INDEX nota_nf_itens_nota ON nota_nf_itens (nota_id, ordem);

        CREATE TABLE nota_nf_historico (
          id         SERIAL PRIMARY KEY,
          nota_id    INTEGER REFERENCES nota_nf_notas(id) ON DELETE CASCADE,
          user_id    INTEGER,
          user_nome  TEXT,
          acao       TEXT NOT NULL,
          detalhe    TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX nota_nf_hist_nota ON nota_nf_historico (nota_id);

        -- Só o servidor do HUB lê e grava (a API pública do Supabase fica fechada)
        ${TABELAS.map((t) => `ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;`).join('\n        ')}
      `);
    },
  },
];
