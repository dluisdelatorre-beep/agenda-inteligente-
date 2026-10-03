# Pruebas de pantalla: Avatar vivo de la asistente (respira, responde al toque, escucha, halo de atención)
from playwright.sync_api import sync_playwright
import tempfile, sys, os

U = "http://localhost:8765/"
SALIDA = sys.argv[1] if len(sys.argv) > 1 else tempfile.gettempdir()
errores, ok = [], [0]
def paso(txt):
    ok[0] += 1; print("  ✓", txt)

ANIMS = """(sel) => { const el = document.querySelector(sel); if (!el) return [];
  return el.getAnimations().map(a => ({ n: a.animationName, d: a.effect.getTiming().duration, it: a.effect.getTiming().iterations,
    props: [...new Set(a.effect.getKeyframes().flatMap(k => Object.keys(k)))].filter(k => !['offset','computedOffset','easing','composite'].includes(k)),
    kf: a.effect.getKeyframes().map(k => k.transform || k.opacity) })); }"""
AGREGAR = """async (x) => { const l = await almacen.leer(); l.push({ id: x.id, texto: x.texto, cuando: x.min === null ? null : new Date(Date.now() + x.min * 60000).toISOString(),
  conHora: x.min !== null, hecho: false, avisado: true, creado: new Date().toISOString(), priority: x.prio || 'normal' }); await almacen.guardar(l); await recargarParaPrueba(); }"""

with sync_playwright() as p:
    for tema in ["claro", "oscuro"]:
        ctx = p.chromium.launch_persistent_context(tempfile.mkdtemp(), channel="chromium", viewport={"width": 390, "height": 844}, device_scale_factor=2,
                                                   locale="es-MX", timezone_id="America/Cancun", color_scheme="dark" if tema == "oscuro" else "light")
        pg = ctx.pages[0]
        pg.on("pageerror", lambda e: errores.append("page: " + str(e)))
        pg.on("console", lambda m: m.type == "error" and not any(x in m.text for x in ["fonts.g", "ERR_TUNNEL", "404"]) and errores.append(m.text))
        pg.goto(U); pg.wait_for_selector("#resumen h2")
        pg.evaluate("window.recargarParaPrueba = () => new Promise(r => { navigator.serviceWorker.controller ? null : null; document.dispatchEvent(new Event('visibilitychange')); setTimeout(r, 300); })")

        # Idle: respira
        assert pg.get_attribute("#abrirAsistente", "data-estado") == "idle"
        a = pg.evaluate(ANIMS, ".avatar-respira")
        assert len(a) == 1 and a[0]["n"] == "avatar-respira" and 4000 <= a[0]["d"] <= 6000 and a[0]["it"] == float("inf"), a
        assert a[0]["props"] == ["transform"] and "translateY(-3px) scale(1.02)" in a[0]["kf"], a
        assert pg.evaluate("getComputedStyle(document.querySelector('.avatar-respira')).animationTimingFunction").startswith("cubic-bezier")
        paso(f"[{tema}] en reposo respira: {a[0]['d']/1000:.1f} s, sube 3 px y escala 1.02, solo transform, curva orgánica")
        marca = pg.evaluate("document.getElementById('abrirAsistente').__marca = 1")

        # Toque: 0.97 y abre el panel
        pg.dispatch_event("#abrirAsistente", "pointerdown")
        t = pg.evaluate(ANIMS, ".avatar-escena")
        assert t and t[0]["n"] == "avatar-toque" and "scale(0.97)" in t[0]["kf"] and t[0]["props"] == ["transform"], t
        pg.click("#abrirAsistente"); pg.wait_for_selector("#hojaAsistente[open]")
        e = pg.evaluate(ANIMS, ".avatar-reaccion")
        assert e and e[0]["n"] == "avatar-escucha" and 250 <= e[0]["d"] <= 400 and "translateY(-2px) scale(1.03)" in e[0]["kf"], e
        paso(f"[{tema}] al tocar baja a 0.97 ({t[0]['d']:.0f} ms) y abre 'Tu asistente' con la microreacción 'te escucho' ({e[0]['d']:.0f} ms)")
        pg.keyboard.press("Escape"); pg.wait_for_timeout(300)

        # Atención: vencido → alert, dos pulsos y se apaga
        pg.evaluate(AGREGAR, {"id": "v1", "texto": "Mandar reporte", "min": -20})
        assert pg.get_attribute("#abrirAsistente", "data-estado") == "alert"
        h = pg.evaluate(ANIMS, ".avatar-halo")
        assert h and h[0]["n"] == "avatar-pulso" and h[0]["it"] == 2 and set(h[0]["props"]) == {"opacity", "transform"}, h
        paso(f"[{tema}] con un vencido: halo dorado con 2 pulsos (opacity y transform)")
        if tema == "claro":
            pg.wait_for_timeout(1400); pg.screenshot(path=os.path.join(SALIDA, "avatar-halo.png"), clip={"x": 0, "y": 140, "width": 390, "height": 200})
        pg.wait_for_timeout(4300)
        assert "pulsando" not in pg.get_attribute("#abrirAsistente", "class")
        assert pg.evaluate(ANIMS, ".avatar-halo") == []
        assert pg.evaluate("getComputedStyle(document.querySelector('.avatar-halo')).opacity") == "0"
        paso(f"[{tema}] después de los pulsos el halo se apaga y regresa a respirar (no pulsa todo el tiempo)")

        # Repintar (por ejemplo al guardar otro pendiente normal) no vuelve a pulsar ni reinicia el avatar
        pg.fill("#entrada", "comprar pan"); pg.press("#entrada", "Enter"); pg.wait_for_timeout(300)
        assert "pulsando" not in pg.get_attribute("#abrirAsistente", "class")
        assert pg.evaluate("document.getElementById('abrirAsistente').__marca") == 1
        paso(f"[{tema}] al repintar no se reinicia el avatar ni vuelve a pulsar por lo mismo")

        # Algo nuevo de prioridad Alta → vuelve a avisar
        pg.evaluate(AGREGAR, {"id": "a1", "texto": "Firmar contrato", "min": None, "prio": "alta"})
        assert "pulsando" in pg.get_attribute("#abrirAsistente", "class")
        paso(f"[{tema}] un pendiente nuevo de prioridad Alta vuelve a dar los 2 pulsos")
        pg.screenshot(path=os.path.join(SALIDA, f"avatar-{tema}.png"), clip={"x": 0, "y": 120, "width": 390, "height": 260})
        ctx.close()

    # Caso del teléfono: capturar con el teclado abierto (avatar fuera de pantalla) → el pulso espera a que se vea
    ctx = p.chromium.launch_persistent_context(tempfile.mkdtemp(), channel="chromium", viewport={"width": 390, "height": 500},
                                               locale="es-MX", timezone_id="America/Cancun")
    pg = ctx.pages[0]
    pg.on("pageerror", lambda e: errores.append("page: " + str(e)))
    pg.goto(U); pg.wait_for_selector("#resumen h2")
    for i in range(6): pg.fill("#entrada", f"tarea {i}"); pg.press("#entrada", "Enter"); pg.wait_for_timeout(80)
    pg.evaluate("window.scrollTo(0, document.documentElement.scrollHeight)"); pg.wait_for_timeout(200)
    assert pg.evaluate("document.getElementById('abrirAsistente').getBoundingClientRect().bottom") < 0
    pg.evaluate("document.getElementById('entrada').value = 'llamar al banco hoy a las 8 am'; document.getElementById('entrada').dispatchEvent(new Event('input')); document.getElementById('captura').requestSubmit()"); pg.wait_for_timeout(400)
    assert pg.get_attribute("#abrirAsistente", "data-estado") == "alert"
    assert "pulsando" not in pg.get_attribute("#abrirAsistente", "class")
    pg.evaluate("window.scrollTo(0, 0)"); pg.wait_for_timeout(700)
    assert "pulsando" in pg.get_attribute("#abrirAsistente", "class")
    paso("si el avatar no se ve al crear el vencido (teclado abierto), los 2 pulsos esperan y se ven al regresar arriba")
    ctx.close()

    # Movimiento reducido
    ctx = p.chromium.launch_persistent_context(tempfile.mkdtemp(), channel="chromium", viewport={"width": 390, "height": 844},
                                               locale="es-MX", timezone_id="America/Cancun", reduced_motion="reduce")
    pg = ctx.pages[0]
    pg.on("pageerror", lambda e: errores.append("page: " + str(e)))
    pg.goto(U); pg.wait_for_selector("#resumen h2")
    assert pg.evaluate(ANIMS, ".avatar-respira") == []
    pg.evaluate("""async () => { const l = await almacen.leer(); l.push({id: 'v', texto: 'Vencido', cuando: new Date(Date.now() - 6e5).toISOString(), conHora: true, hecho: false, avisado: true});
        await almacen.guardar(l); document.dispatchEvent(new Event('visibilitychange')); }"""); pg.wait_for_timeout(300)
    assert pg.evaluate(ANIMS, ".avatar-halo") == []
    assert pg.evaluate("getComputedStyle(document.querySelector('.avatar-halo')).opacity") == "0.5"
    pg.dispatch_event("#abrirAsistente", "pointerdown")
    assert pg.evaluate(ANIMS, ".avatar-escena")[0]["n"] == "avatar-toque"
    pg.click("#abrirAsistente"); pg.wait_for_selector("#hojaAsistente[open]")
    assert pg.evaluate(ANIMS, ".avatar-reaccion") == []
    paso("movimiento reducido: no respira ni pulsa (halo quieto y tenue), solo queda el pequeño feedback al tocar")
    ctx.close()

print(f"\n{ok[0]} pruebas del avatar pasaron")
print("Errores JS:", errores or "ninguno")
sys.exit(1 if errores else 0)
