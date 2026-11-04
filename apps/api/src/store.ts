/**
 * Almacén en memoria del API.
 * Se inicializa con las semillas de la planta (`db/seed.ts`).
 * Cuando `DATABASE_URL` esté configurada, este store se reemplaza por
 * el adaptador PostgreSQL/Supabase sin cambiar las rutas.
 */
import { randomUUID } from 'node:crypto';
import type {
  ClosetOutfit,
  CustomDesign,
  EcuadorRegion,
  ErpProductionOrder,
  FinancialLedgerEntry,
  GarmentTemplate,
  GumoroseBox,
  OrderItemDetail,
  MlUserPreferenceRecord,
  PlantMachineStatus,
  RawMaterial,
  SriElectronicInvoice,
  StyleShuffleVote,
  SupplyPurchaseAlert,
  SystemUser,
  UserClosetItem,
  UserProfile,
} from '@gumorose/shared';
import { loadSeed } from './db/seed.js';

/** Línea persistida de una caja (diseño + prenda + cantidad). */
export interface StoredBoxLine {
  designId: string;
  garmentId: string;
  garmentName: string;
  category: GarmentTemplate['category'];
  quantity: number;
  logosCount: number;
  unitPriceUsd: number;
  lineTotalUsd: number;
  /** Talla y color elegidos en tienda (detalle visible en Mis Pedidos/Planta). */
  size?: string;
  color?: string;
}

export type StoredBox = GumoroseBox & {
  lines: StoredBoxLine[];
  /** Creación de la cotización (ISO): ordena el historial de más reciente a más antigua. */
  createdAt: string;
};

/** Voto Style Shuffle persistido con su usuario y región climática. */
export interface StyleVoteRecord extends StyleShuffleVote {
  userId: string;
  region: EcuadorRegion;
}

export interface Store {
  garments: Map<string, GarmentTemplate>;
  designs: Map<string, CustomDesign>;
  boxes: Map<string, StoredBox>;
  machines: PlantMachineStatus[];
  materials: RawMaterial[];
  users: Map<string, UserProfile>;
  closetItems: Map<string, UserClosetItem>;
  outfits: Map<string, ClosetOutfit>;
  /** Votos 👍/👎 del Style Shuffle móvil (alimentan Hybrid Designs). */
  styleVotes: StyleVoteRecord[];
  /** Seis roles oficiales (semillas + altas de Superadmin). */
  systemUsers: Map<string, SystemUser>;
  /** Órdenes oficiales de planta (OP-XXXX). */
  erpOrders: Map<string, ErpProductionOrder>;
  /** Libro financiero (un asiento por orden pagada). */
  ledgerEntries: FinancialLedgerEntry[];
  /** Alertas de compra hacia Neymatex Guano. */
  purchaseAlerts: SupplyPurchaseAlert[];
  /** Facturas electrónicas SRI emitidas por el microservicio. */
  sriInvoices: Map<string, SriElectronicInvoice>;
  /** Siguiente secuencial SRI (001-001-000000001...). */
  nextSriSequential: number;
  /** Dataset de preferencias ML por usuario. */
  mlPreferences: Map<string, MlUserPreferenceRecord>;
}

export function createStore(): Store {
  const seed = loadSeed();
  return {
    garments: new Map(seed.garments.map((g) => [g.id, g])),
    designs: new Map(),
    boxes: new Map(),
    machines: seed.machines,
    materials: seed.materials,
    users: new Map(),
    closetItems: new Map(),
    outfits: new Map(),
    styleVotes: [],
    systemUsers: new Map(seed.systemUsers.map((u) => [u.id, u])),
    erpOrders: new Map(),
    ledgerEntries: [],
    purchaseAlerts: [],
    sriInvoices: new Map(),
    nextSriSequential: 1,
    mlPreferences: new Map(),
  };
}

/** Suma de minutos en cola de todas las máquinas (carga actual de planta). */
export function totalPlantQueue(machines: PlantMachineStatus[]): number {
  return machines.reduce((acc, m) => acc + Math.max(0, m.queueMinutes), 0);
}

/** Conteo de máquinas por estado. */
export function machinesSummary(machines: PlantMachineStatus[]): {
  total: number;
  activas: number;
  mantenimiento: number;
  inactivas: number;
  porTipo: Record<string, number>;
} {
  const porTipo: Record<string, number> = {};
  let activas = 0;
  let mantenimiento = 0;
  let inactivas = 0;
  for (const m of machines) {
    porTipo[m.kind] = (porTipo[m.kind] ?? 0) + 1;
    if (m.status === 'ACTIVA') activas++;
    else if (m.status === 'MANTENIMIENTO') mantenimiento++;
    else inactivas++;
  }
  return { total: machines.length, activas, mantenimiento, inactivas, porTipo };
}

export function newId(): string {
  return randomUUID();
}

/**
 * Cruza las líneas de una caja con el catálogo y los diseños custom para
 * devolver el detalle completo de prendas (nombre, SKU/slug, talla, color,
 * cantidades, precios y logos con zona/técnica).
 */
export function detailItemsForBox(store: Store, box: StoredBox): OrderItemDetail[] {
  return box.lines.map((line) => {
    const catalog = store.garments.get(line.garmentId);
    const design = store.designs.get(line.designId);
    return {
      designId: line.designId,
      garmentId: line.garmentId,
      garmentName: line.garmentName,
      category: line.category,
      garmentSlug: catalog?.slug,
      size: line.size,
      color: line.color,
      quantity: line.quantity,
      logosCount: line.logosCount,
      unitPriceUsd: line.unitPriceUsd,
      lineTotalUsd: line.lineTotalUsd,
      designLogos: design?.logos.map((logo) => ({
        zone: logo.zone,
        technique: logo.technique,
      })),
    };
  });
}

/** Más reciente primero (`createdAt` descendente, el último pedido en la posición 0). */
export function newestFirst<T extends { createdAt: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}
