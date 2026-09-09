/*
 * Parameters shared by every model.
 *
 * They use the same descriptor shape as a model's own parameters, so the panel
 * builder in ui.js has a single code path for both.
 *
 * The ranges reproduce the Qt reference, where a 0–100 slider was multiplied
 * by a hidden factor (speed = value × 0.0002, noise = value × 0.005). Here the
 * physical value is the slider value, which is one indirection fewer to reason
 * about and one fewer place for the two versions to drift apart.
 */

export const COMMON_PARAMS = [

  {
    /* The ceiling is set by the most expensive combination reachable from the
     * interface — Vicsek at its widest radius, where each agent interacts with
     * a good fraction of the flock. Measured in Firefox on the development
     * machine: 1000 agents take 27% of the 40 ms step budget there, 2000 take
     * 105% and the animation stalls. A thousand leaves room for a visitor's
     * slower machine, and is already a large flock to watch.
     *
     * The neighbour grid in engine.js is what makes even this possible; at a
     * small radius the same 1000 agents cost a fraction of that. */
    key: 'count',
    label: { fr: 'Nombre d’agents', en: 'Number of agents' },
    min: 1, max: 1000, step: 1, value: 500, decimals: 0,
  },

  {
    key: 'speed',
    label: { fr: 'Vitesse', en: 'Speed' },
    min: 0, max: 0.02, step: 0.0002, value: 0.006, decimals: 4,
  },

  {
    key: 'noise',
    label: { fr: 'Bruit de réorientation', en: 'Reorientation noise' },
    min: 0, max: 0.5, step: 0.005, value: 0.1, decimals: 3,
  },
];
