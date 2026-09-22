// stereo_matching.hpp
// -----------------------------------------------------------------------------
// Núcleo de un algoritmo de correspondencia estéreo, comparando dos formas de
// emparejar ventanas entre la imagen izquierda y la derecha:
//
//   1) Correlación directa de intensidad (SAD / SSD)
//   2) Transformada Census + distancia de Hamming
//
// Objetivo académico: evidenciar cuál de los dos se degrada menos cuando hay
// una diferencia de iluminación/ganancia entre las dos cámaras del par
// estéreo — el reto real de un sistema de reconstrucción 3D para ADAS.
// -----------------------------------------------------------------------------
#pragma once

#include <opencv2/opencv.hpp>
#include <vector>
#include <cstdint>
#include <string>

namespace stereom {

// Método de emparejamiento de ventanas.
enum class Method { SAD, SSD, CENSUS };

// Parámetros del algoritmo. Los dos métodos usan la MISMA geometría de
// ventana y el MISMO rango de disparidad, para que la comparación sea justa
// (igual que se hizo con la limpieza morfológica en el proyecto de color).
struct StereoParams {
    int window_radius = 3;    // ventana de (2r+1)x(2r+1); r=3 -> 7x7 = 49 píxeles
    int max_disparity = 64;   // rango de búsqueda: d en [0, max_disparity]
};

// Métrica cuantitativa: cuánto cambia el mapa de disparidad de un método
// cuando se desbalancea la iluminación, comparado contra su propio mapa bajo
// iluminación igualada (no requiere disparidad de referencia/ground truth).
struct RobustnessResult {
    double mean_abs_diff = 0.0; // MAD en píxeles de disparidad, sobre píxeles válidos en ambos mapas
    double valid_pct_baseline = 0.0;   // % de píxeles válidos bajo luz igualada
    double valid_pct_condition = 0.0;  // % de píxeles válidos bajo la condición evaluada
};

// Tiempo de cómputo (promedio de varias repeticiones, ver benchmarkMethod).
struct TimingResult {
    double avg_ms = 0.0;
    double min_ms = 0.0;
    double max_ms = 0.0;
    int    iterations = 0;
};

// Aplica una corrección gamma para SIMULAR una diferencia de ganancia/
// iluminación entre cámaras: out = 255 * (in/255) ^ (1/gamma).
// gamma > 1  -> imagen más clara (simula mayor ganancia/exposición)
// gamma < 1  -> imagen más oscura
cv::Mat applyGamma(const cv::Mat& bgrOrGray, double gamma);

// Calcula el mapa de disparidad con correlación directa de intensidad
// (SAD si squared=false, SSD si squared=true). Ambas imágenes deben ser
// grises (CV_8U) y del mismo tamaño. Devuelve disparidad en CV_32F; los
// píxeles sin candidato válido (ver nota de bordes en el .cpp) quedan en -1.
cv::Mat matchIntensityCorrelation(const cv::Mat& left, const cv::Mat& right,
                                   const StereoParams& p, bool squared /* SSD */);

// Codifica cada píxel como una cadena de bits (census) comparando su
// intensidad contra la de cada vecino en una ventana (2r+1)x(2r+1) —
// bit = 1 si vecino < centro, 0 en caso contrario. Con r=3 caben 48 bits
// en un uint64_t. Se ignora el propio centro (no se compara consigo mismo).
std::vector<uint64_t> computeCensus(const cv::Mat& gray, int radius);

// Calcula el mapa de disparidad emparejando por distancia de Hamming entre
// los códigos census de la ventana izquierda y derecha.
cv::Mat matchCensus(const cv::Mat& left, const cv::Mat& right, const StereoParams& p);

// Normaliza un mapa de disparidad (CV_32F, -1 = inválido) a una imagen a
// color (colormap) para visualización, con los inválidos en negro.
cv::Mat visualizeDisparity(const cv::Mat& disparity, int max_disparity);

// Compara un mapa de disparidad "bajo condición" contra el mapa de
// referencia obtenido con iluminación igualada, sobre los píxeles válidos
// en ambos. Un MAD bajo = el método cambió poco su salida al desbalancear
// la luz = más robusto.
RobustnessResult compareToBaseline(const cv::Mat& baselineDisp, const cv::Mat& conditionDisp);

// Mide el tiempo de cómputo del método (sin E/S de disco), repitiendo
// `iterations` veces tras `warmup` corridas de calentamiento.
TimingResult benchmarkMethod(const cv::Mat& left, const cv::Mat& right,
                              const StereoParams& p, Method method,
                              int iterations = 8, int warmup = 2);

} // namespace stereom
