/**
 * Servicio centralizado de IA (Meta) � Gumorose.
 *
 * - `SAM 3.1` ........... segmentación del retrato de cuerpo completo
 *                         (`segmentFullBodyPortrait`) y recorte de prendas
 *                         propias del clóset (`cutoutClosetGarment`).
 * - `Muse Image` ........ generación de logos (`generateLogos`).
 * - `Muse Wonder` ........ Virtual Try-On sobre la foto de cuerpo
 *                         completo (`virtualTryonFullBody`).
 * - `Muse Spark` ........ Agente Estilista de combinaciones diarias
 *                         (`suggestDailyOutfits`) y Ficha Técnica de
 *                         planta (`generatePlantTechpack`).
 *
 * Cada método intenta primero el proveedor real vía `fetch` cuando las
 * variables de entorno están configuradas; si no, responde con el
 * proveedor `"mock"` (payload determinista). Todas las respuestas
 * costosas pasan por un `Map` de caché indexado por hash SHA-256 para
 * no gastar créditos de API en peticiones repetidas.
 */
import { createHash } from 'node:crypto';
import type { ClimateStylingRules, ClosetCategory, UserClosetItem } from '@gumorose/shared';
import type { StoredBox } from '../store.js';

export type MetaProvider = 'meta' | 'mock';

const IMAGE_ENDPOINT = process.env.MUSE_IMAGE_ENDPOINT ?? '';
const IMAGE_MODEL = process.env.MUSE_IMAGE_MODEL ?? 'muse-image-open-1.0';
const SAM_ENDPOINT = process.env.SAM_SEGMENT_ENDPOINT ?? '';
const TRYON_ENDPOINT = process.env.VIRTUAL_TRYON_ENDPOINT ?? '';
const SPARK_MODEL = process.env.MUSE_SPARK_MODEL ?? 'meta-models/muse-spark-open-1026';
const CACHE_TTL_MS = Number(process.env.TRYON_CACHE_TTL_HOURS ?? 24) * 3_600_000;

/* ------------------------------------------------------------------ */
/* Configuración en caliente del Motor Meta AI (Consola 5)             */
/* ------------------------------------------------------------------ */

export const META_MODEL_OPTIONS: string[] = [
  'muse-wonder-1.0',
  'muse-spark-1.3',
  'meta-models/muse-spark-open-1026',
];

/** Créditos reales del hackathon disponibles en Meta/Baseten. */
export const META_CREDITS_USD = 147.49;

export type AiMode = 'LIVE_META_API' | 'LOCAL_SIMULATION';

export interface AiRuntimeStatus {
  mode: AiMode;
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

export interface AiCallMeta {
  model: string;
  mode: AiMode;
  latencyMs: number;
  tokens: number;
  live: boolean;
}

interface AiRuntimeState {
  apiKey: string;
  baseUrl: string;
  model: string;
  calls: number;
  cacheHits: number;
  tokens: number;
  lastLatencyMs: number;
}

const aiRuntime: AiRuntimeState = {
  apiKey: process.env.META_API_KEY ?? '',
  baseUrl: process.env.META_BASE_URL ?? '',
  model: META_MODEL_OPTIONS.includes(process.env.META_MODEL ?? '')
    ? (process.env.META_MODEL as string)
    : 'muse-wonder-1.0',
  calls: 0,
  cacheHits: 0,
  tokens: 0,
  lastLatencyMs: 0,
};

function hasMeta(): boolean {
  return aiRuntime.apiKey.trim().length > 0;
}

function metaKey(): string {
  return aiRuntime.apiKey.trim();
}

/** Estado público del Motor Meta AI (nunca expone la clave completa). */
export function getAiRuntimeStatus(): AiRuntimeStatus {
  const live = hasMeta();
  return {
    mode: live ? 'LIVE_META_API' : 'LOCAL_SIMULATION',
    baseUrl: aiRuntime.baseUrl || 'META_BASE_URL sin configurar (simulación local)',
    model: aiRuntime.model,
    modelOptions: [...META_MODEL_OPTIONS],
    hasApiKey: live,
    apiKeyHint: live ? `⬢⬢⬢⬢${aiRuntime.apiKey.trim().slice(-4)}` : 'sin clave',
    calls: aiRuntime.calls,
    cacheHits: aiRuntime.cacheHits,
    cacheSavedUsd: Math.round(aiRuntime.cacheHits * 0.04 * 100) / 100,
    tokens: aiRuntime.tokens,
    lastLatencyMs: aiRuntime.lastLatencyMs,
    creditsUsd: META_CREDITS_USD,
  };
}

/** Actualiza clave/base/modelo sin reiniciar (solo SUPER_ADMIN lo invoca). */
export function setAiRuntimeConfig(patch: {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}): AiRuntimeStatus {
  if (patch.apiKey !== undefined) aiRuntime.apiKey = patch.apiKey.trim();
  if (patch.baseUrl !== undefined) aiRuntime.baseUrl = patch.baseUrl.trim();
  if (patch.model !== undefined && META_MODEL_OPTIONS.includes(patch.model)) {
    aiRuntime.model = patch.model;
  }
  return getAiRuntimeStatus();
}

/** Registra un CACHE HIT ($0.00 de costo API evitado). */
export function recordAiCacheHit(): void {
  aiRuntime.cacheHits += 1;
}

/**
 * Llamada real al endpoint compatible con OpenAI/Meta Chat Completions.
 * Sin clave/base utilizable devuelve simulación local; ante cualquier
 * fallo de red devuelve `null` para caer al resultado determinista.
 */
export async function tryMetaChatCompletion(
  systemPrompt: string,
  userPrompt: string,
): Promise<{ content: string; meta: AiCallMeta } | null> {
  const live = hasMeta() && /^https?:\/\//.test(aiRuntime.baseUrl);
  if (!live) {
    return {
      content: '',
      meta: { model: aiRuntime.model, mode: 'LOCAL_SIMULATION', latencyMs: 0, tokens: 0, live: false },
    };
  }
  const started = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${aiRuntime.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aiRuntime.apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: aiRuntime.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 220,
      }),
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`Meta AI HTTP ${res.status}`);
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { total_tokens?: number };
    };
    const latencyMs = Date.now() - started;
    const tokens = json.usage?.total_tokens ?? 0;
    aiRuntime.calls += 1;
    aiRuntime.tokens += tokens;
    aiRuntime.lastLatencyMs = latencyMs;
    return {
      content: json.choices?.[0]?.message?.content ?? '',
      meta: { model: aiRuntime.model, mode: 'LIVE_META_API', latencyMs, tokens, live: true },
    };
  } catch {
    return null;
  }
}

/** Hash estable para llaves de caché (ahorra créditos de API). */
export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

// ---------------- Caché SHA-256 ----------------

interface CacheEntry {
  body: string;
  expiresAt: number;
}

const responseCache = new Map<string, CacheEntry>();

function cacheRead(key: string): string | undefined {
  const entry = responseCache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    responseCache.delete(key);
    return undefined;
  }
  return entry.body;
}

function cacheWrite(key: string, body: string, ttlMs: number = CACHE_TTL_MS): void {
  for (const [k, entry] of responseCache) {
    if (entry.expiresAt <= Date.now()) responseCache.delete(k);
  }
  responseCache.set(key, { body, expiresAt: Date.now() + ttlMs });
}

// ---------------- Utilidades mock ----------------

function hashString(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) >>> 0;
  return h;
}

function mockSvg(title: string, subtitle: string, hue: number): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="640">` +
    `<rect width="512" height="640" rx="32" fill="hsl(${hue} 30% 94%)"/>` +
    `<circle cx="256" cy="230" r="110" fill="hsl(${hue} 55% 55%)"/>` +
    `<text x="256" y="410" text-anchor="middle" font-family="sans-serif" font-size="30" fill="hsl(${hue} 30% 30%)">${title}</text>` +
    `<text x="256" y="450" text-anchor="middle" font-family="sans-serif" font-size="16" fill="hsl(${hue} 20% 45%)">${subtitle}</text>` +
    `</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

// ---------------- SAM 3.1: retrato cuerpo completo ----------------

export interface FullBodySegmentation {
  provider: MetaProvider;
  cached: boolean;
  cacheKey: string;
  maskUrl: string;
  steps: string[];
}

/** Segmenta el retrato de cuerpo completo y cachea la máscara SAM 3.1. */
export async function segmentFullBodyPortrait(
  photoBase64: string,
  userId: string,
): Promise<FullBodySegmentation> {
  const cacheKey = sha256Hex(`sam-fullbody:${userId}:${photoBase64}`);
  const hit = cacheRead(cacheKey);
  if (hit) {
    return {
      provider: hasMeta() ? 'meta' : 'mock',
      cached: true,
      cacheKey,
      maskUrl: hit,
      steps: ['cache-hit'],
    };
  }

  let maskUrl: string;
  let provider: MetaProvider = 'mock';
  if (hasMeta() && SAM_ENDPOINT !== '') {
    provider = 'meta';
    const res = await fetch(SAM_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${metaKey()}` },
      body: JSON.stringify({ image: photoBase64, task: 'full-body-person-mask', model: 'sam-3.1' }),
    });
    if (!res.ok) throw new Error(`SAM 3.1 respondió ${res.status}`);
    const data = (await res.json()) as { mask_url?: string };
    maskUrl = data.mask_url ?? '';
  } else {
    maskUrl = mockSvg('SAM 3.1 MOCK', `máscara ${userId.slice(0, 8)}`, hashString(userId) % 360);
  }

  cacheWrite(cacheKey, maskUrl);
  return {
    provider,
    cached: false,
    cacheKey,
    maskUrl,
    steps: ['sam-3.1:detect-person', 'sam-3.1:full-body-mask', 'cache:store-mask'],
  };
}

// ---------------- SAM 3.1: recorte de prenda propia ----------------

export interface GarmentCutout {
  provider: MetaProvider;
  cached: boolean;
  cacheKey: string;
  cutoutUrl: string;
  steps: string[];
}

/** Recorta una prenda de una foto propia para guardarla en el clóset. */
export async function cutoutClosetGarment(
  photoBase64: string,
  label: string,
): Promise<GarmentCutout> {
  const cacheKey = sha256Hex(`sam-cutout:${label}:${photoBase64}`);
  const hit = cacheRead(cacheKey);
  if (hit) {
    return {
      provider: hasMeta() ? 'meta' : 'mock',
      cached: true,
      cacheKey,
      cutoutUrl: hit,
      steps: ['cache-hit'],
    };
  }

  let cutoutUrl: string;
  let provider: MetaProvider = 'mock';
  if (hasMeta() && SAM_ENDPOINT !== '') {
    provider = 'meta';
    const res = await fetch(SAM_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${metaKey()}` },
      body: JSON.stringify({ image: photoBase64, task: 'garment-cutout', model: 'sam-3.1' }),
    });
    if (!res.ok) throw new Error(`SAM 3.1 respondió ${res.status}`);
    const data = (await res.json()) as { cutout_url?: string };
    cutoutUrl = data.cutout_url ?? '';
  } else {
    cutoutUrl = mockSvg('RECORTE MOCK', label.slice(0, 24), hashString(label) % 360);
  }

  cacheWrite(cacheKey, cutoutUrl);
  return {
    provider,
    cached: false,
    cacheKey,
    cutoutUrl,
    steps: ['sam-3.1:segment-garment', 'matting:refine-edges', 'cache:store-cutout'],
  };
}

// ---------------- Muse Image: logos ----------------

export interface LogoRequest {
  prompt: string;
  style?: string;
  count?: number;
}

export interface LogoResult {
  provider: MetaProvider;
  model: string;
  images: { url: string; seed: string }[];
  /** Métricas de la llamada (tokens, latencia y modelo activo). */
  aiMeta?: AiCallMeta;
}

/** Genera logos listos para estampado textil. */
export async function generateLogos(req: LogoRequest): Promise<LogoResult> {
  const count = Math.min(Math.max(req.count ?? 1, 1), 4);
  const started = Date.now();
  if (hasMeta() && IMAGE_ENDPOINT !== '') {
    const res = await fetch(IMAGE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${metaKey()}` },
      body: JSON.stringify({
        model: IMAGE_MODEL,
        prompt: req.prompt,
        style: req.style ?? 'flat vector logo, textile print ready',
        n: count,
      }),
    });
    if (!res.ok) throw new Error(`Muse Image respondió ${res.status}`);
    const data = (await res.json()) as { images?: { url: string; seed: string }[] };
    const latencyMs = Date.now() - started;
    aiRuntime.lastLatencyMs = latencyMs;
    aiRuntime.calls += 1;
    return {
      provider: 'meta',
      model: aiRuntime.model,
      images: data.images ?? [],
      aiMeta: { model: aiRuntime.model, mode: 'LIVE_META_API', latencyMs, tokens: 0, live: true },
    };
  }
  const images = Array.from({ length: count }, (_, i) => ({
    url: mockSvg('LOGO MOCK', req.prompt.slice(0, 24), (hashString(req.prompt) + i * 47) % 360),
    seed: `mock-${hashString(req.prompt + i).toString(16)}`,
  }));
  return {
    provider: 'mock',
    model: IMAGE_MODEL,
    images,
    aiMeta: {
      model: aiRuntime.model,
      mode: 'LOCAL_SIMULATION',
      latencyMs: Date.now() - started,
      tokens: 0,
      live: false,
    },
  };
}

// ---------------- Muse Wonder: try-on cuerpo completo ----------------

export interface FullBodyTryonRequest {
  userPhotoBase64: string;
  outfitId: string;
  cutoutUrls: string[];
}

export interface FullBodyTryonResult {
  provider: MetaProvider;
  cached: boolean;
  cacheKey: string;
  tryonImageUrl: string;
  pipeline: string[];
  /** Métricas de la llamada (tokens, latencia y modelo activo). */
  aiMeta?: AiCallMeta;
}

/** Viste el retrato de cuerpo completo con la combinación elegida. */
export async function virtualTryonFullBody(
  req: FullBodyTryonRequest,
): Promise<FullBodyTryonResult> {
  const cacheKey = sha256Hex(
    `wonder-tryon:${req.outfitId}:${req.userPhotoBase64}:${req.cutoutUrls.join('|')}`,
  );
  const hit = cacheRead(cacheKey);
  if (hit) {
    recordAiCacheHit();
    return {
      provider: hasMeta() ? 'meta' : 'mock',
      cached: true,
      cacheKey,
      tryonImageUrl: hit,
      pipeline: ['cache-hit'],
      aiMeta: {
        model: aiRuntime.model,
        mode: hasMeta() ? 'LIVE_META_API' : 'LOCAL_SIMULATION',
        latencyMs: 0,
        tokens: 0,
        live: hasMeta(),
      },
    };
  }
  const started = Date.now();

  let url: string;
  let provider: MetaProvider = 'mock';
  if (hasMeta() && TRYON_ENDPOINT !== '') {
    provider = 'meta';
    const res = await fetch(TRYON_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${metaKey()}` },
      body: JSON.stringify({
        person_image: req.userPhotoBase64,
        garment_images: req.cutoutUrls,
        segmentation: 'sam-3.1',
        renderer: 'muse-wonder',
        full_body: true,
      }),
    });
    if (!res.ok) throw new Error(`Virtual Try-On respondió ${res.status}`);
    const data = (await res.json()) as { tryon_image_url?: string };
    url = data.tryon_image_url ?? '';
  } else {
    url = mockSvg(
      'TRY-ON MOCK',
      `outfit ${req.outfitId.slice(0, 8)}`,
      hashString(req.outfitId) % 360,
    );
  }

  cacheWrite(cacheKey, url);
  const latencyMs = Date.now() - started;
  if (provider === 'meta') {
    aiRuntime.lastLatencyMs = latencyMs;
    aiRuntime.calls += 1;
  }
  return {
    provider,
    cached: false,
    cacheKey,
    tryonImageUrl: url,
    pipeline: [
      'sam-3.1:segment-person',
      'warp:fit-garments-fullbody',
      'muse-wonder:photoreal-render',
    ],
    aiMeta: {
      model: aiRuntime.model,
      mode: provider === 'meta' ? 'LIVE_META_API' : 'LOCAL_SIMULATION',
      latencyMs,
      tokens: 0,
      live: provider === 'meta',
    },
  };
}

// ---------------- Muse Spark: Agente Estilista ----------------

export interface StylistSuggestion {
  itemsIds: string[];
  notes: string;
}

/**
 * Agente Estilista: combina prendas reales del clóset siguiendo las
 * reglas climáticas (superior + inferior + abrigo/accesorio opcionales).
 * Con clave Meta, estas combinaciones viajan a Muse Spark para su
 * redacción; sin clave se devuelven deterministas (proveedor mock).
 */
export async function suggestDailyOutfits(args: {
  items: UserClosetItem[];
  rules: ClimateStylingRules;
  maxOutfits: number;
}): Promise<{
  provider: MetaProvider;
  model: string;
  suggestions: StylistSuggestion[];
  aiNote?: string;
  aiMeta?: AiCallMeta;
}> {
  const { items, rules, maxOutfits } = args;
  const byCategory = (cat: ClosetCategory): UserClosetItem[] =>
    items.filter((item) => item.category === cat && rules.categories.includes(cat));
  const byWarmth = (list: UserClosetItem[]): UserClosetItem[] => {
    const preferred = list.filter((item) => rules.warmthLevels.includes(item.warmthLevel));
    return preferred.length > 0 ? preferred : list;
  };

  const tops = byWarmth([...byCategory('SUPERIOR_CAMISETA'), ...byCategory('SUPERIOR_CAMISA')]);
  const bottoms = byWarmth(byCategory('INFERIOR_PANTALON'));
  const coats = byWarmth(byCategory('ABRIGO'));
  const accessories = byWarmth(byCategory('ACCESORIO'));

  const suggestions: StylistSuggestion[] = [];
  const cap = Math.min(Math.max(maxOutfits, 1), 6);
  for (const top of tops) {
    for (const bottom of bottoms) {
      if (suggestions.length >= cap) break;
      const ids = [top.id, bottom.id];
      const parts = [`superior ${top.name}`, `inferior ${bottom.name}`];
      const coat = coats[0];
      if (rules.categories.includes('ABRIGO') && coat && rules.warmthLevels[0] !== 'FRESCO') {
        ids.push(coat.id);
        parts.push(`abrigo ${coat.name}`);
      }
      const accessory = accessories[0];
      if (accessory) {
        ids.push(accessory.id);
        parts.push(`accesorio ${accessory.name}`);
      }
      suggestions.push({
        itemsIds: ids,
        notes: `${rules.region} ${rules.tempC}°C (${rules.warmthLevels.join('/')}) : ${parts.join(' + ')}. ${rules.advice}`,
      });
    }
    if (suggestions.length >= cap) break;
  }

  // Con Meta AI en vivo, Muse Spark redacta un consejo extra (fallback local).
  const chat = await tryMetaChatCompletion(
    'Eres Muse Spark, estilista de moda andina de Gumorose. Responde en español, máximo 2 frases.',
    `Clima ${rules.region} ${rules.tempC}°C. Outfits: ${suggestions.map((s) => s.notes).join(' | ') || 'sin combinaciones'}. Da un consejo breve.`,
  );
  const live = chat?.meta.live === true;
  const first = suggestions[0];
  if (live && chat && chat.content.trim() && first) {
    first.notes = `${first.notes} Consejo Meta AI: ${chat.content.trim().slice(0, 240)}`;
  }
  return {
    provider: hasMeta() ? 'meta' : 'mock',
    model: live ? aiRuntime.model : SPARK_MODEL,
    suggestions,
    aiNote: live && chat ? chat.content.trim().slice(0, 240) : undefined,
    aiMeta: chat?.meta ?? {
      model: aiRuntime.model,
      mode: 'LOCAL_SIMULATION',
      latencyMs: 0,
      tokens: 0,
      live: false,
    },
  };
}

// ---------------- Muse Spark: Ficha Técnica de planta ----------------

export interface TechpackStep {
  orden: number;
  etapa: string;
  maquina: string;
  detalle: string;
  minutosEstimados: number;
}

export interface TechpackResult {
  provider: MetaProvider;
  model: string;
  boxId: string;
  ordenProduccion: string;
  pasos: TechpackStep[];
  controlCalidad: string[];
  /** Nota técnica redactada por Meta AI en vivo (si hay clave). */
  aiNote?: string;
  /** Métricas de la llamada (tokens, latencia y modelo activo). */
  aiMeta?: AiCallMeta;
}

/**
 * Convierte una Caja Gumorose PAGADA en Orden de Producción paso a paso
 * para los operarios de Riobamba.
 */
export async function generatePlantTechpack(box: StoredBox): Promise<TechpackResult> {
  const ordenProduccion = `OP-${box.id.slice(0, 8).toUpperCase()}`;
  const pasos: TechpackStep[] = [];
  let orden = 1;

  for (const line of box.lines) {
    pasos.push(
      {
        orden: orden++,
        etapa: 'CORTE',
        maquina: 'CORTADORA (COR-01/02)',
        detalle: `Trazar y cortar ${line.quantity} x ${line.garmentName} talla/surtido según ficha.`,
        minutosEstimados: Math.ceil(line.quantity * 2),
      },
      {
        orden: orden++,
        etapa: 'COSTURA',
        maquina: line.category === 'PANTALON' ? 'RECTA + RECUBRIDORA' : 'OVERLOCK + RECUBRIDORA',
        detalle: `Ensamblar ${line.quantity} x ${line.garmentName} (${line.logosCount} logo(s)).`,
        minutosEstimados: Math.ceil(
          line.quantity *
            Math.max(1, Math.round(box.productionMinutes / Math.max(1, box.totalUnits))) *
            0.6,
        ),
      },
      {
        orden: orden++,
        etapa: 'ACABADO/ESTAMPADO',
        maquina: 'ESTAMPADORA / SUBLIMADORA / CORTADORA_VINIL',
        detalle: `Aplicar ${line.logosCount} logo(s) en ${line.quantity} x ${line.garmentName} según zonas del diseño ${line.designId.slice(0, 8)}.`,
        minutosEstimados: Math.ceil(line.quantity * (2 + line.logosCount * 1.5)),
      },
    );
  }
  pasos.push({
    orden: orden++,
    etapa: 'CONTROL DE CALIDAD + EMPAQUE',
    maquina: 'OJALADORA / BOTONERA (si aplica)',
    detalle: `Revisar costuras, estampados y tallas de la caja ${box.id.slice(0, 8)} (${box.totalUnits} prendas, destino ${box.region}).`,
    minutosEstimados: Math.ceil(box.totalUnits * 1.5),
  });

  const controlCalidad = [
    'Verificar tono de tela contra muestra aprobada.',
    'Medir 1 de cada 10 prendas (tabla de tallas).',
    'Revisar adherencia del estampado (prueba de lavado en 1 unidad).',
    'Confirmar cantidad y tallas antes de sellar la Caja Gumorose.',
  ];

  // Con Meta AI en vivo, esta estructura viaja como contexto a Muse
  // Spark para su redacción técnica formal (fallback determinista local).
  const chat = await tryMetaChatCompletion(
    'Eres Muse Spark, ingeniero textil de planta. Responde en español, máximo 2 frases.',
    `Ficha ${ordenProduccion}: ${pasos.map((p) => `${p.etapa} ${p.detalle}`).join(' | ')}. Da una nota técnica breve para los operarios.`,
  );
  const live = chat?.meta.live === true;
  return {
    provider: hasMeta() ? 'meta' : 'mock',
    model: live ? aiRuntime.model : SPARK_MODEL,
    boxId: box.id,
    ordenProduccion,
    pasos,
    controlCalidad,
    aiNote: live && chat ? chat.content.trim().slice(0, 240) : undefined,
    aiMeta: chat?.meta ?? {
      model: aiRuntime.model,
      mode: 'LOCAL_SIMULATION',
      latencyMs: 0,
      tokens: 0,
      live: false,
    },
  };
}
