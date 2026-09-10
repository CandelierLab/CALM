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
 *
 * ── Why this model has a sub-step, and only one parameter ──────────────────
 *
 * The first version of this file had two sliders, σ and a repulsion strength
 * A, and it did not separate at any setting. The reason was not the physics
 * but the integration, and it is worth writing down because the trap is a
 * general one.
 *
 * For a pair at overlap u = σ − r, a harmonic repulsion applied as a
 * displacement of (A/σ)·u per agent gives the map
 *
 *     u ← u · (1 − 2A/σ)
 *
 * so the contact relaxes smoothly only while A ≤ σ/2, rings while A < σ, and
 * diverges beyond. The old default, A = 0.02 with σ = 0.03, sat at 2A/σ =
 * 1.33: every contact overshot into a gap and came back, which is exactly the
 * buzzing, unnatural motion one saw. The slider went to A = 0.05, where the
 * map has factor −19 and only the per-agent cap kept the thing on screen.
 *
 * And the settings that were stable were far too soft to block anything. The
 * propulsion balances the repulsion at A(1 − r/σ) = v₀, which for the old
 * defaults put the equilibrium at r = 0.7σ — bodies interpenetrating by a
 * third, so an effective diameter of 0.7σ and an effective packing fraction
 * of half the nominal one. Measured on that version: the local speed still
 * held at 0.52 v₀ in the densest neighbourhoods, and the current φ·v(φ) was
 * increasing everywhere, so the MIPS instability criterion v + ρv′ < 0 was
 * not met anywhere on the sliders. The model could not separate, and no box
 * size would have saved it.
 *
 * Making the contact hard needs A ≈ 4σ, which the explicit step cannot carry.
 * The two demands — hard bodies, stable integration — are only compatible at
 * a smaller step, so the step is subdivided: the displayed frame stays one
 * time unit, and the physics runs in `substeps` of h = 1/substeps inside it.
 * Advection scales as h and the angular noise as √h, so the visible speed and
 * the rotational diffusion are unchanged; only the contacts are resolved.
 *
 * Both constants below are then fixed once and for all, in units of σ, and
 * the number of sub-steps follows from them. Which is what leaves σ alone on
 * the panel: the diameter of a body is the one quantity here with a meaning a
 * visitor can see.
 */

import { NeighbourGrid } from '../engine.js';

const grid = new NeighbourGrid();

/* Fraction of an overlap that one sub-step of repulsion removes, per agent.
 * The pair map above is u ← u(1 − 2·CONTRACTION), so staying under 1/2 is
 * what guarantees that a contact relaxes monotonically instead of ringing —
 * whatever the visitor does to the sliders. */
const CONTRACTION = 0.4;

/* Depth, in units of σ, at which the repulsion balances the propulsion. This
 * is what "hard" means here: 0.05 means a body blocks another at 0.95σ rather
 * than letting it sink to 0.7σ. It sets the sub-step, through
 * v₀·h = CONTRACTION · OVERLAP · σ. */
const OVERLAP = 0.05;

/* Ceiling on the subdivision, from the frame budget: a sub-step costs about
 * what a whole step used to (0.75 ms at a thousand agents on the development
 * machine), against 40 ms for the frame. It only binds in the corner where σ
 * is small and the speed is high — a dilute gas where nothing collides and
 * the softness it costs is invisible. */
const MAX_SUBSTEPS = 32;

/* Force accumulator, reused between steps and interleaved like the positions.
 * Unlike the steering models, this one has to hold a displacement per agent
 * before applying any of it: forces are computed on the configuration at the
 * start of the sub-step, all of them, and only then applied. */
let force = new Float32Array(0);

export default {

  id: 'mips',

  name: {
    fr: 'Répulsion stérique (MIPS)',
    en: 'Steric repulsion (MIPS)',
  },

  description: {
    fr: 'Ces agents sont juste des corps de diamètre <i>σ</i> qui ne peuvent '
      + 'pas se traverser. Leur seule interaction est donc répulsive à courte '
      + 'portée, mais pourtant le groupe se sépare en deux phases : dense et '
      + 'vide. Les agents <b>s’agrègent parce qu’ils se repoussent</b> !',
    en: 'These agents are just bodies of diameter <i>σ</i> that cannot pass '
      + 'through one another. Their only interaction is therefore a '
      + 'short-range repulsion, and yet the group separates into two phases: '
      + 'dense and empty. The agents <b>aggregate because they repel</b>!',
  },

  illustration: 'MIPS',

  /* Drawn as bodies, not as arrows. These agents have no interaction of
   * orientation whatsoever, so an arrowhead points at nothing the model uses;
   * what they do have is a diameter, and whether two of them touch is the
   * entire mechanism. `size` names the parameter that gives that diameter, so
   * the drawn body follows the σ slider. The orientation is lost from the
   * shape and kept in the colour. */
  shape: { kind: 'ball', size: 'sigma' },

  params: [
    /* The ceiling is a packing fraction, not a length: φ = nπσ²/4, so σ =
     * 0.05 already puts five hundred agents at φ ≈ 1. Past close packing the
     * bodies cannot fit and the contact goes back to being soft — gracefully,
     * but it is no longer the model. The old ceiling of 0.08 dates from when
     * they could interpenetrate freely.
     *
     * The floor is 0.002 rather than 0. Zero is a perfectly good setting for
     * the physics — no bodies, no interaction, and the model is then the
     * blind one exactly, which the tests still assert by calling step()
     * directly — but the agents are drawn *as* their bodies here, so a
     * diameter of zero paints an empty box. A slider position that makes the
     * view go blank looks like a fault, whatever it means.
     *
     * Known limitation, in 3D: the separation does not appear, and raising
     * this ceiling would not bring it. Measured at a thousand agents, with σ
     * pushed past the slider on purpose: the repulsion works — the mean
     * nearest neighbour sits at 0.99σ at σ = 0.08 and 0.95σ at σ = 0.10,
     * against 0.70σ and 0.57σ for blind walks — but the flock stays
     * homogeneous at every σ, including σ = 0.10 where the volume fraction is
     * 0.52, a perfectly ordinary MIPS density.
     *
     * What is missing is room. At a fixed density the box measures √n
     * diameters across in 2D but n^⅓ in 3D: five hundred agents give 33σ in
     * 2D, where two phases fit, while a thousand give 12σ in 3D, where they
     * do not. Matching the 2D case would take some twenty thousand agents,
     * against a cap of one thousand set by the frame budget. Raising that cap
     * is a change to every model and to the renderer, not to this file. */
    { key: 'sigma', label: '<i>σ</i>', min: 0.002, max: 0.05, step: 0.001, value: 0.03, decimals: 3,

      /* Three dimensions get their own ceiling, because σ buys a *volume*
       * fraction there: n(π/6)σ³ against nπσ²/4. At the thousand-agent cap,
       * 0.05 is φ = 0.065 in 3D — a gas — where in 2D it is already φ = 1.
       * The ceiling of 0.2 puts the whole range within reach, close packing
       * included, and is deliberately past the point where the measurements
       * above say the separation appears: it is there to be looked at rather
       * than to promise anything. See the note under `params` on why the
       * phenomenon does not show up in 3D whatever σ does. */
      dim3: { max: 0.2 } },
  ],

  step(state, p) {
    /* No bodies, nothing to collide with: the blind model, bit for bit, and
     * without paying for a grid that would find nothing. */
    if (!(p.sigma > 0)) {
      state.move(p.speed, p.noise);
      return;
    }

    const dim = state.dim;
    const n = state.n;
    const total = n * dim;

    if (force.length < total) force = new Float32Array(total);

    /* Sub-steps enough that the propulsion advances by no more than the
     * equilibrium overlap in each of them; see the note at the top. */
    const substeps = Math.min(MAX_SUBSTEPS,
      Math.max(1, Math.ceil(p.speed / (CONTRACTION * OVERLAP * p.sigma))));

    const h = 1 / substeps;
    const speed = p.speed * h;
    /* √h, not h: variances add, so this is what leaves Dr — and therefore the
     * persistence length — exactly as the visitor set it. */
    const noise = p.noise * Math.sqrt(h);

    /* Displacement per unit of overlap, in length units. Fixed at a fraction
     * of σ, which is what makes every reachable setting stable. */
    const push = CONTRACTION * p.sigma;

    /* Cap on the accumulated push of one agent in one sub-step. With a
     * monotone contact this never binds in a running flock — the typical push
     * is a few percent of σ — but it does at t = 0, where shuffle() drops
     * agents on top of each other and the initial relaxation would otherwise
     * throw them across the box. */
    const limit = p.sigma / 2;

    for (let s = 0; s < substeps; s++) {
      force.fill(0, 0, total);
      grid.build(state, p.sigma);

      /* Harmonic repulsion: agents closer than σ push apart in proportion to
       * how far they have overlapped. Soft rather than hard-sphere, because a
       * hard collision cannot be resolved in one explicit step — the sub-step
       * is what buys the stiffness back. */
      for (let i = 0; i < n; i++) {
        const base = i * dim;

        grid.each(state, i, p.sigma, (j, delta, dist2) => {
          if (j === i || dist2 === 0) return;

          const rho = Math.sqrt(dist2);
          const overlap = 1 - rho / p.sigma;
          const scale = (push * overlap) / rho;

          /* delta points from i to j, so pushing i away from j is the opposite
           * direction. Each pair is visited from both ends, which is what makes
           * the repulsion reciprocal — the contrast with Peruani's cone. */
          for (let k = 0; k < dim; k++) force[base + k] -= scale * delta[k];
        });
      }

      for (let i = 0; i < n; i++) {
        const base = i * dim;

        let magnitude = 0;
        for (let k = 0; k < dim; k++) magnitude += force[base + k] ** 2;
        magnitude = Math.sqrt(magnitude);

        if (magnitude > limit) {
          const scale = limit / magnitude;
          for (let k = 0; k < dim; k++) force[base + k] *= scale;
        }
      }

      /* Orientations get noise and nothing else — the whole point — then the
       * repulsion is applied on top of the self-propelled sub-step. Both
       * displacements are built from the configuration at the start of the
       * sub-step, so the order of the two is immaterial. */
      state.move(speed, noise);
      state.displace(force);
    }
  },
};
