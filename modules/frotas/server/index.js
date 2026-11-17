// Backend do sistema Frotas: pedidos de veículo, aprovação, reserva, ativação (com fotos),
// chamados (manutenção, troca, substituição de condutor, encerramento) e controle mestre.
//
// Banco: Postgres (assíncrono). Dentro de uma transação (rotas com "h") use sempre o "t".
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import migrations from './migrations.js';
import relatorio from './relatorio.js';
import {
  RuleError, isDate, hoje, agora, brDate, txt, esc, codigo, normPlaca, inteiro, dinheiro, lista, nomes, ids, log, logs, pedidoCompleto,
  situacaoChamado, PEDIDO_STATUS, VEICULO_STATUS, CHAMADO_TIPO, CHAMADO_STATUS, CHAMADO_ABERTO, TIPOS_MANUTENCAO, HORAS, ANGULOS,
} from './regras.js';

const MIMES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const MAX_UPLOAD = 12 * 1024 * 1024;
const LISTAS = ['locais', 'categorias', 'modalidades', 'colaboradores'];
const ABERTO_SQL = CHAMADO_ABERTO.map((s) => `'${s}'`).join(','); // constantes deste sistema
// Veículo com o início do contrato (retirada mais antiga com o mesmo código de reserva) já calculado.
const VEICULOS = `SELECT v.*, CASE WHEN v.codigo_reserva IS NOT NULL
    THEN (SELECT MIN(x.data_retirada) FROM frotas_veiculos x WHERE x.codigo_reserva = v.codigo_reserva) ELSE v.data_retirada END AS inicio_contrato
  FROM frotas_veiculos v`;

export default {
  banco: 'postgres',
  migrations,
  relatorio,

  async summary({ db, user, isCentral }) {
    if (isCentral) {
      const r = await db.get(`SELECT (SELECT COUNT(*) FROM frotas_pedidos WHERE status = 'solicitado') AS novos,
        (SELECT COUNT(*) FROM frotas_chamados WHERE status = 'pendente') AS ch,
        (SELECT COUNT(*) FROM frotas_veiculos WHERE status = 'em_uso') AS uso`);
      return `${r.novos} pedido(s) novo(s) · ${r.ch} chamado(s) · ${r.uso} veículo(s) em uso`;
    }
    const r = await db.get(`SELECT (SELECT COUNT(*) FROM frotas_veiculos WHERE responsavel_id = ? AND status = 'em_uso') AS uso,
      (SELECT COUNT(*) FROM frotas_pedidos WHERE solicitante_id = ? AND status IN ('solicitado','aprovado','reservado')) AS ped`, user.id, user.id);
    return `${r.uso} veículo(s) em uso · ${r.ped} pedido(s) em andamento`;
  },

  async notificacoes({ db, user, isCentral, isSolicitante }) {
    const out = [];
    if (isCentral) {
      const r = await db.get(`SELECT
        (SELECT COUNT(*) FROM frotas_pedidos WHERE status = 'solicitado') AS pedidos,
        (SELECT COUNT(*) FROM frotas_chamados WHERE status = 'pendente') AS chamados,
        (SELECT COUNT(*) FROM frotas_pedidos WHERE status = 'aprovado') AS reservar,
        (SELECT COUNT(*) FROM frotas_veiculos WHERE status = 'reservado') AS ativar,
        (SELECT COUNT(*) FROM frotas_chamados WHERE status = 'aprovado' AND tipo <> 'substituicao') AS agendar`);
      out.push({ central: true, qtd: r.pedidos, texto: 'pedido(s) de veículo para aprovar' });
      out.push({ central: true, qtd: r.chamados, texto: 'chamado(s) de frota para aprovar' });
      out.push({ link: 'central/reservas', qtd: r.reservar, texto: 'pedido(s) aprovado(s) aguardando reserva' });
      out.push({ link: 'central/ativar', qtd: r.ativar, texto: 'veículo(s) reservado(s) para ativar' });
      out.push({ link: 'central/chamados', qtd: r.agendar, texto: 'chamado(s) aguardando agendamento' });
    }
    if (isSolicitante) {
      const r = await db.get(`SELECT
        (SELECT COUNT(*) FROM frotas_pedidos WHERE solicitante_id = ? AND status = 'rascunho') AS rascunhos,
        (SELECT COUNT(*) FROM frotas_pedidos WHERE solicitante_id = ? AND status = 'reprovado' AND updated_at >= now() - interval '7 days') AS reprovados,
        (SELECT COUNT(*) FROM frotas_chamados c JOIN frotas_veiculos v ON v.id = c.veiculo_id
          WHERE v.responsavel_id = ? AND c.status IN ('agendado','reprovado')) AS chamados`, user.id, user.id, user.id);
      out.push({ link: 'solicitante', qtd: r.rascunhos, texto: 'pedido(s) de veículo não enviado(s)' });
      out.push({ link: 'solicitante', qtd: r.reprovados, texto: 'pedido(s) de veículo reprovado(s)' });
      out.push({ link: 'solicitante/veiculos', qtd: r.chamados, texto: 'chamado(s) agendado(s) ou respondido(s) — finalize' });
    }
    return out;
  },

  router(r, ctx) {
    const { db, requireRole, notify, usuariosComPerfil, filesDir, files } = ctx;
    const sol = requireRole('solicitante');
    const cen = requireRole('central');
    const isCentral = (req) => ['central', 'ambos'].includes(req.moduleRole);

    function erro(res, err) {
      if (err instanceof RuleError) return res.status(err.status).json({ error: err.message });
      console.error('[frotas]', err);
      if (!res.headersSent) res.status(500).json({ error: 'Erro interno' });
    }
    /** Rota de leitura: fn(req, res) devolve o JSON. */
    const ler = (fn) => async (req, res) => {
      try { const out = await fn(req, res); if (!res.headersSent) res.json(out ?? { ok: true }); } catch (e) { erro(res, e); }
    };
    /** Rota de gravação: fn(req, t) roda inteira numa transação; qualquer erro desfaz tudo. */
    const h = (fn) => async (req, res) => {
      try { const out = await db.tx((t) => fn(req, t)); res.json(out ?? { ok: true }); } catch (e) { erro(res, e); }
    };

    // ------------------------------------------------------------ e-mails (ficam na caixa de saída)
    const mail = (corpo) => `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.6">${corpo}</div>`;
    const paraCentral = async (t, assunto, corpo) => { for (const u of await usuariosComPerfil('central', t)) await notify(u.email, `QIMA Frotas · ${assunto}`, mail(corpo), t); };
    const paraPessoa = (t, email, assunto, corpo) => notify(email, `QIMA Frotas · ${assunto}`, mail(corpo), t);

    // ------------------------------------------------------------ leitura
    const um = async (t, sql, id, msg) => {
      const x = await t.get(sql, Number(id) || 0);
      if (!x) throw new RuleError(msg, 404);
      return x;
    };
    const getPedido = (t, id) => um(t, 'SELECT * FROM frotas_pedidos WHERE id = ?', id, 'Pedido não encontrado');
    const getVeiculo = (t, id) => um(t, `${VEICULOS} WHERE v.id = ?`, id, 'Veículo não encontrado');
    const getChamado = (t, id) => um(t, 'SELECT * FROM frotas_chamados WHERE id = ?', id, 'Chamado não encontrado');
    const chamadoAberto = (t, veiculoId) => t.get(`SELECT * FROM frotas_chamados WHERE veiculo_id = ? AND status IN (${ABERTO_SQL}) ORDER BY id DESC LIMIT 1`, veiculoId);
    const superiores = async (t) => Object.fromEntries((await lista(t, 'colaboradores', { todos: true })).map((c) => [c.nome.toLowerCase(), c.superior]));

    const pedidoView = (p) => ({ ...p, status_label: PEDIDO_STATUS[p.status], completo: pedidoCompleto(p) });
    const chamadoView = (c) => (c ? { ...c, tipo_label: CHAMADO_TIPO[c.tipo], status_label: CHAMADO_STATUS[c.status] } : null);
    /** Lados obrigatórios que ainda não têm foto. */
    const fotosFaltando = async (t, veiculoId) => {
      const feitos = new Set((await t.all('SELECT DISTINCT angulo FROM frotas_fotos WHERE veiculo_id = ?', veiculoId)).map((x) => x.angulo));
      return ANGULOS.filter((a) => !feitos.has(a));
    };
    /** Veículos prontos para a tela: chamado aberto e fotos de todos em 2 consultas (não 3 por veículo). */
    async function veiculosView(t, rows, sup = null) {
      if (!rows.length) return [];
      const lst = ids(rows.map((v) => v.id));
      const abertos = new Map((await t.all(`SELECT DISTINCT ON (veiculo_id) * FROM frotas_chamados
        WHERE veiculo_id IN (${lst}) AND status IN (${ABERTO_SQL}) ORDER BY veiculo_id, id DESC`)).map((c) => [c.veiculo_id, c]));
      const fotos = new Map();
      for (const f of await t.all(`SELECT DISTINCT veiculo_id, angulo FROM frotas_fotos WHERE veiculo_id IN (${lst})`)) {
        if (!fotos.has(f.veiculo_id)) fotos.set(f.veiculo_id, new Set());
        fotos.get(f.veiculo_id).add(f.angulo);
      }
      return rows.map((v) => {
        const c = abertos.get(v.id) || null;
        const feitos = fotos.get(v.id) || new Set();
        const faltando = ANGULOS.filter((a) => !feitos.has(a));
        return {
          ...v, status_label: VEICULO_STATUS[v.status],
          fotos_angulos: ANGULOS.length - faltando.length, fotos_total: ANGULOS.length, fotos_faltando: faltando,
          superior: sup ? (sup[String(v.motorista || '').toLowerCase()] || null) : undefined,
          chamado: chamadoView(c), situacao: situacaoChamado(c, v),
          encerramento: !!c && c.tipo === 'encerramento' && ['aprovado', 'agendado'].includes(c.status),
        };
      });
    }
    /** Um veículo para a tela da central (com o superior do motorista). */
    const veiculoCentral = async (t, id) => (await veiculosView(t, [await getVeiculo(t, id)], await superiores(t)))[0];

    // ------------------------------------------------------------ apoio
    r.get('/config', ler(async () => ({
      locais: await nomes(db, 'locais'), categorias: await nomes(db, 'categorias'), modalidades: await nomes(db, 'modalidades'),
      colaboradores: await nomes(db, 'colaboradores'), tipos_manutencao: TIPOS_MANUTENCAO, horas: HORAS, angulos: ANGULOS,
      pedido_status: PEDIDO_STATUS, veiculo_status: VEICULO_STATUS, chamado_tipo: CHAMADO_TIPO, chamado_status: CHAMADO_STATUS,
    })));

    const podeVerVeiculo = (req, v) => isCentral(req) || v.responsavel_id === req.user.id;
    const veiculoVisivel = async (t, req) => {
      const v = await getVeiculo(t, req.params.id);
      if (!podeVerVeiculo(req, v)) throw new RuleError('Veículo não encontrado', 404);
      return v;
    };

    // ------------------------------------------------------------ fotos do carro
    // TODO(migração): os arquivos ainda ficam em disco local; passam para o Supabase Storage na etapa de arquivos.
    r.get('/veiculos/:id/fotos', ler(async (req) => {
      const v = await veiculoVisivel(db, req);
      // cada placa tem as suas fotos: as das placas anteriores do mesmo contrato não entram
      return db.all('SELECT * FROM frotas_fotos WHERE veiculo_id = ? ORDER BY id DESC', v.id);
    }));

    r.get('/foto/:id', async (req, res) => {
      try {
        const f = await db.get('SELECT f.codigo, f.mime, f.arquivo, v.responsavel_id FROM frotas_fotos f JOIN frotas_veiculos v ON v.id = f.veiculo_id WHERE f.id = ?', Number(req.params.id) || 0);
        if (!f || (!isCentral(req) && f.responsavel_id !== req.user.id)) return res.status(404).json({ error: 'Foto não encontrada' });
        res.setHeader('Content-Type', f.mime);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cache-Control', 'private, max-age=86400');
        if (req.query.download) res.setHeader('Content-Disposition', `attachment; filename="${f.codigo}${MIMES[f.mime] || '.jpg'}"`);
        res.sendFile(path.join(filesDir, f.arquivo));
      } catch (e) { erro(res, e); }
    });

    r.post('/veiculos/:id/fotos', express.raw({ type: () => true, limit: MAX_UPLOAD }), async (req, res) => {
      let arquivo = null;
      try {
        const v = await veiculoVisivel(db, req);
        if (!['reservado', 'em_uso'].includes(v.status)) throw new RuleError('Só dá para fotografar veículo reservado ou em uso.');
        const angulo = String(req.query.angulo || '');
        if (!ANGULOS.includes(angulo)) throw new RuleError('Lado da foto inválido.');
        const lat = Number(req.query.lat); const lon = Number(req.query.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
          throw new RuleError('Sem localização. Libere o GPS do navegador e tire a foto de novo.');
        }
        const mime = String(req.headers['content-type'] || '').split(';')[0];
        if (!MIMES[mime]) throw new RuleError('Envie uma foto (JPG, PNG ou WEBP).');
        if (!req.body?.length) throw new RuleError('Foto vazia.');
        const tirada = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(req.query.tirada_em || '')) ? String(req.query.tirada_em).slice(0, 19).replace('T', ' ') : agora();
        if (Number.isNaN(Date.parse(`${tirada.replace(' ', 'T')}Z`))) throw new RuleError('Data da foto inválida.');
        arquivo = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${MIMES[mime]}`;
        await fs.promises.writeFile(path.join(filesDir, arquivo), req.body);
        const foto = await db.tx(async (t) => {
          const { id } = await t.get(`INSERT INTO frotas_fotos (veiculo_id, angulo, arquivo, mime, tamanho, lat, lon, precisao, tirada_em, autor_id, autor_nome, autor_email)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`, v.id, angulo, arquivo, mime, req.body.length, lat, lon,
          Number.isFinite(Number(req.query.precisao)) && req.query.precisao !== '' && req.query.precisao != null ? Number(req.query.precisao) : null,
          tirada, req.user.id, req.user.name, req.user.email);
          await log(t, { veiculo: v.id }, req.user, 'Foto do carro', `${angulo} · ${lat.toFixed(5)}, ${lon.toFixed(5)}`);
          return t.get('UPDATE frotas_fotos SET codigo = ? WHERE id = ? RETURNING *', codigo('FT', id), id);
        });
        res.status(201).json(foto);
      } catch (e) {
        if (arquivo) fs.rm(path.join(filesDir, arquivo), { force: true }, () => {});
        erro(res, e);
      }
    });

    // ------------------------------------------------------------ operações sobre o veículo (central direto ou ao finalizar chamado)
    function validarKm(v, km) {
      if (km === null) throw new RuleError('Informe o km de devolução.');
      if (v.km_retirada !== null && km < v.km_retirada) throw new RuleError(`O km de devolução (${km}) não pode ser menor que o km de retirada (${v.km_retirada}).`);
    }
    async function emUsoComPlaca(t, placa, exceto = 0) {
      if (await t.get("SELECT 1 FROM frotas_veiculos WHERE placa = ? AND status IN ('reservado','em_uso') AND id <> ? LIMIT 1", placa, exceto)) {
        throw new RuleError(`A placa ${placa} já está em outro veículo ativo da frota.`);
      }
    }
    async function novaLinha(t, v, mudancas) {
      const n = { ...v, ...mudancas };
      const x = await t.get(`INSERT INTO frotas_veiculos (pedido_id, origem_id, responsavel_id, responsavel_nome, codigo_reserva, local, categoria, modalidade,
        valor_contrato, motorista, placa, modelo, cartao, data_retirada, km_retirada, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'em_uso') RETURNING id`,
      v.pedido_id, v.id, v.responsavel_id, v.responsavel_nome, v.codigo_reserva, v.local, v.categoria, v.modalidade, v.valor_contrato,
      n.motorista, n.placa, n.modelo, n.cartao, n.data_retirada, n.km_retirada);
      return x.id;
    }
    async function trocar(t, v, b, user) {
      if (v.status !== 'em_uso') throw new RuleError('Só veículo em uso pode ser trocado.');
      const km = inteiro(b.km_devolucao, 'Km de devolução');
      validarKm(v, km);
      if (!isDate(b.data_devolucao)) throw new RuleError('Informe a data de devolução do veículo atual.');
      const placa = normPlaca(b.placa_nova);
      if (!placa) throw new RuleError('Informe a placa do novo veículo.');
      if (placa === v.placa) throw new RuleError('A nova placa é igual à atual.');
      const modelo = txt(b.modelo_novo, 80);
      if (!modelo) throw new RuleError('Informe o modelo do novo veículo.');
      if (!isDate(b.data_inicio)) throw new RuleError('Informe a data de início do novo veículo.');
      if (b.data_inicio < b.data_devolucao) throw new RuleError('O novo veículo não pode começar antes da devolução do atual.');
      const kmIni = inteiro(b.km_inicial, 'Km inicial');
      if (kmIni === null) throw new RuleError('Informe o km inicial do novo veículo.');
      const motivo = txt(b.motivo, 500);
      if (!motivo) throw new RuleError('Informe o motivo da troca.');
      await emUsoComPlaca(t, placa);
      await t.run("UPDATE frotas_veiculos SET status = 'trocado', km_devolucao = ?, data_devolucao = ?, motivo = ?, updated_at = now() WHERE id = ?", km, b.data_devolucao, motivo, v.id);
      const id = await novaLinha(t, v, { placa, modelo, data_retirada: b.data_inicio, km_retirada: kmIni, cartao: txt(b.cartao, 40) || v.cartao });
      await logs(t, user, [
        [{ veiculo: v.id, pedido: v.pedido_id }, 'Troca de veículo', `${v.placa || '-'} → ${placa} · ${motivo}`],
        [{ veiculo: id, pedido: v.pedido_id }, 'Veículo em uso (troca)', `Placa ${placa}, substitui ${v.placa || '-'}`],
      ]);
      return { id, placa };
    }
    async function substituir(t, v, b, user) {
      if (v.status !== 'em_uso') throw new RuleError('Só veículo em uso pode trocar de condutor.');
      const novo = txt(b.condutor_novo, 120);
      if (!novo) throw new RuleError('Escolha o novo condutor.');
      if (novo.toLowerCase() === String(v.motorista || '').toLowerCase()) throw new RuleError('O novo condutor é o mesmo de hoje.');
      if (!isDate(b.data_saida)) throw new RuleError('Informe a data de saída do condutor atual.');
      if (!isDate(b.data_inicio)) throw new RuleError('Informe a data de início do novo condutor.');
      if (b.data_inicio <= b.data_saida) throw new RuleError('A data de início do novo condutor deve ser depois da saída do atual.');
      const motivo = txt(b.motivo, 500);
      if (!motivo) throw new RuleError('Informe o motivo da substituição.');
      await t.run("UPDATE frotas_veiculos SET status = 'substituido', data_devolucao = ?, motivo = ?, updated_at = now() WHERE id = ?", b.data_saida, motivo, v.id);
      const id = await novaLinha(t, v, { motorista: novo, data_retirada: b.data_inicio, km_retirada: inteiro(b.km_atual, 'Km atual') ?? v.km_retirada });
      await logs(t, user, [
        [{ veiculo: v.id, pedido: v.pedido_id }, 'Substituição de condutor', `${v.motorista || '-'} → ${novo} · ${motivo}`],
        [{ veiculo: id, pedido: v.pedido_id }, 'Veículo em uso (novo condutor)', novo],
      ]);
      return id;
    }
    async function encerrar(t, v, b, user) {
      if (v.status !== 'em_uso') throw new RuleError('Só veículo em uso pode ter o contrato encerrado.');
      const km = inteiro(b.km_devolucao, 'Km de devolução');
      validarKm(v, km);
      if (!isDate(b.data_devolucao)) throw new RuleError('Informe a data de devolução.');
      const motivo = txt(b.motivo, 500);
      if (!motivo) throw new RuleError('Informe o motivo do encerramento.');
      await t.run("UPDATE frotas_veiculos SET status = 'encerrado', km_devolucao = ?, data_devolucao = ?, motivo = ?, updated_at = now() WHERE id = ?", km, b.data_devolucao, motivo, v.id);
      if (v.pedido_id) await t.run("UPDATE frotas_pedidos SET status = 'encerrado', updated_at = now() WHERE id = ?", v.pedido_id);
      // um chamado aberto do veículo perde o sentido
      await t.run(`UPDATE frotas_chamados SET status = 'cancelado', resultado = 'Contrato encerrado', finalizado_at = now(), updated_at = now()
        WHERE veiculo_id = ? AND status IN (${ABERTO_SQL})`, v.id);
      await log(t, { veiculo: v.id, pedido: v.pedido_id }, user, 'Contrato encerrado', `Placa ${v.placa || '-'} · km ${km} · ${motivo}`);
    }

    // ============================================================ SOLICITANTE — pedidos
    r.get('/meus/pedidos', sol, ler(async (req) => (await db.all('SELECT * FROM frotas_pedidos WHERE solicitante_id = ? ORDER BY id DESC', req.user.id)).map(pedidoView)));

    async function lerCampos(t, b, { exigir }) {
      const out = {};
      if ('data_retirada' in b) {
        if (b.data_retirada && !isDate(b.data_retirada)) throw new RuleError('Data de retirada inválida.');
        out.data_retirada = b.data_retirada || null;
      }
      if ('local' in b) {
        if (b.local && !(await nomes(t, 'locais')).includes(b.local)) throw new RuleError('Local de retirada inválido.');
        out.local = b.local || null;
      }
      if ('categoria' in b) {
        if (b.categoria && !(await nomes(t, 'categorias')).includes(b.categoria)) throw new RuleError('Categoria inválida.');
        out.categoria = b.categoria || null;
      }
      if ('motivo' in b) out.motivo = txt(b.motivo, 500);
      if ('motorista' in b) out.motorista = txt(b.motorista, 120);
      if (exigir) {
        if (!out.data_retirada) throw new RuleError('Informe a data de retirada.');
        if (out.data_retirada < hoje()) throw new RuleError('A data de retirada já passou.');
        if (!out.local) throw new RuleError('Escolha o local de retirada.');
        if (!out.categoria) throw new RuleError('Escolha a categoria do veículo.');
      }
      return out; // as chaves são sempre nomes de coluna fixos deste arquivo
    }

    async function avisarNovos(t, user, pedidos) {
      if (!pedidos.length) return;
      const p = pedidos[0];
      await paraCentral(t, `${pedidos.length} pedido(s) de veículo`, `<b>Novo pedido de veículo</b><br><br>Solicitante: ${esc(user.name)}<br>
        Quantidade: ${pedidos.length}<br>Retirada: ${brDate(p.data_retirada)} em ${esc(p.local)}<br>Categoria: ${esc(p.categoria)}<br>
        Pedidos: ${pedidos.map((x) => x.codigo).join(', ')}<br>Motivo: ${esc(p.motivo || '-')}`);
    }

    /** Envia um ou vários pedidos à central: confere todos, grava de uma vez e devolve os pedidos atualizados. */
    async function enviarPedidos(t, pedidos, user) {
      for (const p of pedidos) {
        if (!pedidoCompleto(p)) throw new RuleError(`${p.codigo}: preencha data, local e categoria antes de enviar.`);
        if (p.data_retirada < hoje()) throw new RuleError(`${p.codigo}: a data de retirada já passou.`);
      }
      const enviados = await t.all(`UPDATE frotas_pedidos SET status = 'solicitado', enviado_at = now(), resposta = NULL, updated_at = now()
        WHERE id IN (${ids(pedidos.map((p) => p.id))}) RETURNING *`);
      await logs(t, user, enviados.map((p) => [{ pedido: p.id }, 'Pedido enviado', `${p.local} · ${p.categoria} · ${brDate(p.data_retirada)}`]));
      return enviados.sort((a, b) => a.id - b.id);
    }

    r.post('/meus/pedidos', sol, h(async (req, t) => {
      const b = req.body || {};
      const qtd = Math.round(Number(b.qtd || 1));
      if (!(qtd >= 1 && qtd <= 30)) throw new RuleError('Quantidade inválida: digite um número de 1 a 30.');
      const enviar = !!b.enviar;
      const v = await lerCampos(t, { data_retirada: b.data_retirada, local: b.local, categoria: b.categoria, motivo: b.motivo, motorista: b.motorista }, { exigir: true });
      const lote = `L${Date.now().toString(36)}${crypto.randomBytes(2).toString('hex')}`;
      // o lote inteiro num INSERT só; o motorista informado vale para o primeiro veículo
      const linhas = Array.from({ length: qtd }, (_, i) => [lote, req.user.id, req.user.name, req.user.email, v.data_retirada, v.local, v.categoria, v.motivo, i === 0 ? v.motorista : null]);
      await t.run(`INSERT INTO frotas_pedidos (lote, solicitante_id, solicitante_nome, solicitante_email, data_retirada, local, categoria, motivo, motorista)
        VALUES ${linhas.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ')}`, ...linhas.flat());
      const criados = await t.all("UPDATE frotas_pedidos SET codigo = 'FR-' || lpad(id::text, 5, '0') WHERE lote = ? RETURNING *", lote);
      await logs(t, req.user, criados.map((p) => [{ pedido: p.id }, 'Pedido criado', `Lote de ${qtd}`]));
      if (enviar) await avisarNovos(t, req.user, await enviarPedidos(t, criados, req.user));
      return { criados: criados.length, enviados: enviar ? criados.length : 0 };
    }));

    const meuPedido = async (t, req) => {
      const p = await getPedido(t, req.params.id);
      if (p.solicitante_id !== req.user.id) throw new RuleError('Pedido não encontrado', 404);
      return p;
    };

    r.put('/meus/pedidos/:id', sol, h(async (req, t) => {
      const p = await meuPedido(t, req);
      if (!['rascunho', 'reprovado'].includes(p.status)) throw new RuleError('Este pedido já foi enviado e não pode mais ser alterado.');
      const v = await lerCampos(t, req.body || {}, { exigir: false });
      const sets = Object.keys(v);
      if (!sets.length) return pedidoView(p);
      return pedidoView(await t.get(`UPDATE frotas_pedidos SET ${sets.map((k) => `${k} = ?`).join(', ')}, status = 'rascunho', updated_at = now() WHERE id = ? RETURNING *`, ...sets.map((k) => v[k]), p.id));
    }));

    r.post('/meus/pedidos/:id/enviar', sol, h(async (req, t) => {
      const p = await meuPedido(t, req);
      if (!['rascunho', 'reprovado'].includes(p.status)) throw new RuleError('Este pedido já foi enviado.');
      const enviados = await enviarPedidos(t, [p], req.user);
      await avisarNovos(t, req.user, enviados);
      return pedidoView(enviados[0]);
    }));

    r.post('/meus/pedidos/enviar-todos', sol, h(async (req, t) => {
      const prontos = (await t.all("SELECT * FROM frotas_pedidos WHERE solicitante_id = ? AND status = 'rascunho' ORDER BY id", req.user.id)).filter(pedidoCompleto);
      if (!prontos.length) throw new RuleError('Nenhum rascunho completo para enviar.');
      const enviados = await enviarPedidos(t, prontos, req.user);
      await avisarNovos(t, req.user, enviados);
      return { enviados: enviados.length };
    }));

    const apagarPedidos = async (t, lst) => {
      await t.run(`DELETE FROM frotas_historico WHERE pedido_id IN (${lst})`);
      await t.run(`DELETE FROM frotas_pedidos WHERE id IN (${lst})`);
    };

    r.delete('/meus/pedidos/reprovados', sol, h(async (req, t) => {
      const lst = (await t.all("SELECT id FROM frotas_pedidos WHERE solicitante_id = ? AND status = 'reprovado'", req.user.id)).map((x) => x.id);
      if (lst.length) await apagarPedidos(t, ids(lst));
      return { excluidos: lst.length };
    }));

    r.delete('/meus/pedidos/:id', sol, h(async (req, t) => {
      const p = await meuPedido(t, req);
      if (!['rascunho', 'solicitado', 'reprovado'].includes(p.status)) throw new RuleError('Pedido aprovado ou reservado não pode ser excluído. Fale com a central.');
      await apagarPedidos(t, ids([p.id]));
    }));

    // ============================================================ SOLICITANTE — veículos e chamados
    r.get('/meus/veiculos', sol, ler(async (req) => veiculosView(db,
      await db.all(`${VEICULOS} WHERE v.responsavel_id = ? AND v.status IN ('reservado','em_uso') ORDER BY v.status DESC, v.updated_at DESC, v.id DESC`, req.user.id))));

    r.get('/meus/chamados', sol, ler(async (req) => (await db.all(`SELECT c.* FROM frotas_chamados c JOIN frotas_veiculos v ON v.id = c.veiculo_id
      WHERE v.responsavel_id = ? OR c.solicitante_id = ? ORDER BY c.id DESC LIMIT 200`, req.user.id, req.user.id)).map(chamadoView)));

    r.post('/meus/veiculos/:id/chamados', sol, h(async (req, t) => {
      const v = await getVeiculo(t, req.params.id);
      if (v.responsavel_id !== req.user.id) throw new RuleError('Veículo não encontrado', 404);
      if (v.status !== 'em_uso') throw new RuleError('Só veículo em uso pode abrir chamado.');
      if (await chamadoAberto(t, v.id)) throw new RuleError('Este veículo já tem um chamado em andamento. Finalize-o antes de abrir outro.');
      const b = req.body || {};
      const tipo = String(b.tipo || '');
      if (!CHAMADO_TIPO[tipo]) throw new RuleError('Tipo de chamado inválido.');
      const motivo = txt(b.motivo, 1000);
      if (!motivo) throw new RuleError(tipo === 'manutencao' ? 'Descreva o problema.' : 'Informe o motivo.');
      const c = { tipo_manutencao: null, condutor_novo: null, data_saida_condutor: null, data_inicio_nova: null, data_devolucao: null, km_devolucao: null, local_servico: null };
      if (tipo === 'manutencao') {
        if (!TIPOS_MANUTENCAO.includes(b.tipo_manutencao)) throw new RuleError('Escolha o tipo de manutenção.');
        c.tipo_manutencao = b.tipo_manutencao;
      } else if (tipo === 'troca') {
        if (!isDate(b.data_inicio_nova)) throw new RuleError('Informe a data desejada para a troca.');
        c.data_inicio_nova = b.data_inicio_nova;
        c.local_servico = txt(b.local_servico, 200);
        if (!c.local_servico) throw new RuleError('Informe onde o veículo está / onde prefere fazer a troca.');
      } else if (tipo === 'substituicao') {
        c.condutor_novo = txt(b.condutor_novo, 120);
        if (!c.condutor_novo) throw new RuleError('Escolha o novo condutor.');
        if (c.condutor_novo.toLowerCase() === String(v.motorista || '').toLowerCase()) throw new RuleError('O novo condutor é o mesmo de hoje.');
        if (!isDate(b.data_saida_condutor) || !isDate(b.data_inicio_nova)) throw new RuleError('Informe a saída do condutor atual e o início do novo.');
        if (b.data_inicio_nova <= b.data_saida_condutor) throw new RuleError('A data de início do novo motorista deve ser posterior à data de saída do motorista atual.');
        c.data_saida_condutor = b.data_saida_condutor; c.data_inicio_nova = b.data_inicio_nova;
      } else if (tipo === 'encerramento') {
        c.km_devolucao = inteiro(b.km_devolucao, 'Km de devolução');
        validarKm(v, c.km_devolucao);
        if (!isDate(b.data_devolucao)) throw new RuleError('Informe a data prevista de devolução.');
        c.data_devolucao = b.data_devolucao;
      }
      const { id } = await t.get(`INSERT INTO frotas_chamados (veiculo_id, tipo, solicitante_id, solicitante_nome, solicitante_email, placa, modelo, motorista, motivo,
        tipo_manutencao, condutor_novo, data_saida_condutor, data_inicio_nova, data_devolucao, km_devolucao, local_servico)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`, v.id, tipo, req.user.id, req.user.name, req.user.email, v.placa, v.modelo, v.motorista, motivo,
      c.tipo_manutencao, c.condutor_novo, c.data_saida_condutor, c.data_inicio_nova, c.data_devolucao, c.km_devolucao, c.local_servico);
      const novo = await t.get('UPDATE frotas_chamados SET codigo = ? WHERE id = ? RETURNING *', codigo('CH', id), id);
      await log(t, { veiculo: v.id, chamado: id }, req.user, `Chamado aberto: ${CHAMADO_TIPO[tipo]}`, motivo);
      await paraCentral(t, `Chamado ${novo.codigo} · ${CHAMADO_TIPO[tipo]}`, `<b>${CHAMADO_TIPO[tipo]}</b> aguardando aprovação<br><br>
        Veículo: ${esc(v.modelo || '-')} · ${esc(v.placa || '-')}<br>Motorista: ${esc(v.motorista || '-')}<br>Solicitante: ${esc(req.user.name)}<br>Motivo: ${esc(motivo)}`);
      return chamadoView(novo);
    }));

    const meuChamado = async (t, req) => {
      const c = await getChamado(t, req.params.id);
      const v = await getVeiculo(t, c.veiculo_id);
      if (v.responsavel_id !== req.user.id && c.solicitante_id !== req.user.id) throw new RuleError('Chamado não encontrado', 404);
      return { c, v };
    };
    const fecharChamado = (t, id, status, resultado) => t.run('UPDATE frotas_chamados SET status = ?, resultado = ?, finalizado_at = now(), updated_at = now() WHERE id = ?', status, resultado, id);

    // Cancelar: chamado ainda pendente, ou substituição liberada que não vai mais acontecer
    r.post('/meus/chamados/:id/cancelar', sol, h(async (req, t) => {
      const { c, v } = await meuChamado(t, req);
      if (!['pendente', 'aprovado', 'agendado'].includes(c.status)) throw new RuleError('Este chamado não pode mais ser cancelado.');
      await fecharChamado(t, c.id, 'cancelado', 'Cancelado pelo solicitante');
      await log(t, { veiculo: v.id, chamado: c.id }, req.user, 'Chamado cancelado', CHAMADO_TIPO[c.tipo]);
    }));

    // Finalizar: depois do agendamento (ou ciente de reprovação)
    r.post('/meus/chamados/:id/finalizar', sol, h(async (req, t) => {
      const { c, v } = await meuChamado(t, req);
      const b = req.body || {};
      const fechar = async (resultado) => {
        await fecharChamado(t, c.id, 'finalizado', resultado);
        await log(t, { veiculo: v.id, chamado: c.id }, req.user, `Chamado finalizado: ${CHAMADO_TIPO[c.tipo]}`, resultado);
      };
      if (c.status === 'reprovado') { await fechar('Reprovado — ciente'); return { resultado: 'Chamado encerrado.' }; }
      if (c.status !== 'agendado') throw new RuleError('O chamado ainda não foi liberado pela central.');
      if (c.tipo === 'manutencao') { await fechar('Manutenção realizada'); return { resultado: 'Manutenção finalizada.' }; }
      if (c.tipo === 'substituicao') {
        const novo = await substituir(t, v, { condutor_novo: c.condutor_novo, data_saida: c.data_saida_condutor, data_inicio: c.data_inicio_nova, motivo: c.motivo, km_atual: b.km_atual }, req.user);
        await fechar(`Novo condutor: ${c.condutor_novo}`);
        return { resultado: `Condutor substituído. Novo condutor: ${c.condutor_novo}.`, veiculo_id: novo };
      }
      if (c.tipo === 'troca') {
        const novo = await trocar(t, v, { ...b, motivo: c.motivo }, req.user);
        await fechar(`Nova placa ${novo.placa}`);
        return { resultado: `Troca registrada: nova placa ${novo.placa}.`, veiculo_id: novo.id };
      }
      // encerramento
      if (c.placa_devolucao && c.placa_devolucao !== v.placa) {
        await fecharChamado(t, c.id, 'cancelado', `Devolução não permitida: devolver a placa ${c.placa_devolucao}`);
        await log(t, { veiculo: v.id, chamado: c.id }, req.user, 'Devolução não permitida', `Central indicou a placa ${c.placa_devolucao}`);
        return { resultado: `Devolução não permitida. Por motivos administrativos devolva a placa ${c.placa_devolucao}.`, aviso: true };
      }
      await encerrar(t, v, { km_devolucao: b.km_devolucao ?? c.km_devolucao, data_devolucao: b.data_devolucao || c.data_servico || c.data_devolucao, motivo: c.motivo }, req.user);
      await fecharChamado(t, c.id, 'finalizado', 'Veículo devolvido');
      return { resultado: `Veículo devolvido e contrato encerrado. Placa ${v.placa}.` };
    }));

    // ============================================================ CENTRAL — aprovações
    r.get('/central/aprovacoes', cen, ler(async () => {
      const pedidos = await db.all("SELECT * FROM frotas_pedidos WHERE status = 'solicitado' ORDER BY enviado_at DESC, id DESC");
      const lotes = [];
      const porChave = {};
      for (const p of pedidos) {
        const k = `${p.lote}|${p.local}|${p.categoria}|${p.data_retirada}`;
        if (!porChave[k]) { porChave[k] = { chave: k, lote: p.lote, local: p.local, categoria: p.categoria, data_retirada: p.data_retirada, solicitante_nome: p.solicitante_nome, enviado_at: p.enviado_at, motivo: p.motivo, pedidos: [] }; lotes.push(porChave[k]); }
        porChave[k].pedidos.push(pedidoView(p));
      }
      const chamados = (await db.all("SELECT c.*, v.codigo_reserva, v.local FROM frotas_chamados c JOIN frotas_veiculos v ON v.id = c.veiculo_id WHERE c.status = 'pendente' ORDER BY c.id DESC")).map(chamadoView);
      return { lotes, chamados };
    }));

    /** Aprova ou reprova, de uma vez, os pedidos selecionados que ainda estão "solicitado". */
    async function analisar(t, req, status, motivo = null) {
      const sel = (req.body?.ids || []).map(Number);
      if (!sel.length) throw new RuleError('Nenhum pedido selecionado.');
      const ok = await t.all(`UPDATE frotas_pedidos SET status = ?, resposta = COALESCE(?, resposta), analisado_at = now(), analisado_por = ?, updated_at = now()
        WHERE id IN (${ids(sel)}) AND status = 'solicitado' RETURNING id, codigo, solicitante_email`, status, motivo, req.user.name);
      ok.sort((a, b) => a.id - b.id);
      await logs(t, req.user, ok.map((p) => [{ pedido: p.id }, status === 'aprovado' ? 'Pedido aprovado' : 'Pedido reprovado', motivo]));
      return ok;
    }

    r.post('/central/pedidos/aprovar', cen, h(async (req, t) => {
      const ok = await analisar(t, req, 'aprovado');
      if (ok[0]) await paraPessoa(t, ok[0].solicitante_email, 'Pedido de veículo aprovado', `Seu pedido de veículo foi <b>aprovado</b> (${ok.map((p) => p.codigo).join(', ')}).<br>A central vai fazer a reserva com a locadora.`);
      return { aprovados: ok.length };
    }));

    r.post('/central/pedidos/reprovar', cen, h(async (req, t) => {
      const motivo = txt(req.body?.motivo, 500);
      if (!(req.body?.ids || []).length) throw new RuleError('Nenhum pedido selecionado.');
      if (!motivo) throw new RuleError('Informe o motivo da reprovação.');
      const ok = await analisar(t, req, 'reprovado', motivo);
      if (ok[0]) await paraPessoa(t, ok[0].solicitante_email, 'Pedido de veículo reprovado', `Seu pedido de veículo foi <b>reprovado</b> (${ok.map((p) => p.codigo).join(', ')}).<br>Motivo: ${esc(motivo)}`);
      return { reprovados: ok.length };
    }));

    const chamadoPendente = async (t, id) => {
      const c = await getChamado(t, id);
      if (c.status !== 'pendente') throw new RuleError('Este chamado já foi analisado.');
      return c;
    };

    r.post('/central/chamados/:id/aprovar', cen, h(async (req, t) => {
      const c = await chamadoPendente(t, req.params.id);
      // substituição de condutor não precisa de agendamento com a locadora: já fica liberada
      const liberado = c.tipo === 'substituicao';
      const novo = await t.get(`UPDATE frotas_chamados SET status = ?, analisado_at = now(), agendado_at = ${liberado ? 'now()' : 'NULL'}, updated_at = now() WHERE id = ? RETURNING *`,
        liberado ? 'agendado' : 'aprovado', c.id);
      await log(t, { veiculo: c.veiculo_id, chamado: c.id }, req.user, 'Chamado aprovado', CHAMADO_TIPO[c.tipo]);
      await paraPessoa(t, c.solicitante_email, `Chamado ${c.codigo} aprovado`, `Seu chamado de <b>${CHAMADO_TIPO[c.tipo]}</b> (placa ${esc(c.placa || '-')}) foi aprovado.<br>
        ${liberado ? 'Faça a troca de condutor e finalize o chamado no HUB.' : 'A central vai agendar com a locadora.'}`);
      return chamadoView(novo);
    }));

    r.post('/central/chamados/:id/reprovar', cen, h(async (req, t) => {
      const c = await chamadoPendente(t, req.params.id);
      const motivo = txt(req.body?.motivo, 500);
      if (!motivo) throw new RuleError('Informe o motivo da reprovação.');
      const novo = await t.get("UPDATE frotas_chamados SET status = 'reprovado', resposta = ?, analisado_at = now(), updated_at = now() WHERE id = ? RETURNING *", motivo, c.id);
      await log(t, { veiculo: c.veiculo_id, chamado: c.id }, req.user, 'Chamado reprovado', motivo);
      await paraPessoa(t, c.solicitante_email, `Chamado ${c.codigo} reprovado`, `Seu chamado de <b>${CHAMADO_TIPO[c.tipo]}</b> (placa ${esc(c.placa || '-')}) foi reprovado.<br>Motivo: ${esc(motivo)}`);
      return chamadoView(novo);
    }));

    // ============================================================ CENTRAL — reservas (pedidos aprovados)
    r.get('/central/reservas', cen, ler(async () => (await db.all(`SELECT p.*, v.id AS veiculo_id, v.codigo_reserva, v.modalidade, v.valor_contrato
      FROM frotas_pedidos p LEFT JOIN frotas_veiculos v ON v.pedido_id = p.id AND v.origem_id IS NULL
      WHERE p.status IN ('aprovado','reservado') ORDER BY p.status, p.data_retirada, p.id`)).map(pedidoView)));

    r.post('/central/pedidos/:id/reservar', cen, h(async (req, t) => {
      const p = await getPedido(t, req.params.id);
      if (!['aprovado', 'reservado'].includes(p.status)) throw new RuleError('Só pedido aprovado pode ser reservado.');
      const b = req.body || {};
      const cod = txt(b.codigo_reserva, 60);
      if (!cod) throw new RuleError('Informe o código da reserva.');
      if (!(await nomes(t, 'modalidades')).includes(b.modalidade)) throw new RuleError('Escolha a modalidade da locação.');
      const valor = dinheiro(b.valor_contrato);
      if (valor === null) throw new RuleError('Informe o valor do contrato.');
      const campos = await lerCampos(t, { data_retirada: b.data_retirada ?? p.data_retirada, local: b.local ?? p.local, categoria: b.categoria ?? p.categoria, motorista: b.motorista ?? p.motorista, motivo: b.motivo ?? p.motivo }, { exigir: false });
      if (!campos.data_retirada || !campos.local || !campos.categoria) throw new RuleError('Data, local e categoria são obrigatórios.');
      if (await t.get('SELECT 1 FROM frotas_veiculos WHERE codigo_reserva = ? AND pedido_id <> ? LIMIT 1', cod, p.id)) throw new RuleError(`O código de reserva ${cod} já está em outro pedido.`);
      await t.run("UPDATE frotas_pedidos SET data_retirada = ?, local = ?, categoria = ?, motorista = ?, motivo = ?, status = 'reservado', updated_at = now() WHERE id = ?",
        campos.data_retirada, campos.local, campos.categoria, campos.motorista, campos.motivo, p.id);
      const v = await t.get('SELECT id, status FROM frotas_veiculos WHERE pedido_id = ? AND origem_id IS NULL', p.id);
      if (v) {
        if (v.status !== 'reservado') throw new RuleError('O veículo deste pedido já foi ativado. Altere pelo Controle mestre.');
        await t.run('UPDATE frotas_veiculos SET codigo_reserva = ?, modalidade = ?, valor_contrato = ?, local = ?, categoria = ?, motorista = ?, data_retirada = ?, updated_at = now() WHERE id = ?',
          cod, b.modalidade, valor, campos.local, campos.categoria, campos.motorista, campos.data_retirada, v.id);
        await log(t, { pedido: p.id, veiculo: v.id }, req.user, 'Reserva alterada', `${cod} · ${b.modalidade} · R$ ${valor}`);
        return { veiculo_id: v.id };
      }
      const { id: vid } = await t.get(`INSERT INTO frotas_veiculos (pedido_id, responsavel_id, responsavel_nome, codigo_reserva, local, categoria, modalidade, valor_contrato, motorista, data_retirada, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'reservado') RETURNING id`, p.id, p.solicitante_id, p.solicitante_nome, cod, campos.local, campos.categoria, b.modalidade, valor, campos.motorista, campos.data_retirada);
      await log(t, { pedido: p.id, veiculo: vid }, req.user, 'Reserva registrada', `${cod} · ${b.modalidade} · R$ ${valor}`);
      await paraPessoa(t, p.solicitante_email, `Veículo reservado (${p.codigo})`, `Seu veículo foi <b>reservado</b>.<br><br>Reserva: ${esc(cod)}<br>Retirada: ${brDate(campos.data_retirada)} em ${esc(campos.local)}<br>Categoria: ${esc(campos.categoria)}`);
      return { veiculo_id: vid };
    }));

    // ============================================================ CENTRAL — ativação e controle mestre
    r.get('/central/veiculos', cen, ler(async (req) => {
      const st = String(req.query.status || '');
      const rows = st && VEICULO_STATUS[st] ? await db.all(`${VEICULOS} WHERE v.status = ? ORDER BY v.id DESC`, st) : await db.all(`${VEICULOS} ORDER BY v.id DESC`);
      return veiculosView(db, rows, await superiores(db));
    }));

    const EDITAVEIS = ['codigo_reserva', 'local', 'categoria', 'modalidade', 'valor_contrato', 'motorista', 'placa', 'modelo', 'cartao', 'data_retirada', 'km_retirada', 'data_devolucao', 'km_devolucao'];
    async function lerVeiculo(t, b, v) {
      const out = {};
      for (const k of EDITAVEIS) {
        if (!(k in b)) continue;
        const val = b[k];
        if (k === 'placa') { out.placa = normPlaca(val); if (out.placa) await emUsoComPlaca(t, out.placa, v.id); continue; }
        if (k === 'valor_contrato') { out[k] = dinheiro(val); continue; }
        if (k === 'km_retirada' || k === 'km_devolucao') { out[k] = inteiro(val, k === 'km_retirada' ? 'Km de retirada' : 'Km de devolução'); continue; }
        if (k.startsWith('data_')) { if (val && !isDate(val)) throw new RuleError('Data inválida.'); out[k] = val || null; continue; }
        if (k === 'local' && val && !(await nomes(t, 'locais')).includes(val)) throw new RuleError('Local inválido.');
        if (k === 'categoria' && val && !(await nomes(t, 'categorias')).includes(val)) throw new RuleError('Categoria inválida.');
        if (k === 'modalidade' && val && !(await nomes(t, 'modalidades')).includes(val)) throw new RuleError('Modalidade inválida.');
        out[k] = txt(val, k === 'codigo_reserva' ? 60 : 120);
      }
      const kmR = 'km_retirada' in out ? out.km_retirada : v.km_retirada;
      const kmD = 'km_devolucao' in out ? out.km_devolucao : v.km_devolucao;
      if (kmR !== null && kmD !== null && kmD < kmR) throw new RuleError('O km de devolução não pode ser menor que o km de retirada.');
      return out; // as chaves vêm só de EDITAVEIS (nomes de coluna fixos)
    }

    r.put('/central/veiculos/:id', cen, h(async (req, t) => {
      const v = await getVeiculo(t, req.params.id);
      const b = req.body || {};
      const m = await lerVeiculo(t, b, v);
      if (b.status && b.status !== v.status) {
        if (!VEICULO_STATUS[b.status]) throw new RuleError('Status inválido.');
        m.status = b.status;
      }
      const sets = Object.keys(m);
      if (sets.length) {
        await t.run(`UPDATE frotas_veiculos SET ${sets.map((k) => `${k} = ?`).join(', ')}, updated_at = now() WHERE id = ?`, ...sets.map((k) => m[k]), v.id);
        await log(t, { veiculo: v.id, pedido: v.pedido_id }, req.user, 'Veículo editado', sets.map((k) => `${k}: ${v[k] ?? '-'} → ${m[k] ?? '-'}`).join(' · ').slice(0, 900));
      }
      return veiculoCentral(t, v.id);
    }));

    r.post('/central/veiculos/:id/ativar', cen, h(async (req, t) => {
      const v = await getVeiculo(t, req.params.id);
      if (v.status !== 'reservado') throw new RuleError('Só veículo reservado pode ser ativado.');
      const m = { ...v, ...(await lerVeiculo(t, req.body || {}, v)) };
      const falta = [!m.motorista && 'motorista', !m.cartao && 'cartão de abastecimento', !isDate(m.data_retirada) && 'data de retirada',
        !m.placa && 'placa', m.km_retirada === null && 'km de retirada', !m.modelo && 'modelo'].filter(Boolean);
      if (falta.length) throw new RuleError(`Preencha: ${falta.join(', ')}.`);
      const semFoto = await fotosFaltando(t, v.id);
      if (semFoto.length) throw new RuleError(`Faltam fotos do carro: ${semFoto.join(', ')}. Tire todas antes de ativar.`);
      await t.run("UPDATE frotas_veiculos SET motorista = ?, cartao = ?, data_retirada = ?, placa = ?, km_retirada = ?, modelo = ?, status = 'em_uso', updated_at = now() WHERE id = ?",
        m.motorista, m.cartao, m.data_retirada, m.placa, m.km_retirada, m.modelo, v.id);
      await log(t, { veiculo: v.id, pedido: v.pedido_id }, req.user, 'Veículo ativado', `${m.modelo} · ${m.placa} · ${m.motorista} · km ${m.km_retirada}`);
      if (v.pedido_id) {
        const p = await t.get("UPDATE frotas_pedidos SET status = 'em_uso', data_retirada = ?, motorista = ?, updated_at = now() WHERE id = ? RETURNING codigo, solicitante_email", m.data_retirada, m.motorista, v.pedido_id);
        if (p) await paraPessoa(t, p.solicitante_email, `Veículo liberado (${m.placa})`, `O veículo do pedido ${p.codigo} está <b>em uso</b>.<br><br>Modelo: ${esc(m.modelo)}<br>Placa: ${esc(m.placa)}<br>Motorista: ${esc(m.motorista)}`);
      }
      return veiculoCentral(t, v.id);
    }));

    const semChamado = async (t, req) => {
      const v = await getVeiculo(t, req.params.id);
      if (await chamadoAberto(t, v.id)) throw new RuleError('Este veículo tem um chamado em andamento. Resolva o chamado primeiro.');
      return v;
    };
    r.post('/central/veiculos/:id/troca', cen, h(async (req, t) => {
      const novo = await trocar(t, await semChamado(t, req), req.body || {}, req.user);
      return { veiculo_id: novo.id, placa: novo.placa };
    }));
    r.post('/central/veiculos/:id/substituir', cen, h(async (req, t) => ({ veiculo_id: await substituir(t, await semChamado(t, req), req.body || {}, req.user) })));
    r.post('/central/veiculos/:id/encerrar', cen, h(async (req, t) => { await encerrar(t, await getVeiculo(t, req.params.id), req.body || {}, req.user); }));

    r.get('/central/veiculos/:id/historico', cen, ler(async (req) => {
      const v = await getVeiculo(db, req.params.id);
      // contrato inteiro: sobe até a primeira linha e desce por todas as placas/condutores ligados (uma consulta)
      const contrato = ids((await db.all(`WITH RECURSIVE
          acima AS (SELECT id, origem_id FROM frotas_veiculos WHERE id = ?
                    UNION ALL SELECT v.id, v.origem_id FROM frotas_veiculos v JOIN acima a ON v.id = a.origem_id),
          arvore AS (SELECT id FROM acima WHERE origem_id IS NULL
                     UNION ALL SELECT v.id FROM frotas_veiculos v JOIN arvore a ON v.origem_id = a.id)
        SELECT id FROM arvore`, v.id)).map((x) => x.id));
      return {
        veiculos: (await db.all(`SELECT * FROM frotas_veiculos WHERE id IN (${contrato}) ORDER BY id`)).map((x) => ({ ...x, status_label: VEICULO_STATUS[x.status] })),
        historico: await db.all(`SELECT * FROM frotas_historico WHERE veiculo_id IN (${contrato}) OR (pedido_id IS NOT NULL AND pedido_id = ?) ORDER BY id DESC`, v.pedido_id ?? -1),
        chamados: (await db.all(`SELECT * FROM frotas_chamados WHERE veiculo_id IN (${contrato}) ORDER BY id DESC`)).map(chamadoView),
      };
    }));

    // ============================================================ CENTRAL — chamados aprovados (agendar)
    r.get('/central/chamados', cen, ler(async (req) => {
      const filtro = req.query.todos === '1' ? 'TRUE' : "c.status IN ('aprovado','agendado') AND c.tipo <> 'substituicao'";
      return (await db.all(`SELECT c.*, v.codigo_reserva, v.local, v.modalidade, v.categoria, v.inicio_contrato
        FROM frotas_chamados c JOIN (${VEICULOS}) v ON v.id = c.veiculo_id WHERE ${filtro} ORDER BY c.id DESC LIMIT 500`)).map(chamadoView);
    }));

    r.post('/central/chamados/:id/agendar', cen, h(async (req, t) => {
      const c = await getChamado(t, req.params.id);
      if (!['aprovado', 'agendado'].includes(c.status)) throw new RuleError('Só chamado aprovado pode ser agendado.');
      if (c.tipo === 'substituicao') throw new RuleError('Substituição de condutor não precisa de agendamento.');
      const b = req.body || {};
      if (!isDate(b.data_servico)) throw new RuleError('Informe a data.');
      const local = txt(b.local_servico, 200);
      if (!local) throw new RuleError('Informe o local.');
      let hora = null;
      if (c.tipo === 'manutencao') {
        if (!HORAS.includes(b.hora_servico)) throw new RuleError('Escolha o horário.');
        hora = b.hora_servico;
      }
      let placaDev = null;
      if (c.tipo === 'encerramento') {
        placaDev = normPlaca(b.placa_devolucao || c.placa);
        if (!placaDev) throw new RuleError('Informe a placa a devolver.');
      }
      const novo = await t.get("UPDATE frotas_chamados SET status = 'agendado', data_servico = ?, hora_servico = ?, local_servico = ?, placa_devolucao = ?, agendado_at = now(), updated_at = now() WHERE id = ? RETURNING *",
        b.data_servico, hora, local, placaDev, c.id);
      await log(t, { veiculo: c.veiculo_id, chamado: c.id }, req.user, 'Chamado agendado', `${brDate(b.data_servico)}${hora ? ` ${hora}` : ''} · ${local}${placaDev ? ` · devolver ${placaDev}` : ''}`);
      await paraPessoa(t, c.solicitante_email, `Chamado ${c.codigo} agendado`, `Seu chamado de <b>${CHAMADO_TIPO[c.tipo]}</b> foi agendado.<br><br>
        Data: ${brDate(b.data_servico)}${hora ? ` às ${hora}` : ''}<br>Local: ${esc(local)}${placaDev ? `<br>Placa a devolver: ${placaDev}` : ''}<br><br>Depois de concluir, finalize o chamado no HUB.`);
      return chamadoView(novo);
    }));

    // ============================================================ CENTRAL — configurações
    const tabelaDe = (req) => {
      if (!LISTAS.includes(req.params.tabela)) throw new RuleError('Lista inválida.', 404);
      return `frotas_${req.params.tabela}`; // nome fixo conferido em LISTAS
    };
    r.get('/central/listas', cen, ler(async () => Object.fromEntries(await Promise.all(LISTAS.map(async (x) => [x, await lista(db, x, { todos: true })])))));
    r.post('/central/listas/:tabela', cen, h(async (req, t) => {
      const tab = tabelaDe(req);
      const nome = txt(req.body?.nome, 120);
      if (!nome) throw new RuleError('Informe o nome.');
      if (await t.get(`SELECT 1 FROM ${tab} WHERE lower(nome) = lower(?)`, nome)) throw new RuleError(`"${nome}" já está na lista.`);
      if (tab === 'frotas_colaboradores') await t.run('INSERT INTO frotas_colaboradores (nome, superior) VALUES (?, ?)', nome, txt(req.body?.superior, 120));
      else await t.run(`INSERT INTO ${tab} (nome) VALUES (?)`, nome);
    }));
    r.put('/central/listas/:tabela/:id', cen, h(async (req, t) => {
      const tab = tabelaDe(req);
      const atual = await um(t, `SELECT * FROM ${tab} WHERE id = ?`, req.params.id, 'Item não encontrado.');
      const b = req.body || {};
      const nome = 'nome' in b ? txt(b.nome, 120) : atual.nome;
      if (!nome) throw new RuleError('Informe o nome.');
      if (await t.get(`SELECT 1 FROM ${tab} WHERE lower(nome) = lower(?) AND id <> ?`, nome, atual.id)) throw new RuleError(`"${nome}" já está na lista.`);
      const ativo = 'ativo' in b ? !!b.ativo : atual.ativo;
      if (tab === 'frotas_colaboradores') await t.run('UPDATE frotas_colaboradores SET nome = ?, superior = ?, ativo = ? WHERE id = ?', nome, 'superior' in b ? txt(b.superior, 120) : atual.superior, ativo, atual.id);
      else await t.run(`UPDATE ${tab} SET nome = ?, ativo = ? WHERE id = ?`, nome, ativo, atual.id);
    }));

    // ============================================================ relatório Excel
    r.get('/central/exportar', cen, ler(async (_req, res) => {
      const veic = await veiculosView(db, await db.all(`${VEICULOS} ORDER BY v.id`), await superiores(db));
      const pedidos = await db.all("SELECT * FROM frotas_pedidos WHERE status <> 'rascunho' ORDER BY id");
      const chamados = await db.all('SELECT * FROM frotas_chamados ORDER BY id');
      const xlsx = files.xlsx([
        { name: 'Veículos', columns: [{ label: 'ID', width: 6 }, { label: 'Reserva', width: 14 }, { label: 'Status', width: 12 }, { label: 'Placa', width: 10 }, { label: 'Modelo', width: 18 },
          { label: 'Motorista', width: 24 }, { label: 'Superior', width: 22 }, { label: 'Responsável', width: 22 }, { label: 'Local', width: 14 }, { label: 'Categoria', width: 9 },
          { label: 'Modalidade', width: 10 }, { label: 'Valor contrato', type: 'money' }, { label: 'Cartão', width: 12 }, { label: 'Início contrato', type: 'date' },
          { label: 'Retirada', type: 'date' }, { label: 'Km retirada', width: 10 }, { label: 'Devolução', type: 'date' }, { label: 'Km devolução', width: 10 },
          { label: 'Km rodado', width: 10 }, { label: 'Chamado aberto', width: 26 }, { label: 'Motivo', width: 36 }],
          rows: veic.map((v) => [v.id, v.codigo_reserva, v.status_label, v.placa, v.modelo, v.motorista, v.superior, v.responsavel_nome, v.local, v.categoria, v.modalidade,
            v.valor_contrato, v.cartao, v.inicio_contrato, v.data_retirada, v.km_retirada, v.data_devolucao, v.km_devolucao,
            v.km_devolucao !== null && v.km_retirada !== null ? v.km_devolucao - v.km_retirada : null,
            v.chamado ? `${v.chamado.tipo_label} · ${v.chamado.status_label}` : '', v.motivo]) },
        { name: 'Pedidos', columns: [{ label: 'Pedido', width: 10 }, { label: 'Solicitante', width: 24 }, { label: 'Status', width: 12 }, { label: 'Retirada', type: 'date' },
          { label: 'Local', width: 14 }, { label: 'Categoria', width: 9 }, { label: 'Motorista', width: 24 }, { label: 'Motivo', width: 36 }, { label: 'Resposta', width: 30 }, { label: 'Enviado em', width: 18 }],
          rows: pedidos.map((p) => [p.codigo, p.solicitante_nome, PEDIDO_STATUS[p.status], p.data_retirada, p.local, p.categoria, p.motorista, p.motivo, p.resposta, p.enviado_at]) },
        { name: 'Chamados', columns: [{ label: 'Chamado', width: 10 }, { label: 'Tipo', width: 22 }, { label: 'Status', width: 20 }, { label: 'Placa', width: 10 }, { label: 'Modelo', width: 16 },
          { label: 'Motorista', width: 22 }, { label: 'Solicitante', width: 22 }, { label: 'Motivo', width: 36 }, { label: 'Agendado para', type: 'date' }, { label: 'Local', width: 24 },
          { label: 'Resultado', width: 30 }, { label: 'Aberto em', width: 18 }],
          rows: chamados.map((c) => [c.codigo, CHAMADO_TIPO[c.tipo], CHAMADO_STATUS[c.status], c.placa, c.modelo, c.motorista,
            c.solicitante_nome, c.motivo, c.data_servico, c.local_servico, c.resultado || c.resposta, c.created_at]) },
      ]);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="frotas-${hoje()}.xlsx"`);
      res.send(xlsx);
    }));
  },
};
