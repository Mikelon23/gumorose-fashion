/**
 * Servidor Fastify — Backend desacoplado Gumorose (Fase 1 Delta).
 *
 * - CMS + comercio unificado: `routes/cms-commerce.routes.ts`
 * - Clóset Virtual + estudio:  `routes/closet-studio.routes.ts`
 * - Agentes IA (Meta):         `routes/ai-agents.routes.ts`
 *
 * Persistencia: memoria + semillas (planta Riobamba). Si existe
 * `DATABASE_URL`, ese adaptador reemplaza al store (ver `store.ts`).
 */
import { pathToFileURL } from 'node:url';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { createStore } from './store.js';
import { resolveUserContext } from './middlewares/auth-rbac.middleware.js';
import { registerCmsCommerceRoutes } from './routes/cms-commerce.routes.js';
import { registerClosetStudioRoutes } from './routes/closet-studio.routes.js';
import { registerAiAgentsRoutes } from './routes/ai-agents.routes.js';
import { registerErpSuperadminRoutes } from './routes/erp-superadmin.routes.js';

export function buildApp() {
  // Fotos reales en Base64/DataURL desde PC/móvil: hasta 50 MB por petición
  // para que ninguna subida falle por tamaño de payload.
  const app = Fastify({ logger: true, bodyLimit: 50 * 1024 * 1024 });
  const store = createStore();

  void app.register(cors, { origin: true });

  // Capa 2: contexto RBAC compatible en cada petición (no rompe Web/Móvil).
  app.addHook('onRequest', resolveUserContext);

  app.get('/api/health', async () => ({
    ok: true,
    service: '@gumorose/api',
    planta: 'Riobamba',
    maquinas: store.machines.length,
    prendas: store.garments.size,
    database: process.env.DATABASE_URL ? 'postgres' : 'memory-seed',
    timestamp: new Date().toISOString(),
  }));

  registerCmsCommerceRoutes(app, store);
  registerClosetStudioRoutes(app, store);
  registerAiAgentsRoutes(app, store);
  registerErpSuperadminRoutes(app, store);

  app.setNotFoundHandler(async (request, reply) => {
    return reply.code(404).send({ error: `Ruta no encontrada: ${request.url}` });
  });

  return { app, store };
}

const PORT = Number(process.env.PORT ?? 3001);

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { app } = buildApp();
  app
    .listen({ port: PORT, host: '0.0.0.0' })
    .then((address) => app.log.info(`Gumorose API escuchando en ${address}`))
    .catch((error) => {
      app.log.error(error);
      process.exit(1);
    });
}
