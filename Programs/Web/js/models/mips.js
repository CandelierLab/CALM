/*
 * MIPS — motility-induced phase separation.
 *
 * The odd one out of the collection: these agents have **no interaction of
 * orientation at all**. No alignment, no attraction, not even a vision cone.
 * Each one walks its own random walk, exactly like the blind agents. The only
 * thing they do to each other is get in the way — a short-range repulsion
 * between bodies that cannot overlap.
 *
 *     ẋᵢ = v₀ e(θᵢ) + Σⱼ F(rᵢⱼ)        θ̇ᵢ = √(2Dr) ξᵢ
 *
 * And yet, above a density and a persistence, the flock separates into dense
 * clusters and near-empty space, and stays that way. It aggregates *because*
 * it repels, which is worth sitting with for a moment: every other model here
 * needs an attraction or an alignment to gather, and this one gathers with
 * neither.
 *
 * The mechanism is simple once seen. A self-propelled agent that runs into
 * others keeps pushing, because its heading only turns by diffusion; it takes
 * a while to turn away. So agents slow down where it is crowded, and slow
 * agents spend longer there, which makes it more crowded still. Blocking
 * feeds on itself. Nothing in the rule says "come together" — the asymmetry
 * between how fast an agent arrives and how slowly it can leave does the work.
 *
 * See Cates & Tailleur, "Motility-Induced Phase Separation",
 * Annu. Rev. Condens. Matter Phys. 6, 219 (2015).
 *
 * The separation needs room and persistence: push the agent count up and the
 * reorientation noise down.
 */

import { NeighbourGrid } from '../engine.js';

const grid = new NeighbourGrid();

/* Force accumulators, reused between steps. Unlike the steering models, this
 * one has to hold a displacement per agent before applying any of it: forces
 * are computed on the configuration at the start of the step, all of them,
 * and only then applied. */
let fx = new Float32Array(0);
let fy = new Float32Array(0);

export default {

  id: 'mips',

  name: {
    fr: 'Séparation de phase (MIPS)',
    en: 'Phase separation (MIPS)',
  },

  description: {
    fr: 'Ces agents n’ont <b>aucune interaction d’orientation</b> : ni '
      + 'alignement, ni attraction, ni champ de vision. Chacun suit sa propre '
      + 'marche aléatoire, comme un agent aveugle. La seule chose qu’ils se '
      + 'font, c’est de se gêner — une répulsion à courte portée, de diamètre '
      + '<i>σ</i> et d’intensité <i>A</i>. Et pourtant le groupe se sépare en '
      + 'amas denses et en vide : il <b>s’agrège parce qu’il se repousse</b>. '
      + 'La raison est que l’orientation ne tourne que par diffusion : un '
      + 'agent qui butte contre les autres continue de pousser un moment, '
      + 'donc il ralentit là où c’est encombré, donc il y reste plus '
      + 'longtemps, donc c’est encore plus encombré. Montez le nombre '
      + 'd’agents et baissez le bruit de réorientation pour voir la séparation '
      + 's’installer.',
    en: 'These agents have <b>no interaction of orientation at all</b>: no '
      + 'alignment, no attraction, no vision cone. Each walks its own random '
      + 'walk, just like a blind agent. The only thing they do to each other '
      + 'is get in the way — a short-range repulsion of diameter <i>σ</i> and '
      + 'strength <i>A</i>. And yet the group separates into dense clusters '
      + 'and empty space: it <b>aggregates because it repels</b>. The reason '
      + 'is that a heading only turns by diffusion, so an agent that runs into '
      + 'others keeps pushing for a while; it slows down where it is crowded, '
      + 'so it spends longer there, so it gets more crowded still. Raise the '
      + 'agent count and lower the reorientation noise to watch the '
      + 'separation set in.',
  },

  illustration: 'MIPS',

  params: [
    { key: 'sigma', label: '<i>σ</i>', min: 0.005, max: 0.08, step: 0.001, value: 0.03, decimals: 3 },
    /* A has to be able to actually stop an agent, or bodies simply pass
     * through each other and nothing blocks. The balance sits where the
     * repulsion at a given overlap matches the propulsion speed: with the
     * default speed of 0.006, an A of 0.02 holds agents apart at about
     * 0.7 sigma, which is the regime where the aggregation appears. */
    { key: 'push', label: '<i>A</i>', min: 0, max: 0.05, step: 0.001, value: 0.02, decimals: 3 },
  ],

  step(state, p) {
    const n = state.n;

    if (fx.length < n) {
      fx = new Float32Array(n);
      fy = new Float32Array(n);
    }
    fx.fill(0, 0, n);
    fy.fill(0, 0, n);

    grid.build(state, p.sigma);

    /* Harmonic repulsion: agents closer than σ push apart in proportion to
     * how far they have overlapped. Soft rather than hard-sphere, because a
     * hard collision cannot be resolved in one explicit step.
     *
     * A is given directly as a displacement per step rather than as a
     * stiffness times a mobility: it is the quantity that has to stay small
     * next to σ for the integration to hold, so it is the one worth putting
     * under the visitor's hand. */
    for (let i = 0; i < n; i++) {
      grid.each(state, i, p.sigma, (j, dx, dy) => {
        if (j === i) return;

        const rho = Math.hypot(dx, dy);
        if (rho === 0) return;

        /* dx, dy point from i to j, so pushing i away from j is the opposite
         * direction. Each pair is visited from both ends, which is what makes
         * the repulsion reciprocal — the contrast with Peruani's cone. */
        const overlap = 1 - rho / p.sigma;
        fx[i] -= (p.push * overlap * dx) / rho;
        fy[i] -= (p.push * overlap * dy) / rho;
      });
    }

    /* Cap the total push per step at σ/2. An agent buried in a cluster
     * accumulates many overlaps, and while they largely cancel, nothing
     * guarantees it: an uncapped sum could throw an agent clear across its own
     * neighbourhood in one step and make the simulation blow up rather than
     * separate. */
    const limit = p.sigma / 2;
    for (let i = 0; i < n; i++) {
      const magnitude = Math.hypot(fx[i], fy[i]);
      if (magnitude > limit) {
        fx[i] = (fx[i] / magnitude) * limit;
        fy[i] = (fy[i] / magnitude) * limit;
      }
    }

    /* Orientations get noise and nothing else — the whole point — then the
     * repulsion is applied on top of the self-propelled step. */
    state.move(p.speed, p.noise);
    state.displace(fx, fy);
  },
};
