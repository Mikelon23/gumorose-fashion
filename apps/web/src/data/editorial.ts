import type { EcuadorRegion, GarmentTemplate } from '@gumorose/shared';

/** Vista de modelo en tarjeta (Abercrombie "Switch Model"). */
export type ModelView = 'STUDIO' | 'MODEL_SM' | 'MODEL_LXL' | 'MY_BODY';

export const MODEL_VIEW_LABEL: Record<ModelView, string> = {
  STUDIO: 'Vista Prenda Studio',
  MODEL_SM: 'Modelo Talla S/M',
  MODEL_LXL: 'Modelo Talla L/XL',
  MY_BODY: 'En Mi Cuerpo',
};

export const MODEL_VIEW_ORDER: ModelView[] = ['STUDIO', 'MODEL_SM', 'MODEL_LXL', 'MY_BODY'];

/** Ancho de torso sugerido por modelo (escala corporal de la silueta). */
export const MODEL_TORSO_WIDTH: Record<Exclude<ModelView, 'STUDIO'>, number> = {
  MODEL_SM: 46,
  MODEL_LXL: 66,
  MY_BODY: 56,
};

/** Composición editorial real por tipo de prenda (Fabric callout). */
export function fabricCompositionOf(garment: GarmentTemplate): string {
  if (garment.visualVariant === 'HOODIE') return 'Felpa térmica 350 g/m² · 80% Algodón - 20% Poliéster';
  if (garment.visualVariant === 'GORRA') return 'Sarga estructurada · 100% Algodón';
  if (garment.category === 'PANTALON') {
    if (garment.visualVariant === 'JOGGER') return 'Felpa perchada · 65% Poliéster - 35% Algodón';
    if (garment.visualVariant === 'CARGO') return 'Sarga resistente · 65% Poliéster - 35% Algodón';
    return 'Gabardina satén · 65% Poliéster - 35% Algodón';
  }
  if (garment.category === 'CAMISA' || garment.category === 'POLO') return '65% Poliéster - 35% Algodón';
  return '100% Algodón Peinado 220g';
}

/** Corte editorial (Fit callout). */
export function fitOf(garment: GarmentTemplate): string {
  if (garment.visualVariant === 'JOGGER') return 'Athletic Tapered';
  if (garment.visualVariant === 'HOODIE' || garment.visualVariant === 'CARGO') return 'Relaxed Streetwear';
  if (garment.category === 'CAMISA') return 'Tailored Fit';
  if (garment.category === 'PANTALON') return 'Tailored Fit';
  if (garment.category === 'POLO') return 'Tailored Fit';
  return 'Relaxed Streetwear';
}

function isCap(garment: GarmentTemplate): boolean {
  return garment.visualVariant === 'GORRA';
}

function isTop(garment: GarmentTemplate): boolean {
  return garment.category !== 'PANTALON' && !isCap(garment);
}

/**
 * "Complete the Look": prenda ancla + contraparte ideal del catálogo.
 * Superior -> Pantalón Chino Sastre + Gorra; Pantalón -> superior + Gorra.
 */
export function completeTheLook(
  anchor: GarmentTemplate,
  catalog: GarmentTemplate[],
): GarmentTemplate[] {
  const others = catalog.filter((g) => g.id !== anchor.id);
  const chino = others.find((g) => g.visualVariant === 'CHINO');
  const anyPants = others.find((g) => g.category === 'PANTALON');
  const cap = others.find((g) => isCap(g));
  const anyTop = others.find((g) => isTop(g));
  const look: GarmentTemplate[] = [anchor];
  const push = (g: GarmentTemplate | undefined): void => {
    if (g && !look.some((x) => x.id === g.id) && look.length < 3) look.push(g);
  };
  if (isCap(anchor)) {
    push(anyTop);
    push(chino ?? anyPants);
  } else if (anchor.category === 'PANTALON') {
    push(anyTop);
    push(cap);
  } else {
    push(chino ?? anyPants);
    push(cap);
  }
  // Si faltó la gorra en catálogo, completa con cualquier otra prenda distinta.
  if (look.length < 3) push(others.find((g) => !look.some((x) => x.id === g.id)));
  return look;
}

/* ------------------------------------------------------------------ */
/* Editorial comercial: CPW, showcase y curaduría (Stitch Fix / Whering) */
/* ------------------------------------------------------------------ */

/** Puestas de referencia para el Costo por Uso editorial (Acloset CPW). */
export const CPW_REFERENCE_USES = 50;

/** Costo por uso en USD: precio dividido entre puestas estimadas. */
export function costPerWearUsd(priceUsd: number, uses: number = CPW_REFERENCE_USES): number {
  const safeUses = Math.max(1, Math.floor(uses));
  return Math.round((priceUsd / safeUses) * 100) / 100;
}

export function formatCpw(priceUsd: number, uses: number = CPW_REFERENCE_USES): string {
  return `~$${costPerWearUsd(priceUsd, uses).toFixed(2)} / uso`;
}

/** SKU visible de la prenda (slug del catálogo). */
export function skuOf(garment: GarmentTemplate): string {
  return garment.slug;
}

export type ShowcaseKey = 'TEES_POLOS' | 'CAMISAS' | 'PANTALONES' | 'HOODIES' | 'ACCESORIOS';

export interface CategoryShowcaseDef {
  key: ShowcaseKey;
  title: string;
  priceLabel: string;
  fabricNote: string;
  minutesLabel: string;
  /** Categoría a filtrar, si aplica. */
  category?: 'CAMISETA' | 'POLO' | 'CAMISA' | 'PANTALON';
  /** Variante visual a filtrar, si aplica (hoodie / gorra). */
  variant?: string;
  accentHex: string;
}

export const CATEGORY_SHOWCASE: CategoryShowcaseDef[] = [
  {
    key: 'TEES_POLOS',
    title: 'Camisetas & Polos',
    priceLabel: '$8.65 – $11.57',
    fabricNote: 'Algodón peinado 220g y Piqué ejecutivo',
    minutesLabel: '27 min en planta',
    category: 'CAMISETA',
    accentHex: '#C86D51',
  },
  {
    key: 'CAMISAS',
    title: 'Camisas Sastre',
    priceLabel: '$16.71',
    fabricNote: 'Oxford manga larga · corte estructurado',
    minutesLabel: '44 min en planta',
    category: 'CAMISA',
    accentHex: '#2F4842',
  },
  {
    key: 'PANTALONES',
    title: 'Pantalones Anatómicos',
    priceLabel: '$17.90 – $21.50',
    fabricNote: 'Chino Sastre · Cargo Chimborazo · Jogger',
    minutesLabel: '40–50 min en planta',
    category: 'PANTALON',
    accentHex: '#141413',
  },
  {
    key: 'HOODIES',
    title: 'Abrigos & Hoodies',
    priceLabel: '$24.50',
    fabricNote: 'Felpa térmica 350g para la Sierra',
    minutesLabel: '48 min en planta',
    variant: 'HOODIE',
    accentHex: '#7C2D2D',
  },
  {
    key: 'ACCESORIOS',
    title: 'Accesorios Bordados',
    priceLabel: '$9.50',
    fabricNote: 'Gorras e indumentaria complementaria',
    minutesLabel: '20 min en planta',
    variant: 'GORRA',
    accentHex: '#C59B27',
  },
];

export type FitPreference = 'TAILORED' | 'RELAXED' | 'EJECUTIVO';
export type StylePreset = 'URBANO_ANDINO' | 'EJECUTIVO_SASTRE' | 'FRESCO_COSTENO';

export const FIT_PREFERENCE_LABEL: Record<FitPreference, string> = {
  TAILORED: 'Tailored Fit',
  RELAXED: 'Relaxed Streetwear',
  EJECUTIVO: 'Ejecutivo',
};

export const STYLE_PRESET_LABEL: Record<StylePreset, string> = {
  URBANO_ANDINO: 'Estilo Urbano Andino',
  EJECUTIVO_SASTRE: 'Ejecutivo Sastre',
  FRESCO_COSTENO: 'Fresco Costeño',
};

export const CLIMATE_EDIT_META: Record<
  EcuadorRegion,
  { label: string; tempLabel: string; note: string }
> = {
  COSTA: {
    label: 'Costa Cálida',
    tempLabel: '30°C',
    note: 'Fresco y transpirable para el litoral.',
  },
  SIERRA: {
    label: 'Sierra Templada / Fría',
    tempLabel: '11°C',
    note: 'Capas térmicas confeccionadas en Riobamba.',
  },
  ORIENTE: {
    label: 'Oriente Tropical',
    tempLabel: '25°C',
    note: 'Secado rápido para la humedad amazónica.',
  },
};

function pickFirst(
  catalog: GarmentTemplate[],
  used: Set<string>,
  test: (g: GarmentTemplate) => boolean,
): GarmentTemplate | undefined {
  return catalog.find((g) => !used.has(g.id) && test(g));
}

/**
 * Tres prendas curadas para hoy según clima + corte (regla determinista,
 * sin llamadas externas: clima → tejido, corte → fit, clóset → contraste).
 */
export function curatedTrioFor(
  catalog: GarmentTemplate[],
  region: EcuadorRegion,
  fit: FitPreference,
): { garment: GarmentTemplate; reason: string }[] {
  const used = new Set<string>();
  const take = (test: (g: GarmentTemplate) => boolean, reason: string): void => {
    const found = pickFirst(catalog, used, test);
    if (found) {
      used.add(found.id);
      trio.push({ garment: found, reason });
    }
  };
  const trio: { garment: GarmentTemplate; reason: string }[] = [];
  const inRegion = (g: GarmentTemplate): boolean => g.recommendedRegions.includes(region);
  const warm = region === 'SIERRA';
  const tailored = fit !== 'RELAXED';

  if (warm) {
    take(
      (g) => g.visualVariant === 'HOODIE',
      'Capa térmica 350g: retiene calor en la Sierra sin perder movilidad.',
    );
  } else {
    take(
      (g) => g.category === 'CAMISETA' && g.visualVariant !== 'HOODIE',
      region === 'COSTA'
        ? 'Algodón liviano que respira a 30°C en el litoral.'
        : 'Tejido fresco de secado rápido para la humedad del Oriente.',
    );
  }
  if (fit === 'EJECUTIVO') {
    take(
      (g) => g.category === 'CAMISA' || g.category === 'POLO',
      'Silueta estructurada de oficina con caída sastre.',
    );
  } else if (tailored) {
    take(
      (g) => g.category === 'POLO' || g.category === 'CAMISA',
      'Corte Tailored que ordena el torso sin ceñir.',
    );
  } else {
    take(
      (g) => g.category === 'CAMISETA',
      'Caída Relaxed Streetwear para uso diario sin esfuerzo.',
    );
  }
  take(
    (g) => g.category === 'PANTALON',
    fit === 'RELAXED'
      ? 'Base anatómica cómoda que combina con todo el clóset.'
      : 'Pantalón anatómico que cierra el look con proporción sastre.',
  );
  // Completar hasta 3 con la mejor coincidencia de región restante.
  while (trio.length < 3) {
    const next =
      pickFirst(catalog, used, inRegion) ?? pickFirst(catalog, used, () => true);
    if (!next) break;
    used.add(next.id);
    trio.push({
      garment: next,
      reason: 'Selección del editor por clima y compatibilidad de clóset.',
    });
  }
  return trio.slice(0, 3);
}

/** Trío del carrusel según preset de estilo (Slide 2). */
export function stylePresetTrio(
  catalog: GarmentTemplate[],
  preset: StylePreset,
): GarmentTemplate[] {
  if (preset === 'EJECUTIVO_SASTRE') {
    return curatedTrioFor(catalog, 'SIERRA', 'EJECUTIVO').map((t) => t.garment);
  }
  if (preset === 'FRESCO_COSTENO') {
    return curatedTrioFor(catalog, 'COSTA', 'RELAXED').map((t) => t.garment);
  }
  return curatedTrioFor(catalog, 'SIERRA', 'RELAXED').map((t) => t.garment);
}

/** Busca una prenda del catálogo por variante o categoría (hero). */
export function heroGarment(
  catalog: GarmentTemplate[],
  test: (g: GarmentTemplate) => boolean,
): GarmentTemplate | undefined {
  return catalog.find(test);
}

/** Categorías de clóset complementarias para el Whering Match. */
export function closetMatchCountFor(
  garment: GarmentTemplate,
  closetByCategory: Record<string, number>,
  catalog: GarmentTemplate[],
): number {
  const closetTotal = Object.values(closetByCategory).reduce((a, b) => a + b, 0);
  if (closetTotal > 0) {
    const count = (key: string): number => closetByCategory[key] ?? 0;
    if (isCap(garment)) return count('SUPERIOR_CAMISETA') + count('SUPERIOR_CAMISA') + count('INFERIOR_PANTALON');
    if (garment.category === 'PANTALON') return count('SUPERIOR_CAMISETA') + count('SUPERIOR_CAMISA') + count('ACCESORIO');
    return count('INFERIOR_PANTALON') + count('ACCESORIO');
  }
  // Sin clóset sincronizado: compatibilidad contra el propio catálogo.
  if (isCap(garment)) return catalog.filter((g) => g.id !== garment.id).length;
  if (garment.category === 'PANTALON') return catalog.filter((g) => isTop(g)).length;
  return catalog.filter((g) => g.category === 'PANTALON' || isCap(g)).length;
}
