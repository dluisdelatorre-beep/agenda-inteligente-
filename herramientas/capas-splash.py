import cv2, numpy as np, sys
src, out = sys.argv[1], sys.argv[2]
img = cv2.imread(src)                                   # BGR original, sin tocar
h, w = img.shape[:2]
m = (img.min(axis=2) > 150).astype(np.uint8) * 255      # blanco puro
# solo las letras: componentes grandes en la zona central (los arcos verdes tienen núcleo claro y se excluyen)
n, lab, st, _ = cv2.connectedComponentsWithStats(m)
keep = np.zeros_like(m)
for i in range(1, n):
    x, y, ww, hh, area = st[i]
    if area > 3000 and x > w * .2 and x + ww < w * .8 and y > h * .3 and y + hh < h * .7: keep[lab == i] = 255
m = keep
ys, xs = np.where(m > 0); print("letras bbox", xs.min(), ys.min(), xs.max(), ys.max(), "px", len(xs))
quitar = cv2.dilate(m, np.ones((9, 9), np.uint8))        # letras + borde inmediato
# capa de fondo sin letras: relleno por convolución normalizada (promedio suave del entorno, sin dejar
# la silueta de las letras). Así, cuando las letras rotan ±2°, debajo solo hay resplandor liso.
q = (quitar == 0).astype(np.float32)
f = img.astype(np.float32)
num = cv2.GaussianBlur(f * q[..., None], (0, 0), 22); den = cv2.GaussianBlur(q, (0, 0), 22)[..., None]
liso = num / np.maximum(den, 1e-4)
borde = cv2.GaussianBlur((quitar > 0).astype(np.float32), (0, 0), 3)[..., None]
fondo = np.clip(f * (1 - borde) + liso * borde, 0, 255).astype(np.uint8)
# capa de letras: píxeles ORIGINALES con alfa suave (borde difuminado) para que en reposo coincida con la foto
alfa = cv2.GaussianBlur(cv2.dilate(m, np.ones((5, 5), np.uint8)).astype(np.float32) / 255, (0, 0), 1.6)
alfa = np.clip(alfa * 1.15, 0, 1)
x0, y0, x1, y1 = xs.min() - 24, ys.min() - 24, xs.max() + 24, ys.max() + 24
letras = np.dstack([img, (alfa * 255).astype(np.uint8)])[y0:y1, x0:x1]
cv2.imwrite(out + "/js-fondo.jpg", fondo, [cv2.IMWRITE_JPEG_QUALITY, 90, cv2.IMWRITE_JPEG_PROGRESSIVE, 1])
cv2.imwrite(out + "/js-letras.png", letras, [cv2.IMWRITE_PNG_COMPRESSION, 9])
# comprobación: fondo + letras en reposo vs original
comp = fondo.astype(np.float32).copy(); a = alfa[..., None]
comp = comp * (1 - a) + img.astype(np.float32) * a
d = np.abs(comp - img.astype(np.float32))
print("diferencia media", round(d.mean(), 3), "máx p99.9", round(np.percentile(d, 99.9), 2))
print("caja letras (x,y,w,h)", x0, y0, x1 - x0, y1 - y0, "lienzo", w, h)
cv2.imwrite(out + "/_comprobacion.png", np.hstack([img, comp.astype(np.uint8), fondo]))
