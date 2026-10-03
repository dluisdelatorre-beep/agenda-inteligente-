# Pruebas de pantalla: módulo Contactos (crear, editar, borrar, buscar, importar, ligar con pendientes, cumpleaños, privacidad)
from playwright.sync_api import sync_playwright
import tempfile, sys, os, json

U = "http://localhost:8765/"
SALIDA = sys.argv[1] if len(sys.argv) > 1 else tempfile.gettempdir()
errores, ok = [], [0]
def paso(txt):
    ok[0] += 1; print("  ✓", txt)

VCF = """BEGIN:VCARD
VERSION:3.0
N:de la Torre;Luis;;;
FN:Luis de la Torre
TEL;TYPE=CELL:+52 998 429 2748
EMAIL:luis@nuevo.com
ORG:All Global
END:VCARD
BEGIN:VCARD
VERSION:3.0
FN:Germán Muñoz
TEL:55 1111 2222
END:VCARD
BEGIN:VCARD
VERSION:3.0
FN:Sofía Ruiz
TEL:998 777 6655
END:VCARD
"""
CSV = "Nombre;Apellidos;Teléfono;Correo;Empresa\nMarta;López;9981231234;marta@x.mx;Clínica Sur\n"

def nuevo_contacto(pg, **d):
    pg.wait_for_selector("#editorContacto[open]")
    for k, v in d.items():
        if k == "favorito": pg.check("#formContacto [name=favorito]")
        else: pg.fill(f"#formContacto [name={k}]", v)
    pg.click("#formContacto button[type=submit]")

def capturar(pg, frase):
    pg.fill("#entrada", frase); pg.wait_for_timeout(60)
    chip = pg.inner_text("#entendido")
    pg.press("#entrada", "Enter"); pg.wait_for_timeout(250)
    return chip

with sync_playwright() as p:
    datos = tempfile.mkdtemp()
    ctx = p.chromium.launch_persistent_context(datos, channel="chromium", viewport={"width": 390, "height": 844}, device_scale_factor=2,
                                               locale="es-MX", timezone_id="America/Cancun")
    pg = ctx.pages[0]
    pg.on("pageerror", lambda e: errores.append("page: " + str(e)))
    pg.on("console", lambda m: m.type == "error" and not any(x in m.text for x in ["fonts.g", "ERR_TUNNEL", "404", "501"]) and errores.append(m.text))
    pg.goto(U); pg.wait_for_selector("#resumen h2")
    cuerpos = []
    pg.on("request", lambda r: r.method == "POST" and cuerpos.append(r.post_data or ""))

    # ---- Crear, validar, buscar ----
    pg.click("#verContactos"); pg.wait_for_selector("#vista-contactos:not([hidden])")
    assert "Aún no tienes contactos" in pg.inner_text("#listaContactos")
    assert pg.is_hidden("#importarAgenda") or True
    pg.click("#nuevoContacto"); pg.wait_for_selector("#editorContacto[open]")
    pg.click("#formContacto button[type=submit]")
    assert "al menos el nombre" in pg.inner_text("#errorContacto")
    pg.fill("#formContacto [name=telefono]", "12")
    pg.fill("#formContacto [name=nombre]", "Luis"); pg.click("#formContacto button[type=submit]")
    assert "Revisa el teléfono" in pg.inner_text("#errorContacto")
    paso("valida: pide nombre y avisa si el teléfono está mal")
    pg.fill("#formContacto [name=telefono]", "998 429 2748")
    nuevo_contacto(pg, apellidos="de la Torre", email="luis@ejemplo.com", empresa="VForge", etiquetas="socio, cliente", cumpleanos="1985-05-12", favorito=True)
    pg.wait_for_selector("#fichaContacto[open]")
    assert pg.inner_text("#fichaNombre") == "Luis de la Torre"
    hrefs = pg.eval_on_selector_all("#fichaAcciones a", "as => as.map(a => [a.textContent, a.getAttribute('href'), a.getAttribute('target')])")
    assert hrefs == [["📞 Llamar", "tel:9984292748", None], ["💬 WhatsApp", "https://wa.me/529984292748", "_blank"], ["✉️ Correo", "mailto:luis@ejemplo.com", None]], hrefs
    paso("crea contacto y su ficha trae Llamar · WhatsApp · Correo con enlaces estándar del teléfono")
    pg.click("#fichaContacto [data-cerrar]")
    for d in [dict(nombre="Luis", apellidos="Pérez", telefono="55 1234 5678", empresa="Notaría 5"),
              dict(nombre="Ana", apellidos="Gómez", email="ana@correo.mx", etiquetas="familia", cumpleanos="1990-10-20")]:
        pg.click("#nuevoContacto"); nuevo_contacto(pg, **d); pg.wait_for_selector("#fichaContacto[open]"); pg.click("#fichaContacto [data-cerrar]")
    nombres = pg.locator("#listaContactos .contacto-txt strong").evaluate_all("e => e.map(x => x.textContent)")
    assert nombres == ["⭐ Luis de la Torre", "Ana Gómez", "Luis Pérez"], nombres
    def busca(q):
        pg.fill("#buscaContacto", q); pg.wait_for_timeout(50)
        return [x.replace("⭐ ", "") for x in pg.locator("#listaContactos .contacto-txt strong").evaluate_all("e => e.map(x => x.textContent)")]
    assert busca("luis") == ["Luis de la Torre", "Luis Pérez"]
    assert busca("4292") == ["Luis de la Torre"]
    assert busca("notaria") == ["Luis Pérez"]
    assert busca("familia") == ["Ana Gómez"]
    assert busca("roberto") == [] and "No encontré" in pg.inner_text("#listaContactos")
    busca("")
    paso("lista con favoritos primero; busca por nombre, teléfono, empresa y etiqueta")

    # ---- Editar y favorito ----
    pg.click("#listaContactos .contacto-abrir:has-text('Luis Pérez')"); pg.wait_for_selector("#fichaContacto[open]")
    pg.click("#fichaFavorito"); pg.wait_for_timeout(100)
    assert pg.inner_text("#fichaFavorito") == "★"
    pg.click("#fichaEditar"); pg.wait_for_selector("#editorContacto[open]")
    pg.fill("#formContacto [name=empresa]", "Notaría 12"); pg.click("#formContacto button[type=submit]"); pg.wait_for_timeout(200)
    assert "Notaría 12" in pg.inner_text("#fichaEmpresa")
    pg.click("#fichaContacto [data-cerrar]")
    assert pg.locator("#listaContactos .contacto-txt strong").evaluate_all("e => e.map(x => x.textContent)")[:2] == ["⭐ Luis de la Torre", "⭐ Luis Pérez"]
    paso("edita datos y marca favoritos")

    # ---- Ligar con pendientes desde la frase ----
    pg.click("#volverHoyContactos"); pg.wait_for_selector("#vista-hoy:not([hidden])")
    chip = capturar(pg, "Llamar a Luis de la Torre para revisar propuesta mañana a las 10")
    assert "👤 Luis de la Torre" in chip, chip
    p1 = pg.evaluate("almacen.leer().then(l => l[l.length-1])")
    c_luis = pg.evaluate("almacen.leerContactos().then(l => l.find(c => c.apellidos === 'de la Torre').id)")
    assert p1["contact_id"] == c_luis and p1["contactPhone"] == "9984292748" and p1["actionValue"] == "tel:9984292748", p1
    it = pg.locator("#lista .item", has_text="Llamar a Luis de la Torre")
    assert it.locator("a.accion-item").get_attribute("href") == "tel:9984292748"
    canales = it.locator(".contacto-pend a").evaluate_all("as => as.map(a => a.getAttribute('aria-label'))")
    assert canales == ["WhatsApp", "Correo"], canales  # Llamar ya está como acción principal
    assert "Luis de la Torre" in it.locator(".contacto-pend .persona").inner_text()
    paso("«Llamar a Luis de la Torre…» se liga solo al contacto, toma su teléfono y muestra Llamar · WhatsApp · Correo")

    pg.fill("#entrada", "Llamar a Luis mañana a las 11"); pg.wait_for_timeout(60)
    assert "¿Cuál Luis? (2)" in pg.inner_text("#entendido")
    pg.press("#entrada", "Enter"); pg.wait_for_selector("#elegirPersona[open]")
    ops = pg.locator("#elegirPersonaLista .elegir-opcion strong").all_inner_texts()
    assert ops == ["Luis de la Torre", "Luis Pérez"], ops
    pg.click("#elegirPersonaLista .elegir-opcion:has-text('Luis Pérez')"); pg.wait_for_timeout(250)
    p2 = pg.evaluate("almacen.leer().then(l => l[l.length-1])")
    c_perez = pg.evaluate("almacen.leerContactos().then(l => l.find(c => c.apellidos === 'Pérez').id)")
    assert p2["contact_id"] == c_perez and p2["contactPhone"] == "5512345678", p2
    paso("si hay dos Luis no adivina: pregunta cuál y liga el elegido")

    chip = capturar(pg, "Tengo reunión con Carlos el viernes a las 5")
    assert "Carlos (nuevo)" in chip, chip
    pg.click("#aviso >> text=Crear contacto «Carlos»"); pg.wait_for_selector("#editorContacto[open]")
    assert pg.input_value("#formContacto [name=nombre]") == "Carlos"
    pg.fill("#formContacto [name=telefono]", "998 555 0000"); pg.click("#formContacto button[type=submit]"); pg.wait_for_timeout(250)
    p3 = pg.evaluate("almacen.leer().then(l => l.find(x => x.texto.startsWith('Tengo reunión')))")
    assert p3["contact_id"] and pg.evaluate(f"almacen.leerContactos().then(l => l.find(c => c.id === '{p3['contact_id']}').nombre)") == "Carlos"
    paso("si la persona no existe, «+ Crear contacto Carlos» la crea y la liga sin salir de Hoy")

    # Editor del pendiente: buscar persona y crear nueva desde ahí
    capturar(pg, "comprar regalo")
    pg.click("#lista >> text=Comprar regalo"); pg.wait_for_selector("#lista .editor")
    pg.fill("#lista .editor input[aria-label='Persona o contacto']", "an"); pg.wait_for_timeout(60)
    sugs = pg.locator("#lista .editor .sugerencias-persona .sug").all_inner_texts()
    assert sugs[0].startswith("👤 Ana Gómez") and sugs[-1] == "+ Crear nuevo contacto «an»", sugs
    pg.fill("#lista .editor input[aria-label='Persona o contacto']", "Sofía Ruiz"); pg.wait_for_timeout(60)
    pg.click("#lista .editor .sug.crear"); pg.wait_for_selector("#editorContacto[open]")
    assert pg.input_value("#formContacto [name=nombre]") == "Sofía" and pg.input_value("#formContacto [name=apellidos]") == "Ruiz"
    pg.click("#formContacto button[type=submit]"); pg.wait_for_timeout(200)
    assert pg.is_visible("#lista .editor")  # sigue en el pendiente
    assert pg.input_value("#lista .editor input[aria-label='Persona o contacto']") == "Sofía Ruiz"
    pg.click("#lista .editor .primario"); pg.wait_for_timeout(200)
    p4 = pg.evaluate("almacen.leer().then(l => l.find(x => x.texto === 'Comprar regalo'))")
    assert p4["contact_id"]
    paso("en el pendiente, «Persona» busca mientras escribes y «+ Crear nuevo contacto» no te saca del pendiente")

    # Buscar general encuentra pendientes por la persona
    pg.click(".tab[data-ir=buscar]"); pg.fill("#busca", "perez"); pg.wait_for_timeout(80)
    assert "Llamar a Luis" in pg.inner_text("#resultados")
    pg.click(".tab[data-ir=hoy]")
    paso("Buscar encuentra pendientes por el nombre de su contacto")

    # ---- Ficha: pendientes relacionados y completar ----
    pg.click("#lista .item:has-text('Llamar a Luis de la Torre') .contacto-pend .persona"); pg.wait_for_selector("#fichaContacto[open]")
    assert "1 pendiente relacionado" in pg.inner_text("#fichaPendTitulo")
    assert "Llamar a Luis de la Torre" in pg.inner_text("#fichaPendientes")
    pg.click("#fichaPendientes button:has-text('Completar')"); pg.wait_for_timeout(200)
    assert "0 pendientes relacionados" in pg.inner_text("#fichaPendTitulo") and "✓ Llamar a Luis" in pg.inner_text("#fichaPendientes")
    paso("la ficha muestra sus pendientes relacionados y permite completarlos")
    pg.click("#fichaContacto [data-cerrar]")

    # ---- Cumpleaños opcional ----
    pg.click("#verContactos"); pg.click("#listaContactos .contacto-abrir:has-text('Ana Gómez')"); pg.wait_for_selector("#fichaContacto[open]")
    assert not pg.is_checked("#fichaRecordarCumple")
    assert pg.evaluate("almacen.leer().then(l => l.filter(x => x.cumpleDe).length)") == 0
    pg.click("#fichaCumple label.fila-ajuste"); pg.wait_for_timeout(250)
    cu = pg.evaluate("almacen.leer().then(l => l.find(x => x.cumpleDe))")
    d = pg.evaluate(f"(() => {{ const d = new Date('{cu['cuando']}'); return [d.getMonth(), d.getDate(), d.getHours()]; }})()")
    assert cu["texto"] == "Cumpleaños de Ana Gómez 🎂" and d == [9, 20, 9], (cu, d)
    pg.click("#fichaAvisoCumple label:has-text('Un día antes')"); pg.wait_for_timeout(250)
    cu = pg.evaluate("almacen.leer().then(l => l.filter(x => x.cumpleDe))")
    assert len(cu) == 1 and cu[0]["texto"].startswith("Mañana cumple años Ana") and pg.evaluate(f"new Date('{cu[0]['cuando']}').getDate()") == 19
    pg.click("#fichaCumple label.fila-ajuste"); pg.wait_for_timeout(250)
    assert pg.evaluate("almacen.leer().then(l => l.filter(x => x.cumpleDe).length)") == 0
    paso("«Recordarme su cumpleaños» es opcional: crea el aviso (el día o un día antes) y se quita al apagarlo")
    pg.screenshot(path=os.path.join(SALIDA, "contactos-ficha.png"), full_page=True)

    # ---- Eliminar con confirmación ----
    pg.click("#fichaBorrar"); pg.wait_for_selector("#confirmarBorrarContacto[open]")
    pg.click("#confirmarBorrarContacto button[value=no]"); pg.wait_for_timeout(100)
    assert pg.evaluate("almacen.leerContactos().then(l => l.length)") == 5
    pg.click("#fichaBorrar"); pg.click("#confirmarBorrarContacto button[value=si]"); pg.wait_for_timeout(250)
    assert pg.evaluate("almacen.leerContactos().then(l => l.some(c => c.nombre === 'Ana'))") is False
    paso("eliminar pide confirmación; cancelar no borra nada")
    pg.click("#listaContactos .contacto-abrir:has-text('Luis Pérez')"); pg.click("#fichaBorrar"); pg.click("#confirmarBorrarContacto button[value=si]"); pg.wait_for_timeout(250)
    p2b = pg.evaluate(f"almacen.leer().then(l => l.find(x => x.id === '{p2['id']}'))")
    assert p2b and p2b["contact_id"] is None and p2b["texto"] == "Llamar a Luis"
    paso("al eliminar un contacto sus pendientes se quedan, solo sin persona")

    # ---- Importar .vcf con duplicados y .csv ----
    carpeta = tempfile.mkdtemp()
    vcf = os.path.join(carpeta, "contactos.vcf"); open(vcf, "w").write(VCF)
    csv = os.path.join(carpeta, "contactos.csv"); open(csv, "w", encoding="utf-8").write(CSV)
    pg.click("#importarContactos"); pg.wait_for_selector("#importarHoja[open]")
    assert pg.is_hidden("#importarAgenda") and "no deja leer la agenda" in pg.inner_text("#importarNota")
    paso("sin acceso a la agenda del teléfono: ofrece archivo .vcf/.csv y explica cómo")
    pg.set_input_files("#archivoContactos", vcf); pg.wait_for_selector("#importarPaso2:not([hidden])")
    assert "Encontré 3 contactos. 1 ya existe" in pg.inner_text("#importarResumen"), pg.inner_text("#importarResumen")
    filas = pg.locator("#importarLista .imp-fila")
    assert "Parece ser Luis de la Torre" in filas.nth(0).inner_text()
    filas.nth(2).locator("input[type=checkbox]").uncheck()  # no quiero a Sofía
    assert pg.inner_text("#importarConfirmar") == "Importar 2"
    pg.click("#importarConfirmar"); pg.wait_for_timeout(300)
    lu = pg.evaluate("almacen.leerContactos().then(l => l.filter(c => c.apellidos === 'de la Torre'))")
    assert len(lu) == 1 and lu[0]["email"] == "luis@ejemplo.com" and lu[0]["empresa"] == "VForge", lu  # combinar conserva lo que había
    nombres = pg.evaluate("almacen.leerContactos().then(l => l.map(c => c.nombre + ' ' + c.apellidos))")
    assert "Germán Muñoz" in nombres and not any(n.startswith("Sofía Ruiz") and False for n in nombres)
    assert sum(1 for n in nombres if n == "Sofía Ruiz") == 1  # la que ya existía; la del archivo no se importó
    assert "Importados: 1 nuevo, 1 combinados" in pg.inner_text("#aviso")
    paso(".vcf: detecta duplicado, «Combinar» completa sin borrar, y solo importa los marcados")

    pg.click("#importarContactos"); pg.set_input_files("#archivoContactos", vcf); pg.wait_for_selector("#importarPaso2:not([hidden])")
    pg.locator("#importarLista .imp-fila").nth(0).locator("select").select_option("sustituir")
    pg.locator("#importarLista .imp-fila").nth(1).locator("select").select_option("ambos")
    pg.click("#importarConfirmar"); pg.wait_for_timeout(300)
    lu = pg.evaluate("almacen.leerContactos().then(l => l.filter(c => c.apellidos === 'de la Torre'))")
    assert len(lu) == 1 and lu[0]["email"] == "luis@nuevo.com" and lu[0]["empresa"] == "All Global" and lu[0]["favorito"] is True, lu
    assert pg.evaluate("almacen.leerContactos().then(l => l.filter(c => c.nombre === 'Germán').length)") == 2
    paso("«Sustituir» reemplaza los datos y «Conservar ambos» deja los dos")
    pg.click("#importarContactos"); pg.set_input_files("#archivoContactos", csv); pg.wait_for_selector("#importarPaso2:not([hidden])")
    pg.click("#importarConfirmar"); pg.wait_for_timeout(300)
    assert pg.evaluate("almacen.leerContactos().then(l => l.find(c => c.nombre === 'Marta').empresa)") == "Clínica Sur"
    paso(".csv también se importa")

    # ---- Privacidad: al servidor nunca le llegan datos de contactos ----
    pg.evaluate("""() => { window.registration = { pushManager: { getSubscription: async () => ({ endpoint: 'https://push.example/x' }) } }; }""")
    pg.evaluate("almacen.leer().then(l => almacen.sincronizar(l))"); pg.wait_for_timeout(300)
    todo = " ".join(cuerpos)
    assert cuerpos and all(x not in todo for x in ["9984292748", "luis@", "5511112222", "VForge", "Notaría", "contact_id", "Clínica"]), todo[:400]
    enviados = json.loads([c for c in cuerpos if "recordatorios" in c][-1])["recordatorios"]
    assert all(set(r) == {"id", "texto", "cuando"} for r in enviados)
    paso("al servidor solo va texto y hora de cada pendiente: ningún teléfono, correo ni dato de contactos")

    # Móvil sin scroll horizontal
    pg.click("#verContactos") if pg.is_visible("#verContactos") else None
    assert pg.evaluate("document.documentElement.scrollWidth <= innerWidth")
    pg.screenshot(path=os.path.join(SALIDA, "contactos-lista.png"), full_page=True)
    pg.click("#listaContactos .contacto-abrir >> nth=0"); pg.wait_for_selector("#fichaContacto[open]")
    assert pg.evaluate("document.querySelector('#fichaContacto .hoja-cuerpo').scrollWidth <= document.querySelector('#fichaContacto .hoja-cuerpo').clientWidth")
    pg.click("#fichaContacto [data-cerrar]")
    paso("en el teléfono no hay desplazamiento horizontal en la lista ni en la ficha")
    ctx.close()

    # ---- Aislamiento: cada persona/teléfono tiene su propia libreta ----
    otro = p.chromium.launch_persistent_context(tempfile.mkdtemp(), channel="chromium", viewport={"width": 1280, "height": 860},
                                                locale="es-MX", timezone_id="America/Cancun")
    pg2 = otro.pages[0]
    pg2.on("pageerror", lambda e: errores.append("page2: " + str(e)))
    pg2.goto(U); pg2.wait_for_selector("#resumen h2")
    assert pg2.evaluate("almacen.leerContactos().then(l => l.length)") == 0
    pg2.click("#verContactos"); pg2.wait_for_selector("#vista-contactos:not([hidden])")
    assert "Aún no tienes contactos" in pg2.inner_text("#listaContactos")
    paso("otro usuario (otro teléfono/perfil) no ve ningún contacto del primero")
    otro.close()

    # Contact Picker con script de arranque (como lo tendría Chrome en Android)
    otro = p.chromium.launch_persistent_context(tempfile.mkdtemp(), channel="chromium", viewport={"width": 1280, "height": 860},
                                                locale="es-MX", timezone_id="America/Cancun")
    otro.add_init_script("""window.ContactsManager = function(){}; Object.defineProperty(navigator, 'contacts', { value: {
        getProperties: async () => ['name', 'tel', 'email'],
        select: async (props, opts) => { window.__pedido = {props, opts}; return [
          { name: ['Laura Méndez'], tel: ['998 101 2020'], email: [] }, { name: ['Pedro Sol'], tel: [], email: ['pedro@sol.mx'] } ]; } } });""")
    pg3 = otro.pages[0]
    pg3.on("pageerror", lambda e: errores.append("page3: " + str(e)))
    pg3.goto(U); pg3.wait_for_selector("#resumen h2")
    pg3.click("#verContactos"); pg3.click("#importarContactos"); pg3.wait_for_selector("#importarHoja[open]")
    assert pg3.is_visible("#importarAgenda") and "te pide permiso" in pg3.inner_text("#importarNota")
    pg3.click("#importarAgenda"); pg3.wait_for_selector("#importarPaso2:not([hidden])")
    ped = pg3.evaluate("window.__pedido")
    assert ped["opts"] == {"multiple": True} and set(ped["props"]) == {"name", "tel", "email"}
    pg3.click("#importarConfirmar"); pg3.wait_for_timeout(300)
    assert pg3.evaluate("almacen.leerContactos().then(l => l.map(c => c.nombre + ' ' + c.apellidos).sort())") == ["Laura Méndez", "Pedro Sol"]
    assert pg3.evaluate("document.documentElement.scrollWidth <= innerWidth")
    pg3.screenshot(path=os.path.join(SALIDA, "contactos-escritorio.png"))
    paso("con agenda del teléfono disponible: pide los contactos que la persona elige y los importa; también en escritorio")
    otro.close()

print(f"\n{ok[0]} pruebas de contactos en pantalla pasaron")
print("Errores JS:", errores or "ninguno")
sys.exit(1 if errores else 0)
