import { OrbitControls } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

/**
 * Procedural low-poly stage concepts (no external models or textures, so the chunk stays small).
 * Loaded lazily by Stage3D.tsx only when the section is in view on capable devices.
 */
export type Preset = 'wedding-mandap' | 'concert-stage' | 'gala-dinner';

const IVORY = '#efe9df';
const STONE = '#cfc6b8';
const DARK = '#1c1a18';

function Instanced({ positions, scale = 1, color, emissive, geometry }: { positions: [number, number, number][]; scale?: number | [number, number, number]; color: THREE.ColorRepresentation; emissive?: THREE.ColorRepresentation; geometry: THREE.BufferGeometry }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const s = Array.isArray(scale) ? new THREE.Vector3(...scale) : new THREE.Vector3(scale, scale, scale);
    positions.forEach((p, i) => {
      m.compose(new THREE.Vector3(...p), new THREE.Quaternion(), s);
      ref.current?.setMatrixAt(i, m);
    });
    if (ref.current) ref.current.instanceMatrix.needsUpdate = true;
  }, [positions, scale]);
  return (
    <instancedMesh ref={ref} args={[geometry, undefined, positions.length]} castShadow>
      <meshStandardMaterial color={color} emissive={emissive ?? '#000000'} emissiveIntensity={emissive ? 0.6 : 0} flatShading roughness={0.7} />
    </instancedMesh>
  );
}

const corners: [number, number][] = [
  [-2, -2],
  [2, -2],
  [-2, 2],
  [2, 2],
];
const tables: [number, number][] = [
  [-3, -2.2],
  [0, -2.2],
  [3, -2.2],
  [-1.5, 0.6],
  [1.5, 0.6],
  [-3, 3.2],
  [0, 3.2],
  [3, 3.2],
];
const CHANDELIERS: [number, number][] = [
  [-1.5, -0.8],
  [1.5, -0.8],
  [0, 2],
];

/* ───────────── Wedding mandap ───────────── */

function Mandap({ accent }: { accent: THREE.Color }) {
  const sphere = useMemo(() => new THREE.IcosahedronGeometry(1, 1), []);
  const florals = useMemo(() => {
    const out: [number, number, number][] = [];
    // garlands along the canopy edges
    for (let i = 0; i <= 16; i++) {
      const t = -2 + (i / 16) * 4;
      const sag = 3.55 - Math.sin((i / 16) * Math.PI) * 0.35;
      out.push([t, sag, -2.05], [t, sag, 2.05], [-2.05, sag, t], [2.05, sag, t]);
    }
    // clusters at pillar bases
    corners.forEach(([x, z]) => {
      for (let k = 0; k < 9; k++) out.push([x + Math.cos(k * 0.7) * 0.45, 0.45 + (k % 3) * 0.12, z + Math.sin(k * 0.7) * 0.45]);
    });
    return out;
  }, []);
  const petals = useMemo(() => {
    const out: [number, number, number][] = [];
    for (let i = 0; i < 70; i++) out.push([(Math.random() - 0.5) * 1.6, 0.03, 3 + Math.random() * 5]);
    return out;
  }, []);
  return (
    <group>
      {/* platform */}
      <mesh position={[0, 0.15, 0]} receiveShadow>
        <cylinderGeometry args={[3.4, 3.6, 0.3, 8]} />
        <meshStandardMaterial color={STONE} flatShading />
      </mesh>
      <mesh position={[0, 0.32, 0]} receiveShadow>
        <cylinderGeometry args={[2.9, 2.9, 0.06, 8]} />
        <meshStandardMaterial color={accent} metalness={0.6} roughness={0.35} flatShading />
      </mesh>
      {/* pillars */}
      {corners.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, 1.9, 0]} castShadow>
            <cylinderGeometry args={[0.13, 0.17, 3.2, 8]} />
            <meshStandardMaterial color={IVORY} flatShading />
          </mesh>
          <mesh position={[0, 3.55, 0]}>
            <cylinderGeometry args={[0.24, 0.16, 0.18, 8]} />
            <meshStandardMaterial color={accent} metalness={0.7} roughness={0.3} flatShading />
          </mesh>
        </group>
      ))}
      {/* canopy */}
      <mesh position={[0, 4.15, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[3.1, 1.2, 4, 1]} />
        <meshStandardMaterial color={IVORY} flatShading side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 4.85, 0]}>
        <sphereGeometry args={[0.16, 8, 6]} />
        <meshStandardMaterial color={accent} metalness={0.8} roughness={0.25} />
      </mesh>
      <Instanced positions={florals} geometry={sphere} scale={0.17} color="#f3d9d4" />
      <Instanced positions={petals} geometry={sphere} scale={[0.07, 0.02, 0.07]} color="#e7b9b1" />
      {/* aisle */}
      <mesh position={[0, 0.01, 5.5]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[1.8, 6]} />
        <meshStandardMaterial color={IVORY} />
      </mesh>
      <pointLight position={[0, 3, 0]} intensity={14} color="#ffcf8a" distance={9} />
      <pointLight position={[0, 1, 4]} intensity={6} color="#ffd9a6" distance={7} />
    </group>
  );
}

/* ───────────── Concert stage ───────────── */

function LedWall({ accent }: { accent: THREE.Color }) {
  const cols = 16;
  const rows = 8;
  const ref = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(() => new THREE.BoxGeometry(0.42, 0.42, 0.05), []);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    let i = 0;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) ref.current?.setMatrixAt(i++, m.makeTranslation(-3.4 + x * 0.45, 1.3 + y * 0.45, -2.6));
    if (ref.current) ref.current.instanceMatrix.needsUpdate = true;
  }, []);
  const c = useMemo(() => new THREE.Color(), []);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (!ref.current) return;
    let i = 0;
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const w = 0.5 + 0.5 * Math.sin(x * 0.55 + y * 0.35 - t * 1.6);
        c.copy(accent).multiplyScalar(0.25 + w * 1.1);
        ref.current.setColorAt(i++, c);
      }
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[geo, undefined, cols * rows]}>
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}

function Beams({ accent }: { accent: THREE.Color }) {
  const group = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    group.current?.children.forEach((b, i) => {
      b.rotation.z = Math.sin(t * 0.7 + i) * 0.35;
      b.rotation.x = Math.cos(t * 0.5 + i * 1.3) * 0.15;
    });
  });
  return (
    <group ref={group}>
      {[-3, -1, 1, 3].map((x) => (
        <group key={x} position={[x, 5.2, -1]}>
          <mesh position={[0, -2.6, 0]}>
            <coneGeometry args={[0.9, 5.2, 16, 1, true]} />
            <meshBasicMaterial color={accent} transparent opacity={0.12} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Truss() {
  const box = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const verticals: [number, number, number][] = [
    [-4.4, 2.75, -2.2],
    [4.4, 2.75, -2.2],
    [-4.4, 2.75, 1.2],
    [4.4, 2.75, 1.2],
  ];
  const lattice = useMemo(() => {
    const out: [number, number, number][] = [];
    for (let i = 0; i <= 22; i++) out.push([-4.4 + i * 0.4, 5.5, -2.2], [-4.4 + i * 0.4, 5.5, 1.2]);
    for (let i = 0; i <= 8; i++) out.push([-4.4, 5.5, -2.2 + i * 0.425], [4.4, 5.5, -2.2 + i * 0.425]);
    return out;
  }, []);
  return (
    <group>
      <Instanced positions={verticals} geometry={box} scale={[0.22, 5.5, 0.22]} color="#8d8d91" />
      <Instanced positions={lattice} geometry={box} scale={[0.32, 0.22, 0.32]} color="#9a9aa0" />
    </group>
  );
}

function Concert({ accent }: { accent: THREE.Color }) {
  const crowd = useMemo(() => {
    const out: [number, number, number][] = [];
    for (let i = 0; i < 120; i++) out.push([(Math.random() - 0.5) * 11, 0.35, 3.5 + Math.random() * 5]);
    return out;
  }, []);
  const capsule = useMemo(() => new THREE.CapsuleGeometry(0.16, 0.4, 2, 6), []);
  return (
    <group>
      <mesh position={[0, 0.5, -0.5]} receiveShadow castShadow>
        <boxGeometry args={[9, 1, 4.4]} />
        <meshStandardMaterial color={DARK} flatShading />
      </mesh>
      <mesh position={[0, 1.02, 1.68]}>
        <boxGeometry args={[9, 0.04, 0.05]} />
        <meshBasicMaterial color={accent} toneMapped={false} />
      </mesh>
      <LedWall accent={accent} />
      <Truss />
      <Beams accent={accent} />
      <Instanced positions={crowd} geometry={capsule} scale={1} color="#2b2a30" />
      <pointLight position={[0, 4, 1]} intensity={20} color={accent} distance={12} />
    </group>
  );
}

/* ───────────── Gala dinner ───────────── */

function Gala({ accent }: { accent: THREE.Color }) {
  const chairGeo = useMemo(() => new THREE.BoxGeometry(0.32, 0.6, 0.32), []);
  const sphere = useMemo(() => new THREE.IcosahedronGeometry(1, 1), []);
  const chairs = useMemo(() => {
    const out: [number, number, number][] = [];
    tables.forEach(([x, z]) => {
      for (let k = 0; k < 8; k++) out.push([x + Math.cos((k / 8) * Math.PI * 2) * 1.05, 0.3, z + Math.sin((k / 8) * Math.PI * 2) * 1.05]);
    });
    return out;
  }, []);
  const centrepieces = useMemo(() => tables.map(([x, z]) => [x, 0.95, z] as [number, number, number]), []);
  const crystals = useMemo(() => {
    const out: [number, number, number][] = [];
    CHANDELIERS.forEach(([cx, cz]) => {
      for (let r = 0; r < 3; r++) for (let k = 0; k < 10 + r * 4; k++) out.push([cx + Math.cos((k / (10 + r * 4)) * Math.PI * 2) * (0.3 + r * 0.25), 4.1 - r * 0.25, cz + Math.sin((k / (10 + r * 4)) * Math.PI * 2) * (0.3 + r * 0.25)]);
    });
    return out;
  }, []);
  return (
    <group>
      {tables.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, 0.38, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.85, 0.95, 0.76, 16]} />
            <meshStandardMaterial color={IVORY} flatShading />
          </mesh>
        </group>
      ))}
      <Instanced positions={chairs} geometry={chairGeo} color={accent} />
      <Instanced positions={centrepieces} geometry={sphere} scale={0.22} color="#f1d6cf" />
      <Instanced positions={crystals} geometry={sphere} scale={0.06} color="#ffffff" emissive="#ffe6b8" />
      {CHANDELIERS.map(([x, z], i) => (
        <group key={i}>
          <mesh position={[x, 4.8, z]}>
            <cylinderGeometry args={[0.01, 0.01, 1.2, 4]} />
            <meshBasicMaterial color={accent} />
          </mesh>
          <pointLight position={[x, 3.6, z]} intensity={8} color="#ffd59a" distance={6} />
        </group>
      ))}
      {/* dance floor */}
      <mesh position={[0, 0.01, 6]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[4, 2.6]} />
        <meshStandardMaterial color={accent} metalness={0.7} roughness={0.25} />
      </mesh>
    </group>
  );
}

export default function Stage3DScene({ preset, accent, ground, active }: { preset: Preset; accent: string; ground: string; active: boolean }) {
  const color = useMemo(() => new THREE.Color(accent), [accent]);
  const floor = useMemo(() => new THREE.Color(ground), [ground]);
  const deck = useMemo(() => (preset === 'concert-stage' ? floor.clone().multiplyScalar(0.55) : floor.clone().lerp(new THREE.Color('#d9d2c6'), 0.35)), [floor, preset]);
  const camera = preset === 'concert-stage' ? { position: [0, 4, 13] as [number, number, number], fov: 42 } : { position: [7, 5.5, 9] as [number, number, number], fov: 40 };
  return (
    <Canvas frameloop={active ? 'always' : 'never'} dpr={[1, 1.75]} camera={camera} gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }} shadows={false} aria-label="Interactive 3D stage concept">
      <ambientLight intensity={preset === 'concert-stage' ? 0.25 : 0.55} />
      <hemisphereLight args={['#fff6e8', '#1a1814', preset === 'concert-stage' ? 0.3 : 0.8]} />
      <directionalLight position={[6, 10, 6]} intensity={preset === 'concert-stage' ? 0.4 : 1.1} color="#fff1dc" />
      <fog attach="fog" args={[floor, 15, 30]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[30, 64]} />
        <meshStandardMaterial color={deck} roughness={0.95} />
      </mesh>
      <group position={[0, 0, preset === 'concert-stage' ? -1 : -1.5]}>
        {preset === 'wedding-mandap' && <Mandap accent={color} />}
        {preset === 'concert-stage' && <Concert accent={color} />}
        {preset === 'gala-dinner' && <Gala accent={color} />}
      </group>
      <OrbitControls enablePan={false} enableZoom minDistance={8} maxDistance={17} minPolarAngle={Math.PI / 5} maxPolarAngle={Math.PI / 2.25} autoRotate autoRotateSpeed={0.55} enableDamping target={[0, 1.6, 0]} />
    </Canvas>
  );
}
