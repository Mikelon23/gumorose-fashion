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
  BodyAnchorCalibration,
  BoxQuoteBreakdown,
  ClimateStylingRules,
  ClosetCategory,
  ClosetOutfit,
  ClosetSourceType,
  EcuadorRegion,
  ErpProductionOrder,
  GarmentCategory,
  PaymentMode,
  StyleShuffleVote,
  UserClosetItem,
  UserProfile,
  UserRole,
  WarmthLevel,
} from '@gumorose/shared';
import {
  calculateGarmentUnitPrice,
  computeStyleDna,
  DEFAULT_BODY_ANCHORS,
  getVolumeDiscountPct,
  normalizeBodyAnchors,
} from '@gumorose/shared';
import {
  addClosetItem,
  checkoutBox,
  fetchCloset,
  fetchDailyOutfits,
  fetchMyPlantOrders,
  postStyleShuffleVote,
  quoteBox,
  setMobileAuth,
  settleOrderBalance,
  uploadBodyPhoto,
  virtualTryon,
  type BoxDetail,
  type CheckoutBoxResponse,
  type TryonResponse,
} from '../services/mobileApi';
import { GARMENT_TO_CLOSET, colorHexOf } from '../data/mobile';

/** Usuario demo estable: el clóset persiste en la API mientras viva el servidor. */
export const DEMO_USER_ID = '7d4f3b2a-1c5e-4a8f-9b3d-2e6f5a4c1d9e';

export type MobileCustomerRole = Extract<UserRole, 'CLIENTE_B2C' | 'CLIENTE_B2B'>;

const ROLE_STORAGE_KEY = 'gumorose-mobile-role';
const COMPANY_STORAGE_KEY = 'gumorose-mobile-company';

function readStoredRole(): MobileCustomerRole {
  try {
    if (typeof localStorage === 'undefined') return 'CLIENTE_B2C';
    return localStorage.getItem(ROLE_STORAGE_KEY) === 'CLIENTE_B2B'
      ? 'CLIENTE_B2B'
      : 'CLIENTE_B2C';
  } catch {
    return 'CLIENTE_B2C';
  }
}

function readStoredCompany(): { companyName: string; ruc: string } {
  try {
    if (typeof localStorage === 'undefined') return { companyName: '', ruc: '' };
    const raw = localStorage.getItem(COMPANY_STORAGE_KEY);
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

export interface InAppLine {
  key: string;
  designId: string;
  customDesignId?: string;
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

export interface AddInAppLineInput {
  designId?: string;
  customDesignId?: string;
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

export interface InAppReceipt {
  box: BoxDetail;
  trackingCode: string;
  /** Gancho ERP del checkout (OP-XXXX, tela reservada, modalidad aplicada). */
  erpOrder?: CheckoutBoxResponse['erpOrder'];
  fabricMeters?: number;
  paymentMode?: PaymentMode;
  sriInvoice?: CheckoutBoxResponse['sriInvoice'];
}

export type LoadStatus = 'idle' | 'loading' | 'ok' | 'error';

function newUuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function trackingCodeOf(boxId: string): string {
  return `GUM-${boxId.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

export function priceLine(line: InAppLine): { unitPrice: number; lineTotal: number } {
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

const ANCHORS_STORAGE_KEY = 'gumorose-body-anchors';
const STYLE_VOTES_STORAGE_KEY = 'gumorose-style-votes';
const WEAR_STORAGE_KEY = 'gumorose-wear-counts';

function readStoredAnchors(): BodyAnchorCalibration {
  try {
    if (typeof localStorage === 'undefined') return { ...DEFAULT_BODY_ANCHORS };
    const raw = localStorage.getItem(ANCHORS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_BODY_ANCHORS };
    return normalizeBodyAnchors(JSON.parse(raw) as Partial<BodyAnchorCalibration>);
  } catch {
    return { ...DEFAULT_BODY_ANCHORS };
  }
}

function readStoredVotes(): StyleShuffleVote[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(STYLE_VOTES_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (v): v is StyleShuffleVote =>
        typeof v === 'object' &&
        v !== null &&
        typeof (v as StyleShuffleVote).itemId === 'string' &&
        typeof (v as StyleShuffleVote).liked === 'boolean' &&
        typeof (v as StyleShuffleVote).styleTag === 'string',
    );
  } catch {
    return [];
  }
}

function readStoredWear(): Record<string, number> {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(WEAR_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (typeof parsed !== 'object' || parsed === null) return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isFinite(v)) out[k] = Math.max(0, Math.floor(v));
    }
    return out;
  } catch {
    return {};
  }
}

function readFavorites(): string[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem('gumorose-fav-outfits');
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */

interface ClosetMobileValue {
  userId: string;

  profile: UserProfile | null;
  items: UserClosetItem[];
  byCategory: Record<ClosetCategory, UserClosetItem[]>;
  outfits: ClosetOutfit[];
  closetStatus: LoadStatus;
  closetError: string | null;
  refreshCloset: () => Promise<void>;

  region: EcuadorRegion;
  setRegion: (r: EcuadorRegion) => void;
  city: string;
  setCity: (c: string) => void;
  tempC: number;
  setTempC: (t: number) => void;

  portraitStatus: LoadStatus;
  portraitError: string | null;
  uploadPortrait: (base64: string) => Promise<void>;

  saveClosetItem: (input: {
    category: ClosetCategory;
    name: string;
    colorHex: string;
    warmthLevel: WarmthLevel;
    sourceType: ClosetSourceType;
    garmentId?: string;
    designId?: string;
    imageCutoutUrl?: string;
    garmentCutoutBase64?: string;
  }) => Promise<UserClosetItem>;

  stylistStatus: LoadStatus;
  stylistError: string | null;
  lastRules: ClimateStylingRules | null;
  lastProvider: string | null;
  loadDailyOutfits: (maxOutfits?: number) => Promise<void>;

  selectedOutfitId: string | null;
  setSelectedOutfitId: (id: string | null) => void;
  draftCombo: string[];
  setDraftCombo: (ids: string[]) => void;
  lastTryon: (TryonResponse & { outfitId: string }) | null;
  tryonStatus: LoadStatus;
  tryonError: string | null;
  runTryon: (outfitId: string) => Promise<void>;

  favorites: string[];
  toggleFavorite: (outfitId: string) => void;

  /* Etapa 1: anclas anatómicas, OOTD/CPW y ADN de estilo */
  bodyAnchors: BodyAnchorCalibration;
  setBodyAnchors: (next: Partial<BodyAnchorCalibration>) => void;
  wearCounts: Record<string, number>;
  registerWear: (itemId: string) => void;
  styleVotes: StyleShuffleVote[];
  addStyleVote: (vote: StyleShuffleVote) => void;
  styleDna: Record<string, number>;

  lines: InAppLine[];
  totalUnits: number;
  localDiscountPct: number;
  addLine: (input: AddInAppLineInput) => void;
  updateQuantity: (key: string, quantity: number) => void;
  removeLine: (key: string) => void;
  clearBox: () => void;
  boxRegion: EcuadorRegion;
  setBoxRegion: (r: EcuadorRegion) => void;
  boxCustomer: string;
  setBoxCustomer: (n: string) => void;
  quote: BoxQuoteBreakdown | null;
  quotedBox: BoxDetail | null;
  quoteStatus: LoadStatus;
  quoteFresh: boolean;
  quoteError: string | null;
  retryQuote: () => void;
  checkoutStatus: LoadStatus;
  checkoutError: string | null;
  receipt: InAppReceipt | null;
  /** Comprobante anterior como banner colapsable: nunca bloquea la caja nueva. */
  previousReceipt: InAppReceipt | null;
  /** Subtotal optimista instantáneo en cliente (sin esperar la cotización). */
  optimisticSubtotal: number;
  lastPaidBoxId: string | null;
  closetSyncWarning: string | null;
  checkout: (paymentMethod?: string, paymentMode?: PaymentMode) => Promise<void>;
  dismissReceipt: () => void;

  /* ---------------- Diagrama 2: rol B2C/B2B + planta ---------------- */
  activeCustomerRole: MobileCustomerRole;
  setActiveCustomerRole: (role: MobileCustomerRole) => void;
  companyName: string;
  setCompanyName: (name: string) => void;
  ruc: string;
  setRuc: (ruc: string) => void;
  paymentMode: PaymentMode;
  setPaymentMode: (mode: PaymentMode) => void;
  myPlantOrders: ErpProductionOrder[];
  plantOrdersStatus: LoadStatus;
  plantOrdersError: string | null;
  refreshPlantOrders: () => Promise<void>;
  settleBalance: (orderId: string) => Promise<boolean>;
  settleStatus: LoadStatus;
}

const ClosetMobileContext = createContext<ClosetMobileValue | null>(null);

const EMPTY_BY_CATEGORY = (): Record<ClosetCategory, UserClosetItem[]> => ({
  SUPERIOR_CAMISETA: [],
  SUPERIOR_CAMISA: [],
  INFERIOR_PANTALON: [],
  ABRIGO: [],
  ACCESORIO: [],
});

export function ClosetMobileProvider({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const userId = DEMO_USER_ID;

  /* ---------------- Diagrama 2: rol activo B2C/B2B ---------------- */
  const [activeCustomerRole, setActiveCustomerRoleState] =
    useState<MobileCustomerRole>(readStoredRole);
  const [companyState, setCompanyState] = useState(readStoredCompany);
  const [paymentMode, setPaymentModeState] = useState<PaymentMode>('CONTADO_100');

  const setActiveCustomerRole = useCallback((role: MobileCustomerRole) => {
    setActiveCustomerRoleState(role);
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(ROLE_STORAGE_KEY, role);
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
        if (typeof localStorage !== 'undefined')
          localStorage.setItem(COMPANY_STORAGE_KEY, JSON.stringify(next));
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
        if (typeof localStorage !== 'undefined')
          localStorage.setItem(COMPANY_STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* sin almacenamiento */
      }
      return next;
    });
  }, []);

  const setPaymentMode = useCallback(
    (mode: PaymentMode) => {
      // Blindaje UI: B2C nunca puede elegir anticipo.
      if (mode === 'ANTICIPO_50_50' && activeCustomerRole !== 'CLIENTE_B2B') return;
      setPaymentModeState(mode);
    },
    [activeCustomerRole],
  );

  // Toda petición lleva las cabeceras RBAC del rol activo.
  useEffect(() => {
    setMobileAuth({ userId, role: activeCustomerRole });
  }, [userId, activeCustomerRole]);

  /* ------------------------------ perfil ------------------------------ */
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [region, setRegion] = useState<EcuadorRegion>('SIERRA');
  const [city, setCity] = useState('Riobamba');
  const [tempC, setTempC] = useState(10);
  const [portraitStatus, setPortraitStatus] = useState<LoadStatus>('idle');
  const [portraitError, setPortraitError] = useState<string | null>(null);

  /* ------------------------------ clóset ------------------------------ */
  const [items, setItems] = useState<UserClosetItem[]>([]);
  const [outfits, setOutfits] = useState<ClosetOutfit[]>([]);
  const [closetStatus, setClosetStatus] = useState<LoadStatus>('idle');
  const [closetError, setClosetError] = useState<string | null>(null);

  const byCategory = useMemo(() => {
    const grouped = EMPTY_BY_CATEGORY();
    for (const item of items) grouped[item.category].push(item);
    return grouped;
  }, [items]);

  const refreshCloset = useCallback(async () => {
    setClosetStatus('loading');
    setClosetError(null);
    try {
      const res = await fetchCloset(userId);
      setProfile(res.profile);
      setItems(
        (Object.values(res.byCategory) as UserClosetItem[][]).flatMap((list) => list),
      );
      setOutfits(res.outfits);
      setClosetStatus('ok');
    } catch (error) {
      // 404 = aún no hay retrato/perfil: clóset vacío, no es un error fatal.
      if (error instanceof Error && /404|Perfil no encontrado/.test(error.message)) {
        setItems([]);
        setOutfits([]);
        setClosetStatus('ok');
        return;
      }
      setClosetStatus('error');
      setClosetError(error instanceof Error ? error.message : 'No se pudo leer el clóset.');
    }
  }, [userId]);

  useEffect(() => {
    void refreshCloset();
  }, [refreshCloset]);

  const uploadPortrait = useCallback(
    async (base64: string) => {
      setPortraitStatus('loading');
      setPortraitError(null);
      try {
        const res = await uploadBodyPhoto(userId, base64, city, region);
        setProfile(res.profile);
        setPortraitStatus('ok');
        await refreshCloset();
      } catch (error) {
        setPortraitStatus('error');
        setPortraitError(error instanceof Error ? error.message : 'No se pudo subir el retrato.');
      }
    },
    [userId, city, region, refreshCloset],
  );

  const saveClosetItem = useCallback(
    async (input: {
      category: ClosetCategory;
      name: string;
      colorHex: string;
      warmthLevel: WarmthLevel;
      sourceType: ClosetSourceType;
      garmentId?: string;
      designId?: string;
      imageCutoutUrl?: string;
      garmentCutoutBase64?: string;
    }): Promise<UserClosetItem> => {
      const res = await addClosetItem({ userId, ...input });
      await refreshCloset();
      return res.item;
    },
    [userId, refreshCloset],
  );

  /* ----------------------------- estilista ----------------------------- */
  const [stylistStatus, setStylistStatus] = useState<LoadStatus>('idle');
  const [stylistError, setStylistError] = useState<string | null>(null);
  const [lastRules, setLastRules] = useState<ClimateStylingRules | null>(null);
  const [lastProvider, setLastProvider] = useState<string | null>(null);

  const loadDailyOutfits = useCallback(
    async (maxOutfits = 3) => {
      setStylistStatus('loading');
      setStylistError(null);
      try {
        const res = await fetchDailyOutfits(userId, region, tempC, maxOutfits);
        setOutfits(res.outfits);
        setLastRules(res.rules);
        setLastProvider(res.provider);
        setStylistStatus('ok');
      } catch (error) {
        setStylistStatus('error');
        setStylistError(
          error instanceof Error ? error.message : 'El Agente no pudo combinar tu clóset.',
        );
      }
    },
    [userId, region, tempC],
  );

  /* ------------------------------ vestidor ------------------------------ */
  const [selectedOutfitId, setSelectedOutfitId] = useState<string | null>(null);
  const [draftCombo, setDraftCombo] = useState<string[]>([]);
  const [lastTryon, setLastTryon] = useState<(TryonResponse & { outfitId: string }) | null>(null);
  const [tryonStatus, setTryonStatus] = useState<LoadStatus>('idle');
  const [tryonError, setTryonError] = useState<string | null>(null);

  const runTryon = useCallback(
    async (outfitId: string) => {
      setTryonStatus('loading');
      setTryonError(null);
      try {
        const res = await virtualTryon(userId, outfitId);
        setLastTryon({ ...res, outfitId });
        setTryonStatus('ok');
      } catch (error) {
        setTryonStatus('error');
        setTryonError(error instanceof Error ? error.message : 'Falló el Virtual Try-On.');
      }
    },
    [userId],
  );

  /* Etapa 1: anclas + OOTD + Style Shuffle (persistidos localmente) */
  const [bodyAnchors, setBodyAnchorsState] = useState<BodyAnchorCalibration>(readStoredAnchors);
  const [wearCounts, setWearCounts] = useState<Record<string, number>>(readStoredWear);
  const [styleVotes, setStyleVotes] = useState<StyleShuffleVote[]>(readStoredVotes);

  const setBodyAnchors = useCallback((next: Partial<BodyAnchorCalibration>) => {
    setBodyAnchorsState((prev) => {
      const merged = normalizeBodyAnchors({ ...prev, ...next });
      try {
        if (typeof localStorage !== 'undefined')
          localStorage.setItem(ANCHORS_STORAGE_KEY, JSON.stringify(merged));
      } catch {
        /* sin almacenamiento: solo sesión */
      }
      return merged;
    });
  }, []);

  const registerWear = useCallback((itemId: string) => {
    // Solo suma al contador persistido: el CPW efectivo = base + registros OOTD.
    setWearCounts((prev) => {
      const next = { ...prev, [itemId]: (prev[itemId] ?? 0) + 1 };
      try {
        if (typeof localStorage !== 'undefined')
          localStorage.setItem(WEAR_STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* sin almacenamiento */
      }
      return next;
    });
  }, []);

  const addStyleVote = useCallback(
    (vote: StyleShuffleVote) => {
      setStyleVotes((prev) => {
        const next = [...prev, vote];
        try {
          if (typeof localStorage !== 'undefined')
            localStorage.setItem(STYLE_VOTES_STORAGE_KEY, JSON.stringify(next));
        } catch {
          /* sin almacenamiento */
        }
        return next;
      });
      // Alimenta en vivo /api/erp/intelligence/stitch-fix-insights (sin bloquear la UI).
      void postStyleShuffleVote(userId, vote, region).catch(() => undefined);
    },
    [userId, region],
  );

  const styleDna = useMemo(() => computeStyleDna(styleVotes), [styleVotes]);

  /* ----------------------------- favoritos ----------------------------- */
  const [favorites, setFavorites] = useState<string[]>(readFavorites);

  const toggleFavorite = useCallback((outfitId: string) => {
    setFavorites((prev) => {
      const next = prev.includes(outfitId)
        ? prev.filter((id) => id !== outfitId)
        : [...prev, outfitId];
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('gumorose-fav-outfits', JSON.stringify(next));
        }
      } catch {
        /* almacenamiento no disponible: favoritos solo en sesión */
      }
      return next;
    });
  }, []);

  /* ------------------------------- caja -------------------------------- */
  const [lines, setLines] = useState<InAppLine[]>([]);
  const [boxRegion, setBoxRegion] = useState<EcuadorRegion>('SIERRA');
  const [boxCustomer, setBoxCustomer] = useState('');
  const [quote, setQuote] = useState<BoxQuoteBreakdown | null>(null);
  const [quotedBox, setQuotedBox] = useState<BoxDetail | null>(null);
  const [quoteStatus, setQuoteStatus] = useState<LoadStatus>('idle');
  const [quoteSignature, setQuoteSignature] = useState('');
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [checkoutStatus, setCheckoutStatus] = useState<LoadStatus>('idle');
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<InAppReceipt | null>(null);
  const [previousReceipt, setPreviousReceipt] = useState<InAppReceipt | null>(null);
  const [lastPaidBoxId, setLastPaidBoxId] = useState<string | null>(null);
  const [closetSyncWarning, setClosetSyncWarning] = useState<string | null>(null);
  const receiptRef = useRef<InAppReceipt | null>(null);

  /**
   * Desbloqueo instantáneo: en cuanto la caja nueva se toca, el recibo
   * anterior se mueve al banner superior y la caja queda lista para
   * cotizar y pagar sin pulsar "Seguir explorando".
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

  const addLine = useCallback((input: AddInAppLineInput) => {
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
      return [
        ...prev,
        {
          key: newUuid(),
          designId,
          customDesignId: input.customDesignId,
          garmentId: input.garmentId,
          garmentName: input.garmentName,
          category: input.category,
          baseSalePrice: input.baseSalePrice,
          baseTimeMinutes: input.baseTimeMinutes,
          size: input.size,
          color: input.color,
          quantity,
          logosCount,
        },
      ];
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
    return JSON.stringify({ items: minimal, region: boxRegion });
  }, [lines, boxRegion]);

  const runQuote = useCallback(
    async (signature: string, snapshot: InAppLine[], snapshotRegion: EcuadorRegion) => {
      const id = ++requestId.current;
      setQuoteStatus('loading');
      setQuoteError(null);
      try {
        const response = await quoteBox({
          region: snapshotRegion,
          currentPlantQueueMinutes: 0,
          customerName: boxCustomer.trim() ? boxCustomer.trim() : undefined,
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
    [boxCustomer],
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
      void runQuote(currentSignature, lines, boxRegion);
    }, 100);
    return () => {
      if (quoteTimer.current) clearTimeout(quoteTimer.current);
    };
  }, [lines, boxRegion, currentSignature, quoteSignature, quoteStatus, runQuote]);

  const retryQuote = useCallback(() => {
    if (lines.length === 0) return;
    void runQuote(currentSignature, lines, boxRegion);
  }, [lines, boxRegion, currentSignature, runQuote]);

  const quoteFresh =
    quoteStatus === 'ok' && quoteSignature === currentSignature && quotedBox !== null;

  const syncPurchasedToCloset = useCallback(
    async (purchased: InAppLine[]) => {
      let failures = 0;
      for (const line of purchased) {
        try {
          if (line.customDesignId) {
            await addClosetItem({
              userId,
              category: GARMENT_TO_CLOSET[line.category],
              sourceType: 'DISENO_CUSTOM',
              designId: line.customDesignId,
              name: `${line.garmentName} personalizado`,
              colorHex: colorHexOf(line.color),
              warmthLevel: 'TEMPLADO',
            });
          } else {
            await addClosetItem({
              userId,
              category: GARMENT_TO_CLOSET[line.category],
              sourceType: 'COMPRADO_GUMOROSE',
              garmentId: line.garmentId,
              name: line.garmentName,
              colorHex: colorHexOf(line.color),
              warmthLevel: 'TEMPLADO',
            });
          }
        } catch {
          failures += 1;
        }
      }
      await refreshCloset().catch(() => undefined);
      if (failures > 0) {
        setClosetSyncWarning(
          `${failures} prenda(s) no se pudieron copiar al clóset (¿falta el retrato base?). La compra sí se completó.`,
        );
      } else {
        setClosetSyncWarning(null);
      }
    },
    [userId, refreshCloset],
  );

  const [myPlantOrders, setMyPlantOrders] = useState<ErpProductionOrder[]>([]);
  const [plantOrdersStatus, setPlantOrdersStatus] = useState<LoadStatus>('idle');
  const [plantOrdersError, setPlantOrdersError] = useState<string | null>(null);
  const [settleStatus, setSettleStatus] = useState<LoadStatus>('idle');

  const refreshPlantOrders = useCallback(async () => {
    setPlantOrdersStatus('loading');
    setPlantOrdersError(null);
    try {
      const res = await fetchMyPlantOrders();
      setMyPlantOrders(res.items);
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
        await settleOrderBalance(orderId);
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
      setCheckoutStatus('loading');
      setCheckoutError(null);
      try {
        const mode = paymentModeOverride ?? paymentMode;
        const paid: CheckoutBoxResponse = await checkoutBox(quotedBox.id, paymentMethod, {
          customerRole: activeCustomerRole,
          buyerUserId: userId,
          paymentMode: mode,
        });
        const box: BoxDetail = { ...paid, lines: paid.lines ?? quotedBox.lines };
        const purchased = lines;
        const next: InAppReceipt = {
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
        await syncPurchasedToCloset(purchased);
        await refreshPlantOrders().catch(() => undefined);
      } catch (error) {
        setCheckoutStatus('error');
        setCheckoutError(error instanceof Error ? error.message : 'No se pudo completar la compra.');
      }
    },
    [quotedBox, quoteFresh, clearBox, lines, syncPurchasedToCloset, paymentMode, activeCustomerRole, userId, refreshPlantOrders],
  );

  const dismissReceipt = useCallback(() => {
    receiptRef.current = null;
    setReceipt(null);
    setPreviousReceipt(null);
    setCheckoutStatus('idle');
    setCheckoutError(null);
    setClosetSyncWarning(null);
  }, []);

  const value: ClosetMobileValue = {
    userId,
    profile,
    items,
    byCategory,
    outfits,
    closetStatus,
    closetError,
    refreshCloset,
    region,
    setRegion,
    city,
    setCity,
    tempC,
    setTempC,
    portraitStatus,
    portraitError,
    uploadPortrait,
    saveClosetItem,
    stylistStatus,
    stylistError,
    lastRules,
    lastProvider,
    loadDailyOutfits,
    selectedOutfitId,
    setSelectedOutfitId,
    draftCombo,
    setDraftCombo,
    lastTryon,
    tryonStatus,
    tryonError,
    runTryon,
    favorites,
    toggleFavorite,
    bodyAnchors,
    setBodyAnchors,
    wearCounts,
    registerWear,
    styleVotes,
    addStyleVote,
    styleDna,
    lines,
    totalUnits,
    localDiscountPct,
    addLine,
    updateQuantity,
    removeLine,
    clearBox,
    boxRegion,
    setBoxRegion,
    boxCustomer,
    setBoxCustomer,
    quote,
    quotedBox,
    quoteStatus,
    quoteFresh,
    quoteError,
    retryQuote,
    checkoutStatus,
    checkoutError,
    receipt,
    previousReceipt,
    optimisticSubtotal,
    lastPaidBoxId,
    closetSyncWarning,
    checkout,
    dismissReceipt,
    activeCustomerRole,
    setActiveCustomerRole,
    companyName: companyState.companyName,
    setCompanyName,
    ruc: companyState.ruc,
    setRuc,
    paymentMode,
    setPaymentMode,
    myPlantOrders,
    plantOrdersStatus,
    plantOrdersError,
    refreshPlantOrders,
    settleBalance,
    settleStatus,
  };

  return <ClosetMobileContext.Provider value={value}>{children}</ClosetMobileContext.Provider>;
}

export function useClosetMobile(): ClosetMobileValue {
  const ctx = useContext(ClosetMobileContext);
  if (!ctx) throw new Error('useClosetMobile debe usarse dentro de <ClosetMobileProvider>');
  return ctx;
}
