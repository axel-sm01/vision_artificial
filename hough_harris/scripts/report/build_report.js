const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow,
  TableCell, WidthType, ShadingType, AlignmentType, ImageRun, PageBreak,
  Header, Footer, PageNumber, VerticalAlign
} = require("docx");

const RESULTS = path.join(__dirname, "..", "..", "results");
const OUT = path.join(__dirname, "..", "..", "docs", "Reporte_Hough_Harris_ADAS.docx");

// ---------- utilidades ----------
function para(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 160, ...(opts.spacing || {}) },
    ...opts,
    children: [new TextRun({ text, ...opts.run })],
  });
}
function paraRuns(runs, opts = {}) {
  return new Paragraph({ spacing: { after: 160, ...(opts.spacing || {}) }, ...opts, children: runs.map(r => new TextRun(r)) });
}
function heading(text, level) {
  return new Paragraph({ text, heading: level, spacing: { before: 320, after: 160 } });
}
function bullet(text) {
  return new Paragraph({ text, bullet: { level: 0 }, spacing: { after: 80 } });
}
function cell(text, opts = {}) {
  return new TableCell({
    width: { size: opts.width, type: WidthType.DXA },
    shading: opts.header ? { type: ShadingType.CLEAR, fill: "1F3864" } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      alignment: opts.center === false ? AlignmentType.LEFT : AlignmentType.CENTER,
      children: [new TextRun({ text, bold: !!opts.header, color: opts.header ? "FFFFFF" : "000000", size: 18 })],
    })],
  });
}
function imageParagraph(p, widthPx, ratio) {
  const buf = fs.readFileSync(p);
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 80 },
    children: [new ImageRun({ data: buf, transformation: { width: widthPx, height: Math.round(widthPx * ratio) }, type: "png" })],
  });
}
function caption(text) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 260 },
    children: [new TextRun({ text, italics: true, size: 18, color: "444444" })],
  });
}
function figure(file, widthPx, ratio) {
  const full = path.join(RESULTS, file);
  return [imageParagraph(full, widthPx, ratio)];
}

// ---------- datos ----------
function readCsv(file) {
  const lines = fs.readFileSync(file, "utf-8").trim().split("\n");
  const header = lines[0].split(",");
  return lines.slice(1).map(l => {
    const v = l.split(",");
    const o = {};
    header.forEach((k, i) => o[k] = v[i]);
    return o;
  });
}
const rep = readCsv(`${RESULTS}/repetibilidad.csv`);
const hough = readCsv(`${RESULTS}/hough_resumen.csv`);

const condLabel = {
  buena: "Buena (referencia)",
  atardecer: "Atardecer",
  noche: "Noche",
  desbalance_camaras: "Desbalance de ganancia entre cámaras",
};

// Tabla de repetibilidad Harris
const repW = [3400, 1700, 1700, 1500, 1450];
const repHeader = new TableRow({ tableHeader: true, children: [
  cell("Condición", { width: repW[0], header: true }),
  cell("Keypoints izq.", { width: repW[1], header: true }),
  cell("Keypoints der.", { width: repW[2], header: true }),
  cell("Matches", { width: repW[3], header: true }),
  cell("Repetibilidad", { width: repW[4], header: true }),
]});
const repRows = rep.map(r => new TableRow({ children: [
  cell(condLabel[r.condicion] || r.condicion, { width: repW[0] }),
  cell(r.keypoints_izq, { width: repW[1] }),
  cell(r.keypoints_der, { width: repW[2] }),
  cell(r.matches, { width: repW[3] }),
  cell(parseFloat(r.repetibilidad_pct).toFixed(1) + " %", { width: repW[4] }),
]}));
const repTable = new Table({ width: { size: 9750, type: WidthType.DXA }, columnWidths: repW, rows: [repHeader, ...repRows] });

// Tabla resumen Hough
const houghW = [3400, 2200, 2200, 2200];
const houghHeader = new TableRow({ tableHeader: true, children: [
  cell("Condición", { width: houghW[0], header: true }),
  cell("Segmentos válidos izq. carril", { width: houghW[1], header: true }),
  cell("Segmentos válidos der. carril", { width: houghW[2], header: true }),
  cell("Ambos carriles detectados", { width: houghW[3], header: true }),
]});
const houghRows = hough.map(r => new TableRow({ children: [
  cell(condLabel[r.condicion] || r.condicion, { width: houghW[0] }),
  cell(r.segmentos_izq, { width: houghW[1] }),
  cell(r.segmentos_der, { width: houghW[2] }),
  cell((r.carril_izq_detectado === "si" && r.carril_der_detectado === "si") ? "Sí" : "Parcial", { width: houghW[3] }),
]}));
const houghTable = new Table({ width: { size: 10000, type: WidthType.DXA }, columnWidths: houghW, rows: [houghHeader, ...houghRows] });

// ---------- documento ----------
const doc = new Document({
  styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
  sections: [{
    properties: {
      page: { size: { width: 12240, height: 15840 }, margin: { top: 1080, bottom: 1080, left: 1260, right: 1260 } },
    },
    headers: { default: new Header({ children: [new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [new TextRun({ text: "Sistemas Visuales y Formación de Imágenes — Maestría en Ciencia de Datos", size: 16, color: "888888" })],
    })] }) },
    footers: { default: new Footer({ children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ children: ["Página ", PageNumber.CURRENT, " de ", PageNumber.TOTAL_PAGES], size: 16, color: "888888" })],
    })] }) },
    children: [
      // Portada
      new Paragraph({ text: "", spacing: { after: 1200 } }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Reconstrucción 3D para ADAS:", bold: true, size: 40 })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 400 }, children: [new TextRun({ text: "Líneas de carril con Hough y keypoints Harris para correspondencia estéreo", bold: true, size: 36, color: "1F3864" })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [new TextRun({ text: "Caso de estudio: par estéreo estilo KITTI, con tres condiciones de iluminación (buena, atardecer, noche) y un desbalance de ganancia entre cámaras", italics: true, size: 24 })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 1600 }, children: [new TextRun({ text: "Aplicación a los dos usos de la geometría en un sistema de percepción ADAS", italics: true, size: 24 })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Maestría en Ciencia de Datos — Sistemas Visuales y Formación de Imágenes", size: 22 })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Tarea: Perfil 3 — Reconstrucción 3D para ADAS (Hough + Harris)", size: 22 })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: "Repositorio de código: [agregar URL de GitHub tras el push]", size: 22 })] }),
      new Paragraph({ children: [new PageBreak()] }),

      // 1. Objetivo
      heading("1. Objetivo", HeadingLevel.HEADING_1),
      para(
        "Comparar los dos usos que la geometría de imagen tiene en un sistema ADAS de reconstrucción " +
        "3D: (1) la detección de líneas de carril con la Transformada de Hough, y (2) la detección de " +
        "esquinas de Harris en el par estéreo izquierda/derecha, evaluando su repetibilidad como base " +
        "de la triangulación para estimar profundidad. Ambos algoritmos se someten a condiciones " +
        "adversas de iluminación (buena, atardecer, noche) y a un desbalance de ganancia entre cámaras, " +
        "para evidenciar cómo y por qué se degrada cada uno."
      ),

      // 2. Marco conceptual
      heading("2. Marco conceptual", HeadingLevel.HEADING_1),
      heading("2.1 Transformada de Hough para líneas de carril", HeadingLevel.HEADING_2),
      para(
        "Cada píxel de borde (x₀, y₀) no vota por UNA recta sino por TODAS las rectas que pasan por " +
        "él. En vez de parametrizar una recta como y = mx + b (que se indefine para rectas verticales, " +
        "justo el caso de un carril visto de frente), Hough usa la forma normal:"
      ),
      para("ρ = x·cos(θ) + y·sin(θ)", { alignment: AlignmentType.CENTER, run: { italics: true, size: 24 } }),
      para(
        "donde ρ es la distancia perpendicular del origen a la recta y θ es el ángulo de esa " +
        "perpendicular. Para un punto de borde fijo, esta ecuación traza una curva senoidal en el " +
        "espacio (ρ, θ) — el 'espacio de Hough'. Cada punto de una MISMA recta real genera una curva " +
        "distinta, pero todas esas curvas se cruzan exactamente en la celda (ρ, θ) que describe esa " +
        "recta. El algoritmo acumula votos en una rejilla discreta de (ρ, θ) y declara 'línea' donde el " +
        "acumulador supera un umbral de votos."
      ),
      para(
        "Esto explica su robustez frente a marcas de carril discontinuas (huecos): una marca punteada " +
        "sigue estando formada por segmentos COLINEALES. Cada segmento, aunque esté separado de los " +
        "demás por decímetros de asfalto sin pintura, sigue votando por la MISMA celda (ρ, θ) del " +
        "acumulador. El hueco simplemente no aporta votos, pero tampoco resta los votos ya acumulados " +
        "por los segmentos visibles — la evidencia se acumula globalmente en vez de exigir conectividad " +
        "de píxeles como haría un simple seguimiento de contornos. Adicionalmente, la variante " +
        "probabilística (HoughLinesP, usada en este proyecto) añade un parámetro maxLineGap que permite " +
        "fusionar en un solo segmento de salida dos trazos colineales separados por un hueco menor a " +
        "ese umbral (80 px aquí), reconstruyendo visualmente la línea completa de la marca punteada."
      ),
      heading("2.2 Esquinas de Harris", HeadingLevel.HEADING_2),
      para(
        "Para cada píxel se arma la matriz de segundo momento M, que resume cómo cambia la intensidad " +
        "en una vecindad ante pequeños desplazamientos, a partir de las derivadas Sobel Iₓ, I_y:"
      ),
      para("M = Σ w(x,y) · [ [Iₓ², Iₓ·I_y] , [Iₓ·I_y, I_y²] ]", { alignment: AlignmentType.CENTER, run: { italics: true, size: 24 } }),
      para(
        "y la respuesta de esquina es R = det(M) − k·traza(M)². Un punto es 'esquina' (R grande y " +
        "positivo) cuando ambos valores propios de M son grandes — el gradiente cambia en dos " +
        "direcciones independientes, a diferencia de un borde (un valor propio grande, el otro casi " +
        "nulo) o una zona plana (ambos casi nulos)."
      ),
      para(
        "Harris es invariante a rotación porque det(M) y traza(M) son invariantes de la matriz M ante " +
        "una rotación del plano imagen: rotar la vecindad rota los vectores propios de M pero NO cambia " +
        "sus valores propios (la elipse de la forma cuadrática solo gira, no cambia de tamaño). Como R " +
        "depende únicamente de los valores propios (a través de det y traza), R no cambia con la " +
        "rotación."
      ),
      para(
        "No es invariante a escala porque la ventana de análisis (blockSize/aperture de Sobel) tiene un " +
        "tamaño FIJO en píxeles. Una esquina real (por ejemplo, la esquina de una señal de tránsito) " +
        "ocupa una extensión en píxeles que cambia con la distancia: lejos, toda la esquina cabe " +
        "cómodamente dentro de la ventana y se detecta bien; cerca, la misma esquina puede ocupar " +
        "muchos más píxeles de los que la ventana fija alcanza a cubrir, y dentro de esa ventana la " +
        "superficie puede verse casi plana o como un solo borde — el patrón de esquina que Harris " +
        "necesita ver desaparece o se desplaza de posición. Para un sistema ADAS esto implica que la " +
        "distancia a los objetos (que es justamente lo que el módulo estéreo trata de estimar) afecta " +
        "de forma directa la estabilidad de los propios keypoints que alimentan esa estimación: objetos " +
        "que se acercan pueden dejar de repetirse entre fotogramas o entre cámaras si no se maneja un " +
        "esquema multiescala."
      ),

      // 3. Metodología
      heading("3. Metodología", HeadingLevel.HEADING_1),
      para(
        "Par estéreo rectificado (resolución 1242×375, formato KITTI) tomado como referencia geométrica: " +
        "izquierda y derecha con la misma fila (y) para el mismo punto 3D, disparidad (desplazamiento " +
        "horizontal) siempre positiva y acotada. Se usa la vista izquierda para el experimento de Hough " +
        "(cualquiera de las dos sirve, ya que la tarea no requiere el par para ese algoritmo)."
      ),
      heading("3.1 Simulación de condiciones adversas", HeadingLevel.HEADING_2),
      para(
        "Se implementó una función común out = ganancia · (in)^(1/γ) + ruido gaussiano, aplicada en tres " +
        "presets:"
      ),
      bullet("Buena — γ=1.0, ganancia=1.0, sin ruido (referencia, imagen original)."),
      bullet("Atardecer — γ=0.62, ganancia=0.80, ruido σ=4 (oscurecimiento moderado, poco ruido)."),
      bullet("Noche — γ=0.35, ganancia=0.42, ruido σ=16 (subexposición fuerte + ruido de sensor a ISO alto)."),
      para(
        "Para Hough, las tres condiciones se aplican a la vista izquierda. Para Harris, se aplican " +
        "SIMÉTRICAMENTE a ambas vistas del par (misma hora del día en ambas cámaras) en tres corridas, " +
        "más una cuarta corrida donde la iluminación se desbalancea ENTRE cámaras: la izquierda se deja " +
        "en 'buena' y la derecha se degrada con los parámetros de 'noche' — esto simula específicamente " +
        "una diferencia de ganancia/exposición de hardware entre las dos cámaras del arreglo estéreo, " +
        "el otro escenario adverso que pide la tarea."
      ),
      heading("3.2 Detección de líneas de carril", HeadingLevel.HEADING_2),
      bullet("Región de interés (ROI): trapecio que recorta cielo, cofre del vehículo y laterales lejanos."),
      bullet("Suavizado (GaussianBlur 5×5) + bordes con Canny (umbrales 50/150, razón 1:3)."),
      bullet("Máscara de ROI aplicada a los bordes antes de Hough, para no votar fuera de la calzada."),
      bullet("HoughLinesP: ρ=1 px, θ=1°, umbral de 20 votos, longitud mínima 20 px, hueco máximo 80 px."),
      bullet("Clasificación de segmentos por posición (izq./der. del centro) y signo de la pendiente, y ajuste por mínimos cuadrados (x en función de y) para extrapolar una única línea de carril por lado."),
      heading("3.3 Keypoints de Harris y repetibilidad estéreo", HeadingLevel.HEADING_2),
      bullet("cv::cornerHarris con blockSize=2, apertura Sobel=3, k=0.04."),
      bullet("Umbral relativo al máximo de respuesta en la imagen (2%) + supresión de no-máximos en ventana de 9×9 px."),
      bullet(
        "Repetibilidad: para cada keypoint izquierdo se buscan candidatos derechos con |Δfila| ≤ 2 px " +
        "(tolerancia por el par no ser perfectamente subpíxel-preciso) y disparidad xL−xR en [0, 130] px " +
        "(rango razonable para esta escena, sin calibración disponible — supuesto documentado, igual que " +
        "en el proyecto de correspondencia estéreo previo). Se asigna de forma voraz (greedy), de menor a " +
        "mayor distancia combinada, uno a uno. Repetibilidad (%) = 100 × emparejados / mín(keypoints_izq, keypoints_der)."
      ),
      para(
        "Nota metodológica importante: este criterio de repetibilidad es puramente GEOMÉTRICO (posición " +
        "bajo la restricción epipolar), sin verificación de apariencia (no se compara el parche alrededor " +
        "de cada keypoint). Es la definición clásica de repetibilidad de un detector de esquinas (Schmid " +
        "et al.), pero significa que, en escenas con muchos puntos espurios (ruido), pueden aparecer " +
        "coincidencias geométricas fortuitas que inflan el conteo de 'emparejados' sin ser realmente la " +
        "misma esquina física — se discute este efecto en la sección 5."
      ),

      // 4. Resultados — Hough
      heading("4. Resultados: detección de carriles (Hough)", HeadingLevel.HEADING_1),
      ...figure("hough/carriles_buena.png", 520, 375/1242),
      caption("Figura 1a. Condición 'buena' — carril izquierdo (rojo) y derecho (verde) detectados sobre los segmentos crudos de Hough (amarillo) y el ROI (azul)."),
      ...figure("hough/carriles_atardecer.png", 520, 375/1242),
      caption("Figura 1b. Condición 'atardecer'."),
      ...figure("hough/carriles_noche.png", 520, 375/1242),
      caption("Figura 1c. Condición 'noche' — menos segmentos crudos, pero el carril sigue detectado (ver §5)."),
      heading("Mapas de bordes (Canny) por condición", HeadingLevel.HEADING_2),
      ...figure("hough/bordes_buena.png", 520, 375/1242),
      caption("Figura 2a. Bordes — buena."),
      ...figure("hough/bordes_noche.png", 520, 375/1242),
      caption("Figura 2b. Bordes — noche. El ruido de sensor genera bordes espurios fuera del ROI (por eso la máscara de ROI es importante), y reduce la nitidez del borde real de la marca de carril."),
      heading("Resumen cuantitativo — Hough", HeadingLevel.HEADING_2),
      houghTable,
      para("", { spacing: { after: 200 } }),

      // 5. Resultados — Harris
      heading("5. Resultados: keypoints de Harris y repetibilidad estéreo", HeadingLevel.HEADING_1),
      ...figure("harris/keypoints_izq_buena.png", 520, 375/1242),
      caption("Figura 3a. Keypoints Harris, vista izquierda, condición 'buena' — concentrados en postes, árboles, señales y bordes del vehículo (zonas con gradiente en dos direcciones)."),
      ...figure("harris/keypoints_izq_noche.png", 520, 375/1242),
      caption("Figura 3b. Keypoints Harris, vista izquierda, condición 'noche' — el conteo AUMENTA (ver tabla), pero muchos son espurios: se agrupan sobre el contorno ruidoso entre el suelo oscuro y el cielo, no sobre estructura real de la escena."),
      ...figure("harris/heatmap_izq_buena.png", 520, 375/1242),
      caption("Figura 4. Mapa de respuesta de Harris (colormap JET) — condición 'buena'. Rojo = respuesta alta (esquina fuerte)."),
      ...figure("harris/matches_buena.png", 560, 375/2484),
      caption("Figura 5a. Correspondencia izquierda-derecha, condición 'buena'. Líneas verdes = pares que cumplen la restricción epipolar + disparidad (repetibilidad = 52.4%)."),
      ...figure("harris/matches_noche.png", 560, 375/2484),
      caption("Figura 5b. Correspondencia izquierda-derecha, condición 'noche' (repetibilidad = 49.5%): más puntos en total, pero proporcionalmente menos parejas confiables."),
      heading("Tasa de repetibilidad por condición", HeadingLevel.HEADING_2),
      repTable,
      para("", { spacing: { after: 200 } }),

      // 6. Análisis comparativo de robustez
      heading("6. Análisis comparativo de robustez", HeadingLevel.HEADING_1),
      heading("6.1 Dónde falla Hough y por qué", HeadingLevel.HEADING_2),
      para(
        "El número de segmentos de borde que sobreviven el filtro de pendiente cae de 18 (8+10) en " +
        "'buena' a 13 (5+8) en 'atardecer' — la corrección gamma reduce el contraste local en la marca " +
        "de carril y Canny pierde parte del borde. Sin embargo, la LÍNEA final (tras el ajuste por " +
        "mínimos cuadrados) se sigue detectando en las tres condiciones: esto es exactamente la " +
        "robustez explicada en §2.1 — mientras sobrevivan SUFICIENTES puntos colineales para superar el " +
        "umbral de votos del acumulador, no importa que estén fragmentados por huecos o que haya menos " +
        "de ellos que en la condición ideal. El método falla de forma distinta: no pierde la línea de " +
        "golpe, sino que la pierde quedaría más ruidosa/menos centrada si el número de segmentos cae por " +
        "debajo del umbral de votos (hough_threshold=20 acumulado, no 20 segmentos) — en escenas con " +
        "menos textura de marca vial que esta (por ejemplo, asfalto muy desgastado) sí se esperaría " +
        "pérdida total bajo 'noche'."
      ),
      heading("6.2 Dónde falla Harris y por qué", HeadingLevel.HEADING_2),
      para(
        "La tabla muestra un patrón no monótono que es en sí mismo el hallazgo relevante. De 'buena' a " +
        "'atardecer' la repetibilidad se mantiene estable (52.4% → 53.7%): la corrección gamma es una " +
        "transformación MONÓTONA de la intensidad, y el signo/orden relativo de los gradientes locales " +
        "(de donde sale la matriz M) se preserva razonablemente — consistente con que Harris tolera bien " +
        "cambios de iluminación suaves. De 'atardecer' a 'noche' la repetibilidad cae a 49.5% mientras " +
        "el CONTEO de keypoints sube fuertemente (315→469 en la izquierda, 351→526 en la derecha): el " +
        "ruido gaussiano fuerte introduce gradientes locales aleatorios que superan el umbral de esquina " +
        "en muchos píxeles que no son esquinas reales (ver Figura 3b, agrupados en el contorno ruidoso " +
        "suelo-cielo). Como ese ruido es independiente entre la imagen izquierda y la derecha, esos " +
        "puntos espurios casi nunca coinciden en posición entre ambas vistas — inflan el denominador " +
        "(más keypoints detectados) sin inflar en la misma proporción el numerador (pares que realmente " +
        "cumplen la restricción epipolar), y la repetibilidad neta baja. Es la condición donde MÁS se " +
        "pierde correspondencia real."
      ),
      para(
        "La condición de desbalance de ganancia entre cámaras (58.5%) ilustra el límite de un criterio " +
        "de repetibilidad puramente geométrico: al degradar solo la cámara derecha, esta genera muchos " +
        "más keypoints espurios (519, el mayor conteo de toda la tabla) que, aun sin corresponder a la " +
        "misma estructura física que sus pares izquierdos, tienen una probabilidad no despreciable de " +
        "caer por azar dentro de la ventana de tolerancia (fila ±2 px, disparidad 0-130 px) frente a " +
        "algún keypoint izquierdo — sobre todo en zonas de textura repetitiva como el asfalto o el " +
        "follaje. El resultado es una repetibilidad reportada más alta que la de la propia condición " +
        "'buena', que es contraintuitivo si se interpreta la métrica de forma aislada. La lectura " +
        "correcta no es 'el desbalance de cámaras mejora la robustez', sino que un sistema real necesita " +
        "verificación de apariencia (correlación de parche, descriptor) ADEMÁS de la restricción " +
        "geométrica antes de aceptar una correspondencia — la repetibilidad puramente posicional es " +
        "necesaria pero no suficiente, y sobreestima la calidad de la correspondencia cuando el " +
        "detector se vuelve ruidoso."
      ),

      // 7. Nota sobre manejo de bordes
      heading("7. Nota sobre el manejo de bordes de la imagen", HeadingLevel.HEADING_1),
      para(
        "Se usan dos mecanismos de borde distintos, cada uno con un propósito distinto:"
      ),
      bullet(
        "Derivadas (Sobel, dentro de Canny y de cornerHarris): OpenCV usa por defecto " +
        "BORDER_REFLECT_101, que refleja la imagen sobre el borde en vez de rellenar con ceros. Esto " +
        "evita bordes falsos de 'marco' en la primera/última fila y columna, pero implica que la " +
        "vecindad de un píxel muy cercano al borde se completa parcialmente con información inventada " +
        "(el reflejo), no con textura real de la escena — la respuesta de Harris y los bordes de Canny " +
        "en esa franja delgada (proporcional a blockSize/aperture, aquí unos pocos píxeles) son menos " +
        "confiables que en el interior de la imagen."
      ),
      bullet(
        "Región de interés (Hough): el trapecio de ROI recorta deliberadamente el cielo, el cofre del " +
        "vehículo y los laterales lejanos ANTES de correr Hough. No es una política de relleno sino de " +
        "exclusión: evita que el acumulador reciba votos de bordes que estructuralmente no pueden ser " +
        "carril (horizonte, edificios, el propio vehículo), que de otro modo generarían líneas espurias " +
        "o competirían por los mismos votos que la línea real."
      ),
      bullet(
        "Correspondencia estéreo (disparidad): un keypoint izquierdo con x muy pequeña, o uno derecho " +
        "con x muy grande, tiene por construcción menos (o ningún) candidato válido dentro de la ventana " +
        "de disparidad [0, 130] px — no porque el algoritmo falle ahí, sino porque, dada la geometría " +
        "del par estéreo, esa franja de la imagen de un lado simplemente no tiene dónde proyectarse " +
        "dentro del rango de búsqueda del otro lado. Es la misma 'banda ciega' que aparece en cualquier " +
        "mapa de disparidad por bloques (StereoBM/SGBM) y en el proyecto de correspondencia estéreo " +
        "SAD/Census previo de este curso — aquí se manifiesta como una repetibilidad estructuralmente " +
        "menor para los keypoints ubicados en esa franja de borde, no como un error de implementación."
      ),

      // 8. Conclusiones
      heading("8. Conclusiones", HeadingLevel.HEADING_1),
      bullet(
        "Hough es robusto a la fragmentación de la marca de carril (huecos) porque acumula votos " +
        "globalmente por celda (ρ, θ) en vez de exigir conectividad de píxeles; se degrada gradualmente " +
        "(menos segmentos, línea algo menos centrada) antes de perder la línea por completo."
      ),
      bullet(
        "Harris es invariante a rotación (la respuesta depende solo de los valores propios de M, que no " +
        "cambian al rotar la vecindad) pero no a escala (ventana de tamaño fijo en píxeles) — relevante " +
        "para ADAS porque la distancia a los objetos, que es precisamente lo que el sistema estéreo " +
        "busca estimar, determina cuántos píxeles ocupa cada esquina real y por tanto qué tan estable es " +
        "su detección."
      ),
      bullet(
        "La condición donde más se pierde correspondencia real es 'noche': el ruido de sensor genera " +
        "keypoints espurios independientes entre cámaras que no se repiten, bajando la repetibilidad " +
        "neta aunque el conteo bruto de keypoints suba."
      ),
      bullet(
        "Un criterio de repetibilidad puramente geométrico (sin verificación de apariencia) puede " +
        "sobreestimar la calidad de la correspondencia cuando el detector se vuelve ruidoso — un sistema " +
        "de producción necesitaría además un descriptor local o correlación de parche antes de aceptar " +
        "una correspondencia como válida para triangulación."
      ),
    ],
  }],
});

Packer.toBuffer(doc).then(buf => {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, buf);
  console.log("Reporte generado en:", OUT);
});
