/**
 * Clóset Virtual Móvil + estudio de personalización.
 *
 * - `POST /api/closet/body-photo` ... sube el retrato de cuerpo completo
 *   (segmentación SAM 3.1 con caché) y crea/actualiza el perfil.
 * - `GET /api/closet/:userId` ......... prendas por categoría + outfits.
 * - `POST /api/closet/items` .......... guarda una prenda en el clóset
 *   (recorte SAM 3.1 si llega foto propia).
 * - `POST /api/studio/custom-design` .. guarda un diseño multi-logo.
 */
import type { FastifyInstance } from 'fastify';
import {
  bodyPhotoUploadSchema,
  closetItemCreateSchema,
  computeStyleDna,
  designSaveSchema,
  ecuadorRegionSchema,
  styleShuffleVoteSchema,
} from '@gumorose/shared';
import { z } from 'zod';
import { newId, type Store } from '../store.js';
import { cutoutClosetGarment, segmentFullBodyPortrait } from '../services/meta-ai.service.js';

const styleShuffleVotePostSchema = styleShuffleVoteSchema.extend({
  userId: z.string().uuid(),
  region: ecuadorRegionSchema.optional(),
});

export function registerClosetStudioRoutes(app: FastifyInstance, store: Store): void {
  // ---- Retrato de cuerpo completo ----
  app.post('/api/closet/body-photo', async (request, reply) => {
    const parsed = bodyPhotoUploadSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Retrato inválido', issues: parsed.error.issues });
    }
    const { userId, fullBodyPhotoBase64, city, region } = parsed.data;
    let segmentation;
    try {
      segmentation = await segmentFullBodyPortrait(fullBodyPhotoBase64, userId);
    } catch (error) {
      return reply
        .code(502)
        .send({ error: 'Falló la segmentación SAM 3.1', detail: String(error) });
    }
    const dataUrl = fullBodyPhotoBase64.startsWith('data:')
      ? fullBodyPhotoBase64
      : `data:image/jpeg;base64,${fullBodyPhotoBase64}`;
    const profile = {
      id: userId,
      fullBodyPhotoUrl: dataUrl,
      bodySegmentationMaskUrl: segmentation.maskUrl,
      currentRegion: region,
      city,
    };
    store.users.set(userId, profile);
    return {
      profile,
      segmentation: { cached: segmentation.cached, cacheKey: segmentation.cacheKey },
    };
  });

  // ---- Clóset por usuario y categoría ----
  app.get('/api/closet/:userId', async (request, reply) => {
    const { userId } = request.params as { userId: string };
    const profile = store.users.get(userId);
    if (!profile)
      return reply.code(404).send({ error: 'Perfil no encontrado: sube el retrato primero' });
    const items = [...store.closetItems.values()].filter((item) => item.userId === userId);
    const byCategory: Record<string, typeof items> = {};
    for (const item of items) {
      byCategory[item.category] = [...(byCategory[item.category] ?? []), item];
    }
    const outfits = [...store.outfits.values()].filter((outfit) => outfit.userId === userId);
    return { profile, totalItems: items.length, byCategory, outfits };
  });

  // ---- Alta de prenda en el clóset ----
  app.post('/api/closet/items', async (request, reply) => {
    const parsed = closetItemCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Prenda inválida', issues: parsed.error.issues });
    }
    const data = parsed.data;
    if (!store.users.has(data.userId)) {
      return reply.code(404).send({ error: 'Perfil no encontrado: sube el retrato primero' });
    }
    if (data.garmentId && !store.garments.has(data.garmentId)) {
      return reply.code(404).send({ error: 'La prenda base no existe en el catálogo' });
    }
    if (data.designId && !store.designs.has(data.designId)) {
      return reply.code(404).send({ error: 'El diseño no existe' });
    }

    let imageCutoutUrl = data.imageCutoutUrl;
    let cutoutCacheKey: string | undefined;
    if (!imageCutoutUrl && data.garmentCutoutBase64) {
      try {
        const cutout = await cutoutClosetGarment(data.garmentCutoutBase64, data.name);
        imageCutoutUrl = cutout.cutoutUrl;
        cutoutCacheKey = cutout.cacheKey;
      } catch (error) {
        return reply.code(502).send({ error: 'Falló el recorte SAM 3.1', detail: String(error) });
      }
    }

    const item = {
      id: newId(),
      userId: data.userId,
      category: data.category,
      sourceType: data.sourceType,
      garmentId: data.garmentId,
      designId: data.designId,
      name: data.name,
      imageCutoutUrl,
      colorHex: data.colorHex,
      warmthLevel: data.warmthLevel,
      wearCount: data.wearCount,
      purchasePriceUsd: data.purchasePriceUsd,
      occasion: data.occasion,
      seasonTags: data.seasonTags,
    };
    store.closetItems.set(item.id, item);
    return reply.code(201).send({ item, cutoutCacheKey });
  });

  // ---- Style Shuffle: votos 👍/👎 que alimentan Hybrid Designs ----
  app.post('/api/closet/style-shuffle-vote', async (request, reply) => {
    const parsed = styleShuffleVotePostSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Voto Style Shuffle inválido', issues: parsed.error.issues });
    }
    const profile = store.users.get(parsed.data.userId);
    const region = parsed.data.region ?? profile?.currentRegion ?? 'SIERRA';
    const vote = {
      itemId: parsed.data.itemId,
      liked: parsed.data.liked,
      styleTag: parsed.data.styleTag,
      timestamp: parsed.data.timestamp,
      userId: parsed.data.userId,
      region,
    };
    store.styleVotes.push(vote);
    if (profile) {
      const votes = [...(profile.styleShuffleVotes ?? []), {
        itemId: vote.itemId,
        liked: vote.liked,
        styleTag: vote.styleTag,
        timestamp: vote.timestamp,
      }];
      profile.styleShuffleVotes = votes;
      profile.styleDna = computeStyleDna(votes);
    }
    const userVotes = store.styleVotes.filter((v) => v.userId === parsed.data.userId);
    return reply.code(201).send({
      vote,
      totalVotes: store.styleVotes.length,
      userVotes: userVotes.length,
      styleDna: computeStyleDna(userVotes),
      region,
    });
  });

  // ---- Guardar diseño multi-logo ----
  app.post('/api/studio/custom-design', async (request, reply) => {
    const parsed = designSaveSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Diseño inválido', issues: parsed.error.issues });
    }
    if (!store.garments.has(parsed.data.garmentId)) {
      return reply.code(404).send({ error: 'La prenda base no existe en el catálogo' });
    }
    const design = { ...parsed.data, id: newId() };
    store.designs.set(design.id, {
      ...design,
      previewUrl: undefined,
      tryonImageUrl: undefined,
    });
    return reply.code(201).send(design);
  });
}
