# Terminal ToDo

Terminal-artige Web-ToDo-App mit Mehrgeräte-Sync.

## Was jetzt drin ist

- dunkles, mattes Terminal-Design
- Monospace-Schrift
- frei wählbare Task-Symbole wie `[ ]` / `[X]`
- Task-Farben pro Eintrag
- globales Theme mit Orange als Standard-Akzent
- Klick zum Erledigen
- **Mehrgeräte-Sync über Server + SQLite**
- **Docker-ready für Hostinger VPS**

## Architektur

Die App ist jetzt **nicht mehr nur statisch im Browser**.

Sie besteht aus:

- **Frontend**: HTML, CSS, Vanilla JS
- **Backend**: Flask API
- **Datenbank**: SQLite
- **Betrieb**: Docker Compose

Das ist für deinen Fall sinnvoll, weil:

- mehrere Geräte dieselben Tasks sehen
- keine separate externe Datenbank nötig ist
- SQLite für einen persönlichen ToDo-Stack sehr gut reicht
- das Deployment auf einem kleinen VPS sehr einfach bleibt

## Projektstruktur

```text
terminal-todo-app/
├── .dockerignore
├── .env.example
├── app.js
├── Dockerfile
├── HOSTINGER.md
├── docker-compose.hostinger-traefik.example.yml
├── docker-compose.hostinger.yml
├── docker-compose.yml
├── index.html
├── README.md
├── requirements.txt
├── server.py
└── styles.css
```

## API / Sync-Verhalten

- Tasks und Theme liegen zentral in SQLite
- alle Geräte sprechen mit derselben API
- das Frontend zieht Änderungen beim Öffnen/Fokus neu
- zusätzlich erfolgt ein Auto-Refresh alle 10 Sekunden

Das ist für persönliche Nutzung meist völlig ausreichend.
Wenn du später echte Live-Synchronisierung möchtest, kann ich noch WebSockets ergänzen.

## Lokal starten ohne Docker

```bash
cd /data/.openclaw/workspace/terminal-todo-app
pip install -r requirements.txt
python3 server.py
```

Dann öffnen:

```text
http://localhost:8080
```

## Docker lokal starten

```bash
cd /data/.openclaw/workspace/terminal-todo-app
docker compose up -d --build
```

Dann öffnen:

```text
http://localhost:8080
```

## Datenpersistenz

Die SQLite-Datenbank liegt im Container unter:

```text
/app/data/terminal_todo.db
```

Per Compose wird dafür ein **persistentes Docker-Volume** angelegt:

```text
terminal_todo_data
```

Das bedeutet:
- Container neu bauen: Daten bleiben erhalten
- Server neu starten: Daten bleiben erhalten
- mehrere Geräte: gleiche Datenbasis

## Hostinger VPS Deployment

## Wichtig

Für Docker solltest du das auf einem **Hostinger VPS** betreiben, nicht auf normalem Shared Hosting.

## Empfohlener Ablauf

### 1. Projekt auf den Server bringen
Zum Beispiel per Git:

```bash
git clone <dein-repo>
cd terminal-todo-app
```

Oder per SCP/SFTP hochladen.

### 2. Optional `.env` anlegen

```bash
cp .env.example .env
```

Wenn du willst, kannst du dort z.B. den Host-Port ändern.

### 3. Docker Compose starten

```bash
docker compose up -d --build
```

### 4. Port testen

Wenn du den Container auf Port 8080 veröffentlicht hast:

```text
http://DEIN-SERVER:8080
```

### 5. Optional: Domain davorsetzen
Für produktiven Betrieb ist das sauberer, zum Beispiel:

```text
todo.deinedomain.de
```

Davor kannst du setzen:
- Nginx
- Caddy
- Traefik

Dann leitest du auf den internen App-Port `8080` weiter.

## Minimalbeispiel Reverse Proxy

Beispielidee:

- `todo.deinedomain.de` → Reverse Proxy
- Reverse Proxy → `terminal-todo:8080`

Für Hostinger Docker Manager + Traefik liegt jetzt eine direkt passende Compose-Datei bei:

```text
docker-compose.hostinger.yml
```

Zusätzlich:

```text
.env.hostinger.example
HOSTINGER.md
```

Diese Variante orientiert sich am aktuellen Hostinger-Traefik-Muster mit:

```text
${COMPOSE_PROJECT_NAME}.${TRAEFIK_HOST}
```

Wenn du willst, passe ich dir das auch direkt auf deine echte Domain an.

## Backup-Empfehlung

Auch bei SQLite solltest du Backups einplanen.

Einfachster Weg:
- regelmäßiges Kopieren der DB-Datei oder des Docker-Volumes
- optional täglicher Cronjob auf dem Server

Wenn du willst, baue ich dir auch noch ein kleines Backup-Skript dazu.

## Warum SQLite hier reicht

SQLite ist hier sehr wahrscheinlich die beste erste Wahl.

Vorteile:
- kein extra DB-Container nötig
- weniger moving parts
- leicht zu sichern
- ideal für 1 Benutzer oder kleinen privaten Einsatz

Ich würde erst auf Postgres gehen, wenn du brauchst:
- mehrere Benutzerkonten
- komplexere Rechte
- deutlich mehr Last
- andere Integrationen

## Nächste sinnvolle Ausbaustufen

Wenn du möchtest, kann ich direkt weitermachen mit:

1. **Login-Schutz**
   - Basic Auth oder App-Login

2. **Reverse-Proxy-Setup für Hostinger**
   - Caddy oder Traefik
   - Domain + HTTPS

3. **Bearbeiten von Tasks**
   - Text ändern
   - Symbole nachträglich ändern

4. **Live Sync statt Polling**
   - WebSockets

5. **PWA-Version**
   - auf Handy installierbar
   - app-artiges Verhalten
