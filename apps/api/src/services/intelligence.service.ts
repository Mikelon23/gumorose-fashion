/**
 * Inteligencia algorítmica Stitch Fix / Hybrid Designs (HBR Katrina Lake)
 * y métricas Blue Ocean — cruza clósets, votos Style Shuffle y órdenes
 * por región climática en tiempo real (sin I/O, sobre el store).
 */
import {
  BASE_PRODUCTION_COST,
  BASE_TIME_MINUTES,
  FABRIC_METERS_BY_CATEGORY,
  FINISHING_MINUTES,
  SEWING_MINUTES,
  calculateFinancialBreakdown,
  computeStyleDna,
  costPerWearOfItem,
  getClimateStylingRules,
  getVolumeDiscountPct,
  round2,
} from '@gumorose/shared';
import type {
  ClosetCategory,
  EcuadorRegion,
  GarmentCategory,
  GarmentVisualVariant,
  WarmthLevel,
} from '@gumorose/shared';
import type { Store } from '../store.js';

const REGION_TEMP: Record<EcuadorRegion, number> = { COSTA: 30, SIERRA: 10, ORIENTE: 26 };
const REGIONS: EcuadorRegion[] = ['COSTA', 'SIERRA', 'ORIENTE'];

const COLOR_NAME_HEX: Record<string, string> = {
  BLANCO: '#F7F5F2',
  NEGRO: '#1C1917',
  AZUL_MARINO: '#213A5C',
  GRIS: '#9AA0A6',
  GRIS_OSCURO: '#44403C',
  ROJO: '#B91C1C',
  VERDE_BOTELLA: '#1E4D3B',
  VINO: '#7C2D2D',
  CELESTE: '#8FC3E8',
  ROSADO: '#F2B8C6',
  TURQUESA: '#3FBFB0',
  KAKI: '#A9A06B',
};

const CLOSET_TO_GARMENT: Record<ClosetCategory, GarmentCategory> = {
  SUPERIOR_CAMISETA: 'CAMISETA',
  SUPERIOR_CAMISA: 'CAMISA',
  INFERIOR_PANTALON: 'PANTALON',
  ABRIGO: 'CAMISA',
  ACCESORIO: 'CAMISETA',
};

const GAP_LABEL: Record<ClosetCategory, string> = {
  SUPERIOR_CAMISETA: 'Camisetas y Hoodies base',
  SUPERIOR_CAMISA: 'Camisas y Polos estructurados',
  INFERIOR_PANTALON: 'Pantalones (Chino/Cargo/Jogger)',
  ABRIGO: 'Abrigos y Hoodies térmicos',
  ACCESORIO: 'Accesorios (gorras/bufandas)',
};

export interface ClosetGap {
  region: EcuadorRegion;
  closetCategory: ClosetCategory;
  garmentCategory: GarmentCategory;
  warmthLevels: WarmthLevel[];
  deficitPct: number;
  usersCount: number;
  closetItemsCount: number;
  estimatedDemandUnits: number;
  label: string;
  advice: string;
}

export interface HybridDesignRecommendation {
  id: string;
  name: string;
  slug: string;
  region: EcuadorRegion;
  closetCategory: ClosetCategory;
  category: GarmentCategory;
  visualVariant: GarmentVisualVariant;
  styleTag: string;
  colorName: string;
  colorHex: string;
  fabricName: string;
  fabricMetersPerUnit: number;
  fabricMetersTotal: number;
  estimatedDemandUnits: number;
  mpdPerUnitUsd: number;
  modPerUnitUsd: number;
  cifPerUnitUsd: number;
  productionCostPerUnitUsd: number;
  suggestedPriceUsd: number;
  marginPct: number;
  baseTimeMinutes: number;
  rationale: string;
}

export interface BlueOceanMetrics {
  madeToOrderDeadInventoryPct: number;
  traditionalRetailDeadInventoryPct: number;
  plantMachines: number;
  avgProductionMinutesPerUnit: number;
  totalPlantQueueMinutes: number;
  totalUsers: number;
  closetActiveUsers: number;
  closetRetentionPct: number;
  avgCostPerWearUsd: number;
  totalStyleVotes: number;
  likedVotes: number;
  likedPct: number;
  cmsMonthlyCostUsd: number;
  strategyCanvas: { factor: string; gumorose: string; traditionalRetail: string }[];
}

export interface StitchFixInsights {
  generatedAt: string;
  closetGapsByRegion: Record<EcuadorRegion, ClosetGap[]>;
  hybridDesignRecommendations: HybridDesignRecommendation[];
  blueOceanMetrics: BlueOceanMetrics;
  styleDnaGlobal: Record<string, number>;
  totals: { users: number; closetItems: number; styleVotes: number; orders: number };
}

function topColorHex(store: Store, region: EcuadorRegion): { colorName: string; colorHex: string } {
  const counts = new Map<string, { name: string; n: number }>();
  const bump = (hex: string, name: string): void => {
    const key = hex.toUpperCase();
    const current = counts.get(key);
    counts.set(key, { name, n: (current?.n ?? 0) + 1 });
  };
  for (const vote of store.styleVotes) {
    if (!vote.liked || vote.region !== region) continue;
    const garment = store.garments.get(vote.itemId);
    const colorName = garment?.colors[0];
    if (colorName) bump(COLOR_NAME_HEX[colorName] ?? '#9AA0A6', colorName);
  }
  for (const item of store.closetItems.values()) {
    const owner = store.users.get(item.userId);
    if (owner?.currentRegion === region) bump(item.colorHex, item.colorHex);
  }
  let best: { name: string; hex: string; n: number } | null = null;
  for (const [hex, entry] of counts) {
    if (!best || entry.n > best.n) best = { name: entry.name, hex, n: entry.n };
  }
  if (best) return { colorName: best.name, colorHex: best.hex };
  const fallback: Record<EcuadorRegion, { colorName: string; colorHex: string }> = {
    COSTA: { colorName: 'TURQUESA', colorHex: '#3FBFB0' },
    SIERRA: { colorName: 'VINO', colorHex: '#7C2D2D' },
    ORIENTE: { colorName: 'VERDE_BOTELLA', colorHex: '#1E4D3B' },
  };
  return fallback[region];
}

function fabricNameFor(store: Store, category: GarmentCategory): string {
  const telas = store.materials.filter((m) => m.kind === 'TELA');
  const pick = (needle: string) => telas.find((m) => m.name.toLowerCase().includes(needle));
  if (category === 'PANTALON') return pick('gabardina')?.name ?? telas[0]?.name ?? 'Gabardina Riobamba';
  if (category === 'CAMISA') return pick('popelina')?.name ?? telas[0]?.name ?? 'Popelina Riobamba';
  return pick('algodón')?.name ?? telas[0]?.name ?? 'Algodón peinado Riobamba';
}

function hybridName(gap: ClosetGap): { name: string; variant: GarmentVisualVariant } {
  if (gap.region === 'SIERRA' && gap.closetCategory === 'INFERIOR_PANTALON')
    return { name: 'Pantalón Cargo Térmico Chimborazo Hybrid', variant: 'CARGO' };
  if (gap.region === 'SIERRA' && gap.closetCategory !== 'INFERIOR_PANTALON' && gap.closetCategory !== 'ACCESORIO')
    return { name: 'Hoodie Térmico Andino Hybrid 350g', variant: 'HOODIE' };
  if (gap.region === 'COSTA' && gap.closetCategory === 'SUPERIOR_CAMISA')
    return { name: 'Polo Piqué Transpirable Costa Hybrid', variant: 'POLO' };
  if (gap.closetCategory === 'INFERIOR_PANTALON')
    return { name: `Pantalón Chino Urbano ${gap.region === 'ORIENTE' ? 'Amazónico' : 'Costa'} Hybrid`, variant: 'CHINO' };
  if (gap.closetCategory === 'ACCESORIO') return { name: 'Gorra Bordada Hybrid Gumorose', variant: 'GORRA' };
  if (gap.closetCategory === 'SUPERIOR_CAMISA') return { name: 'Camisa Oxford Fresca Hybrid', variant: 'CAMISA' };
  return { name: `Camiseta Hybrid ${gap.region === 'ORIENTE' ? 'Amazónica' : gap.region === 'COSTA' ? 'Costeña' : 'Andina'}`, variant: 'CAMISETA' };
}

/** Cruza clósets + votos + órdenes y genera gaps, hybrids y Blue Ocean. */
export function computeStitchFixInsights(store: Store): StitchFixInsights {
  const usersByRegion: Record<EcuadorRegion, number> = { COSTA: 0, SIERRA: 0, ORIENTE: 0 };
  for (const user of store.users.values()) usersByRegion[user.currentRegion] += 1;

  const gapsByRegion = {} as Record<EcuadorRegion, ClosetGap[]>;
  const allGaps: ClosetGap[] = [];

  for (const region of REGIONS) {
    const rules = getClimateStylingRules(region, REGION_TEMP[region]);
    const usersCount = usersByRegion[region];
    const regionItems = [...store.closetItems.values()].filter(
      (item) => store.users.get(item.userId)?.currentRegion === region,
    );
    const categories = [...new Set(rules.categories)];
    const gaps: ClosetGap[] = categories.map((closetCategory) => {
      const closetItemsCount = regionItems.filter((i) => i.category === closetCategory).length;
      const deficitPct =
        usersCount === 0
          ? 88
          : Math.max(0, Math.min(100, Math.round((1 - Math.min(closetItemsCount / usersCount, 1)) * 100)));
      const estimatedDemandUnits =
        usersCount === 0 ? 48 : Math.max(12, Math.round((usersCount * deficitPct) / 100) + 12);
      return {
        region,
        closetCategory,
        garmentCategory: CLOSET_TO_GARMENT[closetCategory],
        warmthLevels: rules.warmthLevels,
        deficitPct,
        usersCount,
        closetItemsCount,
        estimatedDemandUnits,
        label: `${region}: Déficit del ${deficitPct}% en ${GAP_LABEL[closetCategory]}`,
        advice: rules.advice,
      };
    });
    gaps.sort((a, b) => b.deficitPct - a.deficitPct);
    gapsByRegion[region] = gaps;
    allGaps.push(...gaps);
  }

  const styleDnaGlobal = computeStyleDna(store.styleVotes);
  const topTag =
    Object.entries(styleDnaGlobal).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Urbano Andino';

  const sortedGaps = [...allGaps].sort(
    (a, b) => b.deficitPct * b.estimatedDemandUnits - a.deficitPct * a.estimatedDemandUnits,
  );
  const chosen: ClosetGap[] = [];
  for (const gap of sortedGaps) {
    if (chosen.some((c) => c.region === gap.region && c.closetCategory === gap.closetCategory)) continue;
    if (chosen.some((c) => c.closetCategory === gap.closetCategory) && chosen.length >= 2) continue;
    chosen.push(gap);
    if (chosen.length >= 3) break;
  }
  while (chosen.length < 3 && sortedGaps[chosen.length]) {
    const next = sortedGaps[chosen.length];
    if (next && !chosen.includes(next)) chosen.push(next);
    else break;
  }

  const recommendations: HybridDesignRecommendation[] = chosen.map((gap, index) => {
    const { name, variant } = hybridName(gap);
    const color = topColorHex(store, gap.region);
    const category = gap.garmentCategory;
    const demand = Math.max(12, gap.estimatedDemandUnits);
    const baseCost = BASE_PRODUCTION_COST[category];
    const suggestedPriceUsd = round2(baseCost / (1 - 0.32));
    const fabricMetersPerUnit = FABRIC_METERS_BY_CATEGORY[category];
    const breakdown = calculateFinancialBreakdown({
      grossRevenueUsd: round2(suggestedPriceUsd * demand),
      fabricMeters: round2(fabricMetersPerUnit * demand),
      totalUnits: demand,
      marginPct: 32,
    });
    const slugBase = name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    return {
      id: `hybrid-${gap.region.toLowerCase()}-${gap.closetCategory.toLowerCase()}-${index + 1}`,
      name,
      slug: slugBase,
      region: gap.region,
      closetCategory: gap.closetCategory,
      category,
      visualVariant: variant,
      styleTag: topTag,
      colorName: color.colorName,
      colorHex: color.colorHex,
      fabricName: fabricNameFor(store, category),
      fabricMetersPerUnit,
      fabricMetersTotal: round2(fabricMetersPerUnit * demand),
      estimatedDemandUnits: demand,
      mpdPerUnitUsd: round2(breakdown.mpdCostUsd / demand),
      modPerUnitUsd: round2(breakdown.modCostUsd / demand),
      cifPerUnitUsd: round2(breakdown.cifCostUsd / demand),
      productionCostPerUnitUsd: round2(
        (breakdown.mpdCostUsd + breakdown.modCostUsd + breakdown.cifCostUsd) / demand,
      ),
      suggestedPriceUsd,
      marginPct: 32,
      baseTimeMinutes: BASE_TIME_MINUTES[category],
      rationale: `${gap.label}. ADN dominante: ${topTag}. Tela de bodega Riobamba: ${fabricNameFor(store, category)}.`,
    };
  });

  const closetUsers = new Set([...store.closetItems.values()].map((i) => i.userId)).size;
  const totalUsers = store.users.size;
  const cpws = [...store.closetItems.values()].map((item) => {
    const garment = item.garmentId ? store.garments.get(item.garmentId) : undefined;
    return costPerWearOfItem(item, garment?.baseSalePrice ?? 12);
  });
  const likedVotes = store.styleVotes.filter((v) => v.liked).length;

  return {
    generatedAt: new Date().toISOString(),
    closetGapsByRegion: gapsByRegion,
    hybridDesignRecommendations: recommendations,
    blueOceanMetrics: {
      madeToOrderDeadInventoryPct: 0,
      traditionalRetailDeadInventoryPct: 30,
      plantMachines: store.machines.length,
      avgProductionMinutesPerUnit: round2(
        [...store.garments.values()].reduce((acc, g) => acc + g.baseTimeMinutes, 0) /
          Math.max(1, store.garments.size),
      ),
      totalPlantQueueMinutes: store.machines.reduce((acc, m) => acc + m.queueMinutes, 0),
      totalUsers,
      closetActiveUsers: closetUsers,
      closetRetentionPct: totalUsers ? round2((closetUsers / totalUsers) * 100) : 0,
      avgCostPerWearUsd: cpws.length ? round2(cpws.reduce((a, b) => a + b, 0) / cpws.length) : 0,
      totalStyleVotes: store.styleVotes.length,
      likedVotes,
      likedPct: store.styleVotes.length ? round2((likedVotes / store.styleVotes.length) * 100) : 0,
      cmsMonthlyCostUsd: 0,
      strategyCanvas: [
        { factor: 'Inventario muerto', gumorose: '0% Made-to-Order', traditionalRetail: '~30% stock muerto' },
        { factor: 'Tiempo de ciclo', gumorose: 'Producción Riobamba bajo pedido', traditionalRetail: 'Colecciones por temporada' },
        { factor: 'Personalización', gumorose: 'Clóset IA + Multi-Logo + Try-On Anatómico', traditionalRetail: 'Tallas estándar sin ajuste' },
        { factor: 'Costo de software', gumorose: 'CMS propio $0 + caché SHA-256', traditionalRetail: 'SaaS por suscripción' },
        { factor: 'Retención', gumorose: 'Clóset diario + Costo por Uso (CPW)', traditionalRetail: 'Compra única sin clóset' },
      ],
    },
    styleDnaGlobal,
    totals: {
      users: totalUsers,
      closetItems: store.closetItems.size,
      styleVotes: store.styleVotes.length,
      orders: store.erpOrders.size,
    },
  };
}

export { BASE_TIME_MINUTES, FINISHING_MINUTES, SEWING_MINUTES, getVolumeDiscountPct };
