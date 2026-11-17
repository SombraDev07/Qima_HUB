# Plano de migração do QIMA HUB para Supabase + Vercel

Escrito em 16/11/2026. Nada deste plano foi aplicado ainda.

## Andamento

| Fase | Situação |
|---|---|
| 0 — Contas | Pendente (depende da QIMA) |
| 1 — Núcleo | **Banco feito e testado em 16/11/2026** com Postgres local. Faltam: login pelo Supabase Auth, arquivos no Storage e a publicação na Vercel (dependem das contas) |
| 2 — Piloto Solicitações | **Banco feito e testado em 16/11/2026** (37 testes de API + dados de teste recriados). Anexos ainda em disco local; falta o teste pelo celular na versão publicada |
| 3 — Demais sistemas | **Contratação: banco feito e testado em 16/11/2026** (54 testes de API + dados de teste recriados). **Hospedagens: banco feito e testado em 16/11/2026** (66 testes de API + dados de teste recriados; anexos ainda em disco local). **Frotas: banco feito e testado em 16/11/2026** (69 testes de API + dados de teste recriados; fotos ainda em disco local). **Despesas: banco feito e testado em 16/11/2026** (56 testes de API + dados de teste recriados com a IA de demonstração; fotos ainda em disco local). **Nota NF: banco feito e testado em 16/11/2026** (57 testes de API; fotos ainda em disco local). **Os 6 sistemas estão no Postgres e a ponte com o SQLite foi removida.** |
| 4 e 5 | A fazer |

O que já está no Postgres: contas, sessões, perfis por sistema, estado dos sistemas, configuração e uso da IA, caixa de saída de e-mails.

Como rodar:
- **Sem `DATABASE_URL`:** o servidor usa um Postgres embutido (PGlite). Se o projeto estiver em pasta sincronizada (OneDrive), o banco fica em `%LOCALAPPDATA%\QIMAHub\pg`; `QIMA_PG_DIR` muda o lugar.
- **Com `DATABASE_URL`:** conecta no Postgres indicado (Supabase). **Testado em 17/11/2026** no projeto de desenvolvimento do Supabase: as 51 tabelas e todas as migrações foram criadas (RLS ligado em todas) e um teste de fumaça (login, listas dos 6 sistemas, escrita e exclusão, contas, relatório) passou. O teste achou um erro que o Postgres embutido não mostrava (gravação de números grandes), já corrigido em `core/server/pg.js`.
- A conexão direta (`db.<projeto>.supabase.co:5432`) só tem IPv6. Funcionou nesta máquina, mas para a Vercel use o endereço do **pooler** (porta 6543, modo transação) em `DATABASE_URL`.
- A senha do banco e a do administrador ficam só no `.env` (fora do Git).
- `npm run migrate` cria as tabelas no banco apontado por `DATABASE_URL`.

Durante a migração:
- O SQLite não é mais usado pelo código. O arquivo antigo `data/qimahub.db` (só dados de teste) pode ser apagado; há cópia em `backup/`.
- Um sistema passa para o Postgres ao exportar `banco: 'postgres'` no `server/index.js`; aí recebe `ctx.db` assíncrono (`get`, `all`, `run`, `tx`).
- `modules/registro.js` é a lista fixa dos sistemas, gerada por `scripts/gerar-registro.mjs` antes de `dev`, `start` e `build`.
- Padrão fixado pelo piloto (`modules/solicitacoes/server/index.js`): rotas de leitura com `ler`, rotas de gravação com `h` (transação inteira); dentro da transação só se usa o `t`, inclusive em `notify` e `usuariosComPerfil`; listas numa consulta só, sem consulta por linha.
- Os dados de teste dos sistemas são recriados no Postgres com `npm run seed` (ou o script de cada sistema).
- Cópia do código de antes desta etapa: `backup/antes-postgres-2026-11-16.zip`.

## 1. Onde queremos chegar

- **Central:** usa o HUB pelo navegador (computador).
- **Solicitante:** usa o HUB pelo navegador do celular e, no futuro, por um app.
- **App e web usam a mesma API e o mesmo banco.** As regras de cada sistema ficam só no servidor.

```
Navegador (central e solicitante) ─┐
                                   ├─► API do HUB (Vercel, São Paulo) ─► Postgres (Supabase, São Paulo)
App do solicitante (futuro) ───────┘            │                    └─► Storage (fotos e anexos)
                                                └─► Serviço de IA (leitura de fotos)
        Login: Supabase Auth (o mesmo para web e app)
```

## 2. O que fica e o que muda

| Parte | Hoje | Depois | Tamanho da mudança |
|---|---|---|---|
| Telas (React) | Vite | Vite, publicado na Vercel | Pequena |
| Rotas e regras de cada sistema | Express | Express, rodando como função da Vercel | Pequena |
| Contrato dos módulos | `migrations, router, summary, notificacoes, relatorio` | O mesmo, com funções assíncronas | Média |
| Banco | SQLite síncrono, no servidor | Postgres do Supabase, assíncrono | **Grande** |
| Fotos e anexos | Pasta `data/uploads` | Supabase Storage (privado) | Média |
| Login | Cookie + tabela `sessions` | Supabase Auth (token) | Média |
| Carregamento dos módulos | Lê a pasta `modules/` ao iniciar | Lista fixa gerada no build | Pequena |
| Tarefas de fundo | `setInterval` no processo | Tarefa agendada (cron) | Pequena |
| Chave que protege a chave da IA | Arquivo `data/.chave-hub` | Variável `QIMA_SEGREDO` (já suportada) | Nenhuma no código |
| Scripts de dados de teste | Usam a API por HTTP | Continuam iguais | Pequena |

### O tamanho real da troca do banco

Contagem feita no código do servidor:

| O que precisa ser convertido | Ocorrências |
|---|---|
| Consultas (`db.prepare`) que passam a ser assíncronas | 434 |
| Datas no formato SQLite (`datetime('now')`, `date(...)`) | 139 |
| Tabelas (`CREATE TABLE`), 42 com `AUTOINCREMENT` | 52 |
| `lastInsertRowid` (vira `RETURNING id`) | 24 |
| Somas de condição (`SUM(status = 'x')`) | 15 |
| Transações (`BEGIN`/`COMMIT`) | 14 |
| `IFNULL`, `GROUP_CONCAT`, `INSERT OR IGNORE` | 9 |
| Rotas de envio de arquivo | 5 |
| Rotas de entrega de arquivo | 6 |

A conversão é mecânica, mas atinge todos os sistemas. Por isso ela é feita um sistema por vez.

## 3. Decisões técnicas recomendadas

### Banco
- **O servidor fala com o Postgres por SQL direto** (biblioteca `postgres`), pelo pooler do Supabase em modo transação. As consultas atuais são SQL; reescrever tudo para outra forma de acesso dobraria o trabalho.
- Uma camada fina `ctx.db` com `get`, `all`, `run` e `tx`. Os módulos só conhecem essa camada.
- As tabelas mantêm o prefixo de cada sistema (`frotas_`, `despesas_`...).
- **RLS ligado em todas as tabelas, sem nenhuma política.** O Supabase expõe as tabelas por uma API pública própria; com isso ela fica fechada e só o servidor do HUB lê e grava.
- As datas passam a `timestamptz`. A API continua devolvendo o mesmo formato de texto, para as telas não mudarem.
- As migrações rodam no deploy (`npm run migrate`), não a cada partida do servidor.
- Aproveitar a conversão para tirar o N+1 e limitar as listas por período, já que cada consulta passa a custar uma viagem de rede.

### Login
- **Supabase Auth com e-mail e senha.** Web e app usam o mesmo login.
- A tabela `users` continua com o `id` numérico (todas as tabelas apontam para ele) e ganha a coluna `auth_id`, que liga à conta do Supabase.
- Perfis por sistema continuam na `user_modules`. A Administração cria as contas pelo servidor.
- A tabela `sessions` e o cookie deixam de existir. A API passa a aceitar o token no cabeçalho `Authorization`.
- As senhas atuais não migram. Como hoje só existem contas de teste, isso não afeta ninguém.

### Fotos e anexos
- Um bucket privado por sistema no Supabase Storage.
- **Envio direto do aparelho para o Storage**, com um endereço assinado que a API entrega. A Vercel limita o corpo da requisição a cerca de 4,5 MB, e o envio direto também é mais estável em rede de celular.
- Depois do envio, o aparelho avisa a API, que confere o arquivo, calcula o hash e chama a IA.
- A visualização usa endereços assinados de curta duração.
- **Miniatura gerada no aparelho no momento do envio** (um segundo arquivo pequeno). A redução automática de imagens do Supabase é um recurso pago.

### IA
- A leitura continua dentro da requisição, com limite menor que o tempo máximo da função da Vercel. Se estourar, a nota cai no modo manual, como já acontece hoje.
- O tempo máximo da função depende do plano da Vercel e precisa ser conferido.

### Tarefas de fundo
- Envio dos e-mails da `outbox`: tarefa agendada (Vercel Cron ou `pg_cron`). Só quando o envio de e-mail for feito.
- Limpeza de sessões: deixa de existir com o Supabase Auth.

### Hospedagem
- Supabase e funções da Vercel **na região de São Paulo**. Em regiões diferentes, cada consulta ganha cerca de 150 ms.
- Dois projetos Supabase: um de desenvolvimento e um de produção.
- Compressão, cache dos arquivos do site e CDN ficam por conta da Vercel.

### Preparação para o app
- O app usa as mesmas rotas `/api/m/<sistema>` do solicitante.
- Antes de publicar o app, fixar as rotas do solicitante com versão (`/api/v1/...`), porque versões antigas do app continuam instaladas.
- Notificações no celular (push) ficam para o projeto do app.

## 4. Fases

### Fase 0 — Decisões e contas
- Criar as contas de Supabase e Vercel em nome da QIMA (não em conta pessoal).
- Escolher os planos (ver seção 6).
- Colocar o projeto no Git; a Vercel publica a partir dele.
- **Pronto quando:** existem os dois projetos Supabase em São Paulo e o projeto na Vercel.

### Fase 1 — Núcleo
- Camada `ctx.db` para Postgres e tabelas do núcleo (`users`, `modules`, `user_modules`, `outbox`, `settings`, `ai_uso`).
- Login com Supabase Auth, na API e nas telas.
- Camada de arquivos (`ctx.arquivos`) sobre o Storage.
- Lista fixa de módulos no lugar da leitura da pasta.
- Administração funcionando: contas, sistemas, IA.
- **Pronto quando:** dá para entrar no HUB publicado na Vercel, criar uma conta e ver a tela inicial, pelo computador e pelo celular.

### Fase 2 — Piloto: Solicitações
- Escolhido por ser o menor (309 linhas no servidor), ter anexo e ter chat.
- Converter tabelas, consultas, anexos e relatório.
- Rodar o script de dados de teste e os testes de API contra a versão publicada.
- **Pronto quando:** o fluxo completo funciona pelo celular (criar, devolver para correção, conversar, concluir). O piloto fixa o padrão para os outros sistemas.

### Fase 3 — Demais sistemas, um por vez
Ordem sugerida, do mais simples para o mais delicado:
1. Contratação
2. Hospedagens
3. Frotas (fotos com GPS)
4. Despesas (fotos + IA)
5. Nota NF (fotos + PDF + IA)

Cada sistema só é considerado migrado quando o script de dados de teste dele roda sem erro na versão publicada.

### Fase 4 — Celular
- Miniaturas das fotos.
- Fonte local, chamadas repetidas e sininho por sistema.
- Checklist de teste em celular real e em rede lenta (3G): envio de 8 fotos, queda de sinal no meio do envio, tela pequena.

### Fase 5 — Entrada em produção
- Trocar as senhas e chaves de teste; `QIMA_SEGREDO` definido na Vercel.
- Backup do banco conferido no Supabase.
- Relatórios da Administração conferidos no Excel.
- Domínio definitivo.

### Depois: app do solicitante
- Fixar a versão da API do solicitante.
- App com o mesmo login e as mesmas rotas.

## 5. Riscos

| Risco | Como tratar |
|---|---|
| Diferença de comportamento entre SQLite e Postgres (datas, maiúsculas em buscas, ordenação) | Rodar os scripts de teste de cada sistema contra o Postgres antes de dar como migrado |
| Transações: hoje são síncronas e nada entra no meio | No Postgres, toda transação usa uma conexão própria (`tx`); nenhuma chamada externa (IA, Storage) dentro dela |
| Leitura por IA mais lenta que o limite da função | Limite menor que o da Vercel e queda para o modo manual |
| Envio de foto interrompido no celular | Envio direto ao Storage com nova tentativa; a nota só é criada depois da confirmação |
| Sistemas novos escritos no formato atual durante a migração | Não começar sistema novo antes do fim da Fase 2 |
| Dados pessoais (CPF, fotos de documentos) | Banco e arquivos em São Paulo, buckets privados, RLS ligado |

## 6. O que precisa ser decidido pela QIMA

1. **Planos:** conferir se os planos gratuitos servem. O gratuito da Vercel é para uso não comercial, e o gratuito do Supabase pausa projetos sem uso; para produção, o esperado é plano pago nos dois.
2. **Dono das contas:** e-mail corporativo da QIMA.
3. **Domínio:** qual endereço o HUB vai ter.
4. **Dados atuais:** hoje são só dados de teste. A recomendação é começar a produção com o banco vazio e não migrar nada do SQLite.
5. **Serviço de IA:** já estava pendente; passa a valer também o tempo de resposta do serviço.

