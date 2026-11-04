/**
 * Test mantenido de la auditoría 5A (fotos 50MB, detalle de prendas, RBAC).
 * Fija que los validadores aceptan DataURLs grandes y que los ítems de caja
 * llevan talla/color hasta la orden.
 * Corre con: `pnpm --filter @gumorose/shared test` (node:test + tsx).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BIG_IMAGE_MAX_CHARS,
  boxQuoteSchema,
  closetItemCreateSchema,
  garmentCreateSchema,
  isHttpOrDataImageUrl,
} from '../src/validators.js';

const GARMENT_ID = '7d4f3b2a-1c5e-4a8f-9b3d-2e6f5a4c1d9e';
const DESIGN_ID = '8e5f4c3b-2d6f-4b9a-8c4d-3f7a5b6c2d1e';

function bigDataUrl(bytes: number): string {
  // Base64 simulada del peso pedido (sin imágenes reales en el repo).
  const body = 'A'.repeat(Math.ceil((bytes * 4) / 3));
  return `data:image/jpeg;base64,${body}`;
}

function validGarment(imageUrl?: string) {
  return {
    slug: 'camiseta-cuello-redondo-gumorose',
    name: 'Camiseta Cuello Redondo Gumorose',
    category: 'CAMISETA',
    baseProductionCost: 6.56,
    baseMarginPct: 32,
    baseSalePrice: 8.65,
    baseTimeMinutes: 27,
    sewingMinutes: 9,
    finishingMinutes: 18,
    imageUrl,
  };
}

describe('auditoría 5A: imágenes grandes y detalle de prendas', () => {
  it('acepta DataURL http(s) y data:image de gran tamaño (>2 MB)', () => {
    assert.equal(isHttpOrDataImageUrl('https://cdn.gumorose.ec/mockups/frente.png'), true);
    assert.equal(isHttpOrDataImageUrl(bigDataUrl(3 * 1024 * 1024)), true);
    assert.equal(isHttpOrDataImageUrl('ftp://no-valido/x.png'), false);
    assert.ok(BIG_IMAGE_MAX_CHARS >= 33_000_000);
  });

  it('la prenda del CMS acepta foto Base64 grande + mockups frontal/trasero', () => {
    const parsed = garmentCreateSchema.safeParse(
      validGarment(bigDataUrl(2 * 1024 * 1024 + 512)),
    );
    assert.equal(parsed.success, true);
  });

  it('los mockups frontal/trasero aceptan DataURL grandes o URLs http', () => {
    const parsed = garmentCreateSchema.safeParse({
      ...validGarment('https://cdn.gumorose.ec/mockups/base.png'),
      frontMockupUrl: bigDataUrl(1024),
      backMockupUrl: 'https://cdn.gumorose.ec/mockups/espalda.png',
    });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.ok(parsed.data.frontMockupUrl?.startsWith('data:image/'));
      assert.equal(parsed.data.backMockupUrl, 'https://cdn.gumorose.ec/mockups/espalda.png');
    }
  });

  it('el recorte del clóset acepta DataURL grande (foto propia)', () => {
    const parsed = closetItemCreateSchema.safeParse({
      userId: GARMENT_ID,
      category: 'SUPERIOR_CAMISETA',
      sourceType: 'FOTO_PROPIA',
      name: 'Camiseta azul de entreno',
      colorHex: '#1D4ED8',
      imageCutoutUrl: bigDataUrl(1024),
    });
    assert.equal(parsed.success, true);
  });

  it('el ítem de caja lleva talla y color opcionales hasta la orden', () => {
    const parsed = boxQuoteSchema.safeParse({
      region: 'SIERRA',
      items: [
        {
          designId: DESIGN_ID,
          quantity: 2,
          logosCount: 2,
          size: 'M',
          color: '#B23A1D',
          garment: {
            id: GARMENT_ID,
            category: 'CAMISETA',
            baseSalePrice: 8.65,
            baseTimeMinutes: 27,
          },
        },
      ],
    });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.items[0]?.size, 'M');
      assert.equal(parsed.data.items[0]?.color, '#B23A1D');
    }
  });
});
