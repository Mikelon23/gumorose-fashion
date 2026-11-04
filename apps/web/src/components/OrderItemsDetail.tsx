import React from 'react';
import type { OrderItemDetail } from '@gumorose/shared';
import { CATEGORY_LABEL, colorHexOf } from '../data/regions';
import { GarmentCanvas } from './GarmentCanvas';

/**
 * Detalle de Prendas del Pedido: miniatura con color HEX real, nombre
 * completo, SKU, categoría, talla, color, cantidades, precios y
 * personalización multi-logo (zonas + técnica).
 */
export function OrderItemsDetail({ items }: { items: OrderItemDetail[] }): React.JSX.Element {
  if (items.length === 0) {
    return <p className="mt-3 text-xs text-stone-500">Sin detalle de prendas para esta orden.</p>;
  }
  return (
    <div className="mt-3 rounded-2xl border border-gum-line bg-gum-alabaster p-3" aria-label="Detalle de Prendas del Pedido">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gum-espresso">
        Detalle de Prendas del Pedido ({items.length})
      </p>
      <ul className="mt-2 space-y-2">
        {items.map((item) => (
          <li
            key={`${item.designId}-${item.garmentId}-${item.size ?? ''}-${item.color ?? ''}`}
            className="flex gap-3 rounded-xl border border-gum-line bg-white p-2.5 shadow-editorial"
          >
            <span
              className="pointer-events-none block h-16 w-14 shrink-0 overflow-hidden rounded-lg border border-gum-line bg-gum-linen"
              title={item.color ?? ''}
            >
              <GarmentCanvas
                category={item.category}
                fabricHex={colorHexOf(item.color ?? '#FFFFFF')}
                view="FRONTAL"
                logos={[]}
                selectedUid={null}
                showGuides={false}
                onSelect={() => undefined}
                onMove={() => undefined}
              />
            </span>
            <div className="min-w-0 flex-1 text-xs">
              <p className="truncate text-sm font-bold text-gum-ink">{item.garmentName}</p>
              <p className="text-stone-500">
                SKU {item.garmentSlug ?? item.garmentId.slice(0, 8)} ·{' '}
                {CATEGORY_LABEL[item.category] ?? item.category}
              </p>
              <p className="mt-0.5 font-semibold text-stone-700">
                Talla {item.size ?? '—'} · Color {item.color ?? '—'} · {item.quantity} ud(s)
              </p>
              <p className="text-stone-600">
                ${item.unitPriceUsd.toFixed(2)} c/u · Subtotal{' '}
                <strong className="text-gum-ink">${item.lineTotalUsd.toFixed(2)} USD</strong>
              </p>
              <p className="mt-0.5 text-stone-500">
                {item.logosCount > 0 ? (
                  <>
                    {item.logosCount} logo(s)
                    {item.designLogos && item.designLogos.length > 0 && (
                      <>
                        {' '}
                        en {item.designLogos.map((l) => l.zone).join(', ')} · técnica{' '}
                        {item.designLogos.map((l) => l.technique).join(', ')}
                      </>
                    )}
                  </>
                ) : (
                  'Sin personalización'
                )}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
