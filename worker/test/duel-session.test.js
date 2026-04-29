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
  startFighting(session, attacker, defender);

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

  assert.equal(attacker.sent.at(-1).t, "impact");
  assert.equal(attacker.sent.at(-1).attackerSide, "player");
  assert.equal(attacker.sent.at(-1).at, 1000);
  assert.equal(attacker.sent.at(-1).outcome.kind, "hit");
  assert.equal(attacker.sent.at(-1).outcome.attackerStun, 0);
  assert.equal(attacker.sent.at(-1).outcome.defenderCounterWindow, 0);
  assert.equal(typeof attacker.sent.at(-1).outcome.knockback, "number");
  assert.deepEqual(defender.sent.at(-1), attacker.sent.at(-1));
});

test("DuelRoomSession resolves a perpendicular guard as a block", () => {
  const session = new DuelRoomSession("ranked-p1-p2");
  const attacker = fakeSocket();
  const defender = fakeSocket();
  joinTwoPlayers(session, attacker, defender);
  startFighting(session, attacker, defender);

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

test("DuelRoomSession starts countdown when both players are ready", () => {
  const session = new DuelRoomSession("ranked-p1-p2");
  const first = fakeSocket();
  const second = fakeSocket();
  joinTwoPlayers(session, first, second);

  session.handleMessage(first, JSON.stringify({ t: "ready", now: 5000 }));
  session.handleMessage(second, JSON.stringify({ t: "ready", now: 5000 }));

  assert.deepEqual(first.sent.at(-1), {
    t: "match_state",
    phase: "countdown",
    roundNumber: 1,
    playerWins: 0,
    opponentWins: 0,
    phaseEndsAt: 8000,
  });
  assert.deepEqual(second.sent.at(-1), first.sent.at(-1));
});

test("DuelRoomSession advances from countdown to fighting on tick", () => {
  const session = new DuelRoomSession("ranked-p1-p2");
  const first = fakeSocket();
  const second = fakeSocket();
  joinTwoPlayers(session, first, second);

  session.handleMessage(first, JSON.stringify({ t: "ready", now: 5000 }));
  session.handleMessage(second, JSON.stringify({ t: "ready", now: 5000 }));
  session.tick(8000);

  assert.deepEqual(first.sent.at(-1), {
    t: "match_state",
    phase: "fighting",
    roundNumber: 1,
    playerWins: 0,
    opponentWins: 0,
    phaseEndsAt: 53000,
  });
});

test("DuelRoomSession rejects attacks before fighting starts", () => {
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

  assert.deepEqual(attacker.sent.at(-1), { t: "error", error: "not_fighting" });
});

test("DuelRoomSession ends the round when knockback pushes a fighter out", () => {
  const session = new DuelRoomSession("ranked-p1-p2");
  const attacker = fakeSocket();
  const defender = fakeSocket();
  joinTwoPlayers(session, attacker, defender);
  startFighting(session, attacker, defender);

  session.handleMessage(
    attacker,
    JSON.stringify({
      t: "attack",
      kind: "thrust",
      origin: { x: 0, y: 1.15 },
      direction: { x: 0, y: 1 },
      reach: 1.4,
      now: 8100,
    }),
  );
  session.tick(8300, 0.3);

  assert.deepEqual(attacker.sent.at(-1), {
    t: "round_over",
    winner: "player",
    reason: "ringout",
    roundNumber: 1,
    playerWins: 1,
    opponentWins: 0,
    phaseEndsAt: 10500,
  });
  assert.deepEqual(defender.sent.at(-1), attacker.sent.at(-1));
});

test("DuelRoomSession ends the round on timeout", () => {
  const session = new DuelRoomSession("ranked-p1-p2");
  const first = fakeSocket();
  const second = fakeSocket();
  joinTwoPlayers(session, first, second);
  startFighting(session, first, second);

  session.tick(53000);

  assert.deepEqual(first.sent.at(-1), {
    t: "round_over",
    winner: "draw",
    reason: "timeout",
    roundNumber: 1,
    playerWins: 0,
    opponentWins: 0,
    phaseEndsAt: 55200,
  });
});

test("DuelRoomSession advances to the next round after round over", () => {
  const session = new DuelRoomSession("ranked-p1-p2");
  const first = fakeSocket();
  const second = fakeSocket();
  joinTwoPlayers(session, first, second);
  startFighting(session, first, second);
  forcePlayerRingoutWin(session, first);

  session.tick(10500);

  assert.deepEqual(first.sent.at(-1), {
    t: "match_state",
    phase: "countdown",
    roundNumber: 2,
    playerWins: 1,
    opponentWins: 0,
    phaseEndsAt: 13500,
  });
});

test("DuelRoomSession ends the match after two round wins", () => {
  const session = new DuelRoomSession("ranked-p1-p2");
  const first = fakeSocket();
  const second = fakeSocket();
  joinTwoPlayers(session, first, second);
  startFighting(session, first, second);
  forcePlayerRingoutWin(session, first);
  session.tick(10500);
  session.tick(13500);
  forcePlayerRingoutWin(session, first, 13600);

  session.tick(16000);

  assert.deepEqual(first.sent.at(-1), {
    t: "match_over",
    winner: "player",
    playerWins: 2,
    opponentWins: 0,
    ratings: {
      player: { before: 1000, after: 1021, delta: 21 },
      opponent: { before: 1120, after: 1099, delta: -21 },
    },
  });
  assert.deepEqual(second.sent.at(-1), first.sent.at(-1));
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

function startFighting(session, first, second) {
  session.handleMessage(first, JSON.stringify({ t: "ready", now: 5000 }));
  session.handleMessage(second, JSON.stringify({ t: "ready", now: 5000 }));
  session.tick(8000);
}

function forcePlayerRingoutWin(session, attacker, now = 8100) {
  session.handleMessage(
    attacker,
    JSON.stringify({
      t: "attack",
      kind: "thrust",
      origin: { x: 0, y: 1.15 },
      direction: { x: 0, y: 1 },
      reach: 1.4,
      now,
    }),
  );
  session.tick(now + 200, 0.3);
}
