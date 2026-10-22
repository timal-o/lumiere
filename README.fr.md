<p align="center">
  <img src="docs/assets/banner.svg" alt="Lumière — logiciel libre de gravure et de découpe laser" width="100%">
</p>

<p align="center">
  <a href="https://github.com/timal-o/lumiere/releases/latest"><img alt="Version" src="https://img.shields.io/github/v/release/timal-o/lumiere?style=flat-square&color=ff5a36&label=version"></a>
  <a href="LICENSE"><img alt="Licence : GPL-3.0" src="https://img.shields.io/badge/licence-GPL--3.0-2ea44f?style=flat-square"></a>
  <a href="https://github.com/timal-o/lumiere/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/timal-o/lumiere/ci.yml?style=flat-square&label=CI"></a>
  <img alt="Plateformes" src="https://img.shields.io/badge/plateformes-macOS%20%7C%20Windows%20%7C%20Linux-555?style=flat-square">
  <a href="https://github.com/timal-o/lumiere/releases"><img alt="Téléchargements" src="https://img.shields.io/github/downloads/timal-o/lumiere/total?style=flat-square&color=blue&label=t%C3%A9l%C3%A9chargements"></a>
  <a href="https://github.com/timal-o/lumiere/stargazers"><img alt="Étoiles" src="https://img.shields.io/github/stars/timal-o/lumiere?style=flat-square&color=f5a524&label=%C3%A9toiles"></a>
</p>

<p align="center">
  <img alt="Tauri 2" src="https://img.shields.io/badge/Tauri-2-24C8DB?style=flat-square&logo=tauri&logoColor=white">
  <img alt="Rust" src="https://img.shields.io/badge/Rust-c%C5%93ur-000000?style=flat-square&logo=rust&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-interface-3178C6?style=flat-square&logo=typescript&logoColor=white">
  <img alt="React" src="https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black">
  <img alt="Tests" src="https://img.shields.io/badge/tests-226%20r%C3%A9ussis-2ea44f?style=flat-square">
  <img alt="Langues" src="https://img.shields.io/badge/interface-EN%20%C2%B7%20FR%20%C2%B7%20ES%20%C2%B7%20%E4%B8%AD%E6%96%87-8a63d2?style=flat-square">
  <a href="CONTRIBUTING.md"><img alt="Contributions bienvenues" src="https://img.shields.io/badge/PR-bienvenues-ff69b4?style=flat-square"></a>
</p>

<p align="center">
  <a href="README.md">English</a> · <b>Français</b> · <a href="README.es.md">Español</a> · <a href="README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <b>Dessinez, cadrez, gravez.</b> Une chaîne complète, moderne et libre pour lasers à diode et CO₂ —<br>
  du premier croquis à la dernière passe, dans une application rapide que chacun peut lire, corriger et enrichir.
</p>

<p align="center">
  <img src="docs/assets/screenshot-dark.png" alt="Lumière : un dessous de verre et une étiquette QR sur le plan de travail, avec le panneau des calques" width="92%">
</p>

| 🎯 | **Ce que vous obtenez** |
|:-:|---|
| 🖊️ | Un vrai éditeur vectoriel — courbes de Bézier, nœuds, opérations booléennes, décalages, répétitions, imbrication |
| 🔥 | Tous les réglages de découpe attendus — remplissage, ligne, image, remplissage par zones, rampes, attaches, amorces, sous-calques |
| 🔌 | Pilotage direct de **GRBL**, **Marlin** et **Smoothieware** en USB ou en réseau |
| 📂 | Ouvre **SVG · DXF · AI · EPS · PDF · HPGL · Gerber · STL · OBJ · 3MF** et les projets **LightBurn** |
| 🌍 | Interface en **English, Français, Español, 简体中文** — une langue de plus tient dans un fichier JSON |
| 🆓 | **GPL-3.0** — ni clé de licence, ni abonnement, ni télémétrie |

---

## ✨ Fonctionnalités

<table>
<tr>
<td width="50%" valign="top">

### 🖊️ Dessin
- Courbes de Bézier et édition complète des nœuds
- Rectangle, ellipse, polygone, étoile, étoile double — paramétriques
- Souder, soustraire, intersecter, exclure, assistant booléen
- Décalage (dedans, dehors, les deux), congés, chanfreins, outil d'arrondi
- Répétitions en grille et circulaires — virtuelles et modifiables
- Copie le long d'un chemin, imbrication (multi-pages), miroir selon une ligne
- Déformations, cisaillement, rotation / échelle à deux points
- Contour généré autour des formes et des images
- Récupération d'arcs et de droites dans les imports segmentés

</td>
<td width="50%" valign="top">

### 🔤 Texte et codes
- Polices du système et polices **SHX** d'AutoCAD à trait simple
- Texte sur un chemin (lettres déformées), texte courbé en arc
- Texte variable : numéros de série, date, heure, **fusion CSV**
- **QR codes** (Wi-Fi, contact, e-mail, URL, logo au centre)
- **DataMatrix** ECC200
- Codes-barres : Code 128, Code 39, EAN, UPC, ITF-14, Codabar

</td>
</tr>
<tr>
<td valign="top">

### 🔥 Calques et réglages de découpe
- Modes ligne, remplissage, remplissage concentrique et image, avec sous-calques
- Remplissage par zones, croisé, angle incrémenté à chaque passe
- Kerf, attaches (manuelles ou par espacement), perforation, dépassement
- Rampes de puissance, rampes pour tampons, amorces, pauses de perçage
- Passes globales, puissance constante (M3), air seulement pendant la découpe
- Bibliothèques de matériaux — et import / export `.clb` de LightBurn
- Grilles de test de matériau, d'intervalle et de focus, avec préréglages

</td>
<td valign="top">

### 🖼️ Images
- Tramages : seuil, ordonné, Floyd–Steinberg, Jarvis, Stucki, Atkinson, demi-teinte, journal, croquis, niveaux de gris
- Luminosité, contraste, gamma, accentuation, débruitage, négatif
- Relief 3D par tranches, cartes de profondeur STL / OBJ / 3MF
- Vectorisation avec aperçu direct : contour, ligne centrale, croquis
- Masques, recadrage, préréglages d'image

</td>
</tr>
<tr>
<td valign="top">

### 🎛️ Pilotage de la machine
- USB série ou TCP, détection automatique du contrôleur
- Déplacements (pas à pas ou continus), origine machine, origine utilisateur, positions enregistrées
- Cadrage : boîte, enveloppe ou contour, laser allumé ou éteint
- Corrections de vitesse et de puissance en direct, pause, reprise, arrêt
- Aperçu de trajectoire avec une durée qui tient compte des accélérations
- Démarrage depuis n'importe quel point de l'aperçu
- Rotatif (rouleaux ou mandrin, axe Y ou A), Z par passe, compensation du jeu

</td>
<td valign="top">

### 🏭 Production
- Incrustation caméra avec calibration de l'objectif et alignement à 9 repères
- Imprimer et découper, recherche de centre, correction conique
- Compteur et journal des travaux, liste de vérification avant le travail
- Pages, bibliothèques d'art, macros, profils, lots
- Mode débutant, thèmes clair et sombre, raccourcis modifiables
- Export SVG, DXF, PDF/AI, G-code et Ruida `.rd`

</td>
</tr>
</table>

> **Vous venez de LightBurn ?** Lumière reprend la même organisation des menus, les mêmes noms et
> les mêmes raccourcis, ouvre vos projets `.lbrn` / `.lbrn2` (calques, réglages, formes, textes
> modifiables) et importe vos bibliothèques de matériaux `.clb`.

<p align="center">
  <img src="docs/assets/screenshot-light.png" alt="Lumière en thème clair" width="80%">
</p>

## 🚀 Démarrage rapide

**Télécharger** — prenez le dernier installeur sur la page [Releases](https://github.com/timal-o/lumiere/releases).

| 🪟 Windows | 🐧 Linux | 🍎 macOS |
|:-:|:-:|:-:|
| `.msi` · `.exe` | `.deb` · `.rpm` · `.AppImage` | `.dmg` (Apple Silicon · Intel) |

> [!NOTE]
> La version macOS n'est pas encore notariée : la première fois, faites un clic droit sur l'application et choisissez **Ouvrir**.

**Compiler** — il faut [Node.js](https://nodejs.org) 18+, [Rust](https://rustup.rs) (stable)
et les [prérequis de Tauri](https://v2.tauri.app/start/prerequisites/) pour votre système.

```sh
git clone https://github.com/timal-o/lumiere.git
cd lumiere
npm install
npm run tauri dev      # lance l'application avec rechargement à chaud
npm run tauri build    # construit un installeur (.dmg, .msi, .deb / .AppImage)
```

Ensuite : **Outils laser → Trouver mon laser…** pour régler la machine, dessinez ou importez un
motif, choisissez un calque, **Cadrer**, **Démarrer**. Le [guide de démarrage](docs/user-guide.fr.md)
détaille chaque étape.

## 🔌 Matériel

| Contrôleur | Liaison | État |
|---|---|---|
| **GRBL 1.1**, FluidNC, grblHAL | USB série, TCP | ✅ Utilisé pour de vraies gravures et découpes |
| **Smoothieware** | USB série, TCP | 🧪 Implémenté et testé, en attente de retours sur machine |
| **Marlin** (mode laser) | USB série, TCP | 🧪 Implémenté et testé, en attente de retours sur machine |
| **Ruida** (DSP CO₂) | UDP, fichier `.rd` | ⚠️ Expérimental |
| Galvo (EZCad / JCZ) | — | 🗺️ Prévu |

> [!WARNING]
> Un laser est dangereux. Portez les lunettes adaptées, ne laissez jamais un travail sans surveillance
> et gardez un extincteur à portée. Testez les nouveaux réglages à faible puissance.

Vous avez essayé Lumière sur une machine absente du tableau ? [Racontez-nous](docs/hardware.md) —
les retours sur matériel sont la contribution la plus précieuse en ce moment.

## 📂 Formats de fichiers

| | Formats |
|---|---|
| **Ouvrir** | `.lum` (Lumière), `.lbrn` / `.lbrn2` (LightBurn) |
| **Importer des vecteurs** | SVG, DXF, AI, EPS, PDF, HPGL / PLT, Gerber (RS-274X) + perçages Excellon |
| **Importer des images** | PNG, JPEG, BMP, GIF, WebP |
| **Importer de la 3D** | STL, OBJ, 3MF → carte de profondeur |
| **Exporter** | SVG, DXF (R12), PDF / AI, G-code, image traitée, Ruida `.rd` |
| **Bibliothèques** | Matériaux (`.json`, `.clb` de LightBurn), art, préréglages d'image et de test, lots |

## 📚 Documentation

| | |
|---|---|
| 📖 [Guide d'utilisation](docs/user-guide.fr.md) | Chaque outil et chaque menu — aussi en [English](docs/user-guide.md), [Español](docs/user-guide.es.md), [简体中文](docs/user-guide.zh-CN.md) |
| 🔧 [Installation du matériel](docs/hardware.md) | Contrôleurs, connexion, réglages GRBL, sécurité (en anglais) |
| 🌍 [Traduire](docs/translating.md) | Ajouter une langue avec un fichier JSON (en anglais) |
| 🏗️ [Architecture](docs/architecture.md) | Organisation du code et génération d'un travail (en anglais) |
| 🗂️ [Format de fichier](docs/file-format.md) | Le schéma JSON des `.lum` (en anglais) |
| 🛠️ [Développement](docs/development.md) | Compiler, tester, publier (en anglais) |

## 🗺️ Feuille de route

- [x] Éditeur vectoriel, calques, réglages de découpe, gravure d'images
- [x] Pilotage GRBL / Marlin / Smoothieware, caméra, imprimer et découper, rotatif
- [x] Projets et bibliothèques LightBurn, circuits imprimés, cartes de profondeur 3D
- [ ] Retours sur machine pour Marlin et Smoothieware
- [ ] Lasers galvo (EZCad2 / JCZ)
- [ ] Installeurs signés et notariés, mises à jour automatiques
- [ ] D'autres langues — [contributions bienvenues](docs/translating.md)

## 🤝 Contribuer

Signalements de bugs, retours sur matériel, traductions et pull requests sont les bienvenus — commencez
par [CONTRIBUTING.md](CONTRIBUTING.md). Merci de respecter le [code de conduite](CODE_OF_CONDUCT.md) et
de signaler les failles de sécurité en privé comme indiqué dans [SECURITY.md](SECURITY.md).

<p align="center">
  <a href="https://star-history.com/#timal-o/lumiere&Date">
    <img src="https://api.star-history.com/svg?repos=timal-o/lumiere&type=Date" alt="Historique des étoiles" width="70%">
  </a>
</p>

## 📄 Licence

Lumière est un logiciel libre sous [licence publique générale GNU v3.0](LICENSE) : utilisez-le,
étudiez-le, modifiez-le et partagez-le — les versions modifiées que vous distribuez restent sous la même licence.

<sub>Lumière est un projet indépendant, sans lien avec aucun éditeur de logiciel laser commercial et sans
aucune ligne de leur code. Les noms de produits appartiennent à leurs propriétaires respectifs.</sub>
