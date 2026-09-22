cmake_minimum_required(VERSION 3.16)
project(LaneHarrisADAS CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
    set(CMAKE_BUILD_TYPE Release)
endif()

# ── OpenCV ────────────────────────────────────────────────────────────────
# En Windows (build manual): ajusta esta ruta a la carpeta "build" de tu
# instalación de OpenCV (la que contiene OpenCVConfig.cmake), normalmente
# C:/opencv/build. En Linux con libopencv-dev instalado (apt), find_package
# la encuentra sola y esta línea no hace nada.
if(WIN32)
    set(OpenCV_DIR "C:/opencv/build" CACHE PATH "Ruta al build de OpenCV")
endif()

# Componentes usados: imread/imwrite (imgcodecs), Canny/HoughLinesP/
# cornerHarris/cvtColor/GaussianBlur/colormap (imgproc), tipos base (core).
find_package(OpenCV REQUIRED COMPONENTS core imgproc imgcodecs)

add_executable(lane_harris_adas
    src/main.cpp
    src/lane_harris.cpp
)

target_include_directories(lane_harris_adas PRIVATE
    ${OpenCV_INCLUDE_DIRS}
    ${CMAKE_SOURCE_DIR}/include
)

target_link_libraries(lane_harris_adas PRIVATE ${OpenCV_LIBS})

if(MSVC)
    target_compile_definitions(lane_harris_adas PRIVATE _CRT_SECURE_NO_WARNINGS NOMINMAX)
    target_compile_options(lane_harris_adas PRIVATE $<$<CONFIG:Release>:/O2>)
endif()

# Copia data/ junto al ejecutable para poder correr desde Visual Studio
# (Ctrl+F5) sin ajustar rutas relativas manualmente.
add_custom_command(TARGET lane_harris_adas POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_directory
            ${CMAKE_SOURCE_DIR}/data $<TARGET_FILE_DIR:lane_harris_adas>/data
)

# ── Copiar DLLs de OpenCV junto al .exe (Windows) ───────────────────────────
if(WIN32)
    foreach(lib ${OpenCV_LIBS})
        if(TARGET ${lib})
            get_target_property(lib_type ${lib} TYPE)
            if(lib_type STREQUAL "SHARED_LIBRARY")
                add_custom_command(TARGET lane_harris_adas POST_BUILD
                    COMMAND ${CMAKE_COMMAND} -E copy_if_different
                        $<TARGET_FILE:${lib}>
                        $<TARGET_FILE_DIR:lane_harris_adas>
                )
            endif()
        endif()
    endforeach()
endif()

message(STATUS "OpenCV version : ${OpenCV_VERSION}")
message(STATUS "OpenCV_DIR     : ${OpenCV_DIR}")
message(STATUS "Build type     : ${CMAKE_BUILD_TYPE}")
