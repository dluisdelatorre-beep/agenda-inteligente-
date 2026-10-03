# Pruebas de pantalla: Acciones del recordatorio (llamar y pagar, más reunión y ubicación)
from playwright.sync_api import sync_playwright
import tempfile, json, sys

U = "http://localhost:8765/"
errores, ok = [], [0]
def paso(txt):
    ok[0] += 1; print("  ✓", txt)

with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(tempfile.mkdtemp(), channel="chromium", viewport={"width": 390, "height": 844},
                                               device_scale_factor=2, locale="es-MX", timezone_id="America/Cancun")
    ctx.grant_permissions(["notifications"], origin="http://localhost:8765")
    pg = ctx.pages[0]
    pg.on("pageerror", lambda e: errores.append("page: " + str(e)))
    pg.on("console", lambda m: m.type == "error" and not any(x in m.text for x in ["fonts.g", "ERR_TUNNEL", "404"]) and errores.append(m.text))
    pg.goto(U); pg.wait_for_selector("#resumen h2"); pg.evaluate("navigator.serviceWorker.ready")

    print("Llamada")
    pg.fill("#entrada", "En 2 minutos llamar a Luis")
    assert "Llamar" in pg.inner_text("#entendido"), pg.inner_text("#entendido")
    paso("al escribir sugiere la acción: " + pg.inner_text("#entendido"))
    pg.press("#entrada", "Enter"); pg.wait_for_selector("#aviso:not([hidden])")
    assert "Asociar contacto" in pg.inner_text("#aviso")
    paso("se guarda al instante y ofrece 'Asociar contacto' sin estorbar")
    inc = pg.locator("#lista .item", has_text="Llamar a Luis").locator(".accion-item.incompleta")
    assert inc.count() == 1 and "Agregar teléfono" in inc.inner_text()
    paso("sin número, la tarjeta muestra '📞 Agregar teléfono' (no se queda sin pista)")
    pg.click("#aviso >> text=Asociar contacto"); pg.wait_for_selector("#lista .editor")
    ed = "#lista .editor"
    assert pg.eval_on_selector(f"{ed} select[aria-label='Tipo de acción']", "s => s.value") == "llamar"
    assert pg.input_value(f"{ed} input[placeholder='Nombre del contacto']") == "Luis"
    pg.fill(f"{ed} input[type=tel]", "998 123 4567"); pg.click(f"{ed} .primario"); pg.wait_for_timeout(200)
    a = pg.locator("#lista .item", has_text="Llamar a Luis").locator("a.accion-item")
    assert a.get_attribute("href") == "tel:9981234567" and "Llamar ahora" in a.inner_text(), (a.get_attribute("href"), a.inner_text())
    paso("con teléfono asociado, la tarjeta muestra 'Llamar ahora' → tel:9981234567")
    rec = pg.evaluate("almacen.leer().then(l => l.find(x => x.texto === 'Llamar a Luis'))")
    assert rec["actionType"] == "llamar" and rec["contactName"] == "Luis" and rec["contactPhone"] == "9981234567" and rec["actionValue"] == "tel:9981234567"
    paso("modelo de datos: actionType, actionValue, contactName, contactPhone guardados")

    # Llega el recordatorio con la app abierta
    pg.evaluate("""async () => { const l = await almacen.leer(); const x = l.find(y => y.texto === 'Llamar a Luis');
        x.cuando = new Date(Date.now() - 1000).toISOString(); await almacen.guardar(l); }""")
    pg.reload(); pg.wait_for_selector("#aviso:not([hidden])"); pg.wait_for_timeout(400)
    href = pg.get_attribute("#aviso a.accion", "href")
    assert href == "tel:9981234567", href
    notifs = pg.evaluate("""async () => (await (await navigator.serviceWorker.ready).getNotifications())
        .map(n => ({t: n.title, b: n.body, a: n.actions.map(x => x.title)}))""")
    n = [x for x in notifs if x["t"] == "Llamar a Luis"][0]
    assert n["b"] == "Es hora de llamar a Luis." and n["a"][:2] == ["Llamar ahora", "Posponer 10 min"], n
    paso(f"aviso: '{n['t']}' — {n['b']} [{' | '.join(n['a'])}]")

    # Respaldo: si el navegador no abre el marcador desde el aviso, abre la app con el botón listo
    idl = rec["id"]
    pg.goto(U + "?accion=" + idl); pg.wait_for_selector("#hojaAccion[open]")
    assert pg.get_attribute("#hojaAccionIr", "href") == "tel:9981234567" and "Llamar ahora" in pg.inner_text("#hojaAccionIr")
    assert "Luis · 9981234567" in pg.inner_text("#hojaAccionDetalle")
    paso("respaldo del aviso: abre la app con 'Llamar ahora' listo (la persona confirma la llamada)")
    pg.click("#hojaAccion button[value=no]")
    assert "accion=" not in pg.url
    # Con la app ya abierta: el aviso le avisa a la app y ella muestra el botón (no abre una pestaña con tel:)
    pg.evaluate("navigator.serviceWorker.ready")
    sw = ctx.service_workers[0]
    sw.evaluate(f"self.clients.matchAll({{type:'window'}}).then(cs => cs[0].postMessage({{tipo:'accion', id:'{idl}'}}))")
    pg.wait_for_selector("#hojaAccion[open]")
    assert pg.get_attribute("#hojaAccionIr", "href") == "tel:9981234567" and pg.get_attribute("#hojaAccionIr", "target") is None
    paso("app abierta: el botón del aviso muestra 'Llamar ahora' en la app, sin abrir una pestaña de Chrome")
    pg.click("#hojaAccion button[value=no]")
    rec2 = pg.evaluate(f"almacen.leer().then(l => l.find(x => x.id === '{idl}'))")
    assert rec2["contactPhone"] == "9981234567" and not rec2["hecho"]
    paso("al regresar a la app, el pendiente sigue igual y sincronizado")

    print("Pago")
    pg.fill("#entrada", "En 2 minutos pagar internet")
    assert "Abrir pago" in pg.inner_text("#entendido")
    pg.press("#entrada", "Enter"); pg.wait_for_selector("#aviso:not([hidden])")
    pg.click("#aviso >> text=Agregar enlace de pago"); pg.wait_for_selector("#lista .editor")
    assert pg.eval_on_selector("#lista .editor select[aria-label='Tipo de acción']", "s => s.value") == "pago"
    assert pg.is_visible("#lista .editor .nota-accion")
    pg.fill("#lista .editor input[type=url]", "https://miusuario:MiClave123@pagos.ejemplo.com/factura/123?ref=oct")
    pg.click("#lista .editor .primario"); pg.wait_for_timeout(200)
    a = pg.locator("#lista .item", has_text="Pagar internet").locator("a.accion-item")
    assert a.get_attribute("href") == "https://pagos.ejemplo.com/factura/123?ref=oct" and a.get_attribute("target") == "_blank"
    paso("'Abrir pago' abre https://pagos.ejemplo.com/factura/123?ref=oct en otra pestaña")
    todo = pg.evaluate("almacen.leer().then(l => JSON.stringify(l))")
    assert "MiClave123" not in todo and "miusuario" not in todo
    pago = pg.evaluate("almacen.leer().then(l => l.find(x => x.texto === 'Pagar internet'))")
    assert set(pago) <= {"id","texto","cuando","conHora","hecho","avisado","creado","actionType","actionValue","contactName","contactPhone","url","location","hechoEn","category","priority","contact_id"}, pago.keys()
    paso("no se guardan credenciales: el usuario y la contraseña del enlace se descartan")
    acc = pg.evaluate("acciones.botonesNotificacion(" + json.dumps(pago) + ", 2).map(b => b.title)")
    assert acc == ["Abrir pago", "Posponer 10 min"], acc
    paso("el aviso del pago trae [Abrir pago | Posponer 10 min]")

    print("Reunión, ubicación y sin acción")
    pg.fill("#entrada", "junta semanal hoy a las 11 de la noche https://meet.google.com/abc-defg-hij"); pg.press("#entrada", "Enter"); pg.wait_for_timeout(200)
    a = pg.locator("#lista .item", has_text="Junta semanal").locator("a.accion-item")
    assert a.get_attribute("href") == "https://meet.google.com/abc-defg-hij" and "Entrar a reunión" in a.inner_text()
    paso("enlace de Meet en la frase → 'Entrar a reunión' sin pasos extra")
    pg.fill("#entrada", "Cita con el dentista mañana a las 4"); pg.press("#entrada", "Enter"); pg.wait_for_selector("#aviso >> text=Agregar dirección")
    pg.click("#aviso >> text=Agregar dirección"); pg.fill("#lista .editor input[placeholder='Dirección o enlace de mapas']", "Av. Tulum 123, Cancún")
    pg.click("#lista .editor .primario"); pg.wait_for_timeout(200)
    a = pg.locator("#lista .item", has_text="Cita con el dentista").locator("a.accion-item")
    assert a.get_attribute("href").startswith("https://www.google.com/maps/search/?api=1&query=Av.%20Tulum") and "Cómo llegar" in a.inner_text()
    paso("ubicación → 'Cómo llegar' abre el mapa con la dirección")
    pg.click("#lista >> text=Cita con el dentista"); pg.select_option("#lista .editor select[aria-label='Tipo de acción']", "")
    pg.click("#lista .editor .primario"); pg.wait_for_timeout(150)
    assert pg.locator("#lista .item", has_text="Cita con el dentista").locator("a.accion-item").count() == 0
    paso("la sugerencia se puede cambiar a 'Sin acción'")
    pg.fill("#entrada", "comprar pan"); pg.press("#entrada", "Enter"); pg.wait_for_timeout(150)
    assert "Comprar pan" in pg.inner_text("#lista")
    paso("pendiente sin acción se guarda igual que siempre")
    print("  sin scroll horizontal:", pg.evaluate("document.documentElement.scrollWidth <= innerWidth"))
    pg.screenshot(path="/tmp/claude-0/-home-claude/664b7c3d-405b-5f8f-9031-07e69fa0cf95/scratchpad/acciones-hoy.png", full_page=True)
    pg.click("#lista >> text=Llamar a Luis"); pg.wait_for_timeout(150)
    pg.locator("#lista .editor").screenshot(path="/tmp/claude-0/-home-claude/664b7c3d-405b-5f8f-9031-07e69fa0cf95/scratchpad/acciones-editor.png")
    ctx.close()

print(f"\n{ok[0]} pruebas de acciones en pantalla pasaron")
print("Errores JS:", errores or "ninguno")
sys.exit(1 if errores else 0)
