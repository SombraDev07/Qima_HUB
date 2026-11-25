<div align="center">

<img src="public/qima-logo.svg" alt="QIMA" height="64" />

# QIMA HUB

**Um portal, vários sistemas internos.**
Solicite, acompanhe e atenda os pedidos de cada área em um só lugar, no computador ou no celular.

![Node](https://img.shields.io/badge/Node-22.13%2B-339933?logo=node.js&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)
![Express](https://img.shields.io/badge/Express-4-000000?logo=express&logoColor=white)
![Postgres](https://img.shields.io/badge/Postgres-Supabase-3ECF8E?logo=supabase&logoColor=white)
![Deploy](https://img.shields.io/badge/Deploy-Vercel%20(S%C3%A3o%20Paulo)-000000?logo=vercel&logoColor=white)
![App](https://img.shields.io/badge/App-Android%20(Expo)-000020?logo=expo&logoColor=white)
![Status](https://img.shields.io/badge/status-em%20produ%C3%A7%C3%A3o-brightgreen)

</div>

---

## ✨ O que é

O HUB reúne os sistemas que antes eram apps separados do PowerApps. Cada pessoa entra uma vez e vê só os
cards dos sistemas a que tem acesso. Em cada sistema existem dois perfis:

| Perfil | O que faz |
|---|---|
| 🙋 **Solicitante** | Abre o pedido, acompanha, corrige e conversa com a central. Usa pelo site ou pelo **app de celular**. |
| 🛠️ **Central** | Recebe, analisa e atende. Também **cria os próprios pedidos** (usa a área do Solicitante), mas **não analisa nem paga o próprio**. Baixa o **relatório em Excel** dos sistemas em que é Central pela página **Relatórios** ou pelo botão *Relatório* da barra do sistema, sem acesso a mais nada da Administração. |
| 🧭 **RTV** | Perfil já cadastrável na Administração, mas **ainda sem telas**: reservado para uso futuro. |
| ⚙️ **Administração** | Cria contas, define o perfil de cada pessoa por sistema, baixa relatórios, configura a IA e o contato do app, e vê a auditoria. |

## 🧩 Sistemas

| | Sistema | Para quê | Destaques |
|---|---|---|---|
| 👷 | **Contratação** | Vagas, candidatos e demissões | Banco de pessoas (com RG e BU), CPF validado, importação de planilha, cidade obrigatória para enviar a vaga |
| 💻 | **Equipamentos** | Notebooks, celulares, monitores e chips | Operação pede em rascunhos, o Administrativo reserva e envia, troca de responsável, devolução e baixa com histórico |
| 🏨 | **Hospedagens** | Reserva de hotéis para equipes em viagem | Quartos de até 4 hóspedes, diária por ocupação, check-out parcial, financeiro com anexos |
| 🚗 | **Frotas** | Pedidos de veículo e chamados | Fotos do carro com GPS e carimbo, modalidade diária ou mensal, troca de placa e de condutor, controle mestre |
| 📋 | **Solicitações** | Pedidos para a Central Harvest | Planilha Excel ou dados digitados, chat de correção, quadro em 4 colunas |
| 🧾 | **Despesas** | Reembolso com foto da nota | Leitura por IA, nota duplicada, PIX, taxa no pagamento, ZIP e PDF do pedido, PDF das notas pagas por período com total por categoria |
| 🌱 | **Nota NF** | NFs de semente de soja | Só itens de soja, chave de acesso conferida, germinação padrão |
| 🗓️ | **Horas de Auditoria** | Planejamento semanal de horas por distrito | Budget, auditores e veículos, edição compartilhada com autoria, painel de dados, aprovação e lançamento pela Central |
| ✈️ | **Viagem** | Passagens de ônibus e avião | Vários passageiros puxados do banco de pessoas da Contratação, aceite, passagem anexada, localizador e valor, recusa com motivo |
| 🗂️ | **Caju** | Versão anterior de equipamentos (SharePoint) | Reservado, ainda sem telas |

Cada sistema tem seu próprio sininho, mostrando só as pendências dele.

## 🏗️ Arquitetura

```mermaid
flowchart LR
  subgraph Clientes
    W["💻 Site<br/>central e solicitante"]
    A["📱 App Android<br/>só solicitante"]
  end
  subgraph Vercel["Vercel (São Paulo)"]
    API["API do HUB<br/>Express"]
  end
  subgraph Supabase
    DB[("Postgres<br/>RLS ligado, sem políticas")]
    ST[("Storage privado<br/>fotos e anexos")]
  end
  IA["🤖 Serviço de IA<br/>leitura de fotos"]
  W -- cookie de sessão --> API
  A -- token do app --> API
  API --> DB
  API --> ST
  API --> IA
```

- **Só o servidor fala com o banco e com o Storage.** O navegador e o app nunca recebem chave do Supabase nem da IA.
- **Login próprio do HUB:** senha com scrypt, sessão por cookie `HttpOnly; Secure; SameSite=Lax` no site e token
  de até 90 dias no app (guardados no banco só como hash).
- O **app de celular** é um projeto separado em [`app/`](app/README.md) (React Native + Expo) e usa a mesma API e o mesmo banco.

### Pensada para manutenção por sistema

```
core/                      ← núcleo: login, contas, permissões, tela inicial, administração
  server/                  ← API do núcleo, carregador de módulos, banco (pg.js), IA, arquivos, segurança
  web/                     ← telas do núcleo
  web/shared/              ← API pública para os módulos (import ... from '@hub')
modules/
  hospedagens/             ← UM sistema = UMA pasta, independente
    module.json            ← nome, ícone, versão, rótulos dos botões
    server/index.js        ← rotas, migrações do banco, resumo do card, sininho
    web/index.jsx          ← telas Solicitante e Central
  frotas/ …
  _template/               ← modelo para criar um novo sistema
app/                       ← app Android do solicitante (projeto separado)
api/                       ← entrada da função da Vercel
scripts/                   ← migrações, dados de teste, geração do registro de módulos
docs/                      ← plano de migração e segurança
```

Regras que garantem o isolamento:

1. **Um sistema nunca importa código de outro.** Só usa `@hub` (frontend) e o `ctx` recebido (backend).
2. **Tabelas com prefixo da chave** (`hospedagens_pedidos`, `frotas_veiculos`…). A exceção combinada é o banco de pessoas da Contratação, usado também por Hospedagens, Frotas e Viagem.
3. **Rotas isoladas** em `/api/m/<chave>/…`. O núcleo valida login, se o sistema está ativo e o perfil da pessoa **a cada pedido**, lendo do banco.
4. **Migrações versionadas por sistema.** Para evoluir o banco, adicione `{ version: N+1, async up(db) {…} }`; nunca altere uma já publicada.
5. **Falha isolada:** se um sistema der erro ao carregar, os demais continuam e o erro aparece em *Administração → Sistemas*.
6. **Pacotes separados:** cada sistema vira um arquivo JS próprio, carregado só quando aberto.

## 🔐 Segurança

Resumo do que o servidor garante (detalhes em [docs/seguranca.md](docs/seguranca.md)):

| Tema | Proteção |
|---|---|
| **Permissões** | Perfil e admin só mudam pela Administração. O perfil é relido do banco a cada pedido; nada que o navegador mande (corpo, cabeçalho, URL) muda o perfil. O token do app vale só como Solicitante, nunca como Central ou admin. |
| **Login** | Mesma resposta e mesmo tempo para e-mail inexistente e senha errada; limite de tentativas por e-mail e por IP; "esqueci a senha" não revela se o e-mail existe; link de redefinição de 30 minutos e uso único; trocar ou redefinir a senha derruba as outras sessões. |
| **Dados pessoais** | O solicitante vê CPF, RG, nascimento, telefone e e-mail de terceiros **mascarados** (ex.: `123.***.***-09`); só a Central vê inteiros. Ninguém sobrescreve documento de outra pessoa pelo pedido. |
| **Uploads** | O servidor confere o **conteúdo real** do arquivo (não o tipo declarado): recusa HTML/EXE/ZIP disfarçados, PDF com script, Excel com macro, `.xlsm` e `.csv`, e imagens acima de 50 megapixels ("bomba de pixels"). Fotos aceitas: JPG, PNG, WEBP (e GIF/BMP em Hospedagens); planilhas: `.xlsx` e `.xls`. |
| **Limites de uso** | Por pessoa e por sistema: rajada a cada 10 minutos e **teto de 100 envios por dia** (Despesas, Nota NF, Frotas, Solicitações, Viagem e Hospedagens). Texto até 10.000 caracteres por campo; corpo JSON até 1 MB. |
| **Regras de negócio** | Pedido de reembolso pago fica travado; quem tem perfil "ambos" não aprova nem paga o próprio pedido; valores precisam ser positivos. |
| **Navegador** | CSP sem script de fora, HSTS, `X-Frame-Options: DENY`, `nosniff`, sem source map; pedidos que alteram dados só valem vindos do próprio site (Origin/Referer). |
| **Banco** | Todas as tabelas com RLS ligado e nenhuma política: a chave pública do Supabase não lê nem grava nada. |
| **Administração** | Mudanças de conta, sistema e IA ficam na auditoria. Trocar a URL da IA exige digitar a chave de novo. |

## 🚀 Começando

Requer **Node 22.13+**.

```bash
npm install
npm run dev
```

- Web: <http://localhost:5173> · API: <http://localhost:3001>
- Sem configurar nada, o HUB usa um **Postgres embutido** (PGlite) para desenvolvimento. Se o projeto estiver numa
  pasta sincronizada (OneDrive, Dropbox), o banco fica em `%LOCALAPPDATA%\QIMAHub\pg`, fora dela.
- No primeiro start (banco vazio) é criado o administrador `admin@qima.local`. Em desenvolvimento a senha é `admin123`;
  **em produção nunca existe senha padrão**: sem `QIMA_ADMIN_PASSWORD`, uma senha aleatória é gerada e mostrada uma única vez.

### Dados de teste

Com o servidor rodando:

```bash
npm run seed
```

Cria contas, cadastros e pedidos de teste em vários estados, com cupons e notas fictícias.
Contas criadas (senha `teste123`): `marina@`, `rafael@`, `joana@qima.local` (solicitantes) e `central@qima.local` (central).

> ⚠️ O seed grava no banco apontado por `DATABASE_URL`. Se for o do Supabase, os dados de teste vão para a produção.

### Usando o Supabase

Copie `.env.example` para `.env` e preencha:

```ini
DATABASE_URL=postgresql://postgres:SENHA@db.SEU-PROJETO.supabase.co:5432/postgres
```

Ao iniciar, o servidor cria as tabelas sozinho. Em produção (Vercel) rode `npm run migrate` a cada publicação e use o
endereço do **pooler** (porta 6543, modo transação).

### Variáveis de ambiente

| Variável | Para quê |
|---|---|
| `DATABASE_URL` | Postgres do Supabase. Vazio = Postgres embutido local |
| `QIMA_PG_DIR` | Pasta do Postgres embutido |
| `QIMA_SEGREDO` | Segredo que protege a chave da IA (obrigatório em produção) |
| `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` | Fotos e anexos no Supabase Storage (bucket privado). A chave é **secreta**: só no servidor. Sem ela, em desenvolvimento usa `data/uploads`; na Vercel o envio é recusado |
| `QIMA_BUCKET` | Nome do bucket (padrão `qima-arquivos`) |
| `DEEPSEEK_API_KEY` / `QIMA_AI_MODEL` | Leitura de notas pelo DeepSeek, se nada estiver salvo na Administração |
| `QIMA_AI_PROVIDER` | IA padrão quando nada foi salvo na Administração (`demo` só para testes) |
| `QIMA_ADMIN_EMAIL` / `QIMA_ADMIN_PASSWORD` | Administrador criado no primeiro start |
| `QIMA_URL` | Endereço público do site, usado nos links de redefinição de senha (na Vercel, se vazio, usa o domínio de produção) |
| `QIMA_ORIGENS` | Outros domínios autorizados a enviar pedidos de alteração (normalmente vazio) |
| `QIMA_CF_SEGREDO` | Com Cloudflare na frente: mesmo valor da regra que adiciona o cabeçalho `x-origin-verify` (o limite por IP passa a ver o IP real) |
| `QIMA_CONFIAR_PROXY` | `1` só se houver um proxy seu na frente do servidor |
| `QIMA_APP_VERSAO_MINIMA` / `QIMA_APP_MANUTENCAO` / `QIMA_APP_AVISO` | Versão mínima do app aceita e aviso de manutenção mostrado no app |
| `QIMA_FUSO_HORAS` | Fuso dos relatórios (padrão `-3`, Brasília) |
| `PORT` | Porta da API em produção fora da Vercel |

### Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | API + web em desenvolvimento |
| `npm run build` | Gera o frontend em `dist/` |
| `npm start` | Servidor de produção (serve o `dist/`) |
| `npm run migrate` | Cria/atualiza as tabelas no banco de `DATABASE_URL` |
| `npm run seed` | Dados de teste |
| `npm run registro` | Regenera `modules/registro.js` (a lista fixa de sistemas; roda sozinho antes de `dev`, `start` e `build`) |

## 🛡️ Administração

- **Contas e Sistemas:** cadastro, perfil por sistema (solicitante, central, ambos ou RTV), status e ordem dos cards,
  link de redefinição de senha e desbloqueio de quem errou a senha demais.
- **Relatórios:** escolha o período e baixe um **Excel por sistema** ou um geral. Cada sistema tem uma aba do
  solicitante e uma da central, ligadas pelo código do pedido, mais abas de detalhe. Despesas também gera o **PDF das notas pagas** do período.
- **Inteligência artificial:** escolha quem lê as fotos: desligada (modo manual), qualquer serviço com API
  compatível com OpenAI (**DeepSeek**, OpenAI, Gemini, Azure, OpenRouter, Ollama), a demonstração ou um conector próprio.
  Liga e desliga por sistema, botão **Testar conexão** e contagem de uso. A chave da API fica **criptografada**.
- **App:** contato da central mostrado no app de celular.
- **Auditoria:** logins, bloqueios, senhas e mudanças de conta, sistema e IA.

## 🧱 Criar um novo sistema

1. Copie `modules/_template` para `modules/<chave>` (minúsculas, sem espaço).
2. Ajuste o `module.json` (a `key` é igual ao nome da pasta) e troque `NOME_DA_PASTA` nos arquivos.
3. Reinicie o servidor. O sistema aparece em *Administração → Sistemas*, pronto para ser liberado.

O backend recebe um `ctx` com:

| `ctx` | Para quê |
|---|---|
| `db.get / all / run / tx` | Banco Postgres, sempre com `await`. Dentro de `db.tx(async (t) => …)` use só o `t` |
| `requireRole('solicitante' \| 'central')` | Middleware de perfil |
| `limitar({ nome, max, janelaMin, porDia })` | Limite de uso por pessoa (rajada e teto diário) para envios de arquivo |
| `arquivos.salvar / enviar / ler / apagar` | Fotos e anexos no Storage privado. `arquivos.conferir(buffer, mime)` confere o conteúdo real antes de salvar |
| `notify(email, assunto, html)` | Coloca um e-mail na caixa de saída (`outbox`) e avisa o app por push |
| `usuariosComPerfil(perfil)` | Contas ativas com o perfil no sistema |
| `ai.extrair(...)` | Leitura de documentos por IA, respeitando o liga/desliga da Administração |
| `files.xlsx / files.zip` | Geração de planilhas e ZIPs para download |

**Padrão de desempenho:** listas numa consulta só (sem consulta por linha), com limite por período, e nenhuma
chamada externa (IA, e-mail) dentro de transação. O exemplo completo está em `modules/solicitacoes/server/index.js`.

**Padrão de segurança:** toda rota com `:id` confere o dono (ou o perfil Central) antes de responder; dado pessoal de
terceiros só vai inteiro para a Central; todo upload passa por `limitar` e `arquivos.conferir`.

## 🗺️ Roadmap

- [x] Núcleo: contas, perfis, sistemas, relatórios, IA configurável e auditoria
- [x] Sistemas migrados do PowerApps, com melhorias, mais Horas de Auditoria e Viagem
- [x] Banco no Postgres do Supabase, com RLS
- [x] Fotos e anexos no Supabase Storage, pelo servidor
- [x] Publicação na Vercel, na região de São Paulo
- [x] App Android do solicitante (login por token, os sistemas do Solicitante, fotos com GPS, fila sem internet)
- [x] Revisão de segurança: permissões, dados pessoais, uploads, limites de uso e cabeçalhos
- [ ] Domínio próprio (e Cloudflare na frente, se for usado)
- [ ] Envio direto do aparelho para o Storage (arquivos acima de ~4,5 MB na Vercel)
- [ ] Envio real de e-mails (hoje ficam na fila)
- [ ] Publicação do app na Play Store e notificações push com o projeto EAS
- [ ] Telas do perfil RTV

## 📚 Mais

- [App do Solicitante (Android)](app/README.md)
- [Segurança: permissões, login, recuperação de senha e proteção contra abuso](docs/seguranca.md)
- [Auditoria de segurança](docs/auditoria-seguranca.md)
- [Plano de migração para Supabase + Vercel](docs/plano-migracao.md)

---

<div align="center">
<sub>Uso interno · QIMA</sub>
</div>
