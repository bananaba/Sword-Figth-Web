import { Canvas } from "@react-three/fiber";
import { OrbitControls, Sky, useAnimations, useGLTF } from "@react-three/drei";
import { Suspense, useEffect, useRef, useState } from "react";
import * as THREE from "three";

const MODEL_URL = "/models/soldier.glb";

useGLTF.preload(MODEL_URL);

function Soldier({ animationName }: { animationName: string }) {
  const group = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF(MODEL_URL);
  const { actions, names } = useAnimations(animations, group);

  useEffect(() => {
    const target = names.find((n) => n.toLowerCase() === animationName.toLowerCase()) ?? names[0];
    if (!target) return;
    const action = actions[target];
    action?.reset().fadeIn(0.3).play();
    return () => {
      action?.fadeOut(0.3);
    };
  }, [actions, names, animationName]);

  return (
    <group ref={group}>
      <primitive object={scene} />
    </group>
  );
}

function Ground() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[80, 80]} />
      <meshStandardMaterial color="#3a7d3a" />
    </mesh>
  );
}

export function HumanCharacterDemo() {
  const [animation, setAnimation] = useState("Walk");
  const animations = ["Idle", "Walk", "Run"];

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <Canvas
        shadows
        camera={{ fov: 45, position: [3, 2, 4] }}
        gl={{ antialias: true }}
      >
        <color attach="background" args={["#87ceeb"]} />
        <Sky distance={4500} sunPosition={[100, 30, 100]} />
        <ambientLight intensity={0.5} />
        <directionalLight
          position={[8, 12, 5]}
          intensity={1.4}
          castShadow
          shadow-mapSize={[2048, 2048]}
        />
        <Suspense fallback={null}>
          <Soldier animationName={animation} />
        </Suspense>
        <Ground />
        <OrbitControls target={[0, 1, 0]} />
      </Canvas>

      <div
        style={{
          position: "absolute",
          left: 16,
          top: 16,
          display: "flex",
          gap: 8,
          padding: 8,
          background: "rgba(0,0,0,0.5)",
          borderRadius: 8,
          fontSize: 13,
        }}
      >
        <span style={{ alignSelf: "center", opacity: 0.7 }}>animation:</span>
        {animations.map((name) => (
          <button
            key={name}
            onClick={() => setAnimation(name)}
            style={{
              padding: "4px 10px",
              borderRadius: 6,
              border: "1px solid rgba(255,255,255,0.2)",
              background:
                animation === name ? "#ff5470" : "rgba(255,255,255,0.08)",
              color: "white",
              cursor: "pointer",
            }}
          >
            {name}
          </button>
        ))}
      </div>

      <div
        style={{
          position: "absolute",
          right: 16,
          top: 16,
          padding: 8,
          background: "rgba(0,0,0,0.5)",
          borderRadius: 8,
          fontSize: 12,
          maxWidth: 280,
          lineHeight: 1.5,
        }}
      >
        Three.js Soldier sample (~2.1 MB GLB) · drei <code>useGLTF</code> +{" "}
        <code>useAnimations</code>. Drag to orbit, scroll to zoom. Real
        production: Ready Player Me ~300KB / Quaternius low-poly ~50-150KB.
      </div>
    </div>
  );
}
