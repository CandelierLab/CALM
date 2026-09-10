/*
 * Vicsek agents — alignment alone, and the transition it produces.
 *
 * Each agent takes the mean orientation of every agent within a radius r,
 * itself included, then moves with angular noise. There is no attraction and
 * no repulsion: alignment is the only interaction, which is what makes the
 * model the canonical one — order appears from nothing but the tendency to
 * head the same way as one's neighbours.
 *
 * Pull r up from zero and the flock goes from a gas of independent walkers to
 * a single coherent stream. Push the reorientation noise up instead and the
 * order breaks down again. That competition is the whole point, and it is why
 * the two sliders have to be live.
 *
 * Reference: Programs/Python/Engine.py, agent.update(), case 'Vicsek'.
 */

import { NeighbourGrid } from '../engine.js';

/* One grid, reused across steps: it is rebuilt each time, and keeping it here
 * means its buffers are allocated once rather than 25 times a second. */
const grid = new NeighbourGrid();

export default {

  id: 'vicsek',

  name: {
    fr: 'Alignement métrique (Vicsek)',
    en: 'Metric alignment (Vicsek)',
  },

  description: {
    fr: 'À chaque instant, les agents de Vicsek prennent l’orientation moyenne '
      + 'de tous les agents situés dans un rayon <i>r</i> autour d’eux. '
      + 'L’alignement est leur seule interaction, et il suffit à faire émerger '
      + 'de l’<b>agrégation</b> — que le bruit de réorientation vient défaire.',
    en: 'At every instant, Vicsek agents take the mean orientation of every '
      + 'agent within a radius <i>r</i> of them. Alignment is their only '
      + 'interaction, and it is enough to make <b>aggregation</b> emerge — '
      + 'which the reorientation noise undoes.',
  },

  illustration: 'Vicsek',

  params: [
    {
      key: 'r',
      label: '<i>r</i>',
      min: 0, max: 0.2, step: 0.002, value: 0.05, decimals: 3,
    },
  ],

  /* One simulation step.
   *
   * At r = 0 an agent's only neighbour is itself, so its heading is unchanged
   * and the model degenerates into the blind one. That is the correct limit,
   * not a special case to guard.
   */
  step(state, p) {
    const dim = state.dim;

    /* Every agent aligns on the configuration as it was at the start of the
     * step, not on the partially updated one. */
    const heading = state.freezeDirections();

    grid.build(state, p.r);

    /* One scratch vector for the whole step. */
    const sum = new Float32Array(dim);

    for (let i = 0; i < state.n; i++) {
      /* Mean direction: sum the unit vectors, then normalise. Averaging
       * angles instead would be wrong — 359° and 1° average to 180°, the
       * exact opposite of the right answer — and in three dimensions there is
       * no angle to average in the first place. The agent counts itself in,
       * as in the reference. */
      sum.fill(0);
      grid.each(state, i, p.r, (j) => {
        for (let k = 0; k < dim; k++) sum[k] += heading[j * dim + k];
      });

      /* Perfectly cancelling neighbours leave the heading untouched, which is
       * setDirection's contract. */
      state.setDirection(i, sum);
    }

    state.move(p.speed, p.noise);
  },
};
