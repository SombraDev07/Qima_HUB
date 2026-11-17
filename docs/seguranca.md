# Segurança do QIMA HUB

A skill [`security-audit`](https://github.com/cloudflare/security-audit-skill) da Cloudflare está em `.claude/skills/security-audit/`
(licença MIT, em `LICENSE-cloudflare`). Ela é um **guia de auditoria** para o Claude Code, não uma biblioteca: para uma
auditoria completa peça "faça uma auditoria de segurança completa deste projeto". Ela não implementa limite de login,
recuperação de senha nem proteção contra DDoS. Esses pontos foram tratados aqui, usando os checklists dela
(`WEB-PROTOCOL-AND-AUTH.md` e `RESOURCE-EXHAUSTION-AND-AVAILABILITY.md`).

## Escada de permissões

| Nível | Quem | Pode |
|---|---|---|
| 0 · sem acesso | conta sem perfil no sistema | nada (o card nem aparece) |
| 1 · **RTV** | perfil reservado | nada ainda (sem telas) |
| 2 · **Solicitante** | abre e acompanha os **próprios** pedidos | só os dados dele |
| 3 · **Central** | atende todos os pedidos do sistema; **também** cria os próprios pedidos; baixa o relatório do sistema | tudo do nível 2 e 3, só nos sistemas em que é Central |
| 4 · **Ambos** | solicitante + central no mesmo sistema | igual ao nível 3 |
| 5 · **Administrador** | gerencia contas, perfis, sistemas, IA, relatórios gerais, segurança | tudo (continua precisando de perfil em cada sistema para abrir as telas) |

A checagem é feita **no servidor** em cada rota (`hasRole` em `core/server/auth.js`); esconder o botão na tela não é proteção.
O perfil é lido do banco a cada pedido, então mudar o perfil vale na hora.

## O que está protegido

| Risco | Como está tratado |
|---|---|
| Tentativas de senha (força bruta) | Bloqueio gravado no banco (vale em todas as instâncias da Vercel): **5 erros em 15 min** do mesmo e-mail+IP bloqueiam por 15 min; 20 erros por e-mail e 30 por IP (ataque distribuído). Resposta `429` com `Retry-After`. A administração desbloqueia pela tela de Contas. Um estranho não consegue travar a conta de outra pessoa errando de outro IP, porque o limite principal é por par e-mail+IP |
| Descobrir quais e-mails existem | Mensagem igual para conta inexistente e senha errada, e o mesmo tempo de resposta (a senha é conferida contra um hash falso) |
| Esqueci a senha | Link com token aleatório de 256 bits, **só o hash fica no banco**, vale 30 min e uma vez; o pedido sempre responde igual; limite de 3 pedidos por e-mail e 10 por IP por hora; o endereço do link vem de `QIMA_URL` (nunca do cabeçalho `Host`, que o cliente controla); ao redefinir, **todas as sessões** da conta são encerradas |
| Troca de senha | Exige a senha atual (com limite de tentativas) e desconecta os outros aparelhos |
| Senhas fracas | Mínimo 8, máximo 128 (evita custo abusivo de hash), recusa as óbvias, repetidas e as que contêm o e-mail |
| CSRF | Cookie `HttpOnly` + `SameSite=Lax` + `Secure` em produção, mais checagem de `Origin`/`Sec-Fetch-Site` em todo pedido que altera dados |
| Cabeçalhos | CSP restritivo, `frame-ancestors 'none'` (anti-clickjacking), HSTS, `nosniff`, `Referrer-Policy`, `Permissions-Policy` (câmera e GPS só do próprio site). Em dois lugares: Express (`core/server/lib/seguranca.js`) e `vercel.json` (arquivos estáticos) |
| Abuso e DDoS (camada de aplicação) | Limite por IP: 900 pedidos/min na API e 40/min nas rotas de login e recuperação; corpo JSON de até 1 MB; uploads com teto por sistema; hash de senha assíncrono (não trava o servidor); IP real vindo do cabeçalho que a Vercel define, não do que o cliente envia |
| Senha padrão | Em produção nunca existe `admin123`: sem `QIMA_ADMIN_PASSWORD`, uma senha aleatória é gerada |
| Rastro | Tabela `audit_log` (aba **Administração → Segurança**): logins errados e bloqueados, trocas e links de senha, contas criadas, alteradas e excluídas |
| Banco | RLS ligado em todas as tabelas, sem políticas: só o servidor lê e grava. Storage em bucket privado |

## O que a aplicação NÃO consegue fazer sozinha: DDoS de verdade

Um ataque de volume (milhares de máquinas) é barrado **antes** do código, pela infraestrutura. A Vercel já absorve ataques de
rede (camadas 3 e 4) automaticamente. Para a camada 7 (pedidos HTTP), ligue no painel da Vercel (Settings → Firewall):

1. **Rate limit rule** para `/api/auth/*` (ex.: 20 pedidos/min por IP, ação *Deny* ou *Challenge*).
2. **Attack Challenge Mode**: ligue só durante um ataque.
3. Regra de bloqueio por país, se o HUB só for usado no Brasil (opcional).
4. No Supabase, mantenha o banco acessível só pelo pooler e a chave `sb_secret_` apenas no servidor.

## Pendências conhecidas

- **E-mail ainda não é enviado** (os e-mails ficam na caixa de saída). Enquanto isso, quem esqueceu a senha pede à
  administração o link (Contas → ícone de chave). Quando o envio for ligado, o "Esqueci minha senha" passa a funcionar sozinho.
- Autenticação em dois fatores (2FA) para administradores e centrais: recomendada, ainda não feita (o plano é o Supabase Auth).
- Sessão de 12 h sem renovação; não há "sair de todos os aparelhos" para o próprio usuário (só ao trocar a senha).
- O repositório do GitHub está **público**: deixe privado e troque as chaves que já passaram por conversa.
