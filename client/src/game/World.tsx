export function World() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[5000, 5000, 1, 1]} />
        <meshStandardMaterial color="#3a7d3a" />
      </mesh>
      <mesh position={[0, 5, 0]} castShadow receiveShadow>
        <boxGeometry args={[400, 10, 60]} />
        <meshStandardMaterial color="#222" />
      </mesh>
    </group>
  );
}
