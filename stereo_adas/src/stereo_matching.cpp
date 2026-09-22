// stereo_matching.cpp
#include "stereo_matching.hpp"
#include <chrono>
#include <cmath>
#include <algorithm>
#include <climits>

#if defined(_MSC_VER)
    #include <intrin.h>
#endif

namespace stereom {

namespace {

// Popcount portable: MSVC (Visual Studio) usa el intrínseco __popcnt64;
// GCC/Clang usan __builtin_popcountll; si ninguno aplica, se cuenta a mano.
// Importante tenerlo portable porque este proyecto se compila con MSVC.
inline int popcount64(uint64_t x) {
#if defined(_MSC_VER)
    return static_cast<int>(__popcnt64(x));
#elif defined(__GNUC__) || defined(__clang__)
    return __builtin_popcountll(x);
#else
    int c = 0;
    while (x) { x &= (x - 1); ++c; }
    return c;
#endif
}

} // namespace

cv::Mat applyGamma(const cv::Mat& bgrOrGray, double gamma) {
    cv::Mat f, out;
    bgrOrGray.convertTo(f, CV_32F, 1.0 / 255.0);
    cv::pow(f, 1.0 / gamma, f);
    f.convertTo(out, bgrOrGray.type(), 255.0);
    return out;
}

cv::Mat matchIntensityCorrelation(const cv::Mat& left, const cv::Mat& right,
                                   const StereoParams& p, bool squared) {
    const int r = p.window_radius;
    const int W = left.cols, H = left.rows;

    // Padding SOLO para que la ventana (soporte espacial) quepa cerca de
    // los bordes verticales/horizontales de la imagen -> ver nota de bordes
    // más abajo, esto es distinto del eje de búsqueda de disparidad.
    cv::Mat leftPad, rightPad;
    cv::copyMakeBorder(left,  leftPad,  r, r, r, r, cv::BORDER_REFLECT101);
    cv::copyMakeBorder(right, rightPad, r, r, r, r, cv::BORDER_REFLECT101);

    cv::Mat disp(H, W, CV_32F, cv::Scalar(-1.f));

    for (int y = 0; y < H; ++y) {
        float* drow = disp.ptr<float>(y);
        for (int x = 0; x < W; ++x) {
            // --- Nota de bordes (eje de disparidad, NO se rellena) ---
            // Si x < max_disparity, el candidato d=max_disparity pediría un
            // píxel del lado derecho en una columna x-d < 0: un punto que
            // simplemente no existe en la imagen derecha. Rellenarlo (por
            // ejemplo con replicate) inventaría una correspondencia falsa,
            // así que en vez de eso esa franja se marca inválida. Es
            // exactamente la "banda ciega" del ancho de max_disparity que
            // se ve a la izquierda de cualquier mapa de disparidad clásico
            // (OpenCV StereoBM/SGBM la producen igual).
            if (x < p.max_disparity) { drow[x] = -1.f; continue; }

            long bestCost = -1;
            int bestD = 0;
            for (int d = 0; d <= p.max_disparity; ++d) {
                long cost = 0;
                for (int wy = -r; wy <= r; ++wy) {
                    const uchar* lrow = leftPad.ptr<uchar>(y + r + wy);
                    const uchar* rrow = rightPad.ptr<uchar>(y + r + wy);
                    const int lx = x + r;
                    const int rx = (x - d) + r;
                    for (int wx = -r; wx <= r; ++wx) {
                        int diff = static_cast<int>(lrow[lx + wx]) - static_cast<int>(rrow[rx + wx]);
                        cost += squared ? static_cast<long>(diff) * diff : std::abs(diff);
                    }
                }
                if (bestCost < 0 || cost < bestCost) { bestCost = cost; bestD = d; }
            }
            drow[x] = static_cast<float>(bestD);
        }
    }
    return disp;
}

std::vector<uint64_t> computeCensus(const cv::Mat& gray, int radius) {
    const int W = gray.cols, H = gray.rows;
    cv::Mat padded;
    // Mismo criterio de padding que en la correlación: replicate/reflect
    // solo para que la ventana quepa, nunca para inventar disparidad.
    cv::copyMakeBorder(gray, padded, radius, radius, radius, radius, cv::BORDER_REFLECT101);

    std::vector<uint64_t> out(static_cast<size_t>(W) * H, 0);

    for (int y = 0; y < H; ++y) {
        for (int x = 0; x < W; ++x) {
            const int center = padded.at<uchar>(y + radius, x + radius);
            uint64_t code = 0;
            int bit = 0;
            for (int dy = -radius; dy <= radius; ++dy) {
                const uchar* prow = padded.ptr<uchar>(y + radius + dy);
                for (int dx = -radius; dx <= radius; ++dx) {
                    if (dy == 0 && dx == 0) continue; // el centro no se compara consigo mismo
                    int neighbor = prow[x + radius + dx];
                    // 1 si el vecino es MÁS OSCURO que el centro, 0 si no.
                    // Esta comparación de orden (< o >=) es lo que hace a
                    // census invariante a transformaciones monótonas de
                    // intensidad (gamma, ganancia, brillo): un cambio
                    // monótono no invierte el orden relativo entre un
                    // píxel y su vecino, así que el bit no cambia.
                    code |= (static_cast<uint64_t>(neighbor < center) << bit);
                    ++bit;
                }
            }
            out[static_cast<size_t>(y) * W + x] = code;
        }
    }
    return out;
}

cv::Mat matchCensus(const cv::Mat& left, const cv::Mat& right, const StereoParams& p) {
    const int r = p.window_radius;
    const int W = left.cols, H = left.rows;
    auto censusL = computeCensus(left, r);
    auto censusR = computeCensus(right, r);

    cv::Mat disp(H, W, CV_32F, cv::Scalar(-1.f));

    for (int y = 0; y < H; ++y) {
        float* drow = disp.ptr<float>(y);
        const size_t rowOff = static_cast<size_t>(y) * W;
        for (int x = 0; x < W; ++x) {
            // Misma política de bordes que en matchIntensityCorrelation:
            // franja izquierda de ancho max_disparity queda inválida.
            if (x < p.max_disparity) { drow[x] = -1.f; continue; }

            uint64_t lc = censusL[rowOff + x];
            int bestHam = INT_MAX, bestD = 0;
            for (int d = 0; d <= p.max_disparity; ++d) {
                uint64_t rc = censusR[rowOff + (x - d)];
                int ham = popcount64(lc ^ rc); // distancia de Hamming
                if (ham < bestHam) { bestHam = ham; bestD = d; }
            }
            drow[x] = static_cast<float>(bestD);
        }
    }
    return disp;
}

cv::Mat visualizeDisparity(const cv::Mat& disparity, int max_disparity) {
    cv::Mat validMask = disparity >= 0; // CV_8U, 255 donde es válido
    cv::Mat scaled;
    // Escala [0, max_disparity] -> [1, 255], dejando 0 reservado para "inválido".
    disparity.convertTo(scaled, CV_8U, 254.0 / std::max(1, max_disparity), 1.0);
    scaled.setTo(0, ~validMask);
    cv::Mat color;
    cv::applyColorMap(scaled, color, cv::COLORMAP_JET);
    color.setTo(cv::Scalar(0, 0, 0), ~validMask); // inválidos = negro puro, sin ambigüedad visual
    return color;
}

RobustnessResult compareToBaseline(const cv::Mat& baselineDisp, const cv::Mat& conditionDisp) {
    RobustnessResult r;
    long validBase = 0, validCond = 0, validBoth = 0;
    double sumAbsDiff = 0.0;
    const int H = baselineDisp.rows, W = baselineDisp.cols;
    for (int y = 0; y < H; ++y) {
        const float* b = baselineDisp.ptr<float>(y);
        const float* c = conditionDisp.ptr<float>(y);
        for (int x = 0; x < W; ++x) {
            bool vb = b[x] >= 0.f, vc = c[x] >= 0.f;
            if (vb) ++validBase;
            if (vc) ++validCond;
            if (vb && vc) { ++validBoth; sumAbsDiff += std::fabs(b[x] - c[x]); }
        }
    }
    double total = static_cast<double>(H) * W;
    r.valid_pct_baseline  = 100.0 * validBase / total;
    r.valid_pct_condition = 100.0 * validCond / total;
    r.mean_abs_diff = (validBoth > 0) ? sumAbsDiff / validBoth : 0.0;
    return r;
}

TimingResult benchmarkMethod(const cv::Mat& left, const cv::Mat& right,
                              const StereoParams& p, Method method,
                              int iterations, int warmup) {
    using clock = std::chrono::steady_clock;
    std::vector<double> samples;
    samples.reserve(iterations);

    for (int i = 0; i < warmup + iterations; ++i) {
        auto t0 = clock::now();
        cv::Mat d;
        switch (method) {
            case Method::SAD:    d = matchIntensityCorrelation(left, right, p, false); break;
            case Method::SSD:    d = matchIntensityCorrelation(left, right, p, true);  break;
            case Method::CENSUS: d = matchCensus(left, right, p); break;
        }
        auto t1 = clock::now();
        if (i < warmup) continue;
        samples.push_back(std::chrono::duration<double, std::milli>(t1 - t0).count());
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

} // namespace stereom
