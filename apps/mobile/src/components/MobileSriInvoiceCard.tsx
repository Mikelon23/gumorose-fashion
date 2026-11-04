import React, { useEffect, useState } from 'react';
import type { SriElectronicInvoice } from '@gumorose/shared';
import { fetchSriInvoices, sriRideUrl, sriXmlUrl } from '../services/mobileApi';

/** Factura SRI autorizada en comprobantes y pedidos móviles. */
export function MobileSriInvoiceCard({
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
    if (invoiceProp) return setInvoice(invoiceProp);
    if (!boxId && !orderCode) return;
    let cancelled = false;
    void fetchSriInvoices({ boxId, orderCode })
      .then((res) => {
        if (!cancelled) setInvoice(res.items[0] ?? null);
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
    <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3" aria-label="Factura Electrónica SRI">
      <p className="text-[11px] font-bold uppercase text-emerald-800">Factura Electrónica Autorizada por el SRI</p>
      <p className="font-display text-base font-bold">{invoice.invoiceNumber}</p>
      <p className="break-all text-[10px] text-stone-600">Clave de Acceso de 49 dígitos: <span className="font-mono font-semibold">{invoice.accessKey49}</span></p>
      <p className="text-[11px] text-stone-600">IVA 15% ${invoice.iva15Usd.toFixed(2)} · Total ${invoice.importeTotalUsd.toFixed(2)}</p>
      <div className="mt-2 flex gap-2">
        <a href={sriRideUrl(invoice.id)} target="_blank" rel="noreferrer" className="flex-1 rounded-lg bg-gum-espresso px-2 py-2 text-center text-[11px] font-bold text-white">📄 Ver RIDE (Factura SRI)</a>
        <a href={sriXmlUrl(invoice.id)} download className="flex-1 rounded-lg border border-gum-espresso bg-white px-2 py-2 text-center text-[11px] font-bold">📥 Descargar XML Firmado</a>
      </div>
    </div>
  );
}
