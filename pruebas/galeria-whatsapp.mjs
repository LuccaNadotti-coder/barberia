/** Interacción de componentes reales con API simulada. No envía WhatsApp ni crea citas. */
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { readFileSync, mkdirSync } from 'node:fs'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url)
if (process.env.TEST_SCREENSHOT_DIR) mkdirSync(process.env.TEST_SCREENSHOT_DIR,{recursive:true})
const { build } = require('esbuild')
// playwright-core, NO playwright: el paquete grande se descarga ~500 MB de
// navegadores en el postinstall y aquí no hace falta ni uno — se lanza el Edge
// que ya trae Windows con `channel: 'msedge'`.
const { chromium } = await import('playwright-core')
const resultado = await build({
  stdin: { contents: `
    import React from 'react'; import { createRoot } from 'react-dom/client';
    import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
    import { FlujoReserva } from './src/components/FlujoReserva';
    import { PanelBarbero } from './src/components/PanelBarbero';
    const base = { id:'00000000-0000-4000-8000-000000000001',codigo:'BR-ABCDE',
      inicio:'2030-01-15T15:00:00Z',fin:'2030-01-15T15:30:00Z',
      expira_en:new Date(Date.now()+900000).toISOString(), servicio_nombre:'Corte prueba',
      duracion_min:30,precio_centimos:3000,adelanto_centimos:1500,
      barbero_nombre:'Barbero de prueba',yape_numero:'900000001',yape_titular:'Titular diferente',
      cliente_nombre:'Cliente prueba',cliente_telefono:'51900000002',cliente_email:null,
      notas:null,captura_url:null,captura_subida_en:null };
    const params=new URLSearchParams(location.search); const mode=params.get('mode');
    const root=createRoot(document.getElementById('app'));
    let estado='en_revision';
    const router={push(){},replace(){},prefetch(){},back(){},forward(){},refresh(){render()}};
    function render(){root.render(mode==='panel'
      ? <AppRouterContext.Provider value={router}><PanelBarbero nombreLocal="Demo" barbero={{nombre:'Barbero prueba',es_admin:true}}
          porValidar={estado==='en_revision'?[{...base,estado}]:[]} hoy={[]} manana={[]}
          proximas={estado==='confirmada'?[{...base,estado}]:[]} /></AppRouterContext.Provider>
      : <FlujoReserva servicios={[]} barberos={[]} nombreLocal="Demo" reservaInicial={{...base,estado:'pendiente_pago'}} />)}
    window.aplicar=accion=>{estado=accion==='confirmar'?'confirmada':'pendiente_pago'};
    render();`, resolveDir: process.cwd(), loader: 'tsx' },
  bundle:true, write:false, platform:'browser', format:'iife', jsx:'automatic',
  define:{'process.env.NODE_ENV':'"production"', 'process.env':'{}'}, logLevel:'silent',
})
const css=(await require('postcss')([require('tailwindcss')('./tailwind.config.ts'),require('autoprefixer')])
  .process(readFileSync('src/app/globals.css','utf8'),{from:'src/app/globals.css'})).css
const server=createServer((req,res)=>{
  res.setHeader('Content-Type',req.url==='/app.js'?'application/javascript':'text/html')
  res.end(req.url==='/app.js'?resultado.outputFiles[0].text:`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="app"></div><script src="/app.js"></script>`)
})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
let browser
try {
  browser=await chromium.launch({channel:'msedge',headless:true})
  const origin=`http://127.0.0.1:${server.address().port}`
  for(const width of [360,1280]) {
    const page=await browser.newPage({viewport:{width,height:900}})
    const errores=[];page.on('pageerror',e=>{errores.push(e.message);console.error('ERROR navegador de prueba:',e.message)})
    let captura=false
    await page.route('**/api/captura',async route=>{
      assert.match(route.request().headers()['content-type'],/multipart\/form-data/)
      captura=true;await route.fulfill({json:{ok:true}})
    })
    await page.goto(origin)
    const input=page.locator('input[type=file]')
    assert.equal(await input.getAttribute('capture'),null)
    assert.equal(await input.evaluate(el=>getComputedStyle(el).position),'absolute','Estilos reales cargados')
    assert.equal(await page.getByText('900 000 001').isVisible(),true)
    assert.equal(await page.getByText('Titular diferente',{exact:true}).isVisible(),true)
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
    if (process.env.TEST_SCREENSHOT_DIR) await page.screenshot({path:`${process.env.TEST_SCREENSHOT_DIR}/pago-${width}.png`,fullPage:true})
    const imagen=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=200;c.height=300;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,200,300);x.fillStyle='black';x.fillText('PRUEBA SIN VALOR',10,50);return c.toDataURL('image/png').split(',')[1]})
    const elegir=page.waitForEvent('filechooser')
    await page.getByRole('button',{name:'Elegir captura de la galería'}).click()
    await (await elegir).setFiles({name:'captura.png',mimeType:'image/png',buffer:Buffer.from(imagen,'base64')})
    await page.getByRole('heading',{name:'Recibimos tu pago'}).waitFor()
    assert.equal(captura,true)
    console.log('PASA: archivo guardado → compresión → subida → ticket, ancho',width)
    await page.route('**/api/panel/validar',async route=>{
      const {accion}=route.request().postDataJSON()
      await page.evaluate(a=>window.aplicar(a),accion)
      await route.fulfill({json:{ok:true}})
    })
    await page.goto(origin+'/?mode=panel')
    await page.getByRole('link',{name:'Avisar: comprobante en revisión'}).waitFor()
    await page.getByRole('button',{name:'Confirmar',exact:true}).click()
    await page.getByRole('status').filter({hasText:'Cita aprobada'}).waitFor()
    assert.equal(await page.getByRole('link',{name:'Enviar confirmación',exact:true}).count(),2)
    const enlace=await page.getByRole('link',{name:'Enviar confirmación',exact:true}).first().getAttribute('href')
    assert.match(enlace,/^https:\/\/wa.me\/51900000002/)
    if (process.env.TEST_SCREENSHOT_DIR) await page.screenshot({path:`${process.env.TEST_SCREENSHOT_DIR}/panel-${width}.png`,fullPage:true})
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
    await page.goto(origin+'/?mode=panel')
    await page.getByRole('button',{name:'Rechazar',exact:true}).click()
    await page.getByLabel('¿Qué le decimos? (opcional)').fill('Monto distinto')
    await page.getByRole('button',{name:'Rechazar',exact:true}).click()
    const rechazo=page.getByRole('link',{name:'Avisar: corregir comprobante'})
    await rechazo.waitFor()
    assert.match(decodeURIComponent(await rechazo.getAttribute('href')),/Monto distinto/)
    assert.deepEqual(errores,[])
    console.log('PASA: revisión, aprobación, rechazo y avisos visibles, ancho',width)
    await page.close()
  }
} finally {
  await browser?.close()
  await new Promise(resolve=>server.close(resolve))
}
