import React, { useMemo } from 'react';
import type { UserClosetItem } from '@gumorose/shared';
import {
  buildTexturedGarment,
  meshSpecForClosetItem,
  type GarmentMeshSpec,
} from './MobileCloth3DEngine';
import { MobileEngineViewport } from './MobileEngineViewport';

/**
 * Miniatura 3D volumétrica editorial sobre fondo alabastro #FAF7F2:
 * clóset, maleta y tarjetas sin foto de recorte. Sin bordes negros,
 * sin papel cuadriculado, sin SVG plano.
 */
export function MobileGarmentThumb({
  spec,
  label,
  yawDeg = 18,
}: {
  spec: GarmentMeshSpec;
  label: string;
  yawDeg?: number;
}): React.JSX.Element {
  const meshes = useMemo(() => [buildTexturedGarment(spec, 256)], [spec]);
  const camera = useMemo(() => ({ yawDeg, pitchDeg: 8, zoom: 1 }), [yawDeg]);
  return (
    <div className="h-full w-full bg-[#FAF7F2]" data-engine="gumorose-3d-thumb">
      <MobileEngineViewport meshes={meshes} camera={camera} ariaLabel={`Prenda 3D ${label}`} />
    </div>
  );
}

/** Miniatura 3D directa desde una prenda del clóset del usuario. */
export function ClosetItemThumb3D({ item }: { item: UserClosetItem }): React.JSX.Element {
  const spec = useMemo(() => meshSpecForClosetItem(item), [item]);
  return <MobileGarmentThumb spec={spec} label={item.name} />;
}
