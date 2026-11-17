// Banco Postgres do HUB (o mesmo SQL roda no Supabase e no computador de desenvolvimento).
//
//   DATABASE_URL definida  → conecta nesse Postgres (Supabase: use o endereço do "pooler", modo transação)
//   sem DATABASE_URL       → Postgres embutido (PGlite) numa pasta local, só para desenvolvimento
//
// Uso (sempre com await; os parâmetros são "?" na ordem):
//   await pg.get('SELECT ... WHERE id = ?', id)      → uma linha ou undefined
//   await pg.all('SELECT ...', a, b)                 → lista de linhas
//   await pg.run('UPDATE ...', a)                    → { rowCount }
//   await pg.tx(async (t) => { await t.run(...); })  → transação; dentro dela use SEMPRE o "t"
//
// Convenções: datas voltam como texto 'AAAA-MM-DD HH:MM:SS' em UTC (igual ao formato antigo),
// "date" volta como 'AAAA-MM-DD', bigint/COUNT voltam como número.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, dataDir } from './db.js';

/** "?" → $1, $2… (ignora "?" dentro de texto entre aspas simples). */
export function numerar(sql) {
  let n = 0;
  let dentro = false;
  let out = '';
  for (const ch of sql) {
    if (ch === "'") dentro = !dentro;
    out += ch === '?' && !dentro ? `$${++n}` : ch;
  }
  return out;
}

const semMs = (s) => (s == null ? s : String(s).slice(0, 19));
const limpar = (params) => params.map((p) => (p === undefined ? null : p));

function api(consultar) {
  return {
    async all(sql, ...params) { return (await consultar(numerar(sql), limpar(params))).rows; },
    async get(sql, ...params) { return (await consultar(numerar(sql), limpar(params))).rows[0]; },
    async run(sql, ...params) { const r = await consultar(numerar(sql), limpar(params)); return { rowCount: r.rowCount, rows: r.rows }; },
  };
}

// ------------------------------------------------------------------ PGlite (desenvolvimento)
async function abrirLocal() {
  const { PGlite } = await import('@electric-sql/pglite');
  // Pasta sincronizada (OneDrive) corrompe banco: nesse caso guarda fora dela.
  const dir = process.env.QIMA_PG_DIR
    || (/onedrive|dropbox|google drive/i.test(ROOT) ? path.join(process.env.LOCALAPPDATA || os.homedir(), 'QIMAHub', 'pg') : path.join(dataDir, 'pg'));
  fs.mkdirSync(dir, { recursive: true });
  const db = new PGlite(dir);
  await db.waitReady;
  const opts = { parsers: { 20: Number, 1700: Number, 1184: semMs, 1114: semMs, 1082: (s) => s } };
  const com = (alvo) => api(async (sql, params) => { const r = await alvo.query(sql, params, opts); return { rows: r.rows, rowCount: r.affectedRows ?? 0 }; });
  return {
    onde: `Postgres local (PGlite) em ${dir}`,
    ...com(db),
    exec: (sql) => db.exec(sql),
    tx: (fn) => db.transaction((t) => fn({ ...com(t), exec: (sql) => t.exec(sql) })),
    fechar: () => db.close(),
  };
}

// ------------------------------------------------------------------ Postgres de verdade (Supabase)
async function abrirRemoto(url) {
  const { default: postgres } = await import('postgres');
  // serialize precisa devolver texto (número e Date também chegam aqui)
  const texto = (oid, parse = (s) => s) => ({ to: oid, from: [oid], serialize: (v) => (v instanceof Date ? v.toISOString() : String(v)), parse });
  const sql = postgres(url, {
    prepare: false, // exigido pelo pooler do Supabase em modo transação
    max: Number(process.env.QIMA_PG_CONEXOES) || (process.env.VERCEL ? 1 : 5),
    idle_timeout: 20,
    connect_timeout: 10,
    connection: { TimeZone: 'UTC' },
    onnotice: () => {},
    types: {
      bigint: texto(20, Number), numeric: texto(1700, Number),
      timestamptz: texto(1184, semMs), timestamp: texto(1114, semMs), date: texto(1082),
    },
  });
  const com = (alvo) => api(async (q, params) => { const r = await alvo.unsafe(q, params); return { rows: [...r], rowCount: r.count ?? 0 }; });
  return {
    onde: `Postgres em ${new URL(url).host}`,
    ...com(sql),
    exec: (q) => sql.unsafe(q).simple(),
    tx: (fn) => sql.begin((t) => fn({ ...com(t), exec: (q) => t.unsafe(q).simple() })),
    fechar: () => sql.end({ timeout: 5 }),
  };
}

export const pg = process.env.DATABASE_URL ? await abrirRemoto(process.env.DATABASE_URL) : await abrirLocal();
