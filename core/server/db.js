// Caminhos do projeto. O banco do HUB é o Postgres (ver pg.js); este arquivo só define as pastas.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const ROOT = path.resolve(import.meta.dirname, '../..');

/**
 * Pasta de arquivos locais (anexos em desenvolvimento, chave de criptografia).
 * Na Vercel o disco do projeto é somente leitura e a pasta temporária some a cada execução:
 * os anexos só funcionam de verdade depois da migração para o Supabase Storage.
 */
export const dataDir = process.env.QIMA_DATA_DIR || (process.env.VERCEL ? path.join(os.tmpdir(), 'qima') : path.join(ROOT, 'data'));
fs.mkdirSync(dataDir, { recursive: true });
