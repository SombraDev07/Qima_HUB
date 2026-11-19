// Migrações do sistema Frotas (Postgres). Nunca altere uma já aplicada — crie a próxima versão.
// A versão 1 era a do SQLite; a 2 recria as tabelas no Postgres.
const TABELAS = ['frotas_locais', 'frotas_categorias', 'frotas_modalidades', 'frotas_colaboradores', 'frotas_pedidos', 'frotas_veiculos',
  'frotas_fotos', 'frotas_chamados', 'frotas_historico'];

export default [
  {
    version: 2,
    async up(db) {
      await db.exec(`
        -- Listas que a central mantém em Configurações
        CREATE TABLE frotas_locais (id SERIAL PRIMARY KEY, nome TEXT NOT NULL, ativo BOOLEAN NOT NULL DEFAULT TRUE);
        CREATE UNIQUE INDEX frotas_locais_nome ON frotas_locais (lower(nome));
        INSERT INTO frotas_locais (nome) VALUES ('Chapecó-SC'), ('Londrina-PR'), ('Erechim-RS');
        CREATE TABLE frotas_categorias (id SERIAL PRIMARY KEY, nome TEXT NOT NULL, ativo BOOLEAN NOT NULL DEFAULT TRUE);
        CREATE UNIQUE INDEX frotas_categorias_nome ON frotas_categorias (lower(nome));
        INSERT INTO frotas_categorias (nome) VALUES ('B'), ('C'), ('CE'), ('D'), ('Picape');
        CREATE TABLE frotas_modalidades (id SERIAL PRIMARY KEY, nome TEXT NOT NULL, ativo BOOLEAN NOT NULL DEFAULT TRUE);
        CREATE UNIQUE INDEX frotas_modalidades_nome ON frotas_modalidades (lower(nome));
        INSERT INTO frotas_modalidades (nome) VALUES ('Diária'), ('Mensal');
        -- Motoristas/colaboradores (e o superior de cada um)
        CREATE TABLE frotas_colaboradores (id SERIAL PRIMARY KEY, nome TEXT NOT NULL, superior TEXT, ativo BOOLEAN NOT NULL DEFAULT TRUE);
        CREATE UNIQUE INDEX frotas_colaboradores_nome ON frotas_colaboradores (lower(nome));

        -- Pedido de veículo (uma linha = um veículo). Pedidos criados juntos compartilham o lote.
        CREATE TABLE frotas_pedidos (
          id               SERIAL PRIMARY KEY,
          codigo           TEXT UNIQUE,
          lote             TEXT NOT NULL,
          solicitante_id   INTEGER NOT NULL,
          solicitante_nome TEXT NOT NULL,
          solicitante_email TEXT,
          data_retirada    DATE,
          local            TEXT,
          categoria        TEXT,
          motivo           TEXT,
          motorista        TEXT,
          status           TEXT NOT NULL DEFAULT 'rascunho', -- rascunho|solicitado|aprovado|reprovado|reservado|em_uso|encerrado
          resposta         TEXT,
          enviado_at       TIMESTAMPTZ,
          analisado_at     TIMESTAMPTZ,
          analisado_por    TEXT,
          created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX frotas_pedidos_sol ON frotas_pedidos (solicitante_id, status);
        CREATE INDEX frotas_pedidos_status ON frotas_pedidos (status);
        CREATE INDEX frotas_pedidos_lote ON frotas_pedidos (lote);
        CREATE INDEX frotas_pedidos_criado ON frotas_pedidos (created_at);

        -- Veículo / contrato de locação. Troca e substituição criam uma nova linha ligada à anterior (origem_id).
        CREATE TABLE frotas_veiculos (
          id               SERIAL PRIMARY KEY,
          pedido_id        INTEGER REFERENCES frotas_pedidos(id),
          origem_id        INTEGER REFERENCES frotas_veiculos(id),
          responsavel_id   INTEGER,           -- quem pediu: vê o veículo em "Meus veículos"
          responsavel_nome TEXT,
          codigo_reserva   TEXT,
          local            TEXT,
          categoria        TEXT,
          modalidade       TEXT,
          valor_contrato   NUMERIC(12,2),
          motorista        TEXT,
          placa            TEXT,
          modelo           TEXT,
          cartao           TEXT,
          data_retirada    DATE,
          km_retirada      INTEGER,
          data_devolucao   DATE,
          km_devolucao     INTEGER,
          status           TEXT NOT NULL DEFAULT 'reservado', -- reservado|em_uso|substituido|trocado|encerrado
          motivo           TEXT,
          created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX frotas_veiculos_status ON frotas_veiculos (status);
        CREATE INDEX frotas_veiculos_resp ON frotas_veiculos (responsavel_id, status);
        CREATE INDEX frotas_veiculos_pedido ON frotas_veiculos (pedido_id);
        CREATE INDEX frotas_veiculos_origem ON frotas_veiculos (origem_id);
        CREATE INDEX frotas_veiculos_reserva ON frotas_veiculos (codigo_reserva);
        CREATE INDEX frotas_veiculos_placa ON frotas_veiculos (placa);

        -- Fotos do carro com carimbo (ângulo, quando, GPS e quem tirou)
        CREATE TABLE frotas_fotos (
          id          SERIAL PRIMARY KEY,
          codigo      TEXT UNIQUE,
          veiculo_id  INTEGER NOT NULL REFERENCES frotas_veiculos(id),
          angulo      TEXT NOT NULL,
          arquivo     TEXT NOT NULL,
          mime        TEXT NOT NULL,
          tamanho     INTEGER,
          lat         DOUBLE PRECISION NOT NULL,
          lon         DOUBLE PRECISION NOT NULL,
          precisao    DOUBLE PRECISION,
          tirada_em   TIMESTAMPTZ NOT NULL,
          autor_id    INTEGER,
          autor_nome  TEXT,
          autor_email TEXT,
          created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX frotas_fotos_veic ON frotas_fotos (veiculo_id, angulo);

        -- Chamados sobre um veículo em uso: manutenção, troca, substituição de condutor, encerramento
        CREATE TABLE frotas_chamados (
          id                SERIAL PRIMARY KEY,
          codigo            TEXT UNIQUE,
          veiculo_id        INTEGER NOT NULL REFERENCES frotas_veiculos(id),
          tipo              TEXT NOT NULL,     -- manutencao|troca|substituicao|encerramento
          status            TEXT NOT NULL DEFAULT 'pendente', -- pendente|aprovado|agendado|reprovado|finalizado|cancelado
          solicitante_id    INTEGER,
          solicitante_nome  TEXT,
          solicitante_email TEXT,
          placa             TEXT,
          modelo            TEXT,
          motorista         TEXT,
          motivo            TEXT,
          tipo_manutencao   TEXT,
          condutor_novo     TEXT,
          data_saida_condutor DATE,
          data_inicio_nova  DATE,
          data_devolucao    DATE,
          km_devolucao      INTEGER,
          local_servico     TEXT,
          hora_servico      TEXT,
          data_servico      DATE,
          placa_devolucao   TEXT,
          resposta          TEXT,
          analisado_at      TIMESTAMPTZ,
          agendado_at       TIMESTAMPTZ,
          finalizado_at     TIMESTAMPTZ,
          resultado         TEXT,
          created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX frotas_chamados_status ON frotas_chamados (status);
        CREATE INDEX frotas_chamados_veic ON frotas_chamados (veiculo_id, status);
        CREATE INDEX frotas_chamados_sol ON frotas_chamados (solicitante_id);
        CREATE INDEX frotas_chamados_criado ON frotas_chamados (created_at);

        CREATE TABLE frotas_historico (
          id          SERIAL PRIMARY KEY,
          pedido_id   INTEGER,
          veiculo_id  INTEGER,
          chamado_id  INTEGER,
          autor_id    INTEGER,
          autor_nome  TEXT,
          acao        TEXT NOT NULL,
          detalhe     TEXT,
          created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX frotas_hist_veic ON frotas_historico (veiculo_id);
        CREATE INDEX frotas_hist_pedido ON frotas_historico (pedido_id);

        -- Só o servidor do HUB lê e grava (a API pública do Supabase fica fechada)
        ${TABELAS.map((t) => `ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;`).join('\n        ')}
      `);
    },
  },
  {
    // Modalidade e devolução prevista já no pedido; prazo (data limite) do veículo para o aviso de vencimento.
    // Mensal: limite de 30 dias a partir da retirada. Só acrescenta colunas (nada é apagado).
    version: 3,
    async up(db) {
      await db.exec(`
        ALTER TABLE frotas_pedidos ADD COLUMN IF NOT EXISTS modalidade TEXT;
        ALTER TABLE frotas_pedidos ADD COLUMN IF NOT EXISTS data_prevista DATE;
        ALTER TABLE frotas_veiculos ADD COLUMN IF NOT EXISTS data_limite DATE;
        UPDATE frotas_veiculos SET data_limite = data_retirada + 30
          WHERE data_limite IS NULL AND data_retirada IS NOT NULL AND status IN ('reservado','em_uso') AND lower(modalidade) LIKE 'mens%';
        CREATE INDEX IF NOT EXISTS frotas_veiculos_limite ON frotas_veiculos (data_limite) WHERE status = 'em_uso';
      `);
    },
  },
];
