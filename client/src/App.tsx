import { Game } from "./game/Game";
import { Hud } from "./components/Hud";
import { HumanCharacterDemo } from "./demo/HumanCharacterDemo";
import { SwordPrototype } from "./demo/SwordPrototype";
import { ChambaraArena } from "./demo/ChambaraArena";
import { DuelInputDemo } from "./duel/InputDemo";
import { Duel } from "./duel/Duel";

export function App() {
  const params = new URLSearchParams(window.location.search);
  const demo = params.get("demo");

  if (demo === "character") {
    return (
      <div className="app">
        <HumanCharacterDemo />
      </div>
    );
  }

  if (demo === "sword") {
    return (
      <div className="app">
        <SwordPrototype />
      </div>
    );
  }

  if (demo === "arena") {
    return (
      <div className="app">
        <ChambaraArena />
      </div>
    );
  }

  if (demo === "duel-input") {
    return (
      <div className="app">
        <DuelInputDemo />
      </div>
    );
  }

  if (demo === "scaffold") {
    return (
      <div className="app">
        <Game />
        <Hud />
      </div>
    );
  }

  return (
    <div className="app">
      <Duel />
    </div>
  );
}
