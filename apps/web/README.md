# @gumorose/web — Tienda Gumorose

Aplicación web de Gumorose (React 18 + Vite + Tailwind CSS + TypeScript),
conectada a `@gumorose/shared` y a la API de `apps/api`.

## Vistas

- **Tienda**: catálogo por región climática (Costa / Sierra / Oriente) y categoría.
- **Personalizar**: estudio 2D multi-logo (subir, galería, IA) con calculadora industrial.
- **Mi Caja**: armador de Caja Gumorose, cotización oficial y checkout nacional.
- **Admin**: monitor de planta Riobamba, CMS de prendas y ficha técnica con IA.

## Desarrollo

```sh
pnpm --filter @gumorose/web dev       # http://localhost:5173 (proxy /api -> :3001)
pnpm --filter @gumorose/web typecheck
pnpm --filter @gumorose/web build
```

El proxy de `/api` apunta a `http://localhost:3001` (ver `apps/api/src/server.ts`);
se puede sobreescribir con la variable `API_TARGET`.
