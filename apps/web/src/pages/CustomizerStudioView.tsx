import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Camera,
  Check,
  ImagePlus,
  Layers,
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
  BodyAnchorCalibration,
  BodyFramingType,
  DesignSaveInput,
  GarmentTemplate,
  LogoPlacement,
  LogoZone,
  LowerBodyPreset,
  PrintTechnique,
} from '@gumorose/shared';
import { calculateGarmentUnitPrice, DEFAULT_BODY_ANCHORS, normalizeBodyAnchors } from '@gumorose/shared';
import {
  DEMO_SUBJECT_USER_ID,
  fetchClosetProfile,
  generateLogo,
  saveCustomDesign,
  fetchCatalog,
} from '../services/api';
import { STUDIO_SUBJECTS, type StudioSubjectId } from '../data/subjects';
import { compressImageFileToDataUrl } from '../services/image';
import { useBox } from '../context/BoxContext';
import {
  GarmentCanvas,
  detectBodyFraming,
  zoneDefaultFor,
  type CanvasView,
  type ViewerDisplayMode,
} from '../components/GarmentCanvas';
import { UvPatternPanel } from '../components/engine3d/UvPatternPanel';
import type { LightPresetId } from '../components/engine3d/types3d';
import { AnatomicalSubjectStage } from '../components/AnatomicalSubjectStage';
import { colorHexOf, prettyColor } from '../data/regions';
import { FALLBACK_CATALOG } from '../data/fallback';
import { GALLERY_SEALS } from '../data/gallery';

interface CustomizerStudioViewProps {
  preselected: GarmentTemplate | null;
  onAddedToBox: () => void;
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
  SERIGRAFIA: 'Serigrafía · Estampadora',
  SUBLIMADO: 'Sublimado · Sublimadora',
  VINIL: 'Vinil textil · Cortadora de vinil',
};

const MAX_LOGOS = 6;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function SliderRow(props: {
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
      <span className="flex items-center justify-between text-xs font-medium text-stone-600">
        {props.label}
        <span className="rounded bg-stone-100 px-1.5 py-0.5 font-semibold text-gum-ink">
          {props.display}
        </span>
      </span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
        className="mt-1 w-full"
      />
    </label>
  );
}

/**
 * Estudio interactivo 2D de personalización multi-logo.
 */
export function CustomizerStudioView({
  preselected,
  onAddedToBox,
}: CustomizerStudioViewProps): React.JSX.Element {
  const { addLine } = useBox();
  const [catalog, setCatalog] = useState<GarmentTemplate[]>([]);
  const [catalogOffline, setCatalogOffline] = useState(false);
  const [garmentId, setGarmentId] = useState<string>(preselected?.id ?? '');
  const [view, setView] = useState<CanvasView>('FRONTAL');
  const [size, setSize] = useState('M');
  const [fabricName, setFabricName] = useState('BLANCO');
  const [fabricHex, setFabricHex] = useState(colorHexOf('BLANCO'));
  const [logos, setLogos] = useState<StudioLogo[]>([]);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [showGuides, setShowGuides] = useState(true);

  const [aiPrompt, setAiPrompt] = useState('sello andino minimalista para camiseta');
  const [aiStyle, setAiStyle] = useState('Minimalista andino');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [designName, setDesignName] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [qty, setQty] = useState(12);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'ok' | 'error'>('idle');
  const [saveMessage, setSaveMessage] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);

  /* --------- Estudio XL: modo en vivo, sujeto, zoom y tilt 3D --------- */
  const [liveMode, setLiveMode] = useState<'PRENDA3D' | 'SUJETO'>('PRENDA3D');
  const [subjectId, setSubjectId] = useState<StudioSubjectId>('USUARIO');
  const [subjectPhoto, setSubjectPhoto] = useState<string | null>(null);
  const [subjectStatus, setSubjectStatus] = useState<'idle' | 'loading' | 'ok' | 'empty'>('idle');
  const [lookBottomId, setLookBottomId] = useState('');
  const [zoom, setZoom] = useState(100);
  const [spinY, setSpinY] = useState(0);
  const [pitchDeg, setPitchDeg] = useState(2);
  const [displayMode, setDisplayMode] = useState<ViewerDisplayMode>('MANNEQUIN');
  const [specular, setSpecular] = useState(0.5);
  const [fullscreen, setFullscreen] = useState(false);
  const [curtain, setCurtain] = useState(55);
  const [lightPreset, setLightPreset] = useState<LightPresetId>('SIERRA');
  const [autoSpin, setAutoSpin] = useState(false);
  const [showEngineering, setShowEngineering] = useState(false);
  const [scanning, setScanning] = useState<0 | 1 | 2 | 3>(0);
  const subjectFileRef = useRef<HTMLInputElement | null>(null);

  /* Etapa 2: calibración anatómica del Sujeto de Pruebas (persistida) */
  const WEB_ANCHORS_KEY = 'gumorose-web-body-anchors';
  const [bodyAnchors, setBodyAnchorsState] = useState<BodyAnchorCalibration>(() => {
    try {
      if (typeof window === 'undefined' || !('localStorage' in window)) return { ...DEFAULT_BODY_ANCHORS };
      const raw = window.localStorage.getItem(WEB_ANCHORS_KEY);
      return raw ? normalizeBodyAnchors(JSON.parse(raw) as Partial<BodyAnchorCalibration>) : { ...DEFAULT_BODY_ANCHORS };
    } catch {
      return { ...DEFAULT_BODY_ANCHORS };
    }
  });
  const [framingMode, setFramingMode] = useState<'AUTO' | BodyFramingType>('AUTO');
  const [detectedFraming, setDetectedFraming] = useState<BodyFramingType | null>(null);
  const effectiveFraming: BodyFramingType =
    framingMode === 'AUTO' ? (detectedFraming ?? bodyAnchors.framing) : framingMode;
  const [panelTab, setPanelTab] = useState<'color' | 'logos' | 'cuerpo'>('color');

  function setBodyAnchors(next: Partial<BodyAnchorCalibration>): void {
    setBodyAnchorsState((prev) => {
      const merged = normalizeBodyAnchors({ ...prev, ...next });
      try {
        if (typeof window !== 'undefined' && 'localStorage' in window)
          window.localStorage.setItem(WEB_ANCHORS_KEY, JSON.stringify(merged));
      } catch {
        /* sin almacenamiento: solo sesión */
      }
      return merged;
    });
  }

  const activeSubject = STUDIO_SUBJECTS.find((s) => s.id === subjectId) ?? STUDIO_SUBJECTS[0];
  const subjectImage =
    subjectId === 'USUARIO' && subjectPhoto ? subjectPhoto : (activeSubject?.silhouetteUrl ?? '');

  /* Sincronización Móvil ⇄ Web: foto de cuerpo completo del mismo usuario. */
  useEffect(() => {
    let cancelled = false;
    setSubjectStatus('loading');
    fetchClosetProfile(DEMO_SUBJECT_USER_ID)
      .then((res) => {
        if (cancelled) return;
        setSubjectPhoto(res.profile.fullBodyPhotoUrl ?? null);
        setSubjectStatus(res.profile.fullBodyPhotoUrl ? 'ok' : 'empty');
      })
      .catch(() => {
        if (cancelled) return;
        setSubjectStatus('empty');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubjectPhoto(file: File | undefined): Promise<void> {
    if (!file) return;
    try {
      const dataUrl = await compressImageFileToDataUrl(file);
      setSubjectPhoto(dataUrl);
      setSubjectId('USUARIO');
      setSubjectStatus('ok');
      setDetectedFraming(null);
      setFramingMode('AUTO');
    } catch {
      /* la foto anterior se conserva */
    }
  }

  /* Catálogo base */
  useEffect(() => {
    let cancelled = false;
    fetchCatalog()
      .then((res) => {
        if (cancelled) return;
        setCatalog(res.items);
        setCatalogOffline(false);
      })
      .catch(() => {
        if (cancelled) return;
        setCatalog(FALLBACK_CATALOG);
        setCatalogOffline(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /* Prenda preseleccionada desde la tienda */
  useEffect(() => {
    if (!preselected) return;
    setCatalog((prev) =>
      prev.some((g) => g.id === preselected.id) ? prev : [preselected, ...prev],
    );
    setGarmentId(preselected.id);
    const defaultSize = preselected.sizes.includes('M') ? 'M' : (preselected.sizes[0] ?? 'M');
    setSize(defaultSize);
    const defaultColor = preselected.colors[0] ?? 'BLANCO';
    setFabricName(defaultColor);
    setFabricHex(colorHexOf(defaultColor));
  }, [preselected]);

  const garment: GarmentTemplate | null =
    catalog.find((g) => g.id === garmentId) ?? preselected ?? catalog[0] ?? null;

  const selectedLogo: StudioLogo | null =
    logos.find((l) => l.uid === selectedUid) ?? null;

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
  const extraMinutes = pricing ? pricing.extraMachineMinutes : 0;
  const unitMinutes = garment ? garment.baseTimeMinutes + extraMinutes : 0;
  const fabricMetersStudio = !garment
    ? 0.71
    : garment.category === 'PANTALON'
      ? 1.5
      : garment.category === 'CAMISA'
        ? 1.2
        : garment.category === 'POLO'
          ? 0.85
          : 0.71;
  const printAreaCm2 = Math.round(logos.reduce((acc, l) => acc + l.width * l.height, 0) * 0.0625);

  /* ----------------------------- logos ----------------------------- */

  function pushLogo(logoUrl: string, technique: PrintTechnique): string | null {
    if (!garment) return 'Elige primero una prenda base.';
    if (logos.length >= MAX_LOGOS) return `Máximo ${MAX_LOGOS} logos por diseño.`;
    const zone: LogoZone = 'CENTRO';
    const d = zoneDefaultFor(garment.category, zone);
    const uid = `logo-${Date.now()}-${logos.length}`;
    setLogos((prev) => [
      ...prev,
      {
        uid,
        logoUrl,
        zone,
        technique,
        x: d.x,
        y: d.y,
        width: d.w,
        height: d.h,
        rotation: 0,
      },
    ]);
    setView(d.view);
    setSelectedUid(uid);
    return null;
  }

  function patchLogo(uid: string, patch: Partial<StudioLogo>): void {
    setLogos((prev) => prev.map((l) => (l.uid === uid ? { ...l, ...patch } : l)));
  }

  function changeZone(uid: string, zone: LogoZone): void {
    if (!garment) return;
    const d = zoneDefaultFor(garment.category, zone);
    patchLogo(uid, { zone, x: d.x, y: d.y, width: d.w, height: d.h });
    setView(d.view);
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

  /** Escaneo IA por capas sobre el sujeto (SAM 3.1 → tela → Muse Wonder). */
  function runSubjectScan(): void {
    setScanning(1);
    window.setTimeout(() => setScanning(2), 650);
    window.setTimeout(() => setScanning(3), 1300);
    window.setTimeout(() => setScanning(0), 2100);
  }

  function handleUploadFile(file: File | undefined): void {
    setUploadError(null);
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setUploadError('El archivo debe ser una imagen (PNG, JPG o SVG).');
      return;
    }
    // Cualquier peso se optimiza en cliente (canvas) antes de subir.
    void compressImageFileToDataUrl(file)
      .then((url) => {
        const problem = pushLogo(url, 'SERIGRAFIA');
        if (problem) setUploadError(problem);
      })
      .catch(() => setUploadError('No se pudo leer la imagen.'));
  }

  async function handleGenerateLogo(): Promise<void> {
    setAiNotice(null);
    if (aiPrompt.trim().length < 3) {
      setAiNotice('Describe el logo con al menos 3 caracteres.');
      return;
    }
    const room = MAX_LOGOS - logos.length;
    if (room <= 0) {
      setAiNotice(`Ya tienes ${MAX_LOGOS} logos en el diseño.`);
      return;
    }
    setAiLoading(true);
    try {
      const res = await generateLogo(aiPrompt.trim(), aiStyle, Math.min(2, room));
      const added = res.images.slice(0, room).length;
      res.images.slice(0, room).forEach((img) => pushLogo(img.url, 'SUBLIMADO'));
      setAiNotice(
        `Listo: ${added} logo(s) generados (${res.provider === 'mock' ? 'vista previa local' : res.model}).`,
      );
    } catch (error) {
      setAiNotice(error instanceof Error ? error.message : 'No se pudo generar el logo.');
    } finally {
      setAiLoading(false);
    }
  }

  /* ------------------------------ guardado ------------------------------ */

  async function handleSaveAndAdd(): Promise<void> {
    setSaveState('idle');
    setSaveMessage('');
    if (!garment) {
      setSaveState('error');
      setSaveMessage('Elige una prenda base del catálogo.');
      return;
    }
    if (logos.length === 0) {
      setSaveState('error');
      setSaveMessage('Agrega al menos 1 logo al diseño (sube, elige o genera uno).');
      return;
    }
    const safeQty = Math.min(160, Math.max(1, Math.floor(qty || 1)));
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
      customerName: customerName.trim() ? customerName.trim() : undefined,
      size,
      color: fabricName,
      logos: placements,
    };
    setSaveState('saving');
    try {
      const saved = await saveCustomDesign(input);
      addLine({
        designId: saved.id,
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
      setSaveState('ok');
      setSaveMessage(`Diseño guardado con ${logos.length} logo(s). Abriendo tu Caja…`);
      window.setTimeout(onAddedToBox, 700);
    } catch (error) {
      setSaveState('error');
      setSaveMessage(error instanceof Error ? error.message : 'No se pudo guardar el diseño.');
    }
  }

  if (!garment) {
    return <p className="py-10 text-center text-stone-500">Cargando prendas del taller…</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gum-terracottadark">
          Estudio Multi-Logo · Riobamba
        </p>
        <h2 className="font-display text-3xl font-semibold text-gum-espresso">Estudio 3D</h2>
        <p className="truncate text-xs text-stone-500">
          Primer logo incluido · +$1.25 y +4 min por logo extra
        </p>
        {catalogOffline && (
          <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
            Sin conexión con la API: trabajando con el catálogo local de respaldo.
          </p>
        )}
      </div>

      {/* Resumen en vivo de la prenda */}
      {pricing && (
        <dl
          className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-2xl bg-gum-espresso px-4 py-3 text-sm text-white shadow-editorial"
          aria-label="Resumen en vivo de la prenda"
        >
          <div className="flex items-baseline gap-1.5">
            <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-400">
              Costo Base
            </dt>
            <dd className="font-display font-bold">${pricing.baseSalePrice.toFixed(2)}</dd>
          </div>
          <div className="flex items-baseline gap-1.5">
            <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-400">
              Logos Extra
            </dt>
            <dd className="font-display font-bold">
              +${pricing.extraPrintCost.toFixed(2)}
              <span className="ml-1 text-xs font-semibold text-stone-300">
                (+$1.25 / +4 min c/u · {pricing.extraLogos})
              </span>
            </dd>
          </div>
          <div className="flex items-baseline gap-1.5">
            <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-400">
              Precio Unitario
            </dt>
            <dd className="font-display font-bold text-gum-oro">${pricing.unitPrice.toFixed(2)}</dd>
          </div>
          <div className="flex items-baseline gap-1.5">
            <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-400">
              Tiempo Total en Planta Riobamba
            </dt>
            <dd className="font-display font-bold">{unitMinutes} min / ud</dd>
          </div>
          <span className="ml-auto hidden text-xs text-stone-300 lg:block">
            {garment.name} · Talla {size} · {prettyColor(fabricName)}
          </span>
        </dl>
      )}

      <div className="grid gap-6 lg:grid-cols-10">
        {/* Lienzo protagonista (70% en desktop) */}
        <section className="space-y-3 lg:col-span-7">
          {/* Barra estática sobre el lienzo: ningún control flota sobre el 3D */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex gap-0.5 rounded-full border border-[#E6E0D6] bg-white p-1" role="group" aria-label="Vista de la prenda">
              {(['FRONTAL', 'TRASERA'] as CanvasView[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  aria-pressed={view === v}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold ${view === v ? 'bg-gum-ink text-white' : 'text-stone-600'}`}
                >
                  {v === 'FRONTAL' ? 'Frente' : 'Espalda'}
                </button>
              ))}
            </span>
            <span className="inline-flex gap-0.5 rounded-full border border-[#E6E0D6] bg-white p-1" role="group" aria-label="Modo de visualización en vivo">
              {(
                [
                  { id: 'PRENDA3D', label: '3D', icon: <Shirt className="h-4 w-4" aria-hidden /> },
                  { id: 'SUJETO', label: 'Mi Cuerpo', icon: <PersonStanding className="h-4 w-4" aria-hidden /> },
                ] as const
              ).map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => {
                    setLiveMode(mode.id);
                    if (mode.id === 'SUJETO') setPanelTab('cuerpo');
                  }}
                  aria-pressed={liveMode === mode.id}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${liveMode === mode.id ? 'bg-gum-ink text-white' : 'text-stone-600'}`}
                >
                  {mode.icon} {mode.label}
                </button>
              ))}
            </span>
          </div>
          {/* Sujetos, foto y Calibrador Anatómico viven en el tab Ajuste en Cuerpo */}

          {/* Escenario XL plano: la rotación vive solo en la cámara del canvas */}
          <div className="relative overflow-hidden rounded-2xl border border-gum-line bg-gum-linen shadow-editorial">
            <div className="flex min-h-[640px] items-center justify-center p-4 lg:min-h-[700px]">
              {liveMode === 'PRENDA3D' ? (
                <div className="w-full max-w-[430px]">
                  <GarmentCanvas
                    category={garment.category}
                    variant={garment.visualVariant}
                    fabricHex={fabricHex}
                    view={view}
                    logos={logos}
                    selectedUid={selectedUid}
                    showGuides={showGuides}
                    onSelect={setSelectedUid}
                    onMove={(uid, x, y) => patchLogo(uid, { x: round1(x), y: round1(y) })}
                    onScale={scaleLogo}
                    onRotate={rotateLogo}
                    onDuplicate={duplicateLogo}
                    specularX={specular}
                    orbit
                    autoRotate={autoSpin}
                    lightPreset={lightPreset}
                    yawDeg={spinY}
                    pitchDeg={pitchDeg}
                    zoom={zoom / 100}
                    displayMode={displayMode}
                    onDisplayModeChange={setDisplayMode}
                    showDisplayModeSelector={false}
                    onCameraChange={(cam) => {
                      setSpinY(Math.round(cam.yawDeg));
                      setPitchDeg(cam.pitchDeg);
                      setZoom(Math.round(cam.zoom * 100));
                    }}
                  />
                  {/* Los ángulos, sliders y luz viven en la barra unificada bajo el lienzo */}
                  {showEngineering && pricing && (
                    <dl
                      className="mt-2 grid grid-cols-2 gap-2 rounded-2xl bg-gum-espresso p-3 text-center text-white"
                      aria-label="Rayos X de ingeniería textil"
                    >
                      <div><dt className="text-[9px] uppercase tracking-wide text-stone-400">Tela del molde</dt><dd className="font-display text-sm font-bold tabular-nums">{fabricMetersStudio.toFixed(2)} m</dd></div>
                      <div><dt className="text-[9px] uppercase tracking-wide text-stone-400">Área de estampado</dt><dd className="font-display text-sm font-bold tabular-nums">{printAreaCm2} cm²</dd></div>
                      <div><dt className="text-[9px] uppercase tracking-wide text-stone-400">Tiempo máquina</dt><dd className="font-display text-sm font-bold tabular-nums">{unitMinutes} min (+4/logo extra)</dd></div>
                      <div><dt className="text-[9px] uppercase tracking-wide text-stone-400">Costo unitario vivo</dt><dd className="font-display text-sm font-bold tabular-nums">${pricing.unitPrice.toFixed(2)}</dd></div>
                    </dl>
                  )}
                </div>
              ) : (
                <div className="relative w-full max-w-[380px]">
                  <div className="relative aspect-[9/16] overflow-hidden rounded-xl bg-stone-200">
                    <img
                      src={subjectImage}
                      alt={activeSubject?.label ?? 'Sujeto de pruebas'}
                      className="absolute inset-0 h-full w-full object-cover object-top"
                      onLoad={(e) => {
                        const img = e.currentTarget;
                        if (img.naturalWidth > 0) setDetectedFraming(detectBodyFraming(img.naturalHeight / img.naturalWidth));
                      }}
                    />
                    {/* Cortina Antes/Después: el sujeto anatómico se revela al deslizar */}
                    <div
                      className="absolute inset-0 overflow-hidden"
                      style={{ clipPath: `inset(0 ${100 - curtain}% 0 0)` }}
                    >
                      <AnatomicalSubjectStage
                        subjectImage={subjectImage}
                        subjectLabel={activeSubject?.label ?? 'Sujeto de pruebas'}
                        garment={garment}
                        fabricHex={fabricHex}
                        view={view}
                        logos={logos}
                        selectedUid={selectedUid}
                        onSelect={setSelectedUid}
                        onMove={(uid, x, y) => patchLogo(uid, { x: round1(x), y: round1(y) })}
                        onScale={scaleLogo}
                        onRotate={rotateLogo}
                        onDuplicate={duplicateLogo}
                        specularX={specular}
                        bottomGarment={catalog.find((g) => g.id === lookBottomId) ?? null}
                        anchors={bodyAnchors}
                        framing={effectiveFraming}
                        onPhotoRatio={(ratio) => setDetectedFraming(detectBodyFraming(ratio))}
                      />
                    </div>
                    <span className="absolute bottom-2 left-2 z-[47] rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold text-white">
                      {curtain < 50 ? 'Antes' : 'Después'} · {activeSubject?.label}
                    </span>
                    {effectiveFraming === 'HALF_BODY_EXTENDED' && (
                      <p className="absolute inset-x-3 top-3 z-[47] rounded-lg bg-amber-50/95 px-3 py-2 text-[11px] font-semibold text-amber-900 shadow" role="status">
                        Foto de medio cuerpo: extendimos las piernas con IA para probar pantalones en cuerpo entero.
                      </p>
                    )}
                    {scanning > 0 && (
                      <div className="absolute inset-0 z-[48] flex flex-col items-center justify-center gap-2 bg-gum-ink/80 text-center text-white" role="status">
                        <RefreshCw className="h-8 w-8 animate-spin text-gum-gold" aria-hidden />
                        <p className="px-4 text-sm font-bold">
                          {scanning === 1 && '1. Segmentando silueta con Meta SAM 3.1…'}
                          {scanning === 2 && '2. Ajustando caída textil y logos…'}
                          {scanning === 3 && '3. Renderizando iluminación con Muse Wonder…'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Barra de Control Unificada: debajo del lienzo, sin solapamientos */}
          {liveMode === 'PRENDA3D' ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E6E0D6] bg-white p-3" aria-label="Barra de control del visor 3D">
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Ángulos Rápidos">
                {(
                  [
                    { label: 'Frente (0°)', yaw: 0, v: 'FRONTAL' as const },
                    { label: '3/4 (35°)', yaw: 35, v: 'FRONTAL' as const },
                    { label: 'Manga Izq', yaw: -85, v: 'FRONTAL' as const },
                    { label: 'Manga Der', yaw: 85, v: 'FRONTAL' as const },
                    { label: 'Espalda (180°)', yaw: 180, v: 'TRASERA' as const },
                  ]
                ).map((angle) => (
                  <button key={angle.label} type="button" onClick={() => { setView(angle.v); setSpinY(angle.yaw); }} aria-pressed={spinY === angle.yaw} className={`rounded-full px-2.5 py-1.5 text-[11px] font-bold ${spinY === angle.yaw ? 'bg-gum-espresso text-white' : 'border border-[#E6E0D6] bg-white text-stone-600'}`}>
                    {angle.label}
                  </button>
                ))}
                <button type="button" onClick={() => setAutoSpin((v) => !v)} aria-pressed={autoSpin} className={`rounded-full px-2.5 py-1.5 text-[11px] font-bold ${autoSpin ? 'bg-gum-terracotta text-white' : 'border border-[#E6E0D6] bg-white text-stone-600'}`}>
                  🔄 Giro 360°
                </button>
              </div>
              <div className="grid min-w-64 flex-1 grid-cols-1 gap-3 sm:grid-cols-2" aria-label="Giro y zoom">
                <label className="flex items-center gap-2 text-[11px] font-bold text-stone-600">
                  Giro Horizontal: {spinY}°
                  <input type="range" min={-180} max={180} value={spinY} onChange={(e) => setSpinY(Number(e.target.value))} aria-label="Giro Horizontal" className="min-w-0 flex-1" />
                </label>
                <div className="flex items-center gap-1.5">
                  <button type="button" onClick={() => setZoom((z) => Math.max(50, z - 10))} aria-label="Alejar zoom" className="flex h-8 w-8 items-center justify-center rounded-full border border-[#E6E0D6] font-bold">−</button>
                  <label className="flex min-w-0 flex-1 items-center gap-2 text-[11px] font-bold text-stone-600">
                    Zoom: {zoom}%
                    <input type="range" min={50} max={350} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} aria-label="Zoom" className="min-w-0 flex-1" />
                  </label>
                  <button type="button" onClick={() => setZoom((z) => Math.min(350, z + 10))} aria-label="Acercar zoom" className="flex h-8 w-8 items-center justify-center rounded-full border border-[#E6E0D6] font-bold">+</button>
                  <button type="button" onClick={() => { setSpinY(0); setPitchDeg(2); setZoom(100); setView('FRONTAL'); setAutoSpin(false); }} className="rounded-full border border-[#E6E0D6] px-2.5 py-1.5 text-[11px] font-bold text-stone-600">Reset</button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Luz y modo">
                <label className="flex items-center gap-1.5 text-[11px] font-bold text-stone-600">
                  Luz
                  <select value={lightPreset} onChange={(e) => setLightPreset(e.target.value as LightPresetId)} aria-label="Luz del Ecuador" className="rounded-full border border-[#E6E0D6] bg-white px-2 py-1.5 text-[11px] font-bold">
                    <option value="COSTA">Sol Costeño 31°C</option>
                    <option value="SIERRA">Luz Andina 11°C</option>
                    <option value="ORIENTE">Difusa 25°C</option>
                  </select>
                </label>
                <button type="button" onClick={() => setDisplayMode('MANNEQUIN')} aria-pressed={displayMode === 'MANNEQUIN'} className={`rounded-full px-2.5 py-1.5 text-[11px] font-bold ${displayMode === 'MANNEQUIN' ? 'bg-gum-espresso text-white' : 'border border-[#E6E0D6] text-stone-600'}`}>🧍 Maniquí</button>
                <button type="button" onClick={() => setDisplayMode('GHOST')} aria-pressed={displayMode === 'GHOST'} className={`rounded-full px-2.5 py-1.5 text-[11px] font-bold ${displayMode === 'GHOST' ? 'bg-gum-espresso text-white' : 'border border-[#E6E0D6] text-stone-600'}`}>👕 Prenda</button>
                <button type="button" onClick={() => setShowEngineering((v) => !v)} aria-pressed={showEngineering} className="rounded-full border border-[#E6E0D6] px-2.5 py-1.5 text-[11px] font-bold text-stone-600">Ingeniería</button>
                <button type="button" onClick={() => setFullscreen(true)} className="inline-flex items-center gap-1 rounded-full bg-gum-ink px-2.5 py-1.5 text-[11px] font-bold text-white">
                  <Maximize2 className="h-3.5 w-3.5" aria-hidden /> Pantalla Completa
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#E6E0D6] bg-white p-3 text-xs">
              <button type="button" onClick={runSubjectScan} className="rounded-lg bg-gum-ember px-2.5 py-1.5 font-bold text-white">Vestirme con IA (SAM 3.1 + Muse Wonder)</button>
              <label className="flex items-center gap-1.5 font-semibold text-stone-600">
                Antes/Después {curtain}%
                <input type="range" min={0} max={100} value={curtain} onChange={(e) => setCurtain(Number(e.target.value))} aria-label="Comparador antes y después" />
              </label>
              <button type="button" onClick={() => setFullscreen(true)} className="inline-flex items-center gap-1 rounded-lg bg-gum-ink px-2.5 py-1.5 font-bold text-white">
                <Maximize2 className="h-3.5 w-3.5" aria-hidden /> Pantalla Completa
              </button>
            </div>
          )}

          {liveMode === 'PRENDA3D' && (
            <UvPatternPanel
              logos={logos}
              selectedUid={selectedUid}
              fabricHex={fabricHex}
              view={view}
              onSelect={setSelectedUid}
              onMove={(uid, x, y) => patchLogo(uid, { x: round1(x), y: round1(y) })}
              onMoveInPiece={(uid, piece, x, y) => {
                setView(piece === 'back' ? 'TRASERA' : 'FRONTAL');
                patchLogo(uid, { x: round1(x), y: round1(y) });
              }}
            />
          )}

          {fullscreen && (
            <div className="fixed inset-0 z-50 flex flex-col bg-gum-ink/95 p-4" role="dialog" aria-modal="true" aria-label="Estudio en pantalla completa">
              <div className="mx-auto flex w-full max-w-5xl items-center justify-between text-white">
                <p className="font-display text-lg font-bold">Estudio Gumorose · Cine / Zoom</p>
                <button
                  type="button"
                  onClick={() => setFullscreen(false)}
                  aria-label="Cerrar pantalla completa"
                  className="rounded-full bg-white/10 p-2"
                >
                  <X className="h-5 w-5" aria-hidden />
                </button>
              </div>
              <div className="mx-auto flex w-full max-w-3xl flex-1 items-center justify-center">
                <div className="w-full max-w-[520px]">
                  <GarmentCanvas
                    category={garment.category}
                    variant={garment.visualVariant}
                    fabricHex={fabricHex}
                    view={view}
                    logos={logos}
                    selectedUid={selectedUid}
                    showGuides={showGuides}
                    onSelect={setSelectedUid}
                    onMove={(uid, x, y) => patchLogo(uid, { x: round1(x), y: round1(y) })}
                    onScale={scaleLogo}
                    onRotate={rotateLogo}
                    onDuplicate={duplicateLogo}
                    specularX={specular}
                    orbit
                    autoRotate={autoSpin}
                    lightPreset={lightPreset}
                    yawDeg={spinY}
                    pitchDeg={pitchDeg}
                    zoom={zoom / 100}
                    displayMode={displayMode}
                    onDisplayModeChange={setDisplayMode}
                    showDisplayModeSelector={false}
                    onCameraChange={(cam) => {
                      setSpinY(Math.round(cam.yawDeg));
                      setPitchDeg(cam.pitchDeg);
                      setZoom(Math.round(cam.zoom * 100));
                    }}
                  />
                </div>
              </div>
              <p className="text-center text-xs text-stone-300">Arrastra sobre la prenda para rotar · Zoom {zoom}% · Giro {spinY}°</p>
            </div>
          )}

          <p className="text-xs text-stone-500">Arrastra los logos sobre la tela o ajústalos con los sliders del panel.</p>
        </section>

        {/* Panel derecho: 3 tabs */}
        <aside className="space-y-4 lg:col-span-3">
          <div className="flex gap-1 rounded-full bg-stone-100 p-1" role="tablist" aria-label="Panel del estudio">
            {(
              [
                { id: 'color', label: '1. Color y Talla' },
                { id: 'logos', label: '2. Logos e IA' },
                { id: 'cuerpo', label: '3. Ajuste en Cuerpo' },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={panelTab === t.id}
                onClick={() => setPanelTab(t.id)}
                className={`flex-1 rounded-full px-2 py-2 text-[11px] font-bold ${panelTab === t.id ? 'bg-gum-ink text-white' : 'text-stone-600'}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {panelTab === 'color' && (
            <section className="space-y-4 rounded-lg border border-stone-200 bg-white p-5" aria-label="Color y Talla">
              <div>
                <label htmlFor="studio-garment" className="text-sm font-semibold text-gum-ink">
                  Prenda base
                </label>
                <select
                  id="studio-garment"
                  value={garment.id}
                  onChange={(e) => {
                    const next = catalog.find((g) => g.id === e.target.value);
                    setGarmentId(e.target.value);
                    if (next) {
                      const s = next.sizes.includes('M') ? 'M' : (next.sizes[0] ?? 'M');
                      setSize(s);
                      const c = next.colors[0] ?? 'BLANCO';
                      setFabricName(c);
                      setFabricHex(colorHexOf(c));
                    }
                  }}
                  className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                >
                  {catalog.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} · ${g.baseSalePrice.toFixed(2)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <span className="text-sm font-semibold text-gum-ink">Talla</span>
                <div className="mt-1 flex flex-wrap gap-2">
                  {garment.sizes.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSize(s)}
                      aria-pressed={size === s}
                      className={`min-w-10 rounded-lg border px-3 py-1.5 text-sm font-semibold ${
                        size === s
                          ? 'border-gum-ember bg-gum-ember text-white'
                          : 'border-stone-300 hover:border-gum-ember'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="text-sm font-semibold text-gum-ink">Color de tela</span>
                <div className="mt-1 flex flex-wrap items-center gap-2">
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
                      className={`h-8 w-8 rounded-full border-2 ${
                        fabricName === c ? 'border-gum-ember' : 'border-stone-300'
                      }`}
                      style={{ backgroundColor: colorHexOf(c) }}
                    />
                  ))}
                  <label className="ml-1 flex items-center gap-2 text-sm text-stone-600">
                    Otro
                    <input
                      type="color"
                      value={/^#[0-9A-Fa-f]{6}$/.test(fabricHex) ? fabricHex : '#7A1F1F'}
                      onChange={(e) => {
                        setFabricHex(e.target.value);
                        setFabricName(e.target.value);
                      }}
                      className="h-8 w-10 cursor-pointer rounded border border-stone-300 bg-white"
                      aria-label="Color personalizado de tela"
                    />
                  </label>
                </div>
                <p className="mt-1 text-xs text-stone-500">
                  Tela actual: <strong>{prettyColor(fabricName)}</strong> ({fabricHex})
                </p>
              </div>

              <label className="flex items-center gap-1.5 text-sm text-stone-700">
                <input
                  type="checkbox"
                  checked={showGuides}
                  onChange={(e) => setShowGuides(e.target.checked)}
                />
                Guías de zona
              </label>
            </section>
          )}

          {panelTab === 'cuerpo' && liveMode !== 'SUJETO' && (
            <section className="space-y-3 rounded-lg border border-stone-200 bg-white p-5" aria-label="Ajuste en Cuerpo">
              <p className="text-sm text-stone-600">
                El Calibrador Anatómico (Hombros, Cintura y Escala) y el detector de medio cuerpo viven aquí, junto a Mi Cuerpo.
              </p>
              <button
                type="button"
                onClick={() => setLiveMode('SUJETO')}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gum-ink px-4 py-2 text-sm font-semibold text-white hover:bg-gum-soot"
              >
                <PersonStanding className="h-4 w-4" aria-hidden /> Activar Mi Cuerpo
              </button>
            </section>
          )}

          {panelTab === 'cuerpo' && liveMode === 'SUJETO' && (
            <section className="space-y-4 rounded-lg border border-stone-200 bg-white p-5" aria-label="Ajuste en Cuerpo">
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Sujeto de pruebas">
                  {STUDIO_SUBJECTS.map((subject) => (
                    <button
                      key={subject.id}
                      type="button"
                      onClick={() => setSubjectId(subject.id)}
                      aria-pressed={subjectId === subject.id}
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${
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
                    className="inline-flex items-center gap-1 rounded-full border border-dashed border-stone-400 px-2.5 py-1 text-[11px] font-bold text-stone-700"
                  >
                    <Camera className="h-3.5 w-3.5" aria-hidden /> Subir mi foto
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
                <p className="text-[11px] text-stone-500" aria-live="polite">
                  {subjectStatus === 'loading'
                    ? 'Buscando tu foto de cuerpo completo sincronizada del móvil…'
                    : subjectPhoto && subjectId === 'USUARIO'
                      ? 'Foto real sincronizada desde tu App Móvil (/api/closet).'
                      : 'Sin foto móvil todavía: sube la tuya o usa un modelo de estudio.'}
                </p>
                <label className="block text-xs font-medium text-stone-600">
                  Pantalón del look (Clóset/Catálogo)
                  <select
                    value={lookBottomId}
                    onChange={(e) => setLookBottomId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-stone-300 px-2 py-1.5 text-sm"
                  >
                    <option value="">Sin pantalón (solo superior)</option>
                    {catalog
                      .filter((g) => g.category === 'PANTALON')
                      .map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                  </select>
                </label>

                {/* Reconstrucción de medio cuerpo + Calibrador Anatómico en Vivo */}
                <div className="space-y-2 rounded-lg border border-stone-200 bg-stone-50 p-3">
                  <button
                    type="button"
                    onClick={() => {
                      const next = effectiveFraming === 'HALF_BODY_EXTENDED' ? 'FULL_BODY' : 'HALF_BODY_EXTENDED';
                      setFramingMode(next);
                      setBodyAnchors({ framing: next });
                    }}
                    aria-pressed={effectiveFraming === 'HALF_BODY_EXTENDED'}
                    className={`w-full rounded-lg px-3 py-2 text-xs font-bold ${
                      effectiveFraming === 'HALF_BODY_EXTENDED' ? 'bg-gum-ember text-white' : 'border border-stone-300 bg-white text-stone-700'
                    }`}
                  >
                    Mi foto es de Medio Cuerpo: Extender Piernas Realistas con IA
                  </button>
                  <p className="text-[11px] text-stone-500" role="status">
                    {effectiveFraming === 'HALF_BODY_EXTENDED'
                      ? 'Medio cuerpo activo: tu foto ocupa 0–52% y las piernas reconstruidas 50–100% para probar pantalones en proporción.'
                      : detectedFraming === 'HALF_BODY_EXTENDED'
                        ? 'Detectamos medio cuerpo en tu foto.'
                        : 'Cuerpo entero: la prenda se ancla con DEFAULT_BODY_ANCHORS (rostro libre 0–19.5%).'}
                  </p>
                  <p className="text-xs font-bold text-gum-ink">Calibrador Anatómico en Vivo</p>
                  <SliderRow
                    label="Posición Vertical Hombros"
                    min={15}
                    max={30}
                    step={0.5}
                    value={bodyAnchors.shoulderTopPct}
                    display={`${bodyAnchors.shoulderTopPct.toFixed(1)}%`}
                    onChange={(v) => setBodyAnchors({ shoulderTopPct: v })}
                  />
                  <SliderRow
                    label="Posición Vertical Cintura"
                    min={42}
                    max={62}
                    step={0.5}
                    value={bodyAnchors.waistTopPct}
                    display={`${bodyAnchors.waistTopPct}%`}
                    onChange={(v) => setBodyAnchors({ waistTopPct: v })}
                  />
                  <SliderRow
                    label="Escala Corporal"
                    min={40}
                    max={80}
                    step={1}
                    value={bodyAnchors.torsoWidthPct}
                    display={`${bodyAnchors.torsoWidthPct}%`}
                    onChange={(v) => setBodyAnchors({ torsoWidthPct: v })}
                  />
                  {effectiveFraming === 'HALF_BODY_EXTENDED' && (
                    <label className="block text-xs font-medium text-stone-600">
                      Base inferior reconstruida
                      <select
                        value={bodyAnchors.lowerBodyPreset}
                        onChange={(e) => setBodyAnchors({ lowerBodyPreset: e.target.value as LowerBodyPreset })}
                        className="mt-1 w-full rounded-lg border border-stone-300 px-2 py-1.5 text-sm"
                      >
                        <option value="DENIM_DARK">Denim oscuro</option>
                        <option value="CHINO_BEIGE">Chino beige</option>
                        <option value="JOGGER_GREY">Jogger gris</option>
                        <option value="FORMAL_SLATE">Formal pizarra</option>
                      </select>
                    </label>
                  )}
                  <p className="text-[10px] text-stone-400">El cuello nace en {(bodyAnchors.shoulderTopPct + 0.5).toFixed(1)}% (bajo el mentón) y el pantalón en {bodyAnchors.waistTopPct}%: la cara nunca se cubre.</p>
                </div>
              </div>
            </section>
          )}

          {panelTab === 'logos' && (
            <>

        {/* Columna 2: gestor multicapa */}
        <section className="space-y-4 rounded-lg border border-stone-200 bg-white p-5">
          <h3 className="flex items-center gap-2 font-display text-lg font-semibold text-gum-ink">
            <Layers className="h-5 w-5 text-gum-ember" aria-hidden />
            Capas de logos ({logos.length}/{MAX_LOGOS})
          </h3>

          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-stone-400 px-3 py-2.5 text-sm font-semibold text-stone-700 hover:border-gum-ember hover:text-gum-ember"
            >
              <Upload className="h-4 w-4" aria-hidden /> Subir imagen
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
                  if (problem) setUploadError(problem);
                }
              }}
              className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-stone-400 px-3 py-2.5 text-sm font-semibold text-stone-700 hover:border-gum-ember hover:text-gum-ember"
            >
              <ImagePlus className="h-4 w-4" aria-hidden /> Sello rápido
            </button>
            <div className="text-xs text-stone-500 sm:col-span-3 lg:col-span-1 xl:col-span-3">
              Sube tu PNG/JPG/SVG (máx. 3 MB) o agrega un sello de la galería inferior.
            </div>
          </div>
          {uploadError && (
            <p className="flex items-start gap-1.5 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {uploadError}
            </p>
          )}

          {logos.length === 0 ? (
            <p className="rounded-lg bg-stone-100 px-4 py-6 text-center text-sm text-stone-500">
              Aún no hay logos. El diseño requiere al menos 1 logo.
            </p>
          ) : (
            <ol className="space-y-2">
              {logos.map((logo, index) => (
                <li key={logo.uid}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedUid(logo.uid);
                      setView(zoneDefaultFor(garment.category, logo.zone).view);
                    }}
                    aria-pressed={selectedUid === logo.uid}
                    className={`flex w-full items-center gap-3 rounded-lg border p-2 text-left ${
                      selectedUid === logo.uid
                        ? 'border-gum-ember bg-gum-bone'
                        : 'border-stone-200 hover:border-stone-400'
                    }`}
                  >
                    <img
                      src={logo.logoUrl}
                      alt={`Logo ${index + 1}`}
                      className="h-10 w-10 rounded bg-white object-contain"
                    />
                    <span className="flex-1 text-sm">
                      <span className="block font-semibold text-gum-ink">Logo {index + 1}</span>
                      <span className="block text-xs text-stone-500">
                        {logo.zone} · {TECHNIQUE_LABEL[logo.technique]}
                      </span>
                    </span>
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={`Eliminar logo ${index + 1}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setLogos((prev) => prev.filter((l) => l.uid !== logo.uid));
                        if (selectedUid === logo.uid) setSelectedUid(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.stopPropagation();
                          setLogos((prev) => prev.filter((l) => l.uid !== logo.uid));
                          if (selectedUid === logo.uid) setSelectedUid(null);
                        }
                      }}
                      className="rounded p-1 text-stone-400 hover:bg-red-50 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          )}

          {selectedLogo && (
            <div className="space-y-3 rounded-lg bg-gum-bone p-4">
              <p className="text-sm font-semibold text-gum-ink">
                Editando logo {logos.findIndex((l) => l.uid === selectedLogo.uid) + 1}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs font-medium text-stone-600">
                  Zona
                  <select
                    value={selectedLogo.zone}
                    onChange={(e) => changeZone(selectedLogo.uid, e.target.value as LogoZone)}
                    className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm"
                  >
                    {ZONES.map((z) => (
                      <option key={z} value={z}>
                        {z}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-medium text-stone-600">
                  Técnica
                  <select
                    value={selectedLogo.technique}
                    onChange={(e) =>
                      patchLogo(selectedLogo.uid, { technique: e.target.value as PrintTechnique })
                    }
                    className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm"
                  >
                    {(Object.keys(TECHNIQUE_LABEL) as PrintTechnique[]).map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="text-xs text-stone-500">{TECHNIQUE_LABEL[selectedLogo.technique]}</p>
              <div className="space-y-2">
                <SliderRow
                  label="Posición X"
                  min={0}
                  max={200}
                  step={0.5}
                  value={selectedLogo.x}
                  display={`${selectedLogo.x.toFixed(1)} cm`}
                  onChange={(v) => patchLogo(selectedLogo.uid, { x: v })}
                />
                <SliderRow
                  label="Posición Y"
                  min={0}
                  max={260}
                  step={0.5}
                  value={selectedLogo.y}
                  display={`${selectedLogo.y.toFixed(1)} cm`}
                  onChange={(v) => patchLogo(selectedLogo.uid, { y: v })}
                />
                <SliderRow
                  label="Ancho"
                  min={4}
                  max={80}
                  step={0.5}
                  value={selectedLogo.width}
                  display={`${selectedLogo.width.toFixed(1)} cm`}
                  onChange={(v) => patchLogo(selectedLogo.uid, { width: v })}
                />
                <SliderRow
                  label="Alto"
                  min={4}
                  max={80}
                  step={0.5}
                  value={selectedLogo.height}
                  display={`${selectedLogo.height.toFixed(1)} cm`}
                  onChange={(v) => patchLogo(selectedLogo.uid, { height: v })}
                />
                <SliderRow
                  label="Rotación"
                  min={-180}
                  max={180}
                  step={1}
                  value={selectedLogo.rotation}
                  display={`${selectedLogo.rotation.toFixed(0)}°`}
                  onChange={(v) => patchLogo(selectedLogo.uid, { rotation: v })}
                />
              </div>
            </div>
          )}

          {/* Galería de sellos */}
          <div>
            <p className="mb-2 text-sm font-semibold text-gum-ink">Galería de sellos Gumorose</p>
            <div className="grid grid-cols-2 gap-2">
              {GALLERY_SEALS.map((seal) => (
                <button
                  key={seal.name}
                  type="button"
                  onClick={() => {
                    const problem = pushLogo(seal.url, seal.technique);
                    if (problem) setUploadError(problem);
                    else setUploadError(null);
                  }}
                  className="rounded-lg border border-stone-200 p-2 text-left hover:border-gum-ember"
                >
                  <img src={seal.url} alt={seal.name} className="h-16 w-full object-contain" />
                  <span className="mt-1 block text-xs font-semibold text-gum-ink">{seal.name}</span>
                  <span className="block text-[11px] text-stone-500">{seal.blurb}</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Columna 3: IA + calculadora + guardado */}
        <section className="space-y-4">
          <div className="rounded-lg border border-stone-200 bg-white p-5">
            <h3 className="flex items-center gap-2 font-display text-lg font-semibold text-gum-ink">
              <Sparkles className="h-5 w-5 text-gum-ember" aria-hidden />
              Generar logo con IA
            </h3>
            <label className="mt-3 block text-sm font-medium text-stone-600">
              Describe tu logo
              <textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                placeholder="Ej. cóndor geométrico dorado para equipo de ciclismo"
              />
            </label>
            <div className="mt-2 flex gap-2">
              <select
                value={aiStyle}
                onChange={(e) => setAiStyle(e.target.value)}
                className="flex-1 rounded-lg border border-stone-300 px-2 py-2 text-sm"
                aria-label="Estilo del logo"
              >
                {['Minimalista andino', 'Urbano quiteño', 'Bordado clásico', 'Tropical Oriente'].map(
                  (s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ),
                )}
              </select>
              <button
                type="button"
                onClick={() => void handleGenerateLogo()}
                disabled={aiLoading}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gum-ember px-3 py-2 text-sm font-semibold text-white hover:bg-gum-emberdark disabled:opacity-60"
              >
                {aiLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Plus className="h-4 w-4" aria-hidden />
                )}
                Generar
              </button>
            </div>
            {aiNotice && <p className="mt-2 text-xs text-stone-600">{aiNotice}</p>}
          </div>

          {/* Calculadora industrial en vivo */}
          <div className="rounded-2xl bg-gum-espresso p-5 text-white shadow-editorial">
            <h3 className="font-display text-lg font-semibold">Calculadora industrial</h3>
            {pricing ? (
              <dl className="mt-3 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-stone-300">Precio base ({garment.category})</dt>
                  <dd className="font-semibold">${pricing.baseSalePrice.toFixed(2)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-stone-300">Logos extra ({pricing.extraLogos})</dt>
                  <dd className="font-semibold">+${pricing.extraPrintCost.toFixed(2)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-stone-300">Máquina extra / ud</dt>
                  <dd className="font-semibold">+{pricing.extraMachineMinutes} min</dd>
                </div>
                <div className="flex justify-between border-t border-white/15 pt-2">
                  <dt className="font-semibold">Precio unitario</dt>
                  <dd className="font-display text-xl font-bold text-gum-gold">
                    ${pricing.unitPrice.toFixed(2)}
                  </dd>
                </div>
                <div className="flex justify-between text-xs text-stone-300">
                  <dt>Tiempo unitario total</dt>
                  <dd>{unitMinutes} min</dd>
                </div>
              </dl>
            ) : (
              <p className="text-sm text-stone-300">Selecciona una prenda para calcular.</p>
            )}
          </div>

          <div className="space-y-3 rounded-lg border border-stone-200 bg-white p-5">
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-sm font-medium text-stone-600">
                Nombre del diseño
                <input
                  value={designName}
                  onChange={(e) => setDesignName(e.target.value)}
                  placeholder={`${garment.category} personalizado`}
                  maxLength={120}
                  className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-sm font-medium text-stone-600">
                Unidades
                <input
                  type="number"
                  min={1}
                  max={160}
                  value={qty}
                  onChange={(e) => setQty(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                />
              </label>
            </div>
            <label className="block text-sm font-medium text-stone-600">
              Cliente (opcional)
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                maxLength={120}
                placeholder="Nombre de quien compra"
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
              />
            </label>
            {saveMessage && (
              <p
                className={`flex items-start gap-1.5 text-sm ${
                  saveState === 'error' ? 'text-red-700' : 'text-green-800'
                }`}
              >
                {saveState === 'error' ? (
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                ) : (
                  <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                )}
                {saveMessage}
              </p>
            )}
            <button
              type="button"
              onClick={() => void handleSaveAndAdd()}
              disabled={saveState === 'saving'}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-gum-ember px-4 py-2.5 text-sm font-semibold text-white hover:bg-gum-emberdark disabled:opacity-60"
            >
              {saveState === 'saving' ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Check className="h-4 w-4" aria-hidden />
              )}
              Guardar diseño y enviar a mi Caja ({qty} uds)
            </button>
          </div>
        </section>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
