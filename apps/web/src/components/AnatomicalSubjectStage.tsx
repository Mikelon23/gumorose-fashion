import React, { useMemo, useState } from 'react';
import type { BodyAnchorCalibration, BodyFramingType, GarmentTemplate } from '@gumorose/shared';
import { GarmentCanvas, subjectLayerBox, type CanvasLogo, type CanvasView } from './GarmentCanvas';
import { buildDressedMannequinMesh, buildGarmentMesh, fabricKindFor } from './engine3d/ClothMeshGenerator3D';
import { composeAtlasTexture } from './engine3d/UvTextureComposer';
import { EngineViewport } from './engine3d/EngineViewport';
import { colorHexOf } from '../data/regions';
import type { CameraState } from './engine3d/types3d';

export interface AnatomicalSubjectStageProps {
  subjectImage: string;
  subjectLabel: string;
  garment: GarmentTemplate;
  fabricHex: string;
  view: CanvasView;
  logos: CanvasLogo[];
  selectedUid: string | null;
  onSelect: (uid: string | null) => void;
  onMove: (uid: string, x: number, y: number) => void;
  onScale?: (uid: string, factor: number) => void;
  onRotate?: (uid: string, deltaDeg: number) => void;
  onDuplicate?: (uid: string) => void;
  specularX?: number;
  bottomGarment?: GarmentTemplate | null;
  anchors: BodyAnchorCalibration;
  framing: BodyFramingType;
  onPhotoRatio?: (heightOverWidth: number) => void;
}

function isRealPhoto(url: string): boolean {
  return url.startsWith('data:image') && !url.startsWith('data:image/svg');
}

/**
 * Sujeto 3D / foto real:
 * - Sin foto (Modelo de Estudio): maniquí anatómico 3D esculpido en
 *   alabastro mate, vestido 1:1 con las mallas del motor 3D y rotable.
 * - Con foto del usuario: foto limpia en marco editorial (la zona
 *   facial 0–19.5% se protege silenciosamente por código) con la
 *   prenda del motor WebGL superpuesta y piernas 3D si es medio cuerpo.
 * Sin muñecos planos, sin cuadrículas y sin carteles rojos.
 */
export function AnatomicalSubjectStage({
  subjectImage,
  subjectLabel,
  garment,
  fabricHex,
  view,
  logos,
  selectedUid,
  onSelect,
  onMove,
  bottomGarment,
  anchors,
  framing,
  onPhotoRatio,
}: AnatomicalSubjectStageProps): React.JSX.Element {
  const [camera, setCamera] = useState<CameraState>({ yawDeg: 0, pitchDeg: 2, zoom: 1 });
  const realPhoto = isRealPhoto(subjectImage);
  const isHalf = framing === 'HALF_BODY_EXTENDED';

  const mannequinScene = useMemo(() => {
    if (realPhoto) return [];
    const mannequin = buildDressedMannequinMesh({
      hasTop: garment.category !== 'PANTALON' && garment.visualVariant !== 'GORRA',
      hasPants: garment.category === 'PANTALON' || Boolean(bottomGarment),
      longSleeve:
        garment.category === 'CAMISA' || garment.visualVariant === 'HOODIE' || garment.visualVariant === 'CHAQUETA',
    });
    const meshes: { mesh: ReturnType<typeof buildGarmentMesh>; texture?: ReturnType<typeof composeAtlasTexture>; transform?: { tx?: number; ty?: number; tz?: number; sx?: number; sy?: number; sz?: number } }[] = [
      { mesh: mannequin },
    ];
    const addGarment = (g: GarmentTemplate, hex: string) => {
      const mesh = buildGarmentMesh(g.category, g.visualVariant);
      const texture = composeAtlasTexture({
        fabricHex: hex,
        fabricKind: fabricKindFor(g.category, g.visualVariant),
        logos:
          g.id === garment.id
            ? logos.map((l) => ({ uid: l.uid, x: l.x, y: l.y, width: l.width, height: l.height, rotation: l.rotation, technique: l.technique }))
            : [],
        view,
        size: 512,
      });
      if (g.category === 'PANTALON') {
        meshes.push({ mesh, texture, transform: { sx: 0.95, sy: 1.3, sz: 1.02, ty: 0.03 } });
      } else if (g.visualVariant === 'GORRA') {
        meshes.push({ mesh, texture, transform: { sx: 0.46, sy: 0.46, sz: 0.46, ty: 1.6 } });
      } else {
        meshes.push({ mesh, texture, transform: { sx: 0.85, sy: 0.6, sz: 1.05, ty: 0.93 } });
      }
    };
    addGarment(garment, fabricHex);
    if (bottomGarment && bottomGarment.id !== garment.id) {
      addGarment(bottomGarment, colorHexOf(bottomGarment.colors[0] ?? 'BLANCO'));
    }
    return meshes;
  }, [realPhoto, garment, fabricHex, bottomGarment, logos, view]);

  const extensionScene = useMemo(() => {
    if (!realPhoto || !isHalf) return [];
    const mannequin = buildDressedMannequinMesh({ hasPants: true });
    const pantsSource = garment.category === 'PANTALON' ? garment : bottomGarment;
    const meshes: { mesh: ReturnType<typeof buildGarmentMesh>; texture?: ReturnType<typeof composeAtlasTexture>; transform?: { sx?: number; sy?: number; sz?: number; ty?: number } }[] = [
      { mesh: mannequin },
    ];
    if (pantsSource) {
      meshes.push({
        mesh: buildGarmentMesh(pantsSource.category, pantsSource.visualVariant),
        texture: composeAtlasTexture({
          fabricHex: pantsSource.id === garment.id ? fabricHex : colorHexOf(pantsSource.colors[0] ?? 'BLANCO'),
          fabricKind: fabricKindFor(pantsSource.category, pantsSource.visualVariant),
          size: 512,
        }),
        transform: { sx: 0.95, sy: 1.3, sz: 1.02, ty: 0.03 },
      });
    }
    return meshes;
  }, [realPhoto, isHalf, garment, bottomGarment, fabricHex]);

  if (!realPhoto) {
    return (
      <div
        className="relative aspect-[9/16] w-full overflow-hidden rounded-xl bg-gum-linen"
        aria-label={`Maniquí anatómico 3D: ${subjectLabel}`}
      >
        <EngineViewport
          meshes={mannequinScene}
          camera={camera}
          onCameraChange={setCamera}
          orbit
          logoAnchors={undefined}
          ariaLabel="Maniquí anatómico 3D vestido"
        />
        <span className="absolute bottom-2 left-2 rounded-full bg-gum-espresso/75 px-2.5 py-1 text-[10px] font-bold text-white">
          {subjectLabel} · Maniquí 3D
        </span>
        <span className="absolute bottom-2 right-2 rounded-full bg-white/85 px-2 py-1 text-[9px] font-semibold text-stone-600">
          Arrastra para rotar
        </span>
      </div>
    );
  }

  const mainBox = subjectLayerBox(garment.category, anchors, garment.visualVariant);
  const bottomBox = bottomGarment
    ? subjectLayerBox(bottomGarment.category, anchors, bottomGarment.visualVariant)
    : null;

  return (
    <div
      className="relative aspect-[9/16] w-full overflow-hidden rounded-xl bg-gum-linen"
      aria-label={`Sujeto de pruebas: ${subjectLabel}`}
    >
      <img
        src={subjectImage}
        alt={subjectLabel}
        className="absolute inset-0 h-full w-full object-cover object-top"
        onLoad={(e) => {
          const img = e.currentTarget;
          if (img.naturalWidth > 0) onPhotoRatio?.(img.naturalHeight / img.naturalWidth);
        }}
      />
      {/* Medio cuerpo: empalme inferior anatómico 3D (piernas + pantalón) */}
      {isHalf && (
        <div
          className="absolute inset-x-0 bottom-0 h-[46%] opacity-95"
          style={{
            maskImage: 'linear-gradient(to bottom, transparent, black 22%)',
            WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 22%)',
          }}
          aria-hidden
        >
          <EngineViewport
            meshes={extensionScene}
            camera={{ yawDeg: 0, pitchDeg: 2, zoom: 1 }}
            ariaLabel="Extensión anatómica de piernas"
          />
        </div>
      )}
      {bottomGarment && bottomBox && (
        <div
          className="pointer-events-none absolute"
          style={{
            top: `${bottomBox.topPct}%`,
            left: `${bottomBox.leftPct}%`,
            width: `${bottomBox.widthPct}%`,
            height: `${bottomBox.heightPct}%`,
            zIndex: bottomBox.zIndex,
          }}
        >
          <GarmentCanvas
            category={bottomGarment.category}
            variant={bottomGarment.visualVariant}
            fabricHex={colorHexOf(bottomGarment.colors[0] ?? 'BLANCO')}
            view={view}
            logos={[]}
            selectedUid={null}
            showGuides={false}
            onSelect={() => undefined}
            onMove={() => undefined}
          />
        </div>
      )}
      <div
        className="absolute"
        style={{
          top: `${mainBox.topPct}%`,
          left: `${mainBox.leftPct}%`,
          width: `${mainBox.widthPct}%`,
          height: `${mainBox.heightPct}%`,
          zIndex: mainBox.zIndex,
        }}
      >
        <GarmentCanvas
          category={garment.category}
          variant={garment.visualVariant}
          fabricHex={fabricHex}
          view={view}
          logos={logos}
          selectedUid={selectedUid}
          showGuides={false}
          onSelect={onSelect}
          onMove={onMove}
        />
      </div>
      <span className="absolute bottom-2 left-2 z-[47] rounded-full bg-gum-espresso/75 px-2.5 py-1 text-[10px] font-bold text-white">
        {subjectLabel}
      </span>
    </div>
  );
}
