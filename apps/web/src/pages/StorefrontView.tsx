import React, { useEffect, useState } from 'react';
import { Check, Leaf, Mountain, PackagePlus, PenTool, PersonStanding, Sparkles, Sun, X } from 'lucide-react';
import type { EcuadorRegion, GarmentCategory, GarmentTemplate } from '@gumorose/shared';
import { DEFAULT_BODY_ANCHORS, computeMlGarmentAffinity } from '@gumorose/shared';
import { DEMO_SUBJECT_USER_ID, fetchCatalog, fetchClosetProfile } from '../services/api';
import { useBox } from '../context/BoxContext';
import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  REGION_META,
  REGION_ORDER,
  colorHexOf,
  prettyColor,
} from '../data/regions';
import { FALLBACK_CATALOG } from '../data/fallback';
import { STUDIO_SUBJECTS } from '../data/subjects';
import {
  MODEL_TORSO_WIDTH,
  MODEL_VIEW_LABEL,
  MODEL_VIEW_ORDER,
  closetMatchCountFor,
  completeTheLook,
  fabricCompositionOf,
  fitOf,
  formatCpw,
  skuOf,
  type CategoryShowcaseDef,
  type ModelView,
} from '../data/editorial';
import { GarmentCanvas } from '../components/GarmentCanvas';
import { AnatomicalSubjectStage } from '../components/AnatomicalSubjectStage';
import { HeroCatalogCarousel } from '../components/HeroCatalogCarousel';
import { CategoryShowcaseRail } from '../components/CategoryShowcaseRail';
import { CuratedEditBar } from '../components/CuratedEditBar';
import { useMlProfile } from '../components/MlAccountModal';

interface StorefrontViewProps {
  onCustomize: (garment: GarmentTemplate) => void;
}

type RegionFilter = 'TODAS' | EcuadorRegion;
type CategoryFilter = 'TODAS' | GarmentCategory;

const REGION_ICON: Record<EcuadorRegion, React.JSX.Element> = {
  COSTA: <Sun className="h-4 w-4" aria-hidden />,
  SIERRA: <Mountain className="h-4 w-4" aria-hidden />,
  ORIENTE: <Leaf className="h-4 w-4" aria-hidden />,
};

function filterFallback(region: RegionFilter, category: CategoryFilter): GarmentTemplate[] {
  return FALLBACK_CATALOG.filter((g) => {
    if (region !== 'TODAS' && !g.recommendedRegions.includes(region)) return false;
    if (category !== 'TODAS' && g.category !== category) return false;
    return true;
  });
}

/** Precios mayoristas B2B derivados del precio base. */
function wholesalePrices(base: number): { normal: number; lote: number; master: number } {
  const round = (v: number): number => Math.round(v * 100) / 100;
  return { normal: round(base), lote: round(base * 0.88), master: round(base * 0.8) };
}

/**
 * Vista previa Switch Model: prenda 3D o puesta sobre el sujeto anatómico
 * (zona facial libre 0–19.5%, medio cuerpo auto-extendido en el Estudio).
 */
function SwitchModelPreview({
  garment,
  view,
  hex,
  myBodyPhoto,
  bottomGarment,
}: {
  garment: GarmentTemplate;
  view: ModelView;
  hex: string;
  myBodyPhoto?: string | null;
  bottomGarment?: GarmentTemplate | null;
}): React.JSX.Element {
  if (view === 'STUDIO') {
    return (
      <div className="aspect-[4/5] overflow-hidden bg-gum-linen">
        <GarmentCanvas
          category={garment.category}
          variant={garment.visualVariant}
          fabricHex={hex}
          view="FRONTAL"
          logos={[]}
          selectedUid={null}
          showGuides={false}
          onSelect={() => undefined}
          onMove={() => undefined}
        />
        <p className="sr-only">Vista Prenda 3D</p>
      </div>
    );
  }
  const torso = MODEL_TORSO_WIDTH[view];
  const subject =
    view === 'MY_BODY'
      ? (myBodyPhoto ?? STUDIO_SUBJECTS[0]?.silhouetteUrl ?? '')
      : view === 'MODEL_LXL'
        ? (STUDIO_SUBJECTS[2]?.silhouetteUrl ?? '')
        : (STUDIO_SUBJECTS[1]?.silhouetteUrl ?? '');
  const anchors = { ...DEFAULT_BODY_ANCHORS, torsoWidthPct: torso };
  return (
    <div
      className="relative aspect-[4/5] overflow-hidden bg-gum-linen"
      aria-label={`Vista en cuerpo: ${MODEL_VIEW_LABEL[view]}`}
    >
      <div className="mx-auto h-full" style={{ aspectRatio: '9 / 16' }}>
        <AnatomicalSubjectStage
          subjectImage={subject}
          subjectLabel={MODEL_VIEW_LABEL[view]}
          garment={garment}
          fabricHex={hex}
          view="FRONTAL"
          logos={[]}
          selectedUid={null}
          onSelect={() => undefined}
          onMove={() => undefined}
          bottomGarment={garment.category === 'PANTALON' ? null : (bottomGarment ?? null)}
          anchors={anchors}
          framing="FULL_BODY"
        />
      </div>
      <span className="absolute bottom-2 left-2 z-[47] inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold text-white">
        <PersonStanding className="h-3 w-3" aria-hidden /> {MODEL_VIEW_LABEL[view]}
        {view === 'MY_BODY' && !myBodyPhoto ? ' · silueta (sube tu foto en el Estudio)' : ''}
      </span>
    </div>
  );
}

/** Compra minorista B2C: precio unitario, 1 talla y 1 unidad a la caja personal. */
function B2CDirectCard({
  garment,
  onCustomize,
  addedId,
  onAdded,
  color,
}: {
  garment: GarmentTemplate;
  onCustomize: () => void;
  addedId: string | null;
  onAdded: (garment: GarmentTemplate, size: string, color: string) => void;
  color: string;
}): React.JSX.Element {
  const [size, setSize] = useState(garment.sizes.includes('M') ? 'M' : (garment.sizes[0] ?? 'M'));
  return (
    <div className="mt-4 flex flex-col gap-2 pt-1">
      <label className="block text-sm font-medium text-stone-600">
        Talla
        <select
          value={size}
          onChange={(e) => setSize(e.target.value)}
          className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
        >
          {garment.sizes.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={() => onAdded(garment, size, color)}
        className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
          addedId === garment.id ? 'bg-green-700 text-white' : 'bg-gum-ink text-white hover:bg-gum-soot'
        }`}
      >
        {addedId === garment.id ? (
          <>
            <Check className="h-4 w-4" aria-hidden /> En tu Caja
          </>
        ) : (
          <>
            <PackagePlus className="h-4 w-4" aria-hidden /> Añadir 1 unidad a mi Caja Personal (${garment.baseSalePrice.toFixed(2)})
          </>
        )}
      </button>
      <button
        type="button"
        onClick={onCustomize}
        className="inline-flex items-center justify-center gap-2 rounded-lg border border-gum-ember px-4 py-2 text-sm font-semibold text-gum-ember transition-colors hover:bg-gum-ember hover:text-white"
      >
        <PenTool className="h-4 w-4" aria-hidden /> Personalizar con mis Logos
      </button>
    </div>
  );
}

/**
 * Armador de Curva de Tallas Mayorista (Size Run Matrix): el comprador B2B
 * ingresa unidades por talla en una sola acción y envía el lote a la caja
 * con el anticipo 50/50 activado automáticamente.
 */
function B2BLotCard({
  garment,
  onCustomize,
  color,
  onColorChange,
}: {
  garment: GarmentTemplate;
  onCustomize: () => void;
  color: string;
  onColorChange: (color: string) => void;
}): React.JSX.Element {
  const { addLine, setPaymentMode, totalUnits } = useBox();
  const [qtyBySize, setQtyBySize] = useState<Record<string, number>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const prices = wholesalePrices(garment.baseSalePrice);
  const lotTotal = garment.sizes.reduce((acc, s) => acc + Math.max(0, Math.floor(qtyBySize[s] ?? 0)), 0);

  function setQty(size: string, value: number): void {
    const safe = Number.isFinite(value) ? Math.max(0, Math.min(160, Math.floor(value))) : 0;
    setQtyBySize((prev) => ({ ...prev, [size]: safe }));
  }

  function handleSendLot(): void {
    setNotice(null);
    if (lotTotal === 0) {
      setNotice('Indica cuántas unidades quieres por talla (ej. S: 4, M: 8, L: 6, XL: 2).');
      return;
    }
    if (totalUnits + lotTotal > 160) {
      setNotice(`La caja admite máximo 160 uds (llevas ${totalUnits}). Baja el lote.`);
      return;
    }
    for (const size of garment.sizes) {
      const qty = Math.max(0, Math.floor(qtyBySize[size] ?? 0));
      if (qty > 0) {
        addLine({
          garmentId: garment.id,
          garmentName: garment.name,
          category: garment.category,
          baseSalePrice: garment.baseSalePrice,
          baseTimeMinutes: garment.baseTimeMinutes,
          size,
          color,
          quantity: qty,
          logosCount: 0,
        });
      }
    }
    const projected = totalUnits + lotTotal;
    if (projected >= 13 && projected <= 160) {
      setPaymentMode('ANTICIPO_50_50');
      setNotice(`${lotTotal} ud(s) a tu Caja Gumorose con anticipo 50/50 activado.`);
    } else {
      setNotice(`${lotTotal} ud(s) a tu Caja: suma 13+ uds para activar el anticipo 50/50.`);
    }
    setQtyBySize({});
  }

  return (
    <div className="mt-4 space-y-3 border-t border-dashed border-stone-200 pt-3">
      <p className="rounded-md bg-gum-ink px-2.5 py-1 text-center text-[11px] font-bold uppercase tracking-wide text-white">
        Modo Catálogo Mayorista B2B por Lotes
      </p>
      <table className="w-full text-left text-xs" aria-label="Tabla de precios mayoristas por volumen">
        <thead>
          <tr className="text-stone-500">
            <th className="py-1 font-medium">Volumen</th>
            <th className="py-1 text-right font-medium">Precio c/u</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          <tr>
            <td className="py-1">Normal</td>
            <td className="py-1 text-right font-semibold">${prices.normal.toFixed(2)}</td>
          </tr>
          <tr>
            <td className="py-1">Lote 13–50 uds (−12%)</td>
            <td className="py-1 text-right font-bold text-gum-ember">${prices.lote.toFixed(2)}</td>
          </tr>
          <tr>
            <td className="py-1">Caja Máster 51–160 uds (−20%)</td>
            <td className="py-1 text-right font-bold text-gum-ember">${prices.master.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>
      <p className="text-[11px] text-stone-500">Abono inicial del 50% por lote para arrancar producción.</p>
      <fieldset>
        <legend className="text-xs font-bold text-gum-ink">Curva de tallas del lote</legend>
        <div className="mt-1.5 grid grid-cols-4 gap-1.5">
          {garment.sizes.map((s) => (
            <label key={s} className="block text-center text-[11px] font-bold text-stone-600">
              {s}
              <input
                type="number"
                min={0}
                max={160}
                value={qtyBySize[s] ?? ''}
                placeholder="0"
                onChange={(e) => setQty(s, Number(e.target.value))}
                className="mt-0.5 w-full rounded-md border border-stone-300 px-1.5 py-1.5 text-center text-sm"
              />
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block text-xs font-medium text-stone-600">
        Color del lote
        <select
          value={color}
          onChange={(e) => onColorChange(e.target.value)}
          className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
        >
          {garment.colors.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <p className="text-xs font-semibold text-gum-ink" aria-live="polite">
        Total del lote: {lotTotal} ud(s)
      </p>
      {notice && <p className="text-xs font-medium text-stone-700">{notice}</p>}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={handleSendLot}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-gum-ink px-4 py-2 text-sm font-semibold text-white hover:bg-gum-soot"
        >
          <PackagePlus className="h-4 w-4" aria-hidden /> Enviar lote a mi Caja (Anticipo 50/50)
        </button>
        <button
          type="button"
          onClick={onCustomize}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-gum-ember px-4 py-2 text-sm font-semibold text-gum-ember transition-colors hover:bg-gum-ember hover:text-white"
        >
          <PenTool className="h-4 w-4" aria-hidden /> Personalizar con mis Logos
        </button>
      </div>
    </div>
  );
}

/** Tarjeta editorial rica: visor 4/5, ficha visible y compra en 1 clic. */
function GarmentCard({
  garment,
  catalog,
  isB2B,
  globalModelView,
  myBodyPhoto,
  closetByCategory,
  addedId,
  onCustomize,
  onAdded,
  onAddLook,
}: {
  garment: GarmentTemplate;
  catalog: GarmentTemplate[];
  isB2B: boolean;
  globalModelView: ModelView;
  myBodyPhoto?: string | null;
  closetByCategory: Record<string, number>;
  addedId: string | null;
  onCustomize: () => void;
  onAdded: (garment: GarmentTemplate, size: string, color: string) => void;
  onAddLook: (look: GarmentTemplate[]) => void;
}): React.JSX.Element {
  const [modelOverride, setModelOverride] = useState<ModelView | null>(null);
  const [selectedColor, setSelectedColor] = useState(garment.colors[0] ?? 'BLANCO');
  const [hoverColor, setHoverColor] = useState<string | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [lookAdded, setLookAdded] = useState(false);
  const [quickSize, setQuickSize] = useState(
    garment.sizes.includes('M') ? 'M' : (garment.sizes[0] ?? 'M'),
  );
  const [quickAdded, setQuickAdded] = useState(false);
  const [lotOpen, setLotOpen] = useState(false);
  const mlProfile = useMlProfile();
  const mlRecommendation = mlProfile ? computeMlGarmentAffinity(mlProfile, garment) : null;
  const modelView = modelOverride ?? globalModelView;
  const previewColor = hoverColor ?? selectedColor;
  const previewHex = colorHexOf(previewColor);
  const look = completeTheLook(garment, catalog);
  const lookTotal = look.reduce((acc, g) => acc + g.baseSalePrice, 0);
  const matchCount = closetMatchCountFor(garment, closetByCategory, catalog);
  const prices = wholesalePrices(garment.baseSalePrice);
  const bottomPair = catalog.find((g) => g.visualVariant === 'CHINO') ?? null;
  const quickSizes = garment.sizes.filter((s) => ['S', 'M', 'L', 'XL'].includes(s));
  const sizeChoices = quickSizes.length > 0 ? quickSizes : garment.sizes.slice(0, 4);
  const CARD_VIEWS: { view: ModelView; label: string }[] = [
    { view: 'STUDIO', label: 'Prenda 3D' },
    { view: 'MODEL_SM', label: 'Modelo S/M' },
    { view: 'MODEL_LXL', label: 'Modelo L/XL' },
    { view: 'MY_BODY', label: 'En Mi Cuerpo' },
  ];

  useEffect(() => {
    if (!quickOpen) return;
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') setQuickOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [quickOpen]);

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-gum-line bg-white shadow-editorial">
      <div className="relative">
        <button
          type="button"
          onClick={() => setQuickOpen(true)}
          aria-label={`Vista rápida de ${garment.name}`}
          className="block w-full text-left"
        >
          <SwitchModelPreview
            garment={garment}
            view={modelView}
            hex={previewHex}
            myBodyPhoto={myBodyPhoto}
            bottomGarment={bottomPair}
          />
        </button>
        {/* Badges editoriales sobre la imagen */}
        <div className="pointer-events-none absolute left-2.5 top-2.5 z-[48] flex max-w-[85%] flex-wrap gap-1">
          <span className="rounded-full bg-gum-espresso/85 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur">
            {garment.recommendedRegions
              .map((r) => REGION_META[r].label)
              .slice(0, 2)
              .join(' · ')}
          </span>
          <span className="rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold text-gum-espresso">
            {garment.baseTimeMinutes} min en planta
          </span>
          <span className="rounded-full bg-gum-salvia/90 px-2 py-0.5 text-[10px] font-bold text-white">
            Combina con {matchCount}
          </span>
        </div>
        <div
          className="absolute inset-x-0 bottom-2.5 z-[48] flex justify-center px-2"
          role="group"
          aria-label="Vista de la prenda"
        >
          <span className="inline-flex flex-wrap justify-center gap-0.5 rounded-full bg-white/92 p-1 shadow backdrop-blur">
            {CARD_VIEWS.map((item) => (
              <button
                key={item.view}
                type="button"
                onClick={() => setModelOverride(item.view)}
                aria-pressed={modelView === item.view}
                className={`rounded-full px-2 py-1 text-[10px] font-bold transition ${
                  modelView === item.view
                    ? 'bg-gum-espresso text-white'
                    : 'text-stone-600 hover:text-gum-espresso'
                }`}
              >
                {item.label}
              </button>
            ))}
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <p className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
          <span>
            {CATEGORY_LABEL[garment.category]} · SKU {skuOf(garment)}
          </span>
          <span className="rounded-full bg-gum-linen px-2 py-0.5 text-[10px] font-bold normal-case tracking-normal text-gum-salvia">
            {fitOf(garment)}
          </span>
        </p>
        <h3 className="mt-1.5 font-display text-lg font-semibold leading-tight text-gum-espresso">
          {garment.name}
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-stone-600">
          {fabricCompositionOf(garment)}
        </p>
        <p className="mt-1 text-xs font-semibold text-gum-salvia">
          Costo por Uso {formatCpw(garment.baseSalePrice)} en 50 puestas
        </p>
        {mlRecommendation && (
          <p className="mt-1.5 inline-flex rounded-full bg-gum-espresso px-2.5 py-1 text-[11px] font-bold text-white">
            🤖 {mlRecommendation.affinityScorePct}% Match ML para ti · Talla sugerida: {mlRecommendation.recommendedSize}
          </p>
        )}
        <p className="mt-2 font-display text-xl font-bold text-gum-espresso">
          {isB2B ? (
            <>
              Desde ${prices.master.toFixed(2)}{' '}
              <span className="text-xs font-semibold text-gum-terracottadark">−20% mayorista</span>
            </>
          ) : (
            `$${garment.baseSalePrice.toFixed(2)}`
          )}
        </p>

        {/* Swatches de doble anillo: hover/clic cambia la prenda en vivo */}
        <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="Colores disponibles">
          {garment.colors.map((color) => {
            const active = selectedColor === color;
            return (
              <button
                key={color}
                type="button"
                title={prettyColor(color)}
                aria-label={`Color ${prettyColor(color)}`}
                aria-pressed={active}
                onMouseEnter={() => setHoverColor(color)}
                onMouseLeave={() => setHoverColor(null)}
                onFocus={() => setHoverColor(color)}
                onBlur={() => setHoverColor(null)}
                onClick={() => setSelectedColor(color)}
                className={`h-7 w-7 rounded-full border border-gum-line shadow-inner ring-2 ring-white transition ${
                  active
                    ? 'outline outline-2 outline-gum-terracotta'
                    : 'outline outline-1 outline-gum-line hover:outline-gum-terracotta'
                }`}
                style={{ backgroundColor: colorHexOf(color) }}
              />
            );
          })}
          <span className="text-xs font-semibold text-stone-600" aria-live="polite">
            {prettyColor(previewColor)}
          </span>
        </div>

        {!isB2B && (
          <div className="mt-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
              Talla rápida
            </span>
            <div className="mt-1.5 flex flex-wrap gap-1.5" role="group" aria-label="Talla rápida">
              {sizeChoices.map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => setQuickSize(size)}
                  aria-pressed={quickSize === size}
                  className={`min-h-9 min-w-10 rounded-full px-3 py-1.5 text-xs font-bold transition ${
                    quickSize === size
                      ? 'bg-gum-espresso text-white'
                      : 'border border-gum-line bg-white text-stone-700 hover:border-gum-espresso'
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>
        )}

        {isB2B && (
          <div className="mt-3 rounded-xl border border-gum-line bg-gum-alabaster p-3">
            <table className="w-full text-left text-xs" aria-label="Escalones mayoristas">
              <tbody className="divide-y divide-gum-line/70">
                <tr>
                  <td className="py-1">Base</td>
                  <td className="py-1 text-right font-semibold">${prices.normal.toFixed(2)}</td>
                </tr>
                <tr>
                  <td className="py-1">Lote 13–50 uds (−12%)</td>
                  <td className="py-1 text-right font-bold text-gum-terracottadark">
                    ${prices.lote.toFixed(2)}
                  </td>
                </tr>
                <tr>
                  <td className="py-1">Caja Master 51–160 uds (−20%)</td>
                  <td className="py-1 text-right font-bold text-gum-terracottadark">
                    ${prices.master.toFixed(2)}
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="mt-2 rounded-full bg-gum-espresso px-2.5 py-1 text-center text-[10px] font-bold uppercase tracking-wide text-white">
              Inicia producción con 50% de Anticipo
            </p>
            <button
              type="button"
              onClick={() => setLotOpen((v) => !v)}
              aria-expanded={lotOpen}
              className="mt-2 inline-flex min-h-10 w-full items-center justify-center rounded-full border border-gum-espresso px-3 py-2 text-xs font-bold text-gum-espresso transition hover:bg-gum-espresso hover:text-white"
            >
              {lotOpen ? 'Ocultar Matriz de Curva de Tallas' : 'Matriz de Curva de Tallas (S, M, L, XL)'}
            </button>
            {lotOpen && (
              <B2BLotCard
                garment={garment}
                onCustomize={onCustomize}
                color={selectedColor}
                onColorChange={setSelectedColor}
              />
            )}
          </div>
        )}

        <div className="mt-4 flex flex-col gap-2">
          {!isB2B && (
            <button
              type="button"
              onClick={() => {
                onAdded(garment, quickSize, selectedColor);
                setQuickAdded(true);
                window.setTimeout(() => setQuickAdded(false), 2200);
              }}
              className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold text-white transition ${
                quickAdded || addedId === garment.id
                  ? 'bg-green-700'
                  : 'bg-gum-espresso hover:bg-gum-salvia'
              }`}
            >
              {quickAdded || addedId === garment.id ? (
                <>
                  <Check className="h-4 w-4" aria-hidden /> En tu Caja · Talla {quickSize}
                </>
              ) : (
                <>
                  <PackagePlus className="h-4 w-4" aria-hidden /> Añadir a Caja · Talla {quickSize}
                </>
              )}
            </button>
          )}
          <span className="flex gap-2">
            <button
              type="button"
              onClick={onCustomize}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full bg-gum-terracotta px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gum-terracottadark"
            >
              <PenTool className="h-4 w-4" aria-hidden /> Personalizar en 3D
            </button>
            <button
              type="button"
              onClick={() => setQuickOpen(true)}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full border border-gum-espresso px-4 py-2.5 text-sm font-semibold text-gum-espresso transition hover:bg-gum-espresso hover:text-white"
            >
              Completa el Look
            </button>
          </span>
          {isB2B && (
            <button
              type="button"
              onClick={() => setQuickOpen(true)}
              className="inline-flex min-h-10 items-center justify-center rounded-full border border-gum-line px-4 py-2 text-xs font-bold text-stone-600 transition hover:border-gum-espresso"
            >
              Vista Rápida / Detalle completo
            </button>
          )}
        </div>
      </div>

      {quickOpen && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={`Vista rápida: ${garment.name}`}>
          <button type="button" aria-label="Cerrar vista rápida" onClick={() => setQuickOpen(false)} className="absolute inset-0 bg-gum-ink/60" />
          <aside className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col overflow-y-auto bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gum-ember">{CATEGORY_LABEL[garment.category]} · {fitOf(garment)}</p>
                <h3 className="font-display text-xl font-semibold leading-tight text-gum-ink">{garment.name}</h3>
                <p className="mt-1 font-display text-lg font-bold text-gum-ink">
                  {isB2B ? `Desde $${prices.master.toFixed(2)} (-20% mayorista)` : `$${garment.baseSalePrice.toFixed(2)}`}
                </p>
              </div>
              <button type="button" onClick={() => setQuickOpen(false)} aria-label="Cerrar" className="rounded-full bg-stone-100 p-2 text-stone-600">
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            <div className="mt-4">
              <SwitchModelPreview
                garment={garment}
                view={modelView}
                hex={previewHex}
                myBodyPhoto={myBodyPhoto}
                bottomGarment={bottomPair}
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label="Switch Model de la prenda">
              {MODEL_VIEW_ORDER.map((view) => (
                <button
                  key={view}
                  type="button"
                  onClick={() => setModelOverride(view)}
                  aria-pressed={modelView === view}
                  className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${modelView === view ? 'bg-gum-ink text-white' : 'bg-stone-100 text-stone-600'}`}
                >
                  {MODEL_VIEW_LABEL[view]}
                </button>
              ))}
            </div>

            <p className="mt-3 text-sm text-stone-600">{garment.description}</p>

            <dl className="mt-3 space-y-1.5 text-xs" aria-label="Especificaciones Fabric, Fit y Climate">
              <div className="flex justify-between gap-2 rounded-md bg-stone-100 px-3 py-2">
                <dt className="font-semibold text-stone-500">Composición</dt>
                <dd className="text-right font-semibold text-gum-ink">{fabricCompositionOf(garment)}</dd>
              </div>
              <div className="flex justify-between gap-2 rounded-md bg-stone-100 px-3 py-2">
                <dt className="font-semibold text-stone-500">Corte / Fit</dt>
                <dd className="font-semibold text-gum-ink">{fitOf(garment)}</dd>
              </div>
              <div className="flex justify-between gap-2 rounded-md bg-stone-100 px-3 py-2">
                <dt className="font-semibold text-stone-500">Tiempo en Planta Riobamba</dt>
                <dd className="font-semibold text-gum-ink">{garment.baseTimeMinutes} min / unidad</dd>
              </div>
              <div className="flex justify-between gap-2 rounded-md bg-stone-100 px-3 py-2">
                <dt className="font-semibold text-stone-500">Tallas</dt>
                <dd className="font-semibold text-gum-ink">{garment.sizes.join(' · ')}</dd>
              </div>
              <div className="flex justify-between gap-2 rounded-md bg-stone-100 px-3 py-2">
                <dt className="font-semibold text-stone-500">SKU</dt>
                <dd className="font-semibold text-gum-ink">{skuOf(garment)}</dd>
              </div>
              <div className="flex justify-between gap-2 rounded-md bg-stone-100 px-3 py-2">
                <dt className="font-semibold text-stone-500">Costo por Uso (50 puestas)</dt>
                <dd className="font-semibold text-gum-ink">{formatCpw(garment.baseSalePrice)}</dd>
              </div>
            </dl>

            <p className="mt-2 text-xs italic text-stone-500">{garment.climateNote}</p>

            <p className="mt-2 inline-flex w-fit items-center gap-1.5 rounded-full bg-gum-bone px-2.5 py-1 text-[11px] font-bold text-gum-ember" aria-label="Compatibilidad con tu clóset">
              <Sparkles className="h-3.5 w-3.5" aria-hidden /> Combina con {matchCount} prendas de tu Clóset Móvil
            </p>

            <div className="mt-4 rounded-lg border border-stone-200 bg-stone-50 p-3" role="region" aria-label="Completa el Look">
              <p className="text-xs font-bold text-gum-ink">Completa el Look ({look.length} prendas)</p>
              <ul className="mt-2 space-y-1.5">
                {look.map((item) => (
                  <li key={item.id} className="flex items-center gap-2 text-xs">
                    <span className="h-5 w-5 shrink-0 rounded-full border border-stone-300" style={{ backgroundColor: colorHexOf(item.colors[0] ?? 'BLANCO') }} aria-hidden />
                    <span className="flex-1 truncate font-semibold text-gum-ink">{item.name}</span>
                    <span className="font-bold text-stone-600">${item.baseSalePrice.toFixed(2)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs font-bold text-gum-ink">Look completo: ${lookTotal.toFixed(2)} ({look.length} prendas)</p>
              <button
                type="button"
                onClick={() => {
                  onAddLook(look);
                  setLookAdded(true);
                  window.setTimeout(() => setLookAdded(false), 2200);
                }}
                className={`mt-2 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white ${lookAdded ? 'bg-green-700' : 'bg-gum-ember'}`}
              >
                {lookAdded ? (
                  <><Check className="h-4 w-4" aria-hidden /> Look en tu Caja</>
                ) : (
                  <><PackagePlus className="h-4 w-4" aria-hidden /> Añadir Look Completo ({look.length} prendas) a mi Caja Gumorose</>
                )}
              </button>
            </div>

            {isB2B ? (
              <B2BLotCard garment={garment} onCustomize={onCustomize} color={selectedColor} onColorChange={setSelectedColor} />
            ) : (
              <B2CDirectCard garment={garment} onCustomize={onCustomize} addedId={addedId} onAdded={onAdded} color={selectedColor} />
            )}
          </aside>
        </div>
      )}
    </article>
  );
}

/**
 * Tienda E-Commerce por región climática: catálogo real del backend
 * con respaldo local si la API no responde.
 */
export function StorefrontView({ onCustomize }: StorefrontViewProps): React.JSX.Element {
  const { addLine, customerRole } = useBox();
  const isB2B = customerRole === 'CLIENTE_B2B';
  const [region, setRegion] = useState<RegionFilter>('TODAS');
  const [category, setCategory] = useState<CategoryFilter>('TODAS');
  const [items, setItems] = useState<GarmentTemplate[]>([]);
  const [fullCatalog, setFullCatalog] = useState<GarmentTemplate[]>(FALLBACK_CATALOG);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [addedId, setAddedId] = useState<string | null>(null);
  const [globalModelView, setGlobalModelView] = useState<ModelView>('STUDIO');
  const [myBodyPhoto, setMyBodyPhoto] = useState<string | null>(null);
  const [closetByCategory, setClosetByCategory] = useState<Record<string, number>>({});
  const [showcaseKey, setShowcaseKey] = useState<string | null>(null);
  const [variantFilter, setVariantFilter] = useState<string | null>(null);
  const [tryOnTrio, setTryOnTrio] = useState<GarmentTemplate[] | null>(null);
  const [tryOnIndex, setTryOnIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchCatalog({
      region: region === 'TODAS' ? undefined : region,
      category: category === 'TODAS' ? undefined : category,
    })
      .then((res) => {
        if (cancelled) return;
        setItems(res.items);
        setOffline(false);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setItems(filterFallback(region, category));
        setOffline(true);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [region, category]);

  /* Catálogo completo para hero, rail y curaduría (sin filtros). */
  useEffect(() => {
    let cancelled = false;
    fetchCatalog()
      .then((res) => {
        if (cancelled || res.items.length === 0) return;
        setFullCatalog(res.items);
      })
      .catch(() => {
        if (cancelled) return;
        setFullCatalog(FALLBACK_CATALOG);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /* Whering Match: clóset móvil sincronizado del mismo usuario demo. */
  useEffect(() => {
    let cancelled = false;
    fetchClosetProfile(DEMO_SUBJECT_USER_ID)
      .then((res) => {
        if (cancelled) return;
        setMyBodyPhoto(res.profile.fullBodyPhotoUrl ?? null);
        const counts: Record<string, number> = {};
        for (const [key, list] of Object.entries(res.byCategory)) counts[key] = list.length;
        setClosetByCategory(counts);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  function handleAddDirect(garment: GarmentTemplate, size: string, color: string): void {
    addLine({
      garmentId: garment.id,
      garmentName: garment.name,
      category: garment.category,
      baseSalePrice: garment.baseSalePrice,
      baseTimeMinutes: garment.baseTimeMinutes,
      size,
      color,
      quantity: 1,
      logosCount: 0,
    });
    setAddedId(garment.id);
    window.setTimeout(() => {
      setAddedId((current) => (current === garment.id ? null : current));
    }, 2200);
  }

  function handleAddLook(look: GarmentTemplate[]): void {
    for (const garment of look) {
      addLine({
        garmentId: garment.id,
        garmentName: garment.name,
        category: garment.category,
        baseSalePrice: garment.baseSalePrice,
        baseTimeMinutes: garment.baseTimeMinutes,
        size: garment.sizes.includes('M') ? 'M' : (garment.sizes[0] ?? 'M'),
        color: garment.colors[0] ?? 'BLANCO',
        quantity: 1,
        logosCount: 0,
      });
    }
  }

  function handleShowcaseSelect(def: CategoryShowcaseDef): void {
    setShowcaseKey(def.key);
    if (def.variant) {
      setVariantFilter(def.variant);
      setCategory('TODAS');
    } else if (def.key === 'TEES_POLOS') {
      setVariantFilter(null);
      setCategory('TODAS');
    } else if (def.category) {
      setVariantFilter(null);
      setCategory(def.category);
    }
    document.getElementById('catalogo')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function handleTryTrio(look: GarmentTemplate[]): void {
    setTryOnTrio(look);
    setTryOnIndex(0);
    window.setTimeout(() => {
      document.getElementById('probador-curaduria')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }

  const displayItems = items.filter((garment) => {
    if (variantFilter) return garment.visualVariant === variantFilter;
    if (showcaseKey === 'TEES_POLOS') {
      return garment.category === 'CAMISETA' || garment.category === 'POLO';
    }
    return true;
  });
  const tryOnGarment = tryOnTrio?.[tryOnIndex] ?? tryOnTrio?.[0] ?? null;
  const tryOnBottom =
    tryOnTrio?.find((g) => g.category === 'PANTALON' && g.id !== tryOnGarment?.id) ?? null;

  return (
    <div className="space-y-8">
      <p className="truncate rounded-full border border-gum-line bg-white px-4 py-2 text-center text-xs font-semibold text-stone-600" aria-label="Condiciones del perfil comercial">
        {isB2B
          ? 'Mayorista B2B · 13–160 uds · −12%/−20% · Anticipo 50/50'
          : 'Personal B2C · 1–12 uds · Pago 100% online'}
      </p>

      <div className="-mx-4 sm:mx-0">
        <HeroCatalogCarousel
          catalog={fullCatalog}
          closetByCategory={closetByCategory}
          onCustomize={onCustomize}
          onAddLook={handleAddLook}
          onAddSingle={(garment) =>
            handleAddDirect(
              garment,
              garment.sizes.includes('M') ? 'M' : (garment.sizes[0] ?? 'M'),
              garment.colors[0] ?? 'BLANCO',
            )
          }
        />
      </div>

      <CategoryShowcaseRail catalog={fullCatalog} activeKey={showcaseKey} onSelect={handleShowcaseSelect} />

      <CuratedEditBar
        catalog={fullCatalog}
        closetByCategory={closetByCategory}
        onCustomize={onCustomize}
        onAddLook={handleAddLook}
        onTryTrio={handleTryTrio}
      />

      {tryOnTrio && tryOnGarment && (
        <section
          id="probador-curaduria"
          aria-label="Probador en cuerpo real de tu selección curada"
          className="rounded-2xl border border-gum-line bg-gum-espresso p-4 text-white shadow-editorialLg sm:p-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gum-oro">
                Probador en Cuerpo Real
              </p>
              <h2 className="font-display text-2xl font-semibold">Tus 3 curadas, en tu cuerpo</h2>
              <p className="mt-1 max-w-lg text-sm text-stone-300">
                Zona facial libre 0–19.5%. Cambia de prenda con las miniaturas y combínala con el
                pantalón del trío en vivo.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setTryOnTrio(null)}
              className="rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-white/10"
            >
              Cerrar probador
            </button>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,340px)_1fr] md:items-start">
            <div className="mx-auto w-full max-w-[340px] overflow-hidden rounded-2xl bg-gum-linen">
              <AnatomicalSubjectStage
                subjectImage={myBodyPhoto ?? STUDIO_SUBJECTS[0]?.silhouetteUrl ?? ''}
                subjectLabel="En Mi Cuerpo"
                garment={tryOnGarment}
                fabricHex={colorHexOf(tryOnGarment.colors[0] ?? 'BLANCO')}
                view="FRONTAL"
                logos={[]}
                selectedUid={null}
                onSelect={() => undefined}
                onMove={() => undefined}
                bottomGarment={tryOnGarment.category === 'PANTALON' ? null : tryOnBottom}
                anchors={DEFAULT_BODY_ANCHORS}
                framing="FULL_BODY"
              />
            </div>
            <div>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Prendas del trío en el probador">
                {tryOnTrio.map((garment, index) => (
                  <button
                    key={garment.id}
                    type="button"
                    onClick={() => setTryOnIndex(index)}
                    aria-pressed={tryOnGarment.id === garment.id}
                    className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                      tryOnGarment.id === garment.id
                        ? 'bg-gum-terracotta text-white'
                        : 'border border-white/25 text-stone-200 hover:bg-white/10'
                    }`}
                  >
                    {garment.name}
                  </button>
                ))}
              </div>
              <p className="mt-3 font-display text-xl font-semibold">{tryOnGarment.name}</p>
              <p className="text-sm text-stone-300">
                {fabricCompositionOf(tryOnGarment)} · {fitOf(tryOnGarment)} ·{' '}
                {tryOnGarment.baseTimeMinutes} min en planta
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onCustomize(tryOnGarment)}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full bg-gum-terracotta px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-gum-terracottadark"
                >
                  <PenTool className="h-4 w-4" aria-hidden /> Personalizar en 3D
                </button>
                <button
                  type="button"
                  onClick={() => handleAddLook(tryOnTrio)}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/30 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
                >
                  <PackagePlus className="h-4 w-4" aria-hidden /> Añadir las 3 a mi Caja
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      <section aria-label="Selector de región">
        <div className="flex flex-wrap gap-2">
          {REGION_ORDER.map((key) => {
            const meta = REGION_META[key];
            const active = region === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setRegion(active ? 'TODAS' : key)}
                aria-pressed={active}
                title={meta.detalle}
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                  active ? 'border-gum-ink bg-gum-ink text-white' : 'border-stone-300 bg-white text-stone-700 hover:border-gum-ink'
                }`}
              >
                {REGION_ICON[key]}
                {meta.label}
                <span className={`text-xs font-medium ${active ? 'text-white/80' : 'text-stone-500'}`}>{meta.clima}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filtro por categoría">
          {(['TODAS', ...CATEGORY_ORDER] as CategoryFilter[]).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              aria-pressed={category === cat}
              className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
                category === cat ? 'border-gum-ink bg-gum-ink text-white' : 'border-stone-300 bg-white text-stone-700 hover:border-gum-ink'
              }`}
            >
              {cat === 'TODAS' ? 'Todas' : CATEGORY_LABEL[cat]}
            </button>
          ))}
        </div>
      </section>

      <p className="text-center text-xs text-stone-500">
        Hecho en Riobamba · Ahorra hasta 20% en tu Caja: 5% (6–12 uds) · 12% (13–50) · 20% (51–160)
      </p>

      <section id="catalogo" aria-label="Catálogo" className="scroll-mt-24">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gum-terracottadark">
              Catálogo Editorial
            </p>
            <h2 className="font-display text-3xl font-semibold text-gum-espresso">
              Catálogo {region !== 'TODAS' ? `· ${REGION_META[region].label}` : ''}
            </h2>
          </div>
          <span className="flex items-center gap-2">
            <span className="text-sm text-stone-500">
              {loading ? 'Cargando…' : `${displayItems.length} prenda(s)`}
            </span>
            {(showcaseKey || variantFilter) && (
              <button
                type="button"
                onClick={() => {
                  setShowcaseKey(null);
                  setVariantFilter(null);
                  setCategory('TODAS');
                }}
                className="rounded-full border border-gum-line bg-white px-3 py-1 text-xs font-bold text-gum-espresso transition hover:border-gum-espresso"
              >
                Limpiar colección
              </button>
            )}
          </span>
        </div>

        {/* Switch Model global (Abercrombie) */}
        <div className="mb-4 flex flex-wrap items-center gap-1.5 rounded-lg border border-stone-200 bg-white p-2" role="group" aria-label="Switch Model global">
          <span className="px-1 text-xs font-bold text-stone-600">Vista en cuerpo:</span>
          {MODEL_VIEW_ORDER.map((view) => (
            <button
              key={view}
              type="button"
              onClick={() => setGlobalModelView(view)}
              aria-pressed={globalModelView === view}
              className={`rounded-full px-3 py-1.5 text-xs font-bold ${globalModelView === view ? 'bg-gum-ink text-white' : 'bg-stone-100 text-stone-700'}`}
            >
              {MODEL_VIEW_LABEL[view]}
            </button>
          ))}
          <span className="text-[11px] text-stone-500">Cada tarjeta puede cambiar su modelo sin entrar al estudio.</span>
        </div>

        {offline && (
          <p className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">Sin conexión con la API: mostrando catálogo local de respaldo.</p>
        )}

        {loading ? (
          <p className="py-10 text-center text-stone-500">Cargando prendas del taller…</p>
        ) : displayItems.length === 0 ? (
          <p className="rounded-lg border border-dashed border-stone-300 py-10 text-center text-stone-500">No hay prendas para esta combinación de filtros.</p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {displayItems.map((garment) => (
              <GarmentCard
                key={garment.id}
                garment={garment}
                catalog={fullCatalog}
                isB2B={isB2B}
                globalModelView={globalModelView}
                myBodyPhoto={myBodyPhoto}
                closetByCategory={closetByCategory}
                addedId={addedId}
                onCustomize={() => onCustomize(garment)}
                onAdded={handleAddDirect}
                onAddLook={handleAddLook}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

