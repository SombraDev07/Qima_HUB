// Modelo de backend de um sistema. Copie a pasta _template para modules/<chave>/.
// Todas as tabelas devem começar com "<chave>_". Banco: Postgres (assíncrono).
//
// Regras do padrão (veja modules/solicitacoes/server/index.js como exemplo completo):
//  - leitura: await db.get / db.all; gravação: await db.tx(async (t) => { … }) e, dentro dela, só o "t";
//  - listas numa consulta só, sem consulta por linha (cada consulta é uma viagem de rede);
//  - listas com limite (ex.: últimos 60 dias); dentro de IN (...) só ids numéricos vindos do banco;
//  - chamadas externas (IA, e-mail) nunca dentro de transação.
export default {
  banco: 'postgres',

  migrations: [
    {
      version: 1,
      async up(db) {
        await db.exec(`
          CREATE TABLE NOME_DA_PASTA_chamados (
            id             SERIAL PRIMARY KEY,
            solicitante_id INTEGER NOT NULL,
            titulo         TEXT NOT NULL,
            status         TEXT NOT NULL DEFAULT 'novo',
            created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
          );
          CREATE INDEX NOME_DA_PASTA_chamados_solic ON NOME_DA_PASTA_chamados (solicitante_id, status);
          -- só o servidor do HUB lê e grava (a API pública do Supabase fica fechada)
          ALTER TABLE NOME_DA_PASTA_chamados ENABLE ROW LEVEL SECURITY;
        `);
      },
    },
    // Upgrade futuro: adicione { version: 2, async up(db) { await db.exec('ALTER TABLE ...') } }
  ],

  // Opcional: texto do card na tela inicial
  async summary({ db, user, isCentral }) {
    return null;
  },

  // Rotas ficam em /api/m/<chave>/...  (login e acesso ao sistema já validados pelo núcleo)
  router(r, { db, requireRole, a }) {
    // "a" repassa erros de rotas assíncronas ao tratador de erros do servidor (resposta 500)
    r.get('/meus', requireRole('solicitante'), a(async (req, res) => {
      res.json(await db.all('SELECT * FROM NOME_DA_PASTA_chamados WHERE solicitante_id = ? ORDER BY id DESC LIMIT 200', req.user.id));
    }));
    r.get('/central', requireRole('central'), a(async (_req, res) => {
      res.json(await db.all("SELECT * FROM NOME_DA_PASTA_chamados WHERE status <> 'concluido' ORDER BY id DESC LIMIT 500"));
    }));
  },
};
