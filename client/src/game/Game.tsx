import { Canvas } from "@react-three/fiber";
import { Sky, Stats } from "@react-three/drei";
import { Suspense } from "react";
import { World } from "./World";
import { LocalPlayer } from "./LocalPlayer";
import { RemotePlayers } from "./RemotePlayers";
import { useNetwork } from "../hooks/useNetwork";

export function Game() {
  useNetwork();

  return (
    <Canvas
      shadows
      camera={{ fov: 70, near: 0.1, far: 5000, position: [0, 80, 200] }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
    >
      <color attach="background" args={["#87ceeb"]} />
      <fog attach="fog" args={["#87ceeb", 800, 3000]} />
      <ambientLight intensity={0.6} />
      <directionalLight
        position={[200, 400, 100]}
        intensity={1.2}
        castShadow
        shadow-mapSize={[2048, 2048]}
      />
      <Sky distance={4500} sunPosition={[100, 20, 100]} />
      <Suspense fallback={null}>
        <World />
        <LocalPlayer />
        <RemotePlayers />
      </Suspense>
      {import.meta.env.DEV && <Stats />}
    </Canvas>
  );
}
