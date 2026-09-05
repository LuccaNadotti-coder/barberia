-- ═══════════════════════════════════════════════════════════════════════════════
--  BARBERÍA — ESQUEMA DE BASE DE DATOS
--  Fase 1 · Postgres 15+ / Supabase · Zona de negocio: America/Lima (UTC-5 fijo)
-- ═══════════════════════════════════════════════════════════════════════════════
--
--  DECISIONES QUE NO SE DEBEN REVERTIR (ver CLAUDE.md para el detalle):
--
--  1. El anti-solape es EXCLUDE USING gist, NO un UNIQUE(barbero_id, inicio).
--     Los servicios duran distinto (30 min, 50 min…). Un UNIQUE sobre el
--     instante de inicio deja pasar el solape parcial:
--         cita A  16:00 → 16:50   (corte + barba)
--         cita B  16:30 → 17:00   (corte simple)
--     Inicios distintos ⇒ el UNIQUE no se entera. Se pisan media hora.
--     El operador && sobre tstzrange sí lo detecta, y lo hace dentro del motor,
--     de forma atómica, sin importar cuántas peticiones concurrentes lleguen.
--
--  2. El precio se CONGELA en la cita al momento de reservar. Nunca se lee el
--     catálogo en vivo para una cita ya creada: si mañana sube el precio, la
--     cita de ayer no cambia.
--
--  3. El precio JAMÁS viene del cliente. crear_reserva() lo lee de `servicios`.
--
--  4. La confirmación es MANUAL. Ninguna función pasa una cita a 'confirmada'
--     automáticamente al recibir la imagen: una captura es falsificable, el tap
--     del barbero es la validación real.
--
--  5. El ledger `pagos` es INMUTABLE. Sin UPDATE ni DELETE — ni por RLS ni por
--     service_role (hay un trigger que lo bloquea, porque service_role ignora
--     RLS). Un error se corrige insertando una fila de tipo 'reembolso'.
--
--  Dinero: SIEMPRE en céntimos de sol (integer). Nada de float.
--  Orden de ejecución: este archivo es idempotente y se corre completo.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────────
--  1 · EXTENSIONES
-- ───────────────────────────────────────────────────────────────────────────────

-- btree_gist es OBLIGATORIA: permite mezclar en un mismo índice GiST un operador
-- de igualdad sobre un tipo escalar (barbero_id uuid WITH =) con un operador de
-- solape sobre un rango (rango WITH &&). Sin ella el EXCLUDE no se puede crear.
create extension if not exists btree_gist;

-- pgcrypto NO es necesaria para este esquema, pero suele estar ya instalada.
--
-- OJO: en Supabase vive en el esquema `extensions`, no en `public`. Por eso
-- ninguna función de aquí depende de ella: gen_random_bytes() no se encuentra
-- desde un SECURITY DEFINER con `search_path = public, pg_temp`, y el fallo
-- sólo aparece contra Supabase (en un Postgres normal se instala en public y
-- todo parece funcionar). La aleatoriedad se saca de gen_random_uuid(), que es
-- INTEGRADA en pg_catalog desde Postgres 13 y siempre está a mano.
create extension if not exists pgcrypto;


-- ───────────────────────────────────────────────────────────────────────────────
--  2 · TIPOS
-- ───────────────────────────────────────────────────────────────────────────────

do $$ begin
  create type estado_cita as enum (
    'pendiente_pago',  -- creada, esperando la captura. Tiene expira_en.
    'en_revision',     -- captura subida, esperando el tap del barbero.
    'confirmada',      -- el barbero validó el adelanto.
    'atendida',        -- el cliente vino y se le cobró el saldo.
    'no_show',         -- no vino. El adelanto queda como ingreso.
    'liberada',        -- venció el plazo de 15 min sin captura. Slot libre.
    'cancelada'        -- cancelada manualmente. Slot libre.
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type tipo_pago as enum ('adelanto', 'saldo', 'reembolso');
exception when duplicate_object then null; end $$;

do $$ begin
  create type metodo_pago as enum ('yape', 'plin', 'efectivo', 'transferencia', 'otro');
exception when duplicate_object then null; end $$;

do $$ begin
  create type canal_notificacion as enum ('email', 'whatsapp');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tipo_notificacion as enum (
    'pre_reserva', 'confirmacion', 'recordatorio', 'rechazo', 'liberada', 'cancelada'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type estado_notificacion as enum ('pendiente', 'enviado', 'fallido');
exception when duplicate_object then null; end $$;


-- ───────────────────────────────────────────────────────────────────────────────
--  3 · TABLAS
-- ───────────────────────────────────────────────────────────────────────────────

-- 3.1 · SERVICIOS ─ el catálogo. Única fuente de verdad para precios.
create table if not exists public.servicios (
  id                uuid primary key default gen_random_uuid(),
  nombre            text        not null,
  descripcion       text,
  duracion_min      integer     not null check (duracion_min between 5 and 480),
  precio_centimos   integer     not null check (precio_centimos >= 0),
  -- Porcentaje de adelanto, configurable POR SERVICIO. Por defecto 50 %.
  adelanto_pct      smallint    not null default 50 check (adelanto_pct between 1 and 100),
  activo            boolean     not null default true,
  orden             smallint    not null default 0,
  creado_en         timestamptz not null default now(),
  actualizado_en    timestamptz not null default now(),
  -- Único para que las semillas sean idempotentes (y para no tener dos
  -- «Corte clásico» con precios distintos en el catálogo).
  constraint servicios_nombre_unico unique (nombre)
);
comment on column public.servicios.precio_centimos is 'Céntimos de sol. 3500 = S/ 35.00';
comment on column public.servicios.adelanto_pct   is 'Porcentaje del precio que se pide como adelanto por Yape.';

-- 3.2 · BARBEROS ─ ligados a un usuario de Supabase Auth.
create table if not exists public.barberos (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid unique references auth.users(id) on delete set null,
  nombre         text        not null,
  telefono       text        check (telefono ~ '^51[0-9]{9}$'),   -- E.164 sin '+'
  yape_numero    text        check (yape_numero ~ '^9[0-9]{8}$'), -- 9 dígitos, como se ve en la app
  yape_titular   text,
  avatar_url     text,
  es_admin       boolean     not null default false,
  activo         boolean     not null default true,
  orden          smallint    not null default 0,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint barberos_nombre_unico unique (nombre)
);
comment on column public.barberos.telefono    is 'Del barbero, para los enlaces wa.me. NUNCA se expone al público.';
comment on column public.barberos.yape_numero is 'Destino del adelanto. Se entrega solo dentro de la respuesta de crear_reserva().';

-- 3.3 · HORARIOS ─ jornada recurrente semanal.
--       dia_semana sigue la convención de EXTRACT(dow): 0 = domingo … 6 = sábado.
create table if not exists public.horarios (
  id          uuid primary key default gen_random_uuid(),
  barbero_id  uuid     not null references public.barberos(id) on delete cascade,
  dia_semana  smallint not null check (dia_semana between 0 and 6),
  hora_inicio time     not null,
  hora_fin    time     not null,
  activo      boolean  not null default true,
  creado_en   timestamptz not null default now(),
  constraint horarios_ventana_valida check (hora_fin > hora_inicio),
  constraint horarios_sin_duplicado  unique (barbero_id, dia_semana, hora_inicio)
);
comment on table public.horarios is 'Hora local de Lima. La conversión a timestamptz la hace horarios_disponibles().';

-- 3.4 · BLOQUEOS ─ vacaciones, feriados, ausencias puntuales.
--       barbero_id NULL = bloqueo global (feriado para toda la barbería).
create table if not exists public.bloqueos (
  id         uuid primary key default gen_random_uuid(),
  barbero_id uuid references public.barberos(id) on delete cascade,
  inicio     timestamptz not null,
  fin        timestamptz not null,
  motivo     text,
  creado_en  timestamptz not null default now(),
  rango      tstzrange generated always as (tstzrange(inicio, fin, '[)')) stored,
  constraint bloqueos_rango_valido check (fin > inicio)
);

-- 3.5 · CLIENTES ─ el teléfono es la identidad (no hay login de cliente).
create table if not exists public.clientes (
  id             uuid primary key default gen_random_uuid(),
  nombre         text        not null check (length(btrim(nombre)) between 2 and 80),
  telefono       text        not null unique check (telefono ~ '^51[0-9]{9}$'),
  email          text        check (email is null or email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-zA-Z]{2,}$'),
  notas          text,        -- notas internas del barbero
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

-- 3.6 · CITAS ─ el corazón del sistema.
create table if not exists public.citas (
  id          uuid primary key default gen_random_uuid(),
  codigo      text not null unique,          -- BR-XXXXX, lo que el cliente ve y comparte

  cliente_id  uuid not null references public.clientes(id)  on delete restrict,
  barbero_id  uuid not null references public.barberos(id)  on delete restrict,
  servicio_id uuid not null references public.servicios(id) on delete restrict,

  -- ── DATOS CONGELADOS ────────────────────────────────────────────────────────
  -- Copiados de `servicios` en el instante de reservar. Si el catálogo cambia
  -- mañana, esta cita conserva lo que se pactó. Nunca hacer JOIN a servicios
  -- para mostrar el precio de una cita ya creada.
  servicio_nombre    text    not null,
  duracion_min       integer not null check (duracion_min > 0),
  precio_centimos    integer not null check (precio_centimos >= 0),
  adelanto_centimos  integer not null check (adelanto_centimos >= 0),
  -- ────────────────────────────────────────────────────────────────────────────

  inicio timestamptz not null,
  fin    timestamptz not null,
  -- Columna generada: la usa el índice GiST del EXCLUDE. '[)' = inicio incluido,
  -- fin excluido, así una cita 16:00-16:30 y otra 16:30-17:00 NO se consideran
  -- solapadas (se tocan, no se pisan).
  rango  tstzrange generated always as (tstzrange(inicio, fin, '[)')) stored,

  estado    estado_cita not null default 'pendiente_pago',
  expira_en timestamptz,   -- solo mientras está en 'pendiente_pago'

  captura_path       text,          -- clave del objeto en R2 (bucket privado)
  captura_subida_en  timestamptz,

  confirmada_en   timestamptz,
  confirmada_por  uuid references public.barberos(id) on delete set null,
  cerrada_en      timestamptz,      -- momento del tap 'atendida' / 'no_show'
  cancelada_en    timestamptz,
  motivo_rechazo  text,

  recordatorio_email_en timestamptz, -- sello del cron: evita recordatorios duplicados

  notas          text,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),

  constraint citas_rango_valido      check (fin > inicio),
  constraint citas_adelanto_coherente check (adelanto_centimos <= precio_centimos),

  -- ═══ LA RESTRICCIÓN MÁS IMPORTANTE DEL PROYECTO ═══════════════════════════
  -- Dos citas del MISMO barbero no pueden solaparse mientras estén vivas.
  -- El WHERE deja fuera 'liberada' y 'cancelada': esos slots vuelven al pool.
  -- 'en_revision' SÍ retiene el slot (ya pagó, está esperando el tap).
  constraint citas_sin_solape exclude using gist (
    barbero_id with =,
    rango      with &&
  ) where (estado in ('pendiente_pago','en_revision','confirmada','atendida'))
  -- ═════════════════════════════════════════════════════════════════════════
);

create index if not exists citas_barbero_inicio_idx on public.citas (barbero_id, inicio);
create index if not exists citas_estado_inicio_idx  on public.citas (estado, inicio);
-- Índice parcial para el cron de liberación: solo mira las que pueden vencer.
create index if not exists citas_vencibles_idx      on public.citas (expira_en)
  where estado = 'pendiente_pago';
create index if not exists citas_cliente_idx        on public.citas (cliente_id);
create index if not exists citas_codigo_idx         on public.citas (codigo);

-- 3.7 · PAGOS ─ ledger contable append-only.
create table if not exists public.pagos (
  id              uuid primary key default gen_random_uuid(),
  cita_id         uuid not null references public.citas(id) on delete restrict,
  tipo            tipo_pago   not null,
  -- Con signo: los reembolsos son negativos, así SUM() da el neto directamente.
  monto_centimos  integer     not null check (monto_centimos <> 0),
  metodo          metodo_pago not null default 'yape',
  referencia      text,        -- nº de operación de Yape / voucher
  registrado_por  uuid references public.barberos(id) on delete set null,
  nota            text,
  creado_en       timestamptz not null default now(),
  constraint pagos_signo_coherente check (
    (tipo = 'reembolso' and monto_centimos < 0) or
    (tipo <> 'reembolso' and monto_centimos > 0)
  )
);
create index if not exists pagos_cita_idx  on public.pagos (cita_id);
create index if not exists pagos_fecha_idx on public.pagos (creado_en);

comment on table public.pagos is
  'LEDGER INMUTABLE. Sin UPDATE ni DELETE. Un error se corrige con una fila nueva de tipo reembolso (monto negativo).';

-- 3.8 · NOTIFICACIONES ─ bitácora de lo enviado (correo automático, WhatsApp manual).
create table if not exists public.notificaciones (
  id           uuid primary key default gen_random_uuid(),
  cita_id      uuid references public.citas(id) on delete cascade,
  canal        canal_notificacion  not null,
  tipo         tipo_notificacion   not null,
  destino      text,                -- email o 51XXXXXXXXX
  estado       estado_notificacion not null default 'pendiente',
  proveedor_id text,                -- id que devuelve Resend
  error        text,
  creado_en    timestamptz not null default now()
);
create index if not exists notificaciones_cita_idx on public.notificaciones (cita_id, tipo);

comment on column public.notificaciones.canal is
  'Las filas con canal=whatsapp son un registro de que el barbero abrió el enlace wa.me. NO hay envío por API — es semiautomático a propósito.';

-- 3.9 · AUDITORÍA ─ rastro de cambios en citas y pagos.
create table if not exists public.auditoria (
  id              bigint generated always as identity primary key,
  tabla           text not null,
  registro_id     uuid,
  accion          text not null,     -- INSERT | UPDATE | DELETE
  estado_anterior jsonb,
  estado_nuevo    jsonb,
  actor           uuid,              -- auth.uid() cuando hay sesión
  creado_en       timestamptz not null default now()
);
create index if not exists auditoria_registro_idx on public.auditoria (tabla, registro_id, creado_en desc);


-- ───────────────────────────────────────────────────────────────────────────────
--  4 · VISTA PÚBLICA DE BARBEROS
--      Lo único que el anónimo puede saber de un barbero. Sin teléfono, sin
--      user_id, sin Yape. security_invoker = false ⇒ la vista corre con los
--      privilegios de su dueño y por eso puede leer `barberos` pese al RLS.
-- ───────────────────────────────────────────────────────────────────────────────

drop view if exists public.barberos_publicos;
create view public.barberos_publicos
  with (security_invoker = false) as
  select b.id, b.nombre, b.avatar_url, b.orden
  from public.barberos b
  where b.activo;


-- ───────────────────────────────────────────────────────────────────────────────
--  5 · UTILIDADES INTERNAS
-- ───────────────────────────────────────────────────────────────────────────────

-- Estados que ocupan el slot. Debe coincidir con el WHERE del EXCLUDE.
create or replace function public.estados_vivos()
returns estado_cita[] language sql immutable parallel safe as $$
  select array['pendiente_pago','en_revision','confirmada','atendida']::estado_cita[];
$$;

-- ¿Quién está pidiendo? Devuelve el id de barbero de la sesión actual.
create or replace function public.barbero_actual()
returns uuid language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select b.id from public.barberos b where b.user_id = auth.uid() and b.activo limit 1;
$$;

create or replace function public.es_barbero()
returns boolean language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select exists (select 1 from public.barberos b where b.user_id = auth.uid() and b.activo);
$$;

-- El dueño. Ve todas las citas, no solo las suyas.
create or replace function public.es_admin()
returns boolean language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select exists (
    select 1 from public.barberos b
    where b.user_id = auth.uid() and b.activo and b.es_admin
  );
$$;

-- Código corto legible: BR-XXXXX. Alfabeto sin 0/O/1/I/L para que nadie lo
-- dicte mal por teléfono.
--
-- La entropía sale de gen_random_uuid() (pg_catalog, criptográficamente
-- fuerte) pasada por md5 para obtener 16 bytes. Todo lo que se usa aquí
-- —md5, decode, get_byte— es de pg_catalog: la función no depende de ninguna
-- extensión y por tanto funciona igual en Supabase que en un Postgres pelado.
create or replace function public.generar_codigo()
returns text language plpgsql volatile
set search_path = pg_catalog, public, pg_temp as $$
declare
  v_alfabeto constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  v_bytes    bytea := decode(md5(gen_random_uuid()::text), 'hex');
  v_codigo   text := '';
  i int;
begin
  for i in 0..4 loop
    v_codigo := v_codigo || substr(v_alfabeto, 1 + (get_byte(v_bytes, i) % length(v_alfabeto)), 1);
  end loop;
  return 'BR-' || v_codigo;
end $$;

-- ¿El intervalo cae dentro de una jornada del barbero y fuera de todo bloqueo?
-- No mira otras citas: de eso se encarga el EXCLUDE, de forma atómica.
create or replace function public.slot_dentro_de_jornada(
  p_barbero_id uuid,
  p_inicio     timestamptz,
  p_fin        timestamptz
) returns boolean language sql stable security definer set search_path = public, extensions, pg_temp as $$
  with local as (
    select (p_inicio at time zone 'America/Lima') as li,
           (p_fin    at time zone 'America/Lima') as lf
  )
  select
    exists (
      select 1 from public.horarios h, local l
      where h.barbero_id = p_barbero_id
        and h.activo
        and h.dia_semana = extract(dow from l.li)::smallint
        and l.li::time >= h.hora_inicio
        and l.lf::time <= h.hora_fin
        and l.li::date = l.lf::date          -- una cita no cruza la medianoche
    )
    and not exists (
      select 1 from public.bloqueos b
      where (b.barbero_id = p_barbero_id or b.barbero_id is null)
        and b.rango && tstzrange(p_inicio, p_fin, '[)')
    );
$$;

-- Sello de actualización.
create or replace function public.tocar_actualizado_en()
returns trigger language plpgsql as $$
begin
  new.actualizado_en := now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['servicios','barberos','clientes','citas'] loop
    execute format('drop trigger if exists trg_%1$s_actualizado on public.%1$s', t);
    execute format(
      'create trigger trg_%1$s_actualizado before update on public.%1$s
       for each row execute function public.tocar_actualizado_en()', t);
  end loop;
end $$;

-- Auditoría de citas y pagos.
create or replace function public.registrar_auditoria()
returns trigger language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_actor uuid;
begin
  begin v_actor := auth.uid(); exception when others then v_actor := null; end;
  insert into public.auditoria (tabla, registro_id, accion, estado_anterior, estado_nuevo, actor)
  values (
    tg_table_name,
    coalesce((case when tg_op = 'DELETE' then old.id else new.id end), null),
    tg_op,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end,
    v_actor
  );
  return case when tg_op = 'DELETE' then old else new end;
end $$;

drop trigger if exists trg_citas_auditoria on public.citas;
create trigger trg_citas_auditoria
  after insert or update or delete on public.citas
  for each row execute function public.registrar_auditoria();

drop trigger if exists trg_pagos_auditoria on public.pagos;
create trigger trg_pagos_auditoria
  after insert on public.pagos
  for each row execute function public.registrar_auditoria();

-- ── LEDGER INMUTABLE ──────────────────────────────────────────────────────────
-- RLS no basta: `service_role` la ignora por completo. Un trigger sí lo frena.
create or replace function public.pagos_son_inmutables()
returns trigger language plpgsql as $$
begin
  raise exception
    'El ledger de pagos es inmutable: no se puede % una fila. Corrige insertando un pago de tipo reembolso.', tg_op
    using errcode = '0A000';   -- feature_not_supported
end $$;

drop trigger if exists trg_pagos_no_update on public.pagos;
create trigger trg_pagos_no_update before update on public.pagos
  for each row execute function public.pagos_son_inmutables();

drop trigger if exists trg_pagos_no_delete on public.pagos;
create trigger trg_pagos_no_delete before delete on public.pagos
  for each row execute function public.pagos_son_inmutables();


-- ───────────────────────────────────────────────────────────────────────────────
--  6 · FUNCIONES RPC  (SECURITY DEFINER)
--      Son la ÚNICA puerta del anónimo hacia los datos. El rol anon no tiene
--      privilegio directo sobre citas, clientes ni pagos.
-- ───────────────────────────────────────────────────────────────────────────────

-- 6.1 ── horarios_disponibles ──────────────────────────────────────────────────
-- Devuelve SOLO las horas de inicio libres. Cruza jornada × bloqueos × citas vivas.
create or replace function public.horarios_disponibles(
  p_barbero_id  uuid,
  p_servicio_id uuid,
  p_fecha       date,
  p_paso        interval default interval '15 minutes'
) returns setof timestamptz
language plpgsql stable security definer set search_path = public, extensions, pg_temp as $$
declare
  v_duracion    integer;
  v_dow         smallint;
  v_min_inicio  timestamptz;
begin
  select s.duracion_min into v_duracion
  from public.servicios s where s.id = p_servicio_id and s.activo;
  if v_duracion is null then
    raise exception 'Servicio no disponible' using errcode = '22023';
  end if;

  if not exists (select 1 from public.barberos b where b.id = p_barbero_id and b.activo) then
    raise exception 'Barbero no disponible' using errcode = '22023';
  end if;

  -- No se puede reservar para dentro de 5 minutos: hay que llegar al local.
  v_min_inicio := now() + interval '30 minutes';
  v_dow := extract(dow from p_fecha)::smallint;

  return query
  with ventanas as (
    select ((p_fecha + h.hora_inicio) at time zone 'America/Lima') as v_ini,
           ((p_fecha + h.hora_fin)    at time zone 'America/Lima') as v_fin
    from public.horarios h
    where h.barbero_id = p_barbero_id
      and h.dia_semana = v_dow
      and h.activo
  ),
  slots as (
    select g.inicio,
           g.inicio + make_interval(mins => v_duracion) as fin
    from ventanas v
    cross join lateral generate_series(
      v.v_ini,
      v.v_fin - make_interval(mins => v_duracion),
      p_paso
    ) as g(inicio)
  )
  select s.inicio
  from slots s
  where s.inicio >= v_min_inicio
    and not exists (
      select 1 from public.bloqueos b
      where (b.barbero_id = p_barbero_id or b.barbero_id is null)
        and b.rango && tstzrange(s.inicio, s.fin, '[)')
    )
    and not exists (
      select 1 from public.citas c
      where c.barbero_id = p_barbero_id
        and c.estado = any (public.estados_vivos())
        and c.rango && tstzrange(s.inicio, s.fin, '[)')
    )
  order by s.inicio;
end $$;


-- 6.2 ── crear_reserva ─────────────────────────────────────────────────────────
-- Congela el precio, genera el código, inserta en 'pendiente_pago' con 15 min
-- de vida. El precio NUNCA entra por parámetro: se lee de `servicios`.
create or replace function public.crear_reserva(
  p_servicio_id uuid,
  p_barbero_id  uuid,
  p_inicio      timestamptz,
  p_nombre      text,
  p_telefono    text,
  p_email       text default null,
  p_notas       text default null
) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp as $$
declare
  v_srv       public.servicios%rowtype;
  v_barbero   public.barberos%rowtype;
  v_cliente   public.clientes%rowtype;
  v_fin       timestamptz;
  v_adelanto  integer;
  v_codigo    text;
  v_cita      public.citas%rowtype;
  v_nombre    text := btrim(p_nombre);
  v_email     text := nullif(btrim(coalesce(p_email, '')), '');
  i           integer;
begin
  -- ── Validación de entrada ───────────────────────────────────────────────────
  if v_nombre is null or length(v_nombre) < 2 then
    raise exception 'El nombre es obligatorio' using errcode = '22023';
  end if;
  if p_telefono !~ '^51[0-9]{9}$' then
    raise exception 'El teléfono debe tener 9 dígitos (formato 51XXXXXXXXX)' using errcode = '22023';
  end if;
  if v_email is not null and v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-zA-Z]{2,}$' then
    raise exception 'El correo no es válido' using errcode = '22023';
  end if;

  select * into v_srv from public.servicios where id = p_servicio_id and activo;
  if not found then
    raise exception 'Servicio no disponible' using errcode = '22023';
  end if;

  select * into v_barbero from public.barberos where id = p_barbero_id and activo;
  if not found then
    raise exception 'Barbero no disponible' using errcode = '22023';
  end if;

  -- El inicio debe caer en la rejilla de 5 minutos (nada de 16:07:31).
  if date_part('second', p_inicio) <> 0 or (date_part('minute', p_inicio)::int % 5) <> 0 then
    raise exception 'Hora inválida' using errcode = '22023';
  end if;

  if p_inicio < now() + interval '30 minutes' then
    raise exception 'Esa hora ya pasó o es demasiado pronto. Elige otra.' using errcode = '22023';
  end if;

  v_fin := p_inicio + make_interval(mins => v_srv.duracion_min);

  if not public.slot_dentro_de_jornada(p_barbero_id, p_inicio, v_fin) then
    raise exception 'El barbero no atiende en ese horario' using errcode = '22023';
  end if;

  -- ── Cliente (el teléfono es la identidad) ───────────────────────────────────
  insert into public.clientes (nombre, telefono, email)
  values (v_nombre, p_telefono, v_email)
  on conflict (telefono) do update
    set nombre = excluded.nombre,
        email  = coalesce(excluded.email, public.clientes.email)
  returning * into v_cliente;

  -- ── Congelado de precio ─────────────────────────────────────────────────────
  -- round() sobre el 50 % en céntimos. S/ 35.00 → adelanto S/ 17.50.
  v_adelanto := round(v_srv.precio_centimos * v_srv.adelanto_pct / 100.0)::integer;

  -- ── Inserción con reintento de código y captura del solape ──────────────────
  for i in 1..7 loop
    v_codigo := public.generar_codigo();
    begin
      insert into public.citas (
        codigo, cliente_id, barbero_id, servicio_id,
        servicio_nombre, duracion_min, precio_centimos, adelanto_centimos,
        inicio, fin, estado, expira_en, notas
      ) values (
        v_codigo, v_cliente.id, p_barbero_id, v_srv.id,
        v_srv.nombre, v_srv.duracion_min, v_srv.precio_centimos, v_adelanto,
        p_inicio, v_fin, 'pendiente_pago', now() + interval '15 minutes',
        nullif(btrim(coalesce(p_notas, '')), '')
      )
      returning * into v_cita;
      exit;                                   -- insert OK, salimos del bucle
    exception
      when exclusion_violation then
        -- Otra transacción ganó el slot entre la consulta y el INSERT.
        raise exception 'Ese horario acaba de ser tomado. Elige otra hora, por favor.'
          using errcode = '23P01';
      when unique_violation then
        -- Solo puede ser el código: reintenta. Cualquier otro unique, propaga.
        if i = 7 then raise; end if;
        continue;
    end;
  end loop;

  return jsonb_build_object(
    'id',                v_cita.id,
    'codigo',            v_cita.codigo,
    'inicio',            v_cita.inicio,
    'fin',               v_cita.fin,
    'estado',            v_cita.estado,
    'expira_en',         v_cita.expira_en,
    'servicio_nombre',   v_cita.servicio_nombre,
    'duracion_min',      v_cita.duracion_min,
    'precio_centimos',   v_cita.precio_centimos,
    'adelanto_centimos', v_cita.adelanto_centimos,
    'barbero_nombre',    v_barbero.nombre,
    'yape_numero',       v_barbero.yape_numero,
    'yape_titular',      v_barbero.yape_titular,
    'cliente_nombre',    v_cliente.nombre,
    'cliente_telefono',  v_cliente.telefono,
    'cliente_email',     v_cliente.email
  );
end $$;


-- 6.3 ── registrar_captura ─────────────────────────────────────────────────────
-- pendiente_pago → en_revision. Exige el código además del id: sin el código
-- (que solo tiene quien hizo la reserva) no se puede tocar la cita ajena.
-- NO confirma nada. La confirmación es un tap humano.
create or replace function public.registrar_captura(
  p_cita_id uuid,
  p_codigo  text,
  p_path    text
) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp as $$
declare v_cita public.citas%rowtype;
begin
  if p_path is null or length(btrim(p_path)) = 0 then
    raise exception 'Falta la ruta de la captura' using errcode = '22023';
  end if;

  -- FOR UPDATE: dos subidas simultáneas de la misma cita se serializan y la
  -- segunda encuentra el estado ya cambiado.
  select * into v_cita
  from public.citas
  where id = p_cita_id and codigo = upper(btrim(p_codigo))
  for update;

  if not found then
    raise exception 'Reserva no encontrada' using errcode = '22023';
  end if;

  if v_cita.estado <> 'pendiente_pago' then
    raise exception 'Esta reserva ya no admite una captura (estado: %)', v_cita.estado
      using errcode = '22023';
  end if;

  if v_cita.expira_en is not null and v_cita.expira_en < now() then
    raise exception 'El plazo de 15 minutos venció y el horario se liberó. Vuelve a reservar.'
      using errcode = '22023';
  end if;

  update public.citas
     set estado            = 'en_revision',
         captura_path      = p_path,
         captura_subida_en = now(),
         expira_en         = null          -- ya no vence: espera al barbero
   where id = v_cita.id
   returning * into v_cita;

  return jsonb_build_object(
    'id',        v_cita.id,
    'codigo',    v_cita.codigo,
    'estado',    v_cita.estado,
    'inicio',    v_cita.inicio,
    'fin',       v_cita.fin
  );
end $$;


-- 6.4 ── liberar_vencidas ──────────────────────────────────────────────────────
-- Para el cron de GitHub Actions (cada 5 min). Devuelve cuántas liberó.
create or replace function public.liberar_vencidas()
returns integer
language plpgsql volatile security definer set search_path = public, extensions, pg_temp as $$
declare v_n integer;
begin
  with liberadas as (
    update public.citas
       set estado    = 'liberada',
           expira_en = null
     where estado = 'pendiente_pago'
       and expira_en is not null
       and expira_en < now()
    returning 1
  )
  select count(*)::integer into v_n from liberadas;
  return coalesce(v_n, 0);
end $$;


-- ───────────────────────────────────────────────────────────────────────────────
--  7 · PRIVILEGIOS Y RLS
-- ───────────────────────────────────────────────────────────────────────────────

alter table public.servicios      enable row level security;
alter table public.barberos       enable row level security;
alter table public.horarios       enable row level security;
alter table public.bloqueos       enable row level security;
alter table public.clientes       enable row level security;
alter table public.citas          enable row level security;
alter table public.pagos          enable row level security;
alter table public.notificaciones enable row level security;
alter table public.auditoria      enable row level security;

-- 7.1 · Privilegios de tabla. Se cierra todo y se abre solo lo justo.
--       Esto es una capa ANTERIOR al RLS: sin GRANT, la política ni se evalúa.
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
grant usage on schema public to anon, authenticated;

-- Catálogo: lectura pública (el RLS filtra a los activos).
grant select on public.servicios          to anon, authenticated;
grant select on public.barberos_publicos  to anon, authenticated;

-- El barbero autenticado sí toca tablas, siempre filtrado por RLS.
grant select, insert, update on public.citas          to authenticated;
grant select                 on public.clientes       to authenticated;
grant select, insert, update on public.servicios      to authenticated;
grant select, update         on public.barberos       to authenticated;
grant select, insert, update, delete on public.horarios to authenticated;
grant select, insert, update, delete on public.bloqueos to authenticated;
grant select, insert         on public.pagos          to authenticated;  -- ¡sin update ni delete!
grant select, insert         on public.notificaciones to authenticated;
grant select                 on public.auditoria      to authenticated;

-- Las secuencias de auditoria (identity) no necesitan grant para authenticated
-- porque el INSERT lo hace un trigger SECURITY DEFINER.

-- 7.2 · Ejecución de las RPC. El anónimo solo puede llamar a estas tres.
grant execute on function public.horarios_disponibles(uuid, uuid, date, interval) to anon, authenticated;
grant execute on function public.crear_reserva(uuid, uuid, timestamptz, text, text, text, text) to anon, authenticated;
grant execute on function public.registrar_captura(uuid, text, text) to anon, authenticated;
-- liberar_vencidas queda solo para service_role (que no necesita GRANT explícito
-- porque es superusuario-like en Supabase, pero lo dejamos documentado).
grant execute on function public.liberar_vencidas() to service_role;

grant execute on function public.es_barbero()     to authenticated;
grant execute on function public.es_admin()       to authenticated;
grant execute on function public.barbero_actual() to authenticated;
grant execute on function public.estados_vivos()  to anon, authenticated;

-- 7.3 · Cinturón y tirantes: aunque un GRANT futuro se cuele, el anon no lee
--       datos personales. Estas tres tablas jamás se exponen al rol anónimo.
revoke all on public.citas    from anon;
revoke all on public.clientes from anon;
revoke all on public.pagos    from anon;
revoke all on public.auditoria from anon;

-- ── POLÍTICAS ─────────────────────────────────────────────────────────────────

-- SERVICIOS: catálogo activo visible para todos; solo el admin lo edita.
drop policy if exists servicios_lectura_publica on public.servicios;
create policy servicios_lectura_publica on public.servicios
  for select to anon, authenticated using (activo);

drop policy if exists servicios_admin on public.servicios;
create policy servicios_admin on public.servicios
  for all to authenticated using (public.es_admin()) with check (public.es_admin());

-- BARBEROS: nada para anon (usa la vista). El barbero se ve a sí mismo; el admin, a todos.
drop policy if exists barberos_lectura on public.barberos;
create policy barberos_lectura on public.barberos
  for select to authenticated
  using (public.es_admin() or user_id = auth.uid());

drop policy if exists barberos_edicion_propia on public.barberos;
create policy barberos_edicion_propia on public.barberos
  for update to authenticated
  using (public.es_admin() or user_id = auth.uid())
  with check (public.es_admin() or user_id = auth.uid());

-- HORARIOS / BLOQUEOS: gestión del propio barbero, o del admin sobre todos.
drop policy if exists horarios_gestion on public.horarios;
create policy horarios_gestion on public.horarios
  for all to authenticated
  using (public.es_admin() or barbero_id = public.barbero_actual())
  with check (public.es_admin() or barbero_id = public.barbero_actual());

drop policy if exists bloqueos_gestion on public.bloqueos;
create policy bloqueos_gestion on public.bloqueos
  for all to authenticated
  using (public.es_admin() or barbero_id is null or barbero_id = public.barbero_actual())
  with check (public.es_admin() or barbero_id = public.barbero_actual());

-- CLIENTES: el barbero solo ve a los clientes que tienen cita CON ÉL.
drop policy if exists clientes_lectura_barbero on public.clientes;
create policy clientes_lectura_barbero on public.clientes
  for select to authenticated
  using (
    public.es_admin() or exists (
      select 1 from public.citas c
      where c.cliente_id = public.clientes.id
        and c.barbero_id = public.barbero_actual()
    )
  );

-- CITAS: el corazón del control de acceso. Aquí se aplica "cada barbero ve solo
-- lo suyo, el admin ve todo" — en la base, NO en el frontend.
drop policy if exists citas_lectura_barbero on public.citas;
create policy citas_lectura_barbero on public.citas
  for select to authenticated
  using (public.es_admin() or barbero_id = public.barbero_actual());

drop policy if exists citas_actualiza_barbero on public.citas;
create policy citas_actualiza_barbero on public.citas
  for update to authenticated
  using (public.es_admin() or barbero_id = public.barbero_actual())
  with check (public.es_admin() or barbero_id = public.barbero_actual());

drop policy if exists citas_inserta_barbero on public.citas;
create policy citas_inserta_barbero on public.citas
  for insert to authenticated
  with check (public.es_admin() or barbero_id = public.barbero_actual());

-- PAGOS: solo INSERT y SELECT. No existe policy de UPDATE ni de DELETE —
-- su ausencia ya las prohíbe, y el trigger lo refuerza contra service_role.
drop policy if exists pagos_lectura on public.pagos;
create policy pagos_lectura on public.pagos
  for select to authenticated
  using (
    public.es_admin() or exists (
      select 1 from public.citas c
      where c.id = public.pagos.cita_id and c.barbero_id = public.barbero_actual()
    )
  );

drop policy if exists pagos_insercion on public.pagos;
create policy pagos_insercion on public.pagos
  for insert to authenticated
  with check (
    public.es_barbero() and exists (
      select 1 from public.citas c
      where c.id = public.pagos.cita_id
        and (public.es_admin() or c.barbero_id = public.barbero_actual())
    )
  );

-- NOTIFICACIONES: visibles para el barbero dueño de la cita.
drop policy if exists notificaciones_lectura on public.notificaciones;
create policy notificaciones_lectura on public.notificaciones
  for select to authenticated
  using (
    public.es_admin() or exists (
      select 1 from public.citas c
      where c.id = public.notificaciones.cita_id and c.barbero_id = public.barbero_actual()
    )
  );

drop policy if exists notificaciones_insercion on public.notificaciones;
create policy notificaciones_insercion on public.notificaciones
  for insert to authenticated with check (public.es_barbero());

-- AUDITORÍA: solo el dueño. Nadie la modifica (no hay policy de insert para
-- authenticated: escribe el trigger, que es SECURITY DEFINER).
drop policy if exists auditoria_lectura_admin on public.auditoria;
create policy auditoria_lectura_admin on public.auditoria
  for select to authenticated using (public.es_admin());


-- ───────────────────────────────────────────────────────────────────────────────
--  8 · DATOS SEMILLA
--      Precios en céntimos de sol. Ajusta a la realidad de tu local.
--      Los barberos quedan SIN user_id: se enlazan después de crear el usuario
--      en Supabase Auth (ver README).
-- ───────────────────────────────────────────────────────────────────────────────

insert into public.servicios (nombre, descripcion, duracion_min, precio_centimos, adelanto_pct, orden)
values
  ('Corte clásico',        'Corte a máquina y tijera, con lavado y peinado.',            30, 3000, 50, 1),
  ('Corte + barba',        'Corte completo más perfilado de barba con toalla caliente.', 50, 4500, 50, 2),
  ('Perfilado de barba',   'Diseño, afeitado de contornos y aceite.',                    20, 2000, 50, 3),
  ('Corte niño',           'Menores de 12 años.',                                        25, 2500, 50, 4),
  ('Corte + tinte',        'Corte con coloración completa. Incluye tratamiento.',        90, 9000, 50, 5)
on conflict (nombre) do nothing;

insert into public.barberos (nombre, telefono, yape_numero, yape_titular, es_admin, orden)
values
  -- Teléfonos y titulares de Yape son DE RELLENO: cámbialos por los reales
  -- antes de abrir al público (el yape_numero es al que el cliente adelanta).
  ('Jeanpier', '51999111222', '999111222', 'Jeanpier Ramos', true,  1),
  ('Bryan',    '51999333444', '999333444', 'Bryan Ramos',    false, 2)
on conflict (nombre) do nothing;

-- Jornada: lunes a sábado 09:00–20:00, domingo 10:00–14:00.
-- Convención de dia_semana = EXTRACT(dow): 0 domingo … 6 sábado.
insert into public.horarios (barbero_id, dia_semana, hora_inicio, hora_fin)
select b.id, d.dia, d.ini, d.fin
from public.barberos b
cross join (values
  (1, time '09:00', time '20:00'),
  (2, time '09:00', time '20:00'),
  (3, time '09:00', time '20:00'),
  (4, time '09:00', time '20:00'),
  (5, time '09:00', time '20:00'),
  (6, time '09:00', time '20:00'),
  (0, time '10:00', time '14:00')
) as d(dia, ini, fin)
on conflict (barbero_id, dia_semana, hora_inicio) do nothing;


-- ═══════════════════════════════════════════════════════════════════════════════
--  9 · PRUEBAS  ─  descomenta este bloque para verificar el anti-solape.
--      Todo corre dentro de una transacción que termina en ROLLBACK: no deja
--      rastro en tus datos.
-- ═══════════════════════════════════════════════════════════════════════════════
/*
begin;

-- Vista de apoyo: próximo lunes a las 16:00 hora de Lima, y los ids de semilla.
create temp view _t as
select
  (select id from public.barberos  where nombre = 'Jeanpier')      as jeanpier,
  (select id from public.barberos  where nombre = 'Bryan')         as bryan,
  (select id from public.servicios where nombre = 'Corte + barba') as srv50,
  (select id from public.servicios where nombre = 'Corte clásico') as srv30,
  ((date_trunc('week', (now() at time zone 'America/Lima'))::date + 7) + time '16:00')
    at time zone 'America/Lima'                                    as t1600;

insert into public.clientes (nombre, telefono) values ('Cliente Prueba', '51900000001')
  on conflict (telefono) do update set nombre = excluded.nombre;

-- ── (a) Cita normal 16:00–16:50 con Jeanpier ─────────────────────────── ✔ 1 fila
insert into public.citas (codigo, cliente_id, barbero_id, servicio_id, servicio_nombre,
                          duracion_min, precio_centimos, adelanto_centimos, inicio, fin, estado)
select 'BR-TST01', c.id, t.jeanpier, t.srv50, 'Corte + barba', 50, 4500, 2250,
       t.t1600, t.t1600 + interval '50 min', 'confirmada'
from _t t, public.clientes c where c.telefono = '51900000001';

-- ── (b) SOLAPE PARCIAL: 16:30–17:00 con el MISMO barbero ─────────────── ✘ 23P01
--    Inicios distintos (16:00 vs 16:30): un UNIQUE(barbero_id, inicio) lo dejaría
--    pasar. El EXCLUDE ... USING gist lo detecta porque los rangos se cruzan.
insert into public.citas (codigo, cliente_id, barbero_id, servicio_id, servicio_nombre,
                          duracion_min, precio_centimos, adelanto_centimos, inicio, fin, estado)
select 'BR-TST02', c.id, t.jeanpier, t.srv30, 'Corte clásico', 30, 3000, 1500,
       t.t1600 + interval '30 min', t.t1600 + interval '60 min', 'pendiente_pago'
from _t t, public.clientes c where c.telefono = '51900000001';
--    esperado: ERROR 23P01 — conflicting key value violates exclusion constraint
--              "citas_sin_solape".  (Aborta la transacción: reinicia con BEGIN
--              o usa un SAVEPOINT si quieres seguir con las pruebas siguientes.)

-- ── (c) Mismo horario, OTRO barbero ──────────────────────────────────── ✔ 1 fila
insert into public.citas (codigo, cliente_id, barbero_id, servicio_id, servicio_nombre,
                          duracion_min, precio_centimos, adelanto_centimos, inicio, fin, estado)
select 'BR-TST03', c.id, t.bryan, t.srv50, 'Corte + barba', 50, 4500, 2250,
       t.t1600, t.t1600 + interval '50 min', 'confirmada'
from _t t, public.clientes c where c.telefono = '51900000001';

-- ── (d) Un slot 'liberado' vuelve al pool ────────────────────────────── ✔ 1 fila
update public.citas set estado = 'liberada' where codigo = 'BR-TST01';
insert into public.citas (codigo, cliente_id, barbero_id, servicio_id, servicio_nombre,
                          duracion_min, precio_centimos, adelanto_centimos, inicio, fin, estado)
select 'BR-TST04', c.id, t.jeanpier, t.srv50, 'Corte + barba', 50, 4500, 2250,
       t.t1600, t.t1600 + interval '50 min', 'pendiente_pago'
from _t t, public.clientes c where c.telefono = '51900000001';

-- ── (e) El ledger de pagos es inmutable ──────────────────────────────── ✘ 0A000
insert into public.pagos (cita_id, tipo, monto_centimos, metodo)
select id, 'adelanto', 2250, 'yape' from public.citas where codigo = 'BR-TST04';
update public.pagos set monto_centimos = 1 where tipo = 'adelanto';
--    esperado: ERROR 0A000 — El ledger de pagos es inmutable: no se puede UPDATE...

rollback;
*/

-- ═══════════════════════════════════════════════════════════════════════════════
--  Fin del esquema.
-- ═══════════════════════════════════════════════════════════════════════════════
