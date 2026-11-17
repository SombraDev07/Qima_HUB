import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Upload } from 'lucide-react';
import { Alert, Button, Card, Empty, Field, PageHeader, useConfirm } from '@hub';
import { CidadeInput, FiltroSelect, Modal, cidadeOficial, money, norm, uniq, useAction } from '../shared.jsx';

const VAZIO = { nome: '', cidade: '', uf: 'PR', endereco: '', email: '', telefone: '', valor_s: '', valor_d: '', valor_t: '', valor_q: '', quartos: '', garagem: 'gratis', garagem_valor: '', obs: '' };
const POR_PAGINA = 25;

function HotelForm({ api, inicial, onClose, onSaved }) {
  const [f, setF] = useState({ ...VAZIO, ...inicial });
  const [erro, setErro] = useState('');
  const [run, busy] = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const salvar = async () => {
    setErro('');
    const cidade = cidadeOficial(f.cidade, f.uf);
    if (!f.nome.trim()) return setErro('Informe o nome do hotel.');
    if (!cidade) return setErro(`Escolha uma cidade válida de ${f.uf}.`);
    const body = { ...f, cidade };
    const r = await run(() => (f.id ? api.put(`/central/hoteis/${f.id}`, body) : api.post('/central/hoteis', body)),
      (x) => (f.id ? `Hotel atualizado${x.atualizados ? ` · ${x.atualizados} quarto(s) em aberto recalculados` : ''}` : `Hotel cadastrado · ${f.nome}`));
    if (r) onSaved();
  };

  return (
    <Modal title={f.id ? 'Editar hotel' : 'Novo hotel'} onClose={onClose}
      footer={<><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={salvar} disabled={busy}>Salvar</Button></>}>
      <Alert>{erro}</Alert>
      <Field label="Nome"><input value={f.nome} onChange={set('nome')} autoFocus /></Field>
      <Field label="Estado e cidade"><CidadeInput cidade={f.cidade} uf={f.uf} onChange={({ cidade, uf }) => setF({ ...f, cidade, uf })} /></Field>
      <Field label="Endereço"><input value={f.endereco || ''} onChange={set('endereco')} /></Field>
      <div className="grid-2">
        <Field label="E-mail"><input type="email" value={f.email || ''} onChange={set('email')} /></Field>
        <Field label="Telefone"><input value={f.telefone || ''} onChange={set('telefone')} /></Field>
      </div>
      <h4 className="section-title">Diária por ocupação (R$)</h4>
      <div className="hs-grid-4">
        <Field label="Simples"><input inputMode="decimal" value={f.valor_s} onChange={set('valor_s')} /></Field>
        <Field label="Duplo"><input inputMode="decimal" value={f.valor_d} onChange={set('valor_d')} /></Field>
        <Field label="Triplo"><input inputMode="decimal" value={f.valor_t} onChange={set('valor_t')} /></Field>
        <Field label="Quádruplo"><input inputMode="decimal" value={f.valor_q} onChange={set('valor_q')} /></Field>
      </div>
      <div className="hs-grid-3">
        <Field label="Qtd. quartos"><input inputMode="numeric" value={f.quartos} onChange={set('quartos')} /></Field>
        <Field label="Garagem">
          <select value={f.garagem} onChange={set('garagem')}>
            <option value="gratis">Grátis</option><option value="paga">Paga</option><option value="nao">Não tem</option>
          </select>
        </Field>
        {f.garagem === 'paga' && <Field label="Valor garagem (R$/dia)"><input inputMode="decimal" value={f.garagem_valor || ''} onChange={set('garagem_valor')} /></Field>}
      </div>
      <Field label="Observação"><textarea rows={2} value={f.obs || ''} onChange={set('obs')} /></Field>
    </Modal>
  );
}

function ImportarDialog({ api, onClose, onDone }) {
  const [texto, setTexto] = useState('');
  const [res, setRes] = useState(null);
  const [run, busy] = useAction();
  const importar = async () => {
    const r = await run(() => api.post('/central/hoteis/importar', { texto }));
    if (r) { setRes(r); onDone(); }
  };
  return (
    <Modal title="Importar hotéis" onClose={onClose} wide
      footer={<><Button variant="outline" onClick={onClose}>Fechar</Button><Button onClick={importar} disabled={busy || !texto.trim()}>Importar</Button></>}>
      <p className="small hs-m0">Copie as linhas da planilha (Excel) e cole abaixo. Formatos aceitos (colunas separadas por TAB):</p>
      <ul className="small hs-list">
        <li><b>Simples:</b> Nome · Cidade · UF · Endereço · E-mail · Telefone · Simples · Duplo · Triplo · Quádruplo</li>
        <li><b>Planilha antiga (10+ colunas):</b> Nome · ? · UF · Cidade · … · Contato (8ª) · E-mail (9ª) · Endereço (10ª)</li>
      </ul>
      <textarea rows={10} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Cole aqui…" className="hs-mono" />
      {res && (
        <Alert kind={res.erros.length ? 'error' : 'success'}>
          {res.importados} importado(s) · {res.duplicados} já existiam{res.erros.length ? ` · ${res.erros.length} com erro: ${res.erros.slice(0, 5).join('; ')}` : ''}
        </Alert>
      )}
    </Modal>
  );
}

export default function Hoteis({ module, api }) {
  const base = `/m/${module.key}/central`;
  const [lista, setLista] = useState(null);
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');
  const [uf, setUf] = useState('');
  const [form, setForm] = useState(null);
  const [imp, setImp] = useState(false);
  const [pag, setPag] = useState(1);
  const [run] = useAction();
  const confirmar = useConfirm();

  const load = () => api.get('/central/hoteis').then(setLista).catch((e) => setErro(e.message));
  useEffect(() => { load(); }, []);

  const filtrados = (lista || []).filter((h) => (!uf || h.uf === uf) && (!busca || norm(`${h.nome} ${h.cidade} ${h.email} ${h.telefone}`).includes(norm(busca))));
  const paginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const vis = filtrados.slice((pag - 1) * POR_PAGINA, pag * POR_PAGINA);

  const excluir = async (h) => {
    if (!await confirmar({ titulo: `Remover ${h.nome} do cadastro?`, mensagem: 'Reservas antigas continuam com o nome do hotel.', confirmar: 'Remover', perigo: true })) return;
    if (await run(() => api.del(`/central/hoteis/${h.id}`), 'Hotel removido')) load();
  };

  return (
    <>
      <PageHeader title="Hotéis" subtitle="Cadastro e valores de diária" back={base}
        actions={<>
          <Button variant="outline" onClick={() => setImp(true)}><Upload size={16} /> Importar</Button>
          <Button onClick={() => setForm({})}><Plus size={16} /> Novo hotel</Button>
        </>} />
      <Alert>{erro}</Alert>
      <div className="hs-filtros">
        <label className="hs-filtro hs-filtro-grow"><span>Buscar</span>
          <input value={busca} onChange={(e) => { setBusca(e.target.value); setPag(1); }} placeholder="Nome, cidade, e-mail ou telefone" />
        </label>
        <FiltroSelect label="UF" value={uf} onChange={(v) => { setUf(v); setPag(1); }} options={uniq((lista || []).map((h) => h.uf))} />
      </div>

      {lista === null ? <Empty>Carregando…</Empty> : !vis.length ? <Empty>Nenhum hotel cadastrado.</Empty> : (
        <Card className="table-card">
          <table className="table hs-table">
            <thead><tr><th>Hotel</th><th>Cidade</th><th>Contato</th><th>Simples</th><th>Duplo</th><th>Triplo</th><th>Quádr.</th><th>Garagem</th><th>Usos</th><th /></tr></thead>
            <tbody>
              {vis.map((h) => (
                <tr key={h.id}>
                  <td className="cell-strong">{h.nome}<div className="muted small">{h.endereco}</div></td>
                  <td>{h.cidade} - {h.uf}</td>
                  <td className="small">{h.telefone}<div className="muted">{h.email}</div></td>
                  <td>{money(h.valor_s)}</td><td>{money(h.valor_d)}</td><td>{money(h.valor_t)}</td><td>{money(h.valor_q)}</td>
                  <td>{h.garagem === 'paga' ? `Paga${h.garagem_valor ? ` · ${money(h.garagem_valor)}` : ''}` : h.garagem === 'nao' ? 'Não tem' : 'Grátis'}</td>
                  <td>{h.usos}</td>
                  <td className="row-actions">
                    <button className="icon-btn" title="Editar" onClick={() => setForm(h)}><Pencil size={15} /></button>
                    <button className="icon-btn danger" title="Remover" onClick={() => excluir(h)}><Trash2 size={15} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="hs-pager">
            <span>{filtrados.length} hotel(is)</span>
            <span>
              <button className="hs-link" disabled={pag <= 1} onClick={() => setPag(pag - 1)}>‹ Anterior</button>
              {' '}Página {pag} de {paginas}{' '}
              <button className="hs-link" disabled={pag >= paginas} onClick={() => setPag(pag + 1)}>Próxima ›</button>
            </span>
          </div>
        </Card>
      )}
      {form && <HotelForm api={api} inicial={form} onClose={() => setForm(null)} onSaved={() => { setForm(null); load(); }} />}
      {imp && <ImportarDialog api={api} onClose={() => setImp(false)} onDone={load} />}
    </>
  );
}
