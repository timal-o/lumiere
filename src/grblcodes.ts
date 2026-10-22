// Libellés des codes d'erreur et d'alarme de GRBL 1.1.

import { t, tk } from "./i18n";

const ERRORS: Record<number, string> = {
  1: tk("commande sans lettre"), 2: tk("valeur numérique invalide"), 3: tk("commande $ inconnue"), 4: tk("valeur négative interdite"),
  5: tk("cycle d'origine désactivé ($22)"), 6: tk("impulsion de pas trop courte"), 7: tk("lecture EEPROM impossible"),
  8: tk("commande $ refusée pendant un travail"), 9: tk("verrouillé (alarme ou porte) : faites $X ou $H"),
  10: tk("limites logicielles sans cycle d'origine"), 11: tk("ligne trop longue"), 12: tk("vitesse de pas trop élevée"),
  13: tk("porte de sécurité ouverte"), 14: tk("ligne de démarrage trop longue"), 15: tk("jog hors des limites"),
  16: tk("commande jog invalide"), 17: tk("mode laser requiert PWM"), 20: tk("commande G-code non prise en charge"),
  21: tk("deux commandes du même groupe"), 22: tk("vitesse F non définie"), 23: tk("valeur entière attendue"),
  24: tk("deux commandes utilisent les axes"), 25: tk("mot G-code répété"), 26: tk("aucun axe pour la commande"),
  27: tk("numéro de ligne invalide"), 28: tk("valeur manquante"), 29: tk("G59.x non pris en charge"), 30: tk("G53 requiert G0 ou G1"),
  31: tk("mots d'axe inutilisés"), 32: tk("arc sans axe dans le plan"), 33: tk("cible de mouvement invalide"),
  34: tk("rayon d'arc invalide"), 35: tk("arc sans décalage"), 36: tk("mots inutilisés"), 37: tk("décalage d'outil invalide"), 38: tk("numéro d'outil trop grand"),
};

const ALARMS: Record<number, string> = {
  1: tk("fin de course matérielle atteinte : refaites l'origine ($H)"), 2: tk("mouvement hors des limites logicielles"),
  3: tk("réinitialisation pendant un mouvement : position perdue"), 4: tk("sonde déjà en contact"), 5: tk("sonde sans contact"),
  6: tk("cycle d'origine interrompu"), 7: tk("porte ouverte pendant l'origine"), 8: tk("dégagement d'origine insuffisant"),
  9: tk("fin de course introuvable pendant l'origine"), 10: tk("fin de course à double déclenchement"),
};

/** Ajoute l'explication en français à une ligne « error:n » ou « ALARM:n ». */
/** Codes propres à une machine : « error:N » / « ALARM:N » → description (prioritaires). */
export interface CustomCodes {
  errors?: Record<string, string>;
  alarms?: Record<string, string>;
}

export function explain(line: string, custom: CustomCodes = {}): string {
  const e = /^error:(\d+)/.exec(line);
  if (e && custom.errors?.[e[1]]) return `${line} — ${custom.errors[e[1]]}`;
  if (e && ERRORS[Number(e[1])]) return `${line} — ${t(ERRORS[Number(e[1])])}`;
  const a = /^ALARM:(\d+)/.exec(line);
  if (a && custom.alarms?.[a[1]]) return `${line} — ${custom.alarms[a[1]]}`;
  if (a && ALARMS[Number(a[1])]) return `${line} — ${t(ALARMS[Number(a[1])])}`;
  return line;
}
