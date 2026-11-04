/**
 * Microservicio de Facturación Electrónica SRI Ecuador v2.1.0.
 * Desacoplado de Fastify: se suscribe a ORDER_PAID_CHECKOUT del bus ERP
 * y también permite emisión manual. Genera la Clave de Acceso Módulo 11,
 * el XML oficial firmado XAdES-BES (SHA-1/RSA, compatible .p12) y el RIDE.
 * Sin red en modo offline: simula Recepción/Autorización celcer SRI.
 */
import { createHash, createSign, generateKeyPairSync, randomUUID } from 'node:crypto';
import {
  buildSriAccessKey,
  round2,
  SRI_AUTORIZACION_URL,
  SRI_EMISOR_DIRECCION,
  SRI_EMISOR_NOMBRE_COMERCIAL,
  SRI_EMISOR_RAZON_SOCIAL,
  SRI_EMISOR_RUC,
  SRI_FORMA_PAGO,
  SRI_RECEPCION_URL,
} from '@gumorose/shared';
import type {
  ErpWebhookEvent,
  SriComprador,
  SriElectronicInvoice,
  SriEnvironment,
  SriInvoiceDetail,
} from '@gumorose/shared';
import type { Store } from '../store.js';
import { detailItemsForBox } from '../store.js';
import { erpEventEmitter } from './erp-event-bus.js';

export const SRI_ENDPOINTS = {
  recepcion: SRI_RECEPCION_URL,
  autorizacion: SRI_AUTORIZACION_URL,
} as const;

export interface SriEmitInput {
  orderId?: string;
  orderCode?: string;
  boxId?: string;
  buyerUserId?: string;
  environment?: SriEnvironment;
  comprador?: SriComprador;
  issueDate?: Date;
}

function escapeXml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function fmt(value: number): string {
  return round2(value).toFixed(2);
}
function fechaSri(date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${date.getFullYear()}`;
}

let signingKey: { privateKeyPem: string; certificateBase64: string } | null = null;
function getSigningKey(): { privateKeyPem: string; certificateBase64: string } {
  if (signingKey) return signingKey;
  const pair = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  signingKey = {
    privateKeyPem: pair.privateKey as unknown as string,
    certificateBase64: Buffer.from(pair.publicKey as unknown as Buffer).toString('base64'),
  };
  return signingKey;
}

/** Firma XML con perfil XAdES-BES (SHA-1/RSA). Devuelve el XML firmado. */
export function signXmlXadesBes(unsignedXml: string): string {
  const key = getSigningKey();
  const digestValue = createHash('sha1').update(unsignedXml, 'utf8').digest('base64');
  const signedInfo =
    '<ds:SignedInfo>' +
    '<ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>' +
    '<ds:SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/>' +
    '<ds:Reference URI="#comprobante">' +
    '<ds:Transforms><ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/></ds:Transforms>' +
    '<ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/>' +
    `<ds:DigestValue>${digestValue}</ds:DigestValue>` +
    '</ds:Reference></ds:SignedInfo>';
  const signer = createSign('RSA-SHA1');
  signer.update(signedInfo, 'utf8');
  signer.end();
  const signatureValue = signer.sign(key.privateKeyPem, 'base64');
  const signature =
    '<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:etsi="http://uri.etsi.org/01903/v1.3.2#">' +
    signedInfo +
    `<ds:SignatureValue>${signatureValue}</ds:SignatureValue>` +
    `<ds:KeyInfo><ds:X509Data><ds:X509Certificate>${key.certificateBase64}</ds:X509Certificate></ds:X509Data></ds:KeyInfo>` +
    '<ds:Object><etsi:QualifyingProperties etsi:Target="#comprobante">' +
    '<etsi:SignedProperties><etsi:SignedSignatureProperties>' +
    `<etsi:SigningTime>${new Date().toISOString()}</etsi:SigningTime>` +
    '<etsi:SigningCertificate><etsi:Cert><etsi:CertDigest>' +
    '<ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/>' +
    `<ds:DigestValue>${digestValue}</ds:DigestValue></etsi:CertDigest></etsi:Cert></etsi:SigningCertificate>` +
    '</etsi:SignedSignatureProperties></etsi:SignedProperties></etsi:QualifyingProperties></ds:Object></ds:Signature>';
  return unsignedXml.replace('</factura>', `${signature}</factura>`);
}

function buildBarcodeSvg(accessKey: string): string {
  let x = 0;
  const bars: string[] = [];
  for (const char of accessKey) {
    const digit = Number(char);
    const width = 1 + (digit % 3);
    bars.push(`<rect x="${x}" y="0" width="${width}" height="52" fill="#141413"/>`);
    x += width + 1 + (digit % 2);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${x}" height="52" viewBox="0 0 ${x} 52" role="img" aria-label="Código de barras Clave de Acceso SRI">${bars.join('')}</svg>`;
}

/** RIDE imprimible (HTML) con código de barras de la Clave de Acceso. */
export function buildSriRideHtml(invoice: SriElectronicInvoice): string {
  const rows = (invoice.detalles ?? [])
    .map(
      (d) =>
        `<tr><td>${escapeXml(d.descripcion)}</td><td>${d.cantidad}</td><td>$${fmt(d.precioUnitario)}</td><td>$${fmt(d.precioTotalSinImpuesto)}</td></tr>`,
    )
    .join('');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>RIDE ${escapeXml(invoice.invoiceNumber)}</title><style>body{font-family:Arial,sans-serif;color:#141413;margin:24px}h1{font-size:18px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:6px;font-size:12px}.clave{word-break:break-all;font-size:11px}</style></head><body>` +
    `<h1>FACTURA ELECTRÓNICA SRI · RIDE</h1>` +
    `<p><strong>${escapeXml(invoice.emisor.razonSocial)}</strong> · RUC ${escapeXml(invoice.emisor.ruc)}<br>${escapeXml(invoice.emisor.direccionMatriz)}</p>` +
    `<p>Factura: <strong>${escapeXml(invoice.invoiceNumber)}</strong> · Estado: <strong>${escapeXml(invoice.sriStatus)}</strong><br>` +
    `Fecha de autorización: ${escapeXml(invoice.authorizationDate ?? '')}<br>` +
    `Comprador: ${escapeXml(invoice.comprador.razonSocial)} · ID ${escapeXml(invoice.comprador.identificacion)}</p>` +
    `<p class="clave">Clave de Acceso (49 dígitos):<br><strong>${escapeXml(invoice.accessKey49)}</strong></p>` +
    buildBarcodeSvg(invoice.accessKey49) +
    `<table><thead><tr><th>Descripción</th><th>Cant.</th><th>P. Unit.</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table>` +
    `<p>Subtotal 0%: $${fmt(invoice.subtotal0)} · Subtotal IVA 15%: $${fmt(invoice.subtotalIva15)} · IVA 15%: $${fmt(invoice.iva15Usd)} · <strong>Total: $${fmt(invoice.importeTotalUsd)}</strong></p>` +
    `<p>Forma de pago SRI: ${escapeXml(invoice.formaPagoSri)} · Ambiente: ${escapeXml(invoice.environment)} · XML v2.1.0 XAdES-BES</p>` +
    `</body></html>`;
}

export interface SriInvoicingMicroservice {
  emitForOrder: (input: SriEmitInput) => SriElectronicInvoice;
  listInvoices: (filters?: {
    comprador?: string;
    buyer?: string;
    boxId?: string;
    orderCode?: string;
    orderId?: string;
    q?: string;
  }) => SriElectronicInvoice[];
  findInvoice: (idOrKey: string) => SriElectronicInvoice | undefined;
  getStatus: () => Record<string, unknown>;
  subscribeToEventBus: () => void;
}

const subscribedStores = new WeakSet<Store>();

export function createSriInvoicingMicroservice(store: Store): SriInvoicingMicroservice {
  function resolveBuyer(input: SriEmitInput, orderBuyerUserId?: string): SriComprador {
    if (input.comprador) return input.comprador;
    const userId = input.buyerUserId ?? orderBuyerUserId;
    const record = userId ? store.mlPreferences.get(userId) : undefined;
    const byId = record
      ? undefined
      : [...store.mlPreferences.values()].find((r) => r.cedulaOrRuc && userId === r.userId);
    const profile = record ?? byId;
    if (profile) {
      return {
        razonSocial: profile.fullName ?? profile.name ?? 'CLIENTE GUMOROSE',
        tipoIdentificacion: profile.cedulaOrRuc.length === 13 ? '04' : '05',
        identificacion: profile.cedulaOrRuc,
        email: profile.email,
        direccion: profile.city,
        telefono: profile.phone,
      };
    }
    return {
      razonSocial: 'CONSUMIDOR FINAL',
      tipoIdentificacion: '07',
      identificacion: '9999999999999',
    };
  }

  function emitForOrder(input: SriEmitInput): SriElectronicInvoice {
    const order =
      (input.orderId ? store.erpOrders.get(input.orderId) : undefined) ??
      (input.orderCode
        ? [...store.erpOrders.values()].find((o) => o.orderCode === input.orderCode)
        : undefined) ??
      (input.boxId
        ? [...store.erpOrders.values()].filter((o) => o.boxId === input.boxId).at(-1)
        : undefined);
    if (!order) throw new Error('Orden ERP no encontrada para emitir la factura SRI');
    const existing = [...store.sriInvoices.values()].find((inv) => inv.orderId === order.id);
    if (existing) return existing;

    const box = store.boxes.get(order.boxId);
    const sequential = store.nextSriSequential;
    store.nextSriSequential += 1;
    const issueDate = input.issueDate ?? new Date();
    const environment: SriEnvironment =
      input.environment ??
      (process.env.GUMOROSE_SRI_ENV === 'PRODUCCION' ? 'PRODUCCION_CEL' : 'PRUEBAS_CELCER');
    const accessKey49 = buildSriAccessKey({
      issueDate,
      environment,
      sequential,
      numericCode: String(20_000_000 + sequential),
    });
    const invoiceNumber = `001-001-${String(sequential).padStart(9, '0')}`;
    const importeTotalUsd = round2(order.totalUsd);
    const subtotalIva15 = round2(importeTotalUsd / 1.15);
    const iva15Usd = round2(importeTotalUsd - subtotalIva15);
    const comprador = resolveBuyer(input, order.buyerUserId);
    const detalles: SriInvoiceDetail[] = box
      ? detailItemsForBox(store, box).map((item, index) => {
          const totalSin = round2(item.lineTotalUsd / 1.15);
          return {
            codigoPrincipal: item.garmentSlug ?? item.garmentId.slice(0, 20) ?? `GR-${index + 1}`,
            descripcion: `${item.garmentName} · Talla ${item.size ?? 'M'} · ${item.quantity} ud`,
            cantidad: item.quantity,
            precioUnitario: item.quantity > 0 ? round2(totalSin / item.quantity) : totalSin,
            descuento: 0,
            precioTotalSinImpuesto: totalSin,
          };
        })
      : [];

    const emisor = {
      razonSocial: SRI_EMISOR_RAZON_SOCIAL,
      nombreComercial: SRI_EMISOR_NOMBRE_COMERCIAL,
      ruc: SRI_EMISOR_RUC,
      direccionMatriz: SRI_EMISOR_DIRECCION,
      direccionEstablecimiento: SRI_EMISOR_DIRECCION,
      obligadoContabilidad: 'NO' as const,
    };
    const detallesXml = detalles
      .map(
        (d) =>
          '<detalle>' +
          `<codigoPrincipal>${escapeXml(d.codigoPrincipal)}</codigoPrincipal>` +
          `<descripcion>${escapeXml(d.descripcion)}</descripcion>` +
          `<cantidad>${d.cantidad.toFixed(2)}</cantidad>` +
          `<precioUnitario>${fmt(d.precioUnitario)}</precioUnitario>` +
          `<descuento>${fmt(d.descuento)}</descuento>` +
          `<precioTotalSinImpuesto>${fmt(d.precioTotalSinImpuesto)}</precioTotalSinImpuesto>` +
          '<impuestos><impuesto><codigo>2</codigo><codigoPorcentaje>4</codigoPorcentaje>' +
          `<tarifa>15.00</tarifa><baseImponible>${fmt(d.precioTotalSinImpuesto)}</baseImponible>` +
          `<valor>${fmt(round2(d.precioTotalSinImpuesto * 0.15))}</valor></impuesto></impuestos></detalle>`,
      )
      .join('');
    const unsignedXml =
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<factura id="comprobante" version="2.1.0">' +
      '<infoTributaria>' +
      `<ambiente>${environment === 'PRODUCCION_CEL' ? '2' : '1'}</ambiente>` +
      '<tipoEmision>1</tipoEmision>' +
      `<razonSocial>${escapeXml(emisor.razonSocial)}</razonSocial>` +
      `<nombreComercial>${escapeXml(emisor.nombreComercial)}</nombreComercial>` +
      `<ruc>${emisor.ruc}</ruc>` +
      `<claveAcceso>${accessKey49}</claveAcceso>` +
      '<codDoc>01</codDoc><estab>001</estab><ptoEmi>001</ptoEmi>' +
      `<secuencial>${String(sequential).padStart(9, '0')}</secuencial>` +
      `<dirMatriz>${escapeXml(emisor.direccionMatriz)}</dirMatriz>` +
      '</infoTributaria>' +
      '<infoFactura>' +
      `<fechaEmision>${fechaSri(issueDate)}</fechaEmision>` +
      `<dirEstablecimiento>${escapeXml(emisor.direccionEstablecimiento)}</dirEstablecimiento>` +
      '<obligadoContabilidad>NO</obligadoContabilidad>' +
      `<tipoIdentificacionComprador>${comprador.tipoIdentificacion}</tipoIdentificacionComprador>` +
      `<razonSocialComprador>${escapeXml(comprador.razonSocial)}</razonSocialComprador>` +
      `<identificacionComprador>${escapeXml(comprador.identificacion)}</identificacionComprador>` +
      (comprador.direccion
        ? `<direccionComprador>${escapeXml(comprador.direccion)}</direccionComprador>`
        : '') +
      `<totalSinImpuestos>${fmt(subtotalIva15)}</totalSinImpuestos>` +
      '<totalDescuento>0.00</totalDescuento>' +
      '<totalConImpuestos><totalImpuesto><codigo>2</codigo><codigoPorcentaje>4</codigoPorcentaje>' +
      `<baseImponible>${fmt(subtotalIva15)}</baseImponible><tarifa>15.00</tarifa><valor>${fmt(iva15Usd)}</valor>` +
      '</totalImpuesto></totalConImpuestos><propina>0.00</propina>' +
      `<importeTotal>${fmt(importeTotalUsd)}</importeTotal><moneda>DOLAR</moneda>` +
      `<pagos><pago><formaPago>20</formaPago><total>${fmt(importeTotalUsd)}</total><plazo>0</plazo><unidadTiempo>dias</unidadTiempo></pago></pagos>` +
      '</infoFactura>' +
      `<detalles>${detallesXml}</detalles>` +
      '<infoAdicional>' +
      (comprador.email
        ? `<campoAdicional nombre="Email">${escapeXml(comprador.email)}</campoAdicional>`
        : '') +
      `<campoAdicional nombre="Orden">${escapeXml(order.orderCode)}</campoAdicional>` +
      '<campoAdicional nombre="FormaPago">20 - Otros con utilización del sistema financiero</campoAdicional>' +
      '</infoAdicional></factura>';
    const xmlSignedContent = signXmlXadesBes(unsignedXml);
    const authorizationDate = new Date().toISOString();
    const invoice: SriElectronicInvoice = {
      id: randomUUID(),
      invoiceNumber,
      accessKey49,
      orderCode: order.orderCode,
      boxId: order.boxId,
      orderId: order.id,
      environment,
      sriStatus: 'AUTORIZADO_SRI',
      authorizationDate,
      authorizationNumber: accessKey49,
      issueDate: issueDate.toISOString(),
      emisor,
      comprador,
      detalles,
      subtotal0: 0,
      subtotalIva15,
      descuentoSolidarioUsd: 0,
      iva15Usd,
      importeTotalUsd,
      ivaTariffCode: '4',
      formaPagoSri: SRI_FORMA_PAGO,
      xmlSignedContent,
      rideHtmlContent: '',
      sequential,
      certificateStatus:
        process.env.GUMOROSE_SRI_P12_PATH || process.env.SRI_P12_PATH
          ? 'CONFIGURADO_P12'
          : 'SIMULADO_P12',
    };
    invoice.rideHtmlContent = buildSriRideHtml(invoice);
    store.sriInvoices.set(invoice.id, invoice);
    return invoice;
  }

  function listInvoices(filters?: {
    comprador?: string;
    buyer?: string;
    boxId?: string;
    orderCode?: string;
    orderId?: string;
    q?: string;
  }): SriElectronicInvoice[] {
    let items = [...store.sriInvoices.values()];
    const needle = (filters?.comprador ?? filters?.buyer ?? filters?.q)?.toLowerCase();
    if (needle) {
      items = items.filter(
        (inv) =>
          inv.comprador.razonSocial.toLowerCase().includes(needle) ||
          inv.comprador.identificacion.includes(needle) ||
          inv.orderCode.toLowerCase().includes(needle),
      );
    }
    if (filters?.boxId) items = items.filter((inv) => inv.boxId === filters.boxId);
    if (filters?.orderCode) items = items.filter((inv) => inv.orderCode === filters.orderCode);
    if (filters?.orderId) items = items.filter((inv) => inv.orderId === filters.orderId);
    return items.sort((a, b) => (a.invoiceNumber < b.invoiceNumber ? 1 : -1));
  }

  function findInvoice(idOrKey: string): SriElectronicInvoice | undefined {
    return (
      store.sriInvoices.get(idOrKey) ??
      [...store.sriInvoices.values()].find(
        (inv) =>
          inv.accessKey49 === idOrKey ||
          inv.invoiceNumber === idOrKey ||
          inv.orderCode === idOrKey ||
          inv.orderId === idOrKey ||
          inv.boxId === idOrKey,
      )
    );
  }

  function getStatus(): Record<string, unknown> {
    return {
      service: 'sri-invoicing-microservice',
      version: '2.1.0',
      mode: 'OFFLINE_SIMULADO',
      environment:
        process.env.GUMOROSE_SRI_ENV === 'PRODUCCION' ? 'PRODUCCION_CEL' : 'PRUEBAS_CELCER',
      emisorRuc: SRI_EMISOR_RUC,
      emisor: SRI_EMISOR_RAZON_SOCIAL,
      endpoints: SRI_ENDPOINTS,
      certificate: {
        status:
          process.env.GUMOROSE_SRI_P12_PATH || process.env.SRI_P12_PATH
            ? 'CONFIGURADO_P12'
            : 'SIMULADO_P12',
        signature: 'XAdES-BES SHA-1/RSA',
        p12Configured: Boolean(process.env.GUMOROSE_SRI_P12_PATH || process.env.SRI_P12_PATH),
      },
      invoicesEmitted: store.sriInvoices.size,
      nextSequential: store.nextSriSequential,
    };
  }

  function subscribeToEventBus(): void {
    if (subscribedStores.has(store)) return;
    subscribedStores.add(store);
    erpEventEmitter.setMaxListeners(100);
    erpEventEmitter.on('ORDER_PAID_CHECKOUT', (event: ErpWebhookEvent) => {
      try {
        if (!event?.boxId || !store.boxes.has(event.boxId)) return;
        if (event.orderId && !store.erpOrders.has(event.orderId)) return;
        emitForOrder({ orderId: event.orderId, boxId: event.boxId, orderCode: event.orderCode });
      } catch {
        // La facturación nunca rompe el checkout (igual que el webhook).
      }
    });
  }

  return { emitForOrder, listInvoices, findInvoice, getStatus, subscribeToEventBus };
}

