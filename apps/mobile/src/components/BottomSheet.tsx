import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export interface BottomSheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

/** Panel inferior editorial reutilizable (detalle, look, matriz, foto). */
export function BottomSheet({
  open,
  title,
  onClose,
  children,
}: BottomSheetProps): React.JSX.Element | null {
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
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        aria-label="Cerrar panel"
        onClick={onClose}
        className="absolute inset-0 bg-gum-espresso/55"
      />
      <div className="gum-sheet-up relative max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border-t border-gum-line bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-cardLg">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-gum-line" aria-hidden />
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display text-base font-bold text-gum-espresso">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex min-h-10 min-w-10 items-center justify-center rounded-full bg-gum-alabaster text-stone-600"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
