# Guía de usuario

[English](user-guide.md) · [Français](user-guide.fr.md) · [Español](user-guide.es.md) · [简体中文](user-guide.zh-CN.md)

Los nombres de menús y botones son los de la interfaz en español. El idioma se cambia en
el menú *Idioma* o en
*Editar → Ajustes…* (⌘,).

- [Inicio rápido](#inicio-rápido)
- [El área de trabajo](#el-área-de-trabajo)
- [Dibujar y editar](#dibujar-y-editar)
- [Texto, códigos QR y de barras](#texto-códigos-qr-y-de-barras)
- [Importar y exportar](#importar-y-exportar)
- [Capas y ajustes de corte](#capas-y-ajustes-de-corte)
- [Imágenes](#imágenes)
- [Vista previa y duración estimada](#vista-previa-y-duración-estimada)
- [Ejecutar un trabajo](#ejecutar-un-trabajo)
- [Cámara](#cámara)
- [Imprimir y cortar](#imprimir-y-cortar)
- [Herramientas de producción](#herramientas-de-producción)
- [Más comandos de los menús](#más-comandos-de-los-menús)
- [Atajos de teclado](#atajos-de-teclado)

## Inicio rápido

1. **Configurar la máquina** — *Herramientas láser → Ajustes del dispositivo…*: tamaño de la mesa, esquina de
   origen, `S máx.` (`$30` de GRBL), controlador y aceleración.
2. **Conectar** — en el panel *Láser*, elija *USB* o *Red*, el puerto o la dirección IP y pulse
   *Conectar*.
3. **Dibujar o importar** — *Archivo → Importar…* (⌘I) o la paleta de herramientas de la izquierda.
4. **Ajustar la capa** — seleccione formas, haga clic en un color de la paleta bajo la lista de
   *Capas* y ajuste modo, velocidad y potencia.
5. **Comprobar** — *Vista previa* (⌥P) muestra la trayectoria y la duración estimada.
6. **Encuadrar** — *Encuadrar* recorre el contorno del trabajo para comprobar su posición.
7. **Grabar** — *Iniciar*. *Detener* (⌘.) para el controlador de inmediato.

> [!CAUTION]
> Un láser es peligroso y cada máquina es distinta. Empiece con una prueba sin material, a baja
> potencia, y no deje nunca la máquina sin vigilancia.

## El área de trabajo

| Zona | Contenido |
|---|---|
| Barra de menús | *Archivo, Editar, Herramientas, Organizar, Herramientas láser, Ventana, Idioma, Ayuda* |
| Barra de herramientas | Deshacer/rehacer, posición y tamaño de la selección (X, Y, An, Al, mantener proporciones, rotación), *Vista previa*, *Exportar G-code* |
| Barra de organización | Rotación, reflejo, alineación, distribución, agrupar, centrar, duplicar, eliminar, imán; opciones de la herramienta de dibujo activa |
| Paleta de herramientas | Selección, nodos, medir, recortar, puentes, posicionar el láser, línea, rectángulo, elipse, polígono, estrella, texto |
| Área de trabajo | La mesa (cuadrícula de 10 mm), el origen de máquina (punto naranja), el cabezal (cruz roja), las reglas |
| Paneles derechos | *Propiedades*, *Capas*, *Láser* |

Las coordenadas están en milímetros desde la **esquina superior izquierda de la mesa**. Lumière las
convierte en coordenadas de máquina según la esquina de origen del perfil.

**Unidades**: *Editar → Ajustes…* muestra todas las longitudes, velocidades y reglas en pulgadas (el proyecto sigue en milímetros).

**Navegación**: rueda o pellizco para el zoom, desplazamiento con dos dedos / Espacio+arrastrar /
clic derecho para desplazar, `F` para ajustar a la mesa, ⌘= / ⌘- para el zoom, ⌘0 para la página, ⇧⌘A para la
selección.

**Imán**: *Objetos* se ajusta a esquinas, centros y nodos de otras formas; *Cuadrícula*, a una
cuadrícula del paso elegido. Mantenga ⌥ al arrastrar para ignorarlo.

## Dibujar y editar

### Selección (V)
- Clic para seleccionar, Mayús+clic para añadir o quitar, arrastrar en vacío para un recuadro.
- Arrastrar para mover (Mayús restringe en horizontal o vertical); las flechas mueven 1 mm
  (Mayús: 10 mm).
- Los tiradores de esquina mantienen las proporciones (Mayús: libres), los de los lados estiran un eje.
- **Un segundo clic en una forma seleccionada** muestra los tiradores de rotación; Mayús gira de
  15° en 15°.

### Formas
- *Rectángulo (R), Elipse (E), Polígono (P), Estrella (S)*: arrastre para dibujar, Mayús para un
  cuadrado o círculo. Radio de las esquinas, lados y puntas siguen siendo editables en
  *Propiedades* mientras no se editen los nodos.
- *Línea / polilínea (L)*: clic para añadir puntos, doble clic o Intro para terminar, clic en el
  primer punto para cerrar, Esc para cancelar.

### Editar nodos (N)
Seleccione una forma vectorial y arrastre nodos y tiradores (⌥ rompe la simetría de un nodo
suave), arrastre en vacío para seleccionar varios nodos, haga doble clic en un segmento para
insertar un nodo. Al pasar sobre un nodo o segmento: **D** eliminar, **I** insertar, **B** cortar,
**L** recta, **C** curva, **S** suave/esquina, **J** unir los dos extremos seleccionados, **P**
punto de inicio. Las flechas mueven los nodos seleccionados 0,1 mm (Mayús: 1 mm). Los textos deben
convertirse antes (*Editar → Convertir a trayectoria*, ⇧⌘C).

### Geometría (menús *Herramientas* y *Organizar*)
| Elemento | Efecto |
|---|---|
| *Herramientas → Compensar formas…* (⌥O) | Hacia fuera o hacia dentro, esquinas redondeadas, vivas o achaflanadas |
| *Herramientas → Soldar formas* (⌘W) y booleanas (⌥+, ⌥-, ⌥*) | Unión, resta (la primera seleccionada menos las demás), intersección, exclusión |
| *Herramientas → Redondeos y chaflanes…* | Todas las esquinas o solo los nodos seleccionados en modo Nodos |
| *Organizar → Cuadrícula/Arreglo…* (⌥A), *Arreglo circular…* | Copias en cuadrícula o alrededor de un centro |
| *Organizar → Copiar sobre trayectoria…* | Copias a lo largo de la última forma seleccionada, opcionalmente según la tangente |
| *Organizar → Incrustación…* (⇧⌘N) | Ordena las formas en la mesa (los grupos permanecen juntos), rotación de 90° opcional |
| Herramienta *Recortar formas* (⌘K) | Clic en un tramo para eliminarlo hasta las intersecciones más cercanas |
| Herramienta *Agregar pestañas* | Clic en un contorno para añadir un puente, Mayús+clic para quitarlo |

El menú *Editar* incluye también *Unir automáticamente las formas seleccionadas…* (⌥J),
*Optimizar las formas seleccionadas…* (⌥⇧O), *Eliminar duplicados* (⌥D), *Seleccionar formas
abiertas*, *Seleccionar todas las formas en la capa actual*, *Invertir la selección* y *Convertir a
mapa de bits…* (⇧⌘B). Desplazamientos, booleanas y simplificación producen contornos por puntos
(sin curvas de Bézier).

### Organizar
Agrupar (⌘G), desagrupar (⌘U), voltear horizontal / vertical (⇧⌘H / ⇧⌘V), rotar 90° (`;` y `,`),
alinear, distribuir (espaciados o centrados), *Mover los objetos seleccionados* (centro de la
página, esquinas, bordes), romper (⌥B), combinar (⌥C), empujar al frente / al fondo (⇧⌘↑ / ⇧⌘↓).

## Texto, códigos QR y de barras

- *Texto (T)*: haga clic en el área de trabajo y escriba en el panel *Texto*: fuente, estilo,
  altura, espaciado entre letras y líneas, alineación. *Soldar las letras* (activado por defecto)
  une las letras que se solapan en las caligrafías.
- **Texto sobre un trazado**: seleccione un texto y un trazado y use *Herramientas → Aplicar
  trayectoria al texto*; *Inicio en el trazado* lo desplaza a lo largo del trazado.
- **Texto variable**: `{n}` número de serie, `{date}`, `{time}`. Ajuste el número actual, el
  incremento por trabajo y los dígitos en el panel *Texto*. *Combinar CSV…* carga un archivo CSV:
  cada columna se convierte en `{Nombre de columna}` y la fila avanza tras cada trabajo.
- *Herramientas → Crear código de barras…* y *Crear código QR…* crean códigos vectoriales; colóquelos en una
  capa *Relleno*.

## Importar y exportar

| Formato | Importación | Exportación |
|---|---|---|
| SVG | Trazados y formas con transformaciones y unidades, una capa por color de trazo. Textos y `<use>` omitidos. | *Archivo → Exportar…* (⌥X) (curvas conservadas) |
| DXF (ASCII) | Líneas, arcos, círculos, elipses, polilíneas con abultamientos, splines; segmentos unidos automáticamente | — |
| HPGL (`.plt`) | PU/PD/PA/PR, una capa por pluma | — |
| PNG, JPEG, BMP, GIF, WebP | 0,1 mm por píxel, ajustado al tamaño de la mesa | *Archivo → Guardar mapa de bits procesado…* |
| G-code | *Herramientas láser → Ejecutar un archivo G-code…* | *Archivo → Guardar el G-code…* |
| Ruida `.rd` | — | *Archivo → Exportar para Ruida…* (experimental) |
| PDF | Trazados vectoriales de la primera página, una capa por color (textos e imágenes omitidos) | — |
| STL (modelo 3D) | Convertido en mapa de profundidad (vista, resolución, ancho, corte de profundidad, ecualización, inversión) para el *Relieve 3D: capas* | — |
| Gerber, Excellon | Cobre, serigrafía, máscara y contorno como contornos rellenos (en una capa *Relleno*); taladros como círculos | — |
| AI, EPS | Archivos de Illustrator (basados en PDF o PostScript antiguo) y EPS: trazados vectoriales, una capa por color (textos e imágenes omitidos) | — |
| OBJ, 3MF (modelos 3D) | Convertidos en imagen de profundidad, como STL | — |

Los archivos se pueden soltar sobre la ventana. Los proyectos son archivos `.lum`
([formato](file-format.md)); si la aplicación se cierra con cambios sin guardar, se ofrece
recuperar una copia automática.

## Capas y ajustes de corte

Cada color de la paleta es una capa. Al hacer clic en un color se le asigna la selección (o se
elige la capa de las nuevas formas). La lista muestra el orden de grabado (▲▼); *Salida* y
*Visible* activan cada capa.

**Modos**: *Línea* (contornos), *Relleno* (líneas de barrido dentro de las formas cerradas;
intervalo, sobrebarrido, bidireccional, ángulo, cruzado, *Rellenar cada forma por separado*),
*Relleno concéntrico* (contornos sucesivos), *Imagen*.

**Opciones de línea**: *Kerf*, *Puentes*, *Sobrecorte*, *Rampa* / *Inicio de rampa*, *Sentido de
los contornos*, *Cortar primero el interior*, *Conservar los puntos de inicio*, *Eliminar líneas
superpuestas*, *Modo puntos*, *Perforación*. Con un eje Z motorizado: *Desplazamiento Z* y
*Bajada/pasada*.

**Subcapas**: la pestaña *+* añade otro ajuste aplicado a las mismas formas (p. ej. relleno y
luego contorno).

**Biblioteca de materiales** (*Ventana → Biblioteca de materiales…*): guarde los ajustes de la capa por material y grosor, aplíquelos
más tarde, impórtelos y expórtelos en JSON.

**Cuadrículas de prueba**: *Herramientas láser → Prueba de materiales…* (y *Prueba de intervalo…*, *Prueba de enfoque…*) varía dos parámetros entre potencia,
velocidad, intervalo, pasadas y desplazamiento Z, con leyendas grabadas; los preajustes cubren las
pruebas de material, intervalo y enfoque.

**Más ajustes de corte**: guías de entrada y salida (rectas o en arco, hacia fuera o hacia dentro), pausas al principio y al final de cada trayectoria con su propia potencia (modo de corte pasante), *Modo de potencia constante (M3)* por capa, incremento de ángulo del relleno en cada pasada, *Rellenar grupos juntos*, pestañas omitidas en las formas internas y *Potencia de corte de pestañas* (corte parcial). Para las imágenes: *Imagen negativa*, modos *Periódico* y *Boceto*, y en el panel Imagen *Cantidad de realce*, *Radio de realce* y reducción de ruido.

**Menú de capas**: con clic derecho en una capa se habilita, se muestra o se ajusta el soplado de aire para esa capa, para todas, para todas excepto esa, o se invierte; también se mueve o elimina la capa.

## Imágenes

Las imágenes importadas van a una capa *Imagen*. En el panel *Imagen*: brillo, contraste, gamma,
invertir, *Vectorizar…*, *Guardar la imagen procesada…*. *Herramientas → Aplicar máscara a
la imagen* conserva solo la parte interior de una forma cerrada. En la capa: *Intervalo*
(resolución), *Tramado* (umbral, ordenado, Floyd-Steinberg, Jarvis, Stucki, Atkinson, semitono,
escala de grises) y *Relieve 3D: capas*.

## Vista previa y duración estimada

*Vista previa* (⌥P) dibuja el trabajo: cortes del color de su capa, desplazamientos en gris. La
barra muestra la duración estimada (también por capa), las longitudes de corte y desplazamiento,
un control deslizante y un botón de reproducción. La estimación tiene en cuenta la aceleración,
como el planificador de GRBL, cuando está configurada en el perfil de máquina.

## Ejecutar un trabajo

El panel *Láser* contiene la conexión, el estado y la posición, el teclado de jog, *Origen de
máquina ($H)*, *Desbloquear ($X)*, *Ir a la selección* y además:
- **Iniciar desde**: *Coordenadas absolutas*, *Posición actual* (el punto de anclaje va bajo el
  cabezal) u *Origen de usuario* (definido con *Definir el origen aquí*); la cuadrícula 3×3 elige
  el punto de anclaje;
- *Encuadrar* según la caja delimitadora o la envolvente (*Encuadre ajustado*), con el láser
  apagado o encendido;
- *Iniciar, Pausa, Detener*, *Solo la selección*; ajuste de velocidad y potencia durante el trabajo;
- macros y una consola; los errores y alarmas de GRBL se explican.

La herramienta *Posicionar el láser* envía el cabezal al punto pulsado.

**Ajustes de optimización** (*Herramientas láser* o panel *Láser*): ordenar por capa, por grupo o por prioridad de forma (en *Propiedades*), cortar según una dirección, reducir desplazamientos, mejor punto de inicio (esquinas si es posible), mejor dirección, ocultar juego.

**Más control de la máquina** en el panel *Láser*: jog en Z, *Ir* a una posición X/Y y *Obtener posición*, *Disparo* de prueba mientras se mantiene el botón, posiciones guardadas, *Establecer posición final*, *Repetir* el trabajo varias veces, encuadrar cada forma o de forma continua. *Herramientas láser → Buscador de centro…* encuentra el centro de un objeto redondo a partir de tres puntos de su borde. En la vista previa, *Empezar aquí* y *Guardar desde aquí…* reanudan un trabajo en el punto mostrado.

## Cámara

*Herramientas láser → Administrar cámaras…*: elija la cámara, *Grabar la mira*, haga clic en las cuatro
cruces en el orden indicado, ajuste la *Corrección de la lente*, *Guardar la calibración* y luego
*Actualizar la imagen* para mostrar la vista corregida bajo el diseño. La cámara no debe moverse
respecto a la mesa.

**Asistente de calibración del objetivo** (en la ventana Cámara): añada al proyecto una cuadrícula de puntos rellenos y grábela (o imprímala), colóquela bajo la cámara, captúrela varias veces en distintas posiciones y pulse *Calcular la corrección*: la corrección del objetivo se ajusta automáticamente. Después, vuelva a marcar los cuatro puntos y guarde la calibración.

**Alineación con 9 marcas**: en la ventana Cámara, elija *9 marcas* para grabar y marcar una cuadrícula de 3 × 3 cruces; la alineación se calcula por mínimos cuadrados, lo que promedia los errores de clic. *Deshacer el último* quita el último clic.

**Imagen y archivos de la cámara**: *Ajustes de imagen de la cámara* muestra los ajustes que ofrece la cámara (brillo, contraste, exposición, balance de blancos, enfoque, zoom); la calibración se exporta e importa como archivo; *Capturar y vectorizar* añade la captura enderezada al proyecto y abre la vectorización.

## Imprimir y cortar

*Herramientas láser → Imprimir y cortar → Iniciar asistente…*: seleccione dos marcas en el diseño, lleve el láser a cada marca de la
pieza real y regístrela, y pulse *Aplicar*. El trabajo se gira, escala y desplaza para coincidir,
hasta que se desactive la alineación.

## Herramientas de producción

- **Perfiles de máquina**: varias máquinas con su mesa, origen, controlador, conexión, rotativo,
  desfase de barrido, G-code inicial y final y comando de asistencia de aire.
- **Macros**: botones del panel *Láser* que envían líneas de G-code.
- **Ajustes de GRBL ($$)**: leer, modificar y escribir los ajustes del controlador; copiar tamaño
  de mesa, `S máx.`, velocidades y aceleración al perfil.
- **Notas del proyecto**, **Biblioteca de arte** (*Ventana*), **Rotativo** (*Herramientas láser → Ajustes de rotación…*,
  con *Iniciar desde: Posición actual*).

## Más comandos de los menús

| Menú | Comandos |
|---|---|
| *Archivo* | *Nueva ventana*; *Proyectos recientes* y *Plantillas recientes*; *Guardar como plantilla…* (una plantilla se abre como un proyecto nuevo sin nombre); *Preferencias*: importar, exportar, cargar una copia de seguridad (una al día); *Paquetes*: máquinas, macros y biblioteca de materiales en un solo archivo; *Imprimir (solo en negro)…* (⌘P) o *(mantener los colores)…* (⇧⌘P), a escala 1:1; *Guardar captura de fondo…* (cámara); *Preferencias* → *Editar atajos de teclado…*: cambiar cualquier atajo |
| *Editar* | *Historial de deshacer…*; *Generar trayectoria desde el corte* (la trayectoria calculada se convierte en formas); *Cerrar trayectoria*, *Cerrar trayectorias seleccionadas con tolerancia…*; *Invertir dirección de la forma*; selección de formas abiertas para rellenar, formas contenidas, formas más pequeñas que la selección, círculos; *Resaltar formas en la capa actual*; *Opciones de imagen*: reemplazar la imagen (misma escala o ajustada); *Actualizar imagen* vuelve a leer una imagen desde su archivo |
| *Herramientas* | Triángulo, pentágono, octágono; *Asistente booleano…* (⌘B); *Cortar formas* (⌥⇧C): la última forma seleccionada divide las demás en parte interior y exterior; *Ajustar imagen…* (⌥I); *Recortar imagen* según otra forma seleccionada; *Estrella dual*; *Torcer selección (4 puntos)* y *Deformar selección (16 puntos)*: arrastre los tiradores, Intro aplica; *Redimensionar las ranuras en la selección…* (ranuras o pestañas, para un nuevo grosor); *Generar círculo tangente* (tangentes a tres círculos seleccionados); *Trazar imagen de varios archivos…* |
| *Organizar* | *Agrupación automática* (una forma con las que contiene); *Reflejar sobre línea* (⇧⌘M, la línea se selecciona al final); *Acoplar* contra la forma más cercana o el borde de la mesa; *Mover horizontales / verticales juntos* (⌥⇧H / ⌥⇧V); *Mover láser a selección* y jog (⌥⌘ flechas); contorno de banda elástica; adelantar / atrasar un nivel (⌘↑ / ⌘↓); bloquear y desbloquear (una forma bloqueada no se mueve); *Girar/escalar en dos puntos* (⌘2): haga clic en el centro, un punto de referencia y su nueva posición (Mayús también escala) |
| *Herramientas láser* | Pasos de *Imprimir y cortar* (⌥0 a ⌥4) y restablecimiento; *Torcer en cono…* para objetos cónicos con rotativo |
| *Ventana* | *Estilo de vista*: alambre o relleno, basto o suave (⌥⇧W); mostrar/ocultar los paneles laterales (F12) y cada barra de herramientas; *Páginas*: pestañas sobre el área de trabajo para tener varios diseños en un proyecto (capas compartidas, el trabajo usa la página mostrada) |
| *Ayuda* | Licencia, foro de soporte, solicitud de función, documentación en línea, datos de uso (no se recopila ninguno), informe de errores, datos de soporte, búsqueda de actualizaciones, registro de depuración |

## Más opciones de edición y de máquina

- **Ajustes** (⌘,): tolerancias de ajuste y de clic, pasos de las flechas, intervalo de guardado automático, seleccionar las formas tras dibujarlas, sentido de la rueda, fuente y altura por defecto, cuadrícula visual, cruz central, cursor a pantalla completa, centrado y agrupación al importar, DPI de SVG, precisión HPGL.
- **Ajustes del dispositivo** (*Herramientas láser*): origen al conectar, desplazamientos con `$J` o `G0`, `S` en cada `G1`, sobrerrecorrido G0, aviso si el trabajo sale de la mesa, desplazamiento del puntero láser, Z invertido o relativo, retardo de inicio, lista de comprobación antes de cada trabajo y botón de disparo de prueba (opcional).
- **Capas**: *Establecer por defecto* / *Restablecer* en el menú de la capa; *Corrección del ancho del punto* para rellenos; *Editar → Seleccionar círculos por tamaño…*.
- Herramienta **Redondear esquinas**: haga clic en una esquina para redondearla (Mayús: chaflán); el radio está en la barra de opciones.
- **Biblioteca de arte**: importar y exportar bibliotecas como archivos.
- El **historial de deshacer** nombra cada paso (el comando del menú, o mover / redimensionar / girar / editar nodos).
- **Vectorizar**: el modo *Línea central* sigue el centro de los trazos oscuros (dibujos de línea, escritura).
- **Matrices editables**: las matrices en cuadrícula y circulares siguen vinculadas a su origen; *Editar matriz* las cambia y *Aplanar matriz* las convierte en formas normales.
- **Ajustes predefinidos de imagen**: puntos de partida integrados y sus propios ajustes para una imagen y su capa.
- **Rampa en relleno** (sellos): en una capa *Relleno*, la *Rampa* reduce la potencia cerca de los bordes para obtener flancos inclinados; *Aplicar rampa al borde exterior* incluye también el contorno exterior (desactívela para sellos y el marco quedará nítido).
- **Vínculo con la biblioteca**: en la biblioteca de materiales, *Vincular* une la capa actual a una entrada; sus ajustes pasan a solo lectura y siguen la biblioteca (también al abrir un proyecto). ↻ sustituye una entrada por los ajustes de la capa actual y todas las capas vinculadas la siguen. *Desvincular* en la capa permite modificarla de nuevo.
- **Medir** (M): un panel muestra la forma bajo el cursor (o la seleccionada): tamaño, nodos, líneas, curvas, abierta o cerrada, perímetro, área; el segmento bajo el cursor: puntos de inicio y fin, longitud, ángulo, y centro y radio de una curva; al arrastrar, la distancia medida. Su botón de unidad cambia entre mm y pulgadas.
- **Distorsionar** (texto en un trazado): curva las letras para que sigan el trazado en lugar de solo girarlas.
- **Fuentes SHX**: elija una carpeta de fuentes AutoCAD `.shx` en *Ajustes*; aparecen en la lista de fuentes. Son fuentes de trazo simple (trazos abiertos), ideales para grabar rápido en una capa *Línea*. Las fuentes grandes (asiáticas) no son compatibles.
- **Opciones de matriz en cuadrícula**: espacio entre bordes o de centro a centro, llenar el ancho / alto de la mesa, desplazamiento X por fila e Y por columna, desplazar a la mitad, invertir dirección, reflejar filas o columnas alternas, orientación aleatoria, agrupar resultados, incremento del texto variable por copia y *Crear matriz virtual* (desactivado: copias normales).
- **Opciones de la vista previa**: *Sombreado según potencia*, *Invertir* (blanco sobre negro, para valorar un grabado de imagen), mostrar u ocultar los *Movimientos* en vacío y *Guardar imagen…* (Mayús: fondo transparente).
- **Secuencia del texto variable**: *Inicio* y *Fin* (el número vuelve al inicio tras el final), *Avance automático* tras cada trabajo, ◀ / ▶ para retroceder o avanzar, *Restablecer*.
- **Calibrar eje** (en *Ajustes GRBL*): introduzca la distancia solicitada y la realmente recorrida; los nuevos pasos por mm ($100 / $101 / $102) se calculan y se escriben en el controlador.
- **Bibliotecas de LightBurn**: la biblioteca de materiales importa archivos `.clb` de LightBurn (velocidades convertidas desde mm/s; las entradas con varios ajustes pasan a subcapas) y exporta a `.clb`.
- **Proyectos de LightBurn**: *Archivo → Abrir* (o arrastrar y soltar) lee archivos `.lbrn` y `.lbrn2`: capas con sus ajustes, rectángulos, elipses, polígonos, estrellas, trazados, grupos, imágenes y textos: editables si su fuente está instalada, si no como curvas (a partir del trazado que LightBurn guarda con ellos). Al guardar se crea un proyecto de Lumière.
- **Formatos de exportación**: *Archivo → Exportar…* escribe SVG, DXF (R12, una capa DXF por capa) o PDF / AI (compatible con PDF), según el tipo de archivo elegido. Las curvas se aplanan en DXF y PDF; las imágenes solo se exportan en SVG.
- **Interruptores de manipulación** (a la derecha de la barra Organizar): ✥ mover, ⟳ girar, ⤡ escalar, ▱ inclinar. Desactive uno para no hacerlo por error con el ratón; la edición numérica sigue disponible.
- **Relleno por zonas (Flood Fill)** (capas Relleno): cada zona se barre por completo antes de la siguiente más cercana, en lugar de recorrer todo el diseño línea a línea; muchos menos desplazamientos en letras y formas dispersas.
- **Subcapas**: ⧉ clona el ajuste mostrado (capa principal o subcapa) en una nueva subcapa; una subcapa puede tener nombre y su pestaña lo muestra.
- **Buscar mi láser** (*Herramientas láser*, o *Asistente…* en los ajustes de la máquina): busca un controlador GRBL, Marlin o Smoothieware en los puertos USB, lee su área de trabajo y su `S` máx., y pide un nombre, la esquina de origen y el origen automático. Los dispositivos de red y Ruida se configuran a mano en el mismo asistente.
- **Desplazamientos de barrido según la velocidad** (ajustes de la máquina): una tabla de velocidades y desplazamientos para el barrido bidireccional, interpolada según la velocidad de cada capa; sin tabla se aplica el desplazamiento único.
- **Modo principiante** (menú *Ventana* o *Ajustes*): los ajustes de corte solo muestran lo esencial (modo, velocidad, potencia, pasadas, intervalo, ángulo, asistencia de aire); se ocultan las pestañas de subcapas, los valores por defecto de capa y los interruptores de manipulación. Los ajustes ocultos conservan su valor.
- **Más opciones de corte**: *Pasadas globales* repite una capa y sus subcapas juntas; puentes según el espaciado, con mínimo y máximo por forma; *Aire solo al cortar* (apagado en los desplazamientos); *Copiar a todas las capas*.
- **Opciones de disposición**: los campos X / Y siguen un punto de referencia 3 × 3 (también al redimensionar); el *Desplazamiento* puede ir hacia ambos lados y tratar solo las formas exteriores; *Copiar a lo largo de un trazado* admite un espaciado fijo y un incremento del texto variable; la *Matriz circular* tiene ángulo inicial, paso editable, centro tomado de la última forma seleccionada, agrupación e incremento del texto variable.
- **Editar matrices** (*Organizar*): *Añadir a la matriz* (seleccione la matriz y las formas nuevas), *Quitar de la matriz* (seleccione formas originales), *Duplicar matriz*.
- **Generar contorno** (*Herramientas*): un contorno sin agujeros alrededor de la selección, a la distancia elegida; las imágenes siguen sus píxeles no blancos (pegatinas recortadas).
- **Recuperar arcos y líneas** (*Editar*): sustituye las formas hechas de muchos segmentos pequeños (DXF, PDF, vectorizaciones) por líneas rectas y arcos de circunferencia reales, editables por nodos.
- **Estilo y curvatura del texto**: *N* y *K* cambian a los estilos negrita y cursiva de la fuente; *Curvar* pone el texto en arco (hasta un círculo completo, hacia arriba o hacia abajo).
- **Anidado y páginas**: el anidado mantiene las formas interiores con su forma envolvente y puede colocar lo que no cabe en páginas nuevas; la barra de páginas inserta una página tras la actual (↳) e importa las páginas de otro proyecto (⇩).
- **Salida de trabajos**: *Cortes al final* (ajustes de optimización) ejecuta las capas Línea después del grabado; la *Escala global de velocidad* (ajustes de la máquina) cambia la velocidad de todas las capas; durante un trabajo, el panel Láser muestra el tiempo transcurrido y el restante estimado; *Herramientas láser → Exportar registro de trabajos…* guarda el historial (inicio, duración, líneas, errores) en CSV.
- **Capas de herramienta y encuadre**: *T1* y *T2* (tras la paleta de colores) son capas de herramienta, nunca se graban: para referencias y encuadre. En el panel Láser, el *Encuadre* sigue el contorno rectangular, la envolvente (banda elástica) o el contorno de las formas; *Solo capas de herramienta* encuadra solo las formas de T1 / T2; *Imágenes: parte no blanca* encuadra solo la parte dibujada de las imágenes.
- **Más opciones de máquina**: compensación de holgura en X e Y, intercambio de X e Y en la salida, desplazamiento de enfoque Z, señal DTR al conectar, lectura de los ajustes GRBL ($$) al conectar, y descripciones personalizadas de errores y alarmas.
- **Panel Mover**: el *Desplazamiento continuo* avanza mientras se mantiene una flecha (se detiene al soltar, hasta el borde de la mesa); las posiciones guardadas conservan Z en máquinas con eje Z; un botón *Enfoque automático* ejecuta el G-code de enfoque definido en los ajustes de la máquina.
- **Tipos de rotativo**: de rodillos (diámetro de los rodillos) o de mandril (diámetro del objeto), en el eje Y (mm por vuelta) o el eje A (grados), con salida en espejo.
- **Ventana de vectorización**: una vista previa en directo muestra el resultado sobre la imagen (*Atenuar la imagen*, *Mostrar los puntos*); el *Trazado de boceto* traza los bordes de una foto como líneas.
- **Códigos QR y de barras**: un código QR puede contener una red Wi-Fi, un contacto, un correo, un teléfono o una dirección web (campo por campo); los códigos de barras pueden mostrar su texto debajo; un código QR puede llevar un logotipo SVG en el centro; la misma ventana crea también códigos DataMatrix (ECC200).
- **Prueba de material**: un título grabado, un borde cortado al final (con su potencia y velocidad) y sus propios ajustes predefinidos (guardar, borrar, exportar, importar).
- **Varias bibliotecas de materiales**: abra un archivo como nueva biblioteca, cambie entre ellas, renómbrelas o descárguelas; *Fusionar…* añade un archivo a la biblioteca actual con una regla para duplicados (conservar, sustituir, renombrar la nueva o la original). Las capas vinculadas encuentran su entrada en cualquier biblioteca cargada.
- **Bibliotecas de arte**: se pueden cargar, renombrar y descargar varias bibliotecas; *Importar archivos…* añade directamente archivos SVG, DXF, PDF o imágenes (un elemento por archivo); un control ajusta el tamaño de las miniaturas.
- **Apariencia** (*Ajustes*): tema claro, oscuro o el del sistema; tamaño de los iconos; números de capa en los botones de la paleta.
- **Ventana Consola** (*Ventana → Consola…*): una consola más grande, con historial de comandos (↑ / ↓), borrar y guardar.
- **Configurar página** (⚙ en la barra de páginas): el tamaño de la pieza de cada página y su esquina en la mesa, mostrado con línea discontinua.
- **Perfiles** (*Archivo → Preferencias → Gestión de perfiles…*): conjuntos completos de preferencias (dispositivos, bibliotecas, atajos, ajustes), por ejemplo uno por taller o por persona; cambiar de perfil reinicia la interfaz. Los lotes incluyen ahora todas las bibliotecas de materiales.
- **Limpieza del relieve 3D**: con *Relieve 3D: capas*, una pasada de limpieza cada N capas repasa la zona ya excavada (o toda la imagen) para igualar el fondo.
- **Contador de trabajos** (panel Láser): cuenta los trabajos terminados; *Parar en* bloquea *Iniciar* al alcanzar el número, para series.
- **Disposición de los paneles** (*Ajustes*): los paneles laterales se colocan a la izquierda o a la derecha de la ventana, en el orden elegido (▲ sube un panel).
- **Formas fuera de la mesa**: *Ajustes → Ignorar las formas fuera del área de trabajo* deja fuera del trabajo las formas totalmente fuera de la mesa.
- **Inclinar**: en modo rotación (haga clic otra vez en la selección), los tiradores laterales la inclinan.
- **Importar PCB** (*Archivo → Importar PCB…*): añada los archivos Gerber y de taladrado de una placa; la función de cada archivo (cobre, serigrafía, máscara, pasta, contorno, taladrado) y su cara se detectan por su nombre. Opciones: invertir el cobre con el contorno de la placa (grabado de aislamiento), reflejar las capas inferiores, poner cobre, serigrafía y máscara en *Relleno*. Cada archivo va a su propia capa y la placa se centra en la mesa.

## Atajos de teclado

La lista completa está en *Ayuda → Atajos de teclado* (⌘/).

| Teclas | Acción |
|---|---|
| V, N, M, L, R, E, P, S, T | Selección, nodos, medir, línea, rectángulo, elipse, polígono, estrella, texto |
| ⌘L, ⌘R, ⌘E, ⌘T, ⌘K | Dibujar líneas, rectángulo, elipse, texto, recortar formas |
| ⌘N, ⌘O, ⌘S, ⇧⌘S | Nuevo, abrir, guardar, guardar como |
| ⌘I, ⌥X, ⇧⌘E | Importar, exportar, guardar el G-code |
| ⌘Z, ⇧⌘Z | Deshacer, rehacer |
| ⌘C, ⌘X, ⌘V, ⌥V, ⌘D | Copiar, cortar, pegar, pegar en el mismo lugar, duplicar |
| ⌘G, ⌘U | Agrupar, desagrupar |
| ⇧⌘H, ⇧⌘V, `;`, `,` | Voltear horizontal, vertical, rotar 90° en sentido horario, antihorario |
| ⌘W, ⌥+, ⌥-, ⌥* | Soldar, unión, resta, intersección |
| ⌥O, ⌥A, ⇧⌘N, ⌥B, ⌥C, ⌥J, ⌥D | Compensar, arreglo, incrustación, romper, combinar, unir, eliminar duplicados |
| ⌥P, ⌘0, ⇧⌘A | Vista previa, ampliar la página, ampliar a la selección |
| ⌘, | Ajustes |
| ⌘. | Detener el láser |
