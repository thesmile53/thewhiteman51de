// Minimaler WebSocket-Client (ws:// und wss://) ohne Abhängigkeiten.
const net = require("net");
const tls = require("tls");
const crypto = require("crypto");

function frame(opcode, payload) {
  const mask = crypto.randomBytes(4), len = payload.length;
  const head = len < 126 ? Buffer.from([0x80 | opcode, 0x80 | len])
    : len < 65536 ? Buffer.from([0x80 | opcode, 0x80 | 126, len >> 8, len & 255])
    : (() => { const h = Buffer.alloc(10); h[0] = 0x80 | opcode; h[1] = 0x80 | 127; h.writeBigUInt64BE(BigInt(len), 2); return h; })();
  const masked = Buffer.from(payload);
  for (let i = 0; i < masked.length; i++) masked[i] ^= mask[i % 4];
  return Buffer.concat([head, mask, masked]);
}

// connect(url, { protocol, onopen, onmessage(text), onclose }) → { send(text), close() }
function connect(urlStr, { protocol, onopen, onmessage, onclose } = {}) {
  const u = new URL(urlStr), secure = u.protocol === "wss:", port = +u.port || (secure ? 443 : 80);
  const sock = secure ? tls.connect({ host: u.hostname, port, servername: u.hostname }) : net.connect({ host: u.hostname, port });
  let buf = Buffer.alloc(0), upgraded = false, frag = "", closed = false;
  const fire = () => { if (!closed) { closed = true; onclose && onclose(); } };

  sock.on(secure ? "secureConnect" : "connect", () => sock.write(
    `GET ${u.pathname || "/"}${u.search} HTTP/1.1\r\nHost: ${u.host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n` +
    `Sec-WebSocket-Key: ${crypto.randomBytes(16).toString("base64")}\r\nSec-WebSocket-Version: 13\r\n` +
    (protocol ? `Sec-WebSocket-Protocol: ${protocol}\r\n` : "") + "\r\n"));
  sock.on("error", () => {});
  sock.on("close", fire);
  sock.on("data", chunk => {
    buf = Buffer.concat([buf, chunk]);
    if (!upgraded) {
      const end = buf.indexOf("\r\n\r\n"); if (end < 0) return;
      if (!/^HTTP\/1\.1 101/.test(buf.toString("latin1", 0, end))) return sock.destroy();
      upgraded = true; buf = buf.subarray(end + 4); onopen && onopen();
    }
    for (;;) {
      if (buf.length < 2) return;
      let len = buf[1] & 127, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      if (buf.length < off + len) return;
      const op = buf[0] & 15, fin = buf[0] & 128, data = buf.subarray(off, off + len);
      buf = buf.subarray(off + len);
      if (op === 8) return sock.destroy();
      if (op === 9) sock.write(frame(10, data));
      else if (op === 1 || op === 0) { frag += data.toString("utf8"); if (fin) { const t = frag; frag = ""; onmessage && onmessage(t); } }
    }
  });
  return { send: t => sock.writable && sock.write(frame(1, Buffer.from(t))), close: () => { closed = true; sock.destroy(); } };
}

module.exports = { connect };
