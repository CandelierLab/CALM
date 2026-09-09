/*
 * CALM — simulation state and stepping, in two or three dimensions.
 *
 * Agents live on the unit torus, [0,1[² or [0,1[³: positions wrap on every
 * edge, so there is no boundary and no wall effect anywhere.
 *
 * The state is dimension-generic, and that shapes everything else. An agent's
 * heading is a **unit vector**, not an angle — the one representation that
 * works in both dimensions, and the one the models were secretly using all
 * along. Every model here accumulated cosines and sines and then called
 * atan2; summing unit vectors and normalising is the same operation with the
 * detour removed, and it costs less (atan2 is not cheap).
 *
 * Positions and directions are stored interleaved — x,y[,z] per agent, one
 * after another — which keeps an agent's coordinates on the same cache line
 * and hands three.js a buffer it can read directly.
 */

/* Normal deviate, Box-Muller. Math.random() is uniform, and every model here
 * needs Gaussian angular noise. */
export function gaussian() {
  let u = 0;
  while (u === 0) u = Math.random();   // log(0) would be -Infinity
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
}

/* Uniform point on the unit sphere in `dim` dimensions. A normalised Gaussian
 * vector is isotropic in any dimension, which is exactly what is wanted and
 * avoids the classic mistake of picking spherical angles uniformly (that
 * crowds the poles). */
function randomDirection(out, dim) {
  let norm2 = 0;
  do {
    norm2 = 0;
    for (let k = 0; k < dim; k++) {
      out[k] = gaussian();
      norm2 += out[k] * out[k];
    }
  } while (norm2 < 1e-12);            // vanishingly rare, but not impossible

  const inv = 1 / Math.sqrt(norm2);
  for (let k = 0; k < dim; k++) out[k] *= inv;
}

export class State {

  constructor(n, dim = 2) {
    this.dim = dim;
    this.n = n;

    this.pos = new Float32Array(n * dim);
    this.dir = new Float32Array(n * dim);

    /* Scratch copy of the directions, see freezeDirections(). */
    this._frozen = new Float32Array(n * dim);

    /* Small per-agent scratch, so a step allocates nothing. */
    this._v = new Float32Array(dim);
    this._w = new Float32Array(dim);

    this.shuffle();
  }

  /* Uniform positions, isotropic directions. */
  shuffle() {
    const dim = this.dim;
    for (let i = 0; i < this.n; i++) {
      const o = i * dim;
      for (let k = 0; k < dim; k++) this.pos[o + k] = Math.random();

      randomDirection(this._v, dim);
      for (let k = 0; k < dim; k++) this.dir[o + k] = this._v[k];
    }
  }

  /* Resize in place, preserving the agents that survive. Growing shuffles only
   * the newcomers, so pulling the count slider does not restart what is
   * already on screen. */
  resize(n) {
    if (n === this.n) return;

    const dim = this.dim;
    const keep = Math.min(n, this.n) * dim;

    const grow = (source) => {
      const target = new Float32Array(n * dim);
      target.set(source.subarray(0, keep));
      return target;
    };

    this.pos = grow(this.pos);
    this.dir = grow(this.dir);
    this._frozen = new Float32Array(n * dim);

    const from = this.n;
    this.n = n;

    for (let i = from; i < n; i++) {
      const o = i * dim;
      for (let k = 0; k < dim; k++) this.pos[o + k] = Math.random();
      randomDirection(this._v, dim);
      for (let k = 0; k < dim; k++) this.dir[o + k] = this._v[k];
    }
  }

  /* Switch between two and three dimensions.
   *
   * The agents are reseeded rather than lifted: a 2D configuration embedded in
   * 3D would sit in a single plane, which looks like a bug and takes a long
   * time to relax. Starting fresh is both honest and quicker to read. */
  setDim(dim) {
    if (dim === this.dim) return;

    this.dim = dim;
    this.pos = new Float32Array(this.n * dim);
    this.dir = new Float32Array(this.n * dim);
    this._frozen = new Float32Array(this.n * dim);
    this._v = new Float32Array(dim);
    this._w = new Float32Array(dim);

    this.shuffle();
  }

  /* Snapshot of the directions as they were at the start of the step.
   *
   * Interacting models must all read the *same* configuration, or an agent
   * would align on neighbours that have already moved this step — a sequential
   * update, which is a different model from the synchronous one the reference
   * implements. The buffer is reused, so a step stays allocation free. */
  freezeDirections() {
    this._frozen.set(this.dir);
    return this._frozen;
  }

  /* Point agent i along `v`, normalised.
   *
   * Returns false and leaves the direction alone when `v` is too short to have
   * a direction — perfectly cancelling neighbours, say. Keeping the previous
   * heading is the sensible reading: the neighbourhood said nothing, so
   * nothing changes. (The 2D reference reached atan2(0,0) here and silently
   * snapped the agent to heading zero.) */
  setDirection(i, v) {
    const dim = this.dim;

    let norm2 = 0;
    for (let k = 0; k < dim; k++) norm2 += v[k] * v[k];
    if (norm2 < 1e-20) return false;

    const inv = 1 / Math.sqrt(norm2);
    const o = i * dim;
    for (let k = 0; k < dim; k++) this.dir[o + k] = v[k] * inv;
    return true;
  }

  /* Turn agent i towards the direction `target`, by at most `maxAngle`.
   *
   * The rotation happens in the plane spanned by the current heading and the
   * target, which is the shortest path between them in any dimension. Used by
   * the zonal model, where a capped turn rate is what produces milling.
   */
  turnTowards(i, target, maxAngle) {
    const dim = this.dim;
    const o = i * dim;

    /* Normalise the target into scratch. */
    let norm2 = 0;
    for (let k = 0; k < dim; k++) norm2 += target[k] * target[k];
    if (norm2 < 1e-20) return false;

    const inv = 1 / Math.sqrt(norm2);
    const t = this._w;
    for (let k = 0; k < dim; k++) t[k] = target[k] * inv;

    let dot = 0;
    for (let k = 0; k < dim; k++) dot += this.dir[o + k] * t[k];
    dot = Math.max(-1, Math.min(1, dot));

    if (Math.acos(dot) <= maxAngle) {
      for (let k = 0; k < dim; k++) this.dir[o + k] = t[k];
      return true;
    }

    /* Component of the target perpendicular to the heading, normalised: the
     * direction to lean into. */
    const perp = this._v;
    let perp2 = 0;
    for (let k = 0; k < dim; k++) {
      perp[k] = t[k] - dot * this.dir[o + k];
      perp2 += perp[k] * perp[k];
    }

    /* Exactly antiparallel: the target is a half turn away, so no plane is
     * defined and there is no shortest path — turning left and turning right
     * are equally good. It is a real situation, not a numerical accident: an
     * agent fleeing a neighbour dead ahead wants to reverse. Breaking the tie
     * at random is the physical answer, and refusing to turn would leave the
     * agent ploughing straight into what it is trying to avoid. */
    if (perp2 < 1e-20) {
      let attempts = 0;
      do {
        randomDirection(perp, dim);

        let along = 0;
        for (let k = 0; k < dim; k++) along += perp[k] * this.dir[o + k];

        perp2 = 0;
        for (let k = 0; k < dim; k++) {
          perp[k] -= along * this.dir[o + k];
          perp2 += perp[k] * perp[k];
        }
      } while (perp2 < 1e-12 && ++attempts < 8);

      if (perp2 < 1e-12) return false;      // vanishingly unlikely
    }

    const pinv = 1 / Math.sqrt(perp2);
    const c = Math.cos(maxAngle);
    const s = Math.sin(maxAngle);

    let turned2 = 0;
    for (let k = 0; k < dim; k++) {
      const v = c * this.dir[o + k] + s * perp[k] * pinv;
      this.dir[o + k] = v;
      turned2 += v * v;
    }

    /* Renormalise, as move() does: 32-bit rounding compounds. */
    if (turned2 > 1e-20) {
      const renorm = 1 / Math.sqrt(turned2);
      for (let k = 0; k < dim; k++) this.dir[o + k] *= renorm;
    }
    return true;
  }

  /* Add a displacement to every position, with wrapping.
   *
   * Almost every model steers: it decides a heading and lets move() turn that
   * into a displacement. A model with *forces* — repulsion between bodies —
   * also needs to push agents sideways, independently of where they point,
   * and this is how it does that. `delta` is interleaved like pos. */
  displace(delta) {
    const total = this.n * this.dim;
    for (let i = 0; i < total; i++) {
      this.pos[i] = (((this.pos[i] + delta[i]) % 1) + 1) % 1;
    }
  }

  /* Angular noise, then advection, with wrapping. Shared by every model: the
   * models decide the reorientation, this decides how a heading becomes a
   * displacement.
   *
   * The noise is a rotation by a Gaussian angle in a randomly chosen plane
   * containing the heading. In two dimensions there is only one such plane and
   * this reduces to the reference's `a += σ·N(0,1)`; in three it explores the
   * sphere isotropically, which a naive perturbation of spherical angles
   * would not.
   */
  move(speed, noise) {
    const dim = this.dim;
    const g = this._v;

    for (let i = 0; i < this.n; i++) {
      const o = i * dim;

      if (noise > 0) {
        /* A Gaussian vector, with its component along the heading removed:
         * what remains is an isotropic direction perpendicular to it. */
        let dot = 0;
        for (let k = 0; k < dim; k++) {
          g[k] = gaussian();
          dot += g[k] * this.dir[o + k];
        }

        let perp2 = 0;
        for (let k = 0; k < dim; k++) {
          g[k] -= dot * this.dir[o + k];
          perp2 += g[k] * g[k];
        }

        if (perp2 > 1e-20) {
          const inv = 1 / Math.sqrt(perp2);
          const angle = noise * gaussian();
          const c = Math.cos(angle);
          const s = Math.sin(angle) * inv;

          let norm2 = 0;
          for (let k = 0; k < dim; k++) {
            const v = c * this.dir[o + k] + s * g[k];
            this.dir[o + k] = v;
            norm2 += v * v;
          }

          /* Renormalise. The rotation is exact on paper — cos²+sin² = 1 over
           * two orthonormal vectors — but these are 32-bit floats and the
           * error compounds: over a few thousand steps the norm drifts far
           * enough to matter, and a simulation left running for an afternoon
           * would slowly change speed. Cheap insurance. */
          if (norm2 > 1e-20) {
            const renorm = 1 / Math.sqrt(norm2);
            for (let k = 0; k < dim; k++) this.dir[o + k] *= renorm;
          }
        }
      }

      for (let k = 0; k < dim; k++) {
        this.pos[o + k] = (((this.pos[o + k] + speed * this.dir[o + k]) % 1) + 1) % 1;
      }
    }
  }
}

/* ══════════════════════════════════════════════════════════════════════════
 *                            NEIGHBOUR GRID
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Finding the agents within a radius by testing every pair is O(N²): fine at
 * the hundred agents of the desktop reference, but the count slider goes to a
 * thousand, where a step would be a million pair tests and the animation
 * would visibly stall.
 *
 * So the box is cut into cells no smaller than the interaction radius. Every
 * agent within that radius then sits in one of the 3^dim cells around it, and
 * the cost becomes proportional to the number of agents rather than its
 * square.
 *
 * Occupancy is stored as linked lists over two integer arrays — 'heads' gives
 * the first agent of each cell, 'next' the following one — which needs no
 * per-cell array and so no allocation once the buffers are sized.
 */

/* Cells per side, capped so the grid stays around four thousand cells in
 * either dimension: a small radius would otherwise ask for a huge grid, all
 * of it to be cleared on every step. Capping keeps cells at least as wide as
 * the radius, which is all correctness requires. */
const MAX_CELLS = { 2: 64, 3: 16 };

/* Below three cells per side, the 3^dim neighbourhood wraps onto itself and
 * would visit the same cell twice. Under that, scanning everything is both
 * simpler and cheaper. */
const MIN_CELLS = 3;

export class NeighbourGrid {

  constructor() {
    this.cells = 0;
    this.dim = 0;
    this.heads = null;
    this.next = null;
    this.offsets = null;
    this.bruteForce = true;

    this._delta = new Float32Array(3);
  }

  /* Index the agents for one step, for one radius. */
  build(state, radius) {
    const dim = state.dim;

    if (this._delta.length < dim) this._delta = new Float32Array(dim);

    const cap = MAX_CELLS[dim] ?? 16;
    const wanted = radius > 0 ? Math.floor(1 / radius) : cap;
    const cells = Math.max(1, Math.min(cap, wanted));

    this.bruteForce = cells < MIN_CELLS;
    if (this.bruteForce) return;

    if (this.cells !== cells || this.dim !== dim) {
      this.cells = cells;
      this.dim = dim;
      this.heads = new Int32Array(cells ** dim);

      /* The 3^dim relative cell offsets, enumerated once. */
      const count = 3 ** dim;
      this.offsets = new Int32Array(count * dim);
      for (let m = 0; m < count; m++) {
        let rest = m;
        for (let k = 0; k < dim; k++) {
          this.offsets[m * dim + k] = (rest % 3) - 1;
          rest = (rest - (rest % 3)) / 3;
        }
      }
    }

    if (this.next === null || this.next.length < state.n) {
      this.next = new Int32Array(state.n);
    }

    this.heads.fill(-1);

    for (let i = 0; i < state.n; i++) {
      let cell = 0;
      for (let k = 0; k < dim; k++) {
        /* min() guards a coordinate of exactly 1, which floor would put one
         * cell past the end. Positions are wrapped to [0,1[ so this is belt
         * and braces, but a rounding artefact would be an out-of-bounds
         * write. */
        const c = Math.min(cells - 1, (state.pos[i * dim + k] * cells) | 0);
        cell = cell * cells + c;
      }

      this.next[i] = this.heads[cell];
      this.heads[cell] = i;
    }
  }

  /* Call visit(j, delta, dist2) for every agent j within `radius` of agent i,
   * including i itself, where delta is the torus-shortest offset from i to j.
   *
   * `delta` is a scratch buffer reused across calls: read it, do not keep it.
   * Handing it to the caller avoids computing it twice — every model that
   * needs a neighbour needs the direction to it as well.
   */
  each(state, i, radius, visit) {
    const dim = state.dim;
    const r2 = radius * radius;
    const delta = this._delta;
    const pos = state.pos;
    const base = i * dim;

    const test = (j) => {
      let dist2 = 0;
      for (let k = 0; k < dim; k++) {
        /* v - round(v) is the torus-shortest separation, in [-0.5, 0.5]. */
        let d = pos[j * dim + k] - pos[base + k];
        d -= Math.round(d);
        delta[k] = d;
        dist2 += d * d;
      }
      if (dist2 <= r2) visit(j, delta, dist2);
    };

    if (this.bruteForce) {
      for (let j = 0; j < state.n; j++) test(j);
      return;
    }

    const cells = this.cells;
    const count = 3 ** dim;

    /* The agent's own cell coordinates. */
    const home = this._home ?? (this._home = new Int32Array(3));
    for (let k = 0; k < dim; k++) {
      home[k] = Math.min(cells - 1, (pos[base + k] * cells) | 0);
    }

    for (let m = 0; m < count; m++) {
      let cell = 0;
      for (let k = 0; k < dim; k++) {
        const c = (home[k] + this.offsets[m * dim + k] + cells) % cells;
        cell = cell * cells + c;
      }

      for (let j = this.heads[cell]; j !== -1; j = this.next[j]) test(j);
    }
  }
}

/* ══════════════════════════════════════════════════════════════════════════
 *                        K NEAREST NEIGHBOURS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Topological neighbourhoods — the k nearest agents, whatever the distance —
 * rather than metric ones. The distinction is the whole point of the model
 * that uses this: a metric neighbourhood empties out when the group spreads,
 * a topological one never does.
 *
 * Which makes the implementation awkward, because the grid needs a radius and
 * this rule has none. The way out is two-tier: search a radius wide enough to
 * hold k neighbours *at the mean density*, and for the agents that come up
 * short — the ones in a sparse patch, exactly the ones the model is about —
 * fall back to scanning everything. Truncating instead would quietly turn the
 * model back into a metric one, which is the one thing it must not be.
 */

export class KNearest {

  constructor() {
    this.grid = new NeighbourGrid();
    this.radius = 0;

    /* Results of the last find(): neighbour indices, nearest first, and how
     * many were found. Reused between calls, so read them before calling
     * again. */
    this.index = new Int32Array(0);
    this.found = 0;

    this._dist2 = new Float64Array(0);
  }

  /* Index the agents once for the whole step. */
  build(state, k) {
    const wanted = Math.max(1, Math.min(k, state.n - 1));
    const density = Math.max(1, state.n);

    /* Radius expected to hold k neighbours at the mean density (the box has
     * unit measure, so the density is just the count), with a factor of two of
     * margin. The volume of a d-ball differs between dimensions, hence the
     * two cases. Capped at half the box: beyond that the torus wraps onto
     * itself and a wider search finds nothing new. */
    const ideal = state.dim === 3
      ? Math.cbrt((3 * wanted) / (4 * Math.PI * density))
      : Math.sqrt(wanted / (Math.PI * density));

    this.radius = Math.min(0.5, 2 * ideal);
    this.grid.build(state, this.radius);

    if (this.index.length < wanted) {
      this.index = new Int32Array(wanted);
      this._dist2 = new Float64Array(wanted);
    }
  }

  /* Fill index[0 .. found-1] with the nearest neighbours of agent i, closest
   * first, excluding i itself. Sets found to the number available, which is
   * less than k only when the flock has fewer than k+1 agents. */
  find(state, i, k) {
    const wanted = Math.max(1, Math.min(k, state.n - 1));
    this.found = 0;

    /* Insertion into a sorted list of at most k entries. k is small — seven in
     * the starlings — so this beats sorting the whole neighbourhood. */
    const offer = (j, dist2) => {
      if (this.found === wanted && dist2 >= this._dist2[this.found - 1]) return;

      let at = Math.min(this.found, wanted - 1);
      while (at > 0 && this._dist2[at - 1] > dist2) {
        this._dist2[at] = this._dist2[at - 1];
        this.index[at] = this.index[at - 1];
        at--;
      }
      this._dist2[at] = dist2;
      this.index[at] = j;
      if (this.found < wanted) this.found++;
    };

    this.grid.each(state, i, this.radius, (j, _delta, dist2) => {
      if (j !== i) offer(j, dist2);
    });

    /* Short of neighbours: this agent sits in a sparse patch, so scan the
     * whole flock rather than pretend its neighbourhood ends at the radius. */
    if (this.found < wanted) {
      this.found = 0;
      const dim = state.dim;
      const pos = state.pos;
      const base = i * dim;

      for (let j = 0; j < state.n; j++) {
        if (j === i) continue;

        let dist2 = 0;
        for (let k2 = 0; k2 < dim; k2++) {
          let d = pos[j * dim + k2] - pos[base + k2];
          d -= Math.round(d);
          dist2 += d * d;
        }
        offer(j, dist2);
      }
    }

    return this.found;
  }
}
