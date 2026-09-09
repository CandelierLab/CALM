/*
 * CALM — Canvas 2D renderer
 *
 * Each agent is an oriented triangle, with the same proportions as the Qt
 * reference (Programs/Python/Animation.py): tip at +s along the heading, base
 * of half-width s/2 at -s/2. At a hundred agents this is a few hundred path
 * operations per frame, so plain Canvas 2D is far from breaking a sweat and
 * WebGL would buy nothing but a dependency.
 *
 * Only the background and the box outline depend on the theme; the agents are
 * drawn the same way in both.
 */

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
    this.colors = [];

    /* Side of the drawing area in CSS pixels, set by resize(). */
    this.size = 0;
  }

  /* Cache one CSS colour per agent. Hue only changes on a shuffle or a resize,
   * so building these strings per frame would be pure waste.
   *
   * The reference uses HSV(hue, 1, 1), which is exactly HSL(hue, 100%, 50%). */
  refreshColors(state) {
    this.colors = new Array(state.n);
    for (let i = 0; i < state.n; i++) {
      this.colors[i] = `hsl(${state.hue[i] * 360} 100% 50%)`;
    }
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

      /* Stroke in the agent's own colour, in both themes. The stroke is there
       * to round the outline and thicken the shape a little, not to outline it
       * in a contrasting ink — a black edge on a light background made the
       * agents read as heavy and drew the eye to the outlines rather than to
       * the flock.
       *
       * The Qt reference did outline in black on its light theme; this is a
       * deliberate departure. */
      const color = this.colors[i] ?? '#888';
      ctx.fillStyle = color;
      ctx.strokeStyle = color;

      /* The domain is a torus, so an agent near an edge is also near the
       * opposite one and has to be painted there too — otherwise triangles
       * get sliced at the border, which reads as a wall that does not exist.
       * A corner agent needs all four copies. */
      const x = state.x[i];
      const y = state.y[i];
      const dxs = x > 1 - REACH ? [0, -1] : x < REACH ? [0, 1] : [0];
      const dys = y > 1 - REACH ? [0, -1] : y < REACH ? [0, 1] : [0];

      for (const dx of dxs) {
        for (const dy of dys) {
          this._triangle(x + dx, y + dy, state.a[i]);
        }
      }
    }
  }

  /* One agent, at box coordinates (x, y) with heading a.
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
