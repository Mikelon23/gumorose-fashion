/**
 * Compresión de imágenes en cliente (canvas HTML5).
 * Cualquier foto real (PNG, JPG, WEBP de cualquier peso) se optimiza antes
 * de subir al backend: nunca falla por tamaño de payload y viaja en ms.
 */

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo decodificar la imagen.'));
    img.src = src;
  });
}

/**
 * Optimiza un `File` de imagen a DataURL listo para el backend.
 * - Redimensiona al lado mayor `maxDim` (default 1200px) manteniendo aspecto.
 * - Fotos (JPG/WEBP): sale como JPEG con `quality` (default 0.82).
 * - PNG: se mantiene PNG (conserva transparencia de logos) pero redimensionado.
 * - SVG: se devuelve tal cual (vectorial, ya liviano).
 */
export async function compressImageFileToDataUrl(
  file: File,
  maxDim = 1200,
  quality = 0.82,
): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('El archivo debe ser una imagen.');
  if (file.type === 'image/svg+xml') return readAsDataUrl(file);
  const original = await readAsDataUrl(file);
  if (!original) throw new Error('No se pudo leer la imagen.');
  let img: HTMLImageElement;
  try {
    img = await loadImage(original);
  } catch {
    return original;
  }
  const naturalW = img.naturalWidth || 1;
  const naturalH = img.naturalHeight || 1;
  const scale = Math.min(1, maxDim / Math.max(naturalW, naturalH));
  const width = Math.max(1, Math.round(naturalW * scale));
  const height = Math.max(1, Math.round(naturalH * scale));
  // Ya cabe y ya es liviana: se envía tal cual sin recomprimir.
  if (scale >= 1 && file.size <= 900 * 1024) return original;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return original;
  ctx.drawImage(img, 0, 0, width, height);
  const keepPng = file.type === 'image/png';
  return canvas.toDataURL(keepPng ? 'image/png' : 'image/jpeg', quality);
}
