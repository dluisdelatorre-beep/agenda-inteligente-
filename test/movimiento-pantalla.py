# Pruebas de pantalla: regresión de movimiento v30 sin doble parpadeo
# Comprueba en el navegador que cada movimiento ocurre de verdad (no solo que exista en el código).
from playwright.sync_api import sync_playwright
import tempfile, sys, math

U = "http://localhost:8765/"
errores, ok = [], [0]
def paso(t): ok[0] += 1; print("  ✓", t)

def abrir(p, w=390, h=844, **kw):
    ctx = p.chromium.launch_persistent_context(tempfile.mkdtemp(), channel="chromium", viewport={"width": w, "height": h},
                                               locale="es-MX", timezone_id="America/Cancun", **kw)
    pg = ctx.pages[0]
    pg.on("pageerror", lambda e: errores.append("page: " + str(e)))
    pg.on("console", lambda m: m.type == "error" and not any(x in m.text for x in ["fonts.g", "ERR_TUNNEL", "404", "501"]) and errores.append(m.text))
    return ctx, pg

ANGULO = """() => { const t = getComputedStyle(document.querySelector('#splash .splash-letras')).transform;
  if (!t || t === 'none') return 0; const v = t.match(/matrix\\(([^)]+)\\)/)[1].split(',').map(Number); return Math.atan2(v[1], v[0]) * 180 / Math.PI; }"""

with sync_playwright() as p:
    ctx, pg = abrir(p)
    pg.add_init_script("""window.__mov = {}; new MutationObserver(() => { const s = document.getElementById('splash'), a = document.querySelector('.app');
      if (s && s.classList.contains('saliendo') && !__mov.sal) { __mov.sal = performance.now(); __mov.appAlSalir = a && a.classList.contains('entrada-inicial'); }
      if (s && s.hidden && !__mov.fin) __mov.fin = performance.now(); }).observe(document, { subtree: true, attributes: true, childList: true });""")
    pg.goto(U)

    # 1) Splash: solo las letras se mueven, con rotación muy leve (firma flotante, nunca más de 2°)
    angulos = []
    for _ in range(8):
        pg.wait_for_timeout(170); angulos.append(round(pg.evaluate(ANGULO), 2))
    anims = pg.evaluate("document.querySelector('#splash .splash-letras').getAnimations().map(a => a.animationName)")
    assert "js-flota" in anims and "js-pulso" in anims, anims
    assert all(abs(a) <= 2.0 for a in angulos) and max(angulos) - min(angulos) > 0.5, angulos
    assert pg.evaluate("document.querySelector('#splash .splash-fondo').getAnimations().length") == 0  # la foto no se anima
    paso(f"splash: las letras JS flotan con rotación leve (de {min(angulos)}° a {max(angulos)}°, máximo ±2°); la foto queda fija")

    # 2) Hoy emerge desde atrás en el MISMO instante en que el splash empieza a desvanecerse (sin hueco)
    pg.wait_for_function("window.__mov.fin > 0", timeout=5000)
    m = pg.evaluate("__mov")
    assert m["appAlSalir"] is True, m
    assert 450 <= m["fin"] - m["sal"] <= 800, m  # transición 500–750 ms
    assert m["fin"] < 3000, m
    paso(f"Hoy empieza a acercarse junto con el desvanecido del splash ({m['fin'] - m['sal']:.0f} ms de transición; splash fuera a los {m['fin'] / 1000:.2f} s)")
    pg.wait_for_selector("#resumen h2"); pg.wait_for_timeout(900)

    # 3) Navegación: la pantalla nunca baja a opacity=0 ni crea fantasmas al alternar.
    pg.click(".tab[data-ir=calendario]"); pg.wait_for_timeout(40)
    anim = pg.evaluate("""(() => { const v = document.getElementById('vista-calendario');
      return [getComputedStyle(v).animationName, Number(getComputedStyle(v).opacity)]; })()""")
    assert anim[0] == "v30-entra-adelante" and anim[1] > .99, anim
    assert pg.evaluate("document.querySelectorAll('.vista-fantasma').length") == 0
    assert pg.evaluate("document.querySelectorAll('.vista:not([hidden])').length") == 1
    for v in ["buscar", "ajustes", "hoy", "calendario", "hoy"]:
        pg.click(f".tab[data-ir={v}]"); pg.wait_for_timeout(30)
        assert pg.evaluate("document.querySelectorAll('.vista-fantasma').length") == 0
        assert pg.evaluate("document.querySelectorAll('.vista:not([hidden])').length") == 1
    pg.wait_for_timeout(350)
    paso("navegación v30: transición de profundidad sin duplicar pantallas ni bajar su opacidad")

    # 4) Avatar: solo saluda una vez al entrar; cambiar de sección no fuerza otro parpadeo.
    pg.click(".tab[data-ir=buscar]"); pg.wait_for_timeout(350)
    gestoAntes = pg.evaluate("document.getElementById('abrirAsistente').dataset.reaccion || ''")
    pg.click(".tab[data-ir=hoy]"); pg.wait_for_timeout(350)
    gestoDespues = pg.evaluate("document.getElementById('abrirAsistente').dataset.reaccion || ''")
    assert gestoAntes == gestoDespues, (gestoAntes, gestoDespues)
    assert pg.evaluate("document.querySelector('#resumen #abrirAsistente') !== null")
    paso("Avatar v30: sin saludo ni parpadeo artificial al navegar; permanece en Hoy")

    # 5) Ventanas: una sola materialización (de difuso a nítido), sin segundo flash en los hijos.
    pg.click("#abrirAsistente"); pg.wait_for_timeout(60)
    a = pg.evaluate("""(() => { const d = document.getElementById('hojaAsistente');
      return [getComputedStyle(d.querySelector('.hoja-cuerpo')).animationName,
              getComputedStyle(d.querySelector('.hoja-cuerpo > *')).animationName]; })()""")
    assert a == ["v30-ventana-materializa", "none"], a
    assert pg.evaluate("document.querySelector('#resumen #abrirAsistente') !== null")
    pg.wait_for_timeout(600)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(30)
    c = pg.evaluate("""(() => { const d = document.getElementById('hojaAsistente');
      return [d.open, d.classList.contains('cerrando'), getComputedStyle(d.querySelector('.hoja-cuerpo > *')).transitionDuration]; })()""")
    assert c[0] and c[1] and c[2] == "0.12s", c
    pg.wait_for_timeout(450)
    assert not pg.evaluate("document.getElementById('hojaAsistente').open")
    paso("ventanas v30: materialización única, cierre progresivo, Avatar sin trasladarse de Hoy")

    # 6) Tarjetas: borrar = salida + reacomodo suave de las demás (FLIP)
    for t in ["uno prueba hoy a las 11 pm", "dos prueba hoy a las 11:10 pm", "tres prueba hoy a las 11:20 pm"]:
        pg.fill("#entrada", t); pg.press("#entrada", "Enter"); pg.wait_for_timeout(350)
    pg.wait_for_timeout(500)
    pg.locator("#lista .item", has_text="Uno prueba").locator(".borrar").click(); pg.wait_for_timeout(60)
    assert "saliendo" in pg.locator("#lista .item", has_text="Uno prueba").get_attribute("class")
    pg.wait_for_timeout(200)
    mov = pg.evaluate("[...document.querySelectorAll('#lista .item')].map(e => e.getAnimations().length)")
    assert any(mov), mov
    pg.wait_for_timeout(400)
    assert pg.locator("#lista .item", has_text="Uno prueba").count() == 0
    assert pg.evaluate("almacen.leer().then(l => !l.some(x => x.texto.startsWith('Uno prueba')))")
    paso("tarjetas: al borrar, la tarjeta sale y las demás se reacomodan deslizándose (dato ya borrado)")

    # 7) Tu semana: contadores que suben, barras que se revelan, tarjetas escalonadas
    pg.locator("#lista .item", has_text="Dos prueba").locator(".check").click(); pg.wait_for_timeout(700)
    pg.click("#verEstadisticas"); pg.wait_for_timeout(120)
    primero = pg.evaluate("document.querySelector('#statsTiles .tile strong').textContent")
    barras = pg.evaluate("[...document.querySelectorAll('#statsDias .barra')].map(b => getComputedStyle(b).animationName)")
    assert "v29-barra" in barras, barras
    pg.wait_for_timeout(900)
    final = pg.evaluate("document.querySelector('#statsTiles .tile strong').textContent")
    assert final == "1" and primero in ("0", "1"), (primero, final)
    paso(f"Tu semana: el contador sube hasta su valor ({primero} → {final}), las barras se revelan y las tarjetas llegan escalonadas")
    ctx.close()

    # 8) Movimiento reducido: nada de copias que se desvanecen ni contadores animados; el splash igual desaparece
    ctx, pg = abrir(p, reduced_motion="reduce")
    pg.goto(U); pg.wait_for_selector("#splash", state="hidden", timeout=4000)
    assert pg.evaluate("document.querySelector('#splash .splash-letras').getAnimations().length") == 0
    pg.click(".tab[data-ir=calendario]"); pg.wait_for_timeout(30)
    assert pg.evaluate("document.querySelectorAll('.vista-fantasma').length") == 0
    paso("movimiento reducido: letras quietas, sin copias de la vista; el splash desaparece igual")
    ctx.close()

    # 9) Computadora: mismo sistema
    ctx, pg = abrir(p, 1440, 900)
    pg.goto(U); pg.wait_for_selector("#splash", state="hidden", timeout=4000); pg.wait_for_timeout(900)
    pg.click(".tab[data-ir=buscar]"); pg.wait_for_timeout(40)
    assert pg.evaluate("document.querySelectorAll('.vista-fantasma').length") == 0
    assert pg.evaluate("getComputedStyle(document.getElementById('vista-buscar')).opacity") == "1"
    assert pg.evaluate("document.documentElement.scrollWidth <= innerWidth")
    paso("computadora: navegación continua sin destello ni desplazamiento horizontal")
    ctx.close()

print(f"{ok[0]} pruebas de movimiento pasaron")
print("Errores JS:", errores or "ninguno")
sys.exit(1 if errores else 0)
