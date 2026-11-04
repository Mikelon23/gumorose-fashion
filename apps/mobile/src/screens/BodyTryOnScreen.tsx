import React, { useEffect, useState } from 'react';
import {
  Camera,
  Check,
  Heart,
  ImagePlus,
  Loader2,
  RefreshCw,
  Shirt,
  ShoppingBag,
  X,
} from 'lucide-react';
import type { GarmentTemplate, UserClosetItem } from '@gumorose/shared';

/** Pasos visibles del escaneo biométrico por capas. */
const SCAN_STEPS = [
  '1. Segmentando silueta con Meta SAM 3.1',
  '2. Ajustando caída textil y logos',
  '3. Renderizando iluminación con Muse Wonder',
] as const;
import { AnatomicalTryOnStage } from '../components/AnatomicalTryOnStage';
import { useClosetMobile } from '../context/ClosetMobileContext';
import { fetchCatalog } from '../services/mobileApi';
import { compressImageFileToDataUrl } from '../services/image';
import { DEMO_PORTRAITS, colorHexOf } from '../data/mobile';

interface BodyTryOnScreenProps {
  onGoStylist: () => void;
}

/** Pantalla 3: comparador Antes/Después protagonista + secundarios en Bottom Sheet. */
export function BodyTryOnScreen({ onGoStylist }: BodyTryOnScreenProps): React.JSX.Element {
  const {
    profile,
    items,
    outfits,
    uploadPortrait,
    portraitStatus,
    portraitError,
    selectedOutfitId,
    setSelectedOutfitId,
    draftCombo,
    lastTryon,
    tryonStatus,
    tryonError,
    runTryon,
    favorites,
    toggleFavorite,
    addLine,
    bodyAnchors,
    setBodyAnchors,
  } = useClosetMobile();

  const [catalog, setCatalog] = useState<GarmentTemplate[]>([]);
  const [buyMessage, setBuyMessage] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  /** Escaneo IA por capas (0 = inactivo, 1..3 = paso visible). */
  const [scanStep, setScanStep] = useState(0);
  /** Cortina Antes/Después sobre la foto del usuario (0..100). */
  const [curtain, setCurtain] = useState(55);
  /** Cortina del comparador anatómico en vivo (0..100). */
  const [anatomicalCurtain, setAnatomicalCurtain] = useState(55);
  /** Bottom Sheet con foto, selector de look y acciones. */
  const [sheetOpen, setSheetOpen] = useState(false);
  /** Edición in-place: tinte de color y talla sobre la prenda en escena. */
  const [tintByItem, setTintByItem] = useState<Record<string, string>>({});
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [activeSize, setActiveSize] = useState('M');

  /** Vestirme con IA mostrando el escaneo biométrico por capas. */
  async function handleTryonWithScan(outfitId: string): Promise<void> {
    setScanStep(1);
    const t2 = window.setTimeout(() => setScanStep(2), 650);
    const t3 = window.setTimeout(() => setScanStep(3), 1300);
    try {
      await runTryon(outfitId);
    } finally {
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      window.setTimeout(() => setScanStep(0), 350);
    }
  }

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

  useEffect(() => {
    if (!selectedOutfitId && outfits.length > 0) {
      const first = outfits[0];
      if (first) setSelectedOutfitId(first.id);
    }
  }, [outfits, selectedOutfitId, setSelectedOutfitId]);

  const draftItems: UserClosetItem[] = draftCombo.flatMap((id) => {
    const found = items.find((i) => i.id === id);
    return found ? [found] : [];
  });
  const selectedOutfit = outfits.find((o) => o.id === selectedOutfitId) ?? null;
  const selectedOutfitItems: UserClosetItem[] = selectedOutfit
    ? selectedOutfit.itemsIds.flatMap((id) => {
        const found = items.find((i) => i.id === id);
        return found ? [found] : [];
      })
    : [];
  const anatomicalItems = draftItems.length > 0 ? draftItems : selectedOutfitItems;
  const isFav = selectedOutfit ? favorites.includes(selectedOutfit.id) : false;
  /** Prendas con el tinte in-place aplicado (color en vivo sobre la foto). */
  const tintedItems: UserClosetItem[] = anatomicalItems.map((item) =>
    tintByItem[item.id] ? { ...item, colorHex: tintByItem[item.id] as string } : item,
  );
  const activeItem =
    tintedItems.find((i) => i.id === activeItemId) ?? tintedItems[0] ?? null;
  const activeGarment = activeItem?.garmentId
    ? (catalog.find((g) => g.id === activeItem.garmentId) ?? null)
    : null;
  const telemetryLabel = lastTryon
    ? lastTryon.cached
      ? 'CACHE HIT ($0.00)'
      : 'MUSE WONDER + SAM 3.1'
    : 'MUSE WONDER + SAM 3.1';

  async function handlePhotoFile(file: File | undefined): Promise<void> {
    setPhotoError(null);
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setPhotoError('El archivo debe ser una imagen.');
      return;
    }
    // Cualquier peso se optimiza en cliente (canvas) antes de subir.
    try {
      const dataUrl = await compressImageFileToDataUrl(file);
      if (dataUrl) await uploadPortrait(dataUrl);
    } catch {
      setPhotoError('No se pudo leer la foto.');
    }
  }

  function handleBuyLook(): void {
    setBuyMessage(null);
    if (!selectedOutfit) {
      setBuyMessage('Elige primero un outfit sugerido.');
      return;
    }
    const garmentIds = selectedOutfit.itemsIds.flatMap((id) => {
      const item = items.find((i) => i.id === id);
      return item?.garmentId ? [item.garmentId] : [];
    });
    if (garmentIds.length === 0) {
      setBuyMessage('Este look no incluye prendas Gumorose comprables todavía.');
      return;
    }
    let added = 0;
    for (const garmentId of garmentIds) {
      const garment = catalog.find((g) => g.id === garmentId);
      if (!garment) continue;
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
      added += 1;
    }
    setBuyMessage(
      added > 0 ? `${added} prenda(s) de este look en tu Caja In-App.` : 'No se encontró la prenda en el catálogo.',
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gum-terracottadark">
          Probador Virtual
        </p>
        <h2 className="font-display text-2xl font-semibold text-gum-espresso">Probador en mi foto</h2>
        <p className="text-xs text-stone-500">Antes / Después sobre tu foto. Rostro libre 0–19.5%.</p>
      </div>

      {/* Comparador Antes/Después protagonista absoluto */}
      <section className="rounded-3xl bg-white p-3 shadow-card ring-1 ring-gum-line" aria-label="Comparador antes y después">
        <p className="text-[11px] font-bold text-stone-500">
          ANTES / DESPUÉS · hombros {bodyAnchors.shoulderTopPct}% · cintura {bodyAnchors.waistTopPct}%
        </p>
        <div className="relative mt-2 aspect-[9/16] max-h-[560px] w-full overflow-hidden rounded-xl bg-stone-100">
          {profile?.fullBodyPhotoUrl ? (
            <img src={profile.fullBodyPhotoUrl} alt="Antes: mi foto real sin el look" className="absolute inset-0 h-full w-full object-cover object-top" />
          ) : (
            <span className="flex h-full items-center justify-center p-3 text-center text-[11px] text-stone-400">
              Sube tu foto (completa o de medio cuerpo) para comparar
            </span>
          )}
          <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 ${100 - anatomicalCurtain}% 0 0)` }}>
            <AnatomicalTryOnStage
              bare
              photoUrl={profile?.fullBodyPhotoUrl}
              items={tintedItems}
              anchors={bodyAnchors}
              onAnchorsChange={setBodyAnchors}
            />
          </div>
          <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold text-white">ANTES</span>
          <span className="absolute right-2 top-2 rounded-full bg-gum-terracotta px-2 py-0.5 text-[10px] font-bold text-white">DESPUÉS · ANATÓMICO</span>
          <span className="absolute left-1/2 top-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-gum-espresso/80 px-2 py-0.5 text-[9px] font-bold text-white">
            {telemetryLabel}
          </span>
          <span className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow" style={{ left: `${anatomicalCurtain}%` }} aria-hidden />
        </div>
        <label className="mt-2 flex items-center gap-2 text-[11px] font-bold text-stone-600">
          Desliza Antes / Después
          <input type="range" min={0} max={100} value={anatomicalCurtain} onChange={(e) => setAnatomicalCurtain(Number(e.target.value))} className="flex-1" aria-label="Comparador anatómico antes y después" />
          <span>{anatomicalCurtain}%</span>
        </label>
        <p className="mt-1 text-[10px] text-stone-400">
          {anatomicalItems.length
            ? `${anatomicalItems.length} prenda(s) alineadas sobre hombros y piernas (medio cuerpo auto-extendido si aplica).`
            : 'Elige un outfit o tu combinación manual para vestir el lado Después.'}
        </p>

        {/* Controles rápidos in-place: color y talla sin salir del probador */}
        {activeItem && (
          <div className="mt-3 rounded-2xl bg-gum-alabaster p-3" aria-label="Color y talla en vivo">
            <div className="gum-no-scrollbar flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Prenda en escena">
              {tintedItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveItemId(item.id)}
                  aria-pressed={activeItem.id === item.id}
                  className={`shrink-0 truncate rounded-full px-3 py-1.5 text-[11px] font-bold ${
                    activeItem.id === item.id
                      ? 'bg-gum-espresso text-white'
                      : 'bg-white text-stone-600 ring-1 ring-gum-line'
                  }`}
                >
                  {item.name}
                </button>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5" aria-label="Colores en vivo">
              {(activeGarment?.colors ?? []).map((color) => {
                const hex = colorHexOf(color);
                const active = (tintByItem[activeItem.id] ?? activeItem.colorHex).toUpperCase() === hex.toUpperCase();
                return (
                  <button
                    key={color}
                    type="button"
                    title={color}
                    aria-label={`Color ${color}`}
                    aria-pressed={active}
                    onClick={() => setTintByItem((prev) => ({ ...prev, [activeItem.id]: hex }))}
                    className={`h-8 w-8 rounded-full ring-2 ring-white transition ${
                      active ? 'outline outline-2 outline-gum-terracotta' : 'outline outline-1 outline-gum-line'
                    }`}
                    style={{ backgroundColor: hex }}
                  />
                );
              })}
              {(!activeGarment || activeGarment.colors.length === 0) && (
                <span className="text-[11px] text-stone-500">Color de tu clóset: {activeItem.colorHex}</span>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5" role="group" aria-label="Talla en vivo">
              <span className="text-[11px] font-bold text-stone-600">Talla</span>
              {(activeGarment?.sizes ?? ['S', 'M', 'L', 'XL']).map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => setActiveSize(size)}
                  aria-pressed={activeSize === size}
                  className={`min-h-9 min-w-10 rounded-full px-2.5 py-1.5 text-[11px] font-bold ${
                    activeSize === size
                      ? 'bg-gum-terracotta text-white'
                      : 'bg-white text-stone-600 ring-1 ring-gum-line'
                  }`}
                >
                  {size}
                </button>
              ))}
              <span className="text-[10px] text-stone-400">Talla {activeSize} en escena</span>
            </div>
          </div>
        )}
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => selectedOutfitId && void handleTryonWithScan(selectedOutfitId)}
            disabled={!selectedOutfitId || tryonStatus === 'loading'}
            className="flex min-h-12 items-center justify-center gap-1.5 rounded-full bg-gum-terracotta px-3 py-2.5 text-xs font-bold text-white disabled:opacity-50"
          >
            {tryonStatus === 'loading' ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Shirt className="h-4 w-4" aria-hidden />
            )}
            Vestirme con IA
          </button>
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            aria-expanded={sheetOpen}
            className="flex min-h-12 items-center justify-center gap-1.5 rounded-full border border-gum-espresso px-3 py-2.5 text-xs font-bold text-gum-espresso"
          >
            <Camera className="h-4 w-4" aria-hidden /> Mi Foto / Calibrar Cuerpo
          </button>
        </div>
        <div className="mt-2 flex items-center justify-center">
          {lastTryon ? (
            <span
              className={`rounded-full px-3 py-1 text-[11px] font-bold ${
                lastTryon.cached ? 'bg-green-100 text-green-800' : 'bg-gum-bone text-gum-ember'
              }`}
            >
              {lastTryon.cached ? 'CACHE HIT · $0.00 API cost' : 'NEW INFERENCE'}
            </span>
          ) : (
            <span className="rounded-full bg-stone-100 px-3 py-1 text-[11px] font-semibold text-stone-500">
              Aún sin inferencia
            </span>
          )}
        </div>
      </section>

      {/* Bottom Sheet: retrato, selector, escaneo y acciones */}
      {sheetOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" role="dialog" aria-modal="true" aria-label="Foto, look y acciones">
          <div className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-gum-ink">Foto, look y acciones</h3>
              <button type="button" onClick={() => setSheetOpen(false)} aria-label="Cerrar" className="rounded-full bg-stone-100 p-2 text-stone-600">
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            <section className="mt-3" aria-label="Retrato base">
              <div className="flex gap-3">
                <div className="h-28 w-20 shrink-0 overflow-hidden rounded-xl bg-stone-100">
                  {profile?.fullBodyPhotoUrl ? (
                    <img src={profile.fullBodyPhotoUrl} alt="Retrato de cuerpo completo" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-stone-300">
                      <Camera className="h-8 w-8" aria-hidden />
                    </span>
                  )}
                </div>
                <div className="flex-1 text-xs">
                  <p className="font-bold text-gum-ink">Retrato base de cuerpo completo</p>
                  {profile?.bodySegmentationMaskUrl ? (
                    <p className="mt-1 inline-block rounded-full bg-green-100 px-2 py-0.5 font-bold text-green-800">
                      Máscara SAM 3.1 lista
                    </p>
                  ) : (
                    <p className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 font-bold text-amber-900">
                      Sin máscara corporal
                    </p>
                  )}
                  <p className="mt-1 text-stone-500">
                    {profile ? `${profile.city} · ${profile.currentRegion}` : 'Sube tu foto para activar el vestidor'}
                  </p>
                  {portraitStatus === 'loading' && (
                    <p className="mt-1 flex items-center gap-1 text-stone-500">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Segmentando…
                    </p>
                  )}
                  {portraitError && <p className="mt-1 text-red-700">{portraitError}</p>}
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <label className="flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-gum-ink px-3 py-2.5 text-xs font-bold text-white">
                  <ImagePlus className="h-4 w-4" aria-hidden /> Subir / actualizar foto
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      void handlePhotoFile(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                </label>
                <div className="flex gap-1.5">
                  {DEMO_PORTRAITS.map((demo) => (
                    <button
                      key={demo.name}
                      type="button"
                      title={demo.name}
                      onClick={() => void uploadPortrait(demo.url)}
                      className="h-11 flex-1 overflow-hidden rounded-xl border border-stone-300"
                    >
                      <img src={demo.url} alt={demo.name} className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
              {photoError && <p className="mt-1 text-xs text-red-700">{photoError}</p>}
              <p className="mt-1 text-[11px] text-stone-400">
                O toca un retrato demo para probar el flujo del hackathon.
              </p>
            </section>

            <div className="mt-3">
              <AnatomicalTryOnStage
                photoUrl={profile?.fullBodyPhotoUrl}
                items={tintedItems}
                anchors={bodyAnchors}
                onAnchorsChange={setBodyAnchors}
              />
            </div>

            {scanStep > 0 && (
              <div className="mt-3 rounded-xl bg-gum-ink px-4 py-3 text-white" role="status" aria-live="polite">
                <p className="flex items-center gap-2 text-xs font-bold">
                  <RefreshCw className="h-4 w-4 animate-spin text-gum-gold" aria-hidden />
                  Escaneando tu silueta…
                </p>
                <ol className="mt-2 space-y-1 text-[11px]">
                  {SCAN_STEPS.map((step, index) => (
                    <li
                      key={step}
                      className={index + 1 <= scanStep ? 'font-bold text-gum-gold' : 'text-stone-400'}
                    >
                      {step}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {lastTryon && profile?.fullBodyPhotoUrl && (
              <div className="mt-3" aria-label="Comparador IA antes y después">
                <div className="relative aspect-[3/5] overflow-hidden rounded-xl bg-stone-100">
                  <img src={profile.fullBodyPhotoUrl} alt="Antes: mi foto real" className="h-full w-full object-cover" />
                  <div
                    className="absolute inset-0 overflow-hidden"
                    style={{ clipPath: `inset(0 ${100 - curtain}% 0 0)` }}
                  >
                    <img
                      src={lastTryon.tryonImageUrl}
                      alt="Después: vistiendo el look con IA"
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold text-white">
                    ANTES
                  </span>
                  <span className="absolute right-2 top-2 rounded-full bg-gum-ember px-2 py-0.5 text-[10px] font-bold text-white">
                    DESPUÉS · SAM 3.1 + Muse Wonder
                  </span>
                  <span
                    className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow"
                    style={{ left: `${curtain}%` }}
                    aria-hidden
                  />
                </div>
                <label className="mt-2 flex items-center gap-2 text-[11px] font-bold text-stone-600">
                  Desliza Antes / Después
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={curtain}
                    onChange={(e) => setCurtain(Number(e.target.value))}
                    className="flex-1"
                    aria-label="Comparador antes y después"
                  />
                  <span>{curtain}%</span>
                </label>
              </div>
            )}

            <div className="mt-3 space-y-1.5" role="group" aria-label="Outfit para vestir">
              {outfits.length === 0 && (
                <p className="text-xs text-stone-500">
                  Genera combinaciones en el Estilista para vestirlas aquí.
                </p>
              )}
              {outfits.map((outfit) => (
                <button
                  key={outfit.id}
                  type="button"
                  onClick={() => setSelectedOutfitId(outfit.id)}
                  aria-pressed={selectedOutfitId === outfit.id}
                  className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-xs ${
                    selectedOutfitId === outfit.id ? 'border-gum-ember bg-gum-bone' : 'border-stone-200'
                  }`}
                >
                  <Shirt className="h-4 w-4 shrink-0 text-gum-ember" aria-hidden />
                  <span className="flex-1 truncate font-medium text-gum-ink">
                    {outfit.itemsIds.length} prendas · {outfit.weatherTempC}°C
                  </span>
                  {favorites.includes(outfit.id) && (
                    <Heart className="h-4 w-4 fill-gum-ember text-gum-ember" aria-hidden />
                  )}
                </button>
              ))}
            </div>

            {draftItems.length > 0 && (
              <button
                type="button"
                onClick={onGoStylist}
                className="mt-2 w-full rounded-xl bg-stone-100 px-3 py-2.5 text-xs font-bold text-stone-700"
              >
                Generar outfits con mi combinación manual ({draftItems.length})
              </button>
            )}

            {tryonError && <p className="mt-2 text-xs text-red-700">{tryonError}</p>}

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => selectedOutfitId && void handleTryonWithScan(selectedOutfitId)}
                disabled={!selectedOutfitId || tryonStatus === 'loading'}
                className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-gum-ember px-3 py-2.5 text-xs font-bold text-white disabled:opacity-50"
              >
                {tryonStatus === 'loading' ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Shirt className="h-4 w-4" aria-hidden />
                )}
                Vestirme con IA (SAM 3.1 + Muse Wonder)
              </button>
              <button
                type="button"
                onClick={() => selectedOutfitId && void handleTryonWithScan(selectedOutfitId)}
                disabled={!selectedOutfitId || tryonStatus === 'loading'}
                className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-stone-300 px-3 py-2.5 text-xs font-bold text-stone-700 disabled:opacity-50"
              >
                <RefreshCw className="h-4 w-4" aria-hidden /> Repetir (caché)
              </button>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => selectedOutfitId && toggleFavorite(selectedOutfitId)}
                disabled={!selectedOutfitId}
                className={`flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-bold disabled:opacity-50 ${
                  isFav ? 'bg-gum-ember text-white' : 'border border-stone-300 text-stone-700'
                }`}
              >
                {isFav ? <Check className="h-4 w-4" aria-hidden /> : <Heart className="h-4 w-4" aria-hidden />}
                {isFav ? 'Favorito ✓' : 'Guardar favorito'}
              </button>
              <button
                type="button"
                onClick={handleBuyLook}
                className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-gum-ink px-3 py-2.5 text-xs font-bold text-white"
              >
                <ShoppingBag className="h-4 w-4" aria-hidden /> Comprar este look
              </button>
            </div>
            {buyMessage && <p className="mt-2 text-xs text-stone-600">{buyMessage}</p>}

            {draftItems.length > 0 && (
              <div className="mt-3 rounded-xl bg-stone-50 p-3">
                <p className="text-[11px] font-bold text-stone-500">MI COMBINACIÓN MANUAL</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {draftItems.map((item) => (
                    <span
                      key={item.id}
                      className="inline-flex items-center gap-1.5 rounded-full bg-white py-1 pl-1 pr-2.5 text-[11px] font-medium text-stone-700 shadow-sm"
                    >
                      {item.imageCutoutUrl ? (
                        <img src={item.imageCutoutUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
                      ) : (
                        <span
                          className="h-6 w-6 rounded-full border border-stone-200"
                          style={{ backgroundColor: colorHexOf(item.colorHex) }}
                        />
                      )}
                      {item.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
