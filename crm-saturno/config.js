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
  SUPABASE_ANON_KEY: 'sb_publishable_iprhqxL36BQb7psuTS1wSQ_UAYlhbmi'
};

// Dados da empresa usados nas mensagens prontas e na etiqueta de envio
// whatsapp: só dígitos com DDI e DDD, ex.: '5531999999999'
// avaliacao_google: link "Pedir avaliações" do Perfil da Empresa no Google
window.SATURNO_EMPRESA = {
  nome: 'Saturno NFC',
  cidade: 'Ouro Preto - MG',
  site: 'https://www.saturnonfc.com.br',
  whatsapp: '',
  avaliacao_google: ''
};
