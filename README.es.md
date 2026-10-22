<p align="center">
  <img src="docs/assets/banner.svg" alt="Lumière — software libre de grabado y corte láser" width="100%">
</p>

<p align="center">
  <a href="https://github.com/timal-o/lumiere/releases/latest"><img alt="Versión" src="https://img.shields.io/github/v/release/timal-o/lumiere?style=flat-square&color=ff5a36&label=versi%C3%B3n"></a>
  <a href="LICENSE"><img alt="Licencia: GPL-3.0" src="https://img.shields.io/badge/licencia-GPL--3.0-2ea44f?style=flat-square"></a>
  <a href="https://github.com/timal-o/lumiere/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/timal-o/lumiere/ci.yml?style=flat-square&label=CI"></a>
  <img alt="Plataformas" src="https://img.shields.io/badge/plataformas-macOS%20%7C%20Windows%20%7C%20Linux-555?style=flat-square">
  <a href="https://github.com/timal-o/lumiere/releases"><img alt="Descargas" src="https://img.shields.io/github/downloads/timal-o/lumiere/total?style=flat-square&color=blue&label=descargas"></a>
  <a href="https://github.com/timal-o/lumiere/stargazers"><img alt="Estrellas" src="https://img.shields.io/github/stars/timal-o/lumiere?style=flat-square&color=f5a524&label=estrellas"></a>
</p>

<p align="center">
  <img alt="Tauri 2" src="https://img.shields.io/badge/Tauri-2-24C8DB?style=flat-square&logo=tauri&logoColor=white">
  <img alt="Rust" src="https://img.shields.io/badge/Rust-n%C3%BAcleo-000000?style=flat-square&logo=rust&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-interfaz-3178C6?style=flat-square&logo=typescript&logoColor=white">
  <img alt="React" src="https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black">
  <img alt="Pruebas" src="https://img.shields.io/badge/pruebas-226%20correctas-2ea44f?style=flat-square">
  <img alt="Idiomas" src="https://img.shields.io/badge/interfaz-EN%20%C2%B7%20FR%20%C2%B7%20ES%20%C2%B7%20%E4%B8%AD%E6%96%87-8a63d2?style=flat-square">
  <a href="CONTRIBUTING.md"><img alt="PR bienvenidas" src="https://img.shields.io/badge/PR-bienvenidas-ff69b4?style=flat-square"></a>
</p>

<p align="center">
  <a href="README.md">English</a> · <a href="README.fr.md">Français</a> · <b>Español</b> · <a href="README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <b>Dibuja, encuadra, graba.</b> Un flujo completo, moderno y libre para láseres de diodo y CO₂ —<br>
  del primer boceto a la última pasada, en una aplicación rápida que cualquiera puede leer, corregir y ampliar.
</p>

<p align="center">
  <img src="docs/assets/screenshot-dark.png" alt="Lumière: un posavasos y una etiqueta QR en el área de trabajo, con el panel de capas" width="92%">
</p>

| 🎯 | **Lo que obtienes** |
|:-:|---|
| 🖊️ | Un editor vectorial de verdad — curvas Bézier, nodos, booleanas, desplazamientos, matrices, anidado |
| 🔥 | Todos los ajustes de corte esperados — relleno, línea, imagen, relleno por zonas, rampas, puentes, entradas, subcapas |
| 🔌 | Control directo de **GRBL**, **Marlin** y **Smoothieware** por USB o red |
| 📂 | Abre **SVG · DXF · AI · EPS · PDF · HPGL · Gerber · STL · OBJ · 3MF** y proyectos de **LightBurn** |
| 🌍 | Interfaz en **English, Français, Español, 简体中文** — un idioma nuevo es un archivo JSON |
| 🆓 | **GPL-3.0** — sin clave de licencia, sin suscripción, sin telemetría |

---

## ✨ Funciones

<table>
<tr>
<td width="50%" valign="top">

### 🖊️ Diseño
- Curvas Bézier y edición completa de nodos
- Rectángulo, elipse, polígono, estrella, estrella doble — paramétricos
- Soldar, restar, intersecar, excluir, asistente booleano
- Desplazamiento (dentro, fuera, ambos), redondeos, chaflanes
- Matrices en cuadrícula y circulares — virtuales y editables
- Copiar a lo largo de un trazado, anidado (varias páginas), espejo
- Deformaciones, inclinación, rotación / escala por dos puntos
- Contorno generado alrededor de formas e imágenes
- Recuperación de arcos y líneas en importaciones segmentadas

</td>
<td width="50%" valign="top">

### 🔤 Texto y códigos
- Fuentes del sistema y fuentes **SHX** de AutoCAD de trazo simple
- Texto en un trazado (letras deformadas), texto curvado en arco
- Texto variable: números de serie, fecha, hora, **combinación CSV**
- **Códigos QR** (Wi-Fi, contacto, correo, URL, logotipo central)
- **DataMatrix** ECC200
- Códigos de barras: Code 128, Code 39, EAN, UPC, ITF-14, Codabar

</td>
</tr>
<tr>
<td valign="top">

### 🔥 Capas y ajustes de corte
- Modos línea, relleno, relleno concéntrico e imagen, con subcapas
- Relleno por zonas, cruzado, ángulo incremental por pasada
- Kerf, puentes (manuales o por espaciado), perforado, sobrecorte
- Rampas de potencia, rampas para sellos, entradas y salidas, pausas
- Pasadas globales, potencia constante (M3), aire solo al cortar
- Bibliotecas de materiales — e importación / exportación `.clb` de LightBurn
- Rejillas de prueba de material, intervalo y enfoque con ajustes predefinidos

</td>
<td valign="top">

### 🖼️ Imágenes
- Tramados: umbral, ordenado, Floyd–Steinberg, Jarvis, Stucki, Atkinson, semitono, periódico, boceto, escala de grises
- Brillo, contraste, gamma, realce, reducción de ruido, negativo
- Relieve 3D por capas, mapas de profundidad STL / OBJ / 3MF
- Vectorización con vista previa en directo: contorno, línea central, boceto
- Máscaras, recorte, ajustes predefinidos de imagen

</td>
</tr>
<tr>
<td valign="top">

### 🎛️ Control de la máquina
- USB serie o TCP, detección automática del controlador
- Desplazamientos (por pasos o continuos), origen, origen de usuario, posiciones guardadas
- Encuadre: contorno rectangular, envolvente o forma, láser encendido o apagado
- Ajuste de velocidad y potencia en directo, pausa, reanudar, parar
- Vista previa con estimación de tiempo que tiene en cuenta la aceleración
- Iniciar desde cualquier punto de la vista previa
- Rotativo (rodillos o mandril, eje Y o A), Z por pasada, compensación de holgura

</td>
<td valign="top">

### 🏭 Producción
- Cámara superpuesta con calibración de objetivo y alineación de 9 marcas
- Imprimir y cortar, buscador de centro, corrección cónica
- Contador y registro de trabajos, lista de comprobación previa
- Páginas, bibliotecas de arte, macros, perfiles, lotes
- Modo principiante, temas claro y oscuro, atajos editables
- Exporta SVG, DXF, PDF/AI, G-code y Ruida `.rd`

</td>
</tr>
</table>

> **¿Vienes de LightBurn?** Lumière usa la misma organización de menús, los mismos nombres y los
> mismos atajos, abre tus proyectos `.lbrn` / `.lbrn2` (capas, ajustes, formas, texto editable) e
> importa tus bibliotecas de materiales `.clb`.

<p align="center">
  <img src="docs/assets/screenshot-light.png" alt="Lumière con el tema claro" width="80%">
</p>

## 🚀 Inicio rápido

**Descargar** — lo más fácil es la web: **[timal-o.github.io/lumiere](https://timal-o.github.io/lumiere/)** elige el instalador adecuado para tu ordenador. Todos los archivos están también en [Releases](https://github.com/timal-o/lumiere/releases).

| 🪟 Windows | 🐧 Linux | 🍎 macOS |
|:-:|:-:|:-:|
| `.msi` · `.exe` | `.deb` · `.rpm` · `.AppImage` | `.dmg` (Apple Silicon · Intel) |

> [!NOTE]
> **Mac:** la app aún no está notarizada por Apple, así que los macOS recientes dicen que el `.dmg` descargado está «dañado».
> Instala mejor con una línea en Terminal: descarga la versión correcta y la abre.
> ```sh
> curl -fsSL https://timal-o.github.io/lumiere/install.sh | bash
> ```

**Compilar** — necesitas [Node.js](https://nodejs.org) 18+, [Rust](https://rustup.rs) (estable)
y los [requisitos de Tauri](https://v2.tauri.app/start/prerequisites/) de tu sistema.

```sh
git clone https://github.com/timal-o/lumiere.git
cd lumiere
npm install
npm run tauri dev      # ejecuta la aplicación con recarga en caliente
npm run tauri build    # crea un instalador (.dmg, .msi, .deb / .AppImage)
```

Después: **Herramientas láser → Buscar mi láser…** para configurar la máquina, dibuja o importa un
diseño, elige una capa, **Encuadrar**, **Iniciar**. La [guía de inicio](docs/user-guide.es.md) lo explica paso a paso.

## 🔌 Hardware

| Controlador | Conexión | Estado |
|---|---|---|
| **GRBL 1.1**, FluidNC, grblHAL | USB serie, TCP | ✅ Usado en trabajos reales de grabado y corte |
| **Smoothieware** | USB serie, TCP | 🧪 Implementado y probado, a la espera de informes en máquina |
| **Marlin** (modo láser) | USB serie, TCP | 🧪 Implementado y probado, a la espera de informes en máquina |
| **Ruida** (DSP CO₂) | UDP, archivo `.rd` | ⚠️ Experimental |
| Galvo (EZCad / JCZ) | — | 🗺️ Previsto |

> [!WARNING]
> Un láser es peligroso. Usa la protección ocular adecuada, no dejes nunca un trabajo sin vigilancia
> y ten un extintor a mano. Prueba los ajustes nuevos a baja potencia.

## 📂 Formatos de archivo

| | Formatos |
|---|---|
| **Abrir** | `.lum` (Lumière), `.lbrn` / `.lbrn2` (LightBurn) |
| **Importar vectores** | SVG, DXF, AI, EPS, PDF, HPGL / PLT, Gerber (RS-274X) + taladros Excellon |
| **Importar imágenes** | PNG, JPEG, BMP, GIF, WebP |
| **Importar 3D** | STL, OBJ, 3MF → mapa de profundidad |
| **Exportar** | SVG, DXF (R12), PDF / AI, G-code, imagen procesada, Ruida `.rd` |
| **Bibliotecas** | Materiales (`.json`, `.clb` de LightBurn), arte, ajustes de imagen y de prueba, lotes |

## 📚 Documentación

- 📖 [Guía de uso](docs/user-guide.es.md) — también en [English](docs/user-guide.md), [Français](docs/user-guide.fr.md), [简体中文](docs/user-guide.zh-CN.md)
- 🔧 [Hardware](docs/hardware.md) · 🌍 [Traducir](docs/translating.md) · 🏗️ [Arquitectura](docs/architecture.md) · 🗂️ [Formato de archivo](docs/file-format.md) · 🛠️ [Desarrollo](docs/development.md) (en inglés)

## 🤝 Contribuir

Informes de errores, pruebas en máquina, traducciones y pull requests son bienvenidos — empieza por
[CONTRIBUTING.md](CONTRIBUTING.md) y respeta el [código de conducta](CODE_OF_CONDUCT.md).

## 📄 Licencia

Lumière es software libre bajo la [Licencia Pública General GNU v3.0](LICENSE): úsalo, estúdialo,
modifícalo y compártelo — las versiones modificadas que distribuyas siguen bajo la misma licencia.

<sub>Lumière es un proyecto independiente, sin relación con ningún fabricante de software láser comercial
y sin ninguna línea de su código. Los nombres de productos pertenecen a sus respectivos propietarios.</sub>
