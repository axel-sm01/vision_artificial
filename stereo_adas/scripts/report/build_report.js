const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow,
  TableCell, WidthType, ShadingType, AlignmentType, ImageRun, PageBreak,
  Header, Footer, PageNumber, VerticalAlign
} = require("docx");

const RESULTS = path.join(__dirname, "..", "..", "results");
const OUT = path.join(__dirname, "..", "..", "docs", "Reporte_Census_vs_SAD.docx");

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
const rob = readCsv(`${RESULTS}/robustez.csv`);
const timing = readCsv(`${RESULTS}/timings.csv`);

const condLabel = {
  igualada: "Igualada (im0 vs im1)",
  gamma_sintetico: "Gamma sintético (g=1.8)",
  real_exposicion: "Real: exposición (im1E)",
  real_iluminacion: "Real: iluminación (im1L)",
};
const metLabel = { SAD: "SAD", CENSUS: "Census + Hamming" };

// Tabla de robustez
const robW = [3200, 2400, 2100, 1650];
const robHeader = new TableRow({ tableHeader: true, children: [
  cell("Condición", { width: robW[0], header: true }),
  cell("Método", { width: robW[1], header: true }),
  cell("MAD (px disp.)", { width: robW[2], header: true }),
  cell("Válidos (%)", { width: robW[3], header: true }),
]});
const robRows = rob.map(r => new TableRow({ children: [
  cell(condLabel[r.condicion] || r.condicion, { width: robW[0] }),
  cell(metLabel[r.metodo], { width: robW[1] }),
  cell(parseFloat(r.mad_disparidad_px).toFixed(2), { width: robW[2] }),
  cell(parseFloat(r.validos_pct).toFixed(1), { width: robW[3] }),
]}));
const robTable = new Table({ width: { size: 9350, type: WidthType.DXA }, columnWidths: robW, rows: [robHeader, ...robRows] });

// Tabla de tiempos
const timW = [2800, 2200, 2200, 2150];
const timHeader = new TableRow({ tableHeader: true, children: [
  cell("Método", { width: timW[0], header: true }),
  cell("Promedio (ms)", { width: timW[1], header: true }),
  cell("Mín (ms)", { width: timW[2], header: true }),
  cell("Máx (ms)", { width: timW[3], header: true }),
]});
const timRows = timing.map(r => new TableRow({ children: [
  cell(metLabel[r.metodo], { width: timW[0] }),
  cell(parseFloat(r.avg_ms).toFixed(1), { width: timW[1] }),
  cell(parseFloat(r.min_ms).toFixed(1), { width: timW[2] }),
  cell(parseFloat(r.max_ms).toFixed(1), { width: timW[3] }),
]}));
const timTable = new Table({ width: { size: 9350, type: WidthType.DXA }, columnWidths: timW, rows: [timHeader, ...timRows] });

const ratio = 472 / 2560;

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
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 400 }, children: [new TextRun({ text: "Transformada Census frente a correlación de intensidad (SAD) para correspondencia estéreo", bold: true, size: 36, color: "1F3864" })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [new TextRun({ text: "Caso de estudio: par estéreo de Middlebury 2014 con variantes de iluminación (im1E, im1L) y un desbalance simulado por gamma", italics: true, size: 24 })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 1600 }, children: [new TextRun({ text: "Aplicación al reto de percepción 3D robusta en sistemas ADAS", italics: true, size: 24 })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Maestría en Ciencia de Datos — Sistemas Visuales y Formación de Imágenes", size: 22 })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Tarea: Perfil 3 — Census vs correlación de intensidad", size: 22 })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: "Repositorio de código: [agregar URL de GitHub tras el push]", size: 22 })] }),
      new Paragraph({ children: [new PageBreak()] }),

      // 1. Objetivo
      heading("1. Objetivo", HeadingLevel.HEADING_1),
      para(
        "Implementar el núcleo de un algoritmo de correspondencia estéreo (cálculo de disparidad " +
        "por emparejamiento de ventanas) con dos estrategias — correlación directa de intensidad " +
        "(SAD) y transformada Census con distancia de Hamming — y comparar cuál se degrada menos " +
        "cuando hay una diferencia de iluminación o ganancia entre la cámara izquierda y la " +
        "derecha. Este es el reto real de un sistema de reconstrucción 3D en un ADAS: las dos " +
        "cámaras del arreglo estéreo casi nunca están perfectamente calibradas en exposición, y el " +
        "algoritmo de correspondencia debe seguir funcionando de todos modos."
      ),

      // 2. Marco conceptual
      heading("2. Marco conceptual", HeadingLevel.HEADING_1),
      heading("2.1 Correlación directa de intensidad (SAD / SSD)", HeadingLevel.HEADING_2),
      para(
        "SAD (Sum of Absolute Differences) y SSD (Sum of Squared Differences) comparan dos " +
        "ventanas restando directamente los valores de intensidad, píxel a píxel: " +
        "SAD = Σ|I_izq(p) − I_der(p)|. Es el enfoque más intuitivo — la ventana con menor " +
        "diferencia acumulada es la que mejor \"calza\" — pero depende de que ambas cámaras " +
        "reporten prácticamente el mismo valor numérico para el mismo punto físico. Si una cámara " +
        "tiene más ganancia, otro balance de blancos, o una exposición distinta, los valores de " +
        "intensidad ya no son comparables entre sí, aunque el contenido de la escena sea idéntico — " +
        "y el costo SAD deja de tener sentido."
      ),
      heading("2.2 Transformada Census + distancia de Hamming", HeadingLevel.HEADING_2),
      para(
        "Census no compara valores absolutos de intensidad: para cada píxel, lo compara contra " +
        "cada vecino de su ventana y guarda solo el resultado de esa comparación (1 si el vecino " +
        "es más oscuro que el centro, 0 si no) — una cadena de bits por píxel. Dos ventanas se " +
        "emparejan por distancia de Hamming (cuántos bits difieren), no por resta de intensidades."
      ),
      para(
        "La razón por la que esto es robusto a cambios de iluminación es una propiedad matemática " +
        "simple: si aplicamos una función monótona creciente f (como una corrección gamma o un " +
        "aumento de ganancia) a toda la imagen, el ORDEN entre dos intensidades no cambia — si " +
        "I(vecino) < I(centro), entonces f(I(vecino)) < f(I(centro)) también, para cualquier f " +
        "monótona. Como el bit de census solo depende de ese orden relativo, y no de la magnitud, " +
        "permanece igual aunque toda la imagen se aclare u oscurezca de forma monótona. Esta es " +
        "justamente la propiedad que explota SGM (Semi-Global Matching) y otros métodos clásicos " +
        "de correspondencia estéreo robustos, y es la razón por la que se siguieron usando en " +
        "producción durante años antes de que las redes de disparidad end-to-end (que aprenden su " +
        "propia función de costo directamente de los datos) empezaran a desplazarlos."
      ),

      // 3. Metodología
      heading("3. Metodología", HeadingLevel.HEADING_1),
      heading("3.1 Dataset", HeadingLevel.HEADING_2),
      para(
        "Par estéreo rectificado de Middlebury Stereo 2014 (2872×1984 px). Se usan cuatro " +
        "imágenes de la cámara derecha contra la misma cámara izquierda (im0): im1 (misma " +
        "iluminación, condición \"igualada\"), una versión con gamma=1.8 aplicado sintéticamente " +
        "sobre im1 (el desbalance que pide la tarea), e im1E / im1L — variantes reales de " +
        "exposición e iluminación que el propio dataset de Middlebury incluye, usadas como " +
        "evidencia adicional con datos reales, no solo simulados."
      ),
      heading("3.2 Parámetros y por qué se eligieron", HeadingLevel.HEADING_2),
      bullet("Ancho de trabajo: 640 px. El par viene a resolución completa (~2872 px); reducirlo hace que el emparejamiento por fuerza bruta corra en segundos en vez de minutos, sin cambiar la naturaleza del experimento."),
      bullet("Ventana 7×7 (radio 3), la MISMA para ambos métodos — comparación justa. Con radio 3 la vecindad tiene 48 píxeles, que caben exactos en un entero de 64 bits para el código census, sin necesitar una estructura de datos más compleja."),
      bullet("Rango de disparidad: 0–64 px. No se contó con el archivo calib.txt de esta escena, así que este es un valor razonable para la resolución de trabajo, documentado explícitamente como supuesto y no como un dato calibrado."),
      bullet("Gamma simulado = 1.8: suficiente para que el cambio sea claramente visible sin saturar la imagen (perder información por recorte en blancos/negros)."),
      para(
        "Todos los parámetros están centralizados en include/stereo_matching.hpp (struct " +
        "StereoParams) y en las constantes al inicio de main.cpp."
      ),

      // 4. Resultados
      heading("4. Resultados", HeadingLevel.HEADING_1),
      para("Cada figura muestra, de izquierda a derecha: cámara izquierda (im0), cámara derecha bajo la condición evaluada, disparidad por SAD, y disparidad por Census+Hamming (colormap JET; negro = sin disparidad válida)."),

      heading("4.1 Igualada (referencia)", HeadingLevel.HEADING_2),
      imageParagraph(`${RESULTS}/igualada/comparacion.png`, 620, ratio),
      caption("Figura 1. Ambas cámaras con la misma iluminación — condición de referencia."),

      heading("4.2 Gamma sintético (g=1.8)", HeadingLevel.HEADING_2),
      imageParagraph(`${RESULTS}/gamma_sintetico/comparacion.png`, 620, ratio),
      caption("Figura 2. Desbalance simulado aplicando gamma solo a la cámara derecha."),

      heading("4.3 Real: exposición (im1E)", HeadingLevel.HEADING_2),
      imageParagraph(`${RESULTS}/real_exposicion/comparacion.png`, 620, ratio),
      caption("Figura 3. Variante real de Middlebury con exposición distinta entre cámaras."),

      heading("4.4 Real: iluminación (im1L)", HeadingLevel.HEADING_2),
      imageParagraph(`${RESULTS}/real_iluminacion/comparacion.png`, 620, ratio),
      caption("Figura 4. Variante real de Middlebury con iluminación de escena distinta (no solo ganancia de cámara)."),

      heading("4.5 Robustez cuantitativa", HeadingLevel.HEADING_2),
      para("MAD = diferencia media absoluta de disparidad (en píxeles) contra el mapa de la condición igualada, sobre los píxeles válidos en ambos. Más bajo = el método cambió menos su salida al desbalancear la iluminación."),
      robTable,
      new Paragraph({ text: "", spacing: { before: 200, after: 200 } }),

      heading("4.6 Tiempos de cómputo", HeadingLevel.HEADING_2),
      para("Tiempo del cálculo completo de disparidad (640×~442 px, ventana 7×7, 65 disparidades), promedio de 8 repeticiones tras 2 de calentamiento, sobre la condición igualada."),
      timTable,
      new Paragraph({ text: "", spacing: { before: 200, after: 200 } }),

      // 5. Análisis
      heading("5. Análisis comparativo de robustez", HeadingLevel.HEADING_1),
      heading("5.1 Por qué SAD colapsa con el gamma sintético", HeadingLevel.HEADING_2),
      para(
        "En la Figura 2, el mapa de disparidad de SAD deja de parecerse a la silla por completo y " +
        "se convierte en un patrón de rayas diagonales — un patrón reconocible en la literatura " +
        "como firma característica de una función de costo que dejó de tener información útil: " +
        "cuando ningún candidato de disparidad produce un costo genuinamente bajo (porque los " +
        "niveles de intensidad ya no son comparables entre cámaras), el criterio de \"ganador\" " +
        "termina dominado por coincidencias de bajo nivel entre texturas repetitivas de la escena, " +
        "en vez de por la correspondencia real. Numéricamente esto se refleja en un MAD de 24.9 " +
        "píxeles de disparidad — un error enorme para un rango de búsqueda de solo 64 píxeles."
      ),
      heading("5.2 Por qué Census se mantiene casi intacto", HeadingLevel.HEADING_2),
      para(
        "En la misma Figura 2, el mapa de Census+Hamming es visualmente casi idéntico al de la " +
        "Figura 1 (MAD de apenas 1.75 píxeles). Esto es exactamente lo que predice la sección 2.2: " +
        "el gamma aplicado es una función monótona creciente sobre toda la imagen, así que el " +
        "orden relativo de intensidades entre cada píxel y sus vecinos —que es lo único que " +
        "codifica el bit de census— no cambia. El criterio de Hamming sigue comparando, en " +
        "esencia, la misma información estructural que antes."
      ),
      heading("5.3 Por qué la ventaja de Census se reduce con im1L", HeadingLevel.HEADING_2),
      para(
        "Aquí está el matiz más interesante del experimento. Con im1E (Figura 3, solo cambia la " +
        "exposición de la cámara) el MAD de Census sube un poco, a 5.83 — sigue siendo mucho mejor " +
        "que SAD (24.86), pero ya no es casi cero. Con im1L (Figura 4, cambia la iluminación real " +
        "de la escena) el MAD de Census sube más todavía, a 13.88, acercándose bastante al de SAD " +
        "(21.77). La razón es que la garantía de Census —invariancia ante una transformación " +
        "monótona— asume un cambio GLOBAL de intensidad, igual para toda la imagen. Un cambio real " +
        "de iluminación de escena, como el de im1L, no es solo más ganancia de cámara: la luz " +
        "viene de otra posición/ángulo, así que genera sombras distintas en distintas partes de la " +
        "silla y del fondo — se nota a simple vista en la Figura 4 comparando dónde caen las " +
        "sombras del respaldo y de la taza. Ese tipo de cambio puede invertir el orden relativo " +
        "entre un píxel y su vecino de forma LOCAL en zonas donde aparece o desaparece una sombra, " +
        "que es precisamente el supuesto que rompe la invariancia de Census. Es un límite honesto " +
        "del método: Census resiste cambios monótonos globales de intensidad, no cualquier cambio " +
        "de iluminación físicamente realista."
      ),
      heading("5.4 Manejo de bordes (padding)", HeadingLevel.HEADING_2),
      para(
        "Se usan dos políticas de borde distintas a propósito. Para el soporte espacial de la " +
        "ventana (vecindad de correlación) se usa relleno por reflexión (BORDER_REFLECT101), " +
        "válido porque solo extiende la apariencia local de la imagen. Para el eje de búsqueda de " +
        "disparidad, en cambio, NO se rellena: un píxel a menos de max_disparity del borde " +
        "izquierdo pediría un punto de la cámara derecha en una columna que no existe, y rellenarla " +
        "fabricaría una correspondencia falsa. En vez de eso esa franja se marca inválida — es la " +
        "misma \"banda ciega\" que se ve en el borde izquierdo de cualquier mapa de disparidad de " +
        "OpenCV (StereoBM/SGBM). Con max_disparity=64 sobre 640 px de ancho, esa banda es " +
        "exactamente el 10% del área, y coincide con el 90% de píxeles válidos reportado en las " +
        "cuatro condiciones (Tabla 4.5) — confirma que el manejo de bordes se comporta como se " +
        "documenta."
      ),
      heading("5.5 Tiempos: Census también es más rápido", HeadingLevel.HEADING_2),
      para(
        "La Tabla 4.6 muestra que, además de ser más robusto, Census+Hamming es aproximadamente " +
        "10 veces más rápido que SAD en esta implementación (≈90 ms vs ≈937 ms). La razón es " +
        "estructural: SAD tiene que recorrer las 49 posiciones de la ventana y acumular una resta " +
        "para CADA una de las 65 disparidades candidatas de CADA píxel. Census paga el costo de " +
        "recorrer la ventana una sola vez por píxel al construir el código de 48 bits, y luego " +
        "cada comparación de disparidad se reduce a una operación XOR más un conteo de bits " +
        "(popcount) — una instrucción muy barata para el procesador. Esta eficiencia, sumada a la " +
        "robustez ante iluminación, es la otra mitad de la razón histórica por la que los métodos " +
        "basados en census (y SGM sobre census) dominaron la correspondencia estéreo en tiempo " +
        "real antes de las redes de disparidad end-to-end."
      ),

      // 6. Conclusiones
      heading("6. Conclusiones", HeadingLevel.HEADING_1),
      bullet("Census+Hamming se degrada mucho menos que SAD ante una diferencia de iluminación entre cámaras: MAD de 1.75–13.88 px según la condición, frente a 21.77–24.89 px de SAD — hasta 14 veces menos error en el mejor caso (gamma sintético)."),
      bullet("La ventaja de Census es más fuerte contra cambios puramente de ganancia/exposición (gamma sintético, im1E) que contra un cambio real de iluminación de escena (im1L), porque este último no es un cambio globalmente monótono — puede invertir el orden de intensidades localmente donde cambian las sombras."),
      bullet("Census+Hamming también es ~10× más rápido que SAD en esta implementación, gracias a que reduce la comparación de ventanas a una operación de popcount sobre bits, en vez de acumular restas sobre toda la ventana para cada disparidad candidata."),
      bullet("El manejo de bordes requiere dos políticas distintas: rellenar (reflejar) para el soporte de la ventana, pero nunca para el eje de disparidad, donde inventar candidatos fabricaría correspondencias falsas — de ahí la banda ciega característica del borde izquierdo."),
      bullet("Este es el núcleo de emparejamiento (matching cost), sin regularización global (SGM/optimización de suavidad) ni verificación de consistencia izquierda-derecha; por eso ambos mapas se ven ruidosos incluso en la condición igualada. Es el comportamiento esperado de un matching local puro, y es precisamente la limitación que SGM resuelve agregando un término de suavidad sobre este mismo costo por píxel."),

      // 7. Reproducibilidad
      heading("7. Reproducibilidad", HeadingLevel.HEADING_1),
      para(
        "El código completo (C++17 + OpenCV, CMake, listo para abrir en Visual Studio con " +
        "\"Open Folder\"), las imágenes de entrada, los resultados (mapas de disparidad, " +
        "robustez.csv, timings.csv) y este reporte se entregan en el repositorio del proyecto: " +
        "stereo-adas/. El reporte se regenera desde results/ con scripts/report/build_report.js " +
        "(npm install && node build_report.js) — no es un documento aislado."
      ),
      para(
        "Para reproducir en Windows: en Visual Studio 2022, File → Open → Folder sobre la carpeta " +
        "raíz del repo, elegir el preset x64-release, seleccionar stereo_adas.exe como elemento de " +
        "inicio y presionar Ctrl+F5. Todos los parámetros están documentados como constantes con " +
        "nombre en include/stereo_matching.hpp y al inicio de main.cpp."
      ),
    ],
  }],
});

Packer.toBuffer(doc).then(buf => {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, buf);
  console.log("OK ->", OUT, buf.length, "bytes");
});
