# Agenda Inteligente

Proyecto práctico de KNOXIA (módulo construye-04) de Francisco Acevedo.

Escribes como hablas ("mañana a las 5 llamar a Germán") y la agenda entiende el día y la hora, te muestra lo que entendió y lo guarda. Al abrirla, lo primero que ves es el resumen de tu día.

En producción: https://agenda-inteligente-acevedo.vercel.app

## Qué hace

- Captura en lenguaje natural: hoy, mañana, pasado mañana, días de la semana, "15 de octubre", "el 20", "a las 5", "4:30 pm", "de la noche", "al mediodía", "en 2 horas", "en media hora".
- Resumen del día al abrir, con aviso de atrasados.
- Editar: toca un pendiente para cambiar el texto, la fecha y la hora, o quitarle la fecha.
- Posponer 10 minutos: desde la tarjeta vencida, desde el aviso en pantalla o desde el botón de la notificación.
- Avisos con la app cerrada (Web Push) con botones "Posponer 10 min" y "Hecho" que funcionan sin abrir la app.
- Instalable: botón "Instalar" en Android y escritorio, instrucciones para iPhone, íconos para cada sistema y capturas para la ficha de instalación.
- Abre sin señal (service worker).
- Navegación inferior: Hoy, Calendario, Buscar y Ajustes. Hoy es la pantalla al abrir y el botón atrás regresa a Hoy.
- Calendario mensual con indicador en los días con pendientes; al tocar un día se ven sus pendientes por hora, editables.
- Buscar instantáneo que ignora mayúsculas y acentos, con filtros Todos, Pendientes y Hechos.
- Ajustes: tema (automático, claro, oscuro), 5 colores de acento, densidad, tamaño de texto, sonidos dentro de la app (Suave, Digital, Minimal o sin sonido), vibración, estado de los avisos y restaurar apariencia. Las preferencias se guardan aparte de los pendientes.
- Acciones del recordatorio: llamar (con contacto o teléfono), abrir pago, entrar a reunión (Meet, Zoom, Teams), cómo llegar (dirección o mapa) y abrir enlace. Se sugieren solas según el texto y se pueden cambiar; nunca impiden guardar. Los avisos muestran la acción principal. No se guardan contraseñas, NIP, CVV, tokens ni credenciales.

## Cómo está hecha

| Pieza | Qué hace |
|---|---|
| `index.html`, `styles.css`, `app.js` | La pantalla |
| `parser.js` | Entiende las frases en español |
| `almacen.js` | Guarda los pendientes en el teléfono (IndexedDB), compartido con el service worker |
| `acciones.js` | Detecta y abre las acciones del recordatorio (llamar, pago, reunión, ubicación, enlace) |
| `ajustes.js` | Preferencias de apariencia y sonido, y los sonidos (generados con Web Audio, sin archivos) |
| `sw.js` | Service worker: abre sin señal, recibe los avisos y atiende sus botones |
| `api/vapid.js` | Da la llave pública para suscribirse a los avisos |
| `api/suscripcion.js` | Registra o da de baja un teléfono |
| `api/recordatorios.js` | Guarda qué avisar y cuándo |
| `api/enviar.js` | Despacha los avisos que ya tocan (lo llama un reloj cada minuto) |
| `lib/servidor.js` | Lógica del servidor de avisos (Neon + Web Push) |

Los pendientes viven en el teléfono. Al servidor solo se manda lo mínimo para avisar: el texto, la hora y a qué teléfono.

## Configurar los avisos con la app cerrada

Sin esto la app funciona igual y avisa mientras está abierta; el botón "Activar avisos" lo explica.

1. Base de datos en Neon. Las tablas se crean solas la primera vez.
2. Llaves de Web Push: `npx web-push generate-vapid-keys`
3. Variables de entorno en el proyecto de Vercel:
   - `DATABASE_URL` (Neon)
   - `VAPID_PUBLIC_KEY` y `VAPID_PRIVATE_KEY`
   - `VAPID_SUBJECT` (ej. `mailto:luis@vforge.site`)
   - `CRON_SECRET` (una clave larga al azar)
4. Un reloj que llame a `/api/enviar` cada minuto. En el plan Hobby de Vercel los crons no corren cada minuto, así que va en el servidor de la casa:

   ```
   * * * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://agenda-inteligente-acevedo.vercel.app/api/enviar >/dev/null
   ```

En iPhone los avisos solo llegan si la app está instalada en la pantalla de inicio (iOS 16.4 o más reciente).

## Pruebas

```
npm install
npm test
```

Prueban el intérprete de frases y el servidor de avisos contra un Postgres real en memoria, con llaves VAPID reales.

Pruebas de pantalla del sprint Calendario + Buscar + Ajustes (20 pruebas, en Chromium con perfil persistente):

```
python3 -m http.server 8765 &
python3 test/sprint-calendario-buscar-ajustes.py
python3 test/acciones-pantalla.py
```
