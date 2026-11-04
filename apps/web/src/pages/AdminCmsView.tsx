import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Award,
  BrainCircuit,
  Check,
  Factory,
  ImagePlus,
  Landmark,
  Loader2,
  Lock,
  Pencil,
  Power,
  Printer,
  RefreshCw,
  Search,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Users,
  Warehouse,
  X,
} from 'lucide-react';
import type {
  EcuadorRegion,
  GarmentCategory,
  GarmentTemplate,
  SriElectronicInvoice,
} from '@gumorose/shared';
import {
  PLANT_PRODUCTION_STAGES_ORDERED,
  type ErpFinancialSummary,
  type ErpProductionOrder,
  type ErpWebhookEvent,
  type FinancialLedgerEntry,
  type PlantProductionStage,
  type SupplyPurchaseAlert,
  type SystemUser,
  type UserRole,
} from '@gumorose/shared';
import {
  advanceErpOrderStage,
  createGarment,
  createMaterial,
  createSystemUser,
  fetchAiConfig,
  fetchBodegaAlerts,
  fetchCmsGarments,
  fetchErpFinanceSummary,
  fetchErpOrders,
  fetchMaterials,
  fetchMlDataset,
  fetchMlDatasetCsv,
  fetchPlantStatus,
  fetchSriInvoices,
  fetchSriStatus,
  fetchStitchFixInsights,
  fetchSystemUsers,
  generateTechpack,
  launchHybridDesign,
  setAdminAuth,
  sriRideUrl,
  sriXmlUrl,
  type MlDatasetResponse,
  settleErpOrderBalance,
  toggleGarment,
  updateAiConfig,
  updateGarment,
  updateMaterialStock,
  updateSystemUserRole,
  type AdminRole,
  type AiConfigResponse,
  type BodegaAlertsResponse,
  type MaterialCreateInput,
  type MaterialItem,
  type PlantStatusResponse,
  type StitchFixInsightsResponse,
  type SystemUserCreatePayload,
  type TechpackResponse,
} from '../services/api';
import { ADMIN_ROLES, adminUserIdFor } from '../App';
import { useBox } from '../context/BoxContext';
import { compressImageFileToDataUrl } from '../services/image';
import { OrderItemsDetail } from '../components/OrderItemsDetail';
import { GarmentCanvas } from '../components/GarmentCanvas';
import { SlideOverDrawer } from '../components/erp/SlideOverDrawer';
import { CATEGORY_ORDER, colorHexOf } from '../data/regions';

export type AdminTab = 'planta' | 'bodega' | 'cms' | 'inteligencia' | 'finanzas' | 'gobierno';

/**
 * Matriz RBAC del portal: qué consolas opera cada rol administrativo.
 * El Sidebar muestra siempre los 6 módulos; los no permitidos se ven
 * con candado "Solo Lectura / Restringido RBAC" y no se pueden abrir.
 * Gobierno es visible para todos, pero solo SUPER_ADMIN opera en ella:
 * el resto ve la pantalla "Acceso Restringido RBAC 403" deshabilitada.
 */
export const TABS_BY_ROLE: Record<AdminRole, AdminTab[]> = {
  SUPER_ADMIN: ['planta', 'bodega', 'cms', 'inteligencia', 'finanzas', 'gobierno'],
  ADMIN_GERENCIA: ['planta', 'bodega', 'cms', 'inteligencia', 'finanzas', 'gobierno'],
  ADMIN_BODEGA: ['planta', 'bodega', 'gobierno'],
  ADMIN_PLANTA: ['planta', 'bodega', 'gobierno'],
};

/** Metros de tela por unidad según categoría (BOM de planta). */
export function fabricMetersForCategory(category: GarmentCategory): number {
  switch (category) {
    case 'PANTALON':
      return 1.5;
    case 'CAMISA':
      return 1.2;
    case 'POLO':
      return 0.85;
    default:
      return 0.71;
  }
}

const CAN_ADVANCE_PLANT: AdminRole[] = ['SUPER_ADMIN', 'ADMIN_PLANTA', 'ADMIN_GERENCIA'];
const CAN_WRITE_CMS: AdminRole[] = ['SUPER_ADMIN', 'ADMIN_GERENCIA'];
const CAN_MANAGE_STOCK: AdminRole[] = ['SUPER_ADMIN', 'ADMIN_GERENCIA', 'ADMIN_BODEGA'];

function rbacNotice(role: AdminRole, action: string): string {
  return `Permiso RBAC denegado para ${role}: "${action}" requiere un rol autorizado. Cambia de rol arriba o pide acceso a un SUPER_ADMIN.`;
}

/** Etiquetas cortas del pipeline industrial (reutilizadas en la consola). */
export const STAGE_SHORT_LABEL: Record<PlantProductionStage, string> = {
  '1_DISENO_ARTE': '1. Diseño',
  '2_MATERIA_PRIMA': '2. Materia prima',
  '3_PATRONAJE': '3. Patronaje',
  '4_CORTE': '4. Corte',
  '5_TIQUETEADO': '5. Tiqueteado',
  '6_COSTURA_ARMADO': '6. Costura',
  '7_ESTAMPADO_SUBLIMADO': '7. Estampado',
  '8_CONTROL_CALIDAD': '8. Control calidad',
  '9_SELLO_AZUL': '9. Sello Azul',
  '10_PLANCHADO_ETIQUETADO_INEN': '10. Planchado/INEN',
  '11_EMPAQUE_DESPACHO': '11. Empaque/Despacho',
};

const EMPTY_FORM = {
  slug: '',
  name: '',
  category: 'CAMISETA' as GarmentCategory,
  description: '',
  baseProductionCost: '6.56',
  baseMarginPct: '32',
  baseSalePrice: '8.65',
  baseTimeMinutes: '27',
  sewingMinutes: '9',
  finishingMinutes: '18',
  sizes: 'XS, S, M, L, XL, XXL',
  colors: 'BLANCO, NEGRO',
  recommendedRegions: ['SIERRA'] as EcuadorRegion[],
  climateNote: '',
  imageUrl: '',
  active: true,
};

type CmsForm = typeof EMPTY_FORM;

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((s) => s.length > 0);
}

const STATUS_STYLE: Record<string, string> = {
  ACTIVA: 'bg-green-100 text-green-800',
  MANTENIMIENTO: 'bg-amber-100 text-amber-900',
  INACTIVA: 'bg-stone-200 text-stone-600',
};

function inputClass(): string {
  return 'mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm';
}

/* ------------------------------------------------------------------ */
/* Facturación Electrónica SRI + Dataset ML (consolas ERP)              */
/* ------------------------------------------------------------------ */

function downloadTextFile(filename: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function SriInvoicingPanel(): React.JSX.Element {
  const [invoices, setInvoices] = useState<SriElectronicInvoice[]>([]);
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);
  const [selected, setSelected] = useState<SriElectronicInvoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, state] = await Promise.all([fetchSriInvoices(), fetchSriStatus()]);
      setInvoices(list.items);
      setStatus(state);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo leer el microservicio SRI.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const certificate = (status?.certificate ?? {}) as { status?: string; signature?: string };
  return (
    <section className="rounded-2xl border border-gum-line bg-white p-5 shadow-editorial" aria-label="Facturación Electrónica SRI">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gum-terracottadark">Microservicio de Facturación Electrónica SRI Ecuador</p>
          <h3 className="font-display text-lg font-semibold text-gum-espresso">celcer.sri.gob.ec · v2.1.0 · XAdES-BES</h3>
          <p className="mt-1 text-xs text-stone-500">
            Emisor Confecciones Gumorose S.A.S. · RUC 0691728394001 · Certificado .p12: {certificate.status ?? 'SIMULADO_P12'} ({certificate.signature ?? 'XAdES-BES SHA-1/RSA'})
          </p>
        </div>
        <button type="button" onClick={() => void load()} className="inline-flex items-center gap-1.5 rounded-full border border-gum-line px-3 py-1.5 text-xs font-bold">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden /> Actualizar SRI
        </button>
      </div>
      {error && <p className="mt-2 text-xs font-bold text-red-700">{error}</p>}
      {invoices.length === 0 && !loading ? (
        <p className="mt-3 text-sm text-stone-500">Sin facturas todavía: paga una Caja Gumorose y ORDER_PAID_CHECKOUT emitirá la primera.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b border-stone-200 bg-stone-50 text-xs uppercase text-stone-500"><th className="px-3 py-2">Factura</th><th className="px-3 py-2">Comprador</th><th className="px-3 py-2">Clave de Acceso 49 dígitos</th><th className="px-3 py-2 text-right">Subtotal</th><th className="px-3 py-2 text-right">IVA 15%</th><th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2">Acciones</th></tr></thead>
            <tbody className="divide-y divide-stone-100">
              {invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td className="px-3 py-2 font-mono font-bold">{invoice.invoiceNumber}<span className="block text-[10px] font-semibold text-green-700">{invoice.sriStatus}</span></td>
                  <td className="px-3 py-2 text-xs">{invoice.comprador.razonSocial}<span className="block text-stone-400">{invoice.comprador.identificacion}</span></td>
                  <td className="max-w-56 break-all px-3 py-2 font-mono text-[10px]">{invoice.accessKey49}</td>
                  <td className="px-3 py-2 text-right">${(invoice.subtotal0 + invoice.subtotalIva15).toFixed(2)}</td>
                  <td className="px-3 py-2 text-right">${invoice.iva15Usd.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right font-bold">${invoice.importeTotalUsd.toFixed(2)}</td>
                  <td className="px-3 py-2"><span className="flex gap-1"><button type="button" onClick={() => setSelected(invoice)} className="rounded bg-gum-ink px-2 py-1 text-[11px] font-bold text-white">RIDE</button><a href={sriXmlUrl(invoice.id)} download className="rounded border border-stone-300 px-2 py-1 text-[11px] font-bold">XML</a></span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <SlideOverDrawer open={selected !== null} title={selected ? `RIDE ${selected.invoiceNumber}` : 'RIDE SRI'} subtitle={selected?.accessKey49} onClose={() => setSelected(null)}>
        {selected && (
          <div className="space-y-3">
            <p className="text-sm"><strong>{selected.emisor.razonSocial}</strong> · RUC {selected.emisor.ruc}<br />{selected.emisor.direccionMatriz}</p>
            <p className="break-all rounded bg-white p-3 font-mono text-xs">{selected.accessKey49}</p>
            <p className="text-sm">Subtotal ${(selected.subtotal0 + selected.subtotalIva15).toFixed(2)} · IVA 15% ${selected.iva15Usd.toFixed(2)} · <strong>Total ${selected.importeTotalUsd.toFixed(2)}</strong></p>
            <div className="flex gap-2">
              <a href={sriRideUrl(selected.id)} target="_blank" rel="noreferrer" className="rounded-lg bg-gum-ink px-3 py-2 text-xs font-bold text-white">📄 Ver RIDE (Factura SRI)</a>
              <a href={sriXmlUrl(selected.id)} download className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-bold">📥 Descargar XML Firmado</a>
            </div>
            <iframe title={`RIDE ${selected.invoiceNumber}`} srcDoc={selected.rideHtmlContent} className="h-[520px] w-full rounded border border-stone-200 bg-white" />
          </div>
        )}
      </SlideOverDrawer>
    </section>
  );
}

function MlDatasetPanel(): React.JSX.Element {
  const [dataset, setDataset] = useState<MlDatasetResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setDataset(await fetchMlDataset());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo leer el dataset ML.');
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function exportCsv(): Promise<void> {
    downloadTextFile('gumorose-ml-dataset.csv', await fetchMlDatasetCsv(), 'text/csv;charset=utf-8');
  }
  function exportJson(): void {
    if (dataset) downloadTextFile('gumorose-ml-dataset.json', JSON.stringify(dataset, null, 2), 'application/json');
  }

  return (
    <section className="rounded-2xl border border-gum-line bg-white p-5 shadow-editorial" aria-label="Dataset de Usuarios y Motor Machine Learning">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gum-terracottadark">📊 Dataset de Usuarios & Motor Machine Learning</p>
          <h3 className="font-display text-lg font-semibold text-gum-espresso">Perfilado Cédula/RUC · Coseno + KNN · Talla sugerida</h3>
          <p className="mt-1 text-xs text-stone-500">{dataset?.total ?? 0} usuario(s) en el dataset · {dataset?.clusters.length ?? 0} clúster(es) región/estilo detectados</p>
        </div>
        <span className="flex gap-2">
          <button type="button" onClick={() => void exportCsv()} className="rounded-full bg-gum-ink px-3 py-1.5 text-xs font-bold text-white">📥 Exportar Dataset ML (.CSV / .JSON)</button>
          <button type="button" onClick={exportJson} className="rounded-full border border-gum-line px-3 py-1.5 text-xs font-bold">JSON</button>
          <button type="button" onClick={() => void load()} className="rounded-full border border-gum-line px-3 py-1.5 text-xs font-bold">Actualizar</button>
        </span>
      </div>
      {error && <p className="mt-2 text-xs font-bold text-red-700">{error}</p>}
      {dataset && dataset.clusters.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {dataset.clusters.map((cluster) => (
            <span key={cluster.key} className="rounded-full bg-gum-linen px-3 py-1 text-[11px] font-bold text-gum-salvia">
              {cluster.key}: {cluster.userCount} usuario(s) · ticket ${cluster.avgTicketUsd.toFixed(2)}{cluster.dominantStyleTag ? ` · ${cluster.dominantStyleTag}` : ''}
            </span>
          ))}
        </div>
      )}
      {dataset && dataset.records.length > 0 ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b border-stone-200 bg-stone-50 text-xs uppercase text-stone-500"><th className="px-3 py-2">Usuario</th><th className="px-3 py-2">Edad</th><th className="px-3 py-2">Región/Ciudad</th><th className="px-3 py-2">Medidas</th><th className="px-3 py-2">Colores</th><th className="px-3 py-2">Vector de estilo</th><th className="px-3 py-2 text-right">Ticket prom.</th></tr></thead>
            <tbody className="divide-y divide-stone-100">
              {dataset.records.map((record) => (
                <tr key={record.userId}>
                  <td className="px-3 py-2 text-xs font-semibold">{record.fullName ?? record.userId.slice(0, 8)}<span className="block font-normal text-stone-400">{record.cedulaOrRuc}</span></td>
                  <td className="px-3 py-2">{record.age}</td>
                  <td className="px-3 py-2 text-xs">{record.region} · {record.city} · {record.climateTempC}°C</td>
                  <td className="px-3 py-2 text-xs">{record.heightCm} cm · {record.weightKg} kg · {record.preferredFit}</td>
                  <td className="px-3 py-2"><span className="flex gap-1">{record.favoriteColorsHex.map((hex) => <span key={hex} className="h-4 w-4 rounded-full border border-stone-300" style={{ backgroundColor: hex }} title={hex} />)}</span></td>
                  <td className="max-w-52 break-all px-3 py-2 font-mono text-[10px]">{JSON.stringify(record.styleDnaVector)}</td>
                  <td className="px-3 py-2 text-right">${record.avgTicketUsd.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-3 text-sm text-stone-500">Sin registros todavía: inicia sesión con Mi Perfil IA en Web o Móvil.</p>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Consola 4: Finanzas ERP, Estado de Resultados y Event Bus            */
/* ------------------------------------------------------------------ */

function FinanceConsole({ adminRole }: { adminRole: AdminRole }): React.JSX.Element {
  const [data, setData] = useState<{
    summary: ErpFinancialSummary;
    entries: FinancialLedgerEntry[];
    recentEvents: ErpWebhookEvent[];
    eventLogSize: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchErpFinanceSummary();
      setData({ summary: res.summary, entries: res.entries, recentEvents: res.recentEvents, eventLogSize: res.eventLogSize });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo leer el estado de resultados.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, adminRole]);

  if (loading && !data) return <p className="py-8 text-center text-sm text-stone-500">Calculando estado de resultados…</p>;
  if (error) {
    const denied = error.includes('403') || error.toLowerCase().includes('denegado');
    return (
      <p className="flex items-start gap-1.5 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        {denied ? rbacNotice(adminRole, 'ver finanzas ERP') : error}
      </p>
    );
  }
  if (!data) return <p className="py-8 text-center text-sm text-stone-500">Sin movimientos contables todavía.</p>;

  const cards: { label: string; value: string }[] = [
    { label: 'Ingresos Brutos Totales', value: `$${data.summary.grossRevenueUsd.toFixed(2)}` },
    { label: 'Costo MPD (Materia Prima Directa)', value: `$${data.summary.totalMpdUsd.toFixed(2)}` },
    { label: 'Costo MOD (Mano de Obra Directa)', value: `$${data.summary.totalModUsd.toFixed(2)}` },
    { label: 'Costo CIF (Indirectos de Fabricación)', value: `$${data.summary.totalCifUsd.toFixed(2)}` },
    { label: `Utilidad Operativa Neta (${data.summary.averageMarginPct.toFixed(1)}%)`, value: `$${data.summary.totalOperatingProfitUsd.toFixed(2)}` },
    { label: 'Efectivo Cobrado', value: `$${data.summary.cashCollectedUsd.toFixed(2)}` },
    { label: 'Cuentas por Cobrar B2B (Anticipos 50%)', value: `$${data.summary.receivableUsd.toFixed(2)}` },
    { label: 'Órdenes contabilizadas', value: String(data.summary.totalOrders) },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-2xl border border-gum-line bg-white p-4 shadow-editorial">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">{card.label}</p>
            <p className="font-display text-2xl font-bold tabular-nums text-gum-espresso">{card.value}</p>
          </div>
        ))}
      </div>

      <SriInvoicingPanel />

      <section className="rounded-2xl border border-gum-line bg-white p-5 shadow-editorial" aria-label="Asientos contables">
        <h3 className="font-display text-lg font-semibold text-gum-espresso">Libro Mayor por Orden (OP-XXXX)</h3>
        {data.entries.length === 0 ? (
          <p className="mt-2 text-sm text-stone-500">Aún no hay asientos: paga una caja para generar el primero.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
                  <th className="px-4 py-2.5">Orden</th>
                  <th className="px-4 py-2.5">Modalidad</th>
                  <th className="px-4 py-2.5 text-right">Bruto</th>
                  <th className="px-4 py-2.5 text-right">MPD</th>
                  <th className="px-4 py-2.5 text-right">MOD</th>
                  <th className="px-4 py-2.5 text-right">CIF</th>
                  <th className="px-4 py-2.5 text-right">Utilidad</th>
                  <th className="px-4 py-2.5 text-right">Cobrado</th>
                  <th className="px-4 py-2.5 text-right">Por cobrar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 tabular-nums">
                {data.entries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="px-4 py-2 font-mono font-semibold text-gum-espresso">{entry.orderCode}</td>
                    <td className="px-4 py-2 text-xs">{entry.paymentMode}</td>
                    <td className="px-4 py-2 text-right">${entry.grossRevenueUsd.toFixed(2)}</td>
                    <td className="px-4 py-2 text-right">${entry.mpdCostUsd.toFixed(2)}</td>
                    <td className="px-4 py-2 text-right">${entry.modCostUsd.toFixed(2)}</td>
                    <td className="px-4 py-2 text-right">${entry.cifCostUsd.toFixed(2)}</td>
                    <td className="px-4 py-2 text-right font-semibold text-green-800">${entry.operatingProfitUsd.toFixed(2)}</td>
                    <td className="px-4 py-2 text-right">${entry.cashCollectedUsd.toFixed(2)}</td>
                    <td className="px-4 py-2 text-right">${entry.receivableUsd.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <details className="rounded-2xl border border-gum-line bg-white p-5 shadow-editorial" aria-label="Monitor del Event Bus">
        <summary className="cursor-pointer list-none">
          <span className="flex items-baseline justify-between gap-2">
            <span className="font-display text-lg font-semibold text-gum-espresso">
              Monitor del Event Bus (erpEventLog)
            </span>
            <span className="text-xs text-stone-500">
              {data.eventLogSize} evento(s) · clic para desplegar
            </span>
          </span>
        </summary>
        {data.recentEvents.length === 0 ? (
          <p className="mt-2 text-sm text-stone-500">Sin eventos todavía.</p>
        ) : (
          <ol className="mt-3 space-y-2">
            {data.recentEvents.map((event) => (
              <li key={event.id} className="rounded-lg border border-gum-line bg-gum-alabaster px-3 py-2 text-xs">
                <p className="font-bold text-gum-espresso">
                  {event.type} <span className="font-mono font-normal text-stone-500">{event.orderCode ?? event.boxId?.slice(0, 8) ?? ''}</span>
                </p>
                <p className="text-stone-500">{new Date(event.timestamp).toLocaleString()} · {event.source}</p>
              </li>
            ))}
          </ol>
        )}
      </details>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Inteligencia Stitch Fix & Blue Ocean (dentro de Finanzas)           */
/* ------------------------------------------------------------------ */

function IntelligenceConsole({ adminRole }: { adminRole: AdminRole }): React.JSX.Element {
  const [data, setData] = useState<StitchFixInsightsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [launched, setLaunched] = useState<Record<string, string>>({});
  const [openLot, setOpenLot] = useState(true);
  const canLaunch = adminRole === 'SUPER_ADMIN' || adminRole === 'ADMIN_GERENCIA';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchStitchFixInsights());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo leer la inteligencia de demanda.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, adminRole]);

  async function handleLaunch(recommendationId: string): Promise<void> {
    setLaunchingId(recommendationId);
    try {
      const res = await launchHybridDesign({ recommendationId, openProductionLot: openLot });
      setLaunched((prev) => ({
        ...prev,
        [recommendationId]: res.productionOrder
          ? `${res.garment.name} publicada · lote ${res.productionOrder.orderCode} en planta`
          : `${res.garment.name} publicada en el catálogo oficial`,
      }));
      await load();
    } catch (err) {
      setLaunched((prev) => ({
        ...prev,
        [recommendationId]: err instanceof Error ? err.message : 'No se pudo lanzar la prenda.',
      }));
    } finally {
      setLaunchingId(null);
    }
  }

  if (loading && !data) return <p className="py-8 text-center text-sm text-stone-500">Analizando clósets y Style Shuffle…</p>;
  if (error) {
    return (
      <p className="flex items-start gap-1.5 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {error}
      </p>
    );
  }
  if (!data) return <p className="py-8 text-center text-sm text-stone-500">Sin datos de clóset todavía.</p>;

  const metrics = data.blueOceanMetrics;
  const metricCards = [
    { label: 'Inventario Muerto', value: `${metrics.madeToOrderDeadInventoryPct}% Made-to-Order` },
    { label: 'Máquinas Planta Riobamba', value: String(metrics.plantMachines) },
    { label: 'Tiempo Ciclo Promedio Planta', value: `${metrics.avgProductionMinutesPerUnit} min/ud` },
    { label: 'Retención Clóset Diario', value: `${metrics.closetRetentionPct}% (${metrics.closetActiveUsers}/${metrics.totalUsers})` },
    { label: 'Costo por Uso Promedio', value: `$${metrics.avgCostPerWearUsd.toFixed(2)} / uso` },
    { label: 'Votos Style Shuffle 👍', value: `${metrics.likedVotes}/${metrics.totalStyleVotes} (${metrics.likedPct}%)` },
  ];

  return (
    <div className="space-y-4">
      <MlDatasetPanel />
      <section className="rounded-2xl border border-gum-line bg-white p-5 shadow-editorial" aria-label="Inteligencia de demanda Stitch Fix">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gum-terracottadark">
              Consola 4 · Stitch Fix Hybrid Designs
            </p>
            <h3 className="font-display text-xl font-semibold text-gum-espresso">
              Inteligencia Algorítmica: Demanda, Hybrid Designs &amp; Blue Ocean
            </h3>
          </div>
          <button type="button" onClick={() => void load()} className="inline-flex items-center gap-1.5 rounded-full border border-gum-line bg-white px-3 py-1.5 text-xs font-bold text-stone-700 transition hover:border-gum-espresso">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden /> Actualizar en vivo
          </button>
        </div>
        <p className="mt-1 text-xs text-stone-500">
          Cruza en vivo {data.totals.closetItems} prendas de clóset, {data.totals.styleVotes} votos Style Shuffle y {data.totals.orders} órdenes · {new Date(data.generatedAt).toLocaleString()}
        </p>

        {/* Mapa de Brechas de Armario */}
        <h4 className="mt-4 text-sm font-bold text-gum-ink">Mapa de Brechas de Armario (Closet Gaps en Costa, Sierra y Oriente)</h4>
        <div className="mt-2 grid gap-3 lg:grid-cols-3">
          {Object.entries(data.closetGapsByRegion).map(([region, gaps]) => (
            <div key={region} className="rounded-lg bg-stone-50 p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-gum-ember">{region}</p>
              <div className="mt-2 space-y-2">
                {gaps.map((gap) => (
                  <div key={`${region}-${gap.closetCategory}`}>
                    <div className="flex justify-between gap-2 text-[11px] font-semibold text-stone-600">
                      <span className="truncate">{gap.label}</span>
                      <span>{gap.deficitPct}%</span>
                    </div>
                    <div className="mt-0.5 h-2 overflow-hidden rounded-full bg-stone-200" role="progressbar" aria-valuenow={gap.deficitPct} aria-valuemin={0} aria-valuemax={100} aria-label={gap.label}>
                      <div className="h-full rounded-full bg-gum-ember" style={{ width: `${gap.deficitPct}%` }} />
                    </div>
                    <p className="text-[10px] text-stone-400">Demanda estimada: {gap.estimatedDemandUnits} uds · {gap.closetItemsCount} en clósets de {gap.usersCount} usuario(s)</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Generador Hybrid Designs */}
        <h4 className="mt-5 text-sm font-bold text-gum-ink">Generador Algorítmico “Hybrid Designs” (Del Clóset a las {metrics.plantMachines} Máquinas de Riobamba)</h4>
        <label className="mt-1 flex items-center gap-2 text-xs font-semibold text-stone-600">
          <input type="checkbox" checked={openLot} onChange={(e) => setOpenLot(e.target.checked)} />
          Abrir también lote de producción en planta (OP-XXXX) al lanzar
        </label>
        <div className="mt-2 grid gap-3 lg:grid-cols-3">
          {data.hybridDesignRecommendations.map((rec) => (
            <article key={rec.id} className="flex flex-col rounded-lg border border-stone-200 bg-stone-50 p-4">
              <div className="flex items-start gap-2">
                <span className="h-9 w-9 shrink-0 rounded-full border border-stone-300" style={{ backgroundColor: rec.colorHex }} aria-hidden />
                <div>
                  <h5 className="text-sm font-bold leading-tight text-gum-ink">{rec.name}</h5>
                  <p className="text-[11px] font-semibold text-gum-ember">{rec.region} · {rec.styleTag} · {rec.colorName}</p>
                </div>
                <span className="ml-auto text-right text-sm font-bold text-gum-ink">${rec.suggestedPriceUsd.toFixed(2)}</span>
              </div>
              <dl className="mt-2 space-y-1 text-[11px] text-stone-600">
                <div className="flex justify-between"><dt>Tela bodega Riobamba</dt><dd className="font-semibold text-gum-ink">{rec.fabricName}</dd></div>
                <div className="flex justify-between"><dt>Metros por unidad</dt><dd className="font-semibold text-gum-ink">{rec.fabricMetersPerUnit}m ({rec.fabricMetersTotal}m total)</dd></div>
                <div className="flex justify-between"><dt>Costo MPD+MOD+CIF / ud</dt><dd className="font-semibold text-gum-ink">${rec.productionCostPerUnitUsd.toFixed(2)} ({rec.mpdPerUnitUsd.toFixed(2)}+{rec.modPerUnitUsd.toFixed(2)}+{rec.cifPerUnitUsd.toFixed(2)})</dd></div>
                <div className="flex justify-between"><dt>Margen / tiempo planta</dt><dd className="font-semibold text-gum-ink">{rec.marginPct}% · {rec.baseTimeMinutes} min/ud</dd></div>
                <div className="flex justify-between"><dt>Demanda estimada</dt><dd className="font-semibold text-gum-ink">{rec.estimatedDemandUnits} uds</dd></div>
              </dl>
              <p className="mt-2 flex-1 text-[11px] leading-relaxed text-stone-500">{rec.rationale}</p>
              <button
                type="button"
                disabled={!canLaunch || launchingId === rec.id}
                onClick={() => void handleLaunch(rec.id)}
                className="mt-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-gum-ember px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
              >
                {launchingId === rec.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                Lanzar al Catálogo Oficial + Crear Lote en Planta
              </button>
              {launched[rec.id] && <p className="mt-1.5 text-[11px] font-semibold text-green-800" role="status">{launched[rec.id]} · visible ya en Tienda Web y App Móvil</p>}
              {!canLaunch && <p className="mt-1 text-[10px] text-stone-400">Tu rol puede ver la inteligencia; lanzar requiere SUPER_ADMIN o ADMIN_GERENCIA.</p>}
            </article>
          ))}
        </div>
      </section>

      {/* Blue Ocean Strategy Canvas */}
      <section className="rounded-2xl border border-gum-line bg-gum-espresso p-5 text-white shadow-editorial" aria-label="Matriz de Innovación en Valor Blue Ocean">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gum-oro">
          Blue Ocean · Innovación en Valor
        </p>
        <h3 className="font-display text-xl font-semibold">
          Lienzo Estratégico: Gumorose vs. Industria Tradicional
        </h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {metricCards.map((card) => (
            <div key={card.label} className="rounded-xl bg-white/5 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">{card.label}</p>
              <p className="font-display text-lg font-bold tabular-nums">{card.value}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
                <th className="px-3 py-2">Factor</th>
                <th className="px-3 py-2">Gumorose (Innovación en Valor)</th>
                <th className="px-3 py-2">Retail tradicional</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {metrics.strategyCanvas.map((row) => (
                <tr key={row.factor}>
                  <td className="px-3 py-2 font-semibold text-white">{row.factor}</td>
                  <td className="px-3 py-2 font-semibold text-green-300">{row.gumorose}</td>
                  <td className="px-3 py-2 text-stone-400">{row.traditionalRetail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-stone-400">Gumorose baja costos (0% stock muerto, CMS propio $0, caché SHA-256) mientras sube personalización (Clóset IA + Multi-Logo + Try-On Anatómico).</p>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Consola 5: Gobierno de Usuarios y Asignación de Roles (SUPER_ADMIN)  */
/* ------------------------------------------------------------------ */

const GOVERNABLE_ROLES: UserRole[] = [
  'SUPER_ADMIN',
  'ADMIN_GERENCIA',
  'ADMIN_BODEGA',
  'ADMIN_PLANTA',
  'CLIENTE_B2C',
  'CLIENTE_B2B',
];

/* Tarjeta Motor Meta AI & Créditos Hackathon (solo SUPER_ADMIN). */
function AiConfigCard(): React.JSX.Element {
  const [status, setStatus] = useState<AiConfigResponse | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('muse-wonder-1.0');
  const [savingAi, setSavingAi] = useState(false);
  const [aiMessage, setAiMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetchAiConfig();
      setStatus(res);
      setModel(res.model);
      if (!res.baseUrl.startsWith('META_BASE_URL')) setBaseUrl(res.baseUrl);
    } catch {
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSaveAi(): Promise<void> {
    setSavingAi(true);
    setAiMessage(null);
    try {
      const res = await updateAiConfig({
        apiKey: apiKey.trim() ? apiKey.trim() : undefined,
        baseUrl: baseUrl.trim() ? baseUrl.trim() : undefined,
        model: model as AiConfigResponse['model'],
      });
      setStatus(res);
      setApiKey('');
      setAiMessage(
        res.mode === 'LIVE_META_API'
          ? `Motor Meta AI en vivo con ${res.model}.`
          : 'Guardado en simulación local: pega tu META_API_KEY para ir en vivo.',
      );
    } catch (error) {
      setAiMessage(error instanceof Error ? error.message : 'No se pudo guardar la configuración.');
    } finally {
      setSavingAi(false);
    }
  }

  const live = status?.mode === 'LIVE_META_API';
  return (
    <section
      className="mb-6 rounded-lg border border-stone-200 bg-white p-5 lg:col-span-2"
      aria-label="Motor Meta AI y créditos"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-lg font-semibold text-gum-ink">Motor Meta AI &amp; Créditos Hackathon</h3>
        <span
          className={`rounded-full px-3 py-1 text-xs font-bold ${
            live ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
          }`}
        >
          {live ? 'LIVE META API' : 'LOCAL SIMULATION'}
        </span>
      </div>
      <p className="mt-1 text-sm text-stone-600">
        Créditos disponibles: <strong>${(status?.creditsUsd ?? 147.49).toFixed(2)} USD</strong> · Modelo activo:{' '}
        <strong>{status?.model ?? model}</strong> · Clave: {status?.apiKeyHint ?? 'sin clave'}
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-4">
        <div className="rounded-lg bg-stone-50 p-2">
          <dt className="font-semibold text-stone-500">Llamadas live</dt>
          <dd className="font-display text-base font-bold text-gum-ink">{status?.calls ?? 0}</dd>
        </div>
        <div className="rounded-lg bg-stone-50 p-2">
          <dt className="font-semibold text-stone-500">CACHE HITS = $0.00 ahorrados</dt>
          <dd className="font-display text-base font-bold text-gum-ink">
            {status?.cacheHits ?? 0} (${(status?.cacheSavedUsd ?? 0).toFixed(2)})
          </dd>
        </div>
        <div className="rounded-lg bg-stone-50 p-2">
          <dt className="font-semibold text-stone-500">Tokens</dt>
          <dd className="font-display text-base font-bold text-gum-ink">{status?.tokens ?? 0}</dd>
        </div>
        <div className="rounded-lg bg-stone-50 p-2">
          <dt className="font-semibold text-stone-500">Última latencia</dt>
          <dd className="font-display text-base font-bold text-gum-ink">{status?.lastLatencyMs ?? 0} ms</dd>
        </div>
      </dl>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="block text-sm font-medium text-stone-600">
          META_API_KEY (pegar en 1 clic)
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={status?.hasApiKey ? `Actual: ${status.apiKeyHint}` : 'sk-…'}
            autoComplete="off"
            className={inputClass()}
          />
        </label>
        <label className="block text-sm font-medium text-stone-600">
          META_BASE_URL (Chat Completions)
          <input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://…/v1"
            className={inputClass()}
          />
        </label>
        <label className="block text-sm font-medium text-stone-600">
          Modelo preferido
          <select value={model} onChange={(e) => setModel(e.target.value)} className={inputClass()}>
            {(status?.modelOptions ?? ['muse-wonder-1.0', 'muse-spark-1.3', 'meta-models/muse-spark-open-1026']).map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </label>
      </div>
      {aiMessage && <p className="mt-2 text-sm text-stone-700">{aiMessage}</p>}
      <button
        type="button"
        onClick={() => void handleSaveAi()}
        disabled={savingAi}
        className="mt-3 rounded-lg bg-gum-ink px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
      >
        {savingAi ? 'Guardando…' : 'Guardar y activar Meta AI'}
      </button>
      <p className="mt-2 text-xs text-stone-500">
        Sin clave o sin red, la experiencia sigue con simulación local: nunca se rompe.
      </p>
    </section>
  );
}

function GobiernoConsole({ adminRole }: { adminRole: AdminRole }): React.JSX.Element {
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<SystemUserCreatePayload>({ name: '', email: '', role: 'ADMIN_PLANTA', active: true });

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetchSystemUsers();
      setUsers(res.items);
    } catch (error) {
      setMessage({
        kind: 'error',
        text: error instanceof Error ? error.message : 'No se pudieron leer los usuarios.',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, adminRole]);

  // RBAC estricto: sin SUPER_ADMIN no hay gobierno. La consola muestra la
  // pantalla 403 con todos los formularios y selectores 100% deshabilitados.
  if (adminRole !== 'SUPER_ADMIN') {
    return (
      <div className="space-y-4" aria-label="Acceso Restringido RBAC 403">
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900"
        >
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <div>
            <p className="font-display text-base font-bold">
              Acceso Restringido RBAC 403 · Consola 5 Gobierno Usuarios
            </p>
            <p className="mt-0.5">
              {rbacNotice(adminRole, 'gobernar usuarios y asignar roles')} Todos los
              formularios y selectores están bloqueados: solo un SUPER_ADMIN puede crear
              personal, activar cuentas o cambiar roles.
            </p>
          </div>
        </div>
        <fieldset
          disabled
          aria-disabled="true"
          aria-label="Gobierno bloqueado por RBAC"
          className="grid gap-6 opacity-70 lg:grid-cols-2"
        >
          <section className="h-fit rounded-lg border border-stone-200 bg-white p-5" aria-label="Nuevo miembro (bloqueado)">
            <h3 className="font-display text-lg font-semibold text-gum-ink">Nuevo miembro del personal</h3>
            <div className="mt-4 space-y-3">
              <label className="block text-sm font-medium text-stone-600">
                Nombre
                <input defaultValue="" placeholder="Bloqueado por RBAC 403" className={inputClass()} />
              </label>
              <label className="block text-sm font-medium text-stone-600">
                Email
                <input defaultValue="" placeholder="Bloqueado por RBAC 403" className={inputClass()} />
              </label>
              <label className="block text-sm font-medium text-stone-600">
                Rol inicial
                <select className={inputClass()}>
                  {GOVERNABLE_ROLES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </label>
              <button type="button" className="w-full rounded-lg bg-gum-ember px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
                Crear miembro
              </button>
            </div>
          </section>
          <section className="rounded-lg border border-stone-200 bg-white p-5" aria-label="Usuarios del sistema (bloqueado)">
            <h3 className="font-display text-lg font-semibold text-gum-ink">Usuarios del sistema</h3>
            <ul className="mt-3 space-y-2">
              {(users.length > 0
                ? users
                : [{ id: 'rbac-bloqueado', name: 'Lista bloqueada', email: 'rbac@gumorose.local', role: 'ADMIN_PLANTA' as UserRole, active: false }]
              ).map((user) => (
                <li key={user.id} className="rounded-lg border border-stone-100 bg-stone-50 px-3 py-2">
                  <p className="text-sm font-semibold text-gum-ink">
                    {user.name} <span className="font-normal text-stone-500">{user.email}</span>
                  </p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <select defaultValue={user.role} aria-label={`Rol de ${user.email}`} className="rounded-lg border border-stone-300 bg-white px-2 py-1 text-xs font-semibold">
                      {GOVERNABLE_ROLES.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                    <button type="button" aria-label="Cambiar estado (bloqueado)" className="rounded-lg border border-stone-300 p-1.5 text-stone-400">
                      <Power className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </fieldset>
      </div>
    );
  }

  async function handleCreate(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setMessage(null);
    setSaving(true);
    try {
      const created = await createSystemUser({
        name: form.name.trim(),
        email: form.email.trim(),
        role: form.role,
        companyName: form.companyName?.trim() ? form.companyName.trim() : undefined,
        ruc: form.ruc?.trim() ? form.ruc.trim() : undefined,
      });
      setUsers((prev) => [created, ...prev]);
      setMessage({ kind: 'ok', text: `Miembro creado: ${created.email} (${created.role}).` });
      setForm({ name: '', email: '', role: 'ADMIN_PLANTA', active: true });
      setCreateOpen(false);
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'No se pudo crear el usuario.' });
    } finally {
      setSaving(false);
    }
  }

  async function handleRoleChange(user: SystemUser, role: UserRole): Promise<void> {
    setMessage(null);
    // RBAC estricto: jamás se asigna SUPER_ADMIN a una cuenta de cliente.
    if (
      role === 'SUPER_ADMIN' &&
      (user.role === 'CLIENTE_B2C' || user.role === 'CLIENTE_B2B')
    ) {
      setMessage({
        kind: 'error',
        text: `Acceso Restringido RBAC 403: no se puede asignar SUPER_ADMIN a la cuenta de cliente ${user.email} (${user.role}).`,
      });
      return;
    }
    try {
      const updated = await updateSystemUserRole(user.id, { role });
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      setMessage({ kind: 'ok', text: `${updated.email} ahora es ${updated.role}.` });
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'No se pudo cambiar el rol.' });
    }
  }

  async function handleToggleActive(user: SystemUser): Promise<void> {
    setMessage(null);
    try {
      const updated = await updateSystemUserRole(user.id, { active: !user.active });
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      setMessage({ kind: 'ok', text: `${updated.email} ${updated.active ? 'activado' : 'desactivado'}.` });
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'No se pudo cambiar el estado.' });
    }
  }

  return (
    <div>
      <AiConfigCard />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-stone-600">
          {users.length} usuario(s) del sistema · roles gobernables sin escalar clientes a
          SUPER_ADMIN.
        </p>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex min-h-10 items-center gap-2 rounded-full bg-gum-espresso px-4 py-2 text-sm font-semibold text-white transition hover:bg-gum-salvia"
        >
          + Nuevo Usuario del Sistema
        </button>
      </div>
      <SlideOverDrawer
        open={createOpen}
        title="Nuevo Usuario del Sistema"
        subtitle="Personal ERP · el rol define sus consolas visibles"
        onClose={() => setCreateOpen(false)}
      >
      <section aria-label="Nuevo miembro">
        <form onSubmit={(e) => void handleCreate(e)} className="space-y-3">
          <label className="block text-sm font-medium text-stone-600">
            Nombre
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={2} className={inputClass()} />
          </label>
          <label className="block text-sm font-medium text-stone-600">
            Email
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required className={inputClass()} />
          </label>
          <label className="block text-sm font-medium text-stone-600">
            Rol inicial
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })} className={inputClass()}>
              {GOVERNABLE_ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </label>
          {message && (
            <p className={`text-sm ${message.kind === 'error' ? 'text-red-700' : 'text-green-800'}`}>{message.text}</p>
          )}
          <button type="submit" disabled={saving} className="w-full rounded-full bg-gum-terracotta px-4 py-2.5 text-sm font-semibold text-white hover:bg-gum-terracottadark disabled:opacity-60">
            {saving ? 'Creando…' : 'Crear miembro'}
          </button>
        </form>
      </section>
      </SlideOverDrawer>

      <section className="rounded-2xl border border-gum-line bg-white p-5 shadow-editorial" aria-label="Usuarios del sistema">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold text-gum-ink">Usuarios ({users.length})</h3>
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-semibold text-stone-700 hover:border-gum-ink disabled:opacity-60">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden /> Recargar
          </button>
        </div>
        {loading && users.length === 0 ? (
          <p className="py-8 text-center text-sm text-stone-500">Leyendo usuarios…</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {users.map((user) => (
              <li key={user.id} className="rounded-lg border border-stone-100 bg-stone-50 px-3 py-2">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <p className="font-semibold text-gum-ink">
                    {user.name}{' '}
                    <span className="font-normal text-stone-500">{user.email}</span>
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleToggleActive(user)}
                    title={user.active ? 'Desactivar' : 'Activar'}
                    aria-label={`${user.active ? 'Desactivar' : 'Activar'} a ${user.email}`}
                    className={`rounded-lg border p-1.5 ${user.active ? 'border-green-300 text-green-700' : 'border-stone-300 text-stone-400'}`}
                  >
                    <Power className="h-4 w-4" aria-hidden />
                  </button>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <select
                    value={user.role}
                    onChange={(e) => void handleRoleChange(user, e.target.value as UserRole)}
                    aria-label={`Rol de ${user.email}`}
                    className="rounded-lg border border-stone-300 bg-white px-2 py-1 text-xs font-semibold"
                  >
                    {GOVERNABLE_ROLES.map((r) => (
                      <option
                        key={r}
                        value={r}
                        disabled={
                          r === 'SUPER_ADMIN' &&
                          (user.role === 'CLIENTE_B2C' || user.role === 'CLIENTE_B2B')
                        }
                      >
                        {r}
                      </option>
                    ))}
                  </select>
                  {!user.active && (
                    <span className="rounded bg-stone-200 px-1.5 py-0.5 text-[11px] font-bold text-stone-600">inactivo</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/**
 * Panel Admin: monitor de planta Riobamba, CMS propio de prendas
 * y generador de ficha técnica (Muse Spark).
 */
export function AdminCmsView({
  tab,
  onTabChange,
  adminRole,
  onAdminRoleChange,
}: {
  tab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
  adminRole: AdminRole;
  onAdminRoleChange: (role: AdminRole) => void;
}): React.JSX.Element {
  const { lastPaidBoxId } = useBox();
  const setTab = onTabChange;
  const [orderFilter, setOrderFilter] = useState<
    'ALL' | 'QC' | 'SALDO' | 'SELLO' | 'DESPACHADAS'
  >('ALL');
  const [orderQuery, setOrderQuery] = useState('');
  const [inspectOrderId, setInspectOrderId] = useState<string | null>(null);
  const [matDrawerOpen, setMatDrawerOpen] = useState(false);
  const [cmsDrawerOpen, setCmsDrawerOpen] = useState(false);
  const [aiLive, setAiLive] = useState<boolean | null>(null);
  const [aiCacheSaved, setAiCacheSaved] = useState(0);

  const allowedTabs = TABS_BY_ROLE[adminRole];

  // Identidad administrativa efectiva mientras el portal está montado.
  // Al salir, se libera y las peticiones vuelven a la sesión comercial.
  useEffect(() => {
    setAdminAuth({ userId: adminUserIdFor(adminRole), role: adminRole });
    return () => {
      setAdminAuth(null);
    };
  }, [adminRole]);

  // Si el rol no ve la pestaña activa, se redirige a la primera permitida.
  useEffect(() => {
    if (!TABS_BY_ROLE[adminRole].includes(tab)) {
      onTabChange(TABS_BY_ROLE[adminRole][0] ?? 'planta');
    }
  }, [adminRole, tab, onTabChange]);

  /* ------------------------------- planta ------------------------------- */
  const [plant, setPlant] = useState<PlantStatusResponse | null>(null);
  const [plantLoading, setPlantLoading] = useState(true);
  const [plantError, setPlantError] = useState<string | null>(null);

  const loadPlant = useCallback(async () => {
    setPlantLoading(true);
    setPlantError(null);
    try {
      setPlant(await fetchPlantStatus());
    } catch (error) {
      setPlantError(error instanceof Error ? error.message : 'No se pudo leer la planta.');
    } finally {
      setPlantLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'planta' && !plant) void loadPlant();
  }, [tab, plant, loadPlant]);

  /* ---------------- Consola 1: órdenes de planta (OP-XXXX) ---------------- */
  const [orders, setOrders] = useState<ErpProductionOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [actingOrderId, setActingOrderId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const canAdvance = CAN_ADVANCE_PLANT.includes(adminRole);
  const canWriteCms = CAN_WRITE_CMS.includes(adminRole);
  const canManageStock = CAN_MANAGE_STOCK.includes(adminRole);

  /* ---------------- Consola 2: alertas Neymatex + consumo ---------------- */
  const [bodegaAlerts, setBodegaAlerts] = useState<BodegaAlertsResponse | null>(null);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [alertsError, setAlertsError] = useState<string | null>(null);

  const loadBodegaAlerts = useCallback(async () => {
    setAlertsLoading(true);
    setAlertsError(null);
    try {
      setBodegaAlerts(await fetchBodegaAlerts());
    } catch (error) {
      setAlertsError(
        error instanceof Error ? error.message : 'No se pudieron leer las alertas de bodega.',
      );
    } finally {
      setAlertsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'bodega') void loadBodegaAlerts();
  }, [tab, adminRole, loadBodegaAlerts]);

  async function handleRestock(material: MaterialItem): Promise<void> {
    setMatMessage(null);
    try {
      await updateMaterialStock(material.id, { stockQty: Math.round((material.stockQty + 100) * 100) / 100 });
      await loadMaterials();
      await loadBodegaAlerts();
    } catch (error) {
      setMatMessage({
        kind: 'error',
        text: error instanceof Error ? error.message : 'No se pudo reabastecer el insumo.',
      });
    }
  }

  const loadOrders = useCallback(async () => {
    setOrdersLoading(true);
    setOrdersError(null);
    try {
      const res = await fetchErpOrders();
      // Más reciente primero: el último pedido queda en la posición 0.
      setOrders(
        [...res.items].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0)),
      );
    } catch (error) {
      setOrdersError(error instanceof Error ? error.message : 'No se pudieron leer las órdenes.');
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'planta') void loadOrders();
  }, [tab, adminRole, loadOrders]);

  /* KPIs globales de la Top Command Bar (precarga liviana). */
  useEffect(() => {
    void loadOrders();
    void loadBodegaAlerts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminRole]);

  useEffect(() => {
    let cancelled = false;
    fetchAiConfig()
      .then((res) => {
        if (cancelled) return;
        setAiLive(res.mode === 'LIVE_META_API');
        setAiCacheSaved(res.cacheSavedUsd ?? 0);
      })
      .catch(() => {
        if (!cancelled) setAiLive(false);
      });
    return () => {
      cancelled = true;
    };
  }, [adminRole]);

  function handleRefreshErp(): void {
    void loadOrders();
    void loadBodegaAlerts();
    if (tab === 'planta') void loadPlant();
    if (tab === 'bodega') void loadMaterials();
    if (tab === 'cms') void loadGarments();
  }

  const kpiActiveOrders = orders.filter((o) => o.currentStage !== '11_EMPAQUE_DESPACHO').length;
  const kpiFabricMeters =
    bodegaAlerts?.totalFabricConsumedMeters ??
    orders.reduce((acc, o) => acc + o.fabricMetersDeducted, 0);
  const kpiBodegaAlerts = bodegaAlerts?.activeAlerts ?? 0;
  const inspectOrder = orders.find((o) => o.id === inspectOrderId) ?? null;
  const filteredOrders = orders.filter((order) => {
    if (orderFilter === 'QC' && order.currentStage !== '8_CONTROL_CALIDAD') return false;
    if (orderFilter === 'SALDO' && !(order.balanceDueUsd > 0)) return false;
    if (orderFilter === 'SELLO' && !order.blueSealApplied) return false;
    if (orderFilter === 'DESPACHADAS' && order.currentStage !== '11_EMPAQUE_DESPACHO')
      return false;
    const query = orderQuery.trim().toLowerCase();
    if (query && !`${order.orderCode} ${order.id} ${order.boxId}`.toLowerCase().includes(query))
      return false;
    return true;
  });

  function describeActionError(error: unknown, action: string): string {
    if (error !== null && typeof error === 'object' && 'status' in error && (error as { status?: number }).status === 403) {
      return rbacNotice(adminRole, action);
    }
    return error instanceof Error ? error.message : `No se pudo ejecutar: ${action}.`;
  }

  async function handleAdvance(orderId: string, payload: { approve?: boolean; notes?: string }): Promise<void> {
    if (!canAdvance) {
      setActionError(rbacNotice(adminRole, 'avanzar etapas de planta'));
      return;
    }
    setActingOrderId(orderId);
    setActionError(null);
    try {
      const updated = await advanceErpOrderStage(orderId, payload);
      setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
    } catch (error) {
      setActionError(describeActionError(error, 'avanzar etapas de planta'));
    } finally {
      setActingOrderId(null);
    }
  }

  async function handleSettle(orderId: string): Promise<void> {
    setActingOrderId(orderId);
    setActionError(null);
    try {
      const updated = await settleErpOrderBalance(orderId);
      setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
    } catch (error) {
      setActionError(describeActionError(error, 'liquidar el 50% B2B'));
    } finally {
      setActingOrderId(null);
    }
  }

  async function handleOrderTechpack(order: ErpProductionOrder): Promise<void> {
    setTechBoxId(order.boxId);
    setTechpack(null);
    setTechError(null);
    setTechLoading(true);
    try {
      setTechpack(await generateTechpack(order.boxId));
    } catch (error) {
      setTechError(error instanceof Error ? error.message : 'No se pudo generar la ficha.');
    } finally {
      setTechLoading(false);
    }
  }

  /* -------------------------------- CMS -------------------------------- */
  const [garments, setGarments] = useState<GarmentTemplate[]>([]);
  const [cmsLoading, setCmsLoading] = useState(false);
  const [form, setForm] = useState<CmsForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [cmsMessage, setCmsMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [cmsSaving, setCmsSaving] = useState(false);

  const loadGarments = useCallback(async () => {
    setCmsLoading(true);
    try {
      const res = await fetchCmsGarments();
      setGarments(res.items);
    } catch (error) {
      setCmsMessage({
        kind: 'error',
        text: error instanceof Error ? error.message : 'No se pudo leer el catálogo.',
      });
    } finally {
      setCmsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'cms' && garments.length === 0) void loadGarments();
  }, [tab, garments.length, loadGarments]);

  function startEdit(garment: GarmentTemplate): void {
    setEditingId(garment.id);
    setForm({
      slug: garment.slug,
      name: garment.name,
      category: garment.category,
      description: garment.description,
      baseProductionCost: String(garment.baseProductionCost),
      baseMarginPct: String(garment.baseMarginPct),
      baseSalePrice: String(garment.baseSalePrice),
      baseTimeMinutes: String(garment.baseTimeMinutes),
      sewingMinutes: String(garment.sewingMinutes),
      finishingMinutes: String(garment.finishingMinutes),
      sizes: garment.sizes.join(', '),
      colors: garment.colors.join(', '),
      recommendedRegions: [...garment.recommendedRegions],
      climateNote: garment.climateNote,
      imageUrl: garment.imageUrl ?? '',
      active: garment.active,
    });
    setCmsMessage(null);
  }

  function cancelEdit(): void {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function toggleFormRegion(region: EcuadorRegion): void {
    setForm((prev) => ({
      ...prev,
      recommendedRegions: prev.recommendedRegions.includes(region)
        ? prev.recommendedRegions.filter((r) => r !== region)
        : [...prev.recommendedRegions, region],
    }));
  }

  const [togglingId, setTogglingId] = useState<string | null>(null);

  /** Activa/desactiva una prenda del catálogo en un clic. */
  async function handleToggleActive(garment: GarmentTemplate): Promise<void> {
    setTogglingId(garment.id);
    try {
      const updated = await toggleGarment(garment.id);
      setGarments((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));
    } catch (error) {
      setCmsMessage({
        kind: 'error',
        text: error instanceof Error ? error.message : 'No se pudo cambiar el estado.',
      });
    } finally {
      setTogglingId(null);
    }
  }

  /**
   * Sube un mockup frontal/trasero desde la computadora del admin.
   * Cualquier peso (PNG, JPG, WEBP) se optimiza en cliente con canvas y se
   * envía como DataURL liviano: nunca falla por tamaño de payload.
   */
  function handleMockupFile(file: File | undefined): void {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setCmsMessage({ kind: 'error', text: 'El archivo debe ser una imagen.' });
      return;
    }
    void compressImageFileToDataUrl(file)
      .then((dataUrl) => {
        setForm((prev) => ({ ...prev, imageUrl: dataUrl }));
        setCmsMessage(null);
      })
      .catch(() => {
        setCmsMessage({ kind: 'error', text: 'No se pudo leer la imagen.' });
      });
  }

  async function handleCmsSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setCmsMessage(null);
    const payload = {
      slug: form.slug.trim().toLowerCase(),
      name: form.name.trim(),
      category: form.category,
      description: form.description.trim(),
      baseProductionCost: Number(form.baseProductionCost),
      baseMarginPct: Number(form.baseMarginPct),
      baseSalePrice: Number(form.baseSalePrice),
      baseTimeMinutes: Math.round(Number(form.baseTimeMinutes)),
      sewingMinutes: Math.round(Number(form.sewingMinutes)),
      finishingMinutes: Math.round(Number(form.finishingMinutes)),
      sizes: splitList(form.sizes),
      colors: splitList(form.colors),
      recommendedRegions: form.recommendedRegions,
      climateNote: form.climateNote.trim(),
      imageUrl: form.imageUrl.trim() ? form.imageUrl.trim() : undefined,
      active: form.active,
    };
    setCmsSaving(true);
    try {
      if (editingId) {
        await updateGarment(editingId, payload);
        setCmsMessage({ kind: 'ok', text: 'Prenda actualizada en el catálogo.' });
      } else {
        await createGarment(payload);
        setCmsMessage({ kind: 'ok', text: 'Prenda creada en el catálogo.' });
        setForm(EMPTY_FORM);
      }
      setEditingId(null);
      setCmsDrawerOpen(false);
      await loadGarments();
    } catch (error) {
      setCmsMessage({
        kind: 'error',
        text: error instanceof Error ? error.message : 'No se pudo guardar la prenda.',
      });
    } finally {
      setCmsSaving(false);
    }
  }

  /* ------------------------------- bodega ------------------------------- */
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [materialsMeta, setMaterialsMeta] = useState({ total: 0, bajoStock: 0 });
  const [matLoading, setMatLoading] = useState(false);
  const [matMessage, setMatMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [matSaving, setMatSaving] = useState(false);
  const [stockDrafts, setStockDrafts] = useState<Record<string, string>>({});
  const [matForm, setMatForm] = useState({
    sku: '',
    name: '',
    kind: 'TELA' as MaterialCreateInput['kind'],
    color: '',
    unit: 'm' as MaterialCreateInput['unit'],
    stockQty: '100',
    minStockQty: '20',
    unitCostUsd: '3.50',
  });

  const loadMaterials = useCallback(async () => {
    setMatLoading(true);
    try {
      const res = await fetchMaterials();
      setMaterials(res.items);
      setMaterialsMeta({ total: res.total, bajoStock: res.bajoStock });
    } catch (error) {
      setMatMessage({
        kind: 'error',
        text: error instanceof Error ? error.message : 'No se pudo leer la bodega.',
      });
    } finally {
      setMatLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'bodega' && materials.length === 0) void loadMaterials();
  }, [tab, materials.length, loadMaterials]);

  async function handleMaterialStockSave(id: string): Promise<void> {
    const draft = stockDrafts[id];
    const stockQty = Number(draft);
    if (!Number.isFinite(stockQty) || stockQty < 0) {
      setMatMessage({ kind: 'error', text: 'El stock debe ser un número mayor o igual a 0.' });
      return;
    }
    setMatSaving(true);
    try {
      const updated = await updateMaterialStock(id, { stockQty });
      setMaterials((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      setMatMessage({
        kind: 'ok',
        text: `Stock de ${updated.sku} actualizado a ${updated.stockQty}.`,
      });
    } catch (error) {
      setMatMessage({
        kind: 'error',
        text: error instanceof Error ? error.message : 'No se pudo actualizar el stock.',
      });
    } finally {
      setMatSaving(false);
    }
  }

  async function handleMaterialCreate(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setMatMessage(null);
    setMatSaving(true);
    try {
      await createMaterial({
        sku: matForm.sku.trim().toUpperCase(),
        name: matForm.name.trim(),
        kind: matForm.kind,
        color: matForm.color.trim() ? matForm.color.trim().toUpperCase() : undefined,
        unit: matForm.unit,
        stockQty: Number(matForm.stockQty),
        minStockQty: Number(matForm.minStockQty),
        unitCostUsd: Number(matForm.unitCostUsd),
      });
      setMatMessage({ kind: 'ok', text: 'Materia prima registrada en bodega.' });
      setMatDrawerOpen(false);
      setMatForm({
        sku: '',
        name: '',
        kind: 'TELA',
        color: '',
        unit: 'm',
        stockQty: '100',
        minStockQty: '20',
        unitCostUsd: '3.50',
      });
      await loadMaterials();
    } catch (error) {
      setMatMessage({
        kind: 'error',
        text: error instanceof Error ? error.message : 'No se pudo registrar la materia prima.',
      });
    } finally {
      setMatSaving(false);
    }
  }

  /* ------------------------------ techpack ------------------------------ */
  const [techBoxId, setTechBoxId] = useState('');
  const [techpack, setTechpack] = useState<TechpackResponse | null>(null);
  const [techLoading, setTechLoading] = useState(false);
  const [techError, setTechError] = useState<string | null>(null);

  useEffect(() => {
    if (lastPaidBoxId && !techBoxId) setTechBoxId(lastPaidBoxId);
  }, [lastPaidBoxId, techBoxId]);

  async function handleTechpack(): Promise<void> {
    setTechError(null);
    setTechpack(null);
    if (!techBoxId.trim()) {
      setTechError('Pega el ID de una Caja Gumorose PAGADA.');
      return;
    }
    setTechLoading(true);
    try {
      setTechpack(await generateTechpack(techBoxId.trim()));
    } catch (error) {
      setTechError(error instanceof Error ? error.message : 'No se pudo generar la ficha.');
    } finally {
      setTechLoading(false);
    }
  }

  const modules: {
    id: AdminTab;
    num: number;
    label: string;
    detail: string;
    icon: React.JSX.Element;
  }[] = [
    {
      id: 'planta',
      num: 1,
      label: 'Planta 11 Etapas',
      detail: 'Órdenes OP-XXXX, Sello Azul y máquinas Riobamba',
      icon: <Factory className="h-4 w-4" aria-hidden />,
    },
    {
      id: 'bodega',
      num: 2,
      label: 'Bodega & BOM',
      detail: 'Telas, consumo automático y alertas Neymatex',
      icon: <Warehouse className="h-4 w-4" aria-hidden />,
    },
    {
      id: 'cms',
      num: 3,
      label: 'Catálogo PLM / CMS',
      detail: 'Line Sheets, precios, tiempos y fotos',
      icon: <Settings2 className="h-4 w-4" aria-hidden />,
    },
    {
      id: 'inteligencia',
      num: 4,
      label: 'Inteligencia IA (Stitch Fix)',
      detail: 'Closet Gaps, Hybrid Designs y Blue Ocean',
      icon: <BrainCircuit className="h-4 w-4" aria-hidden />,
    },
    {
      id: 'finanzas',
      num: 5,
      label: 'Finanzas & Event Bus',
      detail: 'MPD/MOD/CIF, utilidad y cuentas por cobrar 50/50',
      icon: <Landmark className="h-4 w-4" aria-hidden />,
    },
    {
      id: 'gobierno',
      num: 6,
      label: 'Gobierno & Meta AI',
      detail: 'Usuarios RBAC y motor META_API_KEY en vivo',
      icon: <Users className="h-4 w-4" aria-hidden />,
    },
  ];
  const activeModule = modules.find((m) => m.id === tab) ?? modules[0];

  return (
    <div className="overflow-hidden rounded-2xl border border-gum-line bg-gum-alabaster shadow-editorialLg lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      {/* Sidebar izquierda en Carbón Espresso */}
      <aside className="bg-gum-espresso text-stone-300 lg:min-h-[720px]" aria-label="Módulos del ERP">
        <div className="border-b border-white/10 px-4 py-4">
          <p className="font-display text-lg font-semibold text-white">Gumorose ERP</p>
          <p className="text-[11px] text-stone-400">Manufactura inteligente · Riobamba</p>
        </div>
        <nav className="flex gap-1 overflow-x-auto p-2 lg:flex-col lg:overflow-visible" role="tablist" aria-label="Consolas del ERP">
          {modules.map((mod) => {
            const allowed = allowedTabs.includes(mod.id);
            const active = tab === mod.id;
            return (
              <button
                key={mod.id}
                type="button"
                role="tab"
                aria-selected={active}
                disabled={!allowed}
                onClick={() => allowed && setTab(mod.id)}
                title={allowed ? mod.detail : `Restringido RBAC para ${adminRole}`}
                className={`flex min-w-44 items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] font-semibold transition lg:min-w-0 ${
                  active
                    ? 'bg-white text-gum-espresso'
                    : allowed
                      ? 'text-stone-300 hover:bg-white/10 hover:text-white'
                      : 'cursor-not-allowed text-stone-500'
                }`}
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                    active ? 'bg-gum-linen text-gum-espresso' : 'bg-white/10'
                  }`}
                >
                  {mod.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">
                    {mod.num}. {mod.label}
                  </span>
                  <span className={`block truncate text-[10px] font-medium ${active ? 'text-stone-500' : 'text-stone-500'}`}>
                    {allowed ? 'Habilitado' : 'Solo Lectura / Restringido RBAC'}
                  </span>
                </span>
                {!allowed && <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />}
              </button>
            );
          })}
        </nav>
        <p className="hidden px-4 py-3 text-[11px] leading-relaxed text-stone-500 lg:block">
          ISA-101: detalle profundo en el Inspector lateral, nunca apilado junto a las tablas.
        </p>
      </aside>

      {/* Área de trabajo */}
      <div className="min-w-0 space-y-4 p-4 sm:p-5">
        {/* Top Command Bar Ejecutiva */}
        <header className="rounded-2xl border border-gum-line bg-white p-4 shadow-editorial">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gum-terracottadark">
                Módulo {activeModule?.num} · {activeModule?.label}
              </p>
              <h2 className="font-display text-2xl font-semibold text-gum-espresso">
                {activeModule?.label}
              </h2>
              <p className="truncate text-xs text-stone-500">{activeModule?.detail}</p>
            </div>
            <button
              type="button"
              onClick={handleRefreshErp}
              className="inline-flex min-h-10 items-center gap-2 rounded-full bg-gum-espresso px-4 py-2 text-xs font-bold text-white transition hover:bg-gum-salvia"
            >
              <RefreshCw className="h-4 w-4" aria-hidden /> Refrescar Datos ERP
            </button>
          </div>

          <div
            className="mt-3 flex flex-wrap items-center gap-2"
            role="group"
            aria-label="Rol administrativo activo"
          >
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-stone-500">
              <ShieldCheck className="h-4 w-4 text-gum-terracottadark" aria-hidden /> Rol activo
            </span>
            {ADMIN_ROLES.map((option) => {
              const active = adminRole === option.role;
              return (
                <button
                  key={option.role}
                  type="button"
                  onClick={() => onAdminRoleChange(option.role)}
                  aria-pressed={active}
                  title={option.detail}
                  className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                    active
                      ? 'border-gum-espresso bg-gum-espresso text-white'
                      : 'border-gum-line text-stone-600 hover:border-gum-espresso'
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
            <span className="w-full text-[11px] text-stone-500">
              {ADMIN_ROLES.find((o) => o.role === adminRole)?.detail}
            </span>
          </div>

          <dl className="mt-3 grid grid-cols-2 gap-2 xl:grid-cols-4" aria-label="Indicadores globales del ERP">
            {[
              { label: 'Órdenes Activas', value: String(kpiActiveOrders) },
              { label: 'Metros Tela Consumidos', value: `${kpiFabricMeters.toFixed(2)} m` },
              { label: 'Alertas Bodega', value: String(kpiBodegaAlerts) },
              {
                label: 'Motor Meta AI',
                value:
                  aiLive === null
                    ? '…'
                    : aiLive
                      ? `META AI LIVE ($${aiCacheSaved.toFixed(2)} ahorrados)`
                      : `CACHE ($${aiCacheSaved.toFixed(2)} ahorrados)`,
              },
            ].map((kpi) => (
              <div key={kpi.label} className="rounded-xl bg-gum-linen px-3 py-2">
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">
                  {kpi.label}
                </dt>
                <dd className="truncate font-display text-base font-bold tabular-nums text-gum-espresso">
                  {kpi.value}
                </dd>
              </div>
            ))}
          </dl>
        </header>

      {tab === 'planta' && (
        <section className="space-y-4" aria-label="Monitor de planta">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg font-semibold text-gum-espresso">
              Capacidad · 23 Máquinas en Riobamba
            </h3>
            <button
              type="button"
              onClick={() => void loadPlant()}
              disabled={plantLoading}
              className="inline-flex items-center gap-1.5 rounded-full border border-gum-line bg-white px-3 py-1.5 text-sm font-semibold text-stone-700 transition hover:border-gum-espresso disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${plantLoading ? 'animate-spin' : ''}`} aria-hidden />
              Actualizar
            </button>
          </div>

          {plantLoading && !plant && (
            <p className="py-8 text-center text-stone-500">Leyendo sensores de planta…</p>
          )}
          {plantError && (
            <p className="flex items-start gap-1.5 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {plantError}
            </p>
          )}
          {plant && (
            <div
              className="flex max-h-[110px] gap-2 overflow-x-auto pb-1"
              aria-label="Capacidad por tipo de máquina"
            >
              <div className="flex w-36 shrink-0 flex-col justify-center rounded-2xl bg-gum-espresso px-3 py-2 text-white">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-stone-400">
                  Operativas
                </span>
                <span className="font-display text-xl font-bold tabular-nums">
                  {plant.resumen.activas}/{plant.resumen.total}
                </span>
                <span className="text-[10px] text-stone-400">
                  Cola {plant.colaTotalMinutos} min · Mtto {plant.resumen.mantenimiento}
                </span>
              </div>
              {Object.entries(
                plant.maquinas.reduce<
                  Record<string, { total: number; activas: number; cola: number }>
                >((acc, m) => {
                  const entry = acc[m.kind] ?? { total: 0, activas: 0, cola: 0 };
                  entry.total += 1;
                  if (m.status === 'ACTIVA') entry.activas += 1;
                  entry.cola += m.queueMinutes;
                  acc[m.kind] = entry;
                  return acc;
                }, {}),
              ).map(([kind, agg]) => {
                const pct =
                  plant.colaTotalMinutos > 0
                    ? Math.round((agg.cola / plant.colaTotalMinutos) * 100)
                    : 0;
                return (
                  <div
                    key={kind}
                    className="flex w-36 shrink-0 flex-col justify-center rounded-2xl border border-gum-line bg-white px-3 py-2 shadow-editorial"
                  >
                    <span className="truncate text-[11px] font-bold text-gum-espresso">{kind}</span>
                    <span className="font-display text-base font-bold tabular-nums text-gum-espresso">
                      {agg.activas}/{agg.total} <span className="text-xs font-semibold text-stone-500">uds</span>
                    </span>
                    <span className="mt-1 h-1.5 overflow-hidden rounded-full bg-gum-linen">
                      <span className="block h-full rounded-full bg-gum-terracotta" style={{ width: `${pct}%` }} />
                    </span>
                    <span className="mt-0.5 text-[10px] tabular-nums text-stone-500">
                      {agg.cola} min en cola
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Lista ejecutiva de órdenes OP-XXXX: más reciente primero (#1) */}
          <section className="space-y-3 rounded-2xl border border-gum-line bg-white p-5 shadow-editorial" aria-label="Órdenes de producción">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-lg font-semibold text-gum-espresso">
                Órdenes de producción ({filteredOrders.length}
                {filteredOrders.length !== orders.length ? ` de ${orders.length}` : ''})
              </h3>
              <button
                type="button"
                onClick={() => void loadOrders()}
                disabled={ordersLoading}
                className="inline-flex items-center gap-1.5 rounded-full border border-gum-line px-3 py-1.5 text-sm font-semibold text-stone-700 transition hover:border-gum-espresso disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${ordersLoading ? 'animate-spin' : ''}`} aria-hidden />
                Recargar
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtros rápidos de órdenes">
                {(
                  [
                    { id: 'ALL', label: 'Todas (Más recientes primero)' },
                    { id: 'QC', label: 'En Control Calidad (Etapa 8)' },
                    { id: 'SALDO', label: 'Con Saldo B2B Pendiente (50%)' },
                    { id: 'SELLO', label: 'Sello Azul Aprobado' },
                    { id: 'DESPACHADAS', label: 'Despachadas (Etapa 11)' },
                  ] as const
                ).map((pill) => (
                  <button
                    key={pill.id}
                    type="button"
                    onClick={() => setOrderFilter(pill.id)}
                    aria-pressed={orderFilter === pill.id}
                    className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition ${
                      orderFilter === pill.id
                        ? 'bg-gum-espresso text-white'
                        : 'border border-gum-line bg-white text-stone-600 hover:border-gum-espresso'
                    }`}
                  >
                    {pill.label}
                  </button>
                ))}
              </div>
              <label className="relative ml-auto block min-w-52 flex-1 sm:flex-none">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" aria-hidden />
                <span className="sr-only">Buscar orden por código OP</span>
                <input
                  value={orderQuery}
                  onChange={(e) => setOrderQuery(e.target.value)}
                  placeholder="Buscar OP-XXXX…"
                  className="w-full rounded-full border border-gum-line py-2 pl-9 pr-3 text-sm"
                />
              </label>
            </div>
            {ordersError && (
              <p className="flex items-start gap-1.5 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {ordersError}
              </p>
            )}
            {actionError && (
              <p className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {actionError}
              </p>
            )}
            {!canAdvance && (
              <p className="rounded-lg border border-stone-200 bg-stone-50 px-4 py-2 text-xs text-stone-600">
                Tu rol ({adminRole}) ve las órdenes en solo lectura. El avance de etapas requiere ADMIN_PLANTA, ADMIN_GERENCIA o SUPER_ADMIN.
              </p>
            )}
            {ordersLoading && orders.length === 0 ? (
              <p className="py-6 text-center text-sm text-stone-500">Leyendo órdenes de planta…</p>
            ) : filteredOrders.length === 0 && !ordersError ? (
              <p className="py-6 text-center text-sm text-stone-500">
                {orders.length === 0
                  ? 'Sin órdenes todavía: paga una Caja Gumorose y aparecerá aquí como OP-XXXX.'
                  : 'Ninguna orden coincide con el filtro o la búsqueda.'}
              </p>
            ) : (
              <ol className="space-y-2">
                {filteredOrders.map((order) => {
                  const position = orders.findIndex((o) => o.id === order.id);
                  const done = PLANT_PRODUCTION_STAGES_ORDERED.indexOf(order.currentStage) + 1;
                  const sealOk = order.blueSealApplied && order.qualityCheckStatus === 'APROBADO_SELLO_AZUL';
                  const busy = actingOrderId === order.id;
                  const isB2BOrder = order.customerRole === 'CLIENTE_B2B';
                  const showSettleFirst =
                    order.currentStage === '10_PLANCHADO_ETIQUETADO_INEN' && order.balanceDueUsd > 0;
                  return (
                    <li
                      key={order.id}
                      className="rounded-2xl border border-gum-line bg-white p-3.5 shadow-editorial"
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-sm font-bold text-gum-espresso">
                          #{position + 1}
                        </span>
                        <span className="font-mono text-sm font-bold text-gum-espresso">
                          {order.orderCode}
                        </span>
                        {position === 0 && (
                          <span className="rounded-full bg-gum-terracotta px-2 py-0.5 text-[10px] font-bold text-white">
                            MÁS RECIENTE
                          </span>
                        )}
                        <span className="rounded-full bg-gum-linen px-2 py-0.5 text-[10px] font-bold text-gum-espresso">
                          {isB2BOrder ? 'B2B' : 'B2C'} · {order.paymentMode}
                        </span>
                        {sealOk ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-900">
                            <Award className="h-3 w-3" aria-hidden /> Sello Azul de Calidad Gumorose
                          </span>
                        ) : order.qualityCheckStatus === 'REPROCESO_COSTURA' ? (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                            En Reproceso Costura
                          </span>
                        ) : null}
                        <span className="ml-auto text-xs tabular-nums text-stone-500">
                          Pagado <strong className="text-gum-espresso">${order.amountPaidUsd.toFixed(2)}</strong>
                          {' · '}Saldo <strong className="text-gum-espresso">${order.balanceDueUsd.toFixed(2)}</strong>
                          {' · '}{order.fabricMetersDeducted.toFixed(2)} m
                        </span>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <span className="shrink-0 text-[11px] font-bold text-gum-espresso">
                          Etapa {done} de 11 · {STAGE_SHORT_LABEL[order.currentStage]}
                        </span>
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-gum-linen">
                          <span
                            className="block h-full rounded-full bg-gum-terracotta"
                            style={{ width: `${Math.round((done / 11) * 100)}%` }}
                          />
                        </span>
                      </div>
                      <div className="mt-2.5 flex flex-wrap gap-2">
                        {canAdvance && order.currentStage === '8_CONTROL_CALIDAD' && (
                          <>
                            <button
                              type="button"
                              onClick={() => void handleAdvance(order.id, { approve: true, notes: 'Aprobado en consola ERP' })}
                              disabled={busy}
                              className="rounded-full bg-green-700 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-green-800 disabled:opacity-60"
                            >
                              Aprobar Sello Azul (-&gt; Etapa 9)
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleAdvance(order.id, { approve: false, notes: 'Rechazado en consola ERP' })}
                              disabled={busy}
                              className="rounded-full bg-red-700 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-red-800 disabled:opacity-60"
                            >
                              Rechazar a Reproceso (&lt;- Etapa 6)
                            </button>
                          </>
                        )}
                        {canAdvance && showSettleFirst && (
                          <button
                            type="button"
                            onClick={() => void handleSettle(order.id)}
                            disabled={busy}
                            className="rounded-full bg-gum-oro px-3 py-1.5 text-xs font-bold text-gum-espresso transition hover:brightness-95 disabled:opacity-60"
                          >
                            {busy
                              ? 'Cobrando…'
                              : `Cobrar 50% Final ($${order.balanceDueUsd.toFixed(2)})`}
                          </button>
                        )}
                        {canAdvance &&
                          order.currentStage !== '11_EMPAQUE_DESPACHO' &&
                          order.currentStage !== '8_CONTROL_CALIDAD' &&
                          !showSettleFirst && (
                            <button
                              type="button"
                              onClick={() => void handleAdvance(order.id, {})}
                              disabled={busy}
                              className="rounded-full bg-gum-espresso px-3 py-1.5 text-xs font-bold text-white transition hover:bg-gum-salvia disabled:opacity-60"
                            >
                              {busy ? 'Avanzando…' : `Avanzar a Etapa Siguiente (${done}/11)`}
                            </button>
                          )}
                        {canAdvance &&
                          order.currentStage !== '8_CONTROL_CALIDAD' &&
                          order.balanceDueUsd > 0 &&
                          !showSettleFirst && (
                            <button
                              type="button"
                              onClick={() => void handleSettle(order.id)}
                              disabled={busy}
                              className="rounded-full border border-gum-oro px-3 py-1.5 text-xs font-bold text-gum-espresso transition hover:bg-gum-linen disabled:opacity-60"
                            >
                              {busy
                                ? 'Cobrando…'
                                : `Cobrar 50% Final ($${order.balanceDueUsd.toFixed(2)})`}
                            </button>
                          )}
                        <button
                          type="button"
                          onClick={() => {
                            setInspectOrderId(order.id);
                            void handleOrderTechpack(order);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-full border border-gum-espresso px-3 py-1.5 text-xs font-bold text-gum-espresso transition hover:bg-gum-espresso hover:text-white"
                        >
                          <Search className="h-3.5 w-3.5" aria-hidden /> Inspeccionar Orden &amp; Ficha IA
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          {/* Slide-Over: Inspector de Orden & Tech Pack IA */}
          <SlideOverDrawer
            open={inspectOrder !== null}
            title={inspectOrder ? `Inspector ${inspectOrder.orderCode}` : 'Inspector de Orden'}
            subtitle="Mapa 11 etapas · prendas del pedido · Ficha Técnica IA (Muse Spark)"
            onClose={() => setInspectOrderId(null)}
          >
            {inspectOrder && (
              <div className="space-y-4">
                <dl className="grid grid-cols-2 gap-2 text-center text-xs">
                  <div className="rounded-xl bg-white p-2.5 shadow-editorial">
                    <dt className="font-semibold text-stone-500">Etapa actual</dt>
                    <dd className="font-display text-sm font-bold text-gum-espresso">
                      {PLANT_PRODUCTION_STAGES_ORDERED.indexOf(inspectOrder.currentStage) + 1}/11 ·{' '}
                      {STAGE_SHORT_LABEL[inspectOrder.currentStage]}
                    </dd>
                  </div>
                  <div className="rounded-xl bg-white p-2.5 shadow-editorial">
                    <dt className="font-semibold text-stone-500">Tela descontada</dt>
                    <dd className="font-display text-sm font-bold tabular-nums text-gum-espresso">
                      {inspectOrder.fabricMetersDeducted.toFixed(2)} m
                    </dd>
                  </div>
                  <div className="rounded-xl bg-white p-2.5 shadow-editorial">
                    <dt className="font-semibold text-stone-500">Pagado</dt>
                    <dd className="font-display text-sm font-bold tabular-nums text-gum-espresso">
                      ${inspectOrder.amountPaidUsd.toFixed(2)}
                    </dd>
                  </div>
                  <div className="rounded-xl bg-white p-2.5 shadow-editorial">
                    <dt className="font-semibold text-stone-500">Saldo</dt>
                    <dd className="font-display text-sm font-bold tabular-nums text-gum-espresso">
                      ${inspectOrder.balanceDueUsd.toFixed(2)}
                    </dd>
                  </div>
                </dl>

                <section aria-label="Mapa de las 11 etapas">
                  <h4 className="font-display text-sm font-semibold text-gum-espresso">
                    Mapa Completo de las 11 Etapas de Ingeniería
                  </h4>
                  <ol className="mt-2 space-y-1">
                    {PLANT_PRODUCTION_STAGES_ORDERED.map((stage, idx) => {
                      const currentIdx = PLANT_PRODUCTION_STAGES_ORDERED.indexOf(
                        inspectOrder.currentStage,
                      );
                      const doneStage = idx < currentIdx;
                      const isCurrent = idx === currentIdx;
                      const history = inspectOrder.stageHistory.filter((h) => h.stage === stage);
                      return (
                        <li
                          key={stage}
                          className={`rounded-xl px-3 py-2 text-xs ${
                            isCurrent
                              ? 'bg-gum-espresso font-bold text-white'
                              : doneStage
                                ? 'bg-gum-linen text-gum-salvia'
                                : 'bg-white text-stone-400'
                          }`}
                        >
                          <span className="flex items-center justify-between gap-2">
                            <span>{STAGE_SHORT_LABEL[stage]}</span>
                            <span>{isCurrent ? 'EN CURSO' : doneStage ? 'LISTA' : ''}</span>
                          </span>
                          {history.map((entry, hi) => (
                            <span key={hi} className="mt-0.5 block font-normal opacity-80">
                              {new Date(entry.timestamp).toLocaleString()}
                              {entry.operatorRole ? ` · ${entry.operatorRole}` : ''}
                              {entry.notes ? ` · ${entry.notes}` : ''}
                            </span>
                          ))}
                        </li>
                      );
                    })}
                  </ol>
                </section>

                <OrderItemsDetail items={inspectOrder.items ?? []} />

                <section aria-label="Ficha técnica de producción IA">
                  <h4 className="font-display text-sm font-semibold text-gum-espresso">
                    Ficha Técnica de Producción (Muse Spark)
                  </h4>
                  <p className="mt-0.5 text-xs text-stone-500">
                    POST /api/ai/plant-techpack · lista para corte y costura en Riobamba.
                  </p>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <input
                      value={techBoxId}
                      onChange={(e) => setTechBoxId(e.target.value)}
                      placeholder="ID de la caja (UUID)"
                      className="flex-1 rounded-full border border-gum-line bg-white px-3 py-2 font-mono text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => void handleTechpack()}
                      disabled={techLoading}
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-gum-espresso px-4 py-2 text-xs font-bold text-white disabled:opacity-60"
                    >
                      {techLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      ) : (
                        <Printer className="h-4 w-4" aria-hidden />
                      )}
                      Generar Ficha Técnica
                    </button>
                  </div>
                  {lastPaidBoxId && (
                    <p className="mt-1.5 text-[11px] text-stone-500">
                      Última caja pagada:{' '}
                      <button
                        type="button"
                        onClick={() => setTechBoxId(lastPaidBoxId)}
                        className="font-mono text-gum-terracottadark underline"
                      >
                        {lastPaidBoxId.slice(0, 8)}…
                      </button>
                    </p>
                  )}
                  {techError && (
                    <p className="mt-2 flex items-start gap-1.5 text-sm text-red-700">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {techError}
                    </p>
                  )}
                  {techpack && (
                    <div className="mt-3 rounded-2xl border border-gum-line bg-white p-4">
                      <p className="font-mono text-sm font-bold text-gum-espresso">
                        {techpack.ordenProduccion} · {techpack.provider}/{techpack.model}
                      </p>
                      <ol className="mt-2 space-y-1.5 text-sm">
                        {techpack.pasos.map((step) => (
                          <li key={step.orden} className="flex gap-2">
                            <span className="font-bold text-gum-terracottadark">{step.orden}.</span>
                            <span>
                              <strong>{step.etapa}</strong> ({step.maquina},{' '}
                              {step.minutosEstimados} min): {step.detalle}
                            </span>
                          </li>
                        ))}
                      </ol>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-stone-600">
                        {techpack.controlCalidad.map((rule) => (
                          <li key={rule}>{rule}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </section>
              </div>
            )}
          </SlideOverDrawer>
        </section>
      )}

      {tab === 'cms' && (
        <div className="space-y-4">
          {!canWriteCms && (
            <p className="rounded-2xl border border-gum-line bg-white p-4 text-sm text-stone-600">
              {rbacNotice(adminRole, 'crear o editar prendas del CMS (ADMIN_GERENCIA o SUPER_ADMIN)')} El catálogo se muestra abajo en solo lectura.
            </p>
          )}
          {canWriteCms && (
          <SlideOverDrawer
            open={cmsDrawerOpen}
            title={editingId ? 'Editar Prenda' : 'Crear Nueva Prenda'}
            subtitle="Line Sheet PLM · precio, tiempos, regiones y foto"
            onClose={() => {
              setCmsDrawerOpen(false);
              cancelEdit();
            }}
          >
            <form onSubmit={(e) => void handleCmsSubmit(e)} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm font-medium text-stone-600">
                  Slug (kebab-case)
                  <input
                    value={form.slug}
                    onChange={(e) => setForm({ ...form, slug: e.target.value })}
                    required
                    minLength={3}
                    placeholder="camiseta-edicion-andina"
                    className={inputClass()}
                  />
                </label>
                <label className="block text-sm font-medium text-stone-600">
                  Categoría
                  <select
                    value={form.category}
                    onChange={(e) =>
                      setForm({ ...form, category: e.target.value as GarmentCategory })
                    }
                    className={inputClass()}
                  >
                    {CATEGORY_ORDER.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="block text-sm font-medium text-stone-600">
                Nombre
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  minLength={3}
                  className={inputClass()}
                />
              </label>
              <label className="block text-sm font-medium text-stone-600">
                Descripción
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={2}
                  className={inputClass()}
                />
              </label>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {(
                  [
                    ['baseProductionCost', 'Costo base $'],
                    ['baseMarginPct', 'Margen %'],
                    ['baseSalePrice', 'Precio base $'],
                    ['baseTimeMinutes', 'Min. base'],
                    ['sewingMinutes', 'Min. costura'],
                    ['finishingMinutes', 'Min. acabado'],
                  ] as const
                ).map(([field, label]) => (
                  <label key={field} className="block text-sm font-medium text-stone-600">
                    {label}
                    <input
                      type="number"
                      step="any"
                      min={0}
                      value={form[field]}
                      onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                      required
                      className={inputClass()}
                    />
                  </label>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm font-medium text-stone-600">
                  Tallas (separadas por coma)
                  <input
                    value={form.sizes}
                    onChange={(e) => setForm({ ...form, sizes: e.target.value })}
                    required
                    className={inputClass()}
                  />
                </label>
                <label className="block text-sm font-medium text-stone-600">
                  Colores (separados por coma)
                  <input
                    value={form.colors}
                    onChange={(e) => setForm({ ...form, colors: e.target.value })}
                    className={inputClass()}
                  />
                </label>
              </div>
              <fieldset>
                <legend className="text-sm font-medium text-stone-600">
                  Regiones recomendadas
                </legend>
                <div className="mt-1 flex gap-4">
                  {(['COSTA', 'SIERRA', 'ORIENTE'] as EcuadorRegion[]).map((r) => (
                    <label key={r} className="flex items-center gap-1.5 text-sm text-stone-700">
                      <input
                        type="checkbox"
                        checked={form.recommendedRegions.includes(r)}
                        onChange={() => toggleFormRegion(r)}
                      />
                      {r}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="block text-sm font-medium text-stone-600">
                Nota climática
                <input
                  value={form.climateNote}
                  onChange={(e) => setForm({ ...form, climateNote: e.target.value })}
                  maxLength={500}
                  className={inputClass()}
                />
              </label>
              <div className="rounded-lg border border-dashed border-stone-300 bg-stone-50 p-3">
                <p className="flex items-center gap-1.5 text-sm font-medium text-stone-600">
                  <ImagePlus className="h-4 w-4" aria-hidden /> Mockup frontal/trasero
                </p>
                <p className="mt-0.5 text-xs text-stone-500">
                  Sube una imagen desde tu computadora (se guarda como DataURL local) o pega una URL
                  https.
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-gum-ink px-3 py-1.5 text-xs font-semibold text-white hover:bg-gum-soot">
                    Subir imagen
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        handleMockupFile(e.target.files?.[0]);
                        e.target.value = '';
                      }}
                    />
                  </label>
                  {form.imageUrl.startsWith('data:') ? (
                    <span className="text-xs font-semibold text-green-800">
                      Imagen local lista ({Math.round((form.imageUrl.length * 3) / 4 / 1024)} KB
                      aprox.)
                    </span>
                  ) : (
                    <span className="text-xs text-stone-500">Sin imagen local</span>
                  )}
                  {form.imageUrl && (
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, imageUrl: '' })}
                      className="text-xs font-semibold text-red-700 underline"
                    >
                      Quitar
                    </button>
                  )}
                </div>
                {form.imageUrl && (
                  <img
                    src={form.imageUrl}
                    alt="Previsualización del mockup"
                    className="mt-2 h-28 w-28 rounded-lg border border-stone-300 object-cover"
                  />
                )}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block text-sm font-medium text-stone-600">
                  URL de imagen (opcional)
                  <input
                    value={form.imageUrl.startsWith('data:') ? '' : form.imageUrl}
                    onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                    placeholder="https://…"
                    className={inputClass()}
                  />
                </label>
                <label className="flex items-end gap-2 pb-2 text-sm text-stone-700">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(e) => setForm({ ...form, active: e.target.checked })}
                  />
                  Visible en tienda
                </label>
              </div>
              {cmsMessage && (
                <p
                  className={`flex items-start gap-1.5 text-sm ${
                    cmsMessage.kind === 'error' ? 'text-red-700' : 'text-green-800'
                  }`}
                >
                  {cmsMessage.kind === 'error' ? (
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  ) : (
                    <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  )}
                  {cmsMessage.text}
                </p>
              )}
              <button
                type="submit"
                disabled={cmsSaving}
                className="w-full rounded-lg bg-gum-ember px-4 py-2.5 text-sm font-semibold text-white hover:bg-gum-emberdark disabled:opacity-60"
              >
                {cmsSaving ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Guardando…
                  </span>
                ) : editingId ? (
                  'Actualizar prenda'
                ) : (
                  'Crear prenda'
                )}
              </button>
            </form>
          </SlideOverDrawer>
          )}

          <section aria-label="Line Sheets del catálogo">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-lg font-semibold text-gum-espresso">
                Line Sheets · Prendas ({garments.length})
              </h3>
              <span className="flex gap-2">
                {canWriteCms && (
                  <button
                    type="button"
                    onClick={() => {
                      cancelEdit();
                      setCmsDrawerOpen(true);
                    }}
                    className="inline-flex min-h-9 items-center rounded-full bg-gum-espresso px-3 py-1.5 text-xs font-bold text-white transition hover:bg-gum-salvia"
                  >
                    + Crear Nueva Prenda
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void loadGarments()}
                  disabled={cmsLoading}
                  className="inline-flex items-center gap-1.5 rounded-full border border-gum-line bg-white px-3 py-1.5 text-sm font-semibold text-stone-700 transition hover:border-gum-espresso disabled:opacity-60"
                >
                  <RefreshCw className={`h-4 w-4 ${cmsLoading ? 'animate-spin' : ''}`} aria-hidden />
                  Recargar
                </button>
              </span>
            </div>
            {cmsLoading && garments.length === 0 ? (
              <p className="py-8 text-center text-sm text-stone-500">Cargando catálogo…</p>
            ) : (
              <ul className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {garments.map((g) => (
                  <li
                    key={g.id}
                    className="overflow-hidden rounded-2xl border border-gum-line bg-white shadow-editorial"
                  >
                    <div className="pointer-events-none bg-gum-linen p-3">
                      <div className="mx-auto max-w-32">
                        <GarmentCanvas
                          category={g.category}
                          variant={g.visualVariant}
                          fabricHex={colorHexOf(g.colors[0] ?? 'BLANCO')}
                          view="FRONTAL"
                          logos={[]}
                          selectedUid={null}
                          showGuides={false}
                          onSelect={() => undefined}
                          onMove={() => undefined}
                        />
                      </div>
                    </div>
                    <div className="p-3">
                      <p className="truncate text-sm font-bold text-gum-espresso">
                        {g.name}
                        {!g.active && (
                          <span className="ml-1 rounded bg-stone-200 px-1.5 py-0.5 text-[11px] text-stone-600">
                            oculta
                          </span>
                        )}
                      </p>
                      <p className="truncate font-mono text-[11px] text-stone-500">SKU {g.slug}</p>
                      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] tabular-nums text-stone-600">
                        <div className="flex justify-between">
                          <dt>Categoría</dt>
                          <dd className="font-bold text-gum-espresso">{g.category}</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt>Tela</dt>
                          <dd className="font-bold text-gum-espresso">
                            {fabricMetersForCategory(g.category).toFixed(2)}m
                          </dd>
                        </div>
                        <div className="flex justify-between">
                          <dt>Planta</dt>
                          <dd className="font-bold text-gum-espresso">{g.baseTimeMinutes}m</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt>Precio</dt>
                          <dd className="font-bold text-gum-espresso">
                            ${g.baseSalePrice.toFixed(2)} · {g.baseMarginPct}%
                          </dd>
                        </div>
                      </dl>
                      <p className="mt-1 truncate text-[11px] text-stone-500">
                        {g.recommendedRegions.join(' · ')}
                      </p>
                      {canWriteCms && (
                        <div className="mt-2.5 flex items-center gap-2">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={g.active}
                            onClick={() => void handleToggleActive(g)}
                            disabled={togglingId === g.id}
                            aria-label={`${g.active ? 'Ocultar' : 'Publicar'} ${g.name}`}
                            className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-60 ${
                              g.active ? 'bg-gum-salvia' : 'bg-stone-300'
                            }`}
                          >
                            <span
                              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                                g.active ? 'left-[22px]' : 'left-0.5'
                              }`}
                            />
                          </button>
                          <span className="text-[11px] font-bold text-stone-600">
                            {g.active ? 'Publicado' : 'Oculto'}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              startEdit(g);
                              setCmsDrawerOpen(true);
                            }}
                            aria-label={`Editar ${g.name}`}
                            className="ml-auto inline-flex items-center gap-1 rounded-full border border-gum-line px-2.5 py-1.5 text-[11px] font-bold text-stone-600 transition hover:border-gum-espresso"
                          >
                            <Pencil className="h-3.5 w-3.5" aria-hidden /> Editar Prenda
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {tab === 'bodega' && (
        <div className="space-y-4">
          {/* Panel Superior de Alertas Neymatex (Guano) */}
          <section
            className={`rounded-2xl border p-4 shadow-editorial ${
              (bodegaAlerts?.activeAlerts ?? 0) > 0 || materialsMeta.bajoStock > 0
                ? 'border-amber-300 bg-amber-50'
                : 'border-green-200 bg-green-50'
            }`}
            aria-label="Alertas Neymatex Guano"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-base font-semibold text-gum-espresso">
                {(bodegaAlerts?.activeAlerts ?? 0) > 0 || materialsMeta.bajoStock > 0
                  ? `Alertas Neymatex (Guano): ${bodegaAlerts?.activeAlerts ?? materialsMeta.bajoStock} insumo(s) bajo el umbral`
                  : 'Bodega saludable: sin insumos bajo el umbral mínimo'}
              </h3>
              <span className="text-xs tabular-nums text-stone-600">
                Tela descontada por producción:{' '}
                <strong>{bodegaAlerts ? bodegaAlerts.totalFabricConsumedMeters.toFixed(2) : '—'} m</strong>
              </span>
            </div>
            {bodegaAlerts && bodegaAlerts.alerts.length > 0 && (
              <p className="mt-1 truncate text-xs text-amber-900">
                {bodegaAlerts.alerts
                  .slice(0, 3)
                  .map((a) => `${a.materialName} (${a.currentStockQty}/${a.minStockQty})`)
                  .join(' · ')}
                {bodegaAlerts.alerts.length > 3 ? ` · +${bodegaAlerts.alerts.length - 3} más` : ''}
              </p>
            )}
          </section>

          <section
            className="rounded-2xl border border-gum-line bg-white p-5 shadow-editorial"
            aria-label="Stock de bodega"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-lg font-semibold text-gum-espresso">
                Inventario BOM · Bodega Riobamba ({materialsMeta.total})
              </h3>
              <span className="flex gap-2">
                {canManageStock && (
                  <button
                    type="button"
                    onClick={() => setMatDrawerOpen(true)}
                    className="inline-flex min-h-9 items-center rounded-full bg-gum-espresso px-3 py-1.5 text-xs font-bold text-white transition hover:bg-gum-salvia"
                  >
                    + Registrar Nuevo Insumo en Bodega
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void loadMaterials()}
                  disabled={matLoading}
                  className="inline-flex items-center gap-1.5 rounded-full border border-gum-line px-3 py-1.5 text-sm font-semibold text-stone-700 transition hover:border-gum-espresso disabled:opacity-60"
                >
                  <RefreshCw className={`h-4 w-4 ${matLoading ? 'animate-spin' : ''}`} aria-hidden />
                  Recargar
                </button>
              </span>
            </div>
            {materialsMeta.bajoStock > 0 && (
              <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900">
                {materialsMeta.bajoStock} insumo(s) en stock bajo o mínimo.
              </p>
            )}
            {matLoading && materials.length === 0 ? (
              <p className="py-8 text-center text-sm text-stone-500">Leyendo bodega…</p>
            ) : (
              <ul className="mt-3 max-h-[640px] space-y-2 overflow-y-auto pr-1">
                {materials.map((m) => {
                  const low = m.stockQty <= m.minStockQty;
                  return (
                    <li
                      key={m.id}
                      className="rounded-lg border border-stone-100 bg-stone-50 px-3 py-2"
                    >
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <p className="font-semibold text-gum-espresso">
                          {m.name}{' '}
                          <span className="font-mono text-xs font-normal text-stone-500">
                            {m.sku}
                          </span>
                          {low && (
                            <span className="ml-1.5 rounded bg-amber-200 px-1.5 py-0.5 text-[11px] text-amber-900">
                              stock bajo
                            </span>
                          )}
                        </p>
                        <p className="shrink-0 text-xs tabular-nums text-stone-500">
                          {m.kind} · ${m.unitCostUsd.toFixed(2)}/{m.unit} · mín {m.minStockQty} {m.unit}
                        </p>
                      </div>
                      <div
                        className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gum-linen"
                        role="progressbar"
                        aria-valuenow={Math.round(
                          Math.min(100, (m.stockQty / Math.max(m.minStockQty * 3, m.stockQty, 1)) * 100),
                        )}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`Nivel de stock de ${m.name}`}
                      >
                        <div
                          className={`h-full rounded-full ${low ? 'bg-gum-terracotta' : 'bg-gum-salvia'}`}
                          style={{
                            width: `${Math.min(100, (m.stockQty / Math.max(m.minStockQty * 3, m.stockQty, 1)) * 100)}%`,
                          }}
                        />
                      </div>
                      <p className="mt-0.5 text-[11px] tabular-nums text-stone-500">
                        Nivel: {m.stockQty} {m.unit} disponibles
                      </p>
                      <div className="mt-1.5 flex items-center gap-2">
                        {canManageStock ? (
                          <>
                            <label className="flex flex-1 items-center gap-1.5 text-xs text-stone-600">
                              Stock ({m.unit})
                              <input
                                type="number"
                                min={0}
                                step="any"
                                value={stockDrafts[m.id] ?? String(m.stockQty)}
                                onChange={(e) =>
                                  setStockDrafts((prev) => ({ ...prev, [m.id]: e.target.value }))
                                }
                                className="w-full rounded-lg border border-stone-300 px-2 py-1 text-sm"
                              />
                            </label>
                            <button
                              type="button"
                              onClick={() => void handleMaterialStockSave(m.id)}
                              disabled={matSaving}
                              className="shrink-0 rounded-lg bg-gum-ink px-3 py-1 text-xs font-semibold text-white hover:bg-gum-soot disabled:opacity-60"
                            >
                              Guardar
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleRestock(m)}
                              disabled={matSaving}
                              title="Reabastecer lote +100"
                              className="shrink-0 rounded-lg border border-gum-ink px-2 py-1 text-xs font-bold text-gum-ink hover:bg-gum-bone disabled:opacity-60"
                            >
                              +100{m.unit === 'm' ? 'm' : ''}
                            </button>
                          </>
                        ) : (
                          <p className="text-xs text-stone-600">
                            Stock: <strong>{m.stockQty} {m.unit}</strong> (solo lectura para {adminRole})
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <SlideOverDrawer
            open={matDrawerOpen}
            title="Registrar Nuevo Insumo en Bodega"
            subtitle="Bodega Riobamba · BOM de producción"
            onClose={() => setMatDrawerOpen(false)}
          >
            {!canManageStock && (
              <p className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs text-stone-600">
                {rbacNotice(adminRole, 'registrar insumos en bodega')}
              </p>
            )}
            {canManageStock && (
            <form onSubmit={(e) => void handleMaterialCreate(e)} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm font-medium text-stone-600">
                  SKU
                  <input
                    value={matForm.sku}
                    onChange={(e) => setMatForm({ ...matForm, sku: e.target.value })}
                    required
                    minLength={2}
                    placeholder="TEL-ALG200-ROJ"
                    className={inputClass()}
                  />
                </label>
                <label className="block text-sm font-medium text-stone-600">
                  Tipo
                  <select
                    value={matForm.kind}
                    onChange={(e) =>
                      setMatForm({
                        ...matForm,
                        kind: e.target.value as MaterialCreateInput['kind'],
                      })
                    }
                    className={inputClass()}
                  >
                    {(
                      [
                        'TELA',
                        'HILO',
                        'TINTA',
                        'VINIL',
                        'BOTON',
                        'CIERRE',
                        'ETIQUETA',
                        'EMPAQUE',
                      ] as const
                    ).map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="block text-sm font-medium text-stone-600">
                Nombre
                <input
                  value={matForm.name}
                  onChange={(e) => setMatForm({ ...matForm, name: e.target.value })}
                  required
                  minLength={3}
                  placeholder="Algodón peinado 200g rojo"
                  className={inputClass()}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm font-medium text-stone-600">
                  Color (opcional)
                  <input
                    value={matForm.color}
                    onChange={(e) => setMatForm({ ...matForm, color: e.target.value })}
                    placeholder="ROJO"
                    className={inputClass()}
                  />
                </label>
                <label className="block text-sm font-medium text-stone-600">
                  Unidad
                  <select
                    value={matForm.unit}
                    onChange={(e) =>
                      setMatForm({
                        ...matForm,
                        unit: e.target.value as MaterialCreateInput['unit'],
                      })
                    }
                    className={inputClass()}
                  >
                    {(['m', 'kg', 'rollo', 'litro', 'unidad', 'caja'] as const).map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {(
                  [
                    ['stockQty', 'Stock'],
                    ['minStockQty', 'Mínimo'],
                    ['unitCostUsd', 'Costo $'],
                  ] as const
                ).map(([field, label]) => (
                  <label key={field} className="block text-sm font-medium text-stone-600">
                    {label}
                    <input
                      type="number"
                      step="any"
                      min={0}
                      value={matForm[field]}
                      onChange={(e) => setMatForm({ ...matForm, [field]: e.target.value })}
                      required
                      className={inputClass()}
                    />
                  </label>
                ))}
              </div>
              {matMessage && (
                <p
                  className={`flex items-start gap-1.5 text-sm ${
                    matMessage.kind === 'error' ? 'text-red-700' : 'text-green-800'
                  }`}
                >
                  {matMessage.kind === 'error' ? (
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  ) : (
                    <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  )}
                  {matMessage.text}
                </p>
              )}
              <button
                type="submit"
                disabled={matSaving}
                className="w-full rounded-full bg-gum-terracotta px-4 py-2.5 text-sm font-semibold text-white hover:bg-gum-terracottadark disabled:opacity-60"
              >
                {matSaving ? 'Guardando…' : 'Registrar en bodega'}
              </button>
            </form>
            )}
          </SlideOverDrawer>
        </div>
      )}

      {tab === 'bodega' && (
        <section className="rounded-lg border border-stone-200 bg-white p-5" aria-label="Alertas a proveedores">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg font-semibold text-gum-ink">
              Alertas de reabastecimiento · Neymatex (Guano)
            </h3>
            <button
              type="button"
              onClick={() => void loadBodegaAlerts()}
              disabled={alertsLoading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-semibold text-stone-700 hover:border-gum-ink disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${alertsLoading ? 'animate-spin' : ''}`} aria-hidden />
              Recargar
            </button>
          </div>
          <p className="mt-1 text-xs text-stone-500">
            Tela descontada automáticamente por producción:{' '}
            <strong>{bodegaAlerts ? bodegaAlerts.totalFabricConsumedMeters.toFixed(2) : '—'} m</strong>
          </p>
          {alertsError && (
            <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {alertsError}
            </p>
          )}
          {alertsLoading && !bodegaAlerts ? (
            <p className="py-6 text-center text-sm text-stone-500">Leyendo alertas de proveedor…</p>
          ) : !bodegaAlerts || bodegaAlerts.activeAlerts === 0 ? (
            <p className="mt-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
              Sin alertas activas: ningún insumo perforó su umbral mínimo.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {bodegaAlerts.alerts.map((alert) => (
                <li
                  key={alert.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm"
                >
                  <p className="font-semibold text-red-900">
                    {alert.materialName}{' '}
                    <span className="font-mono font-normal">{alert.sku}</span>
                  </p>
                  <p className="text-xs text-red-800">
                    Stock {alert.currentStockQty} / mínimo {alert.minStockQty} → pedir {alert.requestedQty} · {alert.supplier}
                  </p>
                </li>
              ))}
            </ul>
          )}
          {bodegaAlerts && bodegaAlerts.lowStockItems.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-bold uppercase tracking-wide text-stone-500">Stock bajo ahora mismo</p>
              <ul className="mt-1 space-y-1 text-sm">
                {bodegaAlerts.lowStockItems.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-2 rounded bg-stone-50 px-3 py-1.5">
                    <span className="font-semibold text-gum-ink">{m.name} <span className="font-mono text-xs font-normal text-stone-500">{m.sku}</span></span>
                    <span className="text-xs text-stone-600">{m.stockQty} / mín {m.minStockQty} {m.unit}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {tab === 'inteligencia' && <IntelligenceConsole adminRole={adminRole} />}

      {tab === 'finanzas' && <FinanceConsole adminRole={adminRole} />}

      {tab === 'gobierno' && <GobiernoConsole adminRole={adminRole} />}
      </div>
    </div>
  );
}
