
// Railway Volume KV replacement
// Mount Railway Volume at /kv
import fs from "fs/promises";
const KV_DIR = process.env.KV_PATH || "/kv";
async function kvInit(){ await fs.mkdir(KV_DIR,{recursive:true}); }
async function kvGet(key){
  await kvInit();
  try { return await fs.readFile(`${KV_DIR}/${encodeURIComponent(key)}`,"utf8"); }
  catch(e){ return null; }
}
async function kvPut(key,value){
  await kvInit();
  await fs.writeFile(`${KV_DIR}/${encodeURIComponent(key)}`, String(value));
}
async function kvDelete(key){
  try { await fs.unlink(`${KV_DIR}/${encodeURIComponent(key)}`); } catch(e){}
}

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var TELEGRAM_API = "https://api.telegram.org/bot";
var RAILWAY_API = "https://backboard.railway.com/graphql/v2";
var CF_API = "https://api.cloudflare.com/client/v4";
var CHANNELS = ["spider_vpn1", "amirsp1ider"];
var MEMORY_CHANNEL = "@sapaceunlimitamirbot";
var REPO = "amirh00sain/rebecca";
var BRANCH = "main";
var PANEL_USER = "admin";
var PANEL_PASS = "admin";
var PORT = "8080";
var REPO_PORTS = {
  "amirh00sain/rebecca": "8080",
  "amirh00sain/SpiderPanel": "8080",
  "amirh00sain/vpn_ui_railway": "2083",
  "arvin341az-glitch/RVG": "8000"
};
var TCP_TARGET_PORT = "8080";
var CF_TOKEN_URL = "https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=%5B%7B%22key%22%3A%22zone%22%2C%22type%22%3A%22read%22%7D%2C%7B%22key%22%3A%22dns%22%2C%22type%22%3A%22edit%22%7D%5D&accountId=*&zoneId=all&name=EzAccess1-Token";
var REGIONS = [
  { id: "us-west2", label: "US West", country: "USA"},
  { id: "us-east4-eqdc4a", label: "US East", country: "USA"},
  { id: "europe-west4-drams3a", label: "EU West Amsterdam", country: "Netherlands"},
  { id: "asia-southeast1-eqsg3a", label: "Singapore", country: "Singapore"}
];
function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
__name(esc, "esc");
function q(s) {
  return JSON.stringify(String(s));
}
__name(q, "q");
function rand(len) {
  const c = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < len; i++) s += c[Math.floor(Math.random() * c.length)];
  return s;
}
__name(rand, "rand");
function maskToken(t) {
  if (!t) return "";
  return t.slice(0, 6) + ""+ t.slice(-4);
}
__name(maskToken, "maskToken");
function fmtGb(v) {
  const g = Number(v) || 0;
  if (g >= 1) return g.toFixed(2) + "GB";
  return Math.round(g * 1024) + "MB";
}
__name(fmtGb, "fmtGb");
async function getKey(env) {
  const raw = new TextEncoder().encode(env.ENCRYPTION_KEY);
  const digest = await crypto.subtle.digest("SHA-256", raw);
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM"}, false, ["encrypt", "decrypt"]);
}
__name(getKey, "getKey");
function toB64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
__name(toB64, "toB64");
function fromB64(s) {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}
__name(fromB64, "fromB64");
async function encrypt(plain, env) {
  const key = await getKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain));
  return "v1:"+ toB64(iv) + ":"+ toB64(ct);
}
__name(encrypt, "encrypt");
async function decrypt(data, env) {
  const parts = String(data).split(":");
  if (parts.length !== 3) throw new Error("bad ciphertext");
  const key = await getKey(env);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(parts[1]) }, key, fromB64(parts[2]));
  return new TextDecoder().decode(pt);
}
__name(decrypt, "decrypt");
async function getUser(chatId, env) {
  const u = await JSON.parse(await kvGet("user:"+ chatId) || "null");
  return u || { step: "welcome", projects: [], region: null };
}
__name(getUser, "getUser");
async function saveUser(u, chatId, env) {
  await kvPut("user:"+ chatId, JSON.stringify(u));
}
__name(saveUser, "saveUser");
var __captured = [];
async function tg(method, params, env) {
  const url = `${TELEGRAM_API}${env.BOT_TOKEN}/${method}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json"},
    body: JSON.stringify(params)
  });
  const text = await res.text();
  let j;
  try {
    j = JSON.parse(text);
  } catch (e) {
    j = { ok: false, description: text.slice(0, 200) };
  }
  __captured.push({ method, params, result: j });
  return j;
}
__name(tg, "tg");
function btn(text, data) {
  return { text, callback_data: data };
}
__name(btn, "btn");
function urlBtn(text, url) {
  return { text, url };
}
__name(urlBtn, "urlBtn");
function kb(rows) {
  return { inline_keyboard: rows };
}
__name(kb, "kb");
async function sendText(chatId, text, keyboard, parse = "HTML", replyTo = null) {
  const p = { chat_id: chatId, text, parse_mode: parse };
  if (keyboard) p.reply_markup = keyboard;
  if (replyTo) p.reply_to_message_id = replyTo;
  let r = await tg("sendMessage", p, globalThis.__env);
  if (replyTo && !r.ok && /replied not found|message to be replied|message is not found/i.test(r.description || "")) {
    delete p.reply_to_message_id;
    r = await tg("sendMessage", p, globalThis.__env);
  }
  return r;
}
__name(sendText, "sendText");
async function editMsg(chatId, msgId, text, keyboard, parse = "HTML") {
  const p = { chat_id: chatId, message_id: msgId, text, parse_mode: parse };
  if (keyboard) p.reply_markup = keyboard;
  return tg("editMessageText", p, globalThis.__env);
}
__name(editMsg, "editMsg");
async function answerCb(id, env, text) {
  const p = { callback_query_id: id };
  if (text) p.text = text;
  return tg("answerCallbackQuery", p, env);
}
__name(answerCb, "answerCb");
async function isMember(channel, userId, env) {
  const r = await tg("getChatMember", { chat_id: "@"+ channel, user_id: userId }, env);
  return ["member", "administrator", "creator", "restricted"].includes(r?.result?.status);
}
__name(isMember, "isMember");
async function userIsMember(userId, env) {
  const missing = [];
  for (const ch of CHANNELS) {
    let ok = false;
    try {
      ok = await isMember(ch, userId, env);
    } catch (e) {
    }
    if (!ok) missing.push(ch);
  }
  return missing;
}
__name(userIsMember, "userIsMember");
function show(chatId, msgId, text, keyboard) {
  if (msgId) return editMsg(chatId, msgId, text, keyboard);
  return sendText(chatId, text, keyboard);
}
__name(show, "show");
function sendNew(chatId, msgId, text, keyboard) {
  return sendText(chatId, text, keyboard);
}
__name(sendNew, "sendNew");
var __lastRailwayAt = 0;
var RAILWAY_MIN_GAP = 1200;
async function railway(query, vars, token) {
  const since = Date.now() - __lastRailwayAt;
  if (since < RAILWAY_MIN_GAP) await new Promise((r) => setTimeout(r, RAILWAY_MIN_GAP - since));
  __lastRailwayAt = Date.now();
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(RAILWAY_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer "+ token },
      body: JSON.stringify({ query, variables: vars || {} })
    });
    const text = await res.text();
    if (res.status === 429 || res.status === 403 && /Attention|Cloudflare/.test(text)) {
      lastErr = new Error("Railway rate limited (HTTP "+ res.status + ")");
      await new Promise((r) => setTimeout(r, 2500 * (attempt + 1)));
      continue;
    }
    let j;
    try {
      j = JSON.parse(text);
    } catch (e) {
      throw new Error("Railway HTTP "+ res.status + ": "+ text.slice(0, 200));
    }
    if (j.errors) throw new Error(j.errors[0].message);
    return j.data;
  }
  throw lastErr || new Error("Railway request failed");
}
__name(railway, "railway");
async function railwayValidate(token) {
  const d = await railway("{ apiToken { workspaces { id name } } me { id name email } }", {}, token);
  const ws = d?.apiToken?.workspaces?.[0];
  if (!ws) throw new Error("workspace not found for token");
  return { workspaceId: ws.id, workspaceName: ws.name, userId: d.me.id, name: d.me.name || "", email: d.me.email };
}
__name(railwayValidate, "railwayValidate");
async function cf(path, token, opts = {}) {
  const res = await fetch(CF_API + path, {
    method: opts.method || "GET",
    headers: { "Authorization": "Bearer "+ token, "Content-Type": "application/json"},
    body: opts.body ? JSON.stringify(opts.body) : void 0
  });
  const j = await res.json().catch(() => ({}));
  if (!j.success) {
    const msg = (j.errors || []).map((e) => e.message).join("; ") || "CF HTTP "+ res.status;
    throw new Error(msg);
  }
  return { json: j, headers: res.headers };
}
__name(cf, "cf");
var PANEL_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
async function panelDomain(u, p, env) {
  const token = await decrypt(u.railwayToken, env);
  try {
    const inst = await railway(
      `query { serviceInstance(serviceId:${q(p.serviceId)}, environmentId:${q(p.envId)}) { domains { serviceDomains { domain } } } }`,
      {},
      token
    );
    const d = inst?.serviceInstance?.domains?.serviceDomains?.[0]?.domain;
    if (d) return d;
  } catch (e) {
  }
  return p.domain || "";
}
__name(panelDomain, "panelDomain");
async function panelLogin(base, env) {
  const res = await fetch("https://"+ base + "/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": PANEL_UA },
    body: JSON.stringify({ password: PANEL_PASS })
  });
  const setc = res.headers.get("set-cookie") || "";
  const m = setc.match(/spider_session=([^;]+)/);
  if (!m) throw new Error("panel login failed (HTTP "+ res.status + ")");
  return m[1];
}
__name(panelLogin, "panelLogin");
async function panelCall(base, cookie, method, path, body, env) {
  const res = await fetch("https://"+ base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      "User-Agent": PANEL_UA,
      "Cookie": "spider_session="+ cookie
    },
    body: body ? JSON.stringify(body) : void 0
  });
  const text = await res.text();
  let j;
  try {
    j = JSON.parse(text);
  } catch (e) {
    j = { raw: text.slice(0, 200) };
  }
  if (!res.ok) throw new Error(String(j.detail || j.message || j.raw || text).slice(0, 160));
  return j;
}
__name(panelCall, "panelCall");
function findRealityIb(inbounds) {
  const arr = inbounds || [];
  return arr.find((x) => x.inbound_id === "default-reality") || arr.find((x) => String(x.protocol).toLowerCase() === "reality"&& String(x.network).toLowerCase() === "xhttp") || arr.find((x) => String(x.protocol).toLowerCase() === "reality") || null;
}
__name(findRealityIb, "findRealityIb");
function subLink(subUrl, username) {
  if (!subUrl || !username) return subUrl || "";
  try {
    const u = new URL(subUrl);
    return u.origin + "/sub/"+ encodeURIComponent(username);
  } catch (e) {
    return subUrl;
  }
}
__name(subLink, "subLink");
function deployBar(pct, label) {
  pct = Math.max(0, Math.min(100, Math.round(pct)));
  const filled = Math.round(pct / 10);
  const bar = "\u2593".repeat(filled) + "\u2591".repeat(10 - filled);
  return `<b>Panel Deployment</b>
<code>${bar}</code> ${pct}%
${esc(label)}`;
}
__name(deployBar, "deployBar");
function statusLabel(s) {
  const map = {
    WAITING: "Waiting in queue",
    QUEUED: "Queued",
    INITIALIZING: "Initializing",
    BUILDING: "Building image",
    DEPLOYING: "Deploying",
    SUCCESS: "Deployment completed ",
    FAILED: "Deployment failed ",
    CRASHED: "Crashed ",
    REMOVED: "Removed",
    SLEEPING: "Sleeping",
    NEEDS_APPROVAL: "Needs approval"};
  return map[s] || s;
}
__name(statusLabel, "statusLabel");
function statusPct(status, job) {
  switch (status) {
    case "WAITING":
    case "QUEUED":
    case "INITIALIZING":
      return 80;
    case "BUILDING": {
      const ticks = job && job.buildTicks != null ? job.buildTicks : 0;
      return Math.min(95, 80 + Math.floor(ticks * 2));
    }
    case "DEPLOYING": {
      const ticks = job && job.deployTicks != null ? job.deployTicks : 0;
      return Math.min(99, 95 + ticks);
    }
    case "SUCCESS":
    case "FAILED":
    case "CRASHED":
    case "REMOVED":
    case "SLEEPING":
      return 100;
    default:
      return 80;
  }
}
__name(statusPct, "statusPct");
function isDoneStatus(s) {
  return ["SUCCESS", "FAILED", "CRASHED", "REMOVED", "SLEEPING", "NEEDS_APPROVAL"].includes(s);
}
__name(isDoneStatus, "isDoneStatus");
async function editProgress(chatId, msgId, status, job, env, pctOverride) {
  const pct = pctOverride ?? statusPct(status, job);
  await editMsg(chatId, msgId, deployBar(pct, statusLabel(status)), null).catch(() => {
  });
  return pct;
}
__name(editProgress, "editProgress");
const DEPLOY_LOCKS = new Map();

async function runDeploy(chatId, msgId, env) {
  if (DEPLOY_LOCKS.has(chatId)) {
    await editMsg(chatId, msgId, "یک Deploy در حال انجام است. لطفاً صبر کنید.", null);
    return;
  }
  DEPLOY_LOCKS.set(chatId, Date.now());
  const u = await getUser(chatId, env);
  if (!u.railwayToken) {
    await editMsg(chatId, msgId, "\u0627\u0648\u0644 \u0628\u0627\u06CC\u062F Railway Token \u062B\u0628\u062A \u0628\u0634\u0647. /start", null);
    return;
  }
  const token = await decrypt(u.railwayToken, env);
  const region = u.region;
  if (!region) {
    await editMsg(chatId, msgId, "\u0627\u0648\u0644 Region \u0631\u0648 \u0627\u0646\u062A\u062E\u0627\u0628 \u06A9\u0646.", null);
    return;
  }
  const repo = u.repo || REPO;
  const svcPort = u.deployPort || REPO_PORTS[repo] || PORT;
  const name = u.name || "panel-"+ rand(4);
  const prog = await sendText(chatId, deployBar(4, "Starting"), null);
  const pmsgId = prog?.result?.message_id;
  if (!pmsgId) return;
  let projectId, serviceId, envId, domain, deployId;
  try {
    const ws = u.railwayInfo?.workspaceId;
    const proj = await railway(
      `mutation { projectCreate(input:{ name:${q(name)}, workspaceId:${q(ws)}, defaultEnvironmentName:"production"}) { id } }`,
      {},
      token
    );
    projectId = proj.projectCreate.id;
    await editMsg(chatId, pmsgId, deployBar(12, "Creating project"), null);
    const envQ = await railway(
      `query { project(id:${q(projectId)}) { environments { edges { node { id name } } } } }`,
      {},
      token
    );
    const envs = envQ.project.environments.edges.map((e) => e.node);
    envId = (envs.find((e) => e.name === "production") || envs[0]).id;
    await editMsg(chatId, pmsgId, deployBar(20, "Connecting GitHub repo"), null);
    const svc = await railway(
      `mutation { serviceCreate(input:{ projectId:${q(projectId)}, name:${q(name)}, source:{ repo:${q(repo)} }, branch:${q(BRANCH)} }) { id } }`,
      {},
      token
    );
    serviceId = svc.serviceCreate.id;
    await editMsg(chatId, pmsgId, deployBar(32, "Service created "), null);
    await railway(
      `mutation { variableUpsert(input:{ projectId:${q(projectId)}, environmentId:${q(envId)}, serviceId:${q(serviceId)}, name:"PORT", value:${q(svcPort)} }) }`,
      {},
      token
    );
    await editMsg(chatId, pmsgId, deployBar(45, "PORT="+ svcPort +" set "), null);
    await railway(
      `mutation { serviceInstanceUpdate(input:{ region:${q(region)} }, serviceId:${q(serviceId)}, environmentId:${q(envId)}) }`,
      {},
      token
    );
    await railway(
      `mutation { variableUpsert(input:{ projectId:${q(projectId)}, environmentId:${q(envId)}, serviceId:${q(serviceId)}, name:"RAILWAY_REGION", value:${q(region)} }) }`,
      {},
      token
    );
    const dom = await railway(
      `mutation($sid:String!,$eid:String!,$port:Int){ serviceDomainCreate(serviceId:$sid,environmentId:$eid,targetPort:$port){ id domain } }`,
      { sid: serviceId, eid: envId, port: Number(svcPort) },
      token
    );
    domain = dom.serviceDomainCreate.domain;
    await editMsg(chatId, pmsgId, deployBar(70, "Domain generated "), null);
    deployId = null;
    for (let i = 0; i < 10; i++) {
      const si = await railway(
        `query { serviceInstance(serviceId:${q(serviceId)}, environmentId:${q(envId)}) { latestDeployment { id status } } }`,
        {},
        token
      );
      const ld = si.serviceInstance?.latestDeployment;
      if (ld && ld.id) {
        deployId = ld.id;
        break;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    if (!deployId) {
      const dep = await railway(
        `mutation { serviceInstanceDeployV2(serviceId:${q(serviceId)}, environmentId:${q(envId)}) }`,
        {},
        token
      );
      deployId = dep.serviceInstanceDeployV2;
    }
    await editMsg(chatId, pmsgId, deployBar(78, "Build started"), null);
    const job = {
      chatId,
      messageId: pmsgId,
      projectId,
      serviceId,
      envId,
      deployId,
      name,
      region,
      domain,
      repo,
      deployPort: svcPort,
      lastPct: 78,
      createdAt: Date.now()
    };
    await kvPut("job:"+ deployId, JSON.stringify(job));
    await pollLoop(job, token, env, 200);
  } catch (e) {
    console.error("deploy err", e);
    if (projectId) {
      try {
        await railway(`mutation { projectDelete(id:${q(projectId)}) }`, {}, token);
      } catch (de) {
      }
    }
    await editMsg(
      chatId,
      pmsgId,
      `<b>Deploy failed</b>
${esc(e.message)}

\u067E\u0631\u0648\u0698\u0647 \u0631\u0648\u06CC Railway \u062D\u0630\u0641 \u0634\u062F. \u062F\u0648\u0628\u0627\u0631\u0647 \u062A\u0644\u0627\u0634 \u06A9\u0646 \u06CC\u0627 \u0645\u0646\u0648 \u0631\u0648 \u0628\u0627\u0632 \u06A9\u0646.`,
      kb([[btn("Retry", "deploy"), btn("Dashboard", "menu")]])
    );
  } finally {
    DEPLOY_LOCKS.delete(chatId);
  }
}
__name(runDeploy, "runDeploy");
async function pollLoop(job, token, env, maxIters) {
  for (let i = 0; i < maxIters; i++) {
    await new Promise((r) => setTimeout(r, 3e3));
    let status;
    try {
      const d = await railway(`query { deployment(id:${q(job.deployId)}) { status } }`, {}, token);
      status = d.deployment.status;
    } catch (e) {
      break;
    }
    if (isDoneStatus(status)) {
      await finishDeploy(job, status, env);
      return;
    }
    if (status === "BUILDING") job.buildTicks = (job.buildTicks || 0) + 1;
    if (status === "DEPLOYING") job.deployTicks = (job.deployTicks || 0) + 1;
    const pct = statusPct(status, job);
    job.lastPct = pct;
    await kvPut("job:"+ job.deployId, JSON.stringify(job));
    if (pct !== 0) await editProgress(job.chatId, job.messageId, status, job, env);
  }
}
__name(pollLoop, "pollLoop");
async function finishDeploy(job, status, env) {
  if (status === "SUCCESS") {
    await editMsg(
      job.chatId,
      job.messageId,
      deployBar(100, "Deployment completed "),
      kb([[btn("Dashboard", "menu")]])
    ).catch(() => {
    });
  }
  await kvDelete("job:"+ job.deployId);
  if (status === "SUCCESS") {
    const u = await getUser(job.chatId, env);
    if (!u.projects.find((p) => p.id === job.projectId)) {
      u.projects.push({
        id: job.projectId,
        serviceId: job.serviceId,
        envId: job.envId,
        name: job.name,
        region: job.region,
        domain: job.domain,
        repo: job.repo || repoSlug(REPO),
        deployPort: job.deployPort || REPO_PORTS[job.repo || repoSlug(REPO)] || PORT
      });
    }
    u.step = "ready";
    await saveUser(u, job.chatId, env);
    await sendText(
      job.chatId,
      `<b>Panel Deployed!</b>

 <b>Service:</b> <code>${esc(job.name)}</code>
 <b>Region:</b> <code>${esc(job.region)}</code>
 <b>Domain:</b> <code>${esc(job.domain)}</code>

 <b>User:</b> <code>${PANEL_USER}</code>
 <b>Pass:</b> <code>${PANEL_PASS}</code>


\u062F\u0633\u062A\u0648\u0631 <b>/dashboard</b> \u0628\u0631\u0627\u06CC \u0645\u0646\u0648\u06CC \u0627\u0635\u0644\u06CC.`,
      kb([[btn("Dashboard", "menu")]])
    );
  } else {
    try {
      const u = await getUser(job.chatId, env);
      if (!u.projects.find((p) => p.id === job.projectId)) {
        u.projects.push({
          id: job.projectId,
          serviceId: job.serviceId,
          envId: job.envId,
          name: job.name,
          region: job.region,
          domain: job.domain,
          repo: job.repo || repoSlug(REPO),
          deployPort: job.deployPort || REPO_PORTS[job.repo || repoSlug(REPO)] || PORT,
          failed: true
        });
        u.step = "ready";
        await saveUser(u, job.chatId, env);
      }
    } catch (e) {
    }
    await editMsg(
      job.chatId,
      job.messageId,
      `<b>Deployment ${esc(status)}</b>
${deployBar(job.lastPct, statusLabel(status))}`,
      kb([[btn("Retry", "deploy"), btn("My Projects", "myproj")]])
    );
  }
}
__name(finishDeploy, "finishDeploy");
async function handleStart(chatId, env) {
  const u = await getUser(chatId, env);
  if (u.onboarded || u.railwayToken) return sendDashboard(chatId, env);
  u.onboarded = true;
  u.step = "welcome";
  await saveUser(u, chatId, env);
  const text = `<b>SPIDER PANEL</b>

<b>\u0627\u06CC\u0646 \u0631\u0628\u0627\u062A \u0686\u06CC\u06A9\u0627\u0631 \u0645\u06CC\u200C\u06A9\u0646\u0647\u061F</b>

 \u2022 <b>Deploy Panel</b> \u2014 \u062F\u06CC\u067E\u0644\u0648\u06CC Rebecca / Spider / Sanaii \u06CC\u0627 \u0644\u06CC\u0646\u06A9 \u062F\u0644\u062E\u0648\u0627\u0647 \u0631\u0648\u06CC Railway
 \u2022 <b>TCP Proxy</b> \u2014 \u0633\u0627\u062E\u062A \u0648 \u0645\u062F\u06CC\u0631\u06CC\u062A \u067E\u0631\u0627\u06A9\u0633\u06CC TCP (Random / Select / List)
 \u2022 <b>Custom Domain</b> \u2014 \u0627\u062A\u0635\u0627\u0644 \u062F\u0627\u0645\u0646\u0647 \u0627\u062E\u062A\u0635\u0627\u0635\u06CC \u0628\u0627 Cloudflare

\u0628\u0632\u0646 \u0628\u0631\u06CC\u0645!`;
  return sendText(chatId, text, kb([[btn("LET'S GO", "letsgo")]]));
}
__name(handleStart, "handleStart");
async function handleHelp(chatId, env) {
  const text = `<b>SPIDER PANEL</b>

<b>\u0631\u0627\u0647\u0646\u0645\u0627\u06CC \u06A9\u0627\u0645\u0644</b>

 <b>New Deployment</b> \u2014 \u0633\u0627\u062E\u062A \u067E\u0646\u0644 \u0631\u0648\u06CC Railway:
  1. <b>Railway Token</b> \u062B\u0628\u062A \u06A9\u0646.
  2. \u067E\u0646\u0644 \u0645\u0648\u0631\u062F \u0646\u0638\u0631 \u0631\u0648 \u0627\u0646\u062A\u062E\u0627\u0628 \u06A9\u0646 (Rebecca / Spider / Sanaii / Custom).
  3. <b>Region</b> \u0631\u0648 \u0627\u0646\u062A\u062E\u0627\u0628 \u06A9\u0646.
  4. <b>DEPLOY</b> \u0631\u0648 \u0628\u0632\u0646.
  \u062F\u0631 \u0628\u062E\u0634 Custom \u0644\u06CC\u0646\u06A9 GitHub \u062E\u0648\u062F\u062A \u0631\u0648 \u0628\u0641\u0631\u0633\u062A \u062A\u0627 \u0647\u0645\u0648\u0646 \u062F\u06CC\u067E\u0644\u0648\u06CC \u0628\u0634\u0647.
  \u067E\u0646\u0644 \u0628\u0627 \u06CC\u06A9 \u062F\u0627\u0645\u0646\u0647 \u0631\u0627\u06CC\u06AF\u0627\u0646 \u0628\u0627\u0644\u0627 \u0645\u06CC\u0627\u062F.

 <b>My Projects</b> \u2014 \u0644\u06CC\u0633\u062A \u067E\u0646\u0644\u200C\u0647\u0627\u06CC\u06CC \u06A9\u0647 \u0633\u0627\u062E\u062A\u06CC. \u0631\u0648\u06CC \u0647\u0631 \u06A9\u062F\u0648\u0645 \u0628\u0632\u0646 \u062A\u0627:
  \u2022 \u0648\u0636\u0639\u06CC\u062A \u0648 \u062F\u0627\u0645\u0646\u0647 \u0631\u0648 \u0628\u0628\u06CC\u0646\u06CC
  \u2022 <b>TCP Proxy</b> \u0628\u0633\u0627\u0632\u06CC \u06CC\u0627 \u062D\u0630\u0641 \u06A9\u0646\u06CC
  \u2022 <b>Custom Domain</b> \u0627\u0636\u0627\u0641\u0647 \u06CC\u0627 \u062D\u0630\u0641 \u06A9\u0646\u06CC
  \u2022 \u067E\u0631\u0648\u0698\u0647 \u0631\u0648 \u062D\u0630\u0641 \u06A9\u0646\u06CC

 <b>TCP Proxy</b> \u2014 \u062F\u0648 \u0631\u0627\u0648\u0634 \u0633\u0627\u062E\u062A:
  \u2022 <b>Random</b> \u2014 \u067E\u0648\u0631\u062A \u0628\u062F\u0647\u060C TCP Proxy \u0645\u06CC\u200C\u06AF\u06CC\u0631\u06CC (\u062D\u062F\u0627\u06A9\u062B\u0631 3 \u0639\u062F\u062F).
  \u2022 <b>Select</b> \u2014 \u067E\u06CC\u0634\u0648\u0646\u062F \u062F\u0627\u0645\u0646\u0647 (sakura / hayabusa / acela / alteria) \u0631\u0648 \u0627\u0646\u062A\u062E\u0627\u0628 \u06A9\u0646; \u062A\u0627 15 \u0628\u0627\u0632 \u062A\u0644\u0627\u0634 \u0645\u06CC\u200C\u0634\u0647 \u0648 \u0646\u0648\u0627\u0631 \u067E\u06CC\u0634\u0631\u0641\u062A \u0646\u0634\u0627\u0646 \u062F\u0627\u062F\u0647 \u0645\u06CC\u200C\u0634\u0647.
  \u2022 <b>List</b> \u2014 \u0644\u06CC\u0633\u062A \u067E\u0631\u0648\u06A9\u0633\u06CC\u200C\u0647\u0627 \u0648 \u062D\u0630\u0641 \u0622\u0646\u200C\u0647\u0627.

 <b>Account</b> \u2014 \u0648\u0636\u0639\u06CC\u062A Railway\u060C Cloudflare \u0648 \u062A\u0639\u062F\u0627\u062F \u067E\u0631\u0648\u0698\u0647\u200C\u0647\u0627\u062A.

<b>\u062F\u0633\u062A\u0648\u0631\u0627\u062A:</b>
/start \u2014 \u0634\u0631\u0648\u0639
/dashboard \u2014 \u0645\u0646\u0648\u06CC \u0627\u0635\u0644\u06CC
/newdeploy \u2014 \u0633\u0627\u062E\u062A \u067E\u0646\u0644 \u062C\u062F\u06CC\u062F
/projects \u2014 \u067E\u0631\u0648\u0698\u0647\u200C\u0647\u0627\u06CC \u0645\u0646
/advanced \u2014 \u062A\u0646\u0638\u06CC\u0645\u0627\u062A \u067E\u06CC\u0634\u0631\u0641\u062A\u0647
/account \u2014 \u062D\u0633\u0627\u0628 \u06A9\u0627\u0631\u0628\u0631\u06CC
/help \u2014 \u0647\u0645\u06CC\u0646 \u0631\u0627\u0647\u0646\u0645\u0627`;
  return sendText(chatId, text, kb([[btn("Dashboard", "menu")]]));
}
__name(handleHelp, "handleHelp");
async function handleDashboard(chatId, env, msgId) {
  const missing = await userIsMember(chatId, env);
  if (missing.length) {
    const text2 = `\u0628\u0631\u0627\u06CC \u0627\u0633\u062A\u0641\u0627\u062F\u0647 \u0628\u0627\u06CC\u062F \u0627\u0648\u0644 \u062F\u0631 \u0647\u0631 \u062F\u0648 \u06A9\u0627\u0646\u0627\u0644 \u0632\u06CC\u0631 \u0639\u0636\u0648 \u0628\u0634\u06CC 

\u0628\u0639\u062F \u0627\u0632 \u0639\u0636\u0648\u06CC\u062A\u060C \u062F\u06A9\u0645\u0647 Check \u0631\u0648 \u0628\u0632\u0646.`;
    const row = missing.map((ch) => urlBtn("Join @"+ ch, "https://t.me/"+ ch));
    return show(chatId, msgId, text2, kb([row, [btn("CHECK MEMBERSHIP", "join")]]));
  }
  const text = `<b>SPIDER PANEL</b>

\u0645\u0646\u0648\u06CC \u0627\u0635\u0644\u06CC:`;
  const k = kb([
    [btn("New Deployment", "newdep")],
    [btn("My Projects", "myproj")],
    [btn("Advanced", "adv")],
    [btn("Account", "acct")]
  ]);
  return show(chatId, msgId, text, k);
}
__name(handleDashboard, "handleDashboard");
function sendDashboard(chatId, env) {
  return handleDashboard(chatId, env);
}
__name(sendDashboard, "sendDashboard");
async function handleLetsGo(chatId, msgId, env) {
  const missing = await userIsMember(chatId, env);
  if (missing.length) {
    const text = `\u0628\u0631\u0627\u06CC \u0627\u0633\u062A\u0641\u0627\u062F\u0647 \u0628\u0627\u06CC\u062F \u0627\u0648\u0644 \u062F\u0631 \u0647\u0631 \u062F\u0648 \u06A9\u0627\u0646\u0627\u0644 \u0632\u06CC\u0631 \u0639\u0636\u0648 \u0628\u0634\u06CC 

\u0628\u0639\u062F \u0627\u0632 \u0639\u0636\u0648\u06CC\u062A\u060C \u062F\u06A9\u0645\u0647 Check \u0631\u0648 \u0628\u0632\u0646.`;
    const row = missing.map((ch) => urlBtn("Join @"+ ch, "https://t.me/"+ ch));
    return show(chatId, msgId, text, kb([row, [btn("CHECK MEMBERSHIP", "join")]]));
  }
  return handleJoinOk(chatId, msgId, env);
}
__name(handleLetsGo, "handleLetsGo");
async function handleJoinOk(chatId, msgId, env) {
  const u = await getUser(chatId, env);
  u.step = "await_token";
  await saveUser(u, chatId, env);
  const text = `<b>\u0639\u0636\u0648\u06CC\u062A \u062A\u0623\u06CC\u06CC\u062F \u0634\u062F!</b>

\u062D\u0627\u0644\u0627 <b>Railway API Token</b> \u062E\u0648\u062F\u062A \u0631\u0648 \u0628\u0641\u0631\u0633\u062A.
\u0627\u0632 \u0644\u06CC\u0646\u06A9 \u0632\u06CC\u0631 (\u062F\u06A9\u0645\u0647 \u0634\u06CC\u0634\u0647\u0627\u06CC) \u0645\u06CC\u062A\u0648\u0646\u06CC \u0628\u0633\u0627\u0632\u06CC\u0634:`;
  return show(chatId, msgId, text, kb([[urlBtn("GET TOKEN", "https://railway.app/account/tokens")]]));
}
__name(handleJoinOk, "handleJoinOk");
async function handleCheckJoin(chatId, msgId, env) {
  const missing = await userIsMember(chatId, env);
  if (missing.length) {
    const text = `\u0647\u0646\u0648\u0632 \u062F\u0631 \u0627\u06CC\u0646 \u06A9\u0627\u0646\u0627\u0644\u0647\u0627 \u0639\u0636\u0648 \u0646\u0634\u062F\u06CC:
${missing.map((ch) => " @"+ ch).join("\n")}

\u0628\u0639\u062F \u0627\u0632 \u0639\u0636\u0648\u06CC\u062A \u062F\u06A9\u0645\u0647 Check Membership \u0631\u0648 \u0628\u0632\u0646.`;
    const row = missing.map((ch) => urlBtn("Join @"+ ch, "https://t.me/"+ ch));
    return show(chatId, msgId, text, kb([row, [btn("CHECK MEMBERSHIP", "join")]]));
  }
  return handleJoinOk(chatId, msgId, env);
}
__name(handleCheckJoin, "handleCheckJoin");
async function handleTokenText(chatId, token, msgId, env) {
  const u = await getUser(chatId, env);
  const t = (token || "").trim();
  if (!t) return;
  if (msgId) await sendText(chatId, "\u062F\u0631 \u062D\u0627\u0644 \u0628\u0631\u0631\u0633\u06CC \u062A\u0648\u06A9\u0646", null);
  try {
    const info = await railwayValidate(t);
    u.railwayToken = await encrypt(t, env);
    u.railwayInfo = info;
    // after token: always go to region selection
    u.step = "await_region";
    await saveUser(u, chatId, env);
    const text = `<b>\u062A\u0648\u06A9\u0646 \u0645\u0639\u062A\u0628\u0631\u0647!</b> \u062E\u0648\u0634 \u0627\u0648\u0645\u062F\u06CC ${esc(info.name || "")}

\u062D\u0627\u0644\u0627 Region \u0631\u0648 \u0627\u0646\u062A\u062E\u0627\u0628 \u06A9\u0646:`;
    await sendText(chatId, text, regionKb());
  } catch (e) {
    await sendText(
      chatId,
      `<b>\u062A\u0648\u06A9\u0646 \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A.</b>
${esc(e.message)}

\u062F\u0648\u0628\u0627\u0631\u0647 \u062A\u0644\u0627\u0634 \u06A9\u0646:`,
      kb([[urlBtn("GET TOKEN", "https://railway.app/account/tokens")]])
    );
  }
}
__name(handleTokenText, "handleTokenText");
function regionKb() {
  const rows = [];
  for (let i = 0; i < REGIONS.length; i += 2) {
    rows.push(REGIONS.slice(i, i + 2).map((r) => btn(" "+ r.label, "region:"+ r.id)));
  }
  return kb(rows);
}
__name(regionKb, "regionKb");

const DEPLOY_REPOS = {
  rebecca: "https://github.com/amirh00sain/rebecca",
  spider: "https://github.com/amirh00sain/SpiderPanel",
  sanaii: "https://github.com/amirh00sain/vpn_ui_railway"
};
__name(DEPLOY_REPOS, "DEPLOY_REPOS");
function repoSlug(input) {
  if (!input) return "amirh00sain/SpiderPanel";
  const s = String(input).trim().replace(/\/+$/, "");
  const urlMatch = s.match(/github\.com\/([^/]+\/[^/]+)/i);
  if (urlMatch) return urlMatch[1].replace(/\/+$/, "");
  if (/^[\w.-]+\/[\w.-]+$/.test(s)) return s;
  return "amirh00sain/SpiderPanel";
}
__name(repoSlug, "repoSlug");
function deployRepoKb() {
  return kb([
    [btn("Rebecca", "repo:rebecca"), btn("Spider", "repo:spider")],
    [btn("Sanaii", "repo:sanaii"), btn("Custom", "repo:custom")]
  ]);
}
__name(deployRepoKb, "deployRepoKb");
async function handleRepoSelect(chatId, msgId, repoKey, env) {
  const u = await getUser(chatId, env);
  if (repoKey === "custom") {
    u.step = "await_custom_repo";
    await saveUser(u, chatId, env);
    const text = "<b>Custom Repo</b>\n\n\u0644\u06CC\u0646\u06A9 \u0631\u06CC\u067E\u0648 GitHub \u0631\u0648 \u0628\u0641\u0631\u0633\u062A (\u0645\u062B\u0644\u0627 https://github.com/owner/repo):";
    return show(chatId, msgId, text, kb([[btn("Cancel", "repocancel")]]));
  }
  const repoUrl = DEPLOY_REPOS[repoKey];
  if (!repoUrl) return;
  u.repo = repoSlug(repoUrl);
  u.deployPort = REPO_PORTS[u.repo] || "";
  await saveUser(u, chatId, env);
  // token first
  if (!u.railwayToken) {
    u.step = "await_token";
    await saveUser(u, chatId, env);
    const text2 = "<b>Railway Token</b>\n\n\u0627\u0648\u0644 Railway API Token \u062E\u0648\u062F\u062A \u0631\u0648 \u0628\u0641\u0631\u0633\u062A. \u0627\u0632 \u0644\u06CC\u0646\u06A9 \u0632\u06CC\u0631 \u0628\u0633\u0627\u0632\u0634:";
    return show(chatId, msgId, text2, kb([[urlBtn("GET TOKEN", "https://railway.app/account/tokens")]]));
  }
  // always ask region
  u.step = "await_region";
  await saveUser(u, chatId, env);
  const text = "<b>Repo:</b> "+ esc(repoNameLabel(u.repo)) + (u.deployPort ? " (port "+ u.deployPort +")" : "") +"\n\n\u062D\u0627\u0644\u0627 Region \u0631\u0648 \u0627\u0646\u062A\u062E\u0627\u0628 \u06A9\u0646:";
  return show(chatId, msgId, text, regionKb());
}
__name(handleRepoSelect, "handleRepoSelect");
async function handleCustomRepoText(chatId, text, msgId, env) {
  const u = await getUser(chatId, env);
  const t = (text || "").trim();
  if (!/^https?:\/\/github\.com\/[\w.-]+\/[\w.-]+/i.test(t)) {
    return sendText(chatId, "\u0644\u06CC\u0646\u06A9 \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A. \u0644\u06CC\u0646\u06A9 GitHub \u0628\u0641\u0631\u0633\u062A (\u0645\u062B\u0644\u0627 https://github.com/owner/repo):");
  }
  u.repo = repoSlug(t);
  u.step = "await_custom_port";
  await saveUser(u, chatId, env);
  return sendText(chatId, "<b>Repo:</b> "+ esc(repoNameLabel(u.repo)) +"\n\n \u062D\u0627\u0644\u0627 \u067E\u0648\u0631\u062A\u06CC \u06A9\u0647 \u067E\u0646\u0644 \u0631\u0648\u06CC \u0627\u0648\u0646 \u0627\u062C\u0631\u0627 \u0645\u06CC\u0634\u0647 \u0631\u0648 \u0628\u0641\u0631\u0633\u062A (\u0645\u062B\u0644\u0627 8080 \u06CC\u0627 2083):", null);
}
__name(handleCustomRepoText, "handleCustomRepoText");
async function handleCustomPortText(chatId, text, msgId, env) {
  const u = await getUser(chatId, env);
  const port = parseInt((text || "").trim(), 10);
  if (!(port >= 1 && port <= 65535)) {
    return sendText(chatId, "\u067E\u0648\u0631\u062A \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A. \u06CC\u06A9 \u0639\u062F\u062F \u0628\u06CC\u0646 1 \u062A\u0627 65535 \u0628\u0641\u0631\u0633\u062A:", null);
  }
  u.deployPort = String(port);
  u.step = "await_region";
  await saveUser(u, chatId, env);
  const text2 = "<b>Repo:</b> "+ esc(repoNameLabel(u.repo)) +" (port "+ u.deployPort +")\n\n\u062D\u0627\u0644\u0627 Region \u0631\u0648 \u0627\u0646\u062A\u062E\u0627\u0628 \u06A9\u0646:";
  return sendText(chatId, text2, regionKb());
}
__name(handleCustomPortText, "handleCustomPortText");
__name(handleCustomRepoText, "handleCustomRepoText");
async function handleRegion(chatId, msgId, regionId, env) {
  const u = await getUser(chatId, env);
  const r = REGIONS.find((x) => x.id === regionId);
  if (!r) return;
  u.region = regionId;
  u.step = "await_service_name";
  await saveUser(u, chatId, env);
  const repoLabel = u.repo ? repoNameLabel(u.repo) : "SpiderPanel";
  const text = "<b>Repo:</b> "+ esc(repoLabel) +"\n<b>Region:</b> "+ esc(r.label) +" ("+ esc(r.country) +")\n\n\u062D\u0627\u0644\u0627 \u06CC\u06A9 \u0646\u0627\u0645 \u0628\u0631\u0627\u06CC \u0633\u0631\u0648\u06CC\u0633 \u0628\u0641\u0631\u0633\u062A (\u06CC\u0627 /skip):";
  return show(chatId, msgId, text, kb([[btn("Skip", "name:auto")]]));
}
__name(handleRegion, "handleRegion");
function repoNameLabel(repo) {
  if (!repo) return "SpiderPanel";
  const parts = String(repo).trim().replace(/\/$/, "").split("/");
  return parts[parts.length - 1] || "SpiderPanel";
}
__name(repoNameLabel, "repoNameLabel");
async function handleServiceNameText(chatId, text, msgId, env) {
  const u = await getUser(chatId, env);
  u.step = "ready";
  let nameInput = (text || "").trim().replace(/^\/skip\s*/i, "").replace(/^\/name\s*/i, "");
  const clean = nameInput.replace(/[^a-zA-Z0-9-]/g, "").toLowerCase();
  if (clean.length < 3) {
    u.step = "await_service_name";
    await saveUser(u, chatId, env);
    return sendText(chatId, "\u0646\u0627\u0645 \u0646\u0627\u0645\u0639\u062A\u0628\u0631\u0647. \u062D\u062F\u0627\u0642\u0644 3 \u062D\u0631\u0641 (\u062D\u0631\u0648\u0641 \u0627\u0646\u06AF\u0644\u06CC\u0633\u06CC \u0648 \u0639\u062F\u062F). \u062F\u0648\u0628\u0627\u0631\u0647 \u0628\u0641\u0631\u0633\u062A:", null);
  }
  u.name = clean.slice(0, 24);
  await saveUser(u, chatId, env);
  const r = REGIONS.find((x) => x.id === u.region);
  const repoLabel = repoNameLabel(u.repo);
  const msg = "<b>Repo:</b> "+ esc(repoLabel) +"\n<b>Region:</b> "+ esc(r ? r.label : u.region) +"\n<b>Name:</b> <code>"+ esc(u.name) +"</code>\n\n\u0622\u0645\u0627\u062F\u0647 \u0628\u0631\u0627\u06CC deploy\u061F";
  return sendText(chatId, msg, kb([[btn("DEPLOY", "deploy")]]));
}
__name(handleServiceNameText, "handleServiceNameText");
async function handleNameAuto(chatId, msgId, env) {
  const u = await getUser(chatId, env);
  u.step = "ready";
  u.name = "panel-" + rand(4);
  await saveUser(u, chatId, env);
  const r = REGIONS.find((x) => x.id === u.region);
  const repoLabel = repoNameLabel(u.repo);
  const text = "<b>Repo:</b> "+ esc(repoLabel) +"\n<b>Region:</b> "+ esc(r ? r.label : u.region) +"\n<b>Name:</b> <code>"+ esc(u.name) +"</code>\n\n\u0622\u0645\u0627\u062F\u0647 \u0628\u0631\u0627\u06CC deploy\u061F";
  return show(chatId, msgId, text, kb([[btn("DEPLOY", "deploy")]]));
}
__name(handleNameAuto, "handleNameAuto");
async function handleNewDeploy(chatId, msgId, env) {
  const u = await getUser(chatId, env);
  if (!u.railwayToken) {
    u.step = "await_token";
    await saveUser(u, chatId, env);
    const text2 = "<b>Railway Token</b>\n\n\u0627\u0648\u0644 Railway API Token \u062E\u0648\u062F\u062A \u0631\u0648 \u0628\u0641\u0631\u0633\u062A. \u0627\u0632 \u0644\u06CC\u0646\u06A9 \u0632\u06CC\u0631 \u0628\u0633\u0627\u0632\u0634:";
    return show(chatId, msgId, text2, kb([[urlBtn("GET TOKEN", "https://railway.app/account/tokens")]]));
  }
  u.step = "await_repo";
  u.repo = null;
  await saveUser(u, chatId, env);
  return show(chatId, msgId, "<b>New Deployment</b>\n\n\u067E\u0646\u0644 \u0645\u0648\u0631\u062F \u0646\u0638\u0631 \u0631\u0648 \u0627\u0646\u062A\u062E\u0627\u0628 \u06A9\u0646:", deployRepoKb());
}
__name(handleNewDeploy, "handleNewDeploy");
async function handleMyProjects(chatId, msgId, env) {
  const u = await getUser(chatId, env);
  if (!u.projects.length) {
    const text2 = `<b>My Projects</b>

\u0647\u0646\u0648\u0632 \u067E\u0646\u0644\u06CC \u0646\u0633\u0627\u062E\u062A\u06CC.
\u0628\u0627 New Deployment \u0627\u0648\u0644\u06CC\u0646 \u067E\u0646\u0644\u062A \u0631\u0648 \u0628\u0633\u0627\u0632.`;
    return show(chatId, msgId, text2, kb([[btn("New Deployment", "newdep")], [btn("Back", "menu")]]));
  }
  const rows = u.projects.map((p) => [btn(" "+ p.name, "proj:"+ p.id)]);
  rows.push([btn("New Deployment", "newdep"), btn("Back", "menu")]);
  const text = `<b>My Projects</b>

\u06CC\u06A9\u06CC \u0627\u0632 \u067E\u0646\u0644\u0647\u0627 \u0631\u0648 \u0627\u0646\u062A\u062E\u0627\u0628 \u06A9\u0646:`;
  return show(chatId, msgId, text, kb(rows));
}
__name(handleMyProjects, "handleMyProjects");
async function githubLatestCommit(repo, branch = "main") {
  const url = `https://api.github.com/repos/${encodeURIComponent(repo.split("/")[0])}/${encodeURIComponent(repo.split("/")[1])}/commits/${encodeURIComponent(branch)}`;
  const res = await fetch(url, {
    headers: {
      "Accept": "application/vnd.github+json",
      "User-Agent": "spiderbot-railway-updater"
    }
  });
  const text = await res.text();
  let data = {};
  try { data = JSON.parse(text); } catch (e) {}
  if (!res.ok || !data.sha) {
    throw new Error(data.message || `GitHub HTTP ${res.status}`);
  }
  return data.sha;
}
__name(githubLatestCommit, "githubLatestCommit");

function updateRepoForProject(repo) {
  const normalized = repoSlug(repo);
  if (!normalized || normalized.toLowerCase() === "arvin341az-glitch/rvg") return "amirh00sain/rebecca";
  return normalized;
}
__name(updateRepoForProject, "updateRepoForProject");

async function deleteAllProjectTcpProxies(token, project) {
  const services = [{ serviceId: project.serviceId, environmentId: project.envId }];
  // Prefer the project service graph so this also cleans TCP proxies on additional services.
  try {
    const data = await railway(
      `query($id:String!){ project(id:$id){ environments { edges { node { id } } } services { edges { node { id } } } } }`,
      { id: project.id },
      token
    );
    const envIds = (data?.project?.environments?.edges || []).map((e) => e.node?.id).filter(Boolean);
    const serviceIds = (data?.project?.services?.edges || []).map((e) => e.node?.id).filter(Boolean);
    if (serviceIds.length && envIds.length) {
      services.length = 0;
      for (const serviceId of serviceIds) {
        for (const environmentId of envIds) services.push({ serviceId, environmentId });
      }
    }
  } catch (e) {
    throw new Error(`دریافت سرویس‌های Project برای حذف TCP Proxy ناموفق بود: ${e.message}`);
  }
  let removed = 0;
  for (const pair of services) {
    let proxies = [];
    try {
      const data = await railway(
        `query tcpProxies($serviceId:String!,$environmentId:String!){ tcpProxies(serviceId:$serviceId,environmentId:$environmentId){ id } }`,
        pair,
        token
      );
      proxies = data?.tcpProxies || [];
    } catch (e) {
      throw new Error(`دریافت TCP Proxy های سرویس ناموفق بود: ${e.message}`);
    }
    for (const proxy of proxies) {
      await railway(`mutation($id:String!){ tcpProxyDelete(id:$id) }`, { id: proxy.id }, token);
      removed++;
    }
  }
  return removed;
}
__name(deleteAllProjectTcpProxies, "deleteAllProjectTcpProxies");

async function pollUpdateDeployment(chatId, msgId, deploymentId, token) {
  let status = "INITIALIZING";
  for (let i = 0; i < 80; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    try {
      const data = await railway(`query($id:String!){ deployment(id:$id){ status } }`, { id: deploymentId }, token);
      status = data?.deployment?.status || status;
    } catch (e) {}
    await editMsg(chatId, msgId, deployBar(Math.min(98, 30 + Math.round(i * 68 / 80)), statusLabel(status)), null).catch(() => {});
    if (isDoneStatus(status)) break;
  }
  return status;
}
__name(pollUpdateDeployment, "pollUpdateDeployment");

async function handleProjectUpdate(chatId, msgId, pid, env) {
  if (DEPLOY_LOCKS.has(chatId)) {
    return editMsg(chatId, msgId, "یک Deploy/Update در حال انجام است. لطفاً صبر کنید.", null);
  }
  DEPLOY_LOCKS.set(chatId, Date.now());
  const u = await getUser(chatId, env);
  const p = u.projects.find((x) => x.id === pid);
  if (!p || !p.serviceId || !p.envId || !u.railwayToken) {
    DEPLOY_LOCKS.delete(chatId);
    return editMsg(chatId, msgId, "اطلاعات پروژه یا Railway Token پیدا نشد.", kb([[btn("Back", "backproj")]]));
  }
  const token = await decrypt(u.railwayToken, env);
  const repo = updateRepoForProject(p.repo || "");
  const branch = BRANCH;
  try {
    await editMsg(chatId, msgId, "<b>Project Update</b>\n\nدر حال حذف تمام TCP Proxy های پروژه...", null);
    const removed = await deleteAllProjectTcpProxies(token, p);

    await editMsg(chatId, msgId, `<b>Project Update</b>\n\n${removed} TCP Proxy حذف شد.\nدر حال اتصال سرویس به <code>${esc(repo)}</code>...`, null);
    await railway(
      `mutation($id:String!,$repo:String!){ serviceConnect(id:$id,input:{repo:$repo}){ id } }`,
      { id: p.serviceId, repo },
      token
    );

    // Rebecca listens on 8080; migration from RVG must not retain the old 8000 port.
    const targetPort = repo === "amirh00sain/rebecca" ? "8080" : (p.deployPort || REPO_PORTS[repo] || PORT);
    await railway(
      `mutation($projectId:String!,$environmentId:String!,$serviceId:String!,$value:String!){ variableUpsert(input:{projectId:$projectId,environmentId:$environmentId,serviceId:$serviceId,name:"PORT",value:$value}) }`,
      { projectId: p.id, environmentId: p.envId, serviceId: p.serviceId, value: targetPort },
      token
    );

    const sha = await githubLatestCommit(repo, branch);
    await editMsg(chatId, msgId, `<b>Project Update</b>\n\nآخرین commit دریافت شد: <code>${esc(sha.slice(0, 12))}</code>\nدر حال Deploy...`, null);
    const dep = await railway(
      `mutation($sid:String!,$eid:String!,$commitSha:String!){ serviceInstanceDeployV2(serviceId:$sid,environmentId:$eid,commitSha:$commitSha) }`,
      { sid: p.serviceId, eid: p.envId, commitSha: sha },
      token
    );
    const deploymentId = dep?.serviceInstanceDeployV2;
    if (!deploymentId) throw new Error("Railway deployment id دریافت نشد.");
    const status = await pollUpdateDeployment(chatId, msgId, deploymentId, token);
    if (status !== "SUCCESS") throw new Error(`Deploy ناموفق: ${status}`);

    p.repo = repo;
    p.deployPort = targetPort;
    p.updatedAt = Date.now();
    delete p.failed;
    await saveUser(u, chatId, env);
    await editMsg(
      chatId,
      msgId,
      `<b>Update با موفقیت انجام شد.</b>\n\nRepo: <code>${esc(repo)}</code>\nCommit: <code>${esc(sha.slice(0, 12))}</code>\nTCP Proxy های قبلی: ${removed} عدد (همه حذف شدند)\nPort: <code>${targetPort}</code>`,
      kb([[btn("Open Project", "proj:"+ p.id)], [btn("Dashboard", "menu")]])
    );
  } catch (e) {
    await editMsg(
      chatId,
      msgId,
      `<b>Update ناموفق بود.</b>\n\n<code>${esc(e.message)}</code>`,
      kb([[btn("Retry", "updateproj:"+ p.id)], [btn("Back", "proj:"+ p.id)]])
    );
  } finally {
    DEPLOY_LOCKS.delete(chatId);
  }
}
__name(handleProjectUpdate, "handleProjectUpdate");

async function handleProjectDetail(chatId, msgId, pid, env) {
  const u = await getUser(chatId, env);
  const p = u.projects.find((x) => x.id === pid);
  if (!p) return;
  u.sel = pid;
  await saveUser(u, chatId, env);
  const token = await decrypt(u.railwayToken, env);
  let text = `<b>${esc(p.name)}</b>

 Loading`;
  await editMsg(chatId, msgId, text, null);
  try {
    const inst = await railway(
      `query { serviceInstance(serviceId:${q(p.serviceId)}, environmentId:${q(p.envId)}) { region serviceName latestDeployment { id status } domains { serviceDomains { id domain targetPort } customDomains { id domain } } } }`,
      {},
      token
    );
    const si = inst.serviceInstance;
    const status = si.latestDeployment?.status || "\u2014";
    const sLabel = statusLabel(status);
    const dot = status === "SUCCESS"? "": status === "FAILED"|| status === "CRASHED"? "": "";
    const railDomains = (si.domains?.serviceDomains || []).map((d) => d.domain);
    const customDomains = (si.domains?.customDomains || []).map((d) => d.domain);
    const domain = p.domain || railDomains[0] || "\u2014";
    const region = p.region || si.region || "\u2014";
    let down = 0, up = 0;
    try {
      const usage = await railway(
        `query { usage(projectId:${q(pid)}, measurements:[NETWORK_RX_GB, NETWORK_TX_GB], groupBy:[SERVICE_ID]) { measurement value tags { serviceId } } }`,
        {},
        token
      );
      for (const m of usage.usage) {
        if (m.tags?.serviceId !== p.serviceId) continue;
        if (m.measurement === "NETWORK_RX_GB") down = m.value;
        if (m.measurement === "NETWORK_TX_GB") up = m.value;
      }
    } catch (e) {
    }
    let tcpLines = "";
    let tcpList = [];
    try {
      const tcp = await railway(
        `query { tcpProxies(serviceId:${q(p.serviceId)}, environmentId:${q(p.envId)}) { id domain proxyPort applicationPort } }`,
        {},
        token
      );
      tcpList = tcp.tcpProxies || [];
      if (tcpList.length) {
        tcpLines = "\n\n <b>TCP Proxies:</b>\n"+ tcpList.map((t) => `<code>${esc(t.domain)}</code>:${t.proxyPort}  ${t.applicationPort}`).join("\n");
      }
    } catch (e) {
    }
    const cdLine = customDomains.length ? "\n\n <b>Custom Domain:</b> <code>"+ esc(customDomains[0]) + "</code>": "";
    text = `<b>${esc(p.name)}</b>

 <b>Region:</b> <code>${esc(region)}</code>
 <b>Status:</b> ${dot} ${esc(sLabel)}
 <b>Domain:</b> <code>${esc(domain)}</code>
 <b>Download:</b> ${fmtGb(down)}
 <b>Upload:</b> ${fmtGb(up)}` + cdLine + tcpLines;
    const rows = [
      [btn("TCP Proxy", "tcp:"+ p.id)],
      [btn("Update", "updateproj:"+ p.id)],
      [btn("Custom Domain", "cd")],
    ];
    if (customDomains.length) rows.push([btn("Remove Custom Domain", "cdrem:"+ p.id)]);
    rows.push([btn("Delete", "del:"+ p.id)], [btn("Back", "backproj")]);
    return editMsg(chatId, msgId, text, kb(rows));
  } catch (e) {
    text = `<b>${esc(p.name)}</b>

 \u062E\u0637\u0627 \u062F\u0631 \u062F\u0631\u06CC\u0627\u0641\u062A \u0627\u0637\u0644\u0627\u0639\u0627\u062A:
${esc(e.message)}`;
    return editMsg(chatId, msgId, text, kb([[btn("Delete", "del:"+ p.id)], [btn("Back", "backproj")]]));
  }
}
__name(handleProjectDetail, "handleProjectDetail");
function tcpBar(n) {
  return "\u2588".repeat(n) + "\u2591".repeat(10 - n);
}
__name(tcpBar, "tcpBar");
async function tcpListAll(u, p, env) {
  const token = await decrypt(u.railwayToken, env);
  const tcp = await railway(
    `query tcpProxies($serviceId:String!,$environmentId:String!){ tcpProxies(serviceId:$serviceId,environmentId:$environmentId) { id domain proxyPort applicationPort serviceId environmentId } }`,
    { serviceId: p.serviceId, environmentId: p.envId },
    token
  );
  return tcp?.tcpProxies || [];
}
__name(tcpListAll, "tcpListAll");
async function handleTcpMenu(chatId, msgId, pid, env) {
  const u = await getUser(chatId, env);
  const p = u.projects.find((x) => x.id === pid);
  if (!p) return;
  u.sel = pid;
  await saveUser(u, chatId, env);
  let list;
  try {
    list = await tcpListAll(u, p, env);
  } catch (e) {
    return show(chatId, msgId, `<b>TCP Proxy</b>\n\nخطا در دریافت لیست: <code>${esc(e.message)}</code>`, kb([[btn("Retry", "tcp:"+ p.id)], [btn("Back", "backproj")]]));
  }
  const text = "<b>TCP Proxy</b> ("+ list.length +"/3)\n\nRandom \u2014 \u067E\u0648\u0631\u062A \u0628\u062F\u0647\u060C \u067E\u0631\u0648\u06A9\u0633\u06CC \u0628\u0633\u0627\u0632.\nSelect \u2014 \u067E\u06CC\u0634\u0648\u0646\u062F \u062F\u0627\u0645\u0646\u0647 \u0631\u0648 \u0627\u0646\u062A\u062E\u0627\u0628 \u06A9\u0646 (sakura / hayabusa / acela / alteria).\nList \u2014 \u0644\u06CC\u0633\u062A \u0648 \u062D\u0630\u0641 \u067E\u0631\u0648\u06A9\u0633\u06CC\u0647\u0627.";
  return show(chatId, msgId, text, kb([
    [btn("Random", "tcpnew")],
    [btn("Select", "tcpselect:"+ pid)],
    [btn("List", "tcplist:"+ pid)],
    [btn("Back", "backproj")]
  ]));
}
__name(handleTcpMenu, "handleTcpMenu");
async function handleTcpList(chatId, msgId, pid, env) {
  const u = await getUser(chatId, env);
  const p = u.projects.find((x) => x.id === pid);
  if (!p) return;
  let list;
  try {
    list = await tcpListAll(u, p, env);
  } catch (e) {
    return show(chatId, msgId, `<b>TCP Proxies</b>\n\nخطا در دریافت لیست: <code>${esc(e.message)}</code>`, kb([[btn("Retry", "tcplist:"+ p.id)], [btn("Back", "tcp:"+ p.id)]]));
  }
  if (!list.length) {
    return show(chatId, msgId, "<b>TCP Proxies</b> (0/3)\n\n\u0647\u0646\u0648\u0632 \u067E\u0631\u0648\u06A9\u0633\u06CC\u0627\u06CC \u0633\u0627\u062E\u062A\u0647 \u0646\u0634\u062F\u0647.", kb([
      [btn("Random", "tcpnew")],
      [btn("Select", "tcpselect:"+ pid)],
      [btn("Back", "tcp:"+ pid)]
    ]));
  }
  const rows = list.map((t) => [btn(t.domain +":" + t.proxyPort + " > " + t.applicationPort, "tcpsel:"+ pid +":"+ t.id)]);
  rows.push([btn("Back", "tcp:"+ pid)]);
  const text = "<b>TCP Proxies</b> ("+ list.length +"/3)\n\n"+ list.map((t) => t.domain +":"+ t.proxyPort +" > "+ t.applicationPort).join("\n");
  return show(chatId, msgId, text, kb(rows));
}
__name(handleTcpList, "handleTcpList");
async function handleTcpNew(chatId, msgId, env) {
  const u = await getUser(chatId, env);
  const p = u.projects.find((x) => x.id === u.sel);
  if (!p) return;
  const list = await tcpListAll(u, p, env);
  if (list.length >= 3) {
    return show(chatId, msgId, "<b>TCP Proxy</b>\n\n\u062D\u062F\u0627\u06A9\u062B\u0631 3 \u067E\u0631\u0648\u06A9\u0633\u06CC \u0645\u062C\u0627\u0632 \u0627\u0633\u062A. \u0627\u0648\u0644 \u0627\u0632 List \u06CC\u06A9\u06CC \u0631\u0648 \u062D\u0630\u0641 \u06A9\u0646.", kb([[btn("List", "tcplist:"+ p.id)], [btn("Back", "tcp:"+ p.id)]]));
  }
  u.step = "await_tcp_port";
  await saveUser(u, chatId, env);
  const text = "<b>Random TCP Proxy</b>\n\n\u067E\u0648\u0631\u062A \u062F\u0627\u062E\u0644\u06CC \u0633\u0631\u0648\u06CC\u0633 \u0631\u0648 \u0628\u0641\u0631\u0633\u062A (\u0645\u062B\u0644\u0627 8080):";
  return show(chatId, msgId, text, kb([[btn("Cancel", "tcp:"+ p.id)]]));
}
__name(handleTcpNew, "handleTcpNew");
async function handleTcpPort(chatId, text, env) {
  const u = await getUser(chatId, env);
  const pid = u.sel;
  const p = u.projects.find((x) => x.id === pid);
  if (!p) {
    u.step = "ready";
    await saveUser(u, chatId, env);
    return;
  }
  const port = parseInt((text || "").trim(), 10);
  if (!(port >= 1 && port <= 65535)) {
    return sendText(chatId, "\u067E\u0648\u0631\u062A \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A. \u06CC\u06A9 \u0639\u062F\u062F \u0628\u06CC\u0646 1 \u062A\u0627 65535 \u0628\u0641\u0631\u0633\u062A:");
  }
  const token = await decrypt(u.railwayToken, env);
  const jobMsg = await sendText(chatId, "\u062F\u0631 \u062D\u0627\u0644 \u0633\u0627\u062E\u062A TCP Proxy...");
  try {
    const create = await railway(
      `mutation { tcpProxyCreate(input:{ serviceId:${q(p.serviceId)}, environmentId:${q(p.envId)}, applicationPort:${port} }) { id domain proxyPort applicationPort } }`,
      {},
      token
    );
    const t = create.tcpProxyCreate;
    u.step = "ready";
    await saveUser(u, chatId, env);
    await editMsg(
      chatId,
      jobMsg.result.message_id,
      "<b>TCP Proxy Created</b>\n\nDomain: <code>"+ esc(t.domain) +"</code>\nProxy Port: <code>"+ t.proxyPort +"</code>\nInternal Port: <code>"+ t.applicationPort +"</code>",
      kb([[btn("List", "tcplist:"+ pid)], [btn("Back", "tcp:"+ pid)]])
    );
  } catch (e) {
    u.step = "ready";
    await saveUser(u, chatId, env);
    await editMsg(
      chatId,
      jobMsg.result.message_id,
      "<b>TCP Proxy Failed</b>\n"+ esc(e.message),
      kb([[btn("Retry", "tcpnew"), btn("Back", "tcp:"+ pid)]])
    );
  }
}
__name(handleTcpPort, "handleTcpPort");
const TCP_PREFIXES = ["sakura", "hayabusa", "acela", "alteria"];
__name(TCP_PREFIXES, "TCP_PREFIXES");
async function handleTcpSelect(chatId, msgId, pid, env) {
  const u = await getUser(chatId, env);
  const p = u.projects.find((x) => x.id === pid);
  if (!p) return;
  u.sel = pid;
  await saveUser(u, chatId, env);
  const list = await tcpListAll(u, p, env);
  if (list.length >= 3) {
    return show(chatId, msgId, "<b>TCP Proxy</b>\n\n\u062D\u062F\u0627\u06A9\u062B\u0631 3 \u067E\u0631\u0648\u06A9\u0633\u06CC \u0645\u062C\u0627\u0632 \u0627\u0633\u062A. \u0627\u0648\u0644 \u0627\u0632 List \u06CC\u06A9\u06CC \u0631\u0648 \u062D\u0630\u0641 \u06A9\u0646.", kb([[btn("List", "tcplist:"+ pid)], [btn("Back", "tcp:"+ pid)]]));
  }
  const rows = TCP_PREFIXES.map((pfx) => [btn(pfx, "tcpselprefix:"+ pid +":"+ pfx)]);
  rows.push([btn("Back", "tcp:"+ pid)]);
  return show(chatId, msgId, "<b>Select TCP Proxy</b>\n\n\u067E\u06CC\u0634\u0648\u0646\u062F \u062F\u0627\u0645\u0646\u0647 \u0631\u0648 \u0627\u0646\u062A\u062E\u0627\u0628 \u06A9\u0646. \u062A\u0627 15 \u0628\u0627\u0631 \u062A\u0644\u0627\u0634 \u0645\u06CC\u0634\u0647:", kb(rows));
}
__name(handleTcpSelect, "handleTcpSelect");
async function handleTcpSelectPrefix(chatId, msgId, key, env) {
  const parts = String(key || "").split(":");
  const pid = parts[0];
  const prefix = (parts[1] || "").toLowerCase();
  const u = await getUser(chatId, env);
  const p = u.projects.find((x) => x.id === pid);
  if (!p || !TCP_PREFIXES.includes(prefix)) return;
  u.sel = pid;
  u.tcpPrefix = prefix;
  u.step = "await_tcp_select_port";
  await saveUser(u, chatId, env);
  const text = "<b>Select TCP Proxy</b> \u2014 "+ esc(prefix) +"\n\n\u067E\u0648\u0631\u062A \u0627\u0644\u0627\u0645 \u067C\u0631\u0627\u0646\u0633\u06CC (application) \u0631\u0648 \u0628\u0641\u0631\u0633\u062A (\u06F1-\u06F6\u06F5\u06F5\u06F3\u06F5):";
  return show(chatId, msgId, text, kb([[btn("Cancel", "tcp:"+ pid)]]));
}
__name(handleTcpSelectPrefix, "handleTcpSelectPrefix");
async function handleTcpSelectPort(chatId, text, msgId, env) {
  const u = await getUser(chatId, env);
  const pid = u.sel;
  const prefix = u.tcpPrefix || "";
  const p = u.projects.find((x) => x.id === pid);
  if (!p || !TCP_PREFIXES.includes(prefix)) {
    u.step = "ready";
    await saveUser(u, chatId, env);
    return;
  }
  const port = parseInt((text || "").trim(), 10);
  if (!(port >= 1 && port <= 65535)) {
    return sendText(chatId, "\u067E\u0648\u0631\u062A \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A. \u06CC\u06A9 \u0639\u062F\u062F \u0628\u06CC\u0646 1 \u062A\u0627 65535 \u0628\u0641\u0631\u0633\u062A:");
  }
  u.step = "ready";
  delete u.tcpPrefix;
  await saveUser(u, chatId, env);
  const token = await decrypt(u.railwayToken, env);
  const prog = await sendText(chatId, "<b>Select TCP Proxy</b> \u2014 "+ esc(prefix) +"\n\n\u0634\u0631\u0648\u0639 \u0633\u0627\u062E\u062A...");
  const pmsgId = (prog && prog.result && prog.result.message_id) || msgId;
  for (let attempt = 1; attempt <= 15; attempt++) {
    const filled = Math.min(10, Math.round((attempt / 15) * 10));
    const bar = "<code>"+ tcpBar(filled) +"</code> "+ attempt +"/15";
    let t = null;
    try {
      const create = await railway(
        `mutation { tcpProxyCreate(input:{ serviceId:${q(p.serviceId)}, environmentId:${q(p.envId)}, applicationPort:${port} }) { id domain proxyPort applicationPort } }`,
        {},
        token
      );
      t = create.tcpProxyCreate;
    } catch (e) {
      t = null;
    }
    if (t && (t.domain || "").toLowerCase().startsWith(prefix)) {
      await editMsg(
        chatId,
        pmsgId,
        "<b>TCP Proxy Created</b>\n\nDomain: <code>"+ esc(t.domain) +"</code>\nProxy Port: <code>"+ t.proxyPort +"</code>\nInternal Port: <code>"+ t.applicationPort +"</code>",
        kb([[btn("List", "tcplist:"+ pid)], [btn("Back", "tcp:"+ pid)]])
      ).catch(() => {});
      return;
    }
    if (t) {
      await editMsg(
        chatId,
        pmsgId,
        "<b>Select TCP Proxy</b> \u2014 "+ esc(prefix) +"\n\n\u062A\u0644\u0627\u0634 "+ attempt +":\nDomain: <code>"+ esc(t.domain) +"</code>\nProxy Port: <code>"+ t.proxyPort +"</code>\n\n\u067E\u06CC\u0634\u0648\u0646\u062F \u0645\u0637\u0627\u0628\u0642\u062A \u0646\u062F\u0627\u0634\u062A\u060C \u062D\u0630\u0641 \u0648 \u062F\u0648\u0628\u0627\u0631\u0647 \u0628\u0633\u0627\u0632...\n"+ bar,
        null
      ).catch(() => {});
      try {
        await railway(`mutation { tcpProxyDelete(id:${q(t.id)}) }`, {}, token);
      } catch (e) {}
    } else {
      await editMsg(
        chatId,
        pmsgId,
        "<b>Select TCP Proxy</b> \u2014 "+ esc(prefix) +"\n\n\u062A\u0644\u0627\u0634 "+ attempt +": \u062E\u0637\u0627 \u062F\u0631 \u0633\u0627\u062E\u062A\u060C \u062F\u0648\u0628\u0627\u0631\u0647 \u062A\u0644\u0627\u0634...\n"+ bar,
        null
      ).catch(() => {});
    }
    if (attempt < 15) await new Promise((r) => setTimeout(r, 2000));
  }
  await editMsg(
    chatId,
    pmsgId,
    "<b>Not Found</b>\n\n\u067E\u06CC\u0634\u0648\u0646\u062F " + esc(prefix) + " \u0628\u0639\u062F \u0627\u0632 15 \u062A\u0644\u0627\u0634 \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F.",
    kb([[btn("Retry", "tcpselect:"+ pid), btn("Cancel", "tcp:"+ pid)]])
  ).catch(() => {});
}
__name(handleTcpSelectPort, "handleTcpSelectPort");
async function handleTcpDetail(chatId, msgId, key, env) {
  const parts = String(key || "").split(":");
  const pid = parts[0];
  const tcpId = parts[1];
  const u = await getUser(chatId, env);
  const p = u.projects.find((x) => x.id === pid);
  if (!p) return;
  const list = await tcpListAll(u, p, env);
  const t = list.find((x) => x.id === tcpId);
  if (!t) {
    return show(chatId, msgId, "TCP Proxy \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F.", kb([[btn("Back", "tcplist:"+ pid)]]));
  }
  const text = "<b>TCP Proxy</b>\n\nDomain: <code>"+ esc(t.domain) +"</code>\nProxy Port: <code>"+ t.proxyPort +"</code>\nInternal Port: <code>"+ t.applicationPort +"</code>";
  return show(chatId, msgId, text, kb([
    [btn("Change", "tcpchg:"+ pid +":"+ tcpId)],
    [btn("Delete", "tcpdel:"+ pid +":"+ tcpId)],
    [btn("Back", "tcplist:"+ pid)]
  ]));
}
__name(handleTcpDetail, "handleTcpDetail");
async function handleTcpChange(chatId, msgId, key, env) {
  const parts = String(key || "").split(":");
  const pid = parts[0];
  const tcpId = parts[1];
  const u = await getUser(chatId, env);
  const p = u.projects.find((x) => x.id === pid);
  if (!p) return;
  const token = await decrypt(u.railwayToken, env);
  try {
    await railway(`mutation { tcpProxyDelete(id:${q(tcpId)}) }`, {}, token);
  } catch (e) {}
  u.step = "await_tcp_port";
  await saveUser(u, chatId, env);
  const text = "<b>Change TCP Proxy</b>\n\n\u067E\u0631\u0648\u06A9\u0633\u06CC \u0642\u0628\u0644\u06CC \u062D\u0630\u0641 \u0634\u062F. \u067E\u0648\u0631\u062A \u062C\u062F\u06CC\u062F \u0631\u0648 \u0628\u0641\u0631\u0633\u062A (\u0645\u062B\u0644\u0627 8080):";
  return show(chatId, msgId, text, kb([[btn("Cancel", "tcp:"+ pid)]]));
}
__name(handleTcpChange, "handleTcpChange");
async function handleTcpDelete(chatId, msgId, key, env) {
  const parts = String(key || "").split(":");
  const pid = parts[0];
  const tcpId = parts[1];
  const u = await getUser(chatId, env);
  const p = u.projects.find((x) => x.id === pid);
  if (!p) return;
  const token = await decrypt(u.railwayToken, env);
  try {
    await railway(`mutation { tcpProxyDelete(id:${q(tcpId)}) }`, {}, token);
    return show(chatId, msgId, "<b>TCP Proxy Deleted</b>", kb([[btn("List", "tcplist:"+ pid)], [btn("Back", "tcp:"+ pid)]]));
  } catch (e) {
    return show(chatId, msgId, esc(e.message), kb([[btn("Back", "tcplist:"+ pid)]]));
  }
}
__name(handleTcpDelete, "handleTcpDelete");
async function handleDel(chatId, msgId, pid, env) {
  const u = await getUser(chatId, env);
  const p = u.projects.find((x) => x.id === pid);
  if (!p) return;
  const text = `<b>Delete ${esc(p.name)}?</b>

\u0633\u0631\u0648\u06CC\u0633 \u0648 \u067E\u0631\u0648\u0698\u0647 \u0631\u0648\u06CC Railway \u062D\u0630\u0641 \u0645\u06CC\u0634\u0647. \u0645\u0637\u0645\u0626\u0646\u06CC\u061F`;
  return editMsg(chatId, msgId, text, kb([
    [btn("\u0628\u0644\u0647\u060C \u062D\u0630\u0641 \u06A9\u0646", "delok:"+ pid)],
    [btn("Cancel", "backproj")]
  ]));
}
__name(handleDel, "handleDel");
async function handleDelOk(chatId, msgId, pid, env) {
  const u = await getUser(chatId, env);
  const p = u.projects.find((x) => x.id === pid);
  if (!p) return;
  const token = await decrypt(u.railwayToken, env);
  await editMsg(chatId, msgId, " \u062F\u0631 \u062D\u0627\u0644 \u062D\u0630\u0641", null);
  try {
    try {
      await railway(`mutation { serviceDelete(environmentId:${q(p.envId)}, id:${q(p.serviceId)}) }`, {}, token);
    } catch (e) {
    }
    try {
      await railway(`mutation { projectDelete(id:${q(pid)}) }`, {}, token);
    } catch (e) {
    }
    u.projects = u.projects.filter((x) => x.id !== pid);
    await saveUser(u, chatId, env);
    await editMsg(
      chatId,
      msgId,
      `<b>${esc(p.name)} deleted.</b>`,
      kb([[btn("Dashboard", "menu")]])
    );
  } catch (e) {
    await editMsg(chatId, msgId, " "+ esc(e.message), kb([[btn("Back", "backproj")]]));
  }
}
__name(handleDelOk, "handleDelOk");
async function handleAdvanced(chatId, msgId, env) {
  const u = await getUser(chatId, env);
  const hasCf = !!u.cfToken;
  const rows = [];
  rows.push([btn(hasCf ? " Cloudflare Account": " Setup Cloudflare", hasCf ? "cfacc": "cfsetup")]);
  rows.push([btn("Custom Domain", "cd")]);
  rows.push([btn("Back", "menu")]);
  const text = `<b>Advanced</b>

`;
  return show(chatId, msgId, text, kb(rows));
}
__name(handleAdvanced, "handleAdvanced");
async function handleCfSetup(chatId, msgId, env) {
  const u = await getUser(chatId, env);
  u.step = "await_cf_token";
  u.cfMode = "setup";
  await saveUser(u, chatId, env);
  const text = `<b>Setup Cloudflare</b>

\u06CC\u06A9 <b>API Token</b> \u0628\u0627 \u062F\u0633\u062A\u0631\u0633\u06CC\u0647\u0627\u06CC \u0644\u0627\u0632\u0645 \u0628\u0633\u0627\u0632 \u0648 \u0628\u0641\u0631\u0633\u062A.
\u0627\u0632 \u062F\u06A9\u0645\u0647 \u0634\u06CC\u0634\u0647\u0627\u06CC \u0632\u06CC\u0631 \u0628\u0627 \u0647\u0645\u0647 permission \u0647\u0627 \u0633\u0627\u062E\u062A\u0647 \u0645\u06CC\u0634\u0647:`;
  return editMsg(chatId, msgId, text, kb([[urlBtn("GET CLOUDFLARE TOKEN", CF_TOKEN_URL)]]));
}
__name(handleCfSetup, "handleCfSetup");
async function handleCfToken(chatId, token, env) {
  const u = await getUser(chatId, env);
  const t = (token || "").trim();
  if (!t) return;
  await sendText(chatId, " \u062F\u0631 \u062D\u0627\u0644 \u0628\u0631\u0631\u0633\u06CC \u062A\u0648\u06A9\u0646 \u06A9\u0644\u0627\u062F\u0641\u0644\u0631", null);
  try {
    const verify = await cf("/user/tokens/verify", t);
    const email = verify.json?.result?.id ? "token ok": "";
    const zones = await cf("/zones?per_page=50", t);
    u.cfToken = await encrypt(t, env);
    u.cfInfo = { email, zoneCount: zones.json.result.length };
    u.step = "ready";
    u.cfMode = null;
    await saveUser(u, chatId, env);
    await sendText(
      chatId,
      `<b>Cloudflare connected!</b>

 <b>Zones:</b> ${zones.json.result.length}
\u062D\u0627\u0644\u0627 \u0645\u06CC\u062A\u0648\u0646\u06CC Custom Domain \u0627\u0636\u0627\u0641\u0647 \u06A9\u0646\u06CC.`,
      kb([[btn("Custom Domain", "cd")], [btn("Cloudflare Account", "cfacc")], [btn("Dashboard", "menu")]])
    );
  } catch (e) {
    await sendText(
      chatId,
      `<b>\u062A\u0648\u06A9\u0646 \u06A9\u0644\u0627\u062F\u0641\u0644\u0631 \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A.</b>
${esc(e.message)}

\u062F\u0648\u0628\u0627\u0631\u0647 \u062A\u0644\u0627\u0634 \u06A9\u0646:`,
      kb([[urlBtn("GET CLOUDFLARE TOKEN", CF_TOKEN_URL)]])
    );
  }
}
__name(handleCfToken, "handleCfToken");
async function handleCfAccount(chatId, msgId, env) {
  const u = await getUser(chatId, env);
  if (!u.cfToken) return handleAdvanced(chatId, msgId, env);
  const token = await decrypt(u.cfToken, env);
  let zoneCount = "\u2014";
  try {
    const zones = await cf("/zones?per_page=50", token);
    zoneCount = String(zones.json.result.length);
  } catch (e) {
  }
  const text = `<b>Cloudflare Account</b>

 <b>Token:</b> <code>${maskToken(token)}</code>
 <b>Zones:</b> ${zoneCount}
 <b>Status:</b> Connected `;
  return editMsg(chatId, msgId, text, kb([
    [btn("Replace Token", "cfrep")],
    [btn("Check Usage", "cfusage")],
    [btn("Remove Token", "cfrem")],
    [btn("Back", "adv")]
  ]));
}
__name(handleCfAccount, "handleCfAccount");
async function handleCfReplace(chatId, msgId, env) {
  const u = await getUser(chatId, env);
  u.step = "await_cf_token";
  u.cfMode = "replace";
  await saveUser(u, chatId, env);
  return editMsg(chatId, msgId, " \u062A\u0648\u06A9\u0646 \u062C\u062F\u06CC\u062F \u06A9\u0644\u0627\u062F\u0641\u0644\u0631 \u0631\u0648 \u0628\u0641\u0631\u0633\u062A:", kb([[urlBtn("GET CLOUDFLARE TOKEN", CF_TOKEN_URL)]]));
}
__name(handleCfReplace, "handleCfReplace");
async function handleCfRemove(chatId, msgId, env) {
  const u = await getUser(chatId, env);
  u.cfToken = null;
  u.cfInfo = null;
  await saveUser(u, chatId, env);
  return editMsg(chatId, msgId, " <b>Cloudflare token removed.</b>", kb([[btn("Advanced", "adv")]]));
}
__name(handleCfRemove, "handleCfRemove");
async function handleCfUsage(chatId, msgId, env) {
  const u = await getUser(chatId, env);
  if (!u.cfToken) return handleAdvanced(chatId, msgId, env);
  const token = await decrypt(u.cfToken, env);
  let lines = "";
  try {
    const zones = await cf("/zones?per_page=50", token);
    const z = zones.json.result;
    lines += `<b>Zones:</b> ${z.length}
`;
    const headers = zones.headers;
    const rl = headers?.get("ratelimit-remaining");
    const rll = headers?.get("ratelimit-limit");
    if (rl) lines += `<b>Requests remaining:</b> ${rl} / ${rll || "?"}
`;
    lines += `
Zones:
` + z.slice(0, 10).map((x) => `<code>${esc(x.name)}</code>`).join("\n");
  } catch (e) {
    lines = " "+ esc(e.message);
  }
  return editMsg(chatId, msgId, `<b>Cloudflare Usage</b>

${lines}`, kb([[btn("Back", "cfacc")]]));
}
__name(handleCfUsage, "handleCfUsage");
async function handleCustomDomain(chatId, msgId, env) {
  const u = await getUser(chatId, env);
  if (!u.cfToken) {
    const text = `<b>Custom Domain</b>

\u0627\u0648\u0644 \u0628\u0627\u06CC\u062F Cloudflare setup \u0628\u0634\u0647.`;
    return editMsg(chatId, msgId, text, kb([[btn("Setup Cloudflare", "cfsetup")], [btn("Back", "adv")]]));
  }
  const token = await decrypt(u.cfToken, env);
  await editMsg(chatId, msgId, " \u0644\u06CC\u0633\u062A \u062F\u0627\u0645\u0646\u0647\u0647\u0627\u06CC \u06A9\u0644\u0627\u062F\u0641\u0644\u0631", null);
  try {
    const zones = await cf("/zones?per_page=50", token);
    const z = zones.json.result;
    if (!z.length) {
      return editMsg(
        chatId,
        msgId,
        "\u0647\u06CC\u0686 \u0632\u0648\u0646\u06CC \u062F\u0631 \u06A9\u0644\u0627\u062F\u0641\u0644\u0631 \u0646\u062F\u0627\u0631\u06CC. \u0627\u0648\u0644 \u062F\u0627\u0645\u0646\u0647 \u0627\u0636\u0627\u0641\u0647 \u06A9\u0646.",
        kb([[btn("Back", "adv")]])
      );
    }
    const rows = z.map((x) => [btn(" "+ x.name, "cdzone:"+ x.id)]);
    rows.push([btn("Back", "adv")]);
    const text = `<b>Custom Domain</b>

\u062F\u0627\u0645\u0646\u0647 \u0631\u0648 \u0627\u0646\u062A\u062E\u0627\u0628 \u06A9\u0646:`;
    return editMsg(chatId, msgId, text, kb(rows));
  } catch (e) {
    return editMsg(chatId, msgId, " "+ esc(e.message), kb([[btn("Back", "adv")]]));
  }
}
__name(handleCustomDomain, "handleCustomDomain");
async function handleCdZone(chatId, msgId, zoneId, env) {
  const u = await getUser(chatId, env);
  if (!u.cfToken) return;
  const token = await decrypt(u.cfToken, env);
  try {
    const zones = await cf("/zones?per_page=50", token);
    const z = zones.json.result.find((x) => x.id === zoneId);
    if (!z) return;
    const sub = "panel-"+ rand(3) + "."+ z.name;
    u.cd = { zoneId, zoneName: z.name, sub };
    await saveUser(u, chatId, env);
    if (!u.projects.length) {
      return editMsg(
        chatId,
        msgId,
        "\u0647\u0646\u0648\u0632 \u067E\u0646\u0644\u06CC \u0646\u062F\u0627\u0631\u06CC. \u0627\u0648\u0644 \u06CC\u0647 \u067E\u0646\u0644 \u0628\u0633\u0627\u0632.",
        kb([[btn("Dashboard", "menu")]])
      );
    }
    const rows = u.projects.map((p) => [btn(" "+ p.name, "cdproj:"+ p.id)]);
    rows.push([btn("Back", "cd")]);
    const text = `<b>Custom Domain</b>

 \u0633\u0627\u0628\u062F\u0627\u0645\u0646\u0647 \u0633\u0627\u062E\u062A\u0647\u0634\u062F\u0647: <code>${esc(sub)}</code>

\u067E\u0646\u0644\u06CC \u06A9\u0647 \u0645\u06CC\u062E\u0648\u0627\u06CC \u0627\u06CC\u0646 \u062F\u0627\u0645\u0646\u0647 \u0631\u0648\u0634 \u0627\u0636\u0627\u0641\u0647 \u0628\u0634\u0647 \u0631\u0648 \u0627\u0646\u062A\u062E\u0627\u0628 \u06A9\u0646:`;
    return editMsg(chatId, msgId, text, kb(rows));
  } catch (e) {
    return editMsg(chatId, msgId, " "+ esc(e.message), kb([[btn("Back", "adv")]]));
  }
}
__name(handleCdZone, "handleCdZone");
async function handleCdProject(chatId, msgId, pid, env) {
  const u = await getUser(chatId, env);
  const p = u.projects.find((x) => x.id === pid);
  if (!p || !u.cd) return;
  const token = await decrypt(u.railwayToken, env);
  const cfTok = await decrypt(u.cfToken, env);
  const sub = u.cd.sub;
  await editMsg(chatId, msgId, " \u062F\u0631 \u062D\u0627\u0644 \u0627\u0641\u0632\u0648\u062F\u0646 Custom Domain", null);
  try {
    const inst = await railway(
      `query { serviceInstance(serviceId:${q(p.serviceId)}, environmentId:${q(p.envId)}) { domains { customDomains { id domain } } } }`,
      {},
      token
    );
    const existing = inst.serviceInstance.domains.customDomains;
    for (const cd of existing) {
      await railway(`mutation { customDomainDelete(id:${q(cd.id)}) }`, {}, token).catch(() => {
      });
    }
    await new Promise((r) => setTimeout(r, 2e3));
    const created = await railway(
      `mutation { customDomainCreate(input:{ projectId:${q(pid)}, environmentId:${q(p.envId)}, serviceId:${q(p.serviceId)}, domain:${q(sub)} }) { id domain status { verified dnsRecords { hostlabel requiredValue recordType fqdn zone } verificationDnsHost verificationToken } } }`,
      {},
      token
    );
    const cdom = created.customDomainCreate;
    const cdId = cdom.id;
    const records = (cdom.status?.dnsRecords || []).filter((r) => r.requiredValue && r.recordType !== "DNS_RECORD_TYPE_UNSPECIFIED");
    let dnsMsgs = [];
    const seenNames = /* @__PURE__ */ new Set();
    const addDns = /* @__PURE__ */ __name(async (type, name, content, proxied, note) => {
      name = name.replace(/\.$/, "");
      const key = type + "|"+ name + "|"+ content;
      if (seenNames.has(key)) return;
      seenNames.add(key);
      const body = { type, name, content, ttl: 1, proxied: !!proxied };
      await cf("/zones/"+ u.cd.zoneId + "/dns_records", cfTok, { method: "POST", body });
      dnsMsgs.push(`${type} <code>${esc(name)}</code>  <code>${esc(content)}</code>${proxied ? "": ""}${note ? " "+ note : ""}`);
    }, "addDns");
    for (const rec of records) {
      const type = rec.recordType === "DNS_RECORD_TYPE_CNAME"? "CNAME": rec.recordType === "DNS_RECORD_TYPE_TXT"? "TXT": rec.recordType === "DNS_RECORD_TYPE_A"? "A": null;
      if (!type) continue;
      const rawName = rec.fqdn || (rec.hostlabel === "@"? u.cd.zoneName : rec.hostlabel + "."+ u.cd.zoneName);
      await addDns(type, rawName, rec.requiredValue, type === "CNAME"|| type === "A");
    }
    if (cdom.status?.verificationDnsHost && cdom.status?.verificationToken) {
      await addDns("TXT", cdom.status.verificationDnsHost + "."+ u.cd.zoneName, cdom.status.verificationToken, false);
    }
    let verified = false;
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 4e3));
      try {
        const st = await railway(
          `query { customDomain(id:${q(cdId)}, projectId:${q(pid)}) { status { verified dnsRecords { hostlabel requiredValue recordType fqdn zone } verificationDnsHost verificationToken } } }`,
          {},
          token
        );
        verified = st.customDomain.status.verified;
        const stRecords = (st.customDomain.status?.dnsRecords || []).filter((r) => r.requiredValue && r.recordType !== "DNS_RECORD_TYPE_UNSPECIFIED");
        for (const rec of stRecords) {
          const type = rec.recordType === "DNS_RECORD_TYPE_CNAME"? "CNAME": rec.recordType === "DNS_RECORD_TYPE_TXT"? "TXT": rec.recordType === "DNS_RECORD_TYPE_A"? "A": null;
          if (!type) continue;
          const rawName = rec.fqdn || (rec.hostlabel === "@"? u.cd.zoneName : rec.hostlabel + "."+ u.cd.zoneName);
          await addDns(type, rawName, rec.requiredValue, type === "CNAME"|| type === "A");
        }
        if (st.customDomain.status?.verificationDnsHost && st.customDomain.status?.verificationToken) {
          await addDns("TXT", st.customDomain.status.verificationDnsHost + "."+ u.cd.zoneName, st.customDomain.status.verificationToken, false);
        }
        if (verified) break;
      } catch (e) {
      }
    }
    try {
      const dep = await railway(
        `query { serviceInstance(serviceId:${q(p.serviceId)}, environmentId:${q(p.envId)}) { latestDeployment { id } } }`,
        {},
        token
      );
      if (dep.serviceInstance.latestDeployment?.id) {
        await railway(`mutation { deploymentRedeploy(id:${q(dep.serviceInstance.latestDeployment.id)}) { id status } }`, {}, token);
      }
    } catch (e) {
    }
    const dnsBlock = dnsMsgs.length ? "\n\n <b>DNS Records added:</b>\n"+ dnsMsgs.join("\n") : "";
    const okLine = verified ? " <b>Custom Domain verified!</b>": " \u0628\u0639\u062F \u0627\u0632 \u0686\u0646\u062F \u062F\u0642\u06CC\u0642\u0647 DNS \u0628\u0627\u06CC\u062F propagate \u0628\u0634\u0647.";
    await editMsg(
      chatId,
      msgId,
      `<b>Custom Domain added</b>

 <b>Domain:</b> <code>${esc(sub)}</code>
 <b>Panel:</b> ${esc(p.name)}
` + okLine + dnsBlock + `

 \u067E\u0646\u0644 \u0631\u06CC\u062F\u06CC\u067E\u0644\u0648\u06CC \u0634\u062F.`,
      kb([[btn("Dashboard", "menu")]])
    );
    u.cd = null;
    await saveUser(u, chatId, env);
  } catch (e) {
    await editMsg(
      chatId,
      msgId,
      `<b>Custom Domain failed</b>
${esc(e.message)}`,
      kb([[btn("Back", "cd")]])
    );
  }
}
__name(handleCdProject, "handleCdProject");
async function handleCdRemove(chatId, msgId, pid, env) {
  const u = await getUser(chatId, env);
  const p = u.projects.find((x) => x.id === pid);
  if (!p) return;
  const token = await decrypt(u.railwayToken, env);
  const cfTok = u.cfToken ? await decrypt(u.cfToken, env) : null;
  await editMsg(chatId, msgId, " \u062F\u0631 \u062D\u0627\u0644 \u062D\u0630\u0641 Custom Domain", null);
  try {
    const inst = await railway(
      `query { serviceInstance(serviceId:${q(p.serviceId)}, environmentId:${q(p.envId)}) { domains { customDomains { id domain } } } }`,
      {},
      token
    );
    const cds = inst.serviceInstance.domains.customDomains;
    if (!cds.length) {
      return editMsg(
        chatId,
        msgId,
        "\u0647\u06CC\u0686 Custom Domain \u0627\u06CC \u0631\u0648\u06CC \u0627\u06CC\u0646 \u067E\u0646\u0644 \u0646\u06CC\u0633\u062A.",
        kb([[btn("Back", "proj:"+ pid)]])
      );
    }
    const removed = [];
    for (const cd of cds) {
      await railway(`mutation { customDomainDelete(id:${q(cd.id)}) }`, {}, token);
      removed.push(cd.domain);
      if (cfTok) {
        try {
          const zones = await cf("/zones?per_page=50", cfTok);
          const z = (zones.json.result || []).find((x) => cd.domain.endsWith("."+ x.name));
          if (z) {
            const dns = await cf(`/zones/${z.id}/dns_records?name=${encodeURIComponent(cd.domain)}`, cfTok);
            for (const rec of dns.json.result || []) {
              await cf(`/zones/${z.id}/dns_records/${rec.id}`, cfTok, { method: "DELETE"}).catch(() => {
              });
            }
          }
        } catch (e) {
        }
      }
    }
    await editMsg(
      chatId,
      msgId,
      `<b>Custom Domain removed</b>

` + removed.map((d) => `<code>${esc(d)}</code>`).join("\n"),
      kb([[btn("Dashboard", "menu")]])
    );
  } catch (e) {
    await editMsg(
      chatId,
      msgId,
      `<b>Custom Domain removal failed</b>
${esc(e.message)}`,
      kb([[btn("Back", "proj:"+ pid)]])
    );
  }
}
__name(handleCdRemove, "handleCdRemove");
async function handleAccount(chatId, msgId, env) {
  const u = await getUser(chatId, env);
  let lines = `<b>Account</b>

`;
  if (u.railwayToken) {
    const t = await decrypt(u.railwayToken, env);
    const info = u.railwayInfo || {};
    lines += `<b>Railway:</b>
   ${esc(info.name || "\u2014")}
   <code>${maskToken(t)}</code>
`;
    if (info.email) lines += `   ${esc(info.email)}
`;
  } else {
    lines += ` Railway: not connected
`;
  }
  if (u.cfToken) {
    const ct = await decrypt(u.cfToken, env);
    lines += `<b>Cloudflare:</b>
   <code>${maskToken(ct)}</code>
`;
  } else {
    lines += `
 Cloudflare: not connected
`;
  }
  lines += `<b>Projects:</b> ${u.projects.length}

 <b>Delete Railway Account:</b>
\u0627\u06CC\u0646 \u062F\u06A9\u0645\u0647 \u0635\u0641\u062D\u0647 \u062D\u0630\u0641 \u0627\u06A9\u0627\u0646\u062A Railway \u0631\u0648 \u0628\u0627\u0632 \u0645\u06CC\u06A9\u0646\u0647. \u0628\u0631\u0648 \u067E\u0627\u06CC\u06CC\u0646 \u0635\u0641\u062D\u0647 \u0648 \u062A\u0648\u06CC <b>Danger Zone</b> \u0631\u0648\u06CC \u06AF\u0632\u06CC\u0646\u0647 \u062D\u0630\u0641 \u0627\u06A9\u0627\u0646\u062A \u0628\u0632\u0646.`;
  const rows = [[urlBtn("Delete Railway Account", "https://railway.com/account")]];
  rows.push([btn("\u062D\u0630\u0641 \u062A\u0648\u06A9\u0646\u0647\u0627", "deltokens")]);
  rows.push([btn("Back", "menu")]);
  return show(chatId, msgId, lines, kb(rows));
}
__name(handleAccount, "handleAccount");
async function handleDelTokens(chatId, msgId, env) {
  const u = await getUser(chatId, env);
  const hasRail = !!u.railwayToken;
  const hasCf = !!u.cfToken;
  if (!hasRail && !hasCf) {
    return editMsg(
      chatId,
      msgId,
      "\u0647\u06CC\u0686 \u062A\u0648\u06A9\u0646\u06CC \u0628\u0631\u0627\u06CC \u062D\u0630\u0641 \u0646\u06CC\u0633\u062A \u2014 Railway \u0648 Cloudflare \u0647\u0631 \u062F\u0648 \u062E\u0627\u0644\u06CC \u0647\u0633\u062A\u0646.",
      kb([[btn("Back", "acct")]])
    );
  }
  const text = `<b>\u062D\u0630\u0641 \u062A\u0648\u06A9\u0646</b>

\u06A9\u062F\u0648\u0645 \u062A\u0648\u06A9\u0646 \u0631\u0648 \u0645\u06CC\u062E\u0648\u0627\u06CC \u067E\u0627\u06A9 \u06A9\u0646\u06CC\u061F
(\u0628\u0627 \u0627\u06CC\u0646 \u06A9\u0627\u0631 \u0641\u0642\u0637 \u062A\u0648\u06A9\u0646 \u0630\u062E\u06CC\u0631\u0647\u0634\u062F\u0647 \u067E\u0627\u06A9 \u0645\u06CC\u0634\u0647\u061B \u0627\u06A9\u0627\u0646\u062A\u0647\u0627\u062A \u062F\u0633\u062A \u0646\u0645\u06CC\u062E\u0648\u0631\u0647)`;
  const rows = [];
  if (hasRail) rows.push([btn("Railway", "deltok:rail")]);
  if (hasCf) rows.push([btn("Cloudflare", "deltok:cf")]);
  rows.push([btn("Back", "acct")]);
  return editMsg(chatId, msgId, text, kb(rows));
}
__name(handleDelTokens, "handleDelTokens");
async function handleDelToken(chatId, msgId, which, env) {
  const u = await getUser(chatId, env);
  if (which === "rail") {
    delete u.railwayToken;
    delete u.railwayInfo;
  } else if (which === "cf") {
    delete u.cfToken;
    delete u.cfInfo;
  } else {
    return editMsg(chatId, msgId, " \u06AF\u0632\u06CC\u0646\u0647 \u0646\u0627\u0645\u0639\u062A\u0628\u0631.", kb([[btn("Back", "acct")]]));
  }
  await saveUser(u, chatId, env);
  const name = which === "rail"? " Railway": " Cloudflare";
  const text = `<b>${name} Token \u062D\u0630\u0641 \u0634\u062F.</b>

\u062A\u0648\u06A9\u0646 ${which === "rail"? "Railway": "Cloudflare"} \u0627\u0632 \u0627\u06CC\u0646 \u062D\u0633\u0627\u0628 \u067E\u0627\u06A9 \u0634\u062F.
\u0645\u06CC\u062A\u0648\u0646\u06CC \u0628\u0627 \xABNew Deployment\xBB \u062F\u0648\u0628\u0627\u0631\u0647 \u062B\u0628\u062A\u0634 \u06A9\u0646\u06CC.`;
  return editMsg(
    chatId,
    msgId,
    text,
    kb([[btn("New Deployment", "newdep")], [btn("Account", "acct")], [btn("Dashboard", "menu")]])
  );
}
__name(handleDelToken, "handleDelToken");
async function memChannel(env) {
  const saved = await env.SPIDER_KV.get("memchan_id");
  if (saved) return saved;
  return MEMORY_CHANNEL;
}
__name(memChannel, "memChannel");
async function routeCallback(chatId, msgId, data, env) {
  const parts = data.split(":");
  const act = parts[0];
  const p1 = parts.slice(1).join(":");
  if (act !== "letsgo"&& act !== "join") {
    const missing = await userIsMember(chatId, env);
    if (missing.length) {
      const row = missing.map((ch) => urlBtn("Join @"+ ch, "https://t.me/"+ ch));
      return editMsg(
        chatId,
        msgId,
        "\u0628\u0631\u0627\u06CC \u0627\u0633\u062A\u0641\u0627\u062F\u0647 \u0628\u0627\u06CC\u062F \u0627\u0648\u0644 \u062F\u0631 \u0647\u0631 \u062F\u0648 \u06A9\u0627\u0646\u0627\u0644 \u0632\u06CC\u0631 \u0639\u0636\u0648 \u0628\u0634\u06CC \n\n\u0628\u0639\u062F \u0627\u0632 \u0639\u0636\u0648\u06CC\u062A\u060C \u062F\u06A9\u0645\u0647 Check \u0631\u0648 \u0628\u0632\u0646.",
        kb([row, [btn("CHECK MEMBERSHIP", "join")]])
      );
    }
  }
  switch (act) {
    case "letsgo":
      return handleLetsGo(chatId, msgId, env);
    case "join":
      return handleCheckJoin(chatId, msgId, env);
    case "region":
      return handleRegion(chatId, msgId, p1, env);
    case "repo":
      return handleRepoSelect(chatId, msgId, p1, env);
    case "repocancel":
      return handleNewDeploy(chatId, msgId, env);
    case "name":
      if (p1 === "auto") return handleNameAuto(chatId, msgId, env);
      if (p1 === "cancel") { u.step = "ready"; return handleNewDeploy(chatId, msgId, env); }
      return handleNewDeploy(chatId, msgId, env);
    case "deploy":
      return runDeploy(chatId, msgId, env);
    case "menu":
      return handleDashboard(chatId, env, msgId);
    case "newdep":
      return handleNewDeploy(chatId, msgId, env);
    case "myproj":
      return handleMyProjects(chatId, msgId, env);
    case "proj":
      return handleProjectDetail(chatId, msgId, p1, env);
    case "updateproj":
      return handleProjectUpdate(chatId, msgId, p1, env);
    case "backproj":
      return handleMyProjects(chatId, msgId, env);
    case "tcp":
      return handleTcpMenu(chatId, msgId, p1, env);
    case "tcpnew":
      return handleTcpNew(chatId, msgId, env);
    case "tcpselect":
      return handleTcpSelect(chatId, msgId, p1, env);
    case "tcpselprefix":
      return handleTcpSelectPrefix(chatId, msgId, p1, env);
    case "tcplist":
      return handleTcpList(chatId, msgId, p1, env);
    case "tcpsel":
      return handleTcpDetail(chatId, msgId, p1, env);
    case "tcpchg":
      return handleTcpChange(chatId, msgId, p1, env);
    case "tcpdel":
      return handleTcpDelete(chatId, msgId, p1, env);
    case "del":
      return handleDel(chatId, msgId, p1, env);
    case "delok":
      return handleDelOk(chatId, msgId, p1, env);
    case "adv":
      return handleAdvanced(chatId, msgId, env);
    case "cfsetup":
      return handleCfSetup(chatId, msgId, env);
    case "cfacc":
      return handleCfAccount(chatId, msgId, env);
    case "cfrep":
      return handleCfReplace(chatId, msgId, env);
    case "cfrem":
      return handleCfRemove(chatId, msgId, env);
    case "cfusage":
      return handleCfUsage(chatId, msgId, env);
    case "cd":
      return handleCustomDomain(chatId, msgId, env);
    case "cdzone":
      return handleCdZone(chatId, msgId, p1, env);
    case "cdproj":
      return handleCdProject(chatId, msgId, p1, env);
    case "cdrem":
      return handleCdRemove(chatId, msgId, p1, env);
    case "acct":
      return handleAccount(chatId, msgId, env);
    case "deltokens":
      return handleDelTokens(chatId, msgId, env);
    case "deltok":
      return handleDelToken(chatId, msgId, p1, env);
    default:
      return handleDashboard(chatId, env, msgId);
  }
}
__name(routeCallback, "routeCallback");
async function handleSlash(chatId, text, msgId, env) {
  const cmd = text.split(/\s/)[0].toLowerCase();
  const gate = /* @__PURE__ */ __name(async () => {
    const missing = await userIsMember(chatId, env);
    if (missing.length) {
      const row = missing.map((ch) => urlBtn("Join @"+ ch, "https://t.me/"+ ch));
      return sendText(
        chatId,
        "\u0628\u0631\u0627\u06CC \u0627\u0633\u062A\u0641\u0627\u062F\u0647 \u0628\u0627\u06CC\u062F \u0627\u0648\u0644 \u062F\u0631 \u0647\u0631 \u062F\u0648 \u06A9\u0627\u0646\u0627\u0644 \u0632\u06CC\u0631 \u0639\u0636\u0648 \u0628\u0634\u06CC \n\n\u0628\u0639\u062F \u0627\u0632 \u0639\u0636\u0648\u06CC\u062A\u060C \u062F\u06A9\u0645\u0647 Check \u0631\u0648 \u0628\u0632\u0646.",
        kb([row, [btn("CHECK MEMBERSHIP", "join")]])
      );
    }
    return null;
  }, "gate");
  switch (cmd) {
    case "/start":
      return handleStart(chatId, env);
    case "/dashboard":
    case "/menu":
      return handleDashboard(chatId, env);
    case "/help":
      return handleHelp(chatId, env);
    case "/newdeploy":
    case "/newdeployment": {
      const g = await gate();
      if (g) return g;
      return handleNewDeploy(chatId, null, env);
    }
    case "/projects":
    case "/myprojects": {
      const g = await gate();
      if (g) return g;
      return handleMyProjects(chatId, null, env);
    }
    case "/advanced": {
      const g = await gate();
      if (g) return g;
      return handleAdvanced(chatId, null, env);
    }
    case "/account": {
      const g = await gate();
      if (g) return g;
      return handleAccount(chatId, null, env);
    }
    default:
      return sendText(
        chatId,
        "\u062F\u0633\u062A\u0648\u0631 \u0646\u0627\u0634\u0646\u0627\u062E\u062A\u0647. \u0628\u0631\u0627\u06CC \u062F\u06CC\u062F\u0646 \u0647\u0645\u0647 \u062F\u0633\u062A\u0648\u0631\u0627\u062A \u062F\u0631 \u062A\u0644\u06AF\u0631\u0627\u0645 `/` \u0631\u0648 \u0628\u0632\u0646.",
        kb([[btn("Dashboard", "menu")]])
      );
  }
}
__name(handleSlash, "handleSlash");
async function handleUpdate(update, env) {
  if (update.message) {
    const msg = update.message;
    const chatId = msg.chat.id;
    const text = msg.text || "";
    if (msg.chat.type !== "private") {
      return sendText(
        chatId,
        "\u0627\u06CC\u0646 \u0631\u0628\u0627\u062A \u0641\u0642\u0637 \u062F\u0631 \u0686\u062A \u062E\u0635\u0648\u0635\u06CC \u06A9\u0627\u0631 \u0645\u06CC\u06A9\u0646\u0647. \u0627\u0632 \u0645\u0646\u0648\u06CC Telegram \u0628\u0627\u0632\u0634 \u06A9\u0646 ",
        kb([[urlBtn("Open in Private", "https://t.me/"+ env.BOT_USERNAME)]])
      );
    }
    const u = await getUser(chatId, env);
    // step-based text handlers first (so /skip in service-name step is handled)
    if (u.step === "await_token") return handleTokenText(chatId, text, msg.message_id, env);
    if (u.step === "await_tcp_port") return handleTcpPort(chatId, text, env);
    if (u.step === "await_tcp_select_port") return handleTcpSelectPort(chatId, text, msg.message_id, env);
    if (u.step === "await_cf_token") return handleCfToken(chatId, text, env);
    if (u.step === "await_custom_repo") return handleCustomRepoText(chatId, text, msg.message_id, env);
    if (u.step === "await_custom_port") return handleCustomPortText(chatId, text, msg.message_id, env);
    if (u.step === "await_service_name") return handleServiceNameText(chatId, text, msg.message_id, env);
    if (text.startsWith("/")) return handleSlash(chatId, text, msg.message_id, env);
    if (msg.photo || msg.document) {
      return sendText(
        chatId,
        "\u0627\u06CC\u0646 \u0631\u0628\u0627\u062A \u0641\u0642\u0637 \u0645\u062A\u0646 \u0645\u06CC\u067E\u0630\u06CC\u0631\u062F. \u0627\u0632 \u0645\u0646\u0648 \u0627\u0633\u062A\u0641\u0627\u062F\u0647 \u06A9\u0646.",
        kb([[btn("Dashboard", "menu")]])
      );
    }
    const missing = await userIsMember(chatId, env);
    if (missing.length) {
      const row = missing.map((ch) => urlBtn("Join @"+ ch, "https://t.me/"+ ch));
      return sendText(
        chatId,
        "\u0628\u0631\u0627\u06CC \u0627\u0633\u062A\u0641\u0627\u062F\u0647 \u0628\u0627\u06CC\u062F \u0627\u0648\u0644 \u062F\u0631 \u0647\u0631 \u062F\u0648 \u06A9\u0627\u0646\u0627\u0644 \u0632\u06CC\u0631 \u0639\u0636\u0648 \u0628\u0634\u06CC \n\n\u0628\u0639\u062F \u0627\u0632 \u0639\u0636\u0648\u06CC\u062A\u060C \u062F\u06A9\u0645\u0647 Check \u0631\u0648 \u0628\u0632\u0646.",
        kb([row, [btn("CHECK MEMBERSHIP", "join")]])
      );
    }
    return sendText(
      chatId,
      "\u0627\u0632 \u0645\u0646\u0648\u06CC \u0632\u06CC\u0631 \u0627\u0633\u062A\u0641\u0627\u062F\u0647 \u06A9\u0646 ",
      kb([[btn("Dashboard", "menu")]])
    );
  }
  if (update.callback_query) {
    const cq = update.callback_query;
    const chatId = cq.message?.chat?.id;
    const msgId = cq.message?.message_id;
    const data = cq.data || "";
    if (chatId < 0) return;
    await answerCb(cq.id, env);
    return routeCallback(chatId, msgId, data, env);
  }
  if (update.my_chat_member) {
    const ch = update.my_chat_member.chat;
    if (ch?.type === "channel") await env.SPIDER_KV.put("memchan_id", String(ch.id));
    return;
  }
  if (update.channel_post) {
    const ch = update.channel_post.chat;
    if (ch?.type === "channel") await env.SPIDER_KV.put("memchan_id", String(ch.id));
    return;
  }
}
__name(handleUpdate, "handleUpdate");
async function scheduled(event, env) {
  const list = await env.SPIDER_KV.list({ prefix: "job:"});
  for (const k of list.keys) {
    const job = await env.SPIDER_KV.get(k.name, "json");
    if (!job) continue;
    try {
      const u = await getUser(job.chatId, env);
      const token = await decrypt(u.railwayToken, env);
      const d = await railway(`query { deployment(id:${q(job.deployId)}) { status } }`, {}, token);
      const status = d.deployment.status;
      if (isDoneStatus(status)) {
        await finishDeploy(job, status, env);
      } else {
        if (status === "BUILDING") job.buildTicks = (job.buildTicks || 0) + 1;
        if (status === "DEPLOYING") job.deployTicks = (job.deployTicks || 0) + 1;
        const pct = statusPct(status, job);
        job.lastPct = pct;
        await env.SPIDER_KV.put(k.name, JSON.stringify(job));
        await editProgress(job.chatId, job.messageId, status, job, env);
      }
    } catch (e) {
      console.error("cron job err", e.message);
    }
  }
}
__name(scheduled, "scheduled");
var _userLocks = /* @__PURE__ */ new Map();
async function withUserLock(chatId, env, fn) {
  const prev = _userLocks.get(chatId) || Promise.resolve();
  let release;
  const gate = new Promise((res) => {
    release = res;
  });
  const chained = prev.then(() => gate);
  _userLocks.set(chatId, chained);
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (_userLocks.get(chatId) === chained) {
      _userLocks.delete(chatId);
    }
  }
}
__name(withUserLock, "withUserLock");
var worker_default = {
  async fetch(request, env, ctx) {
    globalThis.__env = env;
    const url = new URL(request.url);
    if (request.method === "POST") {
      __captured.length = 0;
      let update;
      try {
        update = await request.json();
      } catch (e) {
        return new Response("bad json", { status: 400 });
      }
      const chatId = update.message && update.message.chat && update.message.chat.id || update.callback_query && update.callback_query.message && update.callback_query.message.chat && update.callback_query.message.chat.id || update.channel_post && update.channel_post.chat && update.channel_post.chat.id;
      if (chatId) {
        await withUserLock(chatId, env, () => handleUpdate(update, env));
      } else {
        await handleUpdate(update, env);
      }
      return new Response(JSON.stringify(__captured), { headers: { "Content-Type": "application/json"} });
    }
    if (url.pathname === "/setup") {
      const mode = url.searchParams.get("mode") || "set";
      const whUrl = "https://"+ request.headers.get("host") + "/webhook";
      if (mode === "delete") {
        const r2 = await tg("deleteWebhook", {}, env);
        return new Response(JSON.stringify(r2), { headers: { "Content-Type": "application/json"} });
      }
      const r = await tg("setWebhook", { url: whUrl, allowed_updates: ["message", "callback_query", "my_chat_member", "channel_post"] }, env);
      return new Response(JSON.stringify(r), { headers: { "Content-Type": "application/json"} });
    }
    if (url.pathname === "/state") {
      const id = url.searchParams.get("id");
      if (!id) return new Response("need ?id=<chatId>", { status: 400 });
      const raw = await env.SPIDER_KV.get("user:"+ id);
      if (!raw) return new Response("no state");
      return new Response(raw, { headers: { "Content-Type": "application/json"} });
    }
    if (url.pathname === "/reset") {
      const id = url.searchParams.get("id");
      if (!id) return new Response("need ?id=<chatId>", { status: 400 });
      await env.SPIDER_KV.delete("user:"+ id);
      return new Response("reset "+ id);
    }
    if (url.pathname === "/rwone") {
      const token = url.searchParams.get("token") || "";
      const host = url.searchParams.get("host") || RAILWAY_API;
      const res = await fetch(host, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer "+ token },
        body: JSON.stringify({ query: "{ apiToken { workspaces { id name } } }"})
      });
      const text = await res.text();
      return new Response(`STATUS=${res.status}
HOST=${host}
BODY=${text.slice(0, 300)}`, { headers: { "Content-Type": "text/plain"} });
    }
    if (url.pathname === "/rwtest") {
      const token = url.searchParams.get("token") || "";
      const mode = url.searchParams.get("mode") || "ua";
      const out = [];
      const tryFetch = /* @__PURE__ */ __name(async (label, opts) => {
        try {
          const res = await fetch(RAILWAY_API, opts);
          const text = await res.text();
          out.push(`${label} => ${res.status}: ${text.slice(0, 120)}`);
        } catch (e) {
          out.push(`${label} => ERR ${e.message}`);
        }
      }, "tryFetch");
      const base = {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer "+ token },
        body: JSON.stringify({ query: "{ apiToken { workspaces { id name } } }"})
      };
      await tryFetch("UA-browser", { ...base, headers: { ...base.headers, "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"} });
      await tryFetch("UA-bot", { ...base, headers: { ...base.headers, "User-Agent": "curl/8.0"} });
      await tryFetch("UA-plain", base);
      const proxyUrl = "https://api.allorigins.win/raw?url="+ encodeURIComponent(RAILWAY_API);
      try {
        const r2 = await fetch(proxyUrl, base);
        const t2 = await r2.text();
        out.push(`allorigins => ${r2.status}: ${t2.slice(0, 200)}`);
      } catch (e) {
        out.push(`allorigins => ERR ${e.message}`);
      }
      const altHosts = ["backboard.railway.com/graphql/v2"];
      for (const host of altHosts) {
        try {
          const r4 = await fetch("https://"+ host, base);
          const t4 = await r4.text();
          out.push(`${host} => ${r4.status}: ${t4.slice(0, 120)}`);
        } catch (e) {
          out.push(`${host} => ERR ${e.message}`);
        }
      }
      return new Response(out.join("\n"), { headers: { "Content-Type": "text/plain"} });
    }
    if (url.pathname === "/chscan") {
      const info = await tg("getWebhookInfo", {}, env);
      const whUrl = info.result?.url || "https://spider-tg-bot.qabilsaibery.workers.dev/webhook";
      const out = { webhookInfo: { url: whUrl, pending: info.result?.pending_update_count } };
      try {
        await tg("deleteWebhook", {}, env);
        await new Promise((r) => setTimeout(r, 700));
        const up = await tg("getUpdates", { timeout: 2, limit: 50 }, env);
        out.updates = (up.result || []).map((u) => {
          const mcm = u.my_chat_member;
          if (mcm) return { type: "my_chat_member", chat: mcm.chat, from: mcm.from?.username, new: mcm.new_chat_member?.status };
          if (u.channel_post) return { type: "channel_post", chat: u.channel_post.chat, text: String(u.channel_post.text || "").slice(0, 80) };
          if (u.message) return { type: "message", chat: u.message.chat, text: String(u.message.text || "").slice(0, 80) };
          return { type: Object.keys(u)[0] || "unknown"};
        });
      } catch (e) {
        out.error = e.message;
      } finally {
        await tg("setWebhook", { url: whUrl, allowed_updates: ["message", "callback_query", "my_chat_member", "channel_post"] }, env);
      }
      return new Response(JSON.stringify(out, null, 2), { headers: { "Content-Type": "application/json"} });
    }
    if (url.pathname === "/setcmds") {
      const cmds = [
        { command: "start", description: "\u062E\u0648\u0634\u0622\u0645\u062F \u0648 \u0634\u0631\u0648\u0639"},
        { command: "dashboard", description: "\u0645\u0646\u0648\u06CC \u0627\u0635\u0644\u06CC"},
        { command: "newdeploy", description: "\u0633\u0627\u062E\u062A \u067E\u0646\u0644 \u062C\u062F\u06CC\u062F"},
        { command: "projects", description: "\u067E\u0631\u0648\u0698\u0647\u0647\u0627\u06CC \u0645\u0646"},
        { command: "advanced", description: "\u062A\u0646\u0638\u06CC\u0645\u0627\u062A \u067E\u06CC\u0634\u0631\u0641\u062A\u0647"},
        { command: "account", description: "\u062D\u0633\u0627\u0628 \u06A9\u0627\u0631\u0628\u0631\u06CC"},
        { command: "help", description: "\u0631\u0627\u0647\u0646\u0645\u0627"}
      ];
      const r1 = await tg("setMyCommands", { commands: cmds }, env);
      const r2 = await tg("setMyCommands", { commands: cmds, scope: { type: "all_private_chats"} }, env);
      return new Response(JSON.stringify({ default: r1, private: r2 }), { headers: { "Content-Type": "application/json"} });
    }
    if (url.pathname === "/chset") {
      const id = url.searchParams.get("id") || "";
      if (!/^-?\d+$/.test(id)) return new Response("need ?id=<numeric chat id>");
      await env.SPIDER_KV.put("memchan_id", id);
      return new Response("saved memchan_id="+ id);
    }
    if (url.pathname === "/chdel") {
      const ids = (url.searchParams.get("ids") || "").split(",").filter((x) => /^-?\d+$/.test(x));
      if (!ids.length) return new Response("need ?ids=<comma separated message ids>");
      const ch = await memChannel(env);
      const out = [];
      for (const id of ids) {
        const r = await tg("deleteMessage", { chat_id: ch, message_id: parseInt(id, 10) }, env);
        out.push({ id, ok: r.ok, desc: r.description });
      }
      return new Response(JSON.stringify(out), { headers: { "Content-Type": "application/json"} });
    }
    if (url.pathname === "/chinfo") {
      const ch = url.searchParams.get("ch") || "";
      const out = {};
      if (ch) {
        const c = await tg("getChat", { chat_id: ch }, env);
        out.chat = c.result ? { id: c.result.id, title: c.result.title, username: c.result.username } : c;
        const me = await tg("getMe", {}, env);
        out.bot = me.result?.username;
        if (c.result) {
          const m = await tg("getChatMember", { chat_id: c.result.id, user_id: me.result.id }, env);
          out.botMember = m.result;
        }
      }
      return new Response(JSON.stringify(out, null, 2), { headers: { "Content-Type": "application/json"} });
    }
    if (url.pathname === "/tcpprobe") {
      const host = url.searchParams.get("host") || "";
      const port = parseInt(url.searchParams.get("port") || "0", 10);
      if (!host || !port) return new Response("need ?host=&port=");
      const out = [];
      try {
        const r = await fetch(`http://${host}:${port}/`, { redirect: "manual"});
        const txt = await r.text();
        out.push(`connect OK status=${r.status} body=${txt.slice(0, 200)}`);
      } catch (e) {
        out.push(`connect ERR ${e.message}`);
      }
      return new Response(out.join("\n"), { headers: { "Content-Type": "text/plain"} });
    }
    if (url.pathname === "/pantest") {
      const base = url.searchParams.get("base") || "";
      const out = {};
      try {
        const cookie = await panelLogin(base, env);
        out.login = "ok";
        const data = await panelCall(base, cookie, "GET", "/api/inbounds", null, env);
        out.inbounds = (data.inbounds || []).map((ib) => ({ id: ib.inbound_id, name: ib.name, protocol: ib.protocol, network: ib.network, extDomain: ib.external_domain, extPort: ib.external_port }));
      } catch (e) {
        out.error = e.message;
      }
      return new Response(JSON.stringify(out, null, 2), { headers: { "Content-Type": "application/json"} });
    }
    if (url.pathname === "/chsearch") {
      const ch = await memChannel(env);
      const out = { ch };
      const me = await tg("getMe", {}, env);
      const botId = me.result?.id;
      out.botId = botId;
      const getChat = await tg("getChat", { chat_id: ch }, env);
      out.getChat = { ok: getChat.ok, title: getChat.result?.title, type: getChat.result?.type, desc: getChat.description, username: getChat.result?.username };
      const member = await tg("getChatMember", { chat_id: ch, user_id: botId }, env);
      out.member = { ok: member.ok, status: member.result?.status, can_delete_messages: member.result?.can_delete_messages, can_post_messages: member.result?.can_post_messages, desc: member.description };
      const variants = [
        { label: "hashtag-numeric", p: { chat_id: ch, query: "#id8510247285", filter: "hashtag", limit: 5 } },
        { label: "hashtag-username", p: { chat_id: "@sapaceunlimitamirbot", query: "#id8510247285", filter: "hashtag", limit: 5 } },
        { label: "no-filter", p: { chat_id: ch, query: "id8510247285", limit: 5 } },
        { label: "from-bot", p: { chat_id: ch, query: "id8510247285", from_user_id: botId, limit: 5 } },
        { label: "other-channel", p: { chat_id: "@spider_vpn1", query: "#id", filter: "hashtag", limit: 5 } }
      ];
      for (const v of variants) {
        const r = await tg("searchMessages", v.p, env);
        out[v.label] = { ok: r.ok, desc: r.description, n: (r.result || []).length };
      }
      const gc2 = await tg("getChat", { chat_id: "@spider_vpn1"}, env);
      out.otherChannel = { ok: gc2.ok, type: gc2.result?.type, title: gc2.result?.title };
      return new Response(JSON.stringify(out, null, 2), { headers: { "Content-Type": "application/json"} });
    }
    if (url.pathname === "/diag") {
      const out = {};
      for (const ch of CHANNELS) {
        const chat = await tg("getChat", { chat_id: "@"+ ch }, env);
        out[ch] = {
          exists: chat.ok,
          title: chat.result?.title || chat.description,
          type: chat.result?.type
        };
      }
      return new Response(JSON.stringify(out, null, 2), { headers: { "Content-Type": "application/json"} });
    }
    return new Response("Spider Panel Bot OK");
  },
  scheduled
};
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map
