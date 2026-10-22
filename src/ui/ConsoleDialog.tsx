// Fenêtre → Console : la console du contrôleur dans une fenêtre plus grande.

import { exportText } from "../actions";
import { t } from "../i18n";
import { clearLog, getLaserState } from "../laser";
import { Console } from "./LaserPanel";
import { Modal } from "./Menu";

export function ConsoleDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title={t("Console")} onClose={onClose} width={720}>
      <Console tall />
      <div className="row end">
        <button onClick={clearLog}>{t("Effacer")}</button>
        <button onClick={() => exportText(getLaserState().log.join("\n") + "\n", t("console.txt"))}>{t("Enregistrer…")}</button>
        <button className="primary" onClick={onClose}>{t("Fermer")}</button>
      </div>
    </Modal>
  );
}
