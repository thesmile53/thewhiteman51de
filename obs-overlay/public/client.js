// Gemeinsamer Client: verbindet per SSE mit dem Server und liefert State/Alerts.
(function () {
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
