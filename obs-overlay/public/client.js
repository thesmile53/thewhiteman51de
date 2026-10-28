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
    applyLayout(layout, map) {
      for (const k in map) {
        const l = layout && layout[k], el = map[k];
        if (!l || !el) continue;
        el.style.left = l.x + "px"; el.style.top = l.y + "px";
        el.style.width = l.w + "px"; el.style.height = l.h + "px";
        el.style.right = el.style.bottom = "auto";
      }
    },
    // Eigene Quellen in einen Container rendern (Elemente bleiben erhalten, damit iframes nicht neu laden).
    renderItems(container, items) {
      const keep = new Set();
      items.forEach((it, idx) => {
        keep.add(it.id);
        let el = container.querySelector(`[data-id="${it.id}"]`);
        if (!el || el.dataset.type !== it.type) {
          el && el.remove();
          el = document.createElement("div");
          el.dataset.id = it.id; el.dataset.type = it.type; el.className = "item";
          container.appendChild(el);
        }
        const st = el.style;
        st.left = it.x + "px"; st.top = it.y + "px"; st.width = it.w + "px"; st.height = it.h + "px";
        st.display = it.visible ? "" : "none"; st.zIndex = idx; st.borderRadius = it.radius + "px";
        const hex = it.bg, a = it.alpha / 100;
        st.background = hex ? `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})` : "transparent";
        if (it.type === "text") {
          st.color = it.color; st.fontSize = it.fontSize + "px"; st.textAlign = it.align;
          st.justifyContent = { left: "flex-start", center: "center", right: "flex-end" }[it.align];
          if (el.textContent !== it.text) el.textContent = it.text;
        } else if (it.type === "image" || it.type === "embed") {
          const tag = it.type === "image" ? "img" : "iframe";
          let c = el.firstChild;
          if (!c) { c = document.createElement(tag); if (tag === "iframe") c.setAttribute("frameborder", "0"); el.appendChild(c); }
          if (it.url && c.getAttribute("src") !== it.url) c.setAttribute("src", it.url);
          if (!it.url) c.removeAttribute("src");
        }
      });
      container.querySelectorAll(".item").forEach(el => { if (!keep.has(el.dataset.id)) el.remove(); });
    },
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
