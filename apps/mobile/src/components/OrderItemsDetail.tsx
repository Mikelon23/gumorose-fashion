import React from 'react';
import type { OrderItemDetail } from '@gumorose/shared';
import { colorHexOf } from '../data/mobile';

/**
 * Detalle de Prendas del Pedido: miniatura con color HEX real, nombre
 * completo, SKU, categoría, talla, color, cantidades, precios y
 * personalización multi-logo (zonas + técnica).
 */
export function OrderItemsDetail({ items }: { items: OrderItemDetail[] }): React.JSX.Element {
  if (items.length === 0) {
    return <p className="mt-2 text-[11px] text-stone-500">Sin detalle de prendas para esta orden.</p>;
  }
  return (
    <div className="mt-2 rounded-xl border border-stone-200 bg-stone-50 p-2.5" aria-label="Detalle de Prendas del Pedido">
      <p className="text-[11px] font-bold uppercase tracking-wide text-gum-ink">
        Detalle de Prendas del Pedido ({items.length})
      </p>
      <ul className="mt-1.5 space-y-1.5">
        {items.map((item) => (
          <li
            key={`${item.designId}-${item.garmentId}-${item.size ?? ''}-${item.color ?? ''}`}
            className="flex gap-2 rounded-xl border border-stone-100 bg-white p-2"
          >
            <span
              className="h-10 w-10 shrink-0 rounded-lg border border-stone-300"
              style={{ backgroundColor: colorHexOf(item.color ?? '#FFFFFF') }}
              title={item.color ?? ''}
            />
            <div className="min-w-0 flex-1 text-[11px]">
              <p className="truncate text-xs font-bold text-gum-ink">{item.garmentName}</p>
              <p className="text-stone-500">
                SKU {item.garmentSlug ?? item.garmentId.slice(0, 8)} · {item.category}
              </p>
              <p className="font-semibold text-stone-700">
                Talla {item.size ?? '—'} · Color {item.color ?? '—'} · {item.quantity} ud(s)
              </p>
              <p className="text-stone-600">
                ${item.unitPriceUsd.toFixed(2)} c/u · Subtotal{' '}
                <strong className="text-gum-ink">${item.lineTotalUsd.toFixed(2)} USD</strong>
              </p>
              <p className="text-stone-500">
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
