import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { WebGPURenderer } from 'three/webgpu';

import {
  resolveCameraDirective,
  CameraDirective,
  CameraFollowMode,
  VisualEntityId
} from '@linux-observatory/camera-director';

// --- INTERFACES ---
export type RenderBackend = 'initializing' | 'webgpu' | 'webgl2';

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

interface ChoreographyState {
  phase: 'idle' | 'anticipation' | 'actuation' | 'transfer' | 'reaction' | 'settle';
  phaseProgress: number;
  totalProgress: number;
  sourceModule: string | null;
  targetModule: string | null;
  flowActive: boolean;
  flowProgress: number;
  activeEventKind: string | null;
}

// --- CONSTANTS & PRECOMPUTED RESOURCES ---
const PLANT_COLORS = {
  spine: 0x2c3e50,
  spineRings: 0x34495e,
  foundation: 0x1a252f,
  rails: 0x7f8c8d,
  shellBase: 0x34495e,
  processBase: 0x4aa3df,
  pipeChamber: 0xa9cce3,
  storage: 0x27ae60,
  console: 0x2c3e50,
  screen: 0x050505,
  glowGreen: 0x2ecc71,
  glowAmber: 0xf39c12,
  glowGrey: 0x7f8c8d,
  flowHead: 0x3498db,
  flowTail: 0x2980b9
};

const plantMaterials = {
  spine: new THREE.MeshStandardMaterial({ color: PLANT_COLORS.spine, metalness: 0.8, roughness: 0.2 }),
  spineRings: new THREE.MeshStandardMaterial({ color: PLANT_COLORS.spineRings, metalness: 0.9, roughness: 0.1 }),
  foundation: new THREE.MeshStandardMaterial({ color: PLANT_COLORS.foundation, metalness: 0.7, roughness: 0.4 }),
  rails: new THREE.MeshStandardMaterial({ color: PLANT_COLORS.rails, metalness: 0.9, roughness: 0.15 }),
  shellBase: new THREE.MeshStandardMaterial({ color: PLANT_COLORS.shellBase, metalness: 0.7, roughness: 0.3 }),
  processBase: new THREE.MeshStandardMaterial({ color: PLANT_COLORS.processBase, metalness: 0.6, roughness: 0.2 }),
  pipeChamber: new THREE.MeshPhysicalMaterial({ color: PLANT_COLORS.pipeChamber, metalness: 0.1, roughness: 0.05, transmission: 0.9, transparent: true }),
  storage: new THREE.MeshStandardMaterial({ color: PLANT_COLORS.storage, metalness: 0.7, roughness: 0.3 }),
  console: new THREE.MeshStandardMaterial({ color: PLANT_COLORS.console, metalness: 0.8, roughness: 0.2 }),
  screen: new THREE.MeshBasicMaterial({ color: PLANT_COLORS.screen }),
  glowGreen: new THREE.MeshBasicMaterial({ color: PLANT_COLORS.glowGreen }),
  glowAmber: new THREE.MeshBasicMaterial({ color: PLANT_COLORS.glowAmber }),
  glowGrey: new THREE.MeshBasicMaterial({ color: PLANT_COLORS.glowGrey }),
  flowHead: new THREE.MeshBasicMaterial({ color: PLANT_COLORS.flowHead }),
  flowTail: new THREE.MeshBasicMaterial({ color: PLANT_COLORS.flowTail, transparent: true, opacity: 0.5 }),
};

const plantGeometries = {
  octagonalColumn: new THREE.CylinderGeometry(1, 1, 12, 8),
  ring: new THREE.TorusGeometry(1.5, 0.15, 8, 24),
  foundationBox: new THREE.BoxGeometry(24, 0.5, 24),
  railBox: new THREE.BoxGeometry(0.2, 0.2, 5),
  moduleBox: new THREE.BoxGeometry(2, 2, 2),
  pipe: new THREE.CylinderGeometry(0.4, 0.4, 4, 16),
  hatch: new THREE.BoxGeometry(1.8, 1.8, 0.2),
  screen: new THREE.PlaneGeometry(2, 1.5),
  particle: new THREE.SphereGeometry(0.15, 8, 8),
  led: new THREE.SphereGeometry(0.1, 8, 8),
};

const flowPaths = {
  'storage-process': new THREE.CatmullRomCurve3([
    new THREE.Vector3(-2, 0.5, -3),
    new THREE.Vector3(-1.8, 1.5, -1),
    new THREE.Vector3(-1.5, 0.5, 2.5)
  ]),
  'process-pipe': new THREE.CatmullRomCurve3([
    new THREE.Vector3(-1.5, 0.5, 2.5),
    new THREE.Vector3(-0.5, 0.5, 2.5),
    new THREE.Vector3(0.5, 0.5, 2.5)
  ]),
  'pipe-grep': new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.5, 0.5, 2.5),
    new THREE.Vector3(1.5, 0.5, 2.5),
    new THREE.Vector3(2.5, 0.5, 2.5)
  ]),
  'grep-console': new THREE.CatmullRomCurve3([
    new THREE.Vector3(2.5, 0.5, 2.5),
    new THREE.Vector3(2.8, 1.5, 0),
    new THREE.Vector3(3, 0.5, -3)
  ]),
  'shell-process': new THREE.CatmullRomCurve3([
    new THREE.Vector3(-4, 0.5, 0),
    new THREE.Vector3(-3, 1.5, 1),
    new THREE.Vector3(-1.5, 0.5, 2.5)
  ]),
  'process-console': new THREE.CatmullRomCurve3([
    new THREE.Vector3(-1.5, 0.5, 2.5),
    new THREE.Vector3(1, 1.5, -0.5),
    new THREE.Vector3(3, 0.5, -3)
  ]),
  'process-storage': new THREE.CatmullRomCurve3([
    new THREE.Vector3(-1.5, 0.5, 2.5),
    new THREE.Vector3(-1.8, 1.5, -1),
    new THREE.Vector3(-2, 0.5, -3)
  ])
};

// --- CHOREOGRAPHY SYSTEM ---
const PHASE_DURATIONS = {
  anticipation: 0.3,
  actuation: 0.4,
  transfer: 0.6,
  reaction: 0.3,
  settle: 0.2
};
const TOTAL_DURATION = 1.8;

function useChoreography(frame: VisualReplayFrame | undefined, playing: boolean) {
  const stateRef = useRef<ChoreographyState>({
    phase: 'idle',
    phaseProgress: 0,
    totalProgress: 0,
    sourceModule: null,
    targetModule: null,
    flowActive: false,
    flowProgress: 0,
    activeEventKind: null
  });

  const lastSeq = useRef<number>(-1);
  const timeInEvent = useRef<number>(0);

  const getFlowMapping = (eventKind: string) => {
    switch (eventKind) {
      case 'exec': return { source: 'shell', target: 'process' };
      case 'read': return { source: 'storage', target: 'process' };
      case 'write': return { source: 'process', target: 'storage' };
      case 'pipe': return { source: 'process', target: 'pipe' };
      case 'grep': return { source: 'pipe', target: 'grep' };
      case 'stdout': return { source: 'process', target: 'console' };
      default: return { source: null, target: null };
    }
  };

  const update = useCallback((delta: number): ChoreographyState => {
    if (!frame) {
      stateRef.current.phase = 'idle';
      return stateRef.current;
    }

    if (frame.sequence !== lastSeq.current) {
      lastSeq.current = frame.sequence;
      timeInEvent.current = 0;
      const { source, target } = getFlowMapping(frame.eventKind);
      stateRef.current.sourceModule = source;
      stateRef.current.targetModule = target;
      stateRef.current.activeEventKind = frame.eventKind;
    }

    if (playing) {
      timeInEvent.current += delta;
    } else {
      timeInEvent.current = 0; // If not playing, hold at start
    }

    const t = timeInEvent.current;
    if (t >= TOTAL_DURATION) {
      stateRef.current.phase = 'idle';
      stateRef.current.phaseProgress = 0;
      stateRef.current.totalProgress = 1;
      stateRef.current.flowActive = false;
    } else {
      let accum = 0;
      stateRef.current.totalProgress = t / TOTAL_DURATION;

      if (t < (accum += PHASE_DURATIONS.anticipation)) {
        stateRef.current.phase = 'anticipation';
        stateRef.current.phaseProgress = (t) / PHASE_DURATIONS.anticipation;
        stateRef.current.flowActive = false;
      } else if (t < (accum += PHASE_DURATIONS.actuation)) {
        stateRef.current.phase = 'actuation';
        stateRef.current.phaseProgress = (t - (accum - PHASE_DURATIONS.actuation)) / PHASE_DURATIONS.actuation;
        stateRef.current.flowActive = false;
      } else if (t < (accum += PHASE_DURATIONS.transfer)) {
        stateRef.current.phase = 'transfer';
        stateRef.current.phaseProgress = (t - (accum - PHASE_DURATIONS.transfer)) / PHASE_DURATIONS.transfer;
        stateRef.current.flowActive = true;
        stateRef.current.flowProgress = stateRef.current.phaseProgress;
      } else if (t < (accum += PHASE_DURATIONS.reaction)) {
        stateRef.current.phase = 'reaction';
        stateRef.current.phaseProgress = (t - (accum - PHASE_DURATIONS.reaction)) / PHASE_DURATIONS.reaction;
        stateRef.current.flowActive = false;
      } else {
        stateRef.current.phase = 'settle';
        stateRef.current.phaseProgress = (t - (accum - PHASE_DURATIONS.settle)) / PHASE_DURATIONS.settle;
        stateRef.current.flowActive = false;
      }
    }

    return stateRef.current;
  }, [frame, playing]);

  return { stateRef, update };
}

// --- CAMERA DIRECTOR ---
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

const CameraManager = ({ frame, frameHistory, cameraMode, totalFrames, selectedEntity }: {
  frame: VisualReplayFrame | undefined;
  frameHistory: readonly VisualReplayFrame[];
  cameraMode?: CameraFollowMode | undefined;
  totalFrames?: number | undefined;
  selectedEntity: VisualEntityId;
}) => {
  const { camera, gl } = useThree();
  const controlsRef = useRef<OrbitControls | null>(null);
  const targetPos = useMemo(() => new THREE.Vector3(), []);
  const targetLook = useMemo(() => new THREE.Vector3(), []);
  const startPos = useMemo(() => new THREE.Vector3(), []);
  const startLook = useMemo(() => new THREE.Vector3(), []);
  
  const isTransitioning = useRef(false);
  const transitionProgress = useRef(0);
  const lastTargetHash = useRef('');

  useEffect(() => {
    if (!controlsRef.current) {
      const ctrl = new OrbitControls(camera, gl.domElement);
      ctrl.enableDamping = true;
      ctrl.dampingFactor = 0.05;
      ctrl.minDistance = 4;
      ctrl.maxDistance = 42;
      ctrl.maxPolarAngle = Math.PI * 0.48;
      ctrl.target.set(0, 1.2, 0);
      controlsRef.current = ctrl;
    }

    return () => {
      controlsRef.current?.dispose();
    };
  }, [camera, gl.domElement]);

  useFrame((_state, delta) => {
    if (!controlsRef.current) return;

    const mode = cameraMode ?? 'gentle';
    const focusIds = frame?.focusNodeIds ?? [];
    const stage = frame?.stage ?? 'overview';
    const seq = frame?.sequence ?? 0;
    const total = totalFrames ?? 1;

    const directive = resolveCameraDirective(focusIds, stage, seq, total, mode);

    const currentHash = `${directive.position.join(',')}-${directive.target.join(',')}`;
    if (currentHash !== lastTargetHash.current) {
      lastTargetHash.current = currentHash;
      startPos.copy(camera.position);
      startLook.copy(controlsRef.current.target);
      targetPos.set(...directive.position);
      targetLook.set(...directive.target);
      isTransitioning.current = true;
      transitionProgress.current = 0;
    }

    if (isTransitioning.current) {
      transitionProgress.current += delta;
      const t = Math.min(transitionProgress.current / 1.0, 1.0);
      const eased = easeInOutCubic(t);
      
      camera.position.lerpVectors(startPos, targetPos, eased);
      controlsRef.current.target.lerpVectors(startLook, targetLook, eased);

      if (t >= 1.0) {
        isTransitioning.current = false;
      }
    }

    controlsRef.current.update();
  });

  return null;
};

// --- TELEMETRY ---
const TelemetryProbe = ({ onTelemetry }: { onTelemetry: (telemetry: SceneTelemetry) => void }) => {
  const { gl } = useThree();
  const lastTime = useRef(performance.now());
  const frames = useRef(0);

  useFrame(() => {
    frames.current++;
    const now = performance.now();
    const elapsed = now - lastTime.current;
    
    if (elapsed >= 1000) {
      const fps = Math.round((frames.current * 1000) / elapsed);
      const info = gl.info;
      
      onTelemetry({
        fps,
        frameTimeMs: elapsed / frames.current,
        drawCalls: info.render.calls,
        triangles: info.render.triangles,
        visibleObjects: info.render.points // Rough proxy for visible objects in webgl info
      });
      
      frames.current = 0;
      lastTime.current = now;
    }
  });

  return null;
};

// --- MODULE COMPONENTS ---
const Spine = () => {
  const rings = [2, 5, 8, -2];
  return (
    <group position={[0, 0, 0]}>
      <mesh geometry={plantGeometries.octagonalColumn} material={plantMaterials.spine} />
      {rings.map((y, i) => (
        <mesh key={i} geometry={plantGeometries.ring} material={plantMaterials.spineRings} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} />
      ))}
    </group>
  );
};

const Foundation = () => (
  <mesh geometry={plantGeometries.foundationBox} material={plantMaterials.foundation} position={[0, -5, 0]} />
);

const RoutingRails = () => (
  <group>
    {/* Shell to Process */}
    <mesh geometry={plantGeometries.railBox} material={plantMaterials.rails} position={[-2.75, -2, 1.25]} rotation={[0, Math.PI/4, 0]} />
    {/* Spine to Process */}
    <mesh geometry={plantGeometries.railBox} material={plantMaterials.rails} position={[-0.75, -2, 1.25]} rotation={[0, -Math.PI/4, 0]} />
    {/* Spine to Grep */}
    <mesh geometry={plantGeometries.railBox} material={plantMaterials.rails} position={[1.25, -2, 1.25]} rotation={[0, Math.PI/4, 0]} />
  </group>
);

const ModuleLed = ({ active, executing, position }: { active: boolean, executing: boolean, position: [number, number, number] }) => {
  const material = executing ? plantMaterials.glowAmber : (active ? plantMaterials.glowGreen : plantMaterials.glowGrey);
  return <mesh geometry={plantGeometries.led} material={material} position={position} />;
};

const ShellBay = ({ state }: { state: ChoreographyState }) => {
  const isActive = state.sourceModule === 'shell' || state.targetModule === 'shell';
  const isExecuting = isActive && state.phase === 'actuation';
  const hatchRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (!hatchRef.current) return;
    if (isActive && state.phase !== 'idle' && state.phase !== 'settle') {
      hatchRef.current.rotation.z = Math.PI / 4;
    } else {
      hatchRef.current.rotation.z = 0;
    }
  });

  return (
    <group position={[-4, 0, 0]}>
      <mesh geometry={plantGeometries.moduleBox} material={plantMaterials.shellBase} />
      <group ref={hatchRef} position={[1, 0, 0]}>
        <mesh geometry={plantGeometries.hatch} material={plantMaterials.rails} position={[0, 0, 0]} rotation={[0, Math.PI/2, 0]} />
      </group>
      <ModuleLed active={isActive} executing={isExecuting} position={[0, 1.2, 0]} />
    </group>
  );
};

const ProcessBay = ({ state }: { state: ChoreographyState }) => {
  const isActive = state.sourceModule === 'process' || state.targetModule === 'process';
  const isExecuting = isActive && state.phase === 'actuation';
  
  return (
    <group position={[-1.5, 0, 2.5]}>
      <mesh geometry={plantGeometries.moduleBox} material={plantMaterials.processBase} />
      <mesh geometry={plantGeometries.pipe} material={plantMaterials.spine} position={[0, 1, 0]} scale={[0.5, 0.5, 0.5]} />
      <ModuleLed active={isActive} executing={isExecuting} position={[0, 1.2, 1]} />
    </group>
  );
};

const GrepBay = ({ state }: { state: ChoreographyState }) => {
  const isActive = state.sourceModule === 'grep' || state.targetModule === 'grep';
  const isExecuting = isActive && state.phase === 'actuation';
  
  return (
    <group position={[2.5, 0, 2.5]}>
      <mesh geometry={plantGeometries.moduleBox} material={plantMaterials.processBase} />
      <mesh geometry={plantGeometries.hatch} material={plantMaterials.rails} position={[0, 1, 0]} rotation={[Math.PI/2, 0, 0]} />
      <ModuleLed active={isActive} executing={isExecuting} position={[0, 1.2, 1]} />
    </group>
  );
};

const PipeChamber = ({ state }: { state: ChoreographyState }) => {
  const isActive = state.targetModule === 'pipe';
  const isExecuting = isActive && state.phase === 'transfer';
  
  return (
    <group position={[0.5, 0, 2.5]}>
      <mesh geometry={plantGeometries.pipe} material={plantMaterials.pipeChamber} rotation={[0, 0, Math.PI/2]} />
      <ModuleLed active={isActive} executing={isExecuting} position={[0, 0.5, 0.5]} />
    </group>
  );
};

const StorageAssembly = ({ state }: { state: ChoreographyState }) => {
  const isActive = state.sourceModule === 'storage' || state.targetModule === 'storage';
  const isExecuting = isActive && state.phase === 'actuation';
  
  return (
    <group position={[-2, 0, -3]}>
      <mesh geometry={plantGeometries.moduleBox} material={plantMaterials.storage} scale={[1.2, 1.5, 1.2]} />
      <ModuleLed active={isActive} executing={isExecuting} position={[0, 1.6, 0]} />
    </group>
  );
};

const IOConsole = ({ state }: { state: ChoreographyState }) => {
  const isActive = state.sourceModule === 'console' || state.targetModule === 'console';
  const isExecuting = isActive && state.phase === 'reaction';
  
  return (
    <group position={[3, 0, -3]}>
      <mesh geometry={plantGeometries.moduleBox} material={plantMaterials.console} />
      <mesh geometry={plantGeometries.screen} material={isExecuting ? plantMaterials.glowAmber : plantMaterials.screen} position={[-0.1, 0.5, 1.01]} rotation={[-Math.PI/6, 0, 0]} />
      <ModuleLed active={isActive} executing={isExecuting} position={[0, 1.2, 1]} />
    </group>
  );
};

const FlowPackets = ({ state, choreographyUpdate }: { state: React.MutableRefObject<ChoreographyState>, choreographyUpdate: (delta: number) => ChoreographyState }) => {
  const maxParticles = 24;
  const instancedMeshRef = useRef<THREE.InstancedMesh>(null);
  
  const scratchMatrix = useMemo(() => new THREE.Matrix4(), []);
  const scratchPos = useMemo(() => new THREE.Vector3(), []);
  const scratchScale = useMemo(() => new THREE.Vector3(1, 1, 1), []);
  const scratchQuat = useMemo(() => new THREE.Quaternion(), []);
  const scratchColor = useMemo(() => new THREE.Color(), []);

  useFrame((r3fState, delta) => {
    const currentState = choreographyUpdate(delta);
    if (!instancedMeshRef.current) return;
    
    // Hide all particles by default
    scratchScale.set(0, 0, 0);
    for (let i = 0; i < maxParticles; i++) {
      scratchMatrix.compose(scratchPos, scratchQuat, scratchScale);
      instancedMeshRef.current.setMatrixAt(i, scratchMatrix);
    }

    if (currentState.flowActive && currentState.sourceModule && currentState.targetModule) {
      const pathKey = `${currentState.sourceModule}-${currentState.targetModule}`;
      const curve = (flowPaths as any)[pathKey] as THREE.CatmullRomCurve3 | undefined;
      
      if (curve) {
        // Draw head
        const headProgress = currentState.flowProgress;
        curve.getPointAt(headProgress, scratchPos);
        scratchScale.set(1.5, 1.5, 1.5);
        scratchMatrix.compose(scratchPos, scratchQuat, scratchScale);
        instancedMeshRef.current.setMatrixAt(0, scratchMatrix);
        scratchColor.setHex(PLANT_COLORS.flowHead);
        instancedMeshRef.current.setColorAt(0, scratchColor);

        // Draw tail
        for (let i = 1; i < 5; i++) {
          const tailProgress = Math.max(0, headProgress - (i * 0.05));
          if (tailProgress > 0) {
            curve.getPointAt(tailProgress, scratchPos);
            const scale = 1.0 - (i * 0.15);
            scratchScale.set(scale, scale, scale);
            scratchMatrix.compose(scratchPos, scratchQuat, scratchScale);
            instancedMeshRef.current.setMatrixAt(i, scratchMatrix);
            scratchColor.setHex(PLANT_COLORS.flowTail);
            instancedMeshRef.current.setColorAt(i, scratchColor);
          }
        }
      }
    }
    
    instancedMeshRef.current.instanceMatrix.needsUpdate = true;
    if (instancedMeshRef.current.instanceColor) {
      instancedMeshRef.current.instanceColor.needsUpdate = true;
    }
  });

  return (
    <instancedMesh ref={instancedMeshRef} args={[plantGeometries.particle, plantMaterials.flowHead, maxParticles]}>
      <instancedBufferAttribute attach="instanceColor" args={[new Float32Array(maxParticles * 3), 3]} />
    </instancedMesh>
  );
};

// --- MAIN PLANT SCENE ---
const UnifiedPlant = ({ frame, playing }: { frame: VisualReplayFrame | undefined, playing: boolean }) => {
  const { stateRef, update } = useChoreography(frame, playing);
  
  return (
    <group>
      <Spine />
      <Foundation />
      <RoutingRails />
      <ShellBay state={stateRef.current} />
      <ProcessBay state={stateRef.current} />
      <GrepBay state={stateRef.current} />
      <PipeChamber state={stateRef.current} />
      <StorageAssembly state={stateRef.current} />
      <IOConsole state={stateRef.current} />
      <FlowPackets state={stateRef} choreographyUpdate={update} />
    </group>
  );
};

// --- ROOT COMPONENT ---
export const IndustrialMegacity: React.FC<IndustrialMegacityProps> = ({
  frame,
  frameHistory,
  playing,
  cameraMode,
  totalFrames,
  selectedEntity,
  onSelectEntity,
  onTelemetry,
  onBackendChange
}) => {
  
  useEffect(() => {
    onBackendChange('webgl2'); // Inform parent we are initialized
  }, [onBackendChange]);

  return (
    <div style={{ width: '100%', height: '100%', background: '#050505' }}>
      <Canvas shadows camera={{ position: [0, 15, 20], fov: 45 }}>
        <color attach="background" args={['#0a0a1a']} />
        <fog attach="fog" args={['#0a0a1a', 25, 60]} />
        
        <ambientLight intensity={0.2} />
        <hemisphereLight args={[0x4aa3df, 0x1a252f, 0.4]} />
        <directionalLight position={[10, 20, 10]} intensity={1.5} castShadow />
        
        <CameraManager frame={frame} frameHistory={frameHistory} cameraMode={cameraMode} totalFrames={totalFrames} selectedEntity={selectedEntity} />
        <TelemetryProbe onTelemetry={onTelemetry} />
        
        <UnifiedPlant frame={frame} playing={playing} />
        
        {/* Background Grid */}
        <gridHelper args={[100, 100, 0x1a252f, 0x1a252f]} position={[0, -4.9, 0]} />
      </Canvas>
    </div>
  );
};

export default IndustrialMegacity;
