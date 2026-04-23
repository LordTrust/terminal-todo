# Hostinger Docker Manager Deployment via Path Prefix

Diese Variante ist jetzt bewusst an dein bestehendes **OpenClaw-Compose-Muster** angelehnt.

Damit erreichst du die App z.B. unter:

```text
https://apps.deinedomain.de/terminal-todo/
```

## Dateien

- Compose: `docker-compose.yml`
- Env-Beispiel: `.env.hostinger-path.example`

## Beispiel `.env`

```text
COMPOSE_PROJECT_NAME=terminal-todo
TRAEFIK_HOST=apps.deinedomain.de
PATH_PREFIX=/terminal-todo
PORT=8080
DATABASE_PATH=/app/data/terminal_todo.db
```

## Technischer Stil

Wie bei deinem OpenClaw-Compose:

- `init: true`
- `ports: - "${PORT}:${PORT}"`
- `env_file: .env`
- `traefik.docker.network=${COMPOSE_PROJECT_NAME}_default`
- `${COMPOSE_PROJECT_NAME}-svc` als Traefik-Service
- lokaler Mount `./data:/app/data`

## Routing

Traefik matched auf:

- Host `${TRAEFIK_HOST}`
- Prefix `${PATH_PREFIX}`

Danach entfernt Traefik den Prefix per `StripPrefix`.

## Ergebnis

Mit den Beispielwerten wird die App erreichbar unter:

```text
https://apps.deinedomain.de/terminal-todo/
```

## Docker Manager Deployment

1. In Hostinger Docker Manager neues Projekt anlegen
2. Repository `LordTrust/terminal-todo` wählen
3. Compose-Datei `docker-compose.yml` wählen
4. `.env` setzen
5. Deploy starten

## Empfehlung

Für deinen Dienstrechner ist diese Variante sehr wahrscheinlich die bessere, weil dabei keine URL mit explizitem Port im Browser nötig ist.
