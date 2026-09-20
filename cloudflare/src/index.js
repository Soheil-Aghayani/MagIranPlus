const DEFAULT_UPSTREAM = "https://magiranplus-api.onrender.com";
const ALLOWED_ORIGINS = new Set([
  "https://soheil-aghayani.github.io",
  "http://127.0.0.1:5000",
  "http://localhost:5000"
]);

function corsHeaders(request) {
  const headers = new Headers();
  const origin = request.headers.get("Origin");

  if (ALLOWED_ORIGINS.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  }
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  headers.set("Access-Control-Expose-Headers", "Content-Disposition");
  headers.set("Vary", "Origin");
  return headers;
}

function responseWithCors(response, request) {
  const headers = new Headers(response.headers);
  const cors = corsHeaders(request);
  cors.forEach((value, key) => headers.set(key, value));

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function isBodylessMethod(method) {
  return method === "GET" || method === "HEAD";
}

export default {
  async fetch(request, env) {
    const incomingUrl = new URL(request.url);

    if (request.method === "OPTIONS") {
      return responseWithCors(new Response(null, { status: 204 }), request);
    }

    if (!incomingUrl.pathname.startsWith("/api/")) {
      return responseWithCors(
        new Response("MagIranPlus API bridge", { status: 404 }),
        request
      );
    }

    const upstreamOrigin = env.UPSTREAM_ORIGIN || DEFAULT_UPSTREAM;
    const upstreamUrl = new URL(
      incomingUrl.pathname + incomingUrl.search,
      upstreamOrigin
    );
    const headers = new Headers(request.headers);
    headers.delete("Host");
    headers.delete("Origin");

    const upstreamRequest = new Request(upstreamUrl, {
      method: request.method,
      headers,
      body: isBodylessMethod(request.method) ? undefined : request.body,
      redirect: "manual"
    });

    try {
      const response = await fetch(upstreamRequest);
      return responseWithCors(response, request);
    } catch (error) {
      return responseWithCors(
        Response.json(
          {
            ok: false,
            error: "ارتباط با سرویس استخراج برقرار نشد.",
            detail: error instanceof Error ? error.message : String(error)
          },
          { status: 502 }
        ),
        request
      );
    }
  }
};
