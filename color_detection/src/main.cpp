// main.cpp
#include "color_detection.hpp"
#include <opencv2/opencv.hpp>
#include <iostream>
#include <fstream>
#include <filesystem>
#include <vector>
#include <string>

namespace fs = std::filesystem;
using namespace colordet;

namespace {

constexpr int kDisplayWidth = 480; // ancho estándar

cv::Mat resizeKeepAspect(const cv::Mat& src, int width) {
    double scale = static_cast<double>(width) / src.cols;
    cv::Mat dst;
    cv::resize(src, dst, cv::Size(width, static_cast<int>(src.rows * scale)));
    return dst;
}

cv::Mat labelTile(const cv::Mat& img, const std::string& text) {
    cv::Mat tile = img.clone();
    if (tile.channels() == 1) cv::cvtColor(tile, tile, cv::COLOR_GRAY2BGR);
    int barH = 34;
    cv::Mat withBar(tile.rows + barH, tile.cols, tile.type(), cv::Scalar(20, 20, 20));
    tile.copyTo(withBar(cv::Rect(0, barH, tile.cols, tile.rows)));
    cv::putText(withBar, text, cv::Point(8, barH - 10), cv::FONT_HERSHEY_SIMPLEX,
                0.6, cv::Scalar(255, 255, 255), 1, cv::LINE_AA);
    return withBar;
}

// Fila del collage: original | máscara CIELAB | recolor CIELAB | máscara HSV | recolor HSV
cv::Mat buildComparisonRow(const cv::Mat& original,
                            const DetectionResult& lab,
                            const DetectionResult& hsv,
                            const std::string& condicion) {
    cv::Mat o  = resizeKeepAspect(original, kDisplayWidth);
    cv::Mat ml = resizeKeepAspect(lab.mask_clean, kDisplayWidth);
    cv::Mat rl = resizeKeepAspect(lab.recolored, kDisplayWidth);
    cv::Mat mh = resizeKeepAspect(hsv.mask_clean, kDisplayWidth);
    cv::Mat rh = resizeKeepAspect(hsv.recolored, kDisplayWidth);

    std::vector<cv::Mat> tiles = {
        labelTile(o,  "Original - " + condicion),
        labelTile(ml, "Mascara CIELAB (a*)"),
        labelTile(rl, "Recoloreado CIELAB"),
        labelTile(mh, "Mascara HSV (Hue)"),
        labelTile(rh, "Recoloreado HSV")
    };
    cv::Mat row;
    cv::hconcat(tiles, row);
    return row;
}

} // namespace

int main(int argc, char** argv) {
    std::string dataDir = (argc > 1) ? argv[1] : "data";
    std::string outDir  = (argc > 2) ? argv[2] : "results";

    struct Cond { std::string nombre; std::string archivo; };
    std::vector<Cond> condiciones = {
        {"dia", "dia.jpg"},
        {"atardecer", "atardecer.jpg"},
        {"noche", "noche.jpg"}
    };

    fs::create_directories(outDir);

    // Tiempos de detección (máscara + limpieza) por condición y método.
    std::ofstream timingCsv(outDir + "/timings.csv");
    timingCsv << "condicion,metodo,avg_ms,min_ms,max_ms,iteraciones\n";

    LabParams labParams;   // valores por defecto documentados en el header
    HsvParams hsvParams;   // valores por defecto documentados en el header

    std::vector<cv::Mat> filas; // una fila de collage por condición

    for (const auto& c : condiciones) {
        std::string path = dataDir + "/" + c.archivo;
        cv::Mat img = cv::imread(path);
        if (img.empty()) {
            std::cerr << "[ERROR] No se pudo leer: " << path << std::endl;
            continue;
        }
        // Normalizamos tamaño
        cv::Mat resized = resizeKeepAspect(img, 900);

        // --- Evidencia visual
        DetectionResult lab = runPipeline(resized, TargetColor::RED, "lab", labParams, hsvParams, 60);
        DetectionResult hsv = runPipeline(resized, TargetColor::RED, "hsv", labParams, hsvParams, 60);

        fs::create_directories(outDir + "/" + c.nombre);
        cv::imwrite(outDir + "/" + c.nombre + "/mask_lab.png", lab.mask_clean);
        cv::imwrite(outDir + "/" + c.nombre + "/mask_hsv.png", hsv.mask_clean);
        cv::imwrite(outDir + "/" + c.nombre + "/recolor_lab.png", lab.recolored);
        cv::imwrite(outDir + "/" + c.nombre + "/recolor_hsv.png", hsv.recolored);
        cv::imwrite(outDir + "/" + c.nombre + "/original.png", resized);

        // --- Tiempos 
        TimingResult tLab = benchmarkPipeline(resized, TargetColor::RED, "lab", labParams, hsvParams);
        TimingResult tHsv = benchmarkPipeline(resized, TargetColor::RED, "hsv", labParams, hsvParams);

        timingCsv << c.nombre << ",CIELAB," << tLab.avg_ms << "," << tLab.min_ms << ","
                  << tLab.max_ms << "," << tLab.iterations << "\n";
        timingCsv << c.nombre << ",HSV," << tHsv.avg_ms << "," << tHsv.min_ms << ","
                  << tHsv.max_ms << "," << tHsv.iterations << "\n";

        std::cout << "== " << c.nombre << " ==\n";
        std::cout << "  CIELAB -> " << tLab.avg_ms << " ms (min " << tLab.min_ms
                   << ", max " << tLab.max_ms << ")\n";
        std::cout << "  HSV    -> " << tHsv.avg_ms << " ms (min " << tHsv.min_ms
                   << ", max " << tHsv.max_ms << ")\n";

        cv::Mat row = buildComparisonRow(resized, lab, hsv, c.nombre);
        cv::imwrite(outDir + "/" + c.nombre + "/comparacion.png", row);
        filas.push_back(row);
    }

    timingCsv.close();

    if (!filas.empty()) {
        cv::Mat grid;
        cv::vconcat(filas, grid);
        cv::imwrite(outDir + "/comparativa_general.png", grid);
        std::cout << "\nCollage comparativo guardado en: "
                  << outDir << "/comparativa_general.png\n";
    }

    std::cout << "Tiempos guardados en: " << outDir << "/timings.csv\n";
    return 0;
}
