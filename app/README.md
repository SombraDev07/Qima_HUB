# App do Solicitante (celular, Android)

Projeto **separado** do site. Não importa nada de `core/` nem de `modules/`, e o site não importa nada daqui.
Fala com o HUB só pela API (`/api/...`), com a mesma conta e o mesmo banco.

- Plano completo: [PLANO.md](PLANO.md)
- Tecnologia: React Native + Expo SDK 58 (TypeScript). Piso do Android: **7.0 (API 24)**
- Escopo: só o perfil **Solicitante** dos 7 sistemas (sem Central, Administração ou Relatórios)

## Estado

**Fases 0 e 1 a 3 prontas:** login por token, início (sistemas do Solicitante, pendências, perfil) e as telas completas do Solicitante dos 7 sistemas:
Hospedagens (viagens), Equipamentos, Solicitações (com conversa e planilha), Despesas e Nota NF (foto ou galeria, leitura por IA, reenvio de recusadas),
Frotas (pedidos, veículos, chamados e fotos do carro com câmera do app + GPS + carimbo) e Contratação (vagas e pedido de demissão).
Falta: notificações push, biometria, ícone/splash definitivos e teste em celular real.

**Segurança e uso (20/11/2026):** o login do app vale só como Solicitante (sem Central, Administração ou relatórios) e no máximo 90 dias;
Perfil com aparelhos conectados, bloqueio por digital/PIN e contato da central (definido no site em Administração → App);
fotos protegidas ficam só na memória e tudo do aparelho é apagado ao sair; fotos do Frotas sem GPS são aceitas ("Sem GPS" no carimbo)
e, sem internet, vão para uma fila que sobe sozinha; rascunho automático nos formulários novos; "Repetir pedido" (Hospedagens e Frotas);
mapa e ligação para o hotel; aviso do prazo do veículo nas pendências; notificações push (só no app instalado com projeto EAS: veja abaixo).

**Notificações push:** o servidor manda o mesmo aviso do e-mail para o celular. Para funcionar é preciso o app instalado (não o Expo Go),
`eas init` (grava o `projectId` no app.json) e as credenciais do Firebase (FCM) no EAS. Sem isso o app só não registra o aparelho.

**Alinhado com o site em 20/11/2026:** Frotas (modalidade diária/mensal com devolução e prazo de 30 dias, prazo limite com contagem,
motorista escolhido do banco de pessoas, fotos opcionais), Hospedagens (status pelas datas, abas Pedidos/Hóspedes/Quartos com
ajuste por hóspede ou do quarto inteiro, Finalizado trava os ajustes, demitidos em vermelho), Contratação (Meus Colaboradores com
filtros, requisitos Sim/Não, observação opcional, confirmação ao enviar e cancelar) e Equipamentos (projeto da lista da Central de Viagens).

## Rodar

```bash
cd app
powershell -File scripts/instalar.ps1     # instala as dependências com o node_modules FORA do OneDrive
npx expo start                            # abre o QR code; use o app Expo Go no celular Android
```

- Endereço da API: variável `EXPO_PUBLIC_API_URL` (veja `.env.example`). Sem ela usa `https://qima-hub.vercel.app`.
  Para testar com o servidor local: `EXPO_PUBLIC_API_URL=http://<IP-do-seu-PC>:3001` (celular e PC na mesma rede).
- Verificar tipos: `npx tsc --noEmit`. Conferir o pacote Android: `npx expo export --platform android`.
- **node_modules fora do OneDrive:** a pasta do projeto é sincronizada e o node_modules do React Native tem centenas de milhares
  de arquivos. O `scripts/instalar.ps1` move para `C:\QIMAHub-app\node_modules` e deixa uma junção. Rode-o em vez de `npm install`.
  A pasta `_junction_antiga_pode_apagar` é um resto da configuração e pode ser apagada à mão.

## Estrutura

```
src/api/    cliente da API (token, tempo limite, erros em português)
src/auth/   sessão, armazenamento seguro do token, versão mínima
src/tema/   cores e medidas (claro e escuro)
src/ui/     botão, campo, cartão, avisos
src/telas/  login, início, sistema, pendências, perfil
src/nav/    abas e pilha de navegação
```

## No servidor (já feito)

`POST /api/auth/app/login` (mesmos limites de tentativa e auditoria do site), `.../app/logout`, `.../app/logout-all`,
`GET /api/app/versao`, `?lado=solicitante` em `/api/me` e `/api/notificacoes`, tabela `app_tokens` (só o hash do token,
validade de 30 dias renovada a cada uso; trocar a senha ou desativar a conta derruba os tokens).
