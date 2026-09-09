/*
 * Aoki-Reynolds-Couzin agents — three concentric zones.
 *
 * The classic zonal model, built up over two decades: Aoki (1982) introduced
 * the concentric zones for fish schooling, Reynolds (1987) framed the same
 * three rules as separation, alignment and cohesion for his boids, and Couzin
 * et al. (2002) turned it into the quantitative model whose phase diagram —
 * swarm, torus, dynamic parallel group, highly parallel group — is the one
 * everybody reproduces.
 *
 * Around each agent:
 *
 *   ρ ≤ Rrep         repulsion   turn *away* from the neighbour
 *   Rrep < ρ ≤ Ral   alignment   turn towards its heading
 *   Ral < ρ ≤ Ratt   attraction  turn *towards* it
 *
 * plus a blind sector of half-angle α behind the agent, which sees nothing.
 *
 * Repulsion has absolute priority: an agent about to collide does nothing but
 * avoid. Otherwise alignment and attraction are averaged. The whole
 * reorientation is then capped at Δα_max per step, since a real animal cannot
 * turn arbitrarily fast — and it is that cap that produces the milling torus.
 *
 * Reference: Programs/Python/Engine.py, agent.update(), case 'Aoki-Couzin'.
 */

import { NeighbourGrid } from '../engine.js';

const grid = new NeighbourGrid();

const TWO_PI = 2 * Math.PI;

/* Largest turn allowed in one step. Fixed at π/6 in the reference, where it is
 * a property of the animal rather than something the user sets. */
const DA_MAX = Math.PI / 6;

/* Wrap an angle difference into [-π, π], so that "turn towards" always takes
 * the short way round. */
const wrap = (x) => ((((x + Math.PI) % TWO_PI) + TWO_PI) % TWO_PI) - Math.PI;

export default {

  id: 'aoki-reynolds-couzin',

  name: {
    fr: 'Boids (Aoki - Reynolds - Couzin)',
    en: 'Boids (Aoki - Reynolds - Couzin)',
  },

  description: {
    fr: 'Les agents d’Aoki-Reynolds-Couzin ont trois zones concentriques : la '
      + 'plus proche est une zone de <b>répulsion</b>, la deuxième une zone '
      + 'd’<b>alignement</b>, la plus éloignée une zone d’<b>attraction</b>. '
      + 'Un secteur aveugle de demi-angle <i>α</i> les empêche de voir derrière '
      + 'eux. La répulsion est prioritaire ; sinon alignement et attraction se '
      + 'combinent. La réorientation étant plafonnée à chaque pas, le groupe '
      + 'peut se mettre à tourner en tore.',
    en: 'Aoki-Reynolds-Couzin agents have three concentric zones: the closest '
      + 'is a <b>repulsion</b> zone, the second an <b>alignment</b> zone, the '
      + 'furthest an <b>attraction</b> zone. A blind sector of half-angle '
      + '<i>α</i> keeps them from seeing behind. Repulsion takes priority; '
      + 'otherwise alignment and attraction are combined. Because the turn is '
      + 'capped at each step, the group can settle into a milling torus.',
  },

  illustration: 'Aoki-Reynolds-Couzin',

  /* The three radii share a step, and deliberately so. The interface rounds a
   * correction away from the value it is protecting, so mixed steps are safe
   * — but a shared step means no rounding is needed at all, and the group
   * behaves exactly as the constraint says. */
  params: [
    /* Rrep stops at 0.1: past that the repulsion zone swallows the two
     * others, every neighbour crowds every other, and the mean bearing of a
     * dozen neighbours spread all round points nowhere in particular — the
     * rule stops being avoidance and becomes noise. */
    { key: 'rrep', label: '<i>R</i><sub>rep</sub>', min: 0, max: 0.1, step: 0.001, value: 0.025, decimals: 3 },
    { key: 'ral', label: '<i>R</i><sub>al</sub>', min: 0, max: 0.5, step: 0.001, value: 0.125, decimals: 3 },
    { key: 'ratt', label: '<i>R</i><sub>att</sub>', min: 0, max: 0.5, step: 0.001, value: 0.25, decimals: 3 },
    /* 0.39 rather than the reference's π/8 = 0.3927: the default has to sit
     * on a step of the slider, and it is displayed to two decimals anyway. */
    { key: 'alpha', label: '<i>α</i>', min: 0, max: Math.PI / 2, step: 0.01, value: 0.39, decimals: 2 },
  ],

  /* The three zones are concentric, so their radii must stay ordered:
   * Rrep ≤ Ral ≤ Ratt. Crossed radii are not a matter of taste — a neighbour
   * would fall in two zones at once, or the alignment zone would be inverted.
   *
   * The slider the visitor is holding always wins, and the others give way:
   * pushing Rrep up carries Ral and Ratt with it, pulling Ratt down carries
   * Ral and Rrep. That is more predictable than blocking the slider under the
   * hand, which reads as a broken control. The Qt version did a mix of the
   * two — it blocked Rrep against Ral but pushed Ral against Rrep — and this
   * harmonises it.
   */
  constrain(p, key) {
    const nested = ['rrep', 'ral', 'ratt'];
    const moved = nested.indexOf(key);
    if (moved === -1) return {};

    const fixes = {};
    const value = p[key];

    /* Everything inside the one that moved must not exceed it. */
    for (let i = moved - 1; i >= 0; i--) {
      if ((fixes[nested[i]] ?? p[nested[i]]) > value) fixes[nested[i]] = value;
    }

    /* Everything outside it must not fall below it. */
    for (let i = moved + 1; i < nested.length; i++) {
      if ((fixes[nested[i]] ?? p[nested[i]]) < value) fixes[nested[i]] = value;
    }

    return fixes;
  },

  step(state, p) {
    const dim = state.dim;
    const heading = state.freezeDirections();

    /* constrain() keeps the sliders ordered, but step() is also called
     * directly — by the tests, and by anything else that drives the model
     * without the interface — so the ordering is enforced here as well rather
     * than assumed. */
    const rrep = p.rrep;
    const ral = Math.max(p.ral, rrep);
    const ratt = Math.max(p.ratt, ral);

    grid.build(state, ratt);

    /* Blind sector: a neighbour is unseen when the angle between the
     * direction towards it and the *backwards* heading is less than α. In
     * cosines, that is -(ê·u) > cos α, which needs no trigonometry per
     * neighbour. In three dimensions the sector becomes a cone, which is the
     * natural reading of the same rule. */
    const cosAlpha = Math.cos(p.alpha);

    const repulsion = new Float32Array(dim);
    const alignment = new Float32Array(dim);
    const attraction = new Float32Array(dim);
    const target = new Float32Array(dim);

    for (let i = 0; i < state.n; i++) {
      const base = i * dim;

      repulsion.fill(0);
      alignment.fill(0);
      attraction.fill(0);
      let nRep = 0;
      let nAl = 0;
      let nAtt = 0;

      grid.each(state, i, ratt, (j, delta, dist2) => {
        if (j === i || dist2 === 0) return;

        const rho = Math.sqrt(dist2);

        let along = 0;
        for (let k = 0; k < dim; k++) along += delta[k] * heading[base + k];
        along /= rho;

        if (-along > cosAlpha) return;          // in the blind sector

        if (rho <= rrep) {
          /* Direction towards the neighbour; the flight direction is its
           * negation, taken once the sum is complete. */
          for (let k = 0; k < dim; k++) repulsion[k] += delta[k] / rho;
          nRep++;
        } else if (rho <= ral) {
          const o = j * dim;
          for (let k = 0; k < dim; k++) alignment[k] += heading[o + k];
          nAl++;
        } else {
          for (let k = 0; k < dim; k++) attraction[k] += delta[k] / rho;
          nAtt++;
        }
      });

      let wanted = false;

      if (nRep > 0) {
        /* Away from the mean direction of the crowding neighbours. Repulsion
         * has absolute priority: an agent about to collide does nothing but
         * avoid. */
        for (let k = 0; k < dim; k++) target[k] = -repulsion[k];
        wanted = true;

      } else if (nAl > 0 && nAtt > 0) {
        /* Both zones occupied: average the two desired directions, each
         * normalised first so that neither wins on neighbour count alone.
         *
         * The reference writes this branch as `if Nal & Natt`, a bitwise and
         * on two counts — which is false for, say, one aligning and two
         * attracting neighbours (1 & 2 == 0) and silently drops the
         * attraction. Read as the intended logical and here. */
        let alNorm = 0;
        let attNorm = 0;
        for (let k = 0; k < dim; k++) {
          alNorm += alignment[k] * alignment[k];
          attNorm += attraction[k] * attraction[k];
        }
        alNorm = alNorm > 1e-20 ? 1 / Math.sqrt(alNorm) : 0;
        attNorm = attNorm > 1e-20 ? 1 / Math.sqrt(attNorm) : 0;

        for (let k = 0; k < dim; k++) {
          target[k] = alignment[k] * alNorm + attraction[k] * attNorm;
        }
        wanted = true;

      } else if (nAl > 0) {
        for (let k = 0; k < dim; k++) target[k] = alignment[k];
        wanted = true;

      } else if (nAtt > 0) {
        for (let k = 0; k < dim; k++) target[k] = attraction[k];
        wanted = true;
      }

      /* Turn towards the target, by at most Δα_max. The cap is what produces
       * the milling torus, so it is not a numerical safeguard but part of the
       * model. */
      if (wanted) state.turnTowards(i, target, DA_MAX);
    }

    state.move(p.speed, p.noise);
  },
};
