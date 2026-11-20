import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import municipios from '../../dados/municipios.json';
import { api } from '../../api/cliente';
import { useTema } from '../../tema';
import { Aviso, Botao, Campo, CampoData, CampoSelecao, Carregando, Chip, Folha, Icone, Secao, Tela, useAviso, useConfirmar } from '../../ui';
import { useAcao } from '../../util/carregar';
import { diasEntre, hoje, norm, somaDias } from '../../util/datas';
import type { Opcoes, Pedido, Pessoa } from './tipos';

const M = '/api/m/hospedagens';
const MUN = municipios as Record<string, string[]>;
const UFS = Object.keys(MUN);
type HospedeForm = { pessoa_id?: number; nome: string; email?: string | null; tipo: 'colaborador' | 'open'; demitido?: boolean };

// ------------------------------------------------------------------ cidade (lista oficial do IBGE, sem internet)
function CampoCidade({ uf, cidade, aoMudar, erro }: { uf: string; cidade: string; aoMudar: (c: string) => void; erro?: string }) {
  const t = useTema();
  const [aberto, setAberto] = useState(false);
  const [q, setQ] = useState('');
  const achadas = useMemo(() => (MUN[uf] ?? []).filter((n) => !q || norm(n).includes(norm(q))).slice(0, 60), [uf, q]);
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ color: t.texto, fontSize: 13.5, fontWeight: '700', marginBottom: 6 }}>Cidade</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`Cidade: ${cidade || 'escolher'}`} onPress={() => { setQ(''); setAberto(true); }}
        style={{ minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', backgroundColor: t.campo, borderColor: erro ? t.erro : t.linha }}>
        <Text style={{ flex: 1, fontSize: 16, color: cidade ? t.texto : t.suave }}>{cidade || 'Escolher a cidade'}</Text>
        <Icone nome="search" tamanho={20} cor={t.suave} />
      </Pressable>
      {!!erro && <Text style={{ color: t.erro, marginTop: 4, fontSize: 13 }}>{erro}</Text>}
      <Folha aberto={aberto} titulo={`Cidade (${uf})`} aoFechar={() => setAberto(false)}>
        <Campo rotulo="Buscar" value={q} onChangeText={setQ} placeholder="Digite o nome da cidade" autoFocus />
        {achadas.map((n) => (
          <Pressable key={n} accessibilityRole="button" onPress={() => { aoMudar(n); setAberto(false); }} style={{ minHeight: 48, justifyContent: 'center', borderBottomWidth: 0.5, borderBottomColor: t.linha }}>
            <Text style={{ color: t.texto, fontSize: 16, fontWeight: n === cidade ? '800' : '400' }}>{n}</Text>
          </Pressable>
        ))}
        {!achadas.length && <Text style={{ color: t.suave, paddingVertical: 16 }}>Nenhuma cidade encontrada em {uf}.</Text>}
      </Folha>
    </View>
  );
}

// ------------------------------------------------------------------ hóspedes: busca no banco de pessoas, vagas Open e cadastro rápido
function SeletorHospedes({ valor, aoMudar }: { valor: HospedeForm[]; aoMudar: (h: HospedeForm[]) => void }) {
  const t = useTema();
  const avisar = useAviso();
  const [aberto, setAberto] = useState(false);
  const [q, setQ] = useState('');
  const [achadas, setAchadas] = useState<Pessoa[]>([]);
  const [qtdOpen, setQtdOpen] = useState('1');
  const [novo, setNovo] = useState<{ nome: string; email: string } | null>(null);
  const { executar, ocupado } = useAcao();

  useEffect(() => {
    if (!aberto) return undefined;
    const h = setTimeout(() => { api<Pessoa[]>(`${M}/pessoas?q=${encodeURIComponent(q)}`).then(setAchadas).catch(() => setAchadas([])); }, 250);
    return () => clearTimeout(h);
  }, [q, aberto]);

  const tem = (nome: string) => valor.some((v) => norm(v.nome) === norm(nome));
  const adicionar = (p: Pessoa) => {
    if (tem(p.nome)) { avisar(`${p.nome} já está na lista.`, 'erro'); return; }
    if (p.demitido) avisar(`${p.nome} está como demitido(a) na Contratação.`, 'erro');
    aoMudar([...valor, { pessoa_id: p.id, nome: p.nome, email: p.email, tipo: 'colaborador', demitido: !!p.demitido }]);
  };
  const adicionarOpen = () => {
    const n = Math.min(Math.max(1, Number(qtdOpen) || 1), 30);
    let base = valor.reduce((m, v) => Math.max(m, Number((v.nome.match(/^Open_(\d+)$/) || [])[1]) || 0), 0);
    aoMudar([...valor, ...Array.from({ length: n }, (): HospedeForm => ({ nome: `Open_${++base}`, tipo: 'open' }))]);
    setAberto(false);
  };
  const cadastrar = async () => {
    if (!novo) return;
    const r = await executar(() => api<Pessoa>(`${M}/pessoas`, { metodo: 'POST', corpo: novo }));
    if (!r.ok) { avisar(r.erro, 'erro'); return; }
    adicionar(r.valor); setNovo(null);
  };

  return (
    <View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {valor.map((v, i) => (
          <Pressable key={v.nome + i} accessibilityRole="button" accessibilityLabel={`Remover ${v.nome}`} onPress={() => aoMudar(valor.filter((_, j) => j !== i))}
            style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: v.demitido ? t.erroFundo : v.tipo === 'open' ? t.avisoFundo : t.infoFundo, borderRadius: 999, paddingLeft: 12, paddingRight: 8, paddingVertical: 7, borderWidth: v.demitido ? 2 : 0, borderColor: t.erro }}>
            <Text style={{ color: v.demitido ? t.erro : v.tipo === 'open' ? t.aviso : t.info, fontWeight: '700', fontSize: 14 }}>{v.nome}{v.demitido ? ' · demitido' : ''}</Text>
            <Icone nome="close-circle" tamanho={18} cor={v.demitido ? t.erro : v.tipo === 'open' ? t.aviso : t.info} />
          </Pressable>
        ))}
        {!valor.length && <Text style={{ color: t.suave }}>Nenhuma pessoa anexada.</Text>}
      </View>
      <Botao titulo="Adicionar pessoas" icone="person-add-outline" variante="contorno" onPress={() => setAberto(true)} />

      <Folha aberto={aberto} titulo="Adicionar hóspedes" aoFechar={() => setAberto(false)}>
        <Campo rotulo="Buscar no banco de pessoas" value={q} onChangeText={setQ} placeholder="Nome, função ou cidade" />
        {achadas.map((p) => (
          <Pressable key={p.id} accessibilityRole="button" disabled={tem(p.nome)} onPress={() => adicionar(p)}
            style={{ minHeight: 52, justifyContent: 'center', borderBottomWidth: 0.5, borderBottomColor: t.linha, opacity: tem(p.nome) ? 0.45 : 1,
              ...(p.demitido ? { borderWidth: 2, borderColor: t.erro, borderRadius: 10, paddingHorizontal: 10, marginVertical: 3, backgroundColor: t.erroFundo } : {}) }}>
            <Text style={{ color: p.demitido ? t.erro : t.texto, fontSize: 16, fontWeight: '700' }}>{p.nome}{p.demitido ? '  · Demitido' : ''}{tem(p.nome) ? '  ✓' : ''}</Text>
            <Text style={{ color: t.suave, fontSize: 13 }}>{[p.funcao, p.cidade, p.email].filter(Boolean).join(' · ') || 'Sem detalhes'}</Text>
          </Pressable>
        ))}
        {!achadas.length && <Text style={{ color: t.suave, paddingVertical: 10 }}>Ninguém encontrado. Cadastre a pessoa ou use vagas Open.</Text>}

        <Secao titulo="Quando ainda não sabe quem vai" />
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
          <View style={{ width: 90 }}><Campo rotulo="Vagas" value={qtdOpen} onChangeText={setQtdOpen} keyboardType="number-pad" /></View>
          <Botao titulo="Adicionar vagas Open" variante="contorno" onPress={adicionarOpen} estilo={{ flex: 1, marginBottom: 14 }} />
        </View>

        <Secao titulo="Pessoa nova" />
        {novo ? (
          <>
            <Campo rotulo="Nome completo" value={novo.nome} onChangeText={(v) => setNovo({ ...novo, nome: v })} />
            <Campo rotulo="E-mail (opcional)" value={novo.email} onChangeText={(v) => setNovo({ ...novo, email: v })} autoCapitalize="none" keyboardType="email-address" />
            <Botao titulo="Salvar e anexar" onPress={cadastrar} carregando={ocupado} />
          </>
        ) : <Botao titulo="Cadastrar pessoa" icone="add" variante="suave" onPress={() => setNovo({ nome: q, email: '' })} />}
      </Folha>
    </View>
  );
}

// ------------------------------------------------------------------ formulário (novo pedido ou rascunho)
export function Formulario() {
  const nav = useNavigation<any>();
  const t = useTema();
  const id = (useRoute().params as { id?: number } | undefined)?.id;
  const avisar = useAviso();
  const confirmar = useConfirmar();
  const { executar, ocupado } = useAcao();
  const [opcoes, setOpcoes] = useState<Opcoes | null>(null);
  const [orig, setOrig] = useState<Pedido | null>(null);
  const [erro, setErro] = useState('');
  const [erroCidade, setErroCidade] = useState('');
  const [f, setF] = useState({ cidade: '', uf: 'PR', data_inicio: hoje(), data_fim: somaDias(hoje(), 5), projeto: '', garagem: 'sem', obs: '', hospedes: [] as HospedeForm[] });
  const set = useCallback(<K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v })), []);

  useEffect(() => {
    api<Opcoes>(`${M}/opcoes`).then((o) => { setOpcoes(o); setF((x) => ({ ...x, projeto: x.projeto || o.projetos[0] || '' })); }).catch((x) => setErro(x.message));
    if (id) {
      api<Pedido>(`${M}/pedidos/${id}`).then((p) => {
        setOrig(p);
        setF({ cidade: p.cidade, uf: p.uf, data_inicio: p.data_inicio, data_fim: p.data_fim, projeto: p.projeto ?? '', garagem: p.garagem ?? 'sem', obs: p.obs ?? '',
          hospedes: p.hospedes.filter((h) => h.status !== 'cancelado').map((h) => ({ pessoa_id: h.pessoa_id ?? undefined, nome: h.nome, email: h.email, tipo: h.tipo, demitido: h.demitido })) });
      }).catch((x) => setErro(x.message));
    }
  }, [id]);

  const noites = diasEntre(f.data_inicio, f.data_fim);
  const salvar = async (rascunho: boolean) => {
    setErro(''); setErroCidade('');
    const cidade = (MUN[f.uf] ?? []).find((n) => norm(n) === norm(f.cidade));
    if (!cidade) { setErroCidade(`Escolha uma cidade de ${f.uf} na lista.`); return; }
    if (noites < 1) { setErro('O check-out precisa ser depois do check-in.'); return; }
    if (!f.hospedes.length) { setErro('Anexe pelo menos uma pessoa.'); return; }
    const r = await executar(() => (id
      ? api<{ id: number; codigo: string }>(`${M}/meus/${id}`, { metodo: 'PUT', corpo: { ...f, cidade, rascunho } })
      : api<{ id: number; codigo: string }>(`${M}/meus`, { metodo: 'POST', corpo: { ...f, cidade, rascunho } })));
    if (!r.ok) { setErro(r.erro); return; }
    avisar(rascunho ? `Rascunho salvo · ${r.valor.codigo}` : `Pedido enviado · ${r.valor.codigo}`);
    if (rascunho) nav.goBack(); else nav.replace('hospedagens.Pedido', { id: r.valor.id });
  };
  const excluir = async () => {
    if (!await confirmar({ titulo: 'Excluir este rascunho?', mensagem: 'Os dados e os hóspedes anexados serão apagados.', confirmar: 'Excluir', perigo: true })) return;
    const r = await executar(() => api(`${M}/meus/${id}`, { metodo: 'DELETE' }));
    if (!r.ok) { setErro(r.erro); return; }
    avisar('Rascunho excluído'); nav.goBack();
  };

  if (!opcoes && !erro) return <Tela titulo="Nova viagem" aoVoltar={() => nav.goBack()}><Carregando /></Tela>;
  const editandoEnviado = !!orig && orig.status !== 'rascunho';
  return (
    <Tela titulo={id ? `${orig?.codigo ?? ''} · ${editandoEnviado ? 'editar pedido' : 'rascunho'}` : 'Nova viagem'} subtitulo="Hospedagens" aoVoltar={() => nav.goBack()}
      rodape={(
        <>
          {!editandoEnviado && <Botao titulo="Salvar rascunho" variante="contorno" onPress={() => salvar(true)} desabilitado={ocupado} estilo={{ flex: 1 }} />}
          <Botao titulo={editandoEnviado ? 'Salvar ajuste' : 'Enviar pedido'} onPress={() => salvar(false)} carregando={ocupado} estilo={{ flex: 1.3 }} />
        </>
      )}>
      {!!erro && <Aviso texto={erro} />}
      <Secao titulo="Onde e quando" />
      <CampoSelecao rotulo="Estado" valor={f.uf} opcoes={UFS.map((u) => ({ valor: u, rotulo: u }))} aoMudar={(u) => setF((x) => ({ ...x, uf: u, cidade: MUN[u]?.some((n) => norm(n) === norm(x.cidade)) ? x.cidade : '' }))} />
      <CampoCidade uf={f.uf} cidade={f.cidade} aoMudar={(c) => { set('cidade', c); setErroCidade(''); }} erro={erroCidade} />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <CampoData rotulo="Check-in" valor={f.data_inicio} aoMudar={(v) => setF((x) => ({ ...x, data_inicio: v, data_fim: x.data_fim <= v ? somaDias(v, 1) : x.data_fim }))} />
        <CampoData rotulo="Check-out" valor={f.data_fim} minimo={somaDias(f.data_inicio, 1)} aoMudar={(v) => set('data_fim', v)} />
      </View>
      {noites > 0 && <View style={{ marginBottom: 14 }}><Chip texto={`${noites} diária(s)`} tom="info" /></View>}
      <CampoSelecao rotulo="Projeto" valor={f.projeto} opcoes={(opcoes?.projetos ?? []).map((p) => ({ valor: p, rotulo: p }))} aoMudar={(v) => set('projeto', v)} />
      <CampoSelecao rotulo="Garagem" valor={f.garagem} opcoes={[{ valor: 'sem', rotulo: 'Sem garagem' }, { valor: 'free', rotulo: 'Garagem free' }, { valor: 'paga', rotulo: 'Garagem paga' }]} aoMudar={(v) => set('garagem', v)} />
      <Campo rotulo="Observação" value={f.obs} onChangeText={(v) => set('obs', v)} multilinha placeholder="Algo que a central precise saber" />

      <Secao titulo={`Hóspedes (${f.hospedes.length})`} />
      <Text style={{ color: t.suave, fontSize: 13.5, marginBottom: 12 }}>Busque no banco de pessoas ou adicione vagas <Text style={{ fontWeight: '800' }}>Open</Text> quando ainda não souber quem vai.</Text>
      <SeletorHospedes valor={f.hospedes} aoMudar={(h) => set('hospedes', h)} />

      {id && orig?.status === 'rascunho' && <Botao titulo="Excluir rascunho" variante="perigo" icone="trash-outline" onPress={excluir} desabilitado={ocupado} estilo={{ marginTop: 28 }} />}
    </Tela>
  );
}