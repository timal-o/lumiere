import { Modal } from "./Menu";
import { t, tk } from "../i18n";

const SECTIONS: [string, string[]][] = [
  [tk("1. Régler la machine"), [
    tk("Outils laser → Paramètres de l'appareil : taille du plateau, coin d'origine, S max ($30), accélération."),
    tk("Avec GRBL, vérifiez que le mode laser est actif ($32=1) : Outils laser → Réglages GRBL."),
    tk("Choisissez USB ou Réseau dans le panneau Laser, puis Connecter."),
  ]],
  [tk("2. Préparer le dessin"), [
    tk("Fichier → Importer (SVG, DXF, HPGL, images) ou dessinez avec la palette d'outils à gauche."),
    tk("Chaque couleur de la palette en bas des calques est un calque : cliquez une couleur pour y mettre la sélection."),
    tk("Double-cliquez un texte pour le modifier ; N édite les nœuds ; un second clic sur la sélection fait pivoter."),
  ]],
  [tk("3. Régler les calques"), [
    tk("Mode Ligne pour découper, Remplissage pour graver une surface, Image pour les photos."),
    tk("« + » ajoute un sous-calque (ex. remplissage puis contour) ; ▲▼ change l'ordre de gravure."),
    tk("Outils laser → Test de matériau pour trouver la bonne puissance et vitesse, puis enregistrez-les dans la bibliothèque."),
  ]],
  [tk("4. Graver"), [
    tk("⌥P : aperçu de la trajectoire, durée estimée, simulation."),
    tk("Choisissez « Départ depuis » (absolu, position actuelle, origine utilisateur) et le point d'ancrage."),
    tk("Cadrer pour vérifier l'emplacement, puis Démarrer. Arrêter (⌘.) coupe tout immédiatement."),
  ]],
  [tk("Sécurité"), [
    tk("Ne laissez jamais un laser fonctionner sans surveillance ; portez des lunettes adaptées à la longueur d'onde."),
    tk("Les pilotes Ruida sont expérimentaux : premier essai sans matériau, à faible puissance."),
  ]],
];

export function GuideDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title={t("Guide de démarrage")} onClose={onClose} width={620}>
      {SECTIONS.map(([title, items]) => (
        <section key={title} className="guide">
          <h3>{t(title)}</h3>
          <ul>{items.map((item) => <li key={item}>{t(item)}</li>)}</ul>
        </section>
      ))}
      <div className="row end"><button className="primary" onClick={onClose}>{t("Fermer")}</button></div>
    </Modal>
  );
}
