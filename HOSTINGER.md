# Hostinger Docker Manager Deployment

Die produktiv empfohlene Hostinger-Variante für dieses Projekt ist aktuell die **Pfad-Variante** über:

```text
docker-compose.yml
```

Mehr dazu steht in:

```text
HOSTINGER-PATH.md
```

## Warum diese Datei noch existiert

Diese Datei bleibt nur als kurze Orientierung im Repo, weil das Deployment in mehreren Iterationen entstanden ist.

Der aktuelle empfohlene Weg ist:

- Repository in Hostinger Docker Manager verbinden
- `docker-compose.yml` wählen
- `.env` anhand von `.env.hostinger-path.example` setzen, inklusive `IMAGE`
- App unter einem Pfad wie `/terminal-todo/` betreiben

Die Compose-Datei nutzt dafür bewusst ein vorgebautes GHCR-Image statt `build: .`, damit Hostinger den Container zuverlässig per Pull starten kann.

## Warum die Pfad-Variante empfohlen ist

Für normale Browser, besonders auf restriktiven Firmenrechnern, ist das meist robuster als ein Zugriff über eine URL mit explizitem Port.

Beispiel:

```text
https://apps.deinedomain.de/terminal-todo/
```
