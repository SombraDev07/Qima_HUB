# QIMA HUB Â· App do Solicitante Â· Plano

> Status: **plano** (nada construÃ­do ainda). Esta pasta Ã© um projeto **separado** do site: tem o prÃ³prio `package.json`,
> as prÃ³prias dependÃªncias e o prÃ³prio ciclo de publicaÃ§Ã£o. O site (`core/`, `modules/`) nÃ£o importa nada daqui.

## 1. O que Ã©

Um aplicativo de celular para a pessoa que **solicita** (campo): abre e acompanha pedidos dos **7 sistemas** do HUB
(ContrataÃ§Ã£o, Equipamentos, Hospedagens, Frotas, SolicitaÃ§Ãµes, Despesas, Nota NF) usando **a mesma conta e o mesmo banco** do site.

Regras:
- SÃ³ existe o lado **Solicitante**. Nada de Central, AdministraÃ§Ã£o ou RelatÃ³rios no app (isso continua no site, no computador).
- Quem Ã© Central no site tambÃ©m pode abrir o app e usar a parte de Solicitante (a regra do servidor jÃ¡ permite).
- Perfil RTV continua sem telas.
- Tem que rodar na maior quantidade possÃ­vel de celulares **Android** e ser simples de usar com uma mÃ£o, em rede ruim.
- iPhone: fora do escopo do app (exigiria conta Apple paga). Quem usa iPhone segue pelo site.

## 2. DecisÃ£o de tecnologia

| OpÃ§Ã£o | Alcance | CÃ¢mera/GPS/push | EsforÃ§o | Veredito |
|---|---|---|---|---|
| **React Native com Expo** (TypeScript) | Android e iOS com um sÃ³ cÃ³digo | Nativo, completo | MÃ©dio: telas novas, mesma API | **Escolhida** |
| PWA (o prÃ³prio site instalÃ¡vel) | Qualquer celular com navegador | CÃ¢mera ok; push fraco no iPhone; sem loja | Baixo | Plano B / ponte rÃ¡pida |
| Capacitor (empacotar o site) | Android e iOS | Plugins | Baixo-mÃ©dio, mas a interface fica de "site" | NÃ£o |
| Flutter / nativo duplo | Android e iOS | Completo | Alto (outra linguagem, sem reaproveitar nada) | NÃ£o |

Por que Expo: o time jÃ¡ usa JavaScript/React; um cÃ³digo sÃ³ gera Android e iOS; cÃ¢mera, GPS, notificaÃ§Ãµes, armazenamento seguro
e envio em segundo plano sÃ£o mÃ³dulos prontos; atualizaÃ§Ãµes de tela sem passar pela loja (EAS Update); build na nuvem sem Mac para o Android.

**Compatibilidade esperada** (confirmar na documentaÃ§Ã£o do Expo quando criarmos o projeto): Android 7+ (cerca de 99% dos aparelhos
ativos). Telas pensadas para 360 px de largura, fonte do sistema ampliada, modo escuro e retrato. Celulares fracos:
imagens leves, listas paginadas, sem animaÃ§Ãµes pesadas.

## 3. Arquitetura

```
 App (Expo)  â”€â”€HTTPSâ”€â”€â–¶  API do HUB (a mesma da Vercel: /api/...)  â”€â”€â–¶  Postgres + Storage (Supabase)
```

- **O app nunca fala direto com o Supabase.** Usa a API que jÃ¡ existe. Assim o RLS continua fechado, as regras de perfil e de
  dono continuam num lugar sÃ³ e nenhuma chave do banco vai para dentro do aplicativo (chave em app instalado Ã© chave vazada).
- "Mesmo banco usando a conta" = mesmo e-mail e senha do site, mesmos dados, mesmo histÃ³rico dos pedidos.
- Rotas jÃ¡ prontas que o app reaproveita: `/api/me` (cards e perfil), `/api/notificacoes`, e em cada sistema as rotas de
  Solicitante em `/api/m/<sistema>/...`.

### MudanÃ§as necessÃ¡rias no servidor (pequenas, no projeto web)

| # | MudanÃ§a | Motivo |
|---|---|---|
| S1 | **Login por token** para app: `POST /api/auth/app/login` devolve um token longo (guardado sÃ³ como hash no banco, com aparelho, Ãºltimo uso e validade de 30 dias renovÃ¡vel); o servidor passa a aceitar `Authorization: Bearer` alÃ©m do cookie. Logout e "sair de todos os aparelhos" | Cookie nÃ£o Ã© o jeito natural em app nativo |
| S2 | Limite de tentativas, bloqueio e auditoria do login valem tambÃ©m para o app (jÃ¡ existem; sÃ³ ligar na nova rota) | SeguranÃ§a |
| S3 | **Envio direto da foto ao Storage** por URL assinada curta (`POST .../upload-url`, o app envia e depois confirma) | A Vercel recusa corpo acima de ~4,5 MB; resolve tambÃ©m a lentidÃ£o em rede ruim |
| S4 | Tabela `dispositivos` + rotas para registrar o token de notificaÃ§Ã£o (push) | Avisos: pedido aprovado, devolvido para correÃ§Ã£o, etc. |
| S5 | `GET /api/app/versao`: versÃ£o mÃ­nima aceita e aviso de manutenÃ§Ã£o | ForÃ§ar atualizaÃ§Ã£o se mudar algo incompatÃ­vel |
| S6 | Ignorar `app/` no deploy da Vercel (`ignoreCommand`) | Mexer no app nÃ£o republica o site |

Nenhuma dessas mudanÃ§as altera o site atual.

## 4. SeguranÃ§a do app

- Token no **armazenamento seguro** do celular (Keychain/Keystore via `expo-secure-store`), nunca em AsyncStorage.
- SÃ³ HTTPS; fixar o domÃ­nio da API; sem logs de dados pessoais.
- Bloqueio opcional do app por biometria/PIN do aparelho ao abrir.
- SessÃ£o expira por inatividade (30 dias) e o administrador pode derrubar uma conta (jÃ¡ derruba sessÃµes; passa a derrubar tokens do app).
- Perfil lido do servidor a cada abertura: se a pessoa perder acesso, o card some.
- Nenhum segredo no pacote do app (sÃ³ a URL da API).
- Dados em cache offline limitados ao necessÃ¡rio e apagados no logout.
- Antes de publicar: revisÃ£o com a skill `security-audit` (jÃ¡ estÃ¡ em `.claude/skills/`) e teste de interceptaÃ§Ã£o de rede.

## 5. Telas e navegaÃ§Ã£o (poucas e grandes, para o polegar)

Barra inferior com 3 abas: **InÃ­cio** Â· **Pedidos** Â· **Perfil**.

- **InÃ­cio:** cards dos sistemas que a pessoa tem (os mesmos do site, sem "Central"), com o resumo de cada um e o sino de pendÃªncias.
- **Dentro de cada sistema:** lista dos meus pedidos com filtro por situaÃ§Ã£o, botÃ£o grande "Novo", detalhe com histÃ³rico e aÃ§Ãµes do solicitante.
- **Perfil:** dados da conta, trocar senha, sair, sair de todos os aparelhos, versÃ£o do app.
- FormulÃ¡rios em etapas curtas, teclado certo para cada campo (numÃ©rico, e-mail), botÃ£o principal fixo no rodapÃ©, rascunho salvo automaticamente.
- Mensagens de erro em portuguÃªs, simples, dizendo o que fazer.

### O que cada sistema ganha no celular

| Sistema | Fluxo no app | Recurso nativo |
|---|---|---|
| **Frotas** | Pedir veÃ­culo, ver meus veÃ­culos, **8 fotos obrigatÃ³rias com GPS**, abrir chamado, trocar placa/condutor | CÃ¢mera **dentro do app** (sem galeria), GPS, envio em segundo plano |
| **Despesas** | Tirar ou escolher a foto da nota, conferir os dados lidos pela IA, enviar o reembolso | Seletor do celular, compressÃ£o |
| **Nota NF** | Tirar ou escolher a foto da NF de semente, conferir, enviar | Seletor do celular, compressÃ£o |
| **Equipamentos** | Montar pedidos em rascunho, enviar, ver responsÃ¡veis, pedir troca/devoluÃ§Ã£o | NotificaÃ§Ãµes |
| **SolicitaÃ§Ãµes** | Dados digitados ou planilha, conversa de correÃ§Ã£o | Anexar arquivo, notificaÃ§Ã£o de resposta |
| **Hospedagens** | Pedir hotel, ver status, cancelar | NotificaÃ§Ãµes |
| **ContrataÃ§Ã£o** | Pedir vaga, acompanhar candidatos | NotificaÃ§Ãµes |

## 6. ConexÃ£o ruim e envio de arquivos (o ponto crÃ­tico do campo)

- **Fila de envio** no aparelho: foto tirada sem sinal fica guardada e sobe quando a rede voltar, com tentativa automÃ¡tica e aviso na tela ("2 fotos aguardando envio").
- Foto reduzida no aparelho (alvo de 0,8 a 1,5 MB, lado maior 1600 px) antes de enviar. Original sÃ³ se o sistema exigir.
- GPS e data/hora gravados **no momento da foto** (nÃ£o no envio) e enviados junto.
- Cada envio com chave de idempotÃªncia, para o reenvio nÃ£o duplicar.
- Leitura de listas com cache curto: abrir o app sem rede mostra o Ãºltimo estado e deixa claro que estÃ¡ desatualizado. AÃ§Ãµes que alteram dados exigem rede (exceto fotos e rascunhos, que entram na fila).

## 7. Estrutura da pasta

```
app/
  PLANO.md  README.md
  package.json  app.config.ts  tsconfig.json  eas.json
  src/
    api/            cliente da API (token, erros, repetiÃ§Ã£o, fila de envio)
    auth/           login, armazenamento seguro, biometria
    ui/             componentes visuais comuns (botÃ£o, campo, lista, cartÃ£o, vazio, erro)
    tema/           cores QIMA (#0c303e / vermelho), tipografia, modo escuro
    nav/            abas e pilhas de navegaÃ§Ã£o
    sistemas/
      frotas/  despesas/  nota_nf/  equipamentos/  solicitacoes/  hospedagens/  contratacao/
        (cada um: telas, serviÃ§os, tipos; um sistema nÃ£o importa o outro, igual ao site)
    push/           registro e tratamento de notificaÃ§Ãµes
  assets/           Ã­cone, splash
```

Regra herdada do site: **um sistema nÃ£o importa cÃ³digo de outro**; sÃ³ usa `api/`, `ui/` e `tema/`.
Tipos da API ficam em um arquivo por sistema, escritos a partir das rotas do servidor.

## 8. Fases

| Fase | Entrega | Pronto quando |
|---|---|---|
| *(opcional, depois)* **iPhone (PWA)** | Site instalÃ¡vel (Ã­cone, tela cheia) no projeto web, sem custo | iPhone instala o HUB na tela inicial |
| **0 Â· Base** | Projeto Expo, tema, login por token (S1 e S2), inÃ­cio com os cards e o sino, perfil, sair | Entro com minha conta, vejo sÃ³ meus sistemas (sem Central), sem erro no Android e no iPhone |
| **1 Â· Campo** | **Frotas**, **Despesas** e **Nota NF** completos, com cÃ¢mera, GPS, compressÃ£o, fila e envio direto ao Storage (S3) | Fotografo e envio sem sinal, a foto sobe quando volta, e o pedido aparece certo no site |
| **2 Â· Pedidos** | **Equipamentos** e **SolicitaÃ§Ãµes** | Crio, envio e acompanho como no site |
| **3 Â· Resto** | **Hospedagens** e **ContrataÃ§Ã£o** | Paridade com o Solicitante do site |
| **4 Â· Avisos** | Push (S4), versÃ£o mÃ­nima (S5), biometria | Recebo o aviso quando a Central age no pedido |
| **5 Â· PublicaÃ§Ã£o** | Android (teste interno â†’ Play Store) e iOS (TestFlight â†’ App Store), Ã­cones, textos da loja, polÃ­tica de privacidade | InstalÃ¡vel por link/loja |

A ordem pÃµe Frotas, Despesas e Nota NF primeiro porque sÃ£o onde o celular faz mais diferenÃ§a (foto e GPS no campo).

## 9. Testes

- Aparelhos reais: um Android de entrada (2 GB de RAM), um Android intermediÃ¡rio e um iPhone mais antigo.
- Rede: 3G simulada, modo aviÃ£o no meio do envio, troca de Wi-Fi para 4G.
- Testes automÃ¡ticos do cliente da API e da fila de envio; testes de ponta a ponta nos fluxos de foto.
- Os mesmos testes de permissÃ£o do servidor (solicitante nÃ£o vÃª pedido de outro) rodam contra as rotas usadas pelo app.
- RevisÃ£o de seguranÃ§a antes de cada publicaÃ§Ã£o.

## 10. PublicaÃ§Ã£o e custos

- **Android:** primeiro distribuiÃ§Ã£o interna por link (APK do EAS, instalaÃ§Ã£o direta). Depois, se quiserem, conta Google Play
  (taxa Ãºnica de cerca de US$ 25) com **teste fechado**: sÃ³ entra quem recebe o link ou o convite, sem aparecer na busca da loja.
- **iPhone:** **sem conta Apple**, usa o PWA (seÃ§Ã£o 14).
- Builds e atualizaÃ§Ãµes pelo EAS (plano gratuito atende o inÃ­cio).
- Para uso sÃ³ interno, dÃ¡ para publicar como app **privado/nÃ£o listado**.

## 11. Riscos

| Risco | MitigaÃ§Ã£o |
|---|---|
| iPhone sem conta Apple | PWA (seÃ§Ã£o 14); limites conhecidos: sem fila em segundo plano |
| Foto grande em rede ruim | CompressÃ£o + URL assinada + fila (seÃ§Ã£o 6) |
| Duas bases de interface (site e app) divergirem | API Ãºnica; regras sÃ³ no servidor; telas do app sÃ³ apresentam |
| PermissÃ£o de cÃ¢mera/GPS negada pelo usuÃ¡rio | Tela explicando o motivo e como liberar; Frotas nÃ£o deixa enviar sem GPS (regra jÃ¡ existente) |
| Celular muito antigo | Definir o piso (Android 7+ / iOS 15+) e avisar na instalaÃ§Ã£o |

## 12. DecisÃµes tomadas

| # | DecisÃ£o | ConsequÃªncia |
|---|---|---|
| 1 | **Sem conta Apple Developer; foco em Android** | App nativo sÃ³ para **Android**. iPhone **nÃ£o Ã© prioridade**: quem tiver iPhone continua usando o site no navegador. O PWA (seÃ§Ã£o 14) Ã© opcional e gratuito, fica para depois |
| 2 | Nome: **QIMA HUB** | Pacote `br.com.qima.hub` (confirmar domÃ­nio da empresa) |
| 3 | DistribuiÃ§Ã£o **interna**, talvez loja com **link escondido** | Android: link direto do APK/AAB agora; depois Google Play em **teste fechado** (sÃ³ entra quem tem o link/convite). Sem loja pÃºblica |
| 4 | **Cloudflare depois** que existir a primeira versÃ£o do app | DomÃ­nio da API configurÃ¡vel no app (nÃ£o fixo no cÃ³digo), para trocar sem republicar |

Ainda em aberto: quem testa primeiro em campo (Frotas, Despesas e Nota NF).

## 13. Como cada sistema recebe a foto

A foto pode vir de dois jeitos, e cada sistema usa o que faz sentido:

| Modo | Como funciona | Onde |
|---|---|---|
| **Escolher** (cÃ¢mera ou galeria do prÃ³prio celular) | O app abre o seletor do sistema: a pessoa tira a foto com a cÃ¢mera do aparelho ou escolhe uma que jÃ¡ tirou. NÃ£o precisa de tela de cÃ¢mera prÃ³pria | **Despesas** e **Nota NF** (a nota jÃ¡ existe; o que vale Ã© a imagem legÃ­vel) |
| **Capturar no app** | CÃ¢mera dentro do app, que grava **GPS e hora no instante do clique** e nÃ£o aceita foto da galeria | **Frotas** (as 8 fotos do carro sÃ£o prova de estado e local) |

Motivo: em Frotas, uma foto escolhida depois da galeria perde a prova de "tirada agora, neste lugar" (a data e o GPS dela
podem ter sido apagados ou alterados). Em Despesas e Nota NF nÃ£o hÃ¡ essa exigÃªncia, entÃ£o escolher Ã© mais simples, funciona
em qualquer aparelho e nem pede permissÃ£o de cÃ¢mera.

## 14. iPhone sem conta Apple: PWA

- O site atual jÃ¡ funciona no celular; o PWA acrescenta: instalar na tela inicial, Ã­cone QIMA HUB, tela cheia, abertura rÃ¡pida.
- CÃ¢mera pelo seletor do navegador (tirar ou escolher) funciona no iPhone; GPS pelo navegador funciona com permissÃ£o.
- Limites no iPhone: sem fila de envio em segundo plano (a foto precisa subir com o app aberto) e notificaÃ§Ãµes sÃ³ no iOS 16.4+ com o app instalado.
- Isso serÃ¡ feito no projeto web (`public/manifest` e ajustes de tela), **fora da pasta `app/`**, como "Fase 0.5". Ã‰ pequeno e jÃ¡ atende o iPhone enquanto nÃ£o houver conta Apple.
- Se a conta Apple um dia existir, o mesmo cÃ³digo Expo gera a versÃ£o iPhone.

