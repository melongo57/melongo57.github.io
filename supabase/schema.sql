-- =============================================================================
-- Mi Garaje — esquema de sincronización en Supabase
-- =============================================================================
--
-- ESTE ESQUEMA YA ESTÁ APLICADO en el proyecto «Mi Garaje»
-- (hnaaogdvjfxulyxtlinb, organización melongo57, región eu-central-1).
-- Se conserva aquí como documentación y para poder recrear el proyecto desde
-- cero: Panel de Supabase → SQL Editor → pegar todo → Run. Es idempotente.
--
-- Refleja el estado DESPUÉS de las migraciones de `supabase/migraciones/`.
-- En un proyecto que ya existía se aplican esas, no este archivo.
--
-- QUÉ HACE
--  1. Crea una tabla por entidad del dominio, con las mismas columnas que ya
--     tiene IndexedDB (traducidas a snake_case), más `propietario_id`.
--  2. Activa Row Level Security en todas: cada fila solo la ve y la toca su
--     dueño (auth.uid() = propietario_id). Sin esto, cualquiera con la URL del
--     proyecto podría leer o escribir los datos de cualquiera.
--  3. Crea el cubo de Storage para las fotos, con la misma regla de acceso.
--
-- POR QUÉ RLS Y NO UN BACKEND HECHO A MANO
-- Supabase expone la base de datos directamente al cliente (PostgREST). Sin
-- políticas de fila, el «anon key» —que es público y va embebido en el
-- código— podría leer la tabla entera de cualquier usuario. Con RLS, esa
-- misma clave solo devuelve las filas del usuario autenticado: la seguridad
-- vive en la base de datos, no en un servidor intermedio que habría que
-- mantener.
--
-- BORRADO LÓGICO, NO FÍSICO
-- Las filas nunca se borran de verdad desde el cliente: se les pone
-- `borrado_en`. Es lo que permite que un borrado hecho en el móvil se
-- propague al ordenador la próxima vez que sincroniza: si se borrara de
-- verdad, no habría nada que decir «esto se borró en tal fecha», y el
-- ordenador no tendría forma de saber que tiene que borrarlo también.

-- -----------------------------------------------------------------------------
-- Vehículos
-- -----------------------------------------------------------------------------

create table if not exists public.vehiculos (
  id                   uuid primary key,
  propietario_id       uuid not null references auth.users (id) on delete cascade,
  creado_en            timestamptz not null default now(),
  actualizado_en       timestamptz not null default now(),
  borrado_en           timestamptz,

  alias                text not null,
  categoria            text not null,
  marca                text not null,
  modelo               text not null,
  version              text,
  matricula            text not null,
  anio                 integer not null,
  combustible          text not null,

  fecha_compra         date,
  km_compra            integer,
  precio_compra_centimos integer,

  bastidor             text,
  foto_adjunto_id      uuid,
  notas                text,

  estado               text not null,
  fecha_venta          date,
  km_venta             integer,
  precio_venta_centimos integer,

  orden                integer not null default 0
);

comment on table public.vehiculos is 'Un vehículo por fila. Ver src/dominio/tipos.ts → Vehiculo.';

-- -----------------------------------------------------------------------------
-- Lecturas de odómetro
-- -----------------------------------------------------------------------------

create table if not exists public.lecturas (
  id                   uuid primary key,
  propietario_id       uuid not null references auth.users (id) on delete cascade,
  creado_en            timestamptz not null default now(),
  actualizado_en       timestamptz not null default now(),
  borrado_en           timestamptz,

  vehiculo_id          uuid not null,
  fecha                date not null,
  km                   integer not null,
  origen               text not null,
  notas                text
);

-- -----------------------------------------------------------------------------
-- Alertas y mantenimientos (servicios hechos)
-- -----------------------------------------------------------------------------
-- Una alerta es algo que hay que repetir: vence cada X km, cada Y meses o en
-- una fecha fija, y guarda su propia «última vez». Un mantenimiento puede
-- cubrir varias alertas a la vez (`alerta_ids`).

create table if not exists public.alertas (
  id                   uuid primary key,
  propietario_id       uuid not null references auth.users (id) on delete cascade,
  creado_en            timestamptz not null default now(),
  actualizado_en       timestamptz not null default now(),
  borrado_en           timestamptz,

  vehiculo_id          uuid not null,
  nombre               text not null,
  icono                text not null,
  cada_km              integer,
  cada_meses           integer,
  vence_el             date,
  ultima_fecha         date,
  ultimo_km            integer,
  aviso_dias           integer,
  aviso_km             integer,
  apunte               text not null,
  notas                text
);

create table if not exists public.mantenimientos (
  id                   uuid primary key,
  propietario_id       uuid not null references auth.users (id) on delete cascade,
  creado_en            timestamptz not null default now(),
  actualizado_en       timestamptz not null default now(),
  borrado_en           timestamptz,

  vehiculo_id          uuid not null,
  titulo               text not null default '',
  alerta_ids           jsonb not null default '[]'::jsonb,
  fecha                date not null,
  km                   integer,
  taller               text,
  coste_centimos       integer not null,
  notas                text,
  adjunto_ids          jsonb not null default '[]'::jsonb
);

-- -----------------------------------------------------------------------------
-- Repostajes
-- -----------------------------------------------------------------------------

create table if not exists public.repostajes (
  id                   uuid primary key,
  propietario_id       uuid not null references auth.users (id) on delete cascade,
  creado_en            timestamptz not null default now(),
  actualizado_en       timestamptz not null default now(),
  borrado_en           timestamptz,

  vehiculo_id          uuid not null,
  fecha                date not null,
  cantidad             numeric not null,
  unidad               text not null,
  importe_centimos     integer not null,
  km                   integer,
  deposito_lleno       boolean not null default true,
  ruptura_serie        boolean not null default false,
  estacion             text,
  notas                text,
  adjunto_ids          jsonb not null default '[]'::jsonb
);

-- -----------------------------------------------------------------------------
-- Gastos
-- -----------------------------------------------------------------------------

create table if not exists public.gastos (
  id                   uuid primary key,
  propietario_id       uuid not null references auth.users (id) on delete cascade,
  creado_en            timestamptz not null default now(),
  actualizado_en       timestamptz not null default now(),
  borrado_en           timestamptz,

  vehiculo_id          uuid not null,
  categoria            text not null,
  descripcion          text,
  importe_centimos     integer not null,
  fecha                date not null,
  recurrente           boolean not null default false,
  periodicidad         text,
  km                   integer,
  notas                text,
  adjunto_ids          jsonb not null default '[]'::jsonb
);

-- -----------------------------------------------------------------------------
-- Documentos
-- -----------------------------------------------------------------------------
-- `Documento` es una unión discriminada (seguro | itv | genérico) en el
-- dominio. En vez de una tabla ancha con una columna por cada campo posible de
-- cada variante —la mitad siempre a NULL—, los campos propios de la variante
-- van en `detalle` (jsonb): {compania, poliza, cobertura, ...} para el seguro,
-- {estacion, resultado} para la ITV, {titulo} para el resto. Los campos
-- comunes a las tres siguen siendo columnas normales.

create table if not exists public.documentos (
  id                   uuid primary key,
  propietario_id       uuid not null references auth.users (id) on delete cascade,
  creado_en            timestamptz not null default now(),
  actualizado_en       timestamptz not null default now(),
  borrado_en           timestamptz,

  vehiculo_id          uuid not null,
  tipo                 text not null,
  fecha_emision        date,
  notas                text,
  adjunto_ids          jsonb not null default '[]'::jsonb,
  detalle              jsonb not null default '{}'::jsonb
);

-- -----------------------------------------------------------------------------
-- Adjuntos (metadatos; el archivo en sí vive en Storage)
-- -----------------------------------------------------------------------------
-- La foto NO se guarda en esta tabla. Guardar binarios en columnas de Postgres
-- gastaría en minutos los 500 MB del plan gratuito; Storage tiene su propio
-- límite y sirve los archivos por CDN. La ruta del objeto es siempre
-- `{propietario_id}/{id}`.

create table if not exists public.adjuntos (
  id                   uuid primary key,
  propietario_id       uuid not null references auth.users (id) on delete cascade,
  creado_en            timestamptz not null default now(),
  actualizado_en       timestamptz not null default now(),
  borrado_en           timestamptz,

  nombre               text not null,
  mime                 text not null,
  bytes                integer not null,
  ancho                integer,
  alto                 integer
);

-- -----------------------------------------------------------------------------
-- Ajustes (una fila por usuario)
-- -----------------------------------------------------------------------------

create table if not exists public.ajustes (
  propietario_id       uuid primary key references auth.users (id) on delete cascade,
  actualizado_en       timestamptz not null default now(),

  tema                 text not null default 'sistema',
  vehiculo_por_defecto_id uuid,
  aviso_dias           integer not null default 30,
  aviso_km             integer not null default 1000,
  notificaciones_activadas boolean not null default false,
  ultima_revision_avisos timestamptz,
  ultima_copia_en      timestamptz
);

-- =============================================================================
-- Índices
-- =============================================================================
-- Todo se filtra siempre por propietario_id primero (RLS lo añade a cada
-- consulta), y casi todo lo demás por vehiculo_id o por fecha de
-- modificación (para el pull incremental de la sincronización).

create index if not exists vehiculos_propietario_idx on public.vehiculos (propietario_id, actualizado_en);
create index if not exists lecturas_propietario_idx on public.lecturas (propietario_id, actualizado_en);
create index if not exists lecturas_vehiculo_idx on public.lecturas (vehiculo_id);
create index if not exists mantenimientos_propietario_idx on public.mantenimientos (propietario_id, actualizado_en);
create index if not exists mantenimientos_vehiculo_idx on public.mantenimientos (vehiculo_id);
create index if not exists alertas_propietario_idx on public.alertas (propietario_id, actualizado_en);
create index if not exists alertas_vehiculo_idx on public.alertas (vehiculo_id);
create index if not exists repostajes_propietario_idx on public.repostajes (propietario_id, actualizado_en);
create index if not exists repostajes_vehiculo_idx on public.repostajes (vehiculo_id);
create index if not exists gastos_propietario_idx on public.gastos (propietario_id, actualizado_en);
create index if not exists gastos_vehiculo_idx on public.gastos (vehiculo_id);
create index if not exists documentos_propietario_idx on public.documentos (propietario_id, actualizado_en);
create index if not exists documentos_vehiculo_idx on public.documentos (vehiculo_id);
create index if not exists adjuntos_propietario_idx on public.adjuntos (propietario_id, actualizado_en);

-- =============================================================================
-- Row Level Security
-- =============================================================================
-- Misma política en las ocho tablas con propietario_id: solo el dueño puede
-- ver o tocar sus filas. `ajustes` usa propietario_id como clave primaria, así
-- que la política es equivalente pero comparando esa columna directamente.

do $$
declare
  tabla text;
begin
  foreach tabla in array array[
    'vehiculos', 'lecturas', 'mantenimientos', 'alertas',
    'repostajes', 'gastos', 'documentos', 'adjuntos'
  ]
  loop
    execute format('alter table public.%I enable row level security', tabla);

    execute format(
      'drop policy if exists %I on public.%I',
      tabla || '_propietario', tabla
    );
      -- `to authenticated`: sin sesión no se ve nada, ni una tabla vacía.
    -- `(select auth.uid())` en vez de `auth.uid()` a secas: así Postgres lo
    -- evalúa una vez por consulta en lugar de una vez por fila.
    execute format(
      'create policy %I on public.%I for all to authenticated using ((select auth.uid()) = propietario_id) with check ((select auth.uid()) = propietario_id)',
      tabla || '_propietario', tabla
    );
  end loop;
end $$;

alter table public.ajustes enable row level security;

drop policy if exists ajustes_propietario on public.ajustes;
create policy ajustes_propietario on public.ajustes
  for all
  to authenticated
  using ((select auth.uid()) = propietario_id)
  with check ((select auth.uid()) = propietario_id);

-- =============================================================================
-- Storage: cubo de adjuntos
-- =============================================================================
-- Cada archivo se sube a la ruta `{uid}/{adjunto_id}`. La política comprueba
-- que el primer segmento de la ruta coincida con el usuario autenticado, que
-- es la forma estándar de aislar carpetas por usuario en un cubo compartido.

insert into storage.buckets (id, name, public)
values ('adjuntos', 'adjuntos', false)
on conflict (id) do nothing;

drop policy if exists adjuntos_storage_propietario on storage.objects;
create policy adjuntos_storage_propietario on storage.objects
  for all
  to authenticated
  using (bucket_id = 'adjuntos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'adjuntos' and (storage.foldername(name))[1] = (select auth.uid())::text);
