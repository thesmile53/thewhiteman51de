// Minimaler OBS-WebSocket-v5-Client ohne Abhängigkeiten (OBS 28+: Werkzeuge → WebSocket-Servereinstellungen).
const net = require("net");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const CFG_FILE = path.join(__dirname, "obs-config.json");
const sha = s => crypto.createHash("sha256").update(s).digest("base64");

const obs = { cfg: null, sock: null, ready: false, pending: new Map(), n: 0, timer: null, buf: Buffer.alloc(0), upgraded: false, frag: "" };

function frame(opcode, payload) {
  const mask = crypto.randomBytes(4), len = payload.length;
  const head = len < 126 ? Buffer.from([0x80 | opcode, 0x80 | len])
    : len < 65536 ? Buffer.from([0x80 | opcode, 0x80 | 126, len >> 8, len & 255])
    : (() => { const h = Buffer.alloc(10); h[0] = 0x80 | opcode; h[1] = 0x80 | 127; h.writeBigUInt64BE(BigInt(len), 2); return h; })();
  const masked = Buffer.from(payload);
  for (let i = 0; i < masked.length; i++) masked[i] ^= mask[i % 4];
  return Buffer.concat([head, mask, masked]);
}
const send = obj => obs.sock && obs.sock.write(frame(1, Buffer.from(JSON.stringify(obj))));

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

function onData(chunk) {
  obs.buf = Buffer.concat([obs.buf, chunk]);
  if (!obs.upgraded) {
    const end = obs.buf.indexOf("\r\n\r\n"); if (end < 0) return;
    if (!/^HTTP\/1\.1 101/.test(obs.buf.toString("latin1", 0, end))) return obs.sock.destroy();
    obs.upgraded = true; obs.buf = obs.buf.subarray(end + 4);
  }
  for (;;) {
    const b = obs.buf; if (b.length < 2) return;
    let len = b[1] & 127, off = 2;
    if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
    else if (len === 127) { if (b.length < 10) return; len = Number(b.readBigUInt64BE(2)); off = 10; }
    if (b.length < off + len) return;
    const op = b[0] & 15, fin = b[0] & 128, data = b.subarray(off, off + len);
    obs.buf = b.subarray(off + len);
    if (op === 8) return obs.sock.destroy();
    if (op === 9) obs.sock.write(frame(10, data));
    else if (op === 1 || op === 0) { obs.frag += data.toString("utf8"); if (fin) { const t = obs.frag; obs.frag = ""; onMessage(t); } }
  }
}

function open() {
  clearTimeout(obs.timer);
  if (!obs.cfg) return;
  const sock = net.connect(obs.cfg.port, obs.cfg.host);
  obs.sock = sock; obs.ready = false; obs.upgraded = false; obs.buf = Buffer.alloc(0); obs.frag = "";
  sock.on("connect", () => sock.write(
    `GET / HTTP/1.1\r\nHost: ${obs.cfg.host}:${obs.cfg.port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n` +
    `Sec-WebSocket-Key: ${crypto.randomBytes(16).toString("base64")}\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Protocol: obswebsocket.json\r\n\r\n`));
  sock.on("data", onData);
  sock.on("error", () => {});
  sock.on("close", () => {
    if (obs.sock !== sock) return;
    obs.ready = false;
    for (const p of obs.pending.values()) { clearTimeout(p.t); p.reject(new Error("Verbindung zu OBS getrennt")); }
    obs.pending.clear();
    if (obs.cfg) obs.timer = setTimeout(open, 5000);
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
  const s = obs.sock; obs.sock = null; obs.ready = false;
  if (forget) { obs.cfg = null; try { fs.unlinkSync(CFG_FILE); } catch {} }
  if (s) s.destroy();
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
