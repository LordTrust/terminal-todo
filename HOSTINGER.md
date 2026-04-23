# Hostinger Docker Manager Deployment

Diese Variante ist speziell für **Hostinger VPS + Docker Manager + Traefik** vorbereitet.

## Dateien

- Compose für Docker Manager: `docker-compose.hostinger.yml`
- Env-Beispiel: `.env.hostinger.example`

## Erwartetes Routing

Die Compose-Datei folgt Hostingers Traefik-Muster:

```text
${COMPOSE_PROJECT_NAME}.${TRAEFIK_HOST}
```

Beispiel:

```text
COMPOSE_PROJECT_NAME=terminal-todo
TRAEFIK_HOST=apps.meinedomain.de
```

Dann wäre die App erreichbar unter:

```text
terminal-todo.apps.meinedomain.de
```

## Vorbedingungen

1. Du hast einen **Hostinger VPS**
2. **Docker Manager** ist aktiv
3. **Traefik** läuft bereits auf dem VPS
4. Das externe Docker-Netzwerk `traefik-proxy` existiert
5. DNS zeigt auf deinen VPS

## Deployment im Docker Manager

### Option A: YAML direkt im Docker Manager

1. In Hostinger den Docker Manager öffnen
2. Neues Projekt / Compose-Projekt anlegen
3. Inhalt aus `docker-compose.hostinger.yml` einfügen
4. Umgebungsvariablen setzen:
   - `COMPOSE_PROJECT_NAME=terminal-todo`
   - `TRAEFIK_HOST=apps.deinedomain.tld`
5. Deploy starten

### Option B: aus Repository

1. Repo nach Hostinger verbinden oder auf den VPS klonen
2. `docker-compose.hostinger.yml` als Compose-Datei verwenden
3. Env-Werte setzen
4. Deploy starten

## Wichtige Hinweise

- Diese Hostinger-Datei veröffentlicht **keinen direkten Host-Port**.
- Der Zugriff läuft sauber über **Traefik + HTTPS**.
- Die SQLite-Daten liegen in einem persistenten Docker-Volume: `terminal_todo_data`

## Wenn du eine feste Domain statt Hostinger-Substruktur willst

Aktuell ist die Route im Hostinger-Stil:

```text
Host(`${COMPOSE_PROJECT_NAME}.${TRAEFIK_HOST}`)
```

Wenn du stattdessen etwas willst wie:

```text
todo.deinedomain.de
```

ändere das Label zu:

```yaml
- traefik.http.routers.${COMPOSE_PROJECT_NAME}.rule=Host(`todo.deinedomain.de`)
```

Dann brauchst du `TRAEFIK_HOST` dafür nicht mehr.

## Persistenz / Mehrgeräte-Sync

Der Mehrgeräte-Sync funktioniert, weil alle Clients dieselbe Server-API und dieselbe SQLite-Datei verwenden.

Das bedeutet:
- Handy, Laptop, Desktop sehen denselben Stand
- Änderungen werden beim Öffnen/Fokus neu geladen
- zusätzlich pollt das Frontend alle 10 Sekunden

## Empfehlung

Für den ersten produktiven Deploy auf Hostinger würde ich so vorgehen:

1. erst mit Hostinger-Traefik-Muster deployen
2. prüfen, ob HTTPS + Routing sauber funktioniert
3. danach, wenn gewünscht, auf eine schönere feste Subdomain umstellen

## Nächster sinnvoller Schritt

Wenn du mir deine echte Domain-Struktur nennst, passe ich dir die Datei direkt an, z.B. auf:

- `todo.deinedomain.de`
- `maik-tools.deinedomain.de`
- `terminaltodo.deinedomain.de`
