// Fenêtres du menu Aide : licence et données d'utilisation.

import license from "../../LICENSE?raw";
import { t } from "../i18n";
import { REPO, openLink } from "../help";
import { Modal } from "./Menu";

export function LicenseDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title={t("Licence")} onClose={onClose} width={640}>
      <p>{t("Lumière est un logiciel libre : vous pouvez l'utiliser, l'étudier, le modifier et le redistribuer selon les termes de la GNU GPL version 3.")}</p>
      <pre className="license-text">{license}</pre>
      <div className="row end"><button className="primary" onClick={onClose}>{t("Fermer")}</button></div>
    </Modal>
  );
}

export function UsageDataDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title={t("Données d'utilisation")} onClose={onClose} width={460}>
      <p>{t("Lumière ne collecte et n'envoie aucune donnée d'utilisation. Rien ne quitte votre ordinateur, sauf quand vous ouvrez un lien ou recherchez une mise à jour (une requête à GitHub).")}</p>
      <p className="hint">{t("Vos projets, préférences et réglages machine restent sur ce poste.")}</p>
      <div className="row end">
        <button onClick={() => openLink(REPO)}>{t("Code source")}</button>
        <button className="primary" onClick={onClose}>{t("Fermer")}</button>
      </div>
    </Modal>
  );
}
