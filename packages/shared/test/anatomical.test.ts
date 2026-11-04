/**
 * Etapa 1: anclas anatómicas anti-solapamiento, CPW y ADN de estilo.
 * Corre con: `pnpm --filter @gumorose/shared test`.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCostPerWear,
  computeStyleDna,
  costPerWearOfItem,
  DEFAULT_WEAR_COUNT,
  isFaceZoneSafe,
  normalizeBodyAnchors,
  topStyleTag,
} from '../src/pricing-engine.js';
import { DEFAULT_BODY_ANCHORS, FACE_PROTECTED_MAX_PCT } from '../src/types.js';
import { bodyAnchorCalibrationSchema, styleShuffleVoteSchema } from '../src/validators.js';

describe('DEFAULT_BODY_ANCHORS (zona facial protegida)', () => {
  it('garantiza shoulderTopPct >= 19.5 fuera de la zona facial 0-19%', () => {
    assert.ok(DEFAULT_BODY_ANCHORS.shoulderTopPct >= 19.5);
    assert.ok(DEFAULT_BODY_ANCHORS.shoulderTopPct >= FACE_PROTECTED_MAX_PCT);
    assert.equal(isFaceZoneSafe(DEFAULT_BODY_ANCHORS), true);
  });

  it('fija torso 56%, cintura 50% y piernas 43% (50% -> 93%)', () => {
    assert.equal(DEFAULT_BODY_ANCHORS.torsoWidthPct, 56);
    assert.equal(DEFAULT_BODY_ANCHORS.waistTopPct, 50);
    assert.equal(DEFAULT_BODY_ANCHORS.legsLengthPct, 43);
    assert.equal(DEFAULT_BODY_ANCHORS.waistTopPct + DEFAULT_BODY_ANCHORS.legsLengthPct, 93);
  });

  it('normalizeBodyAnchors nunca invade la cara', () => {
    const unsafe = normalizeBodyAnchors({ shoulderTopPct: 5 });
    assert.equal(unsafe.shoulderTopPct, 19.5);
    assert.equal(isFaceZoneSafe(unsafe), true);
    const clamped = normalizeBodyAnchors({ torsoWidthPct: 200, waistTopPct: 10 });
    assert.equal(clamped.torsoWidthPct, 80);
    assert.equal(clamped.waistTopPct, 42);
  });

  it('el esquema zod rechaza hombros dentro de la zona facial', () => {
    assert.equal(bodyAnchorCalibrationSchema.safeParse(DEFAULT_BODY_ANCHORS).success, true);
    assert.equal(
      bodyAnchorCalibrationSchema.safeParse({ ...DEFAULT_BODY_ANCHORS, shoulderTopPct: 10 }).success,
      false,
    );
  });
});

describe('calculateCostPerWear (Acloset CPW)', () => {
  it('divide precio entre usos', () => {
    assert.equal(calculateCostPerWear(100, 4), 25);
    assert.equal(calculateCostPerWear(8.65, 2), 4.33);
    assert.equal(calculateCostPerWear(112, DEFAULT_WEAR_COUNT), 1);
  });

  it('sin usos el CPW es el precio completo; precio inválido da 0', () => {
    assert.equal(calculateCostPerWear(45, 0), 45);
    assert.equal(calculateCostPerWear(0, 10), 0);
    assert.equal(calculateCostPerWear(-5, 10), 0);
  });

  it('costPerWearOfItem usa el wearCount por defecto 112', () => {
    assert.equal(DEFAULT_WEAR_COUNT, 112);
    assert.equal(costPerWearOfItem({ purchasePriceUsd: 112 }), 1);
    assert.equal(costPerWearOfItem({ purchasePriceUsd: 56, wearCount: 28 }), 2);
    assert.equal(costPerWearOfItem({}, 112), 1);
  });
});

describe('Style Shuffle ADN (Stitch Fix)', () => {
  it('calcula porcentajes solo con votos positivos', () => {
    const dna = computeStyleDna([
      { itemId: 'a', liked: true, styleTag: 'Urbano Andino', timestamp: '2026-01-01T00:00:00.000Z' },
      { itemId: 'b', liked: true, styleTag: 'Urbano Andino', timestamp: '2026-01-01T00:00:00.000Z' },
      { itemId: 'c', liked: true, styleTag: 'Urbano Andino', timestamp: '2026-01-01T00:00:00.000Z' },
      { itemId: 'd', liked: true, styleTag: 'Ejecutivo Minimalista', timestamp: '2026-01-01T00:00:00.000Z' },
      { itemId: 'e', liked: false, styleTag: 'Casual Costa', timestamp: '2026-01-01T00:00:00.000Z' },
    ]);
    assert.deepEqual(dna, { 'Urbano Andino': 75, 'Ejecutivo Minimalista': 25 });
    assert.equal(topStyleTag(dna), 'Urbano Andino');
  });

  it('sin votos positivos el ADN queda vacío y el esquema valida el voto', () => {
    assert.deepEqual(computeStyleDna([]), {});
    assert.equal(topStyleTag({}), null);
    assert.equal(
      styleShuffleVoteSchema.safeParse({
        itemId: 'x',
        liked: true,
        styleTag: 'Urbano Andino',
        timestamp: '2026-01-01T00:00:00.000Z',
      }).success,
      true,
    );
  });
});
