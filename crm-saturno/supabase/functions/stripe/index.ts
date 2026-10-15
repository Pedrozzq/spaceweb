// =====================================================================
//  SATURNO NFC · CRM — assinaturas da STRIPE (Gestão Saturno)
//  Supabase Edge Function "stripe": webhook da Stripe.
//   1. invoice.paid (1º pagamento e cada renovação) do produto da Gestão Saturno:
//      cadastra/acha o cliente, cria ou atualiza a assinatura na aba Assinaturas
//      (próximo vencimento = fim do período pago) e registra o pagamento.
//   2. customer.subscription.updated: pausou a cobrança na Stripe → "Pausada"; retomou → "Ativa".
//   3. customer.subscription.deleted: assinatura cancelada na Stripe → "Cancelada".
//  Pagamentos de outros produtos são ignorados. O mesmo evento repetido não duplica nada.
//
//  Secrets (Supabase > Edge Functions > Secrets):
//    STRIPE_WEBHOOK_SECRET   whsec_...  (Stripe > Workbench/Desenvolvedores > Webhooks > o endpoint > Chave secreta de assinatura)
//    STRIPE_PRODUTO_ID       prod_VJI9xh6P8Ao8Rm
//    STRIPE_PRODUTO_NOME     Gestão Saturno   (opcional; nome do produto/assinatura na CRM)
//  Webhook (Stripe > Webhooks > Adicionar destino):
//    https://SEU-PROJETO.supabase.co/functions/v1/stripe
//    eventos: invoice.paid, customer.subscription.updated, customer.subscription.deleted
//  "Verify JWT" desligado (a Stripe não manda login; a assinatura do webhook é conferida aqui dentro).
//  Rode antes o supabase/stripe.sql.
// =====================================================================
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const env = (k: string) => Deno.env.get(k) ?? "";
const HOOK_SECRET = env("STRIPE_WEBHOOK_SECRET");
const PRODUTO_ID = env("STRIPE_PRODUTO_ID");
const PRODUTO_NOME = env("STRIPE_PRODUTO_NOME") || "Gestão Saturno";

const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "método não suportado" }, 405);
  try {
    if (!HOOK_SECRET || !PRODUTO_ID) throw new Error("Stripe não configurada: defina STRIPE_WEBHOOK_SECRET e STRIPE_PRODUTO_ID");
    const raw = await req.text();
    if (!(await assinaturaValida(req.headers.get("stripe-signature") ?? "", raw))) return json({ error: "assinatura do webhook inválida" }, 400);
    const ev = JSON.parse(raw);
    const o = ev.data?.object ?? {};
    switch (ev.type) {
      case "invoice.paid": return json(await faturaPaga(o));
      case "customer.subscription.updated": return json(await assinaturaAlterada(o));
      case "customer.subscription.deleted": return json(await assinaturaCancelada(o));
      default: return json({ ignorado: ev.type });
    }
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);   // 500 = a Stripe tenta de novo depois
  }
});

// ------------------------------------------------------------------ utilidades
const chk = <T>({ data, error }: { data: T; error: Any }) => { if (error) throw new Error(error.message); return data; };
const fone = (p: string) => {
  const d = String(p ?? "").replace(/\D/g, "");
  return d.length === 10 || d.length === 11 ? "55" + d : d;
};
const id = (v: Any): string | null => (typeof v === "string" ? v : v?.id) ?? null;
// data (AAAA-MM-DD) no fuso de Brasília a partir de um timestamp da Stripe (segundos)
const dia = (s: number) => new Date(s * 1000).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

// Stripe-Signature: t=...,v1=... → HMAC-SHA256(secret, "t.corpo"), tolerância de 5 min
async function assinaturaValida(cab: string, raw: string) {
  const partes = cab.split(",").map((p) => p.split("=") as [string, string]);
  const t = partes.find(([k]) => k === "t")?.[1];
  const v1 = partes.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!t || !v1.length || Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(HOOK_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(`${t}.${raw}`)));
  const hex = [...sig].map((b) => b.toString(16).padStart(2, "0")).join("");
  return v1.some((v) => {
    if (v.length !== hex.length) return false;
    let x = 0; for (let i = 0; i < v.length; i++) x |= v.charCodeAt(i) ^ hex.charCodeAt(i);
    return x === 0;
  });
}

// produto e assinatura de uma linha da fatura (formato antigo e novo da API da Stripe)
const produtoDaLinha = (l: Any) => id(l.price?.product) ?? id(l.plan?.product) ?? id(l.pricing?.price_details?.product);
const assinaturaDaFatura = (inv: Any, l: Any) =>
  id(inv.subscription) ?? id(inv.parent?.subscription_details?.subscription) ?? id(l.subscription) ?? id(l.parent?.subscription_item_details?.subscription);

// ------------------------------------------------------------------ eventos
async function faturaPaga(inv: Any) {
  const linha = (inv.lines?.data ?? []).find((l: Any) => produtoDaLinha(l) === PRODUTO_ID);
  if (!linha) return { ignorado: "fatura de outro produto" };
  const subId = assinaturaDaFatura(inv, linha);
  if (!subId) return { ignorado: "fatura sem assinatura" };

  const clienteId = await garantirCliente(inv);
  const produtoId = await garantirProduto(linha.amount / 100);
  const valor = Math.round(linha.amount) / 100;            // valor do plano (por período)
  const venc = dia(linha.period?.end ?? inv.period_end);    // até quando está pago
  const ref = dia(linha.period?.start ?? inv.period_start);

  const atual = chk(await db.from("assinaturas").select("id").eq("stripe_assinatura_id", subId).maybeSingle());
  const dados = { cliente_id: clienteId, produto_id: produtoId, valor, proximo_vencimento: venc,
    dia_vencimento: Math.min(28, Number(venc.slice(8)) || 10), status: "ativa", cancelada_em: null };
  const assinaturaId = atual
    ? (chk(await db.from("assinaturas").update(dados).eq("id", atual.id)), atual.id)
    : chk(await db.from("assinaturas").insert({ ...dados, descricao: PRODUTO_NOME, forma_pagamento: "cartao_credito",
        stripe_assinatura_id: subId, observacoes: `Stripe ${subId}` }).select("id").single()).id;

  if (inv.amount_paid > 0) {
    chk(await db.from("assinatura_pagamentos").upsert({
      assinatura_id: assinaturaId, referencia: ref, valor: inv.amount_paid / 100, stripe_fatura_id: inv.id,
      pago_em: new Date((inv.status_transitions?.paid_at ?? inv.created) * 1000).toISOString(),
    }, { onConflict: "stripe_fatura_id", ignoreDuplicates: true }));
  }
  return { ok: true, cliente_id: clienteId, assinatura_id: assinaturaId, nova: !atual };
}

async function assinaturaAlterada(sub: Any) {
  const a = chk(await db.from("assinaturas").select("id,status").eq("stripe_assinatura_id", sub.id).maybeSingle());
  if (!a) return { ignorado: "assinatura não está na CRM" };
  const status = sub.status === "canceled" ? "cancelada" : sub.pause_collection ? "pausada" : a.status === "pausada" ? "ativa" : a.status;
  if (status !== a.status) {
    chk(await db.from("assinaturas").update({ status, cancelada_em: status === "cancelada" ? new Date().toISOString() : null }).eq("id", a.id));
  }
  return { ok: true, status };
}

async function assinaturaCancelada(sub: Any) {
  chk(await db.from("assinaturas").update({ status: "cancelada", cancelada_em: new Date((sub.canceled_at ?? Date.now() / 1000) * 1000).toISOString() })
    .eq("stripe_assinatura_id", sub.id).neq("status", "cancelada"));
  return { ok: true };
}

// ------------------------------------------------------------------ cliente e produto
// Acha o cliente pelo id da Stripe, telefone ou e-mail; se não existir, cadastra (origem "site", etiqueta "stripe")
async function garantirCliente(inv: Any): Promise<string> {
  const cus = id(inv.customer);
  const email = String(inv.customer_email ?? "").trim().toLowerCase() || null;
  const tel = inv.customer_phone ? fone(inv.customer_phone) : null;

  let c: Any = cus ? chk(await db.from("clientes").select("id,email,telefone").eq("stripe_cliente_id", cus).maybeSingle()) : null;
  if (!c && tel) {
    const cid = chk(await db.rpc("wa_cliente_por_telefone", { p_tel: tel }));
    if (cid) c = chk(await db.from("clientes").select("id,email,telefone").eq("id", cid).single());
  }
  if (!c && email) c = chk(await db.from("clientes").select("id,email,telefone").ilike("email", email).limit(1).maybeSingle());

  if (c) {
    const patch: Any = {};
    if (cus) patch.stripe_cliente_id = cus;
    if (!c.email && email) patch.email = email;
    if (!c.telefone && tel) patch.telefone = tel;
    if (Object.keys(patch).length) chk(await db.from("clientes").update(patch).eq("id", c.id));
    return c.id;
  }
  const end = inv.customer_address ?? {};
  return chk(await db.from("clientes").insert({
    nome: String(inv.customer_name ?? "").trim() || (email ? email.split("@")[0] : `Cliente Stripe ${cus ?? ""}`.trim()),
    email, telefone: tel, stripe_cliente_id: cus, origem: "site", tags: ["stripe"],
    endereco: [end.line1, end.line2].filter(Boolean).join(", ") || null,
    cidade: end.city || null, uf: end.state || null, cep: end.postal_code || null,
  }).select("id").single()).id;
}

// Produto "Gestão Saturno" (cobrança mensal) no catálogo da CRM; cria se ainda não existir
async function garantirProduto(preco: number): Promise<string> {
  const p = chk(await db.from("produtos").select("id").eq("nome", PRODUTO_NOME).eq("excluido", false).limit(1).maybeSingle());
  if (p) return p.id;
  return chk(await db.from("produtos").insert({ nome: PRODUTO_NOME, categoria: "Planos", preco, recorrente: true,
    descricao: "Assinatura paga pela Stripe" }).select("id").single()).id;
}
