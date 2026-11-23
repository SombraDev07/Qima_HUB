// Migrações do sistema Horas de Auditoria (Postgres). Nunca altere uma já aplicada: crie a próxima versão.
export default [
  {
    version: 1,
    async up(db) {
      await db.exec(`
        -- Um planejamento = uma safra (ex.: Harvest 2026) com datas e valores por hora
        CREATE TABLE horas_planejamentos (
          id                SERIAL PRIMARY KEY,
          nome              TEXT NOT NULL,
          inicio            DATE NOT NULL,                    -- domingo da semana 1
          semanas           INTEGER NOT NULL CHECK (semanas BETWEEN 1 AND 60),
          horas_por_auditor NUMERIC(8,2) NOT NULL DEFAULT 44,
          aud_veic_a        NUMERIC(6,2) NOT NULL DEFAULT 1,  -- auditores por veículo (2H/4H)
          aud_veic_b        NUMERIC(6,2) NOT NULL DEFAULT 3,  -- auditores por veículo (8H)
          taxas             JSONB NOT NULL,                   -- R$ por hora de cada módulo
          created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        CREATE TABLE horas_distritos (
          id               SERIAL PRIMARY KEY,
          planejamento_id  INTEGER NOT NULL REFERENCES horas_planejamentos(id) ON DELETE CASCADE,
          nome             TEXT NOT NULL,
          aprovada_id      INTEGER,                           -- versão que vale hoje
          created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE UNIQUE INDEX horas_distritos_nome ON horas_distritos (planejamento_id, lower(nome));

        -- Versões das horas de um distrito: aprovada (vale), rascunho (planejador editando), pendente (esperando a Central)
        CREATE TABLE horas_versoes (
          id                 SERIAL PRIMARY KEY,
          distrito_id        INTEGER NOT NULL REFERENCES horas_distritos(id) ON DELETE CASCADE,
          status             TEXT NOT NULL,                    -- rascunho | pendente | aprovada | substituida
          horas              JSONB NOT NULL,                   -- { "2/4H": [48, null, ...], ... }
          prog               NUMERIC(14,2) NOT NULL DEFAULT 0, -- budget programado
          base_id            INTEGER,                          -- versão aprovada em que o rascunho se baseou
          rev                INTEGER NOT NULL DEFAULT 1,       -- trava contra duas pessoas editando juntas
          motivo             TEXT,                             -- motivo da última reprovação
          nota               TEXT,                             -- recado do planejador ao enviar
          criado_por_id      INTEGER,
          criado_por_nome    TEXT,
          criado_por_email   TEXT,
          enviado_em         TIMESTAMPTZ,
          decidido_em        TIMESTAMPTZ,
          decidido_por_nome  TEXT,
          created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        -- no máximo uma versão aberta (rascunho ou pendente) por distrito
        CREATE UNIQUE INDEX horas_versoes_aberta ON horas_versoes (distrito_id) WHERE status IN ('rascunho','pendente');
        CREATE INDEX horas_versoes_dist ON horas_versoes (distrito_id, id);

        -- Linha do tempo (alimenta o histórico e o painel)
        CREATE TABLE horas_eventos (
          id               SERIAL PRIMARY KEY,
          planejamento_id  INTEGER NOT NULL,
          distrito_id      INTEGER,
          versao_id        INTEGER,
          distrito_nome    TEXT,
          acao             TEXT NOT NULL,    -- criada | importada | enviada | aprovada | reprovada | descartada | parametros
          por_id           INTEGER,
          por_nome         TEXT,
          nota             TEXT,
          resumo           JSONB,
          created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX horas_eventos_plano ON horas_eventos (planejamento_id, id DESC);
        CREATE INDEX horas_eventos_data ON horas_eventos (created_at);

        ALTER TABLE horas_planejamentos ENABLE ROW LEVEL SECURITY;
        ALTER TABLE horas_distritos ENABLE ROW LEVEL SECURITY;
        ALTER TABLE horas_versoes ENABLE ROW LEVEL SECURITY;
        ALTER TABLE horas_eventos ENABLE ROW LEVEL SECURITY;
      `);
    },
  },
];
