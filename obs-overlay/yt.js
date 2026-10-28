// YouTube-Live-Chat über die YouTube Data API v3 (Schlüssel bleibt auf dem Server, geht nie an Browser).
const fs = require("fs");
const path = require("path");

const BASE = process.env.YT_API_BASE || "https://www.googleapis.com/youtube/v3";
const MIN_POLL = +process.env.YT_MIN_POLL || 8000; // Kontingent schonen: 5 Einheiten je Abruf, 10.000/Tag
const CFG = path.join(__dirname, "youtube-config.json");

let key = "";
try { key = JSON.parse(fs.readFileSync(CFG, "utf8")).key || ""; } catch {}

const st = { videoId: "", chatId: "", token: "", timer: null, gen: 0, error: "", active: false };
const mod = { onMessage: () => {} };

async function call(q) {
  const r = await fetch(BASE + q, { headers: { "x-goog-api-key": key } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error((j.error && j.error.message) || "HTTP " + r.status);
    e.reason = j.error && j.error.errors && j.error.errors[0] && j.error.errors[0].reason;
    throw e;
  }
  return j;
}

function emit(it) {
  const sn = it.snippet || {}, au = it.authorDetails || {};
  let text = sn.displayMessage || "";
  if (sn.type === "superChatEvent" && sn.superChatDetails) text = `[${sn.superChatDetails.amountDisplayString}] ` + (sn.superChatDetails.userComment || "");
  if (!text) return;
  mod.onMessage({ src: "youtube", name: au.displayName || "?", text, role: au.isChatOwner ? "owner" : au.isChatModerator ? "mod" : "" });
}

async function loop(gen, first) {
  let wait = 30000;
  try {
    if (!st.chatId) {
      const v = await call(`/videos?part=liveStreamingDetails&id=${encodeURIComponent(st.videoId)}`);
      const id = v.items && v.items[0] && v.items[0].liveStreamingDetails && v.items[0].liveStreamingDetails.activeLiveChatId;
      if (!id) throw new Error("Kein aktiver Live-Chat für dieses Video (läuft der Stream? Stimmt die ID?)");
      st.chatId = id; first = true;
    }
    const m = await call(`/liveChat/messages?liveChatId=${encodeURIComponent(st.chatId)}&part=snippet,authorDetails&maxResults=200` +
      (st.token ? `&pageToken=${encodeURIComponent(st.token)}` : ""));
    if (gen !== st.gen) return;
    st.token = m.nextPageToken || ""; st.error = ""; st.active = true;
    if (!first) (m.items || []).forEach(emit); // alten Verlauf beim Start nicht erneut anzeigen
    wait = Math.max(m.pollingIntervalMillis || 5000, MIN_POLL);
  } catch (e) {
    if (gen !== st.gen) return;
    st.active = false;
    st.error = String(e.message).split(key).join("***");
    wait = e.reason === "quotaExceeded" ? 600000 : 30000;
    if (e.reason === "liveChatEnded" || e.reason === "liveChatNotFound") { st.chatId = ""; st.token = ""; }
  }
  st.timer = setTimeout(() => loop(gen, false), wait);
}

function sync(videoId, force) {
  videoId = String(videoId || "");
  if (!force && videoId === st.videoId) return;
  clearTimeout(st.timer);
  Object.assign(st, { videoId, chatId: "", token: "", error: "", active: false, gen: st.gen + 1 });
  if (!videoId) return;
  if (!key) { st.error = "Kein API-Schlüssel gespeichert"; return; }
  loop(st.gen, true);
}

function setKey(k) {
  key = String(k || "").trim().slice(0, 120);
  if (key) fs.writeFileSync(CFG, JSON.stringify({ key }), { mode: 0o600 });
  else try { fs.unlinkSync(CFG); } catch {}
  sync(st.videoId, true);
}

const status = () => ({ hasKey: !!key, videoId: st.videoId, active: st.active, error: st.error });

Object.assign(mod, { sync, setKey, status });
module.exports = mod;
