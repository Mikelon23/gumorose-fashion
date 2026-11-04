import React, { useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Loader2,
  MapPin,
  Minus,
  Package,
  Plus,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import { isAnticipoEligible, calculatePaymentSplit } from '@gumorose/shared';
import { priceLine, useBox, type CheckoutReceipt } from '../context/BoxContext';
import { PROVINCIAS, REGION_META, colorHexOf, prettyColor } from '../data/regions';
import { SriInvoiceCard } from '../components/SriInvoiceCard';

/**
 * Banner colapsable del comprobante anterior: la caja nueva sigue visible
 * y pagable debajo. Nunca oculta las prendas actuales ni el botón de pagar.
 */
function PreviousReceiptBanner({
  receipt,
  onClose,
}: {
  receipt: CheckoutReceipt;
  onClose: () => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const orderCode = receipt.erpOrder?.orderCode ?? receipt.trackingCode;
  return (
    <div
      className="rounded-lg border border-green-300 bg-green-50 p-4"
      aria-label="Última orden generada"
    >
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex flex-1 items-center gap-2 text-left text-sm font-semibold text-green-900"
        >
          {open ? (
            <ChevronUp className="h-4 w-4 shrink-0" aria-hidden />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />
          )}
          Última orden {orderCode} generada con éxito · Ver seguimiento
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Ocultar comprobante anterior"
          className="rounded p-1 text-green-800 hover:bg-green-100"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      {open && (
        <dl className="mt-3 space-y-1.5 rounded-lg border border-green-200 bg-white p-4 text-left text-sm">
          <div className="flex justify-between">
            <dt className="text-stone-500">Seguimiento en planta</dt>
            <dd className="font-display font-bold text-gum-ink">{receipt.trackingCode}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-stone-500">Prendas</dt>
            <dd className="font-semibold">{receipt.box.totalUnits} uds</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-stone-500">Total pagado</dt>
            <dd className="font-semibold">${receipt.box.totalUsd.toFixed(2)}</dd>
          </div>
          <p className="pt-1 text-xs text-stone-500">
            Revisa su avance etapa por etapa en Mis Pedidos.
          </p>
          <SriInvoiceCard boxId={receipt.box.id} invoice={receipt.sriInvoice} />
        </dl>
      )}
    </div>
  );
}

interface GumoroseBoxViewProps {
  onShop: () => void;
  onGoAdmin: () => void;
}

const TIERS = [
  { min: 6, pct: 5, label: '5% (6–12 uds)' },
  { min: 13, pct: 12, label: '12% (13–50 uds)' },
  { min: 51, pct: 20, label: '20% (51–160 uds)' },
];
const BOX_CAPACITY = 160;

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/**
 * Armador de la Caja Gumorose: líneas, progreso de volumen,
 * logística de Ecuador, cotización oficial y checkout.
 */
export function GumoroseBoxView({ onShop, onGoAdmin }: GumoroseBoxViewProps): React.JSX.Element {
  const {
    lines,
    totalUnits,
    updateQuantity,
    removeLine,
    region,
    setRegion,
    provincia,
    setProvincia,
    ciudad,
    setCiudad,
    direccion,
    setDireccion,
    customerName,
    setCustomerName,
    quote,
    quoteStatus,
    quoteError,
    quoteFresh,
    retryQuote,
    checkout,
    checkoutStatus,
    checkoutError,
    receipt,
    previousReceipt,
    optimisticSubtotal,
    dismissReceipt,
    localDiscountPct,
    customerRole,
    companyName,
    setCompanyName,
    ruc,
    setRuc,
    paymentMode,
    setPaymentMode,
  } = useBox();
  const [paymentMethod, setPaymentMethod] = useState('mock');
  const [linesOpen, setLinesOpen] = useState(false);

  const anticipoEligible = isAnticipoEligible(customerRole, totalUnits);
  const splitPreview =
    quote && anticipoEligible ? calculatePaymentSplit(quote.totalUsd, paymentMode) : null;

  const nextTier = TIERS.find((t) => totalUnits < t.min);
  const progress = Math.min(100, (totalUnits / BOX_CAPACITY) * 100);
  const provinces = PROVINCIAS[region] ?? [];
  const cities = provinces.find((p) => p.nombre === provincia)?.ciudades ?? [];

  /* ------------------------------ recibo ------------------------------ */
  // Pantalla completa solo si la caja quedó vacía. Con prendas nuevas, el
  // comprobante vive como banner superior y la caja sigue operable.
  const bannerReceipt = receipt && lines.length > 0 ? receipt : previousReceipt;
  if (receipt && lines.length === 0) {
    const box = receipt.box;
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="rounded-lg border border-green-300 bg-green-50 p-6 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-700 text-white">
            <Check className="h-6 w-6" aria-hidden />
          </span>
          <h2 className="mt-3 font-display text-2xl font-semibold text-green-900">
            Caja Gumorose pagada
          </h2>
          <p className="mt-1 text-sm text-green-800">
            Tu pedido entró a la cola de producción de la planta Riobamba.
          </p>
          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-green-800">
            Código de seguimiento en planta
          </p>
          <p className="font-display text-3xl font-bold tracking-wide text-gum-ink">
            {receipt.trackingCode}
          </p>
          <p className="mt-1 text-xs text-stone-500">Orden {box.id}</p>
          {receipt.erpOrder && (
            <dl className="mx-auto mt-4 max-w-md space-y-1.5 rounded-lg border border-green-200 bg-white p-4 text-left text-sm">
              <div className="flex justify-between">
                <dt className="text-stone-500">Orden de producción</dt>
                <dd className="font-mono font-bold text-gum-ink">{receipt.erpOrder.orderCode}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-stone-500">Modalidad</dt>
                <dd className="font-semibold">
                  {receipt.paymentMode === 'ANTICIPO_50_50' ? 'Anticipo 50/50 B2B' : 'Contado 100%'}
                </dd>
              </div>
              {receipt.paymentMode === 'ANTICIPO_50_50' && (
                <div className="flex justify-between">
                  <dt className="text-stone-500">Abono hoy / Saldo despacho</dt>
                  <dd className="font-semibold">
                    ${receipt.erpOrder.amountPaidUsd.toFixed(2)} / $
                    {receipt.erpOrder.balanceDueUsd.toFixed(2)}
                  </dd>
                </div>
              )}
              {typeof receipt.fabricMeters === 'number' && (
                <div className="flex justify-between">
                  <dt className="text-stone-500">Tela reservada en Riobamba</dt>
                  <dd className="font-semibold">{receipt.fabricMeters.toFixed(2)} m</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-stone-500">Etapa inicial</dt>
                <dd className="font-semibold">1_DISENO_ARTE</dd>
              </div>
            </dl>
          )}
        </div>

        <div className="rounded-lg border border-stone-200 bg-white p-5">
          <h3 className="font-display text-lg font-semibold text-gum-ink">Comprobante</h3>
          <dl className="mt-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-stone-500">Prendas</dt>
              <dd className="font-semibold">{box.totalUnits} uds</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-stone-500">Total pagado</dt>
              <dd className="font-display text-lg font-bold text-gum-ink">
                ${box.totalUsd.toFixed(2)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-stone-500">Destino</dt>
              <dd className="font-semibold">
                {REGION_META[box.region].label} · {provincia} · {ciudad}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-stone-500">Entrega estimada</dt>
              <dd className="font-semibold">
                {box.deliveryDaysMin}–{box.deliveryDaysMax} días
              </dd>
            </div>
          </dl>
          <div className="mt-4">
            <SriInvoiceCard boxId={box.id} invoice={receipt.sriInvoice} />
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={onGoAdmin}
              className="flex-1 rounded-lg bg-gum-ink px-4 py-2 text-sm font-semibold text-white hover:bg-gum-soot"
            >
              Crear ficha técnica en Admin
            </button>
            <button
              type="button"
              onClick={() => {
                dismissReceipt();
                onShop();
              }}
              className="flex-1 rounded-lg border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 hover:border-gum-ink"
            >
              Seguir comprando
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ------------------------------- vacía ------------------------------- */
  if (lines.length === 0) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-dashed border-gum-line bg-white px-6 py-14 text-center shadow-editorial">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gum-linen text-gum-terracottadark">
          <Package className="h-6 w-6" aria-hidden />
        </span>
        <h2 className="mt-3 font-display text-2xl font-semibold text-gum-espresso">
          Tu Caja Gumorose está vacía
        </h2>
        <p className="mt-1 text-sm text-stone-600">
          Agrega prendas del catálogo o personaliza un diseño con tus logos.
        </p>
        <button
          type="button"
          onClick={onShop}
          className="mt-5 rounded-lg bg-gum-ember px-5 py-2.5 text-sm font-semibold text-white hover:bg-gum-emberdark"
        >
          Ir a la tienda
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {bannerReceipt && (
        <PreviousReceiptBanner receipt={bannerReceipt} onClose={dismissReceipt} />
      )}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gum-terracottadark">
          Caja Gumorose · Riobamba
        </p>
        <h2 className="font-display text-3xl font-semibold text-gum-espresso">Mi Caja</h2>
        <p className="truncate text-xs text-stone-500">
          {totalUnits} prenda(s) · {localDiscountPct}% por volumen
        </p>
      </div>

      {/* Barra de progreso por volumen */}
      <section
        className="rounded-2xl border border-gum-line bg-white p-5 shadow-editorial"
        aria-label="Progreso de descuento por volumen"
      >
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-semibold text-gum-ink">
            Descuento actual:{' '}
            <span className="font-display text-2xl font-bold text-gum-ember">
              {localDiscountPct}%
            </span>
          </p>
          <p className="text-xs text-stone-500">
            {nextTier
              ? `Agrega ${nextTier.min - totalUnits} prenda(s) para el ${nextTier.pct}%`
              : 'Descuento máximo alcanzado'}
          </p>
        </div>
        <div className="relative mt-3 h-3 rounded-full bg-stone-200">
          <div
            className="h-3 rounded-full bg-gum-ember transition-all"
            style={{ width: `${progress}%` }}
          />
          {TIERS.map((t) => (
            <span
              key={t.min}
              title={t.label}
              className="absolute top-1/2 h-4 w-1 -translate-y-1/2 rounded bg-gum-ink"
              style={{ left: `${(t.min / BOX_CAPACITY) * 100}%` }}
            />
          ))}
        </div>
        <div className="mt-1.5 flex justify-between text-[11px] text-stone-500">
          <span>0</span>
          <span>6 · 5%</span>
          <span>13 · 12%</span>
          <span>51 · 20%</span>
          <span>160 máx</span>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Líneas + logística */}
        <div className="space-y-6 lg:col-span-3">
          <section className="rounded-lg border border-stone-200 bg-white p-5" aria-label="Prendas">
            <button
              type="button"
              onClick={() => setLinesOpen((v) => !v)}
              aria-expanded={linesOpen}
              className="flex w-full items-center justify-between gap-2 text-left text-sm font-bold text-gum-ink"
            >
              <span>Detalle de prendas ({lines.length}) · {totalUnits} ud(s)</span>
              {linesOpen ? <ChevronUp className="h-4 w-4 shrink-0" aria-hidden /> : <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />}
            </button>
            {linesOpen && (
            <ol className="mt-3 divide-y divide-stone-100">
              {lines.map((line) => {
                const price = priceLine(line);
                return (
                  <li key={line.key} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                    <span
                      className="mt-1 h-10 w-10 shrink-0 rounded-lg border border-stone-300"
                      style={{ backgroundColor: colorHexOf(line.color) }}
                      title={prettyColor(line.color)}
                    />
                    <div className="flex-1 text-sm">
                      <p className="font-semibold text-gum-ink">{line.garmentName}</p>
                      <p className="text-xs text-stone-500">
                        Talla {line.size} · {prettyColor(line.color)} · {line.logosCount} logo(s)
                      </p>
                      <div className="mt-1.5 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => updateQuantity(line.key, line.quantity - 1)}
                          disabled={line.quantity <= 1}
                          aria-label="Quitar una unidad"
                          className="rounded border border-stone-300 p-1 hover:border-gum-ink disabled:opacity-40"
                        >
                          <Minus className="h-3.5 w-3.5" aria-hidden />
                        </button>
                        <span className="min-w-8 text-center font-semibold">{line.quantity}</span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(line.key, line.quantity + 1)}
                          disabled={line.quantity >= 160}
                          aria-label="Agregar una unidad"
                          className="rounded border border-stone-300 p-1 hover:border-gum-ink disabled:opacity-40"
                        >
                          <Plus className="h-3.5 w-3.5" aria-hidden />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeLine(line.key)}
                          aria-label={`Quitar ${line.garmentName} de la caja`}
                          className="ml-1 rounded p-1 text-stone-400 hover:bg-red-50 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </button>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1" aria-label="Carga rápida mayorista">
                        <button
                          type="button"
                          onClick={() => updateQuantity(line.key, line.quantity + 5)}
                          className="rounded border border-stone-200 px-1.5 py-0.5 text-[11px] font-semibold text-stone-600 hover:border-gum-ink"
                        >
                          +5
                        </button>
                        <button
                          type="button"
                          onClick={() => updateQuantity(line.key, line.quantity + 15)}
                          className="rounded border border-stone-200 px-1.5 py-0.5 text-[11px] font-semibold text-stone-600 hover:border-gum-ink"
                        >
                          +15
                        </button>
                        <button
                          type="button"
                          onClick={() => updateQuantity(line.key, 20)}
                          title="Fijar este ítem en 20 unidades (lote B2B)"
                          className="rounded border border-gum-ink px-1.5 py-0.5 text-[11px] font-semibold text-gum-ink hover:bg-gum-bone"
                        >
                          Lote B2B 20 uds
                        </button>
                      </div>
                    </div>
                    <p className="text-right text-sm">
                      <span className="block font-semibold text-gum-ink">
                        ${price.lineTotal.toFixed(2)}
                      </span>
                      <span className="block text-xs text-stone-500">
                        ${price.unitPrice.toFixed(2)} c/u
                      </span>
                    </p>
                  </li>
                );
              })}
            </ol>
            )}
          </section>

          {/* Logística Ecuador */}
          <section className="rounded-lg border border-stone-200 bg-white p-5" aria-label="Logística">
            <h3 className="flex items-center gap-2 font-display text-lg font-semibold text-gum-ink">
              <MapPin className="h-5 w-5 text-gum-ember" aria-hidden /> Entrega en Ecuador
            </h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-medium text-stone-600">
                Región
                <select
                  value={region}
                  onChange={(e) => setRegion(e.target.value as typeof region)}
                  className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                >
                  {(Object.keys(REGION_META) as (typeof region)[]).map((r) => (
                    <option key={r} value={r}>
                      {REGION_META[r].label} ({REGION_META[r].clima})
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium text-stone-600">
                Nombre de quien recibe
                <input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Ej. María Quishpe"
                  maxLength={120}
                  className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                />
              </label>
              {customerRole === 'CLIENTE_B2B' && (
                <>
                  <label className="block text-sm font-medium text-stone-600">
                    Razón Social / Empresa
                    <input
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="Ej. Distribuidora Andina"
                      maxLength={160}
                      className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block text-sm font-medium text-stone-600">
                    RUC
                    <input
                      value={ruc}
                      onChange={(e) => setRuc(e.target.value)}
                      placeholder="1790000000001"
                      maxLength={20}
                      inputMode="numeric"
                      className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                    />
                  </label>
                </>
              )}
              <label className="block text-sm font-medium text-stone-600">
                Provincia
                <select
                  value={provincia}
                  onChange={(e) => setProvincia(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                >
                  {provinces.map((p) => (
                    <option key={p.nombre} value={p.nombre}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium text-stone-600">
                Ciudad
                <select
                  value={ciudad}
                  onChange={(e) => setCiudad(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                >
                  {cities.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium text-stone-600 sm:col-span-2">
                Dirección (calle principal, número y referencia)
                <input
                  value={direccion}
                  onChange={(e) => setDireccion(e.target.value)}
                  placeholder="Ej. Av. Daniel León Borja 123, frente al parque"
                  maxLength={200}
                  className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                />
              </label>
            </div>
          </section>
        </div>

        {/* Cotización oficial */}
        <aside className="lg:col-span-2">
          <div className="rounded-2xl bg-gum-espresso p-5 text-white shadow-editorialLg lg:sticky lg:top-20">
            <h3 className="flex items-center gap-2 font-display text-lg font-semibold">
              <Truck className="h-5 w-5 text-gum-oro" aria-hidden /> Cotización oficial
            </h3>

            {quoteStatus === 'quoting' || quoteStatus === 'idle' ? (
              <div className="mt-4 text-sm">
                <p className="flex items-center gap-2 text-stone-300">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  {quoteStatus === 'idle' ? 'Preparando cotización…' : 'Actualizando cotización…'}
                </p>
                {optimisticSubtotal > 0 && (
                  <p className="mt-1 text-stone-300">
                    Subtotal en caja:{' '}
                    <strong className="text-white">${optimisticSubtotal.toFixed(2)}</strong>
                  </p>
                )}
              </div>
            ) : quoteStatus === 'error' ? (
              <div className="mt-4 text-sm">
                <p className="flex items-start gap-1.5 text-red-300">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  {quoteError ?? 'No se pudo cotizar.'}
                </p>
                <button
                  type="button"
                  onClick={retryQuote}
                  className="mt-2 rounded-lg border border-white/30 px-3 py-1.5 text-sm font-semibold hover:bg-white/10"
                >
                  Reintentar
                </button>
              </div>
            ) : quote ? (
              <dl className="mt-4 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-stone-300">Subtotal ({quote.totalUnits} uds)</dt>
                  <dd className="font-semibold">${quote.subtotalUsd.toFixed(2)}</dd>
                </div>
                <div className="flex justify-between text-gum-gold">
                  <dt>Descuento {quote.discountPct}%</dt>
                  <dd className="font-semibold">−${quote.discountUsd.toFixed(2)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-stone-300">Envío {REGION_META[region].label}</dt>
                  <dd className="font-semibold">${quote.shippingUsd.toFixed(2)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-stone-300">Confección en Riobamba</dt>
                  <dd className="font-semibold">{formatMinutes(quote.productionMinutes)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-stone-300">Entrega estimada</dt>
                  <dd className="font-semibold">
                    {quote.deliveryDaysMin}–{quote.deliveryDaysMax} días
                  </dd>
                </div>
                <div className="flex items-baseline justify-between border-t border-white/15 pt-2">
                  <dt className="font-semibold">Total</dt>
                  <dd className="font-display text-2xl font-bold text-gum-gold">
                    ${quote.totalUsd.toFixed(2)}
                  </dd>
                </div>
                {!quoteFresh && (
                  <p className="flex items-center gap-1.5 pt-1 text-xs text-amber-300">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    Cambiaste la caja: actualizando cotización…
                  </p>
                )}
              </dl>
            ) : null}

            <label className="mt-4 block text-sm font-medium text-stone-300">
              Método de pago
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white"
              >
                <option value="mock" className="text-stone-900">
                  Pago simulado (mock)
                </option>
                <option value="tarjeta" className="text-stone-900">
                  Tarjeta
                </option>
                <option value="transferencia" className="text-stone-900">
                  Transferencia
                </option>
              </select>
            </label>

            {customerRole === 'CLIENTE_B2B' && anticipoEligible && quote && (
              <fieldset className="mt-3 rounded-lg border border-gum-gold/40 bg-white/5 p-3">
                <legend className="px-1 text-xs font-bold text-gum-gold">
                  Modalidad B2B Gumorose
                </legend>
                <div className="space-y-2 text-sm">
                  <label className="flex items-start gap-2">
                    <input
                      type="radio"
                      name="payment-mode"
                      checked={paymentMode === 'CONTADO_100'}
                      onChange={() => setPaymentMode('CONTADO_100')}
                      className="mt-1"
                    />
                    <span>
                      <span className="font-semibold">CONTADO_100 (Pago 100% Online)</span>
                      <span className="block text-xs text-stone-300">
                        Pagas hoy ${quote.totalUsd.toFixed(2)} y la planta arranca de inmediato.
                      </span>
                    </span>
                  </label>
                  <label className="flex items-start gap-2">
                    <input
                      type="radio"
                      name="payment-mode"
                      checked={paymentMode === 'ANTICIPO_50_50'}
                      onChange={() => setPaymentMode('ANTICIPO_50_50')}
                      className="mt-1"
                    />
                    <span>
                      <span className="font-semibold">
                        ANTICIPO_50_50 (50% Hoy + 50% al Despacho)
                      </span>
                      <span className="block text-xs text-stone-300">
                        Total ${quote.totalUsd.toFixed(2)} · Abono hoy $
                        {splitPreview?.amountPaidUsd.toFixed(2)} · Saldo contra despacho $
                        {splitPreview?.balanceDueUsd.toFixed(2)}.
                      </span>
                    </span>
                  </label>
                </div>
              </fieldset>
            )}
            {(customerRole === 'CLIENTE_B2C' || !anticipoEligible) && totalUnits > 0 && (
              <p className="mt-2 text-xs text-stone-300">
                El Anticipo 50/50 se desbloquea en modo Mayorista (B2B) con cajas de 13 a 160
                unidades.
              </p>
            )}

            {checkoutError && (
              <p className="mt-2 flex items-start gap-1.5 text-sm text-red-300">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {checkoutError}
              </p>
            )}

            <button
              type="button"
              onClick={() => void checkout(paymentMethod, paymentMode)}
              disabled={!quoteFresh || checkoutStatus === 'processing'}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-gum-ember px-4 py-2.5 text-sm font-semibold text-white hover:bg-gum-emberdark disabled:cursor-not-allowed disabled:opacity-50"
            >
              {checkoutStatus === 'processing' ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <CreditCard className="h-4 w-4" aria-hidden />
              )}
              Confirmar y pagar Caja Gumorose
            </button>
            <p className="mt-2 text-center text-xs text-stone-400">
              {quoteFresh
                ? 'Cotización vigente. Al pagar, la caja pasa a producción.'
                : 'El pago se habilita con la cotización vigente.'}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
