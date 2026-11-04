import React from 'react';
import type { GarmentTemplate } from '@gumorose/shared';
import { GarmentCanvas } from './GarmentCanvas';
import { colorHexOf } from '../data/regions';
import { CATEGORY_SHOWCASE, type CategoryShowcaseDef } from '../data/editorial';

export interface CategoryShowcaseRailProps {
  catalog: GarmentTemplate[];
  activeKey: string | null;
  onSelect: (def: CategoryShowcaseDef) => void;
}

function representativeOf(
  catalog: GarmentTemplate[],
  def: CategoryShowcaseDef,
): GarmentTemplate | undefined {
  if (def.variant) return catalog.find((g) => g.visualVariant === def.variant);
  if (def.key === 'TEES_POLOS') {
    return catalog.find(
      (g) =>
        g.category === 'CAMISETA' && g.visualVariant !== 'HOODIE' && g.visualVariant !== 'GORRA',
    );
  }
  return catalog.find((g) => g.category === def.category);
}

/** Carrusel horizontal de categorías con previsualización real del catálogo. */
export function CategoryShowcaseRail({
  catalog,
  activeKey,
  onSelect,
}: CategoryShowcaseRailProps): React.JSX.Element {
  return (
    <section aria-label="Comprar por categoría" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gum-terracottadark">
            Shop by Category
          </p>
          <h2 className="font-display text-2xl font-semibold text-gum-espresso">
            Explora por línea de producto
          </h2>
        </div>
        <p className="text-xs text-stone-500">Toca una tarjeta para filtrar el catálogo.</p>
      </div>
      <div
        className="gum-no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1"
        role="list"
        aria-label="Categorías destacadas"
      >
        {CATEGORY_SHOWCASE.map((def) => {
          const rep = representativeOf(catalog, def);
          const active = activeKey === def.key;
          return (
            <button
              key={def.key}
              type="button"
              role="listitem"
              onClick={() => onSelect(def)}
              aria-pressed={active}
              className={`w-56 shrink-0 snap-start overflow-hidden rounded-2xl border text-left shadow-editorial transition sm:w-64 ${
                active
                  ? 'border-gum-terracotta bg-white ring-2 ring-gum-terracotta/40'
                  : 'border-gum-line bg-white hover:border-gum-terracotta'
              }`}
            >
              <span className="block bg-gum-linen p-3">
                <span className="pointer-events-none mx-auto block max-w-36">
                  {rep ? (
                    <GarmentCanvas
                      category={rep.category}
                      variant={rep.visualVariant}
                      fabricHex={colorHexOf(rep.colors[0] ?? 'BLANCO')}
                      view="FRONTAL"
                      logos={[]}
                      selectedUid={null}
                      showGuides={false}
                      onSelect={() => undefined}
                      onMove={() => undefined}
                    />
                  ) : (
                    <span className="block py-10 text-center text-xs text-stone-500">
                      Sin muestra
                    </span>
                  )}
                </span>
              </span>
              <span className="block p-3">
                <span className="flex items-center justify-between gap-2">
                  <span className="font-display text-base font-semibold text-gum-espresso">
                    {def.title}
                  </span>
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: def.accentHex }}
                    aria-hidden
                  />
                </span>
                <span className="mt-0.5 block font-display text-sm font-bold text-gum-terracottadark">
                  {def.priceLabel}
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-stone-600">
                  {def.fabricNote}
                </span>
                <span className="mt-1 block text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                  {def.minutesLabel}
                </span>
                {active && (
                  <span className="mt-2 inline-block rounded-full bg-gum-espresso px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
                    Colección activa
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
