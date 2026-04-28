import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { MessageType, type InputCommand } from "@vibejam/shared";
import { useGameStore } from "../stores/gameStore";
import { useInput } from "../hooks/useInput";

export function LocalPlayer() {
  const meshRef = useRef<THREE.Group>(null);
  const seqRef = useRef(0);
  const { camera } = useThree();
  const room = useGameStore((s) => s.room);
  const input = useInput();

  useEffect(() => {
    if (!meshRef.current) return;
    meshRef.current.position.set(0, 80, 0);
  }, []);

  useFrame((_state, dt) => {
    const ship = meshRef.current;
    if (!ship) return;

    const yawSpeed = 1.5;
    const pitchSpeed = 1.2;
    const accel = 60;
    const maxSpeed = 120;

    ship.rotation.y -= input.yaw * yawSpeed * dt;
    ship.rotation.x = THREE.MathUtils.clamp(
      ship.rotation.x + input.pitch * pitchSpeed * dt,
      -Math.PI / 3,
      Math.PI / 3,
    );

    const forward = new THREE.Vector3(0, 0, -1).applyEuler(ship.rotation);
    const speed = Math.min(input.throttle * accel + 30, maxSpeed);
    ship.position.addScaledVector(forward, speed * dt);

    const camOffset = new THREE.Vector3(0, 8, 25).applyEuler(ship.rotation);
    camera.position.lerp(ship.position.clone().add(camOffset), 0.15);
    camera.lookAt(ship.position);

    if (room && seqRef.current % 3 === 0) {
      const cmd: InputCommand = {
        seq: seqRef.current,
        pitch: input.pitch,
        yaw: input.yaw,
        roll: input.roll,
        throttle: input.throttle,
        fire: input.fire,
        dt,
      };
      room.send(MessageType.Input, cmd);
    }
    seqRef.current += 1;
  });

  return (
    <group ref={meshRef}>
      <mesh castShadow>
        <coneGeometry args={[1.5, 6, 4]} />
        <meshStandardMaterial color="#ff5470" />
      </mesh>
      <mesh position={[0, 0, 1]} castShadow>
        <boxGeometry args={[8, 0.4, 1.5]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
    </group>
  );
}
