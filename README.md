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
![Deploy](https://img.shields.io/badge/Deploy-Vercel-000000?logo=vercel&logoColor=white)
![Status](https://img.shields.io/badge/status-em%20migração-orange)

</div>

---

## ✨ O que é

O HUB reúne os sistemas que antes eram apps separados do PowerApps. Cada pessoa entra uma vez e vê só os
cards dos sistemas a que tem acesso. Em cada sistema existem dois perfis:

| Perfil | O que faz |
|---|---|
| 🙋 **Solicitante** | Abre o pedido, acompanha, corrige e conversa com a central. Usa pelo celular. |
| 🛠️ **Central** | Recebe, analisa e atende. Trabalha pelo navegador no computador. Baixa o **relatório em Excel do próprio sistema** (botão *Relatório* na barra), sem acesso a mais nada da Administração. |
| 🧭 **RTV** | Perfil já cadastrável na Administração, mas **ainda sem telas**: reservado para uso futuro. |
| ⚙️ **Administração** | Cria contas, define o perfil de cada pessoa por sistema, baixa relatórios e configura a IA. |

## 🧩 Sistemas

| | Sistema | Para quê | Destaques |
|---|---|---|---|
| 🏨 | **Hospedagens** | Reserva de hotéis para equipes em viagem | Quartos de até 4 hóspedes, diária por ocupação, check-out parcial, financeiro |
| 🧾 | **Despesas** | Reembolso com foto da nota | Leitura por IA, detecção de nota duplicada, PIX, ZIP com fotos |
| 🌱 | **Nota NF** | NFs de semente de soja | Só itens de soja, chave de acesso conferida, germinação padrão |
| 👷 | **Contratação** | Vagas, candidatos e demissões | Banco de pessoas, CPF validado, importação de planilha |
| 🚗 | **Frotas** | Pedidos de veículo e chamados | 8 fotos obrigatórias com GPS, troca de placa e de condutor, controle mestre |
| 📋 | **Solicitações** | Pedidos para a Central Harvest | Planilha Excel ou dados digitados, chat de correção, quadro em 4 colunas |

Cada sistema tem seu próprio sininho, mostrando só as pendências dele.

## 🏗️ Arquitetura

```mermaid
flowchart LR
  subgraph Clientes
    W["💻 Web<br/>central e solicitante"]
    A["📱 App do solicitante<br/>(futuro)"]
  end
  subgraph Vercel
    API["API do HUB<br/>Express"]
  end
  subgraph Supabase
    DB[("Postgres")]
    ST[("Storage<br/>fotos e anexos")]
    AU["Auth"]
  end
  IA["🤖 Serviço de IA<br/>leitura de fotos"]
  W --> API
  A --> API
  API --> DB
  API --> ST
  API -.-> AU
  API --> IA
```

> **Estado atual:** o banco já roda no Postgres do Supabase. Fotos e anexos ainda ficam em disco local e o login
> ainda é por cookie. Veja o [plano de migração](docs/plano-migracao.md).

### Pensada para manutenção por sistema

```
core/                      ← núcleo: login, contas, permissões, tela inicial, administração
  server/                  ← API do núcleo, carregador de módulos, banco (pg.js), IA
  web/                     ← telas do núcleo
  web/shared/              ← API pública para os módulos (import ... from '@hub')
modules/
  hospedagens/             ← UM sistema = UMA pasta, independente
    module.json            ← nome, ícone, versão, rótulos dos botões
    server/index.js        ← rotas, migrações do banco, resumo do card, sininho
    web/index.jsx          ← telas Solicitante e Central
  frotas/ …
  _template/               ← modelo para criar um novo sistema
scripts/                   ← migrações, dados de teste, geração do registro de módulos
docs/                      ← plano de migração para Supabase + Vercel
```

Regras que garantem o isolamento:

1. **Um sistema nunca importa código de outro.** Só usa `@hub` (frontend) e o `ctx` recebido (backend).
2. **Tabelas com prefixo da chave** (`hospedagens_pedidos`, `frotas_veiculos`…). Nenhum sistema lê tabela de outro.
3. **Rotas isoladas** em `/api/m/<chave>/…`. O núcleo valida login, se o sistema está ativo e o perfil da pessoa.
4. **Migrações versionadas por sistema.** Para evoluir o banco, adicione `{ version: N+1, async up(db) {…} }`; nunca altere uma já publicada.
5. **Falha isolada:** se um sistema der erro ao carregar, os demais continuam e o erro aparece em *Administração → Sistemas*.
6. **Pacotes separados:** cada sistema vira um arquivo JS próprio, carregado só quando aberto.

## 🚀 Começando

Requer **Node 22.13+**.

```bash
npm install
npm run dev
```

- Web: <http://localhost:5173> · API: <http://localhost:3001>
- Sem configurar nada, o HUB usa um **Postgres embutido** (PGlite) para desenvolvimento. Se o projeto estiver numa
  pasta sincronizada (OneDrive, Dropbox), o banco fica em `%LOCALAPPDATA%\QIMAHub\pg`, fora dela.
- No primeiro start é criado o administrador `admin@qima.local` com a senha `admin123`. **Troque** pela tela
  *Minha conta*, ou defina `QIMA_ADMIN_EMAIL` e `QIMA_ADMIN_PASSWORD` antes do primeiro start.

### Dados de teste

Com o servidor rodando:

```bash
npm run seed
```

Cria contas, cadastros e pedidos em todos os estados dos 6 sistemas, com cupons e notas fictícias.
Contas criadas (senha `teste123`): `marina@`, `rafael@`, `joana@qima.local` (solicitantes) e `central@qima.local` (central).

> ⚠️ O seed grava no banco apontado por `DATABASE_URL`. Se for o do Supabase, os dados de teste vão para lá.

### Usando o Supabase

Copie `.env.example` para `.env` e preencha:

```ini
DATABASE_URL=postgresql://postgres:SENHA@db.SEU-PROJETO.supabase.co:5432/postgres
```

Ao iniciar, o servidor cria as tabelas sozinho. Em produção (Vercel) rode `npm run migrate` a cada publicação e use o
endereço do **pooler** (porta 6543, modo transação). Todas as tabelas nascem com **RLS ligado e nenhuma política**:
só o servidor do HUB lê e grava.

### Variáveis de ambiente

| Variável | Para quê |
|---|---|
| `DATABASE_URL` | Postgres do Supabase. Vazio = Postgres embutido local |
| `QIMA_PG_DIR` | Pasta do Postgres embutido |
| `QIMA_SEGREDO` | Segredo que protege a chave da IA (obrigatório em produção) |
| `QIMA_ADMIN_EMAIL` / `QIMA_ADMIN_PASSWORD` | Administrador criado no primeiro start |
| `QIMA_AI_PROVIDER` | IA padrão quando nada foi salvo na Administração (`demo` só para testes) |
| `QIMA_FUSO_HORAS` | Fuso dos relatórios (padrão `-3`, Brasília) |
| `PORT` | Porta da API em produção |

### Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | API + web em desenvolvimento |
| `npm run build` | Gera o frontend em `dist/` |
| `npm start` | Servidor de produção (serve o `dist/`) |
| `npm run migrate` | Cria/atualiza as tabelas no banco de `DATABASE_URL` |
| `npm run seed` | Dados de teste dos 6 sistemas |
| `npm run registro` | Regenera `modules/registro.js` (a lista fixa de sistemas; roda sozinho antes de `dev`, `start` e `build`) |

## 🛡️ Administração

- **Contas e Sistemas:** cadastro, perfil por sistema (solicitante, central ou ambos), status e ordem dos cards.
- **Relatórios:** escolha o período e baixe um **Excel por sistema** ou um geral. Cada sistema tem uma aba do
  solicitante e uma da central, ligadas pelo código do pedido, mais abas de detalhe. O das Solicitações traz a conversa completa.
- **Inteligência artificial:** escolha quem lê as fotos: desligada (modo manual), qualquer serviço com API
  compatível com OpenAI (OpenAI, Gemini, Azure, OpenRouter, Ollama), a demonstração ou um conector próprio.
  Liga e desliga por sistema, botão **Testar conexão** e contagem de uso. A chave da API fica **criptografada**.

## 🧱 Criar um novo sistema

1. Copie `modules/_template` para `modules/<chave>` (minúsculas, sem espaço).
2. Ajuste o `module.json` (a `key` é igual ao nome da pasta) e troque `NOME_DA_PASTA` nos arquivos.
3. Reinicie o servidor. O sistema aparece em *Administração → Sistemas*, pronto para ser liberado.

O backend recebe um `ctx` com:

| `ctx` | Para quê |
|---|---|
| `db.get / all / run / tx` | Banco Postgres, sempre com `await`. Dentro de `db.tx(async (t) => …)` use só o `t` |
| `requireRole('solicitante' \| 'central')` | Middleware de perfil |
| `notify(email, assunto, html)` | Coloca um e-mail na caixa de saída (`outbox`) |
| `usuariosComPerfil(perfil)` | Contas ativas com o perfil no sistema |
| `ai.extrair(...)` | Leitura de documentos por IA, respeitando o liga/desliga da Administração |
| `files.xlsx / files.zip` | Geração de planilhas e ZIPs para download |

**Padrão de desempenho:** listas numa consulta só (sem consulta por linha), com limite por período, e nenhuma
chamada externa (IA, e-mail) dentro de transação. O exemplo completo está em `modules/solicitacoes/server/index.js`.

## 🗺️ Roadmap

- [x] Núcleo: contas, perfis, sistemas, relatórios e IA configurável
- [x] 6 sistemas migrados do PowerApps, com melhorias
- [x] Banco no Postgres do Supabase, com RLS
- [ ] Fotos e anexos no Supabase Storage (envio direto do aparelho)
- [ ] Login pelo Supabase Auth (web e app)
- [ ] Publicação na Vercel, na região de São Paulo
- [ ] Envio real de e-mails (hoje ficam na fila)
- [ ] Teste em celular real e rede lenta
- [ ] App de solicitantes compartilhando o mesmo banco

## 📚 Mais

- [Plano de migração para Supabase + Vercel](docs/plano-migracao.md)

---

<div align="center">
<sub>Uso interno · QIMA</sub>
</div>
