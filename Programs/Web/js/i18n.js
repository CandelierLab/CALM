/*
 * CALM — bilingual interface strings.
 *
 * Model names, descriptions and parameter labels are *not* here: they live
 * with the model that owns them, so a new model arrives complete rather than
 * scattered across two files.
 */

export const LANGUAGES = ['fr', 'en'];

export const strings = {

  fr: {
    subtitle: 'Modèles de locomotion animale collective',
    model: 'Modèle',
    shuffle: 'Répartir aléatoirement',
    pause: 'Pause',
    play: 'Reprendre',
    reset: 'Réinitialiser les paramètres',
    parameters: 'Paramètres du modèle',
    general: 'Paramètres généraux',
    noParameters: 'Ce modèle n’a pas de paramètre propre.',
    theme: 'Basculer le thème clair / sombre',
    dimensions: 'Choisir la vue en deux ou trois dimensions',
    themeLabel: 'Thème',
  },

  en: {
    subtitle: 'Collective Animal Locomotion Models',
    model: 'Model',
    shuffle: 'Shuffle agents',
    pause: 'Pause',
    play: 'Resume',
    reset: 'Reset parameters',
    parameters: 'Model parameters',
    general: 'General parameters',
    noParameters: 'This model has no parameter of its own.',
    theme: 'Toggle light / dark theme',
    dimensions: 'Choose the two- or three-dimensional view',
    themeLabel: 'Theme',
  },
};

/* Resolve a label that may or may not need translating.
 *
 * General parameters are worded ('Vitesse' / 'Speed') and carry a { fr, en }
 * object. Model parameters are mathematical symbols ('<i>r</i>') that read the
 * same in both languages and are given as a plain string. Accepting both keeps
 * the model files free of pointless duplication. */
export const label = (value, lang) =>
  typeof value === 'string' ? value : (value[lang] ?? value.en);

export const t = (key, lang) => strings[lang][key] ?? strings.en[key] ?? key;

/* Pick the initial language from the browser, defaulting to French: the
 * audience is a French laboratory's outreach site. */
export function preferredLanguage() {
  for (const tag of navigator.languages ?? [navigator.language ?? '']) {
    const code = tag.slice(0, 2).toLowerCase();
    if (LANGUAGES.includes(code)) return code;
  }
  return 'fr';
}
