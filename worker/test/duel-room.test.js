import test from "node:test";
import assert from "node:assert/strict";
import { DuelRoom } from "../dist/duel-room.js";

test("DuelRoom rejects non-WebSocket requests with upgrade_required", async () => {
  const room = new DuelRoom({}, {});

  const response = await room.fetch(new Request("https://worker.test/rooms/abc"));

  assert.equal(response.status, 426);
  assert.deepEqual(await response.json(), { error: "upgrade_required" });
});

test("DuelRoom accepts WebSocket upgrades and connects them to the session", async () => {
  const originalPair = globalThis.WebSocketPair;
  let serverSocket;
  globalThis.WebSocketPair = class FakeWebSocketPair {
    constructor() {
      const client = new FakeWebSocket();
      const server = new FakeWebSocket();
      serverSocket = server;
      this[0] = client;
      this[1] = server;
    }
  };

  try {
    const room = new DuelRoom({}, {});
    const response = await room.fetch(
      new Request("https://worker.test/rooms/ranked-p1-p2", {
        headers: { upgrade: "websocket" },
      }),
    );

    assert.equal(response.headers.get("x-websocket-upgrade"), "accepted");
    assert.equal(serverSocket.accepted, true);

    serverSocket.dispatchMessage(
      JSON.stringify({
        t: "hello",
        playerId: "p1",
        name: "Ada",
        rating: 1000,
        saberColor: "#38bdf8",
      }),
    );

    assert.deepEqual(serverSocket.sent[0], { t: "hello", side: "player", rating: 1000 });
  } finally {
    globalThis.WebSocketPair = originalPair;
  }
});

test("DuelRoom alarm ticks the session and schedules the next tick while sockets are connected", async () => {
  const storageCalls = [];
  const room = new DuelRoom({
    storage: {
      setAlarm(value) {
        storageCalls.push(value);
      },
    },
  }, {});
  room["session"] = {
    hasConnections() {
      return true;
    },
    tick(now, dt) {
      this.lastTick = { now, dt };
    },
  };

  await room.alarm();

  assert.equal(room["session"].lastTick.dt, 1 / 30);
  assert.equal(typeof room["session"].lastTick.now, "number");
  assert.equal(storageCalls.length, 1);
  assert.equal(typeof storageCalls[0], "number");
});

class FakeWebSocket {
  constructor() {
    this.accepted = false;
    this.sent = [];
    this.listeners = new Map();
  }

  accept() {
    this.accepted = true;
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  send(message) {
    this.sent.push(JSON.parse(message));
  }

  close() {}

  dispatchMessage(data) {
    this.listeners.get("message")?.({ data });
  }
}
