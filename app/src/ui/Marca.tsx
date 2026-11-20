// Marca QIMA: o mesmo desenho do site (public/qima-logo.svg e favicon.svg), em vetor.
import { Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

export const VERMELHO_QIMA = '#e4002b';
export const AZUL_QIMA = '#0c303e';

const LOGO = 'M138.024 8.424a7.167 7.167 0 0 1 14.334 0V76.95a7.167 7.167 0 0 1-14.334 0ZM331.726 74.153l30.3-67.594a9.25 9.25 0 0 1 8.74-5.827 9.73 9.73 0 0 1 9.091 5.827l30.302 67.594a7.8 7.8 0 0 1 .815 3.03 6.72 6.72 0 0 1-6.759 6.876c-3.38 0-5.490-2.01-6.992-5.011l-6.644-15.267h-39.623l-6.877 15.733c-1.522 3.002-3.612 4.545-6.642 4.545a6.567 6.567 0 0 1-6.643-6.643 7.8 7.8 0 0 1 .932-3.263m53.376-23.075-14.334-32.981-14.335 32.98ZM89.206 79.093 78.039 67.927a43.081 43.081 0 1 0-10.112 10.112l11.166 11.167a7.15 7.15 0 0 0 10.113-10.113M14.302 43.012a28.71 28.71 0 1 1 28.71 28.71 28.74 28.74 0 0 1-28.71-28.710M206.932 8.657c0-7.796 10.943-10.276 15.383-3.380l24.707 38.692L271.845 5.160c3.944-6.786 15.267-4.333 15.267 3.496V76.950a7.090 7.090 0 0 1-7.226 7.110 7.015 7.015 0 0 1-6.875-7.110V28.206s-16.885 25.183-20.040 29.748c-3.181 4.603-8.820 4.588-11.912 0l-20.025-29.718v48.830a6.966 6.966 0 0 1-7.110 6.993 6.870 6.870 0 0 1-6.992-6.992Z';
const Q = 'M89.206 79.093 78.039 67.927a43.081 43.081 0 1 0-10.112 10.112l11.166 11.167a7.15 7.15 0 0 0 10.113-10.113M14.302 43.012a28.71 28.71 0 1 1 28.71 28.71 28.74 28.74 0 0 1-28.71-28.710';

/** Palavra QIMA (largura em dp; a altura acompanha a proporção do desenho). */
export function LogoQima({ largura = 160, cor = VERMELHO_QIMA }: { largura?: number; cor?: string }) {
  return <Svg width={largura} height={(largura * 91.301) / 411} viewBox="0 0 411 91.301"><Path fill={cor} d={LOGO} /></Svg>;
}

/** Só o "Q" da marca (ícone). */
export function SimboloQ({ tamanho = 40, cor = VERMELHO_QIMA }: { tamanho?: number; cor?: string }) {
  return <Svg width={tamanho} height={tamanho} viewBox="0 0 92 92"><Path fill={cor} d={Q} /></Svg>;
}

/** QIMA | HUB, como no topo do site. */
export function MarcaHub({ largura = 120, corHub = AZUL_QIMA, corLogo = VERMELHO_QIMA }: { largura?: number; corHub?: string; corLogo?: string }) {
  const alt = (largura * 91.301) / 411;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <LogoQima largura={largura} cor={corLogo} />
      <View style={{ width: 1.5, height: alt * 1.05, backgroundColor: corHub, opacity: 0.25, marginHorizontal: alt * 0.45 }} />
      <Text style={{ color: corHub, fontWeight: '900', fontSize: alt * 0.82, letterSpacing: alt * 0.12 }}>HUB</Text>
    </View>
  );
}
