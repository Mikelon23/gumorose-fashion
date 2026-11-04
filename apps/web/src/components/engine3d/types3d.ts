/**
 * Gumorose 3D Cloth & UV Engine — tipos y matemática base.
 * Sin DOM: todo opera sobre Float32Array para poder probarse en Node/jsdom.
 */

export type MaterialKind = 'fabric' | 'dark' | 'skin' | 'button' | 'cord';

/** Acabado del maniquí showroom: marfil cálido escultórico. */
export const MANNEQUIN_ALABASTER_HEX = '#EDE6DC';
export const MANNEQUIN_IVORY_HEX = '#EDE6DC';
export const MANNEQUIN_ALABASTER_RGB: [number, number, number] = [
  0xed / 255,
  0xe6 / 255,
  0xdc / 255,
];
export const MANNEQUIN_IVORY_RGB = MANNEQUIN_ALABASTER_RGB;

/** Caída natural de la manga soldada al hombro (grados desde la vertical). */
export const SLEEVE_DROP_ANGLE_DEG = 26.5;
/** Ángulo natural del brazo del maniquí (grados desde la vertical). */
export const MANNEQUIN_ARM_ANGLE_DEG = 22;

/** Modo de exhibición del visor: prenda sobre maniquí o flotante. */
export type ViewerDisplayMode = 'MANNEQUIN' | 'GHOST';

export interface MaterialSpan {
  /** Rango [start, start+count) dentro de `indices`. */
  start: number;
  count: number;
  material: MaterialKind;
}

export interface MeshData {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
  spans: MaterialSpan[];
  /** Caja envolvente [minX,minY,minZ,maxX,maxY,maxZ]. */
  bounds: [number, number, number, number, number, number];
}

/** Foco de inspección al superar el 130% de zoom. */
export type CameraFocus = 'FULL_BODY' | 'CHEST_NECK' | 'SLEEVES' | 'WAIST';

export interface CameraState {
  yawDeg: number;
  pitchDeg: number;
  /** Zoom 0.5 (50%) a 3.5 (350%). */
  zoom: number;
  focus?: CameraFocus;
  /** Desplazamiento de encuadre normalizado (Shift+arrastre). */
  panX?: number;
  panY?: number;
}

/* Turntable de vitrina: eje vertical fijo, el modelo siempre erguido. */
export const TURNTABLE_PITCH_MIN_DEG = -4;
export const TURNTABLE_PITCH_MAX_DEG = 6;
export const TURNTABLE_PITCH_DEFAULT_DEG = 2;
export const CAMERA_ZOOM_MIN = 0.5;
export const CAMERA_ZOOM_MAX = 3.5;
export const CAMERA_ZOOM_DEFAULT = 1;

export function clampPitchDeg(pitchDeg: number): number {
  const value = Number.isFinite(pitchDeg) ? pitchDeg : TURNTABLE_PITCH_DEFAULT_DEG;
  return Math.min(TURNTABLE_PITCH_MAX_DEG, Math.max(TURNTABLE_PITCH_MIN_DEG, value));
}

export function clampZoom(zoom: number): number {
  const value = Number.isFinite(zoom) ? zoom : CAMERA_ZOOM_DEFAULT;
  return Math.min(CAMERA_ZOOM_MAX, Math.max(CAMERA_ZOOM_MIN, value));
}

/** Normaliza el yaw al rango de vitrina -180°..+180°. */
export function normalizeYawDeg(yawDeg: number): number {
  const value = Number.isFinite(yawDeg) ? yawDeg : 0;
  const normalized = ((((value + 180) % 360) + 360) % 360) - 180;
  return normalized === -180 && value > 0 ? 180 : normalized;
}

/** Devuelve una cámara segura: yaw normalizado, pitch y zoom acotados. */
export function clampCamera(camera: CameraState): CameraState {
  return {
    ...camera,
    yawDeg: normalizeYawDeg(camera.yawDeg),
    pitchDeg: clampPitchDeg(camera.pitchDeg),
    zoom: clampZoom(camera.zoom),
    panX: Math.min(0.6, Math.max(-0.6, Number.isFinite(camera.panX ?? 0) ? (camera.panX ?? 0) : 0)),
    panY: Math.min(0.6, Math.max(-0.6, Number.isFinite(camera.panY ?? 0) ? (camera.panY ?? 0) : 0)),
  };
}
export const clampTurntableCamera = clampCamera;

/** Cámara turntable por defecto (erguida, pitch 2°). */
export function createTurntableCamera(partial: Partial<CameraState> = {}): CameraState {
  return clampCamera({
    yawDeg: 0,
    pitchDeg: TURNTABLE_PITCH_DEFAULT_DEG,
    zoom: CAMERA_ZOOM_DEFAULT,
    focus: 'FULL_BODY',
    panX: 0,
    panY: 0,
    ...partial,
  });
}

/**
 * Arrastre de vitrina: el movimiento horizontal gira sobre el eje
 * vertical; el vertical NO inclina el modelo (pitch siempre acotado).
 */
export function applyTurntableDrag(camera: CameraState, dx: number, _dy = 0): CameraState {
  void _dy;
  return clampCamera({
    ...camera,
    yawDeg: camera.yawDeg + dx * 0.55,
    pitchDeg: camera.pitchDeg,
  });
}

/** Desplazamiento de foco normalizado según zona y zoom. */
export function cameraFocusOffset(
  focus: CameraFocus | undefined,
  zoom: number,
): [number, number] {
  if (clampZoom(zoom) <= 1.3 || !focus || focus === 'FULL_BODY') return [0, 0];
  if (focus === 'CHEST_NECK') return [0, 0.3];
  if (focus === 'SLEEVES') return [0, 0.15];
  return [0, -0.2];
}

export type LightPresetId = 'COSTA' | 'SIERRA' | 'ORIENTE';

export interface LightPreset {
  id: LightPresetId;
  label: string;
  /** Dirección de luz normalizada (hacia la escena). */
  dir: [number, number, number];
  intensity: number;
  ambient: number;
  /** Tinte cálido/frío multiplicado sobre el difuso. */
  tint: [number, number, number];
  background: [number, number, number];
}

export const LIGHT_PRESETS: Record<LightPresetId, LightPreset> = {
  COSTA: {
    id: 'COSTA',
    label: 'Sol Costeño (Guayaquil / Manta 31°C)',
    dir: normalize3([-0.55, -0.75, 0.65]),
    intensity: 1.25,
    ambient: 0.32,
    tint: [1.06, 0.98, 0.88],
    background: [243, 238, 228],
  },
  SIERRA: {
    id: 'SIERRA',
    label: 'Luz Andina de Estudio (Riobamba / Quito 11°C)',
    dir: normalize3([-0.35, -0.65, 0.85]),
    intensity: 1.05,
    ambient: 0.42,
    tint: [0.98, 1.0, 1.04],
    background: [250, 247, 242],
  },
  ORIENTE: {
    id: 'ORIENTE',
    label: 'Luz Difusa Tropical (Oriente 25°C)',
    dir: normalize3([-0.2, -0.45, 0.9]),
    intensity: 0.9,
    ambient: 0.58,
    tint: [0.97, 1.03, 0.96],
    background: [238, 243, 236],
  },
};

export function normalize3(v: [number, number, number]): [number, number, number] {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Rotación Y (yaw) seguida de X (pitch) sobre un punto. */
export function rotatePoint(
  x: number,
  y: number,
  z: number,
  yawDeg: number,
  pitchDeg: number,
): [number, number, number] {
  const cy = Math.cos(degToRad(yawDeg));
  const sy = Math.sin(degToRad(yawDeg));
  const x1 = x * cy + z * sy;
  const z1 = -x * sy + z * cy;
  const cp = Math.cos(degToRad(pitchDeg));
  const sp = Math.sin(degToRad(pitchDeg));
  const y2 = y * cp - z1 * sp;
  const z2 = y * sp + z1 * cp;
  return [x1, y2, z2];
}

export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const value = parseInt(
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean || 'C86D51',
    16,
  );
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

/** Constructor incremental de mallas con spans de material. */
export class MeshBuilder {
  positions: number[] = [];
  normals: number[] = [];
  uvs: number[] = [];
  indices: number[] = [];
  spans: MaterialSpan[] = [];
  private openSpan: MaterialSpan | null = null;

  beginSpan(material: MaterialKind): void {
    this.openSpan = { start: this.indices.length, count: 0, material };
    this.spans.push(this.openSpan);
  }

  vertex(x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number): number {
    this.positions.push(x, y, z);
    const len = Math.hypot(nx, ny, nz) || 1;
    this.normals.push(nx / len, ny / len, nz / len);
    this.uvs.push(u, v);
    return this.positions.length / 3 - 1;
  }

  tri(a: number, b: number, c: number): void {
    this.indices.push(a, b, c);
    if (this.openSpan) this.openSpan.count += 3;
  }

  quad(a: number, b: number, c: number, d: number): void {
    this.tri(a, b, c);
    this.tri(a, c, d);
  }

  build(): MeshData {
    const p = this.positions;
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < p.length; i += 3) {
      minX = Math.min(minX, p[i]!); maxX = Math.max(maxX, p[i]!);
      minY = Math.min(minY, p[i + 1]!); maxY = Math.max(maxY, p[i + 1]!);
      minZ = Math.min(minZ, p[i + 2]!); maxZ = Math.max(maxZ, p[i + 2]!);
    }
    return {
      positions: new Float32Array(p),
      normals: new Float32Array(this.normals),
      uvs: new Float32Array(this.uvs),
      indices: new Uint32Array(this.indices),
      spans: this.spans.filter((s) => s.count > 0),
      bounds: [minX, minY, minZ, maxX, maxY, maxZ],
    };
  }
}

/**
 * Normales suaves por vértice (Smooth Phong): promedia las normales de
 * vértices coincidentes para eliminar bandas facetadas entre anillos.
 */
export function smoothVertexNormals(mesh: MeshData): MeshData {
  const count = mesh.positions.length / 3;
  const sums = new Float32Array(count * 3);
  const groups = new Map<string, number[]>();
  for (let v = 0; v < count; v += 1) {
    const key = `${mesh.positions[v * 3]!.toFixed(5)},${mesh.positions[v * 3 + 1]!.toFixed(5)},${mesh.positions[v * 3 + 2]!.toFixed(5)}`;
    const group = groups.get(key);
    if (group) group.push(v);
    else groups.set(key, [v]);
  }
  for (const group of groups.values()) {
    let nx = 0;
    let ny = 0;
    let nz = 0;
    for (const v of group) {
      nx += mesh.normals[v * 3]!;
      ny += mesh.normals[v * 3 + 1]!;
      nz += mesh.normals[v * 3 + 2]!;
    }
    const len = Math.hypot(nx, ny, nz) || 1;
    for (const v of group) {
      sums[v * 3] = nx / len;
      sums[v * 3 + 1] = ny / len;
      sums[v * 3 + 2] = nz / len;
    }
  }
  return { ...mesh, normals: sums };
}

/** Traslada/escala una malla ya construida (devuelve una copia). */
export function transformMesh(
  mesh: MeshData,
  opts: { tx?: number; ty?: number; tz?: number; sx?: number; sy?: number; sz?: number },
): MeshData {
  const { tx = 0, ty = 0, tz = 0, sx = 1, sy = 1, sz = 1 } = opts;
  const positions = new Float32Array(mesh.positions.length);
  for (let i = 0; i < mesh.positions.length; i += 3) {
    positions[i] = mesh.positions[i]! * sx + tx;
    positions[i + 1] = mesh.positions[i + 1]! * sy + ty;
    positions[i + 2] = mesh.positions[i + 2]! * sz + tz;
  }
  const b = mesh.bounds;
  return {
    ...mesh,
    positions,
    bounds: [
      b[0] * sx + tx, b[1] * sy + ty, b[2] * sz + tz,
      b[3] * sx + tx, b[4] * sy + ty, b[5] * sz + tz,
    ],
  };
}

/** Fusiona varias mallas en una sola conservando spans. */
export function mergeMeshes(parts: MeshData[]): MeshData {
  const builder = new MeshBuilder();
  for (const part of parts) {
    const base = builder.positions.length / 3;
    const vertexCount = part.positions.length / 3;
    for (let v = 0; v < vertexCount; v += 1) {
      builder.vertex(
        part.positions[v * 3]!, part.positions[v * 3 + 1]!, part.positions[v * 3 + 2]!,
        part.normals[v * 3]!, part.normals[v * 3 + 1]!, part.normals[v * 3 + 2]!,
        part.uvs[v * 2]!, part.uvs[v * 2 + 1]!,
      );
    }
    for (const span of part.spans) {
      builder.beginSpan(span.material);
      const target = builder.spans[builder.spans.length - 1]!;
      for (let i = span.start; i < span.start + span.count; i += 1) {
        builder.indices.push(base + part.indices[i]!);
        target.count += 1;
      }
    }
  }
  return builder.build();
}
