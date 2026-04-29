import test from "node:test";
import assert from "node:assert/strict";
import { RankedQueue } from "../dist/ranked-queue.js";

function postMatchmake(body) {
  return new Request("https://worker.test/matchmake", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("RankedQueue queues the first valid player", async () => {
  const queue = new RankedQueue({}, {});

  const response = await queue.fetch(
    postMatchmake({ playerId: "p1", name: "Ada", rating: 1000, saberColor: "#38bdf8" }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: "queued",
    playerId: "p1",
    rating: 1000,
    queueSize: 1,
  });
});

test("RankedQueue matches two players inside the rating window", async () => {
  const queue = new RankedQueue({}, {});

  await queue.fetch(
    postMatchmake({ playerId: "p1", name: "Ada", rating: 1000, saberColor: "#38bdf8" }),
  );
  const response = await queue.fetch(
    postMatchmake({ playerId: "p2", name: "Ben", rating: 1120, saberColor: "#e879f9" }),
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "matched");
  assert.match(
    body.roomId,
    /^ranked-p1-p2-[0-9a-z]+-[0-9a-f-]{36}$/,
    "roomId must include a random suffix to keep DO instances unique per match",
  );
  assert.deepEqual(body.players, [
    { playerId: "p1", name: "Ada", rating: 1000, saberColor: "#38bdf8" },
    { playerId: "p2", name: "Ben", rating: 1120, saberColor: "#e879f9" },
  ]);
});

test("RankedQueue mints a fresh roomId every match between the same pair", async () => {
  const a = { playerId: "p1", name: "Ada", rating: 1000, saberColor: "#38bdf8" };
  const b = { playerId: "p2", name: "Ben", rating: 1000, saberColor: "#e879f9" };

  const first = await new RankedQueue({}, {}).fetch(postMatchmake(a));
  void first;

  const queue = new RankedQueue({}, {});
  await queue.fetch(postMatchmake(a));
  const r1 = await (await queue.fetch(postMatchmake(b))).json();
  await queue.fetch(postMatchmake(a));
  const r2 = await (await queue.fetch(postMatchmake(b))).json();

  assert.equal(r1.status, "matched");
  assert.equal(r2.status, "matched");
  assert.notEqual(r1.roomId, r2.roomId, "consecutive matches must yield distinct DO names");
});

test("RankedQueue rejects malformed requests", async () => {
  const queue = new RankedQueue({}, {});

  const response = await queue.fetch(postMatchmake({ playerId: "", name: "Ada", rating: 1000 }));

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "invalid_matchmake_request" });
});

function memoryQueueStorage() {
  const map = new Map();
  return {
    map,
    async get(key) {
      return map.has(key) ? structuredClone(map.get(key)) : undefined;
    },
    async put(key, value) {
      map.set(key, structuredClone(value));
    },
  };
}

test("RankedQueue persists the waiting list across DO restarts", async () => {
  // Simulate a Cloudflare Worker idle eviction: same storage backing, fresh
  // RankedQueue instance the second time around (in-memory `waiting` is gone).
  const storage = memoryQueueStorage();
  const before = new RankedQueue({ storage }, {});

  await before.fetch(
    postMatchmake({ playerId: "p1", name: "Ada", rating: 1000, saberColor: "#38bdf8" }),
  );

  const after = new RankedQueue({ storage }, {});
  const response = await after.fetch(
    postMatchmake({ playerId: "p2", name: "Ben", rating: 1100, saberColor: "#e879f9" }),
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "matched", "second player should match the persisted first");
  assert.match(body.roomId, /^ranked-p1-p2-/);
});

test("RankedQueue dedupes the same playerId polling repeatedly", async () => {
  // Client polls `/matchmake` every 2s while in queue. Without dedupe each
  // poll would push a duplicate entry, eventually allowing self-match when
  // the rating window catches our own previous entry.
  const queue = new RankedQueue({}, {});
  const me = { playerId: "p1", name: "Ada", rating: 1000, saberColor: "#38bdf8" };

  await queue.fetch(postMatchmake(me));
  await queue.fetch(postMatchmake(me));
  const last = await queue.fetch(postMatchmake(me));

  assert.equal(last.status, 200);
  const body = await last.json();
  assert.equal(body.status, "queued");
  assert.equal(body.queueSize, 1, "duplicate polls must not stack");
});

test("RankedQueue preserves a polling player's queue position", async () => {
  const queue = new RankedQueue({}, {});
  const first = { playerId: "p1", name: "Ada", rating: 1000, saberColor: "#38bdf8" };
  const second = { playerId: "p2", name: "Ben", rating: 1300, saberColor: "#e879f9" };
  const challenger = { playerId: "p3", name: "Cam", rating: 1000, saberColor: "#facc15" };

  await queue.fetch(postMatchmake(first));
  await queue.fetch(postMatchmake(second));
  await queue.fetch(postMatchmake(first));
  const matched = await (await queue.fetch(postMatchmake(challenger))).json();

  assert.equal(matched.status, "matched");
  assert.equal(matched.players[0].playerId, "p1", "polling must not move p1 behind p2");
});
