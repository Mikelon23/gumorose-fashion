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

export interface MobileLogoAnchor {
  uid: string;
  /** Punto de mundo sobre la superficie frontal de la prenda. */
  world: [number, number, number];
}

export type MobileGestureMode = 'ROTATE' | 'MOVE_LOGO';

export interface MobileEngineViewportProps {
  meshes: SceneMesh[];
  camera: CameraState;
  onCameraChange?: (camera: CameraState) => void;
  lightPreset?: LightPresetId;
  /** Orbit táctil libre 360. Sin esto: tilt suave al tocar tarjetas. */
  orbit?: boolean;
  autoRotate?: boolean;
  /** ROTATE: el dedo gira la prenda. MOVE_LOGO: el dedo mueve el logo. */
  gestureMode?: MobileGestureMode;
  /** Fondo transparente para superponer sobre la foto real del usuario. */
  transparent?: boolean;
  logoAnchors?: MobileLogoAnchor[];
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
 * Visor táctil del Motor 3D Móvil Gumorose: WebGL si hay GPU,
 * rasterizador software con Z-buffer si no (jsdom incluido).
 * Gestos: 1 dedo gira o mueve logo según el modo, 2 dedos = pinch zoom.
 * La guía láser solo aparece mientras el dedo arrastra un logo.
 */
export function MobileEngineViewport({
  meshes,
  camera,
  onCameraChange,
  lightPreset = 'SIERRA',
  orbit = false,
  autoRotate = false,
  gestureMode = 'ROTATE',
  transparent = false,
  logoAnchors,
  selectedLogoUid,
  onLogoSelect,
  onLogoDrag,
  ariaLabel,
  className,
}: MobileEngineViewportProps): React.JSX.Element {
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
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<number | null>(null);
  const [draggingLogo, setDraggingLogo] = React.useState<string | null>(null);
  const light = LIGHT_PRESETS[lightPreset];
  const framing = useMemo(() => computeFraming(meshes), [meshes]);

  // Rotación automática de showroom (respeta prefers-reduced-motion).
  useEffect(() => {
    if (!autoRotate || !onCameraChange) return;
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
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
    if (!transparent) {
      if (!glRef.current) glRef.current = tryCreateGLRenderer(canvas);
      const gl = glRef.current;
      if (gl) {
        gl.draw(meshes, safeCamera, light);
        return;
      }
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const result = renderSceneToBuffer({
      width: RENDER_W,
      height: RENDER_H,
      meshes,
      camera: safeCamera,
      light,
      transparent,
      floorY: framing ? framing.center[1] - framing.worldSize[1] / 2 : undefined,
    });
    ctx.putImageData(
      new ImageData(result.data as unknown as ImageDataArray, result.width, result.height),
      0,
      0,
    );
    // Guía láser sutil solo mientras el dedo arrastra un logo.
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
  }, [meshes, camera, light, draggingLogo, logoAnchors, framing, transparent]);

  function anchorAt(clientX: number, clientY: number): MobileLogoAnchor | null {
    const canvas = canvasRef.current;
    if (!canvas || !logoAnchors || !framing) return null;
    const rect = canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * RENDER_W;
    const y = ((clientY - rect.top) / rect.height) * RENDER_H;
    let best: { anchor: MobileLogoAnchor; dist: number } | null = null;
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
      if (dist < 52 && (!best || dist < best.dist)) best = { anchor, dist };
    }
    return best?.anchor ?? null;
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>): void {
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
      pinchRef.current = Math.hypot(a.x - b.x, a.y - b.y);
      dragRef.current = null;
      setDraggingLogo(null);
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      return;
    }
    const anchor = anchorAt(e.clientX, e.clientY);
    if (orbit && safeCamera.zoom > 1.3 && (e.shiftKey || e.button === 2)) {
      dragRef.current = { kind: 'pan', x: e.clientX, y: e.clientY };
    } else if (gestureMode === 'MOVE_LOGO' && anchor && onLogoDrag) {
      dragRef.current = { kind: 'logo', uid: anchor.uid, x: e.clientX, y: e.clientY };
      setDraggingLogo(anchor.uid);
      onLogoSelect?.(anchor.uid);
    } else if (gestureMode === 'ROTATE' && orbit) {
      dragRef.current = { kind: 'orbit', x: e.clientX, y: e.clientY };
      if (!anchor) onLogoSelect?.(null);
      else onLogoSelect?.(anchor.uid);
    } else if (!anchor) {
      onLogoSelect?.(null);
    } else {
      onLogoSelect?.(anchor.uid);
    }
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>): void {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (pointersRef.current.has(e.pointerId)) {
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    // Pinch zoom con dos dedos (50% a 350%).
    if (pointersRef.current.size === 2 && pinchRef.current && onCameraChange) {
      const [a, b] = [...pointersRef.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const ratio = dist / pinchRef.current;
      if (Math.abs(ratio - 1) > 0.02) {
        onCameraChange(clampCamera({ ...safeCamera, zoom: clampZoom(safeCamera.zoom * ratio) }));
        pinchRef.current = dist;
      }
      return;
    }
    const drag = dragRef.current;
    if (!drag) {
      // Tilt suave en tarjetas al deslizar el dedo sin modo orbit.
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
    } else if (onCameraChange) {
      onCameraChange(applyTurntableDrag(safeCamera, dx, dy));
    }
    dragRef.current = { ...drag, x: e.clientX, y: e.clientY };
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !orbit) return;
    const onWheel = (event: WheelEvent) => {
      const change = onCameraChangeRef.current;
      if (!change) return;
      event.preventDefault();
      const current = cameraRef.current;
      change(clampCamera({ ...current, zoom: clampZoom(current.zoom * (event.deltaY < 0 ? 1.1 : 0.9)) }));
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [orbit]);

  function endPointer(e: React.PointerEvent<HTMLCanvasElement>): void {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (pointersRef.current.size === 0) {
      dragRef.current = null;
      setDraggingLogo(null);
    }
  }

  return (
    <canvas
      ref={canvasRef}
      width={RENDER_W}
      height={RENDER_H}
      role="img"
      aria-label={ariaLabel}
      data-engine="gumorose-3d-mobile"
      className={className ?? 'h-full w-full touch-none select-none'}
      style={{ cursor: draggingLogo ? 'grabbing' : orbit ? 'grab' : 'default', touchAction: 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onPointerLeave={endPointer}
      onContextMenu={(e) => e.preventDefault()}
    />
  );
}
