# Modelo GLB artístico del quetzal: estado y recursos que faltan

Rama `feat/hologram-glb` (parte de `feat/hologram-q-v2`, respaldo en el commit `499fd74`).

## Comprobación del entorno (2026-10-31)

| Recurso | Estado |
|---|---|
| Blender | **Instalado el 2026-10-31**: Blender 4.5.10 LTS en `C:\Program Files\Blender Foundation\Blender 4.5\blender.exe` (winget, hash verificado). Ejecuta en modo `--background`; trae su propio Python (`bpy`) |
| Python | **No disponible** (solo el acceso directo de Microsoft Store) |
| Imagen de referencia (`2.webp`) | **No existe en disco**: solo está en el chat. No se puede usar como entrada de ninguna herramienta |
| Modelos existentes (`.glb`, `.gltf`, `.blend`) | Ninguno |

## Por qué no se genera otra aproximación

Sin Blender ni un modelo base, lo único posible es construir la geometría por código, que es lo que hace el holograma v2. Ese enfoque ya mostró su techo: cabeza simple, material sólido, sin la translucidez cristalina de la referencia. Repetirlo y exportarlo como GLB solo cambiaría el formato, no la calidad.

## Qué falta para cumplir el objetivo

1. La imagen de referencia como archivo (por ejemplo `docs/referencia/quetzal-ref.png`).
2. Una de estas vías para producir el modelo:
   - **A. Instalar Blender** (~400 MB, vía winget) y esculpir/modelar con script (`bpy`). Mejora el control de superficies y materiales, pero el resultado sigue dependiendo del modelado procedural.
   - **B. Generación 3D asistida** con la herramienta de generación 3D conectada a esta sesión, a partir de la imagen de referencia. Esto **envía la imagen a un servicio externo**, por lo que requiere autorización expresa.
   - **C. Encargar el modelo a un artista 3D** (GLB con materiales PBR/transmisión) y yo me ocupo de la integración, la optimización, la animación y el mapeo de datos.
3. Cualquiera sea la vía, el GLB se integra en `QuetzalQ.tsx` conservando el sistema de datos (disolución, tinte dorado, materialización desde la cabeza), la rotación y las partículas.

## Estado

No se modificó ningún archivo de código en esta rama. No hay GLB, renders ni preview nuevos. El preview del v2 sigue siendo la única versión desplegada como preview. Producción y master intactos.


## Actualización
Blender ya está operativo. Sigue bloqueado: la imagen de referencia no se puede recuperar del historial de la sesión (solo conserva capturas propias). Hace falta que el archivo se guarde en docs/referencia/quetzal-ref.png.

## Avance (modelo creado en Blender)
`tools/blender/build_quetzal.py` genera `public/models/quetzal.glb` (2,4 MB, ~85k triángulos, partes con nombre: plumas_cresta, plumas_alas, cola, cuerpo, cabeza, anillo, globo; UV y color de vértice por pluma). Renders en `docs/capturas-glb/`. Pendiente: aprobación visual; después, integración en R3F con el sistema de datos. Brechas conocidas frente a la referencia: la cabeza sigue siendo simple, el plumaje es más regular y la silueta es casi plana en profundidad.

## Integración en la web
- `app/experience/q-glb.ts` carga `/models/quetzal.glb` (GLTFLoader) y lo convierte a las mismas partes y atributos (aU, aT, aPhase, aTone, aLayer) que usa el sistema de datos; `QuetzalQ.tsx` añade el shader del modelo (plumas de cristal aditivas con filo cian, cuerpo/cabeza opacos con borde, anillo aditivo).
- Se conservan: disolución por registros perdidos, tinte dorado de los recuperados con daño, materialización desde la cabeza, aura de partículas (muestreada sobre el GLB), bloques de datos, giro interactivo y movimiento suave.
- El póster (logo) se mantiene hasta que el GLB está cargado. Si el GLB no carga, se usa la geometría procedural anterior como respaldo.
- Medidas (Chrome del panel, GPU del equipo): hero ~89k triángulos y 13 llamadas de dibujo; ~30 fps en calidad alta y en móvil 375 px (calidad baja). GLB: 2,4 MB.
- Brechas frente a la referencia: cabeza más simple que la de la imagen, plumaje más regular, figura poco profunda (a 60° se ve como lámina), sin cristal translúcido con refracción real (en la web es aditivo).
