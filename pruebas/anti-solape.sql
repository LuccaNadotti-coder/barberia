-- ═══════════════════════════════════════════════════════════════════════════════
--  PRUEBAS DEL ESQUEMA — pégalas tal cual en el SQL Editor de Supabase.
--
--  No hace falta instalar nada. Todo el bloque termina lanzando el informe como
--  una excepción, lo que ABORTA la transacción: no queda ni una fila de prueba
--  en la base. El "ERROR: P0001: INFORME DE PRUEBAS ..." que verás ES el
--  resultado, no un fallo.
--
--  Cúbrelo cada vez que toques sql/01-schema.sql.
-- ═══════════════════════════════════════════════════════════════════════════════
do $$
declare
  v_jeanpier uuid; v_bryan uuid; v_srv50 uuid; v_srv30 uuid; v_cli uuid;
  t1600 timestamptz;
  n int;
  am text;
  cod text;
  r text := '';
begin
  select id into v_jeanpier from barberos  where nombre = 'Jeanpier';
  select id into v_bryan from barberos  where nombre = 'Bryan';
  select id into v_srv50 from servicios where nombre = 'Corte + barba';
  select id into v_srv30 from servicios where nombre = 'Corte clásico';

  if v_jeanpier is null or v_srv50 is null then
    raise exception 'Faltan los datos semilla. Corre antes sql/01-schema.sql.';
  end if;

  t1600 := ((date_trunc('week', (now() at time zone 'America/Lima'))::date + 7) + time '16:00')
             at time zone 'America/Lima';
  r := r || E'\nSlot de prueba: '
         || to_char(t1600 at time zone 'America/Lima', 'DY DD/MM/YYYY HH24:MI') || ' (Lima)';

  -- ── Estructura ─────────────────────────────────────────────────────────────
  select am2.amname into am
  from pg_constraint c
  join pg_class i  on i.oid = c.conindid
  join pg_am   am2 on am2.oid = i.relam
  where c.conrelid = 'public.citas'::regclass and c.contype = 'x';
  r := r || E'\n\n[estructura] citas_sin_solape usa indice ....... '
         || coalesce(am, 'NINGUNO') || case when am = 'gist' then '   PASA' else '   FALLA' end;

  -- generar_codigo() no debe depender de pgcrypto: en Supabase vive en el
  -- esquema `extensions` y no se ve desde un SECURITY DEFINER.
  begin
    cod := generar_codigo();
    r := r || E'\n[estructura] generar_codigo() sin pgcrypto ..... '
           || case when cod ~ '^BR-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$'
                   then 'PASA   ' || cod else 'FALLA  ' || coalesce(cod, 'null') end;
  exception when others then
    r := r || E'\n[estructura] generar_codigo() ................. FALLA  ' || sqlstate || ' ' || sqlerrm;
  end;

  insert into clientes (nombre, telefono) values ('Cliente Prueba', '51900000001')
    on conflict (telefono) do update set nombre = excluded.nombre
    returning id into v_cli;

  -- ── (a) cita normal ────────────────────────────────────────────────────────
  begin
    insert into citas (codigo, cliente_id, barbero_id, servicio_id, servicio_nombre,
                       duracion_min, precio_centimos, adelanto_centimos, inicio, fin, estado)
    values ('BR-TST01', v_cli, v_jeanpier, v_srv50, 'Corte + barba', 50, 4500, 2250,
            t1600, t1600 + interval '50 min', 'confirmada');
    r := r || E'\n\n(a) cita normal Jeanpier 16:00-16:50 ...... PASA   insertada';
  exception when others then
    r := r || E'\n\n(a) cita normal ........................... FALLA  ' || sqlstate || ' ' || sqlerrm;
  end;

  -- ── (b) SOLAPE PARCIAL, mismo barbero ──────────────────────────────────────
  begin
    insert into citas (codigo, cliente_id, barbero_id, servicio_id, servicio_nombre,
                       duracion_min, precio_centimos, adelanto_centimos, inicio, fin, estado)
    values ('BR-TST02', v_cli, v_jeanpier, v_srv30, 'Corte clásico', 30, 3000, 1500,
            t1600 + interval '30 min', t1600 + interval '60 min', 'pendiente_pago');
    r := r || E'\n(b) solape parcial Jeanpier 16:30-17:00 ... FALLA  ¡se insertó! el EXCLUDE no actuó';
  exception when exclusion_violation then
    r := r || E'\n(b) solape parcial Jeanpier 16:30-17:00 ... PASA   ' || sqlstate || ' rechazado';
  when others then
    r := r || E'\n(b) solape parcial ........................ FALLA  ' || sqlstate || ' ' || sqlerrm;
  end;

  select count(*) into n from citas
   where barbero_id = v_jeanpier and inicio = t1600 + interval '30 min';
  r := r || E'\n(b2) filas con inicio exacto 16:30 ........ '
         || case when n = 0 then 'PASA   0 filas: un UNIQUE(barbero_id,inicio) NO lo habría visto'
                 else 'FALLA  ' || n end;

  -- ── (c) mismo horario, OTRO barbero ────────────────────────────────────────
  begin
    insert into citas (codigo, cliente_id, barbero_id, servicio_id, servicio_nombre,
                       duracion_min, precio_centimos, adelanto_centimos, inicio, fin, estado)
    values ('BR-TST03', v_cli, v_bryan, v_srv50, 'Corte + barba', 50, 4500, 2250,
            t1600, t1600 + interval '50 min', 'confirmada');
    r := r || E'\n(c) mismo horario, Bryan .................. PASA   insertada en paralelo';
  exception when others then
    r := r || E'\n(c) mismo horario, otro barbero ........... FALLA  ' || sqlstate || ' ' || sqlerrm;
  end;

  -- ── (d) un slot liberado vuelve al pool ────────────────────────────────────
  update citas set estado = 'liberada' where codigo = 'BR-TST01';
  begin
    insert into citas (codigo, cliente_id, barbero_id, servicio_id, servicio_nombre,
                       duracion_min, precio_centimos, adelanto_centimos, inicio, fin, estado)
    values ('BR-TST04', v_cli, v_jeanpier, v_srv50, 'Corte + barba', 50, 4500, 2250,
            t1600, t1600 + interval '50 min', 'pendiente_pago');
    r := r || E'\n(d) reutilizar un slot liberado ........... PASA   el hueco volvió al pool';
  exception when others then
    r := r || E'\n(d) reutilizar un slot liberado ........... FALLA  ' || sqlstate || ' ' || sqlerrm;
  end;

  -- ── (d2) horarios_disponibles no ofrece lo ocupado ─────────────────────────
  select count(*) into n
  from horarios_disponibles(v_jeanpier, v_srv30, (t1600 at time zone 'America/Lima')::date) h
  where tstzrange(h, h + interval '30 min', '[)') && tstzrange(t1600, t1600 + interval '50 min', '[)');
  r := r || E'\n(d2) slots ofrecidos que se solapan ....... '
         || case when n = 0 then 'PASA   0' else 'FALLA  ofrece ' || n || ' hora(s) imposible(s)' end;

  -- ── (e) ledger inmutable ───────────────────────────────────────────────────
  insert into pagos (cita_id, tipo, monto_centimos, metodo)
  select id, 'adelanto', 2250, 'yape' from citas where codigo = 'BR-TST04';

  begin
    update pagos set monto_centimos = 1 where tipo = 'adelanto';
    r := r || E'\n\n(e) UPDATE sobre pagos .................... FALLA  ¡se permitió editar el ledger!';
  exception when others then
    r := r || E'\n\n(e) UPDATE sobre pagos .................... PASA   ' || sqlstate
           || ' bloqueado (y esto corre como superusuario)';
  end;

  begin
    delete from pagos where tipo = 'adelanto';
    r := r || E'\n(e2) DELETE sobre pagos ................... FALLA  ¡se permitió borrar!';
  exception when others then
    r := r || E'\n(e2) DELETE sobre pagos ................... PASA   ' || sqlstate || ' bloqueado';
  end;

  insert into pagos (cita_id, tipo, monto_centimos, metodo, nota)
  select id, 'reembolso', -2250, 'yape', 'corrección' from citas where codigo = 'BR-TST04';
  select coalesce(sum(monto_centimos), -1) into n from pagos
   where cita_id = (select id from citas where codigo = 'BR-TST04');
  r := r || E'\n(e3) corrección vía reembolso ............. '
         || case when n = 0 then 'PASA   neto del ledger = 0' else 'FALLA  neto = ' || n end;

  -- ── (f) el rol anon no ve datos personales ─────────────────────────────────
  begin
    set local role anon;
    execute 'select count(*) from public.citas' into n;
    reset role;
    r := r || E'\n\n(f) anon SELECT citas ..................... FALLA  ¡leyó ' || n || ' filas!';
  exception when insufficient_privilege then
    reset role;
    r := r || E'\n\n(f) anon SELECT citas ..................... PASA   42501 permission denied';
  when others then
    reset role;
    r := r || E'\n\n(f) anon SELECT citas ..................... FALLA  ' || sqlstate;
  end;

  begin
    set local role anon;
    execute 'select count(*) from public.clientes' into n;
    reset role;
    r := r || E'\n(f2) anon SELECT clientes ................. FALLA  ¡leyó ' || n || ' filas!';
  exception when insufficient_privilege then
    reset role;
    r := r || E'\n(f2) anon SELECT clientes ................. PASA   42501 permission denied';
  when others then
    reset role;
    r := r || E'\n(f2) anon SELECT clientes ................. FALLA  ' || sqlstate;
  end;

  begin
    set local role anon;
    execute 'select count(*) from public.pagos' into n;
    reset role;
    r := r || E'\n(f3) anon SELECT pagos .................... FALLA  ¡leyó ' || n || ' filas!';
  exception when insufficient_privilege then
    reset role;
    r := r || E'\n(f3) anon SELECT pagos .................... PASA   42501 permission denied';
  when others then
    reset role;
    r := r || E'\n(f3) anon SELECT pagos .................... FALLA  ' || sqlstate;
  end;

  begin
    set local role anon;
    execute 'select count(*) from public.barberos' into n;
    reset role;
    r := r || E'\n(f4) anon SELECT barberos (tabla cruda) ... FALLA  ¡leyó ' || n || ' filas!';
  exception when insufficient_privilege then
    reset role;
    r := r || E'\n(f4) anon SELECT barberos (tabla cruda) ... PASA   42501 permission denied';
  when others then
    reset role;
    r := r || E'\n(f4) anon SELECT barberos ................. FALLA  ' || sqlstate;
  end;

  begin
    set local role anon;
    execute 'select count(*) from public.servicios' into n;
    reset role;
    r := r || E'\n(f5) anon SELECT servicios (permitido) .... '
           || case when n > 0 then 'PASA   ' || n || ' servicios' else 'FALLA  0' end;
  exception when others then
    reset role;
    r := r || E'\n(f5) anon SELECT servicios ................ FALLA  ' || sqlstate;
  end;

  begin
    set local role anon;
    execute 'select count(*) from public.barberos_publicos' into n;
    reset role;
    r := r || E'\n(f6) anon SELECT barberos_publicos ........ '
           || case when n > 0 then 'PASA   ' || n || ' barberos, sin teléfono ni yape' else 'FALLA  0' end;
  exception when others then
    reset role;
    r := r || E'\n(f6) anon SELECT barberos_publicos ........ FALLA  ' || sqlstate;
  end;

  r := r || E'\n\n(todo se revierte: no queda ninguna fila de prueba)';

  raise exception E'INFORME DE PRUEBAS%', r;
end $$;
