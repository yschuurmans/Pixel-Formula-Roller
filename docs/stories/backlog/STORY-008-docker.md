# STORY-008: Docker & Docker Compose

## Goal
Package the app so it can be deployed via `docker compose up`, while keeping `npm run dev` working unchanged for local development.

## Approach
- **Dev**: `npm run dev` (Vite dev server, port 5173) — no Docker involvement
- **Production**: multi-stage Dockerfile builds static assets, nginx serves them
- **Docker Compose**: single service wrapping the nginx container; exposes configurable port

## Acceptance Criteria

### Dockerfile
- [ ] Multi-stage build:
  - Stage 1 (`builder`): `node:lts-alpine`, `npm ci`, `npm run build` → outputs `/app/dist`
  - Stage 2 (`runner`): `nginx:alpine`, copies `/app/dist` to `/usr/share/nginx/html`
- [ ] Custom `nginx.conf` included with:
  - SPA fallback: `try_files $uri $uri/ /index.html` (required for React Router client-side routing)
  - Gzip compression enabled
  - `Cache-Control: max-age=31536000, immutable` for hashed static assets (`*.js`, `*.css`, etc.)
  - `Cache-Control: no-cache` for `index.html`
  - A comment in `nginx.conf`: `# Web Bluetooth requires HTTPS. Put a TLS-terminating proxy in front of this container in any non-localhost deployment.`
- [ ] `docker build .` completes without errors

### Docker Compose
- [ ] `docker-compose.yml` at project root
- [ ] Single service `app`, builds from local Dockerfile
- [ ] Port mapping: `${APP_PORT:-80}:80`
- [ ] `docker compose up --build` starts the app and serves it at the configured port
- [ ] `docker compose down` stops cleanly

### `.env.example`
- [ ] File committed to the repository containing:
  ```
  APP_PORT=80
  ```

### `.dockerignore`
- [ ] Excludes: `node_modules/`, `.git/`, `dist/`, `.env*`

### README
- [ ] Documents both workflows:
  ```
  # Development
  npm install && npm run dev    # http://localhost:5173

  # Production (Docker)
  cp .env.example .env          # adjust APP_PORT if needed
  docker compose up --build     # http://localhost
  ```
- [ ] Includes a HTTPS note: "Web Bluetooth requires a secure origin (HTTPS) in any deployment beyond localhost. Use Caddy or nginx + Certbot as a TLS-terminating reverse proxy."

## Notes
- No backend service — Docker Compose has exactly one service.
- `npm run dev` must remain untouched; Dockerfile only uses `npm run build`.
- Implement last, after all feature stories are done.
- Depends on STORY-001.
