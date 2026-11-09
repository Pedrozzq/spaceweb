// =====================================================================
//  SATURNO NFC · pagamento pelo site com o MERCADO PAGO (Checkout Pro)
//  Supabase Edge Function "mercadopago":
//   1. POST do site { nome, empresa, email, telefone, endereco, site, cartoes, tags, crm }: calcula o total AQUI
//      (o preço enviado pelo navegador nunca é usado), registra o lead e devolve
//      o link do checkout (init_point).
//   2. POST do obrigado.html { consulta: { pedido, pagamento } }: confere o pagamento na API
//      do Mercado Pago e só devolve os dados se ele pertencer a esse pedido.
//   3. POST do site { acompanha: { pedido } }: diz se o pedido já tem pagamento, porque o
//      Mercado Pago nem sempre devolve a pessoa ao site (Pix). Devolve só número e situação.
//   4. POST ?webhook=1 do Mercado Pago: confere a assinatura, busca o pagamento
//      na API e, se aprovado, leva o lead para "ganho". Repetições não duplicam nada.
//
//  Secrets (Supabase > Edge Functions > Secrets):
//    MP_ACCESS_TOKEN     Access Token da aplicação (Suas integrações > Credenciais)
//    MP_WEBHOOK_SECRET   assinatura secreta (Suas integrações > Webhooks)
//  Webhook (Suas integrações > Webhooks > Configurar notificações), evento Pagamentos:
//    https://lrthxbchqafcjbvjwcne.supabase.co/functions/v1/mercadopago?webhook=1
//  "Verify JWT" desligado. Rode antes o supabase/mercadopago.sql.
// =====================================================================
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const env = (k: string) => Deno.env.get(k) ?? "";
const API = "https://api.mercadopago.com";
const SITE = "https://www.saturnonfc.com.br";
const ORIGENS = [SITE, "https://saturnonfc.com.br"];
const PRECOS = { site: 597, cartao: 35, tag: 40, crm: 1500 };
const MAX_QTD = 200;
const MAX_POR_HORA = 60;

const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const chk = <T>({ data, error }: { data: T; error: Any }) => { if (error) throw new Error(error.message); return data; };
const origemOk = (o: string | null) => !!o && (ORIGENS.includes(o) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o));
const cors = (o: string | null) => ({
  "Access-Control-Allow-Origin": origemOk(o) ? o as string : ORIGENS[0],
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
});
const json = (b: unknown, status = 200, h: Record<string, string> = {}) =>
  new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json", ...h } });

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (url.searchParams.has("webhook")) return webhook(req, url);

  const origem = req.headers.get("origin");
  const h = cors(origem);
  if (req.method === "OPTIONS") return new Response("ok", { headers: h });
  if (req.method !== "POST") return json({ erro: "método não suportado" }, 405, h);
  if (!origemOk(origem)) return json({ erro: "origem não permitida" }, 403, h);
  try {
    const corpo = await req.json();
    if (corpo?.acompanha) return json(await acompanharPedido(corpo.acompanha), 200, h);
    return json(corpo?.consulta ? await consultarPedido(corpo.consulta) : await criarCheckout(corpo), 200, h);
  } catch (e) {
    const erro = e as Error & { status?: number };
    console.error(erro.message);
    return json({ erro: erro.status ? erro.message : "não foi possível abrir o pagamento" }, erro.status ?? 500, h);
  }
});

// ------------------------------------------------------------------ checkout
const falha = (msg: string, status: number) => Object.assign(new Error(msg), { status });
const texto = (v: unknown, max: number) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max);
function quantidade(v: unknown) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > MAX_QTD) throw falha("quantidade inválida", 400);
  return n;
}

// Único lugar que define o total cobrado.
export function montarPedido(b: Any) {
  // site vem marcado por padrão; só sai do pedido quando o cliente desliga (site: false)
  const cartoes = quantidade(b?.cartoes), tags = quantidade(b?.tags), crm = b?.crm === true, site = b?.site !== false;
  const itens: { id: string; title: string; quantity: number; unit_price: number; currency_id: string }[] = [];
  const partes: string[] = [];
  if (site) { itens.push({ id: "site", title: "Site personalizado", quantity: 1, unit_price: PRECOS.site, currency_id: "BRL" }); partes.push("Site"); }
  if (cartoes) { itens.push({ id: "cartao-nfc", title: "Cartão NFC", quantity: cartoes, unit_price: PRECOS.cartao, currency_id: "BRL" }); partes.push(`${cartoes} ${cartoes === 1 ? "cartão NFC" : "cartões NFC"}`); }
  if (tags) { itens.push({ id: "tag-google", title: "Tag Avaliação Google", quantity: tags, unit_price: PRECOS.tag, currency_id: "BRL" }); partes.push(`${tags} ${tags === 1 ? "tag" : "tags"} Avaliação Google`); }
  if (crm) { itens.push({ id: "crm", title: "CRM Saturno", quantity: 1, unit_price: PRECOS.crm, currency_id: "BRL" }); partes.push("CRM"); }
  if (!itens.length) throw falha("escolha ao menos um item", 400);
  const valor = itens.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  return { site, cartoes, tags, crm, itens, valor, pedido: partes.join(" + ") };
}

async function criarCheckout(b: Any) {
  const token = env("MP_ACCESS_TOKEN");
  if (!token) throw new Error("MP_ACCESS_TOKEN não configurado");
  const nome = texto(b?.nome, 60), empresa = texto(b?.empresa, 80);
  if (nome.length < 2 || empresa.length < 2) throw falha("informe nome e empresa", 400);
  const email = texto(b?.email, 120).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw falha("informe um e-mail válido", 400);
  const telefone = String(b?.telefone ?? "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (!/^[1-9]{2}\d{8,9}$/.test(telefone)) throw falha("informe o WhatsApp com DDD", 400);
  const ent = lerEndereco(b?.endereco);
  const p = montarPedido(b);

  const umaHora = new Date(Date.now() - 3600_000).toISOString();
  const { count, error } = await db.from("mp_pedidos").select("id", { count: "exact", head: true }).gte("criado_em", umaHora);
  if (error) throw new Error(error.message);
  if ((count ?? 0) >= MAX_POR_HORA) throw falha("muitos pedidos agora, tente de novo em instantes", 429);

  // A CRM não pode impedir o pagamento: se falhar, o pedido segue sem lead e o erro fica no log.
  let leadId: string | null = null;
  try {
    chk(await db.rpc("site_registrar_pedido", { p_dados: { nome, empresa, pedido: p.pedido, valor: p.valor } }));
    const lead = chk(await db.from("leads").select("id,email,telefone,cidade,cliente_id").eq("origem", "site").ilike("nome", nome).ilike("empresa", empresa)
      .order("criado_em", { ascending: false }).limit(1).maybeSingle()) as Any;
    leadId = lead?.id ?? null;
    if (lead) {
      await guardarContato(lead, email, telefone, ent);
      await nota(lead.id, `Dados informados para o pagamento pelo site: ${email}, ${telefone}. Entrega: ${ent.linha}, ${ent.cidade}/${ent.uf}, CEP ${ent.cep}.`);
    }
  } catch (e) { console.error("CRM:", (e as Error).message); }

  const reg = chk(await db.from("mp_pedidos").insert({ nome, empresa, pedido: p.pedido, cartoes: p.cartoes, tags: p.tags, crm: p.crm, valor: p.valor, lead_id: leadId, email, telefone, cep: ent.cep, endereco: ent.linha, cidade: ent.cidade, uf: ent.uf })
    .select("id").single()) as Any;

  const r = await fetch(`${API}/checkout/preferences`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      items: p.itens,
      payer: { name: nome, email, phone: { area_code: telefone.slice(0, 2), number: telefone.slice(2) },
        address: { zip_code: ent.cep, street_name: ent.rua, street_number: ent.numero } },
      external_reference: reg.id,
      statement_descriptor: "SATURNONFC",
      payment_methods: { installments: 4 },   // até 4x sem juros (o "sem juros" é configurado na conta do Mercado Pago)
      back_urls: { success: `${SITE}/obrigado.html`, pending: `${SITE}/obrigado.html`, failure: `${SITE}/?pagamento=falhou` },
      auto_return: "approved",
    }),
  });
  if (!r.ok) throw new Error(`preferência recusada: HTTP ${r.status}`);
  const pref = await r.json();
  if (!pref.init_point) throw new Error("preferência sem init_point");
  chk(await db.from("mp_pedidos").update({ preference_id: pref.id ?? null }).eq("id", reg.id));
  return { url: pref.init_point, pedido: reg.id };
}

// Quem chama a função não tem login: só preenche o que está vazio, nunca troca contato já salvo.
function lerEndereco(e: Any) {
  const cep = String(e?.cep ?? "").replace(/\D/g, "");
  const rua = texto(e?.rua, 120), numero = texto(e?.numero, 12), complemento = texto(e?.complemento, 60);
  const bairro = texto(e?.bairro, 60), cidade = texto(e?.cidade, 60), uf = texto(e?.uf, 2).toUpperCase();
  if (cep.length !== 8 || rua.length < 3 || !numero || bairro.length < 2 || cidade.length < 2 || !/^[A-Z]{2}$/.test(uf)) throw falha("informe o endereço de entrega", 400);
  const linha = `${rua}, ${numero}${complemento ? ` - ${complemento}` : ""} - ${bairro}`;
  return { cep, rua, numero, complemento, bairro, cidade, uf, linha };
}

async function guardarContato(lead: Any, email: string, telefone: string, ent: ReturnType<typeof lerEndereco>) {
  const patch: Any = {};
  if (!lead.cidade) patch.cidade = ent.cidade;
  if (!lead.email) patch.email = email;
  if (!lead.telefone) patch.telefone = telefone;
  if (Object.keys(patch).length) chk(await db.from("leads").update(patch).eq("id", lead.id));
  if (!lead.cliente_id) return;
  const c = chk(await db.from("clientes").select("email,telefone,endereco").eq("id", lead.cliente_id).maybeSingle()) as Any;
  if (c && !c.email) chk(await db.from("clientes").update({ email }).eq("id", lead.cliente_id));
  if (c && !c.endereco) chk(await db.from("clientes").update({ endereco: ent.linha, cidade: ent.cidade, uf: ent.uf, cep: ent.cep }).eq("id", lead.cliente_id));
  // telefone é único em clientes: se já for de outro cadastro, o contato fica no lead e no pedido
  if (c && !c.telefone) await db.from("clientes").update({ telefone }).eq("id", lead.cliente_id);
}

// ------------------------------------------------------------------ página de obrigado
async function consultarPedido(c: Any) {
  const pedido = String(c?.pedido ?? ""), pagamento = String(c?.pagamento ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(pedido) || !/^\d+$/.test(pagamento)) throw falha("consulta inválida", 400);
  const r = await fetch(`${API}/v1/payments/${pagamento}`, { headers: { Authorization: `Bearer ${env("MP_ACCESS_TOKEN")}` } });
  if (r.status === 404) throw falha("pedido não encontrado", 404);
  if (!r.ok) throw new Error(`consulta do pagamento: HTTP ${r.status}`);
  const pg = await r.json();
  // o número do pagamento precisa ser deste pedido: sem isso, nenhum dado sai daqui
  if (String(pg.external_reference ?? "").toLowerCase() !== pedido.toLowerCase()) throw falha("pedido não encontrado", 404);
  const ped = chk(await db.from("mp_pedidos").select("*").eq("id", pedido).maybeSingle()) as Any;
  if (!ped) throw falha("pedido não encontrado", 404);
  // se o webhook atrasar, a CRM já fica certa aqui. O resultado do aviso não muda o que a pessoa vê.
  try { await aplicarPagamento(pg); } catch (e) { console.error((e as Error).message); }
  const itens = montarPedido({ cartoes: ped.cartoes, tags: ped.tags, crm: ped.crm }).itens
    .map((i) => ({ nome: i.title, quantidade: i.quantity, preco: i.unit_price }));
  return {
    status: pg.status, pagamento_id: String(pg.id), tipo: pg.payment_type_id, parcelas: pg.installments,
    valor: Number(ped.valor), total_pago: Number(pg.transaction_details?.total_paid_amount ?? pg.transaction_amount ?? 0),
    pedido: ped.pedido, itens, nome: ped.nome, empresa: ped.empresa, email: ped.email, telefone: ped.telefone,
    cep: ped.cep, endereco: ped.endereco, cidade: ped.cidade, uf: ped.uf,
  };
}

// O id do pedido é aleatório e só o navegador de quem o criou o recebe.
async function acompanharPedido(c: Any) {
  const pedido = String(c?.pedido ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(pedido)) throw falha("consulta inválida", 400);
  const ped = chk(await db.from("mp_pedidos").select("id").eq("id", pedido).maybeSingle()) as Any;
  if (!ped) throw falha("pedido não encontrado", 404);
  const r = await fetch(`${API}/v1/payments/search?external_reference=${pedido}&sort=date_created&criteria=desc&limit=10`, { headers: { Authorization: `Bearer ${env("MP_ACCESS_TOKEN")}` } });
  if (!r.ok) throw new Error(`busca do pagamento: HTTP ${r.status}`);
  const lista = ((await r.json()).results ?? []) as Any[];
  const pg = lista.find((p) => p.status === "approved") ?? lista[0];
  return pg ? { pagamento: String(pg.id), status: pg.status } : { pagamento: null, status: null };
}

// ------------------------------------------------------------------ webhook
// x-signature: ts=...,v1=... → HMAC-SHA256(secreto, "id:<data.id>;request-id:<x-request-id>;ts:<ts>;")
export async function assinaturaValida(cab: string, requestId: string, dataId: string, segredo: string) {
  const partes = Object.fromEntries(cab.split(",").map((p) => { const [k, ...v] = p.split("="); return [k.trim(), v.join("=").trim()]; }));
  const { ts, v1 } = partes as Record<string, string>;
  if (!ts || !v1 || !segredo) return false;
  let manifesto = "";
  if (dataId) manifesto += `id:${dataId.toLowerCase()};`;
  if (requestId) manifesto += `request-id:${requestId};`;
  manifesto += `ts:${ts};`;
  const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(manifesto)));
  const hex = [...sig].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (v1.length !== hex.length) return false;
  let x = 0; for (let i = 0; i < hex.length; i++) x |= hex.charCodeAt(i) ^ v1.charCodeAt(i);
  return x === 0;
}

async function webhook(req: Request, url: URL) {
  if (req.method !== "POST") return json({ erro: "método não suportado" }, 405);
  try {
    const dataId = url.searchParams.get("data.id") ?? "";
    const ok = await assinaturaValida(req.headers.get("x-signature") ?? "", req.headers.get("x-request-id") ?? "", dataId, env("MP_WEBHOOK_SECRET"));
    if (!ok) return json({ erro: "assinatura inválida" }, 401);
    const tipo = url.searchParams.get("type") ?? (await req.clone().json().catch(() => ({})))?.type;
    if (tipo !== "payment" || !/^\d+$/.test(dataId)) return json({ ignorado: tipo ?? "sem tipo" });

    const r = await fetch(`${API}/v1/payments/${dataId}`, { headers: { Authorization: `Bearer ${env("MP_ACCESS_TOKEN")}` } });
    if (r.status === 404) return json({ ignorado: "pagamento não encontrado" });   // simulação do painel
    if (!r.ok) throw new Error(`consulta do pagamento: HTTP ${r.status}`);
    return json(await aplicarPagamento(await r.json()));
  } catch (e) {
    console.error((e as Error).message);
    return json({ erro: "falha ao processar" }, 500);   // 500 = o Mercado Pago tenta de novo
  }
}

async function aplicarPagamento(pg: Any) {
  const ref = String(pg.external_reference ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(ref)) return { ignorado: "pagamento de fora do site" };
  const ped = chk(await db.from("mp_pedidos").select("*").eq("id", ref).maybeSingle()) as Any;
  if (!ped) return { ignorado: "pedido não encontrado" };

  const pagador = { pagador_email: pg.payer?.email ?? ped.pagador_email, pagador_nome: [pg.payer?.first_name, pg.payer?.last_name].filter(Boolean).join(" ") || ped.pagador_nome };
  const base = { pagamento_id: String(pg.id), status: pg.status, atualizado_em: new Date().toISOString(), ...pagador };
  const anterior = ped.status;

  // Um pedido aprovado só deixa de ser aprovado por devolução ou contestação.
  const reverteu = ["refunded", "charged_back", "cancelled"].includes(pg.status);
  if (anterior === "approved" && !reverteu) return { ok: true, repetido: true };

  if (pg.status === "approved") {
    // valor pago sem os juros do parcelamento, que ficam em transaction_details
    if (pg.currency_id !== "BRL" || Math.abs(Number(pg.transaction_amount) - Number(ped.valor)) > 0.01) {
      chk(await db.from("mp_pedidos").update({ ...base, status: "valor_divergente" }).eq("id", ped.id));
      await nota(ped.lead_id, `ATENÇÃO: pagamento ${pg.id} com valor diferente do pedido (${ped.pedido}). Confira no Mercado Pago.`);
      return { ok: true, divergente: true };
    }
    const mudou = chk(await db.from("mp_pedidos").update(base).eq("id", ped.id).neq("status", "approved").select("id")) as Any[];
    if (!mudou.length) return { ok: true, repetido: true };
    if (ped.lead_id) {
      chk(await db.from("leads").update({ etapa: "ganho", valor: ped.valor }).eq("id", ped.lead_id));
    }
    await nota(ped.lead_id, `Pagamento aprovado no Mercado Pago (${pg.id}): ${ped.pedido}. Falta combinar a entrega.`);
    return { ok: true, aprovado: true };
  }

  chk(await db.from("mp_pedidos").update(base).eq("id", ped.id));
  if (pg.status !== anterior && (reverteu || pg.status === "rejected")) await nota(ped.lead_id, `Mercado Pago: pagamento ${pg.id} com status ${pg.status}. Pedido: ${ped.pedido}.`);
  return { ok: true, status: pg.status };
}

async function nota(leadId: string | null, texto: string) {
  if (leadId) chk(await db.from("lead_atividades").insert({ lead_id: leadId, tipo: "nota", texto }));
}
