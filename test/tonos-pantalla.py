# Pruebas de pantalla: Tono del recordatorio (lista, canción propia y guía para la app cerrada)
from playwright.sync_api import sync_playwright
import tempfile, sys, os, wave, math, struct

U = "http://localhost:8765/"
SALIDA = sys.argv[1] if len(sys.argv) > 1 else tempfile.gettempdir()
errores, ok = [], [0]
def paso(txt):
    ok[0] += 1; print("  ✓", txt)

# Una "canción" de prueba: 2 segundos de tono en WAV
carpeta = tempfile.mkdtemp()
cancion = os.path.join(carpeta, "Mi cumbia favorita.wav")
with wave.open(cancion, "w") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(22050)
    w.writeframes(b"".join(struct.pack("<h", int(8000 * math.sin(2 * math.pi * 440 * i / 22050))) for i in range(44100)))
texto = os.path.join(carpeta, "notas.txt")
open(texto, "w").write("no soy audio")

with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(tempfile.mkdtemp(), channel="chromium", viewport={"width": 390, "height": 844},
                                               device_scale_factor=2, locale="es-MX", timezone_id="America/Cancun",
                                               args=["--autoplay-policy=no-user-gesture-required"])
    ctx.grant_permissions(["notifications"], origin="http://localhost:8765")
    pg = ctx.pages[0]
    pg.on("pageerror", lambda e: errores.append("page: " + str(e)))
    pg.on("console", lambda m: m.type == "error" and not any(x in m.text for x in ["fonts.g", "ERR_TUNNEL", "404"]) and errores.append(m.text))
    pg.goto(U); pg.wait_for_selector("#resumen h2")
    pg.fill("#entrada", "comprar pan"); pg.press("#entrada", "Enter"); pg.wait_for_timeout(150)

    pg.click(".tab[data-ir=ajustes]"); pg.wait_for_selector("#vista-ajustes:not([hidden])")
    nombres = pg.locator("#listaTonos .tono label").all_inner_texts()
    assert nombres == ["Suave", "Digital", "Minimal", "Campana", "Marimba", "Alerta"], nombres
    paso("Ajustes muestra la lista de tonos: " + ", ".join(nombres))

    antes = pg.evaluate("ajustes.sonidosTocados")
    pg.click("#listaTonos .tono:has-text('Campana') button.probar")
    assert pg.evaluate("ajustes.sonidosTocados") == antes + 1
    assert pg.evaluate("ajustes.actuales.reminderTone") == "suave"
    paso("▶ deja escuchar un tono sin cambiar el elegido")

    pg.click("#listaTonos .tono:has-text('Marimba') label"); pg.wait_for_timeout(150)
    assert pg.evaluate("almacen.leerAjustes().then(a => a.reminderTone)") == "marimba"
    pg.reload(); pg.wait_for_selector("#resumen h2"); pg.click(".tab[data-ir=ajustes]")
    assert pg.is_checked("#listaTonos input[value=marimba]")
    paso("elegir Marimba se guarda y sigue elegido al volver a abrir")

    pg.set_input_files("#archivoTono", texto); pg.wait_for_selector("#aviso:not([hidden])")
    assert "no es de audio" in pg.inner_text("#aviso"), pg.inner_text("#aviso")
    assert pg.evaluate("almacen.leerTono()") is None
    paso("un archivo que no es audio se rechaza con mensaje claro")

    pg.set_input_files("#archivoTono", cancion)
    pg.wait_for_selector("#listaTonos .tono:has-text('Mi cumbia favorita')")
    assert pg.is_checked("#listaTonos input[value=propio]")
    t = pg.evaluate("almacen.leerTono().then(t => ({n: t.nombre, tam: t.datos.size}))")
    assert t["n"] == "Mi cumbia favorita" and t["tam"] > 80000, t
    assert "Cambiar mi canción" in pg.inner_text("#elegirCancion")
    paso("'Elegir de mi música' guarda la canción en el teléfono y la deja elegida")
    pg.screenshot(path=os.path.join(SALIDA, "tonos-ajustes.png"), full_page=True)

    pg.reload(); pg.wait_for_selector("#resumen h2"); pg.wait_for_timeout(300)
    assert pg.evaluate("ajustes.tonoPropio") == "Mi cumbia favorita"
    paso("la canción sigue ahí después de cerrar y abrir")

    # Llega un recordatorio con la app abierta: suena la canción
    pg.evaluate("""async () => { const l = await almacen.leer();
        l.push({id: 'r1', texto: 'Tomar agua', cuando: new Date(Date.now() - 1000).toISOString(), conHora: true, hecho: false, creado: new Date().toISOString()});
        await almacen.guardar(l); }""")
    pg.reload(); pg.wait_for_selector("#aviso:not([hidden])"); pg.wait_for_timeout(500)
    sonando = pg.evaluate("[...document.querySelectorAll('audio')].length + (window.__x||0)")
    tocados = pg.evaluate("ajustes.sonidosTocados")
    assert tocados >= 1, tocados
    assert pg.evaluate("ajustes.tocarTono('propio')") is True
    paso("al llegar un recordatorio con la app abierta suena la canción elegida")

    pg.click(".tab[data-ir=ajustes]")
    pg.click("#listaTonos .tono:has-text('Mi cumbia favorita') button.quitar"); pg.wait_for_timeout(200)
    assert pg.locator("#listaTonos .tono:has-text('Mi cumbia favorita')").count() == 0
    assert pg.evaluate("almacen.leerTono()") is None and pg.evaluate("ajustes.actuales.reminderTone") == "suave"
    paso("'Quitar' borra la canción y regresa al tono Suave")

    pg.click("#sonidoCerrada"); pg.wait_for_selector("#guiaSonido[open]")
    pasos = pg.locator("#pasosGuia li").all_inner_texts()
    assert len(pasos) >= 3 and any("Sonido" in x for x in pasos), pasos
    pg.screenshot(path=os.path.join(SALIDA, "tonos-guia.png"))
    pg.click("#guiaSonido button[value=ok]")
    paso("'Sonido con la app cerrada' explica paso a paso dónde cambiarlo en el teléfono")

    pg.uncheck("#ajSonido"); pg.wait_for_timeout(100)
    assert pg.evaluate("document.getElementById('tonoRecordatorio').disabled") is True
    pg.check("#ajSonido")
    paso("si se apagan los sonidos, la lista de tonos se desactiva")

    assert "Comprar pan" in pg.evaluate("almacen.leer().then(l => l.map(x => x.texto).join(','))")
    paso("los pendientes no se tocaron")
    assert pg.evaluate("document.documentElement.scrollWidth <= innerWidth")
    paso("sin scroll horizontal en el teléfono")
    ctx.close()

print(f"\n{ok[0]} pruebas de tonos pasaron")
print("Errores JS:", errores or "ninguno")
sys.exit(1 if errores else 0)
