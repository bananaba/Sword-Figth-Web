import test from "node:test";
import assert from "node:assert/strict";
import worker from "../dist/index.js";

function createEnv(overrides = {}) {
  return {
    RANKED_QUEUE: {
      idFromName(name) {
        return name;
      },
      get(id) {
        return {
          async fetch(request) {
            return new Response(
              JSON.stringify({
                queued: true,
                queueId: id,
                method: request.method,
              }),
              { headers: { "content-type": "application/json" } },
            );
          },
        };
      },
    },
    DUEL_ROOM: {
      idFromName(name) {
        return name;
      },
      get(id) {
        return {
          async fetch(request) {
            return new Response(
              JSON.stringify({
                roomId: id,
                upgrade: request.headers.get("upgrade"),
              }),
              { headers: { "content-type": "application/json" } },
            );
          },
        };
      },
    },
    LEADERBOARD: {
      idFromName(name) {
        return name;
      },
      get(id) {
        return {
          async fetch(request) {
            const url = new URL(request.url);
            return new Response(
              JSON.stringify({
                forwardedTo: id,
                method: request.method,
                pathname: url.pathname,
              }),
              { headers: { "content-type": "application/json" } },
            );
          },
        };
      },
    },
    ...overrides,
  };
}

test("GET /healthz returns ok JSON", async () => {
  const response = await worker.fetch(new Request("https://worker.test/healthz"), createEnv());

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/json");
  assert.deepEqual(await response.json(), { ok: true, service: "chambara-ranked-worker" });
});

test("GET /leaderboard forwards to the global Leaderboard object", async () => {
  const response = await worker.fetch(new Request("https://worker.test/leaderboard"), createEnv());

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    forwardedTo: "global",
    method: "GET",
    pathname: "/leaderboard",
  });
});

test("GET /me forwards to the global Leaderboard object", async () => {
  const response = await worker.fetch(
    new Request("https://worker.test/me?playerId=p1"),
    createEnv(),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    forwardedTo: "global",
    method: "GET",
    pathname: "/me",
  });
});

test("GET /leaderboard 500s if the LEADERBOARD binding is missing", async () => {
  const env = createEnv();
  env.LEADERBOARD = undefined;
  const response = await worker.fetch(new Request("https://worker.test/leaderboard"), env);

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "leaderboard_binding_missing" });
});

test("POST /matchmake forwards the request to the global RankedQueue object", async () => {
  const response = await worker.fetch(
    new Request("https://worker.test/matchmake", { method: "POST" }),
    createEnv(),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    queued: true,
    queueId: "global",
    method: "POST",
  });
});

test("GET /rooms/:roomId forwards the request to the named DuelRoom object", async () => {
  const response = await worker.fetch(
    new Request("https://worker.test/rooms/ranked-p1-p2", {
      headers: { upgrade: "websocket" },
    }),
    createEnv(),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    roomId: "ranked-p1-p2",
    upgrade: "websocket",
  });
});

test("unknown routes return 404 JSON", async () => {
  const response = await worker.fetch(new Request("https://worker.test/nope"), createEnv());

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "not_found" });
});

test("GET /healthz response carries permissive CORS headers", async () => {
  const response = await worker.fetch(new Request("https://worker.test/healthz"), createEnv());

  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  assert.equal(response.headers.get("access-control-allow-methods"), "GET, POST, OPTIONS");
  assert.equal(response.headers.get("access-control-allow-headers"), "content-type");
});

test("OPTIONS preflight returns 204 with CORS headers", async () => {
  const response = await worker.fetch(
    new Request("https://worker.test/matchmake", { method: "OPTIONS" }),
    createEnv(),
  );

  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  assert.equal(response.headers.get("access-control-max-age"), "86400");
});
