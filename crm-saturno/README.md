# Saturno NFC · CRM

CRM de vendas da Saturno NFC (cartões NFC, cartões Google Avaliação e espelhos instagramáveis).
Mesma base da CRM da Zoo, com as funções da CRM antiga (Lovable): **funil de leads em Tabela, Kanban e Relatórios, histórico e tarefas por lead**.

```
crm-saturno/
├── index.html                      ← o CRM (é só hospedar a pasta)
├── config.js                       ← URL e anon key do Supabase + dados da empresa
├── css/crm.css
├── js/                             ← base, dados, gráficos, telas e app
├── img/                            ← ícone (planeta do logo)
└── supabase/
    ├── schema.sql                  ← banco completo (rode primeiro)
    ├── whatsapp.sql                ← caixa de entrada do WhatsApp (rode depois)
    ├── stripe.sql                  ← ids da Stripe nas assinaturas (rode depois)
    ├── plataformas.sql             ← custos mensais das plataformas da Saturno (rode depois)
    ├── functions/stripe/index.ts   ← Edge Function: assinatura paga na Stripe entra na CRM
    └── functions/whatsapp/index.ts ← Edge Function: webhook da Meta e envio
```

Abra o `index.html` sem configurar nada para ver o **modo demonstração** (dados fictícios, qualquer login entra, nada é salvo).

## O que tem

| Tela | O que faz |
|---|---|
| **Visão geral** | Vendas do mês, receita recorrente, leads do mês, conversão, pedidos em andamento, tarefas de hoje, leads esperando resposta, mensalidades a vencer e gráficos de faturamento |
| **Leads e funil** | Etapas: Novo lead → Em atendimento IA → Atendimento humano → Proposta enviada → Ganho / Perdido. **Tabela** (ordena por coluna, muda etapa na linha), **Kanban** (arrastar e soltar; no celular, "Mover para…") e **Relatórios** (conversão, faturamento, ticket médio, ciclo de venda, leads por etapa, funil, evolução mensal, origem, motivos de perda, interesse). Filtros por busca, etapa, mês e origem. Importa e exporta CSV |
| **Ficha do lead** | Dados, histórico (notas + mudanças de etapa registradas sozinhas) e tarefas. Lead **ganho** vira cliente com um clique e já abre o pedido com o produto de interesse. **Perdido** pede o motivo |
| **Tarefas** | Lembretes de follow-up: atrasadas, hoje, próximos 7 dias |
| **Pedidos** | Novo → Criação da arte → Aguardando aprovação → Em produção → Enviado → Entregue. Pago/a receber, rastreio, prazo, personalização por item, etiqueta de envio 10×15 cm (PDF), CSV |
| **Clientes** | Empresa, CPF/CNPJ, endereço (CEP completa sozinho), link da página NFC, link de avaliação Google do cliente, pedidos, assinaturas e negócios |
| **Assinaturas** | Mensalidades (ex.: manutenção da página R$ 89,90): receita recorrente, vencimentos, atrasos, "Recebido" registra o pagamento e passa para o mês seguinte |
| **Produtos** | Preço, estoque (baixa sozinha a cada pedido; cancelado devolve), ativo, cobrança mensal |
| **Margem de lucro** | Custo, frete, impostos, lucro e margem; calculadora de preço pela margem desejada |
| **Plataformas** | Assinaturas que a Saturno paga (Supabase, VPS, domínio, Canva…): adiciona, edita nome/categoria/valor/cobrança e marca ativa direto na tabela. Mostra custo mensal (anual ÷ 12), custo anual e quanto sobra da receita recorrente. Rode o `supabase/plataformas.sql` antes de usar |
| **WhatsApp** | Caixa de entrada pela API oficial da Meta. Contato novo vira lead sozinho. Liga/desliga o agente por conversa |
| **Mensagens prontas** | Textos para leads (apresentar planos, proposta, follow-up), pedidos (arte, produção, envio com rastreio, entrega + avaliação) e mensalidades. Copia ou abre direto no WhatsApp |
| **Agente WhatsApp** | Chave e funções para o agente de IA (n8n) criar/mover leads |
| **Personalizar** | Tema claro/escuro, nome da marca e cor principal (salvo em cada navegador) |

Som e aviso na tela quando chega lead novo, pedido novo ou quando o agente pede atendimento humano (liga/desliga no menu).

## 1. Configurar o Supabase

O projeto já está apontado no `config.js` (`lrthxbchqafcjbvjwcne`).

1. **SQL Editor → New query**: cole todo o `supabase/schema.sql` → **Run**. Depois faça o mesmo com o `supabase/whatsapp.sql`.
2. **Project Settings → API**: copie a **anon public key** e cole em `config.js` → `SUPABASE_ANON_KEY`.
3. **Authentication → Sign In / Providers → Email**: desative **"Allow new users to sign up"** (só entra quem você criar).
4. **Authentication → Users → Add user → Create new user**: crie o login de cada pessoa da equipe (marque *Auto Confirm User*).
5. Ainda em `config.js`, preencha `whatsapp` e `avaliacao_google` da Saturno (usados nas mensagens e na etiqueta).

> A anon key pode ficar no código: todas as tabelas têm RLS e só usuários logados leem os dados.

## 2. Trazer os leads da CRM antiga

Na CRM antiga (Lovable), clique em **CSV** e baixe a planilha. Aqui, em **Leads e funil → Importar CSV**, envie o arquivo:
as colunas são reconhecidas sozinhas (nome, empresa, plano, telefone, cidade, faturamento, etapa, data) e dá para ajustar antes de importar.
Quem já existir (mesmo nome, empresa e telefone) é pulado.

> A CRM antiga guarda os dados só no navegador em que ela foi usada: exporte o CSV nesse mesmo navegador.

## 3. Publicar

A pasta fica em `spaceweb/crm-saturno`, então com o site publicado ela abre em `https://www.saturnonfc.com.br/crm-saturno/`.
Depois, em **Supabase → Authentication → URL Configuration**, coloque esse endereço em *Site URL*.

## 4. WhatsApp dentro do CRM (pelo Chatwoot)

A Saturno usa o WhatsApp no Chatwoot (caixa **"Whatsapp"**, tipo *Canal da API*, id **1**, conta **2**).
A função `supabase/functions/chatwoot` liga os dois: toda mensagem (do contato, da equipe ou do agente n8n) aparece na aba **WhatsApp** da CRM,
**contato novo vira lead sozinho** (etapa "Em atendimento IA") e a equipe responde pela CRM (sai pelo Chatwoot).
A chave **Agente IA** de cada conversa põe/tira a etiqueta **humano** no Chatwoot, a mesma que o fluxo do n8n usa para parar de responder.

1. **SQL Editor**: rode de novo o `supabase/whatsapp.sql` (acrescenta os campos do Chatwoot; pode rodar mais de uma vez).
2. **Edge Functions → Deploy a new function → Via editor**: nome `chatwoot`, cole o `supabase/functions/chatwoot/index.ts`, publique. Em **Details**, desligue **Verify JWT**.
3. **Edge Functions → Secrets**:
   - `CHATWOOT_URL` = `https://whatsapp-chatwoot.fycoqq.easypanel.host`
   - `CHATWOOT_ACCOUNT_ID` = `2`
   - `CHATWOOT_INBOX_ID` = `1`
   - `CHATWOOT_TOKEN` = Chatwoot → seu perfil (canto inferior esquerdo) → **Configurações do perfil → Token de acesso**
   - `CHATWOOT_WEBHOOK_TOKEN` = uma senha que você inventa (ex.: `saturno-2026-xyz`)
4. **Chatwoot → Configurações → Integrações → Webhooks → Adicionar**:
   URL `https://lrthxbchqafcjbvjwcne.supabase.co/functions/v1/chatwoot?token=SUA-SENHA` (a mesma do passo 3), eventos **Mensagem criada** e **Conversa atualizada**.
   Isso não mexe no webhook da caixa que leva as mensagens ao n8n: o agente continua funcionando igual.
5. Na CRM, tela **WhatsApp → Conexão** mostra se está tudo certo.

> Prefere a API oficial da Meta? Troque `WHATSAPP_VIA` para `'meta'` no `config.js` e use a função `supabase/functions/whatsapp` (passo a passo no botão Conexão).

## 5. Agente de IA (n8n)

**Leads automáticos:** com o passo 4 feito, todo contato novo do WhatsApp já entra no funil sozinho. Para o agente também preencher nome, empresa, interesse e valor,
troque a ferramenta **`cadastrar_lead_crm`** do fluxo *1- Secretaria IA* (hoje ela envia para a CRM antiga do Lovable) para:

- Método `POST`, URL `https://lrthxbchqafcjbvjwcne.supabase.co/rest/v1/rpc/agente_salvar_lead`
- Headers: `apikey` = a publishable key do `config.js` e `Content-Type` = `application/json`
- Body (JSON): `p_chave` = chave da tela **Agente WhatsApp** da CRM; `p_dados` com `telefone` (o número do contato que já vem do Chatwoot no fluxo) e os campos que a IA preenche: `nome`, `empresa`, `cidade`, `interesse`, `valor`.

E no sub-fluxo **transferir_para_humano**, acrescente uma chamada a `agente_chamar_humano` para o lead ir para "Atendimento humano" no funil (com aviso sonoro na CRM).


Pegue a chave na tela **Agente WhatsApp**. Chamadas `POST https://lrthxbchqafcjbvjwcne.supabase.co/rest/v1/rpc/<funcao>` com headers `apikey: ANON_KEY` e `Content-Type: application/json`:

| Função | Quando | Body |
|---|---|---|
| `agente_buscar_contato` | Início da conversa | `{"p_chave":"…","p_telefone":"31999998888"}` |
| `agente_salvar_lead` | A cada dado novo | `{"p_chave":"…","p_dados":{"telefone":"…","nome":"…","empresa":"…","cidade":"…","interesse":"Plano Essencial","valor":600,"etapa":"proposta"}}` |
| `agente_registrar_nota` | Resumo da conversa | `{"p_chave":"…","p_telefone":"…","p_texto":"Quer 2 espelhos para a loja"}` |
| `agente_chamar_humano` | Pronto para fechar / dúvida | `{"p_chave":"…","p_telefone":"…","p_motivo":"…"}` |
| `agente_listar_produtos` | "Quanto custa?" | `{"p_chave":"…"}` |
| `agente_status_pedido` | "Cadê meu pedido?" | `{"p_chave":"…","p_telefone":"…","p_numero":null}` |

Regras: telefone é normalizado (aceita `(31) 99999-8888`, `+55…`); campos vazios não apagam dados; lead novo do agente entra em **Em atendimento IA**; se o contato voltar depois de um negócio fechado, abre um lead novo com o nome já conhecido. `etapa` aceita `novo`, `ia`, `humano`, `proposta`, `ganho`, `perdido` (se o agente ainda mandar `reuniao` ou `sem_interesse`, o banco converte para `proposta` e `perdido` — ver `supabase/etapas.sql`).

## 6. Gestão Saturno pela Stripe (assinatura entra sozinha)

Quando a Stripe recebe um pagamento do produto **Gestão Saturno** (`prod_VJI9xh6P8Ao8Rm`), a função `supabase/functions/stripe`
cadastra o cliente (ou acha pelo telefone/e-mail), cria a assinatura na aba **Assinaturas** e registra o pagamento.
A cada renovação paga, o próximo vencimento avança sozinho. Cancelou na Stripe → "Cancelada"; pausou a cobrança → "Pausada".

1. **SQL Editor**: rode o `supabase/stripe.sql`.
2. **Edge Functions → Deploy a new function → Via editor**: nome `stripe`, cole o `supabase/functions/stripe/index.ts`, publique. Em **Details**, desligue **Verify JWT**.
3. **Stripe → Desenvolvedores/Workbench → Webhooks → Adicionar destino**: URL `https://lrthxbchqafcjbvjwcne.supabase.co/functions/v1/stripe`,
   eventos `invoice.paid`, `customer.subscription.updated` e `customer.subscription.deleted`. Copie a **chave secreta de assinatura** (`whsec_…`).
4. **Edge Functions → Secrets**:
   - `STRIPE_WEBHOOK_SECRET` = o `whsec_…` do passo 3
   - `STRIPE_PRODUTO_ID` = `prod_VJI9xh6P8Ao8Rm`
   - `STRIPE_PRODUTO_NOME` = `Gestão Saturno` (opcional)
5. No link de pagamento/checkout da Stripe, ative **coletar telefone** para o cliente já entrar com WhatsApp na CRM.

> Teste: no webhook da Stripe, **Enviar evento de teste** só manda dados fictícios (ignorados por serem de outro produto). Para testar de verdade, reenvie um `invoice.paid` real da Gestão Saturno pela lista de eventos da Stripe (não duplica pagamento).

## Catálogo inicial

Criado pelo `schema.sql` com os preços do site: Plano Essencial R$ 600, Profissional R$ 1.000, Fora de Órbita R$ 2.000, Cartão Google Avaliação R$ 60, Kit 2 cartões R$ 100 e Manutenção mensal R$ 89,90.
**Cartão NFC avulso** e **Espelho Instagramável** entram com preço R$ 0: defina em **Produtos**.
