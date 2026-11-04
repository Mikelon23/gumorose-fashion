import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  validateEcuadorianId,
  type EcuadorRegion,
  type MlUserPreferenceRecord,
} from '@gumorose/shared';
import { useClosetMobile } from '../context/ClosetMobileContext';
import { registerOrLoginMl } from '../services/mobileApi';

const STORAGE_KEY = 'gumorose-ml-profile-v1';
const EVENT_NAME = 'gumorose-ml-profile';

export function loadMobileMlProfile(): MlUserPreferenceRecord | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? ((JSON.parse(raw) as { user: MlUserPreferenceRecord }).user ?? null) : null;
  } catch {
    return null;
  }
}
export function saveMobileMlProfile(user: MlUserPreferenceRecord): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ user }));
  } catch {
    /* sin almacenamiento */
  }
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: user }));
}
export function useMobileMlProfile(): MlUserPreferenceRecord | null {
  const [profile, setProfile] = useState<MlUserPreferenceRecord | null>(() => loadMobileMlProfile());
  useEffect(() => {
    function onChange(event: Event): void {
      setProfile((event as CustomEvent<MlUserPreferenceRecord>).detail ?? loadMobileMlProfile());
    }
    window.addEventListener(EVENT_NAME, onChange);
    return () => window.removeEventListener(EVENT_NAME, onChange);
  }, []);
  return profile;
}

const COLORS = ['#C86D51', '#2F4842', '#213A5C', '#141413', '#FAF7F2', '#B23A1D'];
const DEMO = {
  cedulaOrRuc: '0601234560',
  fullName: 'Demo Gumorose',
  email: 'demo@gumorose.ec',
  age: 28,
  heightCm: 172,
  weightKg: 70,
};

/** Botón de cuenta y perfilado IA (bottom-sheet) de la App móvil. */
export function MobileMlAccountButton(): React.JSX.Element {
  const { region, city, tempC } = useClosetMobile();
  const profile = useMobileMlProfile();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...DEMO, cedulaOrRuc: '', fullName: '', email: '' });
  const [colors, setColors] = useState<string[]>([]);
  const [fit, setFit] = useState<'TAILORED' | 'RELAXED' | 'OVERSIZE'>('RELAXED');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const idValid = form.cedulaOrRuc.length >= 10 && validateEcuadorianId(form.cedulaOrRuc);

  function fillDemo(): void {
    setForm({ ...DEMO });
    setColors(['#C86D51', '#2F4842', '#213A5C']);
  }
  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!validateEcuadorianId(form.cedulaOrRuc)) return setError('Cédula (Módulo 10) o RUC inválido.');
    if (colors.length !== 3) return setError('Elige 3 colores favoritos.');
    setSaving(true);
    setError('');
    const payload = {
      cedulaOrRuc: form.cedulaOrRuc,
      fullName: form.fullName,
      email: form.email,
      age: Number(form.age),
      genderFit: 'UNISEX' as const,
      region: region as EcuadorRegion,
      city,
      climateTempC: tempC,
      heightCm: Number(form.heightCm),
      weightKg: Number(form.weightKg),
      preferredFit: fit,
      favoriteColorsHex: colors,
      preferredCategories: ['CAMISETA', 'POLO'] as Array<'CAMISETA' | 'POLO'>,
      stylePreferences: ['urbano', 'andino'],
      styleDnaVector: { urbano: 60, andino: 40 },
    };
    try {
      const response = await registerOrLoginMl(payload);
      saveMobileMlProfile(response.user);
    } catch {
      saveMobileMlProfile({
        userId: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `local-${Date.now()}`,
        cedulaOrRuc: payload.cedulaOrRuc,
        age: payload.age,
        genderFit: payload.genderFit,
        region: payload.region,
        city: payload.city,
        climateTempC: payload.climateTempC,
        heightCm: payload.heightCm,
        weightKg: payload.weightKg,
        preferredFit: payload.preferredFit,
        favoriteColorsHex: payload.favoriteColorsHex,
        preferredCategories: [...payload.preferredCategories],
        styleDnaVector: payload.styleDnaVector,
        totalPurchases: 0,
        avgTicketUsd: 0,
        registeredAt: new Date().toISOString(),
        fullName: payload.fullName,
        email: payload.email,
      });
    } finally {
      setSaving(false);
      setOpen(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="min-h-9 rounded-full bg-gum-espresso px-2.5 text-[11px] font-bold text-white">
        {profile ? '👤 Perfil IA · 🤖' : '👤 Iniciar Sesión / Mi Perfil IA'}
      </button>
      {open &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 sm:p-6" role="dialog" aria-modal="true" aria-label="Iniciar Sesión - Perfil Inteligente Gumorose">
            <form onSubmit={(e) => void submit(e)} className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-[#E6E0D6] bg-[#FAF7F2] shadow-2xl">
              <div className="shrink-0 border-b border-[#E6E0D6] bg-white px-6 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-display text-lg font-bold">Iniciar Sesión · Perfil Inteligente Gumorose</h2>
                    <p className="text-xs text-stone-500">Cédula/RUC válido activa tu 🤖 Match ML y talla sugerida en la tienda.</p>
                  </div>
                  <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-stone-300 text-base font-bold">✕</button>
                </div>
                <button type="button" onClick={fillDemo} className="mt-3 w-full rounded-lg bg-gum-terracotta px-3 py-2 text-sm font-bold text-white">⚡ Autocompletar Demo 1-Clic</button>
              </div>
              <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
                <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <label className="sm:col-span-2">Nombre<input required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className="mt-1 w-full rounded border border-stone-300 px-2 py-2" /></label>
              <label className="sm:col-span-2">Cédula o RUC<input required inputMode="numeric" value={form.cedulaOrRuc} onChange={(e) => setForm({ ...form, cedulaOrRuc: e.target.value.replace(/\D/g, '').slice(0, 13) })} className="mt-1 w-full rounded border border-stone-300 px-2 py-2" placeholder="0601234560" />{form.cedulaOrRuc.length >= 10 && <span className={`text-xs font-bold ${idValid ? 'text-green-700' : 'text-red-700'}`}>{idValid ? '✓ Identidad válida' : '✗ Identidad inválida'}</span>}</label>
              <label className="sm:col-span-2">Email<input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1 w-full rounded border border-stone-300 px-2 py-2" /></label>
              <label>Edad<input required type="number" min={16} max={99} value={form.age} onChange={(e) => setForm({ ...form, age: Number(e.target.value) })} className="mt-1 w-full rounded border border-stone-300 px-2 py-2" /></label>
              <label>Corte<select value={fit} onChange={(e) => setFit(e.target.value as typeof fit)} className="mt-1 w-full rounded border border-stone-300 px-2 py-2"><option value="TAILORED">Tailored</option><option value="RELAXED">Relaxed</option><option value="OVERSIZE">Oversize</option></select></label>
              <label>Estatura cm<input required type="number" min={140} max={210} value={form.heightCm} onChange={(e) => setForm({ ...form, heightCm: Number(e.target.value) })} className="mt-1 w-full rounded border border-stone-300 px-2 py-2" /></label>
              <label>Peso kg<input required type="number" min={40} max={150} value={form.weightKg} onChange={(e) => setForm({ ...form, weightKg: Number(e.target.value) })} className="mt-1 w-full rounded border border-stone-300 px-2 py-2" /></label>
            </div>
            <p className="mt-3 text-xs font-bold">3 colores favoritos ({colors.length}/3)</p>
            <div className="mt-1 flex gap-2">
              {COLORS.map((hex) => (
                <button key={hex} type="button" aria-label={`Color ${hex}`} aria-pressed={colors.includes(hex)} onClick={() => setColors((prev) => prev.includes(hex) ? prev.filter((c) => c !== hex) : [...prev.slice(-2), hex])} className={`h-9 w-9 rounded-full border-2 ${colors.includes(hex) ? 'border-gum-espresso' : 'border-stone-300'}`} style={{ backgroundColor: hex }} />
              ))}
            </div>
                {error && <p className="mt-2 text-xs font-bold text-red-700">{error}</p>}
              </div>
              <div className="flex shrink-0 items-center justify-end gap-3 border-t border-[#E6E0D6] bg-white px-6 py-3.5">
                <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-bold">Cancelar</button>
                <button type="submit" disabled={saving} className="rounded-lg bg-gum-espresso px-4 py-2 text-sm font-bold text-white disabled:opacity-60">{saving ? 'Guardando…' : 'Guardar Perfil y Ver Recomendaciones ML'}</button>
              </div>
            </form>
          </div>,
          document.body,
        )}
    </>
  );
}
