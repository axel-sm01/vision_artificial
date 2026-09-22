// main.cpp
// -----------------------------------------------------------------------------
// Perfil 3 — Reconstrucción 3D para ADAS
// Líneas de carril con Hough y keypoints Harris para correspondencia estéreo
//
// Corre dos experimentos bajo las mismas 3 condiciones de iluminación
// (buena, atardecer, noche) más un desbalance de ganancia entre cámaras:
//
//   1) Hough:  detecta líneas de carril sobre la vista izquierda.
//   2) Harris: detecta esquinas en ambas vistas del par estéreo y mide su
//              repetibilidad izquierda/derecha.
//
// Uso: ./lane_harris_adas <carpeta_datos> <carpeta_resultados>
// Espera en <carpeta_datos>: left.png, right.png (par estéreo rectificado,
// estilo KITTI).
// -----------------------------------------------------------------------------
#include "lane_harris.hpp"
#include <opencv2/opencv.hpp>
#include <iostream>
#include <fstream>
#include <filesystem>
#include <vector>
#include <string>

namespace fs = std::filesystem;
using namespace adas;

namespace {

cv::Mat labelTile(const cv::Mat& img, const std::string& text) {
    cv::Mat tile = img.clone();
    if (tile.channels() == 1) cv::cvtColor(tile, tile, cv::COLOR_GRAY2BGR);
    int barH = 28;
    cv::Mat withBar(tile.rows + barH, tile.cols, tile.type(), cv::Scalar(20, 20, 20));
    tile.copyTo(withBar(cv::Rect(0, barH, tile.cols, tile.rows)));
    cv::putText(withBar, text, cv::Point(8, barH - 8), cv::FONT_HERSHEY_SIMPLEX,
                0.55, cv::Scalar(255, 255, 255), 1, cv::LINE_AA);
    return withBar;
}

cv::Mat hStack(const std::vector<cv::Mat>& imgs, int gap = 6) {
    int h = 0, w = 0;
    for (const auto& im : imgs) { h = std::max(h, im.rows); w += im.cols + gap; }
    cv::Mat canvas(h, w, CV_8UC3, cv::Scalar(15, 15, 15));
    int x = 0;
    for (const auto& im : imgs) {
        cv::Mat im3 = im;
        if (im3.channels() == 1) cv::cvtColor(im3, im3, cv::COLOR_GRAY2BGR);
        im3.copyTo(canvas(cv::Rect(x, 0, im3.cols, im3.rows)));
        x += im3.cols + gap;
    }
    return canvas;
}

cv::Mat vStack(const std::vector<cv::Mat>& imgs, int gap = 6) {
    int w = 0, h = 0;
    for (const auto& im : imgs) { w = std::max(w, im.cols); h += im.rows + gap; }
    cv::Mat canvas(h, w, CV_8UC3, cv::Scalar(15, 15, 15));
    int y = 0;
    for (const auto& im : imgs) {
        cv::Mat im3 = im;
        if (im3.channels() == 1) cv::cvtColor(im3, im3, cv::COLOR_GRAY2BGR);
        im3.copyTo(canvas(cv::Rect(0, y, im3.cols, im3.rows)));
        y += im3.rows + gap;
    }
    return canvas;
}

} // namespace

int main(int argc, char** argv) {
    std::string dataDir = (argc > 1) ? argv[1] : "data";
    std::string outDir  = (argc > 2) ? argv[2] : "results";
    fs::create_directories(outDir);
    fs::create_directories(outDir + "/hough");
    fs::create_directories(outDir + "/harris");

    cv::Mat left  = cv::imread(dataDir + "/left.png");
    cv::Mat right = cv::imread(dataDir + "/right.png");
    if (left.empty() || right.empty()) {
        std::cerr << "[ERROR] No se pudieron leer left.png / right.png en " << dataDir << "\n";
        return 1;
    }
    std::cout << "Par estereo cargado: " << left.cols << "x" << left.rows << "\n";

    std::vector<Illum> condiciones = {Illum::BUENA, Illum::ATARDECER, Illum::NOCHE};

    // ------------------------------------------------------------------
    // 1) Hough — líneas de carril sobre la vista izquierda, 3 condiciones
    // ------------------------------------------------------------------
    LaneHoughParams laneParams;
    std::ofstream houghCsv(outDir + "/hough_resumen.csv");
    houghCsv << "condicion,segmentos_izq,segmentos_der,carril_izq_detectado,carril_der_detectado\n";

    std::vector<cv::Mat> houghRow;
    for (auto c : condiciones) {
        IllumParams ip = paramsForCondition(c);
        cv::Mat imgCond = applyIllumination(left, ip);
        LaneResult lr = detectLanesHough(imgCond, laneParams);

        cv::imwrite(outDir + "/hough/carriles_" + ip.nombre + ".png", lr.overlay);
        cv::imwrite(outDir + "/hough/bordes_" + ip.nombre + ".png", lr.edges);

        houghCsv << ip.nombre << "," << lr.numLeftSegments << "," << lr.numRightSegments << ","
                  << (lr.leftLaneFound ? "si" : "no") << "," << (lr.rightLaneFound ? "si" : "no") << "\n";

        std::cout << "[Hough] " << ip.nombre << ": segmentos_izq=" << lr.numLeftSegments
                   << " segmentos_der=" << lr.numRightSegments
                   << " carril_izq=" << lr.leftLaneFound << " carril_der=" << lr.rightLaneFound << "\n";

        houghRow.push_back(labelTile(lr.overlay, "Hough - " + ip.nombre));
    }
    houghCsv.close();
    cv::imwrite(outDir + "/hough/comparativa_hough.png", vStack(houghRow));

    // ------------------------------------------------------------------
    // 2) Harris — keypoints y repetibilidad estéreo, 3 condiciones +
    //    desbalance de ganancia entre cámaras
    // ------------------------------------------------------------------
    HarrisParams harrisParams;
    std::ofstream repCsv(outDir + "/repetibilidad.csv");
    repCsv << "condicion,keypoints_izq,keypoints_der,matches,repetibilidad_pct\n";

    std::vector<cv::Mat> harrisRows;

    auto runHarrisCond = [&](const std::string& nombre, const cv::Mat& imL, const cv::Mat& imR) {
        HarrisResult hL = detectHarris(imL, harrisParams);
        HarrisResult hR = detectHarris(imR, harrisParams);
        RepeatabilityResult rep = computeRepeatability(hL.keypoints, hR.keypoints);

        cv::imwrite(outDir + "/harris/keypoints_izq_" + nombre + ".png", hL.overlay);
        cv::imwrite(outDir + "/harris/keypoints_der_" + nombre + ".png", hR.overlay);
        cv::imwrite(outDir + "/harris/heatmap_izq_" + nombre + ".png", hL.responseHeat);

        cv::Mat matchesImg = drawStereoMatches(imL, imR, hL.keypoints, hR.keypoints, rep);
        cv::imwrite(outDir + "/harris/matches_" + nombre + ".png", matchesImg);

        repCsv << nombre << "," << rep.numLeft << "," << rep.numRight << "," << rep.numMatched << ","
               << rep.repeatabilityPct << "\n";

        std::cout << "[Harris] " << nombre << ": kL=" << rep.numLeft << " kR=" << rep.numRight
                   << " matches=" << rep.numMatched << " repetibilidad=" << rep.repeatabilityPct << "%\n";

        harrisRows.push_back(labelTile(matchesImg,
            nombre + "  (rep=" + std::to_string(static_cast<int>(rep.repeatabilityPct)) + "%)"));
    };

    // 3 condiciones simétricas: misma iluminación en ambas cámaras (cambia la
    // escena/hora del día, no el hardware).
    for (auto c : condiciones) {
        IllumParams ip = paramsForCondition(c);
        cv::Mat imL = applyIllumination(left, ip);
        cv::Mat imR = applyIllumination(right, ip);
        runHarrisCond(ip.nombre, imL, imR);
    }

    // Condición extra: desbalance de ganancia/brillo ENTRE cámaras (misma
    // escena -- buena luz -- pero la cámara derecha con menor ganancia,
    // como pide la tarea como alternativa de simulación de condición adversa).
    {
        IllumParams buena = paramsForCondition(Illum::BUENA);
        IllumParams nocheParams = paramsForCondition(Illum::NOCHE);
        cv::Mat imL = applyIllumination(left, buena);
        cv::Mat imR = applyIllumination(right, nocheParams); // solo la derecha se degrada
        runHarrisCond("desbalance_camaras", imL, imR);
    }
    repCsv.close();
    cv::imwrite(outDir + "/harris/comparativa_harris.png", vStack(harrisRows));

    std::cout << "\nListo. Resultados en: " << outDir << "\n";
    return 0;
}
