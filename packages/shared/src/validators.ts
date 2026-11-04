/**
 * Validadores `zod` del CMS propio y el estudio de personalización.
 * Se usan tanto en el backend (`apps/api`) como en los frontends.
 */
import { z } from 'zod';

export const ecuadorRegionSchema = z.enum(['COSTA', 'SIERRA', 'ORIENTE']);
export const garmentCategorySchema = z.enum(['CAMISETA', 'POLO', 'CAMISA', 'PANTALON']);
export const garmentVisualVariantSchema = z.enum([
  'CAMISETA',
  'CUELLO_V',
  'POLO',
  'CAMISA',
  'CHINO',
  'CARGO',
  'JOGGER',
  'HOODIE',
  'CHAQUETA',
  'GORRA',
]);
export const logoZoneSchema = z.enum([
  'PECHO_IZQ',
  'PECHO_DER',
  'CENTRO',
  'ESPALDA',
  'MANGA_IZQ',
  'MANGA_DER',
]);
export const printTechniqueSchema = z.enum(['SERIGRAFIA', 'SUBLIMADO', 'VINIL']);

/**
 * ¿Es una URL http(s) o un DataURL base64 de imagen (`data:image/...`)?
 * Acepta parámetros opcionales (`;charset=...`) y cualquier peso hasta el
 * tope de 25 MB (las fotos reales de PC/móvil viajan comprimidas por el
 * helper `compressImageFileToDataUrl` del frontend).
 */
/* ================================================================== */
/* Validaciones oficiales de Ecuador                                   */
/* ================================================================== */

function ecuadorProvinceOk(digits: string): boolean {
  const province = Number(digits.slice(0, 2));
  return (province >= 1 && province <= 24) || province === 30;
}

function modulo10CheckDigit(firstNine: string): number {
  let sum = 0;
  for (let i = 0; i < 9; i += 1) {
    let product = Number(firstNine[i]) * (i % 2 === 0 ? 2 : 1);
    if (product > 9) product -= 9;
    sum += product;
  }
  return (10 - (sum % 10)) % 10;
}

function modulo11CedulaStyleCheckDigit(digits: string, coefficients: number[]): number {
  const sum = coefficients.reduce((acc, coef, i) => acc + coef * Number(digits[i]), 0);
  const remainder = sum % 11;
  return remainder === 0 ? 0 : 11 - remainder;
}

/** Valida una cédula ecuatoriana de 10 dígitos (Módulo 10). */
export function validateEcuadorianCedula(value: string): boolean {
  const digits = String(value ?? '').trim();
  if (!/^\d{10}$/.test(digits) || !ecuadorProvinceOk(digits)) return false;
  if (Number(digits[2]) > 5) return false;
  return modulo10CheckDigit(digits.slice(0, 9)) === Number(digits[9]);
}

/** Valida un RUC ecuatoriano de 13 dígitos terminado en 001 (o 0001 público). */
export function validateEcuadorianRuc(value: string): boolean {
  const digits = String(value ?? '').trim();
  if (!/^\d{13}$/.test(digits) || !ecuadorProvinceOk(digits)) return false;
  const third = Number(digits[2]);
  if (third < 6) {
    return digits.endsWith('001') && validateEcuadorianCedula(digits.slice(0, 10));
  }
  if (third === 9) {
    if (!digits.endsWith('001')) return false;
    const expected = modulo11CedulaStyleCheckDigit(digits.slice(0, 9), [4, 3, 2, 7, 6, 5, 4, 3, 2]);
    return expected <= 9 && expected === Number(digits[9]);
  }
  if (third === 6) {
    if (!digits.endsWith('0001')) return false;
    const expected = modulo11CedulaStyleCheckDigit(digits.slice(0, 8), [3, 2, 7, 6, 5, 4, 3, 2]);
    return expected <= 9 && expected === Number(digits[8]);
  }
  return false;
}

/**
 * Validador oficial de identidad: cédula de 10 dígitos con Módulo 10
 * o RUC de 13 dígitos. Provincia 01-24 o 30.
 */
export function validateEcuadorianId(value: string): boolean {
  const digits = String(value ?? '').trim();
  if (/^\d{10}$/.test(digits)) return validateEcuadorianCedula(digits);
  if (/^\d{13}$/.test(digits)) return validateEcuadorianRuc(digits);
  return false;
}
export const validateCedulaOrRuc = validateEcuadorianId;
export const isValidEcuadorianId = validateEcuadorianId;

/** Celular ecuatoriano: exactamente `09` + 8 dígitos. */
export function validateEcuadorianPhone(value: string): boolean {
  return /^09\d{8}$/.test(String(value ?? '').trim());
}
export const isValidEcuadorianPhone = validateEcuadorianPhone;

/** Edad válida del perfilado: 16 a 99 años. */
export function validateAge(age: number): boolean {
  return Number.isInteger(age) && age >= 16 && age <= 99;
}

/** Medidas corporales: estatura 140-210 cm y peso 40-150 kg. */
export function validateBodyMeasures(heightCm: number, weightKg: number): boolean {
  return (
    Number.isFinite(heightCm) &&
    heightCm >= 140 &&
    heightCm <= 210 &&
    Number.isFinite(weightKg) &&
    weightKg >= 40 &&
    weightKg <= 150
  );
}

export const ecuadorianIdSchema = z
  .string()
  .trim()
  .refine(validateEcuadorianId, { message: 'Cédula (Módulo 10) o RUC de 13 dígitos inválido' });
export const cedulaSchema = z.string().trim().refine(validateEcuadorianCedula, {
  message: 'Cédula ecuatoriana inválida (Módulo 10)',
});
export const rucSchema = z.string().trim().refine(validateEcuadorianRuc, {
  message: 'RUC ecuatoriano inválido',
});
export const ecuadorianPhoneSchema = z
  .string()
  .trim()
  .regex(/^09\d{8}$/, 'Celular debe tener formato 09XXXXXXXX');
export const ecuadorPhoneSchema = ecuadorianPhoneSchema;
export const ageSchema = z.number().int().min(16).max(99);
export const bodyMeasuresSchema = z.object({
  heightCm: z.number().min(140).max(210),
  weightKg: z.number().min(40).max(150),
});
export const garmentSizeSchema = z.enum(['XS', 'S', 'M', 'L', 'XL', 'XXL']);
export const preferredFitSchema = z.enum(['TAILORED', 'RELAXED', 'OVERSIZE']);
export const mlGenderFitSchema = z.enum(['FEMENINO', 'MASCULINO', 'UNISEX']);

export function isHttpOrDataImageUrl(value: string): boolean {
  if (/^data:image\/[a-zA-Z0-9+.-]+(?:;charset=[a-zA-Z0-9-]+)?;base64,[A-Za-z0-9+/\s=]+$/.test(value)) {
    return true;
  }
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Tope de caracteres para DataURLs de imagen: alineado con el
 * `bodyLimit` de 50 MB de Fastify (`apps/api/src/server.ts`).
 * 50 * 1024 * 1024 = 52.428.800 caracteres.
 */
export const BIG_IMAGE_MAX_CHARS = 50 * 1024 * 1024;

/**
 * URL de imagen del CMS: acepta URL http(s) o DataURL base64 de gran tamaño
 * (el admin puede subir mockups frontal/trasero desde su computadora
 * y el frontend los envía como `data:image/...;base64,...`).
 */
const garmentImageUrlSchema = z
  .string()
  .min(1)
  .max(BIG_IMAGE_MAX_CHARS)
  .refine(isHttpOrDataImageUrl, {
    message: 'imageUrl debe ser una URL http(s) o un DataURL base64 de imagen',
  });

/** Mockup frontal/trasero del CMS: misma regla que `imageUrl` (hasta 25 MB). */
const mockupUrlSchema = z
  .string()
  .min(1)
  .max(BIG_IMAGE_MAX_CHARS)
  .refine(isHttpOrDataImageUrl, {
    message: 'mockup debe ser una URL http(s) o un DataURL base64 de imagen',
  });

/** Recorte/foto del clóset: URL http(s) o DataURL base64 de gran tamaño. */
const closetImageUrlSchema = z
  .string()
  .min(1)
  .max(BIG_IMAGE_MAX_CHARS)
  .refine(isHttpOrDataImageUrl, {
    message: 'imageCutoutUrl debe ser una URL http(s) o un DataURL base64 de imagen',
  });

/** Creación / edición de prendas del catálogo en el CMS propio. */
export const garmentCreateSchema = z.object({
  slug: z
    .string()
    .min(3)
    .max(80)
    .regex(/^[a-z0-9-]+$/, 'slug debe ser kebab-case'),
  name: z.string().min(3).max(120),
  category: garmentCategorySchema,
  description: z.string().max(2000).default(''),
  baseProductionCost: z.number().nonnegative(),
  baseMarginPct: z.number().min(0).max(99.99),
  baseSalePrice: z.number().positive(),
  baseTimeMinutes: z.number().int().positive(),
  sewingMinutes: z.number().int().nonnegative(),
  finishingMinutes: z.number().int().nonnegative(),
  sizes: z
    .array(z.string().min(1).max(10))
    .min(1)
    .max(20)
    .default(['XS', 'S', 'M', 'L', 'XL', 'XXL']),
  colors: z.array(z.string().min(1).max(30)).max(30).default([]),
  recommendedRegions: z.array(ecuadorRegionSchema).min(1).default(['SIERRA']),
  climateNote: z.string().max(500).default(''),
  imageUrl: garmentImageUrlSchema.optional(),
  frontMockupUrl: mockupUrlSchema.optional(),
  backMockupUrl: mockupUrlSchema.optional(),
  visualVariant: garmentVisualVariantSchema.optional(),
  active: z.boolean().default(true),
});

export type GarmentCreateInput = z.infer<typeof garmentCreateSchema>;

/** Un logo colocado sobre la prenda (coordenadas en cm sobre el lienzo 2D). */
export const logoPlacementSchema = z.object({
  id: z.string().min(1).max(80),
  logoUrl: z.string().url(),
  zone: logoZoneSchema,
  x: z.number().min(0).max(200),
  y: z.number().min(0).max(300),
  width: z.number().positive().max(100),
  height: z.number().positive().max(100),
  rotation: z.number().min(-180).max(180).default(0),
  technique: printTechniqueSchema,
});

export type LogoPlacementInput = z.infer<typeof logoPlacementSchema>;

/** Guardado de un diseño con múltiples logos (máx. 6 por diseño). */
export const designSaveSchema = z.object({
  garmentId: z.string().uuid(),
  name: z.string().min(1).max(120).default('Diseño personalizado'),
  customerName: z.string().max(120).optional(),
  customerPhotoUrl: z.string().url().optional(),
  size: z.string().min(1).max(10).default('M'),
  color: z.string().min(1).max(30).default('BLANCO'),
  logos: z.array(logoPlacementSchema).min(1).max(6),
});

export type DesignSaveInput = z.infer<typeof designSaveSchema>;

/** Ítem para cotizar una Caja Gumorose. */
export const boxItemSchema = z.object({
  designId: z.string().uuid(),
  quantity: z.number().int().min(1).max(160),
  logosCount: z.number().int().min(0).max(6),
  /** Talla y color elegidos en tienda (viajan hasta la orden para el detalle). */
  size: z.string().min(1).max(10).optional(),
  color: z.string().min(1).max(30).optional(),
  garment: z.object({
    id: z.string().uuid(),
    category: garmentCategorySchema,
    baseSalePrice: z.number().positive(),
    baseTimeMinutes: z.number().int().positive(),
  }),
});

/** Cotización de una Caja Gumorose (máx. caja cerrada: 160 prendas). */
export const boxQuoteSchema = z
  .object({
    customerName: z.string().max(120).optional(),
    region: ecuadorRegionSchema,
    currentPlantQueueMinutes: z.number().int().min(0).max(10_080).default(0),
    items: z.array(boxItemSchema).min(1).max(50),
  })
  .superRefine((value, ctx) => {
    const total = value.items.reduce((acc, item) => acc + item.quantity, 0);
    if (total > 160) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'La caja cerrada admite máximo 160 prendas',
        path: ['items'],
      });
    }
  });

export type BoxQuoteInput = z.infer<typeof boxQuoteSchema>;

/** Seis roles oficiales (contrato compartido frontend/backend). */
export const userRoleSchema = z.enum([
  'SUPER_ADMIN',
  'ADMIN_GERENCIA',
  'ADMIN_BODEGA',
  'ADMIN_PLANTA',
  'CLIENTE_B2C',
  'CLIENTE_B2B',
]);

/** Las 11 etapas reales de ingeniería de planta. */
export const plantStageSchema = z.enum([
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
]);

/** Modalidades de pago oficiales. */
export const paymentModeSchema = z.enum(['CONTADO_100', 'ANTICIPO_50_50']);

/** Alta / edición de usuarios del sistema (Superadmin + ERP). */
export const systemUserCreateSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email().max(160),
  role: userRoleSchema,
  companyName: z.string().max(160).optional(),
  ruc: z.string().max(20).optional(),
  active: z.boolean().default(true),
});

export type SystemUserCreateInput = z.infer<typeof systemUserCreateSchema>;

/** Cambio de rol (solo SUPER_ADMIN en el API). */
export const systemUserRoleUpdateSchema = z.object({
  role: userRoleSchema,
});

/** Modelos Meta AI seleccionables en caliente (Consola 5). */
export const META_MODEL_OPTIONS = [
  'muse-wonder-1.0',
  'muse-spark-1.3',
  'meta-models/muse-spark-open-1026',
] as const;

/** Configuración en caliente del Motor Meta AI (sin reiniciar ni tocar .env). */
export const aiConfigUpdateSchema = z
  .object({
    apiKey: z.string().max(500).optional(),
    baseUrl: z.string().max(300).optional(),
    model: z.enum(META_MODEL_OPTIONS).optional(),
  })
  .strict();

export type SystemUserRoleUpdateInput = z.infer<typeof systemUserRoleUpdateSchema>;

/** Decisión de calidad al avanzar desde `8_CONTROL_CALIDAD`. */
export const advanceStageSchema = z.object({
  approve: z.boolean().optional(),
  notes: z.string().max(500).optional(),
});

export type AdvanceStageInput = z.infer<typeof advanceStageSchema>;

/** Esquema de pago de una caja cotizada (retrocompatible: nuevos campos opcionales). */
export const checkoutSchema = z.object({
  boxId: z.string().uuid(),
  paymentMethod: z.string().min(2).max(40).default('mock'),
  paymentMode: paymentModeSchema.optional(),
  customerRole: userRoleSchema.optional(),
  buyerUserId: z.string().uuid().optional(),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;

/** Categorías, orígenes y niveles térmicos del Clóset Virtual. */
export const closetCategorySchema = z.enum([
  'SUPERIOR_CAMISETA',
  'SUPERIOR_CAMISA',
  'INFERIOR_PANTALON',
  'ABRIGO',
  'ACCESORIO',
]);
export const closetSourceTypeSchema = z.enum(['FOTO_PROPIA', 'COMPRADO_GUMOROSE', 'DISENO_CUSTOM']);
export const warmthLevelSchema = z.enum(['FRESCO', 'TEMPLADO', 'CALIDO']);
export const closetOccasionSchema = z.enum(['CASUAL', 'EJECUTIVO', 'URBANO', 'DEPORTIVO']);
export const bodyFramingTypeSchema = z.enum(['FULL_BODY', 'HALF_BODY_EXTENDED']);
export const lowerBodyPresetSchema = z.enum(['DENIM_DARK', 'CHINO_BEIGE', 'JOGGER_GREY', 'FORMAL_SLATE']);

/** Calibración anatómica: la zona facial 0%–19.5% queda siempre protegida. */
export const bodyAnchorCalibrationSchema = z
  .object({
    framing: bodyFramingTypeSchema,
    shoulderTopPct: z.number().min(19.5).max(30),
    torsoWidthPct: z.number().min(40).max(80),
    waistTopPct: z.number().min(42).max(62),
    legsLengthPct: z.number().min(20).max(55),
    lowerBodyPreset: lowerBodyPresetSchema,
  })
  .superRefine((value, ctx) => {
    if (value.shoulderTopPct < 19.5) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'shoulderTopPct no puede invadir la zona facial protegida (0-19.5%)',
        path: ['shoulderTopPct'],
      });
    }
  });

export type BodyAnchorCalibrationInput = z.infer<typeof bodyAnchorCalibrationSchema>;

/** Voto Style Shuffle (Stitch Fix). */
export const styleShuffleVoteSchema = z.object({
  itemId: z.string().min(1).max(120),
  liked: z.boolean(),
  styleTag: z.string().min(1).max(80),
  timestamp: z.string().min(1).max(40),
});

export type StyleShuffleVoteInput = z.infer<typeof styleShuffleVoteSchema>;
export const colorHexSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'color_hex debe tener formato #RRGGBB');

/** Subida del retrato de cuerpo completo (segmentación SAM 3.1 con caché). */
export const bodyPhotoUploadSchema = z.object({
  userId: z.string().uuid(),
  fullBodyPhotoBase64: z.string().min(100).max(BIG_IMAGE_MAX_CHARS),
  city: z.string().min(1).max(80).default('Riobamba'),
  region: ecuadorRegionSchema.default('SIERRA'),
});

export type BodyPhotoUploadInput = z.infer<typeof bodyPhotoUploadSchema>;

/** Alta de prenda en el clóset (recorte vía SAM 3.1 si llega foto propia). */
export const closetItemCreateSchema = z.object({
  userId: z.string().uuid(),
  category: closetCategorySchema,
  sourceType: closetSourceTypeSchema,
  name: z.string().min(1).max(120).default('Prenda de clóset'),
  imageCutoutUrl: closetImageUrlSchema.optional(),
  garmentCutoutBase64: z.string().min(100).optional(),
  colorHex: colorHexSchema.default('#FFFFFF'),
  warmthLevel: warmthLevelSchema.default('TEMPLADO'),
  garmentId: z.string().uuid().optional(),
  designId: z.string().uuid().optional(),
  wearCount: z.number().int().min(0).max(100000).optional(),
  purchasePriceUsd: z.number().nonnegative().max(100000).optional(),
  occasion: closetOccasionSchema.optional(),
  seasonTags: z.array(ecuadorRegionSchema).max(3).optional(),
});

export type ClosetItemCreateInput = z.infer<typeof closetItemCreateSchema>;

/** Guardado de una combinación (usuario o Agente IA). */
export const outfitSaveSchema = z.object({
  userId: z.string().uuid(),
  itemsIds: z.array(z.string().uuid()).min(1).max(6),
  regionContext: ecuadorRegionSchema,
  weatherTempC: z.number().min(-10).max(45),
  aiStylistNotes: z.string().max(1000).default(''),
  tryonCompositePhotoUrl: z.string().url().optional(),
  createdBy: z.enum(['USER', 'AI_AGENT']).default('USER'),
});

export type OutfitSaveInput = z.infer<typeof outfitSaveSchema>;

/** Sugerencias diarias del Agente Estilista por clima/región. */
export const dailyOutfitsSchema = z.object({
  userId: z.string().uuid(),
  region: ecuadorRegionSchema,
  tempC: z.number().min(-10).max(45),
  maxOutfits: z.number().int().min(1).max(6).default(3),
});

export type DailyOutfitsInput = z.infer<typeof dailyOutfitsSchema>;

/* ================================================================== */
/* Machine Learning + Facturación SRI                                  */
/* ================================================================== */

export const styleDnaVectorSchema = z.record(z.string().min(1).max(80), z.number().min(0).max(100));

export const mlUserPreferenceRecordSchema = z.object({
  userId: z.string().min(1).max(120),
  cedulaOrRuc: ecuadorianIdSchema,
  age: ageSchema,
  genderFit: mlGenderFitSchema,
  region: ecuadorRegionSchema,
  city: z.string().min(1).max(80),
  climateTempC: z.number().min(-10).max(45),
  heightCm: z.number().min(140).max(210),
  weightKg: z.number().min(40).max(150),
  preferredFit: preferredFitSchema,
  favoriteColorsHex: z.array(colorHexSchema).min(1).max(12),
  preferredCategories: z.array(garmentCategorySchema).max(4).default([]),
  styleDnaVector: styleDnaVectorSchema.default({}),
  totalPurchases: z.number().int().min(0).default(0),
  avgTicketUsd: z.number().nonnegative().default(0),
  registeredAt: z.string().min(1).max(40),
  fullName: z.string().min(2).max(120).optional(),
  name: z.string().min(2).max(120).optional(),
  email: z.string().email().max(160).optional(),
  phone: ecuadorianPhoneSchema.optional(),
});

/** Payload de `POST /api/auth/register-or-login` (registro o actualización). */
export const mlRegisterOrLoginSchema = z.object({
  userId: z.string().uuid().optional(),
  cedulaOrRuc: ecuadorianIdSchema,
  fullName: z.string().min(2).max(120),
  name: z.string().min(2).max(120).optional(),
  email: z.string().email().max(160),
  phone: ecuadorianPhoneSchema.optional(),
  age: ageSchema,
  genderFit: mlGenderFitSchema.default('UNISEX'),
  region: ecuadorRegionSchema,
  city: z.string().min(1).max(80),
  climateTempC: z.number().min(-10).max(45).default(15),
  heightCm: z.number().min(140).max(210),
  weightKg: z.number().min(40).max(150),
  preferredFit: preferredFitSchema,
  favoriteColorsHex: z.array(colorHexSchema).min(1).max(12),
  preferredCategories: z.array(garmentCategorySchema).max(4).default([]),
  styleDnaVector: styleDnaVectorSchema.default({}),
  stylePreferences: z.array(z.string().min(1).max(80)).max(12).optional(),
  totalPurchases: z.number().int().min(0).optional(),
  avgTicketUsd: z.number().nonnegative().optional(),
});

export type MlRegisterOrLoginInput = z.infer<typeof mlRegisterOrLoginSchema>;

export const mlProductRecommendationSchema = z.object({
  garmentId: z.string().min(1),
  affinityScorePct: z.number().int().min(65).max(99),
  matchReasons: z.array(z.string().min(1).max(200)).min(1),
  recommendedSize: garmentSizeSchema,
});

export const sriEnvironmentSchema = z.enum(['PRUEBAS_CELCER', 'PRODUCCION_CEL']);
export const sriInvoiceStatusSchema = z.enum([
  'FIRMADO_XADES_BES',
  'RECIBIDA_SRI',
  'AUTORIZADO_SRI',
  'RECHAZADO',
]);

export const sriCompradorSchema = z.object({
  razonSocial: z.string().min(2).max(200),
  tipoIdentificacion: z.enum(['04', '05', '07']),
  identificacion: z.string().min(5).max(20),
  email: z.string().email().max(160).optional(),
  direccion: z.string().max(300).optional(),
  telefono: ecuadorianPhoneSchema.optional(),
});

export const sriEmitInvoiceSchema = z
  .object({
    orderId: z.string().uuid().optional(),
    orderCode: z.string().min(3).max(40).optional(),
    boxId: z.string().uuid().optional(),
    environment: sriEnvironmentSchema.optional(),
    comprador: sriCompradorSchema.optional(),
    buyerUserId: z.string().uuid().optional(),
  })
  .refine((v) => Boolean(v.orderId || v.orderCode || v.boxId), {
    message: 'Envía orderId, orderCode o boxId',
  });

export type SriEmitInvoiceInput = z.infer<typeof sriEmitInvoiceSchema>;
