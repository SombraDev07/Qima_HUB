// Carrega cada sistema listado em modules/registro.js (gerado a partir das pastas de modules/).
// Um módulo com erro é registrado como "falhou" e NÃO derruba o HUB.
//
// Todos os sistemas usam o Postgres: ctx.db é assíncrono (get, all, run, tx).
import path from 'node:path';
import express from 'express';
import { dataDir } from './db.js';
import { pg } from './pg.js';
import { requireAuth, hasRole, a } from './auth.js';
import { contar } from './lib/seguranca.js';
import { createZip } from './lib/zip.js';
import { buildXlsx } from './lib/xlsx.js';
import { aiParaModulo } from './lib/ai.js';
import { arquivosDoModulo } from './lib/arquivos.js';
import registro from '../../modules/registro.js';

/** @type {Map<string, {manifest: any, impl: any, error?: string}>} */
export const registry = new Map();

async function migrarPostgres(key, migrations) {
  const applied = new Set((await pg.all('SELECT version FROM module_migrations WHERE module_key = ?', key)).map((r) => r.version));
  for (const m of [...migrations].sort((x, y) => x.version - y.version).filter((x) => !applied.has(x.version))) {
    await pg.tx(async (t) => {
      await m.up(t);
      await t.run('INSERT INTO module_migrations (module_key, version) VALUES (?, ?)', key, m.version);
    });
    console.log(`[modulo ${key}] migração v${m.version} aplicada`);
  }
}

/** Versão do banco de cada sistema (tela Administração › Sistemas). */
export async function versoesDoBanco() {
  const out = {};
  for (const r of await pg.all('SELECT module_key, MAX(version) AS v FROM module_migrations GROUP BY module_key')) out[r.module_key] = r.v;
  return out;
}

/** Contexto entregue a cada módulo. É o "contrato" estável entre core e módulos. */
function makeContext(key) {
  const filesDir = path.join(dataDir, 'uploads', key);
  return {
    key,
    /** Fotos e anexos: Supabase Storage (privado) ou, em desenvolvimento, a pasta local. Veja lib/arquivos.js. */
    arquivos: arquivosDoModulo(key, filesDir),
    /** Geração de arquivos para download: ZIP e planilha Excel. */
    files: { zip: createZip, xlsx: buildXlsx },
    /** Leitura de documentos por IA (configurada no Admin; sem provedor ou desligada = modo manual). */
    ai: aiParaModulo(key),
    /** Middleware: exige o papel no módulo ('solicitante' | 'central'). */
    requireRole: (wanted) => (req, res, next) =>
      hasRole(req.moduleRole, wanted) ? next() : res.status(403).json({ error: `Requer perfil ${wanted}` }),
    /** Envolve uma rota assíncrona: erro não tratado vira resposta 500. */
    a,
    /**
     * Limite de uso por pessoa (ex.: envios que gastam IA ou armazenamento). Middleware: coloque antes de ler o corpo.
     *   r.post('/notas', sol, limitar({ nome: 'envio', max: 40, janelaMin: 10 }), express.raw(...), ...)
     */
    limitar: ({ nome, max, janelaMin = 10 }) => a(async (req, res, next) => {
      const n = await contar(`uso:${key}:${nome}:${req.user.id}`, { max, janelaMin, bloqueioMin: 1 });
      if (n > max) { res.setHeader('Retry-After', janelaMin * 60); return res.status(429).json({ error: `Muitos envios em pouco tempo. Aguarde alguns minutos e tente de novo.` }); }
      next();
    }),
    /** Postgres: await db.get / db.all / db.run / db.tx(async (t) => …). */
    db: pg,
    // ATENÇÃO: dentro de db.tx use só o "t" (inclusive nas duas funções abaixo, passando-o como
    // último argumento). Uma consulta fora do "t" espera a transação terminar e a rota trava.
    /** Contas ativas com o perfil no módulo (ex.: e-mails da central para avisos). */
    usuariosComPerfil: (perfil, t = pg) => t.all(`SELECT u.id, u.name, u.email FROM users u JOIN user_modules um ON um.user_id = u.id
      WHERE um.module_key = ? AND u.active AND um.role IN (?, 'ambos') ORDER BY u.name`, key, perfil),
    /** Enfileira um e-mail na caixa de saída do HUB. Dentro de transação, passe o "t" como 4º argumento. */
    async notify(to, subject, html, t = pg) {
      const email = String(to || '').trim();
      if (!email) return false;
      await t.run('INSERT INTO outbox (module_key, to_email, subject, html) VALUES (?, ?, ?, ?)', key, email, subject, html);
      return true;
    },
  };
}

export async function loadModules(app, { migrar = true } = {}) {
  for (const item of registro) {
    const name = item.key;
    let { manifest } = item;
    try {
      if (item.erro) throw new Error(item.erro);
      await pg.run('INSERT INTO modules (key, status, sort_order) VALUES (?, ?, ?) ON CONFLICT (key) DO NOTHING',
        name, manifest.defaultStatus || 'em_breve', manifest.order ?? 99);

      const impl = item.carregar ? (await item.carregar()).default || {} : {};
      if (impl.migrations?.length && impl.banco !== 'postgres') throw new Error('o sistema precisa declarar banco: \'postgres\' (veja modules/_template)');
      if (migrar) await migrarPostgres(name, impl.migrations || []);

      if (typeof impl.router === 'function') {
        const router = express.Router();
        router.use(requireAuth, a(async (req, res, next) => {
          const mod = await pg.get(`SELECT m.status, m.enabled, um.role FROM modules m
            LEFT JOIN user_modules um ON um.module_key = m.key AND um.user_id = ? WHERE m.key = ?`, req.user.id, name);
          if (!mod?.enabled || mod.status !== 'ativo') return res.status(503).json({ error: 'Sistema indisponível' });
          if (!mod.role) return res.status(403).json({ error: 'Sem acesso a este sistema' });
          if (mod.role === 'rtv') return res.status(403).json({ error: 'O perfil RTV ainda não tem acesso a este sistema.' });
          req.moduleRole = mod.role;
          next();
        }));
        const ctx = makeContext(name);
        impl.router(router, ctx);
        app.use(`/api/m/${name}`, router);
      }

      registry.set(name, { manifest, impl });
      console.log(`[modulo ${name}] v${manifest.version || '?'} carregado`);
    } catch (err) {
      console.error(`[modulo ${name}] FALHOU ao carregar:`, err);
      registry.set(name, { manifest: manifest || { key: name, title: name }, impl: {}, error: String(err.message || err) });
    }
  }
  return registry;
}

const ativo = (key, fn) => {
  const entry = registry.get(key);
  return entry && !entry.error && typeof entry.impl[fn] === 'function' ? entry : null;
};

/**
 * Pendências do usuário no módulo (sininho do topo).
 * O módulo exporta notificacoes(ctx) → [{ texto, qtd, link, central? }]
 * link é relativo à área: 'central/demissoes' ou 'solicitante'.
 */
export async function moduleNotificacoes(key, user, role) {
  const entry = ativo(key, 'notificacoes');
  if (!entry) return [];
  try {
    const ctx = { ...makeContext(key), user, role, isCentral: hasRole(role, 'central'), isSolicitante: hasRole(role, 'solicitante') };
    return ((await entry.impl.notificacoes(ctx)) || []).filter((n) => n && n.qtd > 0)
      .map((n) => ({ ...n, link: `/m/${key}/${n.link || (n.central ? 'central' : 'solicitante')}` }));
  } catch (err) {
    console.error(`[modulo ${key}] erro nas notificações:`, err);
    return [];
  }
}

/**
 * Relatório do sistema para a Administração (Excel com filtro de datas).
 * O módulo exporta relatorio(ctx) → { solicitante: {columns, rows}, central: {columns, rows}, extras?: [{name, columns, rows}] }
 * ctx.entre('coluna') devolve o SQL "data local da coluna entre de e ate" e ctx.periodo os 2 parâmetros.
 */
export async function moduleRelatorio(key, { de, ate }) {
  const entry = ativo(key, 'relatorio');
  if (!entry) return null;
  const fuso = Number(process.env.QIMA_FUSO_HORAS ?? -3);
  const sinal = `${fuso >= 0 ? '+' : ''}${fuso} hours`;
  const ctx = {
    ...makeContext(key), de, ate, periodo: [de, ate],
    entre: (col) => `(${col} + interval '${sinal}')::date BETWEEN ?::date AND ?::date`,
  };
  return entry.impl.relatorio(ctx);
}

/** Texto curto exibido no card (ex.: "0 pedido(s) novo(s) · 6 em andamento"). */
export async function moduleSummary(key, user, role) {
  const entry = ativo(key, 'summary');
  if (!entry) return null;
  try {
    return (await entry.impl.summary({ ...makeContext(key), user, role, isCentral: hasRole(role, 'central') })) ?? null;
  } catch (err) {
    console.error(`[modulo ${key}] erro no summary:`, err);
    return null;
  }
}
