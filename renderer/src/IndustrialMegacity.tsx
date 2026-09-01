import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  resolveCameraDirective,
  type CameraDirective,
  type CameraFollowMode,
  type VisualEntityId,
} from "@linux-observatory/camera-director";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { WebGPURenderer } from "three/webgpu";

export type RenderBackend = "initializing" | "webgpu" | "webgl2";
export type VisualViewMode = "city" | "truth" | "dual";

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
  readonly viewMode: VisualViewMode;
  readonly cameraMode?: CameraFollowMode;
  readonly totalFrames?: number;
  readonly selectedEntity: VisualEntityId;
  readonly onSelectEntity: (entity: VisualEntityId) => void;
  readonly onBackendChange: (backend: RenderBackend) => void;
  readonly onTelemetry: (telemetry: SceneTelemetry) => void;
}

type ModuleEntityId = Exclude<VisualEntityId, "overview" | "pipe">;

interface ModuleDefinition {
  readonly id: ModuleEntityId;
  readonly label: string;
  readonly position: readonly [number, number, number];
  readonly color: string;
  readonly height: number;
}

const allModules: readonly ModuleDefinition[] = [
  { id: "shell", label: "SHELL [sh]", position: [-6.5, 0, -1], color: "#2563eb", height: 3.8 },
  { id: "cat", label: "CAT [cat]", position: [-2.2, 0, 1.2], color: "#d97706", height: 3.2 },
  { id: "grep", label: "GREP [grep]", position: [3.2, 0, 1.2], color: "#059669", height: 3.3 },
  { id: "echo", label: "ECHO [echo]", position: [-2.2, 0, 1.2], color: "#db2777", height: 3.2 },
  { id: "ls", label: "LS [ls]", position: [-2.2, 0, 1.2], color: "#7c3aed", height: 3.2 },
  { id: "ps", label: "PS [ps]", position: [-2.2, 0, 1.2], color: "#0891b2", height: 3.2 },
  { id: "filesystem", label: "TẬP TIN [file]", position: [-3.6, 0, -5], color: "#4f46e5", height: 2.9 },
  { id: "terminal", label: "TERMINAL [tty]", position: [3.6, 0, -5], color: "#0d9488", height: 2.9 },
  { id: "kernel", label: "KERNEL [nhân]", position: [0.5, 0, -3.4], color: "#6366f1", height: 4.2 },
] as const;

// Smooth pipe conduit curve between process bays
const pipeCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(-0.65, 1.65, 1.2),
  new THREE.Vector3(0.2, 2.7, 2.2),
  new THREE.Vector3(1.45, 2.65, 2.1),
  new THREE.Vector3(2.25, 1.7, 1.2),
]);

function eventHasEntity(
  history: readonly VisualReplayFrame[],
  eventKind: string,
  semanticId: string,
) {
  return history.some(
    (event) => event.eventKind === eventKind && event.focusNodeIds.includes(semanticId),
  );
}

// Background mechanical structures with light architectural styling
function BackgroundStructures({ visible }: { readonly visible: boolean }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const count = 72;

  const blocks = useMemo(() => {
    const items: Array<{ x: number; y: number; z: number; sx: number; sy: number; sz: number }> = [];
    for (let index = 0; index < count; index += 1) {
      const angle = index * 2.399963;
      const radius = 12 + (index % 9) * 0.8;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius - 1.5;
      const height = 0.6 + ((index * 13) % 23) / 9;
      items.push({
        x,
        y: height / 2,
        z,
        sx: 0.55 + (index % 4) * 0.12,
        sy: height,
        sz: 0.55 + ((index * 3) % 4) * 0.12,
      });
    }
    return items;
  }, []);

  useLayoutEffect(() => {
    if (!mesh.current) return;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const color = new THREE.Color();
    blocks.forEach((block, index) => {
      position.set(block.x, block.y, block.z);
      scale.set(block.sx, block.sy, block.sz);
      matrix.compose(position, new THREE.Quaternion(), scale);
      mesh.current?.setMatrixAt(index, matrix);
      const tone = 0.82 + (index % 5) * 0.03;
      color.setRGB(tone, tone * 1.02, tone * 1.05);
      mesh.current?.setColorAt(index, color);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
  }, [blocks]);

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]} visible={visible}>
      <boxGeometry />
      <meshStandardMaterial vertexColors roughness={0.88} metalness={0.15} />
    </instancedMesh>
  );
}

// Precision Vietnamese Label Sprite
function LabelSprite({
  label,
  position,
  active,
  scale = [3.4, 0.68, 1],
  alwaysOnTop = false,
}: {
  readonly label: string;
  readonly position: readonly [number, number, number];
  readonly active: boolean;
  readonly scale?: readonly [number, number, number];
  readonly alwaysOnTop?: boolean;
}) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 100;
    const context = canvas.getContext("2d");
    if (!context) return new THREE.CanvasTexture(canvas);

    // Light technical aesthetic
    context.fillStyle = active ? "rgba(255, 255, 255, 0.96)" : "rgba(241, 245, 249, 0.88)";
    context.roundRect ? context.roundRect(4, 4, canvas.width - 8, canvas.height - 8, 12) : context.rect(4, 4, canvas.width - 8, canvas.height - 8);
    context.fill();

    context.strokeStyle = active ? "#2563eb" : "#94a3b8";
    context.lineWidth = active ? 5 : 2;
    context.stroke();

    context.fillStyle = active ? "#0f172a" : "#475569";
    context.font = "bold 32px 'Segoe UI', Consolas, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(label, canvas.width / 2, canvas.height / 2);

    const next = new THREE.CanvasTexture(canvas);
    next.colorSpace = THREE.SRGBColorSpace;
    return next;
  }, [active, label]);

  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <sprite position={position} scale={scale} renderOrder={alwaysOnTop ? 20 : 0}>
      <spriteMaterial map={texture} transparent depthWrite={false} depthTest={!alwaysOnTop} />
    </sprite>
  );
}

// Observable Mechanical Machine Assembly
function MechanicalModule({
  definition,
  active,
  executed,
  highlighted,
  selected,
  truthMode,
  onSelect,
}: {
  readonly definition: ModuleDefinition;
  readonly active: boolean;
  readonly executed: boolean;
  readonly highlighted: boolean;
  readonly selected: boolean;
  readonly truthMode: boolean;
  readonly onSelect: () => void;
}) {
  const spindle = useRef<THREE.Mesh>(null);
  const piston = useRef<THREE.Mesh>(null);
  const coreMesh = useRef<THREE.Mesh>(null);
  const ring1 = useRef<THREE.Mesh>(null);
  const ring2 = useRef<THREE.Mesh>(null);

  const themeColor = useMemo(() => new THREE.Color(definition.color), [definition.color]);

  useFrame((state, delta) => {
    // Spindle rotation: spins smoothly when active, subtle idle rotation otherwise
    if (spindle.current) {
      spindle.current.rotation.y += delta * (active ? 3.0 : 0.5);
    }
    // Piston vertical harmonic oscillation when active
    if (piston.current) {
      if (active) {
        piston.current.position.y =
          definition.height / 2 + 0.3 + Math.sin(state.clock.elapsedTime * 4.5) * 0.28;
      } else {
        piston.current.position.y = definition.height / 2 + 0.3;
      }
    }
    // Stator rings counter-rotation
    if (ring1.current) {
      ring1.current.rotation.y += delta * 1.2;
    }
    if (ring2.current) {
      ring2.current.rotation.y -= delta * 0.9;
    }
  });

  return (
    <group
      position={definition.position}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
    >
      {/* 1. Precision Stepped Machine Pedestal */}
      <mesh position={[0, 0.16, 0]}>
        <cylinderGeometry args={[1.5, 1.7, 0.32, 16]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.65} roughness={0.25} />
      </mesh>
      <mesh position={[0, 0.34, 0]}>
        <cylinderGeometry args={[1.35, 1.48, 0.08, 16]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.7} roughness={0.2} />
      </mesh>

      {/* 2. Four Vertical Chrome Guide Columns */}
      {[
        [-0.95, -0.85] as const,
        [0.95, -0.85] as const,
        [-0.95, 0.85] as const,
        [0.95, 0.85] as const,
      ].map(([cx, cz], idx) => (
        <mesh key={idx} position={[cx, definition.height / 2 + 0.34, cz]}>
          <cylinderGeometry args={[0.05, 0.05, definition.height, 8]} />
          <meshStandardMaterial color="#cbd5e1" metalness={0.9} roughness={0.15} />
        </mesh>
      ))}

      {/* 3. Transparent Technical Outer Casing */}
      <mesh position={[0, definition.height / 2 + 0.34, 0]}>
        <boxGeometry args={[2.1, definition.height, 1.9]} />
        <meshStandardMaterial
          color="#ffffff"
          transparent
          opacity={truthMode ? 0.08 : 0.24}
          roughness={0.08}
          metalness={0.15}
          depthWrite={false}
          wireframe={truthMode}
        />
      </mesh>

      {/* 4. Internal Mechanical Core & Spindle */}
      <mesh ref={spindle} position={[0, definition.height / 2 + 0.34, 0]}>
        <cylinderGeometry args={[0.22, 0.22, definition.height * 0.88, 16]} />
        <meshStandardMaterial color="#475569" metalness={0.85} roughness={0.2} />
      </mesh>

      {/* Animated Piston Cylinder */}
      <mesh ref={piston} position={[0, definition.height / 2 + 0.3, 0]}>
        <cylinderGeometry args={[0.38, 0.38, 0.55, 16]} />
        <meshStandardMaterial
          color={active ? themeColor : "#64748b"}
          emissive={themeColor}
          emissiveIntensity={highlighted ? 0.9 : active ? 0.45 : 0.05}
          metalness={0.7}
          roughness={0.25}
        />
      </mesh>

      {/* Stacked Stator Rings */}
      <mesh ref={ring1} position={[0, definition.height * 0.35 + 0.3, 0]}>
        <torusGeometry args={[0.65, 0.04, 8, 32]} />
        <meshStandardMaterial color="#64748b" metalness={0.8} roughness={0.2} />
      </mesh>
      <mesh ref={ring2} position={[0, definition.height * 0.65 + 0.3, 0]}>
        <torusGeometry args={[0.62, 0.04, 8, 32]} />
        <meshStandardMaterial color="#64748b" metalness={0.8} roughness={0.2} />
      </mesh>

      {/* Top Aperture / Core Dome */}
      <mesh position={[0, definition.height + 0.48, 0]}>
        <cylinderGeometry args={[0.65, 0.95, 0.3, 16]} />
        <meshStandardMaterial color="#64748b" metalness={0.8} roughness={0.25} />
      </mesh>
      <mesh position={[0, definition.height + 0.68, 0]}>
        <sphereGeometry args={[0.32, 16, 16]} />
        <meshStandardMaterial
          color={themeColor}
          emissive={themeColor}
          emissiveIntensity={highlighted ? 1.4 : executed ? 0.7 : active ? 0.4 : 0.1}
          metalness={0.4}
          roughness={0.2}
        />
      </mesh>

      {/* Selection / Highlight Target Ring on Ground */}
      {(selected || highlighted) && (
        <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.75, 1.95, 48]} />
          <meshBasicMaterial color={highlighted ? "#2563eb" : themeColor} transparent opacity={0.95} />
        </mesh>
      )}

      {/* Floating Vietnamese Holographic Label */}
      <LabelSprite
        label={definition.label}
        position={[0, definition.height + 1.8, 0]}
        active={active || highlighted}
      />
    </group>
  );
}

// Precision Pipe Conduit with Mechanical Couplings
function PipeConduit({
  created,
  active,
  selected,
  catStdoutBound,
  grepStdinBound,
  onSelect,
}: {
  readonly created: boolean;
  readonly active: boolean;
  readonly selected: boolean;
  readonly catStdoutBound: boolean;
  readonly grepStdinBound: boolean;
  readonly onSelect: () => void;
}) {
  const geometry = useMemo(() => new THREE.TubeGeometry(pipeCurve, 48, 0.15, 10, false), []);
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <group
      visible={created}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
    >
      {/* Outer Transparent Glass Conduit */}
      <mesh geometry={geometry}>
        <meshStandardMaterial
          color="#0d9488"
          emissive="#14b8a6"
          emissiveIntensity={active ? 0.8 : 0.15}
          metalness={0.5}
          roughness={0.15}
          transparent
          opacity={created ? 0.85 : 0.2}
        />
      </mesh>

      {/* Directional Flow Chevron Cones */}
      {[0.28, 0.52, 0.78].map((offset) => {
        const point = pipeCurve.getPoint(offset);
        const tangent = pipeCurve.getTangent(offset).normalize();
        const quaternion = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          tangent,
        );
        return (
          <mesh key={offset} position={point} quaternion={quaternion}>
            <coneGeometry args={[0.26, 0.55, 10]} />
            <meshStandardMaterial
              color="#0d9488"
              emissive="#14b8a6"
              emissiveIntensity={active ? 1.6 : 0.3}
              metalness={0.6}
              roughness={0.2}
            />
          </mesh>
        );
      })}

      {selected && (
        <mesh position={pipeCurve.getPoint(0.5)}>
          <torusGeometry args={[0.65, 0.045, 8, 48]} />
          <meshBasicMaterial color="#2563eb" />
        </mesh>
      )}

      <LabelSprite label="ĐƯỜNG ỐNG VÔ DANH [pipe]" position={[0.75, 3.45, 2.15]} active={created || active} />

      {catStdoutBound && (
        <LabelSprite
          label="CAT STDOUT / FD 1"
          position={[-0.2, 0.85, 2.2]}
          active
          scale={[2.2, 0.42, 1]}
          alwaysOnTop
        />
      )}
      {grepStdinBound && (
        <LabelSprite
          label="GREP STDIN / FD 0"
          position={[1.7, 0.7, 2.2]}
          active
          scale={[2.2, 0.42, 1]}
          alwaysOnTop
        />
      )}
    </group>
  );
}

// Flowing Data Spheres during I/O transfer
function DataFlow({ active }: { readonly active: boolean }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const count = 12;
  const matrix = useMemo(() => new THREE.Matrix4(), []);
  const position = useMemo(() => new THREE.Vector3(), []);
  const scale = useMemo(() => new THREE.Vector3(), []);

  useFrame((state) => {
    if (!mesh.current) return;
    for (let index = 0; index < count; index += 1) {
      const progress = (state.clock.elapsedTime * 0.55 + index / count) % 1;
      pipeCurve.getPoint(progress, position);
      const size = active ? 0.18 + (index % 3) * 0.03 : 0;
      scale.setScalar(size);
      matrix.compose(position, new THREE.Quaternion(), scale);
      mesh.current.setMatrixAt(index, matrix);
    }
    mesh.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]} frustumCulled={false}>
      <sphereGeometry args={[1, 10, 10]} />
      <meshStandardMaterial
        color="#0d9488"
        emissive="#2dd4bf"
        emissiveIntensity={2.5}
        roughness={0.1}
      />
    </instancedMesh>
  );
}

// Pipeline / Scenario Completion Visual Indicator
function PipelineComplete({ visible }: { readonly visible: boolean }) {
  const group = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (group.current && visible) group.current.rotation.y += delta * 0.35;
  });
  if (!visible) return null;
  return (
    <group ref={group} position={[0.5, 0.16, -3.4]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[2.8, 0.05, 10, 72]} />
        <meshBasicMaterial color="#2563eb" toneMapped={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, Math.PI / 4]}>
        <torusGeometry args={[3.3, 0.025, 8, 72]} />
        <meshBasicMaterial color="#059669" transparent opacity={0.8} toneMapped={false} />
      </mesh>
      <LabelSprite label="KỊCH BẢN HOÀN THÀNH" position={[0, 6.6, 0]} active />
      <pointLight position={[0, 3.2, 0]} intensity={18} distance={10} color="#3b82f6" />
    </group>
  );
}

// High-Performance Cached 3D Wireframe Graph for TRUTH mode
function TruthGraph3D({
  visible,
  activeModules,
}: {
  readonly visible: boolean;
  readonly activeModules: readonly ModuleDefinition[];
}) {
  const nodes = useMemo(
    () =>
      activeModules.map((module) => ({
        id: module.id,
        position: new THREE.Vector3(module.position[0], module.height + 0.8, module.position[2]),
        color: module.color,
      })),
    [activeModules],
  );

  const kernel = nodes.find((n) => n.id === "kernel");
  if (!visible || !kernel) return null;

  return (
    <group>
      {nodes.map((node) => (
        <mesh key={node.id} position={node.position}>
          <icosahedronGeometry args={[0.38, 1]} />
          <meshBasicMaterial color={node.color} wireframe />
        </mesh>
      ))}
      {nodes
        .filter((n) => n.id !== "kernel")
        .map((n) => {
          const points = [kernel.position, n.position];
          const geometry = new THREE.BufferGeometry().setFromPoints(points);
          return (
            <primitive object={new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: "#2563eb", linewidth: 2 }))} key={n.id} />
          );
        })}
    </group>
  );
}

// Smooth Narrative Camera Director Rig
function CameraDirectorRig({
  directive,
  cameraMode,
}: {
  readonly directive: CameraDirective;
  readonly cameraMode: CameraFollowMode;
}) {
  const { camera, gl } = useThree();
  const controls = useMemo(() => new OrbitControls(camera, gl.domElement), [camera, gl]);
  const fromPosition = useRef(camera.position.clone());
  const fromTarget = useRef(new THREE.Vector3());
  const goalPosition = useRef(new THREE.Vector3(...directive.position));
  const goalTarget = useRef(new THREE.Vector3(...directive.target));
  const progress = useRef(1);
  const previousDirectiveKey = useRef("");
  const isUserOrbiting = useRef(false);

  useEffect(() => {
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 4;
    controls.maxDistance = 38;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.target.set(0, 1.2, -1);

    const onStartOrbit = () => {
      isUserOrbiting.current = true;
      progress.current = 1;
    };
    const onEndOrbit = () => {
      isUserOrbiting.current = false;
    };

    controls.addEventListener("start", onStartOrbit);
    controls.addEventListener("end", onEndOrbit);

    return () => {
      controls.removeEventListener("start", onStartOrbit);
      controls.removeEventListener("end", onEndOrbit);
      controls.dispose();
    };
  }, [controls]);

  useEffect(() => {
    if (cameraMode === "free") return;

    // In gentle mode, only shift if narrative beat or focus changed significantly
    const directiveKey =
      cameraMode === "gentle"
        ? `${directive.beat}-${directive.entityId}`
        : `${directive.sequence}-${directive.entityId}`;

    if (directiveKey === previousDirectiveKey.current) return;
    previousDirectiveKey.current = directiveKey;

    fromPosition.current.copy(camera.position);
    fromTarget.current.copy(controls.target);
    goalPosition.current.set(...directive.position);
    goalTarget.current.set(...directive.target);
    progress.current = 0;
  }, [camera, cameraMode, controls, directive]);

  useFrame((_, delta) => {
    if (cameraMode !== "free" && !isUserOrbiting.current && progress.current < 1) {
      progress.current = Math.min(1, progress.current + delta / 1.6);
      const t = progress.current;
      const smooth = t * t * (3 - 2 * t);
      camera.position.lerpVectors(fromPosition.current, goalPosition.current, smooth);
      controls.target.lerpVectors(fromTarget.current, goalTarget.current, smooth);
    }
    controls.update();
  });

  return null;
}

// Scene Telemetry Probe
function TelemetryProbe({ onTelemetry }: { readonly onTelemetry: (value: SceneTelemetry) => void }) {
  const { gl, scene } = useThree();
  const elapsed = useRef(0);
  const frames = useRef(0);

  useFrame((_, delta) => {
    elapsed.current += delta;
    frames.current += 1;
    if (elapsed.current < 1) return;

    let visibleObjects = 0;
    scene.traverse((object) => {
      if (object.visible) visibleObjects += 1;
    });
    const rendererInfo = (gl as THREE.WebGLRenderer).info?.render;
    const drawCalls = rendererInfo?.calls ?? 0;
    const triangles = rendererInfo?.triangles ?? 0;

    onTelemetry({
      fps: frames.current / elapsed.current,
      frameTimeMs: (elapsed.current * 1000) / frames.current,
      drawCalls,
      triangles,
      visibleObjects,
    });

    elapsed.current = 0;
    frames.current = 0;
  });

  return null;
}

function Scene({
  frame,
  frameHistory,
  playing,
  viewMode,
  cameraMode = "gentle",
  totalFrames = 22,
  selectedEntity,
  onSelectEntity,
  onTelemetry,
}: Omit<IndustrialMegacityProps, "onBackendChange">) {
  const focusIds = frame?.focusNodeIds ?? [];
  const directive = useMemo(
    () =>
      resolveCameraDirective(
        focusIds,
        frame?.stage ?? "overview",
        frame?.sequence ?? 0,
        totalFrames,
        cameraMode,
      ),
    [focusIds, frame?.sequence, frame?.stage, totalFrames, cameraMode],
  );

  // Determine active entities present in this scenario
  const hasShell = frameHistory.some((e) => e.focusNodeIds.some((id) => id.includes("shell")));
  const hasCat = frameHistory.some((e) => e.focusNodeIds.some((id) => id.includes("cat")));
  const hasGrep = frameHistory.some((e) => e.focusNodeIds.some((id) => id.includes("grep")));
  const hasEcho = frameHistory.some((e) => e.focusNodeIds.some((id) => id.includes("echo")));
  const hasLs = frameHistory.some((e) => e.focusNodeIds.some((id) => id.includes("ls")));
  const hasPs = frameHistory.some((e) => e.focusNodeIds.some((id) => id.includes("ps")));
  const hasFilesystem = frameHistory.some((e) =>
    e.focusNodeIds.some((id) => id.startsWith("file:") || id.includes("dir") || id.includes("proc")),
  );
  const hasTerminal = frameHistory.some((e) =>
    e.focusNodeIds.some((id) => id.includes("tty") || id.includes("terminal")),
  );
  const pipeCreated = frameHistory.some((e) => e.eventKind === "pipe_created");

  const catStdoutBound = eventHasEntity(frameHistory, "file_descriptor_duplicated", "process:cat");
  const grepStdinBound = eventHasEntity(frameHistory, "file_descriptor_duplicated", "process:grep");
  const pipeFlow =
    frame?.stage === "pipe_io" && ["bytes_read", "bytes_written"].includes(frame?.eventKind ?? "");

  const pipelineComplete =
    totalFrames > 0 &&
    (frame?.sequence ?? 0) >= totalFrames &&
    ["process_waited", "exit", "wait"].includes(frame?.eventKind ?? "");

  // Filter modules visible in this scenario
  const activeModules = useMemo(() => {
    return allModules.filter((m) => {
      if (m.id === "kernel") return true;
      if (m.id === "shell") return hasShell || true;
      if (m.id === "cat") return hasCat;
      if (m.id === "grep") return hasGrep;
      if (m.id === "echo") return hasEcho;
      if (m.id === "ls") return hasLs;
      if (m.id === "ps") return hasPs;
      if (m.id === "filesystem") return hasFilesystem;
      if (m.id === "terminal") return hasTerminal;
      return false;
    });
  }, [hasCat, hasEcho, hasFilesystem, hasGrep, hasLs, hasPs, hasShell, hasTerminal]);

  const truthMode = viewMode === "truth";
  const highlightedEntity = directive.entityId;

  return (
    <>
      {/* Crisp Light Theme Atmosphere */}
      <color attach="background" args={["#eef2f6"]} />
      <fog attach="fog" args={["#eef2f6", 18, 48]} />

      {/* Technical Daylight Lighting */}
      <ambientLight intensity={0.75} color="#ffffff" />
      <hemisphereLight args={["#ffffff", "#e2e8f0", 0.9]} />
      <directionalLight position={[10, 16, 8]} intensity={1.25} color="#ffffff" />
      <pointLight position={[0.5, 5, -3.4]} intensity={14} distance={14} color="#6366f1" />
      <pointLight
        position={[0.8, 4, 2]}
        intensity={pipeFlow ? 22 : 8}
        distance={10}
        color="#0d9488"
      />

      {/* Clean Light Technical Ground Plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.03, 0]}>
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.9} metalness={0.05} />
      </mesh>
      <gridHelper args={[70, 70, "#cbd5e1", "#e2e8f0"]} position={[0, 0.01, 0]} />

      {/* Background Architectural Structures */}
      <BackgroundStructures visible={viewMode !== "truth"} />

      {/* Active Mechanical Modules */}
      {activeModules.map((definition) => {
        const isProcess = ["cat", "grep", "echo", "ls", "ps"].includes(definition.id);
        const isActive =
          definition.id === "kernel" ||
          (definition.id === "shell" && hasShell) ||
          (isProcess && frameHistory.some((e) => e.focusNodeIds.includes(`process:${definition.id}`))) ||
          (definition.id === "filesystem" && hasFilesystem) ||
          (definition.id === "terminal" && hasTerminal);

        const isExecuted =
          isProcess &&
          eventHasEntity(frameHistory, "process_executed", `process:${definition.id}`);

        return (
          <MechanicalModule
            key={definition.id}
            definition={definition}
            active={isActive}
            executed={isExecuted}
            highlighted={highlightedEntity === definition.id}
            selected={selectedEntity === definition.id}
            truthMode={truthMode}
            onSelect={() => onSelectEntity(definition.id)}
          />
        );
      })}

      {/* Pipe Conduit (if scenario creates a pipe) */}
      <PipeConduit
        created={pipeCreated}
        active={pipeFlow || (playing && highlightedEntity === "pipe")}
        selected={selectedEntity === "pipe"}
        catStdoutBound={catStdoutBound}
        grepStdinBound={grepStdinBound}
        onSelect={() => onSelectEntity("pipe")}
      />
      <DataFlow active={pipeFlow} />

      {/* Scenario Complete Indicator */}
      <PipelineComplete visible={pipelineComplete} />

      {/* 3D Wireframe Graph for TRUTH mode */}
      <TruthGraph3D visible={viewMode === "truth"} activeModules={activeModules} />

      {/* Camera Rig & Telemetry */}
      <CameraDirectorRig directive={directive} cameraMode={cameraMode} />
      <TelemetryProbe onTelemetry={onTelemetry} />
    </>
  );
}

export function IndustrialMegacity(props: IndustrialMegacityProps) {
  return (
    <Canvas
      camera={{ position: [12, 10, 15], fov: 42, near: 0.1, far: 100 }}
      dpr={[1, 1.5]}
      fallback={<div className="renderer-fallback">Không thể khởi tạo bộ kết xuất GPU.</div>}
      gl={async (parameters) => {
        const canvas = parameters.canvas as HTMLCanvasElement;
        try {
          const renderer = new WebGPURenderer({
            canvas,
            antialias: true,
            alpha: false,
          });
          await renderer.init();
          renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
          renderer.toneMapping = THREE.ACESFilmicToneMapping;
          renderer.toneMappingExposure = 1.0;
          props.onBackendChange(
            renderer.coordinateSystem === THREE.WebGPUCoordinateSystem ? "webgpu" : "webgl2",
          );
          return renderer;
        } catch {
          const fallback = new THREE.WebGLRenderer({
            canvas,
            antialias: true,
            alpha: false,
            powerPreference: "high-performance",
          });
          fallback.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
          fallback.toneMapping = THREE.ACESFilmicToneMapping;
          fallback.toneMappingExposure = 1.0;
          props.onBackendChange("webgl2");
          return fallback;
        }
      }}
      onPointerMissed={() => props.onSelectEntity("overview")}
    >
      <Scene {...props} />
    </Canvas>
  );
}
