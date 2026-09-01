import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  resolveActionPlan,
  resolveCameraDirectiveFromActionPlan,
  type ActionPlan,
  type CameraDirective,
  type CameraFollowMode,
  type FlowPathId,
  type VisualEntityId,
} from "@linux-observatory/camera-director";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { WebGPURenderer } from "three/webgpu";

export type RenderBackend = "initializing" | "webgpu" | "webgl2";

export interface VisualReplayFrame {
  readonly sequence: number;
  readonly stage: string;
  readonly eventKind: string;
  readonly summary: string;
  readonly focusNodeIds: readonly string[];
}

export interface SceneTelemetry {
  readonly fps: number;
  readonly frameTimeMs: number;
  readonly drawCalls: number;
  readonly triangles: number;
  readonly visibleObjects: number;
}

export interface IndustrialMegacityProps {
  readonly frame: VisualReplayFrame | undefined;
  readonly frameHistory: readonly VisualReplayFrame[];
  readonly playing: boolean;
  readonly cameraMode?: CameraFollowMode | undefined;
  readonly totalFrames?: number | undefined;
  readonly selectedEntity: VisualEntityId;
  readonly onSelectEntity: (entity: VisualEntityId) => void;
  readonly onBackendChange: (backend: RenderBackend) => void;
  readonly onTelemetry: (telemetry: SceneTelemetry) => void;
}

// ─── Real Inter-Process Data Curves ────────────────────────────────
const fileToCatCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(-3.6, 1.5, -4.5),
  new THREE.Vector3(-3.2, 2.3, -1.8),
  new THREE.Vector3(-2.2, 2.0, 1.2),
]);

const catToPipeCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(-2.2, 1.8, 1.2),
  new THREE.Vector3(-1.3, 1.8, 1.2),
  new THREE.Vector3(-0.6, 1.8, 1.2),
]);

const pipeCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(-0.65, 1.8, 1.2),
  new THREE.Vector3(0.5, 1.8, 1.2),
  new THREE.Vector3(1.65, 1.8, 1.2),
]);

const pipeToGrepCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(1.65, 1.8, 1.2),
  new THREE.Vector3(2.4, 1.8, 1.2),
  new THREE.Vector3(3.2, 1.8, 1.2),
]);

const grepToTerminalCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(3.2, 1.8, 1.2),
  new THREE.Vector3(3.5, 2.3, -1.8),
  new THREE.Vector3(3.6, 1.6, -4.5),
]);

const catToTerminalCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(-2.2, 1.8, 1.2),
  new THREE.Vector3(0.8, 2.4, -1.8),
  new THREE.Vector3(3.6, 1.6, -4.5),
]);

const echoToFileCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(-2.2, 1.8, 1.2),
  new THREE.Vector3(-2.9, 2.3, -1.8),
  new THREE.Vector3(-3.6, 1.5, -4.5),
]);

const lsToTerminalCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(-2.2, 2.4, 1.2),
  new THREE.Vector3(0.6, 2.8, -1.8),
  new THREE.Vector3(3.6, 1.6, -4.5),
]);

const psToTerminalCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(-2.2, 2.2, 1.2),
  new THREE.Vector3(0.6, 2.6, -1.8),
  new THREE.Vector3(3.6, 1.6, -4.5),
]);

const flowCurves: Readonly<Record<FlowPathId, THREE.CatmullRomCurve3>> = {
  file_to_cat: fileToCatCurve,
  cat_to_pipe: catToPipeCurve,
  pipe_to_grep: pipeCurve,
  grep_to_terminal: grepToTerminalCurve,
  cat_to_terminal: catToTerminalCurve,
  echo_to_file: echoToFileCurve,
  ls_to_terminal: lsToTerminalCurve,
  ps_to_terminal: psToTerminalCurve,
  shell_to_cat: pipeCurve,
  shell_to_grep: pipeCurve,
  shell_to_echo: pipeCurve,
  shell_to_ls: pipeCurve,
  shell_to_ps: pipeCurve,
};

// ─── Precomputed Static Geometries ─────────────────────────────────
const fileToCatTubeGeom = new THREE.TubeGeometry(fileToCatCurve, 32, 0.07, 8, false);
const pipeTubeGeom = new THREE.TubeGeometry(pipeCurve, 32, 0.14, 12, false);
const grepToTermTubeGeom = new THREE.TubeGeometry(grepToTerminalCurve, 32, 0.07, 8, false);
const catToTermTubeGeom = new THREE.TubeGeometry(catToTerminalCurve, 32, 0.07, 8, false);
const echoToFileTubeGeom = new THREE.TubeGeometry(echoToFileCurve, 32, 0.07, 8, false);
const lsToTermTubeGeom = new THREE.TubeGeometry(lsToTerminalCurve, 32, 0.07, 8, false);
const psToTermTubeGeom = new THREE.TubeGeometry(psToTerminalCurve, 32, 0.07, 8, false);

// ─── Static PBR Materials (Daylight Scientific Palette) ────────────
const palette = {
  bg: "#f1f5f9",
  fog: "#e2e8f0",
  steelChassis: "#94a3b8",
  lightChassis: "#cbd5e1",
  polishedMetal: "#e2e8f0",
  darkMetal: "#475569",
  acrylicGlass: "#e0f2fe",
  shellBlue: "#2563eb",
  catAmber: "#d97706",
  grepEmerald: "#059669",
  echoPink: "#db2777",
  lsPurple: "#7c3aed",
  psCyan: "#0891b2",
  storageIndigo: "#4f46e5",
  terminalTeal: "#0d9488",
  kernelViolet: "#6366f1",
  packetGlow: "#38bdf8",
  warningAmber: "#f59e0b",
  successGreen: "#10b981",
  deadGrey: "#64748b",
};

const materials = {
  chassisBase: new THREE.MeshStandardMaterial({
    color: palette.lightChassis,
    metalness: 0.8,
    roughness: 0.25,
  }),
  chassisDark: new THREE.MeshStandardMaterial({
    color: palette.darkMetal,
    metalness: 0.85,
    roughness: 0.2,
  }),
  polishedChrome: new THREE.MeshStandardMaterial({
    color: palette.polishedMetal,
    metalness: 0.95,
    roughness: 0.1,
  }),
  conduitGlass: new THREE.MeshPhysicalMaterial({
    color: palette.acrylicGlass,
    transmission: 0.85,
    opacity: 0.45,
    transparent: true,
    roughness: 0.12,
    metalness: 0.1,
    depthWrite: false,
  }),
  shellChassis: new THREE.MeshStandardMaterial({
    color: "#f8fafc",
    metalness: 0.5,
    roughness: 0.3,
  }),
  catHopper: new THREE.MeshStandardMaterial({
    color: "#fffbeb",
    metalness: 0.35,
    roughness: 0.2,
    transparent: true,
    opacity: 0.85,
  }),
  grepGlass: new THREE.MeshPhysicalMaterial({
    color: "#ecfdf5",
    transmission: 0.75,
    opacity: 0.5,
    transparent: true,
    roughness: 0.1,
    metalness: 0.1,
    depthWrite: false,
  }),
  storageHex: new THREE.MeshStandardMaterial({
    color: "#eef2ff",
    metalness: 0.6,
    roughness: 0.3,
  }),
  screenBezel: new THREE.MeshStandardMaterial({
    color: "#1e293b",
    metalness: 0.7,
    roughness: 0.3,
  }),
  screenDisplay: new THREE.MeshBasicMaterial({
    color: "#0f172a",
  }),
  screenGlow: new THREE.MeshBasicMaterial({
    color: "#38bdf8",
  }),
  packetParticle: new THREE.MeshBasicMaterial({
    color: palette.packetGlow,
  }),
  statusLedActive: new THREE.MeshBasicMaterial({ color: palette.successGreen }),
  statusLedBusy: new THREE.MeshBasicMaterial({ color: palette.warningAmber }),
  statusLedExited: new THREE.MeshBasicMaterial({ color: palette.deadGrey }),
};

// ─── True One-Shot Choreography Controller (ZERO setState in useFrame) ──
interface ChoreographyRunner {
  readonly actionPlan: ActionPlan;
  readonly progressRef: React.MutableRefObject<number>;
  readonly timeRef: React.MutableRefObject<number>;
  readonly isSettledRef: React.MutableRefObject<boolean>;
}

function useOneShotChoreography(actionPlan: ActionPlan, sequence: number): ChoreographyRunner {
  const progressRef = useRef(0.0);
  const timeRef = useRef(0.0);
  const isSettledRef = useRef(false);
  const prevSequence = useRef(-1);

  // Trigger one-shot action cycle on sequence change
  if (sequence !== prevSequence.current) {
    prevSequence.current = sequence;
    timeRef.current = 0.0;
    progressRef.current = 0.0;
    isSettledRef.current = false;
  }

  useFrame((_, delta) => {
    if (!isSettledRef.current) {
      const dur = actionPlan.mechanicalResponse.durationSec || 1.2;
      timeRef.current += delta;
      const p = Math.min(1.0, timeRef.current / dur);
      progressRef.current = p;
      if (p >= 1.0) {
        isSettledRef.current = true;
      }
    }
  });

  return { actionPlan, progressRef, timeRef, isSettledRef };
}

// ─── Flow Packet Instanced Stream (One-Shot Progression) ────────────
function OneShotPacketStream({
  curve,
  active,
  progressRef,
  color = palette.packetGlow,
  count = 8,
}: {
  readonly curve: THREE.CatmullRomCurve3;
  readonly active: boolean;
  readonly progressRef: React.MutableRefObject<number>;
  readonly color?: string;
  readonly count?: number;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const scratchMatrix = useMemo(() => new THREE.Matrix4(), []);
  const scratchPos = useMemo(() => new THREE.Vector3(), []);
  const scratchScale = useMemo(() => new THREE.Vector3(1, 1, 1), []);
  const scratchQuat = useMemo(() => new THREE.Quaternion(), []);
  const scratchColor = useMemo(() => new THREE.Color(color), [color]);

  useFrame(() => {
    if (!meshRef.current) return;
    if (!active) {
      meshRef.current.visible = false;
      return;
    }

    const p = progressRef.current;
    // Packet transfers during middle window (0.3 -> 0.85) of the action
    if (p < 0.25 || p > 0.9) {
      meshRef.current.visible = false;
      return;
    }
    meshRef.current.visible = true;

    // Normalizing local flow progress: 0 at p=0.25, 1 at p=0.9
    const flowT = (p - 0.25) / 0.65;

    for (let i = 0; i < count; i++) {
      // Trail offset behind head
      const trailOffset = Math.max(0.0, Math.min(1.0, flowT - (i * 0.04)));
      curve.getPointAt(trailOffset, scratchPos);

      // Scale: head is largest (0.18), tail fades to 0
      const s = 0.18 * (1.0 - i / count) * Math.sin(trailOffset * Math.PI);
      scratchScale.set(s, s, s);
      scratchMatrix.compose(scratchPos, scratchQuat, scratchScale);
      meshRef.current.setMatrixAt(i, scratchMatrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <sphereGeometry args={[1, 8, 8]} />
      <meshBasicMaterial color={scratchColor} />
    </instancedMesh>
  );
}

// ─── Fork Spawn Pulse Along Guideway Rails ─────────────────────────
function SpawnEnergyPulse({
  active,
  progressRef,
  childPosition,
}: {
  readonly active: boolean;
  readonly progressRef: React.MutableRefObject<number>;
  readonly childPosition: readonly [number, number, number];
}) {
  const mesh = useRef<THREE.Mesh>(null);
  const pStart = useMemo(() => new THREE.Vector3(-6.5, 0.45, -1), []);
  const pMid = useMemo(
    () => new THREE.Vector3((-6.5 + childPosition[0]) / 2, 0.35, (-1 + childPosition[2]) / 2),
    [childPosition],
  );
  const pEnd = useMemo(
    () => new THREE.Vector3(childPosition[0], 0.45, childPosition[2]),
    [childPosition],
  );

  useFrame(() => {
    if (!mesh.current) return;
    if (!active) {
      mesh.current.visible = false;
      return;
    }
    const p = progressRef.current;
    if (p < 0.15 || p > 0.85) {
      mesh.current.visible = false;
      return;
    }
    mesh.current.visible = true;
    const t = (p - 0.15) / 0.7;

    if (t < 0.5) {
      mesh.current.position.lerpVectors(pStart, pMid, t * 2);
    } else {
      mesh.current.position.lerpVectors(pMid, pEnd, (t - 0.5) * 2);
    }
    mesh.current.scale.setScalar(0.32 * Math.sin(t * Math.PI));
  });

  return (
    <mesh ref={mesh} visible={active}>
      <sphereGeometry args={[1, 8, 8]} />
      <meshBasicMaterial color="#38bdf8" />
    </mesh>
  );
}

// ─── Unified Structural Plant (Backbone & Rails) ───────────────────
function UnifiedPlantStructure() {
  return (
    <group name="plant-structural-backbone">
      {/* Heavy Precision Base Platform */}
      <mesh position={[0, -0.06, -1]} receiveShadow>
        <boxGeometry args={[18, 0.12, 14]} />
        <meshStandardMaterial color="#e2e8f0" metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[0, -0.14, -1]}>
        <boxGeometry args={[18.6, 0.08, 14.6]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.85} roughness={0.2} />
      </mesh>

      {/* Grid Alignment Markings on Floor */}
      <gridHelper args={[16, 16, "#cbd5e1", "#e2e8f0"]} position={[0, 0.01, -1]} />

      {/* Kernel Backbone Bus - Low profile structural chassis spanning rear */}
      <mesh position={[0, 0.2, -4.5]}>
        <boxGeometry args={[14, 0.35, 1.2]} />
        <meshStandardMaterial color="#64748b" metalness={0.85} roughness={0.25} />
      </mesh>
      {/* 4 Chrome Interconnect Bus Conduits along Kernel Backbone */}
      {[-0.3, -0.1, 0.1, 0.3].map((z, i) => (
        <mesh key={i} position={[0, 0.42, -4.5 + z]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.035, 0.035, 13.8, 8]} />
          <meshStandardMaterial color="#e2e8f0" metalness={0.95} roughness={0.1} />
        </mesh>
      ))}

      {/* Routing Guideway Rails - From Shell to Child Bay 1 & 2 */}
      <mesh position={[-4.35, 0.18, 0.1]} rotation={[0, -0.46, 0]}>
        <boxGeometry args={[0.15, 0.12, 4.8]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.9} roughness={0.15} />
      </mesh>
      <mesh position={[-1.65, 0.18, 0.1]} rotation={[0, 0.22, 0]}>
        <boxGeometry args={[0.15, 0.12, 10.2]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.9} roughness={0.15} />
      </mesh>

      {/* Structural Struts */}
      <mesh position={[-3.6, 0.25, -4.5]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 0.8, 8]} />
        <primitive object={materials.polishedChrome} />
      </mesh>
      <mesh position={[3.6, 0.25, -4.5]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 0.8, 8]} />
        <primitive object={materials.polishedChrome} />
      </mesh>
    </group>
  );
}

// ─── WORKCELL: Shell Workcell (Dispatch Deck) ───────────────────────
function ShellWorkcell({
  active,
  progressRef,
  selected,
  onSelect,
}: {
  readonly active: boolean;
  readonly progressRef: React.MutableRefObject<number>;
  readonly selected: boolean;
  readonly onSelect: () => void;
}) {
  const lever = useRef<THREE.Mesh>(null);

  useFrame(() => {
    if (lever.current) {
      if (active) {
        const p = progressRef.current;
        // Lever throws forward during actuation (0.2 -> 0.6) then settles
        const angle = -0.2 + Math.sin(p * Math.PI) * 0.45;
        lever.current.rotation.z = angle;
      } else {
        lever.current.rotation.z = -0.2;
      }
    }
  });

  return (
    <group position={[-6.5, 0, -1]} onClick={(e) => { e.stopPropagation(); onSelect(); }}>
      <mesh position={[0, 0.6, 0]} castShadow>
        <boxGeometry args={[2.4, 1.2, 2.0]} />
        <primitive object={materials.shellChassis} />
      </mesh>
      <mesh position={[0, 0.6, 1.01]}>
        <planeGeometry args={[2.2, 0.15]} />
        <meshStandardMaterial color={palette.shellBlue} />
      </mesh>
      <mesh position={[0, 1.22, 0]} rotation={[-0.15, 0, 0]}>
        <boxGeometry args={[2.2, 0.08, 1.8]} />
        <meshStandardMaterial color="#334155" metalness={0.7} roughness={0.3} />
      </mesh>
      {[-0.6, 0, 0.6].map((x, i) => (
        <group key={i} position={[x, 1.26, 0.1]}>
          <mesh ref={i === 1 ? lever : null} position={[0, 0.25, 0]} rotation={[0, 0, -0.2]}>
            <cylinderGeometry args={[0.025, 0.025, 0.5, 8]} />
            <meshStandardMaterial color={palette.shellBlue} metalness={0.8} />
          </mesh>
          <mesh position={[0, 0.5, 0]}>
            <sphereGeometry args={[0.06, 8, 8]} />
            <meshBasicMaterial color={active ? palette.packetGlow : "#64748b"} />
          </mesh>
        </group>
      ))}
      {selected && (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.4, 1.55, 32]} />
          <meshBasicMaterial color={palette.shellBlue} />
        </mesh>
      )}
    </group>
  );
}

// ─── WORKCELL: CAT Workcell (Intake Funnel & Rollers) ───────────────
function CatWorkcell({
  active,
  exited,
  progressRef,
  selected,
  onSelect,
}: {
  readonly active: boolean;
  readonly exited: boolean;
  readonly progressRef: React.MutableRefObject<number>;
  readonly selected: boolean;
  readonly onSelect: () => void;
}) {
  const rollerL = useRef<THREE.Mesh>(null);
  const rollerR = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    if (rollerL.current && rollerR.current) {
      if (exited) {
        // Complete halt on exit
      } else if (active) {
        const p = progressRef.current;
        const speed = (p > 0.2 && p < 0.85) ? 8.0 : 2.0;
        rollerL.current.rotation.x += delta * speed;
        rollerR.current.rotation.x -= delta * speed;
      }
    }
  });

  return (
    <group position={[-2.2, 0, 1.2]} onClick={(e) => { e.stopPropagation(); onSelect(); }}>
      <mesh position={[0, 1.0, 0]} castShadow>
        <cylinderGeometry args={[0.9, 0.9, 2.0, 16]} />
        <meshStandardMaterial color="#f8fafc" metalness={0.4} roughness={0.3} />
      </mesh>
      <mesh position={[0, 1.0, 0]}>
        <torusGeometry args={[0.92, 0.04, 8, 24]} />
        <meshStandardMaterial color={palette.catAmber} metalness={0.7} />
      </mesh>
      <mesh position={[0, 2.3, 0]}>
        <cylinderGeometry args={[1.2, 0.8, 0.8, 16]} />
        <primitive object={materials.catHopper} />
      </mesh>
      <group position={[0, 1.1, 0]}>
        <mesh ref={rollerL} position={[-0.35, 0, 0]}>
          <cylinderGeometry args={[0.2, 0.2, 0.9, 12]} />
          <meshStandardMaterial color={palette.catAmber} metalness={0.7} roughness={0.2} />
        </mesh>
        <mesh ref={rollerR} position={[0.35, 0, 0]}>
          <cylinderGeometry args={[0.2, 0.2, 0.9, 12]} />
          <meshStandardMaterial color={palette.catAmber} metalness={0.7} roughness={0.2} />
        </mesh>
      </group>
      {selected && (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.15, 1.3, 32]} />
          <meshBasicMaterial color={palette.catAmber} />
        </mesh>
      )}
    </group>
  );
}

// ─── WORKCELL: GREP Workcell (Vertical Filter Chamber) ──────────────
function GrepWorkcell({
  active,
  exited,
  progressRef,
  selected,
  onSelect,
}: {
  readonly active: boolean;
  readonly exited: boolean;
  readonly progressRef: React.MutableRefObject<number>;
  readonly selected: boolean;
  readonly onSelect: () => void;
}) {
  const grates = useRef<THREE.Group>(null);

  useFrame(() => {
    if (grates.current) {
      if (exited) {
        grates.current.position.y = 0;
      } else if (active) {
        const p = progressRef.current;
        // Grates oscillate during filter transfer
        grates.current.position.y = Math.sin(p * Math.PI * 4.0) * 0.15;
      } else {
        grates.current.position.y = 0;
      }
    }
  });

  return (
    <group position={[3.2, 0, 1.2]} onClick={(e) => { e.stopPropagation(); onSelect(); }}>
      <mesh position={[0, 1.1, 0]} castShadow>
        <boxGeometry args={[1.9, 2.2, 1.7]} />
        <meshStandardMaterial color="#f8fafc" metalness={0.4} roughness={0.3} />
      </mesh>
      <mesh position={[0, 1.1, 0]}>
        <boxGeometry args={[1.7, 1.9, 1.5]} />
        <primitive object={materials.grepGlass} />
      </mesh>
      <group ref={grates} position={[0, 0, 0]}>
        {[-0.45, 0, 0.45].map((x, i) => (
          <mesh key={i} position={[x, 1.1, 0]}>
            <boxGeometry args={[0.06, 1.6, 1.3]} />
            <meshStandardMaterial
              color={palette.grepEmerald}
              emissive={new THREE.Color(palette.grepEmerald)}
              emissiveIntensity={active && !exited ? 0.7 : 0.05}
              metalness={0.6}
              roughness={0.2}
            />
          </mesh>
        ))}
      </group>
      {selected && (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.2, 1.35, 32]} />
          <meshBasicMaterial color={palette.grepEmerald} />
        </mesh>
      )}
    </group>
  );
}

// ─── WORKCELL: ECHO Workcell (Byte Burst Emitter) ───────────────────
function EchoWorkcell({
  active,
  exited,
  progressRef,
  selected,
  onSelect,
}: {
  readonly active: boolean;
  readonly exited: boolean;
  readonly progressRef: React.MutableRefObject<number>;
  readonly selected: boolean;
  readonly onSelect: () => void;
}) {
  const horn = useRef<THREE.Mesh>(null);

  useFrame(() => {
    if (horn.current) {
      if (active && !exited) {
        const p = progressRef.current;
        const s = 1.0 + Math.sin(p * Math.PI) * 0.22;
        horn.current.scale.set(s, s, s);
      } else {
        horn.current.scale.set(1, 1, 1);
      }
    }
  });

  return (
    <group position={[-2.2, 0, 1.2]} onClick={(e) => { e.stopPropagation(); onSelect(); }}>
      <mesh position={[0, 0.6, 0]} castShadow>
        <cylinderGeometry args={[0.8, 0.95, 1.2, 16]} />
        <meshStandardMaterial color="#f8fafc" metalness={0.5} roughness={0.3} />
      </mesh>
      <mesh ref={horn} position={[0, 1.7, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.9, 1.4, 16, 1, true]} />
        <meshStandardMaterial color={palette.echoPink} metalness={0.7} roughness={0.2} />
      </mesh>
      {selected && (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.15, 1.3, 32]} />
          <meshBasicMaterial color={palette.echoPink} />
        </mesh>
      )}
    </group>
  );
}

// ─── WORKCELL: LS Workcell (Scanner Turret) ─────────────────────────
function LsWorkcell({
  active,
  exited,
  progressRef,
  selected,
  onSelect,
}: {
  readonly active: boolean;
  readonly exited: boolean;
  readonly progressRef: React.MutableRefObject<number>;
  readonly selected: boolean;
  readonly onSelect: () => void;
}) {
  const turret = useRef<THREE.Group>(null);

  useFrame(() => {
    if (turret.current) {
      if (exited) {
        // Halt
      } else if (active) {
        const p = progressRef.current;
        // One-shot 360 degree scanner sweep
        turret.current.rotation.y = p * Math.PI * 2.0;
      }
    }
  });

  return (
    <group position={[-2.2, 0, 1.2]} onClick={(e) => { e.stopPropagation(); onSelect(); }}>
      <mesh position={[0, 0.6, 0]} castShadow>
        <cylinderGeometry args={[0.7, 0.85, 1.2, 16]} />
        <meshStandardMaterial color="#f8fafc" metalness={0.5} roughness={0.3} />
      </mesh>
      <group ref={turret} position={[0, 1.5, 0]}>
        <mesh position={[0, 0.4, 0]}>
          <cylinderGeometry args={[0.9, 0.7, 0.35, 16]} />
          <meshStandardMaterial color={palette.lsPurple} metalness={0.7} roughness={0.2} />
        </mesh>
        {[-0.6, 0.6].map((x, i) => (
          <mesh key={i} position={[x, 0.4, 0]}>
            <sphereGeometry args={[0.16, 12, 12]} />
            <meshBasicMaterial color={active ? palette.packetGlow : "#c4b5fd"} />
          </mesh>
        ))}
      </group>
      {selected && (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.15, 1.3, 32]} />
          <meshBasicMaterial color={palette.lsPurple} />
        </mesh>
      )}
    </group>
  );
}

// ─── WORKCELL: PS Workcell (Diagnostic Probe) ───────────────────────
function PsWorkcell({
  active,
  exited,
  progressRef,
  selected,
  onSelect,
}: {
  readonly active: boolean;
  readonly exited: boolean;
  readonly progressRef: React.MutableRefObject<number>;
  readonly selected: boolean;
  readonly onSelect: () => void;
}) {
  const probeRings = useRef<THREE.Group>(null);

  useFrame(() => {
    if (probeRings.current) {
      if (active && !exited) {
        const p = progressRef.current;
        probeRings.current.position.y = Math.sin(p * Math.PI * 2.0) * 0.25;
      }
    }
  });

  return (
    <group position={[-2.2, 0, 1.2]} onClick={(e) => { e.stopPropagation(); onSelect(); }}>
      <mesh position={[0, 1.2, 0]} castShadow>
        <cylinderGeometry args={[0.16, 0.22, 2.4, 12]} />
        <primitive object={materials.polishedChrome} />
      </mesh>
      <group ref={probeRings} position={[0, 0, 0]}>
        {[0.8, 1.3, 1.8].map((y, i) => (
          <mesh key={i} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.45 + i * 0.18, 0.035, 8, 24]} />
            <meshStandardMaterial
              color={palette.psCyan}
              emissive={new THREE.Color(palette.psCyan)}
              emissiveIntensity={active && !exited ? 0.7 : 0.05}
              metalness={0.8}
            />
          </mesh>
        ))}
      </group>
      {selected && (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.15, 1.3, 32]} />
          <meshBasicMaterial color={palette.psCyan} />
        </mesh>
      )}
    </group>
  );
}

// ─── WORKCELL: Filesystem Assembly (Storage Vault) ──────────────────
function FilesystemAssembly({
  active,
  selected,
  onSelect,
}: {
  readonly active: boolean;
  readonly selected: boolean;
  readonly onSelect: () => void;
}) {
  return (
    <group position={[-3.6, 0, -4.5]} onClick={(e) => { e.stopPropagation(); onSelect(); }}>
      <mesh position={[0, 1.1, 0]} castShadow>
        <cylinderGeometry args={[1.1, 1.2, 2.2, 6]} />
        <primitive object={materials.storageHex} />
      </mesh>
      <mesh position={[0, 1.1, 0]}>
        <cylinderGeometry args={[1.12, 1.12, 0.2, 6]} />
        <meshStandardMaterial color={palette.storageIndigo} metalness={0.7} />
      </mesh>
      <mesh position={[0, 2.22, 0]}>
        <cylinderGeometry args={[0.65, 0.65, 0.08, 16]} />
        <meshStandardMaterial
          color={active ? palette.packetGlow : palette.storageIndigo}
          emissive={active ? new THREE.Color(palette.packetGlow) : new THREE.Color(0)}
          emissiveIntensity={active ? 0.8 : 0}
        />
      </mesh>
      {selected && (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.35, 1.5, 32]} />
          <meshBasicMaterial color={palette.storageIndigo} />
        </mesh>
      )}
    </group>
  );
}

// ─── WORKCELL: Terminal Console (I/O Display) ───────────────────────
function TerminalConsole({
  active,
  selected,
  onSelect,
}: {
  readonly active: boolean;
  readonly selected: boolean;
  readonly onSelect: () => void;
}) {
  return (
    <group position={[3.6, 0, -4.5]} onClick={(e) => { e.stopPropagation(); onSelect(); }}>
      <mesh position={[0, 0.7, 0]} castShadow>
        <boxGeometry args={[1.8, 1.4, 1.6]} />
        <primitive object={materials.chassisBase} />
      </mesh>
      <mesh position={[0, 1.7, 0]} rotation={[-0.2, 0, 0]} castShadow>
        <boxGeometry args={[1.6, 1.1, 0.8]} />
        <primitive object={materials.screenBezel} />
      </mesh>
      <mesh position={[0, 1.7, 0.41]} rotation={[-0.2, 0, 0]}>
        <planeGeometry args={[1.4, 0.9]} />
        <primitive object={active ? materials.screenGlow : materials.screenDisplay} />
      </mesh>
      {selected && (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.25, 1.4, 32]} />
          <meshBasicMaterial color={palette.terminalTeal} />
        </mesh>
      )}
    </group>
  );
}

// ─── WORKCELL: Pipe Assembly (Transparent Directional Conduit) ──────
function PipeAssembly({
  created,
  active,
  selected,
  onSelect,
}: {
  readonly created: boolean;
  readonly active: boolean;
  readonly selected: boolean;
  readonly onSelect: () => void;
}) {
  if (!created) return null;

  return (
    <group onClick={(e) => { e.stopPropagation(); onSelect(); }}>
      <mesh geometry={pipeTubeGeom} material={materials.conduitGlass} />
      {[-0.2, 0.5, 1.2].map((x, i) => (
        <mesh key={i} position={[x, 1.8, 1.2]} rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[0.15, 0.02, 8, 16]} />
          <meshStandardMaterial
            color={active ? palette.terminalTeal : "#94a3b8"}
            emissive={active ? new THREE.Color(palette.terminalTeal) : new THREE.Color(0)}
            emissiveIntensity={active ? 0.7 : 0}
          />
        </mesh>
      ))}
      <mesh position={[-0.65, 1.8, 1.2]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.18, 0.18, 0.1, 16]} />
        <primitive object={materials.polishedChrome} />
      </mesh>
      <mesh position={[1.65, 1.8, 1.2]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.18, 0.18, 0.1, 16]} />
        <primitive object={materials.polishedChrome} />
      </mesh>
    </group>
  );
}

// ─── Camera Director Controller Rig ────────────────────────────────
function CameraDirectorRig({
  directive,
  cameraMode = "gentle",
}: {
  readonly directive: CameraDirective;
  readonly cameraMode?: CameraFollowMode;
}) {
  const { camera, gl } = useThree();
  const controlsRef = useRef<OrbitControls | null>(null);
  const fromPos = useRef(new THREE.Vector3());
  const fromTgt = useRef(new THREE.Vector3());
  const goalPos = useRef(new THREE.Vector3());
  const goalTgt = useRef(new THREE.Vector3());
  const progress = useRef(1.0);
  const prevDirectiveKey = useRef("");
  const isUserOrbiting = useRef(false);

  useEffect(() => {
    const ctrl = new OrbitControls(camera, gl.domElement);
    ctrl.enableDamping = true;
    ctrl.dampingFactor = 0.06;
    ctrl.minDistance = 4.0;
    ctrl.maxDistance = 45.0;
    ctrl.maxPolarAngle = Math.PI * 0.48;
    ctrl.target.set(0, 1.2, 0);

    const onStart = () => { isUserOrbiting.current = true; progress.current = 1.0; };
    const onEnd = () => { isUserOrbiting.current = false; };
    ctrl.addEventListener("start", onStart);
    ctrl.addEventListener("end", onEnd);
    controlsRef.current = ctrl;

    return () => {
      ctrl.removeEventListener("start", onStart);
      ctrl.removeEventListener("end", onEnd);
      ctrl.dispose();
    };
  }, [camera, gl.domElement]);

  useEffect(() => {
    if (cameraMode === "free" || !controlsRef.current) return;
    const key = `${directive.beat}-${directive.entityId}-${directive.sequence}`;
    if (key === prevDirectiveKey.current) return;
    prevDirectiveKey.current = key;

    fromPos.current.copy(camera.position);
    fromTgt.current.copy(controlsRef.current.target);
    goalPos.current.set(...directive.position);
    goalTgt.current.set(...directive.target);
    progress.current = 0.0;
  }, [camera, cameraMode, directive]);

  useFrame((_, delta) => {
    if (controlsRef.current) {
      if (cameraMode !== "free" && !isUserOrbiting.current && progress.current < 1.0) {
        progress.current = Math.min(1.0, progress.current + delta / 1.0);
        const t = progress.current;
        const smooth = t * t * (3 - 2 * t);
        camera.position.lerpVectors(fromPos.current, goalPos.current, smooth);
        controlsRef.current.target.lerpVectors(fromTgt.current, goalTgt.current, smooth);
      }
      controlsRef.current.update();
    }
  });

  return null;
}

// ─── Telemetry Probe ───────────────────────────────────────────────
function TelemetryProbe({ onTelemetry }: { readonly onTelemetry: (v: SceneTelemetry) => void }) {
  const { gl, scene } = useThree();
  const elapsed = useRef(0);
  const frames = useRef(0);

  useFrame((_, delta) => {
    elapsed.current += delta;
    frames.current += 1;
    if (elapsed.current < 1.0) return;

    let vis = 0;
    scene.traverse((o) => { if (o.visible) vis += 1; });
    const info = (gl as THREE.WebGLRenderer).info?.render;

    onTelemetry({
      fps: Math.round(frames.current / elapsed.current),
      frameTimeMs: (elapsed.current * 1000) / frames.current,
      drawCalls: info?.calls ?? 0,
      triangles: info?.triangles ?? 0,
      visibleObjects: vis,
    });
    elapsed.current = 0;
    frames.current = 0;
  });

  return null;
}

// ─── Main Scene (Single Unified Mechanical Observatory) ────────────
function Scene({
  frame,
  frameHistory,
  playing,
  cameraMode = "gentle",
  totalFrames = 1,
  selectedEntity,
  onSelectEntity,
  onTelemetry,
}: Omit<IndustrialMegacityProps, "onBackendChange">) {
  const eventKind = frame?.eventKind ?? "";
  const stage = frame?.stage ?? "";
  const focusIds = frame?.focusNodeIds ?? [];
  const sequence = frame?.sequence ?? 0;

  // Resolve Canonical ActionPlan from Semantic Event
  const actionPlan = useMemo(
    () => resolveActionPlan(eventKind, stage, focusIds, sequence, totalFrames),
    [eventKind, stage, focusIds, sequence, totalFrames],
  );

  const directive = useMemo(
    () => resolveCameraDirectiveFromActionPlan(actionPlan, sequence, totalFrames, cameraMode),
    [actionPlan, sequence, totalFrames, cameraMode],
  );

  // Execute One-Shot Choreography with zero React setState in loop
  const { progressRef } = useOneShotChoreography(actionPlan, sequence);

  // Determine presence of specific processes from history
  const hasCat = frameHistory.some((e) => e.focusNodeIds.some((id) => id.includes("cat")));
  const hasGrep = frameHistory.some((e) => e.focusNodeIds.some((id) => id.includes("grep")));
  const hasEcho = frameHistory.some((e) => e.focusNodeIds.some((id) => id.includes("echo")));
  const hasLs = frameHistory.some((e) => e.focusNodeIds.some((id) => id.includes("ls")));
  const hasPs = frameHistory.some((e) => e.focusNodeIds.some((id) => id.includes("ps")));
  const pipeCreated = frameHistory.some((e) => e.eventKind === "pipe_created");

  // Determine active entities from ActionPlan
  const isShellActive = actionPlan.sourceEntity === "shell" || actionPlan.targetEntity === "shell";
  const isCatActive = actionPlan.sourceEntity === "cat" || actionPlan.targetEntity === "cat";
  const isGrepActive = actionPlan.sourceEntity === "grep" || actionPlan.targetEntity === "grep";
  const isEchoActive = actionPlan.sourceEntity === "echo" || actionPlan.targetEntity === "echo";
  const isLsActive = actionPlan.sourceEntity === "ls" || actionPlan.targetEntity === "ls";
  const isPsActive = actionPlan.sourceEntity === "ps" || actionPlan.targetEntity === "ps";
  const isFsActive = actionPlan.sourceEntity === "filesystem" || actionPlan.targetEntity === "filesystem";
  const isTermActive = actionPlan.sourceEntity === "terminal" || actionPlan.targetEntity === "terminal";
  const isPipeActive = actionPlan.sourceEntity === "pipe" || actionPlan.targetEntity === "pipe";

  const isCatExited = frameHistory.some((e) => e.eventKind === "process_exited" && e.focusNodeIds.includes("process:cat"));
  const isGrepExited = frameHistory.some((e) => e.eventKind === "process_exited" && e.focusNodeIds.includes("process:grep"));
  const isEchoExited = frameHistory.some((e) => e.eventKind === "process_exited" && e.focusNodeIds.includes("process:echo"));
  const isLsExited = frameHistory.some((e) => e.eventKind === "process_exited" && e.focusNodeIds.includes("process:ls"));
  const isPsExited = frameHistory.some((e) => e.eventKind === "process_exited" && e.focusNodeIds.includes("process:ps"));

  const childTargetPos = useMemo<readonly [number, number, number] | null>(() => {
    if (actionPlan.actionType !== "process_fork") return null;
    if (actionPlan.targetEntity === "grep") return [3.2, 0, 1.2];
    return [-2.2, 0, 1.2];
  }, [actionPlan.actionType, actionPlan.targetEntity]);

  return (
    <>
      <color attach="background" args={[palette.bg]} />
      <fog attach="fog" args={[palette.fog, 22, 58]} />

      <ambientLight intensity={0.75} color="#ffffff" />
      <hemisphereLight args={["#ffffff", "#cbd5e1", 0.85]} />
      <directionalLight position={[12, 18, 10]} intensity={1.2} color="#ffffff" castShadow />
      <pointLight position={[-2.2, 3.5, 1.2]} intensity={isCatActive ? 16 : 4} distance={8} color={palette.catAmber} />
      <pointLight position={[3.2, 3.5, 1.2]} intensity={isGrepActive ? 16 : 4} distance={8} color={palette.grepEmerald} />
      <pointLight position={[0.5, 3.0, 1.2]} intensity={isPipeActive ? 18 : 6} distance={8} color={palette.terminalTeal} />

      <UnifiedPlantStructure />

      <ShellWorkcell
        active={isShellActive}
        progressRef={progressRef}
        selected={selectedEntity === "shell"}
        onSelect={() => onSelectEntity("shell")}
      />

      {hasCat && (
        <CatWorkcell
          active={isCatActive}
          exited={isCatExited}
          progressRef={progressRef}
          selected={selectedEntity === "cat"}
          onSelect={() => onSelectEntity("cat")}
        />
      )}

      {hasGrep && (
        <GrepWorkcell
          active={isGrepActive}
          exited={isGrepExited}
          progressRef={progressRef}
          selected={selectedEntity === "grep"}
          onSelect={() => onSelectEntity("grep")}
        />
      )}

      {hasEcho && (
        <EchoWorkcell
          active={isEchoActive}
          exited={isEchoExited}
          progressRef={progressRef}
          selected={selectedEntity === "echo"}
          onSelect={() => onSelectEntity("echo")}
        />
      )}

      {hasLs && (
        <LsWorkcell
          active={isLsActive}
          exited={isLsExited}
          progressRef={progressRef}
          selected={selectedEntity === "ls"}
          onSelect={() => onSelectEntity("ls")}
        />
      )}

      {hasPs && (
        <PsWorkcell
          active={isPsActive}
          exited={isPsExited}
          progressRef={progressRef}
          selected={selectedEntity === "ps"}
          onSelect={() => onSelectEntity("ps")}
        />
      )}

      <FilesystemAssembly
        active={isFsActive}
        selected={selectedEntity === "filesystem"}
        onSelect={() => onSelectEntity("filesystem")}
      />

      <TerminalConsole
        active={isTermActive}
        selected={selectedEntity === "terminal"}
        onSelect={() => onSelectEntity("terminal")}
      />

      <PipeAssembly
        created={pipeCreated}
        active={isPipeActive}
        selected={selectedEntity === "pipe"}
        onSelect={() => onSelectEntity("pipe")}
      />

      {/* Spawn Energy Pulse on Fork */}
      {actionPlan.actionType === "process_fork" && childTargetPos && (
        <SpawnEnergyPulse
          active={true}
          progressRef={progressRef}
          childPosition={childTargetPos}
        />
      )}

      {/* Data Conduits & Flow Packet Streams */}
      {/* 1. File -> CAT */}
      {hasCat && (
        <group>
          <mesh geometry={fileToCatTubeGeom} material={materials.conduitGlass} />
          <OneShotPacketStream
            curve={fileToCatCurve}
            active={actionPlan.flowPath === "file_to_cat"}
            progressRef={progressRef}
            color={palette.catAmber}
            count={8}
          />
        </group>
      )}

      {/* 2. CAT -> Pipe */}
      {hasCat && pipeCreated && (
        <OneShotPacketStream
          curve={catToPipeCurve}
          active={actionPlan.flowPath === "cat_to_pipe"}
          progressRef={progressRef}
          color={palette.catAmber}
          count={8}
        />
      )}

      {/* 3. Pipe -> GREP */}
      {hasGrep && pipeCreated && (
        <OneShotPacketStream
          curve={pipeCurve}
          active={actionPlan.flowPath === "pipe_to_grep" || actionPlan.flowPath === "cat_to_pipe"}
          progressRef={progressRef}
          color={palette.terminalTeal}
          count={10}
        />
      )}

      {/* 4. GREP -> Terminal */}
      {hasGrep && (
        <group>
          <mesh geometry={grepToTermTubeGeom} material={materials.conduitGlass} />
          <OneShotPacketStream
            curve={grepToTerminalCurve}
            active={actionPlan.flowPath === "grep_to_terminal"}
            progressRef={progressRef}
            color={palette.grepEmerald}
            count={8}
          />
        </group>
      )}

      {/* 5. CAT -> Terminal (Scenario C: cat sample.txt — NEVER TOUCH GREP/PIPE!) */}
      {hasCat && !hasGrep && (
        <group>
          <mesh geometry={catToTermTubeGeom} material={materials.conduitGlass} />
          <OneShotPacketStream
            curve={catToTerminalCurve}
            active={actionPlan.flowPath === "cat_to_terminal"}
            progressRef={progressRef}
            color={palette.catAmber}
            count={8}
          />
        </group>
      )}

      {/* 6. ECHO -> File (Scenario B: echo linux > sample.txt) */}
      {hasEcho && (
        <group>
          <mesh geometry={echoToFileTubeGeom} material={materials.conduitGlass} />
          <OneShotPacketStream
            curve={echoToFileCurve}
            active={actionPlan.flowPath === "echo_to_file"}
            progressRef={progressRef}
            color={palette.echoPink}
            count={8}
          />
        </group>
      )}

      {/* 7. LS -> Terminal (Scenario D: ls -l) */}
      {hasLs && (
        <group>
          <mesh geometry={lsToTermTubeGeom} material={materials.conduitGlass} />
          <OneShotPacketStream
            curve={lsToTerminalCurve}
            active={actionPlan.flowPath === "ls_to_terminal"}
            progressRef={progressRef}
            color={palette.lsPurple}
            count={8}
          />
        </group>
      )}

      {/* 8. PS -> Terminal (Scenario E: ps) */}
      {hasPs && (
        <group>
          <mesh geometry={psToTermTubeGeom} material={materials.conduitGlass} />
          <OneShotPacketStream
            curve={psToTerminalCurve}
            active={actionPlan.flowPath === "ps_to_terminal"}
            progressRef={progressRef}
            color={palette.psCyan}
            count={8}
          />
        </group>
      )}

      <CameraDirectorRig directive={directive} cameraMode={cameraMode} />
      <TelemetryProbe onTelemetry={onTelemetry} />
    </>
  );
}

// ─── Exported Root IndustrialMegacity Canvas ─────────────────────────
export function IndustrialMegacity(props: IndustrialMegacityProps) {
  return (
    <Canvas
      camera={{ position: [10, 8.5, 12], fov: 42, near: 0.1, far: 100 }}
      dpr={[1, 1.5]}
      fallback={<div className="renderer-fallback">Không thể khởi tạo bộ kết xuất GPU.</div>}
      gl={async (parameters) => {
        const canvas = parameters.canvas as HTMLCanvasElement;
        try {
          const renderer = new WebGPURenderer({ canvas, antialias: true, alpha: false });
          await renderer.init();
          renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
          renderer.toneMapping = THREE.ACESFilmicToneMapping;
          renderer.toneMappingExposure = 1.0;
          props.onBackendChange(renderer.coordinateSystem === THREE.WebGPUCoordinateSystem ? "webgpu" : "webgl2");
          return renderer;
        } catch {
          const fb = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
          fb.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
          fb.toneMapping = THREE.ACESFilmicToneMapping;
          fb.toneMappingExposure = 1.0;
          props.onBackendChange("webgl2");
          return fb;
        }
      }}
      onPointerMissed={() => props.onSelectEntity("overview")}
    >
      <Scene {...props} />
    </Canvas>
  );
}

export default IndustrialMegacity;
