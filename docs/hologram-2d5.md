# Holograma 2.5D por capas (rama `feat/hologram-2d5`)

**Qué es:** la imagen oficial del quetzal como base visual, separada en capas (ave; anillo, globo y datos) y mostrada como dos placas aditivas con relieve (mapa de profundidad), curvatura, paralaje y animación por shader. **No es un modelo 3D completo**: sirve para giros limitados (≈ ±15°, el control de cámara está limitado a ese rango), no para rotación de 360°.

**Presupuesto:** $0. Solo se usaron la imagen oficial, Blender (no necesario aquí), Three.js/R3F y el código existente.

## Cómo se construye
- `tools/hologram/build-layers.ps1` (PowerShell + .NET, sin dependencias) lee `docs/referencia/quetzal-ref.png` y genera en `public/hologram/`:
  - `ave.jpg` y `resto.jpg`: capas aditivas sobre negro (ave + resto = imagen original con el fondo oscurecido; sin texto, plataforma ni focos del laboratorio);
  - `depth.png`: R = relieve del ave, G = relieve del resto (globo al fondo, datos delante), B = peso del balanceo de plumas;
  - `aura.json`: 4 100 puntos de partículas muestreados sobre el brillo de la propia imagen;
  - `composicion.png`: verificación visual (suma de capas).
- `app/experience/q-plates.ts`: carga de capas, mapeo imagen→mundo (1 unidad = 80 px) y puntos del aura.
- `app/experience/QuetzalQ.tsx`: shader de placas (relieve y curvatura en el vertex shader; balanceo, respiración del brillo, barrido de luz y destellos en el fragment shader). Fuente por orden: placas → GLB → geometría procedural, si fallan las anteriores.
- `app/experience/HeroCanvas.tsx`: cámara ajustada al ancho del contenedor (no recorta en móvil) y giro limitado.

## Datos reales
Sin cambios en la lógica: la materialización parte de la cabeza, los registros perdidos disuelven celdas, los recuperados con daño se tiñen de dorado, y las partículas y los bloques de datos reflejan los mismos recuentos. Sin evidencia cargada es un emblema (sin disolución ni oro). Las seis etapas de la experiencia y la plataforma holográfica siguen igual.

## Medidas (Chrome del panel)
Hero: 8 llamadas de dibujo y ~76k triángulos con 2 600 partículas (alta calidad); móvil 375 px: calidad baja, 8 llamadas, 60 fps. Recursos: ave 122 KB, resto 90 KB, relieve 120 KB, puntos 47 KB.

## Límites
- Fidelidad máxima a la referencia a costa de la rotación: más allá de ~15° se ve que son placas.
- La imagen tiene 1024 px de lado; en pantallas de alta densidad se ve suavizada.
- El anillo y el globo no pudieron separarse del ave píxel a píxel donde se solapan; la máscara es un polígono dibujado a mano con borde suavizado.
- El modelo GLB y el holograma anterior siguen en el repositorio como respaldo.
