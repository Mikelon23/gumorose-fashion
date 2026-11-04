import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export interface SlideOverDrawerProps {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * Slide-Over Inspector Drawer lateral derecho del ERP: el detalle
 * profundo vive aquí, nunca apilado junto a las tablas ejecutivas.
 */
export function SlideOverDrawer({
  open,
  title,
  subtitle,
  onClose,
  children,
}: SlideOverDrawerProps): React.JSX.Element | null {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={title}>
      <button
        type="button"
        aria-label="Cerrar inspector"
        onClick={onClose}
        className="absolute inset-0 bg-gum-espresso/55"
      />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-xl flex-col bg-gum-alabaster shadow-editorialLg">
        <header className="flex items-start justify-between gap-3 border-b border-gum-line bg-white px-5 py-4">
          <div className="min-w-0">
            <h3 className="truncate font-display text-lg font-semibold text-gum-espresso">
              {title}
            </h3>
            {subtitle && <p className="truncate text-xs text-stone-500">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-full bg-gum-linen text-stone-600 transition hover:text-gum-espresso"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </aside>
    </div>
  );
}
