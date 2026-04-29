import { lazy, Suspense } from "react";
import { Duel } from "./duel/Duel";

const HumanCharacterDemo = lazy(() =>
  import("./demo/HumanCharacterDemo").then((m) => ({
    default: m.HumanCharacterDemo,
  })),
);
const SwordPrototype = lazy(() =>
  import("./demo/SwordPrototype").then((m) => ({ default: m.SwordPrototype })),
);
const ChambaraArena = lazy(() =>
  import("./demo/ChambaraArena").then((m) => ({ default: m.ChambaraArena })),
);
const DuelInputDemo = lazy(() =>
  import("./duel/InputDemo").then((m) => ({ default: m.DuelInputDemo })),
);
const Game = lazy(() =>
  import("./game/Game").then((m) => ({ default: m.Game })),
);
const Hud = lazy(() =>
  import("./components/Hud").then((m) => ({ default: m.Hud })),
);

function DemoFallback() {
  return (
    <div
      className="app"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#94a3b8",
        fontSize: 14,
      }}
    >
      Loading…
    </div>
  );
}

export function App() {
  const params = new URLSearchParams(window.location.search);
  const demo = params.get("demo");

  if (demo === "character") {
    return (
      <Suspense fallback={<DemoFallback />}>
        <div className="app">
          <HumanCharacterDemo />
        </div>
      </Suspense>
    );
  }

  if (demo === "sword") {
    return (
      <Suspense fallback={<DemoFallback />}>
        <div className="app">
          <SwordPrototype />
        </div>
      </Suspense>
    );
  }

  if (demo === "arena") {
    return (
      <Suspense fallback={<DemoFallback />}>
        <div className="app">
          <ChambaraArena />
        </div>
      </Suspense>
    );
  }

  if (demo === "duel-input") {
    return (
      <Suspense fallback={<DemoFallback />}>
        <div className="app">
          <DuelInputDemo />
        </div>
      </Suspense>
    );
  }

  if (demo === "scaffold") {
    return (
      <Suspense fallback={<DemoFallback />}>
        <div className="app">
          <Game />
          <Hud />
        </div>
      </Suspense>
    );
  }

  return (
    <div className="app">
      <Duel />
    </div>
  );
}
