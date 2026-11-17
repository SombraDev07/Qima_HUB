// Modelo de telas de um sistema. Importe apenas de '@hub' (API pública do núcleo).
import { PageHeader, Empty } from '@hub';

function Solicitante({ module, api }) {
  return (
    <>
      <PageHeader title={module.title} subtitle={module.labels.solicitante} />
      <Empty>Tela do solicitante</Empty>
    </>
  );
}

function Central({ module, api }) {
  return (
    <>
      <PageHeader title={module.title} subtitle={module.labels.central} />
      <Empty>Tela da central</Empty>
    </>
  );
}

export default { Solicitante, Central };
