export const TDT = {
  dieSizes: [0, 4, 6, 8, 10, 12],
  attributes: {
    power: "Potencia",
    dexterity: "Destreza",
    mind: "Mente",
    social: "Social"
  },
  defenses: {
    evasion: "Esquiva",
    fortitude: "Fortaleza",
    will: "Voluntad"
  },
  /** Base and module skills. Module skills only appear when their module is active. */
  skills: {
    acrobatics: "Acrobacias",
    athletics: "Atletismo",
    science: "Ciencia",
    melee: "Combate con armas CaC",
    crafting: "Construir",
    deception: "Engaño",
    performance: "Interpretación",
    intimidation: "Intimidación",
    investigation: "Investigación",
    brawl: "Maniobra de lucha",
    medicine: "Medicina",
    profession: "Profesión",
    ranged: "Puntería",
    religion: "Religión",
    stealth: "Sigilo",
    society: "Sociedad",
    survival: "Supervivencia",
    diplomacy: "Diplomacia",
    arcana: "Arcano",
    nature: "Naturaleza",
    superpower: "Superpoder",
    hacking: "Hacking",
    cybernetics: "Cibernética"
  },
  skillModules: {
    arcana: "fantasy",
    nature: "fantasy",
    superpower: "powers",
    hacking: "cyber",
    cybernetics: "cyber"
  },
  /** Skills replaced by a module when it is the only module active. */
  replacedSkills: {
    science: ["fantasy"],
    medicine: ["cyber"]
  },
  ranges: {
    contact: "Contacto",
    veryShort: "Muy corta",
    short: "Corta",
    medium: "Media",
    mediumLong: "Media-larga",
    long: "Larga",
    veryLong: "Muy larga",
    extreme: "Extrema"
  },
  rangeMeters: { contact: 0, veryShort: 3, short: 6, medium: 12, mediumLong: 30, long: 60, veryLong: 240, extreme: 2000 },
  itemTypes: {
    feat: "Dote",
    weapon: "Arma",
    armor: "Armadura",
    gear: "Objeto",
    race: "Raza",
    spell: "Círculo mágico",
    power: "Poder",
    implant: "Implante",
    hack: "Hack"
  },
  gearCategories: {
    misc: "Misceláneo",
    consumable: "Consumible",
    vehicle: "Vehículo",
    skillChip: "Chip de habilidad",
    terminal: "Terminal externo",
    mecha: "Inventario de mecha"
  },
  modules: {
    fantasy: "Módulo fantástico",
    mecha: "Módulo de mechas",
    powers: "Módulo de superpoderes",
    zombie: "Módulo de zombis",
    cyber: "Módulo cyberpunk"
  },
  weaponConditions: {
    pristine: "Impoluta",
    normal: "Normal",
    damaged: "Dañada",
    broken: "Rota"
  },
  weaponConditionOrder: ["broken", "damaged", "normal", "pristine"],
  attackDefenses: {
    evasion: "Esquiva",
    fortitude: "Fortaleza",
    will: "Voluntad"
  },
  hackDefenses: {
    evasion: "Esquiva",
    fortitude: "Fortaleza",
    will: "Voluntad",
    hacking: "Hacking (intrusión)",
    gm: "DJ (dispositivos y subredes)",
    none: "Ninguna"
  },
  basicWeaponUpgrades: {
    doubleMag: "Cargador de doble fondo",
    structureBuster: "Revienta objetos",
    contusion: "Generador de contusiones",
    antiCover: "Mirilla anti cobertura",
    potent: "Potente",
    highCaliber: "Propulsor de alto calibre",
    quickReload: "Recargador rápido",
    bloody: "Sangrienta"
  },
  basicWeaponUpgradeText: {
    doubleMag: "Duplica el tamaño del cargador.",
    structureBuster: "Añade Antiestructura; si ya la tenía, ignora 5 de aguante adicionales.",
    contusion: "Reduce en 1 el valor necesario para provocar una contusión.",
    antiCover: "Omites 1 punto del bono de cobertura al atacar.",
    potent: "Daño, Área y Golpe concentrado +1.",
    highCaliber: "Rango muy largo; si ya era extremo, el rango deja de limitar.",
    quickReload: "Recargar solo gasta el equivalente a un ataque múltiple.",
    bloody: "Obtienes la dote Sangrado para esta arma (o duplicas su daño por sangrado)."
  },
  cyberGeneralUpgrades: {
    "": "Sin mejora general",
    smart: "Inteligente",
    brute: "Bruta",
    heavy: "Pesada",
    residual: "Residual"
  },
  cyberSpecialUpgrades: {
    "": "—",
    firstShot: "Primer disparo",
    lastChamber: "Último tambor",
    leadRain: "Lluvia de plomo",
    suppression: "Fuego de supresión",
    highPower: "Alta potencia",
    tripod: "Trípode",
    hawkEye: "Ojo de halcón",
    heatSeeking: "Guiado térmico"
  },
  implantTiers: {
    minor: "Menor",
    moderate: "Moderado",
    major: "Mayor",
    extreme: "Extremo",
    supreme: "Supremo"
  },
  implantRemovalDifficulty: { minor: 6, moderate: 9, major: 11, extreme: 13 },
  mechaModules: {
    melee: "Módulo cuerpo a cuerpo",
    blaster: "Módulo blasters",
    special: "Módulo armas especiales"
  },
  mechaCategories: {
    1: { robustness: 4, maneuver: 10, endurance: 8, health: 15, inventory: 50, displacement: "2d8", cruise: 80, size: 2.5 },
    2: { robustness: 4, maneuver: 8, endurance: 10, health: 20, inventory: 70, displacement: "1d8+1d6", cruise: 100, size: 5 },
    3: { robustness: 6, maneuver: 6, endurance: 13, health: 25, inventory: 100, displacement: "2d6", cruise: 120, size: 10 },
    4: { robustness: 6, maneuver: 6, endurance: 15, health: 30, inventory: 130, displacement: "1d4+1d6", cruise: 140, size: 15 },
    5: { robustness: 8, maneuver: 4, endurance: 17, health: 35, inventory: 155, displacement: "2d4", cruise: 160, size: 20 },
    6: { robustness: 10, maneuver: 4, endurance: 20, health: 40, inventory: 180, displacement: "1d4+1", cruise: 180, size: 30 },
    7: { robustness: 12, maneuver: 4, endurance: 24, health: 50, inventory: 200, displacement: "1d4+1", cruise: 200, size: 60 }
  },
  mechaOverloadTable: {
    integrated: {
      1: "El arma necesita reparaciones: no puede usarse hasta repararla y el mecha pierde 2 × categoría PV.",
      2: "El arma necesita reparaciones: no puede usarse hasta repararla y el mecha pierde categoría PV.",
      3: "El mecha pierde categoría PV. Hasta la reparación, sus ataques tienen penalizador de 2.",
      4: "Hasta la reparación, los ataques tienen penalizador de 2.",
      5: "Hasta la reparación, los ataques tienen penalizador de 1.",
      6: "Nada."
    },
    external: {
      1: "El arma se destruye, no hay reparación posible.",
      2: "El arma necesita reparaciones (cuesta el doble) y no puede usarse hasta repararla.",
      3: "Hasta la reparación, los ataques tienen penalizador de 3.",
      4: "Hasta la reparación, los ataques tienen penalizador de 2.",
      5: "Hasta la reparación, los ataques tienen penalizador de 1.",
      6: "Nada."
    }
  },
  mechaDamageTable: {
    1: "Se rompe una pierna: las maniobras tácticas en el suelo reducen ambos dados (mínimo d4+1) y solo admiten bonifica 1. En PNJ, su maniobra táctica baja 3.",
    2: "Una mano deja de funcionar; si sujetaba un arma, cae al suelo.",
    3: "Un arma malfunciona: tirada de Robustez (7); si falla, el DJ asigna un objetivo aleatorio a la vista. En PNJ, el arma deja de funcionar.",
    4: "Los propulsores dejan de funcionar; si no hay, el DJ destruye un objeto del mecha (batería, caja de munición, kit…).",
    5: "Los sensores fallan: al atacar, tira 1d4; con un 1 falla automáticamente.",
    6: "Un arma queda destruida (interna o de mano). Si no quedan armas, se pierde un brazo.",
    7: "Daños al piloto: recibe el daño infligido al mecha en sus PV, restando su aguante.",
    8: "Sin efectos negativos."
  },
  zombification: {
    1: "Te duele la herida. Sin penalizaciones.",
    2: "Vista nublada: Percepción y Puntería con penalizador de 1.",
    3: "Fiebre y mareos: Esquiva penaliza 2, resto penaliza 1; Percepción y Puntería penalizan 2.",
    4: "Los zombis te ignoran. Todas las tiradas penalizan 3.",
    5: "Mueres y te transformas en un zombi aleatorio."
  },
  hunger: {
    1: "Cansancio: tiradas de Potencia y Destreza con penalizador de 1.",
    2: "Deshidratación: también Mente y Social con penalizador de 1.",
    3: "Pierdes los estribos por la comida: Voluntad al verla o intentarás robarla.",
    4: "Exhausto: en lugar de los penalizadores de 1, penaliza 3.",
    5: "Mueres. Si tienes zombificación, te transformas en zombi."
  },
  zombieRecipes: [
    { key: "repairMeleeSimple", label: "Reparar arma CaC sencilla", materials: 2, repair: "meleeSimple" },
    { key: "repairMeleeComplex", label: "Reparar arma CaC compleja", materials: 4, repair: "meleeComplex" },
    { key: "repairRangedSimple", label: "Reparar arma a distancia sencilla", materials: 4, repair: "rangedSimple" },
    { key: "repairRangedComplex", label: "Reparar arma a distancia compleja", materials: 6, repair: "rangedComplex" },
    { key: "repairFirearm", label: "Reparar arma de fuego", materials: 8, repair: "firearm" },
    { key: "fence", label: "Construir valla improvisada", materials: 4 },
    { key: "spikes", label: "Construir picas o estacas defensivas", materials: 4, defensive: true },
    { key: "shelterOne", label: "Refugio básico para una persona", materials: 6 },
    { key: "shelterMany", label: "Refugio básico para varias personas", materials: 10 },
    { key: "trapSmall", label: "Trampa para animales pequeños", materials: 2 },
    { key: "trapDefense", label: "Trampa defensiva improvisada", materials: 6, defensive: true },
    { key: "repairBarricade", label: "Reparar barricada o estructura", materials: 4 },
    { key: "ammo", label: "Fabricar munición", materials: 1, ammo: true }
  ],
  cyberRecipes: [
    { key: "meleeLight", label: "Arma cac ligera", weapons: 0, generic: 0, construction: 2, difficulty: 6 },
    { key: "meleeMedium", label: "Arma cac media", weapons: 0, generic: 1, construction: 3, difficulty: 9 },
    { key: "meleeHeavy", label: "Arma cac pesada", weapons: 0, generic: 2, construction: 5, difficulty: 11 },
    { key: "meleeLightTech", label: "Arma cac ligera eléctrica o vibrante", weapons: 0, generic: 2, construction: 2, difficulty: 8 },
    { key: "meleeMediumTech", label: "Arma cac media eléctrica o vibrante", weapons: 0, generic: 3, construction: 3, difficulty: 11 },
    { key: "meleeHeavyTech", label: "Arma cac pesada eléctrica o vibrante", weapons: 0, generic: 4, construction: 5, difficulty: 13 },
    { key: "pistol", label: "Pistola o revólver", weapons: 3, generic: 1, construction: 0, difficulty: 6 },
    { key: "smg", label: "Subfusil o escopeta", weapons: 5, generic: 2, construction: 0, difficulty: 9 },
    { key: "rifle", label: "Fusil de asalto, ametralladora o francotirador", weapons: 8, generic: 3, construction: 0, difficulty: 11 },
    { key: "launcher", label: "Lanzacohetes", weapons: 10, generic: 4, construction: 2, difficulty: 13 },
    { key: "ammo", label: "Munición (un cargador)", weapons: 1, generic: 0, construction: 0, difficulty: 4, ammo: true },
    { key: "armorLight", label: "Armadura ligera", weapons: 0, generic: 1, construction: 3, difficulty: 6 },
    { key: "armorMedium", label: "Armadura mediana", weapons: 0, generic: 2, construction: 6, difficulty: 9 },
    { key: "armorHeavy", label: "Armadura pesada", weapons: 0, generic: 3, construction: 10, difficulty: 11 },
    { key: "implantMinor", label: "Implante menor (2–3 CC)", weapons: 0, generic: 3, construction: 0, difficulty: 6, tier: "minor" },
    { key: "implantModerate", label: "Implante moderado (4–6 CC)", weapons: 0, generic: 6, construction: 2, difficulty: 9, tier: "moderate" },
    { key: "implantMajor", label: "Implante mayor (7–9 CC)", weapons: 0, generic: 10, construction: 4, difficulty: 11, tier: "major" },
    { key: "implantExtreme", label: "Implante extremo (10–12 CC)", weapons: 0, generic: 15, construction: 6, difficulty: 13, tier: "extreme" },
    { key: "moto", label: "Moto", weapons: 0, generic: 6, construction: 10, difficulty: 9 },
    { key: "car", label: "Coche o furgoneta", weapons: 0, generic: 10, construction: 20, difficulty: 11 },
    { key: "truck", label: "Camión o blindado", weapons: 0, generic: 12, construction: 30, difficulty: 13 },
    { key: "mounted", label: "Arma montada en un vehículo", weapons: 8, generic: 3, construction: 2, difficulty: 11 }
  ],
  circleRoots: {
    fire: { label: "Fuego", cost: 2, family: "elemental", subtract: true },
    water: { label: "Agua", cost: 2, family: "elemental", subtract: true },
    air: { label: "Aire", cost: 2, family: "elemental", subtract: true },
    earth: { label: "Tierra", cost: 2, family: "elemental", subtract: true },
    electricity: { label: "Electricidad", cost: 2, family: "elemental", subtract: true },
    acid: { label: "Ácido", cost: 2, family: "elemental", subtract: true },
    void: { label: "Vacío", cost: 2, family: "elemental", subtract: true },
    light: { label: "Luz", cost: 2, family: "elemental", subtract: true },
    gravity: { label: "Gravedad", cost: 2, family: "metaphysical" },
    time: { label: "Tiempo", cost: 2, family: "metaphysical" },
    kinetic: { label: "Cinética", cost: 2, family: "metaphysical" },
    magic: { label: "Magia", cost: 1, family: "metaphysical" },
    divineLight: { label: "Luz divina", cost: 2, family: "sacred" },
    divineDark: { label: "Oscuridad divina", cost: 2, family: "sacred" },
    animal: { label: "Animal", cost: 2, family: "druidic" },
    plant: { label: "Planta", cost: 2, family: "druidic" }
  },
  circleModifiers: {
    reach: { label: "Alcance", polarity: "positive" },
    area: { label: "Área", polarity: "positive" },
    potency: { label: "Potencia", polarity: "positive" },
    acceleration: { label: "Aceleración", polarity: "positive" },
    duration: { label: "Duración", polarity: "positive" },
    deceleration: { label: "Deceleración", polarity: "negative" },
    negation: { label: "Negación", polarity: "negative" },
    target: { label: "Objetivo", polarity: "neutral" },
    property: { label: "Propiedad", polarity: "neutral" },
    form: { label: "Forma", polarity: "neutral" }
  },
  /** Feats that teach circle symbols, by root key. */
  circleRootFeats: {
    fire: ["Símbolo elemental: Fuego"],
    water: ["Símbolo elemental: Agua"],
    air: ["Símbolo elemental: Aire"],
    earth: ["Símbolo elemental: Tierra"],
    electricity: ["Símbolo elemental: Electricidad"],
    acid: ["Símbolo elemental: Ácido"],
    void: ["Símbolo elemental: Vacío"],
    light: ["Símbolo elemental: Luz"],
    gravity: ["Símbolo metafísico: Gravedad"],
    time: ["Símbolo metafísico: Tiempo"],
    kinetic: ["Símbolo metafísico: Cinética"],
    magic: ["Iniciado arcano", "Iniciado clérigo", "Símbolo metafísico: Magia"],
    divineLight: ["Marca sacra: Luz divina"],
    divineDark: ["Marca sacra: Oscuridad divina"],
    animal: ["Campo druídico: Animal", "Ánima prestada"],
    plant: ["Campo druídico: Planta", "Ánima prestada"]
  },
  modifierTargets: {
    health: "Vida máxima",
    endurance: "Aguante natural",
    armor: "Aguante de armadura",
    evasionPenalty: "Penalizador de Esquiva",
    cc: "Compatibilidad cibernética",
    mana: "Maná máximo",
    energy: "Energía máxima",
    foodNeed: "Víveres al día",
    skillPoints: "Incrementos de habilidad al crear",
    xp: "Experiencia inicial",
    hackSlots: "Ranuras de hack",
    hackBonus: "Bonifica al defenderte de hacks",
    "step.attribute.power": "Dado de Potencia",
    "step.attribute.dexterity": "Dado de Destreza",
    "step.attribute.mind": "Dado de Mente",
    "step.attribute.social": "Dado de Social",
    "step.defense.evasion": "Dado de Esquiva",
    "step.defense.fortitude": "Dado de Fortaleza",
    "step.defense.will": "Dado de Voluntad",
    "step.perception": "Dados de Percepción",
    "step.perception.auditory": "Dados de Percepción auditiva",
    "step.perception.visual": "Dados de Percepción visual",
    "mecha.endurance": "Aguante del mecha",
    "mecha.health": "Salud del mecha",
    "mecha.inventory": "Puntos de inventario",
    "mecha.step.robustness": "Dado de Robustez",
    "mecha.step.maneuver": "Dado de Maniobra táctica",
    "mecha.step.displacement": "Dados de Desplazamiento",
    "mecha.perception": "Percepción 2d10 (cámaras IA)",
    flag: "Marca especial (flag.nombre)"
  }
};
