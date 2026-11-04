import type {
  BoxQuoteBreakdown,
  BoxQuoteInput,
  CustomDesign,
  DesignSaveInput,
  EcuadorRegion,
  ErpFinancialSummary,
  ErpProductionOrder,
  ErpWebhookEvent,
  FinancialLedgerEntry,
  GarmentCategory,
  GarmentCreateInput,
  GarmentTemplate,
  GumoroseBox,
  MlDatasetCluster,
  MlProductRecommendation,
  MlRegisterOrLoginInput,
  MlUserPreferenceRecord,
  PaymentMode,
  PlantMachineStatus,
  PlantProductionStage,
  SriElectronicInvoice,
  SupplyPurchaseAlert,
  SystemUser,
  UserRole,
} from '@gumorose/shared';

/* ------------------------------------------------------------------ */
/* Identidad comercial (Diagrama 3: CLIENTE_B2C / CLIENTE_B2B)          */
/* ------------------------------------------------------------------ */

/** Rol activo + user-id que viajan en cada petición (cabeceras RBAC). */
export interface WebAuth {
  userId: string;
  role: Extract<UserRole, 'CLIENTE_B2C' | 'CLIENTE_B2B'>;
}

let webAuth: WebAuth = { userId: '', role: 'CLIENTE_B2C' };

/** Fija la identidad comercial que envían todas las peticiones. */
export function setWebAuth(auth: WebAuth): void {
  webAuth = { ...auth };
}

/** Identidad comercial actual (cabeceras que viajan al API). */
export function getWebAuth(): WebAuth {
  return { ...webAuth };
}

/* ------------------------------------------------------------------ */
/* Identidad administrativa (Diagrama 4: portal ERP)                    */
/* ------------------------------------------------------------------ */

/** Rol administrativo activo en el portal ERP (4 roles oficiales). */
export type AdminRole = Extract<
  UserRole,
  'SUPER_ADMIN' | 'ADMIN_GERENCIA' | 'ADMIN_BODEGA' | 'ADMIN_PLANTA'
>;

export interface AdminAuth {
  userId: string;
  role: AdminRole;
}

let adminAuth: AdminAuth | null = null;

/** Fija la identidad administrativa (tiene prioridad sobre la comercial). */
export function setAdminAuth(auth: AdminAuth | null): void {
  adminAuth = auth ? { ...auth } : null;
}

/** Identidad administrativa actual (`null` = fuera del portal ERP). */
export function getAdminAuth(): AdminAuth | null {
  return adminAuth ? { ...adminAuth } : null;
}

/** Cabeceras RBAC efectivas: admin si está en el portal, si no la comercial. */
export function getEffectiveAuth(): { userId: string; role: string } {
  return adminAuth ?? webAuth;
}

/* ------------------------------------------------------------------ */
/* Tipos de respuesta del backend (según apps/api/src/routes/*.ts)     */
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

export interface PlantSummary {
  total: number;
  activas: number;
  mantenimiento: number;
  inactivas: number;
  porTipo: Record<string, number>;
}

export interface PlantStatusResponse {
  planta: string;
  resumen: PlantSummary;
  colaTotalMinutos: number;
  maquinas: PlantMachineStatus[];
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
  extraMachineMinutesPerUnit?: number;
  size?: string;
  color?: string;
}

/** Caja persistida con sus líneas (ver `StoredBox` en apps/api/src/store.ts). */
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

export interface LogoImage {
  url: string;
  seed: string;
}

export interface LogoGenResponse {
  provider: 'meta' | 'mock';
  model: string;
  images: LogoImage[];
}

export interface TechpackStep {
  orden: number;
  etapa: string;
  maquina: string;
  detalle: string;
  minutosEstimados: number;
}

export interface TechpackResponse {
  provider: 'meta' | 'mock';
  model: string;
  boxId: string;
  ordenProduccion: string;
  pasos: TechpackStep[];
  controlCalidad: string[];
}

/* ------------------------------------------------------------------ */
/* Núcleo HTTP                                                         */
/* ------------------------------------------------------------------ */

export class ApiError extends Error {
  status: number;
  issues?: unknown;

  constructor(message: string, status: number, issues?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.issues = issues;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  const identity = getEffectiveAuth();
  try {
    res = await fetch(path, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(identity.userId ? { 'x-gumorose-user-id': identity.userId } : {}),
        ...(identity.role ? { 'x-gumorose-role': identity.role } : {}),
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    throw new ApiError('No se pudo contactar al backend. Verifica que la API esté en línea.', 0);
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const message = typeof body.error === 'string' ? body.error : `La API respondió ${res.status}`;
    throw new ApiError(message, res.status, body.issues);
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

/* ------------------------------------------------------------------ */
/* Catálogo y CMS                                                      */
/* ------------------------------------------------------------------ */

/** GET /api/catalog con filtro opcional de región y categoría. */
export function fetchCatalog(filters: CatalogFilters = {}): Promise<CatalogResponse> {
  return request<CatalogResponse>(
    `/api/catalog${query({
      region: filters.region,
      category: filters.category,
      q: filters.q,
    })}`,
  );
}

/** GET /api/cms/garments — lectura del CMS propio (incluye inactivas). */
export function fetchCmsGarments(): Promise<CatalogResponse> {
  return request<CatalogResponse>('/api/cms/garments');
}

/** POST /api/cms/garments — alta de prenda en el catálogo. */
export function createGarment(input: GarmentCreateInput): Promise<GarmentTemplate> {
  return request<GarmentTemplate>('/api/cms/garments', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** PUT /api/cms/garments/:id — actualización parcial de una prenda. */
export function updateGarment(
  id: string,
  input: Partial<GarmentCreateInput>,
): Promise<GarmentTemplate> {
  return request<GarmentTemplate>(`/api/cms/garments/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

/** PATCH /api/cms/garments/:id/toggle — activa/desactiva una prenda en 1 clic. */
export function toggleGarment(id: string): Promise<GarmentTemplate> {
  return request<GarmentTemplate>(`/api/cms/garments/${id}/toggle`, {
    method: 'PATCH',
  });
}

export interface MaterialItem {
  id: string;
  sku: string;
  name: string;
  kind: 'TELA' | 'HILO' | 'TINTA' | 'VINIL' | 'BOTON' | 'CIERRE' | 'ETIQUETA' | 'EMPAQUE';
  color?: string;
  unit: 'm' | 'kg' | 'rollo' | 'litro' | 'unidad' | 'caja';
  stockQty: number;
  minStockQty: number;
  unitCostUsd: number;
}

export interface MaterialsResponse {
  total: number;
  bajoStock: number;
  items: MaterialItem[];
}

export interface MaterialCreateInput {
  sku: string;
  name: string;
  kind: MaterialItem['kind'];
  color?: string;
  unit: MaterialItem['unit'];
  stockQty: number;
  minStockQty: number;
  unitCostUsd: number;
}

/** GET /api/cms/materials — stock de telas e insumos de la bodega Riobamba. */
export function fetchMaterials(): Promise<MaterialsResponse> {
  return request<MaterialsResponse>('/api/cms/materials');
}

/** POST /api/cms/materials — alta de materia prima en bodega. */
export function createMaterial(input: MaterialCreateInput): Promise<MaterialItem> {
  return request<MaterialItem>('/api/cms/materials', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** PATCH /api/cms/materials/:id — actualiza metros/stock disponible. */
export function updateMaterialStock(
  id: string,
  patch: { stockQty?: number; minStockQty?: number; unitCostUsd?: number },
): Promise<MaterialItem> {
  return request<MaterialItem>(`/api/cms/materials/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

/** GET /api/cms/plant-status — estado de la planta de Riobamba. */
export function fetchPlantStatus(): Promise<PlantStatusResponse> {
  return request<PlantStatusResponse>('/api/cms/plant-status');
}

/* ------------------------------------------------------------------ */
/* Estudio de personalización                                          */
/* ------------------------------------------------------------------ */

/** POST /api/studio/custom-design — guarda un diseño multi-logo. */
export function saveCustomDesign(input: DesignSaveInput): Promise<CustomDesign> {
  return request<CustomDesign>('/api/studio/custom-design', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** POST /api/ai/generate-logo — genera logos con Meta Muse Image. */
export function generateLogo(prompt: string, style?: string, count = 1): Promise<LogoGenResponse> {
  return request<LogoGenResponse>('/api/ai/generate-logo', {
    method: 'POST',
    body: JSON.stringify({ prompt, style, count }),
  });
}

/* ------------------------------------------------------------------ */
/* Cajas Gumorose                                                      */
/* ------------------------------------------------------------------ */

/** POST /api/boxes/quote — cotiza y persiste la caja como COTIZADA. */
export function quoteBox(input: BoxQuoteInput): Promise<QuoteResponse> {
  return request<QuoteResponse>('/api/boxes/quote', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** GET /api/boxes/:id — consulta una caja. */
export function fetchBox(id: string): Promise<BoxDetail> {
  return request<BoxDetail>(`/api/boxes/${id}`);
}

export interface OrdersQuery {
  customerName?: string;
  status?: GumoroseBox['status'];
}

/** Caja con su orden ERP asociada (si ya pagó y disparó el hook). */
export interface BoxWithErp extends BoxDetail {
  erpOrder?: ErpProductionOrder;
}

export interface OrdersResponse {
  total: number;
  items: BoxWithErp[];
}

/** GET /api/boxes/orders — historial de órdenes/cajas del usuario. */
export function fetchBoxOrders(queryParams: OrdersQuery = {}): Promise<OrdersResponse> {
  return request<OrdersResponse>(
    `/api/boxes/orders${query({ customerName: queryParams.customerName, status: queryParams.status })}`,
  );
}

export interface CheckoutBoxOptions {
  customerRole?: UserRole;
  buyerUserId?: string;
  paymentMode?: PaymentMode;
}

/** Respuesta del checkout con el gancho ERP (OP-XXXX, asiento, tela). */
export interface CheckoutBoxResponse extends BoxDetail {
  erpOrder?: ErpProductionOrder;
  ledger?: FinancialLedgerEntry;
  fabricMeters?: number;
  sriInvoice?: SriElectronicInvoice;
}

export type { MlProductRecommendation, MlUserPreferenceRecord, SriElectronicInvoice };

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

/** Órdenes de planta del comprador (11 etapas, Sello Azul, saldo 50/50). */
export interface CustomerPlantOrdersResponse {
  total: number;
  items: ErpProductionOrder[];
}

/** GET /api/erp/orders — órdenes propias del comprador en Riobamba. */
export function fetchCustomerPlantOrders(): Promise<CustomerPlantOrdersResponse> {
  return request<CustomerPlantOrdersResponse>('/api/erp/orders');
}

/** POST /api/erp/orders/:id/settle-balance — liquida el 50% B2B restante. */
export function settleWebOrderBalance(orderId: string): Promise<ErpProductionOrder> {
  return request<ErpProductionOrder>(`/api/erp/orders/${orderId}/settle-balance`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

/** POST /api/ai/plant-techpack — ficha técnica (Muse Spark) de una caja PAGADA. */
export function generateTechpack(boxId: string): Promise<TechpackResponse> {
  return request<TechpackResponse>('/api/ai/plant-techpack', {
    method: 'POST',
    body: JSON.stringify({ boxId }),
  });
}

/* ------------------------------------------------------------------ */
/* Portal ERP — Diagrama 4 (gobierno, planta, bodega, finanzas)         */
/* ------------------------------------------------------------------ */

/** Orden de producción con su etapa (alias para las consolas ERP). */
export type { ErpProductionOrder, PlantProductionStage };

export interface SystemUsersResponse {
  total: number;
  items: SystemUser[];
}

export interface SystemUserCreatePayload {
  name: string;
  email: string;
  role: UserRole;
  companyName?: string;
  ruc?: string;
  active?: boolean;
}

/** GET /api/superadmin/users — gobierno (SUPER_ADMIN). */
export function fetchSystemUsers(): Promise<SystemUsersResponse> {
  return request<SystemUsersResponse>('/api/superadmin/users');
}

/** POST /api/superadmin/users — alta de personal (SUPER_ADMIN). */
export function createSystemUser(payload: SystemUserCreatePayload): Promise<SystemUser> {
  return request<SystemUser>('/api/superadmin/users', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** PATCH /api/superadmin/users/:id/role — rol y/o estado (SUPER_ADMIN). */
export function updateSystemUserRole(
  userId: string,
  patch: { role?: UserRole; active?: boolean },
): Promise<SystemUser> {
  return request<SystemUser>(`/api/superadmin/users/${userId}/role`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export interface ErpOrdersResponse {
  total: number;
  items: ErpProductionOrder[];
}

export interface AdvanceStagePayload {
  approve?: boolean;
  notes?: string;
}

/** GET /api/erp/orders — órdenes de planta (según matriz RBAC del rol). */
export function fetchErpOrders(): Promise<ErpOrdersResponse> {
  return request<ErpOrdersResponse>('/api/erp/orders');
}

/** POST /api/erp/orders/:id/advance-stage — avanza 1 etapa (o decide calidad). */
export function advanceErpOrderStage(
  orderId: string,
  payload: AdvanceStagePayload = {},
): Promise<ErpProductionOrder> {
  return request<ErpProductionOrder>(`/api/erp/orders/${orderId}/advance-stage`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** POST /api/erp/orders/:id/settle-balance — liquida el 50% B2B pendiente. */
export function settleErpOrderBalance(orderId: string): Promise<ErpProductionOrder> {
  return request<ErpProductionOrder>(`/api/erp/orders/${orderId}/settle-balance`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export interface BodegaAlertsResponse {
  totalMaterials: number;
  lowStock: number;
  items: MaterialItem[];
  lowStockItems: MaterialItem[];
  totalFabricConsumedMeters: number;
  activeAlerts: number;
  alerts: SupplyPurchaseAlert[];
  supplier: string;
}

/** GET /api/erp/bodega/alerts — stock, consumo y alertas Neymatex. */
export function fetchBodegaAlerts(): Promise<BodegaAlertsResponse> {
  return request<BodegaAlertsResponse>('/api/erp/bodega/alerts');
}

export interface FinanceSummaryResponse {
  summary: ErpFinancialSummary;
  entries: FinancialLedgerEntry[];
  recentEvents: ErpWebhookEvent[];
  eventLogSize: number;
}

/** GET /api/erp/finance/summary — Estado de Resultados + Event Bus. */
export function fetchErpFinanceSummary(): Promise<FinanceSummaryResponse> {
  return request<FinanceSummaryResponse>('/api/erp/finance/summary');
}

/* ---------------- Inteligencia Stitch Fix & Blue Ocean ---------------- */

export interface ClosetGapItem {
  region: string;
  closetCategory: string;
  garmentCategory: string;
  deficitPct: number;
  usersCount: number;
  closetItemsCount: number;
  estimatedDemandUnits: number;
  label: string;
  advice: string;
}

export interface HybridRecommendation {
  id: string;
  name: string;
  slug: string;
  region: string;
  category: string;
  visualVariant?: string;
  styleTag: string;
  colorName: string;
  colorHex: string;
  fabricName: string;
  fabricMetersPerUnit: number;
  fabricMetersTotal: number;
  estimatedDemandUnits: number;
  mpdPerUnitUsd: number;
  modPerUnitUsd: number;
  cifPerUnitUsd: number;
  productionCostPerUnitUsd: number;
  suggestedPriceUsd: number;
  marginPct: number;
  baseTimeMinutes: number;
  rationale: string;
}

export interface StitchFixInsightsResponse {
  generatedAt: string;
  closetGapsByRegion: Record<string, ClosetGapItem[]>;
  hybridDesignRecommendations: HybridRecommendation[];
  blueOceanMetrics: {
    madeToOrderDeadInventoryPct: number;
    traditionalRetailDeadInventoryPct: number;
    plantMachines: number;
    avgProductionMinutesPerUnit: number;
    totalPlantQueueMinutes: number;
    totalUsers: number;
    closetActiveUsers: number;
    closetRetentionPct: number;
    avgCostPerWearUsd: number;
    totalStyleVotes: number;
    likedVotes: number;
    likedPct: number;
    cmsMonthlyCostUsd: number;
    strategyCanvas: { factor: string; gumorose: string; traditionalRetail: string }[];
  };
  styleDnaGlobal: Record<string, number>;
  totals: { users: number; closetItems: number; styleVotes: number; orders: number };
}

export interface LaunchHybridResponse {
  garment: GarmentTemplate;
  productionOrder: { orderCode: string; quantity: number; fabricMeters: number } | null;
  catalogTotal: number;
  message: string;
}

/** GET /api/erp/intelligence/stitch-fix-insights — gaps + hybrids + Blue Ocean. */
export function fetchStitchFixInsights(): Promise<StitchFixInsightsResponse> {
  return request<StitchFixInsightsResponse>('/api/erp/intelligence/stitch-fix-insights');
}

/** POST /api/erp/intelligence/launch-hybrid-design — publica en el catálogo en 1 clic. */
export function launchHybridDesign(input: {
  recommendationId: string;
  openProductionLot?: boolean;
  quantity?: number;
}): Promise<LaunchHybridResponse> {
  return request<LaunchHybridResponse>('/api/erp/intelligence/launch-hybrid-design', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/* ------------------------------------------------------------------ */
/* Clóset del sujeto de pruebas (sincronizado con la App Móvil)          */
/* ------------------------------------------------------------------ */

/** Mismo usuario demo que viste la App Móvil (sincronización Móvil ⇄ Web). */
export const DEMO_SUBJECT_USER_ID = '7d4f3b2a-1c5e-4a8f-9b3d-2e6f5a4c1d9e';

export interface ClosetProfileResponse {
  profile: {
    id: string;
    fullBodyPhotoUrl?: string;
    bodySegmentationMaskUrl?: string;
    currentRegion: string;
    city: string;
  };
  totalItems: number;
  byCategory: Record<string, unknown[]>;
  outfits: unknown[];
}

/** GET /api/closet/:userId — foto de cuerpo completo subida en el móvil. */
export function fetchClosetProfile(userId: string): Promise<ClosetProfileResponse> {
  return request<ClosetProfileResponse>(`/api/closet/${userId}`);
}

export interface AiConfigResponse {
  mode: 'LIVE_META_API' | 'LOCAL_SIMULATION';
  baseUrl: string;
  model: string;
  modelOptions: string[];
  hasApiKey: boolean;
  apiKeyHint: string;
  calls: number;
  cacheHits: number;
  cacheSavedUsd: number;
  tokens: number;
  lastLatencyMs: number;
  creditsUsd: number;
}

/** GET /api/superadmin/ai-config — estado del Motor Meta AI (SUPER_ADMIN). */
export function fetchAiConfig(): Promise<AiConfigResponse> {
  return request<AiConfigResponse>('/api/superadmin/ai-config');
}

/* ------------------------------------------------------------------ */
/* Auth ML + Dataset + Facturación SRI                                   */
/* ------------------------------------------------------------------ */

export interface MlRegisterResponse {
  user: MlUserPreferenceRecord;
  profile: MlUserPreferenceRecord;
  recommendations: MlProductRecommendation[];
  recommendedSize?: string;
}

export interface MlRecommendationsResponse {
  user: MlUserPreferenceRecord;
  recommendations: MlProductRecommendation[];
}

export interface MlDatasetResponse {
  total: number;
  records: MlUserPreferenceRecord[];
  clusters: MlDatasetCluster[];
  metrics: Record<string, unknown>;
}

export interface SriInvoicesResponse {
  total: number;
  items: SriElectronicInvoice[];
}

/** POST /api/auth/register-or-login — perfilado ML con Cédula/RUC. */
export function registerOrLoginMl(input: MlRegisterOrLoginInput): Promise<MlRegisterResponse> {
  return request<MlRegisterResponse>('/api/auth/register-or-login', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** GET /api/ml/recommendations/:userId — prendas ordenadas por afinidad ML. */
export function fetchMlRecommendations(userId: string): Promise<MlRecommendationsResponse> {
  return request<MlRecommendationsResponse>(`/api/ml/recommendations/${userId}`);
}

/** GET /api/ml/dataset — dataset + clústeres para el ERP. */
export function fetchMlDataset(): Promise<MlDatasetResponse> {
  return request<MlDatasetResponse>('/api/ml/dataset');
}

async function requestText(path: string): Promise<string> {
  const identity = getEffectiveAuth();
  const res = await fetch(path, {
    headers: {
      ...(identity.userId ? { 'x-gumorose-user-id': identity.userId } : {}),
      ...(identity.role ? { 'x-gumorose-role': identity.role } : {}),
    },
  }).catch(() => {
    throw new ApiError('No se pudo contactar al backend.', 0);
  });
  if (!res.ok) throw new ApiError(`La API respondió ${res.status}`, res.status);
  return res.text();
}

/** GET /api/ml/dataset/export-csv — descarga CSV para ciencia de datos. */
export function fetchMlDatasetCsv(): Promise<string> {
  return requestText('/api/ml/dataset/export-csv');
}

/** GET /api/sri/status — estado del microservicio SRI. */
export function fetchSriStatus(): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>('/api/sri/status');
}

/** GET /api/sri/invoices — facturas SRI (filtros comprador/caja/orden). */
export function fetchSriInvoices(filters: {
  boxId?: string;
  orderCode?: string;
  orderId?: string;
  comprador?: string;
  q?: string;
} = {}): Promise<SriInvoicesResponse> {
  return request<SriInvoicesResponse>(`/api/sri/invoices${query(filters)}`);
}

/** POST /api/sri/invoices/emit — emisión o re-emisión manual SRI. */
export function emitSriInvoice(input: {
  orderId?: string;
  orderCode?: string;
  boxId?: string;
}): Promise<SriElectronicInvoice> {
  return request<SriElectronicInvoice>('/api/sri/invoices/emit', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function sriRideUrl(id: string): string {
  return `/api/sri/invoices/${id}/ride`;
}
export function sriXmlUrl(id: string): string {
  return `/api/sri/invoices/${id}/xml`;
}

/** POST /api/superadmin/ai-config — configura Meta AI en caliente. */
export function updateAiConfig(payload: {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}): Promise<AiConfigResponse> {
  return request<AiConfigResponse>('/api/superadmin/ai-config', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
