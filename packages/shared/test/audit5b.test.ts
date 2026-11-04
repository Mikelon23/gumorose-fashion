/**
 * Test mantenido de la auditoría 5B (estudio volumétrico + Meta AI live).
 * Fija la variante visual por modelo y la configuración en caliente.
 * Corre con: `pnpm --filter @gumorose/shared test` (node:test + tsx).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  META_MODEL_OPTIONS,
  aiConfigUpdateSchema,
  garmentCreateSchema,
} from '../src/validators.js';

function garment(visualVariant?: string) {
  return {
    slug: 'pantalon-cargo-urbano-chimborazo',
    name: 'Pantalón Cargo Urbano Chimborazo',
    category: 'PANTALON',
    baseProductionCost: 16.54,
    baseMarginPct: 30,
    baseSalePrice: 21.5,
    baseTimeMinutes: 50,
    sewingMinutes: 24,
    finishingMinutes: 26,
    visualVariant,
  };
}

describe('auditoría 5B: variantes volumétricas y Meta AI', () => {
  it('la prenda acepta su molde visual (CARGO/JOGGER/HOODIE/GORRA)', () => {
    for (const variant of ['CARGO', 'JOGGER', 'HOODIE', 'GORRA', 'CHINO']) {
      const parsed = garmentCreateSchema.safeParse(garment(variant));
      assert.equal(parsed.success, true, variant);
    }
    assert.equal(garmentCreateSchema.safeParse(garment('SOMBRERO')).success, false);
  });

  it('los modelos Meta AI oficiales son los 3 esperados', () => {
    assert.deepEqual([...META_MODEL_OPTIONS], [
      'muse-wonder-1.0',
      'muse-spark-1.3',
      'meta-models/muse-spark-open-1026',
    ]);
  });

  it('la config Meta AI acepta clave/base/modelo y rechaza modelos ajenos', () => {
    const ok = aiConfigUpdateSchema.safeParse({
      apiKey: 'sk-test-1234',
      baseUrl: 'https://inference.example.com/v1',
      model: 'muse-spark-1.3',
    });
    assert.equal(ok.success, true);
    assert.equal(aiConfigUpdateSchema.safeParse({ model: 'gpt-4o' }).success, false);
  });
});
