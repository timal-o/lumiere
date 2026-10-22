// Site de téléchargement de Lumière : langue, système détecté, liens vers la dernière version,
// étapes d'installation, partage. Aucun service externe à part l'API publique de GitHub.

const REPO = "timal-o/lumiere";
const SITE = "https://timal-o.github.io/lumiere/";
const RELEASES = `https://github.com/${REPO}/releases/latest`;

const T = {
  fr: {
    navInstall: "Installer", navLaser: "Brancher le laser", navFaq: "Questions",
    heroA: "Votre graveur laser,", heroB: "sans abonnement.",
    lead: "Lumière est un logiciel gratuit pour dessiner, préparer et lancer vos gravures et découpes laser. Simple à prendre en main, complet quand vous en avez besoin.",
    pillFree: "✅ 100 % gratuit", pillNoAccount: "🔓 Sans compte ni licence", pillLang: "🇫🇷 En français", pillOs: "💻 Windows · Mac · Linux",
    dlGeneric: "Télécharger Lumière", dlFor: "Télécharger pour {os}", otherOs: "Autres systèmes et fichiers",
    macArm: "Mac avec puce Apple", macArmHint: "M1, M2, M3, M4… (depuis fin 2020)", macIntel: "Mac Intel", macIntelHint: "Mac plus anciens",
    mobile: "📱 Vous êtes sur téléphone : Lumière s'installe sur l'ordinateur relié à votre graveur. Envoyez-vous le lien avec les boutons de partage plus bas !",
    version: "Version {v}",
    whatTitle: "Tout ce qu'il faut pour graver", whatSub: "De l'idée à la pièce finie, sans changer de logiciel.",
    f1t: "Dessiner", f1: "Formes, textes, courbes : créez vos motifs directement, ou modifiez ceux que vous importez.",
    f2t: "Graver des photos", f2: "Transformez une photo en gravure réussie grâce aux réglages d'image et aux tramages.",
    f3t: "Cadrer avant de graver", f3: "Le laser suit le contour du travail pour vérifier sa place sur la pièce, avant d'allumer pour de vrai.",
    f4t: "Textes, QR codes, numéros", f4: "Polices de votre ordinateur, QR codes (même pour un Wi-Fi), numéros de série qui s'incrémentent tout seuls.",
    f5t: "Vos fichiers", f5: "SVG, DXF, PDF, images… et les projets LightBurn (.lbrn) s'ouvrent directement.",
    f6t: "Caméra", f6: "Avec une caméra au-dessus du plateau, placez vos dessins pile sur la pièce.",
    installTitle: "Installer en 3 étapes", installSub: "Choisissez votre ordinateur. Comptez deux minutes.",
    w1t: "Téléchargez", w1: "Cliquez sur le gros bouton orange en haut de la page. Le fichier « Lumiere…setup.exe » arrive dans vos Téléchargements.",
    w2t: "Lancez l'installation", w2: "Double-cliquez sur le fichier. Si Windows affiche « Windows a protégé votre ordinateur », cliquez sur « Informations complémentaires » puis « Exécuter quand même ».",
    w3t: "Ouvrez Lumière", w3: "Suivez l'installation, puis ouvrez Lumière depuis le menu Démarrer.",
    m1t: "Ouvrez le Terminal", m1: "Appuyez sur ⌘ + Espace, tapez « Terminal » puis Entrée. Une fenêtre s'ouvre.",
    m2t: "Collez cette ligne", m2: "Cliquez sur « Copier », puis collez dans le Terminal (⌘ + V).",
    m3t: "Appuyez sur Entrée", m3: "Lumière se télécharge, s'installe dans Applications et s'ouvre tout seul. Pour mettre à jour plus tard, refaites la même chose.",
    l1t: "Téléchargez", l1: "Le fichier .AppImage marche sur presque toutes les distributions. Sur Ubuntu ou Debian, vous pouvez aussi prendre le .deb (liste complète plus bas).",
    l2t: "Rendez-le exécutable", l2: "Clic droit sur le fichier → Propriétés → Permissions → cochez « Autoriser l'exécution ». Double-cliquez pour lancer.",
    l3t: "Accès au port USB", l3: "Pour parler au laser, votre compte doit être dans le groupe « dialout » : tapez sudo usermod -aG dialout $USER dans un terminal, puis déconnectez-vous et reconnectez-vous.",
    whyWarning: "🛡️ Pourquoi cet avertissement ? Lumière est un projet gratuit : il n'a pas (encore) payé les certificats de Microsoft et d'Apple. Le code est public et vérifiable sur GitHub.",
    laserTitle: "Brancher votre laser", laserSub: "Lumière pilote les graveurs laser à contrôleur GRBL, comme la plupart des lasers à diode du marché.",
    c1t: "Branchez le câble USB", c1: "Reliez le graveur à l'ordinateur et allumez-le.",
    c2t: "Trouvez votre laser", c2: "Dans Lumière : menu Outils laser → « Trouver mon laser… ». Le logiciel cherche votre graveur et lit sa taille tout seul.",
    c3t: "Rien n'est trouvé ?", c3: "Essayez un autre câble USB (certains ne font que charger) et installez le pilote USB fourni par le fabricant du laser — souvent appelé « CH340 ».",
    c4t: "Premier essai", c4: "Ouvrez un dessin simple, cliquez sur « Cadrer » pour vérifier la position, puis « Démarrer » à faible puissance.",
    brandsTitle: "Marques souvent équipées d'un contrôleur GRBL :", brandsMore: "et bien d'autres",
    safety: "⚠️ Un laser peut blesser les yeux et mettre le feu. Portez des lunettes adaptées à votre laser, ne laissez jamais un travail sans surveillance et gardez un extincteur à portée.",
    faqTitle: "Questions fréquentes",
    q1: "C'est vraiment gratuit ?", a1: "Oui. Pas d'essai, pas d'abonnement, pas de compte. Lumière est un logiciel libre (licence GPL) : il le restera.",
    q2: "J'utilise LightBurn, je peux récupérer mes fichiers ?", a2: "Oui : Lumière ouvre les projets .lbrn et .lbrn2, et importe les bibliothèques de matériaux .clb. Les menus et les raccourcis sont organisés de la même façon.",
    q3: "Mon laser est-il compatible ?", a3: "Si c'est un laser à diode récent, il a très probablement un contrôleur GRBL : c'est le cas le plus courant, et celui qui est le mieux testé. Marlin et Smoothieware sont aussi pris en charge.",
    q4: "Faut-il une connexion Internet ?", a4: "Non. Une fois installé, Lumière fonctionne entièrement hors ligne.",
    q5: "Le Mac dit que l'application est « endommagée »", a5: "C'est la protection de macOS pour les applications téléchargées hors App Store. Ouvrez l'app Terminal et tapez : xattr -dr com.apple.quarantine /Applications/Lumière.app — puis relancez Lumière.",
    q6: "Où trouver de l'aide ?", a6: "Le guide complet est sur GitHub, et vous pouvez poser vos questions ou signaler un souci dans l'onglet « Issues » du projet.",
    allTitle: "Tous les fichiers", allSub: "Pour choisir vous-même le bon fichier.",
    shareTitle: "Partagez Lumière", shareSub: "Un ami, un club, un groupe de passionnés de gravure ? Envoyez-leur le lien.",
    shareBtn: "Partager", copy: "Copier", copied: "Lien copié !", shareText: "Lumière : un logiciel gratuit pour graveur laser (Windows, Mac, Linux)",
    footer: "Lumière — logiciel libre sous licence GPL-3.0", guide: "Guide d'utilisation", help: "Aide et signalements",
    disclaimer: "Projet indépendant, sans lien avec les fabricants de lasers ni les éditeurs de logiciels cités.",
    osWin: "Windows", osMac: "Mac", osLinux: "Linux",
    kWinExe: "Windows — installeur", kWinMsi: "Windows — paquet MSI", kMacArm: "Mac à puce Apple", kMacIntel: "Mac Intel", kAppImage: "Linux — AppImage", kDeb: "Linux — .deb (Ubuntu, Debian)", kRpm: "Linux — .rpm (Fedora)",
    macDmgNote: "Vous préférez le fichier .dmg du bouton orange ? Sur les Mac récents, macOS dira que Lumière est « endommagée » (le logiciel n'est pas encore signé par Apple). Dans ce cas, collez dans le Terminal : xattr -dr com.apple.quarantine /Applications/Lumière.app",
    cmdCopied: "Commande copiée ! Collez-la dans le Terminal.",
    macInstall: "Installer sur Mac",
    macInstallHint: "En une ligne, sans message d'erreur — ou fichiers .dmg ci-dessous",
  },
  en: {
    navInstall: "Install", navLaser: "Connect your laser", navFaq: "FAQ",
    heroA: "Your laser engraver,", heroB: "no subscription.",
    lead: "Lumière is free software to design, prepare and run your laser engravings and cuts. Easy to start with, complete when you need it.",
    pillFree: "✅ 100% free", pillNoAccount: "🔓 No account, no licence", pillLang: "🌍 EN · FR · ES · 中文", pillOs: "💻 Windows · Mac · Linux",
    dlGeneric: "Download Lumière", dlFor: "Download for {os}", otherOs: "Other systems and files",
    macArm: "Mac with Apple chip", macArmHint: "M1, M2, M3, M4… (since late 2020)", macIntel: "Intel Mac", macIntelHint: "Older Macs",
    mobile: "📱 You are on a phone: Lumière installs on the computer connected to your engraver. Send yourself the link with the share buttons below!",
    version: "Version {v}",
    whatTitle: "Everything you need to engrave", whatSub: "From idea to finished piece, without switching software.",
    f1t: "Draw", f1: "Shapes, text, curves: create your designs directly, or edit the ones you import.",
    f2t: "Engrave photos", f2: "Turn a photo into a great engraving with image settings and dithering.",
    f3t: "Frame before you burn", f3: "The laser traces the outline of the job so you can check its position on the material first.",
    f4t: "Text, QR codes, numbers", f4: "Your computer's fonts, QR codes (even for Wi-Fi), serial numbers that count up by themselves.",
    f5t: "Your files", f5: "SVG, DXF, PDF, images… and LightBurn projects (.lbrn) open directly.",
    f6t: "Camera", f6: "With a camera above the bed, place your designs right on the material.",
    installTitle: "Install in 3 steps", installSub: "Pick your computer. It takes about two minutes.",
    w1t: "Download", w1: "Click the big orange button at the top of the page. The file “Lumiere…setup.exe” lands in your Downloads.",
    w2t: "Run the installer", w2: "Double-click the file. If Windows says “Windows protected your PC”, click “More info”, then “Run anyway”.",
    w3t: "Open Lumière", w3: "Follow the installer, then open Lumière from the Start menu.",
    m1t: "Open Terminal", m1: "Press ⌘ + Space, type “Terminal” and press Enter. A window opens.",
    m2t: "Paste this line", m2: "Click “Copy”, then paste it into Terminal (⌘ + V).",
    m3t: "Press Enter", m3: "Lumière downloads, installs into Applications and opens by itself. To update later, do the same again.",
    l1t: "Download", l1: "The .AppImage file works on almost every distribution. On Ubuntu or Debian you can also take the .deb (full list below).",
    l2t: "Make it executable", l2: "Right-click the file → Properties → Permissions → tick “Allow executing file as program”. Double-click to start.",
    l3t: "USB port access", l3: "To talk to the laser, your account must be in the “dialout” group: run sudo usermod -aG dialout $USER in a terminal, then log out and back in.",
    whyWarning: "🛡️ Why this warning? Lumière is a free project: it has not (yet) paid for Microsoft and Apple certificates. The code is public and can be checked on GitHub.",
    laserTitle: "Connect your laser", laserSub: "Lumière drives laser engravers with a GRBL controller, like most diode lasers on the market.",
    c1t: "Plug in the USB cable", c1: "Connect the engraver to the computer and switch it on.",
    c2t: "Find your laser", c2: "In Lumière: Laser Tools menu → “Find My Laser…”. It looks for your engraver and reads its size by itself.",
    c3t: "Nothing found?", c3: "Try another USB cable (some only charge) and install the USB driver from your laser's maker — often called “CH340”.",
    c4t: "First test", c4: "Open a simple design, click “Frame” to check the position, then “Start” at low power.",
    brandsTitle: "Brands often fitted with a GRBL controller:", brandsMore: "and many more",
    safety: "⚠️ A laser can hurt your eyes and start fires. Wear glasses rated for your laser, never leave a job unattended and keep a fire extinguisher nearby.",
    faqTitle: "Frequently asked questions",
    q1: "Is it really free?", a1: "Yes. No trial, no subscription, no account. Lumière is free software (GPL licence) and will stay that way.",
    q2: "I use LightBurn — can I keep my files?", a2: "Yes: Lumière opens .lbrn and .lbrn2 projects and imports .clb material libraries. Menus and shortcuts are organised the same way.",
    q3: "Will my laser work?", a3: "If it is a recent diode laser, it most likely has a GRBL controller: that is the most common case and the best tested one. Marlin and Smoothieware are supported too.",
    q4: "Do I need an Internet connection?", a4: "No. Once installed, Lumière works fully offline.",
    q5: "My Mac says the app is “damaged”", a5: "That is macOS protecting apps downloaded outside the App Store. Open the Terminal app and type: xattr -dr com.apple.quarantine /Applications/Lumière.app — then start Lumière again.",
    q6: "Where can I get help?", a6: "The full guide is on GitHub, and you can ask questions or report a problem in the project's “Issues” tab.",
    allTitle: "All files", allSub: "To pick the right file yourself.",
    shareTitle: "Share Lumière", shareSub: "A friend, a club, an engraving group? Send them the link.",
    shareBtn: "Share", copy: "Copy", copied: "Link copied!", shareText: "Lumière: free software for laser engravers (Windows, Mac, Linux)",
    footer: "Lumière — free software under the GPL-3.0 licence", guide: "User guide", help: "Help and bug reports",
    disclaimer: "Independent project, not affiliated with the laser makers or software publishers mentioned.",
    osWin: "Windows", osMac: "Mac", osLinux: "Linux",
    kWinExe: "Windows — installer", kWinMsi: "Windows — MSI package", kMacArm: "Mac with Apple chip", kMacIntel: "Intel Mac", kAppImage: "Linux — AppImage", kDeb: "Linux — .deb (Ubuntu, Debian)", kRpm: "Linux — .rpm (Fedora)",
    macDmgNote: "Prefer the .dmg file from the orange button? On recent Macs, macOS will say Lumière is “damaged” (the app is not signed by Apple yet). In that case, paste into Terminal: xattr -dr com.apple.quarantine /Applications/Lumière.app",
    cmdCopied: "Command copied! Paste it into Terminal.",
    macInstall: "Install on Mac",
    macInstallHint: "In one line, no error message — or .dmg files below",
  },
  es: {
    navInstall: "Instalar", navLaser: "Conectar el láser", navFaq: "Preguntas",
    heroA: "Tu grabador láser,", heroB: "sin suscripción.",
    lead: "Lumière es un programa gratuito para diseñar, preparar y lanzar tus grabados y cortes láser. Fácil para empezar, completo cuando lo necesitas.",
    pillFree: "✅ 100 % gratis", pillNoAccount: "🔓 Sin cuenta ni licencia", pillLang: "🇪🇸 En español", pillOs: "💻 Windows · Mac · Linux",
    dlGeneric: "Descargar Lumière", dlFor: "Descargar para {os}", otherOs: "Otros sistemas y archivos",
    macArm: "Mac con chip Apple", macArmHint: "M1, M2, M3, M4… (desde finales de 2020)", macIntel: "Mac Intel", macIntelHint: "Mac más antiguos",
    mobile: "📱 Estás en un teléfono: Lumière se instala en el ordenador conectado a tu grabador. ¡Envíate el enlace con los botones de compartir de abajo!",
    version: "Versión {v}",
    whatTitle: "Todo lo necesario para grabar", whatSub: "De la idea a la pieza terminada, sin cambiar de programa.",
    f1t: "Dibujar", f1: "Formas, textos, curvas: crea tus diseños o modifica los que importes.",
    f2t: "Grabar fotos", f2: "Convierte una foto en un buen grabado con los ajustes de imagen y los tramados.",
    f3t: "Encuadrar antes de grabar", f3: "El láser recorre el contorno del trabajo para comprobar su posición en el material.",
    f4t: "Textos, QR, números", f4: "Las fuentes de tu ordenador, códigos QR (incluso para Wi-Fi) y números de serie automáticos.",
    f5t: "Tus archivos", f5: "SVG, DXF, PDF, imágenes… y los proyectos de LightBurn (.lbrn) se abren directamente.",
    f6t: "Cámara", f6: "Con una cámara sobre la mesa, coloca tus diseños justo encima de la pieza.",
    installTitle: "Instalar en 3 pasos", installSub: "Elige tu ordenador. Son unos dos minutos.",
    w1t: "Descarga", w1: "Haz clic en el botón naranja de arriba. El archivo «Lumiere…setup.exe» llega a tus Descargas.",
    w2t: "Instala", w2: "Haz doble clic en el archivo. Si Windows muestra «Windows protegió su PC», haz clic en «Más información» y luego en «Ejecutar de todas formas».",
    w3t: "Abre Lumière", w3: "Sigue el instalador y abre Lumière desde el menú Inicio.",
    m1t: "Abre Terminal", m1: "Pulsa ⌘ + Espacio, escribe «Terminal» y pulsa Intro. Se abre una ventana.",
    m2t: "Pega esta línea", m2: "Haz clic en «Copiar» y pégala en Terminal (⌘ + V).",
    m3t: "Pulsa Intro", m3: "Lumière se descarga, se instala en Aplicaciones y se abre solo. Para actualizar más tarde, repite lo mismo.",
    l1t: "Descarga", l1: "El archivo .AppImage funciona en casi todas las distribuciones. En Ubuntu o Debian también puedes usar el .deb (lista completa abajo).",
    l2t: "Hazlo ejecutable", l2: "Clic derecho en el archivo → Propiedades → Permisos → marca «Permitir ejecutar como programa». Doble clic para abrir.",
    l3t: "Acceso al puerto USB", l3: "Para hablar con el láser, tu cuenta debe estar en el grupo «dialout»: escribe sudo usermod -aG dialout $USER en un terminal y vuelve a iniciar sesión.",
    whyWarning: "🛡️ ¿Por qué este aviso? Lumière es un proyecto gratuito: aún no ha pagado los certificados de Microsoft y Apple. El código es público y verificable en GitHub.",
    laserTitle: "Conecta tu láser", laserSub: "Lumière controla grabadores con controlador GRBL, como la mayoría de los láseres de diodo del mercado.",
    c1t: "Conecta el cable USB", c1: "Une el grabador al ordenador y enciéndelo.",
    c2t: "Busca tu láser", c2: "En Lumière: menú Herramientas láser → «Buscar mi láser…». Encuentra el grabador y lee su tamaño solo.",
    c3t: "¿No encuentra nada?", c3: "Prueba otro cable USB (algunos solo cargan) e instala el controlador USB del fabricante del láser, a menudo llamado «CH340».",
    c4t: "Primera prueba", c4: "Abre un diseño sencillo, pulsa «Encuadrar» para comprobar la posición y luego «Iniciar» a baja potencia.",
    brandsTitle: "Marcas que suelen llevar un controlador GRBL:", brandsMore: "y muchas más",
    safety: "⚠️ Un láser puede dañar los ojos y provocar incendios. Usa gafas adecuadas para tu láser, no dejes nunca un trabajo sin vigilancia y ten un extintor a mano.",
    faqTitle: "Preguntas frecuentes",
    q1: "¿De verdad es gratis?", a1: "Sí. Sin prueba, sin suscripción, sin cuenta. Lumière es software libre (licencia GPL) y lo seguirá siendo.",
    q2: "Uso LightBurn, ¿puedo conservar mis archivos?", a2: "Sí: Lumière abre proyectos .lbrn y .lbrn2 e importa bibliotecas de materiales .clb. Los menús y atajos están organizados igual.",
    q3: "¿Mi láser es compatible?", a3: "Si es un láser de diodo reciente, casi seguro tiene un controlador GRBL: es el caso más habitual y el mejor probado. Marlin y Smoothieware también son compatibles.",
    q4: "¿Hace falta Internet?", a4: "No. Una vez instalado, Lumière funciona totalmente sin conexión.",
    q5: "El Mac dice que la app está «dañada»", a5: "Es la protección de macOS para apps descargadas fuera del App Store. Abre Terminal y escribe: xattr -dr com.apple.quarantine /Applications/Lumière.app — y vuelve a abrir Lumière.",
    q6: "¿Dónde encuentro ayuda?", a6: "La guía completa está en GitHub, y puedes hacer preguntas o informar de un problema en la pestaña «Issues» del proyecto.",
    allTitle: "Todos los archivos", allSub: "Para elegir tú mismo el archivo correcto.",
    shareTitle: "Comparte Lumière", shareSub: "¿Un amigo, un club, un grupo de grabado? Envíales el enlace.",
    shareBtn: "Compartir", copy: "Copiar", copied: "¡Enlace copiado!", shareText: "Lumière: programa gratuito para grabadores láser (Windows, Mac, Linux)",
    footer: "Lumière — software libre con licencia GPL-3.0", guide: "Guía de uso", help: "Ayuda e incidencias",
    disclaimer: "Proyecto independiente, sin relación con los fabricantes de láseres ni los editores de software mencionados.",
    osWin: "Windows", osMac: "Mac", osLinux: "Linux",
    kWinExe: "Windows — instalador", kWinMsi: "Windows — paquete MSI", kMacArm: "Mac con chip Apple", kMacIntel: "Mac Intel", kAppImage: "Linux — AppImage", kDeb: "Linux — .deb (Ubuntu, Debian)", kRpm: "Linux — .rpm (Fedora)",
    macDmgNote: "¿Prefieres el archivo .dmg del botón naranja? En los Mac recientes, macOS dirá que Lumière está «dañada» (la app aún no está firmada por Apple). En ese caso, pega en Terminal: xattr -dr com.apple.quarantine /Applications/Lumière.app",
    cmdCopied: "¡Comando copiado! Pégalo en Terminal.",
    macInstall: "Instalar en Mac",
    macInstallHint: "En una línea, sin mensajes de error — o archivos .dmg abajo",
  },
  zh: {
    navInstall: "安装", navLaser: "连接激光器", navFaq: "常见问题",
    heroA: "你的激光雕刻机，", heroB: "无需订阅。",
    lead: "Lumière 是一款免费软件，用于设计、准备和运行激光雕刻与切割。上手简单，需要时功能齐全。",
    pillFree: "✅ 完全免费", pillNoAccount: "🔓 无需账号和许可证", pillLang: "🇨🇳 简体中文", pillOs: "💻 Windows · Mac · Linux",
    dlGeneric: "下载 Lumière", dlFor: "下载 {os} 版", otherOs: "其他系统和文件",
    macArm: "Apple 芯片的 Mac", macArmHint: "M1、M2、M3、M4…（2020 年底起）", macIntel: "Intel 芯片的 Mac", macIntelHint: "较早的 Mac",
    mobile: "📱 你正在使用手机：Lumière 需安装在连接雕刻机的电脑上。用下方的分享按钮把链接发给自己吧！",
    version: "版本 {v}",
    whatTitle: "雕刻所需的一切", whatSub: "从创意到成品，无需切换软件。",
    f1t: "绘图", f1: "图形、文字、曲线：直接创作，或修改导入的设计。",
    f2t: "雕刻照片", f2: "通过图像调整和抖动设置，把照片变成出色的雕刻作品。",
    f3t: "雕刻前取景", f3: "激光头先沿作业轮廓移动，确认在材料上的位置。",
    f4t: "文字、二维码、编号", f4: "使用电脑字体、二维码（甚至 Wi-Fi）和自动递增的序列号。",
    f5t: "你的文件", f5: "SVG、DXF、PDF、图片……以及 LightBurn 项目（.lbrn）都能直接打开。",
    f6t: "摄像头", f6: "在工作台上方装一个摄像头，就能把设计准确放到材料上。",
    installTitle: "三步安装", installSub: "选择你的电脑，大约两分钟。",
    w1t: "下载", w1: "点击页面顶部的橙色大按钮，文件“Lumiere…setup.exe”会保存到“下载”文件夹。",
    w2t: "运行安装程序", w2: "双击文件。如果 Windows 显示“Windows 已保护你的电脑”，点击“更多信息”，再点击“仍要运行”。",
    w3t: "打开 Lumière", w3: "完成安装后，从开始菜单打开 Lumière。",
    m1t: "打开“终端”", m1: "按 ⌘ + 空格，输入“终端”（Terminal）并按回车，会打开一个窗口。",
    m2t: "粘贴这一行", m2: "点击“复制”，然后粘贴到终端中（⌘ + V）。",
    m3t: "按回车", m3: "Lumière 会自动下载、安装到“应用程序”并打开。以后更新时再执行一次即可。",
    l1t: "下载", l1: ".AppImage 文件几乎适用于所有发行版。Ubuntu 或 Debian 也可以使用 .deb（完整列表见下方）。",
    l2t: "设为可执行", l2: "右键文件 → 属性 → 权限 → 勾选“允许作为程序执行文件”，然后双击启动。",
    l3t: "USB 端口权限", l3: "要与激光器通信，你的账户需加入“dialout”组：在终端运行 sudo usermod -aG dialout $USER，然后注销并重新登录。",
    whyWarning: "🛡️ 为什么会有警告？Lumière 是免费项目，暂未购买微软和苹果的证书。代码公开，可在 GitHub 上查验。",
    laserTitle: "连接你的激光器", laserSub: "Lumière 可控制采用 GRBL 控制器的激光雕刻机——市面上大多数二极管激光器都是如此。",
    c1t: "连接 USB 线", c1: "把雕刻机连接到电脑并开机。",
    c2t: "查找激光器", c2: "在 Lumière 中：激光工具菜单 → “查找我的激光器…”。软件会自动找到雕刻机并读取其尺寸。",
    c3t: "没找到？", c3: "换一根 USB 线试试（有些线只能充电），并安装激光器厂商提供的 USB 驱动——通常叫“CH340”。",
    c4t: "首次测试", c4: "打开一个简单的设计，点击“取景”确认位置，然后以低功率点击“开始”。",
    brandsTitle: "常用 GRBL 控制器的品牌：", brandsMore: "等等",
    safety: "⚠️ 激光可能伤害眼睛并引发火灾。请佩戴适合你激光器的护目镜，切勿让作业无人看管，并在附近备好灭火器。",
    faqTitle: "常见问题",
    q1: "真的免费吗？", a1: "是的。没有试用期、没有订阅、无需账号。Lumière 是自由软件（GPL 许可证），并将一直如此。",
    q2: "我在用 LightBurn，能保留我的文件吗？", a2: "可以：Lumière 能打开 .lbrn 和 .lbrn2 项目，并导入 .clb 材料库。菜单和快捷键的组织方式相同。",
    q3: "我的激光器兼容吗？", a3: "如果是较新的二极管激光器，它很可能使用 GRBL 控制器——这是最常见、测试最充分的情况。也支持 Marlin 和 Smoothieware。",
    q4: "需要联网吗？", a4: "不需要。安装后，Lumière 可完全离线使用。",
    q5: "Mac 提示应用“已损坏”", a5: "这是 macOS 对 App Store 以外下载应用的保护。打开“终端”并输入：xattr -dr com.apple.quarantine /Applications/Lumière.app ——然后重新打开 Lumière。",
    q6: "在哪里获得帮助？", a6: "完整指南在 GitHub 上，你也可以在项目的“Issues”页面提问或报告问题。",
    allTitle: "所有文件", allSub: "自行选择合适的文件。",
    shareTitle: "分享 Lumière", shareSub: "朋友、俱乐部、雕刻爱好者群？把链接发给他们吧。",
    shareBtn: "分享", copy: "复制", copied: "链接已复制！", shareText: "Lumière：免费的激光雕刻软件（Windows、Mac、Linux）",
    footer: "Lumière —— 基于 GPL-3.0 许可证的自由软件", guide: "用户指南", help: "帮助与问题反馈",
    disclaimer: "独立项目，与文中提及的激光器厂商和软件发行商无关。",
    osWin: "Windows", osMac: "Mac", osLinux: "Linux",
    kWinExe: "Windows — 安装程序", kWinMsi: "Windows — MSI 安装包", kMacArm: "Apple 芯片的 Mac", kMacIntel: "Intel 芯片的 Mac", kAppImage: "Linux — AppImage", kDeb: "Linux — .deb（Ubuntu、Debian）", kRpm: "Linux — .rpm（Fedora）",
    macDmgNote: "想用橙色按钮下载的 .dmg 文件？在较新的 Mac 上，macOS 会提示 Lumière“已损坏”（应用尚未经过 Apple 签名）。这时请在终端中粘贴：xattr -dr com.apple.quarantine /Applications/Lumière.app",
    cmdCopied: "命令已复制！请粘贴到终端中。",
    macInstall: "在 Mac 上安装",
    macInstallHint: "一行命令，无错误提示——或使用下方的 .dmg 文件",
  },
};

// ------------------------------------------------------------------ Langue

const pick = () => {
  try {
    const saved = localStorage.getItem("lumiere-site-lang");
    if (saved && T[saved]) return saved;
  } catch { /* stockage indisponible */ }
  const l = (navigator.language || "fr").toLowerCase();
  return l.startsWith("zh") ? "zh" : l.startsWith("es") ? "es" : l.startsWith("en") ? "en" : "fr";
};
let lang = pick();
const tr = (k, vars = {}) => (T[lang][k] ?? T.fr[k] ?? k).replace(/\{(\w+)\}/g, (_, n) => vars[n] ?? "");

function applyLang() {
  document.documentElement.lang = lang === "zh" ? "zh-CN" : lang;
  document.querySelectorAll("[data-i18n]").forEach((el) => (el.textContent = tr(el.dataset.i18n)));
  document.getElementById("lang").value = lang;
  render();
  shareLinks();
}

document.getElementById("lang").addEventListener("change", (e) => {
  lang = e.target.value;
  try { localStorage.setItem("lumiere-site-lang", lang); } catch { /* ignoré */ }
  applyLang();
});

// ----------------------------------------------------------- Système détecté

const ua = navigator.userAgent;
const mobile = /Android|iPhone|iPad|iPod/i.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua) && !/Chrome/.test(ua) && screen.width < 1100);
const os = /Windows/i.test(ua) ? "win" : /Mac/i.test(ua) && !mobile ? "mac" : /Linux|X11/i.test(ua) && !/Android/i.test(ua) ? "linux" : "win";
let macArch = null; // "arm" | "intel" | null (inconnu)
if (navigator.userAgentData?.getHighEntropyValues) {
  navigator.userAgentData.getHighEntropyValues(["architecture"]).then((v) => {
    if (os === "mac" && v.architecture) {
      macArch = v.architecture === "arm" ? "arm" : "intel";
      render();
    }
  }).catch(() => {});
}

// ------------------------------------------------------- Dernière version

let assets = [];
let version = "";
const find = (re) => assets.find((a) => re.test(a.name));
const files = () => ({
  winExe: find(/x64-setup\.exe$/i), winMsi: find(/\.msi$/i),
  macArm: find(/aarch64\.dmg$/i), macIntel: find(/x64\.dmg$/i),
  appImage: find(/\.AppImage$/i), deb: find(/\.deb$/i), rpm: find(/\.rpm$/i),
});

fetch(`https://api.github.com/repos/${REPO}/releases/latest`)
  .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
  .then((rel) => {
    assets = rel.assets || [];
    version = (rel.tag_name || "").replace(/^v/, "");
    render();
  })
  .catch(() => render());

const size = (a) => (a ? ` · ${(a.size / 1e6).toFixed(0)} ${lang === "fr" ? "Mo" : "MB"}` : "");

function render() {
  const f = files();
  const primary = document.getElementById("dlPrimary");
  const macChoice = document.getElementById("macChoice");
  const link = (a) => (a ? a.browser_download_url : RELEASES);
  document.getElementById("version").textContent = version ? `${tr("version", { v: version })} · ` : "";
  document.getElementById("mobileNote").classList.toggle("hide", !mobile);
  macChoice.classList.add("hide");
  primary.classList.remove("hide");
  if (os === "win") {
    primary.href = link(f.winExe);
    document.getElementById("dlLabel").textContent = tr("dlFor", { os: tr("osWin") });
    document.getElementById("dlDetail").textContent = `Windows 10 / 11${size(f.winExe)}`;
  } else if (os === "linux") {
    primary.href = link(f.appImage);
    document.getElementById("dlLabel").textContent = tr("dlFor", { os: tr("osLinux") });
    document.getElementById("dlDetail").textContent = `AppImage${size(f.appImage)}`;
  } else {
    // Mac : l'installation en une ligne évite le message « endommagée » des versions récentes
    // de macOS (application pas encore signée par Apple) ; les .dmg restent proposés dessous.
    primary.href = "#install";
    document.getElementById("dlLabel").textContent = tr("macInstall");
    document.getElementById("dlDetail").textContent = tr("macInstallHint");
    macChoice.classList.remove("hide");
    document.getElementById("dlMacArm").href = link(f.macArm);
    document.getElementById("dlMacIntel").href = link(f.macIntel);
  }
  // Tous les fichiers.
  const list = [["kWinExe", f.winExe, "🪟"], ["kWinMsi", f.winMsi, "🪟"], ["kMacArm", f.macArm, "🍎"], ["kMacIntel", f.macIntel, "🍎"], ["kAppImage", f.appImage, "🐧"], ["kDeb", f.deb, "🐧"], ["kRpm", f.rpm, "🐧"]];
  document.getElementById("allFiles").innerHTML = list.map(([k, a, ico]) =>
    `<a class="card" style="text-decoration:none;color:inherit" href="${link(a)}"><div class="ico">${ico}</div><h3>${tr(k)}</h3><p>${a ? `${a.name}${size(a)}` : "GitHub Releases"}</p></a>`).join("");
}

// --------------------------------------------------------- Onglets d'installation

function showOs(o) {
  document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("on", b.dataset.os === o));
  document.querySelectorAll("[data-panel]").forEach((p) => p.classList.toggle("hide", p.dataset.panel !== o));
  document.querySelectorAll("[data-panel-note]").forEach((p) => p.classList.toggle("hide", p.dataset.panelNote !== o));
}
document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => showOs(b.dataset.os)));
showOs(os);

// Capture d'écran claire ou sombre selon le thème du visiteur.
const dark = matchMedia("(prefers-color-scheme: dark)");
const syncShot = () => (document.getElementById("shot").src = dark.matches ? "assets/screenshot-dark.png" : "assets/screenshot-light.png");
dark.addEventListener?.("change", syncShot);
syncShot();

// ------------------------------------------------------------------- Partage

const url = SITE;
document.getElementById("siteUrl").value = url;
const toast = (msg) => {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("on");
  setTimeout(() => t.classList.remove("on"), 1800);
};
document.getElementById("copy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    const i = document.getElementById("siteUrl");
    i.select();
    document.execCommand("copy");
  }
  toast(tr("copied"));
});
function shareLinks() {
  const text = encodeURIComponent(tr("shareText"));
  const u = encodeURIComponent(url);
  document.getElementById("shWhatsapp").href = `https://wa.me/?text=${text}%20${u}`;
  document.getElementById("shFacebook").href = `https://www.facebook.com/sharer/sharer.php?u=${u}`;
  document.getElementById("shX").href = `https://twitter.com/intent/tweet?text=${text}&url=${u}`;
  document.getElementById("shReddit").href = `https://www.reddit.com/submit?url=${u}&title=${text}`;
  document.getElementById("shMail").href = `mailto:?subject=${text}&body=${text}%0A${u}`;
}
document.getElementById("copyCmd").addEventListener("click", async () => {
  const cmd = document.getElementById("macCmd").textContent;
  try { await navigator.clipboard.writeText(cmd); } catch { /* copie manuelle */ }
  toast(tr("cmdCopied"));
});
const nativeBtn = document.getElementById("nativeShare");
if (navigator.share) {
  nativeBtn.classList.remove("hide");
  nativeBtn.addEventListener("click", () => navigator.share({ title: "Lumière", text: tr("shareText"), url }).catch(() => {}));
}
// QR code du site (pour passer du téléphone à l'ordinateur, ou l'afficher dans un atelier).
try {
  const qr = qrcode(0, "M");
  qr.addData(url);
  qr.make();
  document.getElementById("qr").innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
} catch { /* bibliothèque absente */ }

applyLang();
