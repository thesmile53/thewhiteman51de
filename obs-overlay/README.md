# OBS Stream-Overlay

Fertige Browser-Quellen (1920×1080) für OBS. Alles wird in `config.js` angepasst.

| Datei | Zweck | Hintergrund |
|---|---|---|
| `starting.html` | Starting Soon mit Countdown (`?min=10`) | solid |
| `brb.html` | Pause mit Zähler | solid |
| `ending.html` | Abschluss + nächster Stream | solid |
| `overlay.html` | Live-Overlay: Cam-Rahmen, Lower Third, Ziel, Ticker, Chat-Box (`?cur=42&target=100`) | transparent |
| `alerts.html` | Follower/Sub/Spenden-Popups (Test: `?test=1` oder Tasten F/S/D) | transparent |

## Einrichtung in OBS
1. Quelle hinzufügen → **Browser** → *Lokale Datei* aktivieren → HTML-Datei wählen.
2. Breite **1920**, Höhe **1080**. Eigenes CSS im Feld leeren (Standard-CSS entfernen).
3. Szenen: *Starting* (starting.html), *Live* (Game Capture → Webcam → overlay.html → alerts.html), *BRB*, *Ending*.
4. Webcam auf 480×270 skalieren und links unten (x=40, y=714) in den Rahmen legen.
5. Chat: Twitch/YouTube-Chat-URL als eigene Browserquelle über die Chat-Box legen (x=1460, y=40, 420×560).
6. Alerts: `window.showAlert(...)` aus einem Bot/StreamElements-Hook aufrufen oder Dienst-Alertbox statt `alerts.html` nutzen.

Farben ändern: Variablen `--a` / `--b` in `style.css`.
