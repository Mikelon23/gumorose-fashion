-- ============================================================
-- Gumorose Platform — Esquema PostgreSQL
-- Planta: Riobamba, Ecuador. Manufactura textil bajo demanda.
-- Tablas: raw_materials, catalog_garments, custom_designs,
--          gumorose_boxes, box_items, plant_machines
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------- Enums ----------
DO $$ BEGIN CREATE TYPE ecuador_region AS ENUM ('COSTA', 'SIERRA', 'ORIENTE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE garment_category AS ENUM ('CAMISETA', 'POLO', 'CAMISA', 'PANTALON'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE logo_zone AS ENUM ('PECHO_IZQ', 'PECHO_DER', 'CENTRO', 'ESPALDA', 'MANGA_IZQ', 'MANGA_DER'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE print_technique AS ENUM ('SERIGRAFIA', 'SUBLIMADO', 'VINIL'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE machine_kind AS ENUM ('CORTADORA', 'OVERLOCK', 'RECTA', 'RECUBRIDORA', 'OJALADORA', 'BOTONERA', 'ESTAMPADORA', 'SUBLIMADORA', 'CORTADORA_VINIL'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE machine_status AS ENUM ('ACTIVA', 'MANTENIMIENTO', 'INACTIVA'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE box_status AS ENUM ('COTIZADA', 'PAGADA', 'EN_PRODUCCION', 'ENVIADA', 'ENTREGADA', 'CANCELADA'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- Materias primas / stock de telas e insumos ----------
CREATE TABLE IF NOT EXISTS raw_materials (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku           TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('TELA', 'HILO', 'TINTA', 'VINIL', 'BOTON', 'CIERRE', 'ETIQUETA', 'EMPAQUE')),
  color         TEXT,
  unit          TEXT NOT NULL DEFAULT 'm' CHECK (unit IN ('m', 'kg', 'rollo', 'litro', 'unidad', 'caja')),
  stock_qty     NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (stock_qty >= 0),
  min_stock_qty NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (min_stock_qty >= 0),
  unit_cost_usd NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (unit_cost_usd >= 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_raw_materials_kind ON raw_materials (kind);

-- ---------- Catálogo de prendas base (CMS propio) ----------
CREATE TABLE IF NOT EXISTS catalog_garments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                  TEXT NOT NULL UNIQUE,
  name                  TEXT NOT NULL,
  category              garment_category NOT NULL,
  description           TEXT NOT NULL DEFAULT '',
  base_production_cost  NUMERIC(10, 2) NOT NULL CHECK (base_production_cost >= 0),
  base_margin_pct       NUMERIC(5, 2) NOT NULL CHECK (base_margin_pct >= 0 AND base_margin_pct < 100),
  base_sale_price       NUMERIC(10, 2) NOT NULL CHECK (base_sale_price >= 0),
  base_time_minutes     INTEGER NOT NULL CHECK (base_time_minutes > 0),
  sewing_minutes        INTEGER NOT NULL CHECK (sewing_minutes >= 0),
  finishing_minutes     INTEGER NOT NULL CHECK (finishing_minutes >= 0),
  sizes                 TEXT[] NOT NULL DEFAULT '{XS,S,M,L,XL,XXL}',
  colors                TEXT[] NOT NULL DEFAULT '{}',
  recommended_regions   ecuador_region[] NOT NULL DEFAULT '{SIERRA}',
  climate_note          TEXT NOT NULL DEFAULT '',
  image_url             TEXT,
  active                BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_catalog_garments_category ON catalog_garments (category);
CREATE INDEX IF NOT EXISTS idx_catalog_garments_active ON catalog_garments (active);

-- ---------- Diseños personalizados multi-logo ----------
CREATE TABLE IF NOT EXISTS custom_designs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  garment_id     UUID NOT NULL REFERENCES catalog_garments (id) ON DELETE RESTRICT,
  name           TEXT NOT NULL DEFAULT 'Diseño personalizado',
  customer_name  TEXT,
  customer_photo_url TEXT,
  size           TEXT NOT NULL DEFAULT 'M',
  color          TEXT NOT NULL DEFAULT 'BLANCO',
  -- Cada logo: { id, logoUrl, zone, x, y, width, height, rotation, technique }
  logos          JSONB NOT NULL DEFAULT '[]'::jsonb,
  preview_url    TEXT,
  tryon_image_url TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_custom_designs_garment ON custom_designs (garment_id);

-- ---------- Cajas Gumorose (pedidos agrupados con descuento) ----------
CREATE TABLE IF NOT EXISTS gumorose_boxes (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name      TEXT,
  region             ecuador_region NOT NULL,
  subtotal_usd       NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (subtotal_usd >= 0),
  discount_pct       NUMERIC(5, 2) NOT NULL DEFAULT 0 CHECK (discount_pct >= 0 AND discount_pct <= 100),
  discount_usd       NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (discount_usd >= 0),
  shipping_usd       NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (shipping_usd >= 0),
  total_usd          NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (total_usd >= 0),
  total_units        INTEGER NOT NULL DEFAULT 0 CHECK (total_units >= 0),
  production_minutes INTEGER NOT NULL DEFAULT 0 CHECK (production_minutes >= 0),
  delivery_days_min  INTEGER NOT NULL DEFAULT 1 CHECK (delivery_days_min >= 0),
  delivery_days_max  INTEGER NOT NULL DEFAULT 2 CHECK (delivery_days_max >= delivery_days_min),
  status             box_status NOT NULL DEFAULT 'COTIZADA',
  techpack_url       TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gumorose_boxes_status ON gumorose_boxes (status);
CREATE INDEX IF NOT EXISTS idx_gumorose_boxes_region ON gumorose_boxes (region);

-- ---------- Ítems de cada caja ----------
CREATE TABLE IF NOT EXISTS box_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id           UUID NOT NULL REFERENCES gumorose_boxes (id) ON DELETE CASCADE,
  design_id        UUID NOT NULL REFERENCES custom_designs (id) ON DELETE RESTRICT,
  quantity         INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_usd   NUMERIC(10, 2) NOT NULL CHECK (unit_price_usd >= 0),
  line_total_usd   NUMERIC(10, 2) NOT NULL CHECK (line_total_usd >= 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_box_items_box ON box_items (box_id);

-- ---------- Máquinas de la planta Riobamba ----------
CREATE TABLE IF NOT EXISTS plant_machines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            TEXT NOT NULL UNIQUE,
  kind            machine_kind NOT NULL,
  status          machine_status NOT NULL DEFAULT 'ACTIVA',
  queue_minutes   INTEGER NOT NULL DEFAULT 0 CHECK (queue_minutes >= 0),
  last_service_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_plant_machines_kind ON plant_machines (kind);
CREATE INDEX IF NOT EXISTS idx_plant_machines_status ON plant_machines (status);

-- ============================================================
-- Clóset Virtual Móvil (Fase 1 Delta)
-- ============================================================
DO $$ BEGIN CREATE TYPE closet_category AS ENUM ('SUPERIOR_CAMISETA', 'SUPERIOR_CAMISA', 'INFERIOR_PANTALON', 'ABRIGO', 'ACCESORIO'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE closet_source_type AS ENUM ('FOTO_PROPIA', 'COMPRADO_GUMOROSE', 'DISENO_CUSTOM'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE warmth_level AS ENUM ('FRESCO', 'TEMPLADO', 'CALIDO'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE outfit_author AS ENUM ('USER', 'AI_AGENT'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- Perfiles de usuario (retrato cuerpo completo + región) ----------
CREATE TABLE IF NOT EXISTS user_profiles (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_body_photo_url       TEXT,
  body_segmentation_mask_url TEXT,
  current_region            ecuador_region NOT NULL DEFAULT 'SIERRA',
  city                      TEXT NOT NULL DEFAULT 'Riobamba',
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Prendas guardadas en el clóset del usuario ----------
CREATE TABLE IF NOT EXISTS user_closet_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES user_profiles (id) ON DELETE CASCADE,
  category         closet_category NOT NULL,
  source_type      closet_source_type NOT NULL,
  garment_id       UUID REFERENCES catalog_garments (id) ON DELETE SET NULL,
  design_id        UUID REFERENCES custom_designs (id) ON DELETE SET NULL,
  name             TEXT NOT NULL DEFAULT 'Prenda de clóset',
  image_cutout_url TEXT,
  color_hex        TEXT NOT NULL DEFAULT '#FFFFFF' CHECK (color_hex ~ '^#[0-9A-Fa-f]{6}$'),
  warmth_level     warmth_level NOT NULL DEFAULT 'TEMPLADO',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_closet_items_user ON user_closet_items (user_id);
CREATE INDEX IF NOT EXISTS idx_closet_items_category ON user_closet_items (category);

-- ---------- Combinaciones (outfits) de usuario o del Agente IA ----------
CREATE TABLE IF NOT EXISTS closet_outfits (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID NOT NULL REFERENCES user_profiles (id) ON DELETE CASCADE,
  items_ids                UUID[] NOT NULL DEFAULT '{}',
  region_context           ecuador_region NOT NULL,
  weather_temp_c           NUMERIC(5, 2) NOT NULL,
  ai_stylist_notes         TEXT NOT NULL DEFAULT '',
  tryon_composite_photo_url TEXT,
  created_by               outfit_author NOT NULL DEFAULT 'USER',
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_closet_outfits_user ON closet_outfits (user_id);

-- ============================================================
-- Diagrama 1 — Roles, etapas de planta y ERP (aditivo, retrocompatible)
-- ============================================================

DO $$ BEGIN CREATE TYPE user_role AS ENUM ('SUPER_ADMIN', 'ADMIN_GERENCIA', 'ADMIN_BODEGA', 'ADMIN_PLANTA', 'CLIENTE_B2C', 'CLIENTE_B2B'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE plant_stage AS ENUM ('1_DISENO_ARTE', '2_MATERIA_PRIMA', '3_PATRONAJE', '4_CORTE', '5_TIQUETEADO', '6_COSTURA_ARMADO', '7_ESTAMPADO_SUBLIMADO', '8_CONTROL_CALIDAD', '9_SELLO_AZUL', '10_PLANCHADO_ETIQUETADO_INEN', '11_EMPAQUE_DESPACHO'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE payment_mode AS ENUM ('CONTADO_100', 'ANTICIPO_50_50'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE quality_check_status AS ENUM ('PENDIENTE', 'APROBADO_SELLO_AZUL', 'REPROCESO_COSTURA'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE erp_webhook_event_type AS ENUM ('ORDER_PAID_CHECKOUT', 'ORDER_STAGE_11_COMPLETED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE purchase_alert_status AS ENUM ('ACTIVA', 'RESUELTA'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Nuevo estado visual de caja fijado por la etapa 11 (DESPACHADO).
DO $$ BEGIN ALTER TYPE box_status ADD VALUE IF NOT EXISTS 'DESPACHADO'; EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL; END $$;

-- ---------- Usuarios del sistema (6 roles oficiales) ----------
CREATE TABLE IF NOT EXISTS system_users (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  email        TEXT NOT NULL UNIQUE,
  role         user_role NOT NULL,
  company_name TEXT,
  ruc          TEXT,
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_system_users_role ON system_users (role);
CREATE INDEX IF NOT EXISTS idx_system_users_email ON system_users (email);

-- ---------- Órdenes oficiales de producción (OP-XXXX, 11 etapas) ----------
CREATE TABLE IF NOT EXISTS erp_production_orders (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_code             TEXT NOT NULL UNIQUE,
  box_id                 UUID NOT NULL REFERENCES gumorose_boxes (id) ON DELETE CASCADE,
  buyer_user_id          UUID REFERENCES user_profiles (id) ON DELETE SET NULL,
  customer_role          user_role NOT NULL,
  payment_mode           payment_mode NOT NULL DEFAULT 'CONTADO_100',
  total_usd              NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (total_usd >= 0),
  amount_paid_usd        NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (amount_paid_usd >= 0),
  balance_due_usd        NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (balance_due_usd >= 0),
  current_stage          plant_stage NOT NULL DEFAULT '1_DISENO_ARTE',
  quality_check_status   quality_check_status NOT NULL DEFAULT 'PENDIENTE',
  blue_seal_applied      BOOLEAN NOT NULL DEFAULT FALSE,
  fabric_meters_deducted NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (fabric_meters_deducted >= 0),
  stage_history          JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_erp_orders_box ON erp_production_orders (box_id);
CREATE INDEX IF NOT EXISTS idx_erp_orders_stage ON erp_production_orders (current_stage);

-- ---------- Libro financiero (un asiento por orden pagada) ----------
CREATE TABLE IF NOT EXISTS financial_ledger_entries (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id              UUID NOT NULL REFERENCES erp_production_orders (id) ON DELETE CASCADE,
  order_code            TEXT NOT NULL,
  box_id                UUID NOT NULL REFERENCES gumorose_boxes (id) ON DELETE CASCADE,
  payment_mode          payment_mode NOT NULL DEFAULT 'CONTADO_100',
  gross_revenue_usd     NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (gross_revenue_usd >= 0),
  mpd_cost_usd          NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (mpd_cost_usd >= 0),
  mod_cost_usd          NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (mod_cost_usd >= 0),
  cif_cost_usd          NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (cif_cost_usd >= 0),
  operating_profit_usd  NUMERIC(10, 2) NOT NULL DEFAULT 0,
  margin_pct            NUMERIC(5, 2) NOT NULL DEFAULT 30,
  cash_collected_usd    NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (cash_collected_usd >= 0),
  receivable_usd        NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (receivable_usd >= 0),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ledger_order ON financial_ledger_entries (order_id);
CREATE INDEX IF NOT EXISTS idx_ledger_box ON financial_ledger_entries (box_id);

-- ---------- Alertas de compra hacia Neymatex Guano ----------
CREATE TABLE IF NOT EXISTS supply_purchase_alerts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id       UUID NOT NULL REFERENCES raw_materials (id) ON DELETE CASCADE,
  sku               TEXT NOT NULL,
  material_name     TEXT NOT NULL,
  supplier          TEXT NOT NULL DEFAULT 'Neymatex Guano',
  current_stock_qty NUMERIC(12, 2) NOT NULL DEFAULT 0,
  min_stock_qty     NUMERIC(12, 2) NOT NULL DEFAULT 0,
  requested_qty     NUMERIC(12, 2) NOT NULL DEFAULT 0,
  status            purchase_alert_status NOT NULL DEFAULT 'ACTIVA',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_supply_alerts_status ON supply_purchase_alerts (status);
