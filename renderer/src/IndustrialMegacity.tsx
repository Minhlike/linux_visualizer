import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  resolveCameraDirective,
  type CameraDirective,
  type VisualEntityId,
} from "@linux-observatory/camera-director";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
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

const modules: readonly ModuleDefinition[] = [
  { id: "shell", label: "SHELL CONTROL", position: [-6.5, 0, -1], color: "#d5ec62", height: 3.6 },
  { id: "cat", label: "CAT PROCESS", position: [-2.2, 0, 1.2], color: "#ff9f43", height: 3.1 },
  { id: "grep", label: "GREP PROCESS", position: [3.2, 0, 1.2], color: "#5ee1c2", height: 3.25 },
  { id: "filesystem", label: "FILESYSTEM", position: [-3.6, 0, -5], color: "#7aa7ff", height: 2.7 },
  { id: "kernel", label: "KERNEL CORE", position: [0.5, 0, -3.4], color: "#d785ff", height: 4.2 },
] as const;

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

function BackgroundCity({ visible }: { readonly visible: boolean }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const count = 110;

  const blocks = useMemo(() => {
    const items: Array<{ x: number; y: number; z: number; sx: number; sy: number; sz: number; tone: number }> = [];
    for (let index = 0; index < count; index += 1) {
      const angle = index * 2.399963;
      const radius = 10 + (index % 13) * 0.7;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius - 1.5;
      const height = 0.8 + ((index * 17) % 31) / 8;
      items.push({
        x,
        y: height / 2,
        z,
        sx: 0.55 + (index % 4) * 0.13,
        sy: height,
        sz: 0.55 + ((index * 3) % 4) * 0.12,
        tone: 0.16 + (index % 7) * 0.012,
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
      color.setRGB(block.tone, block.tone * 1.08, block.tone * 0.92);
      mesh.current?.setColorAt(index, color);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
  }, [blocks]);

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]} visible={visible}>
      <boxGeometry />
      <meshStandardMaterial vertexColors roughness={0.94} metalness={0.2} />
    </instancedMesh>
  );
}

function LabelSprite({
  label,
  position,
  active,
  scale = [3.4, 0.64, 1],
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
    canvas.height = 96;
    const context = canvas.getContext("2d");
    if (!context) return new THREE.CanvasTexture(canvas);
    context.fillStyle = "rgba(10, 13, 11, 0.88)";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = active ? "#c7ef4b" : "#53604c";
    context.lineWidth = 4;
    context.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);
    context.fillStyle = active ? "#e8f3c5" : "#95a08b";
    context.font = "600 34px Consolas, monospace";
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

function IndustrialModule({
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
  const group = useRef<THREE.Group>(null);
  const material = useRef<THREE.MeshStandardMaterial>(null);
  const targetScale = active ? 1 : 0.48;
  const color = useMemo(() => new THREE.Color(definition.color), [definition.color]);

  useFrame((_, delta) => {
    if (group.current) {
      const factor = 1 - Math.exp(-delta * 4.6);
      group.current.scale.y = THREE.MathUtils.lerp(
        group.current.scale.y,
        targetScale,
        factor,
      );
    }
    if (material.current) {
      const target = highlighted ? 1.35 : executed ? 0.72 : active ? 0.32 : 0.05;
      material.current.emissiveIntensity = THREE.MathUtils.damp(
        material.current.emissiveIntensity,
        target,
        5,
        delta,
      );
      material.current.opacity = THREE.MathUtils.damp(
        material.current.opacity,
        truthMode ? 0.28 : active ? 0.94 : 0.48,
        5,
        delta,
      );
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
      <mesh position={[0, 0.16, 0]}>
        <cylinderGeometry args={[1.45, 1.65, 0.32, 8]} />
        <meshStandardMaterial color="#252b24" metalness={0.72} roughness={0.38} />
      </mesh>
      <group ref={group} scale={[1, targetScale, 1]}>
        <mesh position={[0, definition.height / 2 + 0.28, 0]}>
          <boxGeometry args={[2.25, definition.height, 2.05]} />
          <meshStandardMaterial
            ref={material}
            color={color}
            emissive={color}
            emissiveIntensity={0.1}
            metalness={0.56}
            roughness={0.33}
            transparent
            opacity={0.88}
            wireframe={truthMode}
          />
        </mesh>
        <mesh position={[0, definition.height + 0.48, 0]} rotation={[0, Math.PI / 4, 0]}>
          <cylinderGeometry args={[0.68, 1.08, 0.62, 4]} />
          <meshStandardMaterial color="#30372e" metalness={0.82} roughness={0.25} />
        </mesh>
        <mesh position={[-0.62, definition.height + 1.25, -0.38]}>
          <cylinderGeometry args={[0.13, 0.2, 1.55, 8]} />
          <meshStandardMaterial color="#555f50" metalness={0.9} roughness={0.3} />
        </mesh>
        <mesh position={[0.62, definition.height + 0.93, -0.35]}>
          <cylinderGeometry args={[0.11, 0.17, 0.9, 8]} />
          <meshStandardMaterial color="#4b5548" metalness={0.9} roughness={0.32} />
        </mesh>
      </group>
      {(selected || highlighted) && (
        <mesh position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.8, 2.02, 48]} />
          <meshBasicMaterial color={highlighted ? "#d9ff5b" : definition.color} transparent opacity={0.9} />
        </mesh>
      )}
      <LabelSprite
        label={definition.label}
        position={[0, definition.height + 2.15, 0]}
        active={active || highlighted}
      />
    </group>
  );
}

function Tube({
  points,
  color,
  radius = 0.035,
  opacity = 0.5,
}: {
  readonly points: readonly THREE.Vector3[];
  readonly color: string;
  readonly radius?: number;
  readonly opacity?: number;
}) {
  const geometry = useMemo(
    () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3([...points]), 24, radius, 7, false),
    [points, radius],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
    </mesh>
  );
}

function KernelConnections({ truthMode }: { readonly truthMode: boolean }) {
  const kernel = new THREE.Vector3(0.5, 1.5, -3.4);
  const connections = useMemo(
    () =>
      modules
        .filter((module) => module.id !== "kernel")
        .map((module) => [
          kernel,
          new THREE.Vector3(
            (kernel.x + module.position[0]) / 2,
            0.65,
            (kernel.z + module.position[2]) / 2,
          ),
          new THREE.Vector3(module.position[0], 0.65, module.position[2]),
        ]),
    [],
  );
  return (
    <group>
      {connections.map((points, index) => (
        <Tube
          key={modules[index]?.id}
          points={points}
          color={truthMode ? "#a879ce" : "#465041"}
          opacity={truthMode ? 0.72 : 0.28}
        />
      ))}
    </group>
  );
}

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
  const material = useRef<THREE.MeshStandardMaterial>(null);
  const geometry = useMemo(() => new THREE.TubeGeometry(pipeCurve, 64, 0.16, 10, false), []);
  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((state, delta) => {
    if (!material.current) return;
    const pulse = active ? 1.8 + Math.sin(state.clock.elapsedTime * 7) * 0.8 : created ? 0.55 : 0.08;
    material.current.emissiveIntensity = THREE.MathUtils.damp(
      material.current.emissiveIntensity,
      pulse,
      7,
      delta,
    );
    material.current.opacity = THREE.MathUtils.damp(
      material.current.opacity,
      active ? 0.52 : created ? 0.9 : 0.16,
      5,
      delta,
    );
  });

  return (
    <group
      visible={created}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
    >
      <mesh geometry={geometry}>
        <meshStandardMaterial
          ref={material}
          color="#63d9b1"
          emissive="#63ffd2"
          emissiveIntensity={0.1}
          metalness={0.72}
          roughness={0.22}
          transparent
          opacity={created ? 0.95 : 0.16}
        />
      </mesh>
      {[0.27, 0.55, 0.82].map((offset) => {
        const point = pipeCurve.getPoint(offset);
        const tangent = pipeCurve.getTangent(offset).normalize();
        const quaternion = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          tangent,
        );
        return (
          <mesh key={offset} position={point} quaternion={quaternion}>
            <coneGeometry args={[0.29, 0.65, 10]} />
            <meshStandardMaterial color="#bafc66" emissive="#8dff50" emissiveIntensity={active ? 2 : 0.35} />
          </mesh>
        );
      })}
      {selected && (
        <mesh position={pipeCurve.getPoint(0.5)}>
          <torusGeometry args={[0.7, 0.045, 8, 48]} />
          <meshBasicMaterial color="#e7ff8b" />
        </mesh>
      )}
      <LabelSprite label="ANONYMOUS PIPE" position={[0.75, 3.55, 2.15]} active={created || active} />
      {catStdoutBound && (
        <LabelSprite label="CAT STDOUT / FD 1" position={[-0.2, 0.85, 2.2]} active scale={[2, 0.38, 1]} alwaysOnTop />
      )}
      {grepStdinBound && (
        <LabelSprite label="GREP STDIN / FD 0" position={[1.7, 0.7, 2.2]} active scale={[2, 0.38, 1]} alwaysOnTop />
      )}
    </group>
  );
}

function DataFlow({ active }: { readonly active: boolean }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const count = 14;
  const matrix = useMemo(() => new THREE.Matrix4(), []);
  const position = useMemo(() => new THREE.Vector3(), []);
  const scale = useMemo(() => new THREE.Vector3(), []);

  useFrame((state) => {
    if (!mesh.current) return;
    for (let index = 0; index < count; index += 1) {
      const progress = (state.clock.elapsedTime * 0.48 + index / count) % 1;
      pipeCurve.getPoint(progress, position);
      const size = active ? 0.21 + (index % 3) * 0.035 : 0;
      scale.setScalar(size);
      matrix.compose(position, new THREE.Quaternion(), scale);
      mesh.current.setMatrixAt(index, matrix);
    }
    mesh.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]} frustumCulled={false}>
      <sphereGeometry args={[1, 8, 8]} />
      <meshBasicMaterial color="#eaff8c" toneMapped={false} />
    </instancedMesh>
  );
}

function PipelineComplete({ visible }: { readonly visible: boolean }) {
  const group = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (group.current && visible) group.current.rotation.y += delta * 0.42;
  });
  if (!visible) return null;
  return (
    <group ref={group} position={[0.5, 0.16, -3.4]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[2.5, 0.055, 10, 72]} />
        <meshBasicMaterial color="#dcff72" toneMapped={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, Math.PI / 4]}>
        <torusGeometry args={[3.05, 0.025, 8, 72]} />
        <meshBasicMaterial color="#62dfbc" transparent opacity={0.75} toneMapped={false} />
      </mesh>
      <LabelSprite label="PIPELINE COMPLETE" position={[0, 6.55, 0]} active />
      <pointLight position={[0, 3.2, 0]} intensity={24} distance={9} color="#c6ef5c" />
    </group>
  );
}

function TruthGraph({ visible }: { readonly visible: boolean }) {
  const nodePositions = useMemo(
    () =>
      modules.map((module) => ({
        id: module.id,
        position: new THREE.Vector3(module.position[0], module.height + 1.1, module.position[2]),
        color: module.color,
      })),
    [],
  );
  const kernel = nodePositions.find((node) => node.id === "kernel");
  if (!visible || !kernel) return null;

  return (
    <group>
      {nodePositions.map((node) => (
        <mesh key={node.id} position={node.position}>
          <icosahedronGeometry args={[0.35, 1]} />
          <meshBasicMaterial color={node.color} wireframe />
        </mesh>
      ))}
      {nodePositions
        .filter((node) => node.id !== "kernel")
        .map((node) => (
          <Tube
            key={node.id}
            points={[kernel.position, node.position]}
            color="#c5f36b"
            radius={0.026}
            opacity={0.72}
          />
        ))}
    </group>
  );
}

function CameraDirectorRig({ directive }: { readonly directive: CameraDirective }) {
  const { camera, gl } = useThree();
  const controls = useMemo(() => new OrbitControls(camera, gl.domElement), [camera, gl]);
  const fromPosition = useRef(camera.position.clone());
  const fromTarget = useRef(new THREE.Vector3());
  const path = useRef(
    new THREE.CatmullRomCurve3([
      camera.position.clone(),
      camera.position.clone(),
      camera.position.clone(),
    ]),
  );
  const progress = useRef(1);
  const previousSequence = useRef(-1);
  const goalTarget = useRef(new THREE.Vector3(...directive.target));

  useEffect(() => {
    controls.enableDamping = true;
    controls.dampingFactor = 0.075;
    controls.minDistance = 4;
    controls.maxDistance = 34;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.target.set(0, 1.2, -1);
    const stopFlight = () => {
      progress.current = 1;
    };
    controls.addEventListener("start", stopFlight);
    return () => {
      controls.removeEventListener("start", stopFlight);
      controls.dispose();
    };
  }, [controls]);

  useEffect(() => {
    if (directive.sequence === previousSequence.current) return;
    previousSequence.current = directive.sequence;
    fromPosition.current.copy(camera.position);
    fromTarget.current.copy(controls.target);
    goalTarget.current.set(...directive.target);
    const goal = new THREE.Vector3(...directive.position);
    const midpoint = camera.position
      .clone()
      .lerp(goal, 0.5)
      .add(new THREE.Vector3(0, 2.2, 0));
    path.current = new THREE.CatmullRomCurve3([
      camera.position.clone(),
      midpoint,
      goal,
    ]);
    progress.current = 0;
  }, [camera, controls, directive]);

  useFrame((_, delta) => {
    if (progress.current < 1) {
      progress.current = Math.min(1, progress.current + delta / 1.35);
      const t = progress.current;
      const smooth = t * t * (3 - 2 * t);
      path.current.getPoint(smooth, camera.position);
      controls.target.lerpVectors(fromTarget.current, goalTarget.current, smooth);
    }
    controls.update();
  });

  return null;
}

function TelemetryProbe({ onTelemetry }: { readonly onTelemetry: (value: SceneTelemetry) => void }) {
  const { gl, scene } = useThree();
  const elapsed = useRef(0);
  const frames = useRef(0);
  const previousDrawCalls = useRef(0);
  const previousTriangles = useRef(0);

  useFrame((_, delta) => {
    elapsed.current += delta;
    frames.current += 1;
    if (elapsed.current < 1) return;

    let visibleObjects = 0;
    scene.traverse((object) => {
      if (object.visible) visibleObjects += 1;
    });
    const rendererInfo = (gl as THREE.WebGLRenderer).info?.render;
    const rawDrawCalls = rendererInfo?.calls ?? 0;
    const rawTriangles = rendererInfo?.triangles ?? 0;
    const drawCalls = rawDrawCalls > 250
      ? Math.max(0, Math.round((rawDrawCalls - previousDrawCalls.current) / frames.current))
      : rawDrawCalls;
    const triangles = rawTriangles > 100_000
      ? Math.max(0, Math.round((rawTriangles - previousTriangles.current) / frames.current))
      : rawTriangles;
    onTelemetry({
      fps: frames.current / elapsed.current,
      frameTimeMs: (elapsed.current * 1000) / frames.current,
      drawCalls,
      triangles,
      visibleObjects,
    });
    previousDrawCalls.current = rawDrawCalls;
    previousTriangles.current = rawTriangles;
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
      ),
    [focusIds, frame?.sequence, frame?.stage],
  );
  const shellStarted = eventHasEntity(frameHistory, "shell_started", "process:shell");
  const catForked = eventHasEntity(frameHistory, "process_forked", "process:cat");
  const grepForked = eventHasEntity(frameHistory, "process_forked", "process:grep");
  const catExecuted = eventHasEntity(frameHistory, "process_executed", "process:cat");
  const grepExecuted = eventHasEntity(frameHistory, "process_executed", "process:grep");
  const fileOpened = eventHasEntity(frameHistory, "file_opened", "file:file.txt");
  const pipeCreated = frameHistory.some((event) => event.eventKind === "pipe_created");
  const catStdoutBound = eventHasEntity(frameHistory, "file_descriptor_duplicated", "process:cat");
  const grepStdinBound = eventHasEntity(frameHistory, "file_descriptor_duplicated", "process:grep");
  const pipeFlow = frame?.stage === "pipe_io" && ["bytes_read", "bytes_written"].includes(frame.eventKind);
  const pipelineComplete = frame?.sequence === 22 && frame.eventKind === "process_waited";
  const truthMode = viewMode === "truth";
  const highlightedEntity = directive.entityId;

  return (
    <>
      <color attach="background" args={["#080b09"]} />
      <fog attach="fog" args={["#080b09", 12, 38]} />
      <ambientLight intensity={0.42} color="#95a98d" />
      <hemisphereLight args={["#8ba18b", "#10150f", 1.1]} />
      <directionalLight position={[7, 13, 5]} intensity={1.35} color="#e8f4d5" />
      <pointLight position={[0.5, 5, -3.4]} intensity={18} distance={15} color="#b768dc" />
      <pointLight position={[0.8, 4, 2]} intensity={pipeFlow ? 28 : 9} distance={11} color="#56e3b5" />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.03, 0]}>
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial color="#111610" roughness={0.96} metalness={0.08} />
      </mesh>
      <gridHelper args={[70, 70, "#3b4935", "#1b231a"]} position={[0, 0.01, 0]} />
      <BackgroundCity visible={viewMode !== "truth"} />
      <KernelConnections truthMode={viewMode !== "city"} />

      {modules.map((definition) => {
        const active =
          definition.id === "kernel" ||
          (definition.id === "shell" && shellStarted) ||
          (definition.id === "cat" && catForked) ||
          (definition.id === "grep" && grepForked) ||
          (definition.id === "filesystem" && fileOpened);
        const executed =
          (definition.id === "cat" && catExecuted) ||
          (definition.id === "grep" && grepExecuted);
        return (
          <IndustrialModule
            key={definition.id}
            definition={definition}
            active={active}
            executed={executed}
            highlighted={highlightedEntity === definition.id}
            selected={selectedEntity === definition.id}
            truthMode={truthMode}
            onSelect={() => onSelectEntity(definition.id)}
          />
        );
      })}

      <PipeConduit
        created={pipeCreated}
        active={pipeFlow || (playing && highlightedEntity === "pipe")}
        selected={selectedEntity === "pipe"}
        catStdoutBound={catStdoutBound}
        grepStdinBound={grepStdinBound}
        onSelect={() => onSelectEntity("pipe")}
      />
      <DataFlow active={pipeFlow} />
      <PipelineComplete visible={pipelineComplete} />
      <TruthGraph visible={viewMode !== "city"} />
      <CameraDirectorRig directive={directive} />
      <TelemetryProbe onTelemetry={onTelemetry} />
    </>
  );
}

export function IndustrialMegacity(props: IndustrialMegacityProps) {
  return (
    <Canvas
      camera={{ position: [13, 11, 16], fov: 43, near: 0.1, far: 100 }}
      dpr={[1, 1.5]}
      fallback={<div className="renderer-fallback">GPU rendering is unavailable.</div>}
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
          renderer.toneMappingExposure = 1.05;
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
          fallback.toneMappingExposure = 1.05;
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
