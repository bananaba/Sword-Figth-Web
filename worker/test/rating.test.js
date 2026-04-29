import test from "node:test";
import assert from "node:assert/strict";
import { applyEloResult, expectedScore } from "../dist/rating.js";

test("expectedScore returns 0.5 for equal ratings", () => {
  assert.equal(expectedScore(1000, 1000), 0.5);
});

test("applyEloResult updates equal ratings by K=32 for a win/loss", () => {
  const result = applyEloResult({
    playerRating: 1000,
    opponentRating: 1000,
    score: 1,
  });

  assert.deepEqual(result, {
    nextPlayerRating: 1016,
    nextOpponentRating: 984,
    playerDelta: 16,
    opponentDelta: -16,
  });
});

test("applyEloResult leaves equal ratings unchanged for a draw", () => {
  const result = applyEloResult({
    playerRating: 1000,
    opponentRating: 1000,
    score: 0.5,
  });

  assert.deepEqual(result, {
    nextPlayerRating: 1000,
    nextOpponentRating: 1000,
    playerDelta: 0,
    opponentDelta: 0,
  });
});
