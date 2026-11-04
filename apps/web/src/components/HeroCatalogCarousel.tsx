import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Dices,
  Factory,
  PackagePlus,
  PenTool,
  PersonStanding,
  Sparkles,
} from 'lucide-react';
import type { GarmentTemplate } from '@gumorose/shared';
import { DEFAULT_BODY_ANCHORS } from '@gumorose/shared';
import { GarmentCanvas } from './GarmentCanvas';
import { AnatomicalSubjectStage } from './AnatomicalSubjectStage';
import { colorHexOf, prettyColor } from '../data/regions';
import { STUDIO_SUBJECTS } from '../data/subjects';
import { GALLERY_SEALS } from '../data/gallery';
import {
  STYLE_PRESET_LABEL,
  closetMatchCountFor,
  costPerWearUsd,
  fabricCompositionOf,
  fitOf,
  heroGarment,
  stylePresetTrio,
  type StylePreset,
} from '../data/editorial';

const SLIDE_MS = 6000;

export interface HeroCatalogCarouselProps {
  catalog: GarmentTemplate[];
  closetByCategory: Record<string, number>;
  onCustomize: (garment: GarmentTemplate) => void;
  onAddLook: (look: GarmentTemplate[]) => void;
  onAddSingle: (garment: GarmentTemplate) => void;
}

function money(value: number): string {
  return `$${value.toFixed(2)}`;
}

function MiniGarment({
  garment,
  hex,
}: {
  garment: GarmentTemplate;
  hex?: string;
}): React.JSX.Element {
  return (
    <GarmentCanvas
      category={garment.category}
      variant={garment.visualVariant}
      fabricHex={hex ?? colorHexOf(garment.colors[0] ?? 'BLANCO')}
      view="FRONTAL"
      logos={[]}
      selectedUid={null}
      showGuides={false}
      onSelect={() => undefined}
      onMove={() => undefined}
    />
  );
}

/**
 * Carrusel Hero Editorial de ancho completo: 4 historias con prendas
 * reales del catálogo, hotspots de compra y controles accesibles.
 * Auto-play 6s con pausa en hover/foco, flechas y progreso por slide.
 */
export function HeroCatalogCarousel({
  catalog,
  closetByCategory,
  onCustomize,
  onAddLook,
  onAddSingle,
}: HeroCatalogCarouselProps): React.JSX.Element {
  const [slide, setSlide] = useState(0);
  const [paused, setPaused] = useState(false);
  const [preset, setPreset] = useState<StylePreset>('URBANO_ANDINO');
  const [heroPickId, setHeroPickId] = useState<string | null>(null);
  const [spinIndex, setSpinIndex] = useState(0);
  const [cpwUses, setCpwUses] = useState(50);
  const [dressSeed, setDressSeed] = useState(0);

  const tee = heroGarment(
    catalog,
    (g) => g.category === 'CAMISETA' && g.visualVariant !== 'HOODIE' && g.visualVariant !== 'GORRA',
  );
  const hoodie = heroGarment(catalog, (g) => g.visualVariant === 'HOODIE');
  const chino = heroGarment(catalog, (g) => g.visualVariant === 'CHINO');
  const gorra = heroGarment(catalog, (g) => g.visualVariant === 'GORRA');
  const subjectUrl = STUDIO_SUBJECTS[1]?.silhouetteUrl ?? STUDIO_SUBJECTS[0]?.silhouetteUrl ?? '';

  const look1 = useMemo(
    () => [tee, hoodie, chino].filter((g): g is GarmentTemplate => Boolean(g)),
    [tee, hoodie, chino],
  );
  const look1Total = look1.reduce((acc, g) => acc + g.baseSalePrice, 0);
  const heroPick = look1.find((g) => g.id === heroPickId) ?? look1[0];
  const presetTrio = useMemo(() => stylePresetTrio(catalog, preset), [catalog, preset]);
  const spinGarment = tee ?? catalog[0];
  const spinColors = spinGarment?.colors ?? ['BLANCO'];
  const spinColor = spinColors[spinIndex % spinColors.length] ?? 'BLANCO';
  const spinSeal = GALLERY_SEALS[spinIndex % GALLERY_SEALS.length];
  const cpwGarment = tee ?? catalog[0];
  const dressTrio = useMemo(() => {
    if (catalog.length === 0) return [] as GarmentTemplate[];
    const start = dressSeed % catalog.length;
    const picks: GarmentTemplate[] = [];
    for (let i = 0; i < catalog.length && picks.length < 3; i += 1) {
      const candidate = catalog[(start + i * 3) % catalog.length];
      if (candidate && !picks.some((p) => p.id === candidate.id)) picks.push(candidate);
    }
    return picks;
  }, [catalog, dressSeed]);

  useEffect(() => {
    if (paused) return;
    const timer = window.setInterval(() => setSlide((s) => (s + 1) % 4), SLIDE_MS);
    return () => window.clearInterval(timer);
  }, [paused]);

  useEffect(() => {
    if (slide !== 2) return;
    const timer = window.setInterval(() => setSpinIndex((i) => i + 1), 2200);
    return () => window.clearInterval(timer);
  }, [slide]);

  const anchors = [tee, presetTrio[0], spinGarment, cpwGarment];
  const slideTitles = [
    'Colección Editorial Ecuador',
    'Curaduría Personalizada por IA',
    'Manufactura Inteligente Bajo Demanda',
    'Armario Inteligente & Costo por Uso',
  ];

  function go(next: number): void {
    setSlide(((next % 4) + 4) % 4);
  }

  return (
    <section
      aria-label="Carrusel editorial de catálogo"
      aria-roledescription="carrusel"
      className="overflow-hidden rounded-none border-y border-gum-line bg-gum-espresso text-white sm:rounded-2xl sm:border sm:shadow-editorialLg"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="relative min-h-0 flex-1 overflow-hidden md:h-[540px] md:min-h-[540px] md:max-h-[540px]">
        {/* Flechas laterales */}
        <button
          type="button"
          onClick={() => go(slide - 1)}
          aria-label="Slide anterior"
          className="absolute left-3 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition hover:bg-white/25"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => go(slide + 1)}
          aria-label="Slide siguiente"
          className="absolute right-3 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition hover:bg-white/25"
        >
          <ChevronRight className="h-5 w-5" aria-hidden />
        </button>

        {/* SLIDE 1 */}
        {slide === 0 && (
          <div
            className="grid h-full gap-0 lg:grid-cols-2"
            role="group"
            aria-roledescription="slide"
            aria-label="1 de 4: Colección Editorial Ecuador"
          >
            <div className="flex flex-col justify-center px-5 py-8 sm:px-8 lg:py-12">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gum-oro">
                Colección Editorial · Costa, Sierra &amp; Oriente
              </p>
              <h1 className="mt-3 font-display text-4xl font-semibold leading-[1.05] sm:text-5xl">
                Ecuador se viste en tres climas.
              </h1>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-stone-300">
                Un look completo con prendas reales del catálogo, confeccionado bajo demanda en
                Riobamba. Toca cada prenda del escenario para verla, cambiar su color o
                personalizarla.
              </p>
              <dl className="mt-5 grid grid-cols-3 gap-3 text-center">
                <div className="rounded-xl bg-white/5 px-2 py-3">
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.2em] text-stone-400">
                    Look
                  </dt>
                  <dd className="font-display text-lg font-bold">{money(look1Total)}</dd>
                </div>
                <div className="rounded-xl bg-white/5 px-2 py-3">
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.2em] text-stone-400">
                    Planta
                  </dt>
                  <dd className="font-display text-lg font-bold">
                    {look1.reduce((a, g) => a + g.baseTimeMinutes, 0)} min
                  </dd>
                </div>
                <div className="rounded-xl bg-white/5 px-2 py-3">
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.2em] text-stone-400">
                    Inventario
                  </dt>
                  <dd className="font-display text-lg font-bold">0% muerto</dd>
                </div>
              </dl>
              <div className="mt-6 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onAddLook(look1)}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full bg-gum-terracotta px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-gum-terracottadark"
                >
                  <PackagePlus className="h-4 w-4" aria-hidden /> Comprar Look Completo ·{' '}
                  {money(look1Total)}
                </button>
                {heroPick && (
                  <button
                    type="button"
                    onClick={() => onCustomize(heroPick)}
                    className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/30 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
                  >
                    <PenTool className="h-4 w-4" aria-hidden /> Personalizar este Modelo
                  </button>
                )}
              </div>
            </div>
            <div className="relative flex h-[460px] w-full flex-col items-center justify-center overflow-hidden rounded-2xl bg-[#F3EFE6] p-4 text-gum-espresso">
              {heroPick ? (
                <div className="mx-auto w-full max-w-[190px] shrink-0 [&_canvas]:h-full [&_canvas]:w-full [&_canvas]:object-contain">
                  <AnatomicalSubjectStage
                    subjectImage={subjectUrl}
                    subjectLabel="Modelo editorial Gumorose"
                    garment={heroPick}
                    fabricHex={heroPick.category === 'PANTALON' ? colorHexOf(heroPick.colors[0] ?? 'BLANCO') : '#C86D51'}
                    view="FRONTAL"
                    logos={[]}
                    selectedUid={null}
                    onSelect={() => undefined}
                    onMove={() => undefined}
                    bottomGarment={heroPick.category === 'PANTALON' ? null : (chino ?? null)}
                    anchors={DEFAULT_BODY_ANCHORS}
                    framing="FULL_BODY"
                  />
                </div>
              ) : (
                <p className="py-16 text-center text-sm text-stone-500">
                  Cargando prendas del catálogo…
                </p>
              )}
              {/* Shop the Slide: hotspots flotantes */}
              <div
                className="mt-3 grid gap-2 sm:grid-cols-3"
                role="group"
                aria-label="Comprar prendas de este slide"
              >
                {look1.map((garment) => {
                  const active = heroPick?.id === garment.id;
                  return (
                    <button
                      key={garment.id}
                      type="button"
                      onClick={() => setHeroPickId(garment.id)}
                      aria-pressed={active}
                      className={`rounded-xl border p-2.5 text-left shadow-editorial transition ${
                        active
                          ? 'border-gum-terracotta bg-white ring-2 ring-gum-terracotta/40'
                          : 'border-gum-line bg-white/90 hover:border-gum-terracotta'
                      }`}
                    >
                      <span className="block truncate text-xs font-bold">{garment.name}</span>
                      <span className="block truncate text-[11px] text-stone-500">
                        {fabricCompositionOf(garment)}
                      </span>
                      <span className="mt-1 flex items-center justify-between">
                        <span className="font-display text-sm font-bold">
                          {money(garment.baseSalePrice)}
                        </span>
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-gum-terracottadark">
                          {garment.baseTimeMinutes} min
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              {heroPick && (
                <p className="mt-2 text-center text-xs text-stone-600" aria-live="polite">
                  En escena: <strong>{heroPick.name}</strong> · {fitOf(heroPick)} · combina con{' '}
                  {closetMatchCountFor(heroPick, closetByCategory, catalog)} prendas de tu clóset
                </p>
              )}
            </div>
          </div>
        )}

        {/* SLIDE 2 */}
        {slide === 1 && (
          <div
            className="grid h-full gap-0 lg:grid-cols-2"
            role="group"
            aria-roledescription="slide"
            aria-label="2 de 4: Curaduría Personalizada por IA"
          >
            <div className="flex flex-col justify-center px-5 py-8 sm:px-8 lg:py-12">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gum-oro">
                Tu Estilo, Tu Clima · Inspiración Stitch Fix
              </p>
              <h2 className="mt-3 font-display text-4xl font-semibold leading-[1.05] sm:text-5xl">
                Curaduría personalizada por IA.
              </h2>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-stone-300">
                Cruzamos el clima de Ecuador, tu ADN de estilo y el ajuste anatómico para eliminar
                la fatiga de decisión: ciencia de datos con arte textil, en un solo look.
              </p>
              <div
                className="mt-5 flex flex-wrap gap-2"
                role="group"
                aria-label="Preset de estilo en vivo"
              >
                {(Object.keys(STYLE_PRESET_LABEL) as StylePreset[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPreset(key)}
                    aria-pressed={preset === key}
                    className={`min-h-10 rounded-full px-4 py-2 text-xs font-bold transition ${
                      preset === key
                        ? 'bg-gum-terracotta text-white'
                        : 'border border-white/25 text-stone-200 hover:bg-white/10'
                    }`}
                  >
                    {STYLE_PRESET_LABEL[key]}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-xs text-stone-400" aria-live="polite">
                {preset === 'URBANO_ANDINO' &&
                  'Capas relajadas para la altura: térmicos, sarga y proporción urbana.'}
                {preset === 'EJECUTIVO_SASTRE' &&
                  'Siluetas estructuradas: Oxford, piqué y chino sastre de oficina.'}
                {preset === 'FRESCO_COSTENO' &&
                  'Tejidos que respiran a 30°C: algodón liviano y secado rápido.'}
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={presetTrio.length === 0}
                  onClick={() => {
                    const first = presetTrio[0];
                    if (first) onCustomize(first);
                  }}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full bg-gum-terracotta px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-gum-terracottadark disabled:opacity-50"
                >
                  <PersonStanding className="h-4 w-4" aria-hidden /> Probar en Mi Cuerpo Real
                </button>
                <button
                  type="button"
                  disabled={presetTrio.length === 0}
                  onClick={() => onAddLook(presetTrio)}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/30 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10 disabled:opacity-50"
                >
                  <PackagePlus className="h-4 w-4" aria-hidden /> Añadir las 3 a mi Caja
                </button>
              </div>
            </div>
            <div className="flex h-[460px] w-full flex-col items-center justify-center overflow-hidden rounded-2xl bg-[#F3EFE6] p-4 text-gum-espresso">
              <div className="grid w-full grid-cols-3 gap-3 [&_canvas]:object-contain">
                {presetTrio.map((garment) => (
                  <button
                    key={garment.id}
                    type="button"
                    onClick={() => onCustomize(garment)}
                    className="group rounded-xl border border-gum-line bg-white p-2 text-left shadow-editorial transition hover:border-gum-terracotta"
                    aria-label={`Personalizar ${garment.name}`}
                  >
                    <div className="pointer-events-none">
                      <MiniGarment garment={garment} />
                    </div>
                    <span className="mt-1 block truncate text-[11px] font-bold">
                      {garment.name}
                    </span>
                    <span className="block text-[11px] text-stone-500">
                      {money(garment.baseSalePrice)} · {fitOf(garment)}
                    </span>
                    <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-gum-salvia">
                      <Sparkles className="h-3 w-3" aria-hidden /> Match{' '}
                      {closetMatchCountFor(garment, closetByCategory, catalog)}
                    </span>
                  </button>
                ))}
              </div>
              <p className="mt-3 text-center text-xs text-stone-600">
                Toca cualquier prenda para abrirla en el Estudio 3D Multi-Logo.
              </p>
            </div>
          </div>
        )}

        {/* SLIDE 3 */}
        {slide === 2 && (
          <div
            className="grid h-full gap-0 lg:grid-cols-2"
            role="group"
            aria-roledescription="slide"
            aria-label="3 de 4: Manufactura Inteligente Bajo Demanda"
          >
            <div className="flex flex-col justify-center px-5 py-8 sm:px-8 lg:py-12">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gum-oro">
                Estudio Multi-Logo · Innovación en Valor
              </p>
              <h2 className="mt-3 font-display text-4xl font-semibold leading-[1.05] sm:text-5xl">
                Alta personalización a precio de fábrica.
              </h2>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-stone-300">
                Desde $8.65 base, sin inventario muerto: cada prenda nace cuando la pides y se
                confecciona en 2.744 minutos de capacidad instalada en nuestras 23 máquinas de
                Riobamba.
              </p>
              <dl className="mt-5 grid grid-cols-3 gap-3 text-center">
                <div className="rounded-xl bg-white/5 px-2 py-3">
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.2em] text-stone-400">
                    Base
                  </dt>
                  <dd className="font-display text-lg font-bold">$8.65</dd>
                </div>
                <div className="rounded-xl bg-white/5 px-2 py-3">
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.2em] text-stone-400">
                    Máquinas
                  </dt>
                  <dd className="font-display text-lg font-bold">23</dd>
                </div>
                <div className="rounded-xl bg-white/5 px-2 py-3">
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.2em] text-stone-400">
                    Logo extra
                  </dt>
                  <dd className="font-display text-lg font-bold">+$1.25</dd>
                </div>
              </dl>
              <div className="mt-6 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!spinGarment}
                  onClick={() => spinGarment && onCustomize(spinGarment)}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full bg-gum-terracotta px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-gum-terracottadark disabled:opacity-50"
                >
                  <Factory className="h-4 w-4" aria-hidden /> Abrir Estudio 3D Multi-Logo
                </button>
                <button
                  type="button"
                  onClick={() => setSpinIndex((i) => i + 1)}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/30 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
                >
                  Siguiente color / logo
                </button>
              </div>
            </div>
            <div className="flex h-[460px] w-full flex-col items-center justify-center overflow-hidden rounded-2xl bg-[#F3EFE6] p-4 text-gum-espresso">
              {spinGarment ? (
                <>
                  <div className="w-full max-w-[260px] [&_canvas]:object-contain" aria-live="polite">
                    <GarmentCanvas
                      category={spinGarment.category}
                      variant={spinGarment.visualVariant}
                      fabricHex={colorHexOf(spinColor)}
                      view="FRONTAL"
                      logos={
                        spinSeal
                          ? [
                              {
                                uid: 'hero-spin-logo',
                                logoUrl: spinSeal.url,
                                x: 80,
                                y: 112,
                                width: 40,
                                height: 40,
                                rotation: 0,
                              },
                            ]
                          : []
                      }
                      selectedUid={null}
                      showGuides={false}
                      onSelect={() => undefined}
                      onMove={() => undefined}
                    />
                  </div>
                  <p className="mt-2 text-center text-sm font-semibold">
                    {spinGarment.name} · {prettyColor(spinColor)}
                    {spinSeal ? ` · ${spinSeal.name}` : ''}
                  </p>
                  <p className="text-center text-xs text-stone-500">
                    {fabricCompositionOf(spinGarment)} · {spinGarment.baseTimeMinutes} min en planta
                  </p>
                  <div
                    className="mt-3 flex flex-wrap justify-center gap-1.5"
                    aria-label="Colores de la prenda"
                  >
                    {spinColors.map((color) => (
                      <button
                        key={color}
                        type="button"
                        title={prettyColor(color)}
                        aria-label={`Color ${prettyColor(color)}`}
                        aria-pressed={spinColor === color}
                        onClick={() => setSpinIndex(Math.max(0, spinColors.indexOf(color)))}
                        className={`h-7 w-7 rounded-full ring-2 ring-offset-2 ring-offset-gum-linen transition ${
                          spinColor === color ? 'ring-gum-terracotta' : 'ring-gum-line'
                        }`}
                        style={{ backgroundColor: colorHexOf(color) }}
                      />
                    ))}
                  </div>
                </>
              ) : (
                <p className="py-16 text-center text-sm text-stone-500">Cargando estudio…</p>
              )}
            </div>
          </div>
        )}

        {/* SLIDE 4 */}
        {slide === 3 && (
          <div
            className="grid h-full gap-0 lg:grid-cols-2"
            role="group"
            aria-roledescription="slide"
            aria-label="4 de 4: Armario Inteligente y Costo por Uso"
          >
            <div className="flex flex-col justify-center px-5 py-8 sm:px-8 lg:py-12">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gum-oro">
                Clóset Virtual · Dress-Me
              </p>
              <h2 className="mt-3 font-display text-4xl font-semibold leading-[1.05] sm:text-5xl">
                Armario inteligente, costo por uso real.
              </h2>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-stone-300">
                Cada compra se desbloquea en tu Clóset Virtual. Una prenda de $8.65 usada 50 veces
                cuesta solo $0.17 por puesta: vestir bien también es una inversión.
              </p>
              {cpwGarment && (
                <div className="mt-5 rounded-2xl bg-white/5 p-4">
                  <label className="block text-xs font-semibold text-stone-300">
                    {cpwGarment.name} · {money(cpwGarment.baseSalePrice)} · ¿cuántas veces la
                    usarás?
                    <span className="mt-2 flex items-center gap-3">
                      <input
                        type="range"
                        min={5}
                        max={120}
                        step={5}
                        value={cpwUses}
                        onChange={(e) => setCpwUses(Number(e.target.value))}
                        aria-label="Puestas estimadas"
                        className="min-w-0 flex-1"
                      />
                      <span className="shrink-0 font-display text-base font-bold text-white">
                        {cpwUses} puestas
                      </span>
                    </span>
                  </label>
                  <p
                    className="mt-2 font-display text-2xl font-bold text-gum-oro"
                    aria-live="polite"
                  >
                    ${costPerWearUsd(cpwGarment.baseSalePrice, cpwUses).toFixed(2)} USD / uso
                  </p>
                  <p className="text-xs text-stone-400">
                    Se desbloquea automáticamente en tu Clóset Virtual al comprar.
                  </p>
                </div>
              )}
              <div className="mt-6 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setDressSeed((s) => s + 1)}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full bg-gum-terracotta px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-gum-terracottadark"
                >
                  <Dices className="h-4 w-4" aria-hidden /> Dress-Me: nuevo look
                </button>
                {gorra && (
                  <button
                    type="button"
                    onClick={() => onAddSingle(gorra)}
                    className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/30 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
                  >
                    <PackagePlus className="h-4 w-4" aria-hidden /> Añadir accesorio{' '}
                    {money(gorra.baseSalePrice)}
                  </button>
                )}
              </div>
            </div>
            <div className="flex h-[460px] w-full flex-col items-center justify-center overflow-hidden rounded-2xl bg-[#F3EFE6] p-4 text-gum-espresso">
              <p className="text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500">
                Tu look de hoy · Slot Dress-Me
              </p>
              <div className="mt-3 grid w-full grid-cols-3 gap-3 [&_canvas]:object-contain">
                {dressTrio.map((garment) => (
                  <button
                    key={garment.id}
                    type="button"
                    onClick={() => onCustomize(garment)}
                    className="rounded-xl border border-gum-line bg-white p-2 text-left shadow-editorial transition hover:border-gum-terracotta"
                    aria-label={`Personalizar ${garment.name}`}
                  >
                    <div className="pointer-events-none">
                      <MiniGarment garment={garment} />
                    </div>
                    <span className="mt-1 block truncate text-[11px] font-bold">
                      {garment.name}
                    </span>
                    <span className="block text-[11px] text-stone-500">
                      {money(garment.baseSalePrice)} · $
                      {costPerWearUsd(garment.baseSalePrice, cpwUses).toFixed(2)}/uso
                    </span>
                  </button>
                ))}
              </div>
              <p
                className="mt-3 text-center font-display text-base font-semibold"
                aria-live="polite"
              >
                Look completo: {money(dressTrio.reduce((a, g) => a + g.baseSalePrice, 0))} ·{' '}
                {dressTrio.reduce((a, g) => a + g.baseTimeMinutes, 0)} min en Riobamba
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Progreso + miniaturas */}
      <div className="border-t border-white/10 bg-black/25 px-4 py-3">
        <div className="mx-auto flex max-w-5xl flex-col gap-3">
          <div className="flex gap-2" aria-hidden>
            {slideTitles.map((title, index) => (
              <span key={title} className="h-1 flex-1 overflow-hidden rounded-full bg-white/20">
                {index === slide && (
                  <span
                    key={`progress-${slide}-${paused ? 'p' : 'r'}`}
                    className="gum-hero-progress block h-full w-full rounded-full bg-gum-terracotta"
                    style={paused ? { animationPlayState: 'paused' } : undefined}
                  />
                )}
                {index < slide && (
                  <span className="block h-full w-full rounded-full bg-gum-terracotta" />
                )}
              </span>
            ))}
          </div>
          <div
            className="flex gap-2 overflow-x-auto gum-no-scrollbar"
            role="tablist"
            aria-label="Slides del carrusel"
          >
            {slideTitles.map((title, index) => {
              const anchor = anchors[index];
              const active = slide === index;
              return (
                <button
                  key={title}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => go(index)}
                  className={`flex min-w-44 flex-1 items-center gap-2 rounded-xl border p-2 text-left transition ${
                    active
                      ? 'border-gum-terracotta bg-white text-gum-espresso'
                      : 'border-white/15 bg-white/5 text-stone-200 hover:bg-white/10'
                  }`}
                >
                  <span className="pointer-events-none block h-12 w-10 shrink-0 overflow-hidden rounded-md bg-gum-linen">
                    {anchor ? <MiniGarment garment={anchor} /> : null}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.2em] opacity-70">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="block truncate text-xs font-bold">{title}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-center text-[11px] text-stone-400" aria-live="polite">
            Slide {slide + 1} de 4 · {slideTitles[slide]}
            {paused ? ' · en pausa' : ' · avanza en 6s'}
          </p>
        </div>
      </div>
    </section>
  );
}
