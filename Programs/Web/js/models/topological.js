/*
 * Topological agents — align on the k nearest, whatever the distance.
 *
 * Same rule as Vicsek in every respect but one: the neighbourhood is counted,
 * not measured. An agent averages the headings of its k nearest neighbours,
 * however far away they happen to be.
 *
 * This is not a detail. Ballerini et al., "Interaction ruling animal
 * collective behavior depends on topological rather than metric distance:
 * Evidence from a field study", PNAS 105, 1232 (2008), reconstructed the
 * three-dimensional positions of thousands of starlings in real
 * murmurations and found the interaction range fixed at six or seven
 * *neighbours*, not at a distance.
 *
 * The consequence is what makes it worth watching next to Vicsek: spread the
 * flock out — drop the agent count — and a metric neighbourhood empties, so
 * Vicsek's order collapses. A topological one never empties, so the flock
 * stays coherent however thin it gets. That robustness is exactly what a
 * starling needs when a falcon has just torn the group open.
 */

import { KNearest } from '../engine.js';

const neighbours = new KNearest();

export default {

  id: 'topological',

  name: {
    fr: 'Alignement topologique (Ballerini)',
    en: 'Topological alignment (Ballerini)',
  },

  description: {
    fr: 'Ces agents s’alignent sur leurs <i>k</i> plus proches voisins, '
      + '<b>quelle que soit leur distance</b>. C’est ce qu’on observe chez les '
      + 'étourneaux, qui interagissent avec six ou sept voisins et non dans un '
      + 'rayon donné.',
    en: 'These agents align on their <i>k</i> nearest neighbours, <b>however '
      + 'far away they are</b>. This is what starlings do: they interact with '
      + 'six or seven neighbours rather than within a given radius.',
  },

  illustration: 'Topological',

  params: [
    { key: 'k', label: '<i>k</i>', min: 1, max: 20, step: 1, value: 7, decimals: 0 },
  ],

  step(state, p) {
    const dim = state.dim;
    const heading = state.freezeDirections();
    const k = Math.round(p.k);

    neighbours.build(state, k);

    const sum = new Float32Array(dim);

    for (let i = 0; i < state.n; i++) {
      /* The agent counts itself in, as in Vicsek: without it a lone pair would
       * just swap headings for ever. */
      for (let c = 0; c < dim; c++) sum[c] = heading[i * dim + c];

      const found = neighbours.find(state, i, k);
      for (let m = 0; m < found; m++) {
        const j = neighbours.index[m];
        for (let c = 0; c < dim; c++) sum[c] += heading[j * dim + c];
      }

      state.setDirection(i, sum);
    }

    state.move(p.speed, p.noise);
  },
};
