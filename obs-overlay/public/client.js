// Gemeinsamer Client: verbindet per SSE mit dem Server und liefert State/Alerts.
(function () {
  // Skaliert die 1920x1080-Fläche auf jede Quellen-/Fenstergröße (zentriert, ohne Verzerrung).
  function fit() {
    const k = Math.min(innerWidth / 1920, innerHeight / 1080);
    const b = document.body;
    b.style.transform = `translate(${(innerWidth - 1920 * k) / 2}px,${(innerHeight - 1080 * k) / 2}px) scale(${k})`;
  }
  addEventListener("resize", fit);
  addEventListener("DOMContentLoaded", fit);

  let offset = 0;
  const handlers = { state: [], alert: [], scene: [] };
  window.Overlay = {
    on: (ev, fn) => handlers[ev].push(fn),
    now: () => Date.now() + offset, // Serverzeit
    fmt: s => String((s / 60) | 0).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0"),
    socials: s => s.socials.map(x => `<div><b>${esc(x.label)}</b>${esc(x.value)}</div>`).join(""),
  };
  function esc(t) { return String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
  window.esc = esc;
  const es = new EventSource("/events");
  es.addEventListener("state", e => {
    const s = JSON.parse(e.data);
    offset = s.now - Date.now();
    document.documentElement.style.setProperty("--a", s.colorA);
    document.documentElement.style.setProperty("--b", s.colorB);
    handlers.state.forEach(f => f(s));
  });
  es.addEventListener("alert", e => handlers.alert.forEach(f => f(JSON.parse(e.data))));
  es.addEventListener("scene", e => handlers.scene.forEach(f => f(JSON.parse(e.data))));
})();
