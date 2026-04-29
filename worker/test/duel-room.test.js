import test from "node:test";
import assert from "node:assert/strict";
import { DuelRoom } from "../dist/duel-room.js";

test("DuelRoom rejects non-WebSocket requests with upgrade_required", async () => {
  const room = new DuelRoom({}, {});

  const response = await room.fetch(new Request("https://worker.test/rooms/abc"));

  assert.equal(response.status, 426);
  assert.deepEqual(await response.json(), { error: "upgrade_required" });
});
