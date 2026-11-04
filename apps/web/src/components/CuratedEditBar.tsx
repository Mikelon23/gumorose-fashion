import React, { useMemo, useState } from 'react';
import { PackagePlus, PenTool, PersonStanding, Sparkles } from 'lucide-react';
import type { EcuadorRegion, GarmentTemplate } from '@gumorose/shared';
import { GarmentCanvas } from './GarmentCanvas';
import { colorHexOf } from '../data/regions';
import {
  CLIMATE_EDIT_META,
  FIT_PREFERENCE_LABEL,
  closetMatchCountFor,
  curatedTrioFor,
  fabricCompositionOf,
  type FitPreference,
} from '../data/editorial';

export interface CuratedEditBarProps {
  catalog: GarmentTemplate[];
  closetByCategory: Record<string, number>;
  onCustomize: (garment: GarmentTemplate) => void;
  onAddLook: (look: GarmentTemplate[]) => void;
  onTryTrio: (look: GarmentTemplate[]) => void;
}

const REGION_KEYS: EcuadorRegion[] = ['COSTA', 'SIERRA', 'ORIENTE'];
const FIT_KEYS: FitPreference[] = ['TAILORED', 'RELAXED', 'EJECUTIVO'];

/**
 * Tu Selección Curada (Stitch Fix Style & Climate Edit): clima + corte
 * en 1 clic y 3 prendas explicadas con compatibilidad de clóset.
 */
export function CuratedEditBar({
  catalog,
  closetByCategory,
  onCustomize,
  onAddLook,
  onTryTrio,
}: CuratedEditBarProps): React.JSX.Element {
  const [climate, setClimate] = useState<EcuadorRegion>('SIERRA');
  const [fitPref, setFitPref] = useState<FitPreference>('TAILORED');
  const trio = useMemo(
    () => curatedTrioFor(catalog, climate, fitPref),
    [catalog, climate, fitPref],
  );
  const meta = CLIMATE_EDIT_META[climate];

  return (
    <section
      aria-label="Tu selección curada por clima y estilo"
      className="rounded-2xl border border-gum-line bg-white p-4 shadow-editorial sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gum-terracottadark">
            Stitch Fix Personal Edit
          </p>
          <h2 className="font-display text-2xl font-semibold text-gum-espresso">
            Tu selección curada para hoy
          </h2>
          <p className="mt-1 max-w-xl text-sm text-stone-600">
            {meta.label} {meta.tempLabel} · {meta.note} Elige clima y corte: el editor arma tus 3
            prendas al instante.
          </p>
        </div>
        <span className="rounded-full bg-gum-linen px-3 py-1.5 text-xs font-bold text-gum-salvia">
          {meta.label} · {meta.tempLabel}
        </span>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <fieldset>
          <legend className="text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500">
            Región / Clima
          </legend>
          <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Región y clima">
            {REGION_KEYS.map((key) => {
              const item = CLIMATE_EDIT_META[key];
              const active = climate === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setClimate(key)}
                  aria-pressed={active}
                  className={`min-h-10 rounded-full px-4 py-2 text-xs font-bold transition ${
                    active
                      ? 'bg-gum-espresso text-white'
                      : 'border border-gum-line bg-gum-alabaster text-stone-700 hover:border-gum-espresso'
                  }`}
                >
                  {item.label} {item.tempLabel}
                </button>
              );
            })}
          </div>
        </fieldset>
        <fieldset>
          <legend className="text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500">
            Preferencia de Corte
          </legend>
          <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Preferencia de corte">
            {FIT_KEYS.map((key) => {
              const active = fitPref === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFitPref(key)}
                  aria-pressed={active}
                  className={`min-h-10 rounded-full px-4 py-2 text-xs font-bold transition ${
                    active
                      ? 'bg-gum-terracotta text-white'
                      : 'border border-gum-line bg-gum-alabaster text-stone-700 hover:border-gum-terracotta'
                  }`}
                >
                  {FIT_PREFERENCE_LABEL[key]}
                </button>
              );
            })}
          </div>
        </fieldset>
      </div>

      <div className="mt-4">
        <p className="text-sm font-bold text-gum-espresso" aria-live="polite">
          3 Prendas Curadas para Ti Hoy · {meta.label} · {FIT_PREFERENCE_LABEL[fitPref]}
        </p>
        {trio.length === 0 ? (
          <p className="mt-2 rounded-xl border border-dashed border-gum-line py-8 text-center text-sm text-stone-500">
            Cargando tu selección curada…
          </p>
        ) : (
          <ul className="mt-3 grid gap-3 md:grid-cols-3">
            {trio.map(({ garment, reason }) => (
              <li
                key={garment.id}
                className="flex flex-col rounded-2xl border border-gum-line bg-gum-alabaster p-3"
              >
                <div className="pointer-events-none mx-auto w-full max-w-40">
                  <GarmentCanvas
                    category={garment.category}
                    variant={garment.visualVariant}
                    fabricHex={colorHexOf(garment.colors[0] ?? 'BLANCO')}
                    view="FRONTAL"
                    logos={[]}
                    selectedUid={null}
                    showGuides={false}
                    onSelect={() => undefined}
                    onMove={() => undefined}
                  />
                </div>
                <p className="mt-2 text-sm font-bold leading-tight text-gum-espresso">
                  {garment.name}
                </p>
                <p className="text-xs font-semibold text-gum-terracottadark">
                  ${garment.baseSalePrice.toFixed(2)} · {garment.baseTimeMinutes} min
                </p>
                <p className="mt-1 text-xs leading-relaxed text-stone-600">{reason}</p>
                <p className="mt-1 text-[11px] text-stone-500">{fabricCompositionOf(garment)}</p>
                <p className="mt-2 inline-flex w-fit items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-gum-salvia">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden /> Whering Match · combina con{' '}
                  {closetMatchCountFor(garment, closetByCategory, catalog)} prendas
                </p>
                <span className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => onTryTrio(trio.map((t) => t.garment))}
                    className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-gum-espresso px-3 py-2 text-xs font-bold text-white transition hover:bg-gum-salvia"
                  >
                    <PersonStanding className="h-4 w-4" aria-hidden /> En Mi Cuerpo
                  </button>
                  <button
                    type="button"
                    onClick={() => onCustomize(garment)}
                    aria-label={`Personalizar ${garment.name}`}
                    className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full border border-gum-terracotta px-3 py-2 text-xs font-bold text-gum-terracottadark transition hover:bg-gum-terracotta hover:text-white"
                  >
                    <PenTool className="h-4 w-4" aria-hidden /> 3D
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={trio.length === 0}
            onClick={() => onTryTrio(trio.map((t) => t.garment))}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-gum-espresso px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-gum-salvia disabled:opacity-50"
          >
            <PersonStanding className="h-4 w-4" aria-hidden /> Probar las 3 en Mi Cuerpo
          </button>
          <button
            type="button"
            disabled={trio.length === 0}
            onClick={() => onAddLook(trio.map((t) => t.garment))}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-gum-terracotta px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-gum-terracottadark disabled:opacity-50"
          >
            <PackagePlus className="h-4 w-4" aria-hidden /> Añadir las 3 a mi Caja · $
            {trio.reduce((a, t) => a + t.garment.baseSalePrice, 0).toFixed(2)}
          </button>
        </div>
      </div>
    </section>
  );
}
