// OBS-Overlay-Server – keine Abhängigkeiten, nur Node >= 18.
// Start: node server.js   (PORT und CONTROL_PASSWORD per Umgebungsvariable)
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = +process.env.PORT || 3000;
const PASSWORD = process.env.CONTROL_PASSWORD || "";
const OBS = require("./obs");
const YT = require("./yt");
const TW = require("./tw");
const PUBLIC = path.join(__dirname, "public");
const STATE_FILE = path.join(__dirname, "state.json");
const UPLOADS = path.join(__dirname, "uploads");

// Positionen/Größen (px auf 1920x1080), im Web-Editor verschiebbar.
const DEFAULT_LAYOUT = {
  cam:   { x: 40,   y: 714,  w: 480,  h: 270 },
  live:  { x: 40,   y: 40,   w: 132,  h: 45 },
  lower: { x: 40,   y: 582,  w: 480,  h: 104 },
  chat:  { x: 1460, y: 40,   w: 420,  h: 560 },
  goal:  { x: 1460, y: 620,  w: 420,  h: 90 },
  bottom:{ x: 0,    y: 1020, w: 1920, h: 60 },
  alert: { x: 560,  y: 120,  w: 800,  h: 170 },
};

const DEFAULT_STATE = {
  youtubeVideoId: "", // YouTube-Live-Video-ID für den API-Chat
  twitchChannel: "", // eigener Twitch-Chat (anonym per IRC, ohne Twitch-Banner)
  camVisible: true,
  liveVisible: true,
  liveText: "LIVE",
  tickerTag: "INFO",
  chatTitle: "Chat",
  chatUrl: "", // Chat-Adresse für die Chat-Box ({host} = Hostname der Overlay-Seite)
  items: [], // selbst erstellte Quellen: text | image | embed | box
  layout: JSON.parse(JSON.stringify(DEFAULT_LAYOUT)),
  name: "TheWhiteMan51DE",
  socials: [
    { label: "Twitch", value: "twitch.tv/thewhiteman51de" },
    { label: "YouTube", value: "youtube.com/@thewhiteman51de" },
    { label: "Discord", value: "discord.gg/dein-link" },
  ],
  ticker: ["Folge dem Kanal und verpass keinen Stream!", "Fragen? Ab damit in den Chat!", "Danke für jeden Zuschauer ❤"],
  topic: "Heute: Chillen & Zocken",
  startingText: "Stream startet gleich",
  brbText: "Bin gleich zurück",
  endingText: "Danke fürs Zuschauen!",
  nextStream: "Nächster Stream: Morgen 19:00 Uhr",
  goal: { label: "Follower-Ziel", current: 0, target: 100 },
  lowerThirdVisible: true,
  chatVisible: true,
  goalVisible: true,
  tickerVisible: true,
  colorA: "#00e5ff",
  colorB: "#a855f7",
  countdownEnd: 0,
  brbSince: 0,
};

let state = JSON.parse(JSON.stringify(DEFAULT_STATE));
try {
  const saved = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  state = { ...state, ...saved, layout: { ...DEFAULT_LAYOUT, ...(saved.layout || {}) } };
} catch {}
const save = () => fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2), () => {});

const VER = String(Date.now()); // ändert sich bei Serverneustart → Seiten laden sich neu
const view = () => ({ ...state, now: Date.now(), ver: VER, twitchApi: TW.status().active });
const clients = new Set();
const broadcast = (event, data) => {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(msg);
};
const pushState = () => { YT.sync(state.youtubeVideoId); TW.sync(state.twitchChannel); save(); broadcast("state", view()); };

// Nur bekannte Schlüssel mit passendem Typ übernehmen.
function merge(target, patch) {
  for (const k of Object.keys(DEFAULT_STATE)) {
    if (!(k in patch)) continue;
    const def = DEFAULT_STATE[k], v = patch[k];
    if (k === "youtubeVideoId") {
      const id = String(v).trim();
      target.youtubeVideoId = /^[\w-]{6,20}$/.test(id) ? id : "";
    } else if (k === "twitchChannel") {
      const c = String(v).trim().replace(/^#/, "").toLowerCase();
      target.twitchChannel = /^[a-z0-9_]{1,25}$/.test(c) ? c : "";
    } else if (k === "chatUrl") {
      target.chatUrl = cleanUrl(v);
    } else if (k === "items") {
      if (Array.isArray(v)) target.items = v.slice(0, 50).map(cleanItem).filter(Boolean);
    } else if (k === "layout" && v && typeof v === "object") {
      for (const el of Object.keys(DEFAULT_LAYOUT)) {
        const n = v[el];
        if (!n || typeof n !== "object") continue;
        const cur = target.layout[el] || DEFAULT_LAYOUT[el];
        const num = (key, lo, hi) => Math.min(hi, Math.max(lo, Math.round(Number(n[key] ?? cur[key])) || 0));
        target.layout[el] = { x: num("x", -2000, 3840), y: num("y", -2000, 2160), w: num("w", 20, 3840), h: num("h", 20, 2160) };
      }
    } else if (k === "goal" && v && typeof v === "object") {
      target.goal = {
        label: String(v.label ?? target.goal.label).slice(0, 60),
        current: Number(v.current ?? target.goal.current) || 0,
        target: Math.max(1, Number(v.target ?? target.goal.target) || 1),
      };
    } else if (Array.isArray(def) && Array.isArray(v)) {
      target[k] = k === "socials"
        ? v.slice(0, 8).map(s => ({ label: String(s.label || "").slice(0, 30), value: String(s.value || "").slice(0, 100) }))
        : v.slice(0, 20).map(s => String(s).slice(0, 200));
    } else if (typeof def === typeof v && typeof def !== "object") {
      target[k] = typeof v === "string" ? v.slice(0, 200) : v;
    }
  }
}

// ---- Eigene Quellen
const ITEM_TYPES = ["text", "image", "embed", "box"];
const cleanUrl = u => { u = String(u || "").trim().slice(0, 500); return /^(https?:\/\/|\/uploads\/)/i.test(u) ? u : ""; };
const cleanColor = (c, d) => (/^#[0-9a-f]{6}$/i.test(String(c)) ? String(c) : d);
const clamp = (v, lo, hi, d) => { v = Math.round(Number(v)); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
function cleanItem(i) {
  if (!i || typeof i !== "object" || !/^[a-z0-9]{3,16}$/.test(String(i.id)) || !ITEM_TYPES.includes(i.type)) return null;
  return {
    id: String(i.id), type: i.type,
    label: String(i.label || "").slice(0, 40),
    visible: i.visible !== false,
    x: clamp(i.x, -2000, 3840, 100), y: clamp(i.y, -2000, 2160, 100),
    w: clamp(i.w, 20, 3840, 400), h: clamp(i.h, 20, 2160, 200),
    text: String(i.text || "").slice(0, 500),
    url: cleanUrl(i.url),
    fontSize: clamp(i.fontSize, 8, 400, 48),
    align: ["left", "center", "right"].includes(i.align) ? i.align : "center",
    color: cleanColor(i.color, "#ffffff"),
    bg: i.bg === "" ? "" : cleanColor(i.bg, ""),
    alpha: clamp(i.alpha, 0, 100, 100),
    radius: clamp(i.radius, 0, 500, 12),
  };
}

const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp" };

function readBody(req, limit = 1e6) {
  return new Promise((resolve, reject) => {
    let b = "";
    req.on("data", c => { b += c; if (b.length > limit) { reject(new Error("too large")); req.destroy(); } });
    req.on("end", () => { try { resolve(b ? JSON.parse(b) : {}); } catch (e) { reject(e); } });
  });
}
const json = (res, code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");

  if (url.pathname === "/events") {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    res.write(`event: state\ndata: ${JSON.stringify(view())}\n\n`);
    clients.add(res);
    const ping = setInterval(() => res.write(": ping\n\n"), 25000);
    req.on("close", () => { clearInterval(ping); clients.delete(res); });
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    if (req.method === "GET" && url.pathname === "/api/state") return json(res, 200, view());
    if (req.method !== "POST") return json(res, 405, { error: "method" });
    if (PASSWORD && req.headers["x-password"] !== PASSWORD) return json(res, 401, { error: "Falsches Passwort" });
    let body;
    try { body = await readBody(req, url.pathname === "/api/upload" ? 12e6 : 1e6); } catch { return json(res, 400, { error: "bad json" }); }

    switch (url.pathname) {
      case "/api/state": merge(state, body); pushState(); return json(res, 200, state);
      case "/api/alert": {
        const a = {
          kind: String(body.kind || "Alert").slice(0, 40),
          who: String(body.who || "").slice(0, 60),
          msg: String(body.msg || "").slice(0, 160),
        };
        broadcast("alert", a); return json(res, 200, a);
      }
      case "/api/countdown":
        state.countdownEnd = Date.now() + Math.max(0, Number(body.minutes) || 0) * 60000; pushState(); return json(res, 200, state);
      case "/api/brb-reset": state.brbSince = Date.now(); pushState(); return json(res, 200, state);
      case "/api/upload": {
        const ext = path.extname(String(body.name || "")).toLowerCase();
        if (![".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(ext)) return json(res, 400, { error: "Nur PNG, JPG, GIF, WEBP" });
        const buf = Buffer.from(String(body.data || ""), "base64");
        if (!buf.length || buf.length > 8 * 1024 * 1024) return json(res, 400, { error: "Datei leer oder größer als 8 MB" });
        fs.mkdirSync(UPLOADS, { recursive: true });
        const fname = Date.now().toString(36) + Math.random().toString(36).slice(2, 8) + ext;
        fs.writeFileSync(path.join(UPLOADS, fname), buf);
        return json(res, 200, { url: "/uploads/" + fname });
      }
      case "/api/youtube/key": YT.setKey(body.key); return json(res, 200, YT.status());
      case "/api/youtube/status": return json(res, 200, YT.status());
      case "/api/twitch/login":
        try { return json(res, 200, await TW.login(body.clientId)); } catch (e) { return json(res, 400, { error: e.message }); }
      case "/api/twitch/logout": TW.logout(); return json(res, 200, TW.status());
      case "/api/twitch/status": return json(res, 200, TW.status());
      case "/api/obs/connect": await OBS.connect(body); return json(res, 200, OBS.status());
      case "/api/obs/disconnect": OBS.disconnect(); return json(res, 200, OBS.status());
      case "/api/obs/status": return json(res, 200, OBS.status());
      case "/api/obs/scenes": case "/api/obs/scene": case "/api/obs/items": case "/api/obs/item": {
        try {
          if (url.pathname === "/api/obs/scene") { await OBS.request("SetCurrentProgramScene", { sceneName: String(body.name) }); return json(res, 200, {}); }
          if (url.pathname === "/api/obs/item") {
            await OBS.request("SetSceneItemEnabled", { sceneName: String(body.sceneName), sceneItemId: Number(body.id), sceneItemEnabled: !!body.enabled });
            return json(res, 200, {});
          }
          if (url.pathname === "/api/obs/scenes") {
            const r = await OBS.request("GetSceneList");
            return json(res, 200, { current: r.currentProgramSceneName, scenes: r.scenes.map(x => x.sceneName).reverse() });
          }
          const cur = (await OBS.request("GetCurrentProgramScene")).currentProgramSceneName;
          const r = await OBS.request("GetSceneItemList", { sceneName: cur });
          return json(res, 200, { scene: cur, items: r.sceneItems.map(i => ({ id: i.sceneItemId, name: i.sourceName, enabled: i.sceneItemEnabled })).reverse() });
        } catch (e) { return json(res, 502, { error: e.message }); }
      }
      case "/api/scene": broadcast("scene", { name: String(body.name || "").slice(0, 30) }); return json(res, 200, {});
      case "/api/reset": state = JSON.parse(JSON.stringify(DEFAULT_STATE));
        pushState(); return json(res, 200, state);
      case "/api/reset-layout": state.layout = JSON.parse(JSON.stringify(DEFAULT_LAYOUT)); pushState(); return json(res, 200, state);
    }
    return json(res, 404, { error: "not found" });
  }

  // Statische Dateien
  let p = url.pathname === "/" ? "/control.html" : decodeURIComponent(url.pathname);
  const root = p.startsWith("/uploads/") ? UPLOADS : PUBLIC;
  if (root === UPLOADS) p = p.slice("/uploads".length);
  const file = path.normalize(path.join(root, p));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end("Nicht gefunden"); }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
    res.end(data);
  });
});

YT.onMessage = m => broadcast("chat", m);
YT.sync(state.youtubeVideoId);
TW.onMessage = m => broadcast("chat", m);
TW.onChange = () => broadcast("state", view());
TW.start(state.twitchChannel);

server.listen(PORT, () => {
  console.log(`OBS-Overlay-Server läuft:  http://localhost:${PORT}`);
  console.log(`  Kontrollpanel:  http://localhost:${PORT}/`);
  for (const f of ["starting", "overlay", "alerts", "brb", "ending"]) console.log(`  OBS-Quelle:     http://localhost:${PORT}/${f}.html`);
  if (!PASSWORD) console.log("Hinweis: Kein CONTROL_PASSWORD gesetzt – Panel ist ungeschützt.");
});
