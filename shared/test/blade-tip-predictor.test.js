import test from "node:test";
import assert from "node:assert/strict";
import {
  createBladeTipPredictor,
  updateBladeTipPrediction,
} from "../dist/combat/blade-tip-predictor.js";

test("predicts the blade tip beyond the latest snapshot using measured velocity", () => {
  let predictor = createBladeTipPredictor({ x: 0, y: 1 });
  predictor = updateBladeTipPrediction(predictor, {
    kind: "snapshot",
    tip: { x: 0, y: 1 },
    receivedAtMs: 0,
  });
  predictor = updateBladeTipPrediction(predictor, {
    kind: "snapshot",
    tip: { x: 1, y: 1 },
    receivedAtMs: 50,
  });

  const next = updateBladeTipPrediction(predictor, {
    kind: "frame",
    dtSeconds: 1 / 60,
    nowMs: 83,
  });

  assert.ok(next.rendered.x > 1, `expected x to lead snapshot, got ${next.rendered.x}`);
  assert.equal(next.rendered.y, 1);
});

test("clamps prediction so a missing packet does not send the blade far away", () => {
  let predictor = createBladeTipPredictor({ x: 0, y: 1 });
  predictor = updateBladeTipPrediction(predictor, {
    kind: "snapshot",
    tip: { x: 0, y: 1 },
    receivedAtMs: 0,
  });
  predictor = updateBladeTipPrediction(predictor, {
    kind: "snapshot",
    tip: { x: 1, y: 1 },
    receivedAtMs: 10,
  });

  const next = updateBladeTipPrediction(predictor, {
    kind: "frame",
    dtSeconds: 1 / 60,
    nowMs: 500,
  });

  assert.ok(next.rendered.x <= 1.45, `expected limited overshoot, got ${next.rendered.x}`);
});
