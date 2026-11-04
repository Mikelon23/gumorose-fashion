/**
 * Motor industrial Gumorose — funciones puras de cálculo.
 * Planta real en Riobamba: Overlock x5, Recubridoras x5, Rectas x4,
 * Cortadoras x2, Ojaladora, Botonera, Estampadora, Sublimadora,
 * Cortadora de Vinil (23 máquinas en total).
 *
 * Todas las funciones son puras: mismo input, mismo output.
 */
import type {
  BodyAnchorCalibration,
  BoxItemInput,
  BoxQuoteBreakdown,
  ClosetCategory,
  EcuadorRegion,
  FinancialLedgerEntry,
  GarmentCategory,
  GarmentPriceBreakdown,
  GarmentSize,
  GarmentTemplate,
  LegacyBoxVisualStatus,
  MlProductRecommendation,
  MlUserPreferenceRecord,
  PaymentMode,
  PlantProductionStage,
  SriAccessKey,
  SriAccessKeyInput,
  SriAccessKeyParts,
  StyleShuffleVote,
  UserClosetItem,
  UserRole,
  WarmthLevel,
} from './types.js';
import { SRI_EMISOR_RUC } from './types.js';
import { DEFAULT_BODY_ANCHORS, FACE_PROTECTED_MAX_PCT, PLANT_PRODUCTION_STAGES_ORDERED } from './types.js';

/** Precio de venta base por defecto según categoría (USD). */
export const BASE_SALE_PRICE: Record<GarmentCategory, number> = {
  CAMISETA: 8.65,
  POLO: 11.57,
  CAMISA: 16.71,
  PANTALON: 18.85,
};

/** Costo base de producción por defecto según categoría (USD). */
export const BASE_PRODUCTION_COST: Record<GarmentCategory, number> = {
  CAMISETA: 6.56,
  POLO: 8.65,
  CAMISA: 12.85,
  PANTALON: 14.5,
};

/** Costo extra de estampado/insumo por cada logo adicional (USD). */
export const EXTRA_LOGO_PRINT_COST_USD = 1.25;
/** Minutos extra de máquina por cada logo adicional. */
export const EXTRA_LOGO_MACHINE_MINUTES = 4;

/** Tiempo base de máquina por unidad y categoría (minutos). */
export const BASE_TIME_MINUTES: Record<GarmentCategory, number> = {
  CAMISETA: 27, // 9 costura + 18 acabado/estampado
  POLO: 32, // 12 costura + 20 acabado/estampado
  CAMISA: 44, // 20 costura + 24 acabado
  PANTALON: 44, // 20 costura + 24 acabado
};

export const SEWING_MINUTES: Record<GarmentCategory, number> = {
  CAMISETA: 9,
  POLO: 12,
  CAMISA: 20,
  PANTALON: 20,
};

export const FINISHING_MINUTES: Record<GarmentCategory, number> = {
  CAMISETA: 18,
  POLO: 20,
  CAMISA: 24,
  PANTALON: 24,
};

/** Estaciones paralelas activas de costura: 5 Overlock + 5 Recubridoras + 4 Rectas. */
export const PARALLEL_SEWING_STATIONS = 5 + 5 + 4;

export interface ShippingQuote {
  daysMin: number;
  daysMax: number;
  baseCostUsd: number;
  label: string;
}

/** Tarifas de envío por región del Ecuador. */
export const SHIPPING_BY_REGION: Record<EcuadorRegion, ShippingQuote> = {
  SIERRA: { daysMin: 1, daysMax: 2, baseCostUsd: 3.5, label: 'Sierra (1-2 días)' },
  COSTA: { daysMin: 2, daysMax: 2, baseCostUsd: 4.5, label: 'Costa (2 días)' },
  ORIENTE: { daysMin: 2, daysMax: 3, baseCostUsd: 5.5, label: 'Oriente (2-3 días)' },
};

type PricableGarment = Pick<GarmentTemplate, 'category' | 'baseSalePrice' | 'baseTimeMinutes'>;

/**
 * Precio unitario de una prenda personalizada.
 * El primer logo va incluido en el precio base; cada logo adicional
 * suma $1.25 USD y 4 minutos extra de máquina.
 */
export function calculateGarmentUnitPrice(
  garment: PricableGarment,
  logosCount: number,
): GarmentPriceBreakdown {
  const safeLogos = Math.max(0, Math.floor(logosCount));
  const baseSalePrice =
    Number.isFinite(garment.baseSalePrice) && garment.baseSalePrice > 0
      ? garment.baseSalePrice
      : BASE_SALE_PRICE[garment.category];
  const extraLogos = Math.max(0, safeLogos - 1);
  const extraPrintCost = round2(extraLogos * EXTRA_LOGO_PRINT_COST_USD);
  const extraMachineMinutes = extraLogos * EXTRA_LOGO_MACHINE_MINUTES;
  const unitPrice = round2(baseSalePrice + extraPrintCost);
  return {
    baseSalePrice: round2(baseSalePrice),
    extraLogos,
    extraPrintCost,
    extraMachineMinutes,
    unitPrice,
  };
}

/** Minutos base de máquina por unidad según categoría. */
export function getBaseTimeMinutes(category: GarmentCategory, overrideMinutes?: number): number {
  if (overrideMinutes !== undefined && Number.isFinite(overrideMinutes) && overrideMinutes > 0) {
    return Math.ceil(overrideMinutes);
  }
  return BASE_TIME_MINUTES[category];
}

/** Descuento por volumen de la Caja Gumorose según total de prendas. */
export function getVolumeDiscountPct(totalUnits: number): number {
  if (totalUnits >= 51 && totalUnits <= 160) return 20;
  if (totalUnits >= 13 && totalUnits <= 50) return 12;
  if (totalUnits >= 6 && totalUnits <= 12) return 5;
  // Caja cerrada: más de 160 prendas mantiene el tramo máximo.
  if (totalUnits > 160) return 20;
  return 0;
}

/** Cotización de envío según región. */
export function getShippingQuote(region: EcuadorRegion): ShippingQuote {
  return SHIPPING_BY_REGION[region];
}

/**
 * Producción + entrega de una Caja Gumorose.
 * - Suma la carga (tiempo base + logos extra) x cantidad de cada ítem.
 * - Divide la carga entre las estaciones paralelas activas (14).
 * - Suma la cola actual de planta y el envío según región.
 * - Aplica descuento por volumen: 5% (6-12), 12% (13-50), 20% (51-160).
 */
export function calculateProductionAndDeliveryTime(
  boxItems: BoxItemInput[],
  currentPlantQueueMinutes: number,
  region: EcuadorRegion,
): BoxQuoteBreakdown {
  const queue = Math.max(0, Math.floor(currentPlantQueueMinutes));
  const shipping = getShippingQuote(region);

  let workloadMinutes = 0;
  let subtotalUsd = 0;
  let totalUnits = 0;

  for (const item of boxItems) {
    const qty = Math.max(0, Math.floor(item.quantity));
    if (qty === 0) continue;
    const price = calculateGarmentUnitPrice(item.garment, item.logosCount);
    const baseTime = getBaseTimeMinutes(item.garment.category, item.garment.baseTimeMinutes);
    workloadMinutes += (baseTime + price.extraMachineMinutes) * qty;
    subtotalUsd += price.unitPrice * qty;
    totalUnits += qty;
  }

  subtotalUsd = round2(subtotalUsd);
  const discountPct = getVolumeDiscountPct(totalUnits);
  const discountUsd = round2((subtotalUsd * discountPct) / 100);
  const shippingUsd = totalUnits === 0 ? 0 : shipping.baseCostUsd;
  const totalUsd = round2(subtotalUsd - discountUsd + shippingUsd);

  const parallelStations = PARALLEL_SEWING_STATIONS;
  const productionMinutes =
    totalUnits === 0 ? 0 : Math.ceil(workloadMinutes / parallelStations) + queue;

  return {
    totalUnits,
    workloadMinutes,
    parallelStations,
    productionMinutes,
    queuedMinutes: queue,
    subtotalUsd,
    discountPct,
    discountUsd,
    shippingUsd,
    totalUsd,
    deliveryDaysMin: shipping.daysMin,
    deliveryDaysMax: shipping.daysMax,
    deliveryLabel: shipping.label,
  };
}

/** Redondeo a 2 decimales para USD. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

// ============================================================
// Diagrama 1 — Etapas de planta, telas y pagos ERP (Tesis Gumorose)
// ============================================================

/**
 * Mapea las 11 etapas de ingeniería a los 5 estados visuales legacy que
 * aún consumen `apps/web` y `apps/mobile`. Cobertura total: ninguna etapa
 * devuelve un estado fuera del conjunto legacy.
 */
export function mapStageToLegacyStatus(stage: PlantProductionStage): LegacyBoxVisualStatus {
  switch (stage) {
    case '1_DISENO_ARTE':
    case '2_MATERIA_PRIMA':
    case '3_PATRONAJE':
      return 'EN_COLA';
    case '4_CORTE':
    case '5_TIQUETEADO':
      return 'EN_CORTE';
    case '6_COSTURA_ARMADO':
      return 'EN_COSTURA';
    case '7_ESTAMPADO_SUBLIMADO':
    case '8_CONTROL_CALIDAD':
    case '9_SELLO_AZUL':
    case '10_PLANCHADO_ETIQUETADO_INEN':
      return 'EN_ESTAMPADO';
    case '11_EMPAQUE_DESPACHO':
      return 'DESPACHADO';
  }
}

/** Etapa siguiente en el flujo secuencial (sin contar la ramificación de calidad). */
export function getNextPlantStage(current: PlantProductionStage): PlantProductionStage | null {
  const idx = PLANT_PRODUCTION_STAGES_ORDERED.indexOf(current);
  if (idx < 0) return null;
  return PLANT_PRODUCTION_STAGES_ORDERED[idx + 1] ?? null;
}

/**
 * Avance oficial de planta con la regla de `8_CONTROL_CALIDAD`:
 * - fuera de calidad: avanza secuencialmente (`getNextPlantStage`);
 * - en `8_CONTROL_CALIDAD` exige `approve`: `true` -> `9_SELLO_AZUL`,
 *   `false` -> `6_COSTURA_ARMADO` (reproceso).
 */
export function advancePlantStage(
  current: PlantProductionStage,
  options?: { approve?: boolean },
): PlantProductionStage {
  if (current === '8_CONTROL_CALIDAD') {
    if (options?.approve === true) return '9_SELLO_AZUL';
    if (options?.approve === false) return '6_COSTURA_ARMADO';
    throw new Error('La etapa 8_CONTROL_CALIDAD exige decisión: approve true|false');
  }
  const next = getNextPlantStage(current);
  if (!next) throw new Error(`La etapa ${current} es terminal: no hay siguiente`);
  return next;
}

/** Metros de tela por unidad según categoría (Tesis Gumorose). */
export const FABRIC_METERS_BY_CATEGORY: Record<GarmentCategory, number> = {
  CAMISETA: 0.71,
  POLO: 0.71,
  CAMISA: 1.5,
  PANTALON: 1.5,
};

/** Costo de tela por metro (MPD) en USD. */
export const FABRIC_COST_PER_METER_USD = 3.76;

/** Costo de hilo por prenda (MPD) en USD. */
export const THREAD_COST_PER_UNIT_USD = 0.45;

/** Margen operativo por defecto (30%; camiseta pura 32%). */
export const OPERATING_MARGIN_DEFAULT_PCT = 30;
export const OPERATING_MARGIN_CAMISETA_PCT = 32;

/** Metros de tela para una categoría y cantidad. */
export function getFabricMetersForCategory(category: GarmentCategory, quantity: number): number {
  const qty = Math.max(0, Math.floor(quantity));
  return round2(FABRIC_METERS_BY_CATEGORY[category] * qty);
}

/** Metros totales de tela de una caja. */
export function calculateFabricMetersForBox(
  lines: ReadonlyArray<{ category: GarmentCategory; quantity: number }>,
): number {
  let total = 0;
  for (const line of lines) total += FABRIC_METERS_BY_CATEGORY[line.category] * Math.max(0, Math.floor(line.quantity));
  return round2(total);
}

/** ¿La caja puede usar anticipo 50/50? Exclusivo B2B de 13 a 160 unidades. */
export function isAnticipoEligible(customerRole: UserRole, totalUnits: number): boolean {
  return customerRole === 'CLIENTE_B2B' && totalUnits >= 13 && totalUnits <= 160;
}

/** Normaliza la modalidad de pago (B2C siempre va a CONTADO_100). */
export function resolvePaymentMode(
  requested: PaymentMode | undefined,
  customerRole: UserRole,
  totalUnits: number,
): PaymentMode {
  if (requested === 'ANTICIPO_50_50' && isAnticipoEligible(customerRole, totalUnits)) {
    return 'ANTICIPO_50_50';
  }
  return 'CONTADO_100';
}

/** Divide el total en pagado/saldo según modalidad (50/50 o 100/0). */
export function calculatePaymentSplit(
  totalUsd: number,
  paymentMode: PaymentMode,
): { amountPaidUsd: number; balanceDueUsd: number } {
  const total = round2(totalUsd);
  if (paymentMode === 'ANTICIPO_50_50') {
    const amountPaidUsd = round2(total / 2);
    return { amountPaidUsd, balanceDueUsd: round2(total - amountPaidUsd) };
  }
  return { amountPaidUsd: total, balanceDueUsd: 0 };
}

/** Desglose financiero MPD/MOD/CIF + utilidad (identidad: bruto = MPD+MOD+CIF+utilidad). */
export function calculateFinancialBreakdown(input: {
  grossRevenueUsd: number;
  fabricMeters: number;
  totalUnits: number;
  marginPct?: number;
}): { mpdCostUsd: number; modCostUsd: number; cifCostUsd: number; operatingProfitUsd: number; marginPct: number } {
  const gross = round2(input.grossRevenueUsd);
  const marginPct =
    input.marginPct ?? OPERATING_MARGIN_DEFAULT_PCT;
  const mpdCostUsd = round2(
    input.fabricMeters * FABRIC_COST_PER_METER_USD +
      Math.max(0, Math.floor(input.totalUnits)) * THREAD_COST_PER_UNIT_USD,
  );
  let operatingProfitUsd = round2((gross * marginPct) / 100);
  let remainder = round2(gross - mpdCostUsd - operatingProfitUsd);
  if (remainder < 0) {
    // Caja muy pequeña: la MPD manda; la utilidad absorbe el residuo.
    operatingProfitUsd = round2(Math.max(0, gross - mpdCostUsd));
    remainder = round2(gross - mpdCostUsd - operatingProfitUsd);
  }
  const modCostUsd = round2(remainder * 0.6);
  const cifCostUsd = round2(remainder - modCostUsd);
  return { mpdCostUsd, modCostUsd, cifCostUsd, operatingProfitUsd, marginPct };
}

/** Construye el asiento contable de una orden pagada (puro, sin I/O). */
export function buildLedgerEntryForOrder(input: {
  orderId: string;
  orderCode: string;
  boxId: string;
  paymentMode: PaymentMode;
  totalUsd: number;
  fabricMeters: number;
  totalUnits: number;
  marginPct?: number;
}): FinancialLedgerEntry {
  const split = calculatePaymentSplit(input.totalUsd, input.paymentMode);
  const breakdown = calculateFinancialBreakdown({
    grossRevenueUsd: input.totalUsd,
    fabricMeters: input.fabricMeters,
    totalUnits: input.totalUnits,
    marginPct: input.marginPct,
  });
  return {
    id: `ledger-${input.orderId}`,
    orderId: input.orderId,
    orderCode: input.orderCode,
    boxId: input.boxId,
    paymentMode: input.paymentMode,
    createdAt: new Date().toISOString(),
    grossRevenueUsd: round2(input.totalUsd),
    mpdCostUsd: breakdown.mpdCostUsd,
    modCostUsd: breakdown.modCostUsd,
    cifCostUsd: breakdown.cifCostUsd,
    operatingProfitUsd: breakdown.operatingProfitUsd,
    marginPct: breakdown.marginPct,
    cashCollectedUsd: split.amountPaidUsd,
    receivableUsd: split.balanceDueUsd,
  };
}

/** Reglas de estilismo por clima que consume el Agente Estilista. */
export interface ClimateStylingRules {
  region: EcuadorRegion;
  tempC: number;
  /** Niveles térmicos a combinar, de más a menos recomendado. */
  warmthLevels: WarmthLevel[];
  /** Categorías de clóset a combinar, en orden de prioridad. */
  categories: ClosetCategory[];
  /** Consejo en lenguaje natural para el usuario / el Agente. */
  advice: string;
}

/**
 * Qué debe combinar el Agente Estilista según región del Ecuador y
 * temperatura actual (°C). Costa cálida → FRESCO; Sierra fría → CALIDO
 * con abrigo; Oriente húmedo → FRESCO/TEMPLADO de secado rápido.
 */
export function getClimateStylingRules(region: EcuadorRegion, tempC: number): ClimateStylingRules {
  const t = Number.isFinite(tempC) ? tempC : 20;

  if (region === 'COSTA') {
    if (t >= 28) {
      return {
        region,
        tempC: t,
        warmthLevels: ['FRESCO'],
        categories: ['SUPERIOR_CAMISETA', 'INFERIOR_PANTALON', 'ACCESORIO'],
        advice:
          'Calor costero: camiseta fresca, pantalón liviano y accesorio (gafas/gorra). Evita abrigos y telas cálidas.',
      };
    }
    if (t >= 24) {
      return {
        region,
        tempC: t,
        warmthLevels: ['FRESCO', 'TEMPLADO'],
        categories: ['SUPERIOR_CAMISETA', 'SUPERIOR_CAMISA', 'INFERIOR_PANTALON', 'ACCESORIO'],
        advice:
          'Costa templada: camiseta o camisa de manga corta fresca. Una capa templada solo si hay brisa nocturna.',
      };
    }
    return {
      region,
      tempC: t,
      warmthLevels: ['TEMPLADO', 'CALIDO'],
      categories: [
        'SUPERIOR_CAMISA',
        'SUPERIOR_CAMISETA',
        'INFERIOR_PANTALON',
        'ABRIGO',
        'ACCESORIO',
      ],
      advice: 'Noche fresca en la Costa: camisa templada y un abrigo liviano a la mano.',
    };
  }

  if (region === 'ORIENTE') {
    if (t >= 27) {
      return {
        region,
        tempC: t,
        warmthLevels: ['FRESCO'],
        categories: ['SUPERIOR_CAMISETA', 'INFERIOR_PANTALON', 'ACCESORIO'],
        advice:
          'Calor amazónico húmedo: prendas frescas de secado rápido (sublimado). Nada cálido.',
      };
    }
    if (t >= 23) {
      return {
        region,
        tempC: t,
        warmthLevels: ['FRESCO', 'TEMPLADO'],
        categories: ['SUPERIOR_CAMISETA', 'SUPERIOR_CAMISA', 'INFERIOR_PANTALON', 'ACCESORIO'],
        advice:
          'Oriente templado con lluvia probable: fresco con una capa templada repelente al agua.',
      };
    }
    return {
      region,
      tempC: t,
      warmthLevels: ['TEMPLADO', 'CALIDO'],
      categories: [
        'SUPERIOR_CAMISA',
        'SUPERIOR_CAMISETA',
        'INFERIOR_PANTALON',
        'ABRIGO',
        'ACCESORIO',
      ],
      advice: 'Frío amazónico nocturno: capa templada más abrigo liviano impermeable.',
    };
  }

  // SIERRA (frío andino, Riobamba/Quito)
  if (t < 12) {
    return {
      region,
      tempC: t,
      warmthLevels: ['CALIDO', 'TEMPLADO'],
      categories: [
        'ABRIGO',
        'SUPERIOR_CAMISA',
        'SUPERIOR_CAMISETA',
        'INFERIOR_PANTALON',
        'ACCESORIO',
      ],
      advice:
        'Frío de Sierra: abrigo cálido obligatorio sobre camisa o camiseta, pantalón abrigado y accesorio (bufanda/gorro).',
    };
  }
  if (t < 19) {
    return {
      region,
      tempC: t,
      warmthLevels: ['TEMPLADO', 'CALIDO'],
      categories: [
        'SUPERIOR_CAMISA',
        'SUPERIOR_CAMISETA',
        'INFERIOR_PANTALON',
        'ABRIGO',
        'ACCESORIO',
      ],
      advice: 'Sierra templada: camisa o camiseta con abrigo liviano listo para la tarde.',
    };
  }
  return {
    region,
    tempC: t,
    warmthLevels: ['FRESCO', 'TEMPLADO'],
    categories: ['SUPERIOR_CAMISETA', 'INFERIOR_PANTALON', 'SUPERIOR_CAMISA', 'ACCESORIO'],
    advice:
      'Mediodía andino soleado: fresco y liviano, con una capa templada por si cambia el clima.',
  };
}

// ============================================================
// Etapa 1 — Acloset CPW, anclas anatómicas y ADN de estilo
// ============================================================

/** Usos históricos por defecto cuando la prenda aún no registra OOTD. */
export const DEFAULT_WEAR_COUNT = 112;

/**
 * Costo por Uso (Acloset CPW): `price / wearCount`.
 * Sin usos registrados el costo por uso es el precio completo;
 * precio inválido o negativo devuelve 0.
 */
export function calculateCostPerWear(priceUsd: number, wearCount: number): number {
  if (!Number.isFinite(priceUsd) || priceUsd <= 0) return 0;
  const uses = Number.isFinite(wearCount) ? Math.floor(wearCount) : 0;
  if (uses <= 0) return round2(priceUsd);
  return round2(priceUsd / uses);
}

/** CPW de una prenda del clóset usando su precio o el fallback de catálogo. */
export function costPerWearOfItem(
  item: Pick<UserClosetItem, 'purchasePriceUsd' | 'wearCount'>,
  fallbackPriceUsd = 0,
): number {
  const price = item.purchasePriceUsd ?? fallbackPriceUsd;
  return calculateCostPerWear(price, item.wearCount ?? DEFAULT_WEAR_COUNT);
}

function clampPct(value: number, min: number, max: number, fallback: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

/**
 * Normaliza una calibración garantizando la zona facial protegida:
 * `shoulderTopPct` nunca baja de 19.5% y las anclas quedan en rango.
 */
export function normalizeBodyAnchors(
  input?: Partial<BodyAnchorCalibration> | null,
): BodyAnchorCalibration {
  const base = { ...DEFAULT_BODY_ANCHORS, ...(input ?? {}) };
  return {
    framing: base.framing === 'HALF_BODY_EXTENDED' ? 'HALF_BODY_EXTENDED' : 'FULL_BODY',
    shoulderTopPct: clampPct(base.shoulderTopPct, FACE_PROTECTED_MAX_PCT, 30, DEFAULT_BODY_ANCHORS.shoulderTopPct),
    torsoWidthPct: clampPct(base.torsoWidthPct, 40, 80, DEFAULT_BODY_ANCHORS.torsoWidthPct),
    waistTopPct: clampPct(base.waistTopPct, 42, 62, DEFAULT_BODY_ANCHORS.waistTopPct),
    legsLengthPct: clampPct(base.legsLengthPct, 20, 55, DEFAULT_BODY_ANCHORS.legsLengthPct),
    lowerBodyPreset: base.lowerBodyPreset ?? DEFAULT_BODY_ANCHORS.lowerBodyPreset,
  };
}

/** ¿El anclaje respeta la zona facial protegida (0%–19.5%)? */
export function isFaceZoneSafe(anchors: BodyAnchorCalibration): boolean {
  return anchors.shoulderTopPct >= FACE_PROTECTED_MAX_PCT;
}

/**
 * ADN de estilo (Stitch Fix): % de afinidad por tag a partir de votos.
 * Solo los 👍 suman; sin votos devuelve {}.
 */
export function computeStyleDna(votes: readonly StyleShuffleVote[]): Record<string, number> {
  const liked = votes.filter((v) => v.liked);
  if (liked.length === 0) return {};
  const counts = new Map<string, number>();
  for (const vote of liked) counts.set(vote.styleTag, (counts.get(vote.styleTag) ?? 0) + 1);
  const dna: Record<string, number> = {};
  for (const [tag, count] of counts) dna[tag] = Math.round((count / liked.length) * 100);
  return dna;
}

/* ================================================================== */
/* Machine Learning en tiempo real + Clave de Acceso SRI               */
/* ================================================================== */

const GARMENT_SIZES: GarmentSize[] = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

/** Talla sugerida por estatura (140-210 cm) y peso (40-150 kg, vía IMC). */
export function computeRecommendedSize(
  heightCm: number,
  weightKg: number,
): GarmentSize {
  const height = Number.isFinite(heightCm) ? Math.min(210, Math.max(140, heightCm)) : 170;
  let index =
    height < 155 ? 0 : height < 165 ? 1 : height < 175 ? 2 : height < 185 ? 3 : height < 195 ? 4 : 5;
  const meters = height / 100;
  const bmi = weightKg / (meters * meters);
  if (Number.isFinite(bmi) && bmi >= 28) index += 1;
  if (Number.isFinite(bmi) && bmi < 18.5) index -= 1;
  return GARMENT_SIZES[Math.min(GARMENT_SIZES.length - 1, Math.max(0, index))]!;
}
export const recommendedSizeFor = computeRecommendedSize;
export const recommendGarmentSize = computeRecommendedSize;

/** Similitud coseno entre dos vectores dispersos (0 si alguno es vacío). */
export function cosineSimilarity(
  a: Record<string, number>,
  b: Record<string, number>,
): number {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const key of keys) {
    const av = a[key] ?? 0;
    const bv = b[key] ?? 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (normA === 0 || normB === 0) return 0;
  return clamp01(dot / (Math.sqrt(normA) * Math.sqrt(normB)));
}
export const mlCosineSimilarity = cosineSimilarity;

const COLOR_NAME_HEX: Record<string, string> = {
  BLANCO: '#FAF7F2',
  NEGRO: '#141413',
  AZUL_MARINO: '#213A5C',
  AZUL: '#2B5EA7',
  CELESTE: '#8ECAE6',
  ROJO: '#B23A1D',
  TERRACOTA: '#C86D51',
  VERDE_SALVIA: '#2F4842',
  SALVIA: '#2F4842',
  VERDE: '#2F6B4F',
  BEIGE: '#C2B280',
  CAFE: '#6F4E37',
  GRIS: '#6B7280',
  AMARILLO: '#E4B33C',
  ROSA: '#D9A0A8',
  MORADO: '#5B4A8A',
  NARANJA: '#D97B29',
};

function colorNameToHex(color: string): string | null {
  const raw = String(color ?? '').trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(raw)) return raw.toUpperCase();
  return COLOR_NAME_HEX[raw.toUpperCase()] ?? null;
}

function hexToRgbTuple(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function colorAffinity(favorites: string[], garmentColors: string[]): number {
  if (favorites.length === 0 || garmentColors.length === 0) return 0.45;
  let best = 0;
  for (const garmentColor of garmentColors) {
    const gHex = colorNameToHex(garmentColor);
    if (!gHex) continue;
    const [gr, gg, gb] = hexToRgbTuple(gHex);
    const gNorm = Math.hypot(gr, gg, gb) || 1;
    for (const favorite of favorites) {
      if (!/^#[0-9A-Fa-f]{6}$/.test(favorite)) continue;
      const [fr, fg, fb] = hexToRgbTuple(favorite);
      const fNorm = Math.hypot(fr, fg, fb) || 1;
      const cosine = (gr * fr + gg * fg + gb * fb) / (gNorm * fNorm);
      // Distancia euclídea normalizada complementa al coseno (tonos cercanos).
      const distance = Math.hypot(gr - fr, gg - fg, gb - fb) / 441.7;
      best = Math.max(best, clamp01(cosine * 0.6 + (1 - distance) * 0.4));
    }
  }
  return best === 0 ? 0.45 : best;
}

function garmentStyleVector(
  garment: Pick<GarmentTemplate, 'category' | 'recommendedRegions' | 'visualVariant' | 'colors'>,
): Record<string, number> {
  const vector: Record<string, number> = {
    [garment.category]: 80,
    casual: garment.category === 'CAMISETA' || garment.category === 'POLO' ? 70 : 40,
    ejecutivo: garment.category === 'CAMISA' || garment.category === 'POLO' ? 80 : 30,
    urbano: 55,
    andino: garment.recommendedRegions.includes('SIERRA') ? 70 : 35,
    costero: garment.recommendedRegions.includes('COSTA') ? 70 : 35,
    oversize: garment.visualVariant === 'HOODIE' || garment.visualVariant === 'CHAQUETA' ? 85 : 30,
    tailored: garment.category === 'CAMISA' ? 85 : garment.category === 'POLO' ? 65 : 35,
  };
  for (const region of garment.recommendedRegions) vector[region] = 75;
  return vector;
}

/**
 * Afinidad ML en tiempo real (similitud coseno + vecinos ponderados):
 * Clima/KNN regional 25%, Fit 20%, Color 20%, Style DNA coseno 20%,
 * Categoría preferida 15%. El puntaje público se acota a 65%-99%.
 */
export function computeMlGarmentAffinity(
  userRecord: MlUserPreferenceRecord,
  garment: GarmentTemplate,
): MlProductRecommendation {
  const climateBase = garment.recommendedRegions.includes(userRecord.region) ? 1 : 0.42;
  const temp = Number.isFinite(userRecord.climateTempC) ? userRecord.climateTempC : 18;
  const freshGarment =
    garment.category === 'CAMISETA' || garment.category === 'POLO' || garment.visualVariant === 'GORRA';
  const warmGarment = garment.visualVariant === 'HOODIE' || garment.visualVariant === 'CHAQUETA';
  const tempFit = warmGarment
    ? clamp01(1 - Math.abs(temp - 11) / 28)
    : freshGarment
      ? clamp01(1 - Math.abs(temp - 29) / 28)
      : clamp01(1 - Math.abs(temp - 19) / 26);
  const climate = clamp01(climateBase * 0.7 + tempFit * 0.3);

  const fit =
    userRecord.preferredFit === 'TAILORED'
      ? garment.category === 'CAMISA'
        ? 1
        : garment.category === 'POLO' || garment.category === 'PANTALON'
          ? 0.82
          : 0.55
      : userRecord.preferredFit === 'OVERSIZE'
        ? garment.visualVariant === 'HOODIE' || garment.visualVariant === 'CHAQUETA'
          ? 1
          : garment.category === 'CAMISETA'
            ? 0.8
            : 0.5
        : garment.category === 'CAMISETA' || garment.category === 'PANTALON'
          ? 0.92
          : 0.7;

  const color = colorAffinity(userRecord.favoriteColorsHex, garment.colors);
  const styleDna =
    Object.keys(userRecord.styleDnaVector ?? {}).length === 0
      ? 0.55
      : cosineSimilarity(userRecord.styleDnaVector, garmentStyleVector(garment));
  const category = userRecord.preferredCategories.includes(garment.category) ? 1 : 0.35;

  const raw = climate * 0.25 + fit * 0.2 + color * 0.2 + styleDna * 0.2 + category * 0.15;
  const affinityScorePct = Math.round(65 + clamp01(raw) * 34);

  const matchReasons: string[] = [];
  if (climate >= 0.68) {
    matchReasons.push(
      `Clima ${userRecord.region} (${temp}°C en ${userRecord.city}) compatible con esta prenda`,
    );
  }
  if (fit >= 0.8) matchReasons.push(`Corte ${userRecord.preferredFit} afín a tu perfilado`);
  if (color >= 0.72) matchReasons.push('Afinidad cromática con tus colores favoritos');
  if (category >= 1) matchReasons.push(`${garment.category} está entre tus categorías preferidas`);
  if (styleDna >= 0.55) matchReasons.push('ADN de estilo similar a tus votos (similitud coseno)');
  if (matchReasons.length === 0) {
    matchReasons.push('Recomendación exploratoria del motor ML según tu región y medidas');
  }
  matchReasons.push(
    `Talla sugerida ${computeRecommendedSize(userRecord.heightCm, userRecord.weightKg)} para ${userRecord.heightCm} cm / ${userRecord.weightKg} kg`,
  );

  return {
    garmentId: garment.id,
    garment,
    affinityScorePct,
    matchReasons,
    recommendedSize: computeRecommendedSize(userRecord.heightCm, userRecord.weightKg),
    scoreBreakdown: {
      climate: Math.round(climate * 100),
      fit: Math.round(fit * 100),
      color: Math.round(color * 100),
      styleDna: Math.round(styleDna * 100),
      category: Math.round(category * 100),
    },
  };
}

/** Dígito verificador Módulo 11 del SRI para la base de 48 dígitos. */
export function sriModulo11CheckDigit(base48: string): number {
  const digits = String(base48 ?? '');
  if (!/^\d{48}$/.test(digits)) throw new Error('La base de la Clave de Acceso debe tener 48 dígitos');
  let sum = 0;
  let factor = 2;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    sum += Number(digits[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const check = 11 - (sum % 11);
  if (check === 11) return 0;
  if (check === 10) return 1;
  return check;
}
export const computeSriModulo11CheckDigit = sriModulo11CheckDigit;
export const modulo11CheckDigit = sriModulo11CheckDigit;

function sriDatePart(input: SriAccessKeyInput): string {
  if (input.issueDateDdmmyyyy && /^\d{8}$/.test(input.issueDateDdmmyyyy)) {
    return input.issueDateDdmmyyyy;
  }
  const raw = input.issueDate;
  const date = raw instanceof Date ? raw : raw ? new Date(raw) : new Date();
  if (typeof raw === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
    return raw.replace(/\//g, '').replace(/^(\d{2})(\d{2})(\d{4})$/, '$1$2$3');
  }
  if (typeof raw === 'string' && /^\d{8}$/.test(raw)) return raw;
  const valid = Number.isNaN(date.getTime()) ? new Date() : date;
  const dd = String(valid.getDate()).padStart(2, '0');
  const mm = String(valid.getMonth() + 1).padStart(2, '0');
  const yyyy = String(valid.getFullYear());
  return `${dd}${mm}${yyyy}`;
}

/**
 * Construye la Clave de Acceso oficial de 49 dígitos (SRI Módulo 11):
 * ddmmaaaa + 01 + RUC 13 + ambiente (1|2) + serie 001001 +
 * secuencial 9 + código numérico 8 + tipo emisión 1 + verificador.
 */
export function buildSriAccessKey(input: SriAccessKeyInput): SriAccessKey {
  const ruc = String(input.ruc ?? SRI_EMISOR_RUC).trim();
  if (!/^\d{13}$/.test(ruc)) throw new Error('El RUC del emisor debe tener 13 dígitos');
  const environmentCode: '1' | '2' =
    input.environmentCode ??
    (input.environment === '2' || input.environment === 'PRODUCCION' || input.environment === 'PRODUCCION_CEL'
      ? '2'
      : '1');
  const series = String(input.series ?? `${input.establishment ?? '001'}${input.emissionPoint ?? '001'}`);
  if (!/^\d{6}$/.test(series)) throw new Error('La serie SRI debe tener 6 dígitos (001001)');
  const sequential = String(input.sequential).padStart(9, '0');
  if (!/^\d{9}$/.test(sequential)) throw new Error('El secuencial SRI debe tener 9 dígitos');
  const numericCode = String(input.numericCode ?? sequential.slice(-8)).padStart(8, '0');
  if (!/^\d{8}$/.test(numericCode)) throw new Error('El código numérico SRI debe tener 8 dígitos');
  const base = `${sriDatePart(input)}01${ruc}${environmentCode}${series}${sequential}${numericCode}1`;
  return `${base}${sriModulo11CheckDigit(base)}`;
}
export const createSriAccessKey = buildSriAccessKey;
export const buildClaveAccesoSri = buildSriAccessKey;

/** Descompone una Clave de Acceso de 49 dígitos en sus partes oficiales. */
export function parseSriAccessKey(accessKey: string): SriAccessKeyParts {
  const key = String(accessKey ?? '').trim();
  if (!/^\d{49}$/.test(key)) throw new Error('La Clave de Acceso debe tener 49 dígitos');
  return {
    issueDateDdmmyyyy: key.slice(0, 8),
    documentType: key.slice(8, 10) as '01',
    ruc: key.slice(10, 23),
    environmentCode: key.slice(23, 24) as '1' | '2',
    series: key.slice(24, 30),
    sequential: key.slice(30, 39),
    numericCode: key.slice(39, 47),
    emissionType: key.slice(47, 48) as '1',
    checkDigit: key.slice(48, 49),
  };
}

/** Verdadero si la clave tiene 49 dígitos y verificador Módulo 11 exacto. */
export function validateSriAccessKey(accessKey: string): boolean {
  const key = String(accessKey ?? '').trim();
  if (!/^\d{49}$/.test(key)) return false;
  try {
    return sriModulo11CheckDigit(key.slice(0, 48)) === Number(key[48]);
  } catch {
    return false;
  }
}
export const isValidSriAccessKey = validateSriAccessKey;

/** Etiqueta legible del ADN dominante, ej. "65% Urbano Andino". */
export function topStyleTag(dna: Record<string, number>): string | null {
  let best: string | null = null;
  let bestPct = -1;
  for (const [tag, pct] of Object.entries(dna)) {
    if (pct > bestPct) {
      best = tag;
      bestPct = pct;
    }
  }
  return best;
}
