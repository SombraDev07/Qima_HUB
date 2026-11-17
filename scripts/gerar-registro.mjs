// Gera modules/registro.js: a lista fixa dos sistemas instalados.
// Roda sozinho antes de "npm run dev", "npm start" e "npm run build".
// Em hospedagem serverless (Vercel) o servidor não pode varrer pastas na partida; com a lista
// fixa o empacotador enxerga cada sistema e um sistema com erro continua isolado dos outros.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIR = path.join(ROOT, 'modules');
const linhas = [];

for (const name of fs.readdirSync(DIR).sort()) {
  if (name.startsWith('_')) continue; // _template etc.
  const manifestPath = path.join(DIR, name, 'module.json');
  if (!fs.existsSync(manifestPath)) continue;
  let manifest;
  let erro = null;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (manifest.key !== name) throw new Error(`"key" do module.json (${manifest.key}) difere da pasta (${name})`);
  } catch (e) {
    erro = String(e.message || e);
    manifest = { key: name, title: name };
  }
  const temServidor = fs.existsSync(path.join(DIR, name, 'server', 'index.js'));
  linhas.push(`  { key: ${JSON.stringify(name)}, manifest: ${JSON.stringify(manifest)}, erro: ${JSON.stringify(erro)}, carregar: ${temServidor ? `() => import('./${name}/server/index.js')` : 'null'} },`);
}

const conteudo = `// GERADO por scripts/gerar-registro.mjs — não edite. Para instalar um sistema, crie a pasta dele em modules/.
export default [
${linhas.join('\n')}
];
`;
const destino = path.join(DIR, 'registro.js');
if (!fs.existsSync(destino) || fs.readFileSync(destino, 'utf8') !== conteudo) {
  fs.writeFileSync(destino, conteudo);
  console.log(`modules/registro.js atualizado (${linhas.length} sistema(s))`);
}
