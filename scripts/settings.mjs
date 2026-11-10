import { TDT } from "./config.mjs";

const SYSTEM = "tdt";

export const MODULE_SETTINGS = {
  fantasy: { name: "Módulo fantástico", hint: "Arcano y Naturaleza, razas, magia sencilla (Incremental, Sacrificio) y círculos mágicos con maná, dotes físicas y sus compendios." },
  mecha: { name: "Módulo de mechas", hint: "Actor de tipo Mecha con categoría, módulos de control, puntos de inventario, Vincula voluntad, Golpe múltiple, sobrecarga y compendios de dotes, armas, inventario y enemigos." },
  powers: { name: "Módulo de superpoderes", hint: "Energía, habilidad Superpoder, poderes por ramas con Sobrecarga y Maldito, y enemigos." },
  zombie: { name: "Módulo de zombis", hint: "Zombificación, víveres y hambruna, materiales, construcción y reparación, recompensas, grupos de zombis, dotes y zombis." },
  cyber: { name: "Módulo cyberpunk", hint: "Compatibilidad cibernética y exceso de carga, implantes (con mejoras y supremos), hacking con AVS, chips, mejoras de armas, construcción con tres materiales, dinero y compendios." }
};

export const RULE_SETTINGS = {
  advancedCreation: {
    name: "Opcional: Personaje avanzado desde el comienzo",
    hint: "Añade experiencia inicial (experto +40, élite +100) y elimina los máximos de creación al comprobar personajes.",
    type: String,
    choices: { normal: "No (creación normal)", expert: "Experto (+40 XP)", elite: "Élite (+100 XP)" },
    default: "normal"
  },
  defenseSwap: {
    name: "Opcional: Reasignar dados defensivos (d8/d6/d4)",
    hint: "Permite cambiar los d6/d6/d6 de Esquiva, Fortaleza y Voluntad por d8, d6 y d4 al crear el personaje.",
    type: Boolean,
    default: true
  },
  specificWeapons: {
    name: "Opcional: Armas específicas",
    hint: "Muestra el compendio de armas específicas del módulo básico. Desactivado, solo se usan las plantillas genéricas.",
    type: Boolean,
    default: true
  },
  weaponUpgrades: {
    name: "Opcional: Mejorar armas",
    hint: "Añade a las armas las mejoras del módulo básico (cargador de doble fondo, potente, recargador rápido…).",
    type: Boolean,
    default: false
  },
  weaponCondition: {
    name: "Opcional: Estado de las armas",
    hint: "Impoluta (Daño +1), normal, dañada (penaliza 1 a distancia o Daño −1 cuerpo a cuerpo) y rota. Cada pifia atacando baja un estado. Recomendada con zombis y cyberpunk.",
    type: Boolean,
    default: false
  },
  enemyMultiAttack: {
    name: "Ataque múltiple de enemigos",
    hint: "Reducción de dificultad por cada ataque adicional de un enemigo. El manual usa 2; la opción realista usa 1.",
    type: Number,
    choices: { 2: "−2 por ataque (por defecto)", 1: "−1 por ataque (más realista)" },
    default: 2
  },
  magicMode: {
    name: "Fantástico: modo de magia disponible",
    hint: "Magia sencilla (dotes con Incremental) o la regla opcional de círculos mágicos. Cada personaje elige el suyo en su ficha si se permiten ambos.",
    type: String,
    choices: { simple: "Magia sencilla", circles: "Círculos mágicos", both: "Ambos (cada personaje elige)" },
    default: "both"
  },
  races: {
    name: "Fantástico: usar razas",
    hint: "Las razas aplican efectos mecánicos. Con el módulo fantástico, la creación da 5 incrementos de habilidad menos y 10 XP más.",
    type: Boolean,
    default: true
  },
  mechanime: {
    name: "Mechas: permitir dotes Mechanime",
    hint: "Las dotes con la etiqueta Mechanime son la parte más exagerada del módulo; el DJ decide si se permiten.",
    type: Boolean,
    default: true
  },
  mechaModuleLimit: {
    name: "Mechas: límite opcional de mejora de módulos",
    hint: "Dado máximo de los módulos de control de combate.",
    type: Number,
    choices: { 12: "Sin límite (d12)", 10: "d10", 8: "d8", 6: "d6" },
    default: 12
  },
  mechaDamage: {
    name: "Mechas: regla opcional de daños en el mecha",
    hint: "Tira en la tabla de daños (1d8) cuando un mecha pierde al menos 6 + 2 × categoría PV de un ataque o recibe una pifia defendiendo.",
    type: Boolean,
    default: false
  },
  weakPoint: {
    name: "Superpoderes: regla opcional de punto débil",
    hint: "Cada personaje puede anotar un punto débil a cambio de 1 a 10 de energía adicional, a discreción del DJ.",
    type: Boolean,
    default: false
  },
  zombieTerror: {
    name: "Zombis: regla opcional de terror",
    hint: "Un personaje aterrorizado tira Voluntad antes de cada tirada de combate; si falla, penaliza la diferencia.",
    type: Boolean,
    default: false
  },
  cyberReputation: {
    name: "Cyberpunk: regla opcional de reputación",
    hint: "Reputación de −5 a +5 por facción, que bonifica o penaliza las tiradas sociales con sus miembros.",
    type: Boolean,
    default: false
  }
};

export const ECONOMY_SETTINGS = {
  currencyEnabled: {
    name: "Economía: usar dinero",
    hint: "Muestra el saldo monetario en las fichas de personaje. El módulo cyberpunk lo muestra siempre.",
    type: Boolean,
    default: false
  },
  currencyName: {
    name: "Economía: nombre de la moneda",
    hint: "Nombre de la unidad principal, por ejemplo euros, créditos o monedas de oro.",
    type: String,
    default: "euros"
  },
  currencyHasSubunits: {
    name: "Economía: usar submonedas",
    hint: "Añade una segunda cantidad para fracciones de la moneda principal.",
    type: Boolean,
    default: true
  },
  currencySubunitName: {
    name: "Economía: nombre de la submoneda",
    hint: "Nombre de la unidad menor, por ejemplo céntimos.",
    type: String,
    default: "céntimos"
  }
};

export function registerSettings() {
  for (const [key, data] of Object.entries(MODULE_SETTINGS)) {
    game.settings.register(SYSTEM, `module.${key}`, {
      name: `${data.name}`,
      hint: data.hint,
      scope: "world",
      config: true,
      type: Boolean,
      default: false,
      requiresReload: true
    });
  }
  for (const [key, data] of Object.entries(RULE_SETTINGS)) {
    game.settings.register(SYSTEM, `rule.${key}`, {
      name: data.name,
      hint: data.hint,
      scope: "world",
      config: true,
      type: data.type,
      choices: data.choices,
      default: data.default,
      requiresReload: ["specificWeapons"].includes(key),
      onChange: () => rerenderSheets()
    });
  }
  for (const [key, data] of Object.entries(ECONOMY_SETTINGS)) {
    game.settings.register(SYSTEM, key, {
      name: data.name,
      hint: data.hint,
      scope: "world",
      config: true,
      type: data.type,
      default: data.default,
      onChange: () => rerenderSheets()
    });
  }
  game.settings.register(SYSTEM, "welcomeShown", {
    name: "Bienvenida mostrada",
    scope: "world",
    config: false,
    type: Boolean,
    default: false
  });
}

function rerenderSheets() {
  for (const app of Object.values(ui.windows ?? {})) {
    if (app?.document && app.rendered) app.render(false);
  }
}

export function moduleActive(key) {
  try {
    return Boolean(game.settings.get(SYSTEM, `module.${key}`));
  } catch {
    return false;
  }
}

export function activeModules() {
  return Object.keys(TDT.modules).filter(moduleActive);
}

export function rule(key) {
  try {
    return game.settings.get(SYSTEM, `rule.${key}`);
  } catch {
    return RULE_SETTINGS[key]?.default;
  }
}

export function currencySettings() {
  const get = key => {
    try {
      return game.settings.get(SYSTEM, key);
    } catch {
      return ECONOMY_SETTINGS[key]?.default;
    }
  };
  return {
    enabled: Boolean(get("currencyEnabled")) || moduleActive("cyber"),
    name: String(get("currencyName") || "monedas"),
    hasSubunits: Boolean(get("currencyHasSubunits")),
    subunitName: String(get("currencySubunitName") || "submonedas")
  };
}

/** A skill is visible if it is a base skill, or its module is active, and it isn't replaced by the only active module. */
export function skillVisible(key) {
  const module = TDT.skillModules[key];
  if (module) return moduleActive(module);
  const replacers = TDT.replacedSkills[key];
  if (replacers) {
    const active = activeModules();
    if (active.length && active.every(name => replacers.includes(name))) return false;
  }
  return true;
}

export function visibleSkills() {
  return Object.fromEntries(Object.entries(TDT.skills).filter(([key]) => skillVisible(key)));
}
