import test from "node:test";
import assert from "node:assert/strict";
import { DuelRoomSession } from "../dist/duel-session.js";

function fakeSocket() {
  return {
    sent: [],
    closed: null,
    send(message) {
      this.sent.push(JSON.parse(message));
    },
    close(code, reason) {
      this.closed = { code, reason };
    },
  };
}

test("DuelRoomSession assigns the first two hello messages to player and opponent", () => {
  const session = new DuelRoomSession("ranked-p1-p2");
  const first = fakeSocket();
  const second = fakeSocket();

  session.attach(first);
  session.handleMessage(
    first,
    JSON.stringify({
      t: "hello",
      playerId: "p1",
      name: "Ada",
      rating: 1000,
      saberColor: "#38bdf8",
    }),
  );

  session.attach(second);
  session.handleMessage(
    second,
    JSON.stringify({
      t: "hello",
      playerId: "p2",
      name: "Ben",
      rating: 1120,
      saberColor: "#e879f9",
    }),
  );

  assert.deepEqual(first.sent[0], { t: "hello", side: "player", rating: 1000 });
  assert.deepEqual(second.sent[0], { t: "hello", side: "opponent", rating: 1120 });
  assert.deepEqual(first.sent.at(-1), {
    t: "room_state",
    roomId: "ranked-p1-p2",
    phase: "waiting",
    players: [
      { side: "player", playerId: "p1", name: "Ada", rating: 1000, saberColor: "#38bdf8" },
      { side: "opponent", playerId: "p2", name: "Ben", rating: 1120, saberColor: "#e879f9" },
    ],
  });
});

test("DuelRoomSession closes a third player with room_full", () => {
  const session = new DuelRoomSession("ranked-p1-p2");
  const first = fakeSocket();
  const second = fakeSocket();
  const third = fakeSocket();

  session.attach(first);
  session.handleMessage(
    first,
    JSON.stringify({ t: "hello", playerId: "p1", name: "Ada", rating: 1000, saberColor: "#38bdf8" }),
  );
  session.attach(second);
  session.handleMessage(
    second,
    JSON.stringify({ t: "hello", playerId: "p2", name: "Ben", rating: 1120, saberColor: "#e879f9" }),
  );
  session.attach(third);
  session.handleMessage(
    third,
    JSON.stringify({ t: "hello", playerId: "p3", name: "Cat", rating: 980, saberColor: "#facc15" }),
  );

  assert.deepEqual(third.closed, { code: 1008, reason: "room_full" });
});

test("DuelRoomSession reports malformed messages without throwing", () => {
  const session = new DuelRoomSession("ranked-p1-p2");
  const socket = fakeSocket();

  session.attach(socket);
  session.handleMessage(socket, "not json");

  assert.deepEqual(socket.sent[0], { t: "error", error: "invalid_message" });
});

test("DuelRoomSession resolves a clean slice hit through shared combat rules", () => {
  const session = new DuelRoomSession("ranked-p1-p2");
  const attacker = fakeSocket();
  const defender = fakeSocket();
  joinTwoPlayers(session, attacker, defender);

  session.handleMessage(
    attacker,
    JSON.stringify({
      t: "attack",
      kind: "slice",
      origin: { x: 0, y: 0.2 },
      direction: { x: 0, y: 1 },
      reach: 1.4,
      now: 1000,
    }),
  );

  assert.deepEqual(attacker.sent.at(-1), {
    t: "impact",
    attackerSide: "player",
    at: 1000,
    outcome: {
      kind: "hit",
      knockback: 8,
      attackerStun: 0,
      defenderCounterWindow: 0,
    },
  });
  assert.deepEqual(defender.sent.at(-1), attacker.sent.at(-1));
});

test("DuelRoomSession resolves a perpendicular guard as a block", () => {
  const session = new DuelRoomSession("ranked-p1-p2");
  const attacker = fakeSocket();
  const defender = fakeSocket();
  joinTwoPlayers(session, attacker, defender);

  session.handleMessage(
    defender,
    JSON.stringify({
      t: "guard",
      active: true,
      grip: { x: -0.5, y: 0.8 },
      tip: { x: 0.5, y: 0.8 },
    }),
  );
  session.handleMessage(
    attacker,
    JSON.stringify({
      t: "attack",
      kind: "slice",
      origin: { x: 0, y: 0.2 },
      direction: { x: 0, y: 1 },
      reach: 1.4,
      now: 2000,
    }),
  );

  assert.deepEqual(attacker.sent.at(-1), {
    t: "impact",
    attackerSide: "player",
    at: 2000,
    outcome: {
      kind: "block",
      knockback: 0,
      attackerStun: 1500,
      defenderCounterWindow: 1500,
    },
  });
});

function joinTwoPlayers(session, first, second) {
  session.attach(first);
  session.handleMessage(
    first,
    JSON.stringify({ t: "hello", playerId: "p1", name: "Ada", rating: 1000, saberColor: "#38bdf8" }),
  );
  session.attach(second);
  session.handleMessage(
    second,
    JSON.stringify({ t: "hello", playerId: "p2", name: "Ben", rating: 1120, saberColor: "#e879f9" }),
  );
}
