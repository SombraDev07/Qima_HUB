// Contato da central (definido no site em Administração → App): ligar, WhatsApp e e-mail com um toque.
import { useEffect, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { api } from '../api/cliente';
import { useTema } from '../tema';
import { Botao, Cartao } from './index';

type Contato = { telefone: string; whatsapp: string; email: string; horario: string };
let guardado: Contato | null = null;
const digitos = (s: string) => s.replace(/\D/g, '');

export function useContato() {
  const [c, setC] = useState<Contato | null>(guardado);
  useEffect(() => { api<Contato>('/api/app/contato').then((x) => { guardado = x; setC(x); }).catch(() => {}); }, []);
  return c;
}

/** Cartão "Falar com a central". Some se a central não cadastrou nenhum contato. assunto vai pronto na mensagem. */
export function FalarComCentral({ assunto, compacto = false }: { assunto?: string; compacto?: boolean }) {
  const t = useTema();
  const c = useContato();
  if (!c || !(c.telefone || c.whatsapp || c.email)) return null;
  const zap = digitos(c.whatsapp);
  const msg = assunto ? `Olá, preciso de ajuda com ${assunto}.` : '';
  return (
    <Cartao estilo={{ marginTop: compacto ? 10 : 16 }}>
      <Text style={{ color: t.texto, fontWeight: '800', fontSize: 15 }}>Falar com a central</Text>
      {!!c.horario && <Text style={{ color: t.suave, fontSize: 13 }}>{c.horario}</Text>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
        {!!c.telefone && <Botao titulo="Ligar" icone="call-outline" variante="suave" pequeno onPress={() => Linking.openURL(`tel:${digitos(c.telefone)}`)} />}
        {!!zap && <Botao titulo="WhatsApp" icone="logo-whatsapp" variante="suave" pequeno
          onPress={() => Linking.openURL(`https://wa.me/${zap.length <= 11 ? `55${zap}` : zap}${msg ? `?text=${encodeURIComponent(msg)}` : ''}`)} />}
        {!!c.email && <Botao titulo="E-mail" icone="mail-outline" variante="suave" pequeno
          onPress={() => Linking.openURL(`mailto:${c.email}${assunto ? `?subject=${encodeURIComponent(`QIMA HUB · ${assunto}`)}` : ''}`)} />}
      </View>
    </Cartao>
  );
}
