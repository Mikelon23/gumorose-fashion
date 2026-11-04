/**
 * Rutas ERP + Superadmin — Diagrama 1, Capa 2/3.
 *
 * - `/api/superadmin/users*` ......... solo SUPER_ADMIN.
 * - `/api/erp/orders*` ................ planta/gerencia (+bodega lectura).
 * - `/api/erp/bodega/alerts` ......... bodega/gerencia/superadmin.
 * - `/api/erp/finance/summary` ........ gerencia/superadmin.
 */
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  advancePlantStage,
  advanceStageSchema,
  aiConfigUpdateSchema,
  BASE_TIME_MINUTES,
  FINISHING_MINUTES,
  SEWING_MINUTES,
  getVolumeDiscountPct,
  mlRegisterOrLoginSchema,
  round2,
  sriEmitInvoiceSchema,
  systemUserCreateSchema,
  systemUserRoleUpdateSchema,
} from '@gumorose/shared';
import type { ErpFinancialSummary, GarmentTemplate, PlantProductionStage } from '@gumorose/shared';
import {
  ERP_BODEGA_ROLES,
  ERP_FINANCE_ROLES,
  ERP_PLANTA_ROLES,
  requireRoles,
  SUPERADMIN_ONLY,
} from '../middlewares/auth-rbac.middleware.js';
import {
  emitOrderStage11Completed,
  erpEventLog,
  getErpEventHistory,
} from '../services/erp-event-bus.js';
import { detailItemsForBox, newestFirst } from '../store.js';
import type { Store } from '../store.js';
import { getAiRuntimeStatus, setAiRuntimeConfig } from '../services/meta-ai.service.js';
import { computeStitchFixInsights } from '../services/intelligence.service.js';
import { createSriInvoicingMicroservice } from '../services/sri-invoicing.microservice.js';
import {
  getMlDataset,
  getMlRecommendations,
  mlDatasetToCsv,
  registerOrLoginMlUser,
} from '../services/ml-dataset.service.js';

const ERP_ORDERS_READ_ROLES = ['SUPER_ADMIN', 'ADMIN_PLANTA', 'ADMIN_GERENCIA', 'ADMIN_BODEGA'] as const;

export function registerErpSuperadminRoutes(app: FastifyInstance, store: Store): void {
  // ---- Superadmin: lista usuarios (6 roles) ----
  app.get(
    '/api/superadmin/users',
    { preHandler: [requireRoles([...SUPERADMIN_ONLY])] },
    async () => ({ total: store.systemUsers.size, items: [...store.systemUsers.values()] }),
  );

  // ---- Superadmin: alta de personal ----
  app.post(
    '/api/superadmin/users',
    { preHandler: [requireRoles([...SUPERADMIN_ONLY])] },
    async (request, reply) => {
      const parsed = systemUserCreateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Usuario inválido', issues: parsed.error.issues });
      }
      const emailTaken = [...store.systemUsers.values()].some(
        (u) => u.email.toLowerCase() === parsed.data.email.toLowerCase(),
      );
      if (emailTaken) {
        return reply.code(409).send({ error: `El email "${parsed.data.email}" ya existe` });
      }
      const now = new Date().toISOString();
      const user = { ...parsed.data, id: randomUUID(), createdAt: now };
      store.systemUsers.set(user.id, user);
      return reply.code(201).send(user);
    },
  );

  // ---- Superadmin: cambio de rol y/o estado (ambos opcionales, al menos uno) ----
  app.patch(
    '/api/superadmin/users/:id/role',
    { preHandler: [requireRoles([...SUPERADMIN_ONLY])] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const current = store.systemUsers.get(id);
      if (!current) return reply.code(404).send({ error: 'Usuario no encontrado' });
      const patchSchema = systemUserRoleUpdateSchema.partial().extend({
        active: z.boolean().optional(),
      });
      const parsed = patchSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Rol inválido', issues: parsed.error.issues });
      }
      if (parsed.data.role === undefined && parsed.data.active === undefined) {
        return reply.code(400).send({ error: 'Envía al menos un campo: role y/o active' });
      }
      // RBAC estricto: jamás se asigna SUPER_ADMIN a una cuenta de cliente.
      if (
        parsed.data.role === 'SUPER_ADMIN' &&
        (current.role === 'CLIENTE_B2C' || current.role === 'CLIENTE_B2B')
      ) {
        return reply.code(403).send({
          error: `Acceso Restringido RBAC 403: no se puede asignar SUPER_ADMIN a la cuenta de cliente ${current.email} (${current.role})`,
        });
      }
      const updated = {
        ...current,
        ...(parsed.data.role !== undefined ? { role: parsed.data.role } : {}),
        ...(parsed.data.active !== undefined ? { active: parsed.data.active } : {}),
      };
      store.systemUsers.set(id, updated);
      return updated;
    },
  );

  // ---- Superadmin: Motor Meta AI en caliente (sin reiniciar ni .env) ----
  app.get(
    '/api/superadmin/ai-config',
    { preHandler: [requireRoles([...SUPERADMIN_ONLY])] },
    async () => getAiRuntimeStatus(),
  );

  app.post(
    '/api/superadmin/ai-config',
    { preHandler: [requireRoles([...SUPERADMIN_ONLY])] },
    async (request, reply) => {
      const parsed = aiConfigUpdateSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Config Meta AI inválida', issues: parsed.error.issues });
      }
      return setAiRuntimeConfig(parsed.data);
    },
  );

  // ---- ERP: lista órdenes de producción ----
  // Los roles CLIENTE_* solo ven sus propias órdenes (buyerUserId = su user-id).
  app.get(
    '/api/erp/orders',
    {
      preHandler: [
        requireRoles([...ERP_ORDERS_READ_ROLES, 'CLIENTE_B2C', 'CLIENTE_B2B']),
      ],
    },
    async (request) => {
      const role = request.gumoroseUser?.role;
      const all = [...store.erpOrders.values()];
      const visible =
        role === 'CLIENTE_B2C' || role === 'CLIENTE_B2B'
          ? all.filter(
              (o) => o.buyerUserId !== undefined && o.buyerUserId === request.gumoroseUser?.userId,
            )
          : all;
      // Más reciente primero: el último pedido queda en la posición 0,
      // con el detalle de prendas de su caja asociada.
      const items = newestFirst(visible).map((order) => {
        const box = store.boxes.get(order.boxId);
        return { ...order, items: box ? detailItemsForBox(store, box) : [] };
      });
      return { total: items.length, items };
    },
  );

  // ---- ERP: avance por las 11 etapas ----
  app.post(
    '/api/erp/orders/:id/advance-stage',
    { preHandler: [requireRoles([...ERP_PLANTA_ROLES])] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const order = store.erpOrders.get(id);
      if (!order) return reply.code(404).send({ error: 'Orden ERP no encontrada' });
      if (order.currentStage === '11_EMPAQUE_DESPACHO') {
        return reply.code(409).send({ error: 'La orden ya está en etapa terminal 11_EMPAQUE_DESPACHO' });
      }

      const parsed = advanceStageSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Decisión inválida', issues: parsed.error.issues });
      }

      let next: PlantProductionStage;
      try {
        if (order.currentStage === '8_CONTROL_CALIDAD') {
          if (parsed.data.approve === undefined) {
            return reply.code(400).send({
              error: 'La etapa 8_CONTROL_CALIDAD exige decisión: { approve: true|false }',
            });
          }
          next = advancePlantStage(order.currentStage, { approve: parsed.data.approve });
          if (parsed.data.approve === true) {
            order.qualityCheckStatus = 'APROBADO_SELLO_AZUL';
            order.blueSealApplied = true;
          } else {
            order.qualityCheckStatus = 'REPROCESO_COSTURA';
          }
        } else {
          next = advancePlantStage(order.currentStage);
        }
      } catch (error) {
        return reply.code(400).send({ error: String(error) });
      }

      // La etapa 11 exige saldo liquidado en ANTICIPO_50_50.
      if (next === '11_EMPAQUE_DESPACHO' && round2(order.balanceDueUsd) > 0) {
        return reply.code(409).send({
          error: `Saldo mayorista B2B pendiente del 50% ($${order.balanceDueUsd.toFixed(2)} USD). Haz clic en 'Cobrar 50% Final' para habilitar el despacho en la Etapa 11 (POST /api/erp/orders/${order.id}/settle-balance).`,
          balanceDueUsd: order.balanceDueUsd,
        });
      }

      if (next === '8_CONTROL_CALIDAD' && order.qualityCheckStatus !== 'REPROCESO_COSTURA') {
        order.qualityCheckStatus = 'PENDIENTE';
      }

      order.currentStage = next;
      order.updatedAt = new Date().toISOString();
      order.stageHistory.push({
        stage: next,
        timestamp: order.updatedAt,
        operatorRole: request.gumoroseUser?.role ?? 'ADMIN_PLANTA',
        notes: parsed.data.notes,
      });

      if (next === '11_EMPAQUE_DESPACHO') {
        emitOrderStage11Completed(store, order.id, request.gumoroseUser?.role ?? 'ADMIN_PLANTA');
      }

      return store.erpOrders.get(order.id);
    },
  );

  // ---- ERP: liquida el segundo 50% B2B antes del despacho ----
  // CLIENTE_B2B puede liquidar solo sus propias órdenes; el resto de roles
  // planta/gerencia/superadmin no tienen restricción de titularidad.
  app.post(
    '/api/erp/orders/:id/settle-balance',
    { preHandler: [requireRoles([...ERP_PLANTA_ROLES, 'CLIENTE_B2B'])] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const order = store.erpOrders.get(id);
      if (!order) return reply.code(404).send({ error: 'Orden ERP no encontrada' });
      if (
        request.gumoroseUser?.role === 'CLIENTE_B2B' &&
        order.buyerUserId !== request.gumoroseUser?.userId
      ) {
        return reply.code(403).send({ error: 'Solo puedes liquidar tus propias órdenes' });
      }
      if (round2(order.balanceDueUsd) <= 0) return { ...order, settled: false };

      order.amountPaidUsd = round2(order.totalUsd);
      order.balanceDueUsd = 0;
      order.updatedAt = new Date().toISOString();

      const ledger = store.ledgerEntries.find((e) => e.orderId === order.id);
      if (ledger) {
        ledger.cashCollectedUsd = round2(order.totalUsd);
        ledger.receivableUsd = 0;
      }

      return { ...order, settled: true };
    },
  );

  // ---- ERP Bodega: inventario + alertas Neymatex ----
  app.get(
    '/api/erp/bodega/alerts',
    { preHandler: [requireRoles([...ERP_BODEGA_ROLES])] },
    async () => {
      const low = store.materials.filter((m) => m.stockQty < m.minStockQty);
      const activas = store.purchaseAlerts.filter((a) => a.status === 'ACTIVA');
      const totalFabricConsumedMeters = round2(
        [...store.erpOrders.values()].reduce((acc, o) => acc + o.fabricMetersDeducted, 0),
      );
      return {
        totalMaterials: store.materials.length,
        lowStock: low.length,
        items: store.materials,
        lowStockItems: low,
        totalFabricConsumedMeters,
        activeAlerts: activas.length,
        alerts: activas,
        supplier: 'Neymatex Guano',
      };
    },
  );

  // ---- ERP Finanzas: Estado de Resultados en vivo ----
  app.get(
    '/api/erp/finance/summary',
    { preHandler: [requireRoles([...ERP_FINANCE_ROLES])] },
    async () => {
      const summary: ErpFinancialSummary = {
        totalOrders: store.ledgerEntries.length,
        grossRevenueUsd: 0,
        totalMpdUsd: 0,
        totalModUsd: 0,
        totalCifUsd: 0,
        totalOperatingProfitUsd: 0,
        averageMarginPct: 0,
        cashCollectedUsd: 0,
        receivableUsd: 0,
        byPaymentMode: { CONTADO_100: 0, ANTICIPO_50_50: 0 },
      };
      for (const entry of store.ledgerEntries) {
        summary.grossRevenueUsd = round2(summary.grossRevenueUsd + entry.grossRevenueUsd);
        summary.totalMpdUsd = round2(summary.totalMpdUsd + entry.mpdCostUsd);
        summary.totalModUsd = round2(summary.totalModUsd + entry.modCostUsd);
        summary.totalCifUsd = round2(summary.totalCifUsd + entry.cifCostUsd);
        summary.totalOperatingProfitUsd = round2(
          summary.totalOperatingProfitUsd + entry.operatingProfitUsd,
        );
        summary.cashCollectedUsd = round2(summary.cashCollectedUsd + entry.cashCollectedUsd);
        summary.receivableUsd = round2(summary.receivableUsd + entry.receivableUsd);
        summary.byPaymentMode[entry.paymentMode] += 1;
      }
      if (summary.totalOrders > 0 && summary.grossRevenueUsd > 0) {
        summary.averageMarginPct = round2(
          (summary.totalOperatingProfitUsd / summary.grossRevenueUsd) * 100,
        );
      }
      return {
        summary,
        entries: store.ledgerEntries,
        recentEvents: getErpEventHistory(50),
        eventLogSize: erpEventLog.length,
      };
    },
  );

  // ---- Inteligencia Stitch Fix: Closet Gaps + Hybrid Designs + Blue Ocean ----
  app.get(
    '/api/erp/intelligence/stitch-fix-insights',
    { preHandler: [requireRoles([...ERP_PLANTA_ROLES])] },
    async () => computeStitchFixInsights(store),
  );

  const launchHybridSchema = z.object({
    recommendationId: z.string().min(1).max(120).optional(),
    name: z.string().min(3).max(120).optional(),
    slug: z.string().min(3).max(80).regex(/^[a-z0-9-]+$/).optional(),
    category: z.enum(['CAMISETA', 'POLO', 'CAMISA', 'PANTALON']).optional(),
    region: z.enum(['COSTA', 'SIERRA', 'ORIENTE']).optional(),
    colorName: z.string().min(1).max(30).optional(),
    suggestedPriceUsd: z.number().positive().max(10000).optional(),
    openProductionLot: z.boolean().default(false),
    quantity: z.number().int().min(1).max(160).optional(),
  });

  // ---- Lanzar Hybrid Design al catálogo oficial (+ lote opcional) ----
  app.post(
    '/api/erp/intelligence/launch-hybrid-design',
    { preHandler: [requireRoles([...ERP_FINANCE_ROLES])] },
    async (request, reply) => {
      const parsed = launchHybridSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Lanzamiento Hybrid inválido', issues: parsed.error.issues });
      }
      const insights = computeStitchFixInsights(store);
      const rec = parsed.data.recommendationId
        ? insights.hybridDesignRecommendations.find((r) => r.id === parsed.data.recommendationId)
        : insights.hybridDesignRecommendations[0];
      if (!rec && !parsed.data.name) {
        return reply.code(404).send({ error: 'Recomendación Hybrid no encontrada: envía recommendationId válido' });
      }
      const name = parsed.data.name ?? rec?.name ?? 'Hybrid Design Gumorose';
      const category = parsed.data.category ?? rec?.category ?? 'CAMISETA';
      const region = parsed.data.region ?? rec?.region ?? 'SIERRA';
      const price = parsed.data.suggestedPriceUsd ?? rec?.suggestedPriceUsd ?? 12.74;
      const baseSlug = parsed.data.slug ?? rec?.slug ?? 'hybrid-design-gumorose';
      let slug = baseSlug;
      let suffix = 2;
      while ([...store.garments.values()].some((g) => g.slug === slug)) {
        slug = `${baseSlug}-${suffix}`;
        suffix += 1;
      }
      const garment: GarmentTemplate = {
        id: randomUUID(),
        slug,
        name,
        category,
        description: rec
          ? `${rec.rationale} Hybrid Design (HBR Katrina Lake) generado desde clósets y Style Shuffle.`
          : 'Hybrid Design lanzado desde el Portal ERP.',
        baseProductionCost: round2(price * (1 - 0.32)),
        baseMarginPct: 32,
        baseSalePrice: round2(price),
        baseTimeMinutes: rec?.baseTimeMinutes ?? BASE_TIME_MINUTES[category],
        sewingMinutes: SEWING_MINUTES[category],
        finishingMinutes: FINISHING_MINUTES[category],
        sizes:
          category === 'PANTALON'
            ? ['28', '30', '32', '34', '36', '38']
            : rec?.visualVariant === 'GORRA'
              ? ['UNICA']
              : ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
        colors: [parsed.data.colorName ?? rec?.colorName ?? 'AZUL_MARINO'],
        recommendedRegions: [region],
        climateNote: rec?.rationale ?? `Diseñado para ${region} desde la demanda real de clósets.`,
        imageUrl: '',
        visualVariant: rec?.visualVariant,
        active: true,
      };
      store.garments.set(garment.id, garment);

      let productionOrder: unknown = null;
      if (parsed.data.openProductionLot) {
        const qty = parsed.data.quantity ?? Math.min(160, rec?.estimatedDemandUnits ?? 24);
        const fabricMeters = round2((rec?.fabricMetersPerUnit ?? 0.71) * qty);
        const subtotal = round2(garment.baseSalePrice * qty);
        const discountPct = getVolumeDiscountPct(qty);
        const totalUsd = round2(subtotal - (subtotal * discountPct) / 100);
        const boxId = randomUUID();
        const now = new Date().toISOString();
        store.boxes.set(boxId, {
          id: boxId,
          region,
          subtotalUsd: subtotal,
          discountPct,
          discountUsd: round2(subtotal - totalUsd),
          shippingUsd: 0,
          totalUsd,
          totalUnits: qty,
          productionMinutes: garment.baseTimeMinutes * qty,
          deliveryDaysMin: 1,
          deliveryDaysMax: 3,
          status: 'EN_PRODUCCION',
          lines: [
            {
              designId: randomUUID(),
              garmentId: garment.id,
              garmentName: garment.name,
              category: garment.category,
              quantity: qty,
              logosCount: 0,
              unitPriceUsd: garment.baseSalePrice,
              lineTotalUsd: subtotal,
              size: garment.sizes.includes('M') ? 'M' : garment.sizes[0],
              color: garment.colors[0],
            },
          ],
          createdAt: now,
        });
        const orderId = randomUUID();
        const orderCode = `OP-${String(1000 + store.erpOrders.size + 1).slice(1).padStart(4, '0')}`;
        const order = {
          id: orderId,
          orderCode,
          boxId,
          customerRole: 'CLIENTE_B2B' as const,
          paymentMode: 'CONTADO_100' as const,
          amountPaidUsd: totalUsd,
          balanceDueUsd: 0,
          totalUsd,
          currentStage: '1_DISENO_ARTE' as const,
          qualityCheckStatus: 'PENDIENTE' as const,
          blueSealApplied: false,
          fabricMetersDeducted: fabricMeters,
          stageHistory: [
            {
              stage: '1_DISENO_ARTE' as const,
              timestamp: now,
              operatorRole: request.gumoroseUser?.role ?? 'ADMIN_GERENCIA',
              notes: `Lote Hybrid Design: ${garment.name} x${qty}`,
            },
          ],
          createdAt: now,
          updatedAt: now,
        };
        store.erpOrders.set(orderId, order);
        productionOrder = { ...order, fabricMeters, quantity: qty };
      }

      return reply.code(201).send({
        garment,
        recommendation: rec ?? null,
        productionOrder,
        catalogTotal: store.garments.size,
        message: `Prenda Hybrid "${garment.name}" publicada en el catálogo oficial: ya está en Tienda Web y App Móvil (GET /api/catalog).`,
      });
    },
  );

  /* ================================================================= */
  /* Microservicio SRI v2.1.0 + Auth/ML (suscripción ORDER_PAID_CHECKOUT) */
  /* ================================================================= */
  const sriMicroservice = createSriInvoicingMicroservice(store);
  sriMicroservice.subscribeToEventBus();

  app.get('/api/sri/status', async () => sriMicroservice.getStatus());
  app.get('/api/sri/invoices', async (request) => {
    const query = request.query as Record<string, string | undefined>;
    const items = sriMicroservice.listInvoices({
      comprador: query.comprador ?? query.buyer,
      q: query.q,
      boxId: query.boxId,
      orderCode: query.orderCode,
      orderId: query.orderId,
    });
    return { total: items.length, items };
  });
  app.post('/api/sri/invoices/emit', async (request, reply) => {
    const parsed = sriEmitInvoiceSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Emisión SRI inválida', issues: parsed.error.issues });
    }
    try {
      const invoice = sriMicroservice.emitForOrder(parsed.data);
      return reply.code(201).send(invoice);
    } catch (error) {
      return reply.code(404).send({ error: String(error instanceof Error ? error.message : error) });
    }
  });
  app.get('/api/sri/invoices/:id/xml', async (request, reply) => {
    const { id } = request.params as { id: string };
    const invoice = sriMicroservice.findInvoice(id);
    if (!invoice) return reply.code(404).send({ error: 'Factura SRI no encontrada' });
    return reply
      .header('content-type', 'application/xml; charset=utf-8')
      .header('content-disposition', `attachment; filename="factura-${invoice.invoiceNumber}.xml"`)
      .send(invoice.xmlSignedContent);
  });
  app.get('/api/sri/invoices/:id/ride', async (request, reply) => {
    const { id } = request.params as { id: string };
    const invoice = sriMicroservice.findInvoice(id);
    if (!invoice) return reply.code(404).send({ error: 'Factura SRI no encontrada' });
    return reply.header('content-type', 'text/html; charset=utf-8').send(invoice.rideHtmlContent);
  });
  app.get('/api/sri/invoices/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const invoice = sriMicroservice.findInvoice(id);
    if (!invoice) return reply.code(404).send({ error: 'Factura SRI no encontrada' });
    return invoice;
  });

  app.post('/api/auth/register-or-login', async (request, reply) => {
    const parsed = mlRegisterOrLoginSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: 'Perfilado inválido: revisa Cédula/RUC, medidas y datos', issues: parsed.error.issues });
    }
    const user = registerOrLoginMlUser(store, parsed.data);
    const result = getMlRecommendations(store, user.userId);
    return reply.code(201).send({
      user,
      profile: user,
      recommendations: result?.recommendations ?? [],
      recommendedSize: result?.recommendations[0]?.recommendedSize,
    });
  });

  app.get('/api/ml/recommendations/:userId', async (request, reply) => {
    const { userId } = request.params as { userId: string };
    const result = getMlRecommendations(store, userId);
    if (!result) {
      return reply.code(404).send({ error: 'Usuario ML no encontrado: regístrate en /api/auth/register-or-login' });
    }
    return result;
  });
  app.get('/api/ml/dataset', async () => getMlDataset(store));
  app.get('/api/ml/dataset/export-csv', async (_request, reply) => {
    const dataset = getMlDataset(store);
    return reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', 'attachment; filename="gumorose-ml-dataset.csv"')
      .send(mlDatasetToCsv(dataset.records));
  });
  app.get('/api/ml/dataset/export-json', async (_request, reply) => {
    return reply
      .header('content-disposition', 'attachment; filename="gumorose-ml-dataset.json"')
      .send(getMlDataset(store));
  });

  // Compatibilidad: alias de planta que también exigen rol de planta.
  app.get(
    '/api/erp/planta/orders',
    { preHandler: [requireRoles([...ERP_PLANTA_ROLES])] },
    async () => {
      const items = newestFirst([...store.erpOrders.values()]).map((order) => {
        const box = store.boxes.get(order.boxId);
        return { ...order, items: box ? detailItemsForBox(store, box) : [] };
      });
      return { total: items.length, items };
    },
  );
}
