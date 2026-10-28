// OBS-WebSocket-v5-Client (OBS 28+: Werkzeuge → WebSocket-Servereinstellungen).
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const WS = require("./wsclient");

const CFG_FILE = path.join(__dirname, "obs-config.json");
const sha = s => crypto.createHash("sha256").update(s).digest("base64");

const obs = { cfg: null, conn: null, ready: false, pending: new Map(), n: 0, timer: null };
const send = obj => obs.conn && obs.conn.send(JSON.stringify(obj));

function onMessage(text) {
  let m; try { m = JSON.parse(text); } catch { return; }
  if (m.op === 0) { // Hello
    const d = { rpcVersion: 1, eventSubscriptions: 0 };
    if (m.d.authentication) d.authentication = sha(sha(obs.cfg.password + m.d.authentication.salt) + m.d.authentication.challenge);
    send({ op: 1, d });
  } else if (m.op === 2) { obs.ready = true; }
  else if (m.op === 7) {
    const p = obs.pending.get(m.d.requestId); if (!p) return;
    obs.pending.delete(m.d.requestId); clearTimeout(p.t);
    m.d.requestStatus.result ? p.resolve(m.d.responseData || {}) : p.reject(new Error(m.d.requestStatus.comment || "OBS-Fehler " + m.d.requestStatus.code));
  }
}

function open() {
  clearTimeout(obs.timer);
  if (!obs.cfg) return;
  obs.ready = false;
  const c = obs.conn = WS.connect(`ws://${obs.cfg.host}:${obs.cfg.port}`, {
    protocol: "obswebsocket.json",
    onmessage: onMessage,
    onclose: () => {
      if (obs.conn !== c) return;
      obs.ready = false;
      for (const p of obs.pending.values()) { clearTimeout(p.t); p.reject(new Error("Verbindung zu OBS getrennt")); }
      obs.pending.clear();
      if (obs.cfg) obs.timer = setTimeout(open, 5000);
    },
  });
}

function connect(cfg) {
  disconnect(false);
  obs.cfg = { host: String(cfg.host || "127.0.0.1"), port: Number(cfg.port) || 4455, password: String(cfg.password || "") };
  fs.writeFileSync(CFG_FILE, JSON.stringify(obs.cfg), { mode: 0o600 });
  open();
  return new Promise(r => { const t0 = Date.now(); const iv = setInterval(() => { if (obs.ready || Date.now() - t0 > 2500) { clearInterval(iv); r(obs.ready); } }, 80); });
}
function disconnect(forget = true) {
  clearTimeout(obs.timer);
  const c = obs.conn; obs.conn = null; obs.ready = false;
  if (forget) { obs.cfg = null; try { fs.unlinkSync(CFG_FILE); } catch {} }
  if (c) c.close();
}
function request(type, data = {}) {
  return new Promise((resolve, reject) => {
    if (!obs.ready) return reject(new Error("OBS nicht verbunden"));
    const id = String(++obs.n);
    const t = setTimeout(() => { obs.pending.delete(id); reject(new Error("OBS antwortet nicht")); }, 5000);
    obs.pending.set(id, { resolve, reject, t });
    send({ op: 6, d: { requestType: type, requestId: id, requestData: data } });
  });
}
const status = () => ({ configured: !!obs.cfg, connected: obs.ready, host: obs.cfg ? `${obs.cfg.host}:${obs.cfg.port}` : "" });
try { obs.cfg = JSON.parse(fs.readFileSync(CFG_FILE, "utf8")); open(); } catch {}

module.exports = { connect, disconnect, request, status };
