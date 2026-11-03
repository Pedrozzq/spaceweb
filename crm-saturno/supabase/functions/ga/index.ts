// =====================================================================
//  SATURNO NFC · CRM — Google Analytics (GA4) dentro da CRM (menu Google Analytics)
//  Supabase Edge Function "ga". Só quem está logado na CRM consegue ler.
//  Os dados vêm da Google Analytics Data API com uma conta de serviço
//  (o token do Google é assinado aqui, sem biblioteca extra).
//
//  Deploy:  npx supabase functions deploy ga --no-verify-jwt --use-api --project-ref lrthxbchqafcjbvjwcne
//  Secrets: GA_PROPERTY_ID  número da propriedade GA4 (Admin → Detalhes da propriedade)
//           GA_CREDENTIALS  o JSON inteiro da chave da conta de serviço
//  No GA4: Admin → Gerenciamento de acesso à propriedade → e-mail da conta de serviço como "Leitor".
//  Chamada (CRM): POST {dias: 7|28|90, atualizar?: true} com o token do login.
// =====================================================================
// @ts-nocheck
import crypto from "node:crypto";
import { Buffer } from "node:buffer";

const env = (k) => Deno.env.get(k) ?? "";
const SUPABASE_URL = env("SUPABASE_URL").replace(/\/+$/, "");
const SUPABASE_KEY = env("SUPABASE_ANON_KEY");
const PROPRIEDADE = String(env("GA_PROPERTY_ID")).replace(/^properties\//, "").trim();

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });

function credenciais() {
    try {
        if (env('GA_CREDENTIALS')) {
            const c = JSON.parse(env('GA_CREDENTIALS'));
            return { email: c.client_email, chave: c.private_key };
        }
    } catch (e) { /* JSON inválido: tenta as variáveis separadas */ }
    if (env('GA_CLIENT_EMAIL') && env('GA_PRIVATE_KEY')) {
        return { email: env('GA_CLIENT_EMAIL'), chave: env('GA_PRIVATE_KEY').replace(/\\n/g, '\n') };
    }
    return null;
}

// ---------- token do Google (JWT da conta de serviço, RS256) ----------
let tokenCache = null;
const b64url = b => Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
async function tokenGoogle(cred) {
    if (tokenCache && tokenCache.exp > Date.now() + 60e3) return tokenCache.token;
    const agora = Math.floor(Date.now() / 1000);
    const cab = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const corpo = b64url(JSON.stringify({
        iss: cred.email, scope: 'https://www.googleapis.com/auth/analytics.readonly',
        aud: 'https://oauth2.googleapis.com/token', iat: agora, exp: agora + 3600
    }));
    const assinatura = b64url(crypto.createSign('RSA-SHA256').update(cab + '.' + corpo).sign(cred.chave));
    const r = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: cab + '.' + corpo + '.' + assinatura })
    });
    const d = await r.json();
    if (!r.ok || !d.access_token) throw new Error('Google recusou a conta de serviço: ' + (d.error_description || d.error || r.status));
    tokenCache = { token: d.access_token, exp: Date.now() + (d.expires_in || 3600) * 1000 };
    return tokenCache.token;
}

async function ga(token, metodo, corpo) {
    const r = await fetch('https://analyticsdata.googleapis.com/v1beta/properties/' + PROPRIEDADE + ':' + metodo, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
        signal: AbortSignal.timeout(12000)
    });
    const d = await r.json();
    if (!r.ok) throw new Error((d.error && d.error.message) || ('Analytics HTTP ' + r.status));
    return d;
}

// linhas do GA → [{d:[...dimensões], m:[...métricas]}]
const linhas = rep => (rep && rep.rows || []).map(r => ({
    d: (r.dimensionValues || []).map(x => x.value),
    m: (r.metricValues || []).map(x => Number(x.value) || 0)
}));

const cache = new Map();   // dias → {em, dados}
const CACHE_MS = 5 * 60 * 1000;

async function montar(dias) {
    const cred = credenciais();
    const token = await tokenGoogle(cred);
    const atual = { startDate: dias + 'daysAgo', endDate: 'today' };
    const anterior = { startDate: (2 * dias) + 'daysAgo', endDate: (dias + 1) + 'daysAgo' };
    const top = (dim, metricas, limite) => ({
        dateRanges: [atual], dimensions: [{ name: dim }], metrics: metricas.map(n => ({ name: n })),
        orderBys: [{ metric: { metricName: metricas[0] }, desc: true }], limit: limite || 8
    });
    const MET = ['activeUsers', 'newUsers', 'sessions', 'screenPageViews', 'engagementRate', 'averageSessionDuration', 'bounceRate'];

    const [lote1, lote2, tempoReal] = await Promise.all([
        ga(token, 'batchRunReports', { requests: [
            { dateRanges: [atual, anterior], metrics: MET.map(n => ({ name: n })) },
            { dateRanges: [atual], dimensions: [{ name: 'date' }], metrics: [{ name: 'activeUsers' }, { name: 'sessions' }, { name: 'screenPageViews' }],
              orderBys: [{ dimension: { dimensionName: 'date' } }], limit: 400 },
            top('sessionDefaultChannelGroup', ['sessions', 'activeUsers']),
            top('sessionSourceMedium', ['sessions', 'activeUsers'], 10),
            top('deviceCategory', ['activeUsers', 'sessions'], 5)
        ] }),
        ga(token, 'batchRunReports', { requests: [
            top('city', ['activeUsers', 'sessions'], 10),
            top('pagePath', ['screenPageViews', 'activeUsers'], 10),
            top('eventName', ['eventCount', 'totalUsers'], 12),
            top('landingPage', ['sessions', 'engagementRate'], 8),
            { dateRanges: [atual], dimensions: [{ name: 'dayOfWeek' }, { name: 'hour' }], metrics: [{ name: 'sessions' }], limit: 200 }
        ] }),
        ga(token, 'runRealtimeReport', {
            dimensions: [{ name: 'city' }], metrics: [{ name: 'activeUsers' }],
            orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }], limit: 6
        }).catch(() => null)
    ]);

    const [tot, serie, canais, origens, aparelhos] = lote1.reports;
    const [cidades, paginas, eventos, entradas, horarios] = lote2.reports;
    // totais: com 2 períodos o GA devolve uma linha por período (dimensão dateRange)
    const t = linhas(tot);
    const totais = { atual: {}, anterior: {} };
    t.forEach((r, i) => {
        const qual = (r.d[0] || (i === 0 ? 'date_range_0' : 'date_range_1')) === 'date_range_1' ? 'anterior' : 'atual';
        MET.forEach((n, k) => { totais[qual][n] = r.m[k]; });
    });
    const rt = linhas(tempoReal);
    return {
        dias, gerado_em: new Date().toISOString(), propriedade: PROPRIEDADE,
        totais,
        serie: linhas(serie).map(r => ({ dia: r.d[0].replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'), usuarios: r.m[0], sessoes: r.m[1], views: r.m[2] })),
        canais: linhas(canais).map(r => ({ nome: r.d[0], sessoes: r.m[0], usuarios: r.m[1] })),
        origens: linhas(origens).map(r => ({ nome: r.d[0], sessoes: r.m[0], usuarios: r.m[1] })),
        aparelhos: linhas(aparelhos).map(r => ({ nome: r.d[0], usuarios: r.m[0], sessoes: r.m[1] })),
        cidades: linhas(cidades).map(r => ({ nome: r.d[0], usuarios: r.m[0], sessoes: r.m[1] })),
        paginas: linhas(paginas).map(r => ({ nome: r.d[0], views: r.m[0], usuarios: r.m[1] })),
        eventos: linhas(eventos).map(r => ({ nome: r.d[0], total: r.m[0], usuarios: r.m[1] })),
        entradas: linhas(entradas).map(r => ({ nome: r.d[0], sessoes: r.m[0], engajamento: r.m[1] })),
        horarios: linhas(horarios).map(r => ({ dia: +r.d[0], hora: +r.d[1], sessoes: r.m[0] })),
        agora: tempoReal ? { usuarios: rt.reduce((s, r) => s + r.m[0], 0), cidades: rt.map(r => ({ nome: r.d[0], usuarios: r.m[0] })) } : null
    };
}

// login da CRM válido?
async function usuarioCrm(req) {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") || "");
  if (!m) return null;
  try {
    const r = await fetch(SUPABASE_URL + "/auth/v1/user", {
      headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + m[1] },
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return null;
    const u = await r.json();
    return u && u.id ? u : null;
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ erro: "metodo" }, 405);
  if (!(await usuarioCrm(req))) return json({ erro: "login", mensagem: "Entre na CRM para ver o Analytics." }, 401);
  if (!PROPRIEDADE || !credenciais()) {
    return json({ erro: "nao-configurado", mensagem: "Faltam os secrets GA_PROPERTY_ID e GA_CREDENTIALS no Supabase." }, 503);
  }
  const body = await req.json().catch(() => ({}));
  const dias = [7, 28, 90].includes(Number(body.dias)) ? Number(body.dias) : 28;
  const c = cache.get(dias);
  if (c && Date.now() - c.em < CACHE_MS && !body.atualizar) return json(c.dados);
  try {
    const dados = await montar(dias);
    cache.set(dias, { em: Date.now(), dados });
    return json(dados);
  } catch (e) {
    console.error("Analytics:", e && e.message);
    return json({ erro: "google", mensagem: e && e.message }, 502);
  }
});
