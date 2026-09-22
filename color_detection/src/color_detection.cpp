// color_detection.cpp
// Implementación de los dos detectores de color (CIELAB y HSV), limpieza
// morfológica compartida, recoloreo de visualización y medición de tiempos.
#include "color_detection.hpp"
#include <cmath>
#include <algorithm>
#include <chrono>

namespace colordet {

cv::Mat buildMaskLab(const cv::Mat& bgr, TargetColor color, const LabParams& p) {
    // 1) Convertir a CIELAB y separar canales.
    cv::Mat lab;
    cv::cvtColor(bgr, lab, cv::COLOR_BGR2Lab);
    std::vector<cv::Mat> ch;
    cv::split(lab, ch); // ch[0]=L, ch[1]=a*, ch[2]=b*

    // 2) Recentrar a*/b* en 0 
    cv::Mat L, aSigned, bSigned;
    ch[0].convertTo(L, CV_32F);
    ch[1].convertTo(aSigned, CV_32F, 1.0, -128.0);
    ch[2].convertTo(bSigned, CV_32F, 1.0, -128.0);

    // Croma 
    cv::Mat chroma;
    cv::magnitude(aSigned, bSigned, chroma); // sqrt(a'^2 + b'^2)

    cv::Mat mask = cv::Mat::zeros(bgr.size(), CV_8U);

    for (int y = 0; y < bgr.rows; ++y) {
        const float* la = aSigned.ptr<float>(y);
        const float* lb = bSigned.ptr<float>(y);
        const float* ll = L.ptr<float>(y);
        const float* lc = chroma.ptr<float>(y);
        uchar* mrow = mask.ptr<uchar>(y);
        for (int x = 0; x < bgr.cols; ++x) {
            // Descarta negros/blancos puros 
            bool lumaOk   = (ll[x] >= p.l_min) && (ll[x] <= p.l_max);
            bool chromaOk = (lc[x] >= p.chroma_min);
            bool colorOk  = false;
            if (color == TargetColor::RED) {
                // Rojo: a* positivo y que domine sobre |b*|
                colorOk = (la[x] > p.a_thresh) && (la[x] >= std::fabs(lb[x]) * 0.6f);
            } else {
                // Amarillo: mismo criterio mirando b* en vez de a*.
                colorOk = (lb[x] > p.b_thresh) && (lb[x] >= std::fabs(la[x]) * 0.6f);
            }
            if (lumaOk && chromaOk && colorOk) mrow[x] = 255;
        }
    }
    return mask;
}

cv::Mat buildMaskHsv(const cv::Mat& bgr, TargetColor color, const HsvParams& p) {
    cv::Mat hsv;
    cv::cvtColor(bgr, hsv, cv::COLOR_BGR2HSV);

    cv::Mat mask;
    if (color == TargetColor::RED) {
        // El rojo cruza el 0°/360° del círculo de matiz
        cv::Mat m1, m2;
        cv::inRange(hsv, cv::Scalar(p.hue_red_low1, p.sat_min, p.val_min),
                         cv::Scalar(p.hue_red_high1, 255, 255), m1);
        cv::inRange(hsv, cv::Scalar(p.hue_red_low2, p.sat_min, p.val_min),
                         cv::Scalar(p.hue_red_high2, 255, 255), m2);
        cv::bitwise_or(m1, m2, mask);
    } else {
        cv::inRange(hsv, cv::Scalar(p.hue_yellow_low, p.sat_min, p.val_min),
                         cv::Scalar(p.hue_yellow_high, 255, 255), mask);
    }
    return mask;
}

cv::Mat cleanMask(const cv::Mat& mask, int kernelSize) {
    // Apertura: quita motas pequeñas de ruido. Cierre: rellena huecos chicos.
    cv::Mat kernel = cv::getStructuringElement(cv::MORPH_ELLIPSE,
                        cv::Size(kernelSize, kernelSize));
    cv::Mat opened, closed;
    cv::morphologyEx(mask, opened, cv::MORPH_OPEN, kernel);
    cv::morphologyEx(opened, closed, cv::MORPH_CLOSE, kernel);
    return closed;
}

cv::Mat recolorRegion(const cv::Mat& bgr, const cv::Mat& maskClean, int newHue) {
    // Solo se toca el canal H (matiz) dentro de la máscara
    cv::Mat hsv;
    cv::cvtColor(bgr, hsv, cv::COLOR_BGR2HSV);
    std::vector<cv::Mat> ch;
    cv::split(hsv, ch);
    ch[0].setTo(newHue, maskClean);
    cv::Mat merged, outBgr;
    cv::merge(ch, merged);
    cv::cvtColor(merged, outBgr, cv::COLOR_HSV2BGR);
    return outBgr;
}

DetectionResult runPipeline(const cv::Mat& bgr, TargetColor color,
                             const std::string& method,
                             const LabParams& labParams,
                             const HsvParams& hsvParams,
                             int newHue) {
    DetectionResult r;
    if (method == "lab") {
        r.mask_raw = buildMaskLab(bgr, color, labParams);
    } else if (method == "hsv") {
        r.mask_raw = buildMaskHsv(bgr, color, hsvParams);
    } else {
        CV_Error(cv::Error::StsBadArg, "method debe ser 'lab' o 'hsv'");
    }
    r.mask_clean = cleanMask(r.mask_raw, 5);
    r.recolored  = recolorRegion(bgr, r.mask_clean, newHue);
    return r;
}

TimingResult benchmarkPipeline(const cv::Mat& bgr, TargetColor color,
                                const std::string& method,
                                const LabParams& labParams,
                                const HsvParams& hsvParams,
                                int iterations, int warmup) {
    using clock = std::chrono::steady_clock;
    std::vector<double> samples;
    samples.reserve(iterations);

    // Se mide SOLO máscara + limpieza
    for (int i = 0; i < warmup + iterations; ++i) {
        auto t0 = clock::now();
        cv::Mat mask = (method == "lab") ? buildMaskLab(bgr, color, labParams)
                                          : buildMaskHsv(bgr, color, hsvParams);
        cv::Mat clean = cleanMask(mask, 5);
        auto t1 = clock::now();
        if (i < warmup) continue; // descarta corridas de calentamiento
        double ms = std::chrono::duration<double, std::milli>(t1 - t0).count();
        samples.push_back(ms);
    }

    TimingResult t;
    t.iterations = static_cast<int>(samples.size());
    if (!samples.empty()) {
        t.min_ms = *std::min_element(samples.begin(), samples.end());
        t.max_ms = *std::max_element(samples.begin(), samples.end());
        double sum = 0.0;
        for (double v : samples) sum += v;
        t.avg_ms = sum / samples.size();
    }
    return t;
}

} // namespace colordet
