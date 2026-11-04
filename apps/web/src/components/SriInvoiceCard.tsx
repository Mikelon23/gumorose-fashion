import React, { useEffect, useState } from 'react';
import type { SriElectronicInvoice } from '@gumorose/shared';
import { fetchSriInvoices, sriRideUrl, sriXmlUrl } from '../services/api';

/** Tarjeta de Factura Electrónica SRI autorizada con RIDE y XML. */
export function SriInvoiceCard({
  boxId,
  orderCode,
  invoice: invoiceProp,
}: {
  boxId?: string;
  orderCode?: string;
  invoice?: SriElectronicInvoice | null;
}): React.JSX.Element | null {
  const [invoice, setInvoice] = useState<SriElectronicInvoice | null>(invoiceProp ?? null);

  useEffect(() => {
    if (invoiceProp) {
      setInvoice(invoiceProp);
      return;
    }
    if (!boxId && !orderCode) return;
    let cancelled = false;
    void fetchSriInvoices({ boxId, orderCode })
      .then((response) => {
        if (!cancelled) setInvoice(response.items[0] ?? null);
      })
      .catch(() => {
        if (!cancelled) setInvoice(null);
      });
    return () => {
      cancelled = true;
    };
  }, [boxId, orderCode, invoiceProp]);

  if (!invoice) return null;
  return (
    <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-left" aria-label="Factura Electrónica SRI">
      <p className="text-xs font-bold uppercase tracking-wide text-emerald-800">Factura Electrónica Autorizada por el SRI</p>
      <p className="mt-1 font-display text-lg font-bold text-gum-ink">{invoice.invoiceNumber}</p>
      <p className="mt-1 break-all text-[11px] text-stone-600">
        Clave de Acceso de 49 dígitos: <span className="font-mono font-semibold">{invoice.accessKey49}</span>
      </p>
      <p className="mt-1 text-xs text-stone-600">
        Estado {invoice.sriStatus} · IVA 15% ${invoice.iva15Usd.toFixed(2)} · Total ${invoice.importeTotalUsd.toFixed(2)}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <a href={sriRideUrl(invoice.id)} target="_blank" rel="noreferrer" className="rounded-lg bg-gum-ink px-3 py-2 text-xs font-bold text-white">
          📄 Ver RIDE (Factura SRI)
        </a>
        <a href={sriXmlUrl(invoice.id)} download className="rounded-lg border border-gum-ink bg-white px-3 py-2 text-xs font-bold text-gum-ink">
          📥 Descargar XML Firmado
        </a>
      </div>
    </div>
  );
}
