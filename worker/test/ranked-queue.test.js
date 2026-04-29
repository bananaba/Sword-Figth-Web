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
  assert.deepEqual(await response.json(), {
    status: "matched",
    roomId: "ranked-p1-p2",
    players: [
      { playerId: "p1", name: "Ada", rating: 1000, saberColor: "#38bdf8" },
      { playerId: "p2", name: "Ben", rating: 1120, saberColor: "#e879f9" },
    ],
  });
});

test("RankedQueue rejects malformed requests", async () => {
  const queue = new RankedQueue({}, {});

  const response = await queue.fetch(postMatchmake({ playerId: "", name: "Ada", rating: 1000 }));

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "invalid_matchmake_request" });
});
