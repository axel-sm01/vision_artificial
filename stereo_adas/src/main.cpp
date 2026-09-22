// main.cpp
// -----------------------------------------------------------------------------
// Experimento: correspondencia estéreo — SAD vs Census+Hamming, bajo
// iluminación igualada y desbalanceada entre cámara izquierda y derecha.
//
// Condiciones evaluadas:
//   1) igualada           -> im0 vs im1            (referencia/baseline)
//   2) gamma_sintetico     -> im0 vs gamma(im1)      (desbalance simulado, pedido por la tarea)
//   3) real_exposicion     -> im0 vs im1E            (variante real de Middlebury: exposición)
//   4) real_iluminacion    -> im0 vs im1L            (variante real de Middlebury: luz)
//
// Uso: ./stereo_adas <carpeta_datos> <carpeta_resultados>
// Espera en <carpeta_datos>: im0.png, im1.png, im1E.png, im1L.png
// -----------------------------------------------------------------------------
#include "stereo_matching.hpp"
#include <opencv2/opencv.hpp>
#include <iostream>
#include <fstream>
#include <filesystem>
#include <vector>
#include <string>

namespace fs = std::filesystem;
using namespace stereom;

namespace {

constexpr int kProcessWidth = 640;  // ancho de trabajo (ver justificación en README/reporte)
constexpr int kMaxDisparity = 64;   // rango de búsqueda (no hay calib.txt -> valor documentado como supuesto)
constexpr int kWindowRadius = 3;    // ventana 7x7
constexpr double kGamma      = 1.8; // simulación de diferencia de ganancia/iluminación

cv::Mat resizeKeepAspect(const cv::Mat& src, int width) {
    double scale = static_cast<double>(width) / src.cols;
    cv::Mat dst;
    cv::resize(src, dst, cv::Size(width, static_cast<int>(src.rows * scale)), 0, 0, cv::INTER_AREA);
    return dst;
}

cv::Mat labelTile(const cv::Mat& img, const std::string& text) {
    cv::Mat tile = img.clone();
    if (tile.channels() == 1) cv::cvtColor(tile, tile, cv::COLOR_GRAY2BGR);
    int barH = 30;
    cv::Mat withBar(tile.rows + barH, tile.cols, tile.type(), cv::Scalar(20, 20, 20));
    tile.copyTo(withBar(cv::Rect(0, barH, tile.cols, tile.rows)));
    cv::putText(withBar, text, cv::Point(8, barH - 9), cv::FONT_HERSHEY_SIMPLEX,
                0.55, cv::Scalar(255, 255, 255), 1, cv::LINE_AA);
    return withBar;
}

struct ConditionResult {
    std::string nombre;
    cv::Mat rightGrayForView; // para el collage
    cv::Mat dispSad;
    cv::Mat dispCensus;
};

} // namespace

int main(int argc, char** argv) {
    std::string dataDir = (argc > 1) ? argv[1] : "data";
    std::string outDir  = (argc > 2) ? argv[2] : "results";
    fs::create_directories(outDir);

    // --- Carga y preparación ---
    cv::Mat im0 = cv::imread(dataDir + "/im0.png");
    cv::Mat im1 = cv::imread(dataDir + "/im1.png");
    cv::Mat im1E = cv::imread(dataDir + "/im1E.png");
    cv::Mat im1L = cv::imread(dataDir + "/im1L.png");
    if (im0.empty() || im1.empty() || im1E.empty() || im1L.empty()) {
        std::cerr << "[ERROR] No se pudieron leer im0/im1/im1E/im1L en " << dataDir << "\n";
        return 1;
    }

    // Downscale: el par viene a resolución completa de Middlebury (~2872x1984);
    // se reduce a un ancho de trabajo fijo para que el emparejamiento por
    // fuerza bruta corra en segundos y no en minutos, y para que el rango
    // de disparidad (kMaxDisparity) sea consistente entre corridas.
    cv::Mat im0r  = resizeKeepAspect(im0,  kProcessWidth);
    cv::Mat im1r  = resizeKeepAspect(im1,  kProcessWidth);
    cv::Mat im1Er = resizeKeepAspect(im1E, kProcessWidth);
    cv::Mat im1Lr = resizeKeepAspect(im1L, kProcessWidth);

    cv::Mat leftGray;
    cv::cvtColor(im0r, leftGray, cv::COLOR_BGR2GRAY);

    cv::Mat rightGray_igualada, rightGray_E, rightGray_L;
    cv::cvtColor(im1r,  rightGray_igualada, cv::COLOR_BGR2GRAY);
    cv::cvtColor(im1Er, rightGray_E,        cv::COLOR_BGR2GRAY);
    cv::cvtColor(im1Lr, rightGray_L,        cv::COLOR_BGR2GRAY);

    // Desbalance SIMULADO: se aplica gamma únicamente a la cámara derecha,
    // tal como pide la tarea ("simular una diferencia de iluminación... por
    // ejemplo aplicando gamma... solo a una de ellas").
    cv::Mat rightGray_gamma = applyGamma(rightGray_igualada, kGamma);

    StereoParams params;
    params.window_radius = kWindowRadius;
    params.max_disparity = kMaxDisparity;

    struct CondSpec { std::string nombre; cv::Mat right; std::string desc; };
    std::vector<CondSpec> specs = {
        {"igualada",        rightGray_igualada, "im0 vs im1 (referencia)"},
        {"gamma_sintetico", rightGray_gamma,    "im0 vs gamma(im1), g=" + std::to_string(kGamma)},
        {"real_exposicion", rightGray_E,        "im0 vs im1E (Middlebury, exposicion real)"},
        {"real_iluminacion",rightGray_L,        "im0 vs im1L (Middlebury, iluminacion real)"},
    };

    cv::Mat dispSadBaseline, dispCensusBaseline;
    std::vector<cv::Mat> filas;

    std::ofstream robCsv(outDir + "/robustez.csv");
    robCsv << "condicion,metodo,mad_disparidad_px,validos_pct\n";

    for (const auto& spec : specs) {
        fs::create_directories(outDir + "/" + spec.nombre);

        cv::Mat dSad    = matchIntensityCorrelation(leftGray, spec.right, params, /*squared=*/false);
        cv::Mat dCensus = matchCensus(leftGray, spec.right, params);

        cv::imwrite(outDir + "/" + spec.nombre + "/disp_sad.png",    visualizeDisparity(dSad, kMaxDisparity));
        cv::imwrite(outDir + "/" + spec.nombre + "/disp_census.png", visualizeDisparity(dCensus, kMaxDisparity));

        if (spec.nombre == "igualada") {
            dispSadBaseline = dSad;
            dispCensusBaseline = dCensus;
            robCsv << "igualada,SAD,0,"    << (100.0 * cv::countNonZero(dSad>=0)    / (dSad.rows*dSad.cols))    << "\n";
            robCsv << "igualada,CENSUS,0," << (100.0 * cv::countNonZero(dCensus>=0) / (dCensus.rows*dCensus.cols)) << "\n";
        } else {
            RobustnessResult rSad    = compareToBaseline(dispSadBaseline, dSad);
            RobustnessResult rCensus = compareToBaseline(dispCensusBaseline, dCensus);
            robCsv << spec.nombre << ",SAD,"    << rSad.mean_abs_diff    << "," << rSad.valid_pct_condition    << "\n";
            robCsv << spec.nombre << ",CENSUS," << rCensus.mean_abs_diff << "," << rCensus.valid_pct_condition << "\n";
            std::cout << "== " << spec.nombre << " (" << spec.desc << ") ==\n";
            std::cout << "  SAD    -> MAD=" << rSad.mean_abs_diff    << " px, validos=" << rSad.valid_pct_condition    << "%\n";
            std::cout << "  CENSUS -> MAD=" << rCensus.mean_abs_diff << " px, validos=" << rCensus.valid_pct_condition << "%\n";
        }

        // Collage: izquierda | derecha (condición) | disparidad SAD | disparidad Census
        cv::Mat leftBgr; cv::cvtColor(leftGray, leftBgr, cv::COLOR_GRAY2BGR);
        cv::Mat rightBgr; cv::cvtColor(spec.right, rightBgr, cv::COLOR_GRAY2BGR);
        std::vector<cv::Mat> tiles = {
            labelTile(leftBgr,  "Izquierda (im0)"),
            labelTile(rightBgr, "Derecha - " + spec.nombre),
            labelTile(visualizeDisparity(dSad, kMaxDisparity),    "Disparidad SAD"),
            labelTile(visualizeDisparity(dCensus, kMaxDisparity), "Disparidad Census+Hamming"),
        };
        cv::Mat row; cv::hconcat(tiles, row);
        cv::imwrite(outDir + "/" + spec.nombre + "/comparacion.png", row);
        filas.push_back(row);
    }
    robCsv.close();

    cv::Mat grid; cv::vconcat(filas, grid);
    cv::imwrite(outDir + "/comparativa_general.png", grid);

    // --- Tiempos (sobre la condición "igualada", 8 repeticiones + 2 de calentamiento) ---
    TimingResult tSad    = benchmarkMethod(leftGray, rightGray_igualada, params, Method::SAD);
    TimingResult tCensus = benchmarkMethod(leftGray, rightGray_igualada, params, Method::CENSUS);

    std::ofstream timeCsv(outDir + "/timings.csv");
    timeCsv << "metodo,avg_ms,min_ms,max_ms,iteraciones\n";
    timeCsv << "SAD,"    << tSad.avg_ms    << "," << tSad.min_ms    << "," << tSad.max_ms    << "," << tSad.iterations    << "\n";
    timeCsv << "CENSUS," << tCensus.avg_ms << "," << tCensus.min_ms << "," << tCensus.max_ms << "," << tCensus.iterations << "\n";
    timeCsv.close();

    std::cout << "\nTiempos -> SAD: " << tSad.avg_ms << " ms | CENSUS: " << tCensus.avg_ms << " ms\n";
    std::cout << "Resultados guardados en: " << outDir << "\n";
    return 0;
}
