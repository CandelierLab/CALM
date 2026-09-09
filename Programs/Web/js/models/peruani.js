/*
 * Peruani agents — attraction inside a vision cone, and nothing else.
 *
 * Barberis & Peruani, "Large-Scale Patterns in a Minimal Cognitive Flocking
 * Model: Incidental Leaders, Nematic Patterns, and Aggregates",
 * Phys. Rev. Lett. 117, 248001 (2016). doi:10.1103/PhysRevLett.117.248001
 *
 * An agent turns towards the neighbours it can *see* — those within a radius
 * R and inside a cone of half-angle β around its heading:
 *
 *     θ̇ᵢ = (γ / nᵢ) Σ_{j ∈ Ωᵢ} sin(αᵢⱼ - θᵢ) + √(2Dθ) ξᵢ(t)
 *
 * where αᵢⱼ is the bearing from i to j, Ωᵢ the neighbours inside the cone and
 * nᵢ their number. Here √(2Dθ) is the general reorientation-noise slider, and
 * the step is one time unit, so γ is read as γ·dt.
 *
 * What makes this model its own class, and worth having next to the other
 * three: there is **no velocity alignment at all**. An agent never looks at
 * where its neighbours are heading, only at where they are. And because the
 * cone is one-sided, i can see j while j cannot see i — the interaction is
 * non-reciprocal, Newton's third law is broken, and the patterns that follow
 * cannot appear in an alignment model: aggregates, milling, moving files whose
 * front agents become leaders by accident of geometry, and macroscopic nematic
 * order.
 *
 * Try a narrow cone with a wide radius for the files, a wide cone for the
 * aggregates.
 */

import { NeighbourGrid } from '../engine.js';

const grid = new NeighbourGrid();

export default {

  id: 'peruani',

  name: {
    fr: 'Agents de Peruani',
    en: 'Peruani agents',
  },

  description: {
    fr: 'Les agents de Peruani sont <b>attirés</b> par les voisins qu’ils '
      + 'voient — ceux situés dans un rayon <i>R</i> et dans un cône de vision '
      + 'de demi-angle <i>β</i> devant eux. Ils ne regardent jamais '
      + 'l’orientation de leurs voisins, seulement leur position : il n’y a '
      + 'ici <b>aucun alignement</b>. Comme le cône n’est pas réciproque, un '
      + 'agent peut en voir un autre sans être vu de lui, ce qui suffit à '
      + 'produire des agrégats, des rondes et des files dont les agents de '
      + 'tête deviennent des meneurs par accident de géométrie. '
      + '<i>γ</i> est la force de cette attraction : la réorientation '
      + 'maximale, en radians, qu’un agent peut effectuer en un pas de temps. '
      + 'À <i>γ</i> nul, ils ne réagissent plus du tout ; plus il est grand, '
      + 'plus ils se tournent brusquement vers ce qu’ils voient.',
    en: 'Peruani agents are <b>attracted</b> to the neighbours they can see — '
      + 'those within a radius <i>R</i> and inside a vision cone of half-angle '
      + '<i>β</i> ahead of them. They never look at their neighbours’ '
      + 'orientation, only at their position: there is <b>no alignment</b> '
      + 'here at all. Because the cone is not reciprocal, one agent can see '
      + 'another without being seen back, and that alone produces aggregates, '
      + 'milling and moving files whose front agents become leaders by '
      + 'accident of geometry. <i>γ</i> is the strength of that attraction: '
      + 'the largest turn, in radians, an agent can make in one time step. At '
      + '<i>γ</i> = 0 they stop responding altogether; the larger it is, the '
      + 'more sharply they swing towards what they see.',
  },

  illustration: 'Peruani',

  params: [
    { key: 'R', label: '<i>R</i>', min: 0, max: 0.5, step: 0.005, value: 0.1, decimals: 3 },
    { key: 'beta', label: '<i>β</i>', min: 0, max: Math.PI, step: 0.01, value: 1.2, decimals: 2 },
    { key: 'gamma', label: '<i>γ</i>', min: 0, max: 1, step: 0.01, value: 0.3, decimals: 2 },
  ],

  /* One simulation step.
   *
   * At β = 0 the cone is empty and the agents fall back to blind random walks;
   * at β = π it is the whole disc and the interaction becomes reciprocal
   * again. Both are correct limits of the formula rather than special cases.
   */
  step(state, p) {
    const heading = state.freezeHeadings();

    grid.build(state, p.R);

    /* The cone test compares cosines rather than angles: one cos() per agent
     * instead of an atan2 and a wrap per neighbour. */
    const cosBeta = Math.cos(p.beta);

    for (let i = 0; i < state.n; i++) {
      const ai = heading[i];
      const ux = Math.cos(ai);
      const uy = Math.sin(ai);

      let torque = 0;
      let seen = 0;

      grid.each(state, i, p.R, (j, dx, dy) => {
        if (j === i) return;

        const rho = Math.hypot(dx, dy);
        if (rho === 0) return;

        /* Inside the cone: the unit vector towards j, projected on the
         * heading, must exceed cos β. */
        if ((dx * ux + dy * uy) / rho <= cosBeta) return;

        /* sin(αᵢⱼ - θᵢ) is the signed torque turning i towards j, and the
         * cross product gives it without ever forming either angle:
         *
         *   sin(α - θ) = sin α cos θ - cos α sin θ
         *              = (dy·ux - dx·uy) / ρ
         *
         * Positive when j lies to the left of i's heading, which turns i that
         * way — attraction, as intended. */
        torque += (dy * ux - dx * uy) / rho;
        seen++;
      });

      /* Normalised by the number seen, per the paper: an agent in a crowd
       * turns no harder than one with a single neighbour in view. */
      state.a[i] = seen > 0 ? ai + (p.gamma * torque) / seen : ai;
    }

    state.move(p.speed, p.noise);
  },
};
