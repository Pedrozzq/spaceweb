// =====================================================================
//  SATURNO NFC · CRM — configuração
//  Cole os dados do projeto Supabase da Saturno: Supabase > Project Settings > API
//  Enquanto estiver com os valores de exemplo, o CRM roda em MODO DEMONSTRAÇÃO
//  (dados fictícios, qualquer login entra).
//  A anon key pode ficar pública: todas as tabelas são protegidas por RLS e só
//  usuários logados leem os dados.
// =====================================================================
window.SATURNO_CONFIG = {
  SUPABASE_URL: 'https://lrthxbchqafcjbvjwcne.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_iprhqxL36BQb7psuTS1wSQ_UAYlhbmi',
  // WhatsApp da CRM: 'chatwoot' (caixa "Canal da API" do Chatwoot) ou 'meta' (API oficial da Meta)
  WHATSAPP_VIA: 'chatwoot',
  CHATWOOT_URL: 'https://whatsapp-chatwoot.fycoqq.easypanel.host',
  CHATWOOT_ACCOUNT_ID: 2
};

// Dados da empresa usados nas mensagens prontas e na etiqueta de envio
// whatsapp: só dígitos com DDI e DDD, ex.: '5531999999999'
// avaliacao_google: link "Pedir avaliações" do Perfil da Empresa no Google
// link_gestao: link de pagamento da Stripe da assinatura Gestão Saturno
window.SATURNO_EMPRESA = {
  nome: 'Saturno NFC',
  cidade: 'Ouro Preto - MG',
  site: 'https://www.saturnonfc.com.br',
  whatsapp: '',
  avaliacao_google: 'https://g.page/r/CZbC0ewXU41FEBM/review',
  link_gestao: 'https://buy.stripe.com/fZu8wOeQg9Zv1Zze2Ogw006'
};
