import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { UserClosetItem } from '@gumorose/shared';
import {
  closetSummaryOf,
  colorDnaOf,
  outfitHarmonyScore,
  packingGapFor,
} from '../src/data/mobile.ts';

function item(partial: Partial<UserClosetItem>): UserClosetItem {
  return {
    id: partial.id ?? 'i1',
    userId: 'u1',
    category: partial.category ?? 'SUPERIOR_CAMISETA',
    sourceType: partial.sourceType ?? 'COMPRADO_GUMOROSE',
    name: partial.name ?? 'Prenda',
    colorHex: partial.colorHex ?? '#1C1917',
    warmthLevel: partial.warmthLevel ?? 'TEMPLADO',
    ...partial,
  };
}

test('closetSummaryOf: CPW promedio usa puestas reales', () => {
  const summary = closetSummaryOf([
    { priceUsd: 8.65, wears: 50 },
    { priceUsd: 24.5, wears: 10 },
  ]);
  assert.equal(summary.count, 2);
  assert.equal(summary.valueUsd, 33.15);
  assert.equal(summary.avgCpw, 1.31);
});

test('outfitHarmonyScore: look cálido en Sierra fría supera a look fresco', () => {
  const warm = outfitHarmonyScore(
    [
      item({ category: 'SUPERIOR_CAMISETA', warmthLevel: 'CALIDO', colorHex: '#1C1917' }),
      item({ category: 'INFERIOR_PANTALON', warmthLevel: 'TEMPLADO', colorHex: '#213A5C' }),
    ],
    'SIERRA',
    10,
  );
  const fresh = outfitHarmonyScore(
    [
      item({ category: 'SUPERIOR_CAMISETA', warmthLevel: 'FRESCO', colorHex: '#F2B8C6' }),
      item({ category: 'INFERIOR_PANTALON', warmthLevel: 'FRESCO', colorHex: '#3FBFB0' }),
    ],
    'SIERRA',
    10,
  );
  assert.ok(warm > fresh, `warm=${warm} fresh=${fresh}`);
  assert.equal(outfitHarmonyScore([], 'SIERRA', 10), 0);
});

test('packingGapFor: detecta el hueco clave por destino', () => {
  const pants = item({ category: 'INFERIOR_PANTALON' });
  const top = item({ category: 'SUPERIOR_CAMISETA' });
  assert.equal(packingGapFor('SIERRA', [top, pants])?.missingCategory, 'ABRIGO');
  assert.equal(packingGapFor('COSTA', [top, pants])?.missingCategory, 'ACCESORIO');
  assert.equal(packingGapFor('COSTA', [top])?.missingCategory, 'INFERIOR_PANTALON');
});

test('colorDnaOf: ordena por participación descendente', () => {
  const dna = colorDnaOf([
    item({ colorHex: '#000000' }),
    item({ id: 'i2', colorHex: '#000000' }),
    item({ id: 'i3', colorHex: '#FFFFFF' }),
  ]);
  assert.equal(dna[0]?.hex, '#000000');
  assert.equal(dna[0]?.pct, 67);
});
