# Public no-install API

MagIranPlus can be used from Safari, Chrome, or another mobile browser without installing an app. The browser only needs to reach the public API; the API server performs the Magiran request.

## Required topology

```text
visitor browser -> GitHub Pages -> public API origin -> Magiran
```

The public API origin must be a server or hosting network that can reach Magiran. For the intended Iranian audience, use an Iranian-network origin. Cloudflare may sit in front of that origin for HTTPS, DNS, caching, and access protection, but it does not change the egress network of the origin.

Do not send visitor V2Ray links to this API. A V2Ray link contains private server credentials. The API accepts only the Magiran search URL and the existing article/export payloads.

## Server configuration

Run `server.py` with Python 3.12+ and install `requirements.txt`. Set:

```text
HOST=0.0.0.0
PORT=5000
MAGIRAN_ALLOWED_ORIGINS=https://soheil-aghayani.github.io
```

If the administrator has an approved HTTP(S) egress proxy, it can be configured server-side with `MAGIRAN_EGRESS_PROXY`. This is optional and is never read from request JSON. The `/api/health` response reports `fetch_route` as `direct` or `configured-proxy` without exposing the proxy value.

## Frontend configuration

Set `MAGIRAN_PUBLIC_API_BASE_URL` in `web/config.js` to the HTTPS URL of the deployed API, or to the URL of the Cloudflare Worker bridge whose `UPSTREAM_ORIGIN` points to that API. Do not point the public build at a Render origin unless it has a confirmed Magiran-reachable egress.

The public build tries this API first, then the optional localhost API. Localhost is only a fallback for development/private use; visitors do not need to install or run it.

## Acceptance check

1. Open the public site from a phone without running a local service.
2. `GET /api/health` returns HTTP 200 and `fetch_route` is visible.
3. Submit a real `www.magiran.com/searchinpapers?...` URL.
4. Confirm that `/api/parse-search` returns `complete: true` or an explicit page-status warning.
5. Test Word and JSON downloads from Safari.

If the origin cannot reach Magiran, use the HTML import path. The application must not claim that a Render or Cloudflare bridge has Iranian egress unless the origin has been tested from the target network.
