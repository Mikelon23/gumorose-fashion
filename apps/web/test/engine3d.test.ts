/**
 * Suite permanente del Gumorose 3D Cloth & UV Engine (apps/web).
 * Todo opera sobre buffers puros (sin DOM): mallas, atlas UV y el
 * rasterizador software con Z-buffer que garantiza jsdom/CI sin GPU.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { GarmentCategory, GarmentVisualVariant } from '@gumorose/shared';
import {
  MANNEQUIN_ALABASTER_HEX,
  MANNEQUIN_ARM_ANGLE_DEG,
  SLEEVE_DROP_ANGLE_DEG,
  buildDressedMannequinMesh,
  buildGarmentMesh,
  buildMannequinMesh,
  fabricKindFor,
  garmentRadiusClearance,
} from '../src/components/engine3d/ClothMeshGenerator3D';
import { composeAtlasTexture, logoCenterUV, logoToUVRect } from '../src/components/engine3d/UvTextureComposer';
import { renderSceneToBuffer } from '../src/components/engine3d/SoftwareRenderer3D';
import {
  CAMERA_ZOOM_MAX,
  CAMERA_ZOOM_MIN,
  LIGHT_PRESETS,
  applyTurntableDrag,
  clampCamera,
  clampPitchDeg,
  clampZoom,
  createTurntableCamera,
  mergeMeshes,
  type MeshData,
} from '../src/components/engine3d/types3d';
import { detectBodyFraming, subjectLayerBox } from '../src/components/GarmentCanvas';

function assertValidMesh(mesh: MeshData, label: string): void {
  const vertices = mesh.positions.length / 3;
  assert.ok(vertices > 100, `${label}: malla con volumen real (${vertices} vértices)`);
  assert.equal(mesh.normals.length, mesh.positions.length, `${label}: normales por vértice`);
  assert.equal(mesh.uvs.length, vertices * 2, `${label}: UV por vértice`);
  assert.ok(mesh.indices.length >= 300 && mesh.indices.length % 3 === 0, `${label}: triángulos cerrados`);
  let maxIndex = 0;
  for (const idx of mesh.indices) {
    if (idx > maxIndex) maxIndex = idx;
    assert.ok(Number.isFinite(idx), `${label}: índice finito`);
  }
  assert.ok(maxIndex < vertices, `${label}: índices dentro de rango`);
  for (let i = 0; i < mesh.positions.length; i += 1) {
    assert.ok(Number.isFinite(mesh.positions[i]!), `${label}: posición finita`);
  }
  for (let i = 0; i < mesh.uvs.length; i += 1) {
    assert.ok(mesh.uvs[i]! >= -0.001 && mesh.uvs[i]! <= 1.001, `${label}: UV en [0,1]`);
  }
  // Normales aproximadamente unitarias (muestreo).
  for (let v = 0; v < vertices; v += 37) {
    const len = Math.hypot(mesh.normals[v * 3]!, mesh.normals[v * 3 + 1]!, mesh.normals[v * 3 + 2]!);
    assert.ok(len > 0.4 && len < 1.6, `${label}: normal suave válida (${len.toFixed(2)})`);
  }
  const [minX, minY, minZ, maxX, maxY, maxZ] = mesh.bounds;
  assert.ok(maxX > minX && maxY > minY && maxZ > minZ, `${label}: bounds con volumen 3D`);
  assert.ok(mesh.spans.length >= 1, `${label}: spans de material`);
}

const NINE_GARMENTS: Array<{ category: GarmentCategory; variant: GarmentVisualVariant; label: string }> = [
  { category: 'CAMISETA', variant: 'CAMISETA', label: 'Camiseta' },
  { category: 'POLO', variant: 'POLO', label: 'Polo' },
  { category: 'CAMISA', variant: 'CAMISA', label: 'Camisa' },
  { category: 'CAMISETA', variant: 'HOODIE', label: 'Hoodie' },
  { category: 'CAMISETA', variant: 'CHAQUETA', label: 'Chaqueta' },
  { category: 'PANTALON', variant: 'CHINO', label: 'Chino' },
  { category: 'PANTALON', variant: 'CARGO', label: 'Cargo' },
  { category: 'PANTALON', variant: 'JOGGER', label: 'Jogger' },
  { category: 'CAMISETA', variant: 'GORRA', label: 'Gorra' },
];

test('las 9 prendas del catálogo generan mallas 3D cerradas y válidas', () => {
  for (const g of NINE_GARMENTS) {
    assertValidMesh(buildGarmentMesh(g.category, g.variant), g.label);
  }
});

test('el maniquí anatómico es de cuerpo completo (más alto que ancho)', () => {
  const mannequin = buildMannequinMesh();
  assertValidMesh(mannequin, 'Maniquí');
  const [minX, minY, , maxX, maxY] = mannequin.bounds;
  assert.ok(maxY - minY > (maxX - minX) * 1.6, 'proporción vertical humana');
});

test('mergeMeshes fusiona prenda + maniquí remapeando índices y UVs', () => {
  const garment = buildGarmentMesh('CAMISETA', 'CAMISETA');
  const mannequin = buildMannequinMesh();
  const merged = mergeMeshes([garment, mannequin]);
  assert.equal(merged.positions.length, garment.positions.length + mannequin.positions.length);
  assert.equal(merged.uvs.length, garment.uvs.length + mannequin.uvs.length);
  assert.equal(merged.indices.length, garment.indices.length + mannequin.indices.length);
  assertValidMesh(merged, 'Escena fusionada');
});

test('fabricKindFor mapea tejidos reales por prenda', () => {
  assert.equal(fabricKindFor('CAMISETA'), 'JERSEY');
  assert.equal(fabricKindFor('POLO'), 'PIQUE');
  assert.equal(fabricKindFor('PANTALON', 'CHINO'), 'SARGA');
  assert.equal(fabricKindFor('CAMISETA', 'HOODIE'), 'FELPA');
});

test('logoToUVRect ubica frente, espalda y mangas en su región del atlas', () => {
  const centro = logoCenterUV({ x: 100, y: 90, width: 60, height: 60 }, 'FRONTAL');
  assert.ok(Math.abs(centro.u - 0.27) < 0.01, `frente u≈0.27 (${centro.u})`);
  const espalda = logoCenterUV({ x: 100, y: 90, width: 60, height: 60 }, 'TRASERA');
  assert.ok(Math.abs(espalda.u - 0.52) < 0.01, `espalda u≈0.52 (${espalda.u})`);
  const mangaIzq = logoCenterUV({ x: 20, y: 60, width: 36, height: 36 }, 'FRONTAL');
  assert.ok(Math.abs(mangaIzq.u - 0.62) < 0.02, `manga izq u≈0.62 (${mangaIzq.u})`);
  const mangaDer = logoCenterUV({ x: 180, y: 60, width: 36, height: 36 }, 'FRONTAL');
  assert.ok(Math.abs(mangaDer.u - 0.84) < 0.02, `manga der u≈0.84 (${mangaDer.u})`);
  for (const rect of [logoToUVRect({ x: 100, y: 90, width: 60, height: 60 }), logoToUVRect({ x: 4, y: 4, width: 30, height: 30 })]) {
    assert.ok(rect.u0 >= -0.05 && rect.u1 <= 1.05 && rect.v0 >= -0.05 && rect.v1 <= 1.05, 'rect UV dentro del atlas');
  }
});

function solidLogoImage(r: number, g: number, b: number): { data: Uint8ClampedArray; width: number; height: number } {
  const width = 16;
  const height = 16;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  return { data, width, height };
}

function atlasPixel(atlas: { data: Uint8ClampedArray; width: number }, u: number, v: number): [number, number, number] {
  const px = Math.max(0, Math.min(atlas.width - 1, Math.floor(u * atlas.width)));
  const py = Math.max(0, Math.min(atlas.width - 1, Math.floor(v * atlas.width)));
  const idx = (py * atlas.width + px) * 4;
  return [atlas.data[idx]!, atlas.data[idx + 1]!, atlas.data[idx + 2]!];
}

test('el atlas UV pinta el color HEX exacto y el logo curvo en su zona', () => {
  const logo = { x: 100, y: 90, width: 60, height: 60 };
  const atlas = composeAtlasTexture({
    fabricHex: '#2F4842',
    fabricKind: 'JERSEY',
    size: 512,
    logos: [{ uid: 'l1', ...logo, rotation: 0, technique: 'SERIGRAFIA', image: solidLogoImage(205, 40, 35) }],
  });
  assert.equal(atlas.width, 512);
  // Zona de espalda sin logo: color de tela (con sombreado de tejido ±16).
  const [fr, fg, fb] = atlasPixel(atlas, 0.52, 0.42);
  assert.ok(Math.abs(fr - 0x2f) <= 18 && Math.abs(fg - 0x48) <= 18 && Math.abs(fb - 0x42) <= 18, 'tela verde salvia en atlas');
  // Centro del logo frontal: tinta del logo visible sobre la tela.
  const center = logoCenterUV(logo, 'FRONTAL');
  const [lr, lg, lb] = atlasPixel(atlas, center.u, center.v);
  assert.ok(lr > 150 && lr > lg + 60, `logo curvo pintado (${lr},${lg},${lb})`);
});

test('VINIL genera brillo especular en el atlas y SERIGRAFIA queda mate', () => {
  const logo = { x: 100, y: 90, width: 60, height: 60 };
  const center = logoCenterUV(logo, 'FRONTAL');
  const sampleGloss = (technique: 'SERIGRAFIA' | 'VINIL'): number => {
    const atlas = composeAtlasTexture({
      fabricHex: '#FAF7F2',
      fabricKind: 'JERSEY',
      size: 256,
      logos: [{ uid: 'l1', ...logo, rotation: 0, technique, tintHex: '#141413' }],
    });
    const px = Math.floor(center.u * atlas.width);
    const py = Math.floor(center.v * atlas.height);
    return atlas.gloss[py * atlas.width + px]!;
  };
  assert.ok(sampleGloss('VINIL') > 100, 'vinil satinado con gloss');
  assert.equal(sampleGloss('SERIGRAFIA'), 0, 'serigrafía mate sin gloss');
});

test('el rasterizador software dibuja la prenda con Z-buffer y fondo de estudio limpio', () => {
  const mesh = buildGarmentMesh('CAMISETA', 'CAMISETA');
  const atlas = composeAtlasTexture({ fabricHex: '#C86D51', fabricKind: 'JERSEY', size: 256 });
  const frame = renderSceneToBuffer({
    width: 200,
    height: 240,
    meshes: [{ mesh, texture: atlas }],
    camera: { yawDeg: 0, pitchDeg: 8, zoom: 1 },
    light: LIGHT_PRESETS.SIERRA,
    floorY: -0.04,
  });
  assert.ok(frame.coveredPixels > 1500, `prenda visible (${frame.coveredPixels}px)`);
  // Esquina superior: fondo de estudio alabastro, jamás cuadrícula ni blanco de papel.
  const [br, bg, bb] = [frame.data[0]!, frame.data[1]!, frame.data[2]!];
  assert.ok(Math.abs(br - 250) <= 4 && Math.abs(bg - 247) <= 4 && Math.abs(bb - 242) <= 4, 'fondo estudio SIERRA');
  // Cero píxeles de texto rojo puro en la prenda limpia.
  let pureRed = 0;
  for (let i = 0; i < frame.data.length; i += 4) {
    if (frame.data[i] === 255 && frame.data[i + 1] === 0 && frame.data[i + 2] === 0) pureRed += 1;
  }
  assert.equal(pureRed, 0, 'sin textos rojos ni guías permanentes');
  // Desde la espalda (180°) la prenda también se rasteriza (logo curvo envuelve).
  const back = renderSceneToBuffer({
    width: 200,
    height: 240,
    meshes: [{ mesh, texture: atlas }],
    camera: { yawDeg: 180, pitchDeg: 8, zoom: 1 },
    light: LIGHT_PRESETS.COSTA,
    floorY: -0.04,
  });
  assert.ok(back.coveredPixels > 1500, `espalda visible (${back.coveredPixels}px)`);
});

test('el maniquí vestido (maniquí + prenda + pantalón) rasteriza como escena completa', () => {
  const mannequin = buildMannequinMesh();
  const top = buildGarmentMesh('CAMISETA', 'CAMISETA');
  const pants = buildGarmentMesh('PANTALON', 'CHINO');
  const atlasTop = composeAtlasTexture({ fabricHex: '#141413', fabricKind: 'JERSEY', size: 256 });
  const atlasPants = composeAtlasTexture({ fabricHex: '#2F4842', fabricKind: 'SARGA', size: 256 });
  const frame = renderSceneToBuffer({
    width: 200,
    height: 280,
    meshes: [
      { mesh: mannequin },
      { mesh: top, texture: atlasTop, transform: { sx: 0.8, sy: 0.6, sz: 0.98, ty: 0.93 } },
      { mesh: pants, texture: atlasPants, transform: { sx: 0.82, sy: 1.3, sz: 0.9, ty: 0.03 } },
    ],
    camera: { yawDeg: 20, pitchDeg: 6, zoom: 1 },
    light: LIGHT_PRESETS.ORIENTE,
    floorY: -0.02,
  });
  assert.ok(frame.coveredPixels > 2500, `avatar vestido visible (${frame.coveredPixels}px)`);
});

test('la zona facial queda protegida en silencio: hombros siempre >= 19.5%', () => {
  const anchors = {
    framing: 'FULL_BODY' as const,
    shoulderTopPct: 12,
    torsoWidthPct: 46,
    waistTopPct: 52,
    legsLengthPct: 44,
    lowerBodyPreset: 'CHINO' as const,
  };
  for (const category of ['CAMISETA', 'POLO', 'CAMISA'] as const) {
    const box = subjectLayerBox(category, anchors);
    assert.ok(box.topPct >= 19.5, `${category}: topPct ${box.topPct} respeta la cara`);
  }
  const pantsBox = subjectLayerBox('PANTALON', anchors, 'CHINO');
  assert.equal(pantsBox.topPct, anchors.waistTopPct, 'pantalón ancla en cintura');
  assert.equal(detectBodyFraming(1.2), 'HALF_BODY_EXTENDED');
  assert.equal(detectBodyFraming(1.8), 'FULL_BODY');
});

function sleeveAxis(mesh: MeshData, side: -1 | 1): { angleDeg: number; root: [number, number]; tip: [number, number] } {
  const uMin = side < 0 ? 0.55 : 0.765;
  const uMax = side < 0 ? 0.705 : 0.92;
  const centroid = (vMax: number, vMin: number): [number, number] => {
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (let v = 0; v < mesh.positions.length / 3; v += 1) {
      const u = mesh.uvs[v * 2]!;
      const vv = mesh.uvs[v * 2 + 1]!;
      if (u < uMin || u > uMax || vv < vMin || vv > vMax) continue;
      sx += mesh.positions[v * 3]!;
      sy += mesh.positions[v * 3 + 1]!;
      n += 1;
    }
    assert.ok(n > 3, 'anillo de manga localizado por UV');
    return [sx / n, sy / n];
  };
  const root = centroid(0.13, 0.09);
  const tip = centroid(0.37, 0.3);
  const angleDeg = (Math.atan2(Math.abs(tip[0] - root[0]), Math.abs(root[1] - tip[1])) * 180) / Math.PI;
  return { angleDeg, root, tip };
}

test('la manga nace soldada en el hombro y cae hacia abajo a 25-28 grados', () => {
  assert.ok(SLEEVE_DROP_ANGLE_DEG >= 25 && SLEEVE_DROP_ANGLE_DEG <= 28, 'constante de caída en rango');
  const mesh = buildGarmentMesh('CAMISETA', 'CAMISETA');
  for (const side of [-1, 1] as const) {
    const axis = sleeveAxis(mesh, side);
    assert.ok(axis.tip[1] < axis.root[1] - 0.15, `manga ${side}: la punta queda por debajo de la raíz`);
    assert.ok(axis.angleDeg >= 24 && axis.angleDeg <= 29, `manga ${side}: eje a ${axis.angleDeg.toFixed(1)} grados`);
    assert.ok(Math.abs(axis.root[0]) < 0.4, `manga ${side}: raíz dentro del torso, no flotante`);
    assert.ok(axis.root[1] > 0.82 && axis.root[1] < 0.96, `manga ${side}: raíz a la altura del hombro`);
  }
});

test('torso, hombros y mangas muestrean el mismo HEX del atlas UV', () => {
  const atlas = composeAtlasTexture({ fabricHex: '#1E3A5F', fabricKind: 'JERSEY', size: 512 });
  const torso = atlasPixel(atlas, 0.27, 0.35);
  const sleeveL = atlasPixel(atlas, 0.627, 0.2);
  const sleeveR = atlasPixel(atlas, 0.842, 0.2);
  for (const [label, px] of [['manga izq', sleeveL], ['manga der', sleeveR]] as const) {
    for (let c = 0; c < 3; c += 1) {
      assert.ok(Math.abs(px[c]! - torso[c]!) <= 22, `${label}: mismo color textil que el torso`);
    }
  }
});

test('el maniquí showroom es marfil #EDE6DC, con cabeza ovoide y brazos a 22 grados', () => {
  assert.equal(MANNEQUIN_ALABASTER_HEX, '#EDE6DC');
  assert.equal(MANNEQUIN_ARM_ANGLE_DEG, 22);
  const mannequin = buildMannequinMesh();
  assert.ok(mannequin.bounds[4] > 1.9 && mannequin.bounds[4] < 2.02, 'cabeza ovoide escultórica');
  assert.ok(mannequin.bounds[1] < 0.05, 'piernas completas hasta el tobillo');
  assert.ok(mannequin.spans.every((s) => s.material === 'skin' || s.material === 'button'), 'acabado uniforme de estudio');
});

test('turntable: pitch bloqueado -4..6, yaw 360 y super-zoom 50..350 sin Z-fighting', () => {
  assert.equal(clampPitchDeg(-42), -4);
  assert.equal(clampPitchDeg(42), 6);
  assert.equal(createTurntableCamera().pitchDeg, 2);
  const dragged = applyTurntableDrag({ yawDeg: 10, pitchDeg: 2, zoom: 1 }, 100, 500);
  assert.equal(dragged.yawDeg, 65);
  assert.equal(dragged.pitchDeg, 2, 'arrastrar hacia abajo nunca tumba el maniquí');
  const safe = clampCamera({ yawDeg: 190, pitchDeg: 99, zoom: 99 });
  assert.equal(safe.yawDeg, -170);
  assert.equal(safe.pitchDeg, 6);
  assert.equal(safe.zoom, CAMERA_ZOOM_MAX);
  assert.equal(CAMERA_ZOOM_MAX, 3.5);
  assert.equal(clampZoom(0.01), CAMERA_ZOOM_MIN);
  assert.equal(CAMERA_ZOOM_MIN, 0.5);

  const tex = composeAtlasTexture({ fabricHex: '#C86D51', fabricKind: 'JERSEY', size: 256 });
  const mesh = buildGarmentMesh('CAMISETA', 'CAMISETA');
  const zoomed = renderSceneToBuffer({
    width: 160, height: 200, meshes: [{ mesh, texture: tex }],
    camera: { yawDeg: 0, pitchDeg: 99, zoom: 3.5 }, light: LIGHT_PRESETS.SIERRA,
  });
  const wide = renderSceneToBuffer({
    width: 160, height: 200, meshes: [{ mesh, texture: tex }],
    camera: { yawDeg: 0, pitchDeg: 2, zoom: 0.5 }, light: LIGHT_PRESETS.SIERRA,
  });
  assert.ok(zoomed.coveredPixels > wide.coveredPixels, 'el zoom 350% acerca de verdad');

  // Cero Z-fighting: vestido, el cuerpo no existe bajo torso ni muslos.
  const dressed = buildDressedMannequinMesh({ hasTop: true, hasPants: true });
  for (let v = 0; v < dressed.positions.length / 3; v += 1) {
    const y = dressed.positions[v * 3 + 1]!;
    assert.ok(y < 0.3 || y > 0.9, `sin cuerpo cubierto a y=${y.toFixed(2)}`);
  }
  assert.ok(Math.abs(garmentRadiusClearance(0.065) - 0.0902) < 1e-9, 'r_garment = r_body*1.08+0.02');
  const pants = buildGarmentMesh('PANTALON', 'CHINO');
  let minDistance = Number.POSITIVE_INFINITY;
  for (let v = 0; v < dressed.positions.length / 3; v += 1) {
    const y = dressed.positions[v * 3 + 1]!;
    if (y > 0.22) continue;
    const dx0 = dressed.positions[v * 3]!;
    const dz0 = dressed.positions[v * 3 + 2]!;
    for (let p = 0; p < pants.positions.length / 3; p += 1) {
      const px = pants.positions[p * 3]! * 0.95;
      const py = pants.positions[p * 3 + 1]! * 1.3 + 0.03;
      const pz = pants.positions[p * 3 + 2]! * 1.02;
      if (Math.abs(py - y) > 0.08) continue;
      minDistance = Math.min(minDistance, Math.hypot(dx0 - px, dz0 - pz));
    }
  }
  assert.ok(minDistance > 0.004, `tobillo y pantalón separados ${minDistance.toFixed(4)} (sin superficies coincidentes)`);
});

test('el estudio web no inclina la tarjeta ni los botones con CSS 3D', () => {
  for (const rel of ['../src/pages/CustomizerStudioView.tsx', '../src/components/GarmentCanvas.tsx', '../src/components/engine3d/EngineViewport.tsx']) {
    const src = readFileSync(new URL(rel, import.meta.url), 'utf8');
    assert.ok(!src.includes('perspective:'), `${rel}: sin perspective CSS`);
    assert.ok(!src.includes('rotateX('), `${rel}: sin rotateX CSS`);
    assert.ok(!src.includes('rotateY('), `${rel}: sin rotateY CSS`);
  }
  const studio = readFileSync(new URL('../src/pages/CustomizerStudioView.tsx', import.meta.url), 'utf8');
  assert.ok(studio.includes('Con Maniquí Sastre 3D') || studio.includes('displayMode'), 'selector de maniquí en el estudio');
});
