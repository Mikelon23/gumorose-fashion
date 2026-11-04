/**
 * Auditoría integral del backend (CAPA 2): RBAC de 6 roles, cotización,
 * checkout + Event Bus, máquina de 11 etapas con Sello Azul, inteligencia
 * Stitch Fix y caché SHA-256 del Try-On. Todo contra `buildApp().inject()`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../src/server.ts';
import { validateSriAccessKey } from '@gumorose/shared';

const { app } = buildApp();
await app.ready();

type Json = Record<string, any>;

function headers(role: string, userId = 'auditor'): Record<string, string> {
  return { 'x-gumorose-role': role, 'x-gumorose-user-id': userId };
}

async function call(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH',
  url: string,
  role: string,
  payload?: unknown,
  userId?: string,
): Promise<{ status: number; body: Json }> {
  const res = await app.inject({ method, url, headers: headers(role, userId), payload: payload as never });
  let body: Json = {};
  try {
    body = JSON.parse(res.body) as Json;
  } catch {
    body = { raw: res.body };
  }
  return { status: res.statusCode, body };
}

const catalog = (await call('GET', '/api/catalog', 'CLIENTE_B2C')).body;
const bySlug = (slug: string): Json => catalog.items.find((g: Json) => g.slug === slug);
const tee = bySlug('camiseta-cuello-redondo-gumorose-pro');
const shirt = bySlug('camisa-oxford-manga-larga');
const pants = bySlug('pantalon-chino-sastre');

const users = (await call('GET', '/api/superadmin/users', 'SUPER_ADMIN')).body.items as Json[];
const b2cUser = users.find((u) => u.role === 'CLIENTE_B2C');
const b2bUser = users.find((u) => u.role === 'CLIENTE_B2B');

function quotePayload(garment: Json, quantity: number, logosCount = 1, region = 'SIERRA'): Json {
  return {
    region,
    items: [
      {
        designId: randomUUID(),
        garment: {
          id: garment.id,
          category: garment.category,
          baseSalePrice: garment.baseSalePrice,
          baseTimeMinutes: garment.baseTimeMinutes,
        },
        quantity,
        logosCount,
        size: 'M',
        color: 'BLANCO',
      },
    ],
  };
}

async function quoteAndCheckout(
  garment: Json,
  quantity: number,
  opts: { role?: string; paymentMode?: string; buyerUserId?: string; logosCount?: number } = {},
): Promise<Json> {
  const quote = await call('POST', '/api/boxes/quote', opts.role ?? 'CLIENTE_B2C', quotePayload(garment, quantity, opts.logosCount ?? 1));
  assert.equal(quote.status, 200, JSON.stringify(quote.body).slice(0, 300));
  const checkout = await call('POST', '/api/boxes/checkout', opts.role ?? 'CLIENTE_B2C', {
    boxId: quote.body.box.id,
    paymentMethod: 'mock',
    paymentMode: opts.paymentMode ?? 'CONTADO_100',
    customerRole: opts.role ?? 'CLIENTE_B2C',
    buyerUserId: opts.buyerUserId,
  });
  return checkout.body;
}

test('RBAC: clientes no entran a superadmin, materiales, finanzas ni inteligencia', async () => {
  for (const role of ['CLIENTE_B2C', 'CLIENTE_B2B']) {
    assert.equal((await call('GET', '/api/superadmin/users', role)).status, 403, role);
    assert.equal((await call('GET', '/api/erp/finance/summary', role)).status, 403, role);
    assert.equal((await call('GET', '/api/erp/intelligence/stitch-fix-insights', role)).status, 403, role);
    const mat = await call('POST', '/api/cms/materials', role, {
      sku: `AUD-${role}`,
      name: 'Material auditoría',
      kind: 'TELA',
      unit: 'm',
      stockQty: 10,
      unitCostUsd: 1,
    });
    assert.equal(mat.status, 403, `${role} materials`);
  }
});

test('RBAC: bodega/planta no gobiernan usuarios ni configuran Meta AI', async () => {
  for (const role of ['ADMIN_BODEGA', 'ADMIN_PLANTA']) {
    const create = await call('POST', '/api/superadmin/users', role, {
      name: 'Intruso QA',
      email: `intruso-${role}@gumorose.ec`,
      role: 'ADMIN_PLANTA',
    });
    assert.equal(create.status, 403, role);
    const ai = await call('POST', '/api/superadmin/ai-config', role, { model: 'muse-wonder-1.0' });
    assert.equal(ai.status, 403, role);
  }
});

test('RBAC: no se puede escalar un CLIENTE a SUPER_ADMIN', async () => {
  const res = await call('PATCH', `/api/superadmin/users/${b2cUser.id}/role`, 'SUPER_ADMIN', {
    role: 'SUPER_ADMIN',
  });
  assert.equal(res.status, 403, JSON.stringify(res.body).slice(0, 200));
});

test('Cotización: precios base, logos extra, volumen y envío por región al centavo', async () => {
  const q1 = await call('POST', '/api/boxes/quote', 'CLIENTE_B2C', quotePayload(tee, 1, 1, 'SIERRA'));
  assert.equal(q1.status, 200);
  assert.equal(q1.body.box.subtotalUsd, 8.65, JSON.stringify(q1.body).slice(0, 400));
  assert.equal(q1.body.box.shippingUsd, 3.5);

  const q3logos = await call('POST', '/api/boxes/quote', 'CLIENTE_B2C', quotePayload(tee, 1, 3));
  const line = q3logos.body.lines?.[0];
  assert.equal(line.unitPriceUsd, 11.15);
  assert.equal(line.extraMachineMinutesPerUnit, 8);

  const qShirt = await call('POST', '/api/boxes/quote', 'CLIENTE_B2C', quotePayload(shirt, 1, 1, 'COSTA'));
  assert.equal(qShirt.body.lines?.[0]?.unitPriceUsd, 16.71);
  const qPants = await call('POST', '/api/boxes/quote', 'CLIENTE_B2C', quotePayload(pants, 1, 1, 'ORIENTE'));
  assert.equal(qPants.body.lines?.[0]?.unitPriceUsd, 18.85);

  const cases: [number, number][] = [[6, 5], [13, 12], [51, 20]];
  for (const [qty, pct] of cases) {
    const q = await call('POST', '/api/boxes/quote', 'CLIENTE_B2B', quotePayload(tee, qty));
    assert.equal(q.body.box.discountPct, pct, `qty=${qty}`);
  }
});

test('Checkout: rechazos 400 (vacía, >160, anticipo B2C, anticipo <13)', async () => {
  const empty = await call('POST', '/api/boxes/quote', 'CLIENTE_B2C', { region: 'SIERRA', items: [] });
  assert.equal(empty.status, 400);
  const huge = await call('POST', '/api/boxes/quote', 'CLIENTE_B2B', quotePayload(tee, 161));
  assert.equal(huge.status, 400);

  const q13 = await call('POST', '/api/boxes/quote', 'CLIENTE_B2C', quotePayload(tee, 13));
  const badAnticipo = await call('POST', '/api/boxes/checkout', 'CLIENTE_B2C', {
    boxId: q13.body.box.id, paymentMethod: 'mock', paymentMode: 'ANTICIPO_50_50', customerRole: 'CLIENTE_B2C',
  });
  assert.equal(badAnticipo.status, 400);

  const q5 = await call('POST', '/api/boxes/quote', 'CLIENTE_B2B', quotePayload(tee, 5));
  const smallAnticipo = await call('POST', '/api/boxes/checkout', 'CLIENTE_B2B', {
    boxId: q5.body.box.id, paymentMethod: 'mock', paymentMode: 'ANTICIPO_50_50', customerRole: 'CLIENTE_B2B',
  });
  assert.equal(smallAnticipo.status, 400);
});

test('Checkout válido: OP en etapa 1, posición 0, items, tela, cola y asiento exacto', async () => {
  const alertsBefore = (await call('GET', '/api/erp/bodega/alerts', 'ADMIN_BODEGA')).body;
  const paid = await quoteAndCheckout(tee, 2, { buyerUserId: b2cUser.id });
  assert.ok(paid.erpOrder?.orderCode?.startsWith('OP-'), JSON.stringify(paid).slice(0, 300));
  assert.equal(paid.erpOrder.currentStage, '1_DISENO_ARTE');

  const orders = (await call('GET', '/api/erp/orders', 'SUPER_ADMIN')).body;
  const list = orders.items ?? orders;
  assert.equal(list[0].id, paid.erpOrder.id, 'la orden nueva debe ser la #1 (más reciente)');
  assert.ok(
    Array.isArray(list[0].items) && list[0].items.length >= 1,
    'la orden #1 debe traer el detalle completo de prendas (OrderItemDetail)',
  );

  const boxOrders = (await call('GET', '/api/boxes/orders', 'CLIENTE_B2C')).body;
  const boxList = boxOrders.items ?? boxOrders;
  assert.ok(boxList.some((o: Json) => o.id === paid.id || o.boxId === paid.id));

  const alertsAfter = (await call('GET', '/api/erp/bodega/alerts', 'ADMIN_BODEGA')).body;
  const consumed = alertsAfter.totalFabricConsumedMeters - alertsBefore.totalFabricConsumedMeters;
  assert.ok(Math.abs(consumed - 1.42) < 0.011, `tela descontada=${consumed} (esperado 1.42m)`);

  const ledger = paid.ledger;
  assert.ok(ledger, 'debe existir asiento contable');
  const identity = ledger.mpdCostUsd + ledger.modCostUsd + ledger.cifCostUsd + ledger.operatingProfitUsd;
  assert.ok(Math.abs(ledger.grossRevenueUsd - identity) < 0.011, `identidad: ${ledger.grossRevenueUsd} vs ${identity}`);
});

test('Etapas 11 + Sello Azul: reproceso, aprobación, bloqueo 409, liquidación y desbloqueo', async () => {
  const closetBefore = (await call('GET', `/api/closet/${b2bUser.id}`, 'CLIENTE_B2B')).body;
  const paid = await quoteAndCheckout(tee, 13, {
    role: 'CLIENTE_B2B', paymentMode: 'ANTICIPO_50_50', buyerUserId: b2bUser.id,
  });
  const orderId = paid.erpOrder.id;
  assert.ok(paid.erpOrder.balanceDueUsd > 0);

  async function advance(payload: Json = {}): Promise<Json> {
    const res = await call('POST', `/api/erp/orders/${orderId}/advance-stage`, 'ADMIN_PLANTA', payload);
    return res as unknown as Json & { status: number };
  }
  async function current(): Promise<Json> {
    const res = await call('GET', '/api/erp/orders', 'ADMIN_PLANTA');
    const list = res.body.items ?? res.body;
    return list.find((o: Json) => o.id === orderId);
  }

  for (let i = 0; i < 7; i += 1) await advance();
  assert.equal((await current()).currentStage, '8_CONTROL_CALIDAD');

  const rejected: any = await advance({ approve: false, notes: 'auditoría QA' });
  assert.equal(rejected.body.currentStage ?? (await current()).currentStage, '6_COSTURA_ARMADO');
  const afterReject = await current();
  assert.equal(afterReject.qualityCheckStatus, 'REPROCESO_COSTURA');
  assert.equal(afterReject.blueSealApplied, false);

  await advance();
  await advance();
  assert.equal((await current()).currentStage, '8_CONTROL_CALIDAD');
  const approved: any = await advance({ approve: true, notes: 'auditoría QA' });
  assert.equal(approved.body.currentStage ?? (await current()).currentStage, '9_SELLO_AZUL');
  const afterApprove = await current();
  assert.equal(afterApprove.qualityCheckStatus, 'APROBADO_SELLO_AZUL');
  assert.equal(afterApprove.blueSealApplied, true);

  await advance();
  assert.equal((await current()).currentStage, '10_PLANCHADO_ETIQUETADO_INEN');
  const blocked: any = await advance();
  assert.equal(blocked.status, 409, 'con saldo B2B no puede despachar');

  const settle = await call('POST', `/api/erp/orders/${orderId}/settle-balance`, 'ADMIN_PLANTA', {});
  assert.equal(settle.status, 200);
  assert.equal(settle.body.balanceDueUsd, 0);

  const dispatched: any = await advance();
  assert.equal(dispatched.body.currentStage ?? (await current()).currentStage, '11_EMPAQUE_DESPACHO');

  const closetAfter = (await call('GET', `/api/closet/${b2bUser.id}`, 'CLIENTE_B2B')).body;
  assert.ok(
    (closetAfter.totalItems ?? 0) > (closetBefore.totalItems ?? 0),
    'la etapa 11 debe desbloquear prendas en el clóset del comprador',
  );
});

test('Inteligencia: voto Style Shuffle alimenta insights y Hybrid se lanza al catálogo', async () => {
  const vote = await call('POST', '/api/closet/style-shuffle-vote', 'CLIENTE_B2C', {
    userId: b2cUser.id,
    itemId: tee.id,
    liked: true,
    styleTag: 'Urbano Andino',
    timestamp: new Date().toISOString(),
  });
  assert.equal(vote.status, 201, JSON.stringify(vote.body).slice(0, 200));

  const insights = await call('GET', '/api/erp/intelligence/stitch-fix-insights', 'ADMIN_GERENCIA');
  assert.equal(insights.status, 200);
  const rec = insights.body.hybridDesignRecommendations?.[0];
  assert.ok(rec?.id, 'debe haber recomendación Hybrid');

  const launched = await call('POST', '/api/erp/intelligence/launch-hybrid-design', 'ADMIN_GERENCIA', {
    recommendationId: rec.id,
    openProductionLot: true,
  });
  assert.ok([200, 201].includes(launched.status), JSON.stringify(launched.body).slice(0, 300));
  const catAfter = (await call('GET', '/api/catalog', 'CLIENTE_B2C')).body;
  assert.ok(catAfter.items.some((g: Json) => g.id === launched.body.garment?.id || g.name === launched.body.garment?.name));
});

test('Try-On: caché SHA-256 (1ª sin caché, 2ª idéntica con caché $0.00)', async () => {
  const photo = `data:image/png;base64,${'A'.repeat(400)}`;
  const up = await call('POST', '/api/closet/body-photo', 'CLIENTE_B2C', {
    userId: b2cUser.id, fullBodyPhotoBase64: photo, city: 'Riobamba', region: 'SIERRA',
  });
  assert.ok([200, 201].includes(up.status), JSON.stringify(up.body).slice(0, 200));

  const item = await call('POST', '/api/closet/items', 'CLIENTE_B2C', {
    userId: b2cUser.id, category: 'SUPERIOR_CAMISETA', sourceType: 'FOTO_PROPIA',
    name: 'Camiseta QA Try-On', colorHex: '#1C1917', warmthLevel: 'CALIDO',
  });
  assert.ok([200, 201].includes(item.status), JSON.stringify(item.body).slice(0, 200));
  const pantsItem = await call('POST', '/api/closet/items', 'CLIENTE_B2C', {
    userId: b2cUser.id, category: 'INFERIOR_PANTALON', sourceType: 'FOTO_PROPIA',
    name: 'Pantalón QA Try-On', colorHex: '#213A5C', warmthLevel: 'TEMPLADO',
  });
  assert.ok([200, 201].includes(pantsItem.status), JSON.stringify(pantsItem.body).slice(0, 200));

  const outfits = await call('POST', '/api/ai/daily-outfits', 'CLIENTE_B2C', {
    userId: b2cUser.id, region: 'SIERRA', tempC: 11, maxOutfits: 3,
  });
  assert.equal(outfits.status, 200, JSON.stringify(outfits.body).slice(0, 300));
  const outfitId = (outfits.body.outfits ?? outfits.body.items ?? [])[0]?.id;
  assert.ok(outfitId, 'el estilista debe generar un outfit reutilizable');

  const first = await call('POST', '/api/ai/virtual-tryon', 'CLIENTE_B2C', { userId: b2cUser.id, outfitId });
  assert.equal(first.status, 200, JSON.stringify(first.body).slice(0, 300));
  assert.equal(first.body.cached, false);
  const second = await call('POST', '/api/ai/virtual-tryon', 'CLIENTE_B2C', { userId: b2cUser.id, outfitId });
  assert.equal(second.status, 200);
  assert.equal(second.body.cached, true);
});

test('SRI+ML: registro alimenta dataset y checkout emite factura AUTORIZADO_SRI', async () => {
  const invalid = await call('POST', '/api/auth/register-or-login', 'CLIENTE_B2C', {
    cedulaOrRuc: '1710034064',
    fullName: 'Invalido QA',
    email: 'invalido@gumorose.ec',
    age: 28,
    region: 'SIERRA',
    city: 'Riobamba',
    heightCm: 172,
    weightKg: 70,
    preferredFit: 'RELAXED',
    favoriteColorsHex: ['#C86D51'],
  });
  assert.equal(invalid.status, 400);

  const registered = await call('POST', '/api/auth/register-or-login', 'CLIENTE_B2C', {
    cedulaOrRuc: '0601234560',
    fullName: 'Demo SRI ML',
    email: 'demo-sri@gumorose.ec',
    phone: '0991234567',
    age: 28,
    genderFit: 'UNISEX',
    region: 'SIERRA',
    city: 'Riobamba',
    climateTempC: 11,
    heightCm: 172,
    weightKg: 70,
    preferredFit: 'RELAXED',
    favoriteColorsHex: ['#C86D51', '#2F4842', '#213A5C'],
    preferredCategories: ['CAMISETA'],
    styleDnaVector: { urbano: 80, andino: 70 },
  });
  assert.equal(registered.status, 201, JSON.stringify(registered.body).slice(0, 400));
  const userId = registered.body.user.userId as string;
  assert.ok(userId);
  assert.ok(registered.body.recommendations.length > 0);
  assert.equal(registered.body.recommendations[0].recommendedSize, 'M');
  for (const rec of registered.body.recommendations) {
    assert.ok(rec.affinityScorePct >= 65 && rec.affinityScorePct <= 99);
    assert.ok(rec.matchReasons.length >= 1);
  }
  const sorted = [...registered.body.recommendations].sort(
    (a: Json, b: Json) => b.affinityScorePct - a.affinityScorePct,
  );
  assert.deepEqual(
    registered.body.recommendations.map((r: Json) => r.garmentId),
    sorted.map((r: Json) => r.garmentId),
  );

  const dataset = await call('GET', '/api/ml/dataset', 'SUPER_ADMIN');
  assert.equal(dataset.status, 200);
  assert.ok(dataset.body.records.some((r: Json) => r.userId === userId && r.cedulaOrRuc === '0601234560'));
  assert.ok(dataset.body.clusters.length >= 1);
  const csv = await call('GET', '/api/ml/dataset/export-csv', 'SUPER_ADMIN');
  assert.equal(csv.status, 200);
  assert.ok(String(csv.body.raw ?? '').includes('0601234560'));

  const checkout = await quoteAndCheckout(tee, 1, { buyerUserId: userId });
  assert.ok(checkout.erpOrder?.orderCode, JSON.stringify(checkout).slice(0, 400));
  const invoice = checkout.sriInvoice;
  assert.ok(invoice, 'ORDER_PAID_CHECKOUT debió emitir la factura SRI automáticamente');
  assert.equal(invoice.sriStatus, 'AUTORIZADO_SRI');
  assert.match(invoice.invoiceNumber, /^001-001-\d{9}$/);
  assert.equal(invoice.accessKey49.length, 49);
  assert.equal(validateSriAccessKey(invoice.accessKey49), true);
  assert.equal(invoice.emisor.ruc, '0691728394001');
  assert.equal(invoice.comprador.identificacion, '0601234560');
  assert.ok(Math.abs(invoice.subtotalIva15 * 0.15 - invoice.iva15Usd) <= 0.02);
  assert.ok(
    Math.abs(invoice.subtotal0 + invoice.subtotalIva15 + invoice.iva15Usd - invoice.importeTotalUsd) <= 0.02,
  );
  assert.ok(invoice.xmlSignedContent.includes('<factura id="comprobante" version="2.1.0">'));
  assert.ok(invoice.xmlSignedContent.includes('<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:etsi="http://uri.etsi.org/01903/v1.3.2#">'));
  assert.ok(invoice.xmlSignedContent.includes('rsa-sha1'));
  assert.ok(invoice.rideHtmlContent.includes(invoice.accessKey49));

  const listed = await call('GET', `/api/sri/invoices?boxId=${checkout.id}`, 'CLIENTE_B2C');
  assert.equal(listed.status, 200);
  assert.ok(listed.body.items.some((inv: Json) => inv.id === invoice.id));
  const xml = await call('GET', `/api/sri/invoices/${invoice.id}/xml`, 'CLIENTE_B2C');
  assert.equal(xml.status, 200);
  assert.ok(String(xml.body.raw ?? '').includes('version="2.1.0"'));
  const ride = await call('GET', `/api/sri/invoices/${invoice.id}/ride`, 'CLIENTE_B2C');
  assert.equal(ride.status, 200);
  assert.ok(String(ride.body.raw ?? '').includes(invoice.accessKey49));
});

test.after(async () => {
  await app.close();
});
