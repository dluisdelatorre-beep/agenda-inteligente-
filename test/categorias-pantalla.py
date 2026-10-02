# Pruebas de pantalla: Categorías, prioridades y estadísticas
from playwright.sync_api import sync_playwright
import tempfile, sys, os

U = "http://localhost:8765/"
SALIDA = sys.argv[1] if len(sys.argv) > 1 else tempfile.gettempdir()
errores, ok = [], [0]
def paso(txt):
    ok[0] += 1; print("  ✓", txt)

with sync_playwright() as p:
    for tema in ["claro", "oscuro"]:
        ctx = p.chromium.launch_persistent_context(tempfile.mkdtemp(), channel="chromium", viewport={"width": 390, "height": 844},
                                                   device_scale_factor=2, locale="es-MX", timezone_id="America/Cancun",
                                                   color_scheme="dark" if tema == "oscuro" else "light")
        pg = ctx.pages[0]
        pg.on("pageerror", lambda e: errores.append("page: " + str(e)))
        pg.on("console", lambda m: m.type == "error" and not any(x in m.text for x in ["fonts.g", "ERR_TUNNEL", "404"]) and errores.append(m.text))
        pg.goto(U); pg.wait_for_selector("#resumen h2")

        if tema == "claro":
            pg.fill("#entrada", "Llamar a Luis urgente mañana a las 9")
            e = pg.inner_text("#entendido")
            assert "Llamar a Luis" in e and "Prioridad Alta" in e and "urgente" not in e.lower().split("—")[0], e
            paso("al escribir 'urgente' muestra Prioridad Alta y lo quita del texto: " + e)
            pg.press("#entrada", "Enter"); pg.wait_for_timeout(200)
            it = pg.locator("#lista .item", has_text="Llamar a Luis")
            assert "prio-alta" in it.get_attribute("class") and "Prioridad Alta" in it.inner_text()
            paso("la tarjeta lleva la marca roja de prioridad alta")

            pg.fill("#entrada", "pagar la luz el viernes"); pg.wait_for_timeout(50)
            assert "Pagos" in pg.inner_text("#entendido")
            pg.press("#entrada", "Enter"); pg.wait_for_timeout(150)
            pg.fill("#entrada", "Cita con el dentista mañana a las 4"); pg.press("#entrada", "Enter"); pg.wait_for_timeout(150)
            pg.fill("#entrada", "comprar pan"); pg.press("#entrada", "Enter"); pg.wait_for_timeout(150)
            pg.fill("#entrada", "revisar ideas sin prisa"); pg.press("#entrada", "Enter"); pg.wait_for_timeout(150)
            datos = pg.evaluate("almacen.leer().then(l => Object.fromEntries(l.map(x => [x.texto, [x.category, x.priority]])))")
            assert datos["Pagar la luz"] == ["pagos", "normal"], datos
            assert datos["Cita con el dentista"] == ["salud", "normal"], datos
            assert datos["Comprar pan"] == ["casa", "normal"], datos
            assert datos["Revisar ideas"] == [None, "baja"], datos
            assert datos["Llamar a Luis"] == [None, "alta"], datos
            paso("categoría y prioridad se adivinan y se guardan: " + str(datos))

            # Editar: cambiar categoría y prioridad a mano
            pg.click("#lista >> text=Comprar pan"); pg.wait_for_selector("#lista .editor")
            assert pg.eval_on_selector("#lista .editor select[aria-label='Categoría']", "s => s.value") == "casa"
            pg.select_option("#lista .editor select[aria-label='Categoría']", "personal")
            pg.select_option("#lista .editor select[aria-label='Prioridad']", "alta")
            pg.click("#lista .editor .primario"); pg.wait_for_timeout(200)
            r = pg.evaluate("almacen.leer().then(l => l.find(x => x.texto === 'Comprar pan'))")
            assert r["category"] == "personal" and r["priority"] == "alta", r
            paso("en el editor se cambian categoría y prioridad")

            # Pendiente viejo (sin campos nuevos) sigue funcionando
            pg.evaluate("""async () => { const l = await almacen.leer();
                l.push({id: 'viejo', texto: 'Pendiente de antes', cuando: null, conHora: false, hecho: false, creado: new Date().toISOString()});
                await almacen.guardar(l); }""")
            pg.reload(); pg.wait_for_selector("#resumen h2")
            assert "Pendiente de antes" in pg.inner_text("#lista")
            paso("los pendientes de antes (sin categoría) se ven igual que siempre")

            # Buscar por categoría
            pg.click(".tab[data-ir=buscar]"); pg.wait_for_selector("#vista-buscar:not([hidden])")
            pg.click("#chipsCat .chip[data-cat=salud]"); pg.wait_for_timeout(100)
            res = pg.inner_text("#resultados")
            assert "Cita con el dentista" in res and "Pagar la luz" not in res, res
            assert pg.inner_text("#conteo") == "1 resultado"
            paso("en Buscar, tocar 'Salud' muestra solo esa categoría")
            pg.click("#chipsCat .chip[data-cat=todas]"); pg.fill("#busca", "pagos"); pg.wait_for_timeout(100)
            assert "Pagar la luz" in pg.inner_text("#resultados")
            paso("buscar la palabra 'pagos' encuentra los de esa categoría")
            pg.click(".chip[data-busca=hechos]"); pg.wait_for_timeout(50)
            assert "activo" in pg.get_attribute("#chipsCat .chip[data-cat=todas]", "class")
            pg.click(".chip[data-busca=todos]")
            paso("los filtros Todos/Pendientes/Hechos siguen funcionando junto con las categorías")

            # Marcar hechos y ver estadísticas
            pg.click(".tab[data-ir=hoy]"); pg.wait_for_selector("#vista-hoy:not([hidden])")
            for t in ["Pagar la luz", "Cita con el dentista"]:
                pg.locator("#lista .item", has_text=t).locator(".check").click(); pg.wait_for_timeout(120)
        else:
            pg.evaluate("""async () => { const ahora = Date.now(), dia = 864e5; const l = [];
                const c = ['trabajo','salud','pagos','casa','personal'];
                for (let i = 0; i < 12; i++) l.push({id: 'x'+i, texto: 'Tarea ' + i, cuando: new Date(ahora - (i%6)*dia - 36e5).toISOString(), conHora: true,
                  hecho: i % 3 !== 0, hechoEn: i % 3 !== 0 ? new Date(ahora - (i%6)*dia).toISOString() : null, creado: new Date().toISOString(),
                  category: c[i%5], priority: i%4 === 0 ? 'alta' : 'normal'});
                await almacen.guardar(l); }""")
            pg.reload(); pg.wait_for_selector("#resumen h2")

        pg.click("#verEstadisticas"); pg.wait_for_selector("#vista-estadisticas:not([hidden])")
        assert "#estadisticas" in pg.url
        tiles = pg.inner_text("#statsTiles")
        e = pg.evaluate("__estadisticas(JSON.parse(JSON.stringify([])))")  # vacío no truena
        assert e["cumplimiento"] is None and e["racha"] == 0
        if tema == "claro":
            assert "Completados (7 días)\n2" in tiles and "Racha\n1 día" in tiles, tiles
            assert pg.locator("#statsDias .col-dia").count() == 7 and pg.inner_text("#statsDias .col-dia.hoy .num") == "2"
            cat = pg.inner_text("#statsCat")
            assert "Pagos" in cat and "1/1" in cat and "Sin categoría" in cat, cat
            prio = pg.inner_text("#statsPrio")
            assert prio.split("\n")[0] == "2", prio  # Alta: Llamar a Luis + Comprar pan
            paso("Estadísticas: completados, cumplimiento, racha, 7 días, categorías y prioridad cuadran")
        else:
            assert "Racha\n2 días" in tiles and "Completados (7 días)\n8" in tiles and "67%" in tiles, tiles
            paso("Estadísticas en modo oscuro con datos de una semana: 8 completados, 67%, racha de 2 días (ayer y antier)")
        assert pg.evaluate("document.documentElement.scrollWidth <= innerWidth")
        pg.screenshot(path=os.path.join(SALIDA, f"estadisticas-{tema}.png"), full_page=True)
        pg.go_back(); pg.wait_for_selector("#vista-hoy:not([hidden])")
        paso(f"[{tema}] el botón atrás regresa a Hoy, sin scroll horizontal")
        pg.screenshot(path=os.path.join(SALIDA, f"hoy-categorias-{tema}.png"), full_page=True)
        ctx.close()

print(f"\n{ok[0]} pruebas de categorías, prioridades y estadísticas pasaron")
print("Errores JS:", errores or "ninguno")
sys.exit(1 if errores else 0)
