import type {
  BoxQuoteBreakdown,
  BoxQuoteInput,
  ClimateStylingRules,
  ClosetItemCreateInput,
  ClosetOutfit,
  CustomDesign,
  DesignSaveInput,
  EcuadorRegion,
  ErpProductionOrder,
  FinancialLedgerEntry,
  GarmentCategory,
  GarmentTemplate,
  GumoroseBox,
  MlProductRecommendation,
  MlRegisterOrLoginInput,
  MlUserPreferenceRecord,
  PaymentMode,
  SriElectronicInvoice,
  UserClosetItem,
  UserProfile,
  UserRole,
} from '@gumorose/shared';

/* ------------------------------------------------------------------ */
/* Identidad móvil (Diagrama 2: CLIENTE_B2C / CLIENTE_B2B)              */
/* ------------------------------------------------------------------ */

/** Rol activo + user-id que viajan en cada petición (cabeceras RBAC). */
export interface MobileAuth {
  userId: string;
  role: Extract<UserRole, 'CLIENTE_B2C' | 'CLIENTE_B2B'>;
}

let mobileAuth: MobileAuth = { userId: '', role: 'CLIENTE_B2C' };

/** Fija la identidad que envían todas las peticiones (selector de rol). */
export function setMobileAuth(auth: MobileAuth): void {
  mobileAuth = { ...auth };
}

/** Identidad actual (cabeceras que viajan al API). */
export function getMobileAuth(): MobileAuth {
  return { ...mobileAuth };
}

/* ------------------------------------------------------------------ */
/* Respuestas del backend                                              */
/* ------------------------------------------------------------------ */

export interface CatalogResponse {
  total: number;
  items: GarmentTemplate[];
}

export interface CatalogFilters {
  region?: EcuadorRegion;
  category?: GarmentCategory;
  q?: string;
}

export interface ClosetResponse {
  profile: UserProfile;
  totalItems: number;
  byCategory: Record<string, UserClosetItem[]>;
  outfits: ClosetOutfit[];
}

export interface BodyPhotoResponse {
  profile: UserProfile;
  segmentation: { cached: boolean; cacheKey: string };
}

export interface ClosetItemResponse {
  item: UserClosetItem;
  cutoutCacheKey?: string;
}

export interface DailyOutfitsResponse {
  provider: 'meta' | 'mock';
  model: string;
  rules: ClimateStylingRules;
  outfits: ClosetOutfit[];
}

export interface TryonResponse {
  provider: 'meta' | 'mock';
  cached: boolean;
  cacheKey: string;
  tryonImageUrl: string;
  pipeline: string[];
  outfitId: string;
}

export interface LogoImage {
  url: string;
  seed: string;
}

export interface LogoGenResponse {
  provider: 'meta' | 'mock';
  model: string;
  images: LogoImage[];
}

export interface QuoteLine {
  designId: string;
  garmentId: string;
  garmentName: string;
  category: GarmentCategory;
  quantity: number;
  logosCount: number;
  unitPriceUsd: number;
  lineTotalUsd: number;
  size?: string;
  color?: string;
}

export interface BoxDetail extends GumoroseBox {
  lines: QuoteLine[];
  /** Creación ISO: el historial se ordena de más reciente a más antigua. */
  createdAt?: string;
}

export interface QuoteResponse {
  box: BoxDetail;
  lines: QuoteLine[];
  quote: BoxQuoteBreakdown;
}

/** Respuesta del checkout con el gancho ERP (OP-XXXX, asiento, tela). */
export interface CheckoutBoxResponse extends BoxDetail {
  erpOrder?: ErpProductionOrder;
  ledger?: FinancialLedgerEntry;
  fabricMeters?: number;
  sriInvoice?: SriElectronicInvoice;
}

export type { MlProductRecommendation, MlUserPreferenceRecord, SriElectronicInvoice };

export interface MlRegisterResponse {
  user: MlUserPreferenceRecord;
  profile: MlUserPreferenceRecord;
  recommendations: MlProductRecommendation[];
  recommendedSize?: string;
}

export interface SriInvoicesResponse {
  total: number;
  items: SriElectronicInvoice[];
}

/** Órdenes propias del comprador en la planta de Riobamba (11 etapas). */
export interface MyPlantOrdersResponse {
  total: number;
  items: ErpProductionOrder[];
}

/** Historial de cajas con su orden ERP asociada (si ya pagó). */
export interface BoxesHistoryResponse {
  total: number;
  items: (BoxDetail & { erpOrder?: ErpProductionOrder })[];
}

/* ------------------------------------------------------------------ */
/* Núcleo HTTP                                                         */
/* ------------------------------------------------------------------ */

export class MobileApiError extends Error {
  status: number;
  issues?: unknown;

  constructor(message: string, status: number, issues?: unknown) {
    super(message);
    this.name = 'MobileApiError';
    this.status = status;
    this.issues = issues;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(mobileAuth.userId ? { 'x-gumorose-user-id': mobileAuth.userId } : {}),
        ...(mobileAuth.role ? { 'x-gumorose-role': mobileAuth.role } : {}),
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    throw new MobileApiError('Sin conexión con la API. Verifica que esté en línea.', 0);
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const message =
      typeof body.error === 'string' ? body.error : `La API respondió ${res.status}`;
    throw new MobileApiError(message, res.status, body.issues);
  }
  return body as T;
}

function query(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

/* ------------------------- clóset y retrato ------------------------- */

/** GET /api/closet/:userId — prendas por categoría + outfits. */
export function fetchCloset(userId: string): Promise<ClosetResponse> {
  return request<ClosetResponse>(`/api/closet/${userId}`);
}

/** POST /api/closet/body-photo — retrato + máscara SAM 3.1. */
export function uploadBodyPhoto(
  userId: string,
  fullBodyPhotoBase64: string,
  city: string,
  region: EcuadorRegion,
): Promise<BodyPhotoResponse> {
  return request<BodyPhotoResponse>('/api/closet/body-photo', {
    method: 'POST',
    body: JSON.stringify({ userId, fullBodyPhotoBase64, city, region }),
  });
}

/** POST /api/closet/items — guarda una prenda (recorte SAM 3.1 si llega foto). */
export function addClosetItem(input: ClosetItemCreateInput): Promise<ClosetItemResponse> {
  return request<ClosetItemResponse>('/api/closet/items', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export interface StyleShuffleVoteResponse {
  totalVotes: number;
  userVotes: number;
  styleDna: Record<string, number>;
  region: EcuadorRegion;
}

/** POST /api/closet/style-shuffle-vote — alimenta Hybrid Designs en el ERP. */
export function postStyleShuffleVote(
  userId: string,
  vote: { itemId: string; liked: boolean; styleTag: string; timestamp: string },
  region: EcuadorRegion,
): Promise<StyleShuffleVoteResponse> {
  return request<StyleShuffleVoteResponse>('/api/closet/style-shuffle-vote', {
    method: 'POST',
    body: JSON.stringify({ ...vote, userId, region }),
  });
}

/* ------------------------------ agentes IA ------------------------------ */

/** POST /api/ai/daily-outfits — combinaciones climáticas (Muse Spark). */
export function fetchDailyOutfits(
  userId: string,
  region: EcuadorRegion,
  tempC: number,
  maxOutfits = 3,
): Promise<DailyOutfitsResponse> {
  return request<DailyOutfitsResponse>('/api/ai/daily-outfits', {
    method: 'POST',
    body: JSON.stringify({ userId, region, tempC, maxOutfits }),
  });
}

/** POST /api/ai/virtual-tryon — viste el retrato (SAM 3.1 + Muse Wonder). */
export function virtualTryon(userId: string, outfitId: string): Promise<TryonResponse> {
  return request<TryonResponse>('/api/ai/virtual-tryon', {
    method: 'POST',
    body: JSON.stringify({ userId, outfitId }),
  });
}

/** POST /api/ai/generate-logo — logos con Muse Image. */
export function generateLogo(
  prompt: string,
  style?: string,
  count = 1,
): Promise<LogoGenResponse> {
  return request<LogoGenResponse>('/api/ai/generate-logo', {
    method: 'POST',
    body: JSON.stringify({ prompt, style, count }),
  });
}

/* --------------------------- estudio y compra --------------------------- */

/** GET /api/catalog — catálogo público con filtros. */
export function fetchCatalog(filters: CatalogFilters = {}): Promise<CatalogResponse> {
  return request<CatalogResponse>(
    `/api/catalog${query({
      region: filters.region,
      category: filters.category,
      q: filters.q,
    })}`,
  );
}

/** POST /api/studio/custom-design — guarda un diseño multi-logo. */
export function saveCustomDesign(input: DesignSaveInput): Promise<CustomDesign> {
  return request<CustomDesign>('/api/studio/custom-design', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** POST /api/boxes/quote — cotiza la Caja In-App. */
export function quoteBox(input: BoxQuoteInput): Promise<QuoteResponse> {
  return request<QuoteResponse>('/api/boxes/quote', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export interface CheckoutBoxOptions {
  customerRole?: UserRole;
  buyerUserId?: string;
  paymentMode?: PaymentMode;
}

/** POST /api/boxes/checkout — paga la caja (dispara el hook ERP: OP-XXXX). */
export function checkoutBox(
  boxId: string,
  paymentMethod = 'mock',
  options: CheckoutBoxOptions = {},
): Promise<CheckoutBoxResponse> {
  return request<CheckoutBoxResponse>('/api/boxes/checkout', {
    method: 'POST',
    body: JSON.stringify({ boxId, paymentMethod, ...options }),
  });
}

/** GET /api/erp/orders — órdenes propias del comprador (11 etapas). */
export function fetchMyPlantOrders(): Promise<MyPlantOrdersResponse> {
  return request<MyPlantOrdersResponse>('/api/erp/orders');
}

/** POST /api/erp/orders/:id/settle-balance — liquida el 50% B2B restante. */
export function settleOrderBalance(orderId: string): Promise<ErpProductionOrder> {
  return request<ErpProductionOrder>(`/api/erp/orders/${orderId}/settle-balance`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

/** POST /api/auth/register-or-login — perfilado ML móvil. */
export function registerOrLoginMl(input: MlRegisterOrLoginInput): Promise<MlRegisterResponse> {
  return request<MlRegisterResponse>('/api/auth/register-or-login', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** GET /api/ml/recommendations/:userId — afinidad ML por prenda. */
export function fetchMlRecommendations(userId: string): Promise<{
  user: MlUserPreferenceRecord;
  recommendations: MlProductRecommendation[];
}> {
  return request(`/api/ml/recommendations/${userId}`);
}

/** GET /api/sri/invoices — facturas SRI del comprador. */
export function fetchSriInvoices(filters: {
  boxId?: string;
  orderCode?: string;
  orderId?: string;
} = {}): Promise<SriInvoicesResponse> {
  return request<SriInvoicesResponse>(`/api/sri/invoices${query(filters)}`);
}

export function sriRideUrl(id: string): string {
  return `/api/sri/invoices/${id}/ride`;
}
export function sriXmlUrl(id: string): string {
  return `/api/sri/invoices/${id}/xml`;
}

/** GET /api/boxes/orders — historial de cajas con su orden ERP asociada. */
export function fetchBoxesHistory(customerName?: string): Promise<BoxesHistoryResponse> {
  const q = customerName ? `?customerName=${encodeURIComponent(customerName)}` : '';
  return request<BoxesHistoryResponse>(`/api/boxes/orders${q}`);
}
