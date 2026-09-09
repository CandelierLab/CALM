/*
 * Blind agents — the reference case, and the null model of the collection.
 *
 * They perceive nothing. Each one performs an independent random walk, so no
 * collective structure can appear: whatever order the eye thinks it sees here
 * is the eye's own doing. That is exactly why the model earns its place first
 * — it calibrates the viewer before any real interaction is switched on.
 */

export default {

  id: 'blind',

  name: {
    fr: 'Agents aveugles',
    en: 'Blind agents',
  },

  description: {
    fr: 'Les agents aveugles ne perçoivent pas leurs voisins et suivent des '
      + 'marches aléatoires indépendantes. Aucune structure collective ne peut '
      + 'émerger : ce modèle sert de point de comparaison pour tous les autres.',
    en: 'Blind agents do not perceive their neighbours and follow independent '
      + 'random walks. No collective structure can emerge: this model is the '
      + 'baseline every other one is read against.',
  },

  illustration: 'Blind',

  /* No parameters of its own — speed and reorientation noise are common to
   * every model and live in the general panel. An empty list is a legitimate
   * answer here, and the interface must render it without complaint. */
  params: [],

  /* One simulation step. Blind agents have no reorientation term, so the step
   * is the common move alone: angular noise, then advection on the torus. */
  step(state, p) {
    state.move(p.speed, p.noise);
  },
};
