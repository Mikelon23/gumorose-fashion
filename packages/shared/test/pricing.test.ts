/**
 * Test mantenido del motor industrial Gumorose.
 * Fija las fórmulas de planta, descuentos, envíos y reglas climáticas.
 * Corre con: `pnpm --filter @gumorose/shared test` (node:test + tsx).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  advancePlantStage,
  BASE_PRODUCTION_COST,
  BASE_SALE_PRICE,
  BASE_TIME_MINUTES,
  buildLedgerEntryForOrder,
  calculateFabricMetersForBox,
  calculateFinancialBreakdown,
  calculateGarmentUnitPrice,
  calculatePaymentSplit,
  calculateProductionAndDeliveryTime,
  getClimateStylingRules,
  getNextPlantStage,
  getVolumeDiscountPct,
  isAnticipoEligible,
  mapStageToLegacyStatus,
  resolvePaymentMode,
  round2,
} from '../src/pricing-engine.js';
import { PLANT_PRODUCTION_STAGES_ORDERED } from '../src/types.js';
import type {
  GarmentCategory,
  GarmentTemplate,
  MlUserPreferenceRecord,
  PlantProductionStage,
} from '../src/types.js';
import {
  buildSriAccessKey,
  computeMlGarmentAffinity,
  computeRecommendedSize,
  parseSriAccessKey,
  sriModulo11CheckDigit,
  validateSriAccessKey,
} from '../src/pricing-engine.js';
import {
  validateAge,
  validateBodyMeasures,
  validateEcuadorianCedula,
  validateEcuadorianId,
  validateEcuadorianPhone,
  validateEcuadorianRuc,
} from '../src/validators.js';

function garment(category: GarmentCategory, price: number, time: number) {
  return { id: `test-${category}`, category, baseSalePrice: price, baseTimeMinutes: time };
}

describe('fórmulas de planta Riobamba', () => {
  it('camiseta base: costo 6.56 + 32% ≈ 8.65 comercial, 27 min', () => {
    assert.equal(BASE_PRODUCTION_COST.CAMISETA, 6.56);
    assert.equal(BASE_SALE_PRICE.CAMISETA, 8.65);
    // El precio comercial 8.65 es el valor autoritativo de catálogo: la
    // derivación flotante (6.56*1.32=8.6592→8.66) solo lo aproxima al centavo.
    assert.ok(Math.abs(6.56 * 1.32 - BASE_SALE_PRICE.CAMISETA) < 0.015);
    assert.equal(BASE_TIME_MINUTES.CAMISETA, 27);
    const p = calculateGarmentUnitPrice(garment('CAMISETA', 8.65, 27), 1);
    assert.equal(p.unitPrice, 8.65);
    assert.equal(p.extraMachineMinutes, 0);
  });

  it('camisa base: costo 12.85 + 30% = 16.71, 44 min', () => {
    assert.equal(round2(12.85 * 1.3), BASE_SALE_PRICE.CAMISA);
    assert.equal(BASE_TIME_MINUTES.CAMISA, 44);
    const p = calculateGarmentUnitPrice(garment('CAMISA', 16.71, 44), 1);
    assert.equal(p.unitPrice, 16.71);
  });

  it('pantalón base: costo 14.50 + 30% = 18.85, 44 min', () => {
    assert.equal(BASE_SALE_PRICE.PANTALON, 18.85);
    assert.ok(Math.abs(14.5 * 1.3 - BASE_SALE_PRICE.PANTALON) < 0.015);
    assert.equal(BASE_TIME_MINUTES.PANTALON, 44);
  });

  it('cada logo extra suma $1.25 y 4 min (el primero va incluido)', () => {
    const p = calculateGarmentUnitPrice(garment('CAMISETA', 8.65, 27), 3);
    assert.equal(p.extraLogos, 2);
    assert.equal(p.extraPrintCost, 2.5);
    assert.equal(p.extraMachineMinutes, 8);
    assert.equal(p.unitPrice, 11.15);
  });
});

describe('descuento por volumen de la Caja Gumorose', () => {
  it('aplica los tramos 5/12/20 en los bordes exactos', () => {
    assert.deepEqual(
      [5, 6, 12, 13, 50, 51, 160, 161].map(getVolumeDiscountPct),
      [0, 5, 5, 12, 12, 20, 20, 20],
    );
  });
});

describe('producción y envío por región', () => {
  it('reparte la carga entre 14 estaciones y suma envío SIERRA', () => {
    const quote = calculateProductionAndDeliveryTime(
      [
        {
          designId: '00000000-0000-4000-8000-000000000001',
          garment: garment('CAMISETA', 8.65, 27),
          quantity: 10,
          logosCount: 3,
        },
        {
          designId: '00000000-0000-4000-8000-000000000002',
          garment: garment('CAMISA', 16.71, 44),
          quantity: 4,
          logosCount: 1,
        },
      ],
      120,
      'SIERRA',
    );
    assert.equal(quote.totalUnits, 14);
    assert.equal(quote.parallelStations, 14);
    assert.equal(quote.subtotalUsd, 178.34);
    assert.equal(quote.discountPct, 12);
    assert.equal(quote.totalUsd, 160.44);
    assert.equal(quote.shippingUsd, 3.5);
    assert.deepEqual([quote.deliveryDaysMin, quote.deliveryDaysMax], [1, 2]);
  });

  it('COSTA y ORIENTE cambian costo y días de envío', () => {
    const items = [
      {
        designId: '00000000-0000-4000-8000-000000000001',
        garment: garment('CAMISETA', 8.65, 27),
        quantity: 2,
        logosCount: 0,
      },
    ];
    const costa = calculateProductionAndDeliveryTime(items, 0, 'COSTA');
    const oriente = calculateProductionAndDeliveryTime(items, 0, 'ORIENTE');
    assert.equal(costa.shippingUsd, 4.5);
    assert.deepEqual([costa.deliveryDaysMin, costa.deliveryDaysMax], [2, 2]);
    assert.equal(oriente.shippingUsd, 5.5);
    assert.deepEqual([oriente.deliveryDaysMin, oriente.deliveryDaysMax], [2, 3]);
  });
});

describe('getClimateStylingRules', () => {
  it('Sierra fría pide CALIDO con abrigo primero', () => {
    const rules = getClimateStylingRules('SIERRA', 8);
    assert.equal(rules.warmthLevels[0], 'CALIDO');
    assert.equal(rules.categories[0], 'ABRIGO');
  });

  it('Costa calurosa pide solo FRESCO sin abrigo', () => {
    const rules = getClimateStylingRules('COSTA', 30);
    assert.deepEqual(rules.warmthLevels, ['FRESCO']);
    assert.ok(!rules.categories.includes('ABRIGO'));
  });

  it('Oriente cálido pide FRESCO y la Sierra templada incluye abrigo opcional', () => {
    const oriente = getClimateStylingRules('ORIENTE', 28);
    assert.deepEqual(oriente.warmthLevels, ['FRESCO']);
    const sierra = getClimateStylingRules('SIERRA', 15);
    assert.ok(sierra.warmthLevels.includes('TEMPLADO'));
    assert.ok(sierra.categories.includes('ABRIGO'));
  });

  it('siempre devuelve consejo no vacío', () => {
    for (const region of ['COSTA', 'SIERRA', 'ORIENTE'] as const) {
      for (const tempC of [5, 15, 25, 32]) {
        const rules = getClimateStylingRules(region, tempC);
        assert.ok(rules.advice.length > 0);
        assert.ok(rules.categories.length > 0);
        assert.ok(rules.warmthLevels.length > 0);
      }
    }
  });
});

describe('Diagrama 1: las 11 etapas de planta (Riobamba)', () => {
  it('el orden oficial tiene las 11 etapas secuenciales', () => {
    assert.equal(PLANT_PRODUCTION_STAGES_ORDERED.length, 11);
    assert.deepEqual([...PLANT_PRODUCTION_STAGES_ORDERED], [
      '1_DISENO_ARTE',
      '2_MATERIA_PRIMA',
      '3_PATRONAJE',
      '4_CORTE',
      '5_TIQUETEADO',
      '6_COSTURA_ARMADO',
      '7_ESTAMPADO_SUBLIMADO',
      '8_CONTROL_CALIDAD',
      '9_SELLO_AZUL',
      '10_PLANCHADO_ETIQUETADO_INEN',
      '11_EMPAQUE_DESPACHO',
    ]);
  });

  it('mapStageToLegacyStatus cubre las 11 sin salirse del set legacy', () => {
    const legacy = new Set(['EN_COLA', 'EN_CORTE', 'EN_COSTURA', 'EN_ESTAMPADO', 'DESPACHADO']);
    for (const stage of PLANT_PRODUCTION_STAGES_ORDERED) {
      assert.ok(legacy.has(mapStageToLegacyStatus(stage)), `etapa ${stage} fuera del set legacy`);
    }
    assert.equal(mapStageToLegacyStatus('1_DISENO_ARTE'), 'EN_COLA');
    assert.equal(mapStageToLegacyStatus('2_MATERIA_PRIMA'), 'EN_COLA');
    assert.equal(mapStageToLegacyStatus('3_PATRONAJE'), 'EN_COLA');
    assert.equal(mapStageToLegacyStatus('4_CORTE'), 'EN_CORTE');
    assert.equal(mapStageToLegacyStatus('5_TIQUETEADO'), 'EN_CORTE');
    assert.equal(mapStageToLegacyStatus('6_COSTURA_ARMADO'), 'EN_COSTURA');
    assert.equal(mapStageToLegacyStatus('7_ESTAMPADO_SUBLIMADO'), 'EN_ESTAMPADO');
    assert.equal(mapStageToLegacyStatus('8_CONTROL_CALIDAD'), 'EN_ESTAMPADO');
    assert.equal(mapStageToLegacyStatus('9_SELLO_AZUL'), 'EN_ESTAMPADO');
    assert.equal(mapStageToLegacyStatus('10_PLANCHADO_ETIQUETADO_INEN'), 'EN_ESTAMPADO');
    assert.equal(mapStageToLegacyStatus('11_EMPAQUE_DESPACHO'), 'DESPACHADO');
  });

  it('avance secuencial: getNextPlantStage recorre 1..11 y 11 es terminal', () => {
    for (let i = 0; i < 10; i++) {
      const current = PLANT_PRODUCTION_STAGES_ORDERED[i] as PlantProductionStage;
      const expected = PLANT_PRODUCTION_STAGES_ORDERED[i + 1];
      assert.equal(getNextPlantStage(current), expected);
    }
    assert.equal(getNextPlantStage('11_EMPAQUE_DESPACHO'), null);
  });

  it('control de calidad ramifica: approve true -> sello azul, false -> reproceso', () => {
    assert.equal(advancePlantStage('8_CONTROL_CALIDAD', { approve: true }), '9_SELLO_AZUL');
    assert.equal(advancePlantStage('8_CONTROL_CALIDAD', { approve: false }), '6_COSTURA_ARMADO');
    assert.throws(() => advancePlantStage('8_CONTROL_CALIDAD'), /exige decisi/);
    assert.equal(advancePlantStage('7_ESTAMPADO_SUBLIMADO'), '8_CONTROL_CALIDAD');
    assert.equal(advancePlantStage('10_PLANCHADO_ETIQUETADO_INEN'), '11_EMPAQUE_DESPACHO');
    assert.throws(() => advancePlantStage('11_EMPAQUE_DESPACHO'), /terminal/);
  });
});

describe('Diagrama 1: anticipo 50/50 B2B y telas', () => {
  it('ANTICIPO_50_50 solo para CLIENTE_B2B de 13 a 160 unidades', () => {
    assert.equal(isAnticipoEligible('CLIENTE_B2B', 13), true);
    assert.equal(isAnticipoEligible('CLIENTE_B2B', 160), true);
    assert.equal(isAnticipoEligible('CLIENTE_B2B', 12), false);
    assert.equal(isAnticipoEligible('CLIENTE_B2B', 161), false);
    assert.equal(isAnticipoEligible('CLIENTE_B2C', 50), false);
    assert.equal(isAnticipoEligible('SUPER_ADMIN', 50), false);
    assert.equal(resolvePaymentMode('ANTICIPO_50_50', 'CLIENTE_B2B', 20), 'ANTICIPO_50_50');
    assert.equal(resolvePaymentMode('ANTICIPO_50_50', 'CLIENTE_B2C', 20), 'CONTADO_100');
    assert.equal(resolvePaymentMode(undefined, 'CLIENTE_B2B', 20), 'CONTADO_100');
  });

  it('calculatePaymentSplit divide 50/50 o 100/0 al centavo', () => {
    assert.deepEqual(calculatePaymentSplit(160, 'ANTICIPO_50_50'), {
      amountPaidUsd: 80,
      balanceDueUsd: 80,
    });
    assert.deepEqual(calculatePaymentSplit(160, 'CONTADO_100'), {
      amountPaidUsd: 160,
      balanceDueUsd: 0,
    });
    const split = calculatePaymentSplit(100.01, 'ANTICIPO_50_50');
    assert.equal(round2(split.amountPaidUsd + split.balanceDueUsd), 100.01);
  });

  it('tela: 0.71m por camiseta/polo y 1.50m por camisa/pantalón', () => {
    assert.equal(calculateFabricMetersForBox([{ category: 'CAMISETA', quantity: 10 }]), 7.1);
    assert.equal(calculateFabricMetersForBox([{ category: 'POLO', quantity: 2 }]), 1.42);
    assert.equal(
      calculateFabricMetersForBox([
        { category: 'CAMISETA', quantity: 10 },
        { category: 'CAMISA', quantity: 4 },
      ]),
      round2(10 * 0.71 + 4 * 1.5),
    );
    assert.equal(
      calculateFabricMetersForBox([
        { category: 'PANTALON', quantity: 3 },
        { category: 'CAMISA', quantity: 1 },
      ]),
      6,
    );
  });

  it('asiento contable: bruto = MPD+MOD+CIF+utilidad con margen 30%', () => {
    const breakdown = calculateFinancialBreakdown({
      grossRevenueUsd: 160,
      fabricMeters: 13.1,
      totalUnits: 14,
    });
    assert.equal(breakdown.marginPct, 30);
    assert.equal(
      round2(breakdown.mpdCostUsd + breakdown.modCostUsd + breakdown.cifCostUsd + breakdown.operatingProfitUsd),
      160,
    );
    assert.ok(breakdown.mpdCostUsd > 0);
  });

  it('buildLedgerEntryForOrder registra 50% cobrado y 50% por cobrar en B2B', () => {
    const ledger = buildLedgerEntryForOrder({
      orderId: 'order-1',
      orderCode: 'OP-0001',
      boxId: 'box-1',
      paymentMode: 'ANTICIPO_50_50',
      totalUsd: 200,
      fabricMeters: 14.2,
      totalUnits: 20,
    });
    assert.equal(ledger.cashCollectedUsd, 100);
    assert.equal(ledger.receivableUsd, 100);
    assert.equal(ledger.grossRevenueUsd, 200);
    assert.equal(
      round2(ledger.mpdCostUsd + ledger.modCostUsd + ledger.cifCostUsd + ledger.operatingProfitUsd),
      200,
    );
    const contado = buildLedgerEntryForOrder({
      orderId: 'order-2',
      orderCode: 'OP-0002',
      boxId: 'box-2',
      paymentMode: 'CONTADO_100',
      totalUsd: 200,
      fabricMeters: 14.2,
      totalUnits: 20,
    });
    assert.equal(contado.cashCollectedUsd, 200);
    assert.equal(contado.receivableUsd, 0);
  });
});

describe('Ecuador: Cédula/RUC, contacto y medidas', () => {
  it('acepta cédulas Módulo 10 y RUC natural/jurídico/público válidos', () => {
    assert.equal(validateEcuadorianCedula('1710034065'), true);
    assert.equal(validateEcuadorianCedula('0601234560'), true);
    assert.equal(validateEcuadorianId('1710034065'), true);
    assert.equal(validateEcuadorianId('1710034065001'), true);
    assert.equal(validateEcuadorianRuc('1791234561001'), true);
    assert.equal(validateEcuadorianRuc('1761234510001'), true);
  });

  it('rechaza provincia, tercer dígito, verificador y sufijo inválidos', () => {
    assert.equal(validateEcuadorianId('1710034064'), false);
    assert.equal(validateEcuadorianId('2510034065'), false);
    assert.equal(validateEcuadorianId('1760034065'), false);
    assert.equal(validateEcuadorianId('1710034065002'), false);
    assert.equal(validateEcuadorianId('171003406'), false);
    assert.equal(validateEcuadorianId('17100340651'), false);
  });

  it('valida celular 09, edad 16-99 y medidas 140-210 cm / 40-150 kg', () => {
    assert.equal(validateEcuadorianPhone('0991234567'), true);
    assert.equal(validateEcuadorianPhone('0891234567'), false);
    assert.equal(validateAge(16), true);
    assert.equal(validateAge(99), true);
    assert.equal(validateAge(15), false);
    assert.equal(validateBodyMeasures(140, 40), true);
    assert.equal(validateBodyMeasures(210, 150), true);
    assert.equal(validateBodyMeasures(139, 70), false);
    assert.equal(validateBodyMeasures(170, 151), false);
  });
});

describe('Machine Learning: afinidad y talla', () => {
  const user: MlUserPreferenceRecord = {
    userId: 'ml-user-1',
    cedulaOrRuc: '0601234560',
    age: 28,
    genderFit: 'UNISEX',
    region: 'SIERRA',
    city: 'Riobamba',
    climateTempC: 11,
    heightCm: 172,
    weightKg: 70,
    preferredFit: 'RELAXED',
    favoriteColorsHex: ['#C86D51', '#2F4842'],
    preferredCategories: ['CAMISETA'],
    styleDnaVector: { urbano: 80, andino: 70, casual: 60 },
    totalPurchases: 3,
    avgTicketUsd: 42,
    registeredAt: '2026-01-01T00:00:00.000Z',
  };
  const garment: GarmentTemplate = {
    id: 'g-ml-1',
    slug: 'camiseta-ml',
    name: 'Camiseta ML',
    category: 'CAMISETA',
    description: 'Test',
    baseProductionCost: 6.56,
    baseMarginPct: 32,
    baseSalePrice: 8.65,
    baseTimeMinutes: 27,
    sizes: ['S', 'M', 'L'],
    colors: ['TERRACOTA', 'VERDE_SALVIA'],
    recommendedRegions: ['SIERRA'],
    climateNote: 'Sierra',
    imageUrl: 'https://example.com/g.png',
    active: true,
  };

  it('devuelve afinidad 65-99, razones y talla por estatura/peso', () => {
    const rec = computeMlGarmentAffinity(user, garment);
    assert.ok(rec.affinityScorePct >= 65 && rec.affinityScorePct <= 99);
    assert.ok(rec.matchReasons.length >= 2);
    assert.equal(rec.recommendedSize, 'M');
    assert.equal(rec.garmentId, garment.id);
    assert.equal(computeRecommendedSize(150, 45), 'XS');
    assert.equal(computeRecommendedSize(188, 80), 'XL');
  });
});

describe('SRI: Clave de Acceso 49 dígitos Módulo 11', () => {
  it('construye la clave oficial con verificador exacto', () => {
    const key = buildSriAccessKey({
      issueDate: new Date(2026, 0, 15),
      sequential: 123,
      numericCode: '12345678',
      environment: 'PRUEBAS_CELCER',
    });
    assert.equal(key.length, 49);
    assert.match(key, /^150120260106917283940011001001000000123123456781\d$/);
    assert.equal(validateSriAccessKey(key), true);
    assert.equal(Number(key[48]), sriModulo11CheckDigit(key.slice(0, 48)));
    const parts = parseSriAccessKey(key);
    assert.equal(parts.ruc, '0691728394001');
    assert.equal(parts.environmentCode, '1');
    assert.equal(parts.series, '001001');
    assert.equal(parts.sequential, '000000123');
    const tampered = `${key.slice(0, 48)}${key[48] === '0' ? '1' : '0'}`;
    assert.equal(validateSriAccessKey(tampered), false);
  });
});
