// lane_harris.cpp
#include "lane_harris.hpp"
#include <algorithm>
#include <cmath>
#include <numeric>
#include <random>

namespace adas {

// ============================================================================
// Iluminación
// ============================================================================

IllumParams paramsForCondition(Illum c) {
    switch (c) {
        case Illum::BUENA:
            return IllumParams{"buena", /*gamma*/1.0, /*gain*/1.0, /*noise*/0.0};
        case Illum::ATARDECER:
            // Atardecer: se oscurece la escena (gamma<1) y baja algo la ganancia;
            // poco ruido adicional (todavía hay luz razonable).
            return IllumParams{"atardecer", 0.62, 0.80, 4.0};
        case Illum::NOCHE:
            // Noche: oscurecimiento fuerte + ganancia baja (subexposición) y
            // ruido alto, simulando ISO elevado de una cámara automotriz real.
            return IllumParams{"noche", 0.35, 0.42, 16.0};
    }
    return IllumParams{"buena", 1.0, 1.0, 0.0};
}

cv::Mat applyIllumination(const cv::Mat& bgr, const IllumParams& p) {
    cv::Mat f;
    bgr.convertTo(f, CV_32F, 1.0 / 255.0);

    // Curva gamma: out = in ^ (1/gamma)
    cv::Mat g;
    cv::pow(f, 1.0 / p.gamma, g);
    g *= p.gain;

    if (p.noise_sigma > 0.0) {
        cv::Mat noise(g.size(), g.type());
        cv::randn(noise, cv::Scalar::all(0.0), cv::Scalar::all(p.noise_sigma / 255.0));
        g += noise;
    }

    cv::Mat out8;
    cv::Mat clipped;
    cv::min(cv::max(g, 0.0), 1.0, clipped);
    clipped.convertTo(out8, CV_8UC3, 255.0);
    return out8;
}

// ============================================================================
// 1) Hough — líneas de carril
// ============================================================================

namespace {

cv::Mat buildRoiMask(const cv::Size& sz, const LaneHoughParams& p) {
    cv::Mat mask = cv::Mat::zeros(sz, CV_8U);
    int w = sz.width, h = sz.height;
    int topY = static_cast<int>(p.roi_top_y * h);

    float bw = static_cast<float>(p.roi_bottom_width) * w;
    float tw = static_cast<float>(p.roi_top_width) * w;
    float cx = w / 2.0f;

    std::vector<cv::Point> poly = {
        cv::Point(static_cast<int>(cx - bw / 2), h - 1),
        cv::Point(static_cast<int>(cx - tw / 2), topY),
        cv::Point(static_cast<int>(cx + tw / 2), topY),
        cv::Point(static_cast<int>(cx + bw / 2), h - 1),
    };
    cv::fillConvexPoly(mask, poly, cv::Scalar(255));
    return mask;
}

// Ajusta una recta x = m*y + b por mínimos cuadrados a partir de los
// extremos de varios segmentos (se usa y como variable independiente porque
// los carriles son casi verticales en la imagen y una recta x=f(y) evita la
// singularidad de pendiente infinita que tendría y=f(x)).
bool fitLineXofY(const std::vector<cv::Point>& pts, double& m, double& b) {
    if (pts.size() < 2) return false;
    double sy = 0, sx = 0, syy = 0, sxy = 0;
    int n = static_cast<int>(pts.size());
    for (const auto& p : pts) {
        sy += p.y; sx += p.x; syy += double(p.y) * p.y; sxy += double(p.x) * p.y;
    }
    double denom = n * syy - sy * sy;
    if (std::abs(denom) < 1e-6) return false;
    m = (n * sxy - sx * sy) / denom;
    b = (sx - m * sy) / n;
    return true;
}

} // namespace

LaneResult detectLanesHough(const cv::Mat& bgr, const LaneHoughParams& p) {
    LaneResult res;

    cv::Mat gray, blurred;
    cv::cvtColor(bgr, gray, cv::COLOR_BGR2GRAY);
    cv::GaussianBlur(gray, blurred, cv::Size(5, 5), 1.2);

    // Bordes: Canny internamente usa Sobel con manejo de borde por defecto
    // (BORDER_REFLECT_101), es decir, refleja la imagen en el borde en vez de
    // rellenar con ceros — evita bordes falsos "de marco" en la primera/última
    // fila y columna (ver nota de bordes en el reporte).
    cv::Mat edges;
    cv::Canny(blurred, edges, p.canny_low, p.canny_high);
    res.edges = edges;

    // ROI: recorta cielo/cofre/laterales para que Hough no vote por bordes
    // que no pueden ser carril (árboles, edificios, el propio vehículo).
    cv::Mat roiMask = buildRoiMask(bgr.size(), p);
    res.roiMask = roiMask;
    cv::Mat maskedEdges;
    cv::bitwise_and(edges, roiMask, maskedEdges);

    // Hough probabilística: cada punto de borde (x,y) vota por todas las
    // rectas rho = x*cos(theta) + y*sin(theta) que pasan por él; una recta
    // real acumula muchos votos aunque la marca de carril esté rota en el
    // espacio-imagen (huecos), porque cada segmento visible sigue votando
    // por la MISMA celda (rho,theta) del acumulador — de ahí su robustez a
    // marcas discontinuas. hough_max_line_gap además permite unir segmentos
    // separados por un hueco en una sola línea de salida.
    std::vector<cv::Vec4i> lines;
    cv::HoughLinesP(maskedEdges, lines, p.hough_rho, p.hough_theta_deg * CV_PI / 180.0,
                     p.hough_threshold, p.hough_min_line_len, p.hough_max_line_gap);

    std::vector<cv::Point> leftPts, rightPts;
    int cx = bgr.cols / 2;
    for (const auto& l : lines) {
        double dx = l[2] - l[0];
        double dy = l[3] - l[1];
        if (std::abs(dx) < 1e-6) continue;
        double slope = dy / dx;
        if (std::abs(slope) < p.min_abs_slope) continue; // casi horizontal -> descartar

        bool isLeftSide = ((l[0] + l[2]) / 2.0) < cx;
        // En coordenadas de imagen (y crece hacia abajo): el carril izquierdo
        // sube hacia el centro con pendiente negativa; el derecho, positiva.
        if (slope < 0 && isLeftSide) {
            leftPts.push_back(cv::Point(l[0], l[1]));
            leftPts.push_back(cv::Point(l[2], l[3]));
            res.numLeftSegments++;
            res.rawLines.push_back(l);
        } else if (slope > 0 && !isLeftSide) {
            rightPts.push_back(cv::Point(l[0], l[1]));
            rightPts.push_back(cv::Point(l[2], l[3]));
            res.numRightSegments++;
            res.rawLines.push_back(l);
        }
    }

    cv::Mat overlay = bgr.clone();
    int h = bgr.rows;
    int yBottom = h - 1;
    int yTop = static_cast<int>(p.roi_top_y * h);

    double m, b;
    if (fitLineXofY(leftPts, m, b)) {
        cv::line(overlay, cv::Point(static_cast<int>(m * yBottom + b), yBottom),
                 cv::Point(static_cast<int>(m * yTop + b), yTop),
                 cv::Scalar(0, 0, 255), 6, cv::LINE_AA); // rojo
        res.leftLaneFound = true;
    }
    if (fitLineXofY(rightPts, m, b)) {
        cv::line(overlay, cv::Point(static_cast<int>(m * yBottom + b), yBottom),
                 cv::Point(static_cast<int>(m * yTop + b), yTop),
                 cv::Scalar(0, 255, 0), 6, cv::LINE_AA); // verde
        res.rightLaneFound = true;
    }
    // Segmentos crudos en amarillo tenue, para ver la evidencia previa al ajuste.
    for (const auto& l : res.rawLines) {
        cv::line(overlay, cv::Point(l[0], l[1]), cv::Point(l[2], l[3]),
                  cv::Scalar(0, 220, 255), 1, cv::LINE_AA);
    }
    // Contorno del ROI, en azul tenue, para referencia.
    std::vector<std::vector<cv::Point>> contours;
    cv::findContours(roiMask.clone(), contours, cv::RETR_EXTERNAL, cv::CHAIN_APPROX_SIMPLE);
    cv::polylines(overlay, contours, true, cv::Scalar(255, 180, 0), 1, cv::LINE_AA);

    res.overlay = overlay;
    return res;
}

// ============================================================================
// 2) Harris — keypoints estéreo
// ============================================================================

HarrisResult detectHarris(const cv::Mat& bgr, const HarrisParams& p) {
    HarrisResult res;
    cv::Mat gray;
    cv::cvtColor(bgr, gray, cv::COLOR_BGR2GRAY);
    cv::Mat grayF;
    gray.convertTo(grayF, CV_32F);

    // cornerHarris: para cada píxel arma la matriz de segundo momento M a
    // partir de las derivadas Sobel en una vecindad blockSize x blockSize y
    // devuelve R = det(M) - k*trace(M)^2. M se calcula con Sobel, que por
    // defecto usa BORDER_REFLECT_101 en los bordes de la imagen: ningún
    // píxel se descarta, pero en el borde mismo la vecindad se completa con
    // un reflejo de la propia imagen en vez de información real -> la
    // respuesta ahí es menos confiable (ver nota de bordes en el reporte).
    cv::Mat response;
    cv::cornerHarris(grayF, response, p.blockSize, p.ksize, p.k, cv::BORDER_DEFAULT);

    double maxResp;
    cv::minMaxLoc(response, nullptr, &maxResp);
    double thresh = p.thresholdRatio * maxResp;

    // Supresión de no-máximos: un píxel sobrevive si es el máximo dentro de
    // su ventana (2*nmsRadius+1) y supera el umbral relativo al máximo global.
    cv::Mat dilated;
    int ksz = 2 * p.nmsRadius + 1;
    cv::dilate(response, dilated, cv::getStructuringElement(cv::MORPH_RECT, cv::Size(ksz, ksz)));

    std::vector<cv::Point2f> pts;
    for (int y = 0; y < response.rows; ++y) {
        const float* rr = response.ptr<float>(y);
        const float* dd = dilated.ptr<float>(y);
        for (int x = 0; x < response.cols; ++x) {
            if (rr[x] > thresh && rr[x] == dd[x]) {
                pts.emplace_back(static_cast<float>(x), static_cast<float>(y));
            }
        }
    }
    res.keypoints = pts;

    cv::Mat normResp, respU8, heat;
    cv::normalize(response, normResp, 0, 255, cv::NORM_MINMAX);
    normResp.convertTo(respU8, CV_8U);
    cv::applyColorMap(respU8, heat, cv::COLORMAP_JET);
    res.responseHeat = heat;

    cv::Mat overlay = bgr.clone();
    for (const auto& pt : pts) {
        cv::circle(overlay, pt, 4, cv::Scalar(0, 0, 255), 1, cv::LINE_AA);
    }
    res.overlay = overlay;
    return res;
}

// ============================================================================
// Repetibilidad
// ============================================================================

RepeatabilityResult computeRepeatability(const std::vector<cv::Point2f>& kpL,
                                          const std::vector<cv::Point2f>& kpR,
                                          int rowTolerance, int minDisparity, int maxDisparity) {
    RepeatabilityResult res;
    res.numLeft = static_cast<int>(kpL.size());
    res.numRight = static_cast<int>(kpR.size());

    struct Cand { double dist; int iL, iR; };
    std::vector<Cand> cands;
    cands.reserve(kpL.size() * 4);

    for (int i = 0; i < static_cast<int>(kpL.size()); ++i) {
        for (int j = 0; j < static_cast<int>(kpR.size()); ++j) {
            double dy = std::abs(kpL[i].y - kpR[j].y);
            if (dy > rowTolerance) continue;
            double disp = kpL[i].x - kpR[j].x; // par rectificado: xL >= xR
            if (disp < minDisparity || disp > maxDisparity) continue;
            double dist = std::hypot(dy, 0.05 * disp); // prioriza filas iguales; disparidad pesa poco
            cands.push_back({dist, i, j});
        }
    }
    std::sort(cands.begin(), cands.end(), [](const Cand& a, const Cand& b) { return a.dist < b.dist; });

    std::vector<char> usedL(kpL.size(), 0), usedR(kpR.size(), 0);
    for (const auto& c : cands) {
        if (usedL[c.iL] || usedR[c.iR]) continue;
        usedL[c.iL] = usedR[c.iR] = 1;
        res.matches.emplace_back(kpL[c.iL], kpR[c.iR]);
    }
    res.numMatched = static_cast<int>(res.matches.size());
    int denom = std::min(res.numLeft, res.numRight);
    res.repeatabilityPct = denom > 0 ? 100.0 * res.numMatched / denom : 0.0;
    return res;
}

cv::Mat drawStereoMatches(const cv::Mat& left, const cv::Mat& right,
                           const std::vector<cv::Point2f>& kpL,
                           const std::vector<cv::Point2f>& kpR,
                           const RepeatabilityResult& rep) {
    int h = std::max(left.rows, right.rows);
    int w = left.cols + right.cols;
    cv::Mat canvas(h, w, CV_8UC3, cv::Scalar(20, 20, 20));
    left.copyTo(canvas(cv::Rect(0, 0, left.cols, left.rows)));
    right.copyTo(canvas(cv::Rect(left.cols, 0, right.cols, right.rows)));

    for (const auto& pt : kpL) cv::circle(canvas, pt, 3, cv::Scalar(0, 140, 255), 1, cv::LINE_AA);
    for (const auto& pt : kpR)
        cv::circle(canvas, cv::Point2f(pt.x + left.cols, pt.y), 3, cv::Scalar(0, 140, 255), 1, cv::LINE_AA);

    for (const auto& m : rep.matches) {
        cv::Point2f pL = m.first;
        cv::Point2f pR(m.second.x + left.cols, m.second.y);
        cv::line(canvas, pL, pR, cv::Scalar(0, 255, 0), 1, cv::LINE_AA);
        cv::circle(canvas, pL, 4, cv::Scalar(0, 255, 0), 2, cv::LINE_AA);
        cv::circle(canvas, pR, 4, cv::Scalar(0, 255, 0), 2, cv::LINE_AA);
    }
    cv::line(canvas, cv::Point(left.cols, 0), cv::Point(left.cols, h), cv::Scalar(255, 255, 255), 1);
    return canvas;
}

} // namespace adas
