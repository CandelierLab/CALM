/*
 * Model registry.
 *
 * The <select> and the parameter panel are both generated from this list, and
 * nothing else in the application names a model. Adding Vicsek, Aoki-Couzin or
 * the perceptrons means writing one file and adding one line here — no change
 * to the interface, the loop or the renderer.
 *
 * A model is an object with:
 *
 *   id            unique string, used in the URL fragment
 *   name          { fr, en } short label for the selector
 *   description   { fr, en } one paragraph shown under the illustration
 *   illustration  basename in img/ ('Blind' → Blind.svg / Blind_dark.svg)
 *   params        list of parameter descriptors, possibly empty:
 *                   { key, label, min, max, step, value, decimals }
 *                 'label' is HTML, so italics and subscripts are allowed.
 *   step(state,p) advances the simulation by one step, in place. 'p' carries
 *                 the model's own parameters *and* the common ones (speed,
 *                 noise). The model is responsible for calling state.move()
 *                 last, since models differ in whether they set the heading
 *                 or add to it.
 *
 *   draft         optional, default false. A draft model is hidden from the
 *                 deployed site but shown in development, so that something
 *                 half-finished can live in the tree without being presented
 *                 to visitors as though it worked. See publishedModels().
 *
 *   constrain(p, key)   optional. Called after the visitor moves a slider,
 *                 with all current values and the key that changed. Returns
 *                 an object of corrections — { otherKey: newValue } — which
 *                 the interface applies to the matching sliders.
 *
 *                 This is how a model states relations *between* its own
 *                 parameters, such as nested radii, without the interface
 *                 knowing anything about the model. Omit it when the
 *                 parameters are independent.
 */

import blind from './blind.js';
import vicsek from './vicsek.js';
import topological from './topological.js';
import nematic from './nematic.js';
import aokiReynoldsCouzin from './aoki-reynolds-couzin.js';
import peruani from './peruani.js';
import mips from './mips.js';

/* Order is the order of the selector, and the first one is the default: the
 * blind agents come first because they are the null model everything else is
 * read against. */
/* A reading order, not an alphabet: no interaction at all, then the three
 * flavours of alignment (by distance, by count, on an axis), then the zonal
 * boids, then position-based attraction, and finally no orientation
 * interaction again — but with bodies that collide.
 *
 * The ids are not the display names and never follow them: they appear in the
 * URL fragment, so renaming a model in the interface must not break a link
 * somebody saved. */
export const allModels = [
  blind,
  vicsek,
  topological,
  nematic,
  aokiReynoldsCouzin,
  peruani,
  mips,
];

/* Where drafts are shown: on a development host, or on explicit request.
 *
 * The rule is deliberately about *where the page is served from* rather than
 * about a build step. There is no build here — what runs in development is
 * byte for byte what gets deployed — so the distinction has to be made at
 * runtime or not at all. And "?draft" means a draft can still be looked at on
 * the live site by someone who knows to ask, which is what makes it possible
 * to check a fix in place.
 */
export function showsDrafts(location = globalThis.location) {
  if (!location) return true;                    // not in a browser: show all

  const host = location.hostname ?? '';
  if (host === '' || host === 'localhost' || host === '127.0.0.1'
      || host === '::1' || host.endsWith('.local')) {
    return true;
  }

  return new URLSearchParams(location.search ?? '').has('draft');
}

export const publishedModels = (location) =>
  allModels.filter((m) => !m.draft || showsDrafts(location));

/* What the interface builds itself from. */
export const models = publishedModels();

export const byId = (id) => models.find((m) => m.id === id) ?? models[0];
