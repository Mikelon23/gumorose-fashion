/**
 * Tipos compartidos de Gumorose Platform.
 * Reflejan el esquema PostgreSQL (`schema.sql`) y alimentan
 * al pricing-engine, los validadores y la API CMS.
 */

/** Regiones de envío dentro de Ecuador. */
export type EcuadorRegion = 'COSTA' | 'SIERRA' | 'ORIENTE';

/** Categorías de prenda base del catálogo. */
export type GarmentCategory = 'CAMISETA' | 'POLO' | 'CAMISA' | 'PANTALON';

/** Tallas de letra oficiales. Las tallas numéricas/UNICA siguen como string libre. */
export type GarmentSize = 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL';

/** Corte preferido del usuario (perfilado ML). */
export type PreferredFit = 'TAILORED' | 'RELAXED' | 'OVERSIZE';
export type MlPreferredFit = PreferredFit;

/** Ajuste de género declarado en el perfilado. */
export type MlGenderFit = 'FEMENINO' | 'MASCULINO' | 'UNISEX';

/**
 * Molde visual del renderizador textil volumétrico (según el modelo):
 * los 3 pantalones (Chino, Cargo, Jogger) + Hoodie, Chaqueta y Gorra.
 * Es aditivo: las prendas sin variante usan la silueta de su categoría.
 */
export type GarmentVisualVariant =
  | 'CAMISETA'
  | 'CUELLO_V'
  | 'POLO'
  | 'CAMISA'
  | 'CHINO'
  | 'CARGO'
  | 'JOGGER'
  | 'HOODIE'
  | 'CHAQUETA'
  | 'GORRA';

/** Zonas permitidas para colocar un logo sobre la prenda. */
export type LogoZone = 'PECHO_IZQ' | 'PECHO_DER' | 'CENTRO' | 'ESPALDA' | 'MANGA_IZQ' | 'MANGA_DER';

/** Técnicas de estampado disponibles en planta. */
export type PrintTechnique = 'SERIGRAFIA' | 'SUBLIMADO' | 'VINIL';

/** Colocación de un logo sobre el lienzo 2D de la prenda (unidades en cm). */
export interface LogoPlacement {
  id: string;
  logoUrl: string;
  zone: LogoZone;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  technique: PrintTechnique;
}

/** Prenda base del catálogo (tabla `catalog_garments`). */
export interface GarmentTemplate {
  id: string;
  slug: string;
  name: string;
  category: GarmentCategory;
  description: string;
  /** Costo de producción en USD (ej. camiseta 6.56, camisa 12.85). */
  baseProductionCost: number;
  /** Margen comercial en % (ej. camiseta 32, camisa 30). */
  baseMarginPct: number;
  /** Precio de venta base en USD (ej. camiseta 8.65, camisa 16.71). */
  baseSalePrice: number;
  /** Tiempo total base de máquina en minutos por unidad. */
  baseTimeMinutes: number;
  sewingMinutes: number;
  finishingMinutes: number;
  sizes: string[];
  colors: string[];
  recommendedRegions: EcuadorRegion[];
  climateNote: string;
  imageUrl?: string;
  frontMockupUrl?: string;
  backMockupUrl?: string;
  /** Molde visual volumétrico (Chino/Cargo/Jogger/Hoodie/Chaqueta/Gorra). */
  visualVariant?: GarmentVisualVariant;
  active: boolean;
}

/** Diseño personalizado multi-logo (tabla `custom_designs`). */
export interface CustomDesign {
  id: string;
  garmentId: string;
  name: string;
  customerName?: string;
  customerPhotoUrl?: string;
  size: string;
  color: string;
  logos: LogoPlacement[];
  previewUrl?: string;
  tryonImageUrl?: string;
}

/**
 * Detalle de una prenda comprada, visible en "Mis Pedidos" y en "Planta".
 * Incluye talla, color HEX, cantidades, precios y personalización multi-logo.
 */
export interface OrderItemDetail {
  designId: string;
  garmentId: string;
  garmentName: string;
  category: GarmentCategory;
  /** Slug del catálogo (funciona como SKU visible). */
  garmentSlug?: string;
  size?: string;
  color?: string;
  quantity: number;
  logosCount: number;
  unitPriceUsd: number;
  lineTotalUsd: number;
  designLogos?: Pick<LogoPlacement, 'zone' | 'technique'>[];
}

/** Ítem dentro de una Caja Gumorose. */
export interface BoxItemInput {
  designId: string;
  garment: Pick<GarmentTemplate, 'id' | 'category' | 'baseSalePrice' | 'baseTimeMinutes'>;
  quantity: number;
  /** Cantidad de logos aplicados en el diseño. */
  logosCount: number;
  /** Talla y color elegidos en tienda (detalle visible en Mis Pedidos/Planta). */
  size?: string;
  color?: string;
}

/** Caja Gumorose cotizada / pagada (tabla `gumorose_boxes`).
 * `DESPACHADO` lo fija el Event Bus al completar la etapa 11 de planta.
 * Adición retrocompatible: los estados previos siguen vigentes. */
export interface GumoroseBox {
  id: string;
  customerName?: string;
  region: EcuadorRegion;
  subtotalUsd: number;
  discountPct: number;
  discountUsd: number;
  shippingUsd: number;
  totalUsd: number;
  totalUnits: number;
  productionMinutes: number;
  deliveryDaysMin: number;
  deliveryDaysMax: number;
  status:
    | 'COTIZADA'
    | 'PAGADA'
    | 'EN_PRODUCCION'
    | 'ENVIADA'
    | 'ENTREGADA'
    | 'CANCELADA'
    | 'DESPACHADO';
}

export type MachineKind =
  | 'CORTADORA'
  | 'OVERLOCK'
  | 'RECTA'
  | 'RECUBRIDORA'
  | 'OJALADORA'
  | 'BOTONERA'
  | 'ESTAMPADORA'
  | 'SUBLIMADORA'
  | 'CORTADORA_VINIL';

export type MachineStatusValue = 'ACTIVA' | 'MANTENIMIENTO' | 'INACTIVA';

/** Estado de una máquina de la planta (tabla `plant_machines`). */
export interface PlantMachineStatus {
  id: string;
  code: string;
  kind: MachineKind;
  status: MachineStatusValue;
  queueMinutes: number;
}

/** Materia prima / insumo (tabla `raw_materials`). */
export interface RawMaterial {
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

/** Desglose de precio unitario de una prenda personalizada. */
export interface GarmentPriceBreakdown {
  baseSalePrice: number;
  extraLogos: number;
  extraPrintCost: number;
  extraMachineMinutes: number;
  unitPrice: number;
}

/** Desglose de producción, envío y descuento de una caja. */
export interface BoxQuoteBreakdown {
  totalUnits: number;
  workloadMinutes: number;
  parallelStations: number;
  productionMinutes: number;
  queuedMinutes: number;
  subtotalUsd: number;
  discountPct: number;
  discountUsd: number;
  shippingUsd: number;
  totalUsd: number;
  deliveryDaysMin: number;
  deliveryDaysMax: number;
  deliveryLabel: string;
}

/** Seis roles oficiales de la plataforma Gumorose. */
export type UserRole =
  | 'SUPER_ADMIN'
  | 'ADMIN_GERENCIA'
  | 'ADMIN_BODEGA'
  | 'ADMIN_PLANTA'
  | 'CLIENTE_B2C'
  | 'CLIENTE_B2B';

/** Usuario del sistema (tabla `system_users`). Retrocompatible: solo adición. */
export interface SystemUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  companyName?: string;
  ruc?: string;
  active: boolean;
  createdAt: string;
}

/**
 * Las 11 etapas reales de ingeniería de planta (Riobamba, secuenciales).
 * En `8_CONTROL_CALIDAD` la decisión ramifica: rechazo -> `6_COSTURA_ARMADO`,
 * aprobación -> `9_SELLO_AZUL`.
 */
export type PlantProductionStage =
  | '1_DISENO_ARTE'
  | '2_MATERIA_PRIMA'
  | '3_PATRONAJE'
  | '4_CORTE'
  | '5_TIQUETEADO'
  | '6_COSTURA_ARMADO'
  | '7_ESTAMPADO_SUBLIMADO'
  | '8_CONTROL_CALIDAD'
  | '9_SELLO_AZUL'
  | '10_PLANCHADO_ETIQUETADO_INEN'
  | '11_EMPAQUE_DESPACHO';

/** Orden secuencial oficial de las 11 etapas de planta. */
export const PLANT_PRODUCTION_STAGES_ORDERED: readonly PlantProductionStage[] = [
  '1_DISENO_ARTE',
  '2_MATERIA_PRIMA',
  '3_PATRONAJE',
  '4_CORTE',
  '5_TIQUETEADO',
  '6_COSTURA_ARMADO',
  '7_ESTAMPADO_SUBLIMADO',
  '8_CONTROL_CALIDAD',
  '9_SELLO_AZUL',
  '10_PLANCHADO_ETIQUETADO_INEN',
  '11_EMPAQUE_DESPACHO',
] as const;

/**
 * Estados visuales legacy de las cajas que aún consumen `apps/web` y
 * `apps/mobile`. Ver `mapStageToLegacyStatus` en `pricing-engine.ts`.
 */
export type LegacyBoxVisualStatus =
  | 'EN_COLA'
  | 'EN_CORTE'
  | 'EN_COSTURA'
  | 'EN_ESTAMPADO'
  | 'DESPACHADO';

/** Modalidades de pago oficiales (Tesis Gumorose). */
export type PaymentMode = 'CONTADO_100' | 'ANTICIPO_50_50';

/** Estado del control de calidad / Sello Azul. */
export type QualityCheckStatus = 'PENDIENTE' | 'APROBADO_SELLO_AZUL' | 'REPROCESO_COSTURA';

/** Entrada del historial de etapas de una orden ERP. */
export interface StageHistoryEntry {
  stage: PlantProductionStage;
  timestamp: string;
  operatorRole: UserRole;
  notes?: string;
}

/** Orden oficial de producción generada para planta (`OP-XXXX`). */
export interface ErpProductionOrder {
  id: string;
  orderCode: string;
  boxId: string;
  /** Usuario comprador (clóset) asociado a la caja, si se conoce. */
  buyerUserId?: string;
  customerRole: UserRole;
  paymentMode: PaymentMode;
  amountPaidUsd: number;
  balanceDueUsd: number;
  totalUsd: number;
  currentStage: PlantProductionStage;
  qualityCheckStatus: QualityCheckStatus;
  blueSealApplied: boolean;
  fabricMetersDeducted: number;
  stageHistory: StageHistoryEntry[];
  createdAt: string;
  updatedAt: string;
  /** Prendas compradas de la caja asociada (detalle para Mis Pedidos/Planta). */
  items?: OrderItemDetail[];
}

/** Asiento contable del libro financiero (un asiento por orden pagada). */
export interface FinancialLedgerEntry {
  id: string;
  orderId: string;
  orderCode: string;
  boxId: string;
  paymentMode: PaymentMode;
  createdAt: string;
  /** Ingreso bruto = total USD de la caja. */
  grossRevenueUsd: number;
  /** Materia Prima Directa: tela ($3.76/m) + hilo. */
  mpdCostUsd: number;
  /** Mano de Obra Directa. */
  modCostUsd: number;
  /** Costos Indirectos de Fabricación. */
  cifCostUsd: number;
  /** Utilidad operativa = bruto - MPD - MOD - CIF (margen 30%-32%). */
  operatingProfitUsd: number;
  marginPct: number;
  /** Efectivo cobrado al pagar (100% o 50% anticipo). */
  cashCollectedUsd: number;
  /** Cuentas por cobrar (50% B2B pendiente hasta el despacho). */
  receivableUsd: number;
}

/* ================================================================== */
/* Facturación Electrónica SRI Ecuador v2.1.0                          */
/* ================================================================== */

/** Clave de Acceso SRI: cadena oficial de exactamente 49 dígitos. */
export type SriAccessKey = string;

export type SriEnvironment = 'PRUEBAS_CELCER' | 'PRODUCCION_CEL';
export type SriInvoiceStatus =
  | 'FIRMADO_XADES_BES'
  | 'RECIBIDA_SRI'
  | 'AUTORIZADO_SRI'
  | 'RECHAZADO';
/** Alias en español del estado SRI. */
export type SriStatus = SriInvoiceStatus;

export interface SriAccessKeyParts {
  /** Fecha de emisión en formato `ddmmaaaa`. */
  issueDateDdmmyyyy: string;
  documentType: '01';
  ruc: string;
  environmentCode: '1' | '2';
  series: string;
  sequential: string;
  numericCode: string;
  emissionType: '1';
  checkDigit: string;
}

export interface SriAccessKeyInput {
  issueDate?: Date | string;
  /** Alternativa explícita `ddmmaaaa`. */
  issueDateDdmmyyyy?: string;
  documentType?: '01';
  ruc?: string;
  environment?: SriEnvironment | '1' | '2' | 'PRUEBAS' | 'PRODUCCION';
  environmentCode?: '1' | '2';
  series?: string;
  establishment?: string;
  emissionPoint?: string;
  sequential: number | string;
  numericCode?: string;
  emissionType?: '1';
}

export interface SriEmisor {
  razonSocial: string;
  nombreComercial?: string;
  ruc: string;
  direccionMatriz: string;
  direccionEstablecimiento?: string;
  obligadoContabilidad?: 'SI' | 'NO';
}

export type SriBuyerIdentificationType = '04' | '05' | '07';

export interface SriComprador {
  razonSocial: string;
  /** `04` RUC, `05` Cédula, `07` Consumidor final. */
  tipoIdentificacion: SriBuyerIdentificationType;
  identificacion: string;
  email?: string;
  direccion?: string;
  telefono?: string;
}

export interface SriInvoiceDetail {
  codigoPrincipal: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  descuento: number;
  precioTotalSinImpuesto: number;
}

/** Factura electrónica SRI v2.1.0 firmada XAdES-BES y autorizada. */
export interface SriElectronicInvoice {
  id: string;
  invoiceNumber: string;
  accessKey49: SriAccessKey;
  orderCode: string;
  boxId: string;
  orderId?: string;
  environment: SriEnvironment;
  sriStatus: SriInvoiceStatus;
  authorizationDate: string | null;
  authorizationNumber?: string | null;
  issueDate?: string;
  emisor: SriEmisor;
  comprador: SriComprador;
  detalles?: SriInvoiceDetail[];
  subtotal0: number;
  subtotalIva15: number;
  descuentoSolidarioUsd: number;
  iva15Usd: number;
  importeTotalUsd: number;
  /** Código de tarifa IVA 15% vigente en el SRI. */
  ivaTariffCode?: '4';
  formaPagoSri: string;
  xmlSignedContent: string;
  rideHtmlContent: string;
  sequential?: number;
  certificateStatus?: 'SIMULADO_P12' | 'CONFIGURADO_P12' | 'NO_CONFIGURADO';
}

export const SRI_EMISOR_RUC = '0691728394001';
export const SRI_EMISOR_RAZON_SOCIAL = 'Confecciones Gumorose S.A.S.';
export const SRI_EMISOR_NOMBRE_COMERCIAL = 'Gumorose';
export const SRI_EMISOR_DIRECCION = 'Barrio 21 de Abril, Riobamba - Chimborazo';
export const SRI_IVA_PCT = 15;
export const SRI_IVA_TARIFF_CODE = '4';
export const SRI_FORMA_PAGO = '20 - Otros con utilización del sistema financiero';
export const SRI_RECEPCION_URL =
  'https://celcer.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline';
export const SRI_AUTORIZACION_URL =
  'https://celcer.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline';

/** Estado de Resultados en vivo agregado. */
export interface ErpFinancialSummary {
  totalOrders: number;
  grossRevenueUsd: number;
  totalMpdUsd: number;
  totalModUsd: number;
  totalCifUsd: number;
  totalOperatingProfitUsd: number;
  averageMarginPct: number;
  cashCollectedUsd: number;
  receivableUsd: number;
  byPaymentMode: Record<PaymentMode, number>;
}

/** Tipos de evento del bus ERP (interno o webhook externo). */
export type ErpWebhookEventType =
  | 'ORDER_PAID_CHECKOUT'
  | 'ORDER_STAGE_11_COMPLETED'
  | 'SRI_INVOICE_EMITTED'
  | 'SRI_INVOICE_AUTHORIZED'
  | 'SRI_INVOICE_REJECTED';

/** Evento desacoplado del ERP (interno o hacia un ERP externo vía webhook). */
export interface ErpWebhookEvent {
  id: string;
  type: ErpWebhookEventType;
  timestamp: string;
  source: 'gumorose-erp-internal';
  orderId?: string;
  orderCode?: string;
  boxId?: string;
  payload: Record<string, unknown>;
}

/** Alerta de compra hacia el proveedor (Neymatex Guano). */
export interface SupplyPurchaseAlert {
  id: string;
  materialId: string;
  sku: string;
  materialName: string;
  supplier: 'Neymatex Guano';
  currentStockQty: number;
  minStockQty: number;
  requestedQty: number;
  status: 'ACTIVA' | 'RESUELTA';
  createdAt: string;
}

/** Categorías del Clóset Virtual Móvil. */
export type ClosetCategory =
  'SUPERIOR_CAMISETA' | 'SUPERIOR_CAMISA' | 'INFERIOR_PANTALON' | 'ABRIGO' | 'ACCESORIO';

/** Origen de una prenda del clóset. */
export type ClosetSourceType = 'FOTO_PROPIA' | 'COMPRADO_GUMOROSE' | 'DISENO_CUSTOM';

/** Nivel térmico de una prenda. */
export type WarmthLevel = 'FRESCO' | 'TEMPLADO' | 'CALIDO';

/** Ocasión de uso de una prenda (Acloset). */
export type ClosetOccasion = 'CASUAL' | 'EJECUTIVO' | 'URBANO' | 'DEPORTIVO';

/** Encuadre corporal detectado en la foto del usuario. */
export type BodyFramingType = 'FULL_BODY' | 'HALF_BODY_EXTENDED';

/** Preset visual de la mitad inferior reconstruida (medio cuerpo). */
export type LowerBodyPreset = 'DENIM_DARK' | 'CHINO_BEIGE' | 'JOGGER_GREY' | 'FORMAL_SLATE';

/**
 * Calibración anatómica anti-solapamiento.
 * La zona facial protegida es 0%–19.5%: ninguna prenda superior
 * puede anclarse por encima de `shoulderTopPct` (>= 19.5).
 */
export interface BodyAnchorCalibration {
  framing: BodyFramingType;
  /** % desde el top del lienzo donde empieza el cuello/hombros (>= 19.5). */
  shoulderTopPct: number;
  /** Ancho del torso en % del lienzo. */
  torsoWidthPct: number;
  /** % donde encaja la pretina del pantalón (cadera). */
  waistTopPct: number;
  /** Largo de piernas en % (cintura -> tobillos). */
  legsLengthPct: number;
  lowerBodyPreset: LowerBodyPreset;
}

/** Tope de la zona facial protegida: nada se posiciona encima de 19.5%. */
export const FACE_PROTECTED_MAX_PCT = 19.5;

/** Anclas por defecto: hombros 20%, torso 56% x 34% alto, cintura 50%, piernas 43% (50%->93%). */
export const DEFAULT_BODY_ANCHORS: BodyAnchorCalibration = {
  framing: 'FULL_BODY',
  shoulderTopPct: 20,
  torsoWidthPct: 56,
  waistTopPct: 50,
  legsLengthPct: 43,
  lowerBodyPreset: 'DENIM_DARK',
};

/** Voto del juego Style Shuffle (Stitch Fix). */
export interface StyleShuffleVote {
  itemId: string;
  liked: boolean;
  styleTag: string;
  timestamp: string;
}

/** Perfil de usuario móvil (tabla `user_profiles`). */
export interface UserProfile {
  id: string;
  fullBodyPhotoUrl?: string;
  bodySegmentationMaskUrl?: string;
  currentRegion: EcuadorRegion;
  city: string;
  /** Calibración anatómica persistida (sliders Hombros/Cintura/Escala). */
  bodyAnchors?: BodyAnchorCalibration;
  /** Historial de votos Style Shuffle (Stitch Fix). */
  styleShuffleVotes?: StyleShuffleVote[];
  /** ADN de estilo derivado de los votos: tag -> % (0-100). */
  styleDna?: Record<string, number>;
}

/* ================================================================== */
/* Dataset de preferencias + recomendaciones Machine Learning          */
/* ================================================================== */

/** Fila estructurada del dataset de preferencias para Machine Learning. */
export interface MlUserPreferenceRecord {
  userId: string;
  cedulaOrRuc: string;
  age: number;
  genderFit: MlGenderFit;
  region: EcuadorRegion;
  city: string;
  climateTempC: number;
  heightCm: number;
  weightKg: number;
  preferredFit: PreferredFit;
  favoriteColorsHex: string[];
  preferredCategories: GarmentCategory[];
  styleDnaVector: Record<string, number>;
  totalPurchases: number;
  avgTicketUsd: number;
  registeredAt: string;
  /** Datos de contacto opcionales para facturación y cuenta. */
  fullName?: string;
  name?: string;
  email?: string;
  phone?: string;
}

/** Recomendación ML de una prenda para un usuario. */
export interface MlProductRecommendation {
  garmentId: string;
  garment?: GarmentTemplate;
  affinityScorePct: number;
  matchReasons: string[];
  recommendedSize: GarmentSize;
  scoreBreakdown?: {
    climate: number;
    fit: number;
    color: number;
    styleDna: number;
    category: number;
  };
}

/** Clúster del dataset ML por región y estilo dominante. */
export interface MlDatasetCluster {
  key: string;
  region: EcuadorRegion;
  dominantFit?: PreferredFit;
  dominantStyleTag?: string | null;
  userCount: number;
  avgAge: number;
  avgTicketUsd: number;
  topCategories: GarmentCategory[];
  topColorsHex: string[];
}

/** Prenda guardada en el clóset (tabla `user_closet_items`). */
export interface UserClosetItem {
  id: string;
  userId: string;
  category: ClosetCategory;
  sourceType: ClosetSourceType;
  garmentId?: string;
  designId?: string;
  name: string;
  imageCutoutUrl?: string;
  colorHex: string;
  warmthLevel: WarmthLevel;
  /** Veces usada (Acloset OOTD). Sin dato, la UI asume el histórico por defecto. */
  wearCount?: number;
  /** Precio de compra en USD para el Costo por Uso (Acloset CPW). */
  purchasePriceUsd?: number;
  occasion?: ClosetOccasion;
  seasonTags?: EcuadorRegion[];
}

/** Combinación de ropa (tabla `closet_outfits`). */
export interface ClosetOutfit {
  id: string;
  userId: string;
  itemsIds: string[];
  regionContext: EcuadorRegion;
  weatherTempC: number;
  aiStylistNotes: string;
  tryonCompositePhotoUrl?: string;
  createdBy: 'USER' | 'AI_AGENT';
}
