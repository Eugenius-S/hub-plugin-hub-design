// Hub Design: UI language. English by default, Russian when the hub language is Russian; any other language -> English.
// The language is read at USE time (never at module load): main.js registers a source (`() => hub.lang`) in register().
// Each module keeps its own table `{en: {...}, ru: {...}}` and gets its `t(key, vars)` from makeT; `{name}` is a placeholder.
let source = () => "en";

export const setLangSource = (fn) => { source = typeof fn === "function" ? fn : () => "en"; };

// "ru" or "en" for the table lookup (`ru-RU` -> `ru`)
export const baseLang = (lang) => String(lang || "").split("-")[0].toLowerCase();

export function pick(STR, lang) {
  const base = baseLang(lang);
  return STR[base] ? base : "en";
}

export const currentLang = () => pick({ en: 1, ru: 1 }, source());

export function makeT(STR) {
  return (key, vars) => {
    const text = (STR[pick(STR, source())] || {})[key] ?? STR.en[key] ?? key;
    return vars ? String(text).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m)) : text;
  };
}

// the same key in every language: to recognise a text written by the page earlier, in another language
export const allLangs = (STR, key) => Object.keys(STR).map((l) => STR[l][key]).filter((x) => x != null);
