-- =============================================================================
-- Mi Garaje — migración 2026-09-27: reglas fijas → alertas libres
-- =============================================================================
--
-- Cómo aplicarla: Panel de Supabase → proyecto «Mi Garaje» → SQL Editor →
-- pegar todo → Run. Va en una transacción: o se aplica entera o nada.
--
-- BORRA TODOS LOS DATOS de la app (no las cuentas de usuario). Fue decisión
-- explícita del usuario: eran datos de prueba, y convertir reglas a alertas
-- en cada dispositivo habría dejado alertas duplicadas al sincronizar. La app
-- vacía su base local a la vez (Dexie v3).
--
-- Las fotos ya subidas a Storage se quedan huérfanas: Supabase no deja
-- borrarlas desde SQL. No molestan; si se quiere, se vacían desde
-- Storage → adjuntos en el panel.

begin;

-- 1. Vaciar los datos -----------------------------------------------------------

truncate table
  public.vehiculos,
  public.lecturas,
  public.mantenimientos,
  public.reglas,
  public.repostajes,
  public.gastos,
  public.documentos,
  public.adjuntos,
  public.ajustes;

-- 2. Las reglas desaparecen -------------------------------------------------------

drop table if exists public.reglas;

-- 3. Mantenimientos: título libre y alertas que cubre ------------------------------

alter table public.mantenimientos
  drop column if exists tipo,
  drop column if exists tipo_personalizado,
  drop column if exists piezas,
  add column if not exists titulo text not null default '',
  add column if not exists alerta_ids jsonb not null default '[]'::jsonb;

-- 4. Documentos: la caducidad pasa a las alertas ----------------------------------

alter table public.documentos
  drop column if exists fecha_vencimiento,
  drop column if exists aviso_dias;

-- 5. Ajustes: una antelación general en días y otra en km ---------------------------

alter table public.ajustes
  drop column if exists antelacion_mantenimiento,
  drop column if exists antelacion_documento_dias,
  add column if not exists aviso_dias integer not null default 30,
  add column if not exists aviso_km integer not null default 1000;

-- 6. Alertas ---------------------------------------------------------------------

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

create index if not exists alertas_propietario_idx on public.alertas (propietario_id, actualizado_en);
create index if not exists alertas_vehiculo_idx on public.alertas (vehiculo_id);

alter table public.alertas enable row level security;

drop policy if exists alertas_propietario on public.alertas;
create policy alertas_propietario on public.alertas
  for all
  to authenticated
  using ((select auth.uid()) = propietario_id)
  with check ((select auth.uid()) = propietario_id);

commit;
