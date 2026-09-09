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
    fr: 'Agents de Vicsek',
    en: 'Vicsek agents',
  },

  description: {
    fr: 'Les agents de Vicsek s’alignent sur leurs voisins proches : à chaque '
      + 'instant, ils prennent l’orientation moyenne de tous les agents situés '
      + 'dans un rayon <i>r</i> autour d’eux. L’alignement est leur seule '
      + 'interaction, et il suffit à faire émerger un mouvement d’ensemble — '
      + 'que le bruit de réorientation vient défaire.',
    en: 'Vicsek agents align on their close neighbours: at each step they take '
      + 'the mean orientation of every agent within a radius <i>r</i> around '
      + 'them. Alignment is their only interaction, and it is enough for '
      + 'collective motion to emerge — which the reorientation noise then '
      + 'works against.',
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
    /* Every agent aligns on the configuration as it was at the start of the
     * step, not on the partially updated one. */
    const heading = state.freezeHeadings();

    grid.build(state, p.r);

    for (let i = 0; i < state.n; i++) {
      let sx = 0;
      let sy = 0;

      /* Circular mean: sum the unit vectors, then take the argument. Averaging
       * the angles themselves would be wrong — 359° and 1° average to 180°,
       * the exact opposite of the right answer. */
      grid.each(state, i, p.r, (j) => {
        sx += Math.cos(heading[j]);
        sy += Math.sin(heading[j]);
      });

      /* atan2(0, 0) is 0, which is what np.angle(0) returns in the reference,
       * so perfectly cancelling neighbours behave identically. */
      state.a[i] = Math.atan2(sy, sx);
    }

    state.move(p.speed, p.noise);
  },
};
