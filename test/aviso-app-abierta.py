# Prueba: con la app ABIERTA el recordatorio lanza el aviso del sistema con sonido,
# y el aviso del servidor (Web Push) que llega después no lo repite.
from playwright.sync_api import sync_playwright
import tempfile, sys, json, time

U = "http://localhost:8765/"
errores, ok = [], [0]
def paso(txt):
    ok[0] += 1; print("  ✓", txt)

with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(tempfile.mkdtemp(), channel="chromium", viewport={"width": 390, "height": 844},
                                               locale="es-MX", timezone_id="America/Cancun")
    ctx.grant_permissions(["notifications"], origin="http://localhost:8765")
    pg = ctx.pages[0]
    pg.on("pageerror", lambda e: errores.append("page: " + str(e)))
    pg.goto(U); pg.wait_for_selector("#resumen h2"); pg.evaluate("navigator.serviceWorker.ready")
    pg.click("body")  # un toque, como cualquier persona usando la app

    # Pendiente que vence en 3 segundos, con la app abierta
    pg.evaluate("""async () => { const l = await almacen.leer();
        l.push({id: 'abierta1', texto: 'Llamar a Luis', cuando: new Date(Date.now() + 3000).toISOString(), conHora: true,
                hecho: false, avisado: false, creado: new Date().toISOString(), actionType: 'llamar', contactName: 'Luis',
                contactPhone: '9981234567', actionValue: 'tel:9981234567'});
        await almacen.guardar(l); location.reload(); }""")
    pg.wait_for_selector("#resumen h2")
    antes = pg.evaluate("ajustes.sonidosTocados")
    pg.wait_for_selector("#aviso:not([hidden])", timeout=15000)
    t_aviso = time.time()
    notifs = pg.evaluate("""async () => (await (await navigator.serviceWorker.ready).getNotifications({tag: 'abierta1'}))
        .map(n => ({t: n.title, s: n.silent, r: n.renotify, a: n.actions.map(x => x.title)}))""")
    assert len(notifs) == 1 and notifs[0]["s"] is False and notifs[0]["r"] is True, notifs
    assert notifs[0]["a"][:2] == ["Llamar ahora", "Posponer 10 min"], notifs
    paso(f"app abierta: a la hora llega el aviso del sistema con sonido ({notifs[0]['t']} · {' | '.join(notifs[0]['a'])})")
    assert pg.evaluate("ajustes.sonidosTocados") > antes
    paso("además suena el tono elegido dentro de la app (3 veces)")
    rec = pg.evaluate("almacen.leer().then(l => l.find(x => x.id === 'abierta1'))")
    assert rec["avisado"] and rec["avisadoEn"]
    paso("queda anotado que ya se avisó (avisadoEn)")

    # Llega el Web Push del servidor para el mismo pendiente: no debe volver a sonar
    cdp = ctx.new_cdp_session(pg)
    regs = []
    cdp.on("ServiceWorker.workerRegistrationUpdated", lambda e: regs.extend(e["registrations"]))
    cdp.send("ServiceWorker.enable"); pg.wait_for_timeout(800)
    reg_id = [r for r in regs if not r.get("isDeleted")][0]["registrationId"]
    cdp.send("ServiceWorker.deliverPushMessage", {"origin": "http://localhost:8765", "registrationId": reg_id,
             "data": json.dumps({"id": "abierta1", "titulo": "Agenda Inteligente", "cuerpo": "Llamar a Luis"})})
    pg.wait_for_timeout(1200)
    notifs2 = pg.evaluate("""async () => (await (await navigator.serviceWorker.ready).getNotifications({tag: 'abierta1'}))
        .map(n => ({s: n.silent, r: n.renotify}))""")
    assert len(notifs2) == 1 and notifs2[0]["s"] is True, notifs2
    paso("el Web Push que llega después no suena dos veces (deja el mismo aviso)")

    # Con la app cerrada (sin aviso previo) el Web Push sí suena
    pg.evaluate("""async () => { const l = await almacen.leer();
        l.push({id: 'cerrada1', texto: 'Pagar internet', cuando: new Date(Date.now() - 1000).toISOString(), conHora: true,
                hecho: false, avisado: false, creado: new Date().toISOString()});
        await almacen.guardar(l); }""")
    cdp.send("ServiceWorker.deliverPushMessage", {"origin": "http://localhost:8765", "registrationId": reg_id,
             "data": json.dumps({"id": "cerrada1", "titulo": "Agenda Inteligente", "cuerpo": "Pagar internet"})})
    pg.wait_for_timeout(1200)
    n3 = pg.evaluate("""async () => (await (await navigator.serviceWorker.ready).getNotifications({tag: 'cerrada1'}))
        .map(n => ({s: n.silent, r: n.renotify}))""")
    assert len(n3) == 1 and n3[0]["s"] is False and n3[0]["r"] is True, n3
    paso("Web Push sin aviso previo (app cerrada o en segundo plano) llega con sonido")
    ctx.close()

print(f"\n{ok[0]} pruebas de aviso con la app abierta pasaron")
print("Errores JS:", errores or "ninguno")
sys.exit(1 if errores else 0)
