/**
 * Conector y Bus de Eventos del ERP — Diagrama 1, Capa 3.
 *
 * Servicio basado en `EventEmitter` con registro (`erpEventLog`) y soporte
 * opcional de webhook externo (`ERP_EXTERNAL_WEBHOOK_URL`).
 *
 * - `emitOrderPaidCheckout`: ORDER_PAID_CHECKOUT (checkout de caja).
 * - `emitOrderStage11Completed`: ORDER_STAGE_11_COMPLETED (etapa 11).
 */
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import {
  buildLedgerEntryForOrder,
  calculateFabricMetersForBox,
  calculatePaymentSplit,
  FINISHING_MINUTES,
  resolvePaymentMode,
  round2,
  SEWING_MINUTES,
} from '@gumorose/shared';
import type {
  ClosetCategory,
  ErpProductionOrder,
  ErpWebhookEvent,
  ErpWebhookEventType,
  FinancialLedgerEntry,
  PaymentMode,
  SupplyPurchaseAlert,
  UserRole,
} from '@gumorose/shared';
import type { Store } from '../store.js';

export const erpEventEmitter = new EventEmitter();
erpEventEmitter.setMaxListeners(30);

/** Historial en memoria de eventos ERP (interno + webhook). */
export const erpEventLog: ErpWebhookEvent[] = [];

const SEWING_KINDS = ['OVERLOCK', 'RECTA', 'RECUBRIDORA'] as const;
const FINISHING_KINDS = [
  'ESTAMPADORA',
  'SUBLIMADORA',
  'CORTADORA',
  'CORTADORA_VINIL',
  'OJALADORA',
  'BOTONERA',
] as const;

function logEvent(
  type: ErpWebhookEventType,
  payload: Record<string, unknown>,
  ids?: { orderId?: string; orderCode?: string; boxId?: string },
): ErpWebhookEvent {
  const event: ErpWebhookEvent = {
    id: randomUUID(),
    type,
    timestamp: new Date().toISOString(),
    source: 'gumorose-erp-internal',
    orderId: ids?.orderId,
    orderCode: ids?.orderCode,
    boxId: ids?.boxId,
    payload,
  };
  erpEventLog.push(event);
  erpEventEmitter.emit(type, event);
  void dispatchExternalWebhook(event);
  return event;
}

async function dispatchExternalWebhook(event: ErpWebhookEvent): Promise<void> {
  const url = process.env.ERP_EXTERNAL_WEBHOOK_URL?.trim();
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(event),
    });
  } catch {
    // El webhook externo nunca rompe el flujo interno.
  }
}

function nextOrderCode(store: Store): string {
  const n = store.erpOrders.size + 1;
  return `OP-${String(1000 + n).slice(1).padStart(4, '0')}`;
}

function enqueueProductionMinutes(store: Store, sewingMinutes: number, finishingMinutes: number): void {
  const activas = store.machines.filter((m) => m.status === 'ACTIVA');
  if (activas.length === 0) return;
  const sewingMachines = activas.filter((m) =>
    (SEWING_KINDS as readonly string[]).includes(m.kind),
  );
  const finishingMachines = activas.filter((m) =>
    (FINISHING_KINDS as readonly string[]).includes(m.kind),
  );
  const targetsSewing = sewingMachines.length > 0 ? sewingMachines : activas;
  const targetsFinishing = finishingMachines.length > 0 ? finishingMachines : activas;

  if (sewingMinutes > 0) {
    const per = Math.ceil(sewingMinutes / targetsSewing.length);
    for (const m of targetsSewing) m.queueMinutes += per;
  }
  if (finishingMinutes > 0) {
    const per = Math.ceil(finishingMinutes / targetsFinishing.length);
    for (const m of targetsFinishing) m.queueMinutes += per;
  }
}

export interface CheckoutPaidInput {
  boxId: string;
  customerRole?: UserRole;
  paymentMode?: PaymentMode;
  buyerUserId?: string;
  operatorRole?: UserRole;
}

export interface CheckoutPaidResult {
  order: ErpProductionOrder;
  ledger: FinancialLedgerEntry;
  fabricMeters: number;
  alertsCreated: SupplyPurchaseAlert[];
}

/**
 * ORDER_PAID_CHECKOUT: descuenta tela, alerta a Neymatex, encola máquinas,
 * crea la OP en etapa 1 y registra el asiento contable. Atómico y síncrono
 * (el webhook externo se despacha en segundo plano).
 */
export function emitOrderPaidCheckout(store: Store, input: CheckoutPaidInput): CheckoutPaidResult {
  const box = store.boxes.get(input.boxId);
  if (!box) throw new Error('Caja no encontrada para el Event Bus ERP');

  const customerRole: UserRole = input.customerRole ?? 'CLIENTE_B2C';
  const paymentMode = resolvePaymentMode(input.paymentMode, customerRole, box.totalUnits);
  const split = calculatePaymentSplit(box.totalUsd, paymentMode);
  const fabricMeters = calculateFabricMetersForBox(box.lines);

  // --- Descuento de tela en Bodega Riobamba (materiales TELA por metros) ---
  let remaining = fabricMeters;
  const telas = store.materials
    .filter((m) => m.kind === 'TELA' && m.unit === 'm')
    .sort((a, b) => b.stockQty - a.stockQty);
  for (const mat of telas) {
    if (remaining <= 0) break;
    const take = Math.min(mat.stockQty, remaining);
    mat.stockQty = round2(mat.stockQty - take);
    remaining = round2(remaining - take);
  }

  // --- Alertas hacia Neymatex Guano cuando se perfora el mínimo ---
  const alertsCreated: SupplyPurchaseAlert[] = [];
  for (const mat of store.materials) {
    if (mat.stockQty < mat.minStockQty) {
      const alreadyActive = store.purchaseAlerts.some(
        (a) => a.materialId === mat.id && a.status === 'ACTIVA',
      );
      if (!alreadyActive) {
        const alert: SupplyPurchaseAlert = {
          id: randomUUID(),
          materialId: mat.id,
          sku: mat.sku,
          materialName: mat.name,
          supplier: 'Neymatex Guano',
          currentStockQty: mat.stockQty,
          minStockQty: mat.minStockQty,
          requestedQty: round2(Math.max(0, mat.minStockQty * 2 - mat.stockQty)),
          status: 'ACTIVA',
          createdAt: new Date().toISOString(),
        };
        store.purchaseAlerts.push(alert);
        alertsCreated.push(alert);
      }
    }
  }

  // --- Cola real en máquinas (costura vs acabado) ---
  let sewingMinutes = 0;
  let finishingMinutes = 0;
  for (const line of box.lines) {
    const qty = Math.max(0, Math.floor(line.quantity));
    sewingMinutes += (SEWING_MINUTES[line.category] ?? 0) * qty;
    const extraPerUnit = Math.max(0, line.logosCount - 1) * 4;
    finishingMinutes += ((FINISHING_MINUTES[line.category] ?? 0) + extraPerUnit) * qty;
  }
  enqueueProductionMinutes(store, sewingMinutes, finishingMinutes);

  // --- Orden oficial OP-XXXX en etapa 1 ---
  const orderId = randomUUID();
  const orderCode = nextOrderCode(store);
  const now = new Date().toISOString();
  const order: ErpProductionOrder = {
    id: orderId,
    orderCode,
    boxId: box.id,
    buyerUserId: input.buyerUserId,
    customerRole,
    paymentMode,
    amountPaidUsd: split.amountPaidUsd,
    balanceDueUsd: split.balanceDueUsd,
    totalUsd: round2(box.totalUsd),
    currentStage: '1_DISENO_ARTE',
    qualityCheckStatus: 'PENDIENTE',
    blueSealApplied: false,
    fabricMetersDeducted: fabricMeters,
    stageHistory: [
      {
        stage: '1_DISENO_ARTE',
        timestamp: now,
        operatorRole: input.operatorRole ?? 'SUPER_ADMIN',
        notes: `Checkout ${paymentMode} (${customerRole})`,
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
  store.erpOrders.set(orderId, order);

  // --- Asiento contable MPD/MOD/CIF + utilidad ---
  const ledger = buildLedgerEntryForOrder({
    orderId,
    orderCode,
    boxId: box.id,
    paymentMode,
    totalUsd: box.totalUsd,
    fabricMeters,
    totalUnits: box.totalUnits,
  });
  store.ledgerEntries.push(ledger);

  logEvent(
    'ORDER_PAID_CHECKOUT',
    {
      paymentMode,
      customerRole,
      totalUsd: box.totalUsd,
      amountPaidUsd: split.amountPaidUsd,
      balanceDueUsd: split.balanceDueUsd,
      fabricMeters,
      alertsCreated: alertsCreated.length,
    },
    { orderId, orderCode, boxId: box.id },
  );

  return { order, ledger, fabricMeters, alertsCreated };
}

function closetCategoryFor(category: string): ClosetCategory {
  switch (category) {
    case 'CAMISA':
      return 'SUPERIOR_CAMISA';
    case 'PANTALON':
      return 'INFERIOR_PANTALON';
    case 'POLO':
    case 'CAMISETA':
    default:
      return 'SUPERIOR_CAMISETA';
  }
}

/**
 * ORDER_STAGE_11_COMPLETED: sincroniza la caja a DESPACHADO y desbloquea
 * las prendas en el Clóset Virtual del comprador.
 */
export function emitOrderStage11Completed(
  store: Store,
  orderId: string,
  operatorRole: UserRole = 'ADMIN_PLANTA',
): { unlocked: number } {
  const order = store.erpOrders.get(orderId);
  if (!order) throw new Error('Orden ERP no encontrada');
  const box = store.boxes.get(order.boxId);
  if (!box) throw new Error('Caja de la orden no encontrada');

  box.status = 'DESPACHADO';

  let targetUserId = order.buyerUserId;
  if (!targetUserId || !store.users.has(targetUserId)) {
    targetUserId = order.buyerUserId ?? randomUUID();
    if (!store.users.has(targetUserId)) {
      store.users.set(targetUserId, {
        id: targetUserId,
        currentRegion: box.region,
        city: 'Riobamba',
      });
    }
    order.buyerUserId = targetUserId;
  }

  let unlocked = 0;
  for (const line of box.lines) {
    const hasDesign = store.designs.has(line.designId);
    const item = {
      id: randomUUID(),
      userId: targetUserId as string,
      category: closetCategoryFor(line.category),
      sourceType: (hasDesign ? 'DISENO_CUSTOM' : 'COMPRADO_GUMOROSE') as
        | 'DISENO_CUSTOM'
        | 'COMPRADO_GUMOROSE',
      garmentId: line.garmentId,
      designId: hasDesign ? line.designId : undefined,
      name: line.garmentName,
      imageCutoutUrl: undefined as string | undefined,
      colorHex: '#FFFFFF',
      warmthLevel: 'TEMPLADO' as const,
    };
    store.closetItems.set(item.id, item);
    unlocked += 1;
  }

  logEvent(
    'ORDER_STAGE_11_COMPLETED',
    { unlocked, buyerUserId: targetUserId, orderCode: order.orderCode },
    { orderId: order.id, orderCode: order.orderCode, boxId: box.id },
  );
  void operatorRole;
  return { unlocked };
}

/** Historial de eventos para `GET /api/erp/finance/summary`. */
export function getErpEventHistory(limit = 50): ErpWebhookEvent[] {
  return erpEventLog.slice(-Math.max(1, limit)).reverse();
}
