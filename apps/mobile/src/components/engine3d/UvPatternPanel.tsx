import React, { useRef, useState } from 'react';
import type { CanvasLogo } from '../MobileCanvas';

export type UvPiece = 'front' | 'back' | 'sleeveL' | 'sleeveR';

export interface UvPatternPanelProps {
  logos: CanvasLogo[];
  selectedUid: string | null;
  onSelect: (uid: string | null) => void;
  onMove: (uid: string, x: number, y: number) => void;
  /** Color HEX actual de la prenda para colorear las siluetas. */
  fabricHex?: string;
  view?: 'FRONTAL' | 'TRASERA';
  onMoveInPiece?: (uid: string, piece: UvPiece, x: number, y: number) => void;
  /** Móvil lo monta desde su botón de herramientas ya abierto. */
  initialOpen?: boolean;
}

const PIECES: { id: UvPiece; title: string; viewBox: string }[] = [
  { id: 'front', title: '1. Molde Delantero (Pecho/Centro)', viewBox: '0 0 100 140' },
  { id: 'back', title: '2. Molde Espalda (Dorsal)', viewBox: '0 0 100 140' },
  { id: 'sleeveL', title: '3. Manga Izquierda', viewBox: '0 0 80 120' },
  { id: 'sleeveR', title: '4. Manga Derecha', viewBox: '0 0 80 120' },
];

function silhouettePath(piece: UvPiece): string {
  if (piece === 'front') {
    return 'M32 14 L44 7 Q50 13 56 7 L68 14 L84 32 L71 40 L71 126 Q50 133 29 126 L29 40 L16 32 Z';
  }
  if (piece === 'back') {
    return 'M32 14 L44 10 Q50 14 56 10 L68 14 L84 32 L71 40 L71 126 Q50 133 29 126 L29 40 L16 32 Z';
  }
  return 'M26 10 Q40 2 54 10 L67 102 Q40 114 13 102 Z';
}

function pieceOfLogo(logo: CanvasLogo, view: 'FRONTAL' | 'TRASERA'): UvPiece {
  if (logo.x < 48) return 'sleeveL';
  if (logo.x > 152) return 'sleeveR';
  return view === 'TRASERA' ? 'back' : 'front';
}

function logoLocal(piece: UvPiece, logo: CanvasLogo): { cx: number; cy: number } {
  if (piece === 'sleeveL') {
    return { cx: 10 + (Math.max(0, Math.min(48, logo.x)) / 48) * 60, cy: 10 + (logo.y / 260) * 96 };
  }
  if (piece === 'sleeveR') {
    return { cx: 10 + ((Math.max(152, Math.min(200, logo.x)) - 152) / 48) * 60, cy: 10 + (logo.y / 260) * 96 };
  }
  return { cx: 12 + (logo.x / 200) * 76, cy: 10 + (logo.y / 260) * 118 };
}

function toLogo(piece: UvPiece, localX: number, localY: number): { x: number; y: number } {
  if (piece === 'sleeveL') {
    return {
      x: Math.max(4, Math.min(44, ((localX - 10) / 60) * 48)),
      y: Math.max(0, Math.min(260, ((localY - 10) / 96) * 260)),
    };
  }
  if (piece === 'sleeveR') {
    return {
      x: Math.max(156, Math.min(196, 152 + ((localX - 10) / 60) * 48)),
      y: Math.max(0, Math.min(260, ((localY - 10) / 96) * 260)),
    };
  }
  return {
    x: Math.max(0, Math.min(200, ((localX - 12) / 76) * 200)),
    y: Math.max(0, Math.min(260, ((localY - 10) / 118) * 260)),
  };
}

/**
 * Molde de Corte Industrial 2D: 4 piezas independientes en columnas.
 * Cerrado por defecto; al abrir, cada tarjeta dibuja su silueta con el
 * HEX actual y los logos reales, sincronizados con el modelo 3D.
 */
export function MobileUvPatternPanel({
  logos,
  selectedUid,
  onSelect,
  onMove,
  fabricHex = '#C86D51',
  view = 'FRONTAL',
  onMoveInPiece,
  initialOpen = false,
}: UvPatternPanelProps): React.JSX.Element {
  const [open, setOpen] = useState(initialOpen);
  const dragRef = useRef<{ uid: string; piece: UvPiece } | null>(null);
  const fabric = /^#[0-9A-Fa-f]{6}$/.test(fabricHex) ? fabricHex : '#C86D51';

  function moveTo(piece: UvPiece, uid: string, localX: number, localY: number): void {
    const pos = toLogo(piece, localX, localY);
    if (onMoveInPiece) onMoveInPiece(uid, piece, pos.x, pos.y);
    else onMove(uid, pos.x, pos.y);
  }

  function localPoint(event: React.PointerEvent<SVGSVGElement>, piece: UvPiece): { x: number; y: number } {
    const rect = event.currentTarget.getBoundingClientRect();
    const spec = PIECES.find((p) => p.id === piece)!;
    const [, , width, height] = spec.viewBox.split(' ').map(Number);
    return {
      x: ((event.clientX - rect.left) / rect.width) * (width ?? 100),
      y: ((event.clientY - rect.top) / rect.height) * (height ?? 140),
    };
  }

  return (
    <figure className="rounded-2xl border border-[#E6E0D6] bg-white p-3 shadow-editorial">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full text-left"
      >
        <span className="block font-display text-sm font-semibold text-gum-espresso">
          📐 Ver / Editar Molde de Corte Industrial 2D (Planta Riobamba)
        </span>
        <span className="mt-0.5 block text-[11px] text-stone-500">
          Muestra las 4 piezas de tela cortadas en la Etapa 4 antes de coser. Haz clic en cualquier pieza para posicionar tu logo con precisión milimétrica
        </span>
        <span className="mt-1 inline-block text-[11px] font-bold text-gum-terracottadark">{open ? 'Ocultar molde ▲' : 'Abrir molde ▼'}</span>
      </button>
      {open && (
        <>
          <div className="mt-3 grid grid-cols-2 gap-4 md:grid-cols-4">
            {PIECES.map((piece) => {
              const path = silhouettePath(piece.id);
              return (
                <article key={piece.id} className="rounded-xl border border-[#E6E0D6] bg-[#FAF7F2] p-2">
                  <h4 className="min-h-8 text-center text-[11px] font-bold leading-tight text-gum-espresso">{piece.title}</h4>
                  <svg
                    viewBox={piece.viewBox}
                    className="mt-1 w-full touch-none select-none"
                    role="img"
                    aria-label={piece.title}
                    onPointerDown={(event) => {
                      if (!selectedUid) return;
                      const local = localPoint(event, piece.id);
                      dragRef.current = { uid: selectedUid, piece: piece.id };
                      moveTo(piece.id, selectedUid, local.x, local.y);
                    }}
                    onPointerMove={(event) => {
                      const drag = dragRef.current;
                      if (!drag || drag.piece !== piece.id) return;
                      const local = localPoint(event, piece.id);
                      moveTo(piece.id, drag.uid, local.x, local.y);
                    }}
                    onPointerUp={() => { dragRef.current = null; }}
                    onPointerLeave={() => { dragRef.current = null; }}
                  >
                    <path d={path} fill={fabric} stroke="#57534E" strokeWidth="1.2" />
                    <path d={path} fill="none" stroke="#FAF7F2" strokeWidth="1" strokeDasharray="4 3" transform={piece.id.startsWith('sleeve') ? 'translate(40 60) scale(0.88) translate(-40 -60)' : 'translate(50 70) scale(0.92) translate(-50 -70)'} />
                    {logos.filter((logo) => pieceOfLogo(logo, view) === piece.id).map((logo) => {
                      const pos = logoLocal(piece.id, logo);
                      const width = Math.max(14, (logo.width / 200) * 76);
                      const height = Math.max(14, (logo.height / 260) * 118);
                      const selected = selectedUid === logo.uid;
                      return (
                        <g
                          key={logo.uid}
                          transform={`translate(${pos.cx} ${pos.cy}) rotate(${logo.rotation})`}
                          onPointerDown={(event) => {
                            event.stopPropagation();
                            dragRef.current = { uid: logo.uid, piece: piece.id };
                            onSelect(logo.uid);
                          }}
                          style={{ cursor: 'grab' }}
                        >
                          {selected && <rect x={-width / 2 - 2} y={-height / 2 - 2} width={width + 4} height={height + 4} rx="4" fill="none" stroke="#C86D51" strokeWidth="1.6" />}
                          <image href={logo.logoUrl} x={-width / 2} y={-height / 2} width={width} height={height} preserveAspectRatio="xMidYMid meet" />
                        </g>
                      );
                    })}
                  </svg>
                  <p className="mt-1 text-center text-[10px] text-stone-500">
                    {logos.some((logo) => pieceOfLogo(logo, view) === piece.id) ? 'Logo activo en esta pieza' : 'Sin logo en esta pieza'}
                  </p>
                </article>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-stone-500">
            Haz clic o arrastra dentro de cualquier pieza: el logo seleccionado se mueve ahí y se actualiza en el modelo 3D al instante.
          </p>
        </>
      )}
    </figure>
  );
}
