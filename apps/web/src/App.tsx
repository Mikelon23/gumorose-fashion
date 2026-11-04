import React, { useState } from 'react';
import { Factory, KeyRound, Package, PackageSearch, PenTool, Store, User, Zap } from 'lucide-react';
import type { GarmentTemplate } from '@gumorose/shared';
import { setAdminAuth, type AdminRole } from './services/api';
import { useBox } from './context/BoxContext';
import { StorefrontView } from './pages/StorefrontView';
import { CustomizerStudioView } from './pages/CustomizerStudioView';
import { GumoroseBoxView } from './pages/GumoroseBoxView';
import { OrdersTrackingView } from './pages/OrdersTrackingView';
import { AdminCmsView, type AdminTab } from './pages/AdminCmsView';
import { MlAccountButton } from './components/MlAccountModal';

type ViewKey = 'tienda' | 'estudio' | 'caja' | 'pedidos' | 'admin';

const ADMIN_PASSCODE = 'GUMO2026';
const ADMIN_UNLOCK_KEY = 'gumorose-admin-unlocked';

const NAV: { id: ViewKey; label: string; icon: React.JSX.Element }[] = [
  { id: 'tienda', label: 'Tienda', icon: <Store className="h-4 w-4" aria-hidden /> },
  { id: 'estudio', label: 'Estudio 3D', icon: <PenTool className="h-4 w-4" aria-hidden /> },
  { id: 'caja', label: 'Mi Caja', icon: <Package className="h-4 w-4" aria-hidden /> },
  { id: 'pedidos', label: 'Seguimiento', icon: <PackageSearch className="h-4 w-4" aria-hidden /> },
  { id: 'admin', label: 'ERP', icon: <Factory className="h-4 w-4" aria-hidden /> },
];

function readAdminUnlock(): boolean {
  try {
    return sessionStorage.getItem(ADMIN_UNLOCK_KEY) === '1';
  } catch {
    return false;
  }
}

export const ADMIN_ROLES: { role: AdminRole; label: string; detail: string }[] = [
  { role: 'SUPER_ADMIN', label: 'Superadmin', detail: 'CEO / Fundadores · todo' },
  { role: 'ADMIN_GERENCIA', label: 'Gerencia', detail: 'CMS, finanzas y CxC B2B' },
  { role: 'ADMIN_BODEGA', label: 'Bodega', detail: 'Materia prima y Neymatex' },
  { role: 'ADMIN_PLANTA', label: 'Planta', detail: '11 etapas y Sello Azul' },
];

export function adminUserIdFor(role: AdminRole): string {
  return `erp-${role.toLowerCase().replace(/_/g, '-')}`;
}

/**
 * Selector de rol antes de entrar al panel administrativo.
 * "Vista Cliente" vuelve a la tienda; el acceso admin pide la clave
 * rápida o entra en 1 clic (Modo Juez Hackathon) con 1 de los 4 roles.
 */
function RoleGateModal({
  onPickClient,
  onUnlock,
}: {
  onPickClient: () => void;
  onUnlock: (role: AdminRole) => void;
}): React.JSX.Element {
  const [passcode, setPasscode] = useState('');
  const [denied, setDenied] = useState(false);
  const [role, setRole] = useState<AdminRole>('SUPER_ADMIN');

  function tryPasscode(e: React.FormEvent): void {
    e.preventDefault();
    if (passcode.trim() === ADMIN_PASSCODE) {
      onUnlock(role);
    } else {
      setDenied(true);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Selector de rol"
      className="fixed inset-0 z-50 flex items-center justify-center bg-gum-ink/60 p-4"
    >
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
        <h2 className="font-display text-xl font-bold text-gum-ink">¿Cómo quieres entrar?</h2>
        <p className="mt-1 text-sm text-stone-600">
          La pestaña <strong>ERP</strong> muestra costos, stock de bodega y máquinas de Riobamba.
        </p>

        <button
          type="button"
          onClick={onPickClient}
          className="mt-4 flex w-full items-center gap-3 rounded-lg border border-stone-300 px-4 py-3 text-left hover:border-gum-ink"
        >
          <User className="h-5 w-5 shrink-0 text-gum-ember" aria-hidden />
          <span>
            <span className="block text-sm font-bold text-gum-ink">Vista Cliente</span>
            <span className="block text-xs text-stone-500">
              Tienda, personalizar, mi caja y seguimiento de pedidos.
            </span>
          </span>
        </button>

        <div className="mt-3 grid grid-cols-2 gap-2" role="group" aria-label="Rol administrativo">
          {ADMIN_ROLES.map((option) => {
            const active = role === option.role;
            return (
              <button
                key={option.role}
                type="button"
                onClick={() => setRole(option.role)}
                aria-pressed={active}
                title={option.detail}
                className={`rounded-lg border px-3 py-2 text-left ${
                  active
                    ? 'border-gum-ink bg-gum-ink text-white'
                    : 'border-stone-300 bg-white text-stone-700 hover:border-gum-ink'
                }`}
              >
                <span className="block text-sm font-bold">{option.label}</span>
                <span className={`block text-[11px] ${active ? 'text-stone-300' : 'text-stone-500'}`}>
                  {option.detail}
                </span>
              </button>
            );
          })}
        </div>
        <form
          onSubmit={tryPasscode}
          className="mt-3 rounded-lg border border-stone-200 bg-stone-50 p-4"
        >
          <p className="flex items-center gap-1.5 text-sm font-bold text-gum-ink">
            <KeyRound className="h-4 w-4" aria-hidden /> Acceso {role === 'SUPER_ADMIN' ? 'Superadmin' : ADMIN_ROLES.find((o) => o.role === role)?.label}
          </p>
          <span className="mt-2 flex gap-2">
            <input
              value={passcode}
              onChange={(e) => {
                setPasscode(e.target.value);
                setDenied(false);
              }}
              placeholder="Clave rápida"
              autoComplete="off"
              className="min-w-0 flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="shrink-0 rounded-lg bg-gum-ink px-4 py-2 text-sm font-semibold text-white hover:bg-gum-soot"
            >
              Desbloquear
            </button>
          </span>
          {denied && (
            <p className="mt-1.5 text-xs font-semibold text-red-700">
              Clave incorrecta. Pide la clave rápida al equipo de planta.
            </p>
          )}
          <button
            type="button"
            onClick={() => onUnlock(role)}
            className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-gum-ember px-4 py-2 text-sm font-semibold text-white hover:bg-gum-emberdark"
          >
            <Zap className="h-4 w-4" aria-hidden /> Entrar en 1 clic como {ADMIN_ROLES.find((o) => o.role === role)?.label}
          </button>
        </form>
      </div>
    </div>
  );
}

function BrandMark(): React.JSX.Element {
  return (
    <svg viewBox="0 0 32 32" className="h-9 w-9" aria-hidden>
      <rect width="32" height="32" rx="7" fill="#141413" />
      <circle cx="16" cy="14" r="6.5" fill="none" stroke="#C59B27" strokeWidth="2" />
      <circle cx="16" cy="14" r="2.4" fill="#C86D51" />
      <path
        d="M16 20.5 L16 26 M16 23.5 L12.5 22 M16 23.5 L19.5 22"
        stroke="#C9A227"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Gumorose Web: navegación sin recargas entre Tienda, Estudio,
 * Caja Gumorose y Panel Admin.
 */
/**
 * Selector de Perfil Comercial (Diagrama 3): alterna en 1 clic entre
 * Cliente Minorista (B2C, pago 100%) y Cliente Mayorista (B2B, 50/50).
 */
function CustomerRoleSwitch(): React.JSX.Element {
  const { customerRole, setCustomerRole, companyName } = useBox();
  return (
    <div
      className="flex items-center gap-1 rounded-full bg-stone-100 p-1"
      role="group"
      aria-label="Perfil comercial"
    >
      {(
        [
          { role: 'CLIENTE_B2C', label: 'Personal B2C' },
          { role: 'CLIENTE_B2B', label: 'Mayorista B2B' },
        ] as const
      ).map((option) => {
        const active = customerRole === option.role;
        return (
          <button
            key={option.role}
            type="button"
            onClick={() => setCustomerRole(option.role)}
            aria-pressed={active}
            title={option.role === 'CLIENTE_B2B' ? 'Corporativo / Mayorista' : 'Personal / Minorista'}
            className={`rounded-full px-3 py-1.5 text-xs font-bold ${
              active ? 'bg-gum-ink text-white' : 'text-stone-500 hover:text-gum-ink'
            }`}
          >
            {option.label}
          </button>
        );
      })}
      {customerRole === 'CLIENTE_B2B' && companyName.trim() && (
        <span className="max-w-28 truncate px-1 text-[11px] font-semibold text-gum-emberdark">
          {companyName.trim()}
        </span>
      )}
    </div>
  );
}

export default function App(): React.JSX.Element {
  const { totalUnits } = useBox();
  const [view, setView] = useState<ViewKey>('tienda');
  const [customGarment, setCustomGarment] = useState<GarmentTemplate | null>(null);
  const [adminTab, setAdminTab] = useState<AdminTab>('planta');
  const [adminUnlocked, setAdminUnlocked] = useState<boolean>(readAdminUnlock);
  const [roleGateOpen, setRoleGateOpen] = useState(false);
  const [adminRole, setAdminRole] = useState<AdminRole>('SUPER_ADMIN');
  const isCommercial = view !== 'admin';

  function goCustomize(garment: GarmentTemplate): void {
    setCustomGarment(garment);
    setView('estudio');
    window.scrollTo({ top: 0 });
  }

  function changeView(next: ViewKey): void {
    setView(next);
    window.scrollTo({ top: 0 });
  }

  function requestView(next: ViewKey): void {
    if (next === 'admin' && !adminUnlocked) {
      setRoleGateOpen(true);
      return;
    }
    changeView(next);
  }

  function unlockAdmin(role: AdminRole): void {
    setAdminRole(role);
    setAdminAuth({ userId: adminUserIdFor(role), role });
    setAdminUnlocked(true);
    try {
      sessionStorage.setItem(ADMIN_UNLOCK_KEY, '1');
    } catch {
      /* sesión privada: el desbloqueo dura lo que dure el estado */
    }
    setRoleGateOpen(false);
    changeView('admin');
  }

  function changeAdminRole(role: AdminRole): void {
    setAdminRole(role);
    setAdminAuth({ userId: adminUserIdFor(role), role });
  }

  return (
    <div
      className={`flex min-h-screen flex-col text-gum-espresso ${
        isCommercial ? 'bg-gum-alabaster' : 'bg-white text-stone-900'
      }`}
    >
      {/* Encabezado editorial */}
      <header
        className={`sticky top-0 z-40 backdrop-blur ${
          isCommercial
            ? 'border-b border-gum-line bg-gum-alabaster/95'
            : 'border-b border-stone-200 bg-white/95'
        }`}
      >
        <div
          className={`mx-auto flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 ${
            isCommercial ? 'max-w-[1440px]' : 'max-w-6xl'
          }`}
        >
          <span className="flex items-center gap-2">
            <BrandMark />
            <span className="font-display text-lg font-bold leading-none text-gum-espresso">
              Gumorose
            </span>
          </span>
          <nav className="order-3 flex w-full flex-wrap gap-1 sm:order-2 sm:w-auto sm:flex-1 sm:justify-center" aria-label="Secciones">
            {NAV.map((item) => {
              const active = view === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => requestView(item.id)}
                  aria-current={active ? 'page' : undefined}
                  className={`relative inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
                    active
                      ? 'bg-gum-ink text-white'
                      : 'text-stone-700 hover:bg-stone-100 hover:text-gum-ink'
                  }`}
                >
                  {item.icon}
                  {item.label}
                  {item.id === 'caja' && totalUnits > 0 && (
                    <span
                      aria-label={`${totalUnits} prendas en la caja`}
                      className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-gum-ember px-1 text-[11px] font-bold text-white"
                    >
                      {totalUnits > 99 ? '99+' : totalUnits}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
          <span className="order-2 ml-auto flex items-center gap-2 sm:order-3 sm:ml-0">
            <MlAccountButton />
            <CustomerRoleSwitch />
          </span>
        </div>
      </header>

      {/* Contenido */}
      <main
        className={`mx-auto w-full flex-1 px-4 py-6 ${
          isCommercial ? 'max-w-[1440px]' : 'max-w-6xl'
        }`}
      >
        {view === 'tienda' && <StorefrontView onCustomize={goCustomize} />}
        {view === 'estudio' && (
          <CustomizerStudioView
            preselected={customGarment}
            onAddedToBox={() => changeView('caja')}
          />
        )}
        {view === 'caja' && (
          <GumoroseBoxView
            onShop={() => changeView('tienda')}
            onGoAdmin={() => {
              setAdminTab('planta');
              requestView('admin');
            }}
          />
        )}
        {view === 'pedidos' && <OrdersTrackingView />}
        {view === 'admin' && (
          <AdminCmsView
            tab={adminTab}
            onTabChange={setAdminTab}
            adminRole={adminRole}
            onAdminRoleChange={changeAdminRole}
          />
        )}
      </main>

      {roleGateOpen && (
        <RoleGateModal onPickClient={() => setRoleGateOpen(false)} onUnlock={unlockAdmin} />
      )}

      {/* Pie */}
      <footer className="border-t border-gum-espresso bg-gum-espresso text-stone-300">
        <div
          className={`mx-auto flex flex-col gap-1 px-4 py-5 text-sm sm:flex-row sm:items-center sm:justify-between ${
            isCommercial ? 'max-w-[1440px]' : 'max-w-6xl'
          }`}
        >
          <p>
            <strong className="font-display text-white">Gumorose</strong> · Manufactura inteligente
            en Riobamba · <em>Every step matters</em>
          </p>
          <p className="text-xs text-stone-400">
            D2C: de nuestras máquinas directo a tu puerta en Costa, Sierra y Oriente.
          </p>
        </div>
      </footer>
    </div>
  );
}
