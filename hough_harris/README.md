# Perfil 3 — Reconstrucción 3D para ADAS: líneas de carril (Hough) y keypoints Harris para correspondencia estéreo

Proyecto de la materia de **Sistemas Visuales y Formación de Imágenes** (Maestría en Ciencia de
Datos) — Perfil 3: Reconstrucción 3D para ADAS.

Compara los dos usos que la geometría tiene en un sistema ADAS de percepción 3D:

1. **Detección de carriles con Hough de líneas**: ROI + Canny + `HoughLinesP`, con parametrización
   (ρ, θ) explicada en el reporte y robustez a marcas de carril discontinuas.
2. **Keypoints de Harris para estéreo**: `cornerHarris` en la vista izquierda y derecha del par,
   con una métrica de repetibilidad izquierda/derecha (base de la triangulación por disparidad).

Ambos se evalúan bajo tres condiciones de iluminación simuladas (buena, atardecer, noche) y un
desbalance de ganancia/brillo entre cámaras.

## Dataset

Par estéreo rectificado estilo **KITTI** (1242×375 px):

- `data/left.png` — cámara izquierda.
- `data/right.png` — cámara derecha.

Las condiciones adversas (atardecer, noche, desbalance de ganancia) se generan en tiempo de
ejecución aplicando una curva gamma + ganancia + ruido gaussiano (ver `paramsForCondition` en
`include/lane_harris.hpp`); no requieren archivos de imagen adicionales.

## Estructura del repositorio

```
proyecto/
├── CMakeLists.txt              # build system (Visual Studio / Open Folder / Linux)
├── include/
│   └── lane_harris.hpp         # API pública: iluminación, Hough, Harris, repetibilidad
├── src/
│   ├── lane_harris.cpp         # implementación
│   └── main.cpp                # orquesta las condiciones y escribe resultados/CSV
├── data/
│   ├── left.png
│   └── right.png
├── results/                    # se genera al ejecutar (ya incluido con una corrida de referencia)
├── scripts/report/
│   ├── build_report.js         # genera docs/Reporte_Hough_Harris_ADAS.docx desde results/
│   └── package.json
└── docs/
    └── Reporte_Hough_Harris_ADAS.docx
```

> Nota: los archivos dentro de `results/` en este repositorio son una copia de referencia de una
> corrida ya hecha, recomprimida a JPG solo para reducir el peso del zip entregado. Al ejecutar de
> nuevo `lane_harris_adas`, el programa vuelve a escribir todo en PNG (formato que espera
> `build_report.js`); corre el ejecutable antes de regenerar el reporte Word.

## Requisitos

- CMake ≥ 3.16
- Compilador C++17 (MSVC / g++ / clang++)
- OpenCV ≥ 4.5 (módulos `core`, `imgproc`, `imgcodecs`)
- Node.js ≥ 18 (solo para regenerar el reporte Word)

### Windows (Visual Studio)

Ajusta `OpenCV_DIR` en `CMakeLists.txt` (línea ~14) a la carpeta `build` de tu instalación de
OpenCV (normalmente `C:/opencv/build`), abre la carpeta con `File → Open → Folder…` y compila con
el preset `x64-release`. El build copia `data/` junto al `.exe` automáticamente.

### Linux / macOS

```bash
sudo apt install libopencv-dev   # o el gestor de paquetes equivalente
mkdir build && cd build
cmake .. -DCMAKE_BUILD_TYPE=Release
make -j4
./lane_harris_adas ../data ../results
```

## Parámetros del experimento (documentados en `main.cpp` / `lane_harris.hpp`)

| Parámetro | Valor | Razón |
|---|---|---|
| ROI (trapecio) | 96% inferior, 28% superior, techo al 58% de la altura | Recorta cielo, cofre del auto y laterales lejanos antes de votar en Hough. |
| Canny | 50 / 150 | Razón de histéresis 1:3, valor clásico y robusto. |
| Hough (ρ, θ, umbral) | 1 px, 1°, 20 votos | Resolución fina; umbral bajo porque el ROI ya filtra bordes irrelevantes. |
| Hough (long. mín., hueco máx.) | 20 px, 80 px | El hueco máximo es la clave de robustez a marcas discontinuas (ver reporte §2.1). |
| Harris (blockSize, apertura, k) | 2, 3, 0.04 | Valores de referencia de la literatura/OpenCV. |
| Harris (umbral relativo, NMS) | 2% del máximo, ventana 9×9 | Ajustado empíricamente para esta escena; documentado como supuesto. |
| Repetibilidad (tolerancia fila, disparidad) | ±2 px, [0, 130] px | Sin archivo de calibración para esta escena — rango razonable para 1242 px de ancho, documentado como supuesto (igual criterio que el proyecto de correspondencia estéreo SAD/Census previo). |
| Gamma / ganancia / ruido por condición | ver tabla en el reporte, §3.1 | Simulan atardecer y noche de forma creciente en severidad. |

## Qué mide cada resultado

- `results/hough/carriles_<condicion>.png` — imagen con el carril izquierdo (rojo) y derecho
  (verde) superpuestos, más los segmentos crudos de Hough (amarillo) y el ROI (azul).
- `results/hough/bordes_<condicion>.png` — salida de Canny (para la nota de manejo de bordes).
- `results/hough_resumen.csv` — segmentos válidos por lado y si se detectó el carril, por condición.
- `results/harris/keypoints_<izq|der>_<condicion>.png` — mapa de keypoints por vista.
- `results/harris/heatmap_izq_<condicion>.png` — respuesta de Harris en colormap JET.
- `results/harris/matches_<condicion>.png` — collage izq.|der. con líneas uniendo los pares que
  cumplen la restricción epipolar + disparidad.
- `results/repetibilidad.csv` — keypoints por vista, número de pares emparejados y tasa de
  repetibilidad (%) por condición.

## Nota sobre el manejo de bordes de la imagen

Ver reporte, sección 7. Resumen: las derivadas (Sobel, dentro de Canny y de `cornerHarris`) usan
`BORDER_REFLECT_101` de OpenCV (reflejo, no relleno con ceros) — evita bordes falsos de "marco"
pero vuelve menos confiable la respuesta en una franja delgada junto al borde. El ROI de Hough
excluye deliberadamente zonas que no pueden ser carril. Y la ventana de disparidad para la
repetibilidad estéreo deja, por construcción geométrica, una "banda ciega" de baja repetibilidad
en los bordes izquierdo/derecho de la imagen — la misma banda ciega que aparece en cualquier mapa
de disparidad por bloques (StereoBM/SGBM).

## Reproducibilidad

El reporte en Word (`docs/Reporte_Hough_Harris_ADAS.docx`) se genera desde `results/` con
`scripts/report/build_report.js`:

```bash
cd scripts/report
npm install
node build_report.js
```
