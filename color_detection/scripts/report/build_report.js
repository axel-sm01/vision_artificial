const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow,
  TableCell, WidthType, ShadingType, AlignmentType, ImageRun, BorderStyle,
  PageBreak, Header, Footer, PageNumber, VerticalAlign
} = require("docx");

const path = require("path");
const RESULTS = path.join(__dirname, "..", "..", "results");
const OUT = path.join(__dirname, "..", "..", "docs", "Reporte_CIELAB_vs_HSV.docx");

// ---------- utilidades ----------
function para(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 160, ...(opts.spacing || {}) },
    ...opts,
    children: [new TextRun({ text, ...opts.run })],
  });
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

function imageParagraph(path, widthPx, ratio) {
  const buf = fs.readFileSync(path);
  const w = widthPx;
  const h = Math.round(widthPx * ratio);
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 80 },
    children: [new ImageRun({ data: buf, transformation: { width: w, height: h }, type: "png" })],
  });
}

function caption(text) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 260 },
    children: [new TextRun({ text, italics: true, size: 18, color: "444444" })],
  });
}

// ---------- tiempos ----------
const csv = fs.readFileSync(`${RESULTS}/timings.csv`, "utf-8").trim().split("\n");
const header = csv[0].split(",");
const rows = csv.slice(1).map(l => {
  const v = l.split(",");
  const o = {};
  header.forEach((k, i) => o[k] = v[i]);
  return o;
});

const condLabel = { dia: "Día", atardecer: "Atardecer", noche: "Noche" };
const metLabel = { CIELAB: "CIELAB (a*)", HSV: "HSV (Hue)" };

const tableWidth = 9350;
const widths = [1900, 2100, 1900, 1900, 1550]; // condicion, metodo, avg_ms, min_ms, max_ms
const timingHeaderRow = new TableRow({
  tableHeader: true,
  children: [
    cell("Condición", { width: widths[0], header: true }),
    cell("Método", { width: widths[1], header: true }),
    cell("Promedio (ms)", { width: widths[2], header: true }),
    cell("Mín (ms)", { width: widths[3], header: true }),
    cell("Máx (ms)", { width: widths[4], header: true }),
  ],
});

const timingRows = rows.map(r => new TableRow({
  children: [
    cell(condLabel[r.condicion], { width: widths[0] }),
    cell(metLabel[r.metodo], { width: widths[1] }),
    cell(parseFloat(r.avg_ms).toFixed(2), { width: widths[2] }),
    cell(parseFloat(r.min_ms).toFixed(2), { width: widths[3] }),
    cell(parseFloat(r.max_ms).toFixed(2), { width: widths[4] }),
  ],
}));

const timingTable = new Table({
  width: { size: tableWidth, type: WidthType.DXA },
  columnWidths: widths,
  rows: [timingHeaderRow, ...timingRows],
});

// ---------- documento ----------
const doc = new Document({
  styles: {
    default: {
      document: { run: { font: "Calibri", size: 22 } },
    },
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 }, // US Letter
        margin: { top: 1080, bottom: 1080, left: 1260, right: 1260 },
      },
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({ text: "Sistemas Visuales y Formación de Imágenes — Maestría en Ciencia de Datos", size: 16, color: "888888" })],
        })],
      }),
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ children: ["Página ", PageNumber.CURRENT, " de ", PageNumber.TOTAL_PAGES], size: 16, color: "888888" })],
        })],
      }),
    },
    children: [
      // Portada
      new Paragraph({ text: "", spacing: { after: 1200 } }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "Detección de color de señalización:", bold: true, size: 40 })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
        children: [new TextRun({ text: "CIELAB frente a HSV bajo distintas iluminaciones", bold: true, size: 40, color: "1F3864" })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 120 },
        children: [new TextRun({ text: "Caso de estudio: señal de ALTO en tres condiciones de iluminación (día, atardecer, noche)", italics: true, size: 24 })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 1600 },
        children: [new TextRun({ text: "Aplicación al reto de percepción robusta en sistemas ADAS", italics: true, size: 24 })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "Maestría en Ciencia de Datos — Sistemas Visuales y Formación de Imágenes", size: 22 })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "Tarea: Detección de color CIELAB vs HSV", size: 22 })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [new TextRun({ text: "Repositorio de código: [agregar URL de GitHub tras el push]", size: 22 })],
      }),
      new Paragraph({ children: [new PageBreak()] }),

      // 1. Objetivo
      heading("1. Objetivo", HeadingLevel.HEADING_1),
      para(
        "Comparar dos estrategias de detección del color de fondo de una señal de tránsito " +
        "(ALTO, fondo rojo) bajo tres condiciones reales de iluminación —día, atardecer y " +
        "noche— usando (a) el espacio de color CIELAB, aprovechando el signo y la magnitud " +
        "del canal a*, y (b) el espacio HSV con el umbral clásico sobre el matiz. El propósito " +
        "es evidenciar cuál representación se degrada menos ante cambios de iluminación, que es " +
        "precisamente el reto que enfrenta la etapa de percepción de un sistema ADAS operando " +
        "en condiciones reales de manejo, sin control sobre la fuente de luz."
      ),

      // 2. Marco conceptual
      heading("2. Marco conceptual", HeadingLevel.HEADING_1),
      heading("2.1 CIELAB (L*a*b*)", HeadingLevel.HEADING_2),
      para(
        "CIELAB es un espacio de color diseñado para aproximar la percepción humana de manera " +
        "perceptualmente más uniforme que RGB, separando explícitamente la luminancia (L*) de " +
        "la información cromática (a*, b*). El canal a* codifica el eje verde–rojo (valores " +
        "negativos hacia verde, positivos hacia rojo/magenta) y b* codifica el eje azul–amarillo " +
        "(negativos hacia azul, positivos hacia amarillo). OpenCV representa a* y b* en 8 bits " +
        "centrados en 128 (0 real ≙ 128 codificado)."
      ),
      para(
        "Esta estructura permite construir una máscara de color usando únicamente el signo y la " +
        "magnitud de a* (rojo) o b* (amarillo), sin necesidad de calcular un ángulo de matiz. " +
        "Es una operación aritmética simple (resta y comparación) que no involucra divisiones ni " +
        "funciones trigonométricas inversas, a diferencia del cálculo de Hue en HSV. Es importante " +
        "no sobre-afirmar: la conversión estándar de OpenCV usa un punto blanco de referencia fijo " +
        "(D65) y no adapta al iluminante real de la escena, por lo que a*/b* también se ven " +
        "desplazados por luces de color cálido (atardecer) o artificial (sodio/LED nocturno). La " +
        "ventaja de CIELAB no es \"invariancia total\" a la iluminación, sino mayor estabilidad " +
        "numérica del criterio de decisión cuando la luminancia cae, como se discute en la sección 5."
      ),
      heading("2.2 HSV (Hue, Saturation, Value)", HeadingLevel.HEADING_2),
      para(
        "HSV es una transformación no lineal de RGB pensada para ser más intuitiva (matiz, " +
        "saturación, brillo) que perceptualmente uniforme. El matiz H se calcula a partir de " +
        "razones entre las diferencias de los canales RGB. Cuando la saturación S o el valor V " +
        "son bajos —exactamente lo que ocurre en sombra, penumbra o escenas nocturnas—, el cálculo " +
        "de H se vuelve numéricamente inestable (razones cercanas a 0/0), produciendo matices " +
        "ruidosos o arbitrarios aunque el color \"real\" del objeto no haya cambiado. Por eso el " +
        "umbral de matiz suele combinarse con umbrales mínimos de S y V, lo cual, paradójicamente, " +
        "hace que el detector rechace parte de la señal cuando esta pierde saturación o brillo por " +
        "baja iluminación."
      ),

      // 3. Metodología
      heading("3. Metodología", HeadingLevel.HEADING_1),
      heading("3.1 Dataset", HeadingLevel.HEADING_2),
      para(
        "Se fotografió la misma señal de ALTO, desde una posición y ángulo similares, en tres " +
        "momentos del día: (1) luz de día con cielo despejado, (2) atardecer con cielo nublado/" +
        "anaranjado y (3) noche con iluminación artificial de la calle. Las tres imágenes se " +
        "normalizaron a un ancho de 900 px antes del procesamiento para que la carga de trabajo " +
        "(y por lo tanto los tiempos medidos) sea comparable entre condiciones."
      ),
      heading("3.2 Pipeline de detección", HeadingLevel.HEADING_2),
      bullet("Conversión de color: BGR → CIELAB (cv::COLOR_BGR2Lab) y BGR → HSV (cv::COLOR_BGR2HSV)."),
      bullet("Máscara CIELAB: a* > umbral (12) Y a* domina sobre |b*| (≥ 0.6×) Y croma √(a*²+b*²) ≥ 18 Y luminancia en rango [20, 250]. Sin umbral de matiz."),
      bullet("Máscara HSV: cv::inRange sobre dos bandas de Hue (0–10 y 170–179, porque el rojo cruza el 0°/360°) con saturación mínima 80 y valor mínimo 40."),
      bullet("Limpieza morfológica IDÉNTICA para ambos métodos: apertura + cierre con kernel elíptico 5×5, para que la comparación no esté sesgada por post-procesamiento distinto."),
      bullet("Re-coloreo: se modifica únicamente el canal H (a verde, H=60) de los píxeles enmascarados en HSV, preservando S y V — así se conserva la textura/sombreado y el texto \"ALTO\" sigue siendo legible en la visualización."),
      bullet("Tiempos: se mide el paso de detección (máscara + limpieza, sin recoloreo ni disco) con 15 repeticiones tras 3 corridas de calentamiento, para tener un promedio estable en vez de una sola muestra ruidosa."),
      para(
        "Todos los parámetros están centralizados y documentados en el código " +
        "(include/color_detection.hpp, structs LabParams y HsvParams) para reproducibilidad " +
        "total — ver sección 6."
      ),

      // 4. Resultados
      heading("4. Resultados", HeadingLevel.HEADING_1),
      para(
        "Cada figura muestra, de izquierda a derecha: imagen original, máscara CIELAB, imagen " +
        "re-coloreada con CIELAB, máscara HSV e imagen re-coloreada con HSV."
      ),

      heading("4.1 Día", HeadingLevel.HEADING_2),
      imageParagraph(`${RESULTS}/dia/comparacion.png`, 620, 674/2400),
      caption("Figura 1. Comparación CIELAB vs HSV en condición de día (buena iluminación)."),

      heading("4.2 Atardecer", HeadingLevel.HEADING_2),
      imageParagraph(`${RESULTS}/atardecer/comparacion.png`, 620, 674/2400),
      caption("Figura 2. Comparación CIELAB vs HSV en condición de atardecer."),

      heading("4.3 Noche", HeadingLevel.HEADING_2),
      imageParagraph(`${RESULTS}/noche/comparacion.png`, 620, 674/2400),
      caption("Figura 3. Comparación CIELAB vs HSV en condición de noche."),

      heading("4.4 Tiempos de detección", HeadingLevel.HEADING_2),
      para(
        "Tiempo del paso de detección (construcción de máscara + limpieza morfológica), " +
        "promedio de 15 repeticiones por condición y método sobre la misma imagen ya cargada " +
        "en memoria (no incluye lectura/escritura de disco ni el recoloreo de visualización)."
      ),
      timingTable,
      new Paragraph({ text: "", spacing: { before: 200, after: 200 } }),

      // 5. Análisis
      heading("5. Análisis comparativo de robustez", HeadingLevel.HEADING_1),
      para(
        "Este análisis se basa en observación directa de las Figuras 1–3 (no en métricas " +
        "numéricas de forma): para cada condición se describe qué se ve en cada máscara y por qué, " +
        "según los fundamentos de la sección 2."
      ),
      heading("5.1 Día", HeadingLevel.HEADING_2),
      para(
        "En la Figura 1 ambos métodos recortan el octágono casi completo, con bordes limpios y " +
        "el texto \"ALTO\" bien definido como hueco dentro de la silueta. La diferencia visible " +
        "está en el ruido de fondo: CIELAB deja una sola mancha compacta debajo de la señal " +
        "(coincide con el portón naranja de la foto original), mientras que HSV genera varias " +
        "motas pequeñas y separadas en esa misma zona. Ambos métodos comparten además una rayita " +
        "delgada a la izquierda del poste — el mismo objeto (probablemente un reflejo metálico) " +
        "engaña a los dos por igual, así que no distingue a ninguno."
      ),
      heading("5.2 Atardecer", HeadingLevel.HEADING_2),
      para(
        "En la Figura 2 el patrón se repite pero más marcado: la luz cálida del atardecer hace " +
        "que el auto estacionado y el portón se vean más rojizos, y ambos métodos los recogen " +
        "parcialmente. CIELAB vuelve a mostrar ese ruido como pocas manchas grandes y conectadas; " +
        "HSV lo dispersa en más puntos chicos repartidos en un área más amplia de la imagen. El " +
        "octágono en sí se detecta igual de bien con los dos métodos — el cielo anaranjado de " +
        "fondo no genera falsos positivos grandes en ninguno."
      ),
      heading("5.3 Noche", HeadingLevel.HEADING_2),
      para(
        "La Figura 3 es la condición más reveladora. El contorno del octágono se ve más " +
        "\"mordido\"/irregular en ambos métodos que en día o atardecer — señal de que la " +
        "diferencia de color entre el rojo de la señal y el fondo es más débil de noche. CIELAB " +
        "agrega un puntito de ruido aislado lejos de la señal, que no aparece en HSV; a cambio, " +
        "HSV produce una máscara ligeramente más pequeña, recortando un poco más el borde del " +
        "octágono que CIELAB. En las imágenes re-coloreadas de noche también se nota, en ambos " +
        "métodos, un delgado borde rojo/rosado que queda sin recolorear alrededor del octágono " +
        "verde — la limpieza morfológica \"come\" uno o dos píxeles del borde antes del recoloreo, " +
        "y de noche ese borde retenido es más visible por el bajo contraste general de la escena."
      ),
      heading("5.4 Tiempos de detección", HeadingLevel.HEADING_2),
      para(
        "La Tabla de la sección 4.4 muestra que, en esta implementación, HSV es " +
        "consistentemente más rápido que CIELAB (≈4 ms vs ≈13 ms por imagen, en las tres " +
        "condiciones). La razón no es conceptual sino de implementación: buildMaskHsv usa " +
        "cv::inRange, una rutina de OpenCV vectorizada internamente, mientras que buildMaskLab " +
        "recorre la imagen píxel por píxel en un ciclo manual para evaluar el criterio de signo " +
        "y magnitud de a*/b*. Esa diferencia de casi 3× es honesta y vale la pena reportarla, pero " +
        "no se le debe atribuir al espacio de color en sí: el mismo criterio de CIELAB podría " +
        "vectorizarse con operaciones matriciales de OpenCV (cv::compare, cv::abs, comparaciones " +
        "por canal) y previsiblemente acercarse al tiempo de HSV. Para un ADAS en tiempo real, " +
        "esto es un recordatorio de que la robustez conceptual de un método no garantiza que su " +
        "primera implementación sea la más eficiente; el costo computacional real depende tanto " +
        "del algoritmo como de qué tan bien aproveche las rutinas optimizadas de la librería."
      ),
      heading("5.5 Síntesis", HeadingLevel.HEADING_2),
      para(
        "En este dataset —tres fotos de una sola señal— ningún método falla por completo en " +
        "ninguna condición: el octágono se reconoce visualmente en las nueve combinaciones " +
        "(3 condiciones × 2 métodos, más la máscara sin limpiar). Lo que sí cambia consistentemente " +
        "es el patrón del ruido: CIELAB tiende a agrupar los falsos positivos en pocas manchas " +
        "grandes, mientras que HSV los dispersa en más manchas pequeñas — un detalle relevante " +
        "porque un post-procesamiento típico (quedarse con el componente conexo más grande) " +
        "depende de que el ruido no compita en tamaño con la señal real, algo que en principio " +
        "favorece más a CIELAB en escenas con objetos rojizo/naranja de fondo. En cuanto a " +
        "velocidad, la ventaja de HSV en esta implementación es clara pero, como se explicó, es " +
        "un asunto de optimización de código y no una limitación estructural de CIELAB."
      ),

      // 6. Conclusiones
      heading("6. Conclusiones", HeadingLevel.HEADING_1),
      bullet("CIELAB permite detectar el color de la señal sin umbral de matiz, usando solo signo y magnitud de a*/b*, un criterio conceptualmente más simple que el cálculo de Hue en HSV y que no depende de una división cuando la luminancia cae."),
      bullet("Visualmente, ambos métodos detectan el octágono completo en las tres condiciones de luz probadas; la diferencia observable está en el patrón del ruido de fondo — CIELAB lo concentra en pocas manchas grandes, HSV lo dispersa en muchas manchas pequeñas."),
      bullet("La noche es la condición más exigente para ambos: el borde del octágono se ve más irregular y el recoloreo deja un delgado borde sin cubrir en los dos métodos por igual."),
      bullet("En esta implementación HSV es ≈3× más rápido que CIELAB, pero esa diferencia viene de que HSV usa cv::inRange (vectorizado) mientras CIELAB usa un ciclo manual — no es una desventaja inherente al espacio de color."),
      bullet("Ningún resultado aquí debe generalizarse más allá de este caso de estudio (una señal, tres fotos): para un sistema ADAS real se requeriría un dataset mucho más amplio, con distintas señales, ángulos y condiciones climáticas."),

      // 7. Reproducibilidad
      heading("7. Reproducibilidad", HeadingLevel.HEADING_1),
      para(
        "El código completo (C++17 + OpenCV, CMake, listo para abrir en Visual Studio con " +
        "\"Open Folder\"), las imágenes de " +
        "entrada, los resultados (máscaras, recoloreos, timings.csv) y este mismo reporte se " +
        "entregan en el repositorio del proyecto: traffic-sign-color-detection/. El repositorio " +
        "incluye historial de git local, listo para: git remote add origin <URL> && git push."
      ),
      para(
        "Para reproducir en Windows: en Visual Studio 2022, File → Open → Folder sobre la " +
        "carpeta raíz del repo (detecta CMakeLists.txt y CMakePresets.json automáticamente), " +
        "elegir el preset x64-release, seleccionar sign_color_detector.exe como elemento de " +
        "inicio y presionar Ctrl+F5. Alternativamente, generar un .sln clásico con: cmake .. " +
        "-G \"Visual Studio 17 2022\" -A x64 -DOpenCV_DIR=\"C:/opencv/build\". Todos los umbrales " +
        "están documentados como constantes con nombre (LabParams, HsvParams) en " +
        "include/color_detection.hpp, sin valores mágicos dispersos en el código."
      ),
    ],
  }],
});

Packer.toBuffer(doc).then(buf => {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, buf);
  console.log("OK ->", OUT, buf.length, "bytes");
});
