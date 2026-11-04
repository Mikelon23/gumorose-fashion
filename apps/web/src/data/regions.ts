import type { EcuadorRegion, GarmentCategory } from '@gumorose/shared';

/** Regiones del Ecuador con su perfil climático comercial. */
export const REGION_ORDER: EcuadorRegion[] = ['COSTA', 'SIERRA', 'ORIENTE'];

export const REGION_META: Record<
  EcuadorRegion,
  { label: string; clima: string; detalle: string }
> = {
  COSTA: {
    label: 'Costa',
    clima: 'Cálido / ligero',
    detalle: 'Prendas frescas y livianas para el calor húmedo del litoral.',
  },
  SIERRA: {
    label: 'Sierra',
    clima: 'Templado / frío · sede Riobamba',
    detalle: 'Capas abrigadas para el frío andino, confeccionadas en Riobamba.',
  },
  ORIENTE: {
    label: 'Oriente Amazónico',
    clima: 'Húmedo / tropical',
    detalle: 'Telas frescas de secado rápido para el clima selvático.',
  },
};

export interface Provincia {
  nombre: string;
  ciudades: string[];
}

/** Provincias y ciudades de entrega por región. */
export const PROVINCIAS: Record<EcuadorRegion, Provincia[]> = {
  COSTA: [
    { nombre: 'Guayas', ciudades: ['Guayaquil', 'Durán', 'Samborondón'] },
    { nombre: 'Manabí', ciudades: ['Manta', 'Portoviejo'] },
    { nombre: 'Esmeraldas', ciudades: ['Esmeraldas', 'Atacames'] },
    { nombre: 'El Oro', ciudades: ['Machala', 'Pasaje'] },
    { nombre: 'Santa Elena', ciudades: ['Santa Elena', 'La Libertad', 'Salinas'] },
    { nombre: 'Los Ríos', ciudades: ['Babahoyo', 'Quevedo'] },
    { nombre: 'Santo Domingo', ciudades: ['Santo Domingo'] },
  ],
  SIERRA: [
    { nombre: 'Pichincha', ciudades: ['Quito', 'Cayambe'] },
    { nombre: 'Chimborazo', ciudades: ['Riobamba', 'Guano'] },
    { nombre: 'Azuay', ciudades: ['Cuenca', 'Gualaceo'] },
    { nombre: 'Tungurahua', ciudades: ['Ambato', 'Baños'] },
    { nombre: 'Imbabura', ciudades: ['Ibarra', 'Otavalo'] },
    { nombre: 'Loja', ciudades: ['Loja'] },
    { nombre: 'Cotopaxi', ciudades: ['Latacunga'] },
    { nombre: 'Cañar', ciudades: ['Azogues'] },
    { nombre: 'Carchi', ciudades: ['Tulcán'] },
    { nombre: 'Bolívar', ciudades: ['Guaranda'] },
  ],
  ORIENTE: [
    { nombre: 'Napo', ciudades: ['Tena'] },
    { nombre: 'Pastaza', ciudades: ['Puyo'] },
    { nombre: 'Morona Santiago', ciudades: ['Macas'] },
    { nombre: 'Zamora Chinchipe', ciudades: ['Zamora'] },
    { nombre: 'Orellana', ciudades: ['Coca'] },
    { nombre: 'Sucumbíos', ciudades: ['Nueva Loja'] },
  ],
};

/** Nombre de color del catálogo -> HEX aproximado para la vista previa. */
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

export const CATEGORY_LABEL: Record<GarmentCategory, string> = {
  CAMISETA: 'Camisetas',
  POLO: 'Polos',
  CAMISA: 'Camisas',
  PANTALON: 'Pantalones',
};

export const CATEGORY_ORDER: GarmentCategory[] = ['CAMISETA', 'POLO', 'CAMISA', 'PANTALON'];
