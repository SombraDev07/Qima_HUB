# Auditoria de segurança · QIMA HUB

Data: 17/11/2026 · Método: revisão do código-fonte guiada pela skill
[`security-audit`](https://github.com/cloudflare/security-audit-skill) da Cloudflare (domínios *autenticação*,
*disponibilidade/abuso de recursos*, *isolamento de dados*, *cadeia de suprimentos*) e pelas falhas mais comuns em código
gerado por IA. Foram feitas também verificações reais no Supabase e testes automatizados em banco local.

> **Cobertura honesta.** Foi uma revisão dirigida, feita em uma única passada, e não o protocolo completo de várias rodadas
> com agentes independentes e validadores de relatório que a skill descreve. Cobre o núcleo (login, sessões, administração,
> relatórios, arquivos, IA), as rotas dos 7 sistemas e o banco. Não cobre revisão linha a linha de todas as regras de
> negócio nem a camada de infraestrutura (painéis da Vercel, Supabase e GitHub). Uma auditoria profunda pode ser rodada depois.

## O que a pesquisa diz que a IA erra (e como estamos)

Fontes: [Veracode, GenAI Code Security, primavera de 2026](https://veracode.com/blog/spring-2026-genai-code-security) (só ~55% do código
gerado sai seguro; XSS e *log injection* são os piores), além de levantamentos de apps "vibe coded" com Supabase
(RLS desligado, chaves vazadas no front, IDOR, SSRF, falta de cabeçalhos e CSRF).

| Falha típica de código de IA | Situação no HUB |
|---|---|
| Tabelas do Supabase sem RLS | **OK.** Verificado no banco: 0 tabelas sem RLS, 0 políticas; leitura anônima com a chave pública devolveu `[]` em `users`, `sessions`, `settings`, `audit_log`, `password_resets`, `equipamentos_itens` e no Storage |
| Chave secreta (`service_role`/`sb_secret`) no front ou no Git | **OK.** Só no servidor (variável da Vercel). Nenhum segredo no repositório nem no histórico (varredura em todos os commits) |
| IDOR / falta de checagem de dono | **OK nas rotas revisadas.** Fotos, notas, anexos, pedidos e conversas conferem dono ou perfil Central antes de entregar |
| SQL injection | **OK.** Consultas parametrizadas; nomes de tabela e coluna montados no código vêm de listas fixas (`LISTAS`, `TABELAS`, chaves de validadores); `IN (...)` só com inteiros |
| XSS (o mais falho segundo a Veracode) | **OK.** Nenhum `dangerouslySetInnerHTML`/`innerHTML`; React escapa; e-mails escapam o texto do usuário; CSP bloqueia scripts externos e inline |
| Log injection | **OK.** Entradas do usuário não vão para linhas de log; a trilha de auditoria guarda texto cortado e a tela escapa |
| CSRF e cabeçalhos ausentes | **Corrigido** (SameSite, checagem de origem, CSP, HSTS, frame-ancestors, nosniff) |
| Sem limite de tentativas / força bruta | **Corrigido** (bloqueio no banco) |
| Recuperação de senha fraca | **Corrigido** (token aleatório, só hash no banco, 30 min, uso único) |
| SSRF | Só a URL do provedor de IA, definida por administrador (ver A4) |
| Dependências "alucinadas" (*slopsquatting*) e vulneráveis | **OK.** Só pacotes conhecidos (`express`, `postgres`, `react`, `vite`, `lucide-react`…); `npm audit`: 0 vulnerabilidades |
| Senha padrão / segredos em código | **Corrigido** (sem `admin123` em produção) |
| Upload inseguro | **OK.** Tipos aceitos por lista, nome gerado no servidor, `nosniff`, bucket privado, limite de tamanho e agora limite de envios por pessoa |
| Erros detalhados vazando | **OK.** Erros internos viram "Erro interno"; detalhes só no log |

## Achados desta rodada

| # | Sev. | Achado | Estado |
|---|---|---|---|
| F1 | Média | Sem limite de tentativas de login nem recuperação de senha | **Corrigido** (rodada anterior, ver `seguranca.md`) |
| F2 | Média | Qualquer usuário autenticado podia disparar envios ilimitados que gastam IA paga (DeepSeek) e armazenamento (consumo irrestrito) | **Corrigido.** `ctx.limitar`: 40 envios de nota / 10 min (Despesas e Nota NF), 120 fotos / 10 min (Frotas), 30 planilhas / 10 min (Solicitações) por pessoa |
| F3 | Baixa | Exportação CSV do Financeiro de Hospedagens aceitava fórmulas (`=`, `+`, `-`, `@`) vindas de texto digitado (CSV injection) | **Corrigido** em `exportCsv`. O Excel gerado pelo servidor já usa texto puro e não é afetado |
| F4 | Baixa | Identificador de sessão guardado em texto puro no banco | **Corrigido:** guarda só o SHA-256. *Ao publicar, todos precisarão entrar de novo uma vez.* |
| F5 | Baixa | Respostas da API sem `Cache-Control` (risco de ficarem em cache de navegador/CDN, relevante com Cloudflare) | **Corrigido:** `no-store` em `/api` (arquivos privados mantêm `private`) |
| F6 | Baixa | Campos de texto sem limite em `POST /pessoas` (Hospedagens) | **Corrigido** |
| F7 | Info | Com Cloudflare na frente, a Vercel só enxerga IPs do Cloudflare e os limites por IP bloqueariam todo mundo junto | **Preparado:** `ipDe` usa `cf-connecting-ip` só se o pedido trouxer o segredo `x-origin-verify` (`QIMA_CF_SEGREDO`) |

## Riscos que dependem de você (não são código)

| # | Sev. | Risco | O que fazer |
|---|---|---|---|
| A1 | **Alta** | Repositório do GitHub **público** | Deixar privado (Settings → Danger Zone). Mesmo sem segredos, expõe a lógica e o mapa do sistema |
| A2 | **Alta** | Chaves que já passaram por conversa: senha do banco do Supabase, `sb_secret_`, chave do DeepSeek, senha do Bruno | Rotacionar todas (Supabase → Settings → Database/API Keys; DeepSeek; trocar a senha em *Minha conta*) e atualizar na Vercel e no `.env` |
| A3 | Média | Sem 2FA para Administradores e Central | Plano: Supabase Auth (TOTP) ou Cloudflare Access na frente do `/admin` |
| A4 | Baixa | A URL do provedor de IA é livre para administradores; um admin comprometido poderia apontá-la para um endereço interno ou para um servidor próprio e capturar a chave | Restringir a uma lista de domínios (api.deepseek.com, api.openai.com…) quando houver mais de um admin |
| A5 | Baixa | Prompt injection: texto dentro da foto de uma nota pode tentar manipular a IA | Efeito limitado: a IA só preenche campos que a Central revisa; a detecção de duplicidade é código determinístico |
| A6 | Baixa | Sessão de 12 h sem inatividade nem "sair de todos os aparelhos" | Encurtar para 8 h com renovação, ou adicionar o botão |
| A7 | Info | CPF e dados pessoais em texto no banco (LGPD) | Definir prazo de retenção; criptografar colunas de CPF se o risco justificar |
| A8 | Info | `admin@qima.local` ainda existe com senha aleatória | Desativar; apagar `data/contas-criadas.txt` depois de repassar as senhas |
| A9 | Info | E-mails ainda não são enviados | Ao ligar o envio: SPF/DKIM/DMARC e manter o escape de HTML (já aplicado) |

## Preparação para o Cloudflare

A Vercel não recomenda proxy na frente dela, mas funciona se for configurado com cuidado:

1. **Domínio próprio** no Cloudflare apontando para a Vercel (proxy ligado), SSL **Full (strict)**.
2. **Segredo de origem:** regra *Transform → Modify Request Header* que adiciona `x-origin-verify: <segredo>`. Coloque o mesmo
   valor na Vercel em `QIMA_CF_SEGREDO` (o código só passa a confiar no IP do Cloudflare com esse segredo). **Sem isso, com o
   Cloudflare ligado, todos os usuários parecem ter o mesmo IP e os bloqueios de login atingem todo mundo.**
3. **Travar a origem:** regra no Firewall da Vercel que nega pedidos sem o cabeçalho `x-origin-verify`, para ninguém contornar o Cloudflare.
4. **WAF e limites:** regras gerenciadas (OWASP), *Rate limiting* em `/api/auth/*` (ex.: 10/min por IP), *Bot Fight Mode*.
5. **Cache:** regra *Bypass cache* para `/api/*` (a API já manda `no-store`).
6. **Turnstile** (CAPTCHA invisível) no login e em "Esqueci minha senha": exige um pequeno trecho de código para validar o token no servidor. Posso implementar quando o Cloudflare estiver ativo.
7. **Cloudflare Access** (opcional) na frente de `/admin` como segundo fator.

Os cabeçalhos (CSP, HSTS), a checagem de origem e os limites do código continuam valendo por baixo do Cloudflare (defesa em camadas).

## Verificações executadas

- Banco: 0 tabelas sem RLS; 0 políticas; bucket `qima-arquivos` privado; leitura anônima das tabelas e do Storage retorna vazio.
- Repositório: varredura de padrões de chave em arquivos e em todo o histórico: nada sensível versionado.
- `npm audit --omit=dev`: 0 vulnerabilidades.
- Testes automatizados em banco local: 38 de segurança (bloqueio, recuperação, CSRF, cabeçalhos, política de senha, auditoria, rajada) e 64 do sistema Equipamentos.
