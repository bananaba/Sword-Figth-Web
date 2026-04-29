import test from "node:test";
import assert from "node:assert/strict";
import { Leaderboard } from "../dist/leaderboard.js";

/**
 * In-memory mock of `state.storage` matching the subset of
 * `DurableObjectStorage` the Leaderboard DO uses (`get` / `put` / `list`
 * with `prefix`). DO storage is naturally serialised so we don't simulate
 * concurrency.
 */
function memoryStorage() {
  const map = new Map();
  return {
    map,
    async get(key) {
      return map.has(key) ? structuredClone(map.get(key)) : undefined;
    },
    async put(key, value) {
      map.set(key, structuredClone(value));
    },
    async list({ prefix } = {}) {
      const out = new Map();
      for (const [k, v] of map.entries()) {
        if (!prefix || k.startsWith(prefix)) {
          out.set(k, structuredClone(v));
        }
      }
      return out;
    },
  };
}

function makeLeaderboard() {
  return new Leaderboard({ storage: memoryStorage() }, {});
}

async function postResult(lb, body) {
  return lb.fetch(
    new Request("https://internal/result", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

test("Leaderboard returns 404 for unknown routes", async () => {
  const lb = makeLeaderboard();
  const res = await lb.fetch(new Request("https://internal/unknown"));
  assert.equal(res.status, 404);
});

test("GET /me returns null for an unknown playerId", async () => {
  const lb = makeLeaderboard();
  const res = await lb.fetch(new Request("https://internal/me?playerId=ghost"));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { player: null });
});

test("GET /me requires a playerId query param", async () => {
  const lb = makeLeaderboard();
  const res = await lb.fetch(new Request("https://internal/me"));
  assert.equal(res.status, 400);
});

test("POST /result rejects malformed payloads", async () => {
  const lb = makeLeaderboard();
  const cases = [
    { player: { playerId: "a", name: "A", rating: 1000, outcome: "win" } },
    {
      player: { playerId: "a", name: "A", rating: 1000, outcome: "win" },
      opponent: { playerId: "a", name: "B", rating: 1000, outcome: "loss" },
      at: 0,
    },
    {
      player: { playerId: "a", name: "A", rating: 1000, outcome: "weird" },
      opponent: { playerId: "b", name: "B", rating: 1000, outcome: "loss" },
      at: 0,
    },
  ];
  for (const body of cases) {
    const res = await postResult(lb, body);
    assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(body)}`);
  }
});

test("POST /result upserts both players' rows with W/L counts", async () => {
  const lb = makeLeaderboard();
  const res = await postResult(lb, {
    player: { playerId: "p1", name: "Ada", rating: 1016, outcome: "win" },
    opponent: { playerId: "p2", name: "Boris", rating: 984, outcome: "loss" },
    at: 1700,
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.deepEqual(body.players.player, {
    playerId: "p1",
    name: "Ada",
    rating: 1016,
    wins: 1,
    losses: 0,
    draws: 0,
    updatedAt: 1700,
  });
  assert.deepEqual(body.players.opponent, {
    playerId: "p2",
    name: "Boris",
    rating: 984,
    wins: 0,
    losses: 1,
    draws: 0,
    updatedAt: 1700,
  });
});

test("POST /result accumulates wins/losses across matches", async () => {
  const lb = makeLeaderboard();
  await postResult(lb, {
    player: { playerId: "p1", name: "Ada", rating: 1016, outcome: "win" },
    opponent: { playerId: "p2", name: "Boris", rating: 984, outcome: "loss" },
    at: 1,
  });
  await postResult(lb, {
    player: { playerId: "p1", name: "Ada", rating: 1031, outcome: "win" },
    opponent: { playerId: "p2", name: "Boris", rating: 969, outcome: "loss" },
    at: 2,
  });

  const meRes = await lb.fetch(new Request("https://internal/me?playerId=p1"));
  const me = await meRes.json();
  assert.equal(me.player.wins, 2);
  assert.equal(me.player.losses, 0);
  assert.equal(me.player.rating, 1031);
});

test("POST /result counts a draw on both rows", async () => {
  const lb = makeLeaderboard();
  await postResult(lb, {
    player: { playerId: "p1", name: "Ada", rating: 1000, outcome: "draw" },
    opponent: { playerId: "p2", name: "Boris", rating: 1000, outcome: "draw" },
    at: 7,
  });
  const me = await lb
    .fetch(new Request("https://internal/me?playerId=p1"))
    .then((r) => r.json());
  assert.equal(me.player.draws, 1);
  assert.equal(me.player.wins, 0);
  assert.equal(me.player.losses, 0);
});

test("GET /leaderboard returns Top 20 sorted by rating desc", async () => {
  const lb = makeLeaderboard();
  // 22 players seeded with linearly decreasing rating.
  for (let i = 0; i < 22; i++) {
    await postResult(lb, {
      player: { playerId: `p${i}`, name: `P${i}`, rating: 1000 + i * 10, outcome: "win" },
      opponent: {
        playerId: `q${i}`,
        name: `Q${i}`,
        rating: 1000 - i * 10,
        outcome: "loss",
      },
      at: i + 1,
    });
  }

  const res = await lb.fetch(new Request("https://internal/leaderboard"));
  const body = await res.json();
  assert.equal(body.players.length, 20);
  // Highest rating first.
  assert.equal(body.players[0].playerId, "p21");
  assert.equal(body.players[0].rating, 1000 + 21 * 10);
  // Sorted in strict descending order.
  for (let i = 1; i < body.players.length; i++) {
    assert.ok(
      body.players[i - 1].rating >= body.players[i].rating,
      `not descending at index ${i}`,
    );
  }
});

test("Leaderboard sanitises overlong player ids and names", async () => {
  const lb = makeLeaderboard();
  const longId = "x".repeat(200);
  const longName = "y".repeat(200);
  const res = await postResult(lb, {
    player: { playerId: longId, name: longName, rating: 1100, outcome: "win" },
    opponent: { playerId: "p2", name: "Boris", rating: 900, outcome: "loss" },
    at: 1,
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.players.player.playerId.length <= 64);
  assert.ok(body.players.player.name.length <= 24);
});
