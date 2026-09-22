cmake_minimum_required(VERSION 3.16)
project(SignColorDetection CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
    set(CMAKE_BUILD_TYPE Release)
endif()

# ── OpenCV (build manual en Windows) ─────────────────────────────────────────
# Ajusta esta ruta a la carpeta "build" de tu instalación de OpenCV, la que
# contiene el archivo OpenCVConfig.cmake (normalmente C:/opencv/build).
# Si ya defines OpenCV_DIR desde afuera (CMakePresets.json / CMake Settings de
# Visual Studio / -D en línea de comandos), este valor por defecto se ignora.
if(WIN32)
    set(OpenCV_DIR "C:/opencv/build" CACHE PATH "Ruta al build de OpenCV")
endif()

# Componentes realmente usados por el proyecto (detección de color con
# imread/imwrite/cvtColor/morphologyEx/findContours/connectedComponents...).
# No se necesita highgui (no hay imshow/waitKey), videoio ni calib3d.
find_package(OpenCV REQUIRED COMPONENTS core imgproc imgcodecs)

# ============================================================================
#  EJECUTABLE: DETECCIÓN DE COLOR DE SEÑALIZACIÓN (CIELAB vs HSV)
# ============================================================================
add_executable(sign_color_detector
    src/main.cpp
    src/color_detection.cpp
)

target_include_directories(sign_color_detector PRIVATE
    ${OpenCV_INCLUDE_DIRS}
    ${CMAKE_SOURCE_DIR}/include
)

target_link_libraries(sign_color_detector PRIVATE ${OpenCV_LIBS})

if(MSVC)
    target_compile_definitions(sign_color_detector PRIVATE _CRT_SECURE_NO_WARNINGS NOMINMAX)
    target_compile_options(sign_color_detector PRIVATE $<$<CONFIG:Release>:/O2>)
endif()

# Copia data/ junto al .exe para poder correr desde Visual Studio (Ctrl+F5)
# sin tener que ajustar rutas relativas manualmente.
add_custom_command(TARGET sign_color_detector POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_directory
            ${CMAKE_SOURCE_DIR}/data $<TARGET_FILE_DIR:sign_color_detector>/data
)

# ── Copiar DLLs de OpenCV junto al .exe (Windows) ────────────────────────────
if(WIN32)
    foreach(lib ${OpenCV_LIBS})
        if(TARGET ${lib})
            get_target_property(lib_type ${lib} TYPE)
            if(lib_type STREQUAL "SHARED_LIBRARY")
                add_custom_command(TARGET sign_color_detector POST_BUILD
                    COMMAND ${CMAKE_COMMAND} -E copy_if_different
                        $<TARGET_FILE:${lib}>
                        $<TARGET_FILE_DIR:sign_color_detector>
                )
            endif()
        endif()
    endforeach()
endif()

message(STATUS "OpenCV version : ${OpenCV_VERSION}")
message(STATUS "OpenCV_DIR     : ${OpenCV_DIR}")
message(STATUS "Build type     : ${CMAKE_BUILD_TYPE}")
