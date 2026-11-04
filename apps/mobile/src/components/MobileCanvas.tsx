import React, { useEffect, useMemo, useState } from 'react';
import type { GarmentCategory, GarmentVisualVariant, LogoZone, PrintTechnique } from '@gumorose/shared';
import { buildDressedMannequinMesh, buildGarmentMesh, fabricKindFor } from './engine3d/ClothMeshGenerator3D';
import { composeAtlasTexture, type LogoUVInput } from './engine3d/UvTextureComposer';
import { MobileEngineViewport, type MobileGestureMode } from './engine3d/MobileEngineViewport';
import {
  MANNEQUIN_ALABASTER_RGB,
  TURNTABLE_PITCH_DEFAULT_DEG,
  clampCamera,
  type CameraFocus,
  type CameraState,
  type LightPresetId,
  type ViewerDisplayMode,
} from './engine3d/types3d';

export type { ViewerDisplayMode };

export type CanvasView = 'FRONTAL' | 'TRASERA';

export interface CanvasLogo {
  uid: string;
  logoUrl: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  technique?: PrintTechnique;
}

interface MobileCanvasProps {
  category: GarmentCategory;
  /** Variante de molde visual (Chino/Cargo/Jogger/Hoodie/…). */
  variant?: GarmentVisualVariant;
  fabricHex: string;
  view: CanvasView;
  logos: CanvasLogo[];
  selectedUid: string | null;
  onSelect: (uid: string | null) => void;
  onMove: (uid: string, x: number, y: number) => void;
  onScale?: (uid: string, factor: number) => void;
  onRotate?: (uid: string, deltaDeg: number) => void;
  onDuplicate?: (uid: string) => void;
  /** Luz especular 0..1 que sigue al dedo/cursor (compatibilidad). */
  specularX?: number;
  /* --- Motor 3D táctil (opcionales) --- */
  /** Orbit 360 con el dedo + pinch zoom. */
  orbit?: boolean;
  autoRotate?: boolean;
  lightPreset?: LightPresetId;
  /** ROTATE gira la prenda; MOVE_LOGO arrastra el logo por la superficie. */
  gestureMode?: MobileGestureMode;
  /** Fondo transparente para superponer la prenda sobre la foto real. */
  transparent?: boolean;
  /** Cámara controlada (Estudio móvil). */
  yawDeg?: number;
  pitchDeg?: number;
  zoom?: number;
  onCameraChange?: (camera: CameraState) => void;
  /** Prenda sobre el Maniquí Sastre 3D o flotante sola (Ghost 3D). */
  displayMode?: ViewerDisplayMode;
  onDisplayModeChange?: (mode: ViewerDisplayMode) => void;
}

export const ZONE_LABEL: Record<LogoZone, string> = {
  PECHO_IZQ: 'Pecho izq.',
  PECHO_DER: 'Pecho der.',
  CENTRO: 'Centro',
  ESPALDA: 'Espalda',
  MANGA_IZQ: 'Manga izq.',
  MANGA_DER: 'Manga der.',
};

interface ZoneDefault {
  x: number;
  y: number;
  w: number;
  h: number;
  view: CanvasView;
}

const TOP_DEFAULTS: Record<LogoZone, ZoneDefault> = {
  PECHO_IZQ: { x: 104, y: 74, w: 36, h: 36, view: 'FRONTAL' },
  PECHO_DER: { x: 60, y: 74, w: 36, h: 36, view: 'FRONTAL' },
  CENTRO: { x: 80, y: 112, w: 40, h: 40, view: 'FRONTAL' },
  ESPALDA: { x: 80, y: 86, w: 40, h: 40, view: 'TRASERA' },
  MANGA_IZQ: { x: 138, y: 58, w: 24, h: 24, view: 'FRONTAL' },
  MANGA_DER: { x: 38, y: 58, w: 24, h: 24, view: 'FRONTAL' },
};

const BOTTOM_DEFAULTS: Record<LogoZone, ZoneDefault> = {
  PECHO_IZQ: { x: 102, y: 102, w: 32, h: 32, view: 'FRONTAL' },
  PECHO_DER: { x: 66, y: 102, w: 32, h: 32, view: 'FRONTAL' },
  CENTRO: { x: 84, y: 98, w: 32, h: 32, view: 'FRONTAL' },
  ESPALDA: { x: 84, y: 98, w: 32, h: 32, view: 'TRASERA' },
  MANGA_IZQ: { x: 128, y: 58, w: 24, h: 20, view: 'FRONTAL' },
  MANGA_DER: { x: 48, y: 58, w: 24, h: 20, view: 'FRONTAL' },
};

export function zoneDefaultFor(category: GarmentCategory, zone: LogoZone): ZoneDefault {
  return (category === 'PANTALON' ? BOTTOM_DEFAULTS : TOP_DEFAULTS)[zone];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Mezcla un color HEX con negro/blanco para simular luz y sombra textil. */
export function shade(hex: string, amt: number): string {
  const normalized = /^#[0-9A-Fa-f]{6}$/.test(hex) ? hex : '#9AA0A6';
  const num = parseInt(normalized.slice(1), 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  const t = amt < 0 ? 0 : 255;
  const p = Math.abs(amt) / 100;
  const mix = (c: number): number => Math.round((t - c) * p + c);
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}

/** Variante efectiva: la explícita o inferida por categoría. */
export function effectiveVariant(
  category: GarmentCategory,
  variant?: GarmentVisualVariant,
): GarmentVisualVariant {
  if (variant) return variant;
  if (category === 'PANTALON') return 'CHINO';
  if (category === 'POLO') return 'POLO';
  if (category === 'CAMISA') return 'CAMISA';
  return 'CAMISETA';
}

/** Decodifica logos a píxeles (128px) para pintarlos curvos en el atlas UV. */
function useDecodedLogos(logos: CanvasLogo[]): Record<string, { data: Uint8ClampedArray; width: number; height: number }> {
  const [decoded, setDecoded] = useState<Record<string, { data: Uint8ClampedArray; width: number; height: number }>>({});
  const key = logos.map((l) => `${l.uid}:${l.logoUrl.slice(0, 64)}`).join('|');
  useEffect(() => {
    let cancelled = false;
    for (const logo of logos) {
      if (decoded[logo.uid]) continue;
      try {
        const img = new Image();
        img.onload = () => {
          try {
            const size = 128;
            const tmp = document.createElement('canvas');
            tmp.width = size;
            tmp.height = size;
            const ctx = tmp.getContext('2d');
            if (!ctx || cancelled) return;
            ctx.drawImage(img, 0, 0, size, size);
            const pixels = ctx.getImageData(0, 0, size, size);
            if (!cancelled) {
              setDecoded((prev) => ({ ...prev, [logo.uid]: { data: pixels.data, width: size, height: size } }));
            }
          } catch {
            /* jsdom / imagen no decodificable: queda el sello vectorial */
          }
        };
        img.src = logo.logoUrl;
      } catch {
        /* entorno sin Image: sello vectorial de respaldo */
      }
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return decoded;
}

/**
 * Visor 3D táctil de prendas (Motor Gumorose 3D Cloth & UV móvil):
 * malla anatómica con pliegues, atlas UV con logos curvos por zona,
 * fallback software con Z-buffer. Sin SVG plano, sin textos rojos,
 * sin papel cuadriculado: prenda limpia sobre fondo de estudio.
 */
export function MobileCanvas(props: MobileCanvasProps): React.JSX.Element {
  const {
    category,
    variant,
    fabricHex,
    view,
    logos,
    selectedUid,
    onSelect,
    onMove,
    onScale,
    onRotate,
    onDuplicate,
    orbit = false,
    autoRotate = false,
    lightPreset,
    gestureMode = 'ROTATE',
    transparent = false,
    yawDeg,
    pitchDeg,
    zoom,
    onCameraChange,
    displayMode,
    onDisplayModeChange,
  } = props;

  const resolved = effectiveVariant(category, variant);
  const decoded = useDecodedLogos(logos);
  const [tilt, setTilt] = useState<CameraState>({ yawDeg: 0, pitchDeg: TURNTABLE_PITCH_DEFAULT_DEG, zoom: 1 });
  const [focus, setFocus] = useState<CameraFocus>('FULL_BODY');
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [internalDisplayMode, setInternalDisplayMode] = useState<ViewerDisplayMode>('GHOST');
  const activeDisplayMode = displayMode ?? internalDisplayMode;
  const showMannequin = activeDisplayMode === 'MANNEQUIN' && !transparent;

  function changeDisplayMode(next: ViewerDisplayMode): void {
    if (displayMode === undefined) setInternalDisplayMode(next);
    onDisplayModeChange?.(next);
  }

  const mesh = useMemo(
    () => buildGarmentMesh(category, resolved === 'CAMISETA' && category !== 'PANTALON' ? variant : resolved),
    [category, variant, resolved],
  );

  const texture = useMemo(() => {
    const uvLogos: LogoUVInput[] = logos.map((logo) => ({
      uid: logo.uid,
      x: logo.x,
      y: logo.y,
      width: logo.width,
      height: logo.height,
      rotation: logo.rotation,
      technique: logo.technique,
      tintHex: '#141413',
      image: decoded[logo.uid],
    }));
    return composeAtlasTexture({
      fabricHex,
      fabricKind: fabricKindFor(category, resolved),
      logos: uvLogos,
      view,
      size: orbit ? 1024 : 512,
    });
  }, [fabricHex, category, resolved, logos, decoded, view, orbit]);

  const baseYaw = view === 'TRASERA' ? 180 : 0;
  const controlled = yawDeg !== undefined;
  const camera: CameraState = clampCamera(
    controlled
      ? { yawDeg: yawDeg ?? 0, pitchDeg: pitchDeg ?? TURNTABLE_PITCH_DEFAULT_DEG, zoom: zoom ?? 1, focus, panX: pan.x, panY: pan.y }
      : { yawDeg: tilt.yawDeg + baseYaw, pitchDeg: tilt.pitchDeg, zoom: tilt.zoom, focus, panX: pan.x, panY: pan.y },
  );

  const garmentTransform = showMannequin
    ? category === 'PANTALON'
      ? { sx: 0.95, sy: 1.3, sz: 1.02, ty: 0.03 }
      : resolved === 'GORRA'
        ? { sx: 0.46, sy: 0.46, sz: 0.46, ty: 1.6 }
        : { sx: 0.85, sy: 0.6, sz: 1.05, ty: 0.93 }
    : undefined;

  const meshes = useMemo(() => {
    const garmentMesh: { mesh: typeof mesh; texture: typeof texture; transform?: typeof garmentTransform } = {
      mesh,
      texture,
      transform: garmentTransform,
    };
    if (!showMannequin) return [garmentMesh];
    const dressed = buildDressedMannequinMesh({
      hasTop: category !== 'PANTALON' && resolved !== 'GORRA',
      hasPants: category === 'PANTALON',
      longSleeve: category === 'CAMISA' || resolved === 'HOODIE' || resolved === 'CHAQUETA',
    });
    return [{ mesh: dressed, skinTint: MANNEQUIN_ALABASTER_RGB }, garmentMesh];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesh, texture, showMannequin, category, resolved]);

  const logoAnchors = useMemo(
    () =>
      logos.map((logo) => {
        const local: [number, number, number] = [
          ((logo.x + logo.width / 2 - 100) / 100) * 0.3,
          1 - ((logo.y + logo.height / 2) / 260) * 0.96,
          0.3,
        ];
        if (!garmentTransform) return { uid: logo.uid, world: local };
        return {
          uid: logo.uid,
          world: [
            local[0] * (garmentTransform.sx ?? 1),
            local[1] * (garmentTransform.sy ?? 1) + (garmentTransform.ty ?? 0),
            local[2] * (garmentTransform.sz ?? 1),
          ] as [number, number, number],
        };
      }),
    [logos, garmentTransform],
  );

  function handleCamera(next: CameraState): void {
    const safe = clampCamera(next);
    setPan({ x: safe.panX ?? 0, y: safe.panY ?? 0 });
    if (controlled) {
      onCameraChange?.(safe);
    } else {
      setTilt({ ...safe, yawDeg: safe.yawDeg - baseYaw });
      onCameraChange?.(safe);
    }
  }

  function handleLogoDrag(uid: string, dxNorm: number, dyNorm: number): void {
    const logo = logos.find((l) => l.uid === uid);
    if (!logo) return;
    let nx = logo.x + dxNorm * 200;
    let ny = logo.y + dyNorm * 260;
    // Guías magnéticas de centrado (centro del pecho y eje vertical).
    const centerX = nx + logo.width / 2;
    const centerY = ny + logo.height / 2;
    if (Math.abs(centerX - 100) <= 7) nx = 100 - logo.width / 2;
    if (Math.abs(centerY - 118) <= 7) ny = 118 - logo.height / 2;
    onMove(uid, clamp(nx, 0, 200 - logo.width), clamp(ny, 0, 260 - logo.height));
  }

  const selectedLogo = logos.find((l) => l.uid === selectedUid) ?? null;

  return (
    <div className="relative" data-testid="garment-3d-mobile">
      {!transparent && (orbit || displayMode !== undefined) && (
        <div className="mb-2 flex flex-wrap justify-center gap-1.5" role="group" aria-label="Modo de exhibición 3D">
          <button
            type="button"
            onClick={() => changeDisplayMode('MANNEQUIN')}
            aria-pressed={activeDisplayMode === 'MANNEQUIN'}
            className={`rounded-full px-3 py-1.5 text-[11px] font-bold ${activeDisplayMode === 'MANNEQUIN' ? 'bg-gum-espresso text-white' : 'border border-gum-line bg-white text-stone-600'}`}
          >
            🧍 Con Maniquí Sastre 3D
          </button>
          <button
            type="button"
            onClick={() => changeDisplayMode('GHOST')}
            aria-pressed={activeDisplayMode === 'GHOST'}
            className={`rounded-full px-3 py-1.5 text-[11px] font-bold ${activeDisplayMode === 'GHOST' ? 'bg-gum-espresso text-white' : 'border border-gum-line bg-white text-stone-600'}`}
          >
            👕 Solo Prenda Flotante (Ghost 3D)
          </button>
        </div>
      )}
      <MobileEngineViewport
        meshes={meshes}
        camera={camera}
        onCameraChange={handleCamera}
        lightPreset={lightPreset}
        orbit={orbit}
        autoRotate={autoRotate}
        gestureMode={gestureMode}
        transparent={transparent}
        logoAnchors={gestureMode === 'MOVE_LOGO' || orbit ? logoAnchors : undefined}
        selectedLogoUid={selectedUid}
        onLogoSelect={onSelect}
        onLogoDrag={handleLogoDrag}
        ariaLabel={`Prenda 3D ${category} ${resolved}`}
        className={
          transparent
            ? 'h-full w-full touch-none select-none'
            : 'h-full w-full touch-none select-none rounded-xl bg-[#FAF7F2]'
        }
      />
      {orbit && camera.zoom > 1.3 && (
        <label className="mt-2 flex items-center justify-center gap-2 text-[11px] font-bold text-stone-600">
          Foco:
          <select value={focus} onChange={(e) => setFocus(e.target.value as CameraFocus)} aria-label="Foco de inspección" className="rounded-full border border-gum-line bg-white px-2 py-1.5 text-[11px] font-bold">
            <option value="FULL_BODY">Cuerpo Completo</option>
            <option value="CHEST_NECK">Pecho y Cuello</option>
            <option value="SLEEVES">Mangas</option>
            <option value="WAIST">Cintura</option>
          </select>
          <span className="font-normal text-stone-400">Shift + arrastrar</span>
        </label>
      )}
      {selectedLogo && (onScale || onRotate || onDuplicate) && (
        <div className="absolute right-2 top-2 flex gap-1.5" role="group" aria-label="Acciones del logo seleccionado">
          {onScale && (
            <>
              <button
                type="button"
                aria-label="Agrandar logo"
                onClick={() => onScale(selectedLogo.uid, 1.18)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-gum-espresso/90 text-base font-bold text-white shadow"
              >
                +
              </button>
              <button
                type="button"
                aria-label="Reducir logo"
                onClick={() => onScale(selectedLogo.uid, 0.85)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-gum-espresso/90 text-base font-bold text-white shadow"
              >
                −
              </button>
            </>
          )}
          {onRotate && (
            <button
              type="button"
              aria-label="Rotar logo"
              onClick={() => onRotate(selectedLogo.uid, 15)}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-gum-espresso/90 text-sm font-bold text-white shadow"
            >
              ⟳
            </button>
          )}
          {onDuplicate && (
            <button
              type="button"
              aria-label="Duplicar logo"
              onClick={() => onDuplicate(selectedLogo.uid)}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-gum-espresso/90 text-xs font-bold text-white shadow"
            >
              ⧉
            </button>
          )}
        </div>
      )}
      {gestureMode === 'MOVE_LOGO' && selectedUid && (
        <span className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-gum-espresso/80 px-2.5 py-1 text-[10px] font-bold text-white">
          Arrastra el logo sobre la prenda 3D
        </span>
      )}
    </div>
  );
}
