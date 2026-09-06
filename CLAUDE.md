# CLAUDE.md — reglas de este proyecto

Sistema de reservas de una barbería. Sede única en Lima, Perú. Dos barberos.

Este archivo existe para que una sesión futura no reinvente ni rompa lo que ya
está decidido. **Casi todo lo de aquí parece una limitación técnica y no lo es:
son decisiones de negocio.** Si algo te parece que "se podría mejorar
automatizándolo", lee primero el porqué. Si aun así hay que cambiarlo, que lo
pida el dueño explícitamente.

---

## 1 · El flujo, de principio a fin

```
cliente entra a la web
  → elige servicio
  → elige barbero
  → elige día y hora
  → deja nombre, celular y (opcional) correo
  → se crea la cita: estado pendiente_pago, el slot queda BLOQUEADO 15 min
  → yapea el 50 % del precio
  → sube la captura EN LA MISMA WEB          ← nunca por WhatsApp
  → estado en_revision                        ← el slot sigue bloqueado
  → el barbero mira la captura en el panel y da UN TOQUE
  → estado confirmada + correo con .ics adjunto
  → el día de la cita: "Atendido" o "No vino"
```

### Estados

```
pendiente_pago ──> en_revision ──> confirmada ──> atendida
       │                │                    └──> no_show
       │                └──(rechazar)──> pendiente_pago (+30 min de plazo)
       └──(vencen los 15 min)──> liberada

cualquier estado ──> cancelada
```

`liberada` y `cancelada` devuelven el slot al pool. Todos los demás lo retienen.

---

## 2 · Las cinco reglas que no se tocan

### 2.1 · El anti-solape es GiST, NO un UNIQUE

En `citas`:

```sql
rango tstzrange generated always as (tstzrange(inicio, fin, '[)')) stored,

constraint citas_sin_solape exclude using gist (
  barbero_id with =,
  rango      with &&
) where (estado in ('pendiente_pago','en_revision','confirmada','atendida'))
```

**Por qué no `UNIQUE(barbero_id, inicio)`:** los servicios duran distinto (30
min, 50 min, 90 min). Con un UNIQUE sobre el instante de inicio, esto pasa
sin que nadie se entere:

```
cita A   16:00 ──────────────> 16:50    (corte + barba, 50 min)
cita B          16:30 ───────────────> 17:00    (corte clásico, 30 min)
                 └── se pisan 20 minutos ──┘
```

Los inicios son distintos (16:00 ≠ 16:30), así que el UNIQUE no dice nada.
El operador `&&` sobre `tstzrange` sí lo detecta. Y lo detecta **dentro del
motor**, de forma atómica: da igual cuántas peticiones concurrentes lleguen.
Comprobado con dos transacciones en paralelo — una gana, la otra recibe
`23P01` limpiamente.

`btree_gist` es obligatoria: sin ella no se puede mezclar `uuid WITH =` y
`tstzrange WITH &&` en el mismo índice.

El intervalo es `'[)'`: inicio incluido, fin excluido. Así 16:00–16:30 y
16:30–17:00 **no** se consideran solapadas — se tocan, no se pisan.

### 2.2 · El precio se congela, y nunca viene del cliente

`citas` guarda copia de `servicio_nombre`, `duracion_min`, `precio_centimos`
y `adelanto_centimos` en el momento de reservar. Si mañana sube el catálogo,
la cita de ayer no cambia.

**Nunca hagas JOIN a `servicios` para mostrar el precio de una cita ya creada.**

Y en el otro sentido: `POST /api/reservar` **no acepta ningún precio, monto ni
estado del body**. `crear_reserva()` los lee de la tabla `servicios`. Si
alguien añade un campo `precio` al esquema Zod de `esquemaReserva`, ha roto la
regla más importante del sistema: cualquiera podría reservar un corte de S/ 90
pagando S/ 1 de adelanto.

### 2.3 · La confirmación es MANUAL. Siempre.

Ninguna función pasa una cita a `confirmada` al recibir la imagen.
`registrar_captura()` sólo hace `pendiente_pago → en_revision`.

**Por qué:** una captura de Yape es trivial de falsificar — se edita en el
móvil en treinta segundos. La validación real es que un humano compare el
monto, la hora y el nombre contra su propia app de Yape. El toque del barbero
*es* la verificación; automatizarlo sería quitar la única comprobación que
existe.

No propongas OCR, ni webhooks de Yape (no existe API pública), ni
"confirmación automática si el monto coincide".

### 2.4 · El ledger de `pagos` es inmutable

Sin `UPDATE`. Sin `DELETE`. Un error se corrige **insertando una fila nueva**
de tipo `reembolso` con monto negativo. `SUM(monto_centimos)` da el neto.

Hay dos capas:
- **RLS**: no existe política de UPDATE ni de DELETE. Su ausencia ya las prohíbe.
- **Trigger** `pagos_son_inmutables()`: porque `service_role` **ignora el RLS
  por completo**. Sin el trigger, un script con la clave de servicio podría
  reescribir la contabilidad. Con él, ni el superusuario puede.

Qué se inserta y cuándo:
- `confirmar` → `adelanto` (el 50 %)
- `atendida` → `saldo` (el resto, en efectivo)
- `no_show` → **nada**. El adelanto ya cobrado se queda como ingreso. No se
  reembolsa: para eso se cobra por adelantado.

### 2.5 · WhatsApp es SEMIAUTOMÁTICO, a propósito

`src/lib/whatsapp.ts` **sólo genera enlaces `wa.me` con el texto ya escrito**.
No hay API de WhatsApp en este proyecto. Ni Cloud API, ni Baileys, ni ningún
puente no oficial.

**Por qué:**
- Cuesta $0. La Cloud API cobra por conversación iniciada por el negocio.
- No hay riesgo de baneo: los mensajes salen del móvil real del barbero.
- El barbero relee antes de mandar, y a veces edita. Es su cliente.

El cron de recordatorios manda **sólo correo**. Los WhatsApp los dispara el
barbero desde la pestaña "Mañana" del panel, uno a uno.

**El correo sí es 100 % automático** (Resend), y el de confirmación lleva un
`.ics` adjunto con alarma 2 h antes.

---

## 3 · Seguridad

| Regla | Dónde se aplica |
| --- | --- |
| `anon` no tiene ni un GRANT sobre `citas`, `clientes`, `pagos`, `auditoria` | `sql/01-schema.sql` §7.1 y §7.3 — es una capa **anterior** al RLS: sin GRANT, la política ni se evalúa |
| El anónimo opera sólo por 3 RPC `SECURITY DEFINER` | `horarios_disponibles`, `crear_reserva`, `registrar_captura` |
| Cada barbero ve sólo sus citas; el admin, todas | RLS de `citas`. **No** en el frontend: `src/app/panel/page.tsx` no filtra por barbero |
| `SUPABASE_SERVICE_ROLE_KEY` nunca lleva prefijo `NEXT_PUBLIC_` ni entra en un `'use client'` | `clienteServidor()` lanza si detecta `window` |
| Bucket R2 privado, URLs firmadas de 5 min | `src/lib/r2.ts` |
| El nombre del archivo subido lo genera el servidor (uuid) | `generarClaveCaptura()` — el nombre del usuario filtra datos y permite path traversal |
| Las imágenes se validan por **magic bytes**, no por extensión ni Content-Type | `esImagenReal()` — ambos los controla el atacante |
| Sesión del barbero en **cookies**, no en localStorage | `@supabase/ssr`. Un XSS no puede leer el token |
| Sin `localStorage`/`sessionStorage` en todo el frontend | — |
| Retomar una reserva exige código **y** celular, más Turnstile | `buscar_reserva()` + `api/cita/` |
| CSP, HSTS y `no-store` en `/panel` y `/cita` | `next.config.mjs` |

### Retomar una reserva: por qué está montado así

No guardar nada en el teléfono tiene un precio: si la persona recarga a mitad
del pago, pierde el ticket y no puede subir la captura **habiendo ya yapeado**.
`/cita` cierra ese agujero sin traicionar la regla.

Lo que lo hace seguro, y ninguna de las tres piezas sobra:

1. **Dos factores.** El código son 31⁵ ≈ 28,6 millones de combinaciones; el
   celular es el otro. Ninguno basta solo.
2. **Un único mensaje de error.** «Código que no existe» y «celular que no
   corresponde» responden EXACTAMENTE lo mismo. Si difirieran, esto sería un
   oráculo para descubrir qué códigos son válidos probando con un celular
   cualquiera. Hay una prueba e2e que compara las dos cadenas.
3. **Turnstile**, igual que en `/api/reservar`. Sin él, lo anterior se ataca
   con un script.

Y no devuelve `cliente_email`: quien recupera demostró tener el celular, no el
correo. También lo cubre una prueba.

### La CSP tiene `'unsafe-inline'` en `script-src`, y es a propósito

Next inyecta los scripts de hidratación en línea. Quitarla exige un nonce por
petición, o sea middleware en cada request. Aun con ella, la CSP bloquea lo que
más duele: cargar código de un host ajeno y filtrar datos con un `fetch` a otro
dominio. Los hosts permitidos son tres y cada uno está por algo concreto —
míralos comentados en `next.config.mjs` antes de tocarlos.

`src/lib/sesion.ts` importa `next/headers` → **sólo servidor**. El cliente de
navegador vive aparte en `src/lib/sesion-navegador.ts`. Si los juntas, el build
falla.

---

## 4 · Tiempo

Zona de negocio: **America/Lima, UTC-5 fijo**. Perú no aplica horario de verano
desde 1994, así que el desfase es constante — pero `src/lib/fechas.ts` lo lee
del sistema de husos en vez de cablearlo.

- Todo en la base es `timestamptz`. Nunca `timestamp` a secas.
- `horarios.dia_semana` sigue `EXTRACT(dow)`: **0 = domingo … 6 = sábado**.
- La rejilla de reserva es de 5 minutos, con pasos de 15 por defecto.
- Anticipación mínima: 30 minutos (hay que llegar al local).
- El cron de recordatorios corre a las **14:00 UTC = 9:00 en Lima**, siempre.
  No hay que ajustarlo dos veces al año.

### El cron de 5 minutos NO es de fiar, y la base no depende de él

`liberar-slots.yml` declara `cron: '*/5 * * * *'`, pero GitHub deprioriza los
`schedule` de los repos públicos gratuitos. Medido el 2026-09-06 sobre 17 h de
historial: **5 ejecuciones donde tocaban ~200**. Los huecos entre disparos
fueron de 2 h 40 min, 4 h 45 min, 3 h y 3 h. No es un fallo de configuración —
el cron es válido, la rama es la correcta y el workflow está `active`. Es la
cola de GitHub, y el retraso es de dos órdenes de magnitud.

Le pasa igual a `recordatorios.yml`: programado a las 14:00 UTC (9:00 en Lima),
ese día corrió a las **16:38 UTC = 11:38 en Lima**. Si algún día importa que el
recordatorio salga a una hora concreta, hay que sacarlo de GitHub Actions.

Por eso el vencimiento de los 15 minutos vive **en la base**, no en el cron:

- `horarios_disponibles()` no cuenta como ocupada una `pendiente_pago` cuyo
  `expira_en` ya pasó.
- `crear_reserva()` las pasa a `liberada` **antes** de insertar. Este paso no es
  opcional: el `EXCLUDE` sí las sigue contando, así que sin el barrido la web
  ofrecería el hueco y el insert devolvería `23P01` sobre un slot libre.

El cron sigue existiendo, pero ahora es **limpieza**, no la única defensa. Si lo
borras, nadie se entera; si borras el barrido, un abandono a mitad del Yape mata
ese horario hasta que GitHub decida aparecer.

Dinero: **siempre en céntimos de sol** (`integer`). `3000` = S/ 30.00. Nunca
float, nunca `numeric` para operar.

---

## 5 · Sistema de diseño — «El Turno»

La idea rectora: el artefacto de una barbería no es la tijera, es **el papelito
con tu número**. La interfaz es una ficha que se va llenando y termina en un
**ticket perforado**. Ese ticket es lo que el cliente captura y comparte, así
que es donde va toda la calidad.

Los tokens están en `tailwind.config.ts`. **No escribas hex sueltos en un
`className`**: si falta un color, se añade al config.

### Color

| Token | Hex | Uso |
| --- | --- | --- |
| `tinta` | `#0D1420` | Fondo. Azul entintado, **nunca `#000`**: el negro puro sobre OLED produce halos y hace ilegible el texto tenue |
| `tinta-900` | `#0A1019` | Pozos, sombras |
| `tinta-800` | `#121A28` | Tarjetas |
| `tinta-700` | `#18212F` | Superficie elevada |
| `tinta-600` | `#212C3D` | Bordes |
| `tinta-500` | `#2E3A4D` | Bordes en foco |
| `hueso` | `#EDE8DF` | Texto principal. Blanco roto: `#FFF` sobre oscuro vibra y cansa |
| `hueso-tenue` | `#97A1B3` | Texto secundario |
| `hueso-apagado` | `#5F6A7C` | Deshabilitado, notas al pie |
| `laton` | `#C2A063` | Acento. **Latón envejecido, no oro brillante ni terracota** |
| `laton-claro` | `#D9BC85` | Hover |
| `laton-hondo` | `#8E7141` | Activo, bordes del acento |
| `laton-humo` | `rgba(194,160,99,0.12)` | Fondos lavados |
| `papel` | `#F2EEE4` | **El ticket.** Único elemento claro de toda la interfaz |
| `papel-sombra` | `#DED7C7` | Líneas de corte del ticket |
| `papel-tinta` | `#1A1E26` | Texto sobre el ticket |
| `exito` | `#4C9A6A` | |
| `alerta` | `#D9A441` | |
| `error` | `#C7584F` | |

### Tipografía

| Familia | Fuente | Uso |
| --- | --- | --- |
| `font-display` | **Anton** (400) | Rótulos en MAYÚSCULAS. Condensada, trazo grueso: es la voz que grita el número de turno |
| `font-sans` | **Manrope** | Cuerpo. Neutra, legible a 15 px en un celular con 4G |
| `font-mono` | **IBM Plex Mono** (400/500/600) | **Horas, códigos, montos y el cronómetro.** Siempre |

Autoalojadas con `next/font/google`: cero peticiones a `fonts.googleapis.com`
en runtime, cero CLS.

Usa `.tabular` (`font-variant-numeric: tabular-nums`) en cualquier número que
cambie: sin eso el cronómetro tiembla cada segundo y el ojo se va a él.

### Movimiento

Curvas propias — las de CSS son demasiado blandas:

```
salida   cubic-bezier(0.23, 1, 0.32, 1)     entradas y salidas
vaiven   cubic-bezier(0.77, 0, 0.175, 1)    movimiento en pantalla
cajon    cubic-bezier(0.32, 0.72, 0, 1)     cajones tipo iOS
```

- Pulsar un botón: `scale(0.97)` en 140 ms. Es lo que hace que la interfaz
  "responda".
- Nada entra desde `scale(0)`: se empieza en `0.96` con opacidad. Nada en el
  mundo real aparece de la nada.
- Nada de `ease-in` en UI: arranca lento y se siente pesado.
- Ninguna animación de interfaz pasa de 300 ms.
- `:hover` sólo tras `@media (hover: hover) and (pointer: fine)`: en táctil se
  queda pegado al tocar.
- `prefers-reduced-motion` elimina el **desplazamiento**, no la opacidad ni el
  color: eso ayuda a entender el cambio de estado.

### El ticket

Las muescas laterales son **máscaras CSS reales** (`mask-image` con
`radial-gradient`), no puntos pintados encima: así se ven recortadas contra
cualquier fondo cuando el cliente hace captura de pantalla y la manda por
WhatsApp. La variable `--corte` fija su altura y debe coincidir con la línea
perforada.

### Mobile-first estricto

La mayoría de las reservas entran desde un celular con 4G.
- Todo lo tocable mide **48 px** mínimo.
- Días y horas van en franjas horizontales con `scroll-snap`.
- Los `input` van a **16 px**: por debajo, Safari hace zoom al enfocar y
  descoloca la página.
- La captura se comprime **en el navegador** a webp ~100 KB antes de subir. Una
  captura de pantalla de un móvil moderno pesa 2–4 MB; por 4G eso son 20
  segundos y datos del cliente.

---

## 5 bis · Trampas de Supabase que ya nos mordieron

Las cinco se detectaron **ejecutando**, no compilando. Todas pasaban
`tsc --noEmit` y `next build` sin una queja. Un Postgres normal, un Next en
producción y un navegador se comportan distinto entre sí. **Si tocas algo de
esto, vuelve a correr las pruebas contra el proyecto real.**

### a) `pgcrypto` vive en el esquema `extensions`, no en `public`

`generar_codigo()` usaba `gen_random_bytes()`. En un Postgres corriente la
extensión se instala en `public` y todo va bien; en Supabase está en
`extensions`, así que desde un `SECURITY DEFINER` con
`search_path = public, pg_temp` **no se ve**:

```
ERROR 42883: function gen_random_bytes(integer) does not exist
```

Ninguna reserva se podía crear. Arreglado sacando la entropía de
`gen_random_uuid()` (integrada en `pg_catalog` desde PG 13) pasada por `md5`.
Además todas las funciones `SECURITY DEFINER` llevan ahora
`search_path = public, extensions, pg_temp`.

**Regla:** no dependas de ninguna extensión dentro de un `SECURITY DEFINER`
sin poner `extensions` en el `search_path`.

### b) Next cachea los `fetch` que hace supabase-js

`export const dynamic = 'force-dynamic'` hace dinámica la **ruta**, pero Next
sigue cacheando las peticiones HTTP que supabase-js lanza por dentro. Tras
ocupar las 19:30, la RPC devolvía 17 slots correctos y la ruta seguía
respondiendo los 20 de antes — **en 6 ms en lugar de 1500**, que es la firma
inconfundible de una respuesta cacheada.

Al cliente se le ofrecían horas ya ocupadas, y al elegirlas recibía un 409.

Arreglado con dos capas: `export const fetchCache = 'force-no-store'` en las
rutas, y `clientePublico({ sinCache: true })`, que inyecta un `fetch` con
`cache: 'no-store'`. **La portada NO lo usa**: el catálogo sí conviene que se
cachee (ISR de 300 s).

**Regla:** todo lo que dependa del estado de la agenda va con `sinCache: true`.

### c) `citas` tiene DOS claves foráneas a `barberos`

`barbero_id` y `confirmada_por`. Un `select('... barberos(nombre)')` falla:

```
Could not embed because more than one relationship was found for 'citas' and 'barberos'
```

Hay que decirle cuál: **`barberos!citas_barbero_id_fkey(nombre)`**. Afecta a
`panel/page.tsx`, `api/captura`, `api/panel/validar` y `scripts/recordatorios`.
Con el panel esto no daba error visible: la página salía **en blanco**.

### d) `process.env[variable]` NO funciona en el navegador

La peor de todas, porque **compilaba, pasaba el typecheck, pasaba el build y
pasaba las 72 pruebas** — todas atacaban el servidor.

`entorno.ts` lee `process.env[nombre]` con clave **dinámica**. Next sustituye
las `NEXT_PUBLIC_` por su valor en tiempo de compilación, pero sólo cuando la
propiedad se escribe **literal**:

```ts
process.env.NEXT_PUBLIC_SUPABASE_URL   // ✅ se sustituye por el valor
process.env[nombre]                    // ❌ no hay nada que sustituir
```

En el navegador `process.env` llega vacío, así que `requerida()` lanzaba
siempre y `clienteNavegador()` no se podía construir. **El login del panel
estaba completamente roto**, y el síntoma era un engañoso «No se pudo
conectar. Revisa tu internet» — el `catch` genérico del formulario.

**Reglas:**
- `entorno.ts` (`requerida`/`opcional`) es **SÓLO PARA SERVIDOR**.
- En un componente `'use client'`, lee la variable con su literal. Ejemplo
  hecho: `src/lib/sesion-navegador.ts`.
- `npm run test:e2e` incluye ahora una prueba que descarga los chunks de
  `/panel/login` y comprueba que la URL de Supabase esté inyectada. Es la
  única forma de detectar esta clase de fallo sin abrir un navegador.

### e) Valores de relleno en `.env.example` son peor que valores vacíos

`TURNSTILE_SECRET_KEY=0x4AAAAAAA...` no está vacío, así que
`verificarTurnstile()` lo daba por configurado, preguntaba a Cloudflare con un
secreto inexistente y **rechazaba todas las reservas**. Las credenciales del
ejemplo van vacías: vacío significa «no configurado», y eso el código lo
entiende.

### f) Las comillas de un `.env` NO se quitan en el panel de Vercel

`RESEND_FROM="Barbería <onboarding@resend.dev>"` es correcto en un archivo
`.env`: dotenv quita las comillas al leerlo. Pero al copiar esa línea al panel
de Vercel, **el valor pasa a incluir las comillas**, porque ahí lo que pegas es
literalmente el valor.

Resend contestaba a cada envío:

```
Invalid `from` field. The email address needs to follow the
`email@example.com` or `Name <email@example.com>` format.
```

**En producción no salía un solo correo.** Ni la confirmación con el `.ics` ni
el recordatorio. En local funcionaba perfectamente, así que no se veía, y el
fallo era **silencioso**: se anotaba en `notificaciones` con
`estado = 'fallido'` y la reserva seguía adelante como si nada. Se descubrió
mirando esa tabla después de una reserva real en producción, no ejecutando
pruebas — las pruebas de correo no llegan a Resend.

Arreglado en dos sitios:
- `sinComillas()` en `entorno.ts`: `requerida()` y `opcional()` quitan las
  comillas que envuelvan cualquier variable. Protege a todas, no sólo a esta.
- `remitenteValido()` en `email.ts`: rechaza el valor antes de llamar a Resend,
  con un mensaje que dice qué hacer. Ojo con el orden de las comprobaciones: si
  extraes el correo de entre `<>` **antes** de mirar las comillas exteriores, el
  valor roto pasa la validación — el correo de dentro es válido. Hay una prueba
  en `test:lib` que fija justo ese caso.

**Regla:** ninguna variable de entorno lleva comillas. Ni en `.env.local`, ni
en Vercel, ni en los secretos de GitHub.

---

## 6 · Mapa del código

```
sql/01-schema.sql          Esquema completo, RLS, 4 RPC, semillas y pruebas
                           comentadas al final (sección 9)

src/lib/
  entorno.ts               Lectura PEREZOSA de env (si no, `next build` revienta en CI)
  supabase.ts              clientePublico() / clienteServidor() + tipos del dominio
  sesion.ts                SÓLO SERVIDOR (next/headers)
  sesion-navegador.ts      SÓLO CLIENTE
  validacion.ts            Zod, normalizarTelefono, Turnstile, magic bytes
  fechas.ts                Formato en America/Lima
  whatsapp.ts              Enlaces wa.me. NADA de API
  email.ts                 Resend + plantillas
  ics.ts                   Generador .ics (RFC 5545) sin dependencias
  r2.ts                    SigV4 a mano (el SDK de AWS son 15 MB para 2 operaciones)

src/app/
  page.tsx                 Portada + flujo de reserva
  cita/                    Retomar una reserva (código + celular)
  privacidad/              Aviso de la Ley 29733
  panel/                   Login y panel del barbero

src/app/api/
  disponibilidad/          GET  → horarios_disponibles()
  reservar/                POST → crear_reserva()
  cita/                    POST → buscar_reserva()  (Turnstile + 2 factores)
  captura/                 POST → magic bytes + R2 + registrar_captura() + correo
  panel/validar/           POST → el toque del barbero

src/components/
  FlujoReserva.tsx         5 pasos + cronómetro + subida
  RecuperarReserva.tsx     Formulario de /cita; al encontrarla delega en el flujo
  Ticket.tsx               El elemento firma
  Turnstile.tsx            El widget, compartido por la reserva y /cita
  PanelBarbero.tsx         3 pestañas
  ui.tsx                   Primitivas

scripts/                   Los 3 crons
.github/workflows/         Sus disparadores
```

### Orden de `POST /api/captura` (no lo cambies)

1. validar identidad (id **+** código)
2. validar magic bytes
3. subir a R2
4. `registrar_captura()`
5. correo

El paso 4 va **después** de la subida: si R2 falla, la cita sigue en
`pendiente_pago` y el cliente puede reintentar dentro de su plazo. Al revés
quedaría "en revisión" sin imagen que revisar.

---

## 7 · Antes de decir que algo está terminado

```bash
npm run typecheck     # siempre
npm run build         # si tocaste UI
npm run test:lib      # librerías puras: .ics, teléfonos, magic bytes
npm run test:e2e      # con `npm run dev:pruebas` corriendo en otra terminal
npm run test:panel    # login real + aislamiento por RLS entre barberos
```

`dev:pruebas`, y no `dev`, porque desde que `TURNSTILE_SECRET_KEY` tiene valor
real, `/api/reservar` devuelve **403** a toda petición sin token de widget —y un
script no tiene navegador que lo resuelva—. `scripts/dev-pruebas.mjs` levanta
Next con el secreto de prueba público de Cloudflare, que acepta cualquier token.
No toca `.env.local`: Next respeta lo que ya venga en `process.env`.

Y si tocaste `sql/01-schema.sql`, pega `pruebas/anti-solape.sql` en el SQL
Editor de Supabase. Son 17 comprobaciones: solape parcial, GiST vs UNIQUE,
slot liberado, ledger inmutable y permisos del rol `anon`. Todo se revierte
solo — el `ERROR: P0001: INFORME DE PRUEBAS...` **es** el resultado.

**El typecheck y el build no bastan.** Los cuatro fallos de la sección 5 bis
compilaban perfectamente y sólo aparecieron al ejecutar contra Supabase.

Los tipos de `src/lib/basedatos.ts` están generados. Tras cambiar el esquema:

```bash
npm run tipos     # supabase gen types typescript --linked
```

---

## 8 · Cosas que NO hay que hacer

- Cambiar el `EXCLUDE` por un `UNIQUE`.
- Quitar el barrido de vencidas de `crear_reserva()` creyendo que para eso ya
  está el cron. El cron llega tarde o no llega.
- Aceptar precio, monto o estado desde el body de una petición pública.
- Confirmar una cita automáticamente al recibir la captura.
- Añadir `UPDATE` o `DELETE` a `pagos`.
- Meter una API de WhatsApp.
- Poner el bucket de R2 en público, o guardar una URL firmada en la base.
- `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` (no existe y no debe existir).
- `localStorage` / `sessionStorage`.
- Filtrar por `barbero_id` en el frontend creyendo que eso es el control de
  acceso. El control es el RLS.
- Servicios de pago. Todo el stack cabe en capas gratuitas.
