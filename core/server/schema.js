// Tabelas do núcleo (core) no Postgres. Cada sistema cria as suas próprias, com prefixo "<chave>_".
// Roda na partida do servidor (desenvolvimento) ou com "npm run migrate" (produção/Vercel).
import { pg } from './pg.js';

const TABELAS = ['users', 'sessions', 'modules', 'user_modules', 'outbox', 'settings', 'ai_uso', 'module_migrations', 'auth_limites', 'password_resets', 'audit_log', 'app_tokens'];

const SQL = `
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  is_admin      BOOLEAN NOT NULL DEFAULT FALSE,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email ON users (lower(email));

-- Sessões por cookie (saem quando o login passar para o Supabase Auth)
CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id);

-- Estado administrável de cada módulo (o resto vem do module.json)
CREATE TABLE IF NOT EXISTS modules (
  key        TEXT PRIMARY KEY,
  status     TEXT NOT NULL DEFAULT 'em_breve' CHECK (status IN ('ativo','em_breve')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  enabled    BOOLEAN NOT NULL DEFAULT TRUE
);

-- Quem vê qual card e com qual papel
CREATE TABLE IF NOT EXISTS user_modules (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL,
  role       TEXT NOT NULL CHECK (role IN ('solicitante','central','ambos','rtv')),
  PRIMARY KEY (user_id, module_key)
);
CREATE INDEX IF NOT EXISTS user_modules_mod ON user_modules (module_key, role);

-- Caixa de saída de e-mails (todos os módulos)
CREATE TABLE IF NOT EXISTS outbox (
  id          SERIAL PRIMARY KEY,
  module_key  TEXT NOT NULL,
  to_email    TEXT NOT NULL,
  subject     TEXT NOT NULL,
  html        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pendente',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS outbox_status ON outbox (status, id);

-- Configurações gerais do HUB (ex.: 'ia' = JSON da leitura por IA)
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT
);

-- Registro de cada leitura feita pela IA (uso e falhas por sistema)
CREATE TABLE IF NOT EXISTS ai_uso (
  id         SERIAL PRIMARY KEY,
  module_key TEXT,
  provedor   TEXT,
  ok         BOOLEAN NOT NULL,
  ms         INTEGER,
  erro       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_uso_data ON ai_uso (created_at);

-- Bloqueio de tentativas de login / recuperação (vale em todas as instâncias do servidor)
CREATE TABLE IF NOT EXISTS auth_limites (
  chave         TEXT PRIMARY KEY,
  falhas        INTEGER NOT NULL DEFAULT 0,
  janela_inicio TIMESTAMPTZ NOT NULL DEFAULT now(),
  bloqueado_ate TIMESTAMPTZ
);

-- Links de redefinição de senha (só o hash do token fica guardado; vale uma vez)
CREATE TABLE IF NOT EXISTS password_resets (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  criado_por INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS password_resets_user ON password_resets (user_id);

-- Login do app de celular: o token fica só como hash; vale 30 dias a partir do último uso
CREATE TABLE IF NOT EXISTS app_tokens (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  dispositivo TEXT,
  ip          TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultimo_uso  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expira_em   TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS app_tokens_user ON app_tokens (user_id);

-- Trilha de auditoria: logins bloqueados, trocas de senha, mudanças de contas e perfis
CREATE TABLE IF NOT EXISTS audit_log (
  id            SERIAL PRIMARY KEY,
  usuario_id    INTEGER,
  usuario_email TEXT,
  acao          TEXT NOT NULL,
  detalhe       TEXT,
  ip            TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_log_data ON audit_log (created_at);

-- Controle de versão do banco de cada módulo já migrado para o Postgres
CREATE TABLE IF NOT EXISTS module_migrations (
  module_key TEXT NOT NULL,
  version    INTEGER NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (module_key, version)
);
`;

export async function migrarNucleo() {
  await pg.exec(SQL);
  // Bucket PRIVADO dos arquivos (só existe no Supabase; no Postgres local a pasta "storage" não existe e isto é ignorado).
  // Sem políticas no storage.objects: só o servidor, com a chave secreta, lê e grava.
  try {
    await pg.run(`INSERT INTO storage.buckets (id, name, public, file_size_limit) VALUES (?, ?, FALSE, 20971520) ON CONFLICT (id) DO NOTHING`,
      process.env.QIMA_BUCKET || 'qima-arquivos', process.env.QIMA_BUCKET || 'qima-arquivos');
  } catch { /* sem Supabase Storage neste banco */ }
  // Bancos criados antes do perfil RTV: amplia a regra dos perfis aceitos (só mexe se ainda não tiver o RTV).
  await pg.exec(`DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_modules_role_check' AND pg_get_constraintdef(oid) NOT LIKE '%rtv%') THEN
      ALTER TABLE user_modules DROP CONSTRAINT user_modules_role_check;
      ALTER TABLE user_modules ADD CONSTRAINT user_modules_role_check CHECK (role IN ('solicitante','central','ambos','rtv'));
    END IF;
  END $$;`);
  // No Supabase as tabelas ficam visíveis pela API pública dele. Com RLS ligado e nenhuma
  // política, só o servidor do HUB (dono das tabelas) consegue ler e gravar.
  await pg.exec(TABELAS.map((t) => `ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;`).join('\n'));
}

