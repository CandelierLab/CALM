/*
 * Nematic agents — self-propelled rods, aligned on an axis rather than a
 * direction.
 *
 * A rod has no head and no tail. Two rods lying along the same line are
 * aligned whether they point the same way or opposite ways, so the alignment
 * is defined modulo π rather than modulo 2π. Everything else is Vicsek.
 *
 * That single change gives a different phase: the group forms lanes along a
 * common axis, but with traffic running *both ways* inside them. The
 * polarisation stays near zero — as many agents go one way as the other — even
 * though the system is strongly ordered. The order is nematic, and it needs
 * its own order parameter to be seen at all: |⟨e^{2iθ}⟩|.
 *
 * The mechanism is the one behind lane formation in dense bacterial
 * suspensions and in vibrated granular rods, where collisions align bodies
 * without telling them which way to travel.
 *
 * See Ginelli et al., "Large-scale collective properties of self-propelled
 * rods", Phys. Rev. Lett. 104, 184502 (2010).
 */

import { NeighbourGrid } from '../engine.js';

const grid = new NeighbourGrid();

export default {

  id: 'nematic',

  name: {
    fr: 'Alignement nématique',
    en: 'Nematic alignment',
  },

  description: {
    fr: 'Ces agents se comportent comme des bâtonnets : sans tête ni queue, '
      + 'ils s’alignent sur un axe sans direction. Deux agents qui se croisent '
      + 'en sens inverse sont, pour eux, alignés. Il en résulte des voies '
      + 'orientées le long d’un axe commun, mais parcourues dans les deux '
      + 'sens : le groupe est <b>fortement ordonné alors que sa polarisation '
      + 'reste nulle</b>. C’est le mécanisme des suspensions bactériennes '
      + 'denses et des bâtonnets granulaires vibrés, où les collisions '
      + 'alignent les corps sans leur dire où aller.',
    en: 'These agents behave like rods: with no head and no tail, they align '
      + 'on an axis rather than on a direction. Two agents passing one another '
      + 'in opposite directions are, to them, aligned. The result is lanes '
      + 'along a common axis but travelled both ways: the group is <b>strongly '
      + 'ordered while its polarisation stays zero</b>. This is the mechanism '
      + 'of dense bacterial suspensions and of vibrated granular rods, where '
      + 'collisions align bodies without telling them where to go.',
  },

  illustration: 'Nematic',

  params: [
    { key: 'r', label: '<i>r</i>', min: 0, max: 0.2, step: 0.002, value: 0.05, decimals: 3 },
  ],

  step(state, p) {
    const dim = state.dim;
    const heading = state.freezeDirections();

    grid.build(state, p.r);

    /* Order tensor Q = Σ u⊗u over the neighbourhood, and scratch for the
     * power iteration below. Allocated once for the whole step. */
    const Q = new Float32Array(dim * dim);
    const v = new Float32Array(dim);
    const w = new Float32Array(dim);

    for (let i = 0; i < state.n; i++) {
      /* Σ u⊗u is blind to which end of the axis an agent points, since u and
       * -u give the same outer product. That is the whole trick, and unlike
       * the doubled-angle formula it works in three dimensions too: there,
       * "modulo π" is not an operation on a number, it is a statement about a
       * tensor.
       *
       * In two dimensions this is exactly equivalent to summing e^{2iθ} and
       * halving the argument. */
      Q.fill(0);
      grid.each(state, i, p.r, (j) => {
        const o = j * dim;
        for (let a = 0; a < dim; a++) {
          const ua = heading[o + a];
          for (let b = a; b < dim; b++) Q[a * dim + b] += ua * heading[o + b];
        }
      });

      /* Q is symmetric and only its upper triangle was filled. */
      for (let a = 0; a < dim; a++) {
        for (let b = 0; b < a; b++) Q[a * dim + b] = Q[b * dim + a];
      }

      /* Principal eigenvector of Q by power iteration — the local director,
       * the axis the neighbourhood lies along.
       *
       * Started from the agent's own heading, which does double duty: it is a
       * good initial guess, and it settles the sign for free. The director is
       * an axis, so it names two headings π apart, and the iteration converges
       * to whichever end it started nearest — which is the one the agent was
       * already travelling towards. Without that, every agent on the far side
       * would spin round and the lanes would never form.
       *
       * Twelve iterations: the ratio of the two leading eigenvalues sets the
       * rate, and convergence is slow only when the neighbourhood is nearly
       * isotropic — where the director is meaningless anyway and any answer
       * will do. */
      for (let c = 0; c < dim; c++) v[c] = heading[i * dim + c];

      for (let iteration = 0; iteration < 12; iteration++) {
        let norm2 = 0;
        for (let a = 0; a < dim; a++) {
          let acc = 0;
          for (let b = 0; b < dim; b++) acc += Q[a * dim + b] * v[b];
          w[a] = acc;
          norm2 += acc * acc;
        }

        /* Q annihilated the vector: the neighbourhood carries no axis. Keep
         * what we had. */
        if (norm2 < 1e-20) break;

        const inv = 1 / Math.sqrt(norm2);
        for (let a = 0; a < dim; a++) v[a] = w[a] * inv;
      }

      /* The iteration can converge to either end of the axis; take the end on
       * the same side as the current heading so the agent keeps going the way
       * it was going. */
      let dot = 0;
      for (let c = 0; c < dim; c++) dot += v[c] * heading[i * dim + c];
      if (dot < 0) for (let c = 0; c < dim; c++) v[c] = -v[c];

      state.setDirection(i, v);
    }

    state.move(p.speed, p.noise);
  },
};
