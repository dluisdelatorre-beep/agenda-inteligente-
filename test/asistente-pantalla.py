# Pruebas de pantalla: "Tu asistente" (hoja inferior al tocar el avatar)
from playwright.sync_api import sync_playwright
import tempfile, sys, os

U = "http://localhost:8765/"
SALIDA = sys.argv[1] if len(sys.argv) > 1 else tempfile.gettempdir()
errores, ok = [], [0]
def paso(txt):
    ok[0] += 1; print("  ✓", txt)

AGREGAR = """async (items) => { const l = await almacen.leer(); const ahora = Date.now();
  for (const x of items) l.push({ id: x.id, texto: x.texto, cuando: x.min === null ? null : new Date(ahora + x.min * 60000).toISOString(),
    conHora: x.min !== null, hecho: !!x.hecho, hechoEn: x.hecho ? new Date().toISOString() : null, avisado: true, creado: new Date().toISOString(),
    priority: x.prio || 'normal', ...(x.extra || {}) });
  await almacen.guardar(l); }"""

with sync_playwright() as p:
    datos = tempfile.mkdtemp()
    ctx = p.chromium.launch_persistent_context(datos, channel="chromium", viewport={"width": 390, "height": 844},
                                               device_scale_factor=2, locale="es-MX", timezone_id="America/Cancun", has_touch=False)
    pg = ctx.pages[0]
    pg.on("pageerror", lambda e: errores.append("page: " + str(e)))
    pg.on("console", lambda m: m.type == "error" and not any(x in m.text for x in ["fonts.g", "ERR_TUNNEL", "404"]) and errores.append(m.text))
    pg.goto(U); pg.wait_for_selector("#resumen h2")

    # Día sin pendientes
    assert "con-algo" not in pg.get_attribute("#abrirAsistente", "class")
    pg.click("#abrirAsistente"); pg.wait_for_selector("#hojaAsistente[open]")
    assert pg.inner_text("#asisFrase") == "Tu día está tranquilo. No tienes pendientes."
    assert pg.is_disabled(".asis-preguntar") and "Próximamente" in pg.inner_text(".asis-preguntar")
    paso("tocar el avatar abre 'Tu asistente'; sin pendientes dice que el día está tranquilo; 'Preguntarle algo' dice Próximamente")
    pg.mouse.click(195, 40); pg.wait_for_timeout(350)
    assert not pg.evaluate("document.getElementById('hojaAsistente').open")
    paso("se cierra tocando fuera")

    # Pendientes reales: llamada (en 20 min), pago (en 2 h, alta), uno hecho hoy, uno sin fecha
    hoy_tarde = pg.evaluate("(() => { const d = new Date(); return (23 - d.getHours()) * 60 + (59 - d.getMinutes()) - 1; })()")
    pg.evaluate(AGREGAR, [
        {"id": "ll", "texto": "Llamar a Luis", "min": min(20, hoy_tarde), "extra": {"actionType": "llamar", "contactName": "Luis", "contactPhone": "9981234567", "actionValue": "tel:9981234567"}},
        {"id": "pa", "texto": "Pagar internet", "min": min(25, hoy_tarde), "prio": "alta", "extra": {"actionType": "pago", "url": "https://pagos.ejemplo.com/f/1", "actionValue": "https://pagos.ejemplo.com/f/1"}},
        {"id": "he", "texto": "Desayunar", "min": -1, "hecho": True},
        {"id": "sf", "texto": "Revisar ideas", "min": None},
    ])
    pg.reload(); pg.wait_for_selector("#resumen h2")
    pg.click("#abrirAsistente"); pg.wait_for_selector("#hojaAsistente[open]")
    cif = pg.locator(".asis-cifras .cifra strong").all_inner_texts()
    assert cif == ["3", "1", "2", "0"], cif
    assert "Llamar a Luis" in pg.inner_text("#asisContenido")
    assert pg.inner_text("#asisFrase").startswith("Tienes 2 pendientes hoy. El siguiente es llamar a Luis a las"), pg.inner_text("#asisFrase")
    paso("resumen de hoy coincide: total 3, completados 1, pendientes 2, vencidos 0; próximo: Llamar a Luis")
    paso("frase: " + pg.inner_text("#asisFrase"))

    pg.click("#asisBotones [data-sec=primero]")
    assert pg.inner_text(".asis-recomendacion").startswith("Primero: pagar internet. Es prioridad alta"), pg.inner_text(".asis-recomendacion")
    assert pg.get_attribute("#asisContenido a.accion-item", "href") == "https://pagos.ejemplo.com/f/1"
    paso("¿Qué hago primero? sin vencidos → prioridad alta (Pagar internet) con 'Abrir pago'")

    pg.click("#asisBotones [data-sec=accion]")
    a = pg.locator("#asisContenido a.accion-item")
    assert a.get_attribute("href") == "tel:9981234567" and "Llamar ahora" in a.inner_text() and a.get_attribute("target") is None
    paso("Próxima acción: 'Llamar ahora' abre el marcador con el número")
    pg.screenshot(path=os.path.join(SALIDA, "asistente-accion.png"))

    # Crear un vencido: debe ir primero y la asistente hace el pulso
    pg.evaluate(AGREGAR, [{"id": "ve", "texto": "Mandar reporte", "min": -30}])
    pg.evaluate("document.getElementById('hojaAsistente').close()")
    pg.reload(); pg.wait_for_selector("#resumen h2")
    assert "con-algo" in pg.get_attribute("#abrirAsistente", "class")
    paso("con un pendiente vencido la asistente hace un pulso discreto")
    pg.click("#abrirAsistente"); pg.wait_for_selector("#hojaAsistente[open]")
    assert "activo" in pg.get_attribute("#asisBotones [data-sec=primero]", "class")
    assert pg.inner_text(".asis-recomendacion").startswith("Primero: mandar reporte. Era para"), pg.inner_text(".asis-recomendacion")
    assert "ya pasó de su hora" in pg.inner_text("#asisFrase")
    paso("el vencido aparece primero: " + pg.inner_text(".asis-recomendacion"))

    pg.click("#asisBotones [data-sec=plan]")
    plan = pg.evaluate("document.getElementById('asisContenido').textContent")
    orden = [plan.index(x) for x in ["Vencidos", "Mandar reporte", "Urgente", "Pagar internet", "Próximos", "Llamar a Luis", "📌 Después", "Revisar ideas"]]
    assert orden == sorted(orden), plan
    assert "No cambié ninguna fecha ni hora" in plan
    paso("Reorganizar mi día: vencidos → urgente → próximos → después, sin cambiar horas")

    pg.click("#asisBotones [data-sec=atrasados]")
    assert pg.locator("#asisContenido .asis-fila").count() == 1 and "Mandar reporte" in pg.inner_text("#asisContenido")
    paso("Pendientes atrasados muestra solo los vencidos abiertos")

    # Recordarme después desde el panel → se actualiza en Hoy y se sincroniza para Web Push
    pg.evaluate("window.__sync = []; const o = almacen.sincronizar; almacen.sincronizar = (x) => { __sync.push(x && x.id); return o(x); }; 0")
    pg.locator("#asisContenido .asis-fila", has_text="Mandar reporte").locator("button", has_text="Después").click()
    assert pg.eval_on_selector("#asisElegido", "s => s.value") == "ve"
    pg.click(".asis-tiempos button:has-text('+30 min')"); pg.wait_for_timeout(300)
    r = pg.evaluate("almacen.leer().then(l => l.find(x => x.id === 've'))")
    falta = pg.evaluate(f"(new Date('{r['cuando']}') - Date.now()) / 60000")
    assert 29 < falta <= 30.1 and not r["avisado"], (falta, r)
    assert "ve" in pg.evaluate("__sync")
    assert "Te recuerdo a las" in pg.inner_text("#aviso")
    item = pg.locator("#lista .item", has_text="Mandar reporte")
    assert "vencido" not in item.get_attribute("class")
    assert "No tienes pendientes atrasados." in pg.inner_text("#asisContenido") or pg.locator("#asisElegido").count() == 1
    paso(f"+30 min desde el panel: se movió en Hoy, se sincronizó con el servidor (Web Push) y avisó '{pg.inner_text('#aviso').splitlines()[0]}'")

    pg.select_option("#asisElegido", "sf")
    pg.click(".asis-tiempos button:has-text('Mañana')"); pg.wait_for_timeout(300)
    r = pg.evaluate("almacen.leer().then(l => l.find(x => x.id === 'sf'))")
    d = pg.evaluate(f"(() => {{ const d = new Date('{r['cuando']}'); const m = new Date(); m.setDate(m.getDate() + 1); return [d.getDate() === m.getDate(), d.getHours()]; }})()")
    assert d == [True, 9], d
    paso("'Mañana' en un pendiente sin hora lo pasa a mañana 9:00 a.m.")

    pg.click("#asisBotones [data-sec=atrasados]")
    assert "No tienes pendientes atrasados." in pg.inner_text("#asisContenido")
    assert pg.get_attribute("#abrirAsistente", "data-estado") != "alert"
    paso("ya sin atrasados: 'No tienes pendientes atrasados.' y la asistente sale del estado de alerta")

    # Deslizar hacia abajo para cerrar
    box = pg.locator("#asisAgarre").bounding_box()
    x, y = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
    pg.mouse.move(x, y); pg.mouse.down(); pg.mouse.move(x, y + 60, steps=5); pg.mouse.move(x, y + 160, steps=5); pg.mouse.up()
    pg.wait_for_timeout(350)
    assert not pg.evaluate("document.getElementById('hojaAsistente').open")
    paso("se cierra deslizando hacia abajo")
    assert pg.evaluate("document.documentElement.scrollWidth <= innerWidth")
    ctx.close()

    # Cerrar y volver a abrir la PWA (mismo perfil) + tema oscuro con otro acento
    ctx = p.chromium.launch_persistent_context(datos, channel="chromium", viewport={"width": 390, "height": 844},
                                               device_scale_factor=2, locale="es-MX", timezone_id="America/Cancun", color_scheme="dark")
    pg = ctx.pages[0]
    pg.on("pageerror", lambda e: errores.append("page: " + str(e)))
    pg.goto(U); pg.wait_for_selector("#resumen h2")
    pg.evaluate("ajustes.cambiar({ accentColor: 'morado' })")
    pg.click("#abrirAsistente"); pg.wait_for_selector("#hojaAsistente[open]"); pg.wait_for_timeout(400)
    fondo = pg.evaluate("getComputedStyle(document.querySelector('.hoja-cuerpo')).backgroundColor")
    acento = pg.evaluate("getComputedStyle(document.querySelector('#asisBotones button.activo')).borderColor")
    assert fondo == "rgb(26, 34, 34)", fondo
    paso(f"después de cerrar y abrir la app sigue igual; respeta tema oscuro ({fondo}) y el acento elegido ({acento})")
    pg.screenshot(path=os.path.join(SALIDA, "asistente-oscuro.png"))
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    assert not pg.evaluate("document.getElementById('hojaAsistente').open")
    assert pg.locator("#lista .item").count() >= 3
    paso("Esc / atrás cierra el panel y Hoy sigue con sus pendientes")
    ctx.close()

print(f"\n{ok[0]} pruebas de Tu asistente pasaron")
print("Errores JS:", errores or "ninguno")
sys.exit(1 if errores else 0)
