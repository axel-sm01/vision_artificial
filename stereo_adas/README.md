# Correspondencia estéreo para ADAS: Census+Hamming vs SAD/SSD

Proyecto de la materia de **Sistemas Visuales y Formación de Imágenes** (Maestría en Ciencia
de Datos) — Perfil 3: Reconstrucción 3D para ADAS.

Implementa el núcleo de un algoritmo de correspondencia estéreo (cálculo de disparidad por
emparejamiento de ventanas) con dos estrategias, y las compara bajo cambios de iluminación
entre la cámara izquierda y la derecha — el reto real de un sistema de percepción 3D en un
vehículo:

1. **Correlación directa de intensidad (SAD)** — suma de diferencias absolutas entre ventanas.
2. **Transformada Census + distancia de Hamming** — codifica cada vecindad como una cadena de
   bits (orden relativo de intensidades) y empareja por distancia de Hamming.

## Dataset

Par estéreo rectificado de **Middlebury Stereo 2014** (2872×1984 px), con las variantes de
iluminación que el propio dataset incluye:

- `im0.png` — cámara izquierda (referencia).
- `im1.png` — cámara derecha, misma exposición/luz que im0 ("igualada").
- `im1E.png` — cámara derecha con **exposición** real distinta (variante de Middlebury).
- `im1L.png` — cámara derecha con **iluminación** real distinta, es decir, luz de escena
  distinta, no solo ganancia de cámara (variante de Middlebury).

Además, el programa genera una quinta variante **simulada** aplicando una corrección gamma
(g=1.8) sobre `im1.png` — esto es lo que pide explícitamente la tarea ("el alumno debe simular
una diferencia de iluminación... aplicando gamma... solo a una de ellas"). Las variantes reales
(E, L) se usan como evidencia adicional para ver si el patrón se sostiene con datos reales y no
solo con nuestra simulación.

## Estructura del repositorio

```
stereo-adas/
├── CMakeLists.txt              # build system (Visual Studio / Open Folder)
├── CMakePresets.json           # presets x64-debug / x64-release
├── include/
│   └── stereo_matching.hpp     # API pública: SAD/SSD, Census+Hamming, métricas, tiempos
├── src/
│   ├── stereo_matching.cpp     # implementación
│   └── main.cpp                # orquesta las 4 condiciones de iluminación
├── data/
│   ├── im0.png
│   ├── im1.png
│   ├── im1E.png
│   └── im1L.png
├── results/                    # se genera al ejecutar
├── scripts/report/
│   ├── build_report.js         # genera docs/Reporte_Census_vs_SAD.docx desde results/
│   └── package.json
└── docs/
    └── Reporte_Census_vs_SAD.docx
```

## Requisitos

- CMake ≥ 3.16 (idealmente ≥ 3.21 para `CMakePresets.json`)
- Visual Studio 2022 con "Desarrollo para el escritorio con C++"
- OpenCV ≥ 4.5 compilado/instalado manualmente en Windows (build en `C:/opencv/build`)

No se requiere Eigen3 ni vcpkg.

## Cómo compilar y ejecutar (Visual Studio, Windows)

### Opción A — Open Folder

1. Ajusta `OpenCV_DIR` en `CMakeLists.txt` (línea ~14) si tu build de OpenCV no está en
   `C:/opencv/build`.
2. `File → Open → Folder…` sobre la carpeta raíz del repo. VS detecta `CMakePresets.json`
   automáticamente; elige el preset **x64-release**.
3. Selecciona `stereo_adas.exe` como elemento de inicio y presiona **Ctrl+F5**.
4. El build copia `data/` y las DLLs de OpenCV junto al `.exe` automáticamente.

### Opción B — .sln clásico

```powershell
mkdir build && cd build
cmake .. -G "Visual Studio 17 2022" -A x64 -DOpenCV_DIR="C:/opencv/build"
```

## Parámetros del experimento (documentados en `main.cpp`)

| Parámetro | Valor | Razón |
|---|---|---|
| Ancho de trabajo | 640 px | El par viene a resolución completa (~2872 px); se reduce para que el emparejamiento por fuerza bruta corra en segundos, no minutos. |
| Ventana | 7×7 (radio 3) | La misma para ambos métodos — comparación justa. Con radio 3 la vecindad tiene 48 píxeles, que caben exactos en un `uint64_t` para el código census. |
| Rango de disparidad | 0–64 px | No se cuenta con `calib.txt` de esta escena (no fue parte de los archivos compartidos), así que es un valor razonable para esta resolución, documentado como supuesto — no un dato calibrado. |
| Gamma simulado | 1.8 | Aclara visualmente la diferencia sin saturar la imagen; simula una diferencia de ganancia/exposición realista entre cámaras. |

## Qué mide cada resultado

- `results/<condicion>/disp_sad.png`, `disp_census.png` — mapas de disparidad coloreados
  (colormap JET), inválidos en negro puro.
- `results/<condicion>/comparacion.png` — collage rotulado: izquierda | derecha (condición) |
  disparidad SAD | disparidad Census.
- `results/comparativa_general.png` — las 4 condiciones apiladas en una sola imagen.
- `results/robustez.csv` — `mad_disparidad_px` (diferencia media absoluta, en píxeles de
  disparidad, contra el mapa de la condición "igualada") y `validos_pct` por condición y método.
  Es la métrica cuantitativa de robustez: entre más bajo el MAD, menos cambió el método al
  desbalancear la iluminación.
- `results/timings.csv` — tiempo de cómputo (SAD vs Census) sobre la condición igualada,
  promedio de 8 repeticiones tras 2 de calentamiento.

## Nota sobre manejo de bordes (padding)

El código usa **dos políticas de borde distintas a propósito**, una para cada eje:

- **Soporte de la ventana** (arriba/abajo/izq/der dentro de la vecindad de correlación): se
  rellena con `cv::BORDER_REFLECT101` — es una extensión razonable de la apariencia local, con
  sesgo mínimo, y permite calcular la ventana para todos los píxeles sin encoger la salida.
- **Eje de búsqueda de disparidad** (horizontal, entre cámaras): **no se rellena**. Si un
  píxel en x < `max_disparity` pidiera un candidato en la imagen derecha en una columna
  negativa, ese punto simplemente no existe — inventarlo con padding fabricaría una
  correspondencia falsa. En vez de eso, esa franja se marca inválida. Es la misma "banda ciega"
  que se ve en el borde izquierdo de cualquier mapa de disparidad de OpenCV (`StereoBM`/`SGBM`).

Con `max_disparity=64` sobre imágenes de 640 px de ancho, esa banda inválida es del 10% exacto
del área (`64/640`), que es justo el `validos_pct=90%` reportado en las cuatro condiciones —
confirma que el manejo de bordes se comporta como se documenta aquí.

## Reproducibilidad

El reporte en Word (`docs/Reporte_Census_vs_SAD.docx`) se genera desde `results/` con
`scripts/report/build_report.js`:

```bash
cd scripts/report
npm install
node build_report.js
```
