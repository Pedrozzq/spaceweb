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
    └── functions/whatsapp/index.ts ← Edge Function: webhook da Meta e envio
```

Abra o `index.html` sem configurar nada para ver o **modo demonstração** (dados fictícios, qualquer login entra, nada é salvo).

## O que tem

| Tela | O que faz |
|---|---|
| **Visão geral** | Vendas do mês, receita recorrente, leads do mês, conversão, pedidos em andamento, tarefas de hoje, leads esperando resposta, mensalidades a vencer e gráficos de faturamento |
| **Leads e funil** | Etapas: Novo lead → Em atendimento IA → Atendimento humano → Reunião agendada → Proposta enviada → Ganho / Perdido / Sem interesse. **Tabela** (ordena por coluna, muda etapa na linha), **Kanban** (arrastar e soltar; no celular, "Mover para…") e **Relatórios** (conversão, faturamento, ticket médio, ciclo de venda, leads por etapa, funil, evolução mensal, origem, motivos de perda, interesse). Filtros por busca, etapa, mês e origem. Importa e exporta CSV |
| **Ficha do lead** | Dados, histórico (notas + mudanças de etapa registradas sozinhas) e tarefas. Lead **ganho** vira cliente com um clique e já abre o pedido com o produto de interesse. **Perdido** pede o motivo |
| **Tarefas** | Lembretes de follow-up: atrasadas, hoje, próximos 7 dias |
| **Pedidos** | Novo → Criação da arte → Aguardando aprovação → Em produção → Enviado → Entregue. Pago/a receber, rastreio, prazo, personalização por item, etiqueta de envio 10×15 cm (PDF), CSV |
| **Clientes** | Empresa, CPF/CNPJ, endereço (CEP completa sozinho), link da página NFC, link de avaliação Google do cliente, pedidos, assinaturas e negócios |
| **Assinaturas** | Mensalidades (ex.: manutenção da página R$ 89,90): receita recorrente, vencimentos, atrasos, "Recebido" registra o pagamento e passa para o mês seguinte |
| **Produtos** | Preço, estoque (baixa sozinha a cada pedido; cancelado devolve), ativo, cobrança mensal |
| **Margem de lucro** | Custo, frete, impostos, lucro e margem; calculadora de preço pela margem desejada |
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

## 4. WhatsApp Business dentro do CRM (opcional)

Usa a API oficial (Cloud API) da Meta; o token fica numa Edge Function, nunca no navegador.

```
supabase login
supabase link --project-ref lrthxbchqafcjbvjwcne
supabase functions deploy whatsapp --no-verify-jwt
supabase secrets set WHATSAPP_TOKEN=... WHATSAPP_PHONE_NUMBER_ID=... WHATSAPP_VERIFY_TOKEN=uma-senha-qualquer WHATSAPP_APP_SECRET=...
```

(rode dentro da pasta `crm-saturno`). Na Meta: **WhatsApp › Configuração › Webhook**, URL `https://lrthxbchqafcjbvjwcne.supabase.co/functions/v1/whatsapp`, token = `WHATSAPP_VERIFY_TOKEN`, assine **messages**. O botão **Conexão** na tela WhatsApp mostra o que falta.

- Janela de 24 h da Meta: texto livre só até 24 h depois da última mensagem do contato; fora disso, só modelo aprovado.
- Agente n8n junto: coloque a URL do webhook do n8n em `FORWARD_WEBHOOK_URL`. Quando alguém da equipe responde pelo CRM, o agente pausa naquela conversa.

## 5. Agente de IA (n8n)

Pegue a chave na tela **Agente WhatsApp**. Chamadas `POST https://lrthxbchqafcjbvjwcne.supabase.co/rest/v1/rpc/<funcao>` com headers `apikey: ANON_KEY` e `Content-Type: application/json`:

| Função | Quando | Body |
|---|---|---|
| `agente_buscar_contato` | Início da conversa | `{"p_chave":"…","p_telefone":"31999998888"}` |
| `agente_salvar_lead` | A cada dado novo | `{"p_chave":"…","p_dados":{"telefone":"…","nome":"…","empresa":"…","cidade":"…","interesse":"Plano Essencial","valor":600,"etapa":"reuniao"}}` |
| `agente_registrar_nota` | Resumo da conversa | `{"p_chave":"…","p_telefone":"…","p_texto":"Quer 2 espelhos para a loja"}` |
| `agente_chamar_humano` | Pronto para fechar / dúvida | `{"p_chave":"…","p_telefone":"…","p_motivo":"…"}` |
| `agente_listar_produtos` | "Quanto custa?" | `{"p_chave":"…"}` |
| `agente_status_pedido` | "Cadê meu pedido?" | `{"p_chave":"…","p_telefone":"…","p_numero":null}` |

Regras: telefone é normalizado (aceita `(31) 99999-8888`, `+55…`); campos vazios não apagam dados; lead novo do agente entra em **Em atendimento IA**; se o contato voltar depois de um negócio fechado, abre um lead novo com o nome já conhecido. `etapa` aceita `novo`, `ia`, `humano`, `reuniao`, `proposta`, `ganho`, `perdido`, `sem_interesse`.

## Catálogo inicial

Criado pelo `schema.sql` com os preços do site: Plano Essencial R$ 600, Profissional R$ 1.000, Fora de Órbita R$ 2.000, Cartão Google Avaliação R$ 60, Kit 2 cartões R$ 100 e Manutenção mensal R$ 89,90.
**Cartão NFC avulso** e **Espelho Instagramável** entram com preço R$ 0: defina em **Produtos**.
