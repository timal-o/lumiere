# Guide d'utilisation

[English](user-guide.md) · [Français](user-guide.fr.md) · [Español](user-guide.es.md) · [简体中文](user-guide.zh-CN.md)

Les noms de menus et de boutons sont ceux de l'interface en français. La langue se change dans
le menu *Langue* ou dans
*Modifier → Paramètres…* (⌘,).

- [Démarrage rapide](#démarrage-rapide)
- [L'espace de travail](#lespace-de-travail)
- [Dessiner et modifier](#dessiner-et-modifier)
- [Texte, QR codes et codes-barres](#texte-qr-codes-et-codes-barres)
- [Importer et exporter](#importer-et-exporter)
- [Calques et réglages de découpe](#calques-et-réglages-de-découpe)
- [Images](#images)
- [Aperçu et durée estimée](#aperçu-et-durée-estimée)
- [Lancer un travail](#lancer-un-travail)
- [Caméra](#caméra)
- [Imprimer et couper](#imprimer-et-couper)
- [Outils de production](#outils-de-production)
- [Autres commandes des menus](#autres-commandes-des-menus)
- [Raccourcis clavier](#raccourcis-clavier)

## Démarrage rapide

1. **Régler la machine** — *Outils laser → Paramètres de l'appareil…* : taille du plateau, coin d'origine,
   `S max` (`$30` de GRBL), contrôleur et accélération.
2. **Se connecter** — dans le panneau *Laser*, choisissez *USB* ou *Réseau*, le port ou l'adresse
   IP, puis *Connecter*.
3. **Dessiner ou importer** — *Fichier → Importer…* (⌘I) ou la palette d'outils à gauche.
4. **Régler le calque** — sélectionnez des formes, cliquez une couleur de la palette sous la liste
   des *Calques*, puis réglez mode, vitesse et puissance.
5. **Vérifier** — *Aperçu* (⌥P) affiche la trajectoire et la durée estimée.
6. **Cadrer** — *Cadrer* promène la tête autour du travail pour vérifier son emplacement.
7. **Graver** — *Démarrer*. *Arrêter* (⌘.) stoppe immédiatement le contrôleur.

> [!CAUTION]
> Un laser est dangereux et chaque machine est différente. Commencez par un essai sans matériau,
> à faible puissance, et ne laissez jamais la machine sans surveillance.

## L'espace de travail

| Zone | Contenu |
|---|---|
| Barre de menus | *Fichier, Modifier, Outils, Disposer, Outils laser, Fenêtre, Langue, Aide* |
| Barre d'outils | Annuler/rétablir, position et taille de la sélection (X, Y, L, H, verrou des proportions, rotation), *Aperçu*, *Exporter G-code* |
| Barre de disposition | Rotation, miroir, alignement, répartition, groupe, centrage, duplication, suppression, magnétisme ; options de l'outil de dessin actif |
| Palette d'outils | Sélection, nœuds, mesure, ajuster, attaches, positionner le laser, ligne, rectangle, ellipse, polygone, étoile, texte |
| Plan de travail | Le plateau (grille de 10 mm), l'origine machine (point orange), la tête laser (croix rouge), les règles |
| Panneaux de droite | *Propriétés*, *Calques*, *Laser* |

Les coordonnées sont en millimètres depuis le **coin haut gauche du plateau**. Lumière les convertit
en coordonnées machine selon le coin d'origine du profil de machine.

**Unités** : *Modifier → Paramètres…* passe toutes les longueurs, les vitesses et les règles en pouces (le projet reste en millimètres).

**Navigation** : molette ou pincement pour zoomer, défilement à deux doigts / Espace+glisser /
clic droit pour se déplacer, `F` pour ajuster au plateau, ⌘= / ⌘- pour zoomer, ⌘0 pour la page, ⇧⌘A pour la
sélection.

**Magnétisme** : *Objets* accroche aux coins, centres et nœuds des autres formes, *Grille* à une
grille du pas choisi. Maintenez ⌥ en glissant pour l'ignorer.

## Dessiner et modifier

### Sélection (V)
- Clic pour sélectionner, Maj+clic pour ajouter ou retirer, glisser dans le vide pour un cadre.
- Glisser pour déplacer (Maj contraint à l'horizontale ou à la verticale) ; les flèches déplacent
  de 1 mm (Maj : 10 mm).
- Les poignées d'angle gardent les proportions (Maj : libres), celles des bords étirent un axe.
- **Un second clic sur une forme sélectionnée** affiche les poignées de rotation ; Maj tourne par
  pas de 15°.

### Formes
- *Rectangle (R), Ellipse (E), Polygone (P), Étoile (S)* : glisser pour dessiner, Maj pour un carré
  ou un cercle. Rayon des angles, côtés et branches restent modifiables dans *Propriétés* tant que
  les nœuds ne sont pas édités.
- *Ligne / polyligne (L)* : clic pour ajouter des points, double-clic ou Entrée pour terminer, clic
  sur le premier point pour fermer, Échap pour annuler.

### Éditer les nœuds (N)
Sélectionnez une forme vectorielle, puis glissez nœuds et poignées (⌥ casse la symétrie d'un nœud
lisse), glissez dans le vide pour sélectionner plusieurs nœuds, double-cliquez un segment pour
insérer un nœud. Au survol d'un nœud ou d'un segment : **D** supprimer, **I** insérer, **B**
couper, **L** droite, **C** courbe, **S** lisse/anguleux, **J** joindre les deux extrémités
sélectionnées, **P** point de départ. Les flèches déplacent les nœuds sélectionnés de 0,1 mm
(Maj : 1 mm). Les textes doivent d'abord être convertis (*Modifier → Convertir en chemin*, ⇧⌘C).

### Géométrie (menus *Outils* et *Disposer*)
| Élément | Effet |
|---|---|
| *Outils → Décaler les formes…* (⌥O) | Vers l'extérieur ou l'intérieur, angles arrondis, vifs ou chanfreinés |
| *Outils → Souder les formes* (⌘W) et booléens (⌥+, ⌥-, ⌥*) | Union, soustraction (première sélectionnée moins les autres), intersection, exclusion |
| *Outils → Congés et chanfreins…* | Tous les angles, ou seulement les nœuds sélectionnés en mode Nœuds |
| *Disposer → Grille/Répétition…* (⌥A), *Répétition circulaire…* | Copies en grille ou autour d'un centre |
| *Disposer → Copier suivant le chemin…* | Copies le long de la dernière forme sélectionnée, éventuellement selon la tangente |
| *Disposer → Imbrication…* (⇧⌘N) | Range les formes sur le plateau (les groupes restent ensemble), rotation de 90° possible |
| Outil *Rogner les formes* (⌘K) | Clic sur un tronçon pour le supprimer jusqu'aux intersections les plus proches |
| Outil *Ajouter des points de maintien* | Clic sur un contour pour ajouter une attache, Maj+clic pour la retirer |

Le menu *Modifier* propose aussi *Joindre automatiquement les formes sélectionnées…* (⌥J),
*Optimiser les formes sélectionnées…* (⌥⇧O), *Supprimer les doublons* (⌥D), *Sélectionner les
formes ouvertes*, *Sélectionner toutes les formes dans le calque actuel*, *Inverser la sélection*
et *Convertir en bitmap…* (⇧⌘B). Décalages, booléens et simplification produisent des contours par
points (sans courbes de Bézier).

### Disposer
Grouper (⌘G), dissocier (⌘U), retourner horizontalement / verticalement (⇧⌘H / ⇧⌘V), rotation de
90° (`;` et `,`), aligner, répartir (en espaçant ou en centrant), *Déplacer les objets
sélectionnés* (centre de la page, coins, bords), rompre (⌥B), combiner (⌥C), pousser vers
l'avant / l'arrière (⇧⌘↑ / ⇧⌘↓).

## Texte, QR codes et codes-barres

- *Texte (T)* : cliquez sur le plan de travail, puis saisissez dans le panneau *Texte* : police,
  style, hauteur, interlettre, interligne, alignement. *Souder les lettres* (activé par défaut)
  fusionne les lettres qui se chevauchent dans les écritures cursives.
- **Texte sur un chemin** : sélectionnez un texte et un tracé, puis *Outils → Appliquer le chemin
  au texte* ; *Départ sur le chemin* le fait glisser le long du tracé.
- **Texte variable** : `{n}` numéro de série, `{date}`, `{time}`. Réglez le numéro actuel, l'avance
  par travail et le nombre de chiffres dans le panneau *Texte*. *Fusion CSV…* charge un fichier
  CSV : chaque colonne devient `{Nom de colonne}` et la ligne avance après chaque travail.
- *Outils → Créer un code-barres…* et *Créer un code QR…* créent des codes vectoriels ; placez-les sur un calque
  *Remplissage*.

## Importer et exporter

| Format | Import | Export |
|---|---|---|
| SVG | Tracés et formes avec transformations et unités, un calque par couleur de contour. Textes et `<use>` ignorés. | *Fichier → Exporter…* (⌥X) (courbes conservées) |
| DXF (ASCII) | Lignes, arcs, cercles, ellipses, polylignes avec arrondis, splines ; segments reliés automatiquement | — |
| HPGL (`.plt`) | PU/PD/PA/PR, un calque par plume | — |
| PNG, JPEG, BMP, GIF, WebP | 0,1 mm par pixel, ramené à la taille du plateau | *Fichier → Enregistrer l'image bitmap traitée…* |
| G-code | *Outils laser → Exécuter un fichier G-code…* | *Fichier → Enregistrer le G-code…* |
| Ruida `.rd` | — | *Fichier → Exporter pour Ruida…* (expérimental) |
| PDF | Tracés vectoriels de la première page, un calque par couleur (textes et images ignorés) | — |
| STL (modèle 3D) | Converti en carte de profondeur (vue, résolution, largeur, coupe de profondeur, égalisation, inversion) pour le *Relief 3D : tranches* | — |
| Gerber, Excellon | Cuivre, sérigraphie, vernis et contour en contours pleins (à mettre sur un calque *Remplissage*) ; perçages en cercles | — |
| AI, EPS | Fichiers Illustrator (récents, basés sur PDF, ou anciens en PostScript) et EPS : tracés vectoriels, un calque par couleur (textes et images ignorés) | — |
| OBJ, 3MF (modèles 3D) | Convertis en image de profondeur, comme le STL | — |

Les fichiers peuvent être déposés sur la fenêtre. Les projets sont des fichiers `.lum`
([format](file-format.md)) ; une copie automatique est proposée à la récupération si
l'application se ferme avec des modifications non enregistrées.

## Calques et réglages de découpe

Chaque couleur de la palette est un calque. Cliquer une couleur y affecte la sélection (ou choisit
le calque des nouvelles formes). La liste montre l'ordre de gravure (▲▼), *Sortie* et *Vue*
activent chaque calque.

**Modes** : *Ligne* (contours), *Remplissage* (lignes de balayage à l'intérieur des formes
fermées ; pas, overscan, bidirectionnel, angle, croisé, *Remplir chaque forme séparément*),
*Remplissage concentrique* (contours successifs), *Image*.

**Options de ligne** : *Kerf*, *Attaches*, *Dépassement*, *Rampe* / *Départ rampe*, *Sens des
contours*, *Découper l'intérieur d'abord*, *Conserver les points de départ*, *Supprimer les lignes
superposées*, *Mode points*, *Perforation*. Avec un axe Z motorisé : *Décalage Z* et
*Descente/passe*.

**Sous-calques** : l'onglet *+* ajoute un autre réglage appliqué aux mêmes formes (par exemple un
remplissage puis un contour).

**Bibliothèque de matériaux** (*Fenêtre → Bibliothèque de matériaux…*) : enregistrez les réglages du calque par matériau et épaisseur,
appliquez-les plus tard, importez et exportez-les en JSON.

**Grilles de test** : *Outils laser → Test de matériau…* (et *Test d'intervalle…*, *Test de focus…*) fait varier deux paramètres parmi puissance,
vitesse, pas, passes et décalage Z, avec légendes gravées ; des préréglages couvrent les tests de
matériau, d'intervalle et de focus.

**Autres réglages de découpe** : amorces d'entrée et de sortie (droites ou en arc, vers l'extérieur ou l'intérieur), pauses au début et à la fin de chaque tracé avec leur propre puissance (mode « traverser »), *Puissance constante (M3)* par calque, incrément d'angle du remplissage à chaque passe, *Remplir les groupes ensemble*, attaches absentes des formes intérieures et *Puissance des attaches* (découpe partielle). Pour les images : *Image négative*, modes *Journal* et *Croquis*, et dans le panneau Image *Accentuation*, *Rayon d'accentuation* et réduction du bruit.

**Menu des calques** : un clic droit sur un calque l'active, l'affiche ou règle l'assistance d'air pour lui seul, pour tous, pour tous sauf lui, ou inverse ; il déplace ou supprime aussi le calque.

## Images

Les images importées vont sur un calque *Image*. Dans le panneau *Image* : luminosité, contraste,
gamma, inversion, *Vectoriser…*, *Enregistrer l'image traitée…*. *Outils → Appliquer un masque à
l'image* ne garde que la partie intérieure d'une forme fermée. Dans le calque : *Pas* (résolution),
*Tramage* (seuil, ordonné, Floyd-Steinberg, Jarvis, Stucki, Atkinson, demi-teinte, niveaux de
gris) et *Relief 3D : tranches*.

## Aperçu et durée estimée

*Aperçu* (⌥P) dessine le travail : découpes à la couleur de leur calque, déplacements en gris. La
barre affiche la durée estimée (aussi par calque), les longueurs de découpe et de déplacement, un
curseur et un bouton de lecture. L'estimation tient compte de l'accélération, comme le planificateur
de GRBL, quand elle est réglée dans le profil de machine.

## Lancer un travail

Le panneau *Laser* contient la connexion, l'état et la position, le pavé de jog, *Origine machine
($H)*, *Déverrouiller ($X)*, *Aller à la sélection*, et :
- **Départ depuis** : *Coordonnées absolues*, *Position actuelle* (le point d'ancrage va sous la
  tête) ou *Origine utilisateur* (réglée avec *Définir l'origine ici*) ; la grille 3×3 choisit le
  point d'ancrage ;
- *Cadrer* selon la boîte englobante ou l'enveloppe (*Cadrage serré*), laser éteint ou allumé ;
- *Démarrer, Pause, Arrêter*, *Sélection uniquement* ; surcharges de vitesse et de puissance
  pendant le travail ;
- des macros et une console ; les erreurs et alarmes de GRBL sont expliquées.

L'outil *Positionner le laser* envoie la tête au point cliqué.

**Paramètres d'optimisation** (*Outils laser* ou panneau *Laser*) : trier par calque, par groupe ou par priorité de forme (réglée dans *Propriétés*), couper dans l'ordre d'une direction, réduire les déplacements, meilleur point de départ (les coins si possible), meilleure direction, masquer le jeu.

**Autres commandes de la machine** dans le panneau *Laser* : jog en Z, *Aller* à une position X/Y et *Obtenir la position*, *Tir* d'essai tant que le bouton est maintenu, positions enregistrées, *Définir la position de fin*, *Répéter* le travail plusieurs fois, cadrer chaque forme ou en continu. *Outils laser → Centre d'un cercle…* trouve le centre d'un objet rond à partir de trois points de son bord. Dans l'aperçu, *Démarrer ici* et *Enregistrer à partir d'ici…* reprennent un travail au point affiché.

## Caméra

*Outils laser → Gérer les caméras…* : choisissez la caméra, *Graver la mire*, cliquez les
quatre croix dans l'ordre indiqué, réglez la *Correction de l'objectif*, *Enregistrer la
calibration*, puis *Mettre à jour l'image* pour afficher la vue redressée sous le dessin. La
caméra ne doit pas bouger par rapport au plateau.

**Assistant de calibration de l'objectif** (dans la fenêtre Caméra) : ajoutez au projet une grille de points pleins et gravez-la (ou imprimez-la), posez-la sous la caméra, capturez-la plusieurs fois à différents endroits, puis *Calculer la correction* : la correction de l'objectif est réglée automatiquement. Refaites ensuite les quatre repères et enregistrez la calibration.

**Alignement à 9 repères** : dans la fenêtre Caméra, choisissez *9 repères* pour graver et cliquer une grille de 3 × 3 croix ; l'alignement est calculé aux moindres carrés, ce qui moyenne les erreurs de clic. *Annuler le dernier* retire le dernier clic.

**Image et fichiers de la caméra** : *Réglages de l'image de la caméra* affiche les réglages proposés par la caméra (luminosité, contraste, exposition, balance des blancs, mise au point, zoom) ; la calibration s'exporte et s'importe en fichier ; *Capturer et vectoriser* ajoute la capture redressée au projet et ouvre la vectorisation.

## Imprimer et couper

*Outils laser → Imprimer et couper → Démarrer l'assistant…* : sélectionnez deux repères dans le dessin, amenez le laser sur
chaque repère de la pièce réelle et enregistrez-le, puis *Appliquer*. Le travail est tourné, mis à
l'échelle et déplacé pour correspondre, jusqu'à ce que l'alignement soit désactivé.

## Outils de production

- **Profils de machine** : plusieurs machines avec leur plateau, origine, contrôleur, connexion,
  rotatif, décalage de balayage, G-code de début et de fin, commande d'assistance d'air.
- **Macros** : boutons du panneau *Laser* qui envoient des lignes de G-code.
- **Réglages GRBL ($$)** : lire, modifier et écrire les réglages du contrôleur ; reprendre taille du
  plateau, `S max`, vitesses et accélération dans le profil.
- **Notes du projet**, **Bibliothèque de dessins** (*Fenêtre*), **Rotatif** (*Outils laser →
  Configuration de l'unité rotative…*, avec *Départ depuis : Position actuelle*).

## Autres commandes des menus

| Menu | Commandes |
|---|---|
| *Fichier* | *Nouvelle fenêtre* ; *Projets récents* et *Modèles récents* ; *Enregistrer en tant que modèle…* (un modèle s'ouvre comme un nouveau projet sans nom) ; *Préférences* : importer, exporter, charger une sauvegarde (une par jour) ; *Lots* : machines, macros et bibliothèque de matériaux dans un seul fichier ; *Imprimer (noir uniquement)…* (⌘P) ou *(conserver les couleurs)…* (⇧⌘P), à l'échelle 1:1 ; *Enregistrer la capture d'arrière-plan…* (caméra) ; *Préférences* → *Modifier les raccourcis clavier…* : changer n'importe quel raccourci |
| *Modifier* | *Historique des annulations…* ; *Générer un chemin à partir de la coupe* (la trajectoire calculée devient des formes) ; *Fermer le chemin*, *Fermer les chemins sélectionnés avec tolérance…* ; *Inverser le sens de la forme* ; sélection des formes ouvertes à remplir, des formes contenues, des formes plus petites que la sélection, des cercles ; *Faire clignoter les formes du calque actuel* ; *Options d'image* : remplacer l'image (même échelle, ou ajustée) ; *Actualiser l'image* relit une image depuis son fichier |
| *Outils* | Triangle, pentagone, octogone ; *Assistant booléen…* (⌘B) ; *Découper les formes* (⌥⇧C) : la dernière forme sélectionnée coupe les autres en parties intérieure et extérieure ; *Ajuster l'image…* (⌥I) ; *Rogner l'image* selon une autre forme sélectionnée ; *Double étoile* ; *Distordre la sélection (4 points)* et *Déformer la sélection (16 points)* : glisser les poignées, Entrée pour appliquer ; *Redimensionner les encoches de la sélection…* (encoches ou tenons, pour une nouvelle épaisseur) ; *Générer les cercles tangents* (tangents à trois cercles sélectionnés) ; *Vectoriser plusieurs fichiers…* |
| *Disposer* | *Groupage automatique* (une forme et celles qu'elle contient) ; *Miroir selon une ligne* (⇧⌘M, la ligne sélectionnée en dernier) ; *Ancrer* contre la forme la plus proche ou le bord du plateau ; *Déplacer H ensemble* / *V ensemble* (⌥⇧H / ⌥⇧V) ; *Déplacer le laser vers la sélection* et jog (⌥⌘ flèches) ; contour élastique ; avancer / reculer d'un niveau (⌘↑ / ⌘↓) ; verrouiller et déverrouiller (une forme verrouillée ne bouge pas) ; *Rotation/échelle à deux points* (⌘2) : cliquer le centre, un point de référence, puis sa nouvelle position (Maj met aussi à l'échelle) |
| *Outils laser* | Étapes d'*Imprimer et couper* (⌥0 à ⌥4) et réinitialisation ; *Déformation conique…* pour les objets coniques au rotatif |
| *Fenêtre* | *Style de vue* : filaire ou rempli, grossier ou lisse (⌥⇧W) ; afficher/masquer les panneaux latéraux (F12) et chaque barre d'outils ; *Pages* : onglets au-dessus du plan de travail pour garder plusieurs dessins dans un projet (calques partagés, le travail utilise la page affichée) |
| *Aide* | Licence, forum d'entraide, proposition de fonctionnalité, documentation en ligne, données d'utilisation (aucune n'est collectée), signalement de bug, données de support, recherche de mises à jour, journal de débogage |

## Autres options d'édition et de machine

- **Paramètres** (⌘,) : tolérances de magnétisme et de clic, pas des flèches, délai de sauvegarde automatique, sélection des formes après le dessin, sens de la molette, police et hauteur par défaut, grille visuelle, croix au centre, curseur plein écran, centrage et regroupement à l'import, DPI SVG, précision HPGL.
- **Paramètres de l'appareil** (*Outils laser*) : origine machine à la connexion, déplacements en `$J` ou `G0`, `S` sur chaque `G1`, dépassement G0, alerte quand le travail sort du plateau, décalage du pointeur laser, Z inversé ou relatif, délai de départ, liste de vérification avant chaque travail et bouton de tir d'essai (optionnel).
- **Calques** : *Définir par défaut* / *Réinitialiser* dans le menu du calque ; *Correction de la largeur du point* pour les remplissages ; *Modifier → Sélectionner les cercles par taille…*.
- Outil **Arrondir les angles** : cliquez un angle pour l'arrondir (Maj : chanfrein), le rayon se règle dans la barre d'options.
- **Bibliothèque d'art** : import et export de bibliothèques en fichiers.
- L'**historique d'annulation** nomme chaque étape (la commande du menu, ou déplacer / redimensionner / tourner / modifier les nœuds).
- **Vectorisation** : le mode *Ligne centrale* suit le milieu des traits sombres (dessins au trait, écriture).
- **Réseaux modifiables** : les réseaux en grille et circulaires restent liés à leur source ; *Modifier le réseau* les change, *Aplatir le réseau* en fait des formes ordinaires.
- **Préréglages d'image** : points de départ intégrés et vos propres préréglages pour une image et les réglages de son calque.
- **Rampe en remplissage** (tampons) : sur un calque *Remplissage*, la *Rampe* baisse la puissance près des bords pour des flancs inclinés ; *Rampe du bord extérieur* traite aussi le contour le plus extérieur (laissez-la désactivée pour un tampon, le cadre reste net).
- **Lien à la bibliothèque** : dans la bibliothèque de matériaux, *Lier* attache le calque courant à une entrée ; ses réglages passent en lecture seule et suivent la bibliothèque (aussi à l'ouverture d'un projet). ↻ remplace une entrée par les réglages du calque courant et tous les calques liés suivent. *Délier* dans le calque le rend de nouveau modifiable.
- **Mesure** (M) : un panneau montre la forme sous le curseur (ou la forme sélectionnée) : taille, nœuds, lignes, courbes, ouverte ou fermée, périmètre, surface ; le segment sous le curseur : points de départ et d'arrivée, longueur, angle, centre et rayon d'une courbe ; pendant un glissement, la distance mesurée. Son bouton d'unité bascule entre mm et pouces.
- **Déformer** (texte sur un chemin) : courbe les lettres pour qu'elles épousent le chemin au lieu de seulement les faire pivoter.
- **Polices SHX** : choisissez un dossier de polices AutoCAD `.shx` dans les *Paramètres* ; elles apparaissent dans la liste des polices. Ce sont des polices à trait simple (traits ouverts), idéales pour graver vite sur un calque *Ligne*. Les grandes polices (asiatiques) ne sont pas prises en charge.
- **Options des grilles** : écart entre les bords ou distance de centre à centre, remplir la largeur / la hauteur du plateau, décalage X par rangée et Y par colonne, décalage d'un demi-pas, sens inverse, miroir des rangées ou colonnes alternées, orientation aléatoire, grouper les résultats, incrément du texte variable par copie, et *Créer une répétition virtuelle* (désactivé : copies ordinaires).
- **Options de l'aperçu** : *Teinte selon la puissance*, *Inverser* (blanc sur noir, pour juger une gravure d'image), afficher ou masquer les *Déplacements* à vide, et *Enregistrer l'image…* (Maj : fond transparent).
- **Séquence du texte variable** : *Début* et *Fin* (le numéro revient au début après la fin), *Avance automatique* après chaque travail, ◀ / ▶ pour reculer ou avancer, *Réinitialiser*.
- **Étalonner un axe** (dans les *Réglages GRBL*) : saisissez la distance demandée et la distance réellement parcourue ; le nouveau nombre de pas par mm ($100 / $101 / $102) est calculé et écrit dans le contrôleur.
- **Bibliothèques LightBurn** : la bibliothèque de matériaux importe les fichiers `.clb` de LightBurn (vitesses converties depuis les mm/s, les entrées à plusieurs réglages deviennent des sous-calques) et exporte en `.clb`.
- **Projets LightBurn** : *Fichier → Ouvrir* (ou un glisser-déposer) lit les fichiers `.lbrn` et `.lbrn2` : calques et leurs réglages, rectangles, ellipses, polygones, étoiles, tracés, groupes, images, et textes : modifiables si leur police est installée, sinon en courbes (d'après le tracé que LightBurn enregistre avec eux). L'enregistrement produit un projet Lumière.
- **Formats d'export** : *Fichier → Exporter…* écrit du SVG, du DXF (R12, un calque DXF par calque) ou du PDF / AI (compatible PDF), selon le type de fichier choisi. Les courbes sont aplaties en DXF et en PDF ; les images ne sont exportées qu'en SVG.
- **Interrupteurs de manipulation** (à droite de la barre Disposer) : ✥ déplacer, ⟳ tourner, ⤡ redimensionner, ▱ cisailler. Désactivez-en un pour éviter de le faire par erreur à la souris ; les saisies numériques restent possibles.
- **Remplissage par zones (Flood Fill)** (calques Remplissage) : chaque zone est balayée entièrement avant la plus proche, au lieu de traverser tout le dessin ligne par ligne — beaucoup moins de trajets sur les lettres et les formes éparses.
- **Sous-calques** : ⧉ clone le réglage affiché (calque principal ou sous-calque) dans un nouveau sous-calque ; un sous-calque peut être nommé, son onglet affiche le nom.
- **Trouver mon laser** (*Outils laser*, ou *Assistant…* dans les réglages machine) : cherche un contrôleur GRBL, Marlin ou Smoothieware sur les ports USB, lit sa zone de travail et son `S` max, puis demande un nom, le coin d'origine et la prise d'origine automatique. Les appareils réseau et Ruida se règlent à la main dans le même assistant.
- **Décalages de balayage selon la vitesse** (réglages machine) : une table de vitesses et de décalages pour le balayage bidirectionnel, interpolée à la vitesse de chaque calque ; sans table, le décalage unique s'applique.
- **Mode débutant** (menu *Fenêtre* ou *Paramètres*) : les réglages de découpe ne montrent que l'essentiel (mode, vitesse, puissance, passes, pas, angle, assistance d'air) ; les onglets de sous-calques, les valeurs par défaut des calques et les interrupteurs de manipulation sont masqués. Les réglages masqués gardent leur valeur.
- **Autres options de découpe** : *Passes globales* répète un calque et ses sous-calques ensemble ; attaches d'après l'espacement, avec un minimum et un maximum par forme ; *Air seulement pendant la découpe* (coupé pendant les déplacements) ; *Copier vers tous les calques*.
- **Options de disposition** : les champs X / Y suivent un point de référence 3 × 3 (utilisé aussi pour redimensionner) ; le *Décalage* peut aller des deux côtés et ne traiter que les formes extérieures ; *Copier le long d'un chemin* accepte un espacement fixe et un incrément du texte variable ; le *Tableau circulaire* a un angle de départ, un pas modifiable, un centre pris sur la dernière forme sélectionnée, le groupement et un incrément du texte variable.
- **Modifier les répétitions** (*Disposer*) : *Ajouter à la répétition* (sélectionnez la répétition et les nouvelles formes), *Retirer de la répétition* (sélectionnez des formes d'origine), *Dupliquer la répétition*.
- **Générer un contour** (*Outils*) : un contour sans trous autour de la sélection, à la distance voulue ; les images suivent leurs pixels non blancs (autocollants à découper).
- **Récupérer arcs et lignes** (*Modifier*) : remplace les formes faites de nombreux petits segments (DXF, PDF, vectorisations) par des droites et de vrais arcs de cercle, modifiables par nœuds.
- **Style et courbure du texte** : *G* et *I* passent aux styles gras et italique de la police ; *Courber* met le texte en arc (jusqu'au cercle complet, vers le haut ou vers le bas).
- **Imbrication et pages** : l'imbrication garde les formes intérieures avec leur forme englobante et peut placer ce qui ne tient pas sur de nouvelles pages ; la barre des pages insère une page après la page courante (↳) et importe les pages d'un autre projet (⇩).
- **Sortie des travaux** : *Découpes en dernier* (réglages d'optimisation) passe les calques Ligne après les gravures ; l'*Échelle globale de vitesse* (réglages machine) modifie la vitesse de tous les calques ; pendant un travail, le panneau Laser affiche le temps écoulé et le temps restant estimé ; *Outils laser → Exporter le journal des travaux…* enregistre l'historique (début, durée, lignes, erreurs) en CSV.
- **Calques outils et cadrage** : *T1* et *T2* (après la palette de couleurs) sont des calques outils, jamais gravés — pour des repères et le cadrage. Dans le panneau Laser, le *Cadrage* suit la boîte englobante, l'enveloppe (élastique) ou le contour des formes ; *Calques outils seulement* ne cadre que les formes de T1 / T2 ; *Images : partie non blanche* ne cadre que la partie dessinée des images.
- **Autres options machine** : compensation du jeu mécanique en X et en Y, échange de X et Y en sortie, décalage de mise au point Z, signal DTR à la connexion, lecture des réglages GRBL ($$) à la connexion, et descriptions personnalisées des erreurs et alarmes.
- **Panneau Déplacement** : le *Déplacement continu* avance tant qu'une flèche est maintenue (arrêt au relâchement, jusqu'au bord du plateau) ; les positions enregistrées gardent Z sur les machines à axe Z ; un bouton *Mise au point auto* lance le G-code de mise au point défini dans les réglages machine.
- **Types de rotatif** : à rouleaux (diamètre des rouleaux) ou à mandrin (diamètre de l'objet), sur l'axe Y (mm par tour) ou l'axe A (degrés), avec sortie en miroir.
- **Fenêtre de vectorisation** : un aperçu en direct montre le résultat sur l'image (*Estomper l'image*, *Afficher les points*) ; le *Tracé croquis* trace les bords d'une photo en lignes.
- **QR codes et codes-barres** : un QR code peut contenir un réseau Wi-Fi, un contact, un e-mail, un numéro de téléphone ou une adresse web (saisis champ par champ) ; les codes-barres peuvent afficher leur texte en dessous ; un QR code peut porter un logo SVG au centre ; la même fenêtre crée aussi des codes DataMatrix (ECC200).
- **Test de matériau** : un titre gravé, une bordure découpée en dernier (avec sa puissance et sa vitesse), et vos propres préréglages (enregistrer, supprimer, exporter, importer).
- **Plusieurs bibliothèques de matériaux** : ouvrez un fichier comme nouvelle bibliothèque, passez de l'une à l'autre, renommez-les ou déchargez-les ; *Fusionner…* ajoute un fichier à la bibliothèque courante avec une règle pour les doublons (garder, remplacer, renommer la nouvelle entrée ou l'originale). Les calques liés retrouvent leur entrée dans n'importe quelle bibliothèque chargée.
- **Bibliothèques d'art** : plusieurs bibliothèques peuvent être chargées, renommées et déchargées ; *Importer des fichiers…* ajoute directement des fichiers SVG, DXF, PDF ou des images (un élément par fichier) ; un curseur règle la taille des aperçus.
- **Apparence** (*Paramètres*) : thème clair, sombre ou celui du système ; taille des icônes ; numéros des calques sur les boutons de la palette.
- **Fenêtre Console** (*Fenêtre → Console…*) : une console plus grande, avec l'historique des commandes (↑ / ↓), l'effacement et l'enregistrement.
- **Mise en page** (⚙ dans la barre des pages) : la taille de la pièce de chaque page et son coin sur le plateau, affichée en pointillés.
- **Profils** (*Fichier → Préférences → Gestion des profils…*) : des jeux complets de préférences (appareils, bibliothèques, raccourcis, réglages) — par exemple un par atelier ou par personne ; changer de profil redémarre l'interface. Les lots contiennent désormais toutes les bibliothèques de matériaux.
- **Nettoyage du relief 3D** : avec *Relief 3D : tranches*, une passe de nettoyage toutes les N tranches repasse la zone déjà creusée (ou toute l'image) pour égaliser le fond.
- **Compteur de travaux** (panneau Laser) : compte les travaux terminés ; *Arrêt à* bloque *Démarrer* une fois le nombre atteint, pour les séries.
- **Disposition des panneaux** (*Paramètres*) : les panneaux latéraux se placent à gauche ou à droite de la fenêtre, dans l'ordre choisi (▲ remonte un panneau).
- **Formes hors plateau** : *Paramètres → Ignorer les formes hors de la zone de travail* laisse de côté les formes entièrement hors du plateau.
- **Cisaillement** : en mode rotation (cliquez à nouveau la sélection), les poignées des côtés la cisaillent.
- **Import de circuit imprimé** (*Fichier → Importer un circuit imprimé…*) : ajoutez les fichiers Gerber et de perçage d'une carte ; le rôle de chaque fichier (cuivre, sérigraphie, vernis, pâte, contour, perçage) et sa face sont détectés d'après son nom. Options : inverser le cuivre avec le contour de la carte (gravure à l'anglaise), retourner les faces du dessous, mettre cuivre, sérigraphie et vernis en *Remplissage*. Chaque fichier a son calque et la carte est centrée sur le plateau.

## Raccourcis clavier

La liste complète est dans *Aide → Raccourcis clavier* (⌘/).

| Touches | Action |
|---|---|
| V, N, M, L, R, E, P, S, T | Sélection, nœuds, mesure, ligne, rectangle, ellipse, polygone, étoile, texte |
| ⌘L, ⌘R, ⌘E, ⌘T, ⌘K | Dessiner des lignes, rectangle, ellipse, texte, rogner les formes |
| ⌘N, ⌘O, ⌘S, ⇧⌘S | Nouveau, ouvrir, enregistrer, enregistrer sous |
| ⌘I, ⌥X, ⇧⌘E | Importer, exporter, enregistrer le G-code |
| ⌘Z, ⇧⌘Z | Annuler, rétablir |
| ⌘C, ⌘X, ⌘V, ⌥V, ⌘D | Copier, couper, coller, coller sur place, dupliquer |
| ⌘G, ⌘U | Grouper, dissocier |
| ⇧⌘H, ⇧⌘V, `;`, `,` | Retourner horizontalement, verticalement, rotation de 90° horaire, antihoraire |
| ⌘W, ⌥+, ⌥-, ⌥* | Souder, union, soustraction, intersection |
| ⌥O, ⌥A, ⇧⌘N, ⌥B, ⌥C, ⌥J, ⌥D | Décaler, répétition, imbrication, rompre, combiner, joindre, supprimer les doublons |
| ⌥P, ⌘0, ⇧⌘A | Aperçu, zoomer sur la page, zoom sur la sélection |
| ⌘, | Paramètres |
| ⌘. | Arrêter le laser |
