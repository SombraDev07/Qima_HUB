// Central: analisa o que o planejador enviou (versão aprovada × proposta) e aprova ou reprova.
import { useCallback, useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { Button, Card, Empty, PageHeader, fmtDateTime, useAction, usePrompt } from '@hub';
import { Comparacao, Status } from './shared.jsx';

export default function Aprovacoes({ api }) {
  const [lista, setLista] = useState(null);
  const [run, busy] = useAction();
  const perguntar = usePrompt();
  const [erro, setErro] = useState('');
  const carregar = useCallback(() => api.get('/central/pendentes').then((l) => { setErro(''); setLista(l); }).catch((e) => setErro(e.message)), [api]);
  useEffect(() => { carregar(); }, [carregar]);

  async function aprovar(x) {
    const nota = await perguntar({ titulo: `Aprovar ${x.distrito.nome}`, label: 'Comentário', obrigatorio: false, confirmar: 'Aprovar' });
    if (nota === null) return;
    await run(async () => { await api.post(`/central/versoes/${x.nova.id}/aprovar`, { nota }); await carregar(); }, `${x.distrito.nome} aprovado — a nova versão já vale`);
  }
  async function reprovar(x) {
    const motivo = await perguntar({ titulo: `Reprovar ${x.distrito.nome}`, label: 'Motivo (o planejador vai ver)', obrigatorio: true, confirmar: 'Reprovar' });
    if (!motivo) return;
    await run(async () => { await api.post(`/central/versoes/${x.nova.id}/reprovar`, { motivo }); await carregar(); }, `${x.distrito.nome} reprovado — a versão anterior continua valendo`);
  }

  return (
    <>
      <PageHeader back="/" title="Aprovações" subtitle="Compare o que vale hoje com o que foi enviado. Se reprovar, a versão atual continua valendo." />
      {erro ? <Empty>Não foi possível carregar: {erro}</Empty> : !lista ? <Empty>Carregando…</Empty> : !lista.length ? <Empty>Nenhuma alteração aguardando aprovação.</Empty> : lista.map((x) => (
        <Card key={x.nova.id} className="ha-card">
          <div className="ha-card-top">
            <h2>{x.distrito.nome}</h2><span className="muted">{x.plano.nome}</span><Status s="pendente" /><span className="ha-sp" />
            <Button variant="danger" onClick={() => reprovar(x)} disabled={busy}><X size={15} /> Reprovar</Button>
            <Button onClick={() => aprovar(x)} disabled={busy}><Check size={15} /> Aprovar</Button>
          </div>
          <div className="ha-aviso ha-aviso-pend">Enviado por <b>{x.nova.por}</b> em {fmtDateTime(x.nova.enviado_em)}{x.nova.nota ? <> · “{x.nova.nota}”</> : null} · <b>{x.celulas}</b> célula(s) de horas alterada(s)</div>
          <Comparacao plano={x.plano} antes={{ horas: x.base.horas, prog: x.base.prog }} depois={{ horas: x.nova.horas, prog: x.nova.prog }} />
        </Card>
      ))}
    </>
  );
}
