import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BIG_IMAGE_MAX_CHARS,
  PLANT_PRODUCTION_STAGES_ORDERED,
  bodyPhotoUploadSchema,
  calculateGarmentUnitPrice,
  garmentCreateSchema,
  getVolumeDiscountPct,
  mapStageToLegacyStatus,
} from '../src/index.ts';

const USER_ID = '11111111-1111-4111-8111-111111111111';

test('CAPA1: límite de imágenes alineado a 50 MB (52.428.800 chars)', () => {
  assert.equal(BIG_IMAGE_MAX_CHARS, 50 * 1024 * 1024);
  // 40M chars superaba el tope viejo (35M) y debe pasar ahora.
  const big = `data:image/png;base64,${'A'.repeat(40_000_000)}`;
  const parsed = garmentCreateSchema.safeParse({
    slug: 'prenda-auditoria-big',
    name: 'Prenda Auditoría Big',
    category: 'CAMISETA',
    baseProductionCost: 6.56,
    baseMarginPct: 32,
    baseSalePrice: 8.65,
    baseTimeMinutes: 27,
    sewingMinutes: 9,
    finishingMinutes: 18,
    imageUrl: big,
  });
  assert.equal(parsed.success, true);
  // Por encima de 50MB de caracteres debe fallar.
  const tooBig = `data:image/png;base64,${'A'.repeat(53_000_000)}`;
  assert.equal(
    garmentCreateSchema.safeParse({
      slug: 'prenda-auditoria-big',
      name: 'Prenda Auditoría Big',
      category: 'CAMISETA',
      baseProductionCost: 6.56,
      baseMarginPct: 32,
      baseSalePrice: 8.65,
      baseTimeMinutes: 27,
      sewingMinutes: 9,
      finishingMinutes: 18,
      imageUrl: tooBig,
    }).success,
    false,
  );
  // Foto de cuerpo completo también acotada al mismo tope.
  assert.equal(
    bodyPhotoUploadSchema.safeParse({ userId: USER_ID, fullBodyPhotoBase64: 'x'.repeat(120) })
      .success,
    true,
  );
});

test('CAPA1: mapStageToLegacyStatus cubre las 11 etapas oficiales', () => {
  assert.equal(PLANT_PRODUCTION_STAGES_ORDERED.length, 11);
  for (const stage of PLANT_PRODUCTION_STAGES_ORDERED) {
    const legacy = mapStageToLegacyStatus(stage);
    assert.ok(typeof legacy === 'string' && legacy.length > 0);
  }
  assert.equal(mapStageToLegacyStatus('11_EMPAQUE_DESPACHO'), 'DESPACHADO');
  assert.equal(mapStageToLegacyStatus('1_DISENO_ARTE'), 'EN_COLA');
  assert.equal(mapStageToLegacyStatus('6_COSTURA_ARMADO'), 'EN_COSTURA');
});

test('CAPA1: precios base y logos extra del motor compartido', () => {
  const tee = calculateGarmentUnitPrice(
    { category: 'CAMISETA', baseSalePrice: 8.65, baseTimeMinutes: 27 },
    1,
  );
  assert.equal(tee.unitPrice, 8.65);
  assert.equal(tee.extraMachineMinutes, 0);
  const tee3 = calculateGarmentUnitPrice(
    { category: 'CAMISETA', baseSalePrice: 8.65, baseTimeMinutes: 27 },
    3,
  );
  assert.equal(tee3.unitPrice, 11.15);
  assert.equal(tee3.extraPrintCost, 2.5);
  assert.equal(tee3.extraMachineMinutes, 8);
});

test('CAPA1: descuentos por volumen en los bordes oficiales', () => {
  assert.equal(getVolumeDiscountPct(5), 0);
  assert.equal(getVolumeDiscountPct(6), 5);
  assert.equal(getVolumeDiscountPct(12), 5);
  assert.equal(getVolumeDiscountPct(13), 12);
  assert.equal(getVolumeDiscountPct(50), 12);
  assert.equal(getVolumeDiscountPct(51), 20);
  assert.equal(getVolumeDiscountPct(160), 20);
});
