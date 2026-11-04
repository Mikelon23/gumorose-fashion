/**
 * Rasterizador 3D por software: malla triangular con Z-buffer sobre
 * buffer de píxeles puro. Es el fallback garantizado (jsdom, sin GPU)
 * y la ruta de prueba del motor: no depende de ningún contexto DOM.
 */
import {
  MANNEQUIN_ALABASTER_RGB,
  cameraFocusOffset,
  clampCamera,
  rotatePoint,
  type CameraState,
  type LightPreset,
  type MeshData,
} from './types3d';
import type { AtlasTexture } from './UvTextureComposer';

export interface SceneMesh {
  mesh: MeshData;
  texture?: AtlasTexture | null;
  /** Tinte RGB 0..1 para spans sin textura (piel alabastro por defecto). */
  skinTint?: [number, number, number];
  transform?: { tx?: number; ty?: number; tz?: number; sx?: number; sy?: number; sz?: number };
}

export interface RenderResult {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  /** Cantidad de píxeles cubiertos por geometría (telemetría de test). */
  coveredPixels: number;
}

const MATERIAL_BASE: Record<string, [number, number, number]> = {
  dark: [0.09, 0.075, 0.06],
  skin: MANNEQUIN_ALABASTER_RGB,
  button: [0.93, 0.9, 0.84],
  cord: [0.16, 0.145, 0.12],
};

function sampleTexture(tex: AtlasTexture, u: number, v: number): [number, number, number, number] {
  const px = Math.max(0, Math.min(tex.width - 1, Math.floor(u * tex.width)));
  const py = Math.max(0, Math.min(tex.height - 1, Math.floor(v * tex.height)));
  const idx = (py * tex.width + px) * 4;
  return [tex.data[idx]! / 255, tex.data[idx + 1]! / 255, tex.data[idx + 2]! / 255, tex.gloss[py * tex.width + px]! / 255];
}

export function renderSceneToBuffer(opts: {
  width: number;
  height: number;
  meshes: SceneMesh[];
  camera: CameraState;
  light: LightPreset;
  /** Centro Y del piso para la sombra (en coords de mundo). */
  floorY?: number;
  /** Fondo alfa 0 y sin sombra: superposición sobre la foto real del usuario. */
  transparent?: boolean;
}): RenderResult {
  const { width, height } = opts;
  const data = new Uint8ClampedArray(width * height * 4);
  const zBuffer = new Float32Array(width * height).fill(-Infinity);
  const [bgR, bgG, bgB] = opts.light.background;

  // Fondo de estudio limpio con degradado vertical sutil (sin cuadrícula).
  if (!opts.transparent) for (let py = 0; py < height; py += 1) {
    const grad = 1 - (py / height) * 0.08;
    for (let px = 0; px < width; px += 1) {
      const idx = (py * width + px) * 4;
      data[idx] = Math.round(bgR * grad);
      data[idx + 1] = Math.round(bgG * grad);
      data[idx + 2] = Math.round(bgB * grad);
      data[idx + 3] = 255;
    }
  }

  // Encuadre: caja envolvente combinada.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const item of opts.meshes) {
    const b = item.mesh.bounds;
    const t = item.transform ?? {};
    minX = Math.min(minX, b[0] * (t.sx ?? 1) + (t.tx ?? 0));
    maxX = Math.max(maxX, b[3] * (t.sx ?? 1) + (t.tx ?? 0));
    minY = Math.min(minY, b[1] * (t.sy ?? 1) + (t.ty ?? 0));
    maxY = Math.max(maxY, b[4] * (t.sy ?? 1) + (t.ty ?? 0));
  }
  if (!Number.isFinite(minX)) {
    return { width, height, data, coveredPixels: 0 };
  }
  const safeCamera = clampCamera(opts.camera);
  const worldW0 = Math.max(0.001, maxX - minX);
  const worldH0 = Math.max(0.001, maxY - minY);
  const [focusX, focusY] = cameraFocusOffset(safeCamera.focus, safeCamera.zoom);
  const centerX = (minX + maxX) / 2 + ((safeCamera.panX ?? 0) + focusX) * worldW0;
  const centerY = (minY + maxY) / 2 + ((safeCamera.panY ?? 0) + focusY) * worldH0;
  const worldW = worldW0;
  const worldH = worldH0;
  const fit = Math.min(width / worldW, height / worldH) * 0.86 * safeCamera.zoom;
  const floorWorldY = opts.floorY ?? minY;

  // Sombra suave en el piso (elipse difuminada bajo el sujeto).
  const floorScreenY = height / 2 + (centerY - floorWorldY) * fit;
  const shadowRx = worldW * fit * 0.42;
  const shadowRy = Math.max(6, shadowRx * 0.16);
  const shadowCx = width / 2;
  if (!opts.transparent) for (let py = Math.max(0, Math.floor(floorScreenY - shadowRy * 2)); py < Math.min(height, floorScreenY + shadowRy * 2); py += 1) {
    for (let px = Math.max(0, Math.floor(shadowCx - shadowRx * 1.4)); px < Math.min(width, shadowCx + shadowRx * 1.4); px += 1) {
      const dx = (px - shadowCx) / shadowRx;
      const dy = (py - floorScreenY) / shadowRy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= 1) continue;
      const strength = (1 - d2) * 0.16;
      const idx = (py * width + px) * 4;
      data[idx] = Math.round(data[idx]! * (1 - strength));
      data[idx + 1] = Math.round(data[idx + 1]! * (1 - strength));
      data[idx + 2] = Math.round(data[idx + 2]! * (1 - strength));
    }
  }

  const toLight: [number, number, number] = [
    -opts.light.dir[0], -opts.light.dir[1], -opts.light.dir[2],
  ];
  let covered = 0;

  for (const item of opts.meshes) {
    const { mesh } = item;
    const t = item.transform ?? {};
    const sx = t.sx ?? 1, sy = t.sy ?? 1, sz = t.sz ?? 1;
    const vertexCount = mesh.positions.length / 3;
    const projected = new Float32Array(vertexCount * 3);
    const viewNormals = new Float32Array(vertexCount * 3);
    for (let v = 0; v < vertexCount; v += 1) {
      const wx = mesh.positions[v * 3]! * sx + (t.tx ?? 0) - centerX;
      const wy = mesh.positions[v * 3 + 1]! * sy + (t.ty ?? 0) - centerY;
      const wz = mesh.positions[v * 3 + 2]! * sz + (t.tz ?? 0);
      const [rx, ry, rz] = rotatePoint(wx, wy, wz, safeCamera.yawDeg, safeCamera.pitchDeg);
      const persp = 1 + rz * 0.1;
      projected[v * 3] = width / 2 + (rx * fit) / persp;
      projected[v * 3 + 1] = height / 2 - (ry * fit) / persp;
      projected[v * 3 + 2] = rz;
      const [nx, ny, nz] = rotatePoint(
        mesh.normals[v * 3]!, mesh.normals[v * 3 + 1]!, mesh.normals[v * 3 + 2]!,
        safeCamera.yawDeg, safeCamera.pitchDeg,
      );
      viewNormals[v * 3] = nx;
      viewNormals[v * 3 + 1] = ny;
      viewNormals[v * 3 + 2] = nz;
    }

    for (const span of mesh.spans) {
      const base = MATERIAL_BASE[span.material];
      for (let i = span.start; i + 2 < span.start + span.count; i += 3) {
        const ia = mesh.indices[i]!;
        const ib = mesh.indices[i + 1]!;
        const ic = mesh.indices[i + 2]!;
        const ax = projected[ia * 3]!, ay = projected[ia * 3 + 1]!, az = projected[ia * 3 + 2]!;
        const bx = projected[ib * 3]!, by = projected[ib * 3 + 1]!, bz = projected[ib * 3 + 2]!;
        const cx = projected[ic * 3]!, cy = projected[ic * 3 + 1]!, cz = projected[ic * 3 + 2]!;
        const denom = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
        if (Math.abs(denom) < 1e-9) continue;
        const minPx = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
        const maxPx = Math.min(width - 1, Math.ceil(Math.max(ax, bx, cx)));
        const minPy = Math.max(0, Math.floor(Math.min(ay, by, cy)));
        const maxPy = Math.min(height - 1, Math.ceil(Math.max(ay, by, cy)));
        if (minPx > maxPx || minPy > maxPy) continue;
        // Smooth Phong: la normal se interpola por píxel (sin facetas).
        for (let py = minPy; py <= maxPy; py += 1) {
          for (let px = minPx; px <= maxPx; px += 1) {
            const w0 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / denom;
            const w1 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / denom;
            const w2 = 1 - w0 - w1;
            if (w0 < -0.001 || w1 < -0.001 || w2 < -0.001) continue;
            const z = w0 * az + w1 * bz + w2 * cz;
            const zIdx = py * width + px;
            if (z <= zBuffer[zIdx]!) continue;
            zBuffer[zIdx] = z;
            const u = w0 * mesh.uvs[ia * 2]! + w1 * mesh.uvs[ib * 2]! + w2 * mesh.uvs[ic * 2]!;
            const v = w0 * mesh.uvs[ia * 2 + 1]! + w1 * mesh.uvs[ib * 2 + 1]! + w2 * mesh.uvs[ic * 2 + 1]!;
            let inx = w0 * viewNormals[ia * 3]! + w1 * viewNormals[ib * 3]! + w2 * viewNormals[ic * 3]!;
            let iny = w0 * viewNormals[ia * 3 + 1]! + w1 * viewNormals[ib * 3 + 1]! + w2 * viewNormals[ic * 3 + 1]!;
            let inz = w0 * viewNormals[ia * 3 + 2]! + w1 * viewNormals[ib * 3 + 2]! + w2 * viewNormals[ic * 3 + 2]!;
            const iLen = Math.hypot(inx, iny, inz) || 1;
            inx /= iLen;
            iny /= iLen;
            inz /= iLen;
            const diff = Math.max(0, inx * toLight[0] + iny * toLight[1] + inz * toLight[2]);
            const shade = opts.light.ambient + diff * opts.light.intensity * (1 - opts.light.ambient);
            const specBase = Math.pow(Math.max(0, inz), 24) * 0.24;
            let r: number, g: number, b: number, gloss = 0;
            if (span.material === 'fabric' && item.texture) {
              [r, g, b, gloss] = sampleTexture(item.texture, u, v);
            } else if (span.material === 'fabric' && item.skinTint) {
              [r, g, b] = item.skinTint;
            } else {
              [r, g, b] = base ?? MATERIAL_BASE.skin!;
              if (item.skinTint && span.material === 'skin') [r, g, b] = item.skinTint;
            }
            const spec = specBase * (0.25 + gloss * 1.6);
            const idx = zIdx * 4;
            if (data[idx + 3] === 255 && zBuffer[zIdx] === z) covered += 0; // conteo abajo
            data[idx] = Math.max(0, Math.min(255, Math.round((r * shade * opts.light.tint[0] + spec) * 255)));
            data[idx + 1] = Math.max(0, Math.min(255, Math.round((g * shade * opts.light.tint[1] + spec) * 255)));
            data[idx + 2] = Math.max(0, Math.min(255, Math.round((b * shade * opts.light.tint[2] + spec) * 255)));
            data[idx + 3] = 255;
          }
        }
      }
    }
  }

  for (let i = 0; i < zBuffer.length; i += 1) {
    if (zBuffer[i]! > -Infinity) covered += 1;
  }
  return { width, height, data, coveredPixels: covered };
}

/** Encuadre compartido renderer/viewport: centro y tamaño de mundo. */
export function computeFraming(
  meshes: SceneMesh[],
): { center: [number, number]; worldSize: [number, number] } | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const item of meshes) {
    const b = item.mesh.bounds;
    const t = item.transform ?? {};
    minX = Math.min(minX, b[0] * (t.sx ?? 1) + (t.tx ?? 0));
    maxX = Math.max(maxX, b[3] * (t.sx ?? 1) + (t.tx ?? 0));
    minY = Math.min(minY, b[1] * (t.sy ?? 1) + (t.ty ?? 0));
    maxY = Math.max(maxY, b[4] * (t.sy ?? 1) + (t.ty ?? 0));
  }
  if (!Number.isFinite(minX)) return null;
  return {
    center: [(minX + maxX) / 2, (minY + maxY) / 2],
    worldSize: [Math.max(0.001, maxX - minX), Math.max(0.001, maxY - minY)],
  };
}

/** Proyecta un punto de mundo a pantalla (anclas de logos y hit-test). */
export function projectWorldPoint(opts: {
  point: [number, number, number];
  width: number;
  height: number;
  center: [number, number];
  worldSize: [number, number];
  camera: CameraState;
}): { x: number; y: number; z: number } {
  const safeCamera = clampCamera(opts.camera);
  const [focusX, focusY] = cameraFocusOffset(safeCamera.focus, safeCamera.zoom);
  const cx = opts.center[0] + ((safeCamera.panX ?? 0) + focusX) * opts.worldSize[0];
  const cy = opts.center[1] + ((safeCamera.panY ?? 0) + focusY) * opts.worldSize[1];
  const fit = Math.min(opts.width / opts.worldSize[0], opts.height / opts.worldSize[1]) * 0.86 * safeCamera.zoom;
  const [rx, ry, rz] = rotatePoint(opts.point[0] - cx, opts.point[1] - cy, opts.point[2], safeCamera.yawDeg, safeCamera.pitchDeg);
  const persp = 1 + rz * 0.1;
  return { x: opts.width / 2 + (rx * fit) / persp, y: opts.height / 2 - (ry * fit) / persp, z: rz };
}
