// Caminhos do projeto. O banco do HUB é o Postgres (ver pg.js); este arquivo só define as pastas.
import fs from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(import.meta.dirname, '../..');

/** Pasta de arquivos locais (anexos em desenvolvimento, chave de criptografia). */
export const dataDir = process.env.QIMA_DATA_DIR || path.join(ROOT, 'data');
fs.mkdirSync(dataDir, { recursive: true });
