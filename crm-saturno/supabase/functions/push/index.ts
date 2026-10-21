// =====================================================================
//  SATURNO NFC · CRM — Notificações no celular (Web Push)
//  Supabase Edge Function "push". Faz duas coisas:
//   1. Recebe os avisos do banco (gatilhos do notificacoes.sql) e manda a
//      notificação para os celulares inscritos: lead novo, pedido de
//      atendimento humano, venda ganha, pedido novo/status/pago, assinaturas,
//      mensalidade paga, estoque e mensagem no WhatsApp.
//   2. Para a CRM (usuário logado): entrega a chave pública e envia um teste.
//
//  Chaves VAPID (uma vez só, no computador):  npx web-push generate-vapid-keys
//  Deploy:  supabase functions deploy push --no-verify-jwt
//  Secrets: supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=...
//  Opcional: VAPID_SUBJECT=mailto:seu@email.com (contato para a Apple/Google)
// =====================================================================
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import webpush from "npm:web-push@3.6.7";

const env = (k: string) => Deno.env.get(k) ?? "";
const PUBLICA = env("VAPID_PUBLIC_KEY");
const PRIVADA = env("VAPID_PRIVATE_KEY");
if (PUBLICA && PRIVADA) webpush.setVapidDetails(env("VAPID_SUBJECT") || env("SUPABASE_URL"), PUBLICA, PRIVADA);

const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
type Aviso = { titulo: string; corpo: string; url: string; tag?: string };

const STATUS: Record<string, string> = {
  novo: "Novo", arte: "Criação da arte", aprovacao: "Aguardando aprovação", producao: "Em produção",
  enviado: "Enviado", entregue: "Entregue", cancelado: "Cancelado",
};
const ORIGEM: Record<string, string> = {
  manual: "Manual", whatsapp: "WhatsApp", site: "Site", instagram: "Instagram", indicacao: "Indicação",
  google: "Google", agente: "Agente IA", importado: "Importado",
};
const TIPO_MSG: Record<string, string> = {
  image: "📷 Foto", audio: "🎤 Áudio", video: "🎥 Vídeo", document: "📄 Documento",
  sticker: "Figurinha", location: "📍 Localização", contacts: "👤 Contato",
};
const brl = (v: number) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const junta = (...p: (string | null | undefined | false)[]) => p.filter(Boolean).join(" · ");
const corta = (s: string, n = 160) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "método não suportado" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    if (req.headers.get("x-push-segredo")) return await doBanco(req, body);
    return await doCrm(req, body);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});

// ------------------------------------------------------------------ CRM (usuário logado)
async function doCrm(req: Request, body: Any) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: { user } } = await db.auth.getUser(token);
  if (!user) return json({ error: "Faça login na CRM" }, 401);
  if (!PUBLICA || !PRIVADA) return json({ error: "Chaves VAPID não configuradas na função push (supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=...)" }, 400);

  if (body.acao === "chave") return json({ chave: PUBLICA });
  if (body.acao === "teste") {
    const { data } = await db.from("push_inscricoes").select("*").eq("user_id", user.id);
    const enviados = await enviar(data ?? [], {
      titulo: "🪐 Notificações ligadas",
      corpo: "É assim que leads, pedidos, conversas e atualizações da CRM vão chegar neste aparelho.",
      url: "./#dashboard", tag: "teste",
    });
    return json({ ok: true, enviados });
  }
  return json({ error: "ação desconhecida" }, 400);
}

// ------------------------------------------------------------------ gatilhos do banco
let segredoCache = "";
async function doBanco(req: Request, b: Any) {
  if (!segredoCache) {
    const { data } = await db.from("push_config").select("segredo").eq("id", 1).maybeSingle();
    segredoCache = data?.segredo ?? "";
  }
  if (!segredoCache || req.headers.get("x-push-segredo") !== segredoCache) return json({ error: "forbidden" }, 403);
  if (!PUBLICA || !PRIVADA) return json({ error: "VAPID não configurado" }, 400);

  const montado = await montar(b.evento, b.id, b.extra ?? {});
  if (!montado) return json({ ok: true, ignorado: true });
  const [tipo, aviso] = montado;

  let q = db.from("push_inscricoes").select("*").contains("tipos", [tipo]);
  if (b.ator) q = q.neq("user_id", b.ator);   // quem fez a mudança na CRM não recebe aviso da própria ação
  const { data } = await q;
  return json({ ok: true, enviados: await enviar(data ?? [], aviso) });
}

async function montar(evento: string, id: string, extra: Any): Promise<[string, Aviso] | null> {
  // ---- leads
  if (evento.startsWith("lead_")) {
    const { data: l } = await db.from("leads").select("nome,empresa,interesse,valor,origem").eq("id", id).maybeSingle();
    if (!l) return null;
    if (evento === "lead_novo") return ["leads", {
      titulo: `🚀 Novo lead: ${l.nome}`,
      corpo: junta(l.empresa, l.interesse, ORIGEM[l.origem] ?? l.origem) || "Abra a CRM para ver os detalhes",
      url: "./#leads", tag: `lead-${id}`,
    }];
    if (evento === "lead_humano") {
      const { data: a } = await db.from("lead_atividades").select("texto").eq("lead_id", id).eq("tipo", "agente")
        .order("criado_em", { ascending: false }).limit(1).maybeSingle();
      return ["leads", {
        titulo: `🙋 ${l.nome} pediu atendimento humano`,
        corpo: corta(a?.texto?.replace(/^Pediu atendente:\s*/i, "") || junta(l.empresa, l.interesse) || "O agente passou a conversa para a equipe"),
        url: "./#leads", tag: `lead-${id}`,
      }];
    }
    if (evento === "lead_ganho") return ["atualizacoes", {
      titulo: `🏆 Venda fechada: ${l.nome}`,
      corpo: junta(l.interesse, Number(l.valor) > 0 && brl(l.valor), l.empresa) || "Lead marcado como ganho",
      url: "./#leads", tag: `lead-${id}`,
    }];
    return null;
  }

  // ---- pedidos
  if (evento.startsWith("pedido_")) {
    const { data: p } = await db.from("pedidos")
      .select("numero,status,origem,total,pago,clientes(nome,empresa)").eq("id", id).maybeSingle();
    if (!p) return null;
    const cli = (p as Any).clientes ?? {};
    const nome = cli.empresa || cli.nome || "Cliente";
    if (evento === "pedido_novo") return ["pedidos", {
      titulo: `🛒 Novo pedido #${p.numero}`,
      corpo: junta(nome, brl(p.total), ORIGEM[p.origem] ?? p.origem, p.pago && "Pago"),
      url: "./#pedidos", tag: `pedido-${p.numero}`,
    }];
    if (evento === "pedido_pago") return ["atualizacoes", {
      titulo: `💰 Pedido #${p.numero} pago`,
      corpo: junta(nome, brl(p.total)),
      url: "./#pedidos", tag: `pedido-pago-${p.numero}`,
    }];
    return ["atualizacoes", {
      titulo: `📦 Pedido #${p.numero}: ${STATUS[extra.para] ?? extra.para}`,
      corpo: junta(nome, `era ${STATUS[extra.de] ?? extra.de}`),
      url: "./#pedidos", tag: `pedido-${p.numero}`,
    }];
  }

  // ---- assinaturas e mensalidades
  if (evento.startsWith("assinatura_")) {
    const { data: a } = await db.from("assinaturas").select("descricao,valor,clientes(nome,empresa)").eq("id", id).maybeSingle();
    if (!a) return null;
    const cli = (a as Any).clientes ?? {};
    const nome = cli.empresa || cli.nome || "Cliente";
    return ["atualizacoes", evento === "assinatura_nova"
      ? { titulo: `⭐ Nova assinatura: ${nome}`, corpo: junta(a.descricao, `${brl(a.valor)}/mês`), url: "./#assinaturas", tag: `assinatura-${id}` }
      : { titulo: `✖️ Assinatura cancelada: ${nome}`, corpo: junta(a.descricao, `${brl(a.valor)}/mês`), url: "./#assinaturas", tag: `assinatura-${id}` }];
  }
  if (evento === "mensalidade_paga") {
    const { data: m } = await db.from("assinatura_pagamentos")
      .select("valor,referencia,assinaturas(descricao,clientes(nome,empresa))").eq("id", id).maybeSingle();
    if (!m) return null;
    const as = (m as Any).assinaturas ?? {};
    const nome = as.clientes?.empresa || as.clientes?.nome || "Cliente";
    const ref = m.referencia ? new Date(m.referencia + "T12:00:00").toLocaleDateString("pt-BR", { month: "long" }) : "";
    return ["atualizacoes", {
      titulo: `💳 Mensalidade paga: ${nome}`,
      corpo: junta(brl(m.valor), as.descricao, ref && `ref. ${ref}`),
      url: "./#assinaturas", tag: `mensalidade-${id}`,
    }];
  }

  // ---- WhatsApp
  if (evento === "wa_entrada") {
    const { data: m } = await db.from("wa_mensagens")
      .select("tipo,texto,conversa_id,wa_conversas(nome,telefone,clientes(nome),leads(nome))").eq("id", id).maybeSingle();
    if (!m) return null;
    const c = (m as Any).wa_conversas ?? {};
    const nome = c.clientes?.nome || c.leads?.nome || c.nome || (c.telefone ? `+${c.telefone}` : "Contato");
    return ["whatsapp", {
      titulo: `💬 ${nome}`,
      corpo: corta(m.texto?.trim() || TIPO_MSG[m.tipo] || "Nova mensagem"),
      url: "./#whatsapp", tag: `wa-${m.conversa_id}`,
    }];
  }

  // ---- estoque
  if (evento === "estoque") {
    const zerou = Number(extra.estoque) === 0;
    return ["atualizacoes", {
      titulo: zerou ? `⛔ Esgotou: ${extra.nome}` : `⚠️ Estoque baixo: ${extra.nome}`,
      corpo: zerou ? "Reponha o estoque para continuar vendendo." : `Restam ${extra.estoque} un. Hora de repor.`,
      url: "./#produtos", tag: `estoque-${id}`,
    }];
  }
  return null;
}

// número no ícone do app: leads esperando + pedidos novos + mensagens não lidas
async function contador() {
  const [{ count: leads }, { count: peds }, { data: conv }] = await Promise.all([
    db.from("leads").select("id", { count: "exact", head: true }).in("etapa", ["novo", "humano"]),
    db.from("pedidos").select("id", { count: "exact", head: true }).eq("status", "novo"),
    db.from("wa_conversas").select("nao_lidas").gt("nao_lidas", 0),
  ]);
  return (leads ?? 0) + (peds ?? 0) + (conv ?? []).reduce((s: number, c: Any) => s + (c.nao_lidas || 0), 0);
}

async function enviar(inscricoes: Any[], aviso: Aviso) {
  if (!inscricoes.length) return 0;
  const payload = JSON.stringify({ ...aviso, contador: await contador().catch(() => null) });
  let ok = 0;
  await Promise.all(inscricoes.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload,
        { TTL: 60 * 60 * 24, urgency: "high" });
      ok++;
    } catch (e) {
      const code = (e as Any).statusCode;
      // aparelho desinstalou o app ou cancelou a permissão: apaga a inscrição
      if (code === 404 || code === 410) await db.from("push_inscricoes").delete().eq("id", s.id);
      else console.error("push falhou", code, (e as Any).body ?? (e as Error).message);
    }
  }));
  return ok;
}
