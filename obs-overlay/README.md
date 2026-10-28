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

## Eigene Quellen erstellen
Im Kontrollpanel unter **Quellen** kannst du eigene Elemente hinzufügen, die im Live-Overlay erscheinen:

- **Text** – frei wählbarer Text mit Schriftgröße, Farbe, Ausrichtung
- **Bild** – per URL oder direkt **hochladen** (PNG/JPG/GIF/WEBP, max. 8 MB, gespeichert in `uploads/`)
- **Web-Seite** – beliebige https-Adresse als eingebettetes Fenster (z. B. Chat, Widgets)
- **Fläche** – farbige Box (Hintergrund, Deckkraft, Rundung)

Jede Quelle platzierst du im Layout-Editor (gelbe Boxen), kannst sie ein-/ausblenden, in der Reihenfolge nach vorne/hinten schieben oder löschen. Hinweis: Manche Seiten (z. B. twitch.tv) verbieten das Einbetten – dafür ist weiterhin eine eigene OBS-Browser-Quelle nötig.

## Chat einblenden
Kontrollpanel → Karte **Chat einblenden**: Twitch-Kanalname oder YouTube-Live-Video-ID eintragen und auf den Knopf klicken (oder eine eigene Chat-Adresse eingeben). Der Chat erscheint in der Chat-Box des Live-Overlays; Position/Größe über den Layout-Editor („Chat“). Die Adresse wird automatisch an den Hostnamen angepasst, unter dem OBS das Overlay lädt (z. B. `localhost`).

## Live-Overlay bearbeiten
Kontrollpanel → **Live-Overlay bearbeiten**: Webcam-Rahmen, LIVE-Badge, Lower Third, Chat, Ziel-Balken und Ticker lassen sich einzeln an- und ausschalten; LIVE-Text, Ticker-Label und Chat-Titel sind änderbar. Ausgeblendete Elemente erscheinen im Layout-Editor abgedunkelt.

## OBS direkt steuern (Szenen wechseln, Webcam an/aus)
Das Overlay selbst kann die echte Webcam nicht ausblenden – sie ist eine OBS-Quelle. Dafür gibt es im Panel die Karte **OBS-Steuerung** (nutzt das in OBS 28+ eingebaute WebSocket):

1. OBS: *Werkzeuge → WebSocket-Servereinstellungen* → „WebSocket-Server aktivieren“, Passwort setzen.
2. Panel: Host/Port (Standard `127.0.0.1:4455`) und Passwort eintragen → **Verbinden**.
3. Szenen per Klick wechseln; Quellen der aktuellen Szene (Webcam, Mikrofon-Anzeige, …) per Haken ein-/ausschalten.

Die Zugangsdaten stehen in `obs-config.json` (nur lokal, nicht im Repo) und werden nie an Browser gesendet. Läuft der Server nicht auf dem OBS-Rechner, Host entsprechend ändern.

## Eigener Twitch-Chat (ohne Zustimmungs-Banner)
Der eingebettete Twitch-Chat („Twitch-Embed“) verlangt eine Zustimmung zu Twitchs Regeln/Cookies. Besser: im Panel unter **Chat einblenden** den Kanalnamen eintragen und **Eigener Chat (empfohlen)** klicken. Das Overlay liest den öffentlichen Chat dann anonym (read-only, ohne Login) über Twitchs offizielle IRC-Schnittstelle mit und zeigt ihn im eigenen Design inkl. Emotes. Schreiben ist darüber nicht möglich.
