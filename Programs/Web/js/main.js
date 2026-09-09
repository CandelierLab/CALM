/*
 * CALM — entry point and animation loop.
 */

import { State } from './engine.js';
import { Renderer } from './renderer.js';
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

const canvas = document.getElementById('view');
const renderer = new Renderer(canvas);

let state = new State(100);

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
});

renderer.dark = ui.dark;

// ─── layout ──────────────────────────────────────────────────────────────

const fit = () => renderer.resize();
new ResizeObserver(fit).observe(canvas.parentElement);
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
  renderer.draw(state);

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
