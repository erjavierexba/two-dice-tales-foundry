/**
 * Reglas revisadas a mano para las dotes del módulo básico.
 * La inferencia automática a partir del texto marcaba como siempre activas reglas
 * condicionales y aplicaba ámbitos vacíos a todas las tiradas; aquí se sustituyen.
 *
 * Convención: `optional: true` = la casilla sale desmarcada en el diálogo de tirada
 * (la condición depende de la escena); sin `optional` = se aplica siempre que el ámbito encaje.
 */

const r = (type, value, scopes, extra = {}) => ({ type, value, scopes, ...extra });
const O = { optional: true };
const mod = (target, value) => ({ target, value });

/** name → { rules, modifiers?, toggle?, reminderScopes? } (sin el recordatorio, que se añade solo). */
export const BASIC_FEAT_OVERRIDES = {
  // Desventajas
  "Alergia": { rules: [r("worseDie", 4, [], { ...O, label: "Alergia (en presencia del alérgeno)" })] },
  "Cabeza hueca": { rules: [r("disadvantage", 1, ["mind"], { target: "first" })] },
  "Cegato": { rules: [r("worseDie", 4, ["perception"], { ...O, sense: "visual", label: "Cegato (percepción visual)" })] },
  "Duro de oído": { rules: [r("worseDie", 4, ["perception"], { ...O, sense: "auditory", label: "Duro de oído (percepción auditiva)" })] },
  "Cobarde": { rules: [r("dieStep", -1, ["will"], { ...O, target: "first", floorOne: true, label: "Cobarde (voluntad contra el miedo)" })] },
  "Feo de cojones": { rules: [r("dieStep", -1, ["diplomacy"], { target: "second", label: "Feo de cojones (te ven en persona)" })] },
  "Gordo": { rules: [r("disadvantage", 1, ["athletics"], { ...O, target: "second", label: "Gordo (esfuerzo de tiempo medio)" })] },
  "Incrédulo": { rules: [r("dieStep", -1, ["mind", "will"], { ...O, target: "first", floorOne: true, label: "Incrédulo (te intentan colar una mentira)" })] },
  "Me la suda": {
    rules: [
      r("disadvantage", 1, ["diplomacy"], { ...O, target: "second", label: "Me la suda (ya han visto tu actitud)" }),
      r("dieStep", 1, ["will"], { ...O, target: "second", label: "Me la suda (te intentan engañar)" })
    ]
  },
  "Otako": {
    rules: [
      r("dieStep", -1, ["diplomacy"], { ...O, target: "second", label: "Otako (mejorar la relación)" }),
      r("dieStep", 1, ["diplomacy"], { ...O, target: "second", label: "Otako (la otra persona es del mismo tema)" })
    ]
  },
  "Paranoico": { rules: [r("dieStep", 1, ["will"], { ...O, target: "second", label: "Paranoico (te engañan o te hacen diplomacia)" })] },
  "Perroflauta": { rules: [r("disadvantage", 1, [], { ...O, target: "second", label: "Perroflauta (tarea de tiempo medio)" })] },
  "Pésimo para los negocios": { rules: [r("disadvantage", 1, [], { ...O, target: "second", label: "Pésimo para los negocios (ganar dinero)" })] },
  "Sordo como una tapia": { rules: [], reminderScopes: ["perception"], reminderSense: "auditory" },

  // Ventajas sociales y de conocimiento
  "100tifico": { rules: [r("bonus", 2, ["science", "profession"], O)] },
  "Análisis metódico": { rules: [r("bonus", 2, ["investigation", "science"], O)] },
  "Anestesista": { rules: [], reminderScopes: ["medicine", "science"] },
  "Carterista de la pista": { rules: [r("bonus", 2, ["stealth", "acrobatics", "deception"], O)] },
  "Centro de todas las miradas": { rules: [r("difficulty", 2, ["performance"], { ...O, label: "Centro de todas las miradas (atraer a un grupo)" })] },
  "Cocinero": { rules: [r("bonus", 2, ["survival", "profession"], O)] },
  "Conocimiento de religiones blasfemas": { rules: [r("bonus", 1, ["religion"], O)] },
  "Da Vinki": { rules: [r("noFumble", 1, ["science"])] },
  "Disfraz": { rules: [r("bonus", 2, ["performance"], O)] },
  "El bicho pelao": { rules: [r("bonus", 2, ["diplomacy"], O)] },
  "Encantador animal": { rules: [r("bonus", 2, ["survival", "nature", "diplomacy"], O)] },
  "Engranaje de metal sólido": { rules: [r("bonus", 2, ["stealth"], O)] },
  "Equilibrio": { rules: [r("bonus", 2, ["acrobatics"], O)] },
  "Específico": {
    rules: [
      r("bonus", 1, [], { ...O, label: "Específico (rama elegida)" }),
      r("penalty", 1, [], { ...O, label: "Específico (otra rama de la habilidad)" })
    ]
  },
  "Fan de las novelas de detectives": { rules: [r("bonus", 1, ["investigation"], O)] },
  "Forense": { rules: [r("bonus", 1, ["medicine"], O)] },
  "Guapa, guapa guapa y guapaaa": { rules: [r("bonus", 2, ["diplomacy", "deception"], { label: "Guapa (si te ven)" })] },
  "Igual con 9 dedos vas bien": { rules: [r("bonus", 2, ["intimidation"], O)] },
  "Ligón": {
    rules: [
      r("bonus", 1, ["diplomacy"], { ...O, label: "Ligón (grupo elegido)" }),
      r("difficulty", -1, ["diplomacy"], { ...O, label: "Ligón (resto de grupos)" })
    ]
  },
  "Maestro de disfraces": { rules: [r("bonus", 2, ["deception"], O)] },
  "Manos sanadoras": { rules: [r("bonus", 2, ["medicine"], O)] },
  "Medicina química": { rules: [r("bonus", 2, ["science", "medicine"], O)] },
  "Memoria fotográfica": { rules: [r("bonus", 2, ["perception", "mind"], { ...O, label: "Memoria fotográfica (recordar algo visual)" })] },
  "Mente de tiburón": { rules: [r("difficulty", 2, [], { ...O, label: "Mente de tiburón (ganar dinero)" })] },
  "Mil caras": {
    rules: [
      r("bonus", 1, ["deception", "performance"], { ...O, label: "Mil caras (impersonar)" }),
      r("bonus", 2, ["deception", "performance"], { ...O, label: "Mil caras (alguien genérico)" }),
      r("bonus", 3, ["deception", "performance"], { ...O, label: "Mil caras (preparado y con información)" })
    ]
  },
  "Monkey": { rules: [r("bonus", 2, ["athletics"], { ...O, label: "Monkey (escalar)" })] },
  "Nadador": { rules: [r("bonus", 2, ["athletics"], { ...O, label: "Nadador (nadar)" })] },
  "Practicante de un deporte": { rules: [r("bonus", 1, ["athletics"], O)] },
  "Profesional de un deporte": { rules: [r("bonus", 2, ["athletics"], O)] },
  "Puntero": {
    rules: [
      r("bonus", 1, [], { ...O, excludeScopes: ["attack", "melee", "ranged", "brawl"], label: "Puntero (acción elegida)" }),
      r("penalty", 2, [], { ...O, excludeScopes: ["attack", "melee", "ranged", "brawl"], label: "Puntero (acción contraria)" })
    ]
  },
  "Rastreador": { rules: [r("bonus", 2, ["survival"], O)] },
  "Sentido del peligro": { rules: [r("bonus", 1, ["perception"], { ...O, label: "Sentido del peligro (amenaza inmediata)" })] },
  "Stalker": { rules: [r("bonus", 1, ["stealth"], O)] },
  "Topo": { rules: [r("bonus", 2, ["survival"], O)] },
  "Voz encantadora": { rules: [r("bonus", 2, ["deception", "diplomacy"], O)] },
  "Yo conozco a uno…": { rules: [r("bonus", 2, ["society"], O)] },
  "Yo y mi pandilla": { rules: [r("bonus", 2, ["intimidation"], O)] },
  "¿Miedo? ¿Eso que es?": {
    rules: [
      r("bonus", 1, ["will"], { ...O, label: "¿Miedo? (solo)" }),
      r("bonus", 3, ["will"], { ...O, label: "¿Miedo? (acompañado)" })
    ]
  },

  // Percepción
  "Oído fino": { modifiers: [mod("step.perception.auditory", 1)], rules: [], reminderScopes: ["perception"], reminderSense: "auditory" },
  "Vista de cazador": { modifiers: [mod("step.perception.visual", 1)], rules: [], reminderScopes: ["perception"], reminderSense: "visual" },
  "Murciélago": {
    modifiers: [mod("step.perception.auditory", 1)],
    reminderSense: "auditory",
    rules: [
      r("difficulty", 2, ["perception"], { ...O, sense: "auditory", label: "Murciélago (localizar el sonido)" })
    ]
  },
  "Vista de águila": {
    modifiers: [mod("step.perception.visual", 1)],
    reminderSense: "visual",
    rules: [
      r("difficulty", 2, ["perception"], { ...O, sense: "visual", label: "Vista de águila (niebla u obstáculo parcial)" })
    ]
  },

  // Físicas
  "Mastodonte": {
    modifiers: [mod("endurance", 1), mod("evasionPenalty", 1)],
    rules: [r("bonus", 1, ["intimidation"], { ...O, label: "Mastodonte (intimidar a alguien más pequeño)" })]
  },
  "Retaco": {
    modifiers: [mod("step.defense.evasion", 1), mod("endurance", -1)],
    rules: [r("dieStep", -1, ["intimidation"], { ...O, target: "second", label: "Retaco (intimidar a alguien más alto)" })]
  },

  // Combate
  "Agarre": { rules: [r("bonus", 1, ["brawl"], O)] },
  "Apuntado concentrado": { rules: [r("bonus", 2, ["ranged"], { ...O, label: "Apuntado concentrado (turno entero apuntando)" })] },
  "Boxing": { rules: [r("bonus", 1, ["brawl"], O)] },
  "Cálculo de tiro": { rules: [], reminderScopes: ["ranged-attack"] },
  "Cubrirte no te servirá": { rules: [], reminderScopes: ["ranged-attack"] },
  "Entrenado en un arma": { rules: [r("bonus", 1, ["melee", "ranged"], { ...O, label: "Entrenado en un arma (el arma elegida)" })] },
  "Ganador del torneo del puño de hierro": { modifiers: [mod("flag.ironFist", 1)], rules: [], reminderScopes: ["unarmed"] },
  "Guerrero": { modifiers: [mod("endurance", 1), mod("flag.warrior", 1)], rules: [], reminderScopes: ["attack"] },
  "Golpe vital": { rules: [r("critical", 1, ["attack"], { label: "Golpe vital (crítico al golpear)" })] },
  "Jackpot": { rules: [r("bonus", 1, ["ranged-attack"], { ...O, label: "Jackpot (ataque único con dos armas duales)" })] },
  "Kansei Dorifto": { rules: [], reminderScopes: ["driving"] },
  "Parry": { rules: [r("bonus", 3, ["attack"], { ...O, label: "Parry (contraataque tras esquivar por 5 o más)" })], reminderScopes: ["evasion", "attack"] },
  "Practicante marcial": { rules: [r("bonus", 2, ["evasion"], { ...O, label: "Practicante marcial (te atacan con maniobra de lucha)" })] },
  "Posición defensiva": {
    toggle: true,
    modifiers: [mod("endurance", 1)],
    rules: [
      r("bonus", 2, ["evasion"], { label: "Posición defensiva" }),
      r("dieStep", -1, ["attack"], { target: "second", label: "Posición defensiva" })
    ]
  },
  "Posición ofensiva": {
    toggle: true,
    modifiers: [mod("endurance", -1)],
    rules: [
      r("bonus", 1, ["attack"], { label: "Posición ofensiva" }),
      r("dieStep", -1, ["evasion"], { target: "second", floorOne: true, label: "Posición ofensiva" })
    ]
  },
  "Punto débil": { rules: [r("dieStep", -1, ["brawl"], { ...O, target: "second", label: "Punto débil (contraataque sin Agarre/Boxing)" })] }
};

const lower = text => String(text ?? "").toLocaleLowerCase("es");

/** Finds the override for a feat name, also for copies such as "Entrenado en un arma (katana)". */
export function basicFeatOverride(name) {
  const exact = Object.keys(BASIC_FEAT_OVERRIDES).find(key => lower(key) === lower(name));
  if (exact) return BASIC_FEAT_OVERRIDES[exact];
  const base = String(name ?? "").replace(/\s*\([^)]*\)$/, "");
  const key = Object.keys(BASIC_FEAT_OVERRIDES).find(entry => lower(entry) === lower(base));
  return key ? BASIC_FEAT_OVERRIDES[key] : null;
}

/** Applies the override to a feat item in place. Returns true when something changed. */
export function applyBasicFeatOverride(item) {
  const override = basicFeatOverride(item.name);
  if (!override) return false;
  const system = item.system;
  const description = system.description ?? "";
  const rules = override.rules.map(entry => ({ ...entry, label: entry.label ?? item.name }));
  const reminderScopes = override.reminderScopes ?? [...new Set(rules.flatMap(entry => entry.scopes ?? []))];
  system.rules = [{ type: "reminder", scopes: reminderScopes, label: item.name, text: description, ...(override.reminderSense ? { sense: override.reminderSense } : {}) }, ...rules];
  if (override.modifiers) system.modifiers = override.modifiers.map(entry => ({ ...entry }));
  if (override.toggle) {
    system.toggle = true;
    system.active ??= false;
  }
  return true;
}
