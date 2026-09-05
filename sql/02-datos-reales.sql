-- ═══════════════════════════════════════════════════════════════════════════════
--  DATOS REALES DE TU BARBERÍA
--
--  sql/01-schema.sql deja datos de EJEMPLO. Este archivo los sustituye por los
--  tuyos. Ya lleva aplicado lo que sabemos de EL TEMPLO (Jeanpier de dueño); lo
--  que sigue marcado con ← CAMBIA es lo que todavía es inventado.
--
--  CÓMO USARLO
--    1. Rellena los valores marcados con  ← CAMBIA
--    2. Pégalo entero en el SQL Editor de Supabase y ejecútalo
--    3. Es idempotente: puedes corregir y volver a ejecutarlo
--
--  RECUERDA
--    · Los precios van en CÉNTIMOS de sol. 3500 = S/ 35.00. Nunca 35.00
--    · Los teléfonos van como 51XXXXXXXXX (sin +, sin espacios)
--    · yape_numero son los 9 dígitos tal como se ven en la app de Yape
--    · dia_semana sigue EXTRACT(dow): 0 = domingo … 6 = sábado
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

-- ───────────────────────────────────────────────────────────────────────────────
--  1 · BARBEROS
--     Los WHERE buscan por el nombre ACTUAL en la tabla: hoy «Jeanpier» y
--     «Bryan». Si cambias el nombre arriba, el WHERE de la siguiente ejecución
--     tiene que usar el nuevo.
-- ───────────────────────────────────────────────────────────────────────────────

-- ESTADO: el nombre y el rol ya son los reales. El teléfono y el Yape SIGUEN
-- SIENDO INVENTADOS — y el yape_numero es al que el cliente manda el adelanto.
update public.barberos set
  nombre       = 'Jeanpier',              --            nombre real del dueño
  telefono     = '51999111222',           -- ← CAMBIA  su celular, para los enlaces wa.me
  yape_numero  = '999111222',             -- ← CAMBIA  adónde llegan los adelantos
  yape_titular = 'Jeanpier Ramos',        -- ← CAMBIA  nombre que muestra Yape al pagar
  es_admin     = true,                    --            el dueño ve TODAS las citas
  activo       = true
where nombre = 'Jeanpier';                --            nombre ACTUAL en la tabla

-- «Bryan» es un nombre de relleno: no sabemos aún quién es el segundo barbero.
-- Si le cambias el nombre, cámbialo TAMBIÉN en CREDENCIALES-PANEL.local.md, que
-- es de donde npm run test:panel saca la pareja nombre↔cuenta.
update public.barberos set
  nombre       = 'Bryan',                 -- ← CAMBIA
  telefono     = '51999333444',           -- ← CAMBIA
  yape_numero  = '999333444',             -- ← CAMBIA
  yape_titular = 'Bryan Ramos',           -- ← CAMBIA
  es_admin     = false,                   --            sólo ve sus propias citas
  activo       = true
where nombre = 'Bryan';                   -- ← CAMBIA  nombre ACTUAL en la tabla

-- ¿Un tercer barbero? Descomenta:
-- insert into public.barberos (nombre, telefono, yape_numero, yape_titular, es_admin, orden)
-- values ('Nombre', '51900000000', '900000000', 'Titular Yape', false, 3)
-- on conflict (nombre) do nothing;


-- ───────────────────────────────────────────────────────────────────────────────
--  2 · SERVICIOS
--     adelanto_pct es el porcentaje que se pide por adelantado. 50 por defecto,
--     pero puedes subirlo en los servicios caros (un tinte de S/ 90 que no
--     aparece duele más) o bajarlo en los baratos.
-- ───────────────────────────────────────────────────────────────────────────────

update public.servicios set
  nombre          = 'Corte clásico',                                   -- ← CAMBIA
  descripcion     = 'Corte a máquina y tijera, con lavado y peinado.', -- ← CAMBIA
  duracion_min    = 30,                                                -- ← CAMBIA
  precio_centimos = 3000,                                              -- ← CAMBIA  S/ 30.00
  adelanto_pct    = 50,
  activo          = true,
  orden           = 1
where nombre = 'Corte clásico';                                        -- ← CAMBIA  nombre ACTUAL

update public.servicios set
  nombre          = 'Corte + barba',                                            -- ← CAMBIA
  descripcion     = 'Corte completo más perfilado de barba con toalla caliente.', -- ← CAMBIA
  duracion_min    = 50,                                                         -- ← CAMBIA
  precio_centimos = 4500,                                                       -- ← CAMBIA  S/ 45.00
  adelanto_pct    = 50,
  activo          = true,
  orden           = 2
where nombre = 'Corte + barba';                                                 -- ← CAMBIA

update public.servicios set
  nombre          = 'Perfilado de barba',                    -- ← CAMBIA
  descripcion     = 'Diseño, afeitado de contornos y aceite.', -- ← CAMBIA
  duracion_min    = 20,                                      -- ← CAMBIA
  precio_centimos = 2000,                                    -- ← CAMBIA  S/ 20.00
  adelanto_pct    = 50,
  activo          = true,
  orden           = 3
where nombre = 'Perfilado de barba';                         -- ← CAMBIA

update public.servicios set
  nombre          = 'Corte niño',          -- ← CAMBIA
  descripcion     = 'Menores de 12 años.', -- ← CAMBIA
  duracion_min    = 25,                    -- ← CAMBIA
  precio_centimos = 2500,                  -- ← CAMBIA  S/ 25.00
  adelanto_pct    = 50,
  activo          = true,
  orden           = 4
where nombre = 'Corte niño';               -- ← CAMBIA

update public.servicios set
  nombre          = 'Corte + tinte',                                 -- ← CAMBIA
  descripcion     = 'Corte con coloración completa. Incluye tratamiento.', -- ← CAMBIA
  duracion_min    = 90,                                              -- ← CAMBIA
  precio_centimos = 9000,                                            -- ← CAMBIA  S/ 90.00
  adelanto_pct    = 50,                                              --            ¿60 % en los caros?
  activo          = true,
  orden           = 5
where nombre = 'Corte + tinte';                                      -- ← CAMBIA

-- ¿Otro servicio más? Descomenta:
-- insert into public.servicios (nombre, descripcion, duracion_min, precio_centimos, adelanto_pct, orden)
-- values ('Nombre', 'Descripción', 40, 5000, 50, 6)
-- on conflict (nombre) do nothing;

-- ¿Sobra alguno? NO lo borres: se usa en citas antiguas. Desactívalo —
-- desaparece de la web pero el histórico se conserva:
-- update public.servicios set activo = false where nombre = 'Corte niño';


-- ───────────────────────────────────────────────────────────────────────────────
--  3 · HORARIOS
--     Por defecto: lunes a sábado 09:00–20:00, domingo 10:00–14:00, para los
--     dos barberos. Ajusta abajo sólo si tu jornada es distinta.
-- ───────────────────────────────────────────────────────────────────────────────

-- Opción A · misma jornada para todos. Borra y recrea:
/*
delete from public.horarios;
insert into public.horarios (barbero_id, dia_semana, hora_inicio, hora_fin)
select b.id, d.dia, d.ini, d.fin
from public.barberos b
cross join (values
  (1, time '09:00', time '20:00'),   -- lunes      ← CAMBIA
  (2, time '09:00', time '20:00'),   -- martes     ← CAMBIA
  (3, time '09:00', time '20:00'),   -- miércoles  ← CAMBIA
  (4, time '09:00', time '20:00'),   -- jueves     ← CAMBIA
  (5, time '09:00', time '21:00'),   -- viernes    ← CAMBIA
  (6, time '09:00', time '21:00'),   -- sábado     ← CAMBIA
  (0, time '10:00', time '14:00')    -- domingo    ← CAMBIA (borra la fila si cierras)
) as d(dia, ini, fin)
where b.activo;
*/

-- Opción B · jornada distinta por barbero. Ejemplo: Bryan no trabaja domingos.
-- delete from public.horarios
--  where dia_semana = 0
--    and barbero_id = (select id from public.barberos where nombre = 'Bryan');

-- Opción C · pausa para almorzar. Son DOS tramos el mismo día:
-- delete from public.horarios where dia_semana = 1;
-- insert into public.horarios (barbero_id, dia_semana, hora_inicio, hora_fin)
-- select b.id, 1, t.ini, t.fin
-- from public.barberos b
-- cross join (values (time '09:00', time '13:00'), (time '15:00', time '20:00')) as t(ini, fin)
-- where b.activo;


-- ───────────────────────────────────────────────────────────────────────────────
--  4 · FERIADOS Y VACACIONES  (opcional)
--     barbero_id NULL = cierra toda la barbería. Con un id = sólo ese barbero.
-- ───────────────────────────────────────────────────────────────────────────────

-- Feriados nacionales del Perú — descomenta los que apliquen:
/*
insert into public.bloqueos (barbero_id, inicio, fin, motivo) values
  (null, '2026-07-28 00:00-05', '2026-07-30 00:00-05', 'Fiestas Patrias'),
  (null, '2026-12-25 00:00-05', '2026-12-26 00:00-05', 'Navidad'),
  (null, '2027-01-01 00:00-05', '2027-01-02 00:00-05', 'Año Nuevo');
*/

-- Vacaciones de un barbero concreto:
/*
insert into public.bloqueos (barbero_id, inicio, fin, motivo)
select id, '2026-09-15 00:00-05', '2026-09-22 00:00-05', 'Vacaciones'
from public.barberos where nombre = 'Bryan';
*/


-- ───────────────────────────────────────────────────────────────────────────────
--  5 · COMPROBACIÓN
-- ───────────────────────────────────────────────────────────────────────────────

select 'barberos' as tabla, nombre, telefono, yape_numero,
       case when es_admin then 'dueño' else 'barbero' end as rol,
       case when user_id is null then '⚠ SIN USUARIO DE AUTH — no podrá entrar al panel'
            else 'ok' end as acceso
from public.barberos where activo order by orden;

select 'servicios' as tabla, nombre,
       duracion_min || ' min' as duracion,
       'S/ ' || to_char(precio_centimos / 100.0, 'FM999990.00') as precio,
       'S/ ' || to_char(round(precio_centimos * adelanto_pct / 100.0) / 100.0, 'FM999990.00') as adelanto
from public.servicios where activo order by orden;

select 'horarios' as tabla,
       b.nombre as barbero,
       (array['domingo','lunes','martes','miércoles','jueves','viernes','sábado'])[h.dia_semana + 1] as dia,
       h.hora_inicio, h.hora_fin
from public.horarios h join public.barberos b on b.id = h.barbero_id
where h.activo order by b.orden, h.dia_semana;

-- Si todo se ve bien, confirma. Si algo está mal, cambia `commit` por `rollback`
-- y vuelve a empezar sin haber tocado nada.
commit;
