// Cidade escolhida na lista oficial do IBGE (funciona sem internet). Cidade vazia é permitida quando "opcional".
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import municipios from '../dados/municipios.json';
import { useTema } from '../tema';
import { norm } from '../util/datas';
import { Campo, Folha, Icone } from '.';

export const MUNICIPIOS = municipios as Record<string, string[]>;
export const UFS = Object.keys(MUNICIPIOS);
export const cidadeOficial = (cidade: string, uf: string) => MUNICIPIOS[uf]?.find((n) => norm(n) === norm(cidade)) ?? null;

export function CampoCidade({ uf, cidade, aoMudar, opcional = false, erro }: { uf: string; cidade: string; aoMudar: (c: string) => void; opcional?: boolean; erro?: string }) {
  const t = useTema();
  const [aberto, setAberto] = useState(false);
  const [q, setQ] = useState('');
  const achadas = useMemo(() => (MUNICIPIOS[uf] ?? []).filter((n) => !q || norm(n).includes(norm(q))).slice(0, 60), [uf, q]);
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ color: t.texto, fontSize: 13.5, fontWeight: '700', marginBottom: 6 }}>Cidade{opcional ? ' (opcional)' : ''}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`Cidade: ${cidade || 'escolher'}`} onPress={() => { setQ(''); setAberto(true); }}
        style={{ minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', backgroundColor: t.campo, borderColor: erro ? t.erro : t.linha }}>
        <Text style={{ flex: 1, fontSize: 16, color: cidade ? t.texto : t.suave }}>{cidade || 'Escolher a cidade'}</Text>
        {!!cidade && opcional && <Pressable accessibilityRole="button" accessibilityLabel="Limpar cidade" onPress={() => aoMudar('')} hitSlop={10} style={{ marginRight: 8 }}><Icone nome="close-circle" tamanho={20} cor={t.suave} /></Pressable>}
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