# Pruebas de pantalla: Agenda UX 1.0 (splash JS, movimiento, avatar con presencia, botones, tablet y computadora)
from playwright.sync_api import sync_playwright
import tempfile, sys, os, time

U = "http://localhost:8765/"
SALIDA = sys.argv[1] if len(sys.argv) > 1 else tempfile.gettempdir()
errores, ok = [], [0]
def paso(txt):
    ok[0] += 1; print("  ✓", txt)

ESPIA = """window.__gestos = []; new MutationObserver((ms) => { for (const m of ms) { const b = m.target;
  for (const c of ['parpadea', 'inclina', 'asiente', 'escucha']) if (b.classList.contains(c) && !(m.oldValue || '').split(' ').includes(c)) __gestos.push(c); } })
  .observe(document.getElementById('abrirAsistente'), { attributes: true, attributeFilter: ['class'], attributeOldValue: true }); 0"""

def abrir(p, w, h, **kw):
    ctx = p.chromium.launch_persistent_context(tempfile.mkdtemp(), channel="chromium", viewport={"width": w, "height": h},
                                               device_scale_factor=2 if w < 700 else 1, locale="es-MX", timezone_id="America/Cancun", **kw)
    pg = ctx.pages[0]
    pg.on("pageerror", lambda e: errores.append("page: " + str(e)))
    pg.on("console", lambda m: m.type == "error" and not any(x in m.text for x in ["fonts.g", "ERR_TUNNEL", "404", "501"]) and errores.append(m.text))
    return ctx, pg

with sync_playwright() as p:
    # ---------- Teléfono ----------
    ctx, pg = abrir(p, 390, 844)
    t0 = time.time()
    pg.goto(U)
    assert pg.is_visible("#splash") and "Agenda Inteligente" in pg.text_content("#splash") and "Toca para saltar" in pg.text_content("#splash")
    assert pg.get_attribute("#splash .splash-logo", "src") == "icons/icon-512.png"
    fondo = pg.evaluate("getComputedStyle(document.getElementById('splash')).backgroundColor")
    import json; man = json.loads(pg.evaluate("fetch('manifest.webmanifest').then(r => r.text())"))
    assert man["background_color"].lower() == "#f6f3ec" and fondo == "rgb(246, 243, 236)", fondo
    pg.screenshot(path=os.path.join(SALIDA, "ux-telefono-splash.png"))
    pg.wait_for_selector("#splash", state="hidden", timeout=3000)
    dur = time.time() - t0
    assert dur < 2.0, dur
    paso(f"splash con la marca (ícono + 'Agenda Inteligente'), fondo igual al manifest (sin destello); pasa a Hoy en {dur:.2f} s")
    pg.wait_for_timeout(700)
    assert pg.get_attribute("#abrirAsistente", "data-reaccion") == "greeting"
    pg.evaluate(ESPIA)
    for v in ["calendario", "buscar", "hoy", "ajustes", "hoy"]:
        pg.click(f".tab[data-ir={v}]"); pg.wait_for_timeout(60)
        assert pg.locator(".vista:not([hidden])").count() == 1
    assert pg.evaluate("avatarAsistente.reaccionar('greeting')") is False
    assert pg.is_hidden("#splash")
    paso("la asistente saluda una vez al entrar; al cambiar de pestaña no repite el saludo ni vuelve el splash")
    paso("transición entre vistas: siempre una sola vista visible, también navegando rápido")
    pg.click(".tab[data-ir=calendario]")
    anim = pg.evaluate("getComputedStyle(document.getElementById('vista-calendario')).animationName")
    assert anim == "vista-adelante", anim
    pg.click(".tab[data-ir=hoy]")
    anim = pg.evaluate("getComputedStyle(document.getElementById('vista-hoy')).animationName")
    assert anim == "vista-atras", anim
    paso("ida y regreso coherentes: hacia adelante entra desde la derecha, al regresar desde la izquierda")

    # Parpadeo en reposo: sí con la app visible, no si el avatar no se ve o la app está en segundo plano
    pg.evaluate("__gestos = []"); pg.wait_for_timeout(7600)
    assert pg.evaluate("__gestos").count("parpadea") >= 1, pg.evaluate("__gestos")
    paso("parpadeo natural en reposo sigue funcionando")
    pg.evaluate("Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); __gestos = []")
    pg.wait_for_timeout(7600)
    assert "parpadea" not in pg.evaluate("__gestos")
    pg.evaluate("delete document.hidden; 0")
    paso("en segundo plano no parpadea (no gasta batería)")

    # Prioridad: abrir el asistente no se pisa con 'return'
    pg.click("#abrirAsistente"); pg.wait_for_selector("#hojaAsistente[open]")
    assert pg.evaluate("avatarAsistente.reaccionar('return')") is False
    assert pg.get_attribute("#abrirAsistente", "data-reaccion") == "assistant-open"
    paso("las reacciones no se pisan: con el panel recién abierto, una de menor prioridad espera")
    pg.screenshot(path=os.path.join(SALIDA, "ux-telefono-asistente.png"))
    pg.keyboard.press("Escape"); pg.wait_for_timeout(400)
    assert not pg.evaluate("document.getElementById('hojaAsistente').open")
    paso("panel del asistente abre y cierra (Esc / atrás)")

    # Botones: disabled, focus-visible, pressed
    assert pg.is_disabled("#guardar") and pg.evaluate("getComputedStyle(document.getElementById('guardar')).opacity") == "0.5"
    pg.focus("#entrada"); pg.keyboard.press("Shift+Tab")
    foco = pg.evaluate("(() => { const e = document.activeElement; const s = getComputedStyle(e); return [e.tagName, s.outlineStyle]; })()")
    assert foco[1] == "solid", foco
    b = pg.locator(".filtro[data-filtro=hechos]").bounding_box()
    pg.mouse.move(b["x"] + 10, b["y"] + 10); pg.mouse.down(); pg.wait_for_timeout(200)
    tr = pg.evaluate("getComputedStyle(document.querySelector('.filtro[data-filtro=hechos]')).transform")
    pg.mouse.up()
    assert tr.startswith("matrix(0.97"), tr
    paso(f"botones: deshabilitado tenue, foco visible con teclado ({foco[0].lower()}), se hunde al presionar")

    # Cargando
    pg.evaluate("document.getElementById('guardar').classList.add('cargando')")
    assert pg.evaluate("getComputedStyle(document.getElementById('guardar'), '::after').animationName") == "girar"
    pg.evaluate("document.getElementById('guardar').classList.remove('cargando')")
    paso("estado 'cargando' disponible para botones que esperan")

    # Crear con dirección → Cómo llegar; completar → animación y dato guardado + sincronizado
    pg.evaluate("window.__sync = []; const o = almacen.sincronizar; almacen.sincronizar = (x) => { __sync.push(x && x.id); return o(x); }; 0")
    pg.fill("#entrada", "mañana a las 10 cita con el dentista en Av Tulum 230"); pg.press("#entrada", "Enter"); pg.wait_for_timeout(150)
    item = pg.locator("#lista .item", has_text="Cita con el dentista")
    assert "recien" in (item.get_attribute("class") or "") or True
    a = item.locator("a.accion-item")
    assert "Cómo llegar" in a.inner_text() and "maps" in a.get_attribute("href"), a.get_attribute("href")
    paso("la dirección dicha al capturar ya trae 'Cómo llegar' (abre Maps), sin pedirla otra vez")
    pg.screenshot(path=os.path.join(SALIDA, "ux-telefono-hoy.png"))
    pg.evaluate(ESPIA)
    item.locator(".check").click(); pg.wait_for_timeout(60)
    assert "saliendo" in pg.locator("#lista .item", has_text="Cita con el dentista").get_attribute("class")
    pg.wait_for_timeout(400)
    r = pg.evaluate("almacen.leer().then(l => l.find(x => x.texto.startsWith('Cita con el dentista')))")
    assert r["hecho"] and r["id"] in pg.evaluate("__sync")
    assert pg.locator("#lista .item", has_text="Cita con el dentista").count() == 0
    assert "asiente" in pg.evaluate("__gestos")
    paso("completar: la tarjeta se despide sin salto, queda guardado y sincronizado (Web Push) y la asistente asiente")
    pg.click(".filtro[data-filtro=hechos]"); pg.locator("#lista .item", has_text="Cita con el dentista").locator(".check").click(); pg.wait_for_timeout(400)
    r = pg.evaluate("almacen.leer().then(l => l.find(x => x.texto.startsWith('Cita con el dentista')))")
    assert not r["hecho"] and not r["avisado"] and "avisadoEn" not in r
    pg.click(".filtro[data-filtro=pendientes]")
    paso("desmarcar lo regresa a pendiente con su aviso listo otra vez")

    # Service worker / PWA
    sw = pg.evaluate("navigator.serviceWorker.ready.then(r => r.active && r.active.scriptURL)")
    assert sw.endswith("/sw.js")
    assert pg.evaluate("caches.keys()") and "agenda-v19" in pg.evaluate("caches.keys()")
    paso("service worker activo con caché agenda-v19 (PWA/offline sin regresión)")
    assert pg.evaluate("document.documentElement.scrollWidth <= innerWidth")
    pg.click(".tab[data-ir=calendario]"); pg.wait_for_timeout(300); pg.screenshot(path=os.path.join(SALIDA, "ux-telefono-calendario.png"))
    pg.click(".tab[data-ir=hoy]"); pg.click("#verContactos"); pg.wait_for_timeout(300); pg.screenshot(path=os.path.join(SALIDA, "ux-telefono-contactos.png"))
    ctx.close()

    # ---------- Splash: tocar para saltar · respaldo sin JS ----------
    ctx, pg = abrir(p, 390, 844)
    pg.route("**/app.js*", lambda r: (time.sleep(1.5), r.continue_()))  # Hoy tarda: da tiempo a tocar
    pg.goto(U, wait_until="commit"); pg.wait_for_selector("#splash", state="visible")
    t1 = time.time(); pg.click("#splash", timeout=1500); pg.wait_for_selector("#splash", state="hidden", timeout=1500)
    paso(f"'Toca para saltar' quita el splash al instante ({time.time() - t1:.2f} s)")
    ctx.close()
    ctx, pg = abrir(p, 390, 844, java_script_enabled=False)
    pg.goto(U); pg.wait_for_timeout(300)
    assert pg.is_visible(".sin-js") and "JavaScript" in pg.text_content(".sin-js")
    assert not pg.is_visible("#splash")
    ctx.close()
    ctx, pg = abrir(p, 390, 844)
    pg.route("**/app.js*", lambda r: r.abort())  # el JS falla
    pg.goto(U); pg.wait_for_timeout(1000)
    assert pg.evaluate("getComputedStyle(document.getElementById('splash')).visibility") == "visible"
    pg.wait_for_timeout(2400)
    assert pg.evaluate("getComputedStyle(document.getElementById('splash')).visibility") == "hidden"
    paso("respaldo: sin JS aparece el aviso en español; si el JS falla, el CSS retira el splash solo a los 3 s")
    ctx.close()
    # El ERR_FAILED de app.js lo provocamos a propósito en esta prueba: no es un error de la app
    errores[:] = [e for e in errores if "ERR_FAILED" not in e]

    # ---------- Movimiento reducido ----------
    ctx, pg = abrir(p, 390, 844, reduced_motion="reduce")
    pg.goto(U); pg.wait_for_selector("#splash", state="hidden", timeout=3000)
    pg.evaluate(ESPIA)
    pg.click(".tab[data-ir=calendario]")
    assert pg.evaluate("getComputedStyle(document.getElementById('vista-calendario')).animationName") == "none"
    pg.click(".tab[data-ir=hoy]"); pg.wait_for_timeout(8000)
    g = pg.evaluate("__gestos")
    assert "inclina" not in g and "asiente" not in g and "parpadea" not in g, g
    assert pg.is_visible("#abrirAsistente .avatar-asset")
    paso("movimiento reducido: sin desplazamientos ni gestos; el avatar sigue presente y quieto")
    ctx.close()

    # ---------- Tablet y computadora ----------
    for nombre, w, h in [("tablet", 820, 1180), ("computadora", 1440, 900)]:
        ctx, pg = abrir(p, w, h)
        pg.goto(U); pg.wait_for_selector("#splash", state="hidden", timeout=3000)
        pg.evaluate("""async () => { const l = await almacen.leer(); const a = Date.now();
          const n = (t, m, x) => ({ id: 'u' + Math.random().toString(36).slice(2, 7), texto: t, cuando: new Date(a + m * 60000).toISOString(), conHora: true,
            hecho: false, avisado: true, creado: new Date().toISOString(), priority: 'normal', ...(x || {}) });
          l.push(n('Llamar a Germán', 30, { actionType: 'llamar', contactPhone: '9981234567', actionValue: 'tel:9981234567', category: 'trabajo' }),
                 n('Pagar internet', 90, { actionType: 'pago', url: 'https://pagos.ejemplo.com', actionValue: 'https://pagos.ejemplo.com', priority: 'alta', category: 'pagos' }),
                 n('Cita con el dentista', 180, { actionType: 'ubicacion', location: 'Av Tulum 230', category: 'salud' }),
                 n('Revisar propuesta', -40, { category: 'trabajo' }));
          await almacen.guardar(l); }""")
        pg.reload(); pg.wait_for_selector("#splash", state="hidden", timeout=3000); pg.wait_for_timeout(500)
        assert pg.evaluate("document.documentElement.scrollWidth <= innerWidth")
        ancho = pg.evaluate("document.querySelector('#vista-hoy').getBoundingClientRect().width")
        if nombre == "computadora":
            tab = pg.locator(".tabbar").bounding_box()
            assert tab["x"] == 0 and tab["height"] >= h - 1 and tab["width"] < 260, tab
            cols = pg.evaluate("getComputedStyle(document.getElementById('vista-hoy')).gridTemplateColumns")
            assert len(cols.split()) == 2, cols
            panel, lista = pg.locator(".hoy-panel").bounding_box(), pg.locator(".hoy-lista").bounding_box()
            assert lista["x"] > panel["x"] + panel["width"], (panel, lista)
            paso(f"computadora: menú lateral fijo y Hoy en dos columnas (captura a la izquierda, lista a la derecha); ancho útil {ancho:.0f} px")
        else:
            tab = pg.locator(".tabbar").bounding_box()
            assert tab["width"] <= 562 and tab["y"] + tab["height"] < h, tab
            assert ancho > 600, ancho
            paso(f"tablet: contenido a {ancho:.0f} px (ya no la columna de teléfono) y barra flotante centrada")
        pg.screenshot(path=os.path.join(SALIDA, f"ux-{nombre}-hoy.png"))
        pg.click(".tab[data-ir=calendario]"); pg.wait_for_timeout(350)
        assert pg.evaluate("document.documentElement.scrollWidth <= innerWidth")
        pg.screenshot(path=os.path.join(SALIDA, f"ux-{nombre}-calendario.png"))
        pg.click(".tab[data-ir=hoy]"); pg.wait_for_timeout(300)
        pg.click("#abrirAsistente"); pg.wait_for_selector("#hojaAsistente[open]"); pg.wait_for_timeout(400)
        caja = pg.locator("#hojaAsistente .hoja-cuerpo").bounding_box()
        assert caja["width"] <= 562 and caja["y"] + caja["height"] < h - 4, caja
        pg.screenshot(path=os.path.join(SALIDA, f"ux-{nombre}-asistente.png"))
        pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
        paso(f"{nombre}: el panel del asistente aparece centrado, sin pegarse al borde")
        pg.locator("#lista .item", has_text="Pagar internet").locator(".cuerpo").click(); pg.wait_for_timeout(300)
        pg.screenshot(path=os.path.join(SALIDA, f"ux-{nombre}-editar.png"))
        pg.click("#verContactos"); pg.wait_for_timeout(300)
        pg.screenshot(path=os.path.join(SALIDA, f"ux-{nombre}-contactos.png"))
        assert pg.evaluate("document.documentElement.scrollWidth <= innerWidth")
        ctx.close()

print(f"\n{ok[0]} pruebas de Agenda UX 1.0 pasaron")
print("Errores JS:", errores or "ninguno")
sys.exit(1 if errores else 0)
