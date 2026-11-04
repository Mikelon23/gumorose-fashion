import React, { useEffect, useMemo, useState } from 'react';
import {
  Briefcase,
  Check,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  Loader2,
  Plus,
  RefreshCw,
  Shirt,
  Shuffle,
  Sparkles,
  X,
} from 'lucide-react';
import type { ClosetCategory, ClosetSourceType, EcuadorRegion, GarmentTemplate, UserClosetItem, WarmthLevel } from '@gumorose/shared';
import { calculateCostPerWear, DEFAULT_WEAR_COUNT, getClimateStylingRules } from '@gumorose/shared';
import { AnatomicalTryOnStage } from '../components/AnatomicalTryOnStage';
import { ClosetItemThumb3D } from '../components/engine3d/MobileGarmentThumb';
import { BottomSheet } from '../components/BottomSheet';
import { useClosetMobile } from '../context/ClosetMobileContext';
import { compressImageFileToDataUrl } from '../services/image';
import { fetchCatalog } from '../services/mobileApi';
import {
  CLOSET_LABEL,
  CLOSET_ORDER,
  SOURCE_LABEL,
  SOURCE_SHORT_LABEL,
  WARMTH_LABEL,
  closetCompositionOf,
  closetSummaryOf,
  colorDnaOf,
  colorHexOf,
  outfitHarmonyScore,
  packingGapFor,
  GALLERY_SEALS,
} from '../data/mobile';

interface MyClosetScreenProps {
  onTryOn: () => void;
}

type CategoryFilter = 'TODAS' | ClosetCategory;
type WarmthFilter = 'TODAS' | WarmthLevel;

const WARMTH_STYLE: Record<WarmthLevel, string> = {
  FRESCO: 'bg-sky-100 text-sky-900',
  TEMPLADO: 'bg-amber-100 text-amber-900',
  CALIDO: 'bg-red-100 text-red-800',
};

/** Pantalla 1: clóset virtual con filtros, digitalización y combo manual. */
export function MyClosetScreen({ onTryOn }: MyClosetScreenProps): React.JSX.Element {
  const {
    items,
    closetStatus,
    closetError,
    refreshCloset,
    saveClosetItem,
    setDraftCombo,
    profile,
    uploadPortrait,
    bodyAnchors,
    setBodyAnchors,
    wearCounts,
    registerWear,
    region,
    tempC,
    addLine,
  } = useClosetMobile();
  const [cpwPopId, setCpwPopId] = useState<string | null>(null);
  const [gapAdded, setGapAdded] = useState(false);

  const [category, setCategory] = useState<CategoryFilter>('TODAS');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [warmth, setWarmth] = useState<WarmthFilter>('TODAS');
  const [picked, setPicked] = useState<string[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  /** IDs vistos antes de la última sincronización (para detectar novedades). */
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set());
  const [freshIds, setFreshIds] = useState<string[]>([]);

  const plantUnlocked = useMemo(
    () => items.filter((item) => item.sourceType !== 'FOTO_PROPIA'),
    [items],
  );

  /** Prendas recién desbloqueadas por la última sincronización (arriba del todo). */
  const freshUnlocked = useMemo(
    () => plantUnlocked.filter((item) => freshIds.includes(item.id)),
    [plantUnlocked, freshIds],
  );

  async function handleSyncPlant(): Promise<void> {
    // Respuesta inmediata (<100 ms): el aviso aparece sin esperar al backend.
    const before = new Set(items.map((item) => item.id));
    setSyncing(true);
    setLastSync(`Sincronizando con Planta… ${new Date().toLocaleTimeString()}`);
    try {
      await refreshCloset();
    } finally {
      setSyncing(false);
    }
    // Al terminar se listan arriba las prendas recién desbloqueadas.
    setSeenIds((prev) => {
      const merged = new Set(prev);
      for (const id of before) merged.add(id);
      return merged;
    });
    setLastSync(new Date().toLocaleTimeString());
  }

  // Tras cada refresco, las prendas de planta nunca vistas son "recién desbloqueadas".
  useEffect(() => {
    setFreshIds(plantUnlocked.map((item) => item.id).filter((id) => !seenIds.has(id)));
  }, [plantUnlocked, seenIds]);

  /* Walk-In Closet: precios del catálogo para valorar el armario */
  const [priceById, setPriceById] = useState<Record<string, number>>({});
  const [catalogGarments, setCatalogGarments] = useState<GarmentTemplate[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchCatalog()
      .then((res) => {
        if (cancelled) return;
        const map: Record<string, number> = {};
        for (const g of res.items) map[g.id] = g.baseSalePrice;
        setPriceById(map);
        setCatalogGarments(res.items);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const closetStats = useMemo(() => {
    const byWarmth: Record<WarmthLevel, number> = { FRESCO: 0, TEMPLADO: 0, CALIDO: 0 };
    let value = 0;
    for (const item of items) {
      byWarmth[item.warmthLevel] += 1;
      if (item.garmentId && priceById[item.garmentId]) value += priceById[item.garmentId] ?? 0;
    }
    return { byWarmth, value };
  }, [items, priceById]);

  const palette = useMemo(
    () => [...new Set(items.map((item) => item.colorHex))].slice(0, 12),
    [items],
  );

  const pickedItems = useMemo(
    () => items.filter((item) => picked.includes(item.id)),
    [items, picked],
  );

  const detailItem = useMemo(
    () => items.find((item) => item.id === detailId) ?? null,
    [items, detailId],
  );

  /* Etapa 1: Dress-Me / CPW / Maleta */
  const [closetView, setClosetView] = useState<'PRENDAS' | 'COMBINAR' | 'MALETA_STATS'>('PRENDAS');
  const [packingDest, setPackingDest] = useState<EcuadorRegion>('COSTA');
  const [packingIds, setPackingIds] = useState<string[]>([]);
  const [packingMsg, setPackingMsg] = useState<string | null>(null);

  const FALLBACK_PRICE: Record<ClosetCategory, number> = {
    SUPERIOR_CAMISETA: 8.65,
    SUPERIOR_CAMISA: 16.71,
    INFERIOR_PANTALON: 18.85,
    ABRIGO: 24.9,
    ACCESORIO: 9.99,
  };

  function priceOf(item: UserClosetItem): number {
    if (item.purchasePriceUsd && item.purchasePriceUsd > 0) return item.purchasePriceUsd;
    if (item.garmentId && priceById[item.garmentId]) return priceById[item.garmentId] ?? FALLBACK_PRICE[item.category];
    return FALLBACK_PRICE[item.category];
  }

  function wearOf(item: UserClosetItem): number {
    return (item.wearCount ?? DEFAULT_WEAR_COUNT) + (wearCounts[item.id] ?? 0);
  }

  const armarioSummary = closetSummaryOf(
    items.map((item) => ({ priceUsd: priceOf(item), wears: wearOf(item) })),
  );
  const dressHarmony = outfitHarmonyScore(pickedItems, region, tempC);
  const colorDna = colorDnaOf(items);
  const packedItems = items.filter((item) => packingIds.includes(item.id));
  const packingGap = packingIds.length > 0 ? packingGapFor(packingDest, packedItems) : null;
  const gapGarment = packingGap
    ? (catalogGarments.find((g) => {
        if (packingGap.missingCategory === 'ABRIGO') return g.visualVariant === 'HOODIE';
        if (packingGap.missingCategory === 'ACCESORIO') return g.visualVariant === 'GORRA';
        if (packingGap.missingCategory === 'INFERIOR_PANTALON') return g.category === 'PANTALON';
        return false;
      }) ?? null)
    : null;

  function handleAddGapGarment(): void {
    if (!gapGarment) return;
    addLine({
      garmentId: gapGarment.id,
      garmentName: gapGarment.name,
      category: gapGarment.category,
      baseSalePrice: gapGarment.baseSalePrice,
      baseTimeMinutes: gapGarment.baseTimeMinutes,
      size: gapGarment.sizes.includes('M') ? 'M' : (gapGarment.sizes[0] ?? 'M'),
      color: gapGarment.colors[0] ?? 'BLANCO',
      quantity: 1,
      logosCount: 0,
    });
    setGapAdded(true);
    window.setTimeout(() => setGapAdded(false), 2200);
  }

  function pickExclusive(item: UserClosetItem): void {
    setPicked((prev) => {
      const sameGroup = (other: UserClosetItem): boolean => {
        if (item.category === 'SUPERIOR_CAMISETA' || item.category === 'SUPERIOR_CAMISA')
          return other.category === 'SUPERIOR_CAMISETA' || other.category === 'SUPERIOR_CAMISA';
        return other.category === item.category;
      };
      const kept = prev.filter((id) => {
        const found = items.find((i) => i.id === id);
        return found ? !sameGroup(found) : true;
      });
      return [...kept, item.id].slice(0, 4);
    });
  }

  function cycleRail(groupItems: UserClosetItem[], dir: 1 | -1): void {
    if (groupItems.length === 0) return;
    const currentId = groupItems.find((i) => picked.includes(i.id))?.id;
    const idx = currentId ? groupItems.findIndex((i) => i.id === currentId) : -1;
    const next = groupItems[(idx + dir + groupItems.length) % groupItems.length];
    if (next) pickExclusive(next);
  }

  function handleShuffleOutfit(): void {
    const rules = getClimateStylingRules(region, tempC);
    const coherent = (list: UserClosetItem[]): UserClosetItem[] => {
      const filtered = list.filter((i) => rules.warmthLevels.includes(i.warmthLevel));
      return filtered.length > 0 ? filtered : list;
    };
    const pickRandom = (list: UserClosetItem[]): UserClosetItem | undefined =>
      list.length ? list[Math.floor(Math.random() * list.length)] : undefined;
    const top = pickRandom(coherent(items.filter((i) => i.category === 'SUPERIOR_CAMISETA' || i.category === 'SUPERIOR_CAMISA')));
    const pants = pickRandom(coherent(items.filter((i) => i.category === 'INFERIOR_PANTALON')));
    const extra = pickRandom(coherent(items.filter((i) => i.category === 'ABRIGO' || i.category === 'ACCESORIO')));
    const next = [top, pants, extra].filter((x): x is UserClosetItem => Boolean(x)).map((x) => x.id);
    if (next.length > 0) setPicked(next);
  }

  function handlePacking(): void {
    const destTemp = packingDest === 'COSTA' ? 30 : packingDest === 'ORIENTE' ? 26 : 10;
    const rules = getClimateStylingRules(packingDest, destTemp);
    const scored = items
      .map((item) => {
        let score = 0;
        if (item.seasonTags?.includes(packingDest)) score += 3;
        if (rules.warmthLevels.includes(item.warmthLevel)) score += 2;
        if (rules.categories.includes(item.category)) score += 1;
        return { item, score };
      })
      .sort((a, b) => b.score - a.score);
    const chosen: UserClosetItem[] = [];
    const want: ClosetCategory[] = ['SUPERIOR_CAMISETA', 'INFERIOR_PANTALON', 'SUPERIOR_CAMISA', 'ACCESORIO'];
    for (const cat of want) {
      const found = scored.find((s) => s.item.category === cat && !chosen.includes(s.item));
      if (found) chosen.push(found.item);
    }
    for (const s of scored) {
      if (chosen.length >= 4) break;
      if (!chosen.includes(s.item)) chosen.push(s.item);
    }
    const ids = chosen.slice(0, 4).map((i) => i.id);
    setPackingIds(ids);
    setPackingMsg(
      ids.length
        ? `Maleta ${packingDest} 3 días: ${chosen.slice(0, 4).map((i) => i.name).join(' · ')}`
        : 'Digitaliza prendas para armar tu maleta.',
    );
  }

  async function handleFullBodyFile(file: File | undefined): Promise<void> {
    if (!file) return;
    try {
      const dataUrl = await compressImageFileToDataUrl(file);
      if (dataUrl) await uploadPortrait(dataUrl);
    } catch {
      /* el error de retrato se muestra en el Vestidor */
    }
  }

  const [showModal, setShowModal] = useState(false);
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState<ClosetCategory>('SUPERIOR_CAMISETA');
  const [formWarmth, setFormWarmth] = useState<WarmthLevel>('TEMPLADO');
  const [formColor, setFormColor] = useState('#B23A1D');
  const [formFile, setFormFile] = useState<File | null>(null);
  const [useSample, setUseSample] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      items.filter(
        (item) =>
          (category === 'TODAS' || item.category === category) &&
          (warmth === 'TODAS' || item.warmthLevel === warmth),
      ),
    [items, category, warmth],
  );

  function togglePick(id: string): void {
    setPicked((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 4) return prev;
      return [...prev, id];
    });
  }

  function handleTryCombo(): void {
    if (picked.length === 0) return;
    setDraftCombo(picked);
    onTryOn();
  }

  async function handleSaveGarment(): Promise<void> {
    setFormError(null);
    if (formName.trim().length === 0) {
      setFormError('Ponle un nombre a la prenda.');
      return;
    }
    setSaving(true);
    try {
      if (useSample) {
        const seal = GALLERY_SEALS[0];
        await saveClosetItem({
          category: formCategory,
          name: formName.trim(),
          colorHex: formColor,
          warmthLevel: formWarmth,
          sourceType: 'FOTO_PROPIA',
          imageCutoutUrl: seal ? seal.url : undefined,
        });
      } else if (formFile) {
        // Cualquier peso se optimiza en cliente (canvas) antes de subir.
        let dataUrl = '';
        try {
          dataUrl = await compressImageFileToDataUrl(formFile);
        } catch {
          dataUrl = '';
        }
        if (!dataUrl) {
          setFormError('No se pudo leer la foto.');
          setSaving(false);
          return;
        }
        await saveClosetItem({
          category: formCategory,
          name: formName.trim(),
          colorHex: formColor,
          warmthLevel: formWarmth,
          sourceType: 'FOTO_PROPIA' as ClosetSourceType,
          garmentCutoutBase64: dataUrl,
        });
      } else {
        setFormError('Sube una foto o usa la muestra rápida.');
        setSaving(false);
        return;
      }
      setShowModal(false);
      setFormName('');
      setFormFile(null);
      setUseSample(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'No se pudo guardar la prenda.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gum-terracottadark">
            Armario Inteligente
          </p>
          <h2 className="font-display text-2xl font-semibold text-gum-espresso">Mi Clóset</h2>
          <p className="text-xs text-stone-500">
            {profile ? `${items.length} prenda(s) guardadas` : 'Activa tu retrato para guardar prendas'}
          </p>
        </div>
      </div>

      {/* Segmented Control: Armario | Dress-Me | Maleta & CPW */}
      <div className="grid grid-cols-3 gap-1 rounded-full bg-gum-linen p-1" role="group" aria-label="Vistas de mi clóset">
        {(
          [
            { id: 'PRENDAS', label: 'Armario' },
            { id: 'COMBINAR', label: 'Dress-Me' },
            { id: 'MALETA_STATS', label: 'Maleta & CPW' },
          ] as const
        ).map((view) => (
          <button
            key={view.id}
            type="button"
            onClick={() => setClosetView(view.id)}
            aria-pressed={closetView === view.id}
            className={`min-h-10 rounded-full px-2 py-2 text-[11px] font-bold transition active:scale-95 ${
              closetView === view.id ? 'bg-gum-espresso text-white shadow-card' : 'text-stone-600'
            }`}
          >
            {view.label}
          </button>
        ))}
      </div>

      {/* Armario: resumen en 1 fila + riel de historias + sincronizar */}
      {closetView === 'PRENDAS' && (
        <>
          <div className="flex items-center gap-2" aria-label="Resumen del armario">
            <span className="flex-1 rounded-full bg-white px-3 py-2 text-center text-[11px] font-bold text-gum-espresso shadow-card">
              {armarioSummary.count} Prendas
            </span>
            <span className="flex-1 rounded-full bg-white px-3 py-2 text-center text-[11px] font-bold text-gum-espresso shadow-card">
              Valor ${armarioSummary.valueUsd.toFixed(0)}
            </span>
            <span className="flex-1 rounded-full bg-white px-3 py-2 text-center text-[11px] font-bold text-gum-salvia shadow-card">
              CPW ${armarioSummary.avgCpw.toFixed(2)}/uso
            </span>
            <button
              type="button"
              onClick={() => void handleSyncPlant()}
              disabled={syncing || closetStatus === 'loading'}
              className="flex min-h-10 shrink-0 items-center gap-1 rounded-full bg-gum-espresso px-3 py-2 text-[11px] font-bold text-white disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} aria-hidden />
              Sincronizar Planta
            </button>
          </div>
          {lastSync && (
            <p className="text-center text-[10px] text-stone-500" role="status">
              Sincronizado · {lastSync}
            </p>
          )}
          {items.length > 0 && (
            <div
              className="gum-no-scrollbar -mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1"
              aria-label="Historias de tu armario"
            >
              {[
                {
                  id: 'clima',
                  title: `Clima ${region} ${tempC}°C`,
                  sub: 'Tu capa ideal hoy',
                  item: items.find((i) => i.warmthLevel === (tempC < 15 ? 'CALIDO' : 'FRESCO')) ?? items[0],
                },
                {
                  id: 'cpw',
                  title: 'Mejor CPW',
                  sub: 'Tu inversión más eficiente',
                  item: [...items].sort(
                    (a, b) =>
                      calculateCostPerWear(priceOf(a), wearOf(a)) -
                      calculateCostPerWear(priceOf(b), wearOf(b)),
                  )[0],
                },
                {
                  id: 'usada',
                  title: 'Más usada',
                  sub: 'Tu favorita del mes',
                  item: [...items].sort((a, b) => wearOf(b) - wearOf(a))[0],
                },
                {
                  id: 'nueva',
                  title: 'Recién llegada',
                  sub: 'Directo de Riobamba',
                  item: freshUnlocked[0] ?? items[items.length - 1],
                },
              ].map((story) =>
                story.item ? (
                  <button
                    key={story.id}
                    type="button"
                    onClick={() => setDetailId(story.item!.id)}
                    className="w-28 shrink-0 snap-start rounded-2xl bg-white p-2 text-left shadow-card"
                  >
                    <span className="block aspect-square overflow-hidden rounded-xl bg-gum-alabaster">
                      {story.item.imageCutoutUrl ? (
                        <img src={story.item.imageCutoutUrl} alt="" className="h-full w-full object-contain p-1" />
                      ) : (
                        <span
                          className="flex h-full w-full items-center justify-center font-display text-xl font-bold text-white/90"
                          style={{ backgroundColor: colorHexOf(story.item.colorHex) }}
                        >
                          {story.item.name.slice(0, 1).toUpperCase()}
                        </span>
                      )}
                    </span>
                    <span className="mt-1 block truncate text-[11px] font-bold text-gum-espresso">
                      {story.title}
                    </span>
                    <span className="block truncate text-[10px] text-stone-500">{story.sub}</span>
                  </button>
                ) : null,
              )}
            </div>
          )}
          {freshUnlocked.length > 0 && (
            <p className="rounded-full bg-green-50 px-3 py-2 text-center text-[11px] font-bold text-green-800" role="status">
              {freshUnlocked.length} prenda(s) recién desbloqueadas desde planta
            </p>
          )}
        </>
      )}

      {/* Walk-In Closet: estadísticas, paleta y valor del armario (vista Maleta & Stats) */}
      {closetView === 'MALETA_STATS' && (
      <section
        className="rounded-3xl border border-white/70 bg-white/60 p-4 shadow-sm backdrop-blur"
        aria-label="Estadísticas de mi clóset"
      >
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="font-display text-sm font-bold text-gum-ink">Mi Walk-In Closet</h3>
          <p className="text-[11px] font-bold text-stone-600">
            {items.length} prendas · Valor estimado ${closetStats.value.toFixed(2)}
          </p>
        </div>
        <div className="mt-2 space-y-1" aria-label="Distribución por clima">
          {(Object.keys(closetStats.byWarmth) as WarmthLevel[]).map((level) => (
            <div key={level} className="flex items-center gap-2 text-[10px] font-bold text-stone-600">
              <span className="w-16 shrink-0">{WARMTH_LABEL[level]}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-stone-200">
                <span
                  className="block h-full rounded-full bg-gum-ember"
                  style={{ width: `${items.length ? (closetStats.byWarmth[level] / items.length) * 100 : 0}%` }}
                />
              </span>
              <span>{closetStats.byWarmth[level]}</span>
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-1" aria-label="Paleta de colores del armario">
          <span className="mr-1 text-[10px] font-bold text-stone-500">Paleta:</span>
          {palette.length === 0 && <span className="text-[10px] text-stone-400">sin prendas aún</span>}
          {palette.map((hex) => (
            <span
              key={hex}
              className="h-5 w-5 rounded-full border border-white shadow"
              style={{ backgroundColor: hex }}
              title={hex}
            />
          ))}
        </div>
        {colorDna.length > 0 && (
          <div className="mt-3" aria-label="ADN de color del armario">
            <p className="text-[10px] font-bold uppercase tracking-wide text-stone-500">
              ADN de Color del Armario
            </p>
            <div className="mt-1.5 flex h-3 overflow-hidden rounded-full bg-gum-linen">
              {colorDna.map((entry) => (
                <span
                  key={entry.hex}
                  style={{ backgroundColor: entry.hex, width: `${entry.pct}%` }}
                  title={`${entry.hex} · ${entry.pct}%`}
                />
              ))}
            </div>
            <p className="mt-1 truncate text-[10px] text-stone-500">
              {colorDna
                .slice(0, 4)
                .map((e) => `${e.pct}%`)
                .join(' · ')}{' '}
              de tu armario
            </p>
          </div>
        )}
      </section>
      )}

      {/* Combinar (Dress-Me): escenario arriba + rieles abajo (vista Combinar) */}
      {closetView === 'COMBINAR' && (
      <section
        className="rounded-3xl border border-gum-line bg-white p-4 shadow-card"
        aria-label="Tu sujeto rápido anatómico en vivo"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-display text-base font-bold text-gum-espresso">Dress-Me en tu cuerpo</h3>
            <p className="text-[11px] text-stone-500">
              En vivo con tu clóset, sin API Key. Rostro libre (0–19.5%).
            </p>
          </div>
          <span
            className="shrink-0 rounded-full bg-gum-salvia px-2.5 py-1 text-[11px] font-bold text-white"
            aria-label={`Armonía de color y clima ${dressHarmony} por ciento`}
          >
            {dressHarmony}% Match
          </span>
        </div>
        <div className="mt-2">
          <AnatomicalTryOnStage
            photoUrl={profile?.fullBodyPhotoUrl}
            items={pickedItems}
            anchors={bodyAnchors}
            onAnchorsChange={setBodyAnchors}
            onRequestFullBody={() => document.getElementById('full-body-upload-closet')?.click()}
          />
          <input
            id="full-body-upload-closet"
            type="file"
            accept="image/*"
            className="hidden"
            aria-label="Subir foto de cuerpo entero"
            onChange={(e) => {
              void handleFullBodyFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button type="button" onClick={handleShuffleOutfit} disabled={items.length === 0} className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-gum-espresso px-3 py-3 text-sm font-bold text-white disabled:opacity-50">
            <Shuffle className="h-5 w-5" aria-hidden /> Ruleta (Shuffle)
          </button>
          <button
            type="button"
            onClick={handleTryCombo}
            disabled={picked.length === 0}
            className="min-h-12 rounded-full bg-gum-terracotta px-3 py-3 text-xs font-bold text-white disabled:opacity-50"
          >
            Ver en Probador Realista ({picked.length})
          </button>
        </div>
        <p className="mt-1 text-center text-[10px] text-stone-400">Clima {region} {tempC}°C · Armonía {dressHarmony}% · Calibrar abre hombros/cintura.</p>

          <div className="mt-3 space-y-3" aria-label="Rieles Dress-Me estilo Whering">
            {(
              [
                { label: 'Superior', list: items.filter((i) => i.category === 'SUPERIOR_CAMISETA' || i.category === 'SUPERIOR_CAMISA') },
                { label: 'Pantalón', list: items.filter((i) => i.category === 'INFERIOR_PANTALON') },
                { label: 'Abrigo / Accesorio', list: items.filter((i) => i.category === 'ABRIGO' || i.category === 'ACCESORIO') },
              ] as { label: string; list: UserClosetItem[] }[]
            ).map((rail) => (
              <div key={rail.label}>
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-bold text-stone-600">{rail.label}</p>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => cycleRail(rail.list, -1)} disabled={rail.list.length === 0} aria-label={`Anterior en ${rail.label}`} className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-100 disabled:opacity-40">
                      <ChevronLeft className="h-4 w-4" aria-hidden />
                    </button>
                    <button type="button" onClick={() => cycleRail(rail.list, 1)} disabled={rail.list.length === 0} aria-label={`Siguiente en ${rail.label}`} className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-100 disabled:opacity-40">
                      <ChevronRight className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                </div>
                <div className="mt-1 flex gap-2 overflow-x-auto pb-1">
                  {rail.list.length === 0 && <p className="text-[11px] text-stone-400">Sin prendas en este riel.</p>}
                  {rail.list.map((item) => (
                    <button key={item.id} type="button" onClick={() => pickExclusive(item)} aria-pressed={picked.includes(item.id)} className={`w-20 shrink-0 overflow-hidden rounded-2xl border-2 bg-white text-left ${picked.includes(item.id) ? 'border-gum-ember' : 'border-stone-200'}`}>
                      <span className="block aspect-square w-full bg-[#FAF7F2]">
                        {item.imageCutoutUrl ? (
                          <img src={item.imageCutoutUrl} alt={item.name} className="h-full w-full object-contain p-1" />
                        ) : (
                          <ClosetItemThumb3D item={item} />
                        )}
                      </span>
                      <span className="block truncate px-1.5 py-1 text-[9px] font-bold text-gum-ink">{item.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
      </section>
      )}

      {/* Maleta & Stats: generador de maleta (vista Maleta & Stats) */}
      {closetView === 'MALETA_STATS' && (
        <div className="rounded-2xl border border-stone-200 bg-white p-3" aria-label="Armar maleta de viaje">
          <p className="flex items-center gap-1.5 text-xs font-bold text-gum-ink">
            <Briefcase className="h-4 w-4 text-gum-ember" aria-hidden /> 🧳 Armar Maleta de Viaje (Acloset Packing)
          </p>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {(['COSTA', 'SIERRA', 'ORIENTE'] as EcuadorRegion[]).map((dest) => (
              <button key={dest} type="button" onClick={() => setPackingDest(dest)} aria-pressed={packingDest === dest} className={`min-h-10 rounded-xl px-2 py-2 text-[11px] font-bold ${packingDest === dest ? 'bg-gum-ember text-white' : 'bg-stone-100 text-stone-700'}`}>
                {dest === 'COSTA' ? 'Costa' : dest === 'SIERRA' ? 'Sierra' : 'Oriente'} 3 días
              </button>
            ))}
          </div>
          <button type="button" onClick={handlePacking} className="mt-2 min-h-11 w-full rounded-xl bg-gum-ink px-3 py-2.5 text-xs font-bold text-white">
            Generar maleta con 4 prendas de mi clóset
          </button>
          {packingMsg && <p className="mt-1.5 text-[11px] text-stone-600" role="status">{packingMsg}</p>}
          {packedItems.length > 0 && (
            <div className="mt-2 flex gap-2 overflow-x-auto pb-1" aria-label="Cápsula de maleta">
              {packedItems.map((item) => (
                <span key={item.id} className="w-20 shrink-0 overflow-hidden rounded-2xl border border-gum-line bg-gum-alabaster text-left">
                  <span className="block aspect-square w-full bg-[#FAF7F2]">
                    {item.imageCutoutUrl ? (
                      <img src={item.imageCutoutUrl} alt={item.name} className="h-full w-full object-contain p-1" />
                    ) : (
                      <ClosetItemThumb3D item={item} />
                    )}
                  </span>
                  <span className="block truncate px-1.5 py-1 text-[9px] font-bold text-gum-espresso">{item.name}</span>
                </span>
              ))}
            </div>
          )}
          {packingGap && (
            <div className="mt-2 rounded-2xl bg-gum-linen p-3" role="status">
              <p className="text-xs font-bold text-gum-espresso">{packingGap.message}</p>
              {gapGarment ? (
                <button
                  type="button"
                  onClick={handleAddGapGarment}
                  className={`mt-2 min-h-11 w-full rounded-full px-3 py-2 text-xs font-bold text-white ${gapAdded ? 'bg-green-700' : 'bg-gum-terracotta'}`}
                >
                  {gapAdded
                    ? 'En tu Caja Gumorose'
                    : `Completar con ${gapGarment.name} ($${gapGarment.baseSalePrice.toFixed(2)})`}
                </button>
              ) : (
                <p className="mt-1 text-[11px] text-stone-500">Digitaliza esa prenda para completar tu maleta.</p>
              )}
            </div>
          )}
          {packingIds.length > 0 && !packingGap && (
            <p className="mt-2 rounded-full bg-green-50 px-3 py-2 text-center text-[11px] font-bold text-green-800" role="status">
              Maleta completa: tu cápsula está lista.
            </p>
          )}
          {packingIds.length > 0 && (
            <button type="button" onClick={() => { setPicked(packingIds); setClosetView('COMBINAR'); }} className="mt-1 min-h-10 w-full rounded-xl border border-gum-ember px-3 py-2 text-xs font-bold text-gum-ember">
              Vestir esta maleta en mi Sujeto Rápido
            </button>
          )}
        </div>
      )}

      {/* Filtros de Prendas (vista Prendas) */}
      {closetView === 'PRENDAS' && (
      <>
      <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filtro por categoría">
        {(['TODAS', ...CLOSET_ORDER] as CategoryFilter[]).map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setCategory(cat)}
            aria-pressed={category === cat}
            className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold ${
              category === cat ? 'bg-gum-ink text-white' : 'bg-stone-100 text-stone-700'
            }`}
          >
            {cat === 'TODAS' ? 'Todas' : CLOSET_LABEL[cat]}
          </button>
        ))}
      </div>
      <div className="flex gap-2" role="group" aria-label="Filtro por nivel térmico">
        {(['TODAS', 'FRESCO', 'TEMPLADO', 'CALIDO'] as WarmthFilter[]).map((w) => (
          <button
            key={w}
            type="button"
            onClick={() => setWarmth(w)}
            aria-pressed={warmth === w}
            className={`flex-1 rounded-full px-3 py-2 text-xs font-semibold ${
              warmth === w ? 'bg-gum-ember text-white' : 'bg-stone-100 text-stone-700'
            }`}
          >
            {w === 'TODAS' ? 'Todo clima' : WARMTH_LABEL[w]}
          </button>
        ))}
      </div>
      </>
      )}

      {/* Estado */}
      {closetStatus === 'loading' && items.length === 0 && (
        <p className="py-6 text-center text-sm text-stone-500">Abriendo tu armario…</p>
      )}
      {closetError && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
          {closetError}{' '}
          <button type="button" onClick={() => void refreshCloset()} className="underline">
            Reintentar
          </button>
        </div>
      )}

      {/* Grid Acloset minimalista (vista Prendas): tap abre el detalle */}
      {closetView === 'PRENDAS' &&
        (filtered.length === 0 && closetStatus !== 'loading' ? (
          <div className="rounded-xl border border-dashed border-stone-300 bg-white px-4 py-10 text-center">
            <Shirt className="mx-auto h-8 w-8 text-stone-300" aria-hidden />
            <p className="mt-2 text-sm text-stone-500">
              Nada por aquí. Digitaliza tu primera prenda con la cámara.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filtered.map((item) => {
              const selected = picked.includes(item.id);
              const price = priceOf(item);
              const wears = wearOf(item);
              const cpw = calculateCostPerWear(price, wears);
              return (
                <article
                  key={item.id}
                  className={`overflow-hidden rounded-3xl bg-white text-left shadow-card ${
                    selected ? 'ring-2 ring-gum-terracotta' : 'ring-1 ring-gum-line'
                  }`}
                >
                  <button type="button" onClick={() => setDetailId(item.id)} aria-pressed={selected} aria-label={`Ver detalle de ${item.name}`} className="block w-full text-left">
                <div className="relative aspect-square w-full bg-gum-alabaster">
                  {item.imageCutoutUrl ? (
                    <img
                      src={item.imageCutoutUrl}
                      alt={item.name}
                      className="h-full w-full object-contain p-2"
                    />
                  ) : (
                    <ClosetItemThumb3D item={item} />
                  )}
                  {selected && (
                    <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-gum-ember text-white">
                      <Check className="h-4 w-4" aria-hidden />
                    </span>
                  )}
                </div>
                <div className="p-2.5">
                  <p className="truncate text-sm font-semibold text-gum-espresso">{item.name}</p>
                  <p className="truncate text-[10px] font-semibold text-stone-500">
                    {SOURCE_SHORT_LABEL[item.sourceType] ?? item.sourceType} · {CLOSET_LABEL[item.category]}
                  </p>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span
                      className="h-3.5 w-3.5 rounded-full ring-1 ring-gum-line"
                      title={item.colorHex}
                      style={{ backgroundColor: colorHexOf(item.colorHex) }}
                    />
                    <span className="rounded-full bg-gum-linen px-2 py-0.5 text-[10px] font-bold text-gum-salvia">
                      ${cpw.toFixed(2)}/uso
                    </span>
                    <span className="text-[10px] text-stone-400">{wears} usos</span>
                  </div>
                </div>
                  </button>
                </article>
              );
            })}
          </div>
        ))}

      {/* Detalle de prenda: Bottom Sheet limpio con OOTD en vivo */}
      <BottomSheet
        open={closetView === 'PRENDAS' && detailItem !== null}
        title={detailItem?.name ?? 'Detalle de prenda'}
        onClose={() => setDetailId(null)}
      >
        {detailItem && (
          <div>
            <div className="mt-1 aspect-[4/3] overflow-hidden rounded-2xl bg-gum-alabaster">
              {detailItem.imageCutoutUrl ? (
                <img src={detailItem.imageCutoutUrl} alt={detailItem.name} className="h-full w-full object-contain p-3" />
              ) : (
                <ClosetItemThumb3D item={detailItem} />
              )}
            </div>
            <p className="mt-2 text-[11px] text-stone-500">
              {SOURCE_LABEL[detailItem.sourceType] ?? detailItem.sourceType} · {CLOSET_LABEL[detailItem.category]}
            </p>
            <p className="mt-1 text-sm text-stone-600">{closetCompositionOf(detailItem)}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="h-5 w-5 rounded-full ring-1 ring-gum-line" style={{ backgroundColor: colorHexOf(detailItem.colorHex) }} title={detailItem.colorHex} />
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${WARMTH_STYLE[detailItem.warmthLevel]}`}>{WARMTH_LABEL[detailItem.warmthLevel]}</span>
              <span
                className={`rounded-full bg-gum-linen px-2 py-0.5 text-[10px] font-bold text-gum-salvia ${cpwPopId === detailItem.id ? 'gum-cpw-pop' : ''}`}
                aria-live="polite"
              >
                ${calculateCostPerWear(priceOf(detailItem), wearOf(detailItem)).toFixed(2)}/uso
              </span>
            </div>
            <p className="mt-2 text-[11px] text-stone-600">
              Precio estimado <span className="font-bold text-gum-espresso">${priceOf(detailItem).toFixed(2)}</span> · {wearOf(detailItem)} usos registrados
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  registerWear(detailItem.id);
                  setCpwPopId(detailItem.id);
                  window.setTimeout(() => setCpwPopId(null), 350);
                }}
                className="flex min-h-12 items-center justify-center gap-1 rounded-full bg-gum-espresso px-2 py-2 text-[11px] font-bold text-white"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden /> + Registrar Uso Hoy (OOTD)
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraftCombo([detailItem.id]);
                  setDetailId(null);
                  onTryOn();
                }}
                className="min-h-12 rounded-full bg-gum-terracotta px-2 py-2 text-[11px] font-bold text-white"
              >
                Probarme esta prenda ahora
              </button>
            </div>
          </div>
        )}
      </BottomSheet>

      {/* FAB Digitalizar Prenda (vista Armario) */}
      {closetView === 'PRENDAS' && (
        <button
          type="button"
          onClick={() => setShowModal(true)}
          aria-label="Digitalizar prenda"
          className="sticky bottom-24 ml-auto flex h-14 items-center gap-2 rounded-full bg-gum-terracotta px-4 text-sm font-bold text-white shadow-cardLg"
        >
          <Plus className="h-5 w-5" aria-hidden /> Digitalizar Prenda
        </button>
      )}

      {/* Combinación manual */}
      {picked.length > 0 && (
        <div className="sticky bottom-20 rounded-xl bg-gum-ink p-4 text-white shadow-lg">
          <p className="text-sm font-semibold">
            {picked.length} prenda(s) elegida(s) para probarte
          </p>
          <button
            type="button"
            onClick={handleTryCombo}
            className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-gum-gold px-4 py-2.5 text-sm font-bold text-gum-ink"
          >
            <Sparkles className="h-4 w-4" aria-hidden />
            Probarme esta combinación en mi Foto Real
          </button>
          <button
            type="button"
            onClick={() => setPicked([])}
            className="mt-1 w-full py-1 text-center text-xs text-stone-300 underline"
          >
            Limpiar selección
          </button>
        </div>
      )}

      {/* Modal digitalizar */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Digitalizar prenda"
        >
          <div className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold text-gum-ink">
                Digitalizar prenda
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                aria-label="Cerrar"
                className="rounded-full bg-stone-100 p-2 text-stone-600"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <label className="block rounded-xl border-2 border-dashed border-stone-300 px-4 py-5 text-center text-sm font-semibold text-stone-600">
                <ImagePlus className="mx-auto mb-1 h-6 w-6 text-gum-ember" aria-hidden />
                {formFile ? formFile.name : 'Tomar foto / subir imagen'}
                <input
                  type="file"
                  accept="image/*"
                  className="mt-2 w-full text-xs"
                  onChange={(e) => {
                    setFormFile(e.target.files?.[0] ?? null);
                    setUseSample(false);
                  }}
                />
              </label>
              <button
                type="button"
                onClick={() => {
                  setUseSample((v) => !v);
                  setFormFile(null);
                }}
                aria-pressed={useSample}
                className={`w-full rounded-xl border px-4 py-2.5 text-sm font-semibold ${
                  useSample ? 'border-gum-ember bg-gum-bone text-gum-ember' : 'border-stone-300 text-stone-600'
                }`}
              >
                {useSample ? '✓ Usando muestra rápida Gumorose' : 'O usar muestra rápida'}
              </button>
              <label className="block text-sm font-medium text-stone-600">
                Nombre
                <input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Ej. Camiseta azul de entreno"
                  maxLength={120}
                  className="mt-1 min-h-11 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-sm font-medium text-stone-600">
                  Categoría
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value as ClosetCategory)}
                    className="mt-1 min-h-11 w-full rounded-xl border border-stone-300 px-2 py-2 text-sm"
                  >
                    {CLOSET_ORDER.map((c) => (
                      <option key={c} value={c}>
                        {CLOSET_LABEL[c]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-medium text-stone-600">
                  Nivel térmico
                  <select
                    value={formWarmth}
                    onChange={(e) => setFormWarmth(e.target.value as WarmthLevel)}
                    className="mt-1 min-h-11 w-full rounded-xl border border-stone-300 px-2 py-2 text-sm"
                  >
                    {(['FRESCO', 'TEMPLADO', 'CALIDO'] as WarmthLevel[]).map((w) => (
                      <option key={w} value={w}>
                        {WARMTH_LABEL[w]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm text-stone-600">
                Color base
                <input
                  type="color"
                  value={/^#[0-9A-Fa-f]{6}$/.test(formColor) ? formColor : '#B23A1D'}
                  onChange={(e) => setFormColor(e.target.value)}
                  className="h-10 w-14 rounded border border-stone-300"
                />
                <span className="font-mono text-xs">{formColor}</span>
              </label>
              {formError && <p className="text-sm text-red-700">{formError}</p>}
              <button
                type="button"
                onClick={() => void handleSaveGarment()}
                disabled={saving}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gum-ember px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                {saving ? 'Recortando con SAM 3.1…' : 'Guardar en mi clóset'}
              </button>
              <p className="text-center text-[11px] text-stone-400">
                SAM 3.1 recorta tu prenda automáticamente al guardarla.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
