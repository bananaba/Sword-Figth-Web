import { ARENA_RADIUS } from "@vibejam/shared";
import * as THREE from "three";
import { Spikes } from "./Spikes";

export { ARENA_RADIUS };
export const PIT_LEVEL = -3.8;
export const ARENA_HEIGHT = -PIT_LEVEL;
const PIT_LINER_TOP = -0.225;
const RIM_THICKNESS = 0.55;
const RIM_LIFT = 0.06;
const BASIN_RADIUS = 10.5;
const WALL_INNER_RADIUS = 11.2;
const WALL_OUTER_RADIUS = 14.2;
const WALL_HEIGHT = 2.6;

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface TowerData {
  angle: number;
  radius: number;
  width: number;
  depth: number;
  height: number;
  color: string;
  hasStrip: boolean;
  stripColor: string;
  stripIntensity: number;
  topVariant: "flat" | "spire" | "antenna";
  hasRoofBox: boolean;
  isWideLow: boolean;
}

// Deterministic skyline so the city looks identical every match.
const DISTANT_TOWERS: TowerData[] = (() => {
  const rng = mulberry32(0xfaceb00c);
  const list: TowerData[] = [];
  const COUNT = 32;
  for (let i = 0; i < COUNT; i++) {
    const angleJitter = (rng() - 0.5) * 0.22;
    const angle = (i / COUNT) * Math.PI * 2 + angleJitter;
    const radius = 24 + rng() * 22;
    const isWideLow = rng() < 0.25;
    const width = isWideLow ? 3.6 + rng() * 3.2 : 1.6 + rng() * 2.8;
    const depth = isWideLow ? 3.0 + rng() * 2.6 : 1.6 + rng() * 2.4;
    const height = isWideLow ? 3 + rng() * 3 : 6 + rng() * 13;
    const v = rng();
    // Lifted body colors so silhouettes actually stand out against the
    // (newly lifted) sky bg rather than blending into pure black.
    const color = v < 0.45 ? "#1a2230" : v < 0.8 ? "#222a3a" : "#2b344a";
    const hasStrip = rng() > 0.55;
    const stripColor = rng() > 0.78 ? "#ff4af0" : "#5ed3e6";
    const stripIntensity = 0.9 + rng() * 0.5;
    const tv = rng();
    const topVariant: "flat" | "spire" | "antenna" = isWideLow
      ? "flat"
      : tv < 0.55
      ? "flat"
      : tv < 0.82
      ? "spire"
      : "antenna";
    const hasRoofBox = topVariant === "flat" && !isWideLow && rng() < 0.55;
    list.push({
      angle,
      radius,
      width,
      depth,
      height,
      color,
      hasStrip,
      stripColor,
      stripIntensity,
      topVariant,
      hasRoofBox,
      isWideLow,
    });
  }
  return list;
})();

// Horizontal skybridges — long thin pipes/beams between the towers at
// elevated altitude. Pure silhouette, no emissive. Adds horizontal
// architectural rhythm to break the all-vertical strip pattern.
interface SkyBridgeData {
  position: [number, number, number];
  rotationY: number;
  rotationZ: number;
  length: number;
  thickness: number;
}
const SKY_BRIDGES: SkyBridgeData[] = (() => {
  const rng = mulberry32(0x5eabed11);
  const list: SkyBridgeData[] = [];
  const COUNT = 8;
  for (let i = 0; i < COUNT; i++) {
    const angle = (i / COUNT) * Math.PI * 2 + (rng() - 0.5) * 0.5;
    const radius = 28 + rng() * 12;
    const x = Math.sin(angle) * radius;
    const z = Math.cos(angle) * radius;
    const y = 8 + rng() * 8;
    const length = 6 + rng() * 6;
    const thickness = 0.14 + rng() * 0.1;
    const rotationY = angle + Math.PI / 2 + (rng() - 0.5) * 0.6;
    const rotationZ = (rng() - 0.5) * 0.18;
    list.push({ position: [x, y, z], rotationY, rotationZ, length, thickness });
  }
  return list;
})();

// Sky pinpoint lights — far-out factory windows / floating beacons.
interface SkyLightData {
  x: number;
  y: number;
  z: number;
  size: number;
  color: string;
  intensity: number;
}
const SKY_LIGHTS: SkyLightData[] = (() => {
  const rng = mulberry32(0xb1ada55);
  const list: SkyLightData[] = [];
  const COUNT = 40;
  for (let i = 0; i < COUNT; i++) {
    const angle = rng() * Math.PI * 2;
    const radius = 22 + rng() * 28;
    const x = Math.sin(angle) * radius;
    const z = Math.cos(angle) * radius;
    const y = 3 + rng() * 16;
    const size = 0.08 + rng() * 0.14;
    const color = rng() > 0.78 ? "#ff4af0" : "#5ed3e6";
    const intensity = 1.0 + rng() * 0.8;
    list.push({ x, y, z, size, color, intensity });
  }
  return list;
})();

function DistantTower({ data }: { data: TowerData }) {
  const x = Math.sin(data.angle) * data.radius;
  const z = Math.cos(data.angle) * data.radius;
  return (
    <group position={[x, 0, z]} rotation={[0, data.angle, 0]}>
      {/* Tower body — dark silhouette in the fog band. */}
      <mesh position={[0, data.height / 2, 0]}>
        <boxGeometry args={[data.width, data.height, data.depth]} />
        <meshStandardMaterial color={data.color} roughness={0.7} metalness={0.4} />
      </mesh>
      {/* Vertical neon strip on the inward face — Bloom-friendly so it
          glows through the fog. */}
      {data.hasStrip && (
        <mesh position={[0, data.height / 2, -data.depth / 2 - 0.005]}>
          <boxGeometry
            args={[Math.min(0.2, data.width * 0.13), data.height * 0.82, 0.02]}
          />
          <meshStandardMaterial
            color={data.stripColor}
            emissive={data.stripColor}
            emissiveIntensity={data.stripIntensity}
            toneMapped={false}
          />
        </mesh>
      )}
      {/* Optional spire cap. */}
      {data.topVariant === "spire" && (
        <mesh position={[0, data.height + 0.55, 0]}>
          <coneGeometry args={[data.width * 0.28, 1.1, 6]} />
          <meshStandardMaterial color={data.color} roughness={0.55} metalness={0.5} />
        </mesh>
      )}
      {/* Optional antenna whip + beacon bead. */}
      {data.topVariant === "antenna" && (
        <>
          <mesh position={[0, data.height + 0.7, 0]}>
            <cylinderGeometry args={[0.045, 0.045, 1.4, 6]} />
            <meshStandardMaterial color="#3a414f" roughness={0.4} metalness={0.85} />
          </mesh>
          <mesh position={[0, data.height + 1.45, 0]}>
            <sphereGeometry args={[0.1, 10, 10]} />
            <meshStandardMaterial
              color={data.stripColor}
              emissive={data.stripColor}
              emissiveIntensity={1.5}
              toneMapped={false}
            />
          </mesh>
        </>
      )}
      {/* Optional rooftop box — multi-tier silhouette so flat-topped
          buildings don't all read as identical boxes. */}
      {data.hasRoofBox && (
        <mesh
          position={[
            (data.width - data.width * 0.55) * 0.15,
            data.height + 0.55,
            (data.depth - data.depth * 0.55) * 0.15,
          ]}
        >
          <boxGeometry
            args={[data.width * 0.55, 1.1, data.depth * 0.55]}
          />
          <meshStandardMaterial color={data.color} roughness={0.65} metalness={0.4} />
        </mesh>
      )}
    </group>
  );
}

function NeonPylon({
  angle,
  stripColor,
}: {
  angle: number;
  stripColor: string;
}) {
  const radius = WALL_INNER_RADIUS + 0.08;
  const x = Math.sin(angle) * radius;
  const z = Math.cos(angle) * radius;

  return (
    <group position={[x, 0.95, z]} rotation={[0, angle, 0]}>
      {/* Pylon column — gunmetal box, replaces the colosseum spectator arch. */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[0.42, 1.7, 0.18]} />
        <meshStandardMaterial color="#2c323b" roughness={0.5} metalness={0.7} />
      </mesh>
      {/* Cap plate at the top — slightly brighter brushed metal. */}
      <mesh position={[0, 0.92, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.5, 0.08, 0.22]} />
        <meshStandardMaterial color="#3a414b" roughness={0.4} metalness={0.8} />
      </mesh>
      {/* Vertical neon strip on the inner face — Bloom catches these as a
          ring of cool floodlight beacons around the chamber. */}
      <mesh position={[0, 0, -0.1]}>
        <boxGeometry args={[0.08, 1.42, 0.02]} />
        <meshStandardMaterial
          color={stripColor}
          emissive={stripColor}
          emissiveIntensity={1.1}
          toneMapped={false}
        />
      </mesh>
      {/* Beacon dot at the top — a single emissive bead per pylon. */}
      <mesh position={[0, 1.0, -0.06]}>
        <sphereGeometry args={[0.05, 10, 10]} />
        <meshStandardMaterial
          color={stripColor}
          emissive={stripColor}
          emissiveIntensity={1.4}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

function SentinelSpire({
  angle,
  beaconColor,
}: {
  angle: number;
  beaconColor: string;
}) {
  const radius = WALL_OUTER_RADIUS + 2.2;
  const x = Math.sin(angle) * radius;
  const z = Math.cos(angle) * radius;
  return (
    <group position={[x, 0, z]} rotation={[0, angle, 0]}>
      {/* Tower base block. */}
      <mesh position={[0, 1.0, 0]} receiveShadow>
        <boxGeometry args={[0.95, 2.0, 0.95]} />
        <meshStandardMaterial color="#1a1f26" roughness={0.55} metalness={0.7} />
      </mesh>
      {/* Tower mid section. */}
      <mesh position={[0, 2.7, 0]} receiveShadow>
        <boxGeometry args={[0.65, 1.4, 0.65]} />
        <meshStandardMaterial color="#22293a" roughness={0.5} metalness={0.7} />
      </mesh>
      {/* Spire cap. */}
      <mesh position={[0, 3.85, 0]}>
        <coneGeometry args={[0.2, 0.9, 6]} />
        <meshStandardMaterial color="#2c323b" roughness={0.4} metalness={0.8} />
      </mesh>
      {/* Beacon orb at the tip — alternating cyan/magenta to introduce the
          second player accent into the skyline silhouette. */}
      <mesh position={[0, 4.45, 0]}>
        <sphereGeometry args={[0.16, 14, 14]} />
        <meshStandardMaterial
          color={beaconColor}
          emissive={beaconColor}
          emissiveIntensity={1.7}
          toneMapped={false}
        />
      </mesh>
      {/* Side antenna whip. */}
      <mesh position={[0.36, 2.6, 0]} rotation={[0, 0, Math.PI / 5]}>
        <cylinderGeometry args={[0.022, 0.022, 1.6, 6]} />
        <meshStandardMaterial color="#50596a" roughness={0.4} metalness={0.85} />
      </mesh>
      {/* Vertical strip light running the tower spine. */}
      <mesh position={[0, 1.3, -0.475]}>
        <boxGeometry args={[0.06, 1.9, 0.02]} />
        <meshStandardMaterial
          color={beaconColor}
          emissive={beaconColor}
          emissiveIntensity={0.65}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

function DeckHex({
  angle,
  radius,
}: {
  angle: number;
  radius: number;
}) {
  const x = Math.sin(angle) * radius;
  const z = Math.cos(angle) * radius;
  return (
    <mesh position={[x, 0.07, z]} rotation={[0, angle, 0]} receiveShadow>
      <cylinderGeometry args={[0.55, 0.55, 0.06, 6]} />
      <meshStandardMaterial color="#1f242c" roughness={0.55} metalness={0.7} />
    </mesh>
  );
}

function FloatingDrone({
  position,
  beadColor,
}: {
  position: [number, number, number];
  beadColor: string;
}) {
  return (
    <group position={position}>
      {/* Drone body. */}
      <mesh>
        <sphereGeometry args={[0.18, 12, 12]} />
        <meshStandardMaterial color="#1a1d24" roughness={0.4} metalness={0.7} />
      </mesh>
      {/* Glowing bead underside. */}
      <mesh position={[0, -0.16, 0]}>
        <sphereGeometry args={[0.08, 10, 10]} />
        <meshStandardMaterial
          color={beadColor}
          emissive={beadColor}
          emissiveIntensity={1.3}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

function ArenaShell() {
  const pylons = Array.from({ length: 18 }, (_, i) => {
    const angle = (i / 18) * Math.PI * 2;
    return <NeonPylon key={i} angle={angle} stripColor="#5ed3e6" />;
  });

  // Four cardinal sentinel towers — alternating cyan/magenta beacons so the
  // skyline introduces both player accents.
  const sentinels = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5].map((angle, i) => (
    <SentinelSpire
      key={i}
      angle={angle}
      beaconColor={i % 2 === 0 ? "#5ed3e6" : "#ff4af0"}
    />
  ));

  // Hex deck panels between pylons — adds floor texture without competing
  // with the cyan accent ring.
  const deckHexRadius = (WALL_INNER_RADIUS + WALL_OUTER_RADIUS) / 2;
  const deckHexes = Array.from({ length: 9 }, (_, i) => {
    const angle = ((i + 0.5) / 9) * Math.PI * 2;
    return <DeckHex key={i} angle={angle} radius={deckHexRadius} />;
  });

  // Floating spectator drones — small emissive pinpoints in the fog band
  // beyond the wall, gives the chamber atmospheric depth.
  const drones: Array<{ angle: number; r: number; y: number; color: string }> = [
    { angle: Math.PI * 0.18, r: 17.0, y: 4.5, color: "#5ed3e6" },
    { angle: Math.PI * 0.46, r: 18.2, y: 5.4, color: "#ff4af0" },
    { angle: Math.PI * 0.78, r: 17.4, y: 4.0, color: "#5ed3e6" },
    { angle: Math.PI * 1.18, r: 18.0, y: 5.6, color: "#5ed3e6" },
    { angle: Math.PI * 1.48, r: 17.2, y: 4.2, color: "#ff4af0" },
    { angle: Math.PI * 1.78, r: 17.8, y: 4.9, color: "#5ed3e6" },
  ];

  return (
    <group>
      <mesh position={[0, PIT_LEVEL - 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <ringGeometry args={[BASIN_RADIUS, WALL_INNER_RADIUS, 128]} />
        <meshStandardMaterial color="#0e1116" roughness={0.85} metalness={0.4} />
      </mesh>

      {/* Pit liner — gunmetal cylinder bridging pit floor to deck. */}
      <mesh
        position={[0, (PIT_LEVEL + PIT_LINER_TOP) / 2, 0]}
        receiveShadow
      >
        <cylinderGeometry
          args={[
            WALL_INNER_RADIUS,
            WALL_INNER_RADIUS,
            PIT_LINER_TOP - PIT_LEVEL,
            128,
            1,
            true,
          ]}
        />
        <meshStandardMaterial
          color="#0e1218"
          roughness={0.7}
          metalness={0.5}
          side={THREE.BackSide}
        />
      </mesh>

      {/* Inner basin wall — brushed steel wrapping the deck inner edge. */}
      <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
        <cylinderGeometry
          args={[WALL_INNER_RADIUS, WALL_INNER_RADIUS, 1.05, 128, 1, true]}
        />
        <meshStandardMaterial color="#262d36" roughness={0.55} metalness={0.65} side={THREE.BackSide} />
      </mesh>

      {/* Tier 1 — primary deck floor. */}
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <ringGeometry args={[WALL_INNER_RADIUS, WALL_OUTER_RADIUS, 128]} />
        <meshStandardMaterial color="#2c323b" roughness={0.55} metalness={0.6} />
      </mesh>

      {/* Tier 2 — second platform step. */}
      <mesh position={[0, 0.42, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <ringGeometry args={[WALL_INNER_RADIUS + 0.8, WALL_OUTER_RADIUS - 0.45, 128]} />
        <meshStandardMaterial color="#363d49" roughness={0.5} metalness={0.65} />
      </mesh>

      {/* Tier 3 — top platform step. */}
      <mesh position={[0, 0.82, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <ringGeometry args={[WALL_INNER_RADIUS + 1.55, WALL_OUTER_RADIUS - 0.9, 128]} />
        <meshStandardMaterial color="#404857" roughness={0.45} metalness={0.7} />
      </mesh>

      {/* Outer wall cylinder — dark steel skin enclosing the chamber. */}
      <mesh position={[0, WALL_HEIGHT / 2 - 0.15, 0]} castShadow receiveShadow>
        <cylinderGeometry
          args={[WALL_OUTER_RADIUS, WALL_OUTER_RADIUS, WALL_HEIGHT, 128, 1, true]}
        />
        <meshStandardMaterial color="#1c2128" roughness={0.6} metalness={0.6} side={THREE.DoubleSide} />
      </mesh>

      {/* Top capping rim — brushed deck plate. */}
      <mesh position={[0, 1.74, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <ringGeometry args={[WALL_INNER_RADIUS + 2.2, WALL_OUTER_RADIUS + 0.18, 128]} />
        <meshStandardMaterial color="#4d5765" roughness={0.4} metalness={0.7} />
      </mesh>

      {/* Cyan deck-edge thread along the basin lip — ties the pylons into
          the platform's chambara accent. */}
      <mesh position={[0, 0.045, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[WALL_INNER_RADIUS - 0.06, WALL_INNER_RADIUS - 0.005, 128]} />
        <meshStandardMaterial
          color="#5ed3e6"
          emissive="#1aa6c2"
          emissiveIntensity={0.5}
          toneMapped={false}
        />
      </mesh>

      {/* Horizontal conduit pipes wrapping the outer wall — industrial
          plumbing detail, no emissive so they don't compete with pylons. */}
      <mesh position={[0, 1.05, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[WALL_OUTER_RADIUS + 0.08, 0.07, 8, 96]} />
        <meshStandardMaterial color="#3d4250" roughness={0.4} metalness={0.85} />
      </mesh>
      <mesh position={[0, 0.55, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[WALL_OUTER_RADIUS + 0.08, 0.045, 8, 96]} />
        <meshStandardMaterial color="#3d4250" roughness={0.4} metalness={0.85} />
      </mesh>

      {pylons}
      {sentinels}
      {deckHexes}
      {drones.map((d, i) => (
        <FloatingDrone
          key={i}
          position={[Math.sin(d.angle) * d.r, d.y, Math.cos(d.angle) * d.r]}
          beadColor={d.color}
        />
      ))}
    </group>
  );
}

export function Arena3D() {
  return (
    <>
      <color attach="background" args={["#0a1220"]} />
      <fog attach="fog" args={["#0a1220", 30, 65]} />
      <ambientLight intensity={0.55} color="#3e4a5c" />
      <directionalLight
        position={[6, 12, -8]}
        intensity={0.95}
        color="#dde0e8"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
        shadow-camera-near={1}
        shadow-camera-far={40}
      />
      {/* Cool cyan rim from the opposite side — replaces the warm torch fill
          to match the lightsaber + robot aesthetic. */}
      <directionalLight position={[-4, 4, 6]} intensity={0.4} color="#5cc7ff" />
      {/* Spike-pit ember bounce — red kept as a universal danger signal so
          the pit reads as hazardous even in the cool sci-fi palette. */}
      <pointLight
        position={[0, PIT_LEVEL + 0.6, 0]}
        color="#ff4520"
        intensity={3.2}
        distance={14}
        decay={2}
      />

      <ArenaShell />
      <Spikes
        floorY={PIT_LEVEL}
        innerRadius={ARENA_RADIUS + 0.25}
        outerRadius={BASIN_RADIUS - 0.3}
        pitFloorOuter={BASIN_RADIUS}
      />

      {/* Distant city skyline — towers in the fog band, varied silhouettes
          so the chamber reads as embedded in a larger industrial complex
          rather than floating in a void. */}
      <group>
        {DISTANT_TOWERS.map((d, i) => (
          <DistantTower key={i} data={d} />
        ))}
      </group>

      {/* Horizontal skybridges — long thin pipes/beams between distant
          towers, breaks the all-vertical strip pattern with horizontal
          architectural rhythm. Pure silhouette, no emissive. */}
      <group>
        {SKY_BRIDGES.map((b, i) => (
          <mesh
            key={i}
            position={b.position}
            rotation={[Math.PI / 2, b.rotationY, b.rotationZ]}
          >
            <cylinderGeometry args={[b.thickness, b.thickness, b.length, 6]} />
            <meshStandardMaterial color="#252d3a" roughness={0.55} metalness={0.55} />
          </mesh>
        ))}
      </group>

      {/* Scattered sky pinpoint lights — distant factory windows / floating
          beacons that fill the dark sky band above the wall. */}
      <group>
        {SKY_LIGHTS.map((s, i) => (
          <mesh key={i} position={[s.x, s.y, s.z]}>
            <sphereGeometry args={[s.size, 8, 8]} />
            <meshStandardMaterial
              color={s.color}
              emissive={s.color}
              emissiveIntensity={s.intensity}
              toneMapped={false}
            />
          </mesh>
        ))}
      </group>

      {/* Pedestal cylinder — gunmetal pillar from pit floor to deck level. */}
      <mesh position={[0, -ARENA_HEIGHT / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[ARENA_RADIUS, ARENA_RADIUS, ARENA_HEIGHT, 48]} />
        <meshStandardMaterial color="#202530" roughness={0.6} metalness={0.7} />
      </mesh>

      {/* Inner playable disk — cool steel panel, kept slightly brighter than
          the surrounding tiers so fighters read clearly. */}
      <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[ARENA_RADIUS - RIM_THICKNESS, 64]} />
        <meshStandardMaterial color="#3a4554" roughness={0.65} metalness={0.45} />
      </mesh>

      {/* Mid-radius cyan ring — subtle "tech grid" marker on the deck. */}
      <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[ARENA_RADIUS * 0.46, ARENA_RADIUS * 0.475, 64]} />
        <meshStandardMaterial
          color="#5ed3e6"
          emissive="#1aa6c2"
          emissiveIntensity={0.32}
          toneMapped={false}
        />
      </mesh>

      {/* Outer raised rim — darker steel, reads as a separate tier. */}
      <mesh
        position={[0, RIM_LIFT, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <ringGeometry args={[ARENA_RADIUS - RIM_THICKNESS, ARENA_RADIUS, 64]} />
        <meshStandardMaterial color="#15191f" roughness={0.55} metalness={0.7} />
      </mesh>

      {/* Emissive perimeter — chambara cyan threadline at the lip. */}
      <mesh position={[0, RIM_LIFT + 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[ARENA_RADIUS - 0.06, ARENA_RADIUS - 0.012, 64]} />
        <meshStandardMaterial
          color="#5ed3e6"
          emissive="#1aa6c2"
          emissiveIntensity={0.55}
          toneMapped={false}
        />
      </mesh>
    </>
  );
}
