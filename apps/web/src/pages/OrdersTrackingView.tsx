import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Award, ChevronDown, ChevronUp, Loader2, PackageSearch, RefreshCw, Truck } from 'lucide-react';
import { PLANT_PRODUCTION_STAGES_ORDERED } from '@gumorose/shared';
import type { ErpProductionOrder, OrderItemDetail, PlantProductionStage } from '@gumorose/shared';
import { readPaidBoxIds, useBox } from '../context/BoxContext';
import { fetchBox, fetchBoxOrders, type BoxDetail, type BoxWithErp } from '../services/api';
import { OrderItemsDetail } from '../components/OrderItemsDetail';
import { SriInvoiceCard } from '../components/SriInvoiceCard';

/** Prendas del pedido: prefiere el detalle ERP y cae a las líneas de la caja. */
function detailItemsOf(box: BoxDetail, order?: ErpProductionOrder): OrderItemDetail[] {
  if (order?.items && order.items.length > 0) return order.items;
  return box.lines.map((line) => ({
    designId: line.designId,
    garmentId: line.garmentId,
    garmentName: line.garmentName,
    category: line.category,
    size: line.size,
    color: line.color,
    quantity: line.quantity,
    logosCount: line.logosCount,
    unitPriceUsd: line.unitPriceUsd,
    lineTotalUsd: line.lineTotalUsd,
  }));
}

/** Más reciente primero (`createdAt` descendente, estable sin fecha). */
export function newestBoxesFirst(boxes: BoxWithErp[]): BoxWithErp[] {
  return [...boxes]
    .map((box, index) => ({ box, index }))
    .sort((a, b) => {
      const ca = a.box.createdAt ?? '';
      const cb = b.box.createdAt ?? '';
      if (ca !== cb) return ca < cb ? 1 : -1;
      return a.index - b.index;
    })
    .map((entry) => entry.box);
}

/** Etapas visibles para el comprador en planta Riobamba. */
export const BUYER_STAGES = [
  'En Cola',
  'En Corte',
  'En Costura',
  'Estampado',
  'Despachado',
] as const;

export type BuyerStage = (typeof BUYER_STAGES)[number];

function hashIndex(seed: string, modulo: number): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return hash % modulo;
}

/**
 * Traduce el estado interno de la caja a la etapa que ve el comprador.
 * `EN_PRODUCCION` se reparte de forma determinista entre Corte/Costura/
 * Estampado según el ID, para la demo de planta en vivo.
 */
export function buyerStageOf(box: Pick<BoxDetail, 'id' | 'status'>): {
  stage: BuyerStage | 'Cancelada';
  index: number;
  finished: boolean;
} {
  switch (box.status) {
    case 'COTIZADA':
    case 'PAGADA':
      return { stage: 'En Cola', index: 0, finished: false };
    case 'EN_PRODUCCION': {
      const index = 1 + hashIndex(box.id, 3);
      return { stage: BUYER_STAGES[index] ?? 'En Costura', index, finished: false };
    }
    case 'ENVIADA':
      return { stage: 'Despachado', index: 4, finished: false };
    case 'ENTREGADA':
    case 'DESPACHADO':
      return { stage: 'Despachado', index: 4, finished: true };
    case 'CANCELADA':
      return { stage: 'Cancelada', index: -1, finished: false };
  }
}

/** Etiquetas cortas del pipeline industrial (11 etapas de Riobamba). */
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

/** Pipeline industrial completo de la orden ERP (etapas, sello, finanzas). */
function ErpPipeline({
  order,
  onSettle,
  settling,
}: {
  order: ErpProductionOrder;
  onSettle: () => void;
  settling: boolean;
}): React.JSX.Element {
  const currentIndex = PLANT_PRODUCTION_STAGES_ORDERED.indexOf(order.currentStage);
  const sealOk = order.blueSealApplied && order.qualityCheckStatus === 'APROBADO_SELLO_AZUL';
  return (
    <div className="mt-4 rounded-lg border border-gum-ink/20 bg-stone-50 p-4" aria-label={`Pipeline ${order.orderCode}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-mono text-sm font-bold text-gum-ink">{order.orderCode}</p>
        {sealOk ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-bold text-sky-900">
            <Award className="h-3.5 w-3.5" aria-hidden /> Sello Azul de Calidad Gumorose Aplicado
          </span>
        ) : order.qualityCheckStatus === 'REPROCESO_COSTURA' ? (
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-900">
            En Reproceso Costura
          </span>
        ) : (
          <span className="rounded-full bg-stone-200 px-2.5 py-0.5 text-xs font-bold text-stone-600">
            Auditoría pendiente
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-stone-500">
        Tela reservada en bodega: {order.fabricMetersDeducted.toFixed(2)} m · Pagado $
        {order.amountPaidUsd.toFixed(2)} · Saldo ${order.balanceDueUsd.toFixed(2)}
      </p>
      <ol className="mt-3 space-y-0" aria-label="11 etapas de planta">
        {PLANT_PRODUCTION_STAGES_ORDERED.map((stage, step) => {
          const done = step < currentIndex;
          const current = step === currentIndex;
          const hit = order.stageHistory.find((h) => h.stage === stage);
          return (
            <li key={stage} className="flex gap-3">
              <span className="flex flex-col items-center" aria-hidden>
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                    done
                      ? 'bg-green-700 text-white'
                      : current
                        ? 'bg-gum-ember text-white'
                        : 'bg-stone-200 text-stone-500'
                  }`}
                >
                  {done ? '✓' : step + 1}
                </span>
                {step < PLANT_PRODUCTION_STAGES_ORDERED.length - 1 && (
                  <span className={`h-4 w-0.5 ${done ? 'bg-green-700' : 'bg-stone-200'}`} />
                )}
              </span>
              <p
                className={`pb-2 text-sm ${current ? 'font-bold text-gum-ink' : done ? 'font-semibold text-green-800' : 'text-stone-500'}`}
              >
                {STAGE_SHORT_LABEL[stage]}
                {hit && (
                  <span className="ml-2 text-xs font-normal text-stone-400">
                    {new Date(hit.timestamp).toLocaleString()}
                  </span>
                )}
              </p>
            </li>
          );
        })}
      </ol>
      {order.balanceDueUsd > 0 && (
        <button
          type="button"
          onClick={onSettle}
          disabled={settling}
          className="mt-2 w-full rounded-lg bg-gum-ember px-4 py-2.5 text-sm font-bold text-white hover:bg-gum-emberdark disabled:opacity-60"
        >
          {settling
            ? 'Liquidando…'
            : `Liquidar 50% Restante ($${order.balanceDueUsd.toFixed(2)}) para Habilitar Despacho`}
        </button>
      )}
      {order.balanceDueUsd <= 0 && (
        <p className="mt-2 text-xs font-semibold text-green-800">
          Saldo $0.00: la orden puede avanzar hasta Empaque/Despacho.
        </p>
      )}
    </div>
  );
}

function TrackingCard({
  box,
  order,
  onSettle,
  settling,
  isNewest,
}: {
  box: BoxDetail;
  order?: ErpProductionOrder;
  onSettle: (orderId: string) => void;
  settling: boolean;
  isNewest: boolean;
}): React.JSX.Element {
  const { stage, index, finished } = buyerStageOf(box);
  const cancelled = stage === 'Cancelada';
  const [open, setOpen] = useState(isNewest);
  return (
    <li className="rounded-2xl border border-gum-line bg-white p-5 shadow-editorial">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-mono text-sm font-bold text-gum-espresso">Caja {box.id.slice(0, 8)}</p>
        <span className="flex items-center gap-1.5">
          {isNewest && (
            <span className="rounded-full bg-gum-ember px-2.5 py-0.5 text-xs font-bold text-white">
              MÁS RECIENTE / NUEVO
            </span>
          )}
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              cancelled
                ? 'bg-red-100 text-red-800'
                : finished
                  ? 'bg-green-100 text-green-800'
                  : 'bg-gum-bone text-gum-emberdark'
            }`}
          >
            {finished ? 'Entregado' : stage}
          </span>
        </span>
      </div>
      <p className="mt-1 text-sm text-stone-600">
        {box.totalUnits} prenda(s) · ${box.totalUsd.toFixed(2)} · {box.deliveryDaysMin}–
        {box.deliveryDaysMax} días
      </p>
      {!cancelled && (
        <ol className="mt-4 space-y-0" aria-label={`Seguimiento de la caja ${box.id.slice(0, 8)}`}>
          {BUYER_STAGES.map((label, step) => {
            const done = finished || step < index;
            const current = !finished && step === index;
            return (
              <li key={label} className="flex gap-3">
                <span className="flex flex-col items-center" aria-hidden>
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                      done
                        ? 'bg-green-700 text-white'
                        : current
                          ? 'bg-gum-ember text-white'
                          : 'bg-stone-200 text-stone-500'
                    }`}
                  >
                    {done ? '✓' : step + 1}
                  </span>
                  {step < BUYER_STAGES.length - 1 && (
                    <span className={`h-5 w-0.5 ${done ? 'bg-green-700' : 'bg-stone-200'}`} />
                  )}
                </span>
                <p
                  className={`pb-3 text-sm ${current ? 'font-bold text-gum-ink' : done ? 'font-semibold text-green-800' : 'text-stone-500'}`}
                >
                  {label}
                  {current && (
                    <span className="ml-2 text-xs font-normal text-stone-500">
                      · en planta ahora
                    </span>
                  )}
                </p>
              </li>
            );
          })}
        </ol>
      )}
      {cancelled && (
        <p className="mt-3 text-sm text-red-700">
          Esta caja fue cancelada. Escríbenos para reprogramarla.
        </p>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full border border-stone-300 px-4 py-2 text-xs font-bold text-stone-700 hover:border-gum-ink"
      >
        {open ? <ChevronUp className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}
        Ver pipeline de 11 etapas y detalle de prendas
      </button>
      <div className="mt-3">
        <SriInvoiceCard boxId={box.id} orderCode={order?.orderCode} />
      </div>
      {open && (
        <>
          <OrderItemsDetail items={detailItemsOf(box, order)} />
          {!cancelled && order && (
            <ErpPipeline
              order={order}
              onSettle={() => onSettle(order.id)}
              settling={settling}
            />
          )}
        </>
      )}
    </li>
  );
}

/**
 * Vista del comprador: "Mis Pedidos / Seguimiento de Cajas".
 * Solo estado de confección — sin herramientas administrativas.
 */
export function OrdersTrackingView(): React.JSX.Element {
  const { lastPaidBoxId, plantOrders, refreshPlantOrders, settleBalance, settleStatus } = useBox();
  const [boxes, setBoxes] = useState<BoxWithErp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchId, setSearchId] = useState('');
  const [searchName, setSearchName] = useState('');

  const ordersByBox = useMemo(() => {
    const map = new Map<string, ErpProductionOrder>();
    for (const order of plantOrders) map.set(order.boxId, order);
    return map;
  }, [plantOrders]);

  const loadMine = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const ids = lastPaidBoxId
        ? [lastPaidBoxId, ...readPaidBoxIds().filter((id) => id !== lastPaidBoxId)]
        : readPaidBoxIds();
      await refreshPlantOrders();
      if (ids.length === 0) {
        setBoxes([]);
        return;
      }
      const results = await Promise.allSettled(ids.map((id) => fetchBox(id)));
      setBoxes(results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : [])));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar tus pedidos.');
    } finally {
      setLoading(false);
    }
  }, [lastPaidBoxId, refreshPlantOrders]);

  useEffect(() => {
    void loadMine();
  }, [loadMine]);

  async function handleSearchById(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const id = searchId.trim();
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const box = await fetchBox(id);
      setBoxes([box]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se encontró esa caja.');
      setBoxes([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleSearchByName(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const customerName = searchName.trim();
    if (!customerName) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchBoxOrders({ customerName });
      setBoxes(res.items);
      if (res.items.length === 0) setError(`Sin pedidos a nombre de "${customerName}".`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo buscar por nombre.');
      setBoxes([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gum-terracottadark">
          Planta Riobamba · 11 etapas
        </p>
        <h2 className="font-display text-3xl font-semibold text-gum-espresso">Seguimiento</h2>
        <p className="truncate text-xs text-stone-500">
          Etapa de confección en planta Riobamba · el pedido más reciente va primero (#1)
        </p>
      </div>

      <div className="grid gap-3 rounded-2xl border border-gum-line bg-white p-5 shadow-editorial sm:grid-cols-2">
        <form onSubmit={(e) => void handleSearchById(e)} className="space-y-2">
          <label className="block text-sm font-medium text-stone-600">
            Buscar por código de caja
            <span className="mt-1 flex gap-2">
              <input
                value={searchId}
                onChange={(e) => setSearchId(e.target.value)}
                placeholder="UUID de la caja"
                className="min-w-0 flex-1 rounded-lg border border-stone-300 px-3 py-2 font-mono text-sm"
              />
              <button
                type="submit"
                className="shrink-0 rounded-lg bg-gum-ink px-4 py-2 text-sm font-semibold text-white hover:bg-gum-soot"
              >
                Ver
              </button>
            </span>
          </label>
        </form>
        <form onSubmit={(e) => void handleSearchByName(e)} className="space-y-2">
          <label className="block text-sm font-medium text-stone-600">
            Buscar por nombre de quien recibe
            <span className="mt-1 flex gap-2">
              <input
                value={searchName}
                onChange={(e) => setSearchName(e.target.value)}
                placeholder="Ej. María Quishpe"
                maxLength={120}
                className="min-w-0 flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm"
              />
              <button
                type="submit"
                className="shrink-0 rounded-lg border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 hover:border-gum-ink"
              >
                Buscar
              </button>
            </span>
          </label>
        </form>
      </div>

      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-sm text-stone-600">
          <Truck className="h-4 w-4 text-gum-ember" aria-hidden />
          {boxes.length === 0 ? 'Sin cajas para mostrar' : `${boxes.length} caja(s) en seguimiento`}
        </p>
        <button
          type="button"
          onClick={() => void loadMine()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-semibold text-stone-700 hover:border-gum-ink disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden />
          Mis cajas
        </button>
      </div>

      {loading && (
        <p className="flex items-center justify-center gap-2 py-10 text-sm text-stone-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Consultando planta…
        </p>
      )}
      {error && (
        <p className="flex items-start gap-1.5 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {error}
        </p>
      )}
      {!loading && boxes.length === 0 && !error && (
        <div className="mx-auto max-w-xl rounded-lg border border-dashed border-stone-300 bg-white px-6 py-12 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gum-bone text-gum-ember">
            <PackageSearch className="h-6 w-6" aria-hidden />
          </span>
          <p className="mt-3 font-display text-xl font-semibold text-gum-ink">
            Aún no tienes pedidos
          </p>
          <p className="mt-1 text-sm text-stone-600">
            Cuando pagues una Caja Gumorose aparecerá aquí con su etapa de confección.
          </p>
        </div>
      )}
      {!loading && boxes.length > 0 && (
        <ul className="grid gap-4 lg:grid-cols-2">
          {newestBoxesFirst(boxes).map((box, position) => (
            <TrackingCard
              key={box.id}
              box={box}
              order={ordersByBox.get(box.id) ?? box.erpOrder}
              onSettle={(orderId) => void settleBalance(orderId)}
              settling={settleStatus === 'loading'}
              isNewest={position === 0}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
