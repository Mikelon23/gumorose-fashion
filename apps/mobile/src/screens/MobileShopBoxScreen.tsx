import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Award,
  Check,
  ChevronDown,
  ChevronUp,
  CreditCard,
  ExternalLink,
  Factory,
  Loader2,
  Minus,
  Package,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import type { EcuadorRegion, GarmentTemplate, PlantProductionStage } from '@gumorose/shared';
import {
  PLANT_PRODUCTION_STAGES_ORDERED,
  calculatePaymentSplit,
  computeMlGarmentAffinity,
  isAnticipoEligible,
} from '@gumorose/shared';
import { priceLine, useClosetMobile, type InAppReceipt } from '../context/ClosetMobileContext';

/**
 * Banner colapsable del comprobante anterior: la caja nueva sigue visible
 * y pagable debajo. Nunca oculta las prendas actuales ni el botón de pagar.
 */
function PreviousReceiptBanner({
  receipt,
  onClose,
}: {
  receipt: InAppReceipt;
  onClose: () => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const orderCode = receipt.erpOrder?.orderCode ?? receipt.trackingCode;
  return (
    <div
      className="rounded-2xl border border-green-300 bg-green-50 p-3"
      aria-label="Última orden generada"
    >
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex flex-1 items-center gap-1.5 text-left text-xs font-bold text-green-900"
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
          className="rounded-lg p-1 text-green-800"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      {open && (
        <div className="mt-2 rounded-xl bg-white/80 p-3 text-left text-xs">
          <p className="flex justify-between gap-2">
            <span className="font-semibold text-stone-500">Seguimiento</span>
            <span className="font-display font-bold text-gum-ink">{receipt.trackingCode}</span>
          </p>
          <p className="mt-1 flex justify-between gap-2">
            <span className="font-semibold text-stone-500">Total pagado</span>
            <span className="font-bold text-gum-ink">${receipt.box.totalUsd.toFixed(2)}</span>
          </p>
          <MobileSriInvoiceCard boxId={receipt.box.id} invoice={receipt.sriInvoice} />
        </div>
      )}
    </div>
  );
}
import { fetchCatalog } from '../services/mobileApi';
import { OrderItemsDetail } from '../components/OrderItemsDetail';
import { BottomSheet } from '../components/BottomSheet';
import { MobileCanvas } from '../components/MobileCanvas';
import { AnatomicalTryOnStage } from '../components/AnatomicalTryOnStage';
import { REGION_SHORT_LABEL, colorHexOf, prettyColor } from '../data/mobile';
import { useMobileMlProfile } from '../components/MobileMlAccount';
import { MobileSriInvoiceCard } from '../components/MobileSriInvoiceCard';

const TIERS = [
  { min: 6, pct: 5 },
  { min: 13, pct: 12 },
  { min: 51, pct: 20 },
];

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/** Etiquetas cortas de las 11 etapas de Riobamba para la barra de progreso. */
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

/** Precios mayoristas B2B derivados del precio base. */
function wholesalePrices(base: number): { normal: number; lote: number; master: number } {
  const round = (v: number): number => Math.round(v * 100) / 100;
  return { normal: round(base), lote: round(base * 0.88), master: round(base * 0.8) };
}

function defaultSizeFor(garment: GarmentTemplate): string {
  return garment.sizes.includes('M') ? 'M' : (garment.sizes[0] ?? 'M');
}

/** Tarjeta de catálogo con experiencia diferenciada B2C (1 ud) vs B2B (lotes). */
function MobileCatalogCard({
  garment,
  catalog,
  isB2B,
  addedId,
  onQuickAdd,
  onAddLook,
}: {
  garment: GarmentTemplate;
  catalog: GarmentTemplate[];
  isB2B: boolean;
  addedId: string | null;
  onQuickAdd: (garment: GarmentTemplate, size: string, color?: string) => void;
  onAddLook: (look: GarmentTemplate[]) => void;
}): React.JSX.Element {
  const { addLine, setPaymentMode, totalUnits, items: closetItems, profile, bodyAnchors, setBodyAnchors } =
    useClosetMobile();
  const [size, setSize] = useState(defaultSizeFor(garment));
  const [lotOpen, setLotOpen] = useState(false);
  const [qtyBySize, setQtyBySize] = useState<Record<string, number>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [cardView, setCardView] = useState<'PRENDA' | 'CUERPO'>('PRENDA');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedColor, setSelectedColor] = useState(garment.colors[0] ?? 'BLANCO');
  const [lookAdded, setLookAdded] = useState(false);
  const mlProfile = useMobileMlProfile();
  const mlRecommendation = mlProfile ? computeMlGarmentAffinity(mlProfile, garment) : null;
  const prices = wholesalePrices(garment.baseSalePrice);
  const lookGarments = React.useMemo(() => {
    const others = catalog.filter((g) => g.id !== garment.id);
    const chino = others.find((g) => g.visualVariant === 'CHINO');
    const cap = others.find((g) => g.visualVariant === 'GORRA');
    const top = others.find((g) => g.category === 'CAMISETA' && g.visualVariant !== 'HOODIE');
    const picks =
      garment.category === 'PANTALON'
        ? [garment, top, cap]
        : garment.visualVariant === 'GORRA'
          ? [garment, top, chino]
          : [garment, chino, cap];
    return picks.filter((g): g is GarmentTemplate => Boolean(g)).slice(0, 3);
  }, [catalog, garment]);
  const matchCount = closetItems.filter((item) =>
    garment.category === 'PANTALON'
      ? item.category === 'SUPERIOR_CAMISETA' || item.category === 'SUPERIOR_CAMISA'
      : item.category === 'INFERIOR_PANTALON' || item.category === 'ACCESORIO',
  ).length;
  const tryOnItem = {
    id: `shop-${garment.id}`,
    userId: profile?.id ?? 'demo',
    category:
      garment.category === 'PANTALON'
        ? ('INFERIOR_PANTALON' as const)
        : garment.visualVariant === 'GORRA'
          ? ('ACCESORIO' as const)
          : garment.category === 'CAMISA'
            ? ('SUPERIOR_CAMISA' as const)
            : ('SUPERIOR_CAMISETA' as const),
    sourceType: 'COMPRADO_GUMOROSE' as const,
    garmentId: garment.id,
    name: garment.name,
    colorHex: colorHexOf(selectedColor),
    warmthLevel: 'TEMPLADO' as const,
  };
  const lotTotal = garment.sizes.reduce(
    (acc, s) => acc + Math.max(0, Math.floor(qtyBySize[s] ?? 0)),
    0,
  );

  function setQty(s: string, value: number): void {
    const safe = Number.isFinite(value) ? Math.max(0, Math.min(160, Math.floor(value))) : 0;
    setQtyBySize((prev) => ({ ...prev, [s]: safe }));
  }

  function handleSendLot(): void {
    setNotice(null);
    if (lotTotal === 0) {
      setNotice('Indica unidades por talla.');
      return;
    }
    if (totalUnits + lotTotal > 160) {
      setNotice(`Máximo 160 uds (llevas ${totalUnits}).`);
      return;
    }
    for (const s of garment.sizes) {
      const qty = Math.max(0, Math.floor(qtyBySize[s] ?? 0));
      if (qty > 0) {
        addLine({
          garmentId: garment.id,
          garmentName: garment.name,
          category: garment.category,
          baseSalePrice: garment.baseSalePrice,
          baseTimeMinutes: garment.baseTimeMinutes,
          size: s,
          color: garment.colors[0] ?? 'BLANCO',
          quantity: qty,
          logosCount: 0,
        });
      }
    }
    const projected = totalUnits + lotTotal;
    if (projected >= 13 && projected <= 160) {
      setPaymentMode('ANTICIPO_50_50');
      setNotice(`${lotTotal} ud(s) a tu caja con anticipo 50/50.`);
    } else {
      setNotice(`${lotTotal} ud(s) a tu caja (13+ uds activa el 50/50).`);
    }
    setQtyBySize({});
  }

  return (
    <article className="w-48 shrink-0 rounded-3xl bg-white p-3 shadow-card ring-1 ring-gum-line">
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        aria-label={`Ver ${garment.name} y completar el look`}
        className="block w-full text-left"
      >
        <span className="pointer-events-none block overflow-hidden rounded-2xl bg-gum-alabaster">
          {cardView === 'PRENDA' ? (
            <MobileCanvas
              category={garment.category}
              variant={garment.visualVariant}
              fabricHex={colorHexOf(selectedColor)}
              view="FRONTAL"
              logos={[]}
              selectedUid={null}
              onSelect={() => undefined}
              onMove={() => undefined}
            />
          ) : (
            <AnatomicalTryOnStage
              bare
              photoUrl={profile?.fullBodyPhotoUrl}
              items={[tryOnItem]}
              anchors={bodyAnchors}
              onAnchorsChange={setBodyAnchors}
            />
          )}
        </span>
      </button>
      <div className="mt-1.5 flex gap-1 rounded-full bg-gum-linen p-0.5" role="group" aria-label="Vista de la prenda">
        {(
          [
            { id: 'PRENDA', label: 'Prenda' },
            { id: 'CUERPO', label: 'En Mi Cuerpo' },
          ] as const
        ).map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setCardView(option.id)}
            aria-pressed={cardView === option.id}
            className={`min-h-8 flex-1 rounded-full px-2 py-1 text-[10px] font-bold ${
              cardView === option.id ? 'bg-gum-espresso text-white' : 'text-stone-600'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className="mt-2 truncate text-sm font-bold text-gum-espresso">{garment.name}</p>
      <p className="text-[11px] text-stone-500">
        {garment.baseTimeMinutes} min · {garment.sizes.length} tallas · {prettyColor(selectedColor)}
      </p>
      <p className="mt-1 inline-flex rounded-full bg-gum-linen px-2 py-0.5 text-[10px] font-bold text-gum-salvia">
        Whering Match · combina con {matchCount}
      </p>
      {mlRecommendation && (
        <p className="mt-1 inline-flex rounded-full bg-gum-espresso px-2 py-0.5 text-[10px] font-bold text-white">
          🤖 {mlRecommendation.affinityScorePct}% Match ML para ti · Talla sugerida: {mlRecommendation.recommendedSize}
        </p>
      )}
      {isB2B && (
        <p className="mt-1 rounded-md bg-gum-espresso px-1.5 py-0.5 text-center text-[9px] font-bold uppercase tracking-wide text-white">
          Mayorista B2B por Lotes
        </p>
      )}
      <div className="mt-1.5 flex flex-wrap items-center gap-1" aria-label="Colores en vivo">
        {garment.colors.slice(0, 6).map((c) => (
          <button
            key={c}
            type="button"
            title={prettyColor(c)}
            aria-label={`Color ${prettyColor(c)}`}
            aria-pressed={selectedColor === c}
            onClick={() => setSelectedColor(c)}
            className={`h-6 w-6 rounded-full ring-2 ring-white ${
              selectedColor === c
                ? 'outline outline-2 outline-gum-terracotta'
                : 'outline outline-1 outline-gum-line'
            }`}
            style={{ backgroundColor: colorHexOf(c) }}
          />
        ))}
      </div>
      {isB2B ? (
        <div className="mt-1.5 rounded-xl bg-stone-50 p-2 text-[10px] leading-tight">
          <p className="flex justify-between">
            <span className="text-stone-500">Normal</span>
            <span className="font-bold">${prices.normal.toFixed(2)}</span>
          </p>
          <p className="flex justify-between">
            <span className="text-stone-500">Lote 13–50 (−12%)</span>
            <span className="font-bold text-gum-ember">${prices.lote.toFixed(2)}</span>
          </p>
          <p className="flex justify-between">
            <span className="text-stone-500">Máster 51–160 (−20%)</span>
            <span className="font-bold text-gum-ember">${prices.master.toFixed(2)}</span>
          </p>
          <p className="mt-1 text-stone-500">Abono inicial del 50% por lote.</p>
        </div>
      ) : (
        <label className="mt-1.5 block text-[10px] font-bold text-stone-500">
          Talla
          <select
            value={size}
            onChange={(e) => setSize(e.target.value)}
            className="mt-0.5 min-h-9 w-full rounded-lg border border-stone-300 px-1.5 py-1 text-xs text-stone-900"
          >
            {garment.sizes.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="mt-2 flex items-center justify-between">
        <span className="font-display text-base font-bold text-gum-ink">
          ${garment.baseSalePrice.toFixed(2)}
        </span>
        {isB2B ? (
          <button
            type="button"
            onClick={() => setLotOpen((v) => !v)}
            aria-expanded={lotOpen}
            className="rounded-full bg-gum-ink px-3 py-2 text-[11px] font-bold text-white"
          >
            Armar lote
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onQuickAdd(garment, size, selectedColor)}
            aria-label={`Añadir 1 unidad de ${garment.name} (talla ${size}) a la caja`}
            className={`flex h-9 w-9 items-center justify-center rounded-full text-white ${
              addedId === garment.id ? 'bg-green-700' : 'bg-gum-ember'
            }`}
          >
            {addedId === garment.id ? (
              <Check className="h-4 w-4" aria-hidden />
            ) : (
              <Plus className="h-4 w-4" aria-hidden />
            )}
          </button>
        )}
      </div>
      {!isB2B && addedId === garment.id && (
        <p className="mt-1 text-[10px] font-bold text-green-800">1 unidad (talla {size}) en tu caja</p>
      )}
      {isB2B && lotOpen && (
        <div className="mt-2 space-y-1.5 border-t border-dashed border-stone-200 pt-2">
          <p className="text-[10px] font-bold text-gum-ink">Curva de tallas del lote</p>
          <div className="grid grid-cols-3 gap-1">
            {garment.sizes.map((s) => (
              <label key={s} className="block text-center text-[10px] font-bold text-stone-600">
                {s}
                <input
                  type="number"
                  min={0}
                  max={160}
                  value={qtyBySize[s] ?? ''}
                  placeholder="0"
                  onChange={(e) => setQty(s, Number(e.target.value))}
                  className="mt-0.5 min-h-9 w-full rounded-lg border border-stone-300 px-1 py-1 text-center text-xs"
                />
              </label>
            ))}
          </div>
          <p className="text-[10px] font-bold text-gum-ink">Total del lote: {lotTotal} ud(s)</p>
          {notice && <p className="text-[10px] text-stone-600">{notice}</p>}
          <button
            type="button"
            onClick={handleSendLot}
            className="min-h-11 w-full rounded-xl bg-gum-ember px-3 py-2 text-xs font-bold text-white"
          >
            Enviar lote a mi Caja (Anticipo 50/50)
          </button>
        </div>
      )}
      {isB2B && !lotOpen && notice && <p className="mt-1 text-[10px] text-stone-600">{notice}</p>}

      <BottomSheet
        open={sheetOpen}
        title={isB2B ? 'Matriz de Curva de Tallas' : 'Completa el Look'}
        onClose={() => setSheetOpen(false)}
      >
        {!isB2B ? (
          <div>
            <p className="text-xs text-stone-600">
              {garment.name} + sus 2 compañeras ideales, listas en 1 toque.
            </p>
            <ul className="mt-2 space-y-2">
              {lookGarments.map((item) => (
                <li key={item.id} className="flex items-center gap-2 text-xs">
                  <span
                    className="h-6 w-6 shrink-0 rounded-full ring-1 ring-gum-line"
                    style={{ backgroundColor: colorHexOf(item.colors[0] ?? 'BLANCO') }}
                    aria-hidden
                  />
                  <span className="flex-1 truncate font-bold text-gum-espresso">{item.name}</span>
                  <span className="font-bold text-stone-600">${item.baseSalePrice.toFixed(2)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs font-bold text-gum-espresso">
              Look completo: ${lookGarments.reduce((a, g) => a + g.baseSalePrice, 0).toFixed(2)} ·{' '}
              {lookGarments.reduce((a, g) => a + g.baseTimeMinutes, 0)} min en planta
            </p>
            <button
              type="button"
              onClick={() => {
                onAddLook(lookGarments);
                setLookAdded(true);
                window.setTimeout(() => setLookAdded(false), 2200);
              }}
              className={`mt-3 min-h-12 w-full rounded-full px-4 py-2.5 text-sm font-bold text-white ${
                lookAdded ? 'bg-green-700' : 'bg-gum-terracotta'
              }`}
            >
              {lookAdded ? 'Look en tu Caja' : `Añadir Look Completo (${lookGarments.length} prendas)`}
            </button>
          </div>
        ) : (
          <div>
            <table className="w-full text-left text-xs" aria-label="Precios por lote">
              <tbody className="divide-y divide-gum-line">
                <tr>
                  <td className="py-1.5">Base</td>
                  <td className="py-1.5 text-right font-bold">${prices.normal.toFixed(2)}</td>
                </tr>
                <tr>
                  <td className="py-1.5">Lote 13–50 uds (−12%)</td>
                  <td className="py-1.5 text-right font-bold text-gum-terracottadark">
                    ${prices.lote.toFixed(2)}
                  </td>
                </tr>
                <tr>
                  <td className="py-1.5">Caja Master 51–160 uds (−20%)</td>
                  <td className="py-1.5 text-right font-bold text-gum-terracottadark">
                    ${prices.master.toFixed(2)}
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="mt-1 text-[11px] text-stone-500">Inicia producción con 50% de Anticipo.</p>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {garment.sizes.map((s) => (
                <label key={s} className="block text-center text-[10px] font-bold text-stone-600">
                  {s}
                  <input
                    type="number"
                    min={0}
                    max={160}
                    value={qtyBySize[s] ?? ''}
                    placeholder="0"
                    onChange={(e) => setQty(s, Number(e.target.value))}
                    className="mt-0.5 min-h-11 w-full rounded-xl border border-gum-line px-1 py-1 text-center text-xs"
                  />
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs font-bold text-gum-espresso" aria-live="polite">
              Total del lote: {lotTotal} ud(s)
            </p>
            {notice && <p className="text-[11px] text-stone-600">{notice}</p>}
            <button
              type="button"
              onClick={handleSendLot}
              className="mt-2 min-h-12 w-full rounded-full bg-gum-terracotta px-4 py-2.5 text-sm font-bold text-white"
            >
              Enviar lote a mi Caja (Anticipo 50/50)
            </button>
          </div>
        )}
      </BottomSheet>
    </article>
  );
}

/** Pantalla 5: tienda in-app + Caja Gumorose con checkout. */
export function MobileShopBoxScreen({
  onGoCustom,
}: {
  onGoCustom?: () => void;
}): React.JSX.Element {
  const {
    lines,
    totalUnits,
    addLine,
    updateQuantity,
    removeLine,
    boxRegion,
    setBoxRegion,
    boxCustomer,
    setBoxCustomer,
    quote,
    quoteStatus,
    quoteFresh,
    quoteError,
    retryQuote,
    checkout,
    checkoutStatus,
    checkoutError,
    receipt,
    previousReceipt,
    optimisticSubtotal,
    dismissReceipt,
    closetSyncWarning,
    localDiscountPct,
    activeCustomerRole,
    companyName,
    setCompanyName,
    ruc,
    setRuc,
    paymentMode,
    setPaymentMode,
    myPlantOrders,
    plantOrdersStatus,
    plantOrdersError,
    refreshPlantOrders,
    settleBalance,
    settleStatus,
  } = useClosetMobile();

  const [catalog, setCatalog] = useState<GarmentTemplate[]>([]);
  const [paymentMethod, setPaymentMethod] = useState('mock');
  const [addedId, setAddedId] = useState<string | null>(null);
  const [shopTab, setShopTab] = useState<'TIENDA' | 'CAJA' | 'PLANTA'>('TIENDA');
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchCatalog()
      .then((res) => {
        if (!cancelled) setCatalog(res.items);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const nextTier = TIERS.find((t) => totalUnits < t.min);
  const progress = Math.min(100, (totalUnits / 160) * 100);

  const isB2B = activeCustomerRole === 'CLIENTE_B2B';

  function handleQuickAdd(garment: GarmentTemplate, size: string, color?: string): void {
    addLine({
      garmentId: garment.id,
      garmentName: garment.name,
      category: garment.category,
      baseSalePrice: garment.baseSalePrice,
      baseTimeMinutes: garment.baseTimeMinutes,
      size,
      color: color ?? garment.colors[0] ?? 'BLANCO',
      quantity: 1,
      logosCount: 0,
    });
    setAddedId(garment.id);
    window.setTimeout(() => {
      setAddedId((current) => (current === garment.id ? null : current));
    }, 1800);
  }

  function handleAddLook(look: GarmentTemplate[]): void {
    for (const garment of look) handleQuickAdd(garment, defaultSizeFor(garment));
  }

  /** Carga mayorista: suma N unidades de la primera prenda del catálogo. */
  function handleBulkAdd(quantity: number): void {
    const garment = catalog[0];
    if (!garment) return;
    addLine({
      garmentId: garment.id,
      garmentName: garment.name,
      category: garment.category,
      baseSalePrice: garment.baseSalePrice,
      baseTimeMinutes: garment.baseTimeMinutes,
      size: garment.sizes.includes('M') ? 'M' : (garment.sizes[0] ?? 'M'),
      color: garment.colors[0] ?? 'BLANCO',
      quantity,
      logosCount: 0,
    });
  }

  useEffect(() => {
    void refreshPlantOrders().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const anticipoEligible = isAnticipoEligible(activeCustomerRole, totalUnits);
  const splitPreview =
    quote && anticipoEligible ? calculatePaymentSplit(quote.totalUsd, paymentMode) : null;

  // Pantalla completa solo si la caja quedó vacía. Con prendas nuevas, el
  // comprobante vive como banner superior y la caja sigue operable.
  const bannerReceipt = receipt && lines.length > 0 ? receipt : previousReceipt;
  if (receipt && lines.length === 0) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-green-300 bg-green-50 p-5 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-700 text-white">
            <Check className="h-6 w-6" aria-hidden />
          </span>
          <h2 className="mt-2 font-display text-xl font-semibold text-green-900">
            ¡Compra lista!
          </h2>
          <p className="text-xs text-green-800">
            Tus prendas ya están en tu Clóset Virtual.
          </p>
          <p className="mt-3 text-[11px] font-bold uppercase tracking-wide text-green-800">
            Seguimiento en planta
          </p>
          <p className="font-display text-2xl font-bold tracking-wide text-gum-ink">
            {receipt.trackingCode}
          </p>
          <p className="text-xs text-stone-500">
            Total ${receipt.box.totalUsd.toFixed(2)} · {receipt.box.deliveryDaysMin}–{receipt.box.deliveryDaysMax} días
          </p>
          {receipt.erpOrder && (
            <dl className="mt-3 space-y-1 rounded-xl bg-white/80 p-3 text-left text-xs">
              <div className="flex justify-between gap-2">
                <dt className="font-semibold text-stone-500">Orden de producción</dt>
                <dd className="font-display font-bold text-gum-ink">{receipt.erpOrder.orderCode}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="font-semibold text-stone-500">Modalidad</dt>
                <dd className="font-bold text-gum-ink">
                  {receipt.paymentMode === 'ANTICIPO_50_50'
                    ? 'Anticipo 50/50 B2B'
                    : 'Contado 100%'}
                </dd>
              </div>
              {receipt.paymentMode === 'ANTICIPO_50_50' && (
                <div className="flex justify-between gap-2">
                  <dt className="font-semibold text-stone-500">Abonado / Saldo</dt>
                  <dd className="font-bold text-gum-ink">
                    ${receipt.erpOrder.amountPaidUsd.toFixed(2)} / $
                    {receipt.erpOrder.balanceDueUsd.toFixed(2)}
                  </dd>
                </div>
              )}
              {typeof receipt.fabricMeters === 'number' && (
                <div className="flex justify-between gap-2">
                  <dt className="font-semibold text-stone-500">Tela reservada en Riobamba</dt>
                  <dd className="font-bold text-gum-ink">{receipt.fabricMeters.toFixed(2)} m</dd>
                </div>
              )}
              <div className="flex justify-between gap-2">
                <dt className="font-semibold text-stone-500">Etapa inicial</dt>
                <dd className="font-bold text-gum-ink">1. Diseño</dd>
              </div>
            </dl>
          )}
        </div>
        <MobileSriInvoiceCard boxId={receipt.box.id} invoice={receipt.sriInvoice} />
        {closetSyncWarning && (
          <p className="rounded-xl bg-amber-50 px-4 py-2 text-xs text-amber-900">{closetSyncWarning}</p>
        )}
        <button
          type="button"
          onClick={dismissReceipt}
          className="min-h-12 w-full rounded-2xl bg-gum-ink px-4 py-3 text-sm font-bold text-white"
        >
          Seguir explorando
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {bannerReceipt && (
        <PreviousReceiptBanner receipt={bannerReceipt} onClose={dismissReceipt} />
      )}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gum-terracottadark">
            Tienda Editorial
          </p>
          <h2 className="font-display text-2xl font-semibold text-gum-espresso">Tienda & Caja</h2>
          <p className="text-xs text-stone-500">Compra in-app sin salir de la aplicación.</p>
        </div>
        <button
          type="button"
          onClick={() => window.open('http://localhost:5173', '_blank', 'noopener')}
          className="inline-flex min-h-11 items-center gap-1 rounded-full border border-gum-line bg-white px-3 py-2 text-xs font-bold text-stone-700 shadow-card"
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Estudio Web
        </button>
      </div>

      {/* Tabs: Tienda | Mi Caja | Planta */}
      <div className="grid grid-cols-3 gap-1 rounded-full bg-gum-linen p-1" role="group" aria-label="Paneles de tienda y caja">
        {(
          [
            { id: 'TIENDA', label: 'Tienda' },
            { id: 'CAJA', label: `Mi Caja (${totalUnits})` },
            { id: 'PLANTA', label: 'Planta' },
          ] as const
        ).map((tabItem) => (
          <button
            key={tabItem.id}
            type="button"
            onClick={() => setShopTab(tabItem.id)}
            aria-pressed={shopTab === tabItem.id}
            className={`min-h-10 rounded-full px-2 py-2 text-[11px] font-bold transition active:scale-95 ${
              shopTab === tabItem.id ? 'bg-gum-espresso text-white shadow-card' : 'text-stone-600'
            }`}
          >
            {tabItem.label}
          </button>
        ))}
      </div>

      {/* Catálogo compacto con experiencia B2C vs B2B (tab Tienda) */}
      {shopTab === 'TIENDA' && (
      <>
      {/* Mini-Carrusel Hero Móvil: Costa, Sierra y Oriente */}
      <div
        className="gum-no-scrollbar -mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1"
        aria-label="Colecciones por región"
      >
        {(
          [
            { region: 'COSTA' as const, title: 'Costa Fresca', note: 'Algodón que respira a 30°C', badge: 'Desde $8.65' },
            { region: 'SIERRA' as const, title: 'Sierra en Capas', note: 'Térmicos 350g de Riobamba', badge: 'Hasta −20% en Caja' },
            { region: 'ORIENTE' as const, title: 'Oriente Tropical', note: 'Secado rápido antihumedad', badge: 'Estudio Multi-Logo' },
          ]
        ).map((slide) => {
          const rep = catalog.find((g) => g.recommendedRegions.includes(slide.region));
          return (
            <article
              key={slide.region}
              className="w-[86%] shrink-0 snap-center rounded-3xl bg-gum-espresso p-4 text-white shadow-card"
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gum-oro">
                {REGION_SHORT_LABEL[slide.region]} · Ecuador
              </p>
              <h3 className="mt-1 font-display text-xl font-semibold">{slide.title}</h3>
              <p className="text-xs text-stone-300">{slide.note}</p>
              {rep && (
                <p className="mt-2 truncate rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-bold">
                  {rep.name} · ${rep.baseSalePrice.toFixed(2)}
                </p>
              )}
              <div className="mt-3 flex items-center gap-2">
                <span className="rounded-full bg-gum-terracotta px-2.5 py-1 text-[10px] font-bold">
                  {slide.badge}
                </span>
                <button
                  type="button"
                  onClick={onGoCustom}
                  className="min-h-10 rounded-full border border-white/30 px-3 py-1.5 text-[11px] font-bold text-white"
                >
                  Abrir Estudio Multi-Logo
                </button>
              </div>
            </article>
          );
        })}
      </div>
      <section aria-label="Catálogo in-app">
        <p
          className={`mb-2 rounded-xl px-3 py-2 text-center text-[11px] font-bold ${
            isB2B ? 'bg-gum-ink text-gum-gold' : 'bg-white text-stone-600'
          }`}
        >
          {isB2B
            ? 'Modo Mayorista B2B: Lotes corporativos de 13–160 uds con 12%–20% desc. y Anticipo 50/50'
            : 'Modo Personal B2C: Clóset diario y cajas de 1–12 uds (Pago 100%)'}
        </p>
        <div className="flex gap-2.5 overflow-x-auto pb-2">
          {catalog.map((garment) => (
            <MobileCatalogCard
              key={garment.id}
              garment={garment}
              catalog={catalog}
              isB2B={isB2B}
              addedId={addedId}
              onQuickAdd={handleQuickAdd}
              onAddLook={handleAddLook}
            />
          ))}
        </div>
      </section>

      {/* Progreso de volumen */}
      <section className="rounded-2xl border border-stone-200 bg-white p-4" aria-label="Descuento por volumen">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-bold text-gum-ink">
            Descuento <span className="font-display text-xl text-gum-ember">{localDiscountPct}%</span>
            <span className="ml-1 text-xs font-normal text-stone-500">{totalUnits}/160 uds</span>
          </p>
          <p className="text-[11px] text-stone-500">
            {nextTier ? `+${nextTier.min - totalUnits} para ${nextTier.pct}%` : 'Máximo alcanzado'}
          </p>
        </div>
        <div className="relative mt-2 h-2.5 rounded-full bg-stone-200">
          <div className="h-2.5 rounded-full bg-gum-ember transition-all" style={{ width: `${progress}%` }} />
          {TIERS.map((t) => (
            <span
              key={t.min}
              className="absolute top-1/2 h-3.5 w-1 -translate-y-1/2 rounded bg-gum-ink"
              style={{ left: `${(t.min / 160) * 100}%` }}
            />
          ))}
        </div>
        {/* Carga rápida mayorista (pruebas B2B) */}
        <div className="mt-2.5 flex flex-wrap gap-1.5" aria-label="Carga rápida mayorista">
          <button
            type="button"
            onClick={() => handleBulkAdd(5)}
            disabled={catalog.length === 0}
            className="rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs font-bold text-stone-700 disabled:opacity-40"
          >
            +5 uds
          </button>
          <button
            type="button"
            onClick={() => handleBulkAdd(15)}
            disabled={catalog.length === 0}
            className="rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs font-bold text-stone-700 disabled:opacity-40"
          >
            +15 uds
          </button>
          <button
            type="button"
            onClick={() => handleBulkAdd(20)}
            disabled={catalog.length === 0}
            className="rounded-lg bg-gum-ink px-2.5 py-1.5 text-xs font-bold text-white disabled:opacity-40"
          >
            Lote B2B 20 uds
          </button>
        </div>
      </section>
      </>
      )}

      {/* Líneas (tab Mi Caja) */}
      {shopTab === 'CAJA' && (
      <section className="rounded-2xl border border-stone-200 bg-white p-4" aria-label="Prendas en la caja">
        {lines.length === 0 ? (
          <div className="py-4 text-center">
            <Package className="mx-auto h-8 w-8 text-stone-300" aria-hidden />
            <p className="mt-1 text-sm text-stone-500">Tu caja está vacía. Toca + en el catálogo.</p>
          </div>
        ) : (
          <ol className="divide-y divide-stone-100">
            {lines.map((line) => {
              const price = priceLine(line);
              return (
                <li key={line.key} className="flex items-center gap-2.5 py-2.5 first:pt-0 last:pb-0">
                  <span
                    className="h-9 w-9 shrink-0 rounded-lg border border-stone-300"
                    style={{ backgroundColor: colorHexOf(line.color) }}
                  />
                  <div className="flex-1 text-xs">
                    <p className="font-bold text-gum-ink">{line.garmentName}</p>
                    <p className="text-stone-500">
                      {line.size} · {line.logosCount} logo(s) · ${price.unitPrice.toFixed(2)} c/u
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => updateQuantity(line.key, line.quantity - 1)}
                      disabled={line.quantity <= 1}
                      aria-label="Quitar una unidad"
                      className="rounded-lg border border-stone-300 p-1.5 disabled:opacity-40"
                    >
                      <Minus className="h-3.5 w-3.5" aria-hidden />
                    </button>
                    <span className="min-w-6 text-center text-sm font-bold">{line.quantity}</span>
                    <button
                      type="button"
                      onClick={() => updateQuantity(line.key, line.quantity + 1)}
                      disabled={line.quantity >= 160}
                      aria-label="Agregar una unidad"
                      className="rounded-lg border border-stone-300 p-1.5 disabled:opacity-40"
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeLine(line.key)}
                      aria-label="Quitar de la caja"
                      className="rounded-lg p-1.5 text-stone-400"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>
      )}

      {/* Cotización + checkout (tab Mi Caja) */}
      {shopTab === 'CAJA' && lines.length > 0 && (
        <section className="rounded-2xl bg-gum-ink p-4 text-white" aria-label="Cotización in-app">
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs font-medium text-stone-300">
              Región de envío
              <select
                value={boxRegion}
                onChange={(e) => setBoxRegion(e.target.value as EcuadorRegion)}
                className="mt-1 min-h-11 w-full rounded-xl border border-white/20 bg-white/10 px-2 py-2 text-sm text-white"
              >
                {(Object.keys(REGION_SHORT_LABEL) as EcuadorRegion[]).map((r) => (
                  <option key={r} value={r} className="text-stone-900">
                    {REGION_SHORT_LABEL[r]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-stone-300">
              Quien recibe
              <input
                value={boxCustomer}
                onChange={(e) => setBoxCustomer(e.target.value)}
                placeholder="Nombre"
                maxLength={120}
                className="mt-1 min-h-11 w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-stone-400"
              />
            </label>
          </div>

          {activeCustomerRole === 'CLIENTE_B2B' && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="block text-xs font-medium text-stone-300">
                Empresa
                <input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Distribuidora …"
                  maxLength={160}
                  className="mt-1 min-h-11 w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-stone-400"
                />
              </label>
              <label className="block text-xs font-medium text-stone-300">
                RUC
                <input
                  value={ruc}
                  onChange={(e) => setRuc(e.target.value)}
                  placeholder="1790000000001"
                  maxLength={20}
                  inputMode="numeric"
                  className="mt-1 min-h-11 w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-stone-400"
                />
              </label>
            </div>
          )}

          {quoteStatus === 'loading' || quoteStatus === 'idle' ? (
            <div className="mt-3 text-sm">
              <p className="flex items-center gap-2 text-stone-300">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Cotizando con planta Riobamba…
              </p>
              {optimisticSubtotal > 0 && (
                <p className="mt-1 text-stone-300">
                  Subtotal en caja:{' '}
                  <strong className="text-white">${optimisticSubtotal.toFixed(2)}</strong>
                </p>
              )}
            </div>
          ) : quoteStatus === 'error' ? (
            <div className="mt-3 text-sm">
              <p className="flex items-start gap-1.5 text-red-300">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {quoteError ?? 'No se pudo cotizar.'}
              </p>
              <button
                type="button"
                onClick={retryQuote}
                className="mt-2 rounded-xl border border-white/30 px-3 py-2 text-xs font-bold"
              >
                Reintentar
              </button>
            </div>
          ) : (
            quote && (
              <dl className="mt-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-stone-300">Subtotal ({quote.totalUnits} uds)</dt>
                  <dd className="font-semibold">${quote.subtotalUsd.toFixed(2)}</dd>
                </div>
                <div className="flex justify-between text-gum-gold">
                  <dt>Descuento {quote.discountPct}%</dt>
                  <dd className="font-semibold">−${quote.discountUsd.toFixed(2)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-stone-300">Envío + confección</dt>
                  <dd className="font-semibold">
                    ${quote.shippingUsd.toFixed(2)} · {formatMinutes(quote.productionMinutes)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-stone-300">Entrega</dt>
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
              </dl>
            )
          )}

          <label className="mt-3 block text-xs font-medium text-stone-300">
            Pago
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="mt-1 min-h-11 w-full rounded-xl border border-white/20 bg-white/10 px-2 py-2 text-sm text-white"
            >
              <option value="mock" className="text-stone-900">
                Pago simulado (mock)
              </option>
              <option value="tarjeta" className="text-stone-900">
                Tarjeta
              </option>
            </select>
          </label>

          {activeCustomerRole === 'CLIENTE_B2B' && anticipoEligible && quote && (
            <fieldset className="mt-3 rounded-xl border border-gum-gold/40 bg-white/5 p-3">
              <legend className="px-1 text-xs font-bold text-gum-gold">
                Modalidad B2B Gumorose
              </legend>
              <div className="space-y-2">
                <label className="flex items-start gap-2 text-xs">
                  <input
                    type="radio"
                    name="payment-mode"
                    checked={paymentMode === 'CONTADO_100'}
                    onChange={() => setPaymentMode('CONTADO_100')}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-bold">100% Contado Online</span>
                    <span className="block text-stone-300">
                      Pagas hoy ${quote.totalUsd.toFixed(2)} y la planta arranca de inmediato.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-xs">
                  <input
                    type="radio"
                    name="payment-mode"
                    checked={paymentMode === 'ANTICIPO_50_50'}
                    onChange={() => setPaymentMode('ANTICIPO_50_50')}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-bold">50% Anticipo Hoy + 50% Contra Despacho</span>
                    <span className="block text-stone-300">
                      Abonas hoy ${splitPreview?.amountPaidUsd.toFixed(2)} para arrancar las
                      máquinas en Riobamba; quedan ${splitPreview?.balanceDueUsd.toFixed(2)}{' '}
                      pendientes al despacho.
                    </span>
                  </span>
                </label>
              </div>
            </fieldset>
          )}
          {activeCustomerRole === 'CLIENTE_B2B' && !anticipoEligible && totalUnits > 0 && (
            <p className="mt-2 text-xs text-stone-300">
              El anticipo 50/50 se desbloquea con 13–160 uds (llevas {totalUnits}).
            </p>
          )}
          {checkoutError && (
            <p className="mt-2 text-xs text-red-300">{checkoutError}</p>
          )}
          <button
            type="button"
            onClick={() => void checkout(paymentMethod, paymentMode)}
            disabled={!quoteFresh || checkoutStatus === 'loading'}
            className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gum-ember px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            {checkoutStatus === 'loading' ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <CreditCard className="h-4 w-4" aria-hidden />
            )}
            Comprar Caja Ahora
          </button>
          <p className="mt-1.5 text-center text-[11px] text-stone-400">
            Al pagar, las prendas entran solas a tu Clóset Virtual.
          </p>
        </section>
      )}

      {/* Mis órdenes en planta Riobamba (11 etapas) (tab Planta) */}
      {shopTab === 'PLANTA' && (
      <section className="rounded-2xl border border-stone-200 bg-white p-4" aria-label="Mis órdenes en planta">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-gum-ink">
            <Factory className="h-4 w-4" aria-hidden />
            Mis Órdenes en Planta Riobamba
          </h3>
          <button
            type="button"
            onClick={() => void refreshPlantOrders()}
            disabled={plantOrdersStatus === 'loading'}
            aria-label="Actualizar órdenes en planta"
            className="rounded-lg border border-stone-300 p-1.5 disabled:opacity-40"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${plantOrdersStatus === 'loading' ? 'animate-spin' : ''}`}
              aria-hidden
            />
          </button>
        </div>
        {plantOrdersStatus === 'error' && (
          <p className="mt-2 text-xs text-red-600">{plantOrdersError ?? 'No se pudo leer planta.'}</p>
        )}
        {plantOrdersStatus !== 'error' && myPlantOrders.length === 0 && (
          <p className="mt-2 text-xs text-stone-500">
            Aún no tienes órdenes: paga una caja y aquí verás su avance etapa por etapa.
          </p>
        )}
        <ol className="mt-2 space-y-3">
          {[...myPlantOrders]
            .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
            .map((order, position) => {
            const stageIndex = PLANT_PRODUCTION_STAGES_ORDERED.indexOf(order.currentStage);
            const done = stageIndex + 1;
            return (
              <li key={order.id} className="rounded-xl border border-stone-200 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-display text-sm font-bold text-gum-ink">{order.orderCode}</p>
                  <span className="flex items-center gap-1.5">
                    {position === 0 && (
                      <span className="rounded-full bg-gum-ember px-2 py-0.5 text-[10px] font-bold text-white">
                        MÁS RECIENTE / NUEVO
                      </span>
                    )}
                    {order.blueSealApplied && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-900">
                        <Award className="h-3 w-3" aria-hidden />
                        Sello Azul Gumorose
                      </span>
                    )}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-stone-500">
                  {STAGE_SHORT_LABEL[order.currentStage]} · etapa {done}/11
                  {order.qualityCheckStatus === 'REPROCESO_COSTURA' && ' · en reproceso'}
                </p>
                <div className="mt-1.5 h-2 rounded-full bg-stone-200">
                  <div
                    className="h-2 rounded-full bg-gum-ember"
                    style={{ width: `${Math.round((done / 11) * 100)}%` }}
                  />
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px]">
                  <span className="text-stone-500">
                    {order.paymentMode === 'ANTICIPO_50_50'
                      ? `Abonado $${order.amountPaidUsd.toFixed(2)} · Saldo $${order.balanceDueUsd.toFixed(2)}`
                      : `Pagado $${order.amountPaidUsd.toFixed(2)}`}
                  </span>
                  {order.balanceDueUsd > 0 && (
                    <button
                      type="button"
                      onClick={() => void settleBalance(order.id)}
                      disabled={settleStatus === 'loading'}
                      className="rounded-lg bg-gum-ink px-2.5 py-1.5 font-bold text-white disabled:opacity-50"
                    >
                      Liquidar 50% Restante (${order.balanceDueUsd.toFixed(2)})
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setExpandedOrderId((cur) => (cur === order.id ? null : order.id))}
                  aria-expanded={expandedOrderId === order.id}
                  className="mt-2 min-h-10 w-full rounded-full border border-gum-line px-3 py-2 text-[11px] font-bold text-gum-espresso"
                >
                  {expandedOrderId === order.id
                    ? 'Ocultar las 11 etapas'
                    : `Ver las 11 etapas de Riobamba (${done}/11)`}
                </button>
                {expandedOrderId === order.id && (
                  <ol className="mt-2 space-y-1" aria-label="Etapas de producción">
                    {PLANT_PRODUCTION_STAGES_ORDERED.map((stage, idx) => {
                      const stageDone = idx < stageIndex;
                      const stageCurrent = idx === stageIndex;
                      return (
                        <li
                          key={stage}
                          className={`flex items-center gap-2 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                            stageCurrent
                              ? 'bg-gum-espresso text-white'
                              : stageDone
                                ? 'bg-gum-linen text-gum-salvia'
                                : 'text-stone-400'
                          }`}
                        >
                          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-white/70 text-[9px] font-bold text-gum-espresso">
                            {idx + 1}
                          </span>
                          {STAGE_SHORT_LABEL[stage]}
                          {stageCurrent && <span className="ml-auto text-[9px]">EN CURSO</span>}
                        </li>
                      );
                    })}
                  </ol>
                )}
                <div className="mt-2">
                  <MobileSriInvoiceCard boxId={order.boxId} orderCode={order.orderCode} />
                </div>
                <OrderItemsDetail items={order.items ?? []} />
              </li>
            );
          })}
        </ol>
      </section>
      )}
    </div>
  );
}
