import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Camera,
  Check,
  ImagePlus,
  Loader2,
  Maximize2,
  PersonStanding,
  Plus,
  RefreshCw,
  Shirt,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type {
  DesignSaveInput,
  GarmentTemplate,
  LogoPlacement,
  LogoZone,
  PrintTechnique,
} from '@gumorose/shared';
import { calculateGarmentUnitPrice } from '@gumorose/shared';
import { fetchCatalog, generateLogo, saveCustomDesign } from '../services/mobileApi';
import { compressImageFileToDataUrl } from '../services/image';
import { useClosetMobile } from '../context/ClosetMobileContext';
import {
  MobileCanvas,
  zoneDefaultFor,
  type CanvasView,
  type ViewerDisplayMode,
} from '../components/MobileCanvas';
import { MobileUvPatternPanel } from '../components/engine3d/UvPatternPanel';
import type { MobileGestureMode } from '../components/engine3d/MobileEngineViewport';
import { GALLERY_SEALS, STUDIO_SUBJECTS, colorHexOf, prettyColor } from '../data/mobile';

interface MobileCustomizerScreenProps {
  onAddedToBox: () => void;
  onTryOn: () => void;
}

export interface StudioLogo {
  uid: string;
  logoUrl: string;
  zone: LogoZone;
  technique: PrintTechnique;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

const ZONES: LogoZone[] = ['PECHO_IZQ', 'PECHO_DER', 'CENTRO', 'ESPALDA', 'MANGA_IZQ', 'MANGA_DER'];

const TECHNIQUE_LABEL: Record<PrintTechnique, string> = {
  SERIGRAFIA: 'Serigrafía',
  SUBLIMADO: 'Sublimado',
  VINIL: 'Vinil',
};

const MAX_LOGOS = 6;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function MiniSlider(props: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  display: string;
  onChange: (value: number) => void;
}): React.JSX.Element {
  return (
    <label className="block">
      <span className="flex items-center justify-between text-[11px] font-medium text-stone-600">
        {props.label}
        <span className="rounded bg-stone-100 px-1.5 py-0.5 font-bold text-gum-ink">{props.display}</span>
      </span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
        className="mt-0.5 w-full"
      />
    </label>
  );
}

/** Pantalla 4: estudio multi-logo táctil con 3 acciones directas. */
export function MobileCustomizerScreen({
  onAddedToBox,
  onTryOn,
}: MobileCustomizerScreenProps): React.JSX.Element {
  const { addLine, saveClosetItem, setDraftCombo, profile, items: closetItems } = useClosetMobile();

  const [catalog, setCatalog] = useState<GarmentTemplate[]>([]);
  const [garmentId, setGarmentId] = useState('');
  const [view, setView] = useState<CanvasView>('FRONTAL');
  const [size, setSize] = useState('M');
  const [fabricName, setFabricName] = useState('BLANCO');
  const [fabricHex, setFabricHex] = useState(colorHexOf('BLANCO'));
  const [logos, setLogos] = useState<StudioLogo[]>([]);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);

  const [aiPrompt, setAiPrompt] = useState('sello andino minimalista');
  const [aiLoading, setAiLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [designName, setDesignName] = useState('');
  const [qty, setQty] = useState(4);
  const [saving, setSaving] = useState(false);

  const [studioTab, setStudioTab] = useState<'DISENO' | 'LOGOS' | 'SUJETO'>('DISENO');

  /* --------- Estudio XL: modo en vivo, sujeto, zoom y tilt 3D --------- */
  const [liveMode, setLiveMode] = useState<'PRENDA3D' | 'SUJETO'>('PRENDA3D');
  const [subjectId, setSubjectId] = useState<'USUARIO' | 'MASCULINO' | 'FEMENINA'>('USUARIO');
  const [subjectPhoto, setSubjectPhoto] = useState<string | null>(null);
  const [lookBottomId, setLookBottomId] = useState('');
  const [zoom, setZoom] = useState(100);
  const [spinY, setSpinY] = useState(0);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [displayMode, setDisplayMode] = useState<ViewerDisplayMode>('MANNEQUIN');
  const [specular, setSpecular] = useState(0.5);
  const [fullscreen, setFullscreen] = useState(false);
  const [curtain, setCurtain] = useState(55);
  const [gestureMode, setGestureMode] = useState<MobileGestureMode>('ROTATE');
  const [showUvMold, setShowUvMold] = useState(false);
  const [scanning, setScanning] = useState<0 | 1 | 2 | 3>(0);
  const subjectFileRef = useRef<HTMLInputElement | null>(null);

  const activeSubject = STUDIO_SUBJECTS.find((s) => s.id === subjectId) ?? STUDIO_SUBJECTS[0];
  const subjectImage =
    subjectId === 'USUARIO'
      ? (subjectPhoto ?? profile?.fullBodyPhotoUrl ?? activeSubject?.silhouetteUrl ?? '')
      : (activeSubject?.silhouetteUrl ?? '');

  async function handleSubjectPhoto(file: File | undefined): Promise<void> {
    if (!file) return;
    try {
      const dataUrl = await compressImageFileToDataUrl(file);
      setSubjectPhoto(dataUrl);
      setSubjectId('USUARIO');
    } catch {
      /* la foto anterior se conserva */
    }
  }

  function runSubjectScan(): void {
    setScanning(1);
    window.setTimeout(() => setScanning(2), 650);
    window.setTimeout(() => setScanning(3), 1300);
    window.setTimeout(() => setScanning(0), 2100);
  }

  useEffect(() => {
    let cancelled = false;
    fetchCatalog()
      .then((res) => {
        if (cancelled) return;
        setCatalog(res.items);
        const first = res.items[0];
        if (first) {
          setGarmentId(first.id);
          setSize(first.sizes.includes('M') ? 'M' : (first.sizes[0] ?? 'M'));
          const color = first.colors[0] ?? 'BLANCO';
          setFabricName(color);
          setFabricHex(colorHexOf(color));
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const garment = catalog.find((g) => g.id === garmentId) ?? catalog[0] ?? null;
  const selected = logos.find((l) => l.uid === selectedUid) ?? null;
  const pricing = garment
    ? calculateGarmentUnitPrice(
        {
          category: garment.category,
          baseSalePrice: garment.baseSalePrice,
          baseTimeMinutes: garment.baseTimeMinutes,
        },
        logos.length,
      )
    : null;

  function pushLogo(logoUrl: string, technique: PrintTechnique): string | null {
    if (!garment) return 'Elige primero una prenda base.';
    if (logos.length >= MAX_LOGOS) return `Máximo ${MAX_LOGOS} logos por diseño.`;
    const d = zoneDefaultFor(garment.category, 'CENTRO');
    const uid = `logo-${Date.now()}-${logos.length}`;
    setLogos((prev) => [
      ...prev,
      { uid, logoUrl, zone: 'CENTRO', technique, x: d.x, y: d.y, width: d.w, height: d.h, rotation: 0 },
    ]);
    setView(d.view);
    setSelectedUid(uid);
    return null;
  }

  function patchLogo(uid: string, patch: Partial<StudioLogo>): void {
    setLogos((prev) => prev.map((l) => (l.uid === uid ? { ...l, ...patch } : l)));
  }

  /* Controles flotantes del lienzo: escalar, rotar y duplicar el logo. */
  function scaleLogo(logoUid: string, factor: number): void {
    const logo = logos.find((l) => l.uid === logoUid);
    if (!logo) return;
    patchLogo(logoUid, {
      width: Math.min(100, Math.max(10, round1(logo.width * factor))),
      height: Math.min(100, Math.max(10, round1(logo.height * factor))),
    });
  }

  function rotateLogo(logoUid: string, deltaDeg: number): void {
    const logo = logos.find((l) => l.uid === logoUid);
    if (!logo) return;
    patchLogo(logoUid, { rotation: (logo.rotation + deltaDeg + 360) % 360 });
  }

  function duplicateLogo(logoUid: string): void {
    const logo = logos.find((l) => l.uid === logoUid);
    if (!logo || logos.length >= MAX_LOGOS) return;
    const copy: StudioLogo = {
      ...logo,
      uid: `logo-${Date.now()}-copy`,
      x: Math.min(160, logo.x + 14),
      y: Math.min(220, logo.y + 14),
    };
    setLogos((prev) => [...prev, copy]);
    setSelectedUid(copy.uid);
  }

  function changeZone(uid: string, zone: LogoZone): void {
    if (!garment) return;
    const d = zoneDefaultFor(garment.category, zone);
    patchLogo(uid, { zone, x: d.x, y: d.y, width: d.w, height: d.h });
    setView(d.view);
  }

  function handleUploadFile(file: File | undefined): void {
    setNotice(null);
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setNotice('El archivo debe ser una imagen.');
      return;
    }
    // Cualquier peso se optimiza en cliente (canvas) antes de subir.
    void compressImageFileToDataUrl(file)
      .then((url) => {
        const problem = pushLogo(url, 'SERIGRAFIA');
        if (problem) setNotice(problem);
      })
      .catch(() => setNotice('No se pudo leer la imagen.'));
  }

  async function handleGenerateLogo(): Promise<void> {
    setNotice(null);
    if (aiPrompt.trim().length < 3) {
      setNotice('Describe el logo con al menos 3 caracteres.');
      return;
    }
    if (logos.length >= MAX_LOGOS) {
      setNotice(`Ya tienes ${MAX_LOGOS} logos.`);
      return;
    }
    setAiLoading(true);
    try {
      const res = await generateLogo(aiPrompt.trim(), 'textil', 1);
      const img = res.images[0];
      if (img) {
        const problem = pushLogo(img.url, 'SUBLIMADO');
        setNotice(problem ?? `Logo generado (${res.provider === 'mock' ? 'vista previa local' : res.model}).`);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se pudo generar el logo.');
    } finally {
      setAiLoading(false);
    }
  }

  async function persistDesign(): Promise<{ designId: string } | null> {
    setNotice(null);
    if (!garment) {
      setNotice('Elige una prenda base.');
      return null;
    }
    if (logos.length === 0) {
      setNotice('Agrega al menos 1 logo.');
      return null;
    }
    const placements: LogoPlacement[] = logos.map((l) => ({
      id: l.uid.slice(0, 80),
      logoUrl: l.logoUrl,
      zone: l.zone,
      x: round1(l.x),
      y: round1(l.y),
      width: round1(l.width),
      height: round1(l.height),
      rotation: round1(l.rotation),
      technique: l.technique,
    }));
    const input: DesignSaveInput = {
      garmentId: garment.id,
      name: designName.trim() || `${garment.name} personalizado`,
      size,
      color: fabricName,
      logos: placements,
    };
    setSaving(true);
    try {
      const saved = await saveCustomDesign(input);
      return { designId: saved.id };
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se pudo guardar el diseño.');
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveToCloset(): Promise<void> {
    if (!garment) return;
    const saved = await persistDesign();
    if (!saved) return;
    try {
      await saveClosetItem({
        category: 'SUPERIOR_CAMISETA',
        name: designName.trim() || `${garment.name} personalizado`,
        colorHex: fabricHex,
        warmthLevel: 'TEMPLADO',
        sourceType: 'DISENO_CUSTOM',
        designId: saved.designId,
      });
      setNotice('Diseño guardado en tu Clóset Virtual.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Diseño guardado, pero no entró al clóset.');
    }
  }

  async function handleTryOn(): Promise<void> {
    if (!garment) return;
    const saved = await persistDesign();
    if (!saved) return;
    try {
      const item = await saveClosetItem({
        category: 'SUPERIOR_CAMISETA',
        name: designName.trim() || `${garment.name} personalizado`,
        colorHex: fabricHex,
        warmthLevel: 'TEMPLADO',
        sourceType: 'DISENO_CUSTOM',
        designId: saved.designId,
      });
      setDraftCombo([item.id]);
      onTryOn();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se pudo llevar al vestidor.');
    }
  }

  async function handleAddToBox(): Promise<void> {
    if (!garment) return;
    const saved = await persistDesign();
    if (!saved) return;
    const safeQty = Math.min(160, Math.max(1, Math.floor(qty || 1)));
    addLine({
      customDesignId: saved.designId,
      garmentId: garment.id,
      garmentName: garment.name,
      category: garment.category,
      baseSalePrice: garment.baseSalePrice,
      baseTimeMinutes: garment.baseTimeMinutes,
      size,
      color: fabricName,
      quantity: safeQty,
      logosCount: logos.length,
    });
    onAddedToBox();
  }

  if (!garment) {
    return <p className="py-10 text-center text-sm text-stone-500">Cargando prendas del taller…</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gum-terracottadark">
          Estudio Multi-Logo
        </p>
        <h2 className="font-display text-2xl font-semibold text-gum-espresso">Diseñar</h2>
        <p className="text-xs text-stone-500">
          Primer logo incluido · +$1.25 USD / +4 min por logo extra.
        </p>
      </div>

      {/* Tabs: el lienzo queda protagonista, lo secundario vive aquí */}
      <div className="grid grid-cols-3 gap-1 rounded-full bg-gum-linen p-1" role="group" aria-label="Paneles del estudio">
        {(
          [
            { id: 'DISENO', label: '1. Base & Color' },
            { id: 'LOGOS', label: '2. Logos + Muse Image IA' },
            { id: 'SUJETO', label: '3. Probar / Guardar' },
          ] as const
        ).map((tabItem) => (
          <button
            key={tabItem.id}
            type="button"
            onClick={() => setStudioTab(tabItem.id)}
            aria-pressed={studioTab === tabItem.id}
            className={`min-h-10 rounded-full px-1 py-2 text-[10px] font-bold transition active:scale-95 ${
              studioTab === tabItem.id ? 'bg-gum-espresso text-white shadow-card' : 'text-stone-600'
            }`}
          >
            {tabItem.label}
          </button>
        ))}
      </div>

      <section className="rounded-2xl border border-stone-200 bg-white p-4">
        <label className="block text-xs font-bold text-gum-ink">
          Prenda base
          <select
            value={garment.id}
            onChange={(e) => {
              const next = catalog.find((g) => g.id === e.target.value);
              setGarmentId(e.target.value);
              if (next) {
                setSize(next.sizes.includes('M') ? 'M' : (next.sizes[0] ?? 'M'));
                const c = next.colors[0] ?? 'BLANCO';
                setFabricName(c);
                setFabricHex(colorHexOf(c));
              }
            }}
            className="mt-1 min-h-11 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
          >
            {catalog.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name} · ${g.baseSalePrice.toFixed(2)}
              </option>
            ))}
          </select>
        </label>

        <div className="mt-2 flex gap-1.5" role="group" aria-label="Vista">
          {(['FRONTAL', 'TRASERA'] as CanvasView[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              aria-pressed={view === v}
              className={`flex-1 rounded-xl py-2.5 text-xs font-bold ${
                view === v ? 'bg-gum-ink text-white' : 'bg-stone-100 text-stone-700'
              }`}
            >
              {v === 'FRONTAL' ? 'Frontal' : 'Trasera'}
            </button>
          ))}
        </div>

        {/* Selector de Modo de Visualización en Vivo (tab Sujeto) */}
        {studioTab === 'SUJETO' && (
        <>
        <div className="mt-3 flex gap-1.5" role="group" aria-label="Modo de visualización en vivo">
          {(
            [
              { id: 'PRENDA3D', label: 'Prenda 3D Studio', icon: <Shirt className="h-4 w-4" aria-hidden /> },
              { id: 'SUJETO', label: 'Sujeto de Pruebas', icon: <PersonStanding className="h-4 w-4" aria-hidden /> },
            ] as const
          ).map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => setLiveMode(mode.id)}
              aria-pressed={liveMode === mode.id}
              className={`inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-bold ${
                liveMode === mode.id ? 'bg-gum-ink text-white' : 'bg-stone-100 text-stone-700'
              }`}
            >
              {mode.icon} {mode.label}
            </button>
          ))}
        </div>

        {liveMode === 'SUJETO' && (
          <div className="mt-2 space-y-2">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Sujeto de pruebas">
              {STUDIO_SUBJECTS.map((subject) => (
                <button
                  key={subject.id}
                  type="button"
                  onClick={() => setSubjectId(subject.id)}
                  aria-pressed={subjectId === subject.id}
                  className={`min-h-9 rounded-full border px-2.5 py-1.5 text-[10px] font-bold ${
                    subjectId === subject.id
                      ? 'border-gum-ember bg-gum-ember text-white'
                      : 'border-stone-300 text-stone-600'
                  }`}
                >
                  {subject.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => subjectFileRef.current?.click()}
                className="inline-flex min-h-9 items-center gap-1 rounded-full border border-dashed border-stone-400 px-2.5 py-1.5 text-[10px] font-bold text-stone-700"
              >
                <Camera className="h-3.5 w-3.5" aria-hidden /> Mi foto
              </button>
              <input
                ref={subjectFileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  void handleSubjectPhoto(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </div>
            <p className="text-[10px] text-stone-500">
              {profile?.fullBodyPhotoUrl && subjectId === 'USUARIO'
                ? 'Tu foto real de cuerpo completo (sincronizada Móvil ⇄ Web).'
                : 'Sube tu foto o usa un modelo de estudio.'}
            </p>
            <label className="block text-[11px] font-medium text-stone-600">
              Pantalón del look (Clóset/Catálogo)
              <select
                value={lookBottomId}
                onChange={(e) => setLookBottomId(e.target.value)}
                className="mt-1 min-h-11 w-full rounded-xl border border-stone-300 px-2 py-2 text-xs"
              >
                <option value="">Sin pantalón (solo superior)</option>
                {catalog
                  .filter((g) => g.category === 'PANTALON')
                  .map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                {closetItems
                  .filter((item) => item.category === 'INFERIOR_PANTALON')
                  .map((item) => (
                    <option key={item.id} value={`closet:${item.id}`}>
                      Clóset: {item.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>
        )}
        </>
        )}

        {/* Escenario XL táctil con Motor 3D real (orbit, pinch, logos curvos) */}
        {liveMode === 'PRENDA3D' && (
          <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Modo de gesto 3D">
            <button
              type="button"
              onClick={() => setGestureMode('ROTATE')}
              aria-pressed={gestureMode === 'ROTATE'}
              className={`min-h-10 flex-1 rounded-xl px-3 text-[11px] font-bold ${gestureMode === 'ROTATE' ? 'bg-gum-espresso text-white' : 'bg-stone-100 text-stone-700'}`}
            >
              🔄 Girar Prenda 3D (360°)
            </button>
            <button
              type="button"
              onClick={() => setGestureMode('MOVE_LOGO')}
              aria-pressed={gestureMode === 'MOVE_LOGO'}
              className={`min-h-10 flex-1 rounded-xl px-3 text-[11px] font-bold ${gestureMode === 'MOVE_LOGO' ? 'bg-gum-ember text-white' : 'bg-stone-100 text-stone-700'}`}
            >
              ✥ Mover / Escalar Logo en 3D
            </button>
            <button
              type="button"
              onClick={() => setShowUvMold((v) => !v)}
              aria-expanded={showUvMold}
              className={`min-h-10 rounded-xl px-3 text-[11px] font-bold ${showUvMold ? 'bg-[#2F4842] text-white' : 'bg-stone-100 text-stone-700'}`}
            >
              📐 Ver Molde UV
            </button>
          </div>
        )}
        {liveMode === 'PRENDA3D' && showUvMold && (
          <div className="mt-2 rounded-xl border border-[#E6E0D6] bg-white p-3">
            <p className="text-[11px] font-bold text-gum-espresso">Molde Industrial UV 2D · Planta Riobamba</p>
            <MobileUvPatternPanel
              logos={logos}
              selectedUid={selectedUid}
              fabricHex={fabricHex}
              view={view}
              initialOpen
              onSelect={setSelectedUid}
              onMove={(uid, x, y) => patchLogo(uid, { x: round1(x), y: round1(y) })}
              onMoveInPiece={(uid, piece, x, y) => {
                setView(piece === 'back' ? 'TRASERA' : 'FRONTAL');
                patchLogo(uid, { x: round1(x), y: round1(y) });
              }}
            />
            <p className="mt-1 text-[11px] text-stone-600">
              Logos extra: {Math.max(0, logos.length - 1)} ·{' '}
              <span className="font-bold text-gum-espresso">
                +${(Math.max(0, logos.length - 1) * 1.25).toFixed(2)} USD · +{Math.max(0, logos.length - 1) * 4} min
              </span>{' '}
              en planta (primer logo incluido).
            </p>
          </div>
        )}
        <div className="relative mt-2 overflow-hidden rounded-xl bg-[#FAF7F2]">
          <div className="flex min-h-[430px] items-center justify-center p-3">
            {liveMode === 'PRENDA3D' ? (
              <div className="w-full max-w-[320px]">
                <MobileCanvas
                  category={garment.category}
                  variant={garment.visualVariant}
                  fabricHex={fabricHex}
                  view={view}
                  logos={logos}
                  selectedUid={selectedUid}
                  onSelect={setSelectedUid}
                  onMove={(uid, x, y) => patchLogo(uid, { x: round1(x), y: round1(y) })}
                  onScale={scaleLogo}
                  onRotate={rotateLogo}
                  onDuplicate={duplicateLogo}
                  orbit
                  gestureMode={gestureMode}
                  yawDeg={spinY}
                  pitchDeg={-tilt.x}
                  zoom={zoom / 100}
                  displayMode={displayMode}
                  onDisplayModeChange={setDisplayMode}
                  onCameraChange={(cam) => {
                    setSpinY(cam.yawDeg);
                    setTilt({ x: -cam.pitchDeg, y: 0 });
                    setZoom(Math.round(cam.zoom * 100));
                  }}
                />
              </div>
            ) : (
              <div className="relative w-full max-w-[290px]">
                <img
                  src={subjectImage}
                  alt={activeSubject?.label ?? 'Sujeto de pruebas'}
                  className="aspect-[3/5] w-full rounded-xl object-cover"
                />
                <div
                  className="absolute inset-0 overflow-hidden rounded-xl"
                  style={{ clipPath: `inset(0 ${100 - curtain}% 0 0)` }}
                >
                  <img src={subjectImage} alt="" className="aspect-[3/5] w-full object-cover" />
                  <div className="absolute left-1/2 top-[16%] w-[68%] -translate-x-1/2">
                    <MobileCanvas
                      category={garment.category}
                      variant={garment.visualVariant}
                      fabricHex={fabricHex}
                      view={view}
                      logos={logos}
                      selectedUid={selectedUid}
                      onSelect={setSelectedUid}
                      onMove={(uid, x, y) => patchLogo(uid, { x: round1(x), y: round1(y) })}
                      onScale={scaleLogo}
                      onRotate={rotateLogo}
                      onDuplicate={duplicateLogo}
                      transparent
                      gestureMode="MOVE_LOGO"
                    />
                  </div>
                  {(() => {
                    const bottom = catalog.find((g) => g.id === lookBottomId);
                    return bottom ? (
                      <div className="pointer-events-none absolute left-1/2 top-[52%] w-[58%] -translate-x-1/2 opacity-95">
                        <MobileCanvas
                          category={bottom.category}
                          variant={bottom.visualVariant}
                          fabricHex={colorHexOf(bottom.colors[0] ?? 'NEGRO')}
                          view="FRONTAL"
                          logos={[]}
                          selectedUid={null}
                          onSelect={() => undefined}
                          onMove={() => undefined}
                          transparent
                        />
                      </div>
                    ) : null;
                  })()}
                </div>
                <span className="absolute bottom-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-[9px] font-bold text-white">
                  {curtain < 50 ? 'Antes' : 'Después'} · {activeSubject?.label}
                </span>
                {scanning > 0 && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-xl bg-gum-ink/80 px-4 text-center text-white" role="status">
                    <RefreshCw className="h-7 w-7 animate-spin text-gum-gold" aria-hidden />
                    <p className="text-xs font-bold">
                      {scanning === 1 && '1. Segmentando silueta con Meta SAM 3.1…'}
                      {scanning === 2 && '2. Ajustando caída textil y logos…'}
                      {scanning === 3 && '3. Renderizando iluminación con Muse Wonder…'}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Controles del escenario (tab Sujeto) */}
        {studioTab === 'SUJETO' && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
          <label className="flex items-center gap-1 font-bold text-stone-600">
            Zoom {zoom}%
            <input type="range" min={75} max={180} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} aria-label="Zoom del estudio" />
          </label>
          <label className="flex items-center gap-1 font-bold text-stone-600">
            Giro {spinY}°
            <input type="range" min={-180} max={180} value={spinY} onChange={(e) => setSpinY(Number(e.target.value))} aria-label="Rotación 3D" />
          </label>
          <button type="button" onClick={() => { setView('FRONTAL'); setSpinY(0); }} className="min-h-9 rounded-lg border border-stone-300 px-2 py-1.5 font-bold text-stone-700">
            Frente
          </button>
          <button type="button" onClick={() => { setView('TRASERA'); setSpinY(180); }} className="min-h-9 rounded-lg border border-stone-300 px-2 py-1.5 font-bold text-stone-700">
            Espalda 360°
          </button>
          <button type="button" onClick={() => setFullscreen(true)} className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-gum-ink px-2 py-1.5 font-bold text-white">
            <Maximize2 className="h-3.5 w-3.5" aria-hidden /> Pantalla Completa
          </button>
          {liveMode === 'SUJETO' && (
            <>
              <button type="button" onClick={runSubjectScan} className="min-h-9 rounded-lg bg-gum-ember px-2 py-1.5 font-bold text-white">
                Vestirme con IA (SAM 3.1 + Muse Wonder)
              </button>
              <label className="flex items-center gap-1 font-bold text-stone-600">
                Antes/Después {curtain}%
                <input type="range" min={0} max={100} value={curtain} onChange={(e) => setCurtain(Number(e.target.value))} aria-label="Comparador antes y después" />
              </label>
            </>
          )}
        </div>
        )}

        {fullscreen && (
          <div className="fixed inset-0 z-50 flex flex-col bg-gum-ink/95 p-4" role="dialog" aria-modal="true" aria-label="Estudio en pantalla completa">
            <div className="flex items-center justify-between text-white">
              <p className="font-display text-base font-bold">Estudio Gumorose · Cine / Zoom</p>
              <button type="button" onClick={() => setFullscreen(false)} aria-label="Cerrar pantalla completa" className="rounded-full bg-white/10 p-2">
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <div className="flex flex-1 items-center justify-center">
              <div className="w-full max-w-[340px]">
                <MobileCanvas
                  category={garment.category}
                  variant={garment.visualVariant}
                  fabricHex={fabricHex}
                  view={view}
                  logos={logos}
                  selectedUid={selectedUid}
                  onSelect={setSelectedUid}
                  onMove={(uid, x, y) => patchLogo(uid, { x: round1(x), y: round1(y) })}
                  onScale={scaleLogo}
                  onRotate={rotateLogo}
                  onDuplicate={duplicateLogo}
                  orbit
                  gestureMode={gestureMode}
                  yawDeg={spinY}
                  pitchDeg={-tilt.x}
                  zoom={zoom / 100}
                  displayMode={displayMode}
                  onDisplayModeChange={setDisplayMode}
                  onCameraChange={(cam) => {
                    setSpinY(cam.yawDeg);
                    setTilt({ x: -cam.pitchDeg, y: 0 });
                    setZoom(Math.round(cam.zoom * 100));
                  }}
                />
              </div>
            </div>
            <p className="text-center text-[11px] text-stone-300">Zoom {zoom}% · Giro {spinY}°</p>
          </div>
        )}

        {/* Talla y color (tab Diseño) */}
        {studioTab === 'DISENO' && (
        <>
        <div className="mt-2">
          <p className="text-xs font-bold text-gum-ink">Talla</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {garment.sizes.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSize(s)}
                aria-pressed={size === s}
                className={`min-h-10 min-w-10 rounded-xl border px-3 text-xs font-bold ${
                  size === s ? 'border-gum-ember bg-gum-ember text-white' : 'border-stone-300'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-2">
          <p className="text-xs font-bold text-gum-ink">Color de tela</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {garment.colors.map((c) => (
              <button
                key={c}
                type="button"
                title={prettyColor(c)}
                onClick={() => {
                  setFabricName(c);
                  setFabricHex(colorHexOf(c));
                }}
                aria-pressed={fabricName === c}
                className={`h-9 w-9 rounded-full border-2 ${fabricName === c ? 'border-gum-ember' : 'border-stone-300'}`}
                style={{ backgroundColor: colorHexOf(c) }}
              />
            ))}
            <input
              type="color"
              value={/^#[0-9A-Fa-f]{6}$/.test(fabricHex) ? fabricHex : '#7A1F1F'}
              onChange={(e) => {
                setFabricHex(e.target.value);
                setFabricName(e.target.value);
              }}
              className="h-9 w-12 rounded border border-stone-300"
              aria-label="Color personalizado de tela"
            />
          </div>
        </div>
        </>
        )}
      </section>

      {/* Logos e IA (tab Logos e IA) */}
      {studioTab === 'LOGOS' && (
      <section className="rounded-2xl border border-stone-200 bg-white p-4">
        <h3 className="text-sm font-bold text-gum-ink">Logos ({logos.length}/{MAX_LOGOS})</h3>
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex min-h-11 items-center justify-center gap-1 rounded-xl border border-dashed border-stone-400 text-[11px] font-bold text-stone-700"
          >
            <Upload className="h-3.5 w-3.5" aria-hidden /> Subir
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              handleUploadFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => {
              const seal = GALLERY_SEALS[logos.length % GALLERY_SEALS.length];
              if (seal) {
                const problem = pushLogo(seal.url, seal.technique);
                if (problem) setNotice(problem);
              }
            }}
            className="flex min-h-11 items-center justify-center gap-1 rounded-xl border border-dashed border-stone-400 text-[11px] font-bold text-stone-700"
          >
            <ImagePlus className="h-3.5 w-3.5" aria-hidden /> Sello
          </button>
          <div className="flex min-h-11 items-center rounded-xl bg-stone-100 px-2 text-[11px] text-stone-500">
            Toca un logo para editarlo
          </div>
        </div>

        <div className="mt-2 flex gap-1.5">
          <input
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            placeholder="Describe tu logo…"
            className="min-h-11 flex-1 rounded-xl border border-stone-300 px-3 text-sm"
            aria-label="Descripción del logo para IA"
          />
          <button
            type="button"
            onClick={() => void handleGenerateLogo()}
            disabled={aiLoading}
            className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-gum-ember px-3 text-xs font-bold text-white disabled:opacity-60"
          >
            {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
            IA
          </button>
        </div>

        {logos.length > 0 && (
          <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
            {logos.map((logo, index) => (
              <button
                key={logo.uid}
                type="button"
                onClick={() => {
                  setSelectedUid(logo.uid);
                  if (garment) setView(zoneDefaultFor(garment.category, logo.zone).view);
                }}
                aria-pressed={selectedUid === logo.uid}
                className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border-2 ${
                  selectedUid === logo.uid ? 'border-gum-ember' : 'border-stone-200'
                }`}
              >
                <img src={logo.logoUrl} alt={`Logo ${index + 1}`} className="h-full w-full object-contain p-1" />
              </button>
            ))}
          </div>
        )}

        {selected && (
          <div className="mt-2 space-y-2 rounded-xl bg-gum-bone p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-gum-ink">
                Logo {logos.findIndex((l) => l.uid === selected.uid) + 1}
              </p>
              <button
                type="button"
                onClick={() => {
                  setLogos((prev) => prev.filter((l) => l.uid !== selected.uid));
                  setSelectedUid(null);
                }}
                aria-label="Eliminar logo"
                className="rounded-lg bg-white p-1.5 text-red-700 shadow-sm"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-[11px] font-medium text-stone-600">
                Zona
                <select
                  value={selected.zone}
                  onChange={(e) => changeZone(selected.uid, e.target.value as LogoZone)}
                  className="mt-0.5 min-h-10 w-full rounded-lg border border-stone-300 bg-white px-2 text-xs"
                >
                  {ZONES.map((z) => (
                    <option key={z} value={z}>
                      {z}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-[11px] font-medium text-stone-600">
                Técnica
                <select
                  value={selected.technique}
                  onChange={(e) => patchLogo(selected.uid, { technique: e.target.value as PrintTechnique })}
                  className="mt-0.5 min-h-10 w-full rounded-lg border border-stone-300 bg-white px-2 text-xs"
                >
                  {(Object.keys(TECHNIQUE_LABEL) as PrintTechnique[]).map((t) => (
                    <option key={t} value={t}>
                      {TECHNIQUE_LABEL[t]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <MiniSlider label="Posición X" min={0} max={200} step={0.5} value={selected.x} display={`${selected.x.toFixed(1)}`} onChange={(v) => patchLogo(selected.uid, { x: v })} />
            <MiniSlider label="Posición Y" min={0} max={260} step={0.5} value={selected.y} display={`${selected.y.toFixed(1)}`} onChange={(v) => patchLogo(selected.uid, { y: v })} />
            <MiniSlider label="Ancho" min={4} max={80} step={0.5} value={selected.width} display={`${selected.width.toFixed(1)}`} onChange={(v) => patchLogo(selected.uid, { width: v })} />
            <MiniSlider label="Alto" min={4} max={80} step={0.5} value={selected.height} display={`${selected.height.toFixed(1)}`} onChange={(v) => patchLogo(selected.uid, { height: v })} />
            <MiniSlider label="Rotación" min={-180} max={180} step={1} value={selected.rotation} display={`${selected.rotation.toFixed(0)}°`} onChange={(v) => patchLogo(selected.uid, { rotation: v })} />
          </div>
        )}

        <div className="mt-2 flex items-center justify-between rounded-xl bg-gum-ink px-4 py-3 text-white">
          <span className="text-xs text-stone-300">Unitario · {garment.baseTimeMinutes + (pricing?.extraMachineMinutes ?? 0)} min</span>
          <span className="font-display text-xl font-bold text-gum-gold">
            ${pricing?.unitPrice.toFixed(2) ?? garment.baseSalePrice.toFixed(2)}
          </span>
        </div>
      </section>
      )}

      {/* Guardar + acciones */}
      <section className="rounded-2xl border border-stone-200 bg-white p-4">
        <div className="grid grid-cols-2 gap-2">
          <label className="col-span-2 block text-xs font-medium text-stone-600">
            Nombre del diseño
            <input
              value={designName}
              onChange={(e) => setDesignName(e.target.value)}
              placeholder={`${garment.category} personalizado`}
              maxLength={120}
              className="mt-1 min-h-11 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-xs font-medium text-stone-600">
            Unidades
            <input
              type="number"
              min={1}
              max={160}
              value={qty}
              onChange={(e) => setQty(Number(e.target.value))}
              className="mt-1 min-h-11 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
            />
          </label>
          <div className="flex items-end pb-1 text-[11px] text-stone-500">
            Talla {size} · {prettyColor(fabricName)}
          </div>
        </div>
        {notice && (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-stone-700">
            {notice.startsWith('Diseño') || notice.startsWith('Logo') ? (
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-700" aria-hidden />
            ) : (
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gum-ember" aria-hidden />
            )}
            {notice}
          </p>
        )}
        <div className="mt-3 space-y-2">
          <button
            type="button"
            onClick={() => void handleSaveToCloset()}
            disabled={saving}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-gum-espresso px-4 py-3 text-sm font-bold text-gum-espresso disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
            Guardar en Clóset
          </button>
          <button
            type="button"
            onClick={() => void handleTryOn()}
            disabled={saving}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-gum-oro px-4 py-3 text-sm font-bold text-gum-espresso disabled:opacity-60"
          >
            Probar en foto real
          </button>
          <button
            type="button"
            onClick={() => void handleAddToBox()}
            disabled={saving}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-gum-terracotta px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
          >
            <Check className="h-4 w-4" aria-hidden />
            Enviar a la Caja ({qty} uds)
          </button>
        </div>
      </section>
    </div>
  );
}
