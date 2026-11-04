/**
 * Sujetos de prueba de cuerpo entero para el Modo Sujeto de Pruebas.
 * El sujeto "usuario" usa la foto real de /api/closet/:userId cuando
 * existe; los modelos de estudio son siluetas de cuerpo completo.
 */
export type StudioSubjectId = 'USUARIO' | 'MASCULINO' | 'FEMENINA';

export interface StudioSubject {
  id: StudioSubjectId;
  label: string;
  /** Silueta de respaldo cuando no hay foto real del usuario. */
  silhouetteUrl: string;
}

function bodySvg(accent: string, bg: string, feminine: boolean): string {
  const hip = feminine ? 'M96 300 Q150 318 204 300' : 'M100 300 Q150 312 200 300';
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="560" viewBox="0 0 300 560">` +
    `<rect width="300" height="560" rx="24" fill="${bg}"/>` +
    `<circle cx="150" cy="78" r="40" fill="#E8DCCF"/>` +
    `<path d="M150 38 a40 40 0 0 1 34 58 l-9 -4 a29 29 0 0 0 -50 0 l-9 4 a40 40 0 0 1 34 -58" fill="#211D19"/>` +
    `<path d="M106 142 Q150 124 194 142 L208 164 L198 292 ${hip} L190 462 L168 462 L160 306 L140 306 L132 462 L110 462 L102 292 L92 164 Z" fill="${accent}"/>` +
    `<rect x="112" y="292" width="76" height="12" rx="6" fill="#211D19" opacity="0.35"/>` +
    `<ellipse cx="150" cy="512" rx="72" ry="10" fill="#000000" opacity="0.14"/>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const STUDIO_SUBJECTS: StudioSubject[] = [
  {
    id: 'USUARIO',
    label: 'Sujeto Usuario Activo',
    silhouetteUrl: bodySvg('#B23A1D', '#F4F1EC', false),
  },
  {
    id: 'MASCULINO',
    label: 'Modelo Masculino Estudio',
    silhouetteUrl: bodySvg('#213A5C', '#EDE8DF', false),
  },
  {
    id: 'FEMENINA',
    label: 'Modelo Femenina Estudio',
    silhouetteUrl: bodySvg('#7C2D2D', '#F7ECEC', true),
  },
];
