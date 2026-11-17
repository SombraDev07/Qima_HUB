// Cria/atualiza as tabelas no Postgres apontado por DATABASE_URL (rodar a cada publicação).
//   npm run migrate
// No computador de desenvolvimento isso acontece sozinho na partida do servidor.
import { pg } from '../core/server/pg.js';
import { migrarNucleo } from '../core/server/schema.js';
import registro from '../modules/registro.js';

console.log(`[banco] ${pg.onde}`);
await migrarNucleo();
console.log('núcleo: tabelas conferidas');

for (const item of registro) {
  if (!item.carregar) continue;
  const impl = (await item.carregar()).default || {};
  if (!impl.migrations?.length) continue;
  const feitas = new Set((await pg.all('SELECT version FROM module_migrations WHERE module_key = ?', item.key)).map((r) => r.version));
  for (const m of [...(impl.migrations || [])].sort((x, y) => x.version - y.version).filter((x) => !feitas.has(x.version))) {
    await pg.tx(async (t) => {
      await m.up(t);
      await t.run('INSERT INTO module_migrations (module_key, version) VALUES (?, ?)', item.key, m.version);
    });
    console.log(`${item.key}: migração v${m.version} aplicada`);
  }
}
await pg.fechar();
