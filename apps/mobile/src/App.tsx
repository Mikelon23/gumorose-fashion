import React, { useState } from 'react';
import {
  LayoutGrid,
  MapPin,
  MonitorSmartphone,
  PenTool,
  PersonStanding,
  ShoppingBag,
  Sparkles,
  Thermometer,
} from 'lucide-react';
import { useClosetMobile } from './context/ClosetMobileContext';
import { MyClosetScreen } from './screens/MyClosetScreen';
import { DailyStylistScreen } from './screens/DailyStylistScreen';
import { BodyTryOnScreen } from './screens/BodyTryOnScreen';
import { MobileCustomizerScreen } from './screens/MobileCustomizerScreen';
import { MobileShopBoxScreen } from './screens/MobileShopBoxScreen';
import { REGION_SHORT_LABEL } from './data/mobile';
import { MobileMlAccountButton } from './components/MobileMlAccount';

type MobileTab = 'closet' | 'stylist' | 'tryon' | 'custom' | 'shop';

const TABS: { id: MobileTab; label: string; icon: React.JSX.Element }[] = [
  { id: 'closet', label: 'Clóset', icon: <LayoutGrid className="h-5 w-5" aria-hidden /> },
  { id: 'stylist', label: 'Estilista', icon: <Sparkles className="h-5 w-5" aria-hidden /> },
  { id: 'tryon', label: 'Probador', icon: <PersonStanding className="h-5 w-5" aria-hidden /> },
  { id: 'custom', label: 'Diseñar', icon: <PenTool className="h-5 w-5" aria-hidden /> },
  { id: 'shop', label: 'Tienda', icon: <ShoppingBag className="h-5 w-5" aria-hidden /> },
];

/** Barra de estado: región del Ecuador + clima en °C. */
function StatusBar(): React.JSX.Element {
  const { region, city, tempC } = useClosetMobile();
  return (
    <div className="flex items-center justify-between border-b border-gum-line bg-white px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] text-gum-espresso">
      <p className="text-[11px] font-semibold">
        {REGION_SHORT_LABEL[region]} · {city}
      </p>
      <p className="flex items-center gap-1 font-display text-sm font-bold text-gum-terracottadark">
        <Thermometer className="h-3.5 w-3.5" aria-hidden />
        {tempC}°C
      </p>
    </div>
  );
}

/** Píldora de clima activo del header (ej. Sierra 11°C). */
function ClimatePill(): React.JSX.Element {
  const { region, tempC } = useClosetMobile();
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gum-linen px-2.5 py-1 text-[11px] font-bold text-gum-salvia">
      <MapPin className="h-3 w-3" aria-hidden />
      {REGION_SHORT_LABEL[region]} {tempC}°C
    </span>
  );
}

/**
 * App móvil: marco de dispositivo opcional, barra de estado regional
 * y navegación inferior de 5 pestañas.
 */
/** Selector rápido de rol móvil (Diagrama 2: B2C minorista / B2B mayorista). */
function RoleSwitch({
  onRoleChange,
}: {
  onRoleChange?: (role: 'CLIENTE_B2C' | 'CLIENTE_B2B') => void;
}): React.JSX.Element {
  const { activeCustomerRole, setActiveCustomerRole, companyName } = useClosetMobile();
  return (
    <div
      className="flex items-center gap-1 rounded-full bg-gum-linen p-0.5"
      role="group"
      aria-label="Rol de compra"
    >
      {(
        [
          { role: 'CLIENTE_B2C', label: 'B2C' },
          { role: 'CLIENTE_B2B', label: 'B2B' },
        ] as const
      ).map((option) => {
        const active = activeCustomerRole === option.role;
        return (
          <button
            key={option.role}
            type="button"
            onClick={() => {
              setActiveCustomerRole(option.role);
              onRoleChange?.(option.role);
            }}
            aria-pressed={active}
            title={option.role === 'CLIENTE_B2B' ? 'Corporativo / Mayorista' : 'Personal / Minorista'}
            className={`min-h-9 rounded-full px-2.5 text-[11px] font-bold transition ${
              active ? 'bg-gum-espresso text-white' : 'text-stone-500'
            }`}
          >
            {option.label}
          </button>
        );
      })}
      {activeCustomerRole === 'CLIENTE_B2B' && companyName.trim() && (
        <span className="max-w-24 truncate px-1 text-[10px] font-semibold text-gum-terracottadark">
          {companyName.trim()}
        </span>
      )}
    </div>
  );
}

export default function App(): React.JSX.Element {
  const { totalUnits, setSelectedOutfitId } = useClosetMobile();
  const [tab, setTab] = useState<MobileTab>('closet');
  const [framed, setFramed] = useState(true);
  const [roleToast, setRoleToast] = useState<string | null>(null);

  function go(next: MobileTab): void {
    setTab(next);
  }

  function handleRoleChange(role: 'CLIENTE_B2C' | 'CLIENTE_B2B'): void {
    setRoleToast(
      role === 'CLIENTE_B2B'
        ? 'Mayorista B2B · lotes 13–160 uds · −12%/−20% · Anticipo 50/50'
        : 'Personal B2C · 1–12 uds · Pago 100% online',
    );
    window.setTimeout(() => setRoleToast(null), 2600);
  }

  const screen = (
    <div className="min-h-full bg-gum-alabaster">
      {tab === 'closet' && <MyClosetScreen onTryOn={() => go('tryon')} />}
      {tab === 'stylist' && (
        <DailyStylistScreen
          onTryOn={(outfitId) => {
            setSelectedOutfitId(outfitId);
            go('tryon');
          }}
        />
      )}
      {tab === 'tryon' && <BodyTryOnScreen onGoStylist={() => go('stylist')} />}
      {tab === 'custom' && (
        <MobileCustomizerScreen onAddedToBox={() => go('shop')} onTryOn={() => go('tryon')} />
      )}
      {tab === 'shop' && <MobileShopBoxScreen onGoCustom={() => go('custom')} />}
    </div>
  );

  const tabBar = (
    <nav
      className="border-t border-gum-line bg-white px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5"
      aria-label="Navegación principal"
    >
      <div className="grid grid-cols-5">
        {TABS.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => go(item.id)}
              aria-current={active ? 'page' : undefined}
              className={`relative flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-bold transition active:scale-95 ${
                active ? 'text-gum-terracottadark' : 'text-stone-400'
              }`}
            >
              <span
                className={`flex h-6 items-center rounded-full px-2 transition ${
                  active ? 'bg-gum-linen' : ''
                }`}
              >
                {item.icon}
              </span>
              {item.label}
              {item.id === 'shop' && totalUnits > 0 && (
                <span className="absolute right-3 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-gum-terracotta px-1 text-[9px] font-bold text-white">
                  {totalUnits > 99 ? '99+' : totalUnits}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );

  return (
    <div className="min-h-dvh bg-gum-alabaster text-gum-espresso">
      {/* Header compacto en 1 franja: marca + clima + rol + marco */}
      <header className="sticky top-0 z-40 border-b border-gum-line bg-gum-alabaster/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-md items-center gap-2 px-4 py-2.5">
          <span className="font-display text-base font-bold tracking-wide">GUMOROSE</span>
          <ClimatePill />
          <span className="ml-auto flex items-center gap-1.5">
            <MobileMlAccountButton />
            <RoleSwitch onRoleChange={handleRoleChange} />
            <button
              type="button"
              onClick={() => setFramed((v) => !v)}
              aria-pressed={framed}
              aria-label={framed ? 'Pantalla completa' : 'Marco teléfono'}
              title={framed ? 'Pantalla completa' : 'Marco teléfono'}
              className="flex min-h-9 min-w-9 items-center justify-center rounded-full bg-white text-stone-600 shadow-card"
            >
              <MonitorSmartphone className="h-4 w-4" aria-hidden />
            </button>
          </span>
        </div>
        {roleToast && (
          <p
            role="status"
            className="mx-auto mb-2 w-full max-w-md truncate px-4 text-center text-[11px] font-semibold text-gum-salvia"
          >
            <span className="inline-block max-w-full truncate rounded-full bg-white px-3 py-1.5 shadow-card">
              {roleToast}
            </span>
          </p>
        )}
      </header>

      {framed ? (
        <div className="mx-auto w-full max-w-md px-3 pb-6 pt-3">
          <div className="overflow-hidden rounded-[2.5rem] border-[6px] border-gum-espresso bg-gum-alabaster shadow-cardLg">
            {/* Isla dinámica */}
            <div className="relative bg-gum-espresso pb-1 pt-2">
              <div className="mx-auto h-5 w-28 rounded-full bg-black" aria-hidden />
            </div>
            <StatusBar />
            <div className="h-[min(600px,62dvh)] overflow-y-auto px-4 py-4">{screen}</div>
            {tabBar}
          </div>
        </div>
      ) : (
        <div className="mx-auto flex min-h-[calc(100dvh-52px)] w-full max-w-md flex-col bg-gum-alabaster sm:rounded-t-3xl">
          <StatusBar />
          <main className="flex-1 px-4 py-4">{screen}</main>
          <div className="sticky bottom-0">{tabBar}</div>
        </div>
      )}
    </div>
  );
}
