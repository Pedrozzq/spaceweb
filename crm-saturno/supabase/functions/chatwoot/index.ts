// =====================================================================
//  SATURNO NFC · CRM — WhatsApp pelo CHATWOOT (caixa "Canal da API")
//  Supabase Edge Function "chatwoot". Faz três coisas:
//   1. Webhook do Chatwoot: toda mensagem (do contato, da equipe ou do agente n8n) entra
//      na aba WhatsApp da CRM. Contato novo vira lead sozinho no funil.
//   2. Envio: a equipe responde pela CRM e a mensagem sai pelo Chatwoot.
//   3. Agente IA liga/desliga: põe ou tira a etiqueta "humano" na conversa do Chatwoot
//      (a mesma que o fluxo do n8n usa para parar de responder).
//  O token do Chatwoot fica só aqui (Secrets do Supabase), nunca no navegador.
//
//  Secrets (Supabase > Edge Functions > Secrets):
//    CHATWOOT_URL             https://whatsapp-chatwoot.fycoqq.easypanel.host
//    CHATWOOT_ACCOUNT_ID      2
//    CHATWOOT_INBOX_ID        id da caixa "Whatsapp" (Configurações > Caixas de entrada > engrenagem: número na URL)
//    CHATWOOT_TOKEN           Perfil (canto inferior esquerdo) > Configurações do perfil > Token de acesso
//    CHATWOOT_WEBHOOK_TOKEN   uma senha qualquer, a mesma que vai no fim da URL do webhook (?token=...)
//    CHATWOOT_ETIQUETA_HUMANO humano   (opcional; padrão "humano")
//  Webhook (Chatwoot > Configurações > Integrações > Webhooks):
//    https://SEU-PROJETO.supabase.co/functions/v1/chatwoot?token=CHATWOOT_WEBHOOK_TOKEN
//    eventos: Mensagem criada, Conversa atualizada
//  "Verify JWT" desligado (o webhook do Chatwoot não manda login; a CRM é conferida aqui dentro).
// =====================================================================
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const env = (k: string) => Deno.env.get(k) ?? "";
const CW_URL = env("CHATWOOT_URL").replace(/\/+$/, "");
const CW_ACC = env("CHATWOOT_ACCOUNT_ID");
const CW_INBOX = env("CHATWOOT_INBOX_ID");
const CW_TOKEN = env("CHATWOOT_TOKEN");
const HOOK_TOKEN = env("CHATWOOT_WEBHOOK_TOKEN");
const ETIQUETA = env("CHATWOOT_ETIQUETA_HUMANO") || "humano";

const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "método não suportado" }, 405);
  const url = new URL(req.url);
  try {
    const raw = await req.text();
    if (url.searchParams.has("token")) return await webhook(url.searchParams.get("token") ?? "", raw);
    return await crm(req, raw);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});

// ------------------------------------------------------------------ utilidades
const fone = (p: string) => {
  const d = String(p ?? "").split("@")[0].replace(/\D/g, "");
  return d.length === 10 || d.length === 11 ? "55" + d : d;
};
const iguais = (a: string, b: string) => {
  if (!a || a.length !== b.length) return false;
  let x = 0; for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
};
const quando = (v: Any) => typeof v === "number" ? new Date(v * 1000).toISOString() : (v ? new Date(v).toISOString() : new Date().toISOString());
async function cw(path: string, init: RequestInit = {}) {
  if (!CW_URL || !CW_ACC || !CW_TOKEN) throw new Error("Chatwoot não configurado: defina CHATWOOT_URL, CHATWOOT_ACCOUNT_ID e CHATWOOT_TOKEN");
  const r = await fetch(`${CW_URL}/api/v1/accounts/${CW_ACC}${path}`, {
    ...init, headers: { "Content-Type": "application/json", api_access_token: CW_TOKEN, ...(init.headers ?? {}) },
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.message || d?.error || `Chatwoot respondeu ${r.status}`);
  return d;
}
function textoDe(m: Any): string {
  const t = String(m.content ?? "").trim();
  const anexos = (m.attachments ?? []).map((a: Any) =>
    ({ image: "[imagem]", audio: "[áudio]", video: "[vídeo]", file: "[arquivo]", location: "[localização]" } as Record<string, string>)[a.file_type] ?? "[anexo]");
  return [t, ...anexos].filter(Boolean).join(" ") || "[mensagem]";
}

// conversa da CRM para este telefone (cria, liga ao cliente/lead e guarda os ids do Chatwoot)
async function conversaCrm(telefone: string, nome: string | null, cwConv: number | null, cwContato: number | null, pausado: boolean | null) {
  const { data: c } = await db.from("wa_conversas").select("*").eq("telefone", telefone).maybeSingle();
  if (c) {
    const patch: Record<string, unknown> = {};
    if (nome && nome !== c.nome) patch.nome = nome;
    if (cwConv && cwConv !== c.chatwoot_conversa_id) patch.chatwoot_conversa_id = cwConv;
    if (cwContato && cwContato !== c.chatwoot_contato_id) patch.chatwoot_contato_id = cwContato;
    if (pausado !== null && pausado !== c.bot_pausado) patch.bot_pausado = pausado;
    if (Object.keys(patch).length) await db.from("wa_conversas").update(patch).eq("id", c.id);
    return { ...c, ...patch };
  }
  const { data: cliente_id } = await db.rpc("wa_cliente_por_telefone", { p_tel: telefone });
  // contato novo entra no funil: "Em atendimento IA" se o agente está respondendo
  const { data: lead_id } = await db.rpc("wa_garantir_lead", { p_tel: telefone, p_nome: nome, p_etapa: pausado ? "humano" : "ia" });
  const { data, error } = await db.from("wa_conversas").upsert({
    telefone, nome, cliente_id: cliente_id ?? null, lead_id: lead_id ?? null,
    chatwoot_conversa_id: cwConv, chatwoot_contato_id: cwContato, bot_pausado: !!pausado,
  }, { onConflict: "telefone" }).select().single();
  if (error) throw error;
  return data;
}

// ------------------------------------------------------------------ 1. webhook do Chatwoot
async function webhook(token: string, raw: string) {
  if (!HOOK_TOKEN || !iguais(token, HOOK_TOKEN)) return json({ error: "token inválido" }, 401);
  const b = JSON.parse(raw || "{}");
  const conv = b.conversation ?? (b.event?.startsWith("conversation") ? b : null);
  if (!conv) return json({ ok: true, ignorado: "sem conversa" });
  if (CW_INBOX && String(b.inbox?.id ?? conv.inbox_id ?? "") !== String(CW_INBOX)) return json({ ok: true, ignorado: "outra caixa" });

  const contato = conv.meta?.sender ?? (b.sender?.type === "contact" ? b.sender : {});
  const telefone = fone(contato.phone_number || contato.identifier || conv.contact_inbox?.source_id || "");
  if (telefone.length < 12) return json({ ok: true, ignorado: "sem telefone" });
  const labels: string[] = conv.labels ?? [];
  const pausado = Array.isArray(conv.labels) ? labels.includes(ETIQUETA) : null;
  const c = await conversaCrm(telefone, contato.name || null, Number(conv.id) || null, Number(contato.id) || null, pausado);

  if (b.event !== "message_created") return json({ ok: true });
  if (b.private || !["incoming", "outgoing", 0, 1].includes(b.message_type)) return json({ ok: true, ignorado: "nota/atividade" });

  const entrada = b.message_type === "incoming" || b.message_type === 0;
  const criado = quando(b.created_at);
  const texto = textoDe(b);
  const { data: nova } = await db.from("wa_mensagens").upsert({
    conversa_id: c.id, wa_message_id: `cw:${b.id}`, direcao: entrada ? "entrada" : "saida", tipo: b.content_type || "text",
    texto, status: entrada ? "recebida" : "enviada", criado_em: criado,
  }, { onConflict: "wa_message_id", ignoreDuplicates: true }).select("id");
  if (!nova?.length) return json({ ok: true, duplicada: true });   // já gravada (ex.: enviada pela própria CRM)

  const { data: atual } = await db.from("wa_conversas").select("nao_lidas").eq("id", c.id).single();
  await db.from("wa_conversas").update({
    ultima_msg: texto.slice(0, 300), ultima_msg_em: criado,
    ...(entrada ? { ultima_entrada_em: criado, nao_lidas: (atual?.nao_lidas ?? 0) + 1 } : {}),
  }).eq("id", c.id);
  return json({ ok: true });
}

// ------------------------------------------------------------------ 2 e 3. chamadas da CRM (usuário logado)
async function crm(req: Request, raw: string) {
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: { user } } = await db.auth.getUser(jwt);
  if (!user) return json({ error: "faça login no CRM" }, 401);
  const b = JSON.parse(raw || "{}");

  if (b.acao === "status") {
    let conectado = false, erro: string | null = null;
    try { await cw(`/inboxes`); conectado = true; } catch (e) { erro = (e as Error).message; }
    return json({ chatwoot: true, url: !!CW_URL, conta: !!CW_ACC, caixa: !!CW_INBOX, token: !!CW_TOKEN, webhook_token: !!HOOK_TOKEN, conectado, erro, etiqueta: ETIQUETA });
  }

  if (b.acao === "bot") {
    const { data: c } = await db.from("wa_conversas").select("*").eq("id", b.conversa_id).single();
    if (!c) return json({ error: "conversa não encontrada" }, 404);
    if (c.chatwoot_conversa_id) await etiquetaHumano(c.chatwoot_conversa_id, !!b.pausado);
    await db.from("wa_conversas").update({ bot_pausado: !!b.pausado }).eq("id", c.id);
    return json({ ok: true });
  }

  if (b.acao !== "enviar") return json({ error: "ação desconhecida" }, 400);
  const telefone = fone(b.telefone);
  if (telefone.length < 12) return json({ error: "telefone inválido" }, 400);
  const texto = String(b.texto ?? "").trim();
  if (!texto) return json({ error: "mensagem vazia" }, 400);
  if (texto.length > 4096) return json({ error: "mensagem muito longa (máx. 4096 caracteres)" }, 400);

  const c = await conversaCrm(telefone, b.nome || null, null, null, null);
  const cwConv = c.chatwoot_conversa_id || await abrirConversaChatwoot(telefone, b.nome || c.nome, c);
  const m = await cw(`/conversations/${cwConv}/messages`, { method: "POST", body: JSON.stringify({ content: texto, message_type: "outgoing", private: false }) });

  const agora = new Date().toISOString();
  await db.from("wa_mensagens").upsert({ conversa_id: c.id, wa_message_id: m.id ? `cw:${m.id}` : null, direcao: "saida", tipo: "text",
    texto, status: "enviada", enviado_por: user.id, criado_em: agora }, { onConflict: "wa_message_id", ignoreDuplicates: true });
  // quem responde pela CRM assume a conversa: o agente IA para de responder (etiqueta "humano")
  await etiquetaHumano(cwConv, true).catch((e) => console.warn("etiqueta:", e.message));
  await db.from("wa_conversas").update({ ultima_msg: texto.slice(0, 300), ultima_msg_em: agora, bot_pausado: true, chatwoot_conversa_id: cwConv }).eq("id", c.id);
  return json({ ok: true, conversa_id: c.id });
}

async function etiquetaHumano(cwConv: number, ligar: boolean) {
  const atual: string[] = (await cw(`/conversations/${cwConv}/labels`)).payload ?? [];
  const novas = ligar ? [...new Set([...atual, ETIQUETA])] : atual.filter((l) => l !== ETIQUETA);
  if (novas.length !== atual.length) await cw(`/conversations/${cwConv}/labels`, { method: "POST", body: JSON.stringify({ labels: novas }) });
}

// primeira mensagem para um número sem conversa no Chatwoot: acha/cria o contato e abre a conversa na caixa do WhatsApp
async function abrirConversaChatwoot(telefone: string, nome: string | null, c: Any): Promise<number> {
  if (!CW_INBOX) throw new Error("Defina CHATWOOT_INBOX_ID para iniciar conversas pela CRM");
  const variantes = [telefone, telefone.replace(/^(55\d\d)9(\d{8})$/, "$1$2"), telefone.replace(/^(55\d\d)(\d{8})$/, "$19$2")];
  let contato: Any = null;
  for (const v of [...new Set(variantes)]) {
    const r = await cw(`/contacts/search?q=${encodeURIComponent("+" + v)}`);
    contato = (r.payload ?? []).find((x: Any) => fone(x.phone_number || x.identifier || "") === v);
    if (contato) break;
  }
  if (!contato) {
    const r = await cw(`/contacts`, { method: "POST", body: JSON.stringify({ inbox_id: Number(CW_INBOX), name: nome || `+${telefone}`, phone_number: `+${telefone}` }) });
    contato = r.payload?.contact ?? r.payload;
  }
  // conversa já aberta nessa caixa? usa ela
  const convs = (await cw(`/contacts/${contato.id}/conversations`)).payload ?? [];
  const existente = convs.filter((x: Any) => String(x.inbox_id) === String(CW_INBOX)).sort((a: Any, b: Any) => (b.id ?? 0) - (a.id ?? 0))[0];
  let id = existente?.id;
  if (!id) {
    let sourceId = (contato.contact_inboxes ?? []).find((ci: Any) => String(ci.inbox?.id ?? ci.inbox_id) === String(CW_INBOX))?.source_id;
    if (!sourceId) sourceId = (await cw(`/contacts/${contato.id}/contact_inboxes`, { method: "POST", body: JSON.stringify({ inbox_id: Number(CW_INBOX) }) })).source_id;
    id = (await cw(`/conversations`, { method: "POST", body: JSON.stringify({ source_id: sourceId, inbox_id: Number(CW_INBOX), contact_id: contato.id }) })).id;
  }
  await db.from("wa_conversas").update({ chatwoot_conversa_id: id, chatwoot_contato_id: contato.id }).eq("id", c.id);
  return id;
}
