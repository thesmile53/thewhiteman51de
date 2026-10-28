// Twitch-Chat über die offizielle API: Device-Code-Login (OAuth) + EventSub-WebSocket.
// Tokens bleiben auf dem Server (twitch-config.json), nie im Browser.
const fs = require("fs");
const path = require("path");
const WS = require("./wsclient");

const ID = process.env.TWITCH_ID_BASE || "https://id.twitch.tv";
const API = process.env.TWITCH_API_BASE || "https://api.twitch.tv/helix";
const WS_URL = process.env.TWITCH_WS_URL || "wss://eventsub.wss.twitch.tv/ws";
const CFG = path.join(__dirname, "twitch-config.json");
const SCOPE = "user:read:chat";

let cfg = {}; // { clientId, access, refresh, userId, login }
try { cfg = JSON.parse(fs.readFileSync(CFG, "utf8")); } catch {}
const save = () => fs.writeFileSync(CFG, JSON.stringify(cfg), { mode: 0o600 });

const mod = { onMessage: () => {}, onChange: () => {} };
const st = { phase: cfg.refresh ? "connected" : "idle", code: "", uri: "", error: "", active: false, channel: "", gen: 0, conn: null, timer: null, loginGen: 0 };
const set = p => { Object.assign(st, p); mod.onChange(); };
const clean = s => { let t = String(s); for (const k of [cfg.access, cfg.refresh]) if (k) t = t.split(k).join("***"); return t; };

const form = async (url, params) => {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params) });
  return { ok: r.ok, status: r.status, j: await r.json().catch(() => ({})) };
};

async function refresh() {
  const r = await form(ID + "/oauth2/token", { client_id: cfg.clientId, grant_type: "refresh_token", refresh_token: cfg.refresh });
  if (!r.ok) throw new Error("Twitch-Anmeldung abgelaufen – bitte neu verbinden");
  cfg.access = r.j.access_token; cfg.refresh = r.j.refresh_token || cfg.refresh; save();
}
async function helix(p, opts = {}, retry = true) {
  const r = await fetch(API + p, { ...opts, headers: { Authorization: "Bearer " + cfg.access, "Client-Id": cfg.clientId, "Content-Type": "application/json" } });
  if (r.status === 401 && retry) { await refresh(); return helix(p, opts, false); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message || "Twitch HTTP " + r.status);
  return j;
}

// ---- Login (Device Code Flow, braucht nur die Client-ID einer „öffentlichen“ Twitch-App)
async function login(clientId) {
  clientId = String(clientId || "").trim();
  if (!/^[a-z0-9]{20,40}$/i.test(clientId)) throw new Error("Ungültige Client-ID");
  const gen = ++st.loginGen;
  stop();
  const d = await form(ID + "/oauth2/device", { client_id: clientId, scopes: SCOPE });
  if (!d.ok) throw new Error(d.j.message || "Twitch lehnt die Client-ID ab");
  set({ phase: "waiting", code: d.j.user_code, uri: d.j.verification_uri, error: "", active: false });
  const until = Date.now() + (d.j.expires_in || 600) * 1000, every = Math.max(2, d.j.interval || 5) * 1000;
  (async function poll() {
    if (gen !== st.loginGen) return;
    if (Date.now() > until) return set({ phase: "idle", error: "Anmeldung abgelaufen", code: "" });
    const t = await form(ID + "/oauth2/token", { client_id: clientId, device_code: d.j.device_code, grant_type: "urn:ietf:params:oauth:grant-type:device_code", scopes: SCOPE }).catch(() => null);
    if (gen !== st.loginGen) return;
    if (t && t.ok) {
      cfg = { clientId, access: t.j.access_token, refresh: t.j.refresh_token };
      try {
        const u = (await helix("/users")).data[0];
        cfg.userId = u.id; cfg.login = u.login; save();
        set({ phase: "connected", code: "", uri: "", error: "" });
        start(st.channel);
      } catch (e) { set({ phase: "idle", error: clean(e.message) }); }
      return;
    }
    if (t && !/pending/i.test(t.j.message || "")) return set({ phase: "idle", error: t.j.message || "Anmeldung fehlgeschlagen", code: "" });
    setTimeout(poll, every);
  })();
  setTimeout(() => {}, 0);
  return status();
}
function logout() {
  st.loginGen++; stop(); cfg = {}; try { fs.unlinkSync(CFG); } catch {}
  set({ phase: "idle", code: "", uri: "", error: "", active: false });
}

// ---- EventSub
function stop() { clearTimeout(st.timer); st.gen++; if (st.conn) { st.conn.close(); st.conn = null; } if (st.active) { st.active = false; } }
async function start(channel) {
  stop(); st.channel = channel || "";
  if (!cfg.refresh) return;
  const gen = st.gen;
  const retry = ms => { if (gen === st.gen) st.timer = setTimeout(() => start(st.channel), ms); };
  try {
    let bid = cfg.userId;
    if (st.channel) {
      const u = await helix("/users?login=" + encodeURIComponent(st.channel));
      if (!u.data[0]) throw new Error("Twitch-Kanal „" + st.channel + "“ nicht gefunden");
      bid = u.data[0].id;
    }
    if (gen !== st.gen) return;
    let watchdog;
    const arm = s => { clearTimeout(watchdog); watchdog = setTimeout(() => { if (gen === st.gen) { set({ active: false, error: "Verbindung verloren" }); start(st.channel); } }, (s + 10) * 1000); };
    const conn = st.conn = WS.connect(WS_URL, {
      onmessage: async text => {
        if (gen !== st.gen) return;
        let m; try { m = JSON.parse(text); } catch { return; }
        const t = m.metadata && m.metadata.message_type;
        if (t === "session_welcome") {
          arm(m.payload.session.keepalive_timeout_seconds || 10);
          try {
            await helix("/eventsub/subscriptions", { method: "POST", body: JSON.stringify({
              type: "channel.chat.message", version: "1", condition: { broadcaster_user_id: bid, user_id: cfg.userId },
              transport: { method: "websocket", session_id: m.payload.session.id } }) });
            set({ active: true, error: "" });
          } catch (e) { set({ active: false, error: clean(e.message) }); }
        } else if (t === "session_keepalive") arm(10);
        else if (t === "session_reconnect") { clearTimeout(watchdog); start(st.channel); }
        else if (t === "notification") {
          arm(10);
          const ev = m.payload.event; if (!ev || !ev.message) return;
          mod.onMessage({ src: "twitch", name: ev.chatter_user_name, color: ev.color || "",
            parts: (ev.message.fragments || []).map(f => f.type === "emote" && f.emote ? { t: "emote", id: f.emote.id, v: f.text } : { t: "text", v: f.text }) });
        }
      },
      onclose: () => { clearTimeout(watchdog); if (gen === st.gen) { set({ active: false }); retry(5000); } },
    });
  } catch (e) { set({ active: false, error: clean(e.message) }); retry(30000); }
}

function sync(channel) { channel = String(channel || ""); if (channel !== st.channel && cfg.refresh) start(channel); else st.channel = channel; }
const status = () => ({ phase: st.phase, code: st.code, uri: st.uri, error: st.error, active: st.active, login: cfg.login || "", clientId: !!cfg.clientId });

Object.assign(mod, { login, logout, sync, status, start: c => cfg.refresh && start(c) });
module.exports = mod;
