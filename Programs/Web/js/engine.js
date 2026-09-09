/*
 * CALM — simulation state and stepping
 *
 * Agents live on the unit torus [0,1[², exactly as in the Python reference
 * (Programs/Python/Engine.py): positions wrap around both edges, so there is
 * no boundary and no wall effect.
 *
 * State is held in flat typed arrays rather than in one object per agent. The
 * models read and write these arrays in place, which keeps a step allocation
 * free — the loop runs 25 times a second, forever, on a visitor's machine.
 */

/* Normal deviate, Box-Muller. Math.random() is uniform, and every model here
 * needs Gaussian angular noise. */
export function gaussian() {
  let u = 0;
  while (u === 0) u = Math.random();   // log(0) would be -Infinity
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
}

export class State {

  constructor(n) {
    this.n = n;
    this.x = new Float32Array(n);
    this.y = new Float32Array(n);
    this.a = new Float32Array(n);

    /* Hue is a display attribute, not a physical one, but it is drawn from the
     * agent's position at shuffle time and must survive the whole run: it is
     * what lets the eye follow the mixing. Kept here so that one shuffle
     * reseeds positions and colors together. */
    this.hue = new Float32Array(n);

    /* Scratch copy of the headings, see freezeHeadings(). */
    this._frozen = new Float32Array(n);

    this.shuffle();
  }

  /* Uniform positions, uniform orientations, hue from the initial x. The
   * colour rule is the Python one: hue = x, so the flock starts as a
   * left-to-right rainbow and the gradient reports how much it has stirred. */
  shuffle() {
    for (let i = 0; i < this.n; i++) {
      this.x[i] = Math.random();
      this.y[i] = Math.random();
      this.a[i] = Math.random() * 2 * Math.PI;
      this.hue[i] = this.x[i];
    }
  }

  /* Resize in place, preserving the agents that survive the change. Growing
   * shuffles only the newcomers, so pulling the N slider does not restart the
   * simulation that is already on screen. */
  resize(n) {
    if (n === this.n) return;

    const keep = Math.min(n, this.n);
    const grow = (source) => {
      const target = new Float32Array(n);
      target.set(source.subarray(0, keep));
      return target;
    };

    this.x = grow(this.x);
    this.y = grow(this.y);
    this.a = grow(this.a);
    this.hue = grow(this.hue);
    this._frozen = new Float32Array(n);

    for (let i = keep; i < n; i++) {
      this.x[i] = Math.random();
      this.y[i] = Math.random();
      this.a[i] = Math.random() * 2 * Math.PI;
      this.hue[i] = this.x[i];
    }

    this.n = n;
  }

  /* Snapshot of the headings as they were at the start of the step.
   *
   * Interacting models must all read the *same* configuration, or an agent
   * would align on neighbours that have already moved this step — a sequential
   * update, which is a different model from the synchronous one the reference
   * implements. The Python version gets this for free by compiling a field
   * once per step; here the buffer is reused so a step stays allocation free.
   */
  freezeHeadings() {
    this._frozen.set(this.a);
    return this._frozen;
  }

  /* Angular noise, then advection, with wrapping. Shared by every model: the
   * models decide the reorientation, this decides how a heading becomes a
   * displacement. Mirrors agent.move() in the Python reference. */
  move(speed, noise) {
    for (let i = 0; i < this.n; i++) {
      this.a[i] += noise * gaussian();

      /* ((v % 1) + 1) % 1 rather than v % 1: the remainder keeps the sign of
       * the dividend in JavaScript, so a step off the left edge would land on
       * a negative coordinate. */
      this.x[i] = (((this.x[i] + speed * Math.cos(this.a[i])) % 1) + 1) % 1;
      this.y[i] = (((this.y[i] + speed * Math.sin(this.a[i])) % 1) + 1) % 1;
    }
  }
}


/* ══════════════════════════════════════════════════════════════════════════
 *                            NEIGHBOUR GRID
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Finding the agents within a radius by testing every pair is O(N²): fine at
 * the hundred agents of the desktop reference, but the count slider goes to
 * 2000, where a step would be four million pair tests and the animation would
 * visibly stall.
 *
 * So the box is cut into square cells no smaller than the interaction radius.
 * Every agent within that radius then sits in one of the nine cells around it,
 * and the cost becomes proportional to the number of agents rather than its
 * square.
 *
 * Occupancy is stored as linked lists over two integer arrays — 'heads' gives
 * the first agent of each cell, 'next' the following one — which needs no
 * per-cell array and so no allocation once the buffers are sized.
 */

/* Cap on cells per side. A small radius would otherwise ask for a huge grid
 * (r = 0.002 would want 500×500 cells for possibly a hundred agents), all of
 * it to be cleared on every step. Capping keeps cells at least as wide as the
 * radius, which is all correctness requires. */
const MAX_CELLS = 64;

/* Below three cells per side, the nine-cell neighbourhood wraps onto itself
 * and would visit the same cell twice. Under that, scanning everything is both
 * simpler and cheaper. */
const MIN_CELLS = 3;

export class NeighbourGrid {

  constructor() {
    this.cells = 0;
    this.heads = null;
    this.next = null;
    this.bruteForce = true;
  }

  /* Index the agents for one step, for one radius. */
  build(state, radius) {
    const wanted = radius > 0 ? Math.floor(1 / radius) : MAX_CELLS;
    const cells = Math.max(1, Math.min(MAX_CELLS, wanted));

    this.bruteForce = cells < MIN_CELLS;
    if (this.bruteForce) return;

    if (this.cells !== cells) {
      this.heads = new Int32Array(cells * cells);
      this.cells = cells;
    }
    if (this.next === null || this.next.length < state.n) {
      this.next = new Int32Array(state.n);
    }

    this.heads.fill(-1);

    for (let i = 0; i < state.n; i++) {
      /* min() guards the case x === 1 exactly, which floor would put one cell
       * past the end. Positions are wrapped to [0,1[ so this is belt and
       * braces, but a rounding artefact here would be an out-of-bounds write. */
      const cx = Math.min(cells - 1, (state.x[i] * cells) | 0);
      const cy = Math.min(cells - 1, (state.y[i] * cells) | 0);
      const cell = cy * cells + cx;

      this.next[i] = this.heads[cell];
      this.heads[cell] = i;
    }
  }

  /* Call visit(j, dx, dy) for every agent j within 'radius' of agent i,
   * including i itself, with the torus-shortest offsets from i to j.
   *
   * Handing the offsets to the caller avoids computing them twice: every model
   * that needs the neighbour needs the direction to it as well.
   */
  each(state, i, radius, visit) {
    const r2 = radius * radius;
    const xi = state.x[i];
    const yi = state.y[i];

    const test = (j) => {
      /* v - round(v) is the torus-shortest separation, in [-0.5, 0.5]. */
      let dx = state.x[j] - xi;
      let dy = state.y[j] - yi;
      dx -= Math.round(dx);
      dy -= Math.round(dy);

      if (dx * dx + dy * dy <= r2) visit(j, dx, dy);
    };

    if (this.bruteForce) {
      for (let j = 0; j < state.n; j++) test(j);
      return;
    }

    const cells = this.cells;
    const cx = Math.min(cells - 1, (xi * cells) | 0);
    const cy = Math.min(cells - 1, (yi * cells) | 0);

    for (let ox = -1; ox <= 1; ox++) {
      const gx = (cx + ox + cells) % cells;
      for (let oy = -1; oy <= 1; oy++) {
        const gy = (cy + oy + cells) % cells;

        for (let j = this.heads[gy * cells + gx]; j !== -1; j = this.next[j]) {
          test(j);
        }
      }
    }
  }
}
