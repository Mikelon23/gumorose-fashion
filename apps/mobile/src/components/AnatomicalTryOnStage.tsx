import React, { useMemo, useState } from 'react';
import { ChevronDown, PersonStanding, SlidersHorizontal } from 'lucide-react';
import type { BodyAnchorCalibration, BodyFramingType, LowerBodyPreset, UserClosetItem } from '@gumorose/shared';
import {
  buildDressedAvatarScene,
  buildTexturedGarment,
  meshSpecForClosetItem,
  subjectLayerBoxMobile,
  type GarmentMeshSpec,
} from './engine3d/MobileCloth3DEngine';
import { MobileEngineViewport } from './engine3d/MobileEngineViewport';
import type { CameraState } from './engine3d/types3d';

export const LOWER_BODY_PRESET_HEX: Record<LowerBodyPreset, string> = {
  DENIM_DARK: '#213A5C',
  CHINO_BEIGE: '#C2B280',
  JOGGER_GREY: '#6B7280',
  FORMAL_SLATE: '#334155',
};

export const LOWER_BODY_PRESET_LABEL: Record<LowerBodyPreset, string> = {
  DENIM_DARK: 'Denim oscuro',
  CHINO_BEIGE: 'Chino beige',
  JOGGER_GREY: 'Jogger gris',
  FORMAL_SLATE: 'Formal pizarra',
};

/** Aspecto (alto/ancho) por debajo del cual la foto se considera medio cuerpo. */
export function detectFramingFromAspect(heightOverWidth: number): BodyFramingType {
  return heightOverWidth < 1.45 ? 'HALF_BODY_EXTENDED' : 'FULL_BODY';
}

export interface AnatomicalTryOnStageProps {
  photoUrl?: string | null;
  items: UserClosetItem[];
  anchors: BodyAnchorCalibration;
  onAnchorsChange: (next: Partial<BodyAnchorCalibration>) => void;
  onRequestFullBody?: () => void;
  /** Solo el lienzo anatómico (para embeberse en el comparador Antes/Después). */
  bare?: boolean;
}

const OVERLAY_CAMERA: CameraState = { yawDeg: 0, pitchDeg: 5, zoom: 1 };

/** Capa de prenda 3D transparente sobre la foto real (o su recorte fotográfico). */
function GarmentOverlay3D({ item, spec }: { item: UserClosetItem; spec: GarmentMeshSpec }): React.JSX.Element {
  const meshes = useMemo(() => [buildTexturedGarment(spec, 256)], [spec]);
  if (item.imageCutoutUrl) {
    return (
      <img
        src={item.imageCutoutUrl}
        alt={item.name}
        className="h-full w-full object-contain drop-shadow-md"
        draggable={false}
      />
    );
  }
  return (
    <MobileEngineViewport
      meshes={meshes}
      camera={OVERLAY_CAMERA}
      transparent
      ariaLabel={`Prenda 3D ${item.name} sobre tu foto`}
    />
  );
}

/**
 * Escenario anatómico 3D universal (Dress-Me + Vestidor IA):
 * - Sin foto: maniquí anatómico 3D esculpido en alabastro, vestido 1:1
 *   con el motor 3D y rotable con el dedo (sin muñecos planos).
 * - Con foto: foto limpia en marco editorial; la prenda 3D se superpone
 *   con pliegues y logos curvos. La zona facial 0–19.5% se protege
 *   silenciosamente por código (jamás carteles rojos ni cuadrículas).
 * Funciona al 100% en local, sin API Key.
 */
export function AnatomicalTryOnStage({
  photoUrl,
  items,
  anchors,
  onAnchorsChange,
  onRequestFullBody,
  bare = false,
}: AnatomicalTryOnStageProps): React.JSX.Element {
  const [detected, setDetected] = useState<BodyFramingType | null>(null);
  const [manual, setManual] = useState<BodyFramingType | null>(null);
  const [calOpen, setCalOpen] = useState(false);
  const [avatarCamera, setAvatarCamera] = useState<CameraState>({ yawDeg: 15, pitchDeg: 2, zoom: 1 });

  const framing: BodyFramingType = manual ?? detected ?? anchors.framing;
  const isHalf = framing === 'HALF_BODY_EXTENDED';

  const byKind = useMemo(() => {
    const top = items.find((i) => i.category === 'SUPERIOR_CAMISETA' || i.category === 'SUPERIOR_CAMISA');
    const pants = items.find((i) => i.category === 'INFERIOR_PANTALON');
    const coat = items.find((i) => i.category === 'ABRIGO');
    const accessory = items.find((i) => i.category === 'ACCESORIO');
    return { top, pants, coat, accessory };
  }, [items]);

  const specs = useMemo(
    () => ({
      top: byKind.top ? meshSpecForClosetItem(byKind.top) : null,
      pants: byKind.pants ? meshSpecForClosetItem(byKind.pants) : null,
      coat: byKind.coat ? meshSpecForClosetItem(byKind.coat) : null,
      cap: byKind.accessory ? meshSpecForClosetItem(byKind.accessory) : null,
    }),
    [byKind],
  );

  const avatarScene = useMemo(
    () =>
      buildDressedAvatarScene({
        top: specs.coat ?? specs.top,
        pants: specs.pants,
        cap: specs.cap,
      }),
    [specs],
  );

  const extensionSpec: GarmentMeshSpec = useMemo(
    () =>
      specs.pants ?? {
        category: 'PANTALON',
        variant: 'CHINO',
        fabricHex: LOWER_BODY_PRESET_HEX[anchors.lowerBodyPreset],
      },
    [specs.pants, anchors.lowerBodyPreset],
  );
  const extensionMeshes = useMemo(() => [buildTexturedGarment(extensionSpec, 256)], [extensionSpec]);

  function chooseFraming(next: BodyFramingType): void {
    setManual(next);
    onAnchorsChange({ framing: next });
  }

  const stageContent = (
    <>
      {photoUrl ? (
        isHalf ? (
          <>
            <div className="absolute inset-x-0 top-0 z-0 h-[53%] overflow-hidden">
              <img
                src={photoUrl}
                alt="Tu foto de medio cuerpo"
                className="h-full w-full object-cover object-top"
                onLoad={(e) => {
                  const img = e.currentTarget;
                  if (img.naturalWidth > 0) setDetected(detectFramingFromAspect(img.naturalHeight / img.naturalWidth));
                }}
              />
            </div>
            <div className="absolute inset-x-0 top-[44%] z-[1] h-[11%] bg-gradient-to-b from-transparent via-[#EDE8DF]/55 to-[#EDE8DF]" aria-hidden />
            {/* Extensión 3D de piernas: pantalón volumétrico sin letreros */}
            <div className="absolute inset-x-0 bottom-0 top-[49%] z-0" aria-hidden>
              <MobileEngineViewport meshes={extensionMeshes} camera={OVERLAY_CAMERA} transparent ariaLabel="Extensión 3D de piernas" />
            </div>
          </>
        ) : (
          <img
            src={photoUrl}
            alt="Tu foto de cuerpo completo"
            className="absolute inset-0 z-0 h-full w-full object-cover object-top"
            onLoad={(e) => {
              const img = e.currentTarget;
              if (img.naturalWidth > 0) setDetected(detectFramingFromAspect(img.naturalHeight / img.naturalWidth));
            }}
          />
        )
      ) : (
        /* Avatar anatómico 3D esculpido, vestido y rotable con el dedo */
        <div className="absolute inset-0 z-0">
          <MobileEngineViewport
            meshes={avatarScene}
            camera={avatarCamera}
            onCameraChange={setAvatarCamera}
            orbit
            ariaLabel="Avatar anatómico 3D con tu outfit"
          />
        </div>
      )}

      {photoUrl && (
        <>
          {byKind.pants && specs.pants && !isHalf && (
            <div
              className="absolute"
              style={{ ...boxStyle(specs.pants, anchors) }}
              title={`Pantalón 3D anclado en cintura ${anchors.waistTopPct}%`}
            >
              <GarmentOverlay3D item={byKind.pants} spec={specs.pants} />
            </div>
          )}
          {byKind.top && specs.top && (
            <div
              className="absolute"
              style={{ ...boxStyle(specs.top, anchors) }}
              title={`Prenda 3D bajo el mentón (${anchors.shoulderTopPct}%)`}
            >
              <GarmentOverlay3D item={byKind.top} spec={specs.top} />
            </div>
          )}
          {byKind.coat && specs.coat && (
            <div
              className="absolute"
              style={{ ...boxStyle(specs.coat, anchors) }}
              title="Abrigo 3D sobre los hombros"
            >
              <GarmentOverlay3D item={byKind.coat} spec={specs.coat} />
            </div>
          )}
          {byKind.accessory && specs.cap && (
            <div
              className="absolute"
              style={{ ...boxStyle(specs.cap, anchors) }}
              title="Gorra 3D sobre la frente"
            >
              <GarmentOverlay3D item={byKind.accessory} spec={specs.cap} />
            </div>
          )}
        </>
      )}
    </>
  );

  if (bare) {
    return (
      <div className="relative aspect-[9/16] w-full overflow-hidden bg-[#FAF7F2]" aria-label="Sujeto anatómico 3D con el outfit seleccionado">
        {stageContent}
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Encuadre de mi foto">
        <span className="text-[11px] font-bold text-stone-600">Encuadre de mi foto:</span>
        <button
          type="button"
          onClick={() => chooseFraming('FULL_BODY')}
          aria-pressed={framing === 'FULL_BODY'}
          className={`min-h-9 rounded-full px-3 py-1.5 text-[11px] font-bold ${framing === 'FULL_BODY' ? 'bg-gum-espresso text-white' : 'bg-stone-100 text-stone-700'}`}
        >
          Cuerpo Completo
        </button>
        <button
          type="button"
          onClick={() => chooseFraming('HALF_BODY_EXTENDED')}
          aria-pressed={isHalf}
          className={`min-h-9 rounded-full px-3 py-1.5 text-[11px] font-bold ${isHalf ? 'bg-gum-ember text-white' : 'bg-stone-100 text-stone-700'}`}
        >
          Medio Cuerpo -&gt; Auto-Completar Piernas IA
        </button>
      </div>

      <div
        className="relative mx-auto mt-2 aspect-[9/16] w-full max-w-[300px] overflow-hidden rounded-3xl border border-[#E6E0D6] bg-[#FAF7F2] shadow-inner"
        aria-label="Sujeto anatómico 3D con el outfit seleccionado"
      >
        {stageContent}
      </div>

      {isHalf && (
        <div className="mt-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-900" role="status">
          <span className="font-bold">Foto de medio cuerpo detectada:</span> extendimos la mitad inferior con el motor 3D para probar pantalones.{' '}
          <button type="button" onClick={onRequestFullBody} className="font-bold underline">
            [Subir foto de cuerpo entero]
          </button>
          <label className="mt-1.5 block font-semibold">
            Base inferior
            <select
              value={anchors.lowerBodyPreset}
              onChange={(e) => onAnchorsChange({ lowerBodyPreset: e.target.value as LowerBodyPreset })}
              className="ml-2 min-h-9 rounded-lg border border-amber-300 bg-white px-2 py-1 text-[11px]"
              aria-label="Base inferior reconstruida"
            >
              {(Object.keys(LOWER_BODY_PRESET_LABEL) as LowerBodyPreset[]).map((preset) => (
                <option key={preset} value={preset}>
                  {LOWER_BODY_PRESET_LABEL[preset]}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <button
        type="button"
        onClick={() => setCalOpen((v) => !v)}
        aria-expanded={calOpen}
        className="mt-2 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-bold text-stone-700"
      >
        <SlidersHorizontal className="h-4 w-4" aria-hidden />
        Calibrar Ajuste a mi Cuerpo (Hombros / Cintura / Escala)
        <ChevronDown className={`h-4 w-4 transition-transform ${calOpen ? 'rotate-180' : ''}`} aria-hidden />
      </button>

      {calOpen && (
        <div className="mt-2 space-y-2 rounded-xl border border-stone-200 bg-white p-3">
          <p className="flex items-center gap-1 text-[11px] font-semibold text-stone-500">
            <PersonStanding className="h-3.5 w-3.5" aria-hidden /> Ajuste en vivo: la ropa sigue tu postura sin tocar tu rostro.
          </p>
          <label className="block text-[11px] font-bold text-stone-600">
            Hombros: {anchors.shoulderTopPct.toFixed(1)}% (mín. seguro 19.5%)
            <input type="range" min={15} max={30} step={0.5} value={anchors.shoulderTopPct} onChange={(e) => onAnchorsChange({ shoulderTopPct: Number(e.target.value) })} className="mt-0.5 w-full" aria-label="Posición de hombros en porcentaje" />
          </label>
          <label className="block text-[11px] font-bold text-stone-600">
            Escala / ancho de torso: {anchors.torsoWidthPct}%
            <input type="range" min={40} max={80} step={1} value={anchors.torsoWidthPct} onChange={(e) => onAnchorsChange({ torsoWidthPct: Number(e.target.value) })} className="mt-0.5 w-full" aria-label="Ancho de torso en porcentaje" />
          </label>
          <label className="block text-[11px] font-bold text-stone-600">
            Cintura: {anchors.waistTopPct}%
            <input type="range" min={42} max={62} step={0.5} value={anchors.waistTopPct} onChange={(e) => onAnchorsChange({ waistTopPct: Number(e.target.value) })} className="mt-0.5 w-full" aria-label="Posición de cintura en porcentaje" />
          </label>
          <p className="text-[10px] text-stone-400">Guardado automático en este dispositivo. Gorras siempre en 3% (frente, sin tapar los ojos).</p>
        </div>
      )}
    </div>
  );
}

function boxStyle(
  spec: GarmentMeshSpec,
  anchors: BodyAnchorCalibration,
): React.CSSProperties & { zIndex: number } {
  const box = subjectLayerBoxMobile(spec, anchors);
  return {
    top: `${box.topPct}%`,
    left: `${box.leftPct}%`,
    width: `${box.widthPct}%`,
    height: `${box.heightPct}%`,
    zIndex: box.zIndex,
  };
}
