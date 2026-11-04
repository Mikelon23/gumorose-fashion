/**
 * Suite permanente del Motor 3D Táctil Gumorose (apps/mobile).
 * Buffers puros sin DOM: mallas de las 9 prendas, mapeos del clóset,
 * avatar Dress-Me, atlas UV curvo y rasterizador software con
 * Z-buffer en modos estudio y transparente (foto real).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { GarmentCategory, GarmentVisualVariant, UserClosetItem } from '@gumorose/shared';
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
  LIGHT_PRESETS,
  applyTurntableDrag,
  clampCamera,
  clampPitchDeg,
  createTurntableCamera,
  type MeshData,
} from '../src/components/engine3d/types3d';
import {
  buildDressedAvatarScene,
  buildTexturedGarment,
  meshSpecForClosetItem,
  subjectLayerBoxMobile,
} from '../src/components/engine3d/MobileCloth3DEngine';
import { detectFramingFromAspect } from '../src/components/AnatomicalTryOnStage';

function assertValidMesh(mesh: MeshData, label: string): void {
  const vertices = mesh.positions.length / 3;
  assert.ok(vertices > 100, `${label}: volumen real (${vertices} vértices)`);
  assert.equal(mesh.normals.length, mesh.positions.length, `${label}: normales por vértice`);
  assert.equal(mesh.uvs.length, vertices * 2, `${label}: UV por vértice`);
  assert.ok(mesh.indices.length >= 300 && mesh.indices.length % 3 === 0, `${label}: triángulos cerrados`);
  let maxIndex = 0;
  for (const idx of mesh.indices) if (idx > maxIndex) maxIndex = idx;
  assert.ok(maxIndex < vertices, `${label}: índices en rango`);
  for (let i = 0; i < mesh.positions.length; i += 1) assert.ok(Number.isFinite(mesh.positions[i]!), `${label}: posición finita`);
  for (let i = 0; i < mesh.uvs.length; i += 1) assert.ok(mesh.uvs[i]! >= -0.001 && mesh.uvs[i]! <= 1.001, `${label}: UV en [0,1]`);
  const [minX, minY, minZ, maxX, maxY, maxZ] = mesh.bounds;
  assert.ok(maxX > minX && maxY > minY && maxZ > minZ, `${label}: bounds 3D`);
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

test('las 9 prendas del catálogo generan mallas 3D cerradas en móvil', () => {
  for (const g of NINE_GARMENTS) assertValidMesh(buildGarmentMesh(g.category, g.variant), g.label);
  assert.equal(fabricKindFor('POLO'), 'PIQUE');
  assert.equal(fabricKindFor('CAMISETA', 'HOODIE'), 'FELPA');
});

function closetItem(partial: Partial<UserClosetItem>): UserClosetItem {
  return {
    id: 'c1',
    userId: 'u1',
    category: 'SUPERIOR_CAMISETA',
    sourceType: 'PLANT_PURCHASE',
    name: 'Prenda',
    colorHex: '#C86D51',
    warmthLevel: 'TEMPLADO',
    ...partial,
  } as UserClosetItem;
}

test('meshSpecForClosetItem mapea el clóset a mallas 3D correctas', () => {
  assert.equal(meshSpecForClosetItem(closetItem({ name: 'Camiseta Pro' })).variant, 'CAMISETA');
  assert.equal(meshSpecForClosetItem(closetItem({ name: 'Polo Ejecutivo' })).variant, 'POLO');
  assert.equal(meshSpecForClosetItem(closetItem({ category: 'SUPERIOR_CAMISA', name: 'Camisa Oxford' })).category, 'CAMISA');
  assert.equal(meshSpecForClosetItem(closetItem({ category: 'INFERIOR_PANTALON', name: 'Cargo Chimborazo' })).variant, 'CARGO');
  assert.equal(meshSpecForClosetItem(closetItem({ category: 'INFERIOR_PANTALON', name: 'Jogger Deportivo' })).variant, 'JOGGER');
  assert.equal(meshSpecForClosetItem(closetItem({ category: 'INFERIOR_PANTALON', name: 'Chino Sastre' })).variant, 'CHINO');
  assert.equal(meshSpecForClosetItem(closetItem({ category: 'ABRIGO', name: 'Hoodie Térmico' })).variant, 'HOODIE');
  assert.equal(meshSpecForClosetItem(closetItem({ category: 'ACCESORIO', name: 'Gorra Bordada' })).variant, 'GORRA');
});

test('el avatar Dress-Me viste maniquí + superior + pantalón + gorra y rasteriza', () => {
  const scene = buildDressedAvatarScene({
    top: meshSpecForClosetItem(closetItem({ name: 'Camiseta Pro' })),
    pants: meshSpecForClosetItem(closetItem({ category: 'INFERIOR_PANTALON', name: 'Chino Sastre' })),
    cap: meshSpecForClosetItem(closetItem({ category: 'ACCESORIO', name: 'Gorra Bordada' })),
  });
  assert.equal(scene.length, 4, 'maniquí + 3 prendas en escena');
  const frame = renderSceneToBuffer({
    width: 200,
    height: 280,
    meshes: scene,
    camera: { yawDeg: 15, pitchDeg: 6, zoom: 1 },
    light: LIGHT_PRESETS.SIERRA,
    floorY: -0.02,
  });
  assert.ok(frame.coveredPixels > 2500, `avatar vestido visible (${frame.coveredPixels}px)`);
  const mannequin = buildMannequinMesh();
  assert.ok(mannequin.bounds[4] - mannequin.bounds[1] > (mannequin.bounds[3] - mannequin.bounds[0]) * 1.6, 'proporción humana vertical');
});

test('el modo transparente superpone la prenda sobre la foto sin fondo', () => {
  const spec = meshSpecForClosetItem(closetItem({ name: 'Camiseta Pro' }));
  const frame = renderSceneToBuffer({
    width: 200,
    height: 240,
    meshes: [buildTexturedGarment(spec, 256)],
    camera: { yawDeg: 0, pitchDeg: 5, zoom: 1 },
    light: LIGHT_PRESETS.SIERRA,
    transparent: true,
  });
  assert.ok(frame.coveredPixels > 1200, `prenda visible (${frame.coveredPixels}px)`);
  assert.equal(frame.data[3], 0, 'esquina con alfa 0 (foto visible debajo)');
  // Un píxel cubierto central tiene alfa opaco.
  let opaque = 0;
  for (let i = 3; i < frame.data.length; i += 4) if (frame.data[i] === 255) opaque += 1;
  assert.ok(opaque > 1200, 'superficie de la prenda opaca sobre la foto');
});

test('el atlas UV móvil curva logos por zona con acabado VINIL brillante', () => {
  const centro = logoCenterUV({ x: 100, y: 90, width: 60, height: 60 }, 'FRONTAL');
  assert.ok(Math.abs(centro.u - 0.27) < 0.01, 'frente u≈0.27');
  const espalda = logoCenterUV({ x: 100, y: 90, width: 60, height: 60 }, 'TRASERA');
  assert.ok(Math.abs(espalda.u - 0.52) < 0.01, 'espalda u≈0.52');
  const manga = logoToUVRect({ x: 180, y: 60, width: 36, height: 36 }, 'FRONTAL');
  assert.ok((manga.u0 + manga.u1) / 2 > 0.8, 'manga derecha u≈0.84');
  const atlas = composeAtlasTexture({
    fabricHex: '#FAF7F2',
    fabricKind: 'JERSEY',
    size: 256,
    logos: [{ uid: 'l1', x: 100, y: 90, width: 60, height: 60, rotation: 0, technique: 'VINIL', tintHex: '#141413' }],
  });
  const px = Math.floor(centro.u * atlas.width);
  const py = Math.floor(centro.v * atlas.height);
  assert.ok(atlas.gloss[py * atlas.width + px]! > 100, 'vinil con brillo especular en el atlas');
});

test('la zona facial se protege en silencio: hombros >= 19.5% siempre', () => {
  const anchors = {
    framing: 'FULL_BODY' as const,
    shoulderTopPct: 12,
    torsoWidthPct: 46,
    waistTopPct: 52,
    legsLengthPct: 44,
    lowerBodyPreset: 'CHINO' as const,
  };
  const topBox = subjectLayerBoxMobile(meshSpecForClosetItem(closetItem({ name: 'Camiseta Pro' })), anchors);
  assert.ok(topBox.topPct >= 19.5, `topPct ${topBox.topPct} respeta la cara`);
  const pantsBox = subjectLayerBoxMobile(
    meshSpecForClosetItem(closetItem({ category: 'INFERIOR_PANTALON', name: 'Chino Sastre' })),
    anchors,
  );
  assert.equal(pantsBox.topPct, anchors.waistTopPct, 'pantalón ancla en cintura');
  const capBox = subjectLayerBoxMobile(
    meshSpecForClosetItem(closetItem({ category: 'ACCESORIO', name: 'Gorra Bordada' })),
    anchors,
  );
  assert.equal(capBox.topPct, 3, 'gorra sobre la frente');
  assert.equal(detectFramingFromAspect(1.2), 'HALF_BODY_EXTENDED');
  assert.equal(detectFramingFromAspect(1.8), 'FULL_BODY');
});

test('el render de estudio no contiene textos rojos ni fondo de papel', () => {
  const spec = meshSpecForClosetItem(closetItem({ name: 'Hoodie Térmico', category: 'ABRIGO' }));
  const frame = renderSceneToBuffer({
    width: 200,
    height: 240,
    meshes: [buildTexturedGarment(spec, 256)],
    camera: { yawDeg: 0, pitchDeg: 8, zoom: 1 },
    light: LIGHT_PRESETS.SIERRA,
    floorY: -0.04,
  });
  assert.ok(frame.coveredPixels > 1500, 'hoodie visible');
  let pureRed = 0;
  for (let i = 0; i < frame.data.length; i += 4) {
    if (frame.data[i] === 255 && frame.data[i + 1] === 0 && frame.data[i + 2] === 0) pureRed += 1;
  }
  assert.equal(pureRed, 0, 'cero píxeles de texto rojo');
  const [br, bg, bb] = [frame.data[0]!, frame.data[1]!, frame.data[2]!];
  assert.ok(Math.abs(br - 250) <= 4 && Math.abs(bg - 247) <= 4 && Math.abs(bb - 242) <= 4, 'fondo alabastro de estudio');
});

test('la manga móvil nace soldada en el hombro y cae hacia abajo a 25-28 grados', () => {
  assert.ok(SLEEVE_DROP_ANGLE_DEG >= 25 && SLEEVE_DROP_ANGLE_DEG <= 28, 'caída en rango');
  const mesh = buildGarmentMesh('CAMISETA', 'CAMISETA');
  const centroid = (uMin: number, uMax: number, vMin: number, vMax: number): [number, number] => {
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
    assert.ok(n > 3, 'anillo de manga localizado');
    return [sx / n, sy / n];
  };
  for (const [uMin, uMax] of [[0.55, 0.705], [0.765, 0.92]] as const) {
    const root = centroid(uMin, uMax, 0.09, 0.13);
    const tip = centroid(uMin, uMax, 0.3, 0.37);
    const angleDeg = (Math.atan2(Math.abs(tip[0] - root[0]), Math.abs(root[1] - tip[1])) * 180) / Math.PI;
    assert.ok(tip[1] < root[1] - 0.15, 'punta por debajo de la raíz');
    assert.ok(angleDeg >= 24 && angleDeg <= 29, `eje a ${angleDeg.toFixed(1)} grados`);
    assert.ok(Math.abs(root[0]) < 0.4, 'raíz dentro del torso');
  }
});

test('el maniquí showroom móvil es marfil #EDE6DC con cabeza ovoide y brazos a 22 grados', () => {
  assert.equal(MANNEQUIN_ALABASTER_HEX, '#EDE6DC');
  assert.equal(MANNEQUIN_ARM_ANGLE_DEG, 22);
  const mannequin = buildMannequinMesh();
  assert.ok(mannequin.bounds[4] > 1.9 && mannequin.bounds[4] < 2.02, 'cabeza ovoide escultórica');
});

test('turntable móvil: pitch -4..6, zoom hasta 3.5 y sin Z-fighting en pantalón', () => {
  assert.equal(clampPitchDeg(-30), -4);
  assert.equal(clampPitchDeg(30), 6);
  assert.equal(createTurntableCamera().pitchDeg, 2);
  const dragged = applyTurntableDrag({ yawDeg: 0, pitchDeg: 2, zoom: 1 }, 80, 400);
  assert.equal(dragged.pitchDeg, 2);
  assert.equal(clampCamera({ yawDeg: 0, pitchDeg: 2, zoom: 9 }).zoom, 3.5);
  const dressed = buildDressedMannequinMesh({ hasTop: true, hasPants: true });
  for (let v = 0; v < dressed.positions.length / 3; v += 1) {
    const y = dressed.positions[v * 3 + 1]!;
    assert.ok(y < 0.3 || y > 0.9, `sin cuerpo cubierto a y=${y.toFixed(2)}`);
  }
  assert.ok(Math.abs(garmentRadiusClearance(0.065) - 0.0902) < 1e-9);
});

test('el estudio móvil no inclina tarjetas ni botones con CSS 3D', () => {
  for (const rel of ['../src/screens/MobileCustomizerScreen.tsx', '../src/components/MobileCanvas.tsx', '../src/components/engine3d/MobileEngineViewport.tsx']) {
    const src = readFileSync(new URL(rel, import.meta.url), 'utf8');
    assert.ok(!src.includes('perspective:'), `${rel}: sin perspective CSS`);
    assert.ok(!src.includes('rotateX('), `${rel}: sin rotateX CSS`);
    assert.ok(!src.includes('rotateY('), `${rel}: sin rotateY CSS`);
  }
  const canvas = readFileSync(new URL('../src/components/MobileCanvas.tsx', import.meta.url), 'utf8');
  assert.ok(canvas.includes('Con Maniquí Sastre 3D'), 'selector con maniquí en el visor móvil');
  assert.ok(canvas.includes('Solo Prenda Flotante (Ghost 3D)'), 'selector ghost en el visor móvil');
});
