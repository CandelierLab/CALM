/*
 * CALM — Canvas 2D renderer (the 2D view)
 *
 * Each agent is an oriented triangle, with the same proportions as the Qt
 * reference (Programs/Python/Animation.py): tip at +s along the heading, base
 * of half-width s/2 at -s/2. At a hundred agents this is a few hundred path
 * operations per frame, so plain Canvas 2D is far from breaking a sweat and
 * WebGL would buy nothing but a dependency.
 *
 * Only the background and the box outline depend on the theme; the agents are
 * drawn the same way in both.
 *
 * Colour encodes **heading**, live: an agent's hue is its own direction of
 * travel. That turns the colour field into a readout of the order — a
 * polarised flock goes uniformly one colour, a nematic phase shows two hues
 * opposite on the wheel running as separate lanes, and a disordered gas stays
 * a confetti of everything. Colouring by initial position, as the Qt version
 * did, instead reported how much the flock had stirred, which said nothing
 * about the state it was in.
 */

import { headingColor } from './colormap.js';

/* Half-length of an agent, in box units. The Python reference calls it s. */
const S = 0.011;

/* Largest distance from an agent's centre to its outline, used to decide when
 * a shape straddles an edge and must be drawn twice. */
const REACH = S;

export class Renderer {

  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dark = false;

    /* Diameter of an agent's body in box units, or 0 to draw the usual
     * arrows. Set from outside on every frame, exactly like `dark`: the
     * renderer is told a length, never which model asked for it. */
    this.body = 0;

    /* Side of the drawing area in CSS pixels, set by resize(). */
    this.size = 0;
  }

  /* Match the backing store to the element's real size and pixel density.
   * Called on mount and on every layout change; cheap enough to be
   * unconditional. */
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const side = Math.max(1, Math.min(rect.width, rect.height));
    const dpr = window.devicePixelRatio || 1;

    this.size = side;
    this.canvas.width = Math.round(side * dpr);
    this.canvas.height = Math.round(side * dpr);
  }

  draw(state) {
    const ctx = this.ctx;
    const dpr = window.devicePixelRatio || 1;
    const size = this.size;

    /* Work in box units: one unit is the full side of the domain. Every length
     * below is therefore a fraction of the box, and stroke widths have to be
     * divided by the scale to stay constant on screen. */
    ctx.setTransform(size * dpr, 0, 0, size * dpr, 0, 0);

    ctx.fillStyle = this.dark ? '#000' : '#fff';
    ctx.fillRect(0, 0, 1, 1);

    /* Outline of the domain, drawn inside it so it is never clipped in half. */
    const hairline = 1 / (size * dpr);
    ctx.strokeStyle = this.dark ? '#333' : '#ccc';
    ctx.lineWidth = hairline;
    ctx.strokeRect(hairline / 2, hairline / 2, 1 - hairline, 1 - hairline);

    ctx.lineWidth = 2 / (size * dpr);
    ctx.lineJoin = 'round';

    for (let i = 0; i < state.n; i++) {

      /* Hue straight from the heading, so the colour follows the agent as it
       * turns. Shared with the 3D view, which encodes the same quantity. */
      const heading = Math.atan2(state.dir[i * 2 + 1], state.dir[i * 2]);
      const color = headingColor(heading);

      /* Stroke in the agent's own colour, in both themes. The stroke is there
       * to round the outline and thicken the shape a little, not to outline it
       * in a contrasting ink — a black edge on a light background made the
       * agents read as heavy and drew the eye to the outlines rather than to
       * the flock.
       *
       * The Qt reference did outline in black on its light theme; this is a
       * deliberate departure. */
      ctx.fillStyle = color;
      ctx.strokeStyle = color;

      /* The domain is a torus, so an agent near an edge is also near the
       * opposite one and has to be painted there too — otherwise triangles
       * get sliced at the border, which reads as a wall that does not exist.
       * A corner agent needs all four copies. */
      const x = state.pos[i * 2];
      const y = state.pos[i * 2 + 1];
      /* A body is drawn at its own diameter, so the margin has to grow with
       * it — a disc of σ = 0.05 reaches ten times further than an arrow. */
      const reach = Math.max(REACH, this.body / 2);
      const dxs = x > 1 - reach ? [0, -1] : x < reach ? [0, 1] : [0];
      const dys = y > 1 - reach ? [0, -1] : y < reach ? [0, 1] : [0];

      for (const dx of dxs) {
        for (const dy of dys) {
          if (this.body > 0) this._disc(x + dx, y + dy);
          else this._triangle(x + dx, y + dy, heading);
        }
      }
    }
  }

  /* One agent drawn as its body: a disc of the declared diameter. No heading
   * in the shape — the colour still carries it — because for a model whose
   * whole mechanism is that bodies cannot overlap, what the visitor needs to
   * see is the packing, and an arrow is not the size of anything. */
  _disc(x, y) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(x, 1 - y, this.body / 2, 0, 2 * Math.PI);
    ctx.fill();
  }

  /* One agent, at box coordinates (x, y) with heading angle a.
   *
   * y is flipped on the way in: the model has y pointing up, the canvas has it
   * pointing down. Flipping here rather than in the transform keeps the shape
   * from being mirrored, which would reverse the sense of every rotation. */
  _triangle(x, y, a) {
    const ctx = this.ctx;

    const cos = Math.cos(-a);
    const sin = Math.sin(-a);
    const px = x;
    const py = 1 - y;

    ctx.beginPath();
    ctx.moveTo(px + S * cos, py + S * sin);
    ctx.lineTo(px + (-S / 2) * cos - (S / 2) * sin, py + (-S / 2) * sin + (S / 2) * cos);
    ctx.lineTo(px + (-S / 2) * cos + (S / 2) * sin, py + (-S / 2) * sin - (S / 2) * cos);
    ctx.closePath();

    ctx.fill();
    ctx.stroke();
  }
}
