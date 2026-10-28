# OBS Stream-Overlay (Node.js-Server + Web-Kontrollpanel)

Läuft ohne Abhängigkeiten, nur **Node.js ≥ 18** nötig.

```bash
node server.js
# oder mit Passwort / anderem Port:
CONTROL_PASSWORD=geheim PORT=8080 node server.js
```

- **Kontrollpanel:** http://localhost:3000/ (auch vom Handy im selben WLAN: `http://<PC-IP>:3000/`)
- Änderungen (Texte, Ziel, Farben, Ticker, Ein-/Ausblenden, Alerts, Countdown) wirken **sofort** in OBS per Live-Verbindung und werden in `state.json` gespeichert.

## OBS-Quellen
Browser-Quelle hinzufügen, **URL** (nicht „Lokale Datei“), Größe 1920×1080:

| Szene | URL |
|---|---|
| Starting (Countdown) | `http://localhost:3000/starting.html` |
| Live-Overlay (transparent) | `http://localhost:3000/overlay.html` |
| Alerts (transparent) | `http://localhost:3000/alerts.html` |
| BRB | `http://localhost:3000/brb.html` |
| Ending | `http://localhost:3000/ending.html` |

Webcam auf 480×270 bei x=40, y=714 in den Rahmen legen. Chat als eigene Browser-Quelle über die Chat-Box (x=1460, y=40, 420×560).

## API (z. B. für Bots / Stream Deck)
Bei gesetztem Passwort Header `x-password` mitsenden.

```bash
curl -X POST localhost:3000/api/alert -H 'Content-Type: application/json' \
  -d '{"kind":"Neuer Follower","who":"Max","msg":"Willkommen!"}'
curl -X POST localhost:3000/api/state -d '{"goal":{"current":42}}'
curl -X POST localhost:3000/api/countdown -d '{"minutes":10}'
```

Hinweis: Das Panel ist nur im lokalen Netz gedacht. Bei Zugriff aus dem Internet immer `CONTROL_PASSWORD` setzen und HTTPS vorschalten.

## Größe / Skalierung
Die Seiten skalieren sich automatisch auf die Größe der Browser-Quelle (zentriert, ohne Verzerrung). Am besten stellst du die Quelle auf die **Canvas-Größe** deiner OBS-Szene (Einstellungen → Video → Basisauflösung) und ziehst sie auf Vollbild (Strg+F). Bei 16:9 füllt das Overlay dann alles aus. Die Positionen für Webcam/Chat oben gelten für 1920×1080 und müssen bei anderer Auflösung proportional umgerechnet werden.

## Layout selbst anordnen
Im Kontrollpanel (oben, **Layout-Editor**) kannst du Webcam, LIVE-Badge, Lower Third, Chat, Ziel-Balken, Ticker und Alert-Box per Maus verschieben und in der Größe ändern (Ecke unten rechts). Feintuning mit Pfeiltasten (Shift = 10 px) oder den Zahlenfeldern. Die Änderungen sind sofort in OBS sichtbar und werden gespeichert; „Layout zurücksetzen“ stellt die Standardpositionen wieder her.
