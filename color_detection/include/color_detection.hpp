// color_detection.hpp

#pragma once

#include <opencv2/opencv.hpp>
#include <string>

namespace colordet {

// Color objetivo a detectar.
enum class TargetColor { RED, YELLOW };

// Parámetros del detector CIELAB.
struct LabParams {
    int a_thresh = 12;     // desplazamiento mínimo de a* respecto a 128 (rojo)
    int b_thresh = 12;     // desplazamiento mínimo de b* respecto a 128 (amarillo)
    int chroma_min = 18;   // magnitud mínima de croma sqrt(a'^2+b'^2) -> descarta grises/neutros
    int l_min = 20;        // ignora píxeles casi negros (ruido en sombras profundas)
    int l_max = 250;       // ignora píxeles saturados a blanco puro (glare)
};

// Parámetros del detector HSV clásico.
struct HsvParams {
    int hue_red_low1 = 0,  hue_red_high1 = 10;    // rango rojo bajo
    int hue_red_low2 = 170, hue_red_high2 = 179;   // rango rojo alto (wrap-around)
    int hue_yellow_low = 18, hue_yellow_high = 35; // rango amarillo
    int sat_min = 80;    // saturación mínima -> descarta grises
    int val_min = 40;    // valor/brillo mínimo -> descarta negros/sombras
};

// Métrica de desempeño temporal: cuánto tarda el paso de detección
struct TimingResult {
    double avg_ms = 0.0;
    double min_ms = 0.0;
    double max_ms = 0.0;
    int    iterations = 0;
};

// Resultado completo de una corrida de detección (para inspección visual).
struct DetectionResult {
    cv::Mat mask_raw;      // máscara binaria antes de limpieza morfológica
    cv::Mat mask_clean;    // máscara binaria tras apertura+cierre
    cv::Mat recolored;     // imagen original con la región detectada re-coloreada
};

// Construye la máscara binaria (0/255) usando signo+magnitud de a*/b* en CIELAB.
cv::Mat buildMaskLab(const cv::Mat& bgr, TargetColor color, const LabParams& p);

// Construye la máscara binaria (0/255) usando umbral de matiz en HSV.
cv::Mat buildMaskHsv(const cv::Mat& bgr, TargetColor color, const HsvParams& p);

// Limpieza morfológica común (apertura + cierre) para comparar ambos métodos
// bajo las mismas condiciones de post-procesamiento.
cv::Mat cleanMask(const cv::Mat& mask, int kernelSize = 5);

// Re-colorea la región detectada cambiando únicamente el matiz (HSV) y
cv::Mat recolorRegion(const cv::Mat& bgr, const cv::Mat& maskClean, int newHue);

// Ejecuta el pipeline completo (máscara -> limpieza -> recoloreo) para un
DetectionResult runPipeline(const cv::Mat& bgr, TargetColor color,
                             const std::string& method,
                             const LabParams& labParams = LabParams(),
                             const HsvParams& hsvParams = HsvParams(),
                             int newHue = 60 /* verde en OpenCV HSV */);

// Mide el tiempo del paso de detección (máscara + limpieza, SIN recoloreo
TimingResult benchmarkPipeline(const cv::Mat& bgr, TargetColor color,
                                const std::string& method,
                                const LabParams& labParams = LabParams(),
                                const HsvParams& hsvParams = HsvParams(),
                                int iterations = 15, int warmup = 3);

} // namespace colordet
