import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  BoxQuoteBreakdown,
  EcuadorRegion,
  ErpProductionOrder,
  GarmentCategory,
  PaymentMode,
  UserRole,
} from '@gumorose/shared';
import { calculateGarmentUnitPrice, getVolumeDiscountPct } from '@gumorose/shared';
import {
  checkoutBox,
  fetchCustomerPlantOrders,
  quoteBox,
  setWebAuth,
  settleWebOrderBalance,
  type BoxDetail,
  type CheckoutBoxResponse,
} from '../services/api';
import { PROVINCIAS } from '../data/regions';

export type CustomerRole = Extract<UserRole, 'CLIENTE_B2C' | 'CLIENTE_B2B'>;

const ROLE_STORAGE_KEY = 'gumorose-web-role';
const COMPANY_STORAGE_KEY = 'gumorose-web-company';
const BUYER_ID_KEY = 'gumorose-web-user-id';

function readStoredRole(): CustomerRole {
  try {
    if (typeof window === 'undefined' || !('localStorage' in window)) return 'CLIENTE_B2C';
    return window.localStorage.getItem(ROLE_STORAGE_KEY) === 'CLIENTE_B2B'
      ? 'CLIENTE_B2B'
      : 'CLIENTE_B2C';
  } catch {
    return 'CLIENTE_B2C';
  }
}

function readStoredCompany(): { companyName: string; ruc: string } {
  try {
    if (typeof window === 'undefined' || !('localStorage' in window)) return { companyName: '', ruc: '' };
    const raw = window.localStorage.getItem(COMPANY_STORAGE_KEY);
    if (!raw) return { companyName: '', ruc: '' };
    const parsed = JSON.parse(raw) as { companyName?: unknown; ruc?: unknown };
    return {
      companyName: typeof parsed.companyName === 'string' ? parsed.companyName : '',
      ruc: typeof parsed.ruc === 'string' ? parsed.ruc : '',
    };
  } catch {
    return { companyName: '', ruc: '' };
  }
}

function readBuyerId(): string {
  try {
    if (typeof window === 'undefined' || !('localStorage' in window)) return '';
    const existing = window.localStorage.getItem(BUYER_ID_KEY);
    if (existing) return existing;
    const fresh =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `web-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(BUYER_ID_KEY, fresh);
    return fresh;
  } catch {
    return '';
  }
}

/* ------------------------------------------------------------------ */
/* Tipos                                                               */
/* ------------------------------------------------------------------ */

/** Línea de la Caja Gumorose en el frontend. */
export interface BoxLine {
  key: string;
  /** UUID del diseño (generado al guardar o al añadir directo). */
  designId: string;
  garmentId: string;
  garmentName: string;
  category: GarmentCategory;
  baseSalePrice: number;
  baseTimeMinutes: number;
  size: string;
  color: string;
  quantity: number;
  logosCount: number;
}

export interface AddLineInput {
  designId?: string;
  garmentId: string;
  garmentName: string;
  category: GarmentCategory;
  baseSalePrice: number;
  baseTimeMinutes: number;
  size: string;
  color: string;
  quantity?: number;
  logosCount?: number;
}

export interface CheckoutReceipt {
  box: BoxDetail;
  trackingCode: string;
  /** Gancho ERP del checkout (OP-XXXX, tela reservada, modalidad aplicada). */
  erpOrder?: CheckoutBoxResponse['erpOrder'];
  fabricMeters?: number;
  paymentMode?: PaymentMode;
  sriInvoice?: CheckoutBoxResponse['sriInvoice'];
}

export type QuoteStatus = 'idle' | 'quoting' | 'ok' | 'error';
export type CheckoutStatus = 'idle' | 'processing' | 'ok' | 'error';
export type PlantOrdersStatus = 'idle' | 'loading' | 'ok' | 'error';

function newUuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function trackingCodeOf(boxId: string): string {
  return `GUM-${boxId.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

const PAID_BOXES_KEY = 'gumorose-mis-pedidos';

/** Lee los IDs de cajas pagadas en este navegador (vista "Mis Pedidos"). */
export function readPaidBoxIds(): string[] {
  if (typeof window === 'undefined' || !('localStorage' in window)) return [];
  try {
    const raw = window.localStorage.getItem(PAID_BOXES_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === 'string');
  } catch {
    return [];
  }
}

function rememberPaidBoxId(boxId: string): void {
  if (typeof window === 'undefined' || !('localStorage' in window)) return;
  try {
    const current = readPaidBoxIds().filter((id) => id !== boxId);
    window.localStorage.setItem(PAID_BOXES_KEY, JSON.stringify([boxId, ...current].slice(0, 20)));
  } catch {
    /* almacenamiento no disponible: el seguimiento por ID sigue funcionando */
  }
}

/** Precio local de una línea (misma regla del motor: +$1.25 por logo extra). */
export function priceLine(line: BoxLine): { unitPrice: number; lineTotal: number } {
  const calc = calculateGarmentUnitPrice(
    {
      category: line.category,
      baseSalePrice: line.baseSalePrice,
      baseTimeMinutes: line.baseTimeMinutes,
    },
    line.logosCount,
  );
  return { unitPrice: calc.unitPrice, lineTotal: calc.unitPrice * line.quantity };
}

/* ------------------------------------------------------------------ */
/* Contexto                                                            */
/* ------------------------------------------------------------------ */

interface BoxContextValue {
  lines: BoxLine[];
  totalUnits: number;
  addLine: (input: AddLineInput) => void;
  updateQuantity: (key: string, quantity: number) => void;
  removeLine: (key: string) => void;
  clearBox: () => void;

  region: EcuadorRegion;
  setRegion: (region: EcuadorRegion) => void;
  provincia: string;
  setProvincia: (provincia: string) => void;
  ciudad: string;
  setCiudad: (ciudad: string) => void;
  direccion: string;
  setDireccion: (direccion: string) => void;
  customerName: string;
  setCustomerName: (name: string) => void;

  quote: BoxQuoteBreakdown | null;
  quotedBox: BoxDetail | null;
  quoteStatus: QuoteStatus;
  quoteError: string | null;
  quoteFresh: boolean;
  retryQuote: () => void;

  checkoutStatus: CheckoutStatus;
  checkoutError: string | null;
  receipt: CheckoutReceipt | null;
  /** Comprobante anterior como banner colapsable: nunca bloquea la caja nueva. */
  previousReceipt: CheckoutReceipt | null;
  /** Subtotal optimista instantáneo en cliente (sin esperar la cotización). */
  optimisticSubtotal: number;
  lastPaidBoxId: string | null;
  checkout: (paymentMethod?: string, paymentMode?: PaymentMode) => Promise<void>;
  dismissReceipt: () => void;

  localDiscountPct: number;

  /* --------------- Diagrama 3: rol comercial B2C/B2B --------------- */
  buyerId: string;
  customerRole: CustomerRole;
  setCustomerRole: (role: CustomerRole) => void;
  companyName: string;
  setCompanyName: (name: string) => void;
  ruc: string;
  setRuc: (ruc: string) => void;
  paymentMode: PaymentMode;
  setPaymentMode: (mode: PaymentMode) => void;
  plantOrders: ErpProductionOrder[];
  plantOrdersStatus: PlantOrdersStatus;
  plantOrdersError: string | null;
  refreshPlantOrders: () => Promise<void>;
  settleBalance: (orderId: string) => Promise<boolean>;
  settleStatus: PlantOrdersStatus;
}

const BoxContext = createContext<BoxContextValue | null>(null);

function firstProvincia(region: EcuadorRegion): { provincia: string; ciudad: string } {
  const list = PROVINCIAS[region] ?? [];
  const first = list[0];
  return {
    provincia: first?.nombre ?? '',
    ciudad: first?.ciudades[0] ?? '',
  };
}

export function BoxProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [lines, setLines] = useState<BoxLine[]>([]);
  const [region, setRegionState] = useState<EcuadorRegion>('SIERRA');
  const [provincia, setProvinciaState] = useState<string>('Chimborazo');
  const [ciudad, setCiudad] = useState<string>('Riobamba');
  const [direccion, setDireccion] = useState('');
  const [customerName, setCustomerName] = useState('');

  /* --------------- Diagrama 3: rol comercial B2C/B2B --------------- */
  const [buyerId] = useState(readBuyerId);
  const [customerRole, setCustomerRoleState] = useState<CustomerRole>(readStoredRole);
  const [companyState, setCompanyState] = useState(readStoredCompany);
  const [paymentMode, setPaymentModeState] = useState<PaymentMode>('CONTADO_100');

  const setCustomerRole = useCallback((role: CustomerRole) => {
    setCustomerRoleState(role);
    try {
      if (typeof window !== 'undefined' && 'localStorage' in window) {
        window.localStorage.setItem(ROLE_STORAGE_KEY, role);
      }
    } catch {
      /* sin almacenamiento: rol solo en sesión */
    }
    // El anticipo 50/50 es exclusivo B2B: al volver a B2C se fuerza contado.
    if (role === 'CLIENTE_B2C') setPaymentModeState('CONTADO_100');
  }, []);

  const setCompanyName = useCallback((name: string) => {
    setCompanyState((prev) => {
      const next = { ...prev, companyName: name };
      try {
        if (typeof window !== 'undefined' && 'localStorage' in window) {
          window.localStorage.setItem(COMPANY_STORAGE_KEY, JSON.stringify(next));
        }
      } catch {
        /* sin almacenamiento */
      }
      return next;
    });
  }, []);

  const setRuc = useCallback((ruc: string) => {
    setCompanyState((prev) => {
      const next = { ...prev, ruc };
      try {
        if (typeof window !== 'undefined' && 'localStorage' in window) {
          window.localStorage.setItem(COMPANY_STORAGE_KEY, JSON.stringify(next));
        }
      } catch {
        /* sin almacenamiento */
      }
      return next;
    });
  }, []);

  const setPaymentMode = useCallback(
    (mode: PaymentMode) => {
      // Blindaje UI: B2C nunca puede elegir anticipo.
      if (mode === 'ANTICIPO_50_50' && customerRole !== 'CLIENTE_B2B') return;
      setPaymentModeState(mode);
    },
    [customerRole],
  );

  // Toda petición lleva las cabeceras RBAC del rol comercial activo.
  useEffect(() => {
    setWebAuth({ userId: buyerId, role: customerRole });
  }, [buyerId, customerRole]);

  const [quote, setQuote] = useState<BoxQuoteBreakdown | null>(null);
  const [quotedBox, setQuotedBox] = useState<BoxDetail | null>(null);
  const [quoteStatus, setQuoteStatus] = useState<QuoteStatus>('idle');
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoteSignature, setQuoteSignature] = useState('');

  const [checkoutStatus, setCheckoutStatus] = useState<CheckoutStatus>('idle');
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<CheckoutReceipt | null>(null);
  const [previousReceipt, setPreviousReceipt] = useState<CheckoutReceipt | null>(null);
  const [lastPaidBoxId, setLastPaidBoxId] = useState<string | null>(null);

  const receiptRef = useRef<CheckoutReceipt | null>(null);

  /**
   * Desbloqueo instantáneo: en cuanto la caja nueva se toca, el recibo
   * anterior se mueve al banner superior y la caja queda lista para
   * cotizar y pagar sin pulsar "Seguir comprando".
   */
  const unlockAfterReceipt = useCallback(() => {
    if (receiptRef.current) {
      setPreviousReceipt(receiptRef.current);
      receiptRef.current = null;
      setReceipt(null);
    }
    setCheckoutStatus('idle');
    setCheckoutError(null);
  }, []);

  const quoteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestId = useRef(0);

  /* ---------------------------- líneas ---------------------------- */

  const addLine = useCallback((input: AddLineInput) => {
    unlockAfterReceipt();
    const quantity = Math.min(160, Math.max(1, Math.floor(input.quantity ?? 1)));
    const logosCount = Math.min(6, Math.max(0, Math.floor(input.logosCount ?? 0)));
    setLines((prev) => {
      const designId = input.designId ?? newUuid();
      const match = prev.find(
        (l) =>
          l.designId === designId &&
          l.garmentId === input.garmentId &&
          l.size === input.size &&
          l.color === input.color,
      );
      if (match) {
        return prev.map((l) =>
          l.key === match.key ? { ...l, quantity: Math.min(160, l.quantity + quantity) } : l,
        );
      }
      const line: BoxLine = {
        key: newUuid(),
        designId,
        garmentId: input.garmentId,
        garmentName: input.garmentName,
        category: input.category,
        baseSalePrice: input.baseSalePrice,
        baseTimeMinutes: input.baseTimeMinutes,
        size: input.size,
        color: input.color,
        quantity,
        logosCount,
      };
      return [...prev, line];
    });
  }, [unlockAfterReceipt]);

  const updateQuantity = useCallback((key: string, quantity: number) => {
    unlockAfterReceipt();
    const safe = Math.min(160, Math.max(1, Math.floor(quantity)));
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, quantity: safe } : l)));
  }, [unlockAfterReceipt]);

  const removeLine = useCallback((key: string) => {
    unlockAfterReceipt();
    setLines((prev) => prev.filter((l) => l.key !== key));
  }, [unlockAfterReceipt]);

  const clearBox = useCallback(() => {
    setLines([]);
    setQuote(null);
    setQuotedBox(null);
    setQuoteStatus('idle');
    setQuoteSignature('');
  }, []);

  /* --------------------------- logística --------------------------- */

  const setRegion = useCallback((next: EcuadorRegion) => {
    setRegionState(next);
    const first = firstProvincia(next);
    setProvinciaState(first.provincia);
    setCiudad(first.ciudad);
  }, []);

  const setProvincia = useCallback(
    (next: string) => {
      setProvinciaState(next);
      const found = (PROVINCIAS[region] ?? []).find((p) => p.nombre === next);
      setCiudad(found?.ciudades[0] ?? '');
    },
    [region],
  );

  /* --------------------- cotización automática --------------------- */

  const totalUnits = useMemo(() => lines.reduce((acc, l) => acc + l.quantity, 0), [lines]);

  const localDiscountPct = useMemo(() => getVolumeDiscountPct(totalUnits), [totalUnits]);

  /** Subtotal optimista instantáneo en cliente (responde al instante). */
  const optimisticSubtotal = useMemo(
    () => lines.reduce((acc, l) => acc + priceLine(l).lineTotal, 0),
    [lines],
  );

  const currentSignature = useMemo(() => {
    const minimal = lines.map((l) => ({
      d: l.designId,
      g: l.garmentId,
      q: l.quantity,
      n: l.logosCount,
    }));
    return JSON.stringify({ items: minimal, region });
  }, [lines, region]);

  const runQuote = useCallback(
    async (signature: string, snapshot: BoxLine[], snapshotRegion: EcuadorRegion) => {
      const id = ++requestId.current;
      setQuoteStatus('quoting');
      setQuoteError(null);
      try {
        const response = await quoteBox({
          region: snapshotRegion,
          currentPlantQueueMinutes: 0,
          customerName: customerName.trim() ? customerName.trim() : undefined,
          items: snapshot.map((l) => ({
            designId: l.designId,
            quantity: l.quantity,
            logosCount: l.logosCount,
            size: l.size,
            color: l.color,
            garment: {
              id: l.garmentId,
              category: l.category,
              baseSalePrice: l.baseSalePrice,
              baseTimeMinutes: l.baseTimeMinutes,
            },
          })),
        });
        if (requestId.current !== id) return;
        setQuote(response.quote);
        setQuotedBox(response.box);
        setQuoteSignature(signature);
        setQuoteStatus('ok');
      } catch (error) {
        if (requestId.current !== id) return;
        setQuoteStatus('error');
        setQuoteError(error instanceof Error ? error.message : 'No se pudo cotizar la caja.');
      }
    },
    [customerName],
  );

  useEffect(() => {
    if (quoteTimer.current) clearTimeout(quoteTimer.current);
    if (lines.length === 0) {
      setQuote(null);
      setQuotedBox(null);
      setQuoteStatus('idle');
      setQuoteError(null);
      setQuoteSignature('');
      return;
    }
    if (currentSignature === quoteSignature && quoteStatus === 'ok') return;
    // Debounce corto (100 ms): el botón de pagar responde al instante.
    quoteTimer.current = setTimeout(() => {
      void runQuote(currentSignature, lines, region);
    }, 100);
    return () => {
      if (quoteTimer.current) clearTimeout(quoteTimer.current);
    };
  }, [lines, region, currentSignature, quoteSignature, quoteStatus, runQuote]);

  const retryQuote = useCallback(() => {
    if (lines.length === 0) return;
    void runQuote(currentSignature, lines, region);
  }, [lines, region, currentSignature, runQuote]);

  const quoteFresh =
    quoteStatus === 'ok' && quoteSignature === currentSignature && quotedBox !== null;

  /* ----------------------------- checkout ----------------------------- */

  const [plantOrders, setPlantOrders] = useState<ErpProductionOrder[]>([]);
  const [plantOrdersStatus, setPlantOrdersStatus] = useState<PlantOrdersStatus>('idle');
  const [plantOrdersError, setPlantOrdersError] = useState<string | null>(null);
  const [settleStatus, setSettleStatus] = useState<PlantOrdersStatus>('idle');

  const refreshPlantOrders = useCallback(async () => {
    setPlantOrdersStatus('loading');
    setPlantOrdersError(null);
    try {
      const res = await fetchCustomerPlantOrders();
      setPlantOrders(Array.isArray(res.items) ? res.items : []);
      setPlantOrdersStatus('ok');
    } catch (error) {
      setPlantOrdersStatus('error');
      setPlantOrdersError(
        error instanceof Error ? error.message : 'No se pudieron leer tus órdenes en planta.',
      );
    }
  }, []);

  const settleBalance = useCallback(
    async (orderId: string): Promise<boolean> => {
      setSettleStatus('loading');
      try {
        await settleWebOrderBalance(orderId);
        setSettleStatus('ok');
        await refreshPlantOrders();
        return true;
      } catch {
        setSettleStatus('error');
        return false;
      }
    },
    [refreshPlantOrders],
  );

  const checkout = useCallback(
    async (paymentMethod = 'mock', paymentModeOverride?: PaymentMode) => {
      if (!quotedBox || !quoteFresh) return;
      setCheckoutStatus('processing');
      setCheckoutError(null);
      try {
        const mode = paymentModeOverride ?? paymentMode;
        const paid: CheckoutBoxResponse = await checkoutBox(quotedBox.id, paymentMethod, {
          customerRole,
          buyerUserId: buyerId,
          paymentMode: mode,
        });
        const box: BoxDetail = { ...paid, lines: paid.lines ?? quotedBox.lines };
        rememberPaidBoxId(box.id);
        const next: CheckoutReceipt = {
          box,
          trackingCode: trackingCodeOf(box.id),
          erpOrder: paid.erpOrder,
          fabricMeters: paid.fabricMeters,
          paymentMode: mode,
          sriInvoice: paid.sriInvoice,
        };
        receiptRef.current = next;
        setReceipt(next);
        setLastPaidBoxId(box.id);
        setCheckoutStatus('ok');
        clearBox();
        await refreshPlantOrders().catch(() => undefined);
      } catch (error) {
        setCheckoutStatus('error');
        setCheckoutError(error instanceof Error ? error.message : 'No se pudo completar el pago.');
      }
    },
    [quotedBox, quoteFresh, clearBox, paymentMode, customerRole, buyerId, refreshPlantOrders],
  );

  const dismissReceipt = useCallback(() => {
    receiptRef.current = null;
    setReceipt(null);
    setPreviousReceipt(null);
    setCheckoutStatus('idle');
    setCheckoutError(null);
  }, []);

  const value: BoxContextValue = {
    lines,
    totalUnits,
    addLine,
    updateQuantity,
    removeLine,
    clearBox,
    region,
    setRegion,
    provincia,
    setProvincia,
    ciudad,
    setCiudad,
    direccion,
    setDireccion,
    customerName,
    setCustomerName,
    quote,
    quotedBox,
    quoteStatus,
    quoteError,
    quoteFresh,
    retryQuote,
    checkoutStatus,
    checkoutError,
    receipt,
    previousReceipt,
    optimisticSubtotal,
    lastPaidBoxId,
    checkout,
    dismissReceipt,
    localDiscountPct,
    buyerId,
    customerRole,
    setCustomerRole,
    companyName: companyState.companyName,
    setCompanyName,
    ruc: companyState.ruc,
    setRuc,
    paymentMode,
    setPaymentMode,
    plantOrders,
    plantOrdersStatus,
    plantOrdersError,
    refreshPlantOrders,
    settleBalance,
    settleStatus,
  };

  return <BoxContext.Provider value={value}>{children}</BoxContext.Provider>;
}

export function useBox(): BoxContextValue {
  const ctx = useContext(BoxContext);
  if (!ctx) throw new Error('useBox debe usarse dentro de <BoxProvider>');
  return ctx;
}
