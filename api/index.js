// Entrada da API na Vercel: a mesma aplicação Express do servidor local, como função serverless.
// (vercel.json manda tudo que começa com /api para cá; o frontend compilado vem do dist/.)
import app from '../core/server/index.js';

export default app;
