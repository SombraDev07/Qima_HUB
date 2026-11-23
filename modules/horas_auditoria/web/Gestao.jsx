// Central: planejamentos (safras), distritos e parâmetros (R$ por hora, semanas, divisores). Mostra sempre a versão aprovada.
import { useEffect, useRef, useState } from 'react';
import { Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { Button, Card, Empty, Field, Modal, PageHeader, money, num, todayISO, useAction, useConfirm, usePrompt } from '@hub';
import { Diferenca, GradeHoras, Kpi, MODS, calcular } from './shared.jsx';

function PlanoModal({ inicial, taxasPadrao, onClose, onSalvar }) {
  const [f, setF] = useState(() => inicial ? {
    nome: inicial.nome, inicio: inicial.inicio, semanas: String(inicial.semanas), horas_por_auditor: String(inicial.horas_por_auditor),
    aud_veic_a: String(inicial.aud_veic_a), aud_veic_b: String(inicial.aud_veic_b), taxas: Object.fromEntries(MODS.map((m) => [m, String(inicial.taxas[m]).replace('.', ',')])),
  } : { nome: '', inicio: todayISO(), semanas: '23', horas_por_auditor: '44', aud_veic_a: '1', aud_veic_b: '3', taxas: Object.fromEntries(MODS.map((m) => [m, String(taxasPadrao[m]).replace('.', ',')])) });
  const [run, busy] = useAction();
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const salvar = async () => {
    const corpo = { ...f, taxas: Object.fromEntries(MODS.map((m) => [m, Number(String(f.taxas[m]).replace(',', '.'))])) };
    if (await run(() => onSalvar(corpo), inicial ? 'Parâmetros atualizados' : 'Planejamento criado')) onClose();
  };
  return (
    <Modal title={inicial ? 'Parâmetros do planejamento' : 'Novo planejamento'} onClose={onClose} wide
      footer={<><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={salvar} disabled={busy || !f.nome.trim()}>Salvar</Button></>}>
      <div className="ha-grid2">
        <Field label="Nome"><input value={f.nome} onChange={set('nome')} placeholder="Ex.: Harvest 2027" maxLength={80} autoFocus /></Field>
        <Field label="Início da semana 1 (domingo)"><input type="date" value={f.inicio} onChange={set('inicio')} /></Field>
        <Field label="Nº de semanas"><input inputMode="numeric" value={f.semanas} onChange={set('semanas')} /></Field>
        <Field label="Horas por auditor na semana"><input inputMode="decimal" value={f.horas_por_auditor} onChange={set('horas_por_auditor')} /></Field>
        <Field label="Auditores por veículo · 2H/4H"><input inputMode="decimal" value={f.aud_veic_a} onChange={set('aud_veic_a')} /></Field>
        <Field label="Auditores por veículo · 8H"><input inputMode="decimal" value={f.aud_veic_b} onChange={set('aud_veic_b')} /></Field>
      </div>
      <div className="field-label" style={{ margin: '6px 0' }}>Valor por hora (R$)</div>
      <div className="ha-grid2">
        {MODS.map((m) => <Field key={m} label={m}><input inputMode="decimal" value={f.taxas[m]} onChange={(e) => setF((x) => ({ ...x, taxas: { ...x.taxas, [m]: e.target.value } }))} /></Field>)}
      </div>
      {inicial && <p className="small muted">Mudar o valor por hora recalcula o budget de todos os distritos deste planejamento. A mudança fica registrada no histórico.</p>}
    </Modal>
  );
}

export default function Gestao({ api }) {
  const [cfg, setCfg] = useState(null);
  const [planos, setPlanos] = useState(null);
  const [pid, setPid] = useState('');
  const [det, setDet] = useState(null);
  const [modal, setModal] = useState(null);
  const [run, busy] = useAction();
  const confirmar = useConfirm();
  const perguntar = usePrompt();
  const arq = useRef();

  const lerPlanos = async (escolher) => { const l = await api.get('/planejamentos'); setPlanos(l); setPid((p) => String(escolher ?? (l.some((x) => String(x.id) === p) ? p : l[0]?.id ?? ''))); };
  const lerDet = async () => { if (pid) setDet(await api.get(`/planejamentos/${pid}`)); else setDet(null); };
  useEffect(() => { api.get('/config').then(setCfg); lerPlanos(); }, []);
  useEffect(() => { setDet(null); lerDet(); }, [pid]);

  async function novoDistrito() {
    const nome = await perguntar({ titulo: 'Novo distrito', label: 'Nome do distrito', obrigatorio: true, confirmar: 'Criar' });
    if (!nome) return;
    await run(async () => { await api.post(`/central/planejamentos/${pid}/distritos`, { nome }); await lerDet(); await lerPlanos(); }, 'Distrito criado');
  }
  async function renomear(d) {
    const nome = await perguntar({ titulo: 'Renomear distrito', label: 'Novo nome', obrigatorio: true, valor: d.nome, confirmar: 'Salvar' });
    if (!nome) return;
    await run(async () => { await api.patch(`/central/distritos/${d.id}`, { nome }); await lerDet(); }, 'Distrito renomeado');
  }
  async function remover(d) {
    if (!(await confirmar({ titulo: `Remover ${d.nome}?`, mensagem: 'Apaga as horas e o histórico deste distrito. Não pode ser desfeito.', confirmar: 'Remover', perigo: true }))) return;
    await run(async () => { await api.del(`/central/distritos/${d.id}`); await lerDet(); await lerPlanos(); }, 'Distrito removido');
  }
  async function excluirPlano() {
    const p = planos.find((x) => String(x.id) === pid);
    if (!(await confirmar({ titulo: `Excluir "${p.nome}"?`, mensagem: 'Apaga todos os distritos, horas e o histórico deste planejamento. Não pode ser desfeito.', confirmar: 'Excluir', perigo: true }))) return;
    await run(async () => { await api.del(`/central/planejamentos/${pid}`); setPid(''); await lerPlanos(); }, 'Planejamento excluído');
  }
  async function importar(e) {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    let j; try { j = JSON.parse(await f.text()); } catch { return run(async () => { throw new Error('Arquivo inválido.'); }); }
    if (!(await confirmar({ titulo: 'Importar do protótipo?', mensagem: `Cria ${j.planos?.length || 0} planejamento(s) novo(s) com a versão aprovada de cada distrito. Nada existente é alterado.`, confirmar: 'Importar' }))) return;
    await run(async () => { const r = await api.post('/central/importar', { planos: j.planos }); await lerPlanos(); return r; }, (r) => `Importado: ${r.criados.join(', ')}`);
  }

  if (!planos || !cfg) return <Empty>Carregando…</Empty>;
  const p = planos.find((x) => String(x.id) === pid);
  return (
    <>
      <PageHeader back="/" title="Planejamentos" subtitle="Safras, distritos e valores por hora. Aqui você vê a versão aprovada."
        actions={<>
          <input ref={arq} type="file" accept=".json,application/json" hidden onChange={importar} />
          <Button variant="outline" onClick={() => arq.current.click()} disabled={busy}><Upload size={15} /> Importar do protótipo</Button>
          <Button onClick={() => setModal({ k: 'novo' })}><Plus size={15} /> Novo planejamento</Button>
        </>} />
      {!planos.length ? <Empty>Nenhum planejamento ainda. Crie o primeiro ou importe o arquivo do protótipo offline.</Empty> : (
        <>
          <div className="ha-linha">
            <label className="field"><span className="field-label">Planejamento</span><select value={pid} onChange={(e) => setPid(e.target.value)}>{planos.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></label>
            <span className="ha-sp" />
            <Button variant="outline" onClick={() => setModal({ k: 'editar' })}><Pencil size={15} /> Parâmetros</Button>
            <Button variant="danger" onClick={excluirPlano}><Trash2 size={15} /> Excluir</Button>
            <Button onClick={novoDistrito}><Plus size={15} /> Distrito</Button>
          </div>
          {p && <div className="ha-kpis"><Kpi rotulo="Horas aprovadas" valor={`${num(p.horas)} h`} /><Kpi rotulo="Budget aprovado" valor={money(p.budget)} /><Kpi rotulo="Budget programado" valor={money(p.prog)} /><Kpi rotulo="Diferença" valor={<Diferenca dif={p.prog - p.budget} prog={p.prog} />} /><Kpi rotulo="Aguardando aprovação" valor={p.pendentes} tom={p.pendentes ? 'azul' : undefined} /></div>}
          {!det ? <Empty>Carregando…</Empty> : !det.distritos.length ? <Empty>Sem distritos. Use “+ Distrito”.</Empty> : det.distritos.map((d) => {
            const c = calcular(det.plano, d.aprovada.horas, d.aprovada.prog);
            return (
              <Card key={d.id} className="ha-card">
                <div className="ha-card-top"><h2>{d.nome}</h2><Diferenca dif={c.dif} prog={c.prog} /><span className="ha-sp" />
                  <Button variant="outline" onClick={() => renomear(d)}>Renomear</Button><Button variant="danger" onClick={() => remover(d)}>Remover</Button></div>
                <GradeHoras plano={det.plano} horas={d.aprovada.horas} prog={d.aprovada.prog} disabled />
                <div className="ha-rodape"><div><small>Horas</small><b>{num(c.horas)} h</b></div><div><small>Budget (R$)</small><b>{money(c.budget)}</b></div><div><small>Budget programado</small><b>{money(c.prog)}</b></div></div>
              </Card>
            );
          })}
        </>
      )}
      {modal?.k === 'novo' && <PlanoModal taxasPadrao={cfg.taxas_padrao} onClose={() => setModal(null)} onSalvar={async (b) => { const x = await api.post('/central/planejamentos', b); await lerPlanos(x.id); }} />}
      {modal?.k === 'editar' && det && <PlanoModal inicial={det.plano} taxasPadrao={cfg.taxas_padrao} onClose={() => setModal(null)} onSalvar={async (b) => { await api.put(`/central/planejamentos/${pid}`, b); await lerPlanos(); await lerDet(); }} />}
    </>
  );
}
