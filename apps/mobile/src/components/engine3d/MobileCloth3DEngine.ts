/**
 * Motor 3D Táctil de Prendas Gumorose para móvil (fachada pública).
 * Reexporta el núcleo del Gumorose 3D Cloth & UV Engine (mallas,
 * atlas UV, rasterizador software con Z-buffer y renderer WebGL) y
 * añade los mapeos propios de la app: prendas del clóset, avatar
 * Dress-Me y cajas anatómicas silenciosas sobre la foto real.
 */
import type {
  BodyAnchorCalibration,
  GarmentCategory,
  GarmentVisualVariant,
  UserClosetItem,
} from '@gumorose/shared';
import { FACE_PROTECTED_MAX_PCT } from '@gumorose/shared';
import { buildDressedMannequinMesh, buildGarmentMesh, buildMannequinMesh, fabricKindFor } from './ClothMeshGenerator3D';
import { composeAtlasTexture } from './UvTextureComposer';
import type { SceneMesh } from './SoftwareRenderer3D';
import type { MeshData } from './types3d';

export * from './types3d';
export {
  MANNEQUIN_ALABASTER_HEX,
  MANNEQUIN_ALABASTER_RGB,
  MANNEQUIN_ARM_ANGLE_DEG,
  SLEEVE_DROP_ANGLE_DEG,
  buildDressedMannequinMesh,
  buildGarmentMesh,
  buildMannequinMesh,
  fabricKindFor,
  garmentRadiusClearance,
  type FabricKind,
} from './ClothMeshGenerator3D';
export {
  composeAtlasTexture,
  logoCenterUV,
  logoToUVRect,
  type AtlasTexture,
  type LogoUVInput,
  type UVRect,
} from './UvTextureComposer';
export {
  computeFraming,
  projectWorldPoint,
  renderSceneToBuffer,
  type RenderResult,
  type SceneMesh,
} from './SoftwareRenderer3D';
export { tryCreateGLRenderer, type GLRenderer } from './WebGLRenderer3D';

export interface GarmentMeshSpec {
  category: GarmentCategory;
  variant: GarmentVisualVariant;
  fabricHex: string;
}

/** Especificación de malla para una prenda del catálogo oficial. */
export function meshSpecForCatalog(category: GarmentCategory, variant?: GarmentVisualVariant): GarmentMeshSpec {
  const resolved: GarmentVisualVariant =
    variant ?? (category === 'PANTALON' ? 'CHINO' : category === 'POLO' ? 'POLO' : category === 'CAMISA' ? 'CAMISA' : 'CAMISETA');
  return { category, variant: resolved, fabricHex: '#9AA0A6' };
}

/** Especificación de malla para una prenda del clóset del usuario. */
export function meshSpecForClosetItem(item: UserClosetItem): GarmentMeshSpec {
  const name = item.name.toLowerCase();
  switch (item.category) {
    case 'SUPERIOR_CAMISA':
      return { category: 'CAMISA', variant: 'CAMISA', fabricHex: item.colorHex };
    case 'INFERIOR_PANTALON':
      return {
        category: 'PANTALON',
        variant: name.includes('cargo') ? 'CARGO' : name.includes('jogger') ? 'JOGGER' : 'CHINO',
        fabricHex: item.colorHex,
      };
    case 'ABRIGO':
      return {
        category: 'CAMISETA',
        variant: name.includes('chaqueta') || name.includes('jacket') ? 'CHAQUETA' : 'HOODIE',
        fabricHex: item.colorHex,
      };
    case 'ACCESORIO':
      return { category: 'CAMISETA', variant: 'GORRA', fabricHex: item.colorHex };
    case 'SUPERIOR_CAMISETA':
    default:
      if (name.includes('polo')) return { category: 'POLO', variant: 'POLO', fabricHex: item.colorHex };
      if (name.includes('camisa')) return { category: 'CAMISA', variant: 'CAMISA', fabricHex: item.colorHex };
      if (name.includes('hoodie')) return { category: 'CAMISETA', variant: 'HOODIE', fabricHex: item.colorHex };
      if (name.includes('gorra') || name.includes('cap')) return { category: 'CAMISETA', variant: 'GORRA', fabricHex: item.colorHex };
      return { category: 'CAMISETA', variant: 'CAMISETA', fabricHex: item.colorHex };
  }
}

/** Malla + textura listas para el visor a partir de una especificación. */
export function buildTexturedGarment(spec: GarmentMeshSpec, textureSize = 512): SceneMesh {
  const mesh = buildGarmentMesh(spec.category, spec.variant);
  const texture = composeAtlasTexture({
    fabricHex: spec.fabricHex,
    fabricKind: fabricKindFor(spec.category, spec.variant),
    size: textureSize,
  });
  return { mesh, texture };
}

export interface DressedAvatarSpecs {
  top?: GarmentMeshSpec | null;
  pants?: GarmentMeshSpec | null;
  cap?: GarmentMeshSpec | null;
}

/**
 * Escena Dress-Me: maniquí anatómico 3D alabastro vestido 1:1 con la
 * prenda superior, el pantalón y la gorra elegidos en los rieles.
 */
export function buildDressedAvatarScene(specs: DressedAvatarSpecs): SceneMesh[] {
  const scene: SceneMesh[] = [
    {
      mesh: buildDressedMannequinMesh({
        hasTop: Boolean(specs.top),
        hasPants: Boolean(specs.pants),
        longSleeve: specs.top?.category === 'CAMISA' || specs.top?.variant === 'HOODIE' || specs.top?.variant === 'CHAQUETA',
      }) as MeshData,
    },
  ];
  if (specs.pants) {
    scene.push({
      ...buildTexturedGarment(specs.pants),
      transform: { sx: 0.95, sy: 1.3, sz: 1.02, ty: 0.03 },
    });
  }
  if (specs.top) {
    scene.push({
      ...buildTexturedGarment(specs.top),
      transform: { sx: 0.85, sy: 0.6, sz: 1.05, ty: 0.93 },
    });
  }
  if (specs.cap) {
    scene.push({
      ...buildTexturedGarment(specs.cap),
      transform: { sx: 0.46, sy: 0.46, sz: 0.46, ty: 1.6 },
    });
  }
  return scene;
}

export interface SubjectLayerBox {
  topPct: number;
  leftPct: number;
  widthPct: number;
  heightPct: number;
  zIndex: number;
}

/**
 * Caja anatómica silenciosa sobre la foto real: la prenda superior
 * jamás invade la zona facial 0–19.5% (sin carteles, solo código).
 */
export function subjectLayerBoxMobile(
  spec: GarmentMeshSpec,
  anchors: BodyAnchorCalibration,
): SubjectLayerBox {
  if (spec.variant === 'GORRA') {
    return { topPct: 3, leftPct: 33, widthPct: 34, heightPct: 10, zIndex: 40 };
  }
  if (spec.category === 'PANTALON') {
    const widthPct = anchors.torsoWidthPct * 0.88;
    return {
      topPct: anchors.waistTopPct,
      leftPct: (100 - widthPct) / 2,
      widthPct,
      heightPct: anchors.legsLengthPct,
      zIndex: 10,
    };
  }
  const isCoat = spec.variant === 'CHAQUETA' || spec.variant === 'HOODIE';
  const widthPct = isCoat ? anchors.torsoWidthPct + 4 : anchors.torsoWidthPct;
  const topPct = Math.max(FACE_PROTECTED_MAX_PCT + 1, anchors.shoulderTopPct + 0.5 - (isCoat ? 0.5 : 0));
  return {
    topPct,
    leftPct: (100 - widthPct) / 2,
    widthPct,
    heightPct: Math.min(38, Math.max(28, anchors.waistTopPct - anchors.shoulderTopPct + 4)),
    zIndex: isCoat ? 30 : 20,
  };
}
