/**
 * Atlas UV dinámico en buffer de píxeles puro (sin DOM): color exacto,
 * micro-relieve de hilo según tejido, AO en costuras y logos curvos
 * por región UV con acabado SERIGRAFIA / SUBLIMADO / VINIL.
 */
import type { PrintTechnique } from '@gumorose/shared';
import { hexToRgb } from './types3d';
import type { FabricKind } from './ClothMeshGenerator3D';

export interface LogoUVInput {
  uid: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  technique?: PrintTechnique;
  /** Color del sello cuando no hay imagen decodificada. */
  tintHex?: string;
  /** Imagen decodificada RGBA para muestreo real en el atlas. */
  image?: { data: Uint8ClampedArray; width: number; height: number };
}

export interface AtlasTexture {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  /** Brillo especular por texel 0..255 (VINIL satinado). */
  gloss: Uint8Array;
}

export interface UVRect { u0: number; v0: number; u1: number; v1: number }

/**
 * Convierte un logo del espacio frontal 200x260 a su rectángulo UV.
 * Mangas: x<48 -> manga izquierda, x>152 -> manga derecha.
 * Espalda (view TRASERA): se refleja al centro de espalda del atlas.
 */
export function logoToUVRect(
  logo: { x: number; y: number; width: number; height: number },
  view: 'FRONTAL' | 'TRASERA' = 'FRONTAL',
): UVRect {
  const isSleeveL = logo.x < 48;
  const isSleeveR = logo.x > 152;
  if (isSleeveL || isSleeveR) {
    const uc = isSleeveL ? 0.62 : 0.84;
    const du = (logo.width / 90) * 0.13;
    const vc = 0.1 + Math.max(0, Math.min(1, logo.y / 260)) * 0.34;
    const dv = (logo.height / 260) * 0.5;
    return { u0: uc - du / 2, v0: vc - dv / 2, u1: uc + du / 2, v1: vc + dv / 2 };
  }
  const uc = view === 'TRASERA' ? 0.52 : 0.27;
  const u = uc + ((logo.x - 100) / 200) * 0.4;
  const v = 0.08 + Math.max(0, Math.min(1, (logo.y - 12) / 236)) * 0.62;
  const du = (logo.width / 200) * 0.4;
  const dv = (logo.height / 236) * 0.62;
  return { u0: u - du / 2, v0: v - dv / 2, u1: u + du / 2, v1: v + dv / 2 };
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function setPx(atlas: AtlasTexture, px: number, py: number, r: number, g: number, b: number, a = 255): void {
  if (px < 0 || py < 0 || px >= atlas.width || py >= atlas.height) return;
  const idx = (py * atlas.width + px) * 4;
  atlas.data[idx] = r;
  atlas.data[idx + 1] = g;
  atlas.data[idx + 2] = b;
  atlas.data[idx + 3] = a;
}

function blendPx(atlas: AtlasTexture, px: number, py: number, r: number, g: number, b: number, alpha: number): void {
  if (px < 0 || py < 0 || px >= atlas.width || py >= atlas.height) return;
  const idx = (py * atlas.width + px) * 4;
  atlas.data[idx] = Math.round(atlas.data[idx]! * (1 - alpha) + r * alpha);
  atlas.data[idx + 1] = Math.round(atlas.data[idx + 1]! * (1 - alpha) + g * alpha);
  atlas.data[idx + 2] = Math.round(atlas.data[idx + 2]! * (1 - alpha) + b * alpha);
}

/** Micro-relieve procedural del hilo según el tejido. */
function weaveShade(kind: FabricKind, px: number, py: number): number {
  switch (kind) {
    case 'PIQUE': {
      const cell = ((px >> 3) + (py >> 3)) % 2 === 0;
      const dot = (px % 8 < 4) === (py % 8 < 4);
      return cell ? (dot ? 0.94 : 1.0) : 0.97;
    }
    case 'SARGA':
      return ((px + py) % 6 < 3) ? 0.95 : 1.0;
    case 'FELPA': {
      const n = Math.sin(px * 12.9898 + py * 78.233) * 43758.5453;
      return 0.93 + (n - Math.floor(n)) * 0.1;
    }
    default: // JERSEY 220g: líneas finas horizontales de punto
      return (py % 3 === 0) ? 0.96 : 1.0;
  }
}

/**
 * Compone el atlas UV completo. `size` 1024 por defecto (2048 en estudio).
 */
export function composeAtlasTexture(opts: {
  fabricHex: string;
  fabricKind: FabricKind;
  logos?: LogoUVInput[];
  view?: 'FRONTAL' | 'TRASERA';
  size?: number;
}): AtlasTexture {
  const size = opts.size ?? 1024;
  const width = size;
  const height = size;
  const data = new Uint8ClampedArray(width * height * 4);
  const gloss = new Uint8Array(width * height);
  const atlas: AtlasTexture = { width, height, data, gloss };
  const [fr, fg, fb] = hexToRgb(opts.fabricHex).map((c) => Math.round(c * 255)) as [number, number, number];

  for (let py = 0; py < height; py += 1) {
    const v = py / height;
    for (let px = 0; px < width; px += 1) {
      const u = px / width;
      // AO: cuello (v<0.1), basta (v>0.68 torso), axilas (bordes de mangas), pliegues suaves.
      let ao = 1;
      if (v < 0.1) ao *= 0.82 + v * 1.8;
      if (v > 0.66 && u < 0.54) ao *= 1 - (v - 0.66) * 0.55;
      const foldShade = 0.96 + Math.sin(u * Math.PI * 22) * 0.03 + Math.sin(u * Math.PI * 47 + v * 9) * 0.015;
      const shade = weaveShade(opts.fabricKind, px, py) * ao * foldShade;
      const idx = (py * width + px) * 4;
      data[idx] = Math.round(fr * shade);
      data[idx + 1] = Math.round(fg * shade);
      data[idx + 2] = Math.round(fb * shade);
      data[idx + 3] = 255;
    }
  }

  // Costuras tono sobre tono suaves en las sisas (mismo HEX base en
  // torso, hombros y mangas: solo un pespunte sutil, sin cambio de color).
  const seam = (x0: number, y0: number, x1: number, y1: number) => {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let s = 0; s <= steps; s += 3) {
      const px = Math.round(x0 + ((x1 - x0) * s) / steps);
      const py = Math.round(y0 + ((y1 - y0) * s) / steps);
      blendPx(atlas, px, py, fr * 0.72, fg * 0.72, fb * 0.72, 0.32);
    }
  };
  seam(Math.round(0.545 * width), Math.round(0.05 * height), Math.round(0.545 * width), Math.round(0.4 * height));
  seam(Math.round(0.755 * width), Math.round(0.05 * height), Math.round(0.755 * width), Math.round(0.4 * height));
  seam(Math.round(0.03 * width), Math.round(0.72 * height), Math.round(0.51 * width), Math.round(0.72 * height));

  // Etiqueta tejida interior (espalda, bajo el cuello): rectángulo crema con hilos.
  const lx = Math.round(0.485 * width);
  const ly = Math.round(0.085 * height);
  const lw = Math.round(0.07 * width);
  const lh = Math.round(0.028 * height);
  for (let py = ly; py < ly + lh; py += 1) {
    for (let px = lx; px < lx + lw; px += 1) setPx(atlas, px, py, 232, 222, 198);
  }
  for (let row = 0; row < 3; row += 1) {
    const py = ly + 4 + row * 5;
    for (let px = lx + 4; px < lx + lw - 4; px += 1) {
      if ((px + row) % 3 !== 0) setPx(atlas, px, py, 90, 74, 52);
    }
  }

  // Logos curvos por región UV con acabado por técnica.
  for (const logo of opts.logos ?? []) {
    drawLogoOnAtlas(atlas, logo, opts.view ?? 'FRONTAL', opts.fabricKind);
  }
  return atlas;
}

function drawLogoOnAtlas(
  atlas: AtlasTexture,
  logo: LogoUVInput,
  view: 'FRONTAL' | 'TRASERA',
  _kind: FabricKind,
): void {
  const rect = logoToUVRect(logo, view);
  const x0 = Math.round(clamp01(rect.u0) * atlas.width);
  const x1 = Math.round(clamp01(rect.u1) * atlas.width);
  const y0 = Math.round(clamp01(rect.v0) * atlas.height);
  const y1 = Math.round(clamp01(rect.v1) * atlas.height);
  if (x1 <= x0 || y1 <= y0) return;
  const technique = logo.technique ?? 'SERIGRAFIA';
  const [tr, tg, tb] = hexToRgb(logo.tintHex ?? '#141413').map((c) => Math.round(c * 255)) as [number, number, number];
  const rad = ((logo.rotation ?? 0) * Math.PI) / 180;
  const cosR = Math.cos(rad);
  const sinR = Math.sin(rad);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;

  for (let py = y0; py < y1; py += 1) {
    for (let px = x0; px < x1; px += 1) {
      // Rotación del logo dentro de su rectángulo UV.
      const dx = px - cx;
      const dy = py - cy;
      const rx = cx + dx * cosR - dy * sinR;
      const ry = cy + dx * sinR + dy * cosR;
      if (rx < x0 || rx >= x1 || ry < y0 || ry >= y1) continue;
      const idx = (py * atlas.width + px) * 4;
      if (logo.image) {
        const sx = Math.floor(((rx - x0) / (x1 - x0)) * logo.image.width);
        const sy = Math.floor(((ry - y0) / (y1 - y0)) * logo.image.height);
        const sIdx = (Math.min(logo.image.height - 1, Math.max(0, sy)) * logo.image.width + Math.min(logo.image.width - 1, Math.max(0, sx))) * 4;
        const alpha = (logo.image.data[sIdx + 3] ?? 0) / 255;
        if (alpha < 0.05) continue;
        const sr = logo.image.data[sIdx]!;
        const sg = logo.image.data[sIdx + 1]!;
        const sb = logo.image.data[sIdx + 2]!;
        if (technique === 'SUBLIMADO') {
          atlas.data[idx] = Math.round((atlas.data[idx]! * sr) / 255);
          atlas.data[idx + 1] = Math.round((atlas.data[idx + 1]! * sg) / 255);
          atlas.data[idx + 2] = Math.round((atlas.data[idx + 2]! * sb) / 255);
        } else {
          atlas.data[idx] = Math.round(atlas.data[idx]! * (1 - alpha) + sr * alpha);
          atlas.data[idx + 1] = Math.round(atlas.data[idx + 1]! * (1 - alpha) + sg * alpha);
          atlas.data[idx + 2] = Math.round(atlas.data[idx + 2]! * (1 - alpha) + sb * alpha);
        }
        if (technique === 'VINIL') atlas.gloss[py * atlas.width + px] = Math.round(200 * alpha);
        continue;
      }
      // Sello vectorial de respaldo (círculo + inicial) cuando no hay imagen.
      const nx = (rx - x0) / (x1 - x0) - 0.5;
      const ny = (ry - y0) / (y1 - y0) - 0.5;
      const dist = Math.hypot(nx, ny);
      if (dist > 0.42) continue;
      const ring = dist > 0.34;
      const alpha = technique === 'SUBLIMADO' ? 0.75 : 0.92;
      if (technique === 'SUBLIMADO') {
        atlas.data[idx] = Math.round((atlas.data[idx]! * (ring ? 120 : tr)) / 255 + atlas.data[idx]! * 0.1);
        atlas.data[idx + 1] = Math.round((atlas.data[idx + 1]! * (ring ? 120 : tg)) / 255 + atlas.data[idx + 1]! * 0.1);
        atlas.data[idx + 2] = Math.round((atlas.data[idx + 2]! * (ring ? 120 : tb)) / 255 + atlas.data[idx + 2]! * 0.1);
      } else {
        const cr = ring ? 245 : tr;
        const cg = ring ? 240 : tg;
        const cb = ring ? 230 : tb;
        atlas.data[idx] = Math.round(atlas.data[idx]! * (1 - alpha) + cr * alpha);
        atlas.data[idx + 1] = Math.round(atlas.data[idx + 1]! * (1 - alpha) + cg * alpha);
        atlas.data[idx + 2] = Math.round(atlas.data[idx + 2]! * (1 - alpha) + cb * alpha);
      }
      if (technique === 'VINIL') atlas.gloss[py * atlas.width + px] = ring ? 120 : 210;
    }
  }
}

/** Punto UV del centro de un logo (para anclas 3D y la guía láser). */
export function logoCenterUV(
  logo: { x: number; y: number; width: number; height: number },
  view: 'FRONTAL' | 'TRASERA' = 'FRONTAL',
): { u: number; v: number } {
  const rect = logoToUVRect(logo, view);
  return { u: (rect.u0 + rect.u1) / 2, v: (rect.v0 + rect.v1) / 2 };
}
