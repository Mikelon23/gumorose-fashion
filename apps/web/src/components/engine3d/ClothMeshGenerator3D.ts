/**
 * Generador de mallas 3D anatómicas cerradas con pliegues textiles.
 * Capa 1: Maniquí Sastre 3D esculpido (alabastro mate #EAE4DC, cuello
 * cilíndrico con tapa, hombros suaves, brazos a 22° y piernas completas).
 * Capa 2: prenda de una sola pieza continua sobre el maniquí: torso,
 * hombros y mangas soldados en la sisa con caída natural de 26.5°,
 * muestreando el mismo HEX y la misma luz del Atlas UV en toda la tela.
 * Coordenadas: Y arriba, frente hacia +Z, torso local y∈[0,1].
 */
import type { GarmentCategory, GarmentVisualVariant } from '@gumorose/shared';
import {
  MANNEQUIN_ALABASTER_HEX,
  MANNEQUIN_ALABASTER_RGB,
  MANNEQUIN_ARM_ANGLE_DEG,
  MeshBuilder,
  SLEEVE_DROP_ANGLE_DEG,
  mergeMeshes,
  smoothVertexNormals,
  type MeshData,
} from './types3d';

export { MANNEQUIN_ALABASTER_HEX, MANNEQUIN_ALABASTER_RGB, MANNEQUIN_ARM_ANGLE_DEG, SLEEVE_DROP_ANGLE_DEG };

export type FabricKind = 'JERSEY' | 'PIQUE' | 'SARGA' | 'FELPA';

export function fabricKindFor(category: GarmentCategory, variant?: GarmentVisualVariant): FabricKind {
  if (variant === 'HOODIE' || variant === 'CHAQUETA') return 'FELPA';
  if (category === 'POLO') return 'PIQUE';
  if (category === 'PANTALON') return 'SARGA';
  if (category === 'CAMISA') return 'SARGA';
  return 'JERSEY';
}

const TAU = Math.PI * 2;

function torsoProfile(t: number): { scale: number; y: number } {
  // t: 0 basta inferior -> 1 cuello
  const y = t;
  let scale: number;
  if (t < 0.45) scale = 1 - 0.13 * Math.sin((t / 0.45) * Math.PI * 0.5);
  else if (t < 0.78) scale = 0.87 + 0.16 * ((t - 0.45) / 0.33);
  else if (t < 0.95) scale = 1.03 - 0.12 * ((t - 0.78) / 0.17);
  else scale = 0.91 - 0.5 * ((t - 0.95) / 0.05);
  return { scale, y };
}

/** Torso tubular elíptico con hombro inclinado, pliegues y cavidad de cuello. */
function buildTorso(builder: MeshBuilder, volume: number, folds: number): void {
  const NX = 30;
  const NY = 15;
  const rings: number[][] = [];
  builder.beginSpan('fabric');
  for (let j = 0; j <= NY; j += 1) {
    const t = j / NY;
    const { scale, y } = torsoProfile(t);
    const rx = 0.42 * volume * scale;
    const rz = 0.25 * volume * scale;
    // Caída del hombro: los laterales (|sin theta|=1) bajan hasta 0.085
    // cerca del cuello para soldar con la sisa; frente/espalda quedan altos.
    const shoulderDrop = Math.max(0, (t - 0.78) / 0.22) * 0.085;
    const ring: number[] = [];
    for (let i = 0; i <= NX; i += 1) {
      const theta = -Math.PI + (i / NX) * TAU;
      const fold =
        folds * (Math.sin(theta * 5 + t * 9) * 0.6 + Math.sin(theta * 9 - t * 14) * 0.4) * (1 - t * 0.45);
      const rScale = 1 + fold;
      const chestBulge = Math.max(0, Math.cos(theta)) * 0.035 * Math.sin(Math.PI * Math.min(1, t * 1.15));
      const x = Math.sin(theta) * rx * rScale;
      const z = Math.cos(theta) * rz * rScale + chestBulge;
      const yVertex = y - Math.abs(Math.sin(theta)) * shoulderDrop;
      const u = 0.27 + (theta / TAU) * 0.5;
      const v = 0.74 - t * 0.68;
      ring.push(builder.vertex(x, yVertex, z, Math.sin(theta), 0.08, Math.cos(theta), u, v));
    }
    rings.push(ring);
  }
  for (let j = 0; j < NY; j += 1) {
    for (let i = 0; i < NX; i += 1) {
      builder.quad(rings[j]![i]!, rings[j]![i + 1]!, rings[j + 1]![i + 1]!, rings[j + 1]![i]!);
    }
  }
  // Cavidad interior del cuello: anillo que baja hacia la espalda interna.
  builder.beginSpan('dark');
  const neckRing: number[] = [];
  const innerRing: number[] = [];
  for (let i = 0; i <= NX; i += 1) {
    const theta = -Math.PI + (i / NX) * TAU;
    const rx = 0.42 * volume * 0.41;
    const rz = 0.25 * volume * 0.41;
    neckRing.push(builder.vertex(Math.sin(theta) * rx, 1.0, Math.cos(theta) * rz, 0, 1, 0, 0.27 + (theta / TAU) * 0.5, 0.8));
    innerRing.push(builder.vertex(Math.sin(theta) * rx * 0.92, 0.9, Math.cos(theta) * rz * 0.92 - 0.01, 0, -1, 0, 0.27 + (theta / TAU) * 0.5, 0.84));
  }
  for (let i = 0; i < NX; i += 1) {
    builder.quad(neckRing[i]!, neckRing[i + 1]!, innerRing[i + 1]!, innerRing[i]!);
  }
  // Ribete de cuello con grosor, siguiendo la caída del hombro.
  builder.beginSpan('fabric');
  const ribOuter: number[] = [];
  const ribTop: number[] = [];
  for (let i = 0; i <= NX; i += 1) {
    const theta = -Math.PI + (i / NX) * TAU;
    const rx = 0.42 * volume * 0.44;
    const rz = 0.25 * volume * 0.44;
    const drop = Math.abs(Math.sin(theta)) * 0.07;
    ribOuter.push(builder.vertex(Math.sin(theta) * rx, 0.985 - drop, Math.cos(theta) * rz, Math.sin(theta), 0.3, Math.cos(theta), 0.27 + (theta / TAU) * 0.5, 0.78));
    ribTop.push(builder.vertex(Math.sin(theta) * rx * 0.94, 1.035 - drop, Math.cos(theta) * rz * 0.94, Math.sin(theta), 0.8, Math.cos(theta), 0.27 + (theta / TAU) * 0.5, 0.82));
  }
  for (let i = 0; i < NX; i += 1) {
    builder.quad(ribOuter[i]!, ribOuter[i + 1]!, ribTop[i + 1]!, ribTop[i]!);
  }
}

/**
 * Manga soldada a la sisa: nace dentro del torso sobre la caída del
 * hombro y cae hacia abajo a 26.5° desde la vertical (rango 25°-28°),
 * nunca hacia arriba ni como cilindro suelto. Anillos ortonormales
 * perpendiculares a la dirección y mismo muestreo UV que el torso.
 */
function buildSleeve(
  builder: MeshBuilder,
  side: -1 | 1,
  longSleeve: boolean,
  volume: number,
): void {
  const NX = 14;
  const NY = longSleeve ? 10 : 5;
  const len = longSleeve ? 0.62 : 0.3;
  const angleRad = (SLEEVE_DROP_ANGLE_DEG * Math.PI) / 180;
  // Raíz enterrada en el torso (superficie lateral ~0.396 a y=0.905).
  const origin: [number, number, number] = [side * 0.355 * volume, 0.905, 0];
  const rawDir: [number, number, number] = [side * Math.sin(angleRad), -Math.cos(angleRad), 0.035];
  const dLen = Math.hypot(rawDir[0], rawDir[1], rawDir[2]) || 1;
  const dir: [number, number, number] = [rawDir[0] / dLen, rawDir[1] / dLen, rawDir[2] / dLen];
  // Curva suave de hombro: Bézier cuadrática que envuelve la sisa y
  // luego cae; la base ortonormal sigue la derivada en cada anillo.
  const tip: [number, number, number] = [
    origin[0] + dir[0] * len,
    origin[1] + dir[1] * len - 0.012,
    origin[2] + dir[2] * len,
  ];
  const control: [number, number, number] = [
    origin[0] + side * 0.11 * volume,
    origin[1] - 0.015,
    origin[2] + 0.012,
  ];
  const curvePoint = (t: number): [number, number, number] => {
    const a = (1 - t) * (1 - t);
    const b = 2 * (1 - t) * t;
    const c = t * t;
    return [
      a * origin[0] + b * control[0] + c * tip[0],
      a * origin[1] + b * control[1] + c * tip[1],
      a * origin[2] + b * control[2] + c * tip[2],
    ];
  };
  const curveDir = (t: number): [number, number, number] => {
    const dx = 2 * (1 - t) * (control[0] - origin[0]) + 2 * t * (tip[0] - control[0]);
    const dy = 2 * (1 - t) * (control[1] - origin[1]) + 2 * t * (tip[1] - control[1]);
    const dz = 2 * (1 - t) * (control[2] - origin[2]) + 2 * t * (tip[2] - control[2]);
    const l = Math.hypot(dx, dy, dz) || 1;
    return [dx / l, dy / l, dz / l];
  };
  const rings: number[][] = [];
  builder.beginSpan('fabric');
  for (let j = 0; j <= NY; j += 1) {
    const t = j / NY;
    const [cx, cy, cz] = curvePoint(t);
    const ringDir = curveDir(t);
    let ux = ringDir[1];
    let uy = -ringDir[0];
    const uLen = Math.hypot(ux, uy) || 1;
    ux /= uLen;
    uy /= uLen;
    const vx = -ringDir[2] * uy;
    const vy = ringDir[2] * ux;
    const vz = ringDir[0] * uy - ringDir[1] * ux;
    const blend = 1 + 0.12 * (1 - Math.min(1, t / 0.25));
    const radius = (longSleeve ? 0.105 : 0.115) * volume * (1 - t * 0.18) * blend;
    const ring: number[] = [];
    for (let i = 0; i <= NX; i += 1) {
      const a = (i / NX) * TAU;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const nx = ca * ux + sa * vx;
      const ny = ca * uy + sa * vy;
      const nz = sa * vz;
      const u = (side < 0 ? 0.55 : 0.765) + (i / NX) * 0.155;
      const v = 0.1 + t * (longSleeve ? 0.44 : 0.26);
      ring.push(builder.vertex(cx + nx * radius, cy + ny * radius, cz + nz * radius, nx, ny, nz, u, v));
    }
    rings.push(ring);
  }
  for (let j = 0; j < NY; j += 1) {
    for (let i = 0; i < NX; i += 1) {
      builder.quad(rings[j]![i]!, rings[j]![i + 1]!, rings[j + 1]![i + 1]!, rings[j + 1]![i]!);
    }
  }
  // Abertura interior oscura del puño.
  builder.beginSpan('dark');
  const last = rings[NY]!;
  const center = builder.vertex(tip[0], tip[1], tip[2], dir[0], dir[1], dir[2], side < 0 ? 0.62 : 0.84, 0.6);
  for (let i = 0; i < NX; i += 1) builder.tri(center, last[i]!, last[i + 1]!);
}

/** Tapeta frontal con botones en relieve (polo / camisa). */
function buildPlacket(builder: MeshBuilder, withButtons: boolean): void {
  builder.beginSpan('fabric');
  const w = 0.028;
  const top = 0.97;
  const bottom = 0.58;
  const z = 0.285;
  const a = builder.vertex(-w, bottom, z, 0, 0, 1, 0.262, 0.3);
  const b = builder.vertex(w, bottom, z, 0, 0, 1, 0.278, 0.3);
  const c = builder.vertex(w, top, z + 0.005, 0, 0, 1, 0.278, 0.08);
  const d = builder.vertex(-w, top, z + 0.005, 0, 0, 1, 0.262, 0.08);
  builder.quad(a, b, c, d);
  if (!withButtons) return;
  builder.beginSpan('button');
  for (let k = 0; k < 4; k += 1) {
    const y = 0.92 - k * 0.1;
    const r = 0.014;
    const center = builder.vertex(0, y, z + 0.012, 0, 0, 1, 0.27, 0.2);
    const pts: number[] = [];
    for (let i = 0; i < 8; i += 1) {
      const a2 = (i / 8) * TAU;
      pts.push(builder.vertex(Math.cos(a2) * r, y + Math.sin(a2) * r, z + 0.008, 0, 0, 1, 0.27, 0.2));
    }
    for (let i = 0; i < 8; i += 1) builder.tri(center, pts[i]!, pts[(i + 1) % 8]!);
  }
}

/** Capucha esculpida + cordones + bolsillo canguro (hoodie). */
function buildHoodieExtras(builder: MeshBuilder): void {
  // Capucha: casquete esférico abierto detrás del cuello.
  builder.beginSpan('fabric');
  const NX = 18;
  const NY = 7;
  const center: [number, number, number] = [0, 1.0, -0.07];
  const rings: number[][] = [];
  for (let j = 0; j <= NY; j += 1) {
    const phi = (j / NY) * Math.PI * 0.62;
    const ring: number[] = [];
    for (let i = 0; i <= NX; i += 1) {
      const theta = -Math.PI * 0.85 + (i / NX) * Math.PI * 1.7;
      const r = 0.21;
      const x = center[0] + Math.sin(phi) * Math.sin(theta) * r;
      const y = center[1] + Math.cos(phi) * r * 0.95;
      const z = center[2] + Math.sin(phi) * Math.cos(theta) * r;
      ring.push(builder.vertex(x, y, z, Math.sin(theta), 0.4, Math.cos(theta), 0.6 + (i / NX) * 0.2, 0.86 + (j / NY) * 0.1));
    }
    rings.push(ring);
  }
  for (let j = 0; j < NY; j += 1) {
    for (let i = 0; i < NX; i += 1) builder.quad(rings[j]![i]!, rings[j]![i + 1]!, rings[j + 1]![i + 1]!, rings[j + 1]![i]!);
  }
  // Cavidad interior de la capucha.
  builder.beginSpan('dark');
  const mouth = builder.vertex(0, 1.02, -0.02, 0, 0, 1, 0.7, 0.9);
  const rim = rings[NY]!;
  for (let i = 0; i < NX; i += 1) builder.tri(mouth, rim[i + 1]!, rim[i]!);
  // Cordones cilíndricos sobre el pecho.
  builder.beginSpan('cord');
  for (const side of [-1, 1] as const) {
    for (let s = 0; s < 4; s += 1) {
      const t0 = s / 4;
      const t1 = (s + 1) / 4;
      const x0 = side * 0.055;
      const y0 = 0.94 - t0 * 0.2;
      const y1 = 0.94 - t1 * 0.2;
      const r = 0.011;
      const a = builder.vertex(x0 - r, y0, 0.28, 0, 0, 1, 0.6, 0.9);
      const b = builder.vertex(x0 + r, y0, 0.28, 0, 0, 1, 0.62, 0.9);
      const c = builder.vertex(x0 + r, y1, 0.282, 0, 0, 1, 0.62, 0.92);
      const d = builder.vertex(x0 - r, y1, 0.282, 0, 0, 1, 0.6, 0.92);
      builder.quad(a, b, c, d);
    }
  }
  // Bolsillo canguro frontal con relieve.
  builder.beginSpan('fabric');
  const pw = 0.2;
  const pz = 0.265;
  const a = builder.vertex(-pw, 0.14, pz - 0.02, 0, 0, 1, 0.18, 0.62);
  const b = builder.vertex(pw, 0.14, pz - 0.02, 0, 0, 1, 0.36, 0.62);
  const c = builder.vertex(pw * 0.82, 0.4, pz + 0.015, 0, 0, 1, 0.36, 0.48);
  const d = builder.vertex(-pw * 0.82, 0.4, pz + 0.015, 0, 0, 1, 0.18, 0.48);
  builder.quad(a, b, c, d);
}

/** Pierna cilíndrica con pliegues de rodilla. */
function buildLeg(builder: MeshBuilder, side: -1 | 1, jogger: boolean, cargo: boolean): void {
  const NX = 16;
  const NY = 12;
  const hipX = side * 0.115;
  const rings: number[][] = [];
  builder.beginSpan('fabric');
  for (let j = 0; j <= NY; j += 1) {
    const t = j / NY; // 0 tobillo -> 1 cadera
    const y = 0.04 + t * 0.56;
    const kneeFold = Math.sin(t * Math.PI) * 0.012;
    const radius = jogger && t < 0.14 ? 0.062 : 0.098 - t * 0.012 + kneeFold;
    const ring: number[] = [];
    for (let i = 0; i <= NX; i += 1) {
      const a = (i / NX) * TAU;
      const fold = 1 + Math.sin(a * 6 + t * 10) * 0.02;
      const u = (side < 0 ? 0.06 : 0.56) + (i / NX) * 0.38;
      const v = 0.7 - t * 0.6;
      ring.push(builder.vertex(
        hipX + Math.sin(a) * radius * fold,
        y,
        Math.cos(a) * radius * 0.88 * fold + Math.max(0, Math.cos(a)) * kneeFold,
        Math.sin(a), 0, Math.cos(a), u, v,
      ));
    }
    rings.push(ring);
  }
  for (let j = 0; j < NY; j += 1) {
    for (let i = 0; i < NX; i += 1) builder.quad(rings[j]![i]!, rings[j]![i + 1]!, rings[j + 1]![i + 1]!, rings[j + 1]![i]!);
  }
  if (cargo) {
    // Bolsillo lateral 3D en el muslo.
    builder.beginSpan('fabric');
    const cx = hipX + side * 0.1;
    const w = 0.055;
    const h = 0.09;
    const cy = 0.42;
    const z = 0.045;
    const a = builder.vertex(cx - w, cy - h, z, side, 0, 0.4, 0.3, 0.4);
    const b = builder.vertex(cx + w, cy - h, z, side, 0, 0.4, 0.36, 0.4);
    const c = builder.vertex(cx + w, cy + h, z - 0.01, side, 0, 0.4, 0.36, 0.32);
    const d = builder.vertex(cx - w, cy + h, z - 0.01, side, 0, 0.4, 0.3, 0.32);
    builder.quad(a, b, c, d);
  }
}

/** Pantalón completo: cintura anular + cadera + dos piernas. */
function buildPants(builder: MeshBuilder, variant?: GarmentVisualVariant): void {
  const jogger = variant === 'JOGGER';
  const cargo = variant === 'CARGO';
  buildLeg(builder, -1, jogger, cargo);
  buildLeg(builder, 1, jogger, cargo);
  // Cadera y cintura anular con cavidad superior.
  const NX = 26;
  const NY = 5;
  const rings: number[][] = [];
  builder.beginSpan('fabric');
  for (let j = 0; j <= NY; j += 1) {
    const t = j / NY;
    const y = 0.58 + t * 0.16;
    const rx = 0.235 - t * 0.012;
    const rz = 0.155 - t * 0.008;
    const ring: number[] = [];
    for (let i = 0; i <= NX; i += 1) {
      const theta = -Math.PI + (i / NX) * TAU;
      const u = 0.27 + (theta / TAU) * 0.5;
      ring.push(builder.vertex(Math.sin(theta) * rx, y, Math.cos(theta) * rz, Math.sin(theta), 0, Math.cos(theta), u, 0.16 - t * 0.1));
    }
    rings.push(ring);
  }
  for (let j = 0; j < NY; j += 1) {
    for (let i = 0; i < NX; i += 1) builder.quad(rings[j]![i]!, rings[j]![i + 1]!, rings[j + 1]![i + 1]!, rings[j + 1]![i]!);
  }
  builder.beginSpan('dark');
  const top = rings[NY]!;
  const center = builder.vertex(0, 0.735, 0, 0, -1, 0, 0.27, 0.04);
  for (let i = 0; i < NX; i += 1) builder.tri(center, top[i + 1]!, top[i]!);
  // Bragueta con relieve frontal.
  builder.beginSpan('fabric');
  const a = builder.vertex(-0.012, 0.6, 0.158, 0, 0, 1, 0.265, 0.14);
  const b = builder.vertex(0.012, 0.6, 0.158, 0, 0, 1, 0.275, 0.14);
  const c = builder.vertex(0.012, 0.72, 0.15, 0, 0, 1, 0.275, 0.07);
  const d = builder.vertex(-0.012, 0.72, 0.15, 0, 0, 1, 0.265, 0.07);
  builder.quad(a, b, c, d);
}

/** Gorra: domo hemisférico de 6 paneles + botón + visera curva. */
function buildCap(builder: MeshBuilder): void {
  const NX = 24;
  const NY = 8;
  builder.beginSpan('fabric');
  const rings: number[][] = [];
  for (let j = 0; j <= NY; j += 1) {
    const phi = (j / NY) * Math.PI * 0.52;
    const ring: number[] = [];
    for (let i = 0; i <= NX; i += 1) {
      const theta = (i / NX) * TAU;
      const r = 0.3;
      const x = Math.sin(phi) * Math.sin(theta) * r;
      const y = 0.62 + Math.cos(phi) * r * 0.82;
      const z = Math.sin(phi) * Math.cos(theta) * r;
      ring.push(builder.vertex(x, y, z, Math.sin(theta), 0.6, Math.cos(theta), (i / NX), 0.1 + (j / NY) * 0.4));
    }
    rings.push(ring);
  }
  for (let j = 0; j < NY; j += 1) {
    for (let i = 0; i < NX; i += 1) builder.quad(rings[j]![i]!, rings[j]![i + 1]!, rings[j + 1]![i + 1]!, rings[j + 1]![i]!);
  }
  // Botón superior de la corona.
  builder.beginSpan('button');
  const topC = builder.vertex(0, 0.885, 0, 0, 1, 0, 0.5, 0.08);
  const topRing = rings[0]!;
  for (let i = 0; i < NX; i += 1) builder.tri(topC, topRing[i]!, topRing[i + 1]!);
  // Visera curva tridimensional hacia +Z.
  builder.beginSpan('fabric');
  const SEGX = 10;
  const SEGZ = 4;
  const grid: number[][] = [];
  for (let j = 0; j <= SEGZ; j += 1) {
    const tz = j / SEGZ;
    const row: number[] = [];
    for (let i = 0; i <= SEGX; i += 1) {
      const tx = -1 + (i / SEGX) * 2;
      const width = 0.26 * (1 - tz * 0.25);
      const x = tx * width;
      const z = 0.24 + tz * 0.3;
      const y = 0.66 - tz * tz * 0.14 - Math.abs(tx) * 0.02;
      row.push(builder.vertex(x, y, z, 0, 1, 0.2, 0.4 + tx * 0.1, 0.55 + tz * 0.15));
    }
    grid.push(row);
  }
  for (let j = 0; j < SEGZ; j += 1) {
    for (let i = 0; i < SEGX; i += 1) builder.quad(grid[j]![i]!, grid[j]![i + 1]!, grid[j + 1]![i + 1]!, grid[j + 1]![i]!);
  }
}

/** Malla 3D completa de una prenda del catálogo. */
export function buildGarmentMesh(category: GarmentCategory, variant?: GarmentVisualVariant): MeshData {
  const builder = new MeshBuilder();
  if (category === 'PANTALON') {
    buildPants(builder, variant);
    return smoothVertexNormals(builder.build());
  }
  if (variant === 'GORRA') {
    buildCap(builder);
    return smoothVertexNormals(builder.build());
  }
  const isHoodie = variant === 'HOODIE' || variant === 'CHAQUETA';
  const volume = isHoodie ? 1.12 : category === 'CAMISA' ? 1.02 : 1;
  buildTorso(builder, volume, isHoodie ? 0.012 : 0.02);
  buildSleeve(builder, -1, category === 'CAMISA' || isHoodie, volume);
  buildSleeve(builder, 1, category === 'CAMISA' || isHoodie, volume);
  if (category === 'POLO') buildPlacket(builder, false);
  if (category === 'CAMISA') buildPlacket(builder, true);
  if (isHoodie) buildHoodieExtras(builder);
  return smoothVertexNormals(builder.build());
}

export interface MannequinBuildOptions {
  /** El torso está cubierto por una prenda superior: se omite. */
  topCovered?: boolean;
  /** Las piernas están cubiertas por pantalón: solo quedan tobillos. */
  pantsCovered?: boolean;
  /** Manga larga: brazos cubiertos, solo queda la mano. */
  longSleeve?: boolean;
}

/** Escena vestida sin Z-fighting: el cuerpo solo asoma donde no hay tela. */
export function buildDressedMannequinMesh(options: {
  hasTop?: boolean;
  hasPants?: boolean;
  longSleeve?: boolean;
} = {}): MeshData {
  return buildMannequinMesh({
    topCovered: options.hasTop ?? false,
    pantsCovered: options.hasPants ?? false,
    longSleeve: options.longSleeve ?? false,
  });
}

/** Holgura anti Z-fighting: la tela siempre supera al cuerpo. */
export function garmentRadiusClearance(bodyRadius: number): number {
  return bodyRadius * 1.08 + 0.02;
}

/**
 * Maniquí showroom esculpido (Capa 1): marfil cálido #EDE6DC, cabeza
 * ovoide limpia, cuello proporcionado, hombros naturales, brazos con
 * curvatura anatómica (hombro-codo-muñeca) a 22° y piernas atléticas.
 * En modo vestido recorta torso/piernas cubiertos (cero Z-fighting).
 */
export function buildMannequinMesh(options: MannequinBuildOptions = {}): MeshData {
  const parts: MeshData[] = [];
  const add = (build: (b: MeshBuilder) => void) => {
    const b = new MeshBuilder();
    build(b);
    parts.push(b.build());
  };
  // Tubo a lo largo de un segmento con anillos ortonormales a su eje.
  const tube = (
    b: MeshBuilder,
    from: [number, number, number],
    to: [number, number, number],
    r0: number,
    r1: number,
  ) => {
    const NX = 12;
    const NY = 6;
    const seg: [number, number, number] = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
    const segLen = Math.hypot(seg[0], seg[1], seg[2]) || 1;
    const dir: [number, number, number] = [seg[0] / segLen, seg[1] / segLen, seg[2] / segLen];
    let ux = dir[1];
    let uy = -dir[0];
    let uz = 0;
    if (Math.hypot(ux, uy) < 1e-4) {
      ux = 1;
      uy = 0;
      uz = 0;
    } else {
      const l = Math.hypot(ux, uy);
      ux /= l;
      uy /= l;
    }
    const vx = dir[1] * uz - dir[2] * uy;
    const vy = dir[2] * ux - dir[0] * uz;
    const vz = dir[0] * uy - dir[1] * ux;
    const rings: number[][] = [];
    b.beginSpan('skin');
    for (let j = 0; j <= NY; j += 1) {
      const t = j / NY;
      const cx = from[0] + seg[0] * t;
      const cy = from[1] + seg[1] * t;
      const cz = from[2] + seg[2] * t;
      const r = r0 + (r1 - r0) * t;
      const ring: number[] = [];
      for (let i = 0; i <= NX; i += 1) {
        const a = (i / NX) * TAU;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const nx = ca * ux + sa * vx;
        const ny = ca * uy + sa * vy;
        const nz = ca * uz + sa * vz;
        ring.push(b.vertex(cx + nx * r, cy + ny * r, cz + nz * r, nx, ny, nz, 0.5, 0.5));
      }
      rings.push(ring);
    }
    for (let j = 0; j < NY; j += 1) {
      for (let i = 0; i < NX; i += 1) b.quad(rings[j]![i]!, rings[j]![i + 1]!, rings[j + 1]![i + 1]!, rings[j + 1]![i]!);
    }
    // Tapa del extremo distal.
    const last = rings[NY]!;
    const cap = b.vertex(to[0], to[1], to[2], dir[0], dir[1], dir[2], 0.5, 0.5);
    for (let i = 0; i < NX; i += 1) b.tri(cap, last[i]!, last[i + 1]!);
  };
  // Tubo curvo (Bézier) para brazos anatómicos hombro-codo-muñeca.
  const tubeCurve = (
    b: MeshBuilder,
    from: [number, number, number],
    mid: [number, number, number],
    to: [number, number, number],
    r0: number,
    r1: number,
  ) => {
    const NX = 14;
    const NY = 10;
    const point = (t: number): [number, number, number] => {
      const a = (1 - t) * (1 - t);
      const c = 2 * (1 - t) * t;
      const d = t * t;
      return [
        a * from[0] + c * mid[0] + d * to[0],
        a * from[1] + c * mid[1] + d * to[1],
        a * from[2] + c * mid[2] + d * to[2],
      ];
    };
    const rings: number[][] = [];
    b.beginSpan('skin');
    for (let j = 0; j <= NY; j += 1) {
      const t = j / NY;
      const [cx, cy, cz] = point(t);
      const [px, py, pz] = point(Math.min(1, t + 0.02));
      let dir: [number, number, number] = [px - cx, py - cy, pz - cz];
      const dl = Math.hypot(dir[0], dir[1], dir[2]) || 1;
      dir = [dir[0] / dl, dir[1] / dl, dir[2] / dl];
      let ux = dir[1];
      let uy = -dir[0];
      if (Math.hypot(ux, uy) < 1e-4) {
        ux = 1;
        uy = 0;
      } else {
        const l = Math.hypot(ux, uy);
        ux /= l;
        uy /= l;
      }
      const vx = -dir[2] * uy;
      const vy = dir[2] * ux;
      const vz = dir[0] * uy - dir[1] * ux;
      const r = (r0 + (r1 - r0) * t) * (1 + Math.sin(t * Math.PI) * 0.08);
      const ring: number[] = [];
      for (let i = 0; i <= NX; i += 1) {
        const a = (i / NX) * TAU;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const nx = ca * ux + sa * vx;
        const ny = ca * uy + sa * vy;
        const nz = sa * vz;
        ring.push(b.vertex(cx + nx * r, cy + ny * r, cz + nz * r, nx, ny, nz, 0.5, 0.5));
      }
      rings.push(ring);
    }
    for (let j = 0; j < NY; j += 1) {
      for (let i = 0; i < NX; i += 1) b.quad(rings[j]![i]!, rings[j]![i + 1]!, rings[j + 1]![i + 1]!, rings[j + 1]![i]!);
    }
    const last = rings[NY]!;
    const cap = b.vertex(to[0], to[1], to[2], 0, -1, 0, 0.5, 0.5);
    for (let i = 0; i < NX; i += 1) b.tri(cap, last[i]!, last[i + 1]!);
  };
  const armForSide = (side: -1 | 1): { from: [number, number, number]; mid: [number, number, number]; to: [number, number, number] } => ({
    from: [side * 0.27, 1.48, 0],
    mid: [side * 0.4, 1.22, 0.025],
    to: [side * 0.47, 0.96, 0.035],
  });
  // Torso esculpido: perfil cadera -> pecho -> hombro -> base del cuello.
  if (!options.topCovered) add((b) => {
    const NX = 20;
    const allProfile: Array<[number, number, number]> = [
      [0.9, 0.258, 0.152],
      [1.02, 0.27, 0.16],
      [1.18, 0.30, 0.176],
      [1.34, 0.31, 0.178],
      [1.46, 0.295, 0.168],
      [1.52, 0.235, 0.14],
      [1.57, 0.125, 0.085],
    ];
    // Con pantalón (sin top), el torso solo asoma sobre la cintura.
    const profile = options.pantsCovered ? allProfile.filter(([y]) => y >= 1.02) : allProfile;
    const rings: number[][] = [];
    b.beginSpan('skin');
    for (const [y, rx, rz] of profile) {
      const ring: number[] = [];
      for (let i = 0; i <= NX; i += 1) {
        const theta = -Math.PI + (i / NX) * TAU;
        const bulge = Math.max(0, Math.cos(theta)) * 0.012;
        ring.push(b.vertex(Math.sin(theta) * rx, y, Math.cos(theta) * rz + bulge, Math.sin(theta), 0, Math.cos(theta), 0.5, 0.5));
      }
      rings.push(ring);
    }
    for (let j = 0; j < profile.length - 1; j += 1) {
      for (let i = 0; i < NX; i += 1) b.quad(rings[j]![i]!, rings[j]![i + 1]!, rings[j + 1]![i + 1]!, rings[j + 1]![i]!);
    }
  });
  // Cuello proporcionado + cabeza ovoide escultórica showroom.
  add((b) => tube(b, [0, 1.54, 0], [0, 1.73, 0], 0.052, 0.047));
  add((b) => {
    const NX = 20;
    const NY = 12;
    const rings: number[][] = [];
    b.beginSpan('skin');
    for (let j = 0; j <= NY; j += 1) {
      const phi = (j / NY) * Math.PI;
      const ring: number[] = [];
      for (let i = 0; i <= NX; i += 1) {
        const theta = (i / NX) * TAU;
        const rx = 0.104;
        const ry = 0.138;
        const rz = 0.094;
        ring.push(b.vertex(
          Math.sin(phi) * Math.sin(theta) * rx,
          1.845 + Math.cos(phi) * ry,
          Math.sin(phi) * Math.cos(theta) * rz,
          Math.sin(theta), Math.cos(phi), Math.cos(theta), 0.5, 0.5,
        ));
      }
      rings.push(ring);
    }
    for (let j = 0; j < NY; j += 1) {
      for (let i = 0; i < NX; i += 1) b.quad(rings[j]![i]!, rings[j]![i + 1]!, rings[j + 1]![i + 1]!, rings[j + 1]![i]!);
    }
  });
  // Brazos curvos a 22°: completos, solo antebrazo (manga corta) o mano.
  for (const side of [-1, 1] as const) {
    const arm = armForSide(side);
    if (options.topCovered && options.longSleeve) {
      add((b) => tube(b, [arm.to[0], arm.to[1] + 0.05, arm.to[2]], arm.to, 0.04, 0.036));
    } else if (options.topCovered) {
      add((b) => tubeCurve(b, [side * 0.415, 1.2, 0.028], [side * 0.45, 1.08, 0.032], arm.to, 0.047, 0.037));
    } else {
      add((b) => tubeCurve(b, arm.from, arm.mid, arm.to, 0.068, 0.037));
    }
  }
  // Piernas atléticas completas o solo tobillos bajo el pantalón.
  if (options.pantsCovered) {
    add((b) => tube(b, [-0.12, 0.18, 0.01], [-0.12, 0.04, 0.01], 0.047, 0.042));
    add((b) => tube(b, [0.12, 0.18, 0.01], [0.12, 0.04, 0.01], 0.047, 0.042));
  } else {
    add((b) => tubeCurve(b, [-0.11, 0.98, 0], [-0.115, 0.52, 0.008], [-0.12, 0.04, 0.01], 0.092, 0.044));
    add((b) => tubeCurve(b, [0.11, 0.98, 0], [0.115, 0.52, 0.008], [0.12, 0.04, 0.01], 0.092, 0.044));
  }
  return smoothVertexNormals(mergeMeshes(parts));
}
