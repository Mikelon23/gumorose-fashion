import type { PrintTechnique } from '@gumorose/shared';

export interface GallerySeal {
  name: string;
  url: string;
  technique: PrintTechnique;
  blurb: string;
}

function sealSvg(inner: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">` +
    `<circle cx="120" cy="120" r="104" fill="none" stroke="#211D19" stroke-width="7"/>` +
    `<circle cx="120" cy="120" r="88" fill="none" stroke="#C9A227" stroke-width="3"/>` +
    inner +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Galería de sellos andinos/urbanos de Gumorose.
 * Son DataURL SVG válidas que viajan como `logoUrl` al guardar el diseño.
 */
export const GALLERY_SEALS: GallerySeal[] = [
  {
    name: 'Sol Andino',
    technique: 'SERIGRAFIA',
    blurb: 'Sello circular de inspiración precolombina.',
    url: sealSvg(
      `<circle cx="120" cy="120" r="30" fill="#B23A1D"/>` +
        `<g stroke="#211D19" stroke-width="6" stroke-linecap="round">` +
        `<line x1="120" y1="52" x2="120" y2="72"/>` +
        `<line x1="120" y1="168" x2="120" y2="188"/>` +
        `<line x1="52" y1="120" x2="72" y2="120"/>` +
        `<line x1="168" y1="120" x2="188" y2="120"/>` +
        `<line x1="72" y1="72" x2="86" y2="86"/>` +
        `<line x1="154" y1="154" x2="168" y2="168"/>` +
        `<line x1="168" y1="72" x2="154" y2="86"/>` +
        `<line x1="86" y1="154" x2="72" y2="168"/>` +
        `</g>`,
    ),
  },
  {
    name: 'Cóndor Urbano',
    technique: 'SUBLIMADO',
    blurb: 'Silueta geométrica del cóndor sobre los Andes.',
    url: sealSvg(
      `<path d="M60 140 L100 100 L120 128 L140 100 L180 140 L140 132 L120 150 L100 132 Z" fill="#211D19"/>` +
        `<path d="M70 160 L120 178 L170 160" fill="none" stroke="#B23A1D" stroke-width="7" stroke-linecap="round"/>`,
    ),
  },
  {
    name: 'Rosa Gumorose',
    technique: 'VINIL',
    blurb: 'Emblema de la casa: rosa industrial de Riobamba.',
    url: sealSvg(
      `<circle cx="120" cy="112" r="26" fill="none" stroke="#B23A1D" stroke-width="7"/>` +
        `<circle cx="120" cy="112" r="12" fill="#B23A1D"/>` +
        `<path d="M120 138 L120 176 M120 156 L100 148 M120 156 L140 148" stroke="#1E4D3B" stroke-width="7" stroke-linecap="round" fill="none"/>`,
    ),
  },
  {
    name: 'Chimborazo 6263',
    technique: 'SERIGRAFIA',
    blurb: 'El coloso de la Sierra, cota 6.263 msnm.',
    url: sealSvg(
      `<path d="M64 156 L104 92 L122 122 L136 104 L176 156 Z" fill="#211D19"/>` +
        `<path d="M96 106 L104 92 L112 106 L108 112 L100 112 Z" fill="#F7F5F2"/>` +
        `<text x="120" y="182" text-anchor="middle" font-family="sans-serif" font-size="22" font-weight="bold" fill="#211D19">6263</text>`,
    ),
  },
];
