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
  readonly cameraMode?: CameraFollowMode;
  readonly totalFrames?: number;
  readonly selectedEntity: VisualEntityId;
  readonly onSelectEntity: (entity: VisualEntityId) => void;
  readonly onBackendChange: (backend: RenderBackend) => void;
  readonly onTelemetry: (telemetry: SceneTelemetry) => void;
}

type ModuleEntityId = Exclude<VisualEntityId, "overview" | "pipe">;
type BodyType = "console" | "intake" | "filter" | "emitter" | "scanner" | "probe" | "vault" | "gateway" | "core";

interface ModuleDefinition {
  readonly id: ModuleEntityId;
  readonly label: string;
  readonly position: readonly [number, number, number];
  readonly color: string;
  readonly height: number;
  readonly body: BodyType;
}

const allModules: readonly ModuleDefinition[] = [
  { id: "shell", label: "SHELL [sh]", position: [-6.5, 0, -1], color: "#2563eb", height: 2.4, body: "console" },
  { id: "cat", label: "CAT [cat]", position: [-2.2, 0, 1.2], color: "#d97706", height: 3.2, body: "intake" },
  { id: "grep", label: "GREP [grep]", position: [3.2, 0, 1.2], color: "#059669", height: 3.3, body: "filter" },
  { id: "echo", label: "ECHO [echo]", position: [-2.2, 0, 1.2], color: "#db2777", height: 3.2, body: "emitter" },
  { id: "ls", label: "LS [ls]", position: [-2.2, 0, 1.2], color: "#7c3aed", height: 3.2, body: "scanner" },
  { id: "ps", label: "PS [ps]", position: [-2.2, 0, 1.2], color: "#0891b2", height: 3.2, body: "probe" },
  { id: "filesystem", label: "TẬP TIN [file]", position: [-3.6, 0, -5], color: "#4f46e5", height: 2.9, body: "vault" },
  { id: "terminal", label: "TERMINAL [tty]", position: [3.6, 0, -5], color: "#0d9488", height: 2.9, body: "gateway" },
  { id: "kernel", label: "KERNEL [nhân]", position: [0.5, 0, -3.4], color: "#6366f1", height: 4.2, body: "core" },
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
    (e) => e.eventKind === eventKind && e.focusNodeIds.includes(semanticId),
  );
}

// ─── Background ───────────────────────────────────────────────────
function BackgroundStructures({ visible }: { readonly visible: boolean }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const count = 72;

  const blocks = useMemo(() => {
    const items: Array<{ x: number; y: number; z: number; sx: number; sy: number; sz: number }> = [];
    for (let i = 0; i < count; i += 1) {
      const angle = i * 2.399963;
      const radius = 12 + (i % 9) * 0.8;
      items.push({
        x: Math.cos(angle) * radius,
        y: (0.6 + ((i * 13) % 23) / 9) / 2,
        z: Math.sin(angle) * radius - 1.5,
        sx: 0.55 + (i % 4) * 0.12,
        sy: 0.6 + ((i * 13) % 23) / 9,
        sz: 0.55 + ((i * 3) % 4) * 0.12,
      });
    }
    return items;
  }, []);

  useLayoutEffect(() => {
    if (!mesh.current) return;
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const c = new THREE.Color();
    blocks.forEach((b, i) => {
      p.set(b.x, b.y, b.z);
      s.set(b.sx, b.sy, b.sz);
      m.compose(p, new THREE.Quaternion(), s);
      mesh.current?.setMatrixAt(i, m);
      const tone = 0.82 + (i % 5) * 0.03;
      c.setRGB(tone, tone * 1.02, tone * 1.05);
      mesh.current?.setColorAt(i, c);
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

// ─── Label ────────────────────────────────────────────────────────
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
    const ctx = canvas.getContext("2d");
    if (!ctx) return new THREE.CanvasTexture(canvas);
    ctx.fillStyle = active ? "rgba(255,255,255,0.96)" : "rgba(241,245,249,0.88)";
    ctx.roundRect ? ctx.roundRect(4, 4, 504, 92, 12) : ctx.rect(4, 4, 504, 92);
    ctx.fill();
    ctx.strokeStyle = active ? "#2563eb" : "#94a3b8";
    ctx.lineWidth = active ? 5 : 2;
    ctx.stroke();
    ctx.fillStyle = active ? "#0f172a" : "#475569";
    ctx.font = "bold 32px 'Segoe UI', Consolas, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, 256, 50);
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [active, label]);

  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <sprite position={position} scale={scale} renderOrder={alwaysOnTop ? 20 : 0}>
      <spriteMaterial map={texture} transparent depthWrite={false} depthTest={!alwaysOnTop} />
    </sprite>
  );
}

// ─── Entity Module (distinct silhouettes per Linux role) ──────────
function EntityModule({
  definition: d,
  active,
  executed,
  exited,
  highlighted,
  selected,
  onSelect,
}: {
  readonly definition: ModuleDefinition;
  readonly active: boolean;
  readonly executed: boolean;
  readonly exited: boolean;
  readonly highlighted: boolean;
  readonly selected: boolean;
  readonly onSelect: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const spindle = useRef<THREE.Mesh>(null);
  const moving = useRef<THREE.Mesh>(null);
  const themeColor = useMemo(() => new THREE.Color(d.color), [d.color]);
  const h = d.height;
  const isStatic = d.body === "vault";

  useFrame((state, delta) => {
    if (spindle.current && !isStatic && !exited) {
      spindle.current.rotation.y += delta * (active ? 2.8 : 0.4);
    }
    if (moving.current && active && !exited) {
      moving.current.position.y = h / 2 + 0.3 + Math.sin(state.clock.elapsedTime * 4.5) * 0.25;
    }
  });

  const emissiveI = exited ? 0.02 : highlighted ? 0.9 : active ? 0.45 : 0.05;

  // Body geometry varies by entity type
  function body() {
    switch (d.body) {
      // SHELL — wide command console with routing rails
      case "console":
        return (
          <>
            <mesh position={[0, h * 0.3 + 0.34, 0]}>
              <boxGeometry args={[2.8, h * 0.5, 2.2]} />
              <meshStandardMaterial color="#e2e8f0" metalness={0.45} roughness={0.3} />
            </mesh>
            {[-1.1, 1.1].map((x, i) => (
              <mesh key={i} position={[x, h * 0.35 + 0.34, 0]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.04, 0.04, 2.0, 8]} />
                <meshStandardMaterial color="#94a3b8" metalness={0.8} roughness={0.2} />
              </mesh>
            ))}
            <mesh position={[0, h * 0.6 + 0.34, 0]}>
              <cylinderGeometry args={[0.06, 0.06, h * 0.35, 8]} />
              <meshStandardMaterial color="#475569" metalness={0.85} roughness={0.2} />
            </mesh>
            <mesh ref={spindle} position={[0, h * 0.42 + 0.34, 0]}>
              <torusGeometry args={[0.55, 0.04, 8, 24]} />
              <meshStandardMaterial color={d.color} emissive={themeColor} emissiveIntensity={emissiveI} metalness={0.7} roughness={0.2} />
            </mesh>
          </>
        );

      // CAT — tapered intake with rotating drum
      case "intake":
        return (
          <>
            <mesh position={[0, h / 2 + 0.34, 0]}>
              <cylinderGeometry args={[1.2, 0.75, h, 12]} />
              <meshStandardMaterial color="#fffbeb" transparent opacity={0.55} metalness={0.25} roughness={0.12} />
            </mesh>
            <mesh ref={spindle} position={[0, h / 2 + 0.34, 0]}>
              <cylinderGeometry args={[0.45, 0.45, h * 0.65, 12]} />
              <meshStandardMaterial color={d.color} emissive={themeColor} emissiveIntensity={emissiveI} metalness={0.7} roughness={0.25} />
            </mesh>
            <mesh ref={moving} position={[0, h / 2 + 0.3, 0]}>
              <cylinderGeometry args={[0.35, 0.35, 0.5, 16]} />
              <meshStandardMaterial color="#92400e" metalness={0.6} roughness={0.25} />
            </mesh>
          </>
        );

      // GREP — rectangular filter with vertical bars
      case "filter":
        return (
          <>
            <mesh position={[0, h / 2 + 0.34, 0]}>
              <boxGeometry args={[1.8, h, 1.6]} />
              <meshStandardMaterial color="#ecfdf5" transparent opacity={0.3} metalness={0.2} roughness={0.08} depthWrite={false} />
            </mesh>
            {[-0.5, 0, 0.5].map((x, i) => (
              <mesh key={i} position={[x, h / 2 + 0.34, 0]}>
                <boxGeometry args={[0.06, h * 0.75, 1.35]} />
                <meshStandardMaterial color={d.color} emissive={themeColor} emissiveIntensity={emissiveI} metalness={0.6} roughness={0.3} />
              </mesh>
            ))}
            <mesh ref={moving} position={[0, h / 2 + 0.3, 0]}>
              <boxGeometry args={[1.6, 0.12, 1.35]} />
              <meshStandardMaterial color="#064e3b" metalness={0.7} roughness={0.2} />
            </mesh>
          </>
        );

      // ECHO — horn/bell emitter
      case "emitter":
        return (
          <>
            <mesh position={[0, h / 2 + 0.34, 0]}>
              <cylinderGeometry args={[0.35, 1.2, h, 12]} />
              <meshStandardMaterial color="#fdf2f8" transparent opacity={0.45} metalness={0.3} roughness={0.1} depthWrite={false} />
            </mesh>
            <mesh ref={spindle} position={[0, h * 0.3 + 0.34, 0]}>
              <coneGeometry args={[0.55, h * 0.5, 12]} />
              <meshStandardMaterial color={d.color} emissive={themeColor} emissiveIntensity={emissiveI} metalness={0.6} roughness={0.25} />
            </mesh>
          </>
        );

      // LS — scanner turret with rotating dish
      case "scanner":
        return (
          <>
            <mesh position={[0, h * 0.35 + 0.34, 0]}>
              <cylinderGeometry args={[0.28, 0.28, h * 0.65, 8]} />
              <meshStandardMaterial color="#475569" metalness={0.75} roughness={0.25} />
            </mesh>
            <mesh ref={spindle} position={[0, h * 0.75 + 0.34, 0]}>
              <cylinderGeometry args={[1.15, 0.95, 0.15, 16]} />
              <meshStandardMaterial color={d.color} emissive={themeColor} emissiveIntensity={emissiveI} metalness={0.55} roughness={0.2} />
            </mesh>
            <mesh position={[0, h * 0.82 + 0.34, 0]}>
              <sphereGeometry args={[0.2, 12, 12]} />
              <meshStandardMaterial color="#c4b5fd" metalness={0.5} roughness={0.2} />
            </mesh>
          </>
        );

      // PS — diagnostic probe with sensor rings
      case "probe":
        return (
          <>
            <mesh position={[0, h / 2 + 0.34, 0]}>
              <cylinderGeometry args={[0.12, 0.12, h, 8]} />
              <meshStandardMaterial color="#475569" metalness={0.85} roughness={0.2} />
            </mesh>
            {[0.3, 0.5, 0.7].map((t, i) => (
              <mesh key={i} position={[0, h * t + 0.34, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.45 + i * 0.15, 0.04, 8, 24]} />
                <meshStandardMaterial color={d.color} emissive={themeColor} emissiveIntensity={emissiveI} metalness={0.7} roughness={0.2} />
              </mesh>
            ))}
          </>
        );

      // FILE — static hexagonal archive vault
      case "vault":
        return (
          <>
            <mesh position={[0, h / 2 + 0.34, 0]}>
              <cylinderGeometry args={[1.05, 1.05, h, 6]} />
              <meshStandardMaterial color="#e0e7ff" metalness={0.3} roughness={0.4} />
            </mesh>
            <mesh position={[0, h + 0.38, 0]}>
              <cylinderGeometry args={[1.1, 1.1, 0.1, 6]} />
              <meshStandardMaterial color="#94a3b8" metalness={0.5} roughness={0.3} />
            </mesh>
            <mesh position={[0, h * 0.45 + 0.34, 0]}>
              <cylinderGeometry args={[0.4, 0.4, h * 0.35, 6]} />
              <meshStandardMaterial color={d.color} emissive={themeColor} emissiveIntensity={0.15} metalness={0.5} roughness={0.3} />
            </mesh>
          </>
        );

      // TERMINAL — screen + keyboard gateway
      case "gateway":
        return (
          <>
            <mesh position={[0, h * 0.55 + 0.34, -0.2]} rotation={[-0.3, 0, 0]}>
              <boxGeometry args={[1.8, h * 0.45, 0.12]} />
              <meshStandardMaterial color="#1e293b" metalness={0.3} roughness={0.2} />
            </mesh>
            <mesh position={[0, h * 0.55 + 0.34, -0.12]} rotation={[-0.3, 0, 0]}>
              <planeGeometry args={[1.5, h * 0.35]} />
              <meshBasicMaterial color={d.color} transparent opacity={active ? 0.55 : 0.15} />
            </mesh>
            <mesh position={[0, 0.5, 0.3]}>
              <boxGeometry args={[1.8, 0.2, 1.2]} />
              <meshStandardMaterial color="#cbd5e1" metalness={0.4} roughness={0.3} />
            </mesh>
            <mesh position={[0, h * 0.3 + 0.34, 0.55]}>
              <boxGeometry args={[1.6, 0.08, 0.7]} />
              <meshStandardMaterial color="#94a3b8" metalness={0.5} roughness={0.3} />
            </mesh>
          </>
        );

      // KERNEL — large octagonal backbone with rings
      case "core":
        return (
          <>
            <mesh position={[0, h / 2 + 0.34, 0]}>
              <cylinderGeometry args={[1.6, 1.6, h, 8]} />
              <meshStandardMaterial color="#eef2ff" transparent opacity={0.35} metalness={0.25} roughness={0.08} depthWrite={false} />
            </mesh>
            <mesh ref={spindle} position={[0, h / 2 + 0.34, 0]}>
              <cylinderGeometry args={[0.55, 0.55, h * 0.75, 8]} />
              <meshStandardMaterial color={d.color} emissive={themeColor} emissiveIntensity={0.3} metalness={0.7} roughness={0.2} />
            </mesh>
            {[0.25, 0.45, 0.65, 0.85].map((t, i) => (
              <mesh key={i} position={[0, h * t + 0.34, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[1.05, 0.04, 8, 32]} />
                <meshStandardMaterial color="#64748b" metalness={0.8} roughness={0.2} />
              </mesh>
            ))}
          </>
        );
    }
  }

  return (
    <group
      position={d.position}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        setHovered(false);
        document.body.style.cursor = "auto";
      }}
    >
      {/* Shared pedestal */}
      <mesh position={[0, 0.16, 0]}>
        <cylinderGeometry args={[1.5, 1.7, 0.32, 16]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.65} roughness={0.25} />
      </mesh>
      <mesh position={[0, 0.34, 0]}>
        <cylinderGeometry args={[1.35, 1.48, 0.08, 16]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.7} roughness={0.2} />
      </mesh>

      {/* Entity-specific body */}
      {body()}

      {/* FD Sockets (Process local file descriptors: FD 0, FD 1, FD 2) */}
      {["console", "intake", "filter", "emitter", "scanner", "probe"].includes(d.body) && (
        <group>
          {/* FD 0 (stdin) */}
          <group position={[-0.85, 0.48, 0.7]}>
            <mesh rotation={[Math.PI / 4, 0, 0]}>
              <cylinderGeometry args={[0.14, 0.16, 0.16, 12]} />
              <meshStandardMaterial color="#334155" metalness={0.8} roughness={0.2} />
            </mesh>
            <mesh position={[0, 0.08, 0.05]}>
              <sphereGeometry args={[0.06, 8, 8]} />
              <meshBasicMaterial color="#0284c7" />
            </mesh>
            {(selected || hovered) && (
              <LabelSprite label="FD 0 [stdin]" position={[0, 0.42, 0]} scale={[1.4, 0.32, 1]} active alwaysOnTop />
            )}
          </group>

          {/* FD 1 (stdout) */}
          <group position={[0.85, 0.48, 0.7]}>
            <mesh rotation={[Math.PI / 4, 0, 0]}>
              <cylinderGeometry args={[0.14, 0.16, 0.16, 12]} />
              <meshStandardMaterial color="#334155" metalness={0.8} roughness={0.2} />
            </mesh>
            <mesh position={[0, 0.08, 0.05]}>
              <sphereGeometry args={[0.06, 8, 8]} />
              <meshBasicMaterial color="#d97706" />
            </mesh>
            {(selected || hovered) && (
              <LabelSprite label="FD 1 [stdout]" position={[0, 0.42, 0]} scale={[1.4, 0.32, 1]} active alwaysOnTop />
            )}
          </group>

          {/* FD 2 (stderr) */}
          <group position={[0, 0.48, -0.85]}>
            <mesh rotation={[-Math.PI / 4, 0, 0]}>
              <cylinderGeometry args={[0.14, 0.16, 0.16, 12]} />
              <meshStandardMaterial color="#334155" metalness={0.8} roughness={0.2} />
            </mesh>
            <mesh position={[0, 0.08, -0.05]}>
              <sphereGeometry args={[0.06, 8, 8]} />
              <meshBasicMaterial color="#dc2626" />
            </mesh>
            {(selected || hovered) && (
              <LabelSprite label="FD 2 [stderr]" position={[0, 0.42, 0]} scale={[1.4, 0.32, 1]} active alwaysOnTop />
            )}
          </group>
        </group>
      )}

      {/* Status dome */}
      <mesh position={[0, h + 0.68, 0]}>
        <sphereGeometry args={[0.28, 16, 16]} />
        <meshStandardMaterial
          color={exited ? "#64748b" : themeColor}
          emissive={exited ? "#475569" : themeColor}
          emissiveIntensity={exited ? 0.05 : highlighted ? 1.4 : executed ? 0.7 : active ? 0.4 : 0.1}
          metalness={0.4}
          roughness={0.2}
        />
      </mesh>

      {/* Selection / hover / highlight ring */}
      {(selected || hovered || highlighted) && (
        <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.75, 1.95, 48]} />
          <meshBasicMaterial color={highlighted ? "#2563eb" : hovered ? "#0284c7" : themeColor} transparent opacity={0.95} />
        </mesh>
      )}

      {/* Label */}
      <LabelSprite
        label={exited ? `${d.label} [ĐÃ DỪNG]` : d.label}
        position={[0, h + 1.8, 0]}
        active={active || highlighted || hovered}
      />
    </group>
  );
}

// ─── Pipe Conduit ─────────────────────────────────────────────────
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
    <group visible={created} onClick={(e) => { e.stopPropagation(); onSelect(); }}>
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
      {[0.28, 0.52, 0.78].map((offset) => {
        const point = pipeCurve.getPoint(offset);
        const tangent = pipeCurve.getTangent(offset).normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
        return (
          <mesh key={offset} position={point} quaternion={q}>
            <coneGeometry args={[0.26, 0.55, 10]} />
            <meshStandardMaterial color="#0d9488" emissive="#14b8a6" emissiveIntensity={active ? 1.6 : 0.3} metalness={0.6} roughness={0.2} />
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
        <LabelSprite label="CAT STDOUT / FD 1" position={[-0.2, 0.85, 2.2]} active scale={[2.2, 0.42, 1]} alwaysOnTop />
      )}
      {grepStdinBound && (
        <LabelSprite label="GREP STDIN / FD 0" position={[1.7, 0.7, 2.2]} active scale={[2.2, 0.42, 1]} alwaysOnTop />
      )}
    </group>
  );
}

// ─── Data Flow ────────────────────────────────────────────────────
function DataFlow({ active }: { readonly active: boolean }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const count = 12;
  const m = useMemo(() => new THREE.Matrix4(), []);
  const p = useMemo(() => new THREE.Vector3(), []);
  const s = useMemo(() => new THREE.Vector3(), []);

  useFrame((state) => {
    if (!mesh.current) return;
    for (let i = 0; i < count; i += 1) {
      const progress = (state.clock.elapsedTime * 0.55 + i / count) % 1;
      pipeCurve.getPoint(progress, p);
      s.setScalar(active ? 0.18 + (i % 3) * 0.03 : 0);
      m.compose(p, new THREE.Quaternion(), s);
      mesh.current.setMatrixAt(i, m);
    }
    mesh.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]} frustumCulled={false}>
      <sphereGeometry args={[1, 10, 10]} />
      <meshStandardMaterial color="#0d9488" emissive="#2dd4bf" emissiveIntensity={2.5} roughness={0.1} />
    </instancedMesh>
  );
}

// ─── Completion Indicator ─────────────────────────────────────────
function PipelineComplete({ visible }: { readonly visible: boolean }) {
  const group = useRef<THREE.Group>(null);
  useFrame((_, delta) => { if (group.current && visible) group.current.rotation.y += delta * 0.35; });
  if (!visible) return null;
  return (
    <group ref={group} position={[0.5, 0.16, -3.4]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[2.8, 0.05, 10, 72]} />
        <meshBasicMaterial color="#2563eb" toneMapped={false} />
      </mesh>
      <LabelSprite label="KỊCH BẢN HOÀN THÀNH" position={[0, 6.6, 0]} active />
      <pointLight position={[0, 3.2, 0]} intensity={18} distance={10} color="#3b82f6" />
    </group>
  );
}

// ─── Camera Rig ───────────────────────────────────────────────────
function CameraDirectorRig({
  directive,
  cameraMode,
}: {
  readonly directive: CameraDirective;
  readonly cameraMode: CameraFollowMode;
}) {
  const { camera, gl } = useThree();
  const controls = useMemo(() => new OrbitControls(camera, gl.domElement), [camera, gl]);
  const fromPos = useRef(camera.position.clone());
  const fromTgt = useRef(new THREE.Vector3());
  const goalPos = useRef(new THREE.Vector3(...directive.position));
  const goalTgt = useRef(new THREE.Vector3(...directive.target));
  const progress = useRef(1);
  const prevKey = useRef("");
  const userOrbiting = useRef(false);

  useEffect(() => {
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 4;
    controls.maxDistance = 42;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.target.set(0, 1.2, -1);
    const onStart = () => { userOrbiting.current = true; progress.current = 1; };
    const onEnd = () => { userOrbiting.current = false; };
    controls.addEventListener("start", onStart);
    controls.addEventListener("end", onEnd);
    return () => { controls.removeEventListener("start", onStart); controls.removeEventListener("end", onEnd); controls.dispose(); };
  }, [controls]);

  useEffect(() => {
    if (cameraMode === "free") return;
    const key = cameraMode === "gentle"
      ? `${directive.beat}-${directive.entityId}`
      : `${directive.sequence}-${directive.entityId}`;
    if (key === prevKey.current) return;
    prevKey.current = key;
    fromPos.current.copy(camera.position);
    fromTgt.current.copy(controls.target);
    goalPos.current.set(...directive.position);
    goalTgt.current.set(...directive.target);
    progress.current = 0;
  }, [camera, cameraMode, controls, directive]);

  useFrame((_, delta) => {
    if (cameraMode !== "free" && !userOrbiting.current && progress.current < 1) {
      progress.current = Math.min(1, progress.current + delta / 2.4);
      const t = progress.current;
      const smooth = t * t * (3 - 2 * t);
      camera.position.lerpVectors(fromPos.current, goalPos.current, smooth);
      controls.target.lerpVectors(fromTgt.current, goalTgt.current, smooth);
    }
    controls.update();
  });

  return null;
}

// ─── Telemetry ────────────────────────────────────────────────────
function TelemetryProbe({ onTelemetry }: { readonly onTelemetry: (v: SceneTelemetry) => void }) {
  const { gl, scene } = useThree();
  const elapsed = useRef(0);
  const frames = useRef(0);

  useFrame((_, delta) => {
    elapsed.current += delta;
    frames.current += 1;
    if (elapsed.current < 1) return;
    let vis = 0;
    scene.traverse((o) => { if (o.visible) vis += 1; });
    const info = (gl as THREE.WebGLRenderer).info?.render;
    onTelemetry({
      fps: frames.current / elapsed.current,
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

// ─── Scene (single unified mode) ─────────────────────────────────
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
  const focusIds = frame?.focusNodeIds ?? [];
  const directive = useMemo(
    () => resolveCameraDirective(focusIds, frame?.stage ?? "overview", frame?.sequence ?? 0, totalFrames, cameraMode),
    [focusIds, frame?.sequence, frame?.stage, totalFrames, cameraMode],
  );

  const hasShell = frameHistory.some((e) => e.focusNodeIds.some((id) => id.includes("shell")));
  const hasCat = frameHistory.some((e) => e.focusNodeIds.some((id) => id.includes("cat")));
  const hasGrep = frameHistory.some((e) => e.focusNodeIds.some((id) => id.includes("grep")));
  const hasEcho = frameHistory.some((e) => e.focusNodeIds.some((id) => id.includes("echo")));
  const hasLs = frameHistory.some((e) => e.focusNodeIds.some((id) => id.includes("ls")));
  const hasPs = frameHistory.some((e) => e.focusNodeIds.some((id) => id.includes("ps")));
  const hasFs = frameHistory.some((e) => e.focusNodeIds.some((id) => id.startsWith("file:") || id.includes("dir") || id.includes("proc")));
  const hasTerm = frameHistory.some((e) => e.focusNodeIds.some((id) => id.includes("tty") || id.includes("terminal")));
  const pipeCreated = frameHistory.some((e) => e.eventKind === "pipe_created");
  const catStdoutBound = eventHasEntity(frameHistory, "file_descriptor_duplicated", "process:cat");
  const grepStdinBound = eventHasEntity(frameHistory, "file_descriptor_duplicated", "process:grep");
  const pipeFlow = frame?.stage === "pipe_io" && ["bytes_read", "bytes_written"].includes(frame?.eventKind ?? "");
  const pipelineComplete = totalFrames > 0 && (frame?.sequence ?? 0) >= totalFrames && ["process_waited", "exit", "wait"].includes(frame?.eventKind ?? "");

  const activeModules = useMemo(() => {
    return allModules.filter((m) => {
      if (m.id === "kernel" || m.id === "shell") return true;
      if (m.id === "cat") return hasCat;
      if (m.id === "grep") return hasGrep;
      if (m.id === "echo") return hasEcho;
      if (m.id === "ls") return hasLs;
      if (m.id === "ps") return hasPs;
      if (m.id === "filesystem") return hasFs;
      if (m.id === "terminal") return hasTerm;
      return false;
    });
  }, [hasCat, hasEcho, hasFs, hasGrep, hasLs, hasPs, hasTerm]);

  const highlightedEntity = directive.entityId;

  return (
    <>
      <color attach="background" args={["#eef2f6"]} />
      <fog attach="fog" args={["#eef2f6", 20, 52]} />

      <ambientLight intensity={0.75} color="#ffffff" />
      <hemisphereLight args={["#ffffff", "#e2e8f0", 0.9]} />
      <directionalLight position={[10, 16, 8]} intensity={1.25} color="#ffffff" />
      <pointLight position={[0.5, 5, -3.4]} intensity={14} distance={14} color="#6366f1" />
      <pointLight position={[0.8, 4, 2]} intensity={pipeFlow ? 22 : 8} distance={10} color="#0d9488" />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.03, 0]}>
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.9} metalness={0.05} />
      </mesh>
      <gridHelper args={[70, 70, "#cbd5e1", "#e2e8f0"]} position={[0, 0.01, 0]} />

      <BackgroundStructures visible />

      {activeModules.map((def) => {
        const isProcess = ["cat", "grep", "echo", "ls", "ps"].includes(def.id);
        const isActive = def.id === "kernel" || (def.id === "shell" && hasShell) ||
          (isProcess && frameHistory.some((e) => e.focusNodeIds.includes(`process:${def.id}`))) ||
          (def.id === "filesystem" && hasFs) || (def.id === "terminal" && hasTerm);
        const isExecuted = isProcess && eventHasEntity(frameHistory, "process_executed", `process:${def.id}`);
        const isExited = isProcess && eventHasEntity(frameHistory, "process_exited", `process:${def.id}`);
        return (
          <EntityModule
            key={def.id}
            definition={def}
            active={isActive}
            executed={isExecuted}
            exited={isExited}
            highlighted={highlightedEntity === def.id}
            selected={selectedEntity === def.id}
            onSelect={() => onSelectEntity(def.id)}
          />
        );
      })}

      {/* ParentOf Orchestration Conduits: Shell -> Child Processes */}
      {hasShell && activeModules.filter((m) => ["cat", "grep", "echo", "ls", "ps"].includes(m.id)).map((child) => {
        const points = [
          new THREE.Vector3(-6.5, 0.34, -1),
          new THREE.Vector3((-6.5 + child.position[0]) / 2, 0.16, (-1 + child.position[2]) / 2),
          new THREE.Vector3(child.position[0], 0.34, child.position[2]),
        ];
        const geom = new THREE.BufferGeometry().setFromPoints(points);
        return (
          <primitive
            object={new THREE.Line(geom, new THREE.LineBasicMaterial({ color: "#94a3b8", transparent: true, opacity: 0.45 }))}
            key={`parentof-${child.id}`}
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

      <CameraDirectorRig directive={directive} cameraMode={cameraMode} />
      <TelemetryProbe onTelemetry={onTelemetry} />
    </>
  );
}

export function IndustrialMegacity(props: IndustrialMegacityProps) {
  return (
    <Canvas
      camera={{ position: [14, 11, 16], fov: 42, near: 0.1, far: 100 }}
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
