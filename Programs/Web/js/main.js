/*
 * CALM — entry point and animation loop.
 */

import { State } from './engine.js';
import { Renderer } from './renderer2d.js';
import { Renderer3d } from './renderer3d.js';
import { UI } from './ui.js';

/* Simulation period, in milliseconds. The Qt reference ran on a 25 Hz QTimer
 * and took one step per tick, so the step is 40 ms here too.
 *
 * This is deliberately *not* tied to the display: requestAnimationFrame fires
 * at 60 Hz, or 120 on some screens, and stepping once per frame would make the
 * agents move half again as fast on a fancy monitor. The accumulator below
 * keeps the physics identical everywhere and lets the drawing run as smoothly
 * as the screen allows. */
const STEP_MS = 40;

/* Ceiling on the time credited to one frame. A backgrounded tab stops getting
 * frames; without this, coming back would replay every missed step in one
 * blocking burst. Dropping that time is the right call — this is a simulation
 * to watch, not a computation to complete. */
const MAX_FRAME_MS = 200;

/* One canvas per view, one shown at a time: a canvas holds either a 2D
 * context or a WebGL one, never both. */
const canvas2d = document.getElementById('view');
const canvas3d = document.getElementById('view3d');

const renderers = {
  2: new Renderer(canvas2d),
  3: new Renderer3d(canvas3d),
};

/* Must match the 'count' default in common.js: the interface reads its
 * sliders from the descriptors, and the state is built before the UI. */
let state = new State(500, 2);

/* The renderer for the current view. */
let renderer = renderers[2];

const ui = new UI({

  onShuffle() {
    state.shuffle();
  },

  onParam(key, value) {
    /* Every other parameter is read straight from ui.values at step time, so
     * it takes effect on the next step with nothing to do here. The agent
     * count is the exception: it changes the size of the state. */
    if (key === 'count') {
      state.resize(Math.round(value));
    }
  },

  onModel() {
    /* Deliberately empty. Changing model changes which rules the existing
     * agents obey, and keeping their positions is what makes the comparison
     * between two models readable. */
  },

  onDim(dim) {
    /* Switching view switches the simulation with it: the models run in
     * whatever dimension the state has, so this is one change, not two. The
     * agents are reseeded — a 2D configuration lifted into 3D would sit in a
     * single plane and take a long time to look like anything. */
    state.setDim(dim);

    /* Give the GPU buffers back when leaving the 3D view — but not when
     * entering it, which would throw away the mesh just built. */
    if (dim !== 3) renderers[3].dispose();

    canvas2d.hidden = dim !== 2;
    canvas3d.hidden = dim !== 3;

    renderer = renderers[dim];
    renderer.dark = ui.dark;

    /* The element was hidden until a moment ago, so it had no measurable size
     * to size a backing store against. */
    renderer.resize();
  },
});

renderer.dark = ui.dark;

// ─── layout ──────────────────────────────────────────────────────────────

const fit = () => renderer.resize();
new ResizeObserver(fit).observe(canvas2d.parentElement);
window.addEventListener('resize', fit);
fit();

// ─── loop ────────────────────────────────────────────────────────────────

let accumulator = 0;
let previous = performance.now();

function frame(now) {
  const elapsed = Math.min(now - previous, MAX_FRAME_MS);
  previous = now;

  if (ui.running) {
    accumulator += elapsed;
    while (accumulator >= STEP_MS) {
      ui.model.step(state, ui.values);
      accumulator -= STEP_MS;
    }
  } else {
    accumulator = 0;
  }

  /* The renderer's theme is owned by the UI, which can flip it at any time. */
  renderer.dark = ui.dark;

  /* A model may ask to be drawn as bodies rather than as arrows, by naming
   * the parameter that gives their diameter. MIPS is the case: its agents
   * *are* discs of diameter σ, and whether they touch is the whole mechanism,
   * so an arrow of some other fixed size shows the wrong thing.
   *
   * Resolved here rather than in the renderers, which know nothing of models
   * and are handed a length the same way they are handed a theme. */
  const shape = ui.model.shape;
  renderer.body = shape?.kind === 'ball' ? (ui.values[shape.size] ?? 0) : 0;

  /* The 3D view turns slowly on its own until the visitor drags it, so it
   * needs to know how much time passed. The 2D one ignores the argument. */
  renderer.draw(state, elapsed / 1000);

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
