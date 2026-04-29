export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  applyCors(headers);
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function corsPreflight(): Response {
  const headers = new Headers();
  applyCors(headers);
  headers.set("access-control-max-age", "86400");
  return new Response(null, { status: 204, headers });
}

function applyCors(headers: Headers): void {
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-methods", "GET, POST, OPTIONS");
  headers.set("access-control-allow-headers", "content-type");
}
