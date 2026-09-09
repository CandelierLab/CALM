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
    fr: 'Agents nématiques',
    en: 'Nematic agents',
  },

  description: {
    fr: 'Les agents nématiques se comportent comme des bâtonnets : sans tête '
      + 'ni queue, ils s’alignent sur un <b>axe</b> et non sur une direction. '
      + 'Deux agents qui se croisent en sens inverse sont, pour eux, alignés. '
      + 'Il en résulte des voies orientées le long d’un axe commun, mais '
      + 'parcourues <b>dans les deux sens</b> : le groupe est fortement '
      + 'ordonné alors que sa polarisation reste nulle. C’est le mécanisme des '
      + 'suspensions bactériennes denses et des bâtonnets granulaires vibrés, '
      + 'où les collisions alignent les corps sans leur dire où aller.',
    en: 'Nematic agents behave like rods: with no head and no tail, they align '
      + 'on an <b>axis</b> rather than a direction. Two agents passing in '
      + 'opposite directions count as aligned. The result is lanes along a '
      + 'common axis carrying traffic <b>both ways</b>: the group is strongly '
      + 'ordered while its polarisation stays at zero. This is the mechanism '
      + 'behind dense bacterial suspensions and vibrated granular rods, where '
      + 'collisions align bodies without telling them which way to go.',
  },

  illustration: 'Nematic',

  params: [
    { key: 'r', label: '<i>r</i>', min: 0, max: 0.2, step: 0.002, value: 0.05, decimals: 3 },
  ],

  step(state, p) {
    const heading = state.freezeHeadings();

    grid.build(state, p.r);

    for (let i = 0; i < state.n; i++) {
      /* Doubling the angles is what makes the average blind to head-versus-
       * tail: θ and θ+π both map to 2θ. Summing those unit vectors and halving
       * the argument gives the local director — the axis the neighbourhood
       * lies along. */
      let sx = 0;
      let sy = 0;

      grid.each(state, i, p.r, (j) => {
        sx += Math.cos(2 * heading[j]);
        sy += Math.sin(2 * heading[j]);
      });

      const director = 0.5 * Math.atan2(sy, sx);

      /* The director is an axis, so it names two headings, π apart. The agent
       * keeps travelling the way it was already going and takes whichever of
       * the two is nearer — otherwise every agent whose heading happens to sit
       * on the far side would spin round, and the lanes would never form. */
      const along = Math.cos(director - heading[i]) >= 0
        ? director
        : director + Math.PI;

      state.a[i] = along;
    }

    state.move(p.speed, p.noise);
  },
};
