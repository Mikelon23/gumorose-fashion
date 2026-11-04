/**
 * CMS propio + comercio unificado (Web y Móvil).
 *
 * - `GET /api/catalog` ............ catálogo público (solo activas).
 * - `/api/cms/garments*` ................ administración del CMS propio.
 * - `PATCH /api/cms/garments/:id/toggle` . activa/desactiva una prenda en 1 clic.
 * - `GET /api/cms/plant-status` ......... estado y cola de la planta Riobamba.
 * - `GET /api/cms/materials` ............ stock de telas e insumos.
 * - `POST /api/cms/materials` ........... alta de materia prima en bodega.
 * - `PATCH /api/cms/materials/:id` ...... actualiza stock de una materia prima.
 * - `POST /api/boxes/quote` ............. cotiza y persiste la caja COTIZADA.
 * - `GET /api/boxes/orders` ............. historial de cajas (?customerName, ?status).
 * - `GET /api/boxes/:id` ................ consulta una caja.
 * - `POST /api/boxes/checkout` .......... paga la caja (COTIZADA -> PAGADA).
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  boxQuoteSchema,
  calculateGarmentUnitPrice,
  calculateProductionAndDeliveryTime,
  checkoutSchema,
  garmentCreateSchema,
  isAnticipoEligible,
  type BoxItemInput,
  type GarmentTemplate,
  type RawMaterial,
} from '@gumorose/shared';
import { detailItemsForBox, machinesSummary, newId, newestFirst, totalPlantQueue, type Store, type StoredBox } from '../store.js';
import { emitOrderPaidCheckout } from '../services/erp-event-bus.js';
import { ERP_BODEGA_ROLES, requireRoles } from '../middlewares/auth-rbac.middleware.js';

/** Escritura del CMS de prendas: gerencia y superadmin (lectura pública). */
const CMS_WRITE_ROLES = ['SUPER_ADMIN', 'ADMIN_GERENCIA'] as const;

const garmentUpdateSchema = garmentCreateSchema.partial();

/** Alta de materia prima / tela en la bodega de Riobamba. */
const materialCreateSchema = z.object({
  sku: z.string().min(2).max(40),
  name: z.string().min(3).max(120),
  kind: z.enum(['TELA', 'HILO', 'TINTA', 'VINIL', 'BOTON', 'CIERRE', 'ETIQUETA', 'EMPAQUE']),
  color: z.string().max(30).optional(),
  unit: z.enum(['m', 'kg', 'rollo', 'litro', 'unidad', 'caja']),
  stockQty: z.number().nonnegative(),
  minStockQty: z.number().nonnegative().default(0),
  unitCostUsd: z.number().nonnegative(),
});

/** Actualización parcial de stock de una materia prima. */
const materialStockUpdateSchema = z
  .object({
    stockQty: z.number().nonnegative().optional(),
    minStockQty: z.number().nonnegative().optional(),
    unitCostUsd: z.number().nonnegative().optional(),
  })
  .refine(
    (v) => v.stockQty !== undefined || v.minStockQty !== undefined || v.unitCostUsd !== undefined,
    { message: 'Envía al menos un campo: stockQty, minStockQty o unitCostUsd' },
  );

function filterGarments(
  store: Store,
  query: Record<string, string | undefined>,
  onlyActive: boolean,
): GarmentTemplate[] {
  const { region, category, q } = query;
  return [...store.garments.values()].filter((g) => {
    if (onlyActive && !g.active) return false;
    if (
      region &&
      !g.recommendedRegions.includes(region as GarmentTemplate['recommendedRegions'][number])
    ) {
      return false;
    }
    if (category && g.category !== category) return false;
    if (q && !`${g.name} ${g.slug} ${g.description}`.toLowerCase().includes(q.toLowerCase())) {
      return false;
    }
    return true;
  });
}

export function registerCmsCommerceRoutes(app: FastifyInstance, store: Store): void {
  // ---- Catálogo público unificado (Web + Móvil) ----
  app.get('/api/catalog', async (request) => {
    const query = request.query as Record<string, string | undefined>;
    const items = filterGarments(store, query, true);
    return { total: items.length, items };
  });

  // ---- CMS propio: lectura ----
  app.get('/api/cms/garments', async (request) => {
    const query = request.query as Record<string, string | undefined>;
    const { active } = query;
    let items = filterGarments(store, query, false);
    if (active !== undefined) items = items.filter((g) => g.active === (active === 'true'));
    return { total: items.length, items };
  });

  app.get('/api/cms/garments/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const item = store.garments.get(id);
    if (!item) return reply.code(404).send({ error: 'Prenda no encontrada' });
    return item;
  });

  // ---- CMS propio: alta ----
  app.post('/api/cms/garments', { preHandler: [requireRoles([...CMS_WRITE_ROLES])] }, async (request, reply) => {
    const parsed = garmentCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Datos inválidos', issues: parsed.error.issues });
    }
    const slugTaken = [...store.garments.values()].some((g) => g.slug === parsed.data.slug);
    if (slugTaken)
      return reply.code(409).send({ error: `El slug "${parsed.data.slug}" ya existe` });
    const item: GarmentTemplate = {
      ...parsed.data,
      id: newId(),
      imageUrl: parsed.data.imageUrl ?? '',
    };
    store.garments.set(item.id, item);
    return reply.code(201).send(item);
  });

  // ---- CMS propio: edición ----
  app.put('/api/cms/garments/:id', { preHandler: [requireRoles([...CMS_WRITE_ROLES])] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const current = store.garments.get(id);
    if (!current) return reply.code(404).send({ error: 'Prenda no encontrada' });
    const parsed = garmentUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Datos inválidos', issues: parsed.error.issues });
    }
    if (parsed.data.slug && parsed.data.slug !== current.slug) {
      const slugTaken = [...store.garments.values()].some((g) => g.slug === parsed.data.slug);
      if (slugTaken)
        return reply.code(409).send({ error: `El slug "${parsed.data.slug}" ya existe` });
    }
    // Solo aplica campos presentes: un `undefined` no debe borrar el valor actual.
    const updated: GarmentTemplate = { ...current };
    for (const [key, value] of Object.entries(parsed.data)) {
      if (value !== undefined) (updated as unknown as Record<string, unknown>)[key] = value;
    }
    store.garments.set(id, updated);
    return updated;
  });

  // ---- CMS propio: activar/desactivar en 1 clic ----
  app.patch('/api/cms/garments/:id/toggle', { preHandler: [requireRoles([...CMS_WRITE_ROLES])] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const current = store.garments.get(id);
    if (!current) return reply.code(404).send({ error: 'Prenda no encontrada' });
    const updated: GarmentTemplate = { ...current, active: !current.active };
    store.garments.set(id, updated);
    return updated;
  });

  // ---- CMS propio: planta y materiales ----
  app.get('/api/cms/plant-status', async () => {
    return {
      planta: 'Riobamba',
      resumen: machinesSummary(store.machines),
      colaTotalMinutos: totalPlantQueue(store.machines),
      maquinas: store.machines,
    };
  });

  app.get('/api/cms/materials', async () => {
    const low = store.materials.filter((m) => m.stockQty <= m.minStockQty);
    return { total: store.materials.length, bajoStock: low.length, items: store.materials };
  });

  // ---- CMS propio: alta de materia prima en bodega ----
  app.post('/api/cms/materials', { preHandler: [requireRoles([...ERP_BODEGA_ROLES])] }, async (request, reply) => {
    const parsed = materialCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Datos inválidos', issues: parsed.error.issues });
    }
    const skuTaken = store.materials.some((m) => m.sku === parsed.data.sku);
    if (skuTaken) return reply.code(409).send({ error: `El SKU "${parsed.data.sku}" ya existe` });
    const item: RawMaterial = { ...parsed.data, id: newId() };
    store.materials.push(item);
    return reply.code(201).send(item);
  });

  // ---- CMS propio: actualiza stock de una materia prima ----
  app.patch('/api/cms/materials/:id', { preHandler: [requireRoles([...ERP_BODEGA_ROLES])] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const item = store.materials.find((m) => m.id === id);
    if (!item) return reply.code(404).send({ error: 'Materia prima no encontrada' });
    const parsed = materialStockUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Datos inválidos', issues: parsed.error.issues });
    }
    if (parsed.data.stockQty !== undefined) item.stockQty = parsed.data.stockQty;
    if (parsed.data.minStockQty !== undefined) item.minStockQty = parsed.data.minStockQty;
    if (parsed.data.unitCostUsd !== undefined) item.unitCostUsd = parsed.data.unitCostUsd;
    return item;
  });

  // ---- Comercio: cotizar caja (persiste COTIZADA) ----
  app.post('/api/boxes/quote', async (request, reply) => {
    const parsed = boxQuoteSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Cotización inválida', issues: parsed.error.issues });
    }
    const { items, region, currentPlantQueueMinutes, customerName } = parsed.data;

    // Precio autoritativo: si la prenda existe en el catálogo, manda el CMS.
    const priced: BoxItemInput[] = items.map((item) => {
      const catalog = store.garments.get(item.garment.id);
      const garment = catalog ?? item.garment;
      return {
        designId: item.designId,
        garment: {
          id: garment.id,
          category: garment.category,
          baseSalePrice: garment.baseSalePrice,
          baseTimeMinutes: garment.baseTimeMinutes,
        },
        quantity: item.quantity,
        logosCount: item.logosCount,
        size: item.size,
        color: item.color,
      };
    });

    const quote = calculateProductionAndDeliveryTime(priced, currentPlantQueueMinutes, region);

    const lines = priced.map((item) => {
      const price = calculateGarmentUnitPrice(item.garment, item.logosCount);
      const catalogName = store.garments.get(item.garment.id)?.name ?? item.garment.category;
      return {
        designId: item.designId,
        garmentId: item.garment.id,
        garmentName: catalogName,
        category: item.garment.category,
        quantity: item.quantity,
        logosCount: item.logosCount,
        size: item.size,
        color: item.color,
        unitPriceUsd: price.unitPrice,
        lineTotalUsd: Math.round(price.unitPrice * item.quantity * 100) / 100,
        extraMachineMinutesPerUnit: price.extraMachineMinutes,
      };
    });

    const box: StoredBox = {
      id: newId(),
      createdAt: new Date().toISOString(),
      customerName,
      region,
      subtotalUsd: quote.subtotalUsd,
      discountPct: quote.discountPct,
      discountUsd: quote.discountUsd,
      shippingUsd: quote.shippingUsd,
      totalUsd: quote.totalUsd,
      totalUnits: quote.totalUnits,
      productionMinutes: quote.productionMinutes,
      deliveryDaysMin: quote.deliveryDaysMin,
      deliveryDaysMax: quote.deliveryDaysMax,
      status: 'COTIZADA',
      lines,
    };
    store.boxes.set(box.id, box);

    return { box, lines, quote };
  });

  // ---- Comercio: historial de órdenes/cajas del usuario ----
  // IMPORTANTE: se registra antes de `/api/boxes/:id` para que "orders"
  // no sea capturado como un `:id`.
  app.get('/api/boxes/orders', async (request) => {
    const query = request.query as Record<string, string | undefined>;
    const { customerName, status } = query;
    const erpByBox = new Map([...store.erpOrders.values()].map((o) => [o.boxId, o]));
    // Más reciente primero: el último pedido queda en la posición 0.
    const filtered = [...store.boxes.values()].filter((box) => {
      if (customerName && (box.customerName ?? '').toLowerCase() !== customerName.toLowerCase()) {
        return false;
      }
      if (status && box.status !== status) return false;
      return true;
    });
    const items = newestFirst(filtered).map((box) => {
      const erpOrder = erpByBox.get(box.id);
      return {
        ...box,
        erpOrder: erpOrder ? { ...erpOrder, items: detailItemsForBox(store, box) } : undefined,
      };
    });
    return { total: items.length, items };
  });

  // ---- Comercio: consultar caja ----
  app.get('/api/boxes/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const box = store.boxes.get(id);
    if (!box) return reply.code(404).send({ error: 'Caja no encontrada' });
    return box;
  });

  // ---- Comercio: checkout (COTIZADA -> PAGADA) + Event Bus ERP ----
  app.post('/api/boxes/checkout', async (request, reply) => {
    const parsed = checkoutSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Checkout inválido', issues: parsed.error.issues });
    }
    const box = store.boxes.get(parsed.data.boxId);
    if (!box) return reply.code(404).send({ error: 'Caja no encontrada' });
    if (box.status !== 'COTIZADA') {
      return reply
        .code(409)
        .send({ error: `La caja está en estado ${box.status}, no se puede pagar` });
    }
    // ANTICIPO_50_50 exclusivo B2B 13-160 unidades (Tesis Gumorose).
    if (
      parsed.data.paymentMode === 'ANTICIPO_50_50' &&
      !isAnticipoEligible(parsed.data.customerRole ?? 'CLIENTE_B2C', box.totalUnits)
    ) {
      return reply.code(400).send({
        error: 'ANTICIPO_50_50 exclusivo para CLIENTE_B2B en cajas de 13 a 160 unidades',
      });
    }
    try {
      const erp = emitOrderPaidCheckout(store, {
        boxId: box.id,
        customerRole: parsed.data.customerRole,
        paymentMode: parsed.data.paymentMode,
        buyerUserId: parsed.data.buyerUserId,
        operatorRole: request.gumoroseUser?.role,
      });
      box.status = 'PAGADA';
      const sriInvoice = [...store.sriInvoices.values()].find((inv) => inv.orderId === erp.order.id);
      return {
        ...box,
        erpOrder: erp.order,
        ledger: erp.ledger,
        fabricMeters: erp.fabricMeters,
        ...(sriInvoice ? { sriInvoice } : {}),
      };
    } catch (error) {
      return reply
        .code(500)
        .send({ error: 'Falló el Event Bus ERP en el checkout', detail: String(error) });
    }
  });
}
