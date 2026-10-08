# Pruebas obligatorias del sprint: Calendario + Buscar + Personalización
# Corre en Chromium real con perfil persistente (se cierra y se vuelve a abrir la app).
from playwright.sync_api import sync_playwright
from datetime import datetime, timedelta
import tempfile, json, sys

U = "http://localhost:8765/"
perfil = tempfile.mkdtemp()
errores, ok = [], [0]
def paso(n, txt):
    ok[0] += 1
    print(f"  ✓ {n:>2}. {txt}")

def abrir(p):
    ctx = p.chromium.launch_persistent_context(perfil, channel="chromium", viewport={"width": 390, "height": 844},
                                               device_scale_factor=2, locale="es-MX", timezone_id="America/Cancun")
    ctx.grant_permissions(["notifications"], origin="http://localhost:8765")
    pg = ctx.pages[0] if ctx.pages else ctx.new_page()
    pg.on("pageerror", lambda e: errores.append("page: " + str(e)))
    pg.on("console", lambda m: m.type == "error" and not any(x in m.text for x in ["fonts.g", "ERR_TUNNEL", "404"]) and errores.append(m.text))
    pg.goto(U); pg.wait_for_selector("#resumen h2")
    # Registrar cada vez que la app manda un recordatorio al servidor
    pg.evaluate("""() => { window.__sync = []; const o = almacen.sincronizar;
        almacen.sincronizar = (x) => { (Array.isArray(x) ? x : [x]).forEach(p => window.__sync.push({id: p.id, cuando: p.cuando, conHora: p.conHora, hecho: p.hecho})); return o(x); }; }""")
    return ctx, pg

def tab(pg, v):
    pg.click(f".tab[data-ir={v}]"); pg.wait_for_selector(f"#vista-{v}:not([hidden])")

def sin_scroll_horizontal(pg):
    return pg.evaluate("document.documentElement.scrollWidth <= window.innerWidth")

def ir_a_dia(pg, d):
    # Avanza meses si hace falta y toca el día
    for _ in range(3):
        t = pg.inner_text("#mesTitulo").lower()
        if d.strftime("%Y") in t and ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"][d.month-1] in t:
            break
        pg.click("#mesSiguiente")
    pg.click(f"#cuadricula .dia:text-is('{d.day}')")

with sync_playwright() as p:
    ctx, pg = abrir(p)
    hoy = datetime.now()
    manana, pasado = hoy + timedelta(days=1), hoy + timedelta(days=2)
    assert pg.is_visible("#vista-hoy") and not pg.is_visible("#vista-calendario"), "Hoy al abrir"
    print("Navegación"); print("  ✓ Hoy es la pantalla al abrir")

    print("Calendario")
    pg.fill("#entrada", "Mañana a las 10 llamar a Luis"); pg.press("#entrada", "Enter"); pg.wait_for_timeout(200)
    paso(1, "creado: " + pg.inner_text("#lista").split("\n")[-2:][0])
    tab(pg, "calendario")
    punto = pg.locator(f"#cuadricula .dia:text-is('{manana.day}') .punto")
    ir_a_dia(pg, manana)
    t = pg.inner_text("#listaDia")
    assert "Llamar a Luis" in t and "10:00" in t, t
    assert punto.count() == 1, "indicador en el día"
    paso(2, f"aparece mañana ({manana:%d/%m}) a las 10:00 con indicador en el día")
    pg.click("#listaDia >> text=Llamar a Luis")
    pg.wait_for_selector("#listaDia .editor")
    pg.fill("#listaDia .editor input[type=datetime-local]", pasado.strftime("%Y-%m-%dT12:00"))
    pg.click("#listaDia .editor .primario"); pg.wait_for_timeout(250)
    assert "Llamar a Luis" not in pg.inner_text("#listaDia"), "ya no está mañana"
    paso(3, "cambiado a pasado mañana 12:00: ya no aparece mañana")
    ir_a_dia(pg, pasado)
    t = pg.inner_text("#listaDia"); assert "Llamar a Luis" in t and "12:00" in t, t
    ultimo = [s for s in pg.evaluate("window.__sync") if True][-1]
    cuando = datetime.fromisoformat(ultimo["cuando"].replace("Z", "+00:00")).astimezone()
    assert cuando.strftime("%d %H:%M") == pasado.strftime("%d 12:00") and ultimo["conHora"], ultimo
    tab(pg, "hoy"); assert "Pasado" not in pg.inner_text("#lista") and "12:00" in pg.inner_text("#lista")
    paso(4, f"Calendario lo muestra el {pasado:%d/%m} 12:00, Hoy también, y el recordatorio se reprogramó a {cuando:%d/%m %H:%M}")

    print("Buscar")
    for f in ["reunión con Luis el viernes a las 5", "enviar documentos a LUIS", "comprar pan"]:
        pg.fill("#entrada", f); pg.press("#entrada", "Enter"); pg.wait_for_timeout(120)
    tab(pg, "buscar")
    pg.fill("#busca", "luis"); pg.wait_for_timeout(150)
    t = pg.inner_text("#resultados")
    assert all(x in t for x in ["Llamar a Luis", "Reunión con Luis", "Enviar documentos a LUIS"]) and "Comprar pan" not in t, t
    paso(5, "busca 'luis' en minúsculas: " + pg.inner_text("#conteo"))
    pg.fill("#busca", "reunion"); pg.wait_for_timeout(100)
    assert "Reunión con Luis" in pg.inner_text("#resultados")
    paso(6, "ignora acentos: 'reunion' encuentra 'Reunión con Luis'")
    pg.fill("#busca", "Luis"); pg.wait_for_timeout(100)
    pg.locator("#resultados .item", has_text="Llamar a Luis").locator(".check").click(); pg.wait_for_timeout(250)
    assert pg.evaluate("almacen.leer().then(l => l.find(x => x.texto === 'Llamar a Luis').hecho)")
    assert pg.evaluate("window.__sync.at(-1).hecho") is True
    paso(7, "marcado como hecho desde Buscar (y se avisó al servidor que ya no recuerde)")
    pg.click(".chip[data-busca=hechos]"); pg.wait_for_timeout(100)
    t = pg.inner_text("#resultados"); assert "Llamar a Luis" in t and "Reunión" not in t, t
    paso(8, "filtro Hechos + 'Luis'")
    tab(pg, "hoy"); pg.click(".filtro[data-filtro=hechos]")
    assert "Llamar a Luis" in pg.inner_text("#lista"); pg.click(".filtro[data-filtro=pendientes]")
    paso(9, "sigue apareciendo en Buscar y también en Hechos de Hoy")
    tab(pg, "buscar"); pg.click(".chip[data-busca=todos]")
    pg.click("#resultados >> text=Reunión con Luis"); assert pg.locator("#resultados .editor").count() == 1
    pg.fill("#resultados .editor input[type=text]", "Reunión con Luis y Germán"); pg.click("#resultados .editor .primario"); pg.wait_for_timeout(150)
    pg.fill("#busca", "german"); pg.wait_for_timeout(100)
    assert "Reunión con Luis y Germán" in pg.inner_text("#resultados")
    print("  ✓    extra: tocar un activo abre el mismo editor; renombrado, Buscar encuentra el nombre nuevo")

    print("Ajustes")
    tab(pg, "ajustes")
    assert pg.is_checked("input[name=theme][value=auto]") and pg.is_checked("input[name=accentColor][value=verde]")
    assert pg.is_checked("input[name=density][value=comoda]") and pg.is_checked("#ajSonido")
    pg.click("label:has(input[name=theme][value=oscuro])"); pg.wait_for_timeout(150)
    fondo = pg.evaluate("getComputedStyle(document.body).backgroundColor")
    assert pg.evaluate("document.documentElement.dataset.theme") == "oscuro" and fondo == "rgb(5, 47, 39)", fondo  # oscuro = piel esmeralda (v27)
    paso(10, "modo oscuro aplicado al instante")
    pg.click("label:has(input[name=theme][value=claro])"); pg.wait_for_timeout(150)
    claro = pg.evaluate("getComputedStyle(document.body).backgroundColor")
    assert claro == "rgb(244, 239, 227)", claro  # Claro vuelve a funcionar (en v27 no cambiaba nada)
    print("  ✓    extra: tema Claro aplica la superficie crema")
    pg.click("label:has(input[name=theme][value=oscuro])"); pg.wait_for_timeout(150)
    n_pend = pg.evaluate("almacen.leer().then(l => l.length)")
    ctx.close()
    ctx, pg = abrir(p)
    paso(11, "app cerrada por completo y vuelta a abrir (mismo perfil)")
    fondo = pg.evaluate("getComputedStyle(document.body).backgroundColor")
    assert pg.evaluate("document.documentElement.dataset.theme") == "oscuro" and fondo == "rgb(5, 47, 39)", fondo  # oscuro = piel esmeralda (v27)
    assert pg.evaluate("almacen.leer().then(l => l.length)") == n_pend
    paso(12, "conserva modo oscuro al reabrir (y los pendientes)")
    pg.screenshot(path="/tmp/claude-0/-home-claude/664b7c3d-405b-5f8f-9031-07e69fa0cf95/scratchpad/s-hoy-oscuro.png")

    tab(pg, "ajustes")
    pg.click("label:has(input[name=accentColor][value=morado])"); pg.wait_for_timeout(350)  # deja terminar la transición de color
    MORADO = "rgb(185, 162, 236)"  # tono oscuro del morado
    colores = {"ajustes: pestaña": pg.evaluate("getComputedStyle(document.querySelector('.tab.activo')).color"),
               "ajustes: interruptor": pg.evaluate("getComputedStyle(document.getElementById('ajSonido')).backgroundColor")}
    paso(13, "color de acento cambiado a morado")
    tab(pg, "hoy"); fondo_resumen = pg.evaluate("getComputedStyle(document.getElementById('resumen')).backgroundImage")
    assert "rgb(6, 59, 49)" in fondo_resumen, fondo_resumen  # la tarjeta de saludo es identidad esmeralda (v27) y no cambia con el acento
    colores["hoy: filtro activo"] = pg.evaluate("getComputedStyle(document.querySelector('.filtro.activo')).backgroundColor")
    pg.screenshot(path="/tmp/claude-0/-home-claude/664b7c3d-405b-5f8f-9031-07e69fa0cf95/scratchpad/s-hoy-morado.png")
    tab(pg, "calendario"); colores["calendario: día elegido"] = pg.evaluate("getComputedStyle(document.querySelector('.dia.sel')).backgroundColor")
    pg.screenshot(path="/tmp/claude-0/-home-claude/664b7c3d-405b-5f8f-9031-07e69fa0cf95/scratchpad/s-cal-morado.png")
    tab(pg, "buscar"); colores["buscar: filtro activo"] = pg.evaluate("getComputedStyle(document.querySelector('.chip.activo')).backgroundColor")
    tarjeta = pg.evaluate("getComputedStyle(document.getElementById('busca')).backgroundColor")
    assert all(v == MORADO for v in colores.values()), colores
    assert tarjeta != MORADO, "el acento no pinta toda la app"
    paso(14, "mismo morado en Hoy, Calendario, Buscar y Ajustes (" + ", ".join(colores) + "); fondos y tarjetas no cambian")

    tab(pg, "ajustes")
    pg.click("label:has(input[name=appSoundStyle][value=digital])"); pg.wait_for_timeout(80)
    pg.click("label:has(input[name=appSoundStyle][value=suave])"); pg.wait_for_timeout(80)
    assert pg.evaluate("ajustes.actuales.appSoundStyle") == "suave"
    paso(15, "estilo de sonido 'Suave' elegido")
    tab(pg, "hoy")
    antes = pg.evaluate("ajustes.sonidosTocados")
    pg.fill("#entrada", "en 3 horas probar sonido"); pg.press("#entrada", "Enter"); pg.wait_for_timeout(150)
    despues = pg.evaluate("ajustes.sonidosTocados")
    assert despues == antes + 1, (antes, despues)
    paso(16, "crear pendiente reproduce el sonido 'Suave' dentro de la app")
    tab(pg, "ajustes"); pg.click("label.fila-ajuste:has(#ajSonido)"); pg.wait_for_timeout(100)
    assert not pg.evaluate("ajustes.actuales.appSoundEnabled") and pg.evaluate("document.getElementById('estiloSonido').disabled")
    paso(17, "sonidos desactivados")
    tab(pg, "hoy"); antes = pg.evaluate("ajustes.sonidosTocados")
    pg.fill("#entrada", "en 4 horas sin sonido"); pg.press("#entrada", "Enter"); pg.wait_for_timeout(150)
    pg.locator("#lista .item", has_text="Sin sonido").locator(".check").click(); pg.wait_for_timeout(150)
    tab(pg, "calendario"); tab(pg, "buscar"); tab(pg, "hoy")
    assert pg.evaluate("ajustes.sonidosTocados") == antes
    paso(18, "con sonidos apagados: crear, completar y navegar no reproducen nada")

    tab(pg, "ajustes")
    pend_antes = pg.evaluate("almacen.leer().then(l => JSON.stringify(l))")
    sync_antes = pg.evaluate("window.__sync.length")
    pg.click("#restaurar"); pg.wait_for_selector("#confirmar[open]")
    pg.click("#confirmar button[value=no]"); pg.wait_for_timeout(100)
    assert pg.evaluate("ajustes.actuales.theme") == "oscuro"
    pg.click("#restaurar"); pg.wait_for_selector("#confirmar[open]"); pg.click("#confirmarSi"); pg.wait_for_timeout(200)
    a = pg.evaluate("ajustes.actuales")
    assert a == {"theme": "auto", "accentColor": "verde", "density": "comoda", "textSize": "normal",
                 "appSoundEnabled": True, "appSoundStyle": "suave", "reminderTone": "suave", "vibrationEnabled": True}, a
    paso(19, "pide confirmación (cancelar no cambia nada) y restaura tema, color, densidad, texto, sonido y vibración")
    assert pg.evaluate("almacen.leer().then(l => JSON.stringify(l))") == pend_antes
    assert pg.evaluate("window.__sync.length") == sync_antes
    n = pg.evaluate("almacen.leer().then(l => l.length)")
    paso(20, f"no se borró ningún pendiente ({n} intactos) ni se tocaron los recordatorios del servidor")

    print("Extras de móvil")
    pg.click("label:has(input[name=textSize][value=grande])"); pg.click("label:has(input[name=density][value=compacta])")
    assert pg.evaluate("getComputedStyle(document.documentElement).fontSize") == "18px"
    vistas_ok = []
    for v in ["hoy", "calendario", "buscar", "ajustes"]:
        tab(pg, v); vistas_ok.append(sin_scroll_horizontal(pg))
    assert all(vistas_ok), vistas_ok
    print("  ✓    texto grande + compacta: sin scroll horizontal en las 4 pantallas")
    tab(pg, "calendario"); pg.go_back(); pg.wait_for_selector("#vista-hoy:not([hidden])")
    print("  ✓    botón atrás del teléfono regresa a Hoy")
    tab(pg, "ajustes"); pg.click("#restaurar"); pg.click("#confirmarSi"); pg.wait_for_timeout(100)
    ctx.close()

print(f"\n{ok[0]}/20 pruebas obligatorias pasaron")
print("Errores JS:", errores or "ninguno")
sys.exit(0 if ok[0] == 20 and not errores else 1)
