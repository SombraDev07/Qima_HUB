// Guarda segredos (ex.: chave de API da IA) criptografados no banco.
// A chave de criptografia fica em data/.chave-hub (gerada no primeiro uso) ou em QIMA_SEGREDO.
// Faça backup desse arquivo junto com o banco: sem ele os segredos salvos não abrem.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { dataDir } from '../db.js';

function chaveMestra() {
  if (process.env.QIMA_SEGREDO) return crypto.createHash('sha256').update(process.env.QIMA_SEGREDO).digest();
  const arq = path.join(dataDir, '.chave-hub');
  if (!fs.existsSync(arq)) fs.writeFileSync(arq, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
  return Buffer.from(fs.readFileSync(arq, 'utf8').trim(), 'hex');
}

export function cifrar(texto) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', chaveMestra(), iv);
  const dados = Buffer.concat([c.update(String(texto), 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), dados.toString('base64')].join(':');
}

export function decifrar(guardado) {
  if (!guardado) return '';
  const [v, iv, tag, dados] = String(guardado).split(':');
  if (v !== 'v1') throw new Error('Formato de segredo desconhecido');
  const d = crypto.createDecipheriv('aes-256-gcm', chaveMestra(), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(dados, 'base64')), d.final()]).toString('utf8');
}
