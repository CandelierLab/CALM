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
    fr: 'Agents d’Aoki-Reynolds-Couzin',
    en: 'Aoki-Reynolds-Couzin agents',
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

  params: [
    { key: 'rrep', label: '<i>R</i><sub>rep</sub>', min: 0, max: 0.5, step: 0.005, value: 0.025, decimals: 3 },
    { key: 'ral', label: '<i>R</i><sub>al</sub>', min: 0, max: 0.5, step: 0.005, value: 0.125, decimals: 3 },
    { key: 'ratt', label: '<i>R</i><sub>att</sub>', min: 0, max: 0.5, step: 0.005, value: 0.25, decimals: 3 },
    { key: 'alpha', label: '<i>α</i>', min: 0, max: Math.PI / 2, step: 0.01, value: 0.393, decimals: 2 },
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
    const heading = state.freezeHeadings();

    /* constrain() keeps the sliders ordered, but step() is also called
     * directly — by the tests, and by anything else that drives the model
     * without the interface — so the ordering is enforced here as well rather
     * than assumed. */
    const rrep = p.rrep;
    const ral = Math.max(p.ral, rrep);
    const ratt = Math.max(p.ratt, ral);

    grid.build(state, ratt);

    for (let i = 0; i < state.n; i++) {
      const ai = heading[i];

      /* Circular sums per zone. Repulsion and attraction accumulate the
       * *directions to* neighbours; alignment accumulates their headings. */
      let repX = 0, repY = 0, nRep = 0;
      let alX = 0, alY = 0, nAl = 0;
      let attX = 0, attY = 0, nAtt = 0;

      grid.each(state, i, ratt, (j, dx, dy) => {
        if (j === i) return;

        const rho = Math.hypot(dx, dy);
        if (rho === 0) return;              // coincident agents have no direction

        /* Bearing to the neighbour, in the agent's own frame: this is what
         * makes the blind sector and the zone rules independent of where the
         * agent happens to be heading. */
        let theta = Math.atan2(dy, dx) - ai;
        theta = ((theta % TWO_PI) + TWO_PI) % TWO_PI;

        /* Blind sector, centred behind the agent (θ = π). */
        if (theta >= Math.PI - p.alpha && theta <= Math.PI + p.alpha) return;

        if (rho <= rrep) {
          repX += Math.cos(theta); repY += Math.sin(theta); nRep++;
        } else if (rho <= ral) {
          alX += Math.cos(heading[j]); alY += Math.sin(heading[j]); nAl++;
        } else {
          attX += Math.cos(theta); attY += Math.sin(theta); nAtt++;
        }
      });

      let da = 0;

      if (nRep > 0) {
        /* Away from the mean bearing of the crowding neighbours. */
        da = Math.atan2(-repY, -repX);

      } else if (nAl > 0 && nAtt > 0) {
        /* Both zones occupied: average the two desired turns, again the
         * circular way.
         *
         * The reference writes this branch as `if Nal & Natt`, a bitwise and
         * on two counts — which is false for, say, one aligning and two
         * attracting neighbours (1 & 2 == 0) and silently drops the attraction.
         * Read as the intended logical and here. */
        const dAl = wrap(Math.atan2(alY, alX) - ai);
        const dAtt = Math.atan2(attY, attX);
        da = Math.atan2(Math.sin(dAl) + Math.sin(dAtt),
                        Math.cos(dAl) + Math.cos(dAtt));

      } else if (nAl > 0) {
        da = wrap(Math.atan2(alY, alX) - ai);

      } else if (nAtt > 0) {
        da = Math.atan2(attY, attX);
      }

      if (Math.abs(da) > DA_MAX) da = DA_MAX * Math.sign(da);

      state.a[i] = ai + da;
    }

    state.move(p.speed, p.noise);
  },
};
