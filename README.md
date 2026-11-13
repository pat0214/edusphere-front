# EduSphere frontend

React 19, TypeScript, and Vite frontend for EduSphere. The PHP API is deployed separately; local development uses Vite's `/api` proxy to `http://127.0.0.1:8080`.

## Local development

1. Install Node.js 22 or newer and PHP 8.2 or newer.
2. Copy `.env.example` to `.env.local` if you need to set a Google client ID or custom API URL.
3. Install dependencies and start the frontend and local API:

   ```sh
   npm ci
   npm run dev
   ```

The app runs at `http://localhost:5173`. Configure the backend separately; see its `.env.example` for database and integration settings.

## Build and checks

```sh
npm run typecheck
npm run lint
npm run build
```

## Render static site

The included `render.yaml` creates a static site, builds with `npm ci && npm run build`, and rewrites `/billing` and other client-side routes to `index.html`. If the service was created directly in the Render Dashboard instead of from this Blueprint, add a **Rewrite** rule under the static site's **Redirects/Rewrites** settings: source `/billing`, destination `/index.html`. Also add a catch-all SPA rule with source `/*` and destination `/index.html`. When prompted or in the Render dashboard, set:

- `VITE_API_BASE_URL`: the public backend origin, such as `https://your-api.onrender.com` (no trailing slash). This is used by both the app API and Pico's study chat.
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID`: the web OAuth client ID, if Google sign-in is enabled.

After deployment, set `ALLOWED_ORIGINS` on the backend to this site's exact HTTPS origin. Keep API keys and other secrets on the backend; Vite variables are public and included in the browser bundle.
