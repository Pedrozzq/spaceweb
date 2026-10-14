// =====================================================================
//  SATURNO NFC · CRM — camada de dados
//  Supabase (produção) ou memória (modo demonstração, com dados fictícios)
// =====================================================================
'use strict';
const sb = DEMO ? null : supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
const chk = ({data, error}) => { if (error) throw new Error(traduzErro(error)); return data; };
function traduzErro(e) {
  const m = e.message || String(e);
  if (/Could not find the table|relation .* does not exist|schema cache/i.test(m)) return 'O banco ainda não foi preparado: rode o supabase/schema.sql no Supabase (SQL Editor)';
  if (/duplicate key.*telefone/i.test(m)) return 'Já existe um cadastro com esse telefone';
  if (/JWT|not authenticated|permission denied/i.test(m)) return 'Sessão expirada: entre de novo';
  return m;
}
let USER_EMAIL = '';

const API = DEMO ? demoApi() : {
  // ---- login
  async session() { const s = (await sb.auth.getSession()).data.session; USER_EMAIL = s?.user?.email || ''; return s; },
  async login(email, senha) { const r = await sb.auth.signInWithPassword({email, password: senha}); if (r.error) throw new Error('E-mail ou senha incorretos'); USER_EMAIL = email; return r.data.session; },
  async logout() { await sb.auth.signOut(); },

  // ---- leads
  async leads() { return chk(await sb.from('leads').select('*').order('criado_em', {ascending: false}).limit(5000)); },
  async lead(id) { return chk(await sb.from('leads').select('*').eq('id', id).single()); },
  async salvarLead(l) {
    const {id, ...row} = l;
    return id ? chk(await sb.from('leads').update(row).eq('id', id).select().single())
              : chk(await sb.from('leads').insert(row).select().single());
  },
  async atualizarLead(id, patch) { return chk(await sb.from('leads').update(patch).eq('id', id).select().single()); },
  async excluirLead(id) { chk(await sb.from('leads').delete().eq('id', id)); },
  async importarLeads(rows) {
    let n = 0;
    for (let i = 0; i < rows.length; i += 200) { const lote = rows.slice(i, i + 200); chk(await sb.from('leads').insert(lote)); n += lote.length; }
    return n;
  },
  async atividades(leadId) { return chk(await sb.from('lead_atividades').select('*').eq('lead_id', leadId).order('criado_em', {ascending: false})); },
  async atividadesTodas(desde) { return chk(await sb.from('lead_atividades').select('lead_id,tipo,texto,criado_em').eq('tipo', 'etapa').gte('criado_em', desde)); },
  async registrarNota(leadId, texto, tipo = 'nota') { return chk(await sb.from('lead_atividades').insert({lead_id: leadId, texto, tipo, autor: USER_EMAIL || null}).select().single()); },

  // ---- tarefas
  async tarefas() { return chk(await sb.from('tarefas').select('*, leads(id,nome,empresa,telefone), clientes(id,nome,telefone)').order('vence_em', {ascending: true, nullsFirst: false}).limit(2000)); },
  async salvarTarefa(t) { return chk(await sb.from('tarefas').insert(t).select().single()); },
  async atualizarTarefa(id, patch) { chk(await sb.from('tarefas').update(patch).eq('id', id)); },
  async excluirTarefa(id) { chk(await sb.from('tarefas').delete().eq('id', id)); },

  // ---- clientes
  async clientes() { return chk(await sb.from('clientes_resumo').select('*').order('nome')); },
  async cliente(id) {
    const c = chk(await sb.from('clientes_resumo').select('*').eq('id', id).single());
    const [peds, assin, leads] = await Promise.all([
      sb.from('pedidos').select('*, pedido_itens(*)').eq('cliente_id', id).order('criado_em', {ascending: false}),
      sb.from('assinaturas').select('*').eq('cliente_id', id).order('criado_em', {ascending: false}),
      sb.from('leads').select('id,nome,etapa,valor,interesse,criado_em').eq('cliente_id', id).order('criado_em', {ascending: false})]);
    return {...c, pedidos: chk(peds), assinaturas: chk(assin), leads: chk(leads)};
  },
  async salvarCliente(c) {
    const {id, ...row} = c;
    return id ? chk(await sb.from('clientes').update(row).eq('id', id).select().single())
              : chk(await sb.from('clientes').insert(row).select().single());
  },
  async excluirCliente(id) { chk(await sb.from('clientes').delete().eq('id', id)); },

  // ---- pedidos
  async pedidos() {
    return chk(await sb.from('pedidos').select('*, clientes(id,nome,telefone,email,empresa,endereco,bairro,cidade,uf,cep), pedido_itens(*)').order('criado_em', {ascending: false}).limit(2000));
  },
  async atualizarPedido(id, patch) { return chk(await sb.from('pedidos').update(patch).eq('id', id).select().single()); },
  async criarPedido(p, itens) {
    const ped = chk(await sb.from('pedidos').insert(p).select().single());
    if (itens.length) chk(await sb.from('pedido_itens').insert(itens.map(i => ({...i, pedido_id: ped.id}))));
    return ped;
  },

  // ---- produtos e custos
  async produtos() { return chk(await sb.from('produtos').select('*').order('categoria').order('preco')).filter(p => !p.excluido); },
  async atualizarProduto(id, patch) { chk(await sb.from('produtos').update(patch).eq('id', id)); },
  async salvarProduto(p) { const {id, ...row} = p; id ? chk(await sb.from('produtos').update(row).eq('id', id)) : chk(await sb.from('produtos').insert(row)); },
  async excluirProduto(id) { chk(await sb.from('produtos').update({excluido: true, ativo: false}).eq('id', id)); },
  async custos() { return chk(await sb.from('produto_custos').select('produto_id,custo,frete,taxa_pct,fornecedor')); },
  async salvarCusto(produto_id, patch) { chk(await sb.from('produto_custos').upsert({produto_id, ...patch}, {onConflict: 'produto_id'})); },

  // ---- assinaturas
  async assinaturas() { return chk(await sb.from('assinaturas').select('*, clientes(id,nome,telefone,empresa)').order('proximo_vencimento')); },
  async salvarAssinatura(a) { const {id, ...row} = a; return id ? chk(await sb.from('assinaturas').update(row).eq('id', id).select().single()) : chk(await sb.from('assinaturas').insert(row).select().single()); },
  async atualizarAssinatura(id, patch) { chk(await sb.from('assinaturas').update(patch).eq('id', id)); },
  async pagamentos(assId) { return chk(await sb.from('assinatura_pagamentos').select('*').eq('assinatura_id', assId).order('pago_em', {ascending: false})); },
  async pagamentosTodos(desde) { return chk(await sb.from('assinatura_pagamentos').select('valor,pago_em').gte('pago_em', desde)); },
  // registra o pagamento do vencimento atual e passa para o mês seguinte
  async registrarPagamento(a) {
    chk(await sb.from('assinatura_pagamentos').insert({assinatura_id: a.id, referencia: a.proximo_vencimento, valor: a.valor}));
    chk(await sb.from('assinaturas').update({proximo_vencimento: somaMes(a.proximo_vencimento)}).eq('id', a.id));
  },

  // ---- WhatsApp
  async waConversas() { return chk(await sb.from('wa_conversas').select('*, clientes(id,nome), leads(id,nome,etapa)').order('ultima_msg_em', {ascending: false, nullsFirst: false}).limit(300)); },
  async waMensagens(id) { return chk(await sb.from('wa_mensagens').select('*').eq('conversa_id', id).order('criado_em').limit(500)); },
  async waLer(id) { chk(await sb.from('wa_conversas').update({nao_lidas: 0}).eq('id', id)); },
  async waBot(id, pausado) { chk(await sb.from('wa_conversas').update({bot_pausado: pausado}).eq('id', id)); },
  async waFn(body) {
    const {data, error} = await sb.functions.invoke('whatsapp', {body});
    if (error) {
      const det = await error.context?.json?.().catch(() => null);
      throw new Error(det?.error || (/Failed to send|fetch/i.test(error.message) ? 'Função "whatsapp" não publicada no Supabase' : error.message));
    }
    return data;
  },
  async waEnviar(msg) { return API.waFn({acao: 'enviar', ...msg}); },
  async waStatus() { return API.waFn({acao: 'status'}); },
  waRealtime(cb) {
    sb.channel('sat-wa').on('postgres_changes', {event: '*', schema: 'public', table: 'wa_mensagens'}, cb)
      .on('postgres_changes', {event: '*', schema: 'public', table: 'wa_conversas'}, cb).subscribe();
  },

  // ---- agente
  async chave() { return chk(await sb.rpc('ver_chave_agente')); },
  async novaChave() { return chk(await sb.rpc('gerar_nova_chave_agente')); },

  realtime(cb) {
    const ch = sb.channel('sat-crm');
    ['leads', 'lead_atividades', 'tarefas', 'pedidos', 'clientes', 'produtos', 'assinaturas'].forEach(t => ch.on('postgres_changes', {event: '*', schema: 'public', table: t}, cb));
    ch.subscribe();
  }
};

// =====================================================================
//  MODO DEMONSTRAÇÃO — dados fictícios em memória (nada é salvo)
// =====================================================================
function demoApi() {
  const now = Date.now(), H = 3600e3, D = 24 * H;
  const iso = ms => new Date(ms).toISOString();
  let seed = 11; const rnd = n => { seed = (seed * 9301 + 49297) % 233280; return Math.floor(seed / 233280 * n); };
  const pick = a => a[rnd(a.length)];

  const produtos = [
    ['Plano Essencial', 'Planos', 600, false, 'Cartão NFC + página personalizada'],
    ['Plano Profissional', 'Planos', 1000, false, 'Cartões NFC + página completa'],
    ['Plano Fora de Órbita', 'Planos', 2000, false, 'Para grandes empresas'],
    ['Cartão NFC avulso', 'Cartões NFC', 120, false, 'Cartão PVC com chip NFC'],
    ['Cartão Google Avaliação', 'Google Avaliação', 60, false, '1 cartão de avaliação no Google'],
    ['Kit 2 Cartões Google Avaliação', 'Google Avaliação', 100, false, '2 cartões de avaliação no Google'],
    ['Espelho Instagramável', 'Espelhos', 890, false, 'Espelho com logo e NFC'],
    ['Manutenção da página NFC (mensal)', 'Serviços', 89.9, true, 'Alterações ilimitadas, relatórios e suporte']
  ].map(([nome, categoria, preco, recorrente, descricao], i) => ({id: uid(), nome, categoria, preco, recorrente, descricao, ativo: true, excluido: false,
    estoque: categoria === 'Google Avaliação' ? 40 : categoria === 'Espelhos' ? 3 : null, criado_em: iso(now - 200 * D + i)}));
  const P = n => produtos.find(p => p.nome === n);
  const custos = [['Plano Essencial', 95], ['Plano Profissional', 160], ['Plano Fora de Órbita', 380], ['Cartão NFC avulso', 22],
    ['Cartão Google Avaliação', 9.5], ['Kit 2 Cartões Google Avaliação', 19], ['Espelho Instagramável', 310]]
    .map(([n, custo]) => ({produto_id: P(n).id, custo, frete: n.includes('Espelho') ? 45 : 0, taxa_pct: 6, fornecedor: null}));

  const empresas = ['Café Central', 'Barbearia Dom', 'Studio Bella', 'Pizzaria Forno a Lenha', 'Ótica Visão', 'Academia Forma', 'Clínica Sorriso', 'Pousada Serra',
    'Imobiliária Lar', 'Pet Shop Amigo', 'Doceria Encanto', 'Restaurante Tropeiro', 'Escritório Lima Advogados', 'Hamburgueria 77', 'Salão Glamour',
    'Hotel Colonial', 'Loja Jeans & Co', 'Distribuidora Minas', 'Floricultura Jardim', 'Consultório Dra. Paula', 'Bar do Largo', 'Ateliê Arte Viva',
    'Construtora Base', 'Autoescola Rota', 'Farmácia Saúde', 'Livraria Página', 'Padaria Pão Quente', 'Estética Renova', 'Agência Voo', 'Cervejaria Ouro'];
  const nomes = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elisa', 'Fábio', 'Gabriela', 'Hugo', 'Isabela', 'João', 'Karen', 'Lucas', 'Marina', 'Nicolas', 'Olívia',
    'Paulo', 'Renata', 'Sérgio', 'Tatiane', 'Vítor', 'Yasmin', 'Rafael', 'Camila', 'Thiago', 'Juliana', 'Mateus', 'Letícia', 'André', 'Priscila', 'Gustavo'];
  const sobren = ['Souza', 'Lima', 'Alves', 'Pereira', 'Costa', 'Rocha', 'Martins', 'Ribeiro', 'Faria', 'Teixeira'];
  const cidades = ['Ouro Preto', 'Ouro Preto', 'Ouro Preto', 'Mariana', 'Belo Horizonte', 'Itabirito', 'Congonhas'];
  const interesses = [['Plano Essencial', 600], ['Plano Essencial', 600], ['Plano Profissional', 1000], ['Plano Fora de Órbita', 2000],
    ['Cartão Google Avaliação', 100], ['Espelho Instagramável', 890], ['Plano Profissional', 1000]];
  const origens = ['whatsapp', 'whatsapp', 'instagram', 'site', 'indicacao', 'google', 'agente'];

  const clientes = [], leads = [], atividades = [], tarefas = [], pedidos = [], itens = [], assinaturas = [], pagamentosA = [];
  const ativ = (lead_id, tipo, texto, quando, autor = 'equipe@saturnonfc.com.br') => atividades.push({id: uid(), lead_id, tipo, texto, autor, criado_em: iso(quando)});

  // 30 leads espalhados nos últimos 6 meses
  empresas.forEach((emp, i) => {
    const criado = now - (175 - i * 6 + rnd(4)) * D - rnd(10) * H;
    const [interesse, valor] = pick(interesses);
    // mais antigos tendem a estar fechados; recentes ainda no funil
    let etapa = i < 18 ? pick(['ganho', 'ganho', 'ganho', 'perdido', 'ganho', 'sem_interesse', 'perdido', 'ganho'])
      : i < 24 ? pick(['proposta', 'reuniao', 'humano', 'ganho', 'proposta']) : pick(['novo', 'ia', 'novo', 'humano', 'ia']);
    if (i === 20 || i === 22 || i === 23) etapa = 'ganho';   // algumas vendas recentes (pedidos em produção)
    const ordem = ETAPAS.find(e => e.k === etapa).ordem;
    const l = {id: uid(), nome: `${nomes[i]} ${pick(sobren)}`, telefone: '5531' + (988000000 + i * 1373 + rnd(900)), email: `${nomes[i].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}@${emp.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '')}.com.br`,
      empresa: emp, cidade: pick(cidades), interesse, valor, etapa, origem: pick(origens), motivo_perda: etapa === 'perdido' ? pick(MOTIVOS_PERDA.slice(0, 5)) : null,
      observacoes: i % 5 === 0 ? 'Quer a página com cardápio e link do Instagram.' : null, cliente_id: null,
      etapa_max: ordem ?? (2 + rnd(3)), criado_em: iso(criado), atualizado_em: iso(criado + 5 * D), etapa_em: iso(i >= 18 && etapa === 'ganho' ? now - (1 + (i % 5)) * D : Math.min(now - H, criado + (3 + rnd(12)) * D))};
    leads.push(l);
    ativ(l.id, 'criado', 'Lead criado: ' + l.nome, criado, null);
    if (etapa !== 'novo') ativ(l.id, 'etapa', `Etapa alterada: Novo lead → ${ETAPA[etapa]}`, Date.parse(l.etapa_em));
    if (i % 3 === 0) ativ(l.id, 'nota', 'Ligação: pediu exemplos de páginas de clientes do mesmo ramo.', criado + 2 * D);
    if (etapa === 'ganho') {
      const c = {id: uid(), nome: l.nome, telefone: l.telefone, email: l.email, empresa: emp, documento: null, endereco: `Rua ${pick(['Direita', 'São José', 'Conde de Bobadela', 'Padre Rolim', 'do Pilar'])}, ${10 + rnd(400)}`,
        bairro: pick(['Centro', 'Pilar', 'Antônio Dias', 'Bauxita', 'Barra']), cidade: l.cidade, uf: 'MG', cep: '35400-000', link_pagina: `https://saturnonfc.com.br/${emp.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]+/g, '-')}`,
        link_avaliacao: null, observacoes: null, tags: i % 4 === 0 ? ['Indicou clientes'] : [], origem: l.origem, criado_em: l.etapa_em};
      clientes.push(c); l.cliente_id = c.id;
      const prod = P(interesse) || P('Plano Essencial');
      const st = Date.parse(l.etapa_em) < now - 20 * D ? 'entregue' : pick(['arte', 'aprovacao', 'producao', 'enviado']);
      const ped = {id: uid(), numero: 0, cliente_id: c.id, lead_id: l.id, status: st, forma_pagamento: pick(['pix', 'pix', 'cartao_credito', 'link']), parcelas: 1,
        pago: st === 'entregue' || rnd(2) === 0, tipo_entrega: pick(['correios', 'motoboy', 'retirada']), endereco_entrega: null, codigo_rastreio: st === 'enviado' ? 'QB' + (100000000 + rnd(899999999)) + 'BR' : null,
        prazo: dayKey(Date.parse(l.etapa_em) + 12 * D), desconto: 0, frete: 0, observacoes: null, origem: l.origem === 'agente' ? 'agente' : 'whatsapp', criado_em: l.etapa_em};
      pedidos.push(ped);
      itens.push({id: uid(), pedido_id: ped.id, produto_id: prod.id, produto: prod.nome, categoria: prod.categoria, quantidade: 1, preco_unitario: prod.preco, personalizacao: `Arte com logo ${emp}`});
      if (rnd(3) === 0) { const g = P('Cartão Google Avaliação'); itens.push({id: uid(), pedido_id: ped.id, produto_id: g.id, produto: g.nome, categoria: g.categoria, quantidade: 2, preco_unitario: g.preco, personalizacao: null}); }
      if (prod.categoria === 'Planos' && rnd(3) !== 0) {
        const venc = somaMes(dayKey(Date.parse(l.etapa_em)), 1), m = P('Manutenção da página NFC (mensal)');
        let prox = venc; while (diasAte(prox) < -3) prox = somaMes(prox);
        assinaturas.push({id: uid(), cliente_id: c.id, produto_id: m.id, descricao: m.nome, valor: m.preco, dia_vencimento: +venc.slice(8), proximo_vencimento: prox,
          status: rnd(9) === 0 ? 'pausada' : 'ativa', forma_pagamento: 'pix', observacoes: null, criado_em: l.etapa_em, cancelada_em: null});
      }
    }
    if (ETAPAS_ABERTAS.includes(etapa) && i % 2 === 0) {
      tarefas.push({id: uid(), lead_id: l.id, cliente_id: null, titulo: pick(['Ligar para tirar dúvidas', 'Enviar proposta', 'Mandar exemplos de páginas', 'Confirmar reunião', 'Follow-up da proposta']),
        vence_em: dayKey(now + (rnd(7) - 2) * D), feita: false, feita_em: null, criado_em: iso(now - D)});
    }
  });
  pedidos.sort((a, b) => a.criado_em.localeCompare(b.criado_em)).forEach((p, i) => p.numero = 1001 + i);
  const recalc = p => { p.subtotal = itens.filter(i => i.pedido_id === p.id).reduce((s, i) => s + i.quantidade * i.preco_unitario, 0); p.total = calcTotal(p); };
  pedidos.forEach(recalc);
  assinaturas.forEach(a => { for (let k = 1; k <= 3; k++) pagamentosA.push({id: uid(), assinatura_id: a.id, referencia: somaMes(a.proximo_vencimento, -k), valor: a.valor, pago_em: iso(Date.parse(somaMes(a.proximo_vencimento, -k) + 'T12:00:00'))}); });

  // conversas de WhatsApp fictícias
  const waConvs = [], waMsgs = [];
  [[leads[29], [['in', 'Oi! Vi o cartão NFC no Instagram, quanto custa?', 14], ['out', 'Oi! Temos 3 planos: Essencial, Profissional e Fora de Órbita. Posso te mandar os detalhes?', 12], ['in', 'Pode sim, é pra minha cervejaria', 9]], 1],
   [leads[27], [['in', 'Bom dia, o espelho com NFC tem pronta entrega?', 60 * 5]], 1],
   [leads[2], [['out', 'Seu pedido foi enviado! Código de rastreio: QB123456789BR', 60 * 30], ['in', 'Recebi, ficou lindo! 🤩', 60 * 26]], 0]
  ].forEach(([l, msgs, unread]) => {
    const id = uid();
    msgs.forEach(([d, t, min]) => waMsgs.push({id: uid(), conversa_id: id, direcao: d === 'in' ? 'entrada' : 'saida', tipo: 'text', texto: t, status: d === 'in' ? 'recebida' : 'lida', criado_em: iso(now - min * 60e3)}));
    const last = msgs[msgs.length - 1], lastIn = [...msgs].reverse().find(m => m[0] === 'in');
    waConvs.push({id, telefone: l.telefone, nome: l.nome.split(' ')[0], cliente_id: l.cliente_id, lead_id: l.id, ultima_msg: last[1], ultima_msg_em: iso(now - last[2] * 60e3),
      ultima_entrada_em: lastIn ? iso(now - lastIn[2] * 60e3) : null, nao_lidas: unread, bot_pausado: false, criado_em: iso(now - D)});
  });

  const wait = () => new Promise(r => setTimeout(r, 60));
  const clone = o => JSON.parse(JSON.stringify(o));
  const resumo = c => {
    const ps = pedidos.filter(p => p.cliente_id === c.id), ok = ps.filter(contaVenda);
    return {...c, total_pedidos: ok.length, total_gasto: ok.reduce((s, p) => s + p.total, 0), ultimo_pedido_em: ps.map(p => p.criado_em).sort().pop() || null,
      mensalidade: assinaturas.filter(a => a.cliente_id === c.id && a.status === 'ativa').reduce((s, a) => s + a.valor, 0)};
  };
  const comItens = p => ({...p, pedido_itens: itens.filter(i => i.pedido_id === p.id).map(i => ({...i, subtotal: i.quantidade * i.preco_unitario})), clientes: clientes.find(c => c.id === p.cliente_id)});
  const etapaOrdem = k => ETAPAS.find(e => e.k === k)?.ordem;
  const mudouEtapa = (l, nova) => {
    if (nova === l.etapa) return;
    ativ(l.id, 'etapa', `Etapa alterada: ${ETAPA[l.etapa]} → ${ETAPA[nova]}`, Date.now(), USER_EMAIL);
    l.etapa = nova; l.etapa_em = iso(Date.now()); l.etapa_max = Math.max(l.etapa_max || 0, etapaOrdem(nova) ?? 0);
  };
  let sess = null, num = 1001 + pedidos.length;
  return {
    async session() { return sess; },
    async login(email) { await wait(); USER_EMAIL = email; sess = {user: {email}}; return sess; },
    async logout() { sess = null; },

    async leads() { await wait(); return clone(leads).sort((a, b) => b.criado_em.localeCompare(a.criado_em)); },
    async lead(id) { return clone(leads.find(l => l.id === id)); },
    async salvarLead(l) { await wait();
      if (l.id) { const x = leads.find(y => y.id === l.id); const {etapa, ...resto} = l; Object.assign(x, resto); if (etapa) mudouEtapa(x, etapa); x.atualizado_em = iso(Date.now()); return clone(x); }
      const n = {valor: 0, etapa: 'novo', origem: 'manual', cliente_id: null, ...l, id: uid(), criado_em: l.criado_em || iso(Date.now()), atualizado_em: iso(Date.now()), etapa_em: iso(Date.now())};
      n.telefone = normFone(n.telefone) || null; n.etapa_max = etapaOrdem(n.etapa) ?? 0;
      leads.push(n); ativ(n.id, 'criado', 'Lead criado: ' + n.nome, Date.now(), USER_EMAIL); return clone(n); },
    async atualizarLead(id, patch) { await wait(); const x = leads.find(l => l.id === id); const {etapa, ...resto} = patch;
      if ('motivo_perda' in resto) x.motivo_perda = resto.motivo_perda; Object.assign(x, resto); if (etapa) mudouEtapa(x, etapa); x.atualizado_em = iso(Date.now()); return clone(x); },
    async excluirLead(id) { await wait(); leads.splice(leads.findIndex(l => l.id === id), 1); },
    async importarLeads(rows) { await wait(); rows.forEach(r => { const n = {...r, id: uid(), etapa_max: etapaOrdem(r.etapa) ?? 0, atualizado_em: iso(Date.now()), etapa_em: r.criado_em || iso(Date.now())};
      leads.push(n); ativ(n.id, 'criado', 'Lead importado: ' + n.nome, Date.parse(n.criado_em || iso(Date.now())), USER_EMAIL); }); return rows.length; },
    async atividades(leadId) { await wait(); return clone(atividades.filter(a => a.lead_id === leadId)).sort((a, b) => b.criado_em.localeCompare(a.criado_em)); },
    async atividadesTodas(desde) { return clone(atividades.filter(a => a.tipo === 'etapa' && a.criado_em >= desde)); },
    async registrarNota(leadId, texto, tipo = 'nota') { await wait(); const a = {id: uid(), lead_id: leadId, tipo, texto, autor: USER_EMAIL, criado_em: iso(Date.now())}; atividades.push(a); return clone(a); },

    async tarefas() { await wait(); return clone(tarefas.map(t => ({...t, leads: leads.find(l => l.id === t.lead_id) || null, clientes: clientes.find(c => c.id === t.cliente_id) || null})))
      .sort((a, b) => String(a.vence_em || '9').localeCompare(String(b.vence_em || '9'))); },
    async salvarTarefa(t) { await wait(); const n = {feita: false, feita_em: null, ...t, id: uid(), criado_em: iso(Date.now())}; tarefas.push(n);
      if (t.lead_id) ativ(t.lead_id, 'tarefa', 'Tarefa criada: ' + t.titulo, Date.now(), USER_EMAIL); return clone(n); },
    async atualizarTarefa(id, patch) { await wait(); Object.assign(tarefas.find(t => t.id === id), patch); },
    async excluirTarefa(id) { await wait(); tarefas.splice(tarefas.findIndex(t => t.id === id), 1); },

    async clientes() { await wait(); return clientes.map(resumo).sort((a, b) => a.nome.localeCompare(b.nome)); },
    async cliente(id) { await wait(); const c = resumo(clientes.find(x => x.id === id));
      return clone({...c, pedidos: pedidos.filter(p => p.cliente_id === id).map(comItens).sort((a, b) => b.criado_em.localeCompare(a.criado_em)),
        assinaturas: assinaturas.filter(a => a.cliente_id === id), leads: leads.filter(l => l.cliente_id === id)}); },
    async salvarCliente(c) { await wait(); c = {...c, telefone: normFone(c.telefone) || null};
      if (c.telefone && clientes.some(x => x.telefone === c.telefone && x.id !== c.id)) throw new Error('Já existe um cadastro com esse telefone');
      if (c.id) { Object.assign(clientes.find(x => x.id === c.id), c); return clone(c); }
      const n = {tags: [], origem: 'manual', ...c, id: uid(), criado_em: iso(Date.now())}; clientes.push(n); return clone(n); },
    async excluirCliente(id) { await wait(); if (pedidos.some(p => p.cliente_id === id)) throw new Error('Cliente com pedidos não pode ser excluído'); clientes.splice(clientes.findIndex(c => c.id === id), 1); },

    async pedidos() { await wait(); return clone(pedidos.map(comItens)).sort((a, b) => b.criado_em.localeCompare(a.criado_em)); },
    async atualizarPedido(id, patch) { await wait(); const p = pedidos.find(x => x.id === id);
      if (patch.status && (patch.status === 'cancelado') !== (p.status === 'cancelado')) itens.filter(i => i.pedido_id === id).forEach(i => { const pr = produtos.find(x => x.id === i.produto_id); if (pr && pr.estoque != null) pr.estoque = Math.max(0, pr.estoque + (patch.status === 'cancelado' ? 1 : -1) * i.quantidade); });
      Object.assign(p, patch); recalc(p); return clone(p); },
    async criarPedido(p, its) { await wait(); const n = {parcelas: 1, pago: false, desconto: 0, frete: 0, ...p, id: uid(), numero: num++, criado_em: iso(Date.now())};
      pedidos.push(n); its.forEach(i => { itens.push({...i, id: uid(), pedido_id: n.id}); const pr = produtos.find(x => x.id === i.produto_id); if (pr && pr.estoque != null) pr.estoque = Math.max(0, pr.estoque - i.quantidade); });
      recalc(n); return clone(n); },

    async produtos() { await wait(); return clone(produtos.filter(p => !p.excluido)); },
    async atualizarProduto(id, patch) { await wait(); Object.assign(produtos.find(p => p.id === id), patch); },
    async salvarProduto(p) { await wait(); if (p.id) Object.assign(produtos.find(x => x.id === p.id), p); else produtos.push({excluido: false, estoque: null, ...p, id: uid(), criado_em: iso(Date.now())}); },
    async excluirProduto(id) { await wait(); Object.assign(produtos.find(p => p.id === id), {excluido: true, ativo: false}); },
    async custos() { await wait(); return clone(custos); },
    async salvarCusto(produto_id, patch) { await wait(); const c = custos.find(x => x.produto_id === produto_id); c ? Object.assign(c, patch) : custos.push({produto_id, custo: null, frete: 0, taxa_pct: 0, fornecedor: null, ...patch}); },

    async assinaturas() { await wait(); return clone(assinaturas.map(a => ({...a, clientes: clientes.find(c => c.id === a.cliente_id)}))).sort((a, b) => a.proximo_vencimento.localeCompare(b.proximo_vencimento)); },
    async salvarAssinatura(a) { await wait(); if (a.id) { Object.assign(assinaturas.find(x => x.id === a.id), a); return clone(a); }
      const n = {status: 'ativa', ...a, id: uid(), criado_em: iso(Date.now()), cancelada_em: null}; assinaturas.push(n); return clone(n); },
    async atualizarAssinatura(id, patch) { await wait(); Object.assign(assinaturas.find(a => a.id === id), patch); },
    async pagamentos(assId) { await wait(); return clone(pagamentosA.filter(p => p.assinatura_id === assId)).sort((a, b) => b.pago_em.localeCompare(a.pago_em)); },
    async pagamentosTodos(desde) { return clone(pagamentosA.filter(p => p.pago_em >= desde)); },
    async registrarPagamento(a) { await wait(); pagamentosA.push({id: uid(), assinatura_id: a.id, referencia: a.proximo_vencimento, valor: a.valor, pago_em: iso(Date.now())});
      assinaturas.find(x => x.id === a.id).proximo_vencimento = somaMes(a.proximo_vencimento); },

    async waConversas() { await wait(); return clone(waConvs.map(c => ({...c, clientes: clientes.find(x => x.id === c.cliente_id) || null, leads: leads.find(x => x.id === c.lead_id) || null})))
      .sort((a, b) => b.ultima_msg_em.localeCompare(a.ultima_msg_em)); },
    async waMensagens(id) { await wait(); return clone(waMsgs.filter(m => m.conversa_id === id)); },
    async waLer(id) { waConvs.find(c => c.id === id).nao_lidas = 0; },
    async waBot(id, pausado) { waConvs.find(c => c.id === id).bot_pausado = pausado; },
    async waStatus() { return {token: false, phone_id: false, verify_token: false, app_secret: false, encaminhar: false}; },
    async waEnviar({telefone, texto, template, nome}) { await wait();
      const tel = normFone(telefone), agora = iso(Date.now()), txt = template ? `[modelo] ${template}` : texto;
      let c = waConvs.find(x => x.telefone === tel);
      if (!c) { c = {id: uid(), telefone: tel, nome: nome || null, cliente_id: clientes.find(x => x.telefone === tel)?.id || null, lead_id: leads.find(x => x.telefone === tel)?.id || null,
        nao_lidas: 0, bot_pausado: false, ultima_entrada_em: null, criado_em: agora}; waConvs.push(c); }
      waMsgs.push({id: uid(), conversa_id: c.id, direcao: 'saida', tipo: template ? 'template' : 'text', texto: txt, status: 'enviada', criado_em: agora});
      Object.assign(c, {ultima_msg: txt, ultima_msg_em: agora, bot_pausado: true});
      return {ok: true, conversa_id: c.id}; },
    waRealtime() {},
    async chave() { return 'demo_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2'; },
    async novaChave() { return 'demo_' + Array.from({length: 44}, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join(''); },
    realtime() {}
  };
}
