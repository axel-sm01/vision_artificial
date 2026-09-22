// lane_harris.hpp
// -----------------------------------------------------------------------------
// Perfil 3 — Reconstrucción 3D para ADAS
// Líneas de carril con Hough y keypoints Harris para correspondencia estéreo
//
// Dos usos distintos de la geometría en un sistema ADAS:
//   1) Detección de carriles con la Transformada de Hough (para líneas).
//   2) Detección de esquinas de Harris en el par estéreo izq/der, evaluando
//      su repetibilidad como base de la triangulación para estimar profundidad.
//
// Ambos se someten a condiciones adversas de iluminación (buena, atardecer,
// noche) y a un desbalance de ganancia/brillo entre cámaras, para evidenciar
// cómo se degrada cada método.
// -----------------------------------------------------------------------------
#pragma once

#include <opencv2/opencv.hpp>
#include <string>
#include <vector>
#include <utility>

namespace adas {

// ============================================================================
// Simulación de condiciones de iluminación
// ============================================================================

// Tres niveles de iluminación pedidos por la tarea, más un desbalance de
// ganancia entre cámaras (mismo mecanismo, aplicado solo a una vista).
enum class Illum { BUENA, ATARDECER, NOCHE };

struct IllumParams {
    std::string nombre;
    double gamma = 1.0;        // out = 255*(in/255)^(1/gamma); gamma<1 oscurece
    double gain = 1.0;         // ganancia multiplicativa tras la curva gamma
    double noise_sigma = 0.0;  // ruido gaussiano aditivo (aprox. ruido de sensor a ISO alto)
};

// Devuelve los parámetros "de catálogo" para cada condición. Documentados
// aquí (y no mágicos en el main) para que el reporte pueda citarlos.
IllumParams paramsForCondition(Illum c);

// Aplica gamma + ganancia + ruido a una imagen BGR de 8 bits.
cv::Mat applyIllumination(const cv::Mat& bgr, const IllumParams& p);

// ============================================================================
// 1) Detección de líneas de carril — Transformada de Hough
// ============================================================================

struct LaneHoughParams {
    // Región de interés (trapecio), como fracción de ancho/alto de la imagen.
    // Recorta cielo, cofre del auto y el fondo lateral: reduce bordes espurios
    // y limita el costo de Hough a la franja donde puede haber carril.
    double roi_bottom_width = 0.96;
    double roi_top_width    = 0.28;
    double roi_top_y        = 0.58; // altura del techo del trapecio (fracción, 0=arriba)

    // Bordes (Canny) — histeresis 1:3, valor típico y robusto.
    int    canny_low  = 50;
    int    canny_high = 150;

    // Hough probabilística — parametrización (rho, theta).
    double hough_rho          = 1.0;             // resolución en rho (px)
    double hough_theta_deg    = 1.0;              // resolución en theta (grados)
    int    hough_threshold    = 20;                // votos mínimos en el acumulador
    double hough_min_line_len = 20;                // longitud mínima de segmento (px)
    double hough_max_line_gap = 80;                // hueco máximo tolerado (px) — clave para
                                                     // marcas discontinuas (ver README/reporte)

    // Descarta segmentos casi horizontales (ruido/sombras transversales).
    double min_abs_slope = 0.35;
};

struct LaneResult {
    cv::Mat overlay;                 // imagen original + carriles dibujados
    cv::Mat edges;                   // salida de Canny (para la nota de bordes)
    cv::Mat roiMask;                 // máscara del trapecio ROI
    std::vector<cv::Vec4i> rawLines; // todos los segmentos que sobrevivieron el filtro de pendiente
    int numLeftSegments  = 0;
    int numRightSegments = 0;
    bool leftLaneFound  = false;
    bool rightLaneFound = false;
};

LaneResult detectLanesHough(const cv::Mat& bgr, const LaneHoughParams& p);

// ============================================================================
// 2) Keypoints de Harris para estéreo
// ============================================================================

struct HarrisParams {
    int    blockSize     = 2;     // tamaño de vecindad para la matriz de covarianza
    int    ksize         = 3;     // apertura del operador Sobel usado por cornerHarris
    double k             = 0.04;  // constante de sensibilidad de Harris (0.04-0.06 típico)
    double thresholdRatio= 0.02;  // umbral relativo al máximo de respuesta en la imagen
    int    nmsRadius     = 4;     // radio (px) para supresión de no-máximos
};

struct HarrisResult {
    std::vector<cv::Point2f> keypoints;
    cv::Mat responseHeat;  // mapa de respuesta normalizado + colormap (visualización)
    cv::Mat overlay;       // imagen + keypoints dibujados
};

HarrisResult detectHarris(const cv::Mat& bgr, const HarrisParams& p);

// ============================================================================
// Repetibilidad estéreo izquierda/derecha
// ============================================================================

struct RepeatabilityResult {
    int numLeft    = 0;
    int numRight   = 0;
    int numMatched = 0;
    double repeatabilityPct = 0.0; // 100 * numMatched / min(numLeft, numRight)
    std::vector<std::pair<cv::Point2f, cv::Point2f>> matches;
};

// Empareja keypoints izq/der bajo la restricción epipolar de un par ya
// rectificado (misma fila, +/- rowTolerance) y una ventana de disparidad
// [minDisparity, maxDisparity] en x (xL - xR). Asignación voraz (greedy)
// por distancia combinada fila+columna, uno-a-uno.
RepeatabilityResult computeRepeatability(const std::vector<cv::Point2f>& kpL,
                                          const std::vector<cv::Point2f>& kpR,
                                          int rowTolerance = 2,
                                          int minDisparity = 0,
                                          int maxDisparity = 130);

// Collage izquierda | derecha con los keypoints y líneas uniendo los pares
// emparejados (verifica visualmente la repetibilidad calculada).
cv::Mat drawStereoMatches(const cv::Mat& left, const cv::Mat& right,
                           const std::vector<cv::Point2f>& kpL,
                           const std::vector<cv::Point2f>& kpR,
                           const RepeatabilityResult& rep);

} // namespace adas
