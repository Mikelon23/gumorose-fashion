/**
 * Semillas reales de la planta Gumorose (Riobamba) y catálogo inicial.
 *
 * El almacén en memoria se inicializa con estos datos. Cuando exista
 * `DATABASE_URL` (PostgreSQL/Supabase), este mismo módulo es el contrato
 * de filas a insertar — ver `schema.sql` en `@gumorose/shared`.
 */
import { randomUUID } from 'node:crypto';
import type {
  GarmentTemplate,
  PlantMachineStatus,
  RawMaterial,
  SystemUser,
  UserRole,
} from '@gumorose/shared';

export interface SeedData {
  machines: PlantMachineStatus[];
  garments: GarmentTemplate[];
  materials: RawMaterial[];
  systemUsers: SystemUser[];
}

function machine(
  code: string,
  kind: PlantMachineStatus['kind'],
  queueMinutes = 0,
  status: PlantMachineStatus['status'] = 'ACTIVA',
): PlantMachineStatus {
  return { id: randomUUID(), code, kind, status, queueMinutes };
}

/**
 * Inventario físico de la planta Riobamba.
 * NOTA: el listado itemizado suma 21 unidades (2+5+4+5+1+1+1+1+1).
 * `GET /api/cms/plant-status` reporta el total real inventariado.
 */
export function seedMachines(): PlantMachineStatus[] {
  const list: PlantMachineStatus[] = [];
  // 2 Cortadoras
  list.push(machine('COR-01', 'CORTADORA'), machine('COR-02', 'CORTADORA'));
  // 5 Overlock
  for (let i = 1; i <= 5; i++) list.push(machine(`OVE-0${i}`, 'OVERLOCK'));
  // 4 Rectas
  for (let i = 1; i <= 4; i++) list.push(machine(`REC-0${i}`, 'RECTA'));
  // 5 Recubridoras
  for (let i = 1; i <= 5; i++) list.push(machine(`RCB-0${i}`, 'RECUBRIDORA'));
  // Especiales
  list.push(machine('OJA-01', 'OJALADORA'));
  list.push(machine('BOT-01', 'BOTONERA'));
  list.push(machine('EST-01', 'ESTAMPADORA'));
  list.push(machine('SUB-01', 'SUBLIMADORA'));
  list.push(machine('VIN-01', 'CORTADORA_VINIL'));
  return list;
}

function garment(g: Omit<GarmentTemplate, 'id'>): GarmentTemplate {
  return { ...g, id: randomUUID() };
}

/**
 * Catálogo inicial con recomendaciones climáticas por región.
 * 9 modelos oficiales: 3 superiores clásicas, 3 pantalones de molde
 * (Chino, Cargo, Jogger), Hoodie térmico y Gorra bordada.
 */
export function seedGarments(): GarmentTemplate[] {
  return [
    garment({
      slug: 'camiseta-cuello-redondo-gumorose-pro',
      name: 'Camiseta Cuello Redondo Gumorose Pro',
      category: 'CAMISETA',
      description:
        'Algodón peinado 180 g/m². Corte clásico unisex, ideal para uniformes y merch con multi-logo.',
      baseProductionCost: 6.56,
      baseMarginPct: 32,
      baseSalePrice: 8.65,
      baseTimeMinutes: 27,
      sewingMinutes: 9,
      finishingMinutes: 18,
      sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
      colors: ['BLANCO', 'NEGRO', 'AZUL_MARINO', 'GRIS', 'ROJO'],
      recommendedRegions: ['COSTA', 'SIERRA', 'ORIENTE'],
      climateNote:
        'Costa: liviana y transpirable para calor húmedo. Sierra: base ideal con chaqueta encima. Oriente: secado rápido en clima lluvioso.',
      imageUrl: 'https://cdn.gumorose.ec/garments/camiseta-redondo.png',
      visualVariant: 'CAMISETA',
      active: true,
    }),
    garment({
      slug: 'camiseta-tipo-polo',
      name: 'Polo Piqué Ejecutivo',
      category: 'POLO',
      description:
        'Piqué de algodón 220 g/m² con cuello tejido y tapeta de 2 botones. Imagen corporativa B2B.',
      baseProductionCost: 8.9,
      baseMarginPct: 30,
      baseSalePrice: 11.57,
      baseTimeMinutes: 32,
      sewingMinutes: 12,
      finishingMinutes: 20,
      sizes: ['S', 'M', 'L', 'XL', 'XXL'],
      colors: ['BLANCO', 'NEGRO', 'AZUL_MARINO', 'VERDE_BOTELLA', 'VINO'],
      recommendedRegions: ['SIERRA', 'COSTA'],
      climateNote:
        'Sierra: piqué abrigado para oficina y campo. Costa: usar colores claros para reflejar el sol.',
      imageUrl: 'https://cdn.gumorose.ec/garments/polo.png',
      visualVariant: 'POLO',
      active: true,
    }),
    garment({
      slug: 'camiseta-cuello-v',
      name: 'Camiseta Cuello V Algodón Premium',
      category: 'CAMISETA',
      description:
        'Algodón peinado 180 g/m² con escote en V reforzado. Corte moderno para retail y gimnasios.',
      baseProductionCost: 6.78,
      baseMarginPct: 32,
      baseSalePrice: 8.95,
      baseTimeMinutes: 27,
      sewingMinutes: 9,
      finishingMinutes: 18,
      sizes: ['XS', 'S', 'M', 'L', 'XL'],
      colors: ['BLANCO', 'NEGRO', 'GRIS', 'ROSADO', 'TURQUESA'],
      recommendedRegions: ['COSTA', 'ORIENTE', 'SIERRA'],
      climateNote:
        'Costa y Oriente: escote ventilado para calor. Sierra: combinar con buso en noches frías.',
      imageUrl: 'https://cdn.gumorose.ec/garments/camiseta-v.png',
      visualVariant: 'CUELLO_V',
      active: true,
    }),
    garment({
      slug: 'camisa-oxford-manga-larga',
      name: 'Camisa Oxford Manga Larga',
      category: 'CAMISA',
      description:
        'Popelina algodón-poliéster con ojal y botón reales (Ojaladora + Botonera en planta). Manga larga o corta.',
      baseProductionCost: 12.85,
      baseMarginPct: 30,
      baseSalePrice: 16.71,
      baseTimeMinutes: 44,
      sewingMinutes: 20,
      finishingMinutes: 24,
      sizes: ['S', 'M', 'L', 'XL', 'XXL'],
      colors: ['BLANCO', 'CELESTE', 'AZUL_MARINO', 'CUADROS_ROJOS'],
      recommendedRegions: ['SIERRA', 'COSTA'],
      climateNote:
        'Sierra: manga larga para el frío andino y presentaciones. Costa: manga corta en popelina liviana.',
      imageUrl: 'https://cdn.gumorose.ec/garments/camisa-oxford.png',
      visualVariant: 'CAMISA',
      active: true,
    }),
    garment({
      slug: 'pantalon-chino-sastre',
      name: 'Pantalón Chino Sastre Gumorose',
      category: 'PANTALON',
      description:
        'Gabardina satén con pretina estructurada, botón metálico y pliegue de planchado. Corte sastre para oficina y eventos.',
      baseProductionCost: 14.5,
      baseMarginPct: 30,
      baseSalePrice: 18.85,
      baseTimeMinutes: 44,
      sewingMinutes: 20,
      finishingMinutes: 24,
      sizes: ['28', '30', '32', '34', '36', '38'],
      colors: ['NEGRO', 'AZUL_MARINO', 'KAKI', 'GRIS_OSCURO'],
      recommendedRegions: ['SIERRA', 'COSTA', 'ORIENTE'],
      climateNote:
        'Sierra: gabardina abrigada para oficina. Costa: tonos claros para el calor. Oriente: costuras resistentes a la humedad.',
      imageUrl: 'https://cdn.gumorose.ec/garments/pantalon-chino.png',
      visualVariant: 'CHINO',
      active: true,
    }),
    garment({
      slug: 'pantalon-cargo-urbano-chimborazo',
      name: 'Pantalón Cargo Urbano Chimborazo',
      category: 'PANTALON',
      description:
        'Sarga resistente con bolsillos cargo de fuelle en ambos muslos y rodillas articuladas. Corte recto moderno urbano.',
      baseProductionCost: 16.54,
      baseMarginPct: 30,
      baseSalePrice: 21.5,
      baseTimeMinutes: 50,
      sewingMinutes: 24,
      finishingMinutes: 26,
      sizes: ['28', '30', '32', '34', '36', '38'],
      colors: ['NEGRO', 'KAKI', 'VERDE_BOTELLA', 'GRIS_OSCURO'],
      recommendedRegions: ['SIERRA', 'ORIENTE', 'COSTA'],
      climateNote:
        'Sierra y Oriente: sarga durable para campo y ciudad. Costa: bolsillos amplios para jornadas largas.',
      imageUrl: 'https://cdn.gumorose.ec/garments/pantalon-cargo.png',
      visualVariant: 'CARGO',
      active: true,
    }),
    garment({
      slug: 'jogger-algodon-deportivo',
      name: 'Jogger Algodón Deportivo',
      category: 'PANTALON',
      description:
        'Felpa perchada con cintura elástica, cordones ajustables y puños acanalados en tobillos. Urbano y deportivo.',
      baseProductionCost: 13.77,
      baseMarginPct: 30,
      baseSalePrice: 17.9,
      baseTimeMinutes: 40,
      sewingMinutes: 18,
      finishingMinutes: 22,
      sizes: ['XS', 'S', 'M', 'L', 'XL'],
      colors: ['NEGRO', 'GRIS', 'AZUL_MARINO', 'VINO'],
      recommendedRegions: ['COSTA', 'SIERRA', 'ORIENTE'],
      climateNote:
        'Costa: felpa fresca para entrenar. Sierra: capa base abrigada para correr en altura.',
      imageUrl: 'https://cdn.gumorose.ec/garments/jogger-deportivo.png',
      visualVariant: 'JOGGER',
      active: true,
    }),
    garment({
      slug: 'hoodie-termico-sierra-350g',
      name: 'Hoodie Térmico Sierra 350g',
      category: 'CAMISETA',
      description:
        'Felpa térmica 350 g/m² con capucha forrada y bolsillo canguro. Abrigo andino para frío de altura.',
      baseProductionCost: 18.56,
      baseMarginPct: 32,
      baseSalePrice: 24.5,
      baseTimeMinutes: 48,
      sewingMinutes: 22,
      finishingMinutes: 26,
      sizes: ['S', 'M', 'L', 'XL', 'XXL'],
      colors: ['GRIS_OSCURO', 'NEGRO', 'AZUL_MARINO', 'VINO'],
      recommendedRegions: ['SIERRA', 'COSTA', 'ORIENTE'],
      climateNote:
        'Sierra: térmico 350g para noches frías de Riobamba. Costa: capa ligera para brisa nocturna.',
      imageUrl: 'https://cdn.gumorose.ec/garments/hoodie-sierra.png',
      visualVariant: 'HOODIE',
      active: true,
    }),
    garment({
      slug: 'gorra-bordada-gumorose',
      name: 'Gorra / Accesorio Bordado Gumorose',
      category: 'CAMISETA',
      description:
        'Gorra de sarga con visera curva y bordado frontal del sello Gumorose. Accesorio para completar el look.',
      baseProductionCost: 7.19,
      baseMarginPct: 32,
      baseSalePrice: 9.5,
      baseTimeMinutes: 20,
      sewingMinutes: 8,
      finishingMinutes: 12,
      sizes: ['UNICA'],
      colors: ['NEGRO', 'BLANCO', 'AZUL_MARINO', 'ROJO'],
      recommendedRegions: ['COSTA', 'SIERRA', 'ORIENTE'],
      climateNote:
        'Costa y Oriente: visera para sol fuerte. Sierra: complemento urbano para todo el año.',
      imageUrl: 'https://cdn.gumorose.ec/garments/gorra-bordada.png',
      visualVariant: 'GORRA',
      active: true,
    }),
  ];
}

/** Stock inicial de telas e insumos. */
export function seedMaterials(): RawMaterial[] {
  const mat = (m: Omit<RawMaterial, 'id'>): RawMaterial => ({ ...m, id: randomUUID() });
  return [
    mat({
      sku: 'TEL-ALG180-BLA',
      name: 'Algodón peinado 180g blanco',
      kind: 'TELA',
      color: 'BLANCO',
      unit: 'm',
      stockQty: 1200,
      minStockQty: 200,
      unitCostUsd: 3.4,
    }),
    mat({
      sku: 'TEL-ALG180-NEG',
      name: 'Algodón peinado 180g negro',
      kind: 'TELA',
      color: 'NEGRO',
      unit: 'm',
      stockQty: 900,
      minStockQty: 200,
      unitCostUsd: 3.55,
    }),
    mat({
      sku: 'TEL-PIQUE-BLA',
      name: 'Piqué algodón 220g blanco',
      kind: 'TELA',
      color: 'BLANCO',
      unit: 'm',
      stockQty: 500,
      minStockQty: 150,
      unitCostUsd: 4.1,
    }),
    mat({
      sku: 'TEL-POP-CEL',
      name: 'Popelina celeste',
      kind: 'TELA',
      color: 'CELESTE',
      unit: 'm',
      stockQty: 420,
      minStockQty: 120,
      unitCostUsd: 3.9,
    }),
    mat({
      sku: 'TEL-GAB-AZM',
      name: 'Gabardina azul marino',
      kind: 'TELA',
      color: 'AZUL_MARINO',
      unit: 'm',
      stockQty: 380,
      minStockQty: 100,
      unitCostUsd: 4.6,
    }),
    mat({
      sku: 'HIL-POL-BLA',
      name: 'Hilo poliéster blanco',
      kind: 'HILO',
      unit: 'rollo',
      stockQty: 300,
      minStockQty: 60,
      unitCostUsd: 1.8,
    }),
    mat({
      sku: 'TIN-SER-NEG',
      name: 'Tinta serigrafía negra',
      kind: 'TINTA',
      color: 'NEGRO',
      unit: 'litro',
      stockQty: 60,
      minStockQty: 10,
      unitCostUsd: 12.5,
    }),
    mat({
      sku: 'VIN-TEXT-BLA',
      name: 'Vinil textil blanco',
      kind: 'VINIL',
      color: 'BLANCO',
      unit: 'm',
      stockQty: 150,
      minStockQty: 30,
      unitCostUsd: 5.2,
    }),
    mat({
      sku: 'BOT-CAM-11',
      name: 'Botón camisa 11mm',
      kind: 'BOTON',
      unit: 'unidad',
      stockQty: 5000,
      minStockQty: 1000,
      unitCostUsd: 0.03,
    }),
  ];
}

/** Seis usuarios semilla, uno por cada rol oficial. */
export function seedSystemUsers(): SystemUser[] {
  const now = new Date().toISOString();
  const user = (
    name: string,
    email: string,
    role: UserRole,
    extra?: Partial<SystemUser>,
  ): SystemUser => ({ id: randomUUID(), name, email, role, active: true, createdAt: now, ...extra });
  return [
    user('Super Admin Gumorose', 'superadmin@gumorose.ec', 'SUPER_ADMIN'),
    user('Gerencia Gumorose', 'gerencia@gumorose.ec', 'ADMIN_GERENCIA', {
      companyName: 'Gumorose Riobamba',
    }),
    user('Bodega Riobamba', 'bodega@gumorose.ec', 'ADMIN_BODEGA'),
    user('Planta Riobamba', 'planta@gumorose.ec', 'ADMIN_PLANTA'),
    user('Cliente B2C Demo', 'cliente.b2c@gumorose.ec', 'CLIENTE_B2C'),
    user('Cliente B2B Demo', 'cliente.b2b@gumorose.ec', 'CLIENTE_B2B', {
      companyName: 'Distribuidora Andina',
      ruc: '1790000000001',
    }),
  ];
}

/** Carga todas las semillas en un solo objeto listo para el store. */
export function loadSeed(): SeedData {
  return {
    machines: seedMachines(),
    garments: seedGarments(),
    materials: seedMaterials(),
    systemUsers: seedSystemUsers(),
  };
}
