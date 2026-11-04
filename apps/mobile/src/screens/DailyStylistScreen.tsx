import React, { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, MapPin, ShoppingBag, Sparkles, Thermometer, ThumbsDown, ThumbsUp } from 'lucide-react';
import type { EcuadorRegion, GarmentTemplate } from '@gumorose/shared';
import { getClimateStylingRules, topStyleTag } from '@gumorose/shared';
import { useClosetMobile } from '../context/ClosetMobileContext';
import { fetchCatalog } from '../services/mobileApi';
import { CITY_PRESETS, GARMENT_TO_CLOSET, REGION_SHORT_LABEL, colorHexOf } from '../data/mobile';

interface DailyStylistScreenProps {
  onTryOn: (outfitId: string) => void;
}

/** Pantalla 2: Outfits del Día para tu Clima + Style Shuffle (una tarjeta). */
export function DailyStylistScreen({ onTryOn }: DailyStylistScreenProps): React.JSX.Element {
  const {
    region,
    setRegion,
    city,
    setCity,
    tempC,
    setTempC,
    loadDailyOutfits,
    stylistStatus,
    stylistError,
    lastRules,
    lastProvider,
    outfits,
    items,
    addLine,
    styleVotes,
    addStyleVote,
    styleDna,
  } = useClosetMobile();

  const [catalog, setCatalog] = useState<GarmentTemplate[]>([]);
  const [addedId, setAddedId] = useState<string | null>(null);
  const [shuffleIndex, setShuffleIndex] = useState(0);
  const [stylistMode, setStylistMode] = useState<'LOOKS' | 'SHUFFLE'>('LOOKS');

  const STYLE_TAGS = ['Urbano Andino', 'Ejecutivo Sastre', 'Deportivo', 'Casual'] as const;

  function styleTagForGarment(garment: GarmentTemplate, index: number): string {
    if (garment.category === 'CAMISA') return 'Ejecutivo Sastre';
    if (garment.category === 'PANTALON') return 'Ejecutivo Sastre';
    return STYLE_TAGS[index % STYLE_TAGS.length] ?? 'Urbano Andino';
  }

  function dnaAffinityFor(outfitItemCount: number, reco: GarmentTemplate | null): number {
    const dominant = topStyleTag(styleDna);
    let score = 76 + outfitItemCount * 4;
    if (reco && dominant && styleTagForGarment(reco, 0) === dominant) score += 8;
    return Math.min(97, score);
  }

  const shuffleCards = useMemo(() => {
    if (catalog.length > 0)
      return catalog.map((g, i) => ({
        itemId: g.id,
        name: g.name,
        styleTag: styleTagForGarment(g, i),
        price: g.baseSalePrice,
        colorHex: colorHexOf(g.colors[0] ?? 'GRIS'),
      }));
    return items.map((item, i) => ({
      itemId: item.id,
      name: item.name,
      styleTag: STYLE_TAGS[i % STYLE_TAGS.length] ?? 'Urbano Andino',
      price: 0,
      colorHex: colorHexOf(item.colorHex),
    }));
  }, [catalog, items]);

  const shuffleCard = shuffleCards.length ? shuffleCards[shuffleIndex % shuffleCards.length] : undefined;
  const dnaEntries = useMemo(
    () => Object.entries(styleDna).sort((a, b) => b[1] - a[1]),
    [styleDna],
  );

  function handleShuffleVote(liked: boolean): void {
    if (!shuffleCard) return;
    addStyleVote({
      itemId: shuffleCard.itemId,
      liked,
      styleTag: shuffleCard.styleTag,
      timestamp: new Date().toISOString(),
    });
    setShuffleIndex((i) => i + 1);
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

  const liveRules = getClimateStylingRules(region, tempC);
  const rules = lastRules ?? liveRules;

  function applyPreset(presetCity: string, presetRegion: EcuadorRegion, presetTemp: number): void {
    setCity(presetCity);
    setRegion(presetRegion);
    setTempC(presetTemp);
  }

  function resolveOutfitItems(ids: string[]): { id: string; name: string; colorHex: string }[] {
    return ids.map((id) => {
      const found = items.find((i) => i.id === id);
      return {
        id,
        name: found ? found.name : 'Prenda del clóset',
        colorHex: found ? found.colorHex : '#D6D3D1',
      };
    });
  }

  function recommendFor(outfitItemIds: string[]): GarmentTemplate | null {
    const used = new Set(
      outfitItemIds.flatMap((id) => {
        const found = items.find((i) => i.id === id);
        return found ? [found.category] : [];
      }),
    );
    const candidates = catalog.filter((g) => !used.has(GARMENT_TO_CLOSET[g.category]));
    const dominant = topStyleTag(styleDna);
    if (dominant) {
      const affinity = candidates.find((g, i) => styleTagForGarment(g, i) === dominant);
      if (affinity) return affinity;
    }
    return candidates[0] ?? catalog[0] ?? null;
  }

  function handleAddToBox(garment: GarmentTemplate): void {
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
    setAddedId(garment.id);
    window.setTimeout(() => {
      setAddedId((current) => (current === garment.id ? null : current));
    }, 2000);
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gum-terracottadark">
          Estilista IA · Alta Daily
        </p>
        <h2 className="font-display text-2xl font-semibold text-gum-espresso">Estilista IA</h2>
        <p className="text-xs text-stone-500">Curaduría diaria por clima y tu ADN de estilo.</p>
      </div>

      <div className="grid grid-cols-2 gap-1 rounded-full bg-gum-linen p-1" role="group" aria-label="Modo del estilista">
        {(
          [
            { id: 'LOOKS', label: 'Looks del Día' },
            { id: 'SHUFFLE', label: 'Style Shuffle' },
          ] as const
        ).map((mode) => (
          <button
            key={mode.id}
            type="button"
            onClick={() => setStylistMode(mode.id)}
            aria-pressed={stylistMode === mode.id}
            className={`min-h-10 rounded-full px-2 py-2 text-[11px] font-bold transition active:scale-95 ${
              stylistMode === mode.id ? 'bg-gum-espresso text-white shadow-card' : 'text-stone-600'
            }`}
          >
            {mode.label}
          </button>
        ))}
      </div>

      {stylistMode === 'LOOKS' && (
      <>
      {/* Clima: selector de ciudad y temperatura */}
      <section className="rounded-3xl bg-gum-espresso p-4 text-white shadow-card" aria-label="Clima actual">
        <div className="flex items-center gap-2 text-sm">
          <MapPin className="h-4 w-4 text-gum-gold" aria-hidden />
          <span className="font-semibold">
            {REGION_SHORT_LABEL[region]} · {city}
          </span>
          <span className="ml-auto flex items-center gap-1 font-display text-2xl font-bold">
            <Thermometer className="h-5 w-5 text-gum-gold" aria-hidden />
            {tempC}°C
          </span>
        </div>
        <div className="gum-no-scrollbar mt-3 flex gap-1.5 overflow-x-auto pb-1">
          {CITY_PRESETS.map((p) => {
            const active = city === p.city && region === p.region;
            return (
              <button
                key={p.city}
                type="button"
                onClick={() => applyPreset(p.city, p.region, p.tempC)}
                aria-pressed={active}
                className={`min-w-[5.5rem] shrink-0 rounded-full px-3 py-2 text-center text-xs font-semibold transition ${
                  active ? 'bg-gum-terracotta text-white' : 'bg-white/10 text-white'
                }`}
              >
                {p.city} {p.tempC}°C
              </button>
            );
          })}
        </div>
        <label className="mt-3 block text-xs font-medium text-stone-300">
          Ajustar temperatura ({tempC}°C)
          <input
            type="range"
            min={-10}
            max={45}
            step={1}
            value={tempC}
            onChange={(e) => setTempC(Number(e.target.value))}
            className="mt-1 w-full"
            aria-label="Temperatura en grados Celsius"
          />
        </label>
      </section>

      {/* Regla climática en 1 línea */}
      <p className="truncate rounded-full bg-white px-3 py-2 text-center text-[11px] font-semibold text-gum-salvia shadow-card" aria-label="Regla climática activa">
        {rules.region} {rules.tempC}°C · {rules.warmthLevels.join(' + ')} · {rules.advice}
      </p>

      <button
        type="button"
        onClick={() => void loadDailyOutfits(3)}
        disabled={stylistStatus === 'loading'}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gum-ember px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
      >
        {stylistStatus === 'loading' ? (
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        ) : (
          <Sparkles className="h-5 w-5" aria-hidden />
        )}
        {stylistStatus === 'loading' ? 'Consultando a Muse Spark…' : 'Generar Combinaciones del Día con Meta Muse Spark'}
      </button>
      {stylistError && <p className="text-sm text-red-700">{stylistError}</p>}

      {/* Outfit Cover: carrusel editorial Alta Daily */}
      <div className="gum-no-scrollbar -mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1">
        {outfits.length === 0 && stylistStatus !== 'loading' && (
          <p className="w-full shrink-0 rounded-3xl border border-dashed border-gum-line bg-white px-4 py-6 text-center text-sm text-stone-500">
            Aún no hay combinaciones. Genera las del día para tu clima actual.
          </p>
        )}
        {outfits.map((outfit, index) => {
          const parts = resolveOutfitItems(outfit.itemsIds);
          const reco = recommendFor(outfit.itemsIds);
          const affinity = dnaAffinityFor(parts.length, reco);
          return (
            <article key={outfit.id} className="w-[86%] shrink-0 snap-center rounded-3xl bg-white p-4 shadow-card ring-1 ring-gum-line">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-base font-semibold text-gum-espresso">
                  Look {index + 1} · {outfit.regionContext} {outfit.weatherTempC}°C
                </h3>
                <span className="shrink-0 rounded-full bg-gum-salvia px-2 py-0.5 text-[10px] font-bold text-white">
                  {affinity}% ADN
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {parts.map((p) => (
                  <span
                    key={p.id}
                    className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 py-1 pl-1 pr-2.5 text-xs font-medium text-stone-700"
                  >
                    <span
                      className="h-5 w-5 rounded-full border border-stone-300"
                      style={{ backgroundColor: colorHexOf(p.colorHex) }}
                    />
                    {p.name}
                  </span>
                ))}
              </div>
              <p className="mt-2 text-xs italic leading-relaxed text-stone-600">
                “{outfit.aiStylistNotes}”
              </p>
              {reco && (
                <div className="mt-2 rounded-2xl bg-gum-linen p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">
                    Fill the Gap · Gumorose
                  </p>
                  <p className="text-xs font-bold text-gum-espresso">
                    {reco.name} · eleva este look
                  </p>
                  <button
                    type="button"
                    onClick={() => handleAddToBox(reco)}
                    className={`mt-1.5 inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold text-white ${
                      addedId === reco.id ? 'bg-green-700' : 'bg-gum-terracotta'
                    }`}
                  >
                    {addedId === reco.id ? (
                      <>
                        <Check className="h-3.5 w-3.5" aria-hidden /> En tu Caja
                      </>
                    ) : (
                      <>
                        <ShoppingBag className="h-3.5 w-3.5" aria-hidden /> Añadir Prenda Sugerida
                        (${reco.baseSalePrice.toFixed(2)})
                      </>
                    )}
                  </button>
                </div>
              )}
              <button
                type="button"
                onClick={() => onTryOn(outfit.id)}
                className="mt-2 min-h-12 w-full rounded-full bg-gum-espresso px-4 py-2.5 text-sm font-bold text-white"
              >
                Vestir en mi Foto
              </button>
            </article>
          );
        })}
      </div>
      </>
      )}

      {stylistMode === 'SHUFFLE' && (

      <section className="rounded-3xl bg-white p-4 shadow-card ring-1 ring-gum-line" aria-label="Gumorose Style Shuffle">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display text-base font-bold text-gum-espresso">Style Shuffle</h3>
          <span className="text-[10px] font-bold text-stone-400">{styleVotes.length} voto(s) · 1 seg por voto</span>
        </div>
        <p className="mt-0.5 text-[11px] text-stone-500">
          Una sola tarjeta grande: vota en 1 segundo y entrena tu IA sin formularios.
        </p>
        {shuffleCard ? (
          <div className="mt-3">
            <div
              className="flex aspect-[4/3] items-center justify-center rounded-3xl bg-gum-alabaster"
              style={{ backgroundColor: shuffleCard.colorHex }}
            >
              <span className="font-display text-6xl font-bold text-white/90 drop-shadow">
                {shuffleCard.name.slice(0, 1).toUpperCase()}
              </span>
            </div>
            <p className="mt-3 text-center font-display text-lg font-bold text-gum-espresso">
              {shuffleCard.name}
            </p>
            <p className="text-center text-xs font-semibold text-gum-terracottadark">
              {shuffleCard.styleTag}
              {shuffleCard.price > 0 ? ` · $${shuffleCard.price.toFixed(2)} en Gumorose` : ''}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => handleShuffleVote(false)} aria-label="Pasar" className="flex min-h-14 items-center justify-center gap-1.5 rounded-full border border-gum-line bg-white px-3 py-2.5 text-sm font-bold text-stone-700 active:scale-95">
                <ThumbsDown className="h-5 w-5" aria-hidden /> Pasar
              </button>
              <button type="button" onClick={() => handleShuffleVote(true)} aria-label="Me encanta" className="flex min-h-14 items-center justify-center gap-1.5 rounded-full bg-gum-terracotta px-3 py-2.5 text-sm font-bold text-white active:scale-95">
                <ThumbsUp className="h-5 w-5" aria-hidden /> Me Encanta
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-xs text-stone-500">Cargando estilos… digitaliza prendas o espera el catálogo.</p>
        )}
        <div className="mt-3" aria-label="Mi ADN de estilo personal">
          <p className="text-[11px] font-bold text-stone-600">ADN de estilo</p>
          {dnaEntries.length === 0 ? (
            <p className="mt-1 text-[11px] text-stone-400">Aún sin votos: vota para descubrir tu mezcla de estilo.</p>
          ) : (
            <div className="mt-1 space-y-1">
              {dnaEntries.map(([tag, pct]) => (
                <div key={tag} className="flex items-center gap-2 text-[10px] font-bold text-stone-600">
                  <span className="w-36 shrink-0 truncate">{pct}% {tag}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-stone-200">
                    <span className="block h-full rounded-full bg-gum-ember" style={{ width: `${pct}%` }} />
                  </span>
                </div>
              ))}
              <p className="text-[10px] text-stone-400">Priorizando {dnaEntries[0]?.[0]} en Muse Spark y en tus sugerencias de compra.</p>
            </div>
          )}
        </div>
      </section>
      )}
    </div>
  );
}
