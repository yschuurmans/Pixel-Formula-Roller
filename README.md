# Pixel Formula Roller

A mobile-first PWA that connects to [Pixels electronic dice](https://gamewithpixels.com/) over Web Bluetooth. Build dice formulas visually or via text, roll them, and watch the matching physical dice light up.

## Prerequisites

- Node.js 20+
- npm 10+
- Chrome or Edge (for Web Bluetooth support)

## Setup

```bash
# Install dependencies
npm install

# Start development server (http://localhost:5173)
npm run dev

# Run tests
npm test

# Production build
npm run build
```

## Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | React 19 + Vite 6 (TypeScript strict) |
| Styling | Tailwind CSS v4 + Press Start 2P font |
| State | Zustand with persist middleware |
| Routing | React Router v6 |
| Bluetooth | `@systemic-games/pixels-web-connect` |
| Formula parsing | `rpg-dice-roller` |
| Date formatting | `date-fns` |
| Tests | Vitest + Testing Library |

## Browser Support

| Browser | Support |
|---------|---------|
| Chrome / Edge (Android, Windows, macOS) | Full support |
| Linux Chrome | Requires `chrome://flags/#enable-web-bluetooth` |
| iOS Bluefy | Full support |
| Firefox / Safari | Web Bluetooth unsupported — guidance banner shown |

## Project Structure

```
src/
  pages/          # Route-level page components
  services/       # Business logic (formula parser, Pixels BLE)
  stores/         # Zustand state (useAppStore)
  types/          # Shared TypeScript types
  test/           # Vitest setup
docs/
  specs/          # Full product spec and BA review
  stories/        # Story backlog and progress tracking
```

## Notes

- Web Bluetooth requires HTTPS in production. Use a reverse proxy (Caddy, nginx + Certbot) for non-localhost deployments.
- See `CLAUDE.md` for full development guidelines and architecture decisions.
