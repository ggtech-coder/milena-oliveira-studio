# Site + painel do studio

- **Site:** https://ggtech-coder.github.io/milena-oliveira-studio/
- **Painel:** https://ggtech-coder.github.io/milena-oliveira-studio/admin.html
- **Banco de dados e logins:** Firebase (projeto `milena-4c46b`, plano gratuito Spark)
- **Pagamento do sinal:** Mercado Pago, através de um servidor gratuito no Cloudflare Workers (pasta `pagamentos/`)
- **Hospedagem:** GitHub Pages (grátis). Cada `git push` atualiza o site em 1 a 2 minutos.

## Arquivos
| Arquivo | O que é |
|---|---|
| `index.html` | Site das clientes: serviços, agendamento, conta da cliente |
| `admin.html` | Painel: dashboard, agenda do dia, clientes, financeiro, configurações, usuários |
| `dados.js` | Serviços, preços e horários padrão (o painel sobrescreve) |
| `store.js` | Conversa com o Firebase |
| `firebase-config.js` | Chaves do Firebase e UID do master |
| `firestore.rules` | Regras de segurança do banco (colar no Console do Firebase) |
| `pagamentos/` | Servidor de pagamento (Cloudflare Worker) |

## 1. Firebase (uma vez)
1. **Authentication → Método de login → E-mail/senha**: ativado (o painel e as contas das clientes usam).
2. **Authentication → Configurações → Domínios autorizados**: `ggtech-coder.github.io`.
3. **Firestore Database → Regras**: cole o conteúdo de `firestore.rules` e clique em **Publicar**. Repita sempre que este arquivo mudar.

## 2. Usuários do painel
- O **master** é o UID que está em `firebase-config.js` e em `firestore.rules`. Ele pode tudo, inclusive criar usuários.
- No painel, menu **Usuários**: crie a pessoa com e-mail e senha provisória e marque o que ela pode acessar:
  Dashboard · Agenda do dia · Clientes · Travar agenda · Financeiro e valores · Configurações.
- **Tirar acesso** bloqueia o painel na hora, sem apagar a conta. **Enviar nova senha** manda um link por e-mail.
- Contas de clientes do site não entram no painel.

## 3. Mercado Pago (sinal de 30% por Pix ou cartão)
Como funciona: a cliente escolhe o horário, o site cria a reserva como **Aguardando pagamento** e manda para o checkout do Mercado Pago. Quando o pagamento é aprovado, o servidor marca **Sinal pago** sozinho. Se ela não pagar em 40 minutos, a reserva expira e o horário volta a ficar livre.

O valor do sinal é sempre recalculado no servidor com os preços do painel, então ninguém consegue pagar menos mexendo no navegador.

Custo: **Cloudflare Workers é grátis e não pede cartão** (100 mil acessos por dia). O Mercado Pago cobra só a taxa de cada venda.

### 3.1 Token do Mercado Pago
1. Entre em https://www.mercadopago.com.br/developers/panel/app → **Criar aplicação** (tipo: Pagamentos online → Checkout Pro).
2. Em **Credenciais de produção**, copie o **Access Token** (começa com `APP_USR-`). Ele é secreto: não coloque em nenhum arquivo do site.

### 3.2 Chave do Firebase para o servidor
1. Console do Firebase → engrenagem → **Configurações do projeto → Contas de serviço → Gerar nova chave privada**.
2. Baixa um arquivo `.json`. Ele também é secreto: **não coloque na pasta do site nem no GitHub**.

### 3.3 Publicar o servidor (Cloudflare)
1. Crie uma conta grátis em https://dash.cloudflare.com/sign-up.
2. No terminal, dentro da pasta `pagamentos`:
   ```
   npx wrangler login
   npx wrangler deploy
   npx wrangler secret put MP_TOKEN
   Get-Content "CAMINHO\DO\arquivo-da-conta-de-servico.json" -Raw | npx wrangler secret put FB_SA
   ```
   - `MP_TOKEN`: cole o Access Token quando ele pedir.
   - `FB_SA`: o segundo comando envia o `.json` baixado no passo 3.2 (troque pelo caminho do arquivo). Depois disso pode apagar o arquivo do computador.
3. O deploy mostra o endereço, tipo `https://milena-pagamentos.SEU-USUARIO.workers.dev`.

### 3.4 Ligar no site
1. Painel → **Site e pagamentos** → cole o endereço em **Servidor de pagamento** → **Testar conexão** → **Salvar**.
2. No Mercado Pago (painel da aplicação → **Webhooks**), não precisa configurar nada: o servidor informa o endereço de aviso em cada cobrança.

Para desligar o pagamento online, apague o endereço e salve: o site volta a reservar e você confere o sinal à mão.

## 4. Como o painel funciona
- **Dashboard:** meta do mês, receita, a receber, atendimentos, gráfico de 6 meses, próximos horários, serviços mais feitos.
- **Agenda do dia:** clientes por horário, WhatsApp, valores e **Situação**:
  *Aguardando pagamento* (está no Mercado Pago) · *Reservado — conferir sinal* (sem pagamento online) · *Sinal pago* · *Concluído* · *Cancelado* (libera o horário) · *Expirado*.
  **Adicionar cliente** serve para quem marcou pelo WhatsApp.
- **Clientes:** quantas vezes cada cliente veio, o que já fez, quanto gastou e quanto falta para a promoção de fidelidade (configure em Site e pagamentos). Botão para avisar pelo WhatsApp.
- **Travar agenda:** um horário, um dia ou vários dias.
- **Financeiro:** já entrou, a receber, por dia e por forma de pagamento.
- **Serviços e tempos / Horários:** preços, durações e funcionamento da semana.
- **Site e pagamentos:** WhatsApp, Instagram, endereço (com mapa), texto "Sobre", depoimentos, fidelidade, meta e servidor de pagamento.

## 5. Conta da cliente no site
Botão **Entrar** no topo do site. A cliente cria a conta com nome, WhatsApp, e-mail e senha e vê os próximos horários, os procedimentos que já fez e o progresso da fidelidade. Agendar sem conta continua possível.

## Limites gratuitos
Firestore: 50 mil leituras e 20 mil gravações por dia. Cloudflare Workers: 100 mil acessos por dia. Sobra muito para um studio. Nada é cobrado sem você ativar faturamento.
