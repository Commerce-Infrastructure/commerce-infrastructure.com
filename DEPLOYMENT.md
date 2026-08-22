# Deployment

## Current static hosting

The repository's `main` branch is currently published directly by GitHub Pages. GitHub Pages can publish the static discovery files and custom `404.html`, but it cannot inspect an HTTP `Accept` header or set `Vary: Accept`. It therefore cannot implement same-URL Markdown content negotiation.

## Edge deployment for full Accept: text/markdown support

`src/worker.js` and `wrangler.jsonc` implement the required behavior on Cloudflare Workers with static assets:

- `/` and `/index.html` return HTML by default and Markdown for `Accept: text/markdown`.
- Negotiated responses use `Vary: Accept, Accept-Encoding`.
- Unknown URLs return a real `404`; agents requesting Markdown receive a concise Markdown recovery body with links to `/`, `/llms.txt`, and `/sitemap.xml`.
- Clients that explicitly reject both supported representations receive `406 Not Acceptable`.

Before deploying, configure the domain to route through Cloudflare (or translate this small Worker to another edge runtime that can vary its cache by `Accept`). This is a hosting/DNS change, not a GitHub Pages setting.

After setting a least-privilege Cloudflare API token locally or in CI:

```sh
npm test
npm run build
npx wrangler deploy
```

Then bind the Worker to `commerce-infrastructure.com` and verify the production endpoints:

```sh
curl -sSI https://commerce-infrastructure.com/
curl -sSI -H 'Accept: text/markdown' https://commerce-infrastructure.com/
curl -sS -D - -o /dev/null -H 'Accept: text/markdown' https://commerce-infrastructure.com/not-a-real-page
curl -sS -o /dev/null -w '%{http_code}\n' https://commerce-infrastructure.com/not-a-real-page
```
