import type {
  ClosetCategory,
  EcuadorRegion,
  GarmentCategory,
  PrintTechnique,
  UserClosetItem,
  WarmthLevel,
} from '@gumorose/shared';
import { getClimateStylingRules } from '@gumorose/shared';

/* ------------------------------- colores ------------------------------- */

const COLOR_HEX_MAP: Record<string, string> = {
  BLANCO: '#F7F5F2',
  NEGRO: '#1C1917',
  AZUL_MARINO: '#213A5C',
  GRIS: '#9AA0A6',
  GRIS_OSCURO: '#44403C',
  ROJO: '#B91C1C',
  CUADROS_ROJOS: '#B91C1C',
  VERDE_BOTELLA: '#1E4D3B',
  VINO: '#7C2D2D',
  CELESTE: '#8FC3E8',
  ROSADO: '#F2B8C6',
  TURQUESA: '#3FBFB0',
  KAKI: '#A9A06B',
};

export function colorHexOf(colorName: string): string {
  const normalized = colorName.trim().toUpperCase();
  if (/^#[0-9A-Fa-f]{6}$/.test(colorName.trim())) return colorName.trim();
  return COLOR_HEX_MAP[normalized] ?? '#D6D3D1';
}

export function prettyColor(colorName: string): string {
  return colorName
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase());
}

/* ------------------------------ categorías ----------------------------- */

export const CLOSET_LABEL: Record<ClosetCategory, string> = {
  SUPERIOR_CAMISETA: 'Camisetas',
  SUPERIOR_CAMISA: 'Camisas',
  INFERIOR_PANTALON: 'Pantalones',
  ABRIGO: 'Abrigos',
  ACCESORIO: 'Accesorios',
};

export const CLOSET_ORDER: ClosetCategory[] = [
  'SUPERIOR_CAMISETA',
  'SUPERIOR_CAMISA',
  'INFERIOR_PANTALON',
  'ABRIGO',
  'ACCESORIO',
];

export const WARMTH_LABEL: Record<WarmthLevel, string> = {
  FRESCO: 'Fresco',
  TEMPLADO: 'Templado',
  CALIDO: 'Cálido',
};

export const GARMENT_TO_CLOSET: Record<GarmentCategory, ClosetCategory> = {
  CAMISETA: 'SUPERIOR_CAMISETA',
  POLO: 'SUPERIOR_CAMISETA',
  CAMISA: 'SUPERIOR_CAMISA',
  PANTALON: 'INFERIOR_PANTALON',
};

export const SOURCE_LABEL: Record<string, string> = {
  FOTO_PROPIA: 'Foto propia recortada con SAM 3.1',
  COMPRADO_GUMOROSE: 'Comprado en Gumorose',
  DISENO_CUSTOM: 'Diseño custom multi-logo',
};

/* ------------------------------ galería -------------------------------- */

export interface GallerySeal {
  name: string;
  url: string;
  technique: PrintTechnique;
}

function sealSvg(inner: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">` +
    `<circle cx="120" cy="120" r="104" fill="none" stroke="#211D19" stroke-width="7"/>` +
    `<circle cx="120" cy="120" r="88" fill="none" stroke="#C9A227" stroke-width="3"/>` +
    inner +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const GALLERY_SEALS: GallerySeal[] = [
  {
    name: 'Sol Andino',
    technique: 'SERIGRAFIA',
    url: sealSvg(
      `<circle cx="120" cy="120" r="30" fill="#B23A1D"/>` +
        `<g stroke="#211D19" stroke-width="6" stroke-linecap="round">` +
        `<line x1="120" y1="52" x2="120" y2="72"/>` +
        `<line x1="120" y1="168" x2="120" y2="188"/>` +
        `<line x1="52" y1="120" x2="72" y2="120"/>` +
        `<line x1="168" y1="120" x2="188" y2="120"/>` +
        `</g>`,
    ),
  },
  {
    name: 'Cóndor Urbano',
    technique: 'SUBLIMADO',
    url: sealSvg(
      `<path d="M60 140 L100 100 L120 128 L140 100 L180 140 L140 132 L120 150 L100 132 Z" fill="#211D19"/>` +
        `<path d="M70 160 L120 178 L170 160" fill="none" stroke="#B23A1D" stroke-width="7" stroke-linecap="round"/>`,
    ),
  },
  {
    name: 'Rosa Gumorose',
    technique: 'VINIL',
    url: sealSvg(
      `<circle cx="120" cy="112" r="26" fill="none" stroke="#B23A1D" stroke-width="7"/>` +
        `<circle cx="120" cy="112" r="12" fill="#B23A1D"/>` +
        `<path d="M120 138 L120 176" stroke="#1E4D3B" stroke-width="7" stroke-linecap="round"/>`,
    ),
  },
];

/* --------------------------- presets de clima --------------------------- */

export interface CityPreset {
  city: string;
  region: EcuadorRegion;
  tempC: number;
}

export const CITY_PRESETS: CityPreset[] = [
  { city: 'Riobamba', region: 'SIERRA', tempC: 10 },
  { city: 'Quito', region: 'SIERRA', tempC: 14 },
  { city: 'Guayaquil', region: 'COSTA', tempC: 31 },
  { city: 'Manta', region: 'COSTA', tempC: 28 },
  { city: 'Puyo', region: 'ORIENTE', tempC: 25 },
  { city: 'Tena', region: 'ORIENTE', tempC: 27 },
];

export const REGION_SHORT_LABEL: Record<EcuadorRegion, string> = {
  COSTA: 'Costa',
  SIERRA: 'Sierra',
  ORIENTE: 'Oriente',
};

/* --------------------------- retratos demo ------------------------------ */

function portraitSvg(accent: string, bg: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="560" viewBox="0 0 300 560">` +
    `<rect width="300" height="560" rx="24" fill="${bg}"/>` +
    `<circle cx="150" cy="90" r="42" fill="#E8DCCF"/>` +
    `<path d="M150 48 a42 42 0 0 1 36 62 l-10 -4 a30 30 0 0 0 -52 0 l-10 4 a42 42 0 0 1 36 -62" fill="#211D19"/>` +
    `<path d="M108 150 Q150 132 192 150 L206 170 L196 300 L188 470 L166 470 L160 310 L140 310 L134 470 L112 470 L104 300 L94 170 Z" fill="${accent}"/>` +
    `<rect x="118" y="300" width="64" height="10" rx="5" fill="#211D19" opacity="0.35"/>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export interface DemoPortrait {
  name: string;
  url: string;
}

export const DEMO_PORTRAITS: DemoPortrait[] = [
  { name: 'Retrato demo A', url: portraitSvg('#B23A1D', '#F4F1EC') },
  { name: 'Retrato demo B', url: portraitSvg('#213A5C', '#EDE8DF') },
];

/** Sujetos de prueba de cuerpo entero del Estudio (Móvil ⇄ Web). */
export interface StudioSubject {
  id: 'USUARIO' | 'MASCULINO' | 'FEMENINA';
  label: string;
  silhouetteUrl: string;
}

export const STUDIO_SUBJECTS: StudioSubject[] = [
  { id: 'USUARIO', label: 'Sujeto Usuario Activo', silhouetteUrl: portraitSvg('#B23A1D', '#F4F1EC') },
  { id: 'MASCULINO', label: 'Modelo Masculino Estudio', silhouetteUrl: portraitSvg('#213A5C', '#EDE8DF') },
  { id: 'FEMENINA', label: 'Modelo Femenina Estudio', silhouetteUrl: portraitSvg('#7C2D2D', '#F7ECEC') },
];

/* ------------------------------------------------------------------ */
/* Editorial móvil: armonía, composición, CPW y huecos de maleta       */
/* ------------------------------------------------------------------ */

/** Etiqueta corta de origen para la tarjeta editorial. */
export const SOURCE_SHORT_LABEL: Record<string, string> = {
  FOTO_PROPIA: 'SAM 3.1',
  COMPRADO_GUMOROSE: 'Planta Gumorose',
  DISENO_CUSTOM: 'Diseño Gumorose',
};

/** Composición textil orientativa por categoría de clóset. */
export function closetCompositionOf(item: UserClosetItem): string {
  switch (item.category) {
    case 'SUPERIOR_CAMISA':
      return 'Popelina algodón-poliéster · corte estructurado';
    case 'INFERIOR_PANTALON':
      return 'Gabardina / sarga · 65% Poliéster - 35% Algodón';
    case 'ABRIGO':
      return 'Felpa térmica 350 g/m² · abrigo andino';
    case 'ACCESORIO':
      return 'Sarga estructurada · bordado Gumorose';
    default:
      return 'Algodón peinado 220g · tejido respirable';
  }
}

/**
 * Armonía de color y clima (0–100): premia niveles térmicos coherentes
 * con la regla climática activa y una paleta contenida (2–4 colores).
 */
export function outfitHarmonyScore(
  items: UserClosetItem[],
  region: EcuadorRegion,
  tempC: number,
): number {
  if (items.length === 0) return 0;
  const rules = getClimateStylingRules(region, tempC);
  const warmHits = items.filter((i) => rules.warmthLevels.includes(i.warmthLevel)).length;
  const warmthRatio = warmHits / items.length;
  const distinctColors = new Set(items.map((i) => i.colorHex.toUpperCase())).size;
  const paletteScore = distinctColors <= 1 ? 0.7 : distinctColors <= 4 ? 1 : 0.75;
  const hasTop = items.some(
    (i) => i.category === 'SUPERIOR_CAMISETA' || i.category === 'SUPERIOR_CAMISA',
  );
  const hasBottom = items.some((i) => i.category === 'INFERIOR_PANTALON');
  const baseScore = hasTop && hasBottom ? 1 : hasTop || hasBottom ? 0.8 : 0.6;
  const raw = 100 * (0.55 * warmthRatio + 0.25 * paletteScore + 0.2 * baseScore);
  return Math.max(0, Math.min(100, Math.round(raw)));
}

/** Resumen del armario: conteo, valor y CPW promedio. */
export function closetSummaryOf(
  entries: { priceUsd: number; wears: number }[],
): { count: number; valueUsd: number; avgCpw: number } {
  const count = entries.length;
  const valueUsd = Math.round(entries.reduce((a, e) => a + e.priceUsd, 0) * 100) / 100;
  const avgCpw =
    count === 0
      ? 0
      : Math.round(
          (entries.reduce((a, e) => a + e.priceUsd / Math.max(1, e.wears), 0) / count) * 100,
        ) / 100;
  return { count, valueUsd, avgCpw };
}

/** Distribución de colores del armario (ADN de color), mayor a menor. */
export function colorDnaOf(
  items: UserClosetItem[],
): { hex: string; count: number; pct: number }[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const hex = item.colorHex.toUpperCase();
    counts.set(hex, (counts.get(hex) ?? 0) + 1);
  }
  const total = Math.max(1, items.length);
  return [...counts.entries()]
    .map(([hex, count]) => ({ hex, count, pct: Math.round((count / total) * 100) }))
    .sort((a, b) => b.count - a.count);
}

export interface PackingGap {
  missingCategory: ClosetCategory;
  message: string;
}

/**
 * Hueco clave de la maleta según destino: Sierra sin abrigo, Costa sin
 * accesorio de sol o cápsula sin pantalón. `null` = maleta completa.
 */
export function packingGapFor(dest: EcuadorRegion, packed: UserClosetItem[]): PackingGap | null {
  const has = (cat: ClosetCategory): boolean => packed.some((i) => i.category === cat);
  if (!has('INFERIOR_PANTALON')) {
    return {
      missingCategory: 'INFERIOR_PANTALON',
      message: 'Te falta un pantalón versátil para cerrar la cápsula.',
    };
  }
  if (dest === 'SIERRA' && !has('ABRIGO')) {
    return {
      missingCategory: 'ABRIGO',
      message: 'Sierra fría sin abrigo: suma una capa térmica 350g.',
    };
  }
  if (dest === 'COSTA' && !has('ACCESORIO')) {
    return {
      missingCategory: 'ACCESORIO',
      message: 'Costa con sol fuerte: te falta un accesorio (gorra).',
    };
  }
  if (dest === 'ORIENTE' && !has('ACCESORIO')) {
    return {
      missingCategory: 'ACCESORIO',
      message: 'Oriente húmedo: un accesorio liviano completa la maleta.',
    };
  }
  return null;
}
