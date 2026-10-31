# Site + painel do studio — como colocar no ar (custo zero)

- **Site:** `index.html` (as clientes agendam)
- **Painel:** `admin.html` (só você, com login): clientes do dia, caixa, travar agenda, serviços e tempos, horários
- **Banco de dados:** Firebase Firestore, plano gratuito **Spark** (não pede cartão)
- **Hospedagem:** GitHub Pages (grátis)

Enquanto o `firebase-config.js` estiver vazio, tudo funciona em **modo local** (os dados ficam só no navegador), bom para testar.

## 1. Criar o projeto no Firebase
1. Entre em <https://console.firebase.google.com> com sua conta Google → **Adicionar projeto**. Pode desativar o Google Analytics.
2. Fique no plano **Spark** (gratuito). Não precisa ativar faturamento para nada daqui.

## 2. Banco de dados
1. Menu **Criação > Firestore Database > Criar banco de dados**.
2. Local: `southamerica-east1 (São Paulo)`. Modo: **produção**.

## 3. Login do painel
1. **Criação > Authentication > Vamos começar > E-mail/senha** → ativar (só a primeira chave) → Salvar.
2. Aba **Usuários > Adicionar usuário**: seu e-mail e uma senha forte.
3. Copie o **UID do usuário** que aparece na lista (um código tipo `aB3dE...`).

## 4. Ligar o site ao Firebase
1. Engrenagem **Configurações do projeto > Seus apps > ícone `</>` (Web)**. Dê um nome e registre (não precisa do Hosting).
2. Copie os valores de `firebaseConfig` para o arquivo `firebase-config.js` (apiKey, authDomain, projectId...).
   Essas chaves podem ficar públicas: quem protege os dados são as regras do passo 5.

## 5. Regras de segurança (importante)
1. Abra `firestore.rules`, troque `COLE_AQUI_O_SEU_UID` pelo UID do passo 3.
2. Firestore Database > aba **Regras** → apague o que tiver, cole o conteúdo do arquivo → **Publicar**.

Com isso: o site só consegue **criar** agendamentos e ver quais horários estão ocupados. Nome, telefone e valores das clientes só você vê, logada no painel.

## 6. Publicar no GitHub Pages
1. Crie um repositório no GitHub e envie todos os arquivos desta pasta (incluindo a pasta `img`).
2. No repositório: **Settings > Pages > Deploy from a branch** → branch `main`, pasta `/ (root)` → Save.
3. Em alguns minutos o site fica em `https://SEU-USUARIO.github.io/NOME-DO-REPO/` e o painel em `.../admin.html`.
4. No Firebase: **Authentication > Configurações > Domínios autorizados > Adicionar domínio** → `SEU-USUARIO.github.io`.

Salve o endereço do painel nos favoritos do celular. Ele não aparece em nenhum link do site.

## Como o painel funciona
- **Clientes do dia:** lista por horário, com WhatsApp, serviços e valores. Mude a **Situação**:
  - *Reservado* → a cliente agendou no site, mas você ainda não conferiu a entrada.
  - *Entrada paga* → você viu o Pix/cartão da entrada.
  - *Concluído* → atendimento feito e o restante pago.
  - *Cancelado* → libera o horário no site (você escolhe se a entrada fica no caixa).
  - **+ Adicionar cliente**: para quem marcou pelo WhatsApp; o horário fica ocupado no site.
- **Caixa:** *Já entrou* = entradas pagas + atendimentos concluídos. *A receber* = estimativa do que falta entrar (reservas e restantes).
- **Travar agenda:** um horário, um dia inteiro ou vários dias (férias). Some na hora do site.
- **Serviços e tempos:** preço e duração de cada serviço, extra e manutenção. O site soma as durações do que a cliente escolher e só mostra horários em que cabe tudo.
- **Horários:** dias e horários de funcionamento da semana, intervalo entre horários, antecedência mínima e quantos dias à frente a agenda abre.

## Limites do plano gratuito
50 mil leituras e 20 mil gravações por dia: sobra muito para um studio. Se um dia passar, o Firebase só para de responder até o dia seguinte; não cobra nada sem você ativar o faturamento.

## Observação
O pagamento da entrada no site ainda está em **modo demonstração** (`DEMO=true` no `index.html`): nenhuma cobrança real é feita. Por isso toda reserva chega como *Reservado* para você conferir o Pix antes de marcar *Entrada paga*.
