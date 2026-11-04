import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  validateEcuadorianId,
  validateEcuadorianPhone,
  type EcuadorRegion,
  type MlUserPreferenceRecord,
} from '@gumorose/shared';
import { registerOrLoginMl } from '../services/api';

const STORAGE_KEY = 'gumorose-ml-profile-v1';
const EVENT_NAME = 'gumorose-ml-profile';

export interface StoredMlProfile {
  user: MlUserPreferenceRecord;
}

export function loadMlProfile(): MlUserPreferenceRecord | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredMlProfile;
    return parsed.user ?? null;
  } catch {
    return null;
  }
}

export function saveMlProfile(user: MlUserPreferenceRecord): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ user }));
  } catch {
    /* almacenamiento no disponible */
  }
  window.dispatchEvent(new CustomEvent<MlUserPreferenceRecord>(EVENT_NAME, { detail: user }));
}

export function useMlProfile(): MlUserPreferenceRecord | null {
  const [profile, setProfile] = useState<MlUserPreferenceRecord | null>(() => loadMlProfile());
  useEffect(() => {
    function onChange(event: Event): void {
      setProfile((event as CustomEvent<MlUserPreferenceRecord>).detail ?? loadMlProfile());
    }
    window.addEventListener(EVENT_NAME, onChange);
    return () => window.removeEventListener(EVENT_NAME, onChange);
  }, []);
  return profile;
}

const COLOR_CHOICES = [
  '#C86D51',
  '#2F4842',
  '#213A5C',
  '#141413',
  '#FAF7F2',
  '#B23A1D',
  '#C2B280',
  '#5B4A8A',
];
const STYLE_CHOICES = ['urbano', 'andino', 'costero', 'ejecutivo', 'casual', 'oversize'];

export const DEMO_ML_PROFILE = {
  cedulaOrRuc: '0601234560',
  fullName: 'Demo Gumorose',
  email: 'demo@gumorose.ec',
  phone: '0991234567',
  age: 28,
  genderFit: 'UNISEX' as const,
  region: 'SIERRA' as EcuadorRegion,
  city: 'Riobamba',
  climateTempC: 11,
  heightCm: 172,
  weightKg: 70,
  preferredFit: 'RELAXED' as const,
  favoriteColorsHex: ['#C86D51', '#2F4842', '#213A5C'],
  preferredCategories: ['CAMISETA', 'POLO'] as const,
  stylePreferences: ['urbano', 'andino', 'casual'],
};

/** Botón de cuenta + modal de perfilado IA con validación en vivo. */
export function MlAccountButton(): React.JSX.Element {
  const profile = useMlProfile();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...DEMO_ML_PROFILE, fullName: '', email: '', cedulaOrRuc: '' });
  const [colors, setColors] = useState<string[]>([]);
  const [styles, setStyles] = useState<string[]>([]);
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle');
  const [error, setError] = useState('');

  const idValid = form.cedulaOrRuc.length > 0 && validateEcuadorianId(form.cedulaOrRuc);
  const idTouched = form.cedulaOrRuc.length >= 10;

  function toggleColor(hex: string): void {
    setColors((prev) =>
      prev.includes(hex) ? prev.filter((c) => c !== hex) : [...prev.slice(-2), hex],
    );
  }
  function toggleStyle(tag: string): void {
    setStyles((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }
  function fillDemo(): void {
    setForm({ ...DEMO_ML_PROFILE });
    setColors([...DEMO_ML_PROFILE.favoriteColorsHex]);
    setStyles([...DEMO_ML_PROFILE.stylePreferences]);
  }

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!validateEcuadorianId(form.cedulaOrRuc)) {
      setError('Cédula (Módulo 10) o RUC de 13 dígitos inválido.');
      return;
    }
    if (form.phone && !validateEcuadorianPhone(form.phone)) {
      setError('Celular debe ser 09XXXXXXXX.');
      return;
    }
    if (colors.length !== 3) {
      setError('Elige exactamente 3 colores favoritos.');
      return;
    }
    setStatus('saving');
    setError('');
    const payload = {
      cedulaOrRuc: form.cedulaOrRuc.trim(),
      fullName: form.fullName.trim(),
      email: form.email.trim(),
      phone: form.phone || undefined,
      age: Number(form.age),
      genderFit: form.genderFit,
      region: form.region,
      city: form.city.trim(),
      climateTempC: Number(form.climateTempC),
      heightCm: Number(form.heightCm),
      weightKg: Number(form.weightKg),
      preferredFit: form.preferredFit,
      favoriteColorsHex: colors,
      preferredCategories: [...DEMO_ML_PROFILE.preferredCategories],
      stylePreferences: styles,
      styleDnaVector: Object.fromEntries(
        styles.map((tag) => [tag, Math.round(100 / Math.max(1, styles.length))]),
      ),
    };
    try {
      const response = await registerOrLoginMl(payload);
      saveMlProfile(response.user);
      setOpen(false);
    } catch {
      const localUser: MlUserPreferenceRecord = {
        userId:
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `local-${Date.now()}`,
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
        phone: payload.phone,
      };
      saveMlProfile(localUser);
      setOpen(false);
    } finally {
      setStatus('idle');
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border border-gum-line bg-white px-3 py-1.5 text-xs font-bold text-gum-espresso hover:border-gum-ink"
      >
        {profile ? `👤 ${profile.fullName ?? 'Mi Perfil IA'} · 🤖 ML activo` : '👤 Iniciar Sesión / Mi Perfil IA'}
      </button>
      {open &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 sm:p-6" role="dialog" aria-modal="true" aria-label="Iniciar Sesión - Perfil Inteligente Gumorose">
            <form onSubmit={(e) => void submit(e)} className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[#E6E0D6] bg-[#FAF7F2] shadow-2xl">
              <div className="shrink-0 border-b border-[#E6E0D6] bg-white px-6 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-display text-xl font-bold text-gum-ink">Iniciar Sesión · Perfil Inteligente Gumorose</h2>
                    <p className="text-xs text-stone-500">Validamos tu Cédula/RUC y aprendemos tu estilo para recomendarte talla y prendas.</p>
                  </div>
                  <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-stone-300 text-base font-bold">✕</button>
                </div>
                <button type="button" onClick={fillDemo} className="mt-3 w-full rounded-lg bg-gum-ember px-3 py-2 text-sm font-bold text-white">
                  ⚡ Autocompletar Demo 1-Clic
                </button>
              </div>
              <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
                <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <label className="sm:col-span-2">Nombre completo<input required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5" /></label>
              <label className="sm:col-span-2">Cédula o RUC
                <input required inputMode="numeric" value={form.cedulaOrRuc} onChange={(e) => setForm({ ...form, cedulaOrRuc: e.target.value.replace(/\D/g, '').slice(0, 13) })} className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5" placeholder="0601234560 o RUC 13 dígitos" />
                {idTouched && <span className={`text-xs font-bold ${idValid ? 'text-green-700' : 'text-red-700'}`}>{idValid ? '✓ Identidad válida (Módulo 10/RUC)' : '✗ Revisa provincia, tercer dígito y verificador'}</span>}
              </label>
              <label>Email<input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5" /></label>
              <label>Celular 09 (opcional)<input inputMode="numeric" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })} className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5" /></label>
              <label>Edad (16-99)<input required type="number" min={16} max={99} value={form.age} onChange={(e) => setForm({ ...form, age: Number(e.target.value) })} className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5" /></label>
              <label>Género<select value={form.genderFit} onChange={(e) => setForm({ ...form, genderFit: e.target.value as typeof form.genderFit })} className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5"><option value="FEMENINO">Femenino</option><option value="MASCULINO">Masculino</option><option value="UNISEX">Unisex</option></select></label>
              <label>Región<select value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value as EcuadorRegion })} className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5"><option value="SIERRA">Sierra</option><option value="COSTA">Costa</option><option value="ORIENTE">Oriente</option><option value="GALAPAGOS">Galápagos</option></select></label>
              <label>Ciudad<input required value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5" /></label>
              <label>Temp. °C<input required type="number" min={-10} max={45} value={form.climateTempC} onChange={(e) => setForm({ ...form, climateTempC: Number(e.target.value) })} className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5" /></label>
              <label>Estatura cm (140-210)<input required type="number" min={140} max={210} value={form.heightCm} onChange={(e) => setForm({ ...form, heightCm: Number(e.target.value) })} className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5" /></label>
              <label>Peso kg (40-150)<input required type="number" min={40} max={150} value={form.weightKg} onChange={(e) => setForm({ ...form, weightKg: Number(e.target.value) })} className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5" /></label>
              <label>Corte favorito<select value={form.preferredFit} onChange={(e) => setForm({ ...form, preferredFit: e.target.value as typeof form.preferredFit })} className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5"><option value="TAILORED">Tailored</option><option value="RELAXED">Relaxed</option><option value="OVERSIZE">Oversize</option></select></label>
            </div>
            <p className="mt-3 text-xs font-bold text-stone-600">Elige 3 colores favoritos ({colors.length}/3)</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {COLOR_CHOICES.map((hex) => (
                <button key={hex} type="button" onClick={() => toggleColor(hex)} aria-pressed={colors.includes(hex)} className={`h-8 w-8 rounded-full border-2 ${colors.includes(hex) ? 'border-gum-ink' : 'border-stone-300'}`} style={{ backgroundColor: hex }} aria-label={`Color ${hex}`} />
              ))}
            </div>
            <p className="mt-3 text-xs font-bold text-stone-600">Estilos favoritos</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {STYLE_CHOICES.map((tag) => (
                <button key={tag} type="button" onClick={() => toggleStyle(tag)} aria-pressed={styles.includes(tag)} className={`rounded-full px-2.5 py-1 text-xs font-bold ${styles.includes(tag) ? 'bg-gum-espresso text-white' : 'border border-stone-300'}`}>{tag}</button>
              ))}
            </div>
                {error && <p className="mt-2 text-xs font-bold text-red-700">{error}</p>}
              </div>
              <div className="flex shrink-0 items-center justify-end gap-3 border-t border-[#E6E0D6] bg-white px-6 py-3.5">
                <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-bold text-stone-700">Cancelar</button>
                <button type="submit" disabled={status === 'saving'} className="rounded-lg bg-gum-ink px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
                  {status === 'saving' ? 'Guardando perfil…' : 'Guardar Perfil y Ver Recomendaciones ML'}
                </button>
              </div>
            </form>
          </div>,
          document.body,
        )}
    </>
  );
}
