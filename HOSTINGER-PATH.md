# Hostinger Docker Manager Deployment via Path Prefix

Diese Variante ist für Fälle gedacht, in denen eine URL mit Port problematisch ist und du die App lieber unter einem Pfad betreiben willst, zum Beispiel:

```text
https://apps.deinedomain.de/terminal-todo/
```

## Dateien

- Compose: `docker-compose.hostinger-path.yml`
- Env-Beispiel: `.env.hostinger-path.example`

## Env-Beispiel

```text
COMPOSE_PROJECT_NAME=terminal-todo
TRAEFIK_HOST=apps.deinedomain.de
PATH_PREFIX=/terminal-todo
```

## Ergebnis

Mit diesen Werten wird die App erreichbar unter:

```text
https://apps.deinedomain.de/terminal-todo/
```

## Wie es funktioniert

Traefik matched auf:

- Host `apps.deinedomain.de`
- Path Prefix `/terminal-todo`

Danach entfernt Traefik den Prefix per `StripPrefix`, sodass die App intern weiterhin auf `/` und `/api/...` läuft.

## Wann das sinnvoll ist

Das ist oft sinnvoll, wenn:

- ein Firmenrechner URLs mit `:8080` oder anderen Ports blockt
- du mehrere kleine Tools unter derselben Domain bündeln willst
- du lieber eine zentrale Tool-Domain mit Pfaden statt viele Subdomains nutzt

## Docker Manager

1. Neues Compose-Projekt anlegen
2. `docker-compose.hostinger-path.yml` verwenden
3. Env-Variablen setzen
4. Deploy starten

## Wichtiger Hinweis

Pfadbasiertes Routing funktioniert nur sauber, wenn die App dafür vorbereitet ist. Diese App wurde dafür angepasst.
