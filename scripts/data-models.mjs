import { ACTOR_TEMPLATES, ACTOR_TYPES, ITEM_TEMPLATES, ITEM_TYPES } from "./data-defaults.mjs";

/**
 * TypeDataModels built from the defaults in data-defaults.mjs (the old template.json).
 * The schema keeps the exact shape the system has always used, so existing worlds load unchanged:
 * numbers stay numbers (strings from old forms are cast), lists keep any content and objects keep their keys.
 */

/** Fields where an empty value means something (an enemy defense left blank, a vehicle without a fixed Esquiva). */
const NULLABLE_NUMBERS = new Set([
  "npcStats.evasion",
  "npcStats.fortitude",
  "npcStats.will",
  "npcStats.perception",
  "evasion"
]);

function fieldFor(value, path) {
  const { SchemaField, NumberField, StringField, BooleanField, ArrayField, AnyField } = foundry.data.fields;
  if (value === null) return new NumberField({ required: false, nullable: true, initial: null });
  if (Array.isArray(value)) return new ArrayField(new AnyField());
  switch (typeof value) {
    case "number": return new NumberField({ required: true, nullable: NULLABLE_NUMBERS.has(path), initial: value });
    case "boolean": return new BooleanField({ initial: value });
    case "string": return new StringField({ required: true, blank: true, initial: value });
    case "object": return new SchemaField(schemaFor(value, path));
    default: return new AnyField({ initial: value });
  }
}

function schemaFor(data, prefix = "") {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, fieldFor(value, prefix ? `${prefix}.${key}` : key)]));
}

/** Template data of a type: its templates merged in order, then its own fields. */
export function typeDefaults(templates, types, type) {
  const entry = types[type];
  const data = {};
  for (const name of entry.templates ?? []) foundry.utils.mergeObject(data, foundry.utils.deepClone(templates[name]));
  foundry.utils.mergeObject(data, foundry.utils.deepClone(entry.data ?? {}));
  return data;
}

function modelClass(defaults) {
  return class TDTDataModel extends foundry.abstract.TypeDataModel {
    static defineSchema() {
      return schemaFor(foundry.utils.deepClone(defaults));
    }
  };
}

export function registerDataModels() {
  CONFIG.Actor.dataModels = Object.fromEntries(Object.keys(ACTOR_TYPES).map(type => [type, modelClass(typeDefaults(ACTOR_TEMPLATES, ACTOR_TYPES, type))]));
  CONFIG.Item.dataModels = Object.fromEntries(Object.keys(ITEM_TYPES).map(type => [type, modelClass(typeDefaults(ITEM_TEMPLATES, ITEM_TYPES, type))]));
}
