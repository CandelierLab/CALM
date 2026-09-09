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
    fr: 'Agents topologiques',
    en: 'Topological agents',
  },

  description: {
    fr: 'Les agents topologiques s’alignent sur leurs <i>k</i> plus proches '
      + 'voisins, quelle que soit leur distance : le voisinage se compte, il '
      + 'ne se mesure pas. C’est ce qu’on observe chez les étourneaux, qui '
      + 'interagissent avec six ou sept voisins et non dans un rayon donné '
      + '(Ballerini <i>et al.</i>, 2008). Comparez avec Vicsek en réduisant le '
      + 'nombre d’agents : le voisinage métrique se vide et l’ordre s’effondre, '
      + 'le voisinage topologique ne se vide jamais et le groupe reste '
      + 'cohérent — de quoi survivre à un faucon qui vient d’ouvrir la nuée.',
    en: 'Topological agents align on their <i>k</i> nearest neighbours, '
      + 'however far away: the neighbourhood is counted, not measured. This is '
      + 'what starlings actually do — they interact with six or seven '
      + 'neighbours rather than within a radius (Ballerini <i>et al.</i>, '
      + '2008). Compare with Vicsek by lowering the agent count: a metric '
      + 'neighbourhood empties and the order collapses, a topological one '
      + 'never empties and the flock stays coherent — which is what it takes '
      + 'to survive a falcon tearing the group open.',
  },

  illustration: 'Topological',

  params: [
    { key: 'k', label: '<i>k</i>', min: 1, max: 20, step: 1, value: 7, decimals: 0 },
  ],

  step(state, p) {
    const heading = state.freezeHeadings();
    const k = Math.round(p.k);

    neighbours.build(state, k);

    for (let i = 0; i < state.n; i++) {
      /* The agent counts itself in, as in Vicsek: without it a lone pair would
       * just swap headings for ever. */
      let sx = Math.cos(heading[i]);
      let sy = Math.sin(heading[i]);

      const found = neighbours.find(state, i, k);
      for (let m = 0; m < found; m++) {
        const j = neighbours.index[m];
        sx += Math.cos(heading[j]);
        sy += Math.sin(heading[j]);
      }

      state.a[i] = Math.atan2(sy, sx);
    }

    state.move(p.speed, p.noise);
  },
};
