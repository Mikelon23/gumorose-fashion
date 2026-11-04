import React, { useEffect, useMemo, useRef } from 'react';
import {
  computeFraming,
  projectWorldPoint,
  renderSceneToBuffer,
  type SceneMesh,
} from './SoftwareRenderer3D';
import { tryCreateGLRenderer, type GLRenderer } from './WebGLRenderer3D';
import {
  LIGHT_PRESETS,
  TURNTABLE_PITCH_DEFAULT_DEG,
  applyTurntableDrag,
  clampCamera,
  clampPitchDeg,
  clampZoom,
  type CameraState,
  type LightPresetId,
} from './types3d';

export interface LogoAnchor {
  uid: string;
  /** Punto de mundo sobre la superficie frontal de la prenda. */
  world: [number, number, number];
}

export interface EngineViewportProps {
  meshes: SceneMesh[];
  camera: CameraState;
  onCameraChange?: (camera: CameraState) => void;
  lightPreset?: LightPresetId;
  /** Orbit libre con arrastre (estudio). Sin esto: tilt parallax suave. */
  orbit?: boolean;
  autoRotate?: boolean;
  logoAnchors?: LogoAnchor[];
  selectedLogoUid?: string | null;
  onLogoSelect?: (uid: string | null) => void;
  /** Desplazamiento normalizado (-1..1) del logo arrastrado. */
  onLogoDrag?: (uid: string, dxNorm: number, dyNorm: number) => void;
  ariaLabel: string;
  className?: string;
}

const RENDER_W = 460;
const RENDER_H = 560;

/**
 * Visor del motor 3D: WebGL si hay GPU, rasterizador software con
 * Z-buffer si no. Turntable 360, zoom 50-350%, tilt en tarjetas y
 * arrastre de logos con guia laser solo mientras se arrastra.
 */
export function EngineViewport({
  meshes,
  camera,
  onCameraChange,
  lightPreset = 'SIERRA',
  orbit = false,
  autoRotate = false,
  logoAnchors,
  selectedLogoUid,
  onLogoSelect,
  onLogoDrag,
  ariaLabel,
  className,
}: EngineViewportProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glRef = useRef<GLRenderer | null>(null);
  const dragRef = useRef<
    | { kind: 'orbit'; x: number; y: number }
    | { kind: 'pan'; x: number; y: number }
    | { kind: 'logo'; uid: string; x: number; y: number }
    | null
  >(null);
  const safeCamera = clampCamera(camera);
  const cameraRef = useRef(safeCamera);
  cameraRef.current = safeCamera;
  const onCameraChangeRef = useRef(onCameraChange);
  onCameraChangeRef.current = onCameraChange;
  const [draggingLogo, setDraggingLogo] = React.useState<string | null>(null);
  const light = LIGHT_PRESETS[lightPreset];
  const framing = useMemo(() => computeFraming(meshes), [meshes]);

  // Rotacion automatica de showroom (respeta prefers-reduced-motion).
  useEffect(() => {
    if (!autoRotate || !onCameraChange) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      onCameraChange(clampCamera({ ...cameraRef.current, yawDeg: cameraRef.current.yawDeg + dt * 0.03 }));
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [autoRotate, camera, onCameraChange]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = RENDER_W;
    canvas.height = RENDER_H;
    if (!glRef.current) glRef.current = tryCreateGLRenderer(canvas);
    const gl = glRef.current;
    if (gl) {
      gl.draw(meshes, safeCamera, light);
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const result = renderSceneToBuffer({
      width: RENDER_W,
      height: RENDER_H,
      meshes,
      camera: safeCamera,
      light,
      floorY: framing ? framing.center[1] - framing.worldSize[1] / 2 : undefined,
    });
    ctx.putImageData(
      new ImageData(result.data as unknown as ImageDataArray, result.width, result.height),
      0,
      0,
    );
    // Guia laser sutil solo mientras se arrastra un logo.
    if (draggingLogo && logoAnchors && framing) {
      const anchor = logoAnchors.find((a) => a.uid === draggingLogo);
      if (anchor) {
        const p = projectWorldPoint({
          point: anchor.world,
          width: RENDER_W,
          height: RENDER_H,
          center: framing.center,
          worldSize: framing.worldSize,
          camera: safeCamera,
        });
        ctx.save();
        ctx.strokeStyle = 'rgba(200,109,81,0.85)';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(p.x, 0);
        ctx.lineTo(p.x, RENDER_H);
        ctx.moveTo(0, p.y);
        ctx.lineTo(RENDER_W, p.y);
        ctx.stroke();
        ctx.restore();
      }
    }
  }, [meshes, camera, light, draggingLogo, logoAnchors, framing]);

  function anchorAt(clientX: number, clientY: number): LogoAnchor | null {
    const canvas = canvasRef.current;
    if (!canvas || !logoAnchors || !framing) return null;
    const rect = canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * RENDER_W;
    const y = ((clientY - rect.top) / rect.height) * RENDER_H;
    let best: { anchor: LogoAnchor; dist: number } | null = null;
    for (const anchor of logoAnchors) {
      const p = projectWorldPoint({
        point: anchor.world,
        width: RENDER_W,
        height: RENDER_H,
        center: framing.center,
        worldSize: framing.worldSize,
        camera: safeCamera,
      });
      const dist = Math.hypot(p.x - x, p.y - y);
      if (dist < 42 && (!best || dist < best.dist)) best = { anchor, dist };
    }
    return best?.anchor ?? null;
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>): void {
    const anchor = anchorAt(e.clientX, e.clientY);
    const wantsPan = orbit && safeCamera.zoom > 1.3 && (e.shiftKey || e.button === 2);
    if (wantsPan) {
      dragRef.current = { kind: 'pan', x: e.clientX, y: e.clientY };
    } else if (anchor && onLogoDrag) {
      dragRef.current = { kind: 'logo', uid: anchor.uid, x: e.clientX, y: e.clientY };
      setDraggingLogo(anchor.uid);
      onLogoSelect?.(anchor.uid);
    } else {
      dragRef.current = { kind: 'orbit', x: e.clientX, y: e.clientY };
      if (!anchor) onLogoSelect?.(null);
    }
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>): void {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const drag = dragRef.current;
    if (!drag) {
      // 3D Parallax Tilt en tarjetas: rotacion suave siguiendo el cursor.
      if (!orbit && onCameraChange) {
        const rect = canvas.getBoundingClientRect();
        const nx = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
        const ny = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
        onCameraChange(clampCamera({ ...safeCamera, yawDeg: nx * 16, pitchDeg: clampPitchDeg(TURNTABLE_PITCH_DEFAULT_DEG + ny * 2) }));
      }
      return;
    }
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (drag.kind === 'logo') {
      const rect = canvas.getBoundingClientRect();
      onLogoDrag?.(drag.uid, dx / rect.width, dy / rect.height);
    } else if (drag.kind === 'pan' && onCameraChange) {
      const rect = canvas.getBoundingClientRect();
      onCameraChange(clampCamera({
        ...safeCamera,
        panX: (safeCamera.panX ?? 0) - dx / Math.max(1, rect.width),
        panY: (safeCamera.panY ?? 0) + dy / Math.max(1, rect.height),
      }));
    } else if (orbit && onCameraChange) {
      // Turntable: solo yaw; el pitch queda bloqueado en -4..+6.
      onCameraChange(applyTurntableDrag(safeCamera, dx, dy));
    }
    dragRef.current = { ...drag, x: e.clientX, y: e.clientY };
  }

  function handlePointerUp(): void {
    dragRef.current = null;
    setDraggingLogo(null);
  }

  // Rueda con preventDefault real (listener no pasivo): zoom 50%-350%
  // sin desplazar la página mientras se inspecciona la prenda.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !orbit) return;
    const onWheel = (event: WheelEvent) => {
      const change = onCameraChangeRef.current;
      if (!change) return;
      event.preventDefault();
      const current = cameraRef.current;
      const factor = event.deltaY < 0 ? 1.1 : 0.9;
      change(clampCamera({ ...current, zoom: clampZoom(current.zoom * factor) }));
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [orbit]);

  const tiltActive = selectedLogoUid !== undefined && selectedLogoUid !== null;
  void tiltActive;
  return (
    <canvas
      ref={canvasRef}
      width={RENDER_W}
      height={RENDER_H}
      role="img"
      aria-label={ariaLabel}
      data-engine="gumorose-3d"
      className={className ?? 'h-full w-full touch-none select-none'}
      style={{ cursor: draggingLogo ? 'grabbing' : orbit ? 'grab' : 'default' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onContextMenu={(e) => e.preventDefault()}
    />
  );
}

