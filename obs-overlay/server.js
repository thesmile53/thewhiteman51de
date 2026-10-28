// OBS-Overlay-Server – keine Abhängigkeiten, nur Node >= 18.
// Start: node server.js   (PORT und CONTROL_PASSWORD per Umgebungsvariable)
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = +process.env.PORT || 3000;
const PASSWORD = process.env.CONTROL_PASSWORD || "";
const PUBLIC = path.join(__dirname, "public");
const STATE_FILE = path.join(__dirname, "state.json");

const DEFAULT_STATE = {
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

let state = { ...DEFAULT_STATE };
try { state = { ...DEFAULT_STATE, ...JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) }; } catch {}
const save = () => fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2), () => {});

const clients = new Set();
const broadcast = (event, data) => {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(msg);
};
const pushState = () => { save(); broadcast("state", { ...state, now: Date.now() }); };

// Nur bekannte Schlüssel mit passendem Typ übernehmen.
function merge(target, patch) {
  for (const k of Object.keys(DEFAULT_STATE)) {
    if (!(k in patch)) continue;
    const def = DEFAULT_STATE[k], v = patch[k];
    if (k === "goal" && v && typeof v === "object") {
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

const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon" };

function readBody(req) {
  return new Promise((resolve, reject) => {
    let b = "";
    req.on("data", c => { b += c; if (b.length > 1e5) { reject(new Error("too large")); req.destroy(); } });
    req.on("end", () => { try { resolve(b ? JSON.parse(b) : {}); } catch (e) { reject(e); } });
  });
}
const json = (res, code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");

  if (url.pathname === "/events") {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    res.write(`event: state\ndata: ${JSON.stringify({ ...state, now: Date.now() })}\n\n`);
    clients.add(res);
    const ping = setInterval(() => res.write(": ping\n\n"), 25000);
    req.on("close", () => { clearInterval(ping); clients.delete(res); });
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    if (req.method === "GET" && url.pathname === "/api/state") return json(res, 200, { ...state, now: Date.now() });
    if (req.method !== "POST") return json(res, 405, { error: "method" });
    if (PASSWORD && req.headers["x-password"] !== PASSWORD) return json(res, 401, { error: "Falsches Passwort" });
    let body;
    try { body = await readBody(req); } catch { return json(res, 400, { error: "bad json" }); }

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
      case "/api/scene": broadcast("scene", { name: String(body.name || "").slice(0, 30) }); return json(res, 200, {});
      case "/api/reset": state = { ...DEFAULT_STATE }; pushState(); return json(res, 200, state);
    }
    return json(res, 404, { error: "not found" });
  }

  // Statische Dateien
  let p = url.pathname === "/" ? "/control.html" : decodeURIComponent(url.pathname);
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end("Nicht gefunden"); }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`OBS-Overlay-Server läuft:  http://localhost:${PORT}`);
  console.log(`  Kontrollpanel:  http://localhost:${PORT}/`);
  for (const f of ["starting", "overlay", "alerts", "brb", "ending"]) console.log(`  OBS-Quelle:     http://localhost:${PORT}/${f}.html`);
  if (!PASSWORD) console.log("Hinweis: Kein CONTROL_PASSWORD gesetzt – Panel ist ungeschützt.");
});
