# Agenda Inteligente

Proyecto práctico de KNOXIA (módulo construye-04) de Francisco Acevedo.

Escribes como hablas ("mañana a las 5 llamar a Germán") y la agenda entiende el día y la hora, te muestra lo que entendió y lo guarda. Al abrirla, lo primero que ves es el resumen de tu día.

## Qué hace

- Captura en lenguaje natural: hoy, mañana, pasado mañana, días de la semana, "15 de octubre", "el 20", "a las 5", "4:30 pm", "de la noche", "al mediodía", "en 2 horas", "en media hora".
- Muestra lo entendido antes de guardar.
- Resumen del día al abrir, con aviso de atrasados.
- Agrupa: Atrasados, Hoy, Mañana, Más adelante, Sin fecha.
- Marcar como hecho y borrar.
- Avisos mientras la app está abierta (notificación del navegador si se da permiso).
- Instalable en el teléfono (PWA) y abre sin señal.

## Pendiente para la siguiente versión

- Avisos con la app cerrada (requiere backend con Web Push).
- Cuentas de usuario y sincronizar entre dispositivos (hoy se guarda en el propio teléfono).

## Cómo está hecha

Sitio estático sin paso de compilación: `index.html`, `styles.css`, `app.js` y `parser.js` (el intérprete de frases). Vercel la publica tal cual.

Probar el intérprete:

```
node test/parser.test.js
```
