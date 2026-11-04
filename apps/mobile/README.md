# @gumorose/mobile — Clóset Virtual y App de Compra

App móvil de Gumorose (React 18 + Vite + Tailwind CSS + TypeScript) con
simulador de dispositivo para el demo en vivo, conectada a `@gumorose/shared`
y a la API de `apps/api`.

## Pantallas (tab bar inferior)

- **Clóset**: filtros por categoría y nivel térmico, digitalización con cámara
  (recorte SAM 3.1) y combinación manual para el vestidor.
- **Estilista**: clima del Ecuador (Sierra/Costa/Oriente + slider °C), reglas de
  `getClimateStylingRules` y combinaciones con Meta Muse Spark.
- **Vestidor**: retrato de cuerpo completo + Virtual Try-On (CACHE HIT vs
  NEW INFERENCE), favoritos y compra del look.
- **Crear**: personalizador multi-logo táctil (subir, galería, IA) con 3
  acciones: guardar en el clóset, probarse y añadir a la caja.
- **Caja**: tienda in-app, cotización oficial, checkout y copiado automático
  de la compra al clóset.

## Desarrollo

```sh
pnpm --filter @gumorose/mobile dev        # http://localhost:5174 (proxy /api -> :3001)
pnpm --filter @gumorose/mobile typecheck
pnpm --filter @gumorose/mobile build
```

El proxy de `/api` apunta a `http://localhost:3001` (ver `apps/api/src/server.ts`);
se puede sobreescribir con la variable `API_TARGET`.
