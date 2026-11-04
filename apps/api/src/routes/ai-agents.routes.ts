/**
 * Agentes IA (Meta) — estilista, try-on y planta.
 *
 * - `POST /api/ai/daily-outfits` .... combinaciones por clima/región
 *   (Muse Spark) persistidas como outfits del Agente.
 * - `POST /api/ai/virtual-tryon` .... viste el retrato de cuerpo
 *   completo con la combinación (SAM 3.1 + Muse Wonder, con caché).
 * - `POST /api/ai/generate-logo` .... generación de logos (Muse Image).
 * - `POST /api/ai/plant-techpack` .... caja PAGADA -> Orden de
 *   Producción para Riobamba (Muse Spark).
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { dailyOutfitsSchema, getClimateStylingRules, outfitSaveSchema } from '@gumorose/shared';
import { newId, type Store } from '../store.js';
import {
  generateLogos,
  generatePlantTechpack,
  suggestDailyOutfits,
  virtualTryonFullBody,
} from '../services/meta-ai.service.js';

export function registerAiAgentsRoutes(app: FastifyInstance, store: Store): void {
  // ---- Agente Estilista: outfits del día ----
  app.post('/api/ai/daily-outfits', async (request, reply) => {
    const parsed = dailyOutfitsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Solicitud inválida', issues: parsed.error.issues });
    }
    const { userId, region, tempC, maxOutfits } = parsed.data;
    const items = [...store.closetItems.values()].filter((item) => item.userId === userId);
    const rules = getClimateStylingRules(region, tempC);
    if (items.length === 0) {
      return {
        rules,
        outfits: [],
        hint: 'El clóset está vacío: sube prendas en /api/closet/items',
      };
    }
    const styled = await suggestDailyOutfits({ items, rules, maxOutfits });
    const outfits = styled.suggestions.map((suggestion) => {
      const outfit = {
        id: newId(),
        userId,
        itemsIds: suggestion.itemsIds,
        regionContext: region,
        weatherTempC: tempC,
        aiStylistNotes: suggestion.notes,
        tryonCompositePhotoUrl: undefined as string | undefined,
        createdBy: 'AI_AGENT' as const,
      };
      const checked = outfitSaveSchema.safeParse({ ...outfit });
      if (checked.success) store.outfits.set(outfit.id, { ...outfit });
      return outfit;
    });
    return { provider: styled.provider, model: styled.model, rules, outfits };
  });

  // ---- Virtual Try-On de cuerpo completo ----
  app.post('/api/ai/virtual-tryon', async (request, reply) => {
    const schema = z.object({
      userId: z.string().uuid(),
      outfitId: z.string().uuid(),
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Payload inválido', issues: parsed.error.issues });
    }
    const profile = store.users.get(parsed.data.userId);
    if (!profile?.fullBodyPhotoUrl) {
      return reply
        .code(404)
        .send({ error: 'Retrato no encontrado: súbelo en /api/closet/body-photo' });
    }
    const outfit = store.outfits.get(parsed.data.outfitId);
    if (!outfit || outfit.userId !== parsed.data.userId) {
      return reply.code(404).send({ error: 'Combinación no encontrada para este usuario' });
    }
    const cutoutUrls = outfit.itemsIds.flatMap((id) => {
      const url = store.closetItems.get(id)?.imageCutoutUrl;
      return url ? [url] : [];
    });
    try {
      const result = await virtualTryonFullBody({
        userPhotoBase64: profile.fullBodyPhotoUrl,
        outfitId: outfit.id,
        cutoutUrls,
      });
      outfit.tryonCompositePhotoUrl = result.tryonImageUrl;
      return { ...result, outfitId: outfit.id };
    } catch (error) {
      return reply.code(502).send({ error: 'Falló el Virtual Try-On', detail: String(error) });
    }
  });

  // ---- Generación de logos (Muse Image) ----
  app.post('/api/ai/generate-logo', async (request, reply) => {
    const schema = z.object({
      prompt: z.string().min(3).max(500),
      style: z.string().max(120).optional(),
      count: z.number().int().min(1).max(4).default(1),
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Prompt inválido', issues: parsed.error.issues });
    }
    try {
      return await generateLogos(parsed.data);
    } catch (error) {
      return reply
        .code(502)
        .send({ error: 'Falló el proveedor de imágenes', detail: String(error) });
    }
  });

  // ---- Ficha Técnica de planta (Muse Spark) ----
  app.post('/api/ai/plant-techpack', async (request, reply) => {
    const schema = z.object({ boxId: z.string().uuid() });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'boxId inválido', issues: parsed.error.issues });
    }
    const box = store.boxes.get(parsed.data.boxId);
    if (!box) return reply.code(404).send({ error: 'Caja no encontrada' });
    if (box.status !== 'PAGADA') {
      return reply.code(409).send({
        error: `La caja está en estado ${box.status}: el techpack requiere una Caja Gumorose PAGADA`,
      });
    }
    const techpack = await generatePlantTechpack(box);
    box.status = 'EN_PRODUCCION';
    return techpack;
  });
}
