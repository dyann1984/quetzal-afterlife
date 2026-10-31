# Modelo GLB artístico del quetzal: estado y recursos que faltan

Rama `feat/hologram-glb` (parte de `feat/hologram-q-v2`, respaldo en el commit `499fd74`).

## Comprobación del entorno (2026-10-31)

| Recurso | Estado |
|---|---|
| Blender | **No instalado** (ni en PATH, ni en Program Files, ni vía winget) |
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
