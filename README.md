# Barbería — sistema de reservas

Reservas con adelanto por Yape, validación manual del comprobante y panel para
el barbero. Sede única, dos barberos, Lima (Perú).

Todo el stack cabe en **capas gratuitas**: Supabase, Cloudflare R2, Resend,
Cloudflare Turnstile, GitHub Actions y Vercel.

> Las reglas de negocio y las decisiones de diseño están en **[CLAUDE.md](./CLAUDE.md)**.
> Léelo antes de cambiar nada: casi todo lo que parece una limitación técnica
> es una decisión deliberada.

---

## Cómo funciona, en una frase

El cliente elige servicio, barbero y hora; el sistema le bloquea el horario 15
minutos; yapea el 50 % y sube la captura en la misma web; el barbero la mira y
la valida con un toque; el cliente recibe un correo con la cita adjunta para su
calendario.

---

## Requisitos

- **Node 20 o superior**
- Una cuenta en Supabase, Cloudflare y Resend (las tres tienen plan gratuito)

---

## Puesta en marcha

### 1 · Instalar

```bash
npm install
```

### 2 · Crear el proyecto de Supabase

En [supabase.com](https://supabase.com) crea un proyecto. Elige la región más
cercana a tus clientes: si el local está en Lima, `us-east-1` va bien; desde
Europa, `eu-west-3`. **La región no se puede cambiar después.**

### 3 · Cargar el esquema

Abre **SQL Editor** en el panel de Supabase, pega el contenido de
[`sql/01-schema.sql`](./sql/01-schema.sql) y ejecútalo. Crea las 9 tablas, el
RLS, las 4 funciones RPC y los datos de ejemplo (5 servicios, 2 barberos,
horarios de lunes a sábado 9–20 h y domingo 10–14 h).

El archivo es idempotente: puedes volver a correrlo sin duplicar nada.

Para comprobar que el anti-solape funciona, descomenta el bloque de pruebas del
final (sección 9) y ejecútalo: todo va dentro de una transacción que acaba en
`ROLLBACK`, así que no deja rastro.

### 4 · Crear los usuarios de los barberos

En **Authentication → Users → Add user**, crea un usuario con correo y
contraseña por cada barbero. Luego enlázalos con sus filas de `barberos`:

```sql
update barberos set user_id = (select id from auth.users where email = 'marco@tubarberia.com')
where nombre = 'Marco';

update barberos set user_id = (select id from auth.users where email = 'diego@tubarberia.com')
where nombre = 'Diego';
```

Ajusta también sus datos reales:

```sql
update barberos
set telefono = '51987654321',      -- el suyo, para los enlaces de WhatsApp
    yape_numero = '987654321',     -- adónde llegan los adelantos
    yape_titular = 'Marco A. Quispe'
where nombre = 'Marco';
```

`es_admin = true` marca al dueño: ve las citas de todos. Los demás sólo ven las
suyas, y eso lo impone el RLS, no el frontend.

### 5 · Crear el bucket de R2

En Cloudflare: **R2 → Create bucket**. **Déjalo privado** — no le añadas dominio
público ni acceso anónimo. Las capturas llevan nombres y números de operación
de personas; se sirven siempre con URLs firmadas de 5 minutos.

Luego **R2 → Manage API tokens → Create API token** con permiso *Object Read &
Write*, y guarda las credenciales.

### 6 · Configurar Resend

En [resend.com](https://resend.com): añade tu dominio en **Domains**, registra
los DNS que te indique, y crea una API key en **API Keys**.

Sin dominio verificado sólo puedes enviarte correos a ti mismo, lo cual sirve
para probar.

### 7 · Variables de entorno

```bash
cp .env.example .env.local
```

Rellena `.env.local`. Cada variable lleva un comentario con dónde sacarla.

> ⚠️ `SUPABASE_SERVICE_ROLE_KEY` ignora el RLS por completo. Nunca le pongas el
> prefijo `NEXT_PUBLIC_`, nunca la importes en un componente `'use client'` y
> nunca la subas al repositorio.

### 8 · Arrancar

```bash
npm run dev
```

- Web pública: <http://localhost:3000>
- Panel del barbero: <http://localhost:3000/panel>

---

## Comandos

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Compilación de producción |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run cron:liberar` | Libera los slots vencidos (a mano) |
| `npm run cron:recordatorios` | Manda los recordatorios de mañana (a mano) |
| `npm run cron:respaldo` | Genera el ZIP cifrado del mes (a mano) |
| `npm run tipos` | Regenera `src/lib/basedatos.ts` desde el esquema remoto |

## Pruebas

| Comando | Qué comprueba | Necesita |
| --- | --- | --- |
| `npm run test:lib` | `.ics` (RFC 5545), teléfonos, magic bytes, dinero | nada |
| `npm run test:e2e` | Flujo de reserva, precio no inyectable, caché | `npm run dev` en otra terminal |
| `npm run test:panel` | Login real y aislamiento por RLS entre barberos | `CREDENCIALES-PANEL.local.md` |
| `pruebas/anti-solape.sql` | Anti-solape GiST, ledger inmutable, permisos de `anon` | pegarlo en el SQL Editor |

`pruebas/anti-solape.sql` termina lanzando el informe como excepción para
revertir la transacción: **el `ERROR: P0001: INFORME DE PRUEBAS…` es el
resultado, no un fallo.** No deja ninguna fila en la base.

> Compilar no basta. Cuatro bugs reales de este proyecto —`pgcrypto` en otro
> esquema, la caché de `fetch` de Next, la relación ambigua de PostgREST y los
> valores de relleno en `.env`— pasaban el typecheck y el build sin rechistar.
> Sólo aparecieron al ejecutar contra Supabase. Están explicados en CLAUDE.md §5 bis.

---

## Despliegue

### Vercel

1. Importa el repositorio.
2. Copia todas las variables de `.env.local` en **Settings → Environment Variables**.
3. Ajusta `NEXT_PUBLIC_URL_SITIO` a tu dominio real.

### Los tres crons (GitHub Actions)

En **Settings → Secrets and variables → Actions**:

**Secrets:**
`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`,
`RESEND_FROM`, `RESPALDO_PASSWORD`

**Variables:**
`NEXT_PUBLIC_NOMBRE_LOCAL`, `NEXT_PUBLIC_DIRECCION_LOCAL`, `NEXT_PUBLIC_URL_SITIO`

| Workflow | Cuándo | Qué hace |
| --- | --- | --- |
| `liberar-slots.yml` | cada 5 min | Libera reservas de más de 15 min sin captura |
| `recordatorios.yml` | 14:00 UTC = 9:00 Lima | Correo a las citas confirmadas de mañana |
| `respaldo-mensual.yml` | día 1, 08:00 UTC | ZIP cifrado con citas, pagos y clientes |

Los tres se pueden lanzar a mano desde la pestaña **Actions** (`workflow_dispatch`).

> GitHub Actions no garantiza puntualidad en los crons: bajo carga pueden
> retrasarse varios minutos. Para liberar slots da igual, porque la RPC compara
> contra `now()` en la base — un retraso sólo significa que el slot se libera un
> poco más tarde, nunca que se libere uno que no tocaba.

---

## El respaldo mensual

Genera `respaldos/barberia-YYYY-MM.zip` con `citas.csv`, `pagos.csv`,
`clientes.csv` y un `LEEME.txt`, **cifrado con AES-256**.

El cifrado no es opcional: el archivo lleva nombres, teléfonos y correos, y en
Perú eso es dato personal bajo la **Ley 29733**.

El workflow lo publica como artefacto de GitHub Actions (90 días de retención).
Bájalo de ahí y súbelo a Google Drive. Deliberadamente **no** se sube a Drive
desde el cron: haría falta guardar una credencial de Google con permiso de
escritura en los secretos del repo, y eso amplía la superficie de ataque más de
lo que ahorra.

---

## Estructura

```
sql/01-schema.sql       Esquema, RLS, RPC, semillas, pruebas comentadas
src/app/                Rutas (App Router) y API routes
src/components/         FlujoReserva, Ticket, PanelBarbero, primitivas
src/lib/                Supabase, validación, fechas, WhatsApp, correo, .ics, R2
scripts/                Los tres crons
.github/workflows/      Sus disparadores
```

---

## Resolución de problemas

**«Falta la variable de entorno X»** — no está en `.env.local`, o no reiniciaste
el servidor de desarrollo tras añadirla.

**«El almacenamiento no está configurado»** al subir la captura — faltan las
cuatro variables `R2_*`.

**Los correos no llegan** — el dominio no está verificado en Resend, o
`RESEND_FROM` no usa ese dominio. Mira la tabla `notificaciones`: cada intento
queda registrado con su error.

**«Ese horario acaba de ser tomado»** — no es un fallo. Otra persona reservó ese
slot mientras el cliente rellenaba el formulario. El `EXCLUDE` de la base lo
impidió, que es exactamente su trabajo.

**El panel sale vacío** — el usuario de Auth no está enlazado con ninguna fila
de `barberos` (paso 4), o esa fila tiene `activo = false`.
