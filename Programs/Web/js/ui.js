/*
 * CALM — interface construction.
 *
 * Nothing here knows what a model *is*. The selector, the illustration, the
 * description and the parameter sliders are all generated from the registry,
 * so a new model shows up in the interface complete, without a line changed in
 * this file.
 */

import { models, byId } from './models/index.js';
import { COMMON_PARAMS } from './common.js';
import { LANGUAGES, label, t, preferredLanguage } from './i18n.js';

export class UI {

  /* handlers: { onParam(key, value), onShuffle(), onModel(model), onDim(dim) } */
  constructor(handlers) {
    this.handlers = handlers;

    this.lang = preferredLanguage();
    this.dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    this.running = true;

    /* Two or three dimensions — one or the other, never both. The 2D view is
     * the default: it is the more legible of the two, and every model was
     * built and validated against it. */
    this.dim = 2;

    /* Current parameter values, common ones and the selected model's own,
     * flattened: this is what gets handed to model.step(). */
    this.values = {};

    /* Model parameters are remembered per model, so switching away and back
     * does not silently reset a slider the visitor had placed. */
    this.saved = new Map();

    this.el = {
      subtitle: document.getElementById('subtitle'),
      langs: document.getElementById('langs'),
      dims: document.getElementById('dims'),
      theme: document.getElementById('theme'),
      shuffle: document.getElementById('shuffle'),
      play: document.getElementById('play'),
      reset: document.getElementById('reset'),
      generalTitle: document.getElementById('general-title'),
      general: document.getElementById('general-params'),
      modelLabel: document.getElementById('model-label'),
      select: document.getElementById('model-select'),
      illustration: document.getElementById('illustration'),
      description: document.getElementById('description'),
      paramsTitle: document.getElementById('params-title'),
      params: document.getElementById('model-params'),
    };

    this.model = byId(new URL(location).hash.slice(1));

    this._buildStatic();
    this._buildSelect();
    this._buildParams(COMMON_PARAMS, this.el.general);
    this._selectModel(this.model, { silent: true });
    this._applyTheme();
    this._applyDim();
    this._applyLanguage();
  }

  // ─── construction ──────────────────────────────────────────────────────

  _buildStatic() {
    this.el.shuffle.addEventListener('click', () => this.handlers.onShuffle());

    this.el.play.addEventListener('click', () => {
      this.running = !this.running;
      this._applyLanguage();
    });

    this.el.reset.addEventListener('click', () => this.reset());

    this.el.theme.addEventListener('click', () => {
      this.dark = !this.dark;
      this._applyTheme();
    });

    for (const code of LANGUAGES) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = code.toUpperCase();
      button.addEventListener('click', () => {
        this.lang = code;
        this._applyLanguage();
      });
      this.el.langs.append(button);
    }

    /* Two exclusive buttons rather than one toggle: a single button showing
     * "3D" is ambiguous about whether that is the current view or the one it
     * would switch to. These read the same way as the language pair. */
    for (const dim of [2, 3]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = `${dim}D`;
      button.dataset.dim = String(dim);
      button.addEventListener('click', () => this.setDim(dim));
      this.el.dims.append(button);
    }

  }



  /* Switch the view. Idempotent, so clicking the active button does nothing.
   *
   * The dimension is not a parameter of a model — every model runs in both —
   * so it does not live in `values` and does not belong to the registry. */
  setDim(dim) {
    if (dim === this.dim) return;

    this.dim = dim;
    this._applyDim();
    this.handlers.onDim(dim);
  }

  _applyDim() {
    for (const button of this.el.dims.children) {
      button.classList.toggle('active', button.dataset.dim === String(this.dim));
    }
    this.el.dims.title = t('dimensions', this.lang);
  }

  _buildSelect() {
    for (const model of models) {
      const option = document.createElement('option');
      option.value = model.id;
      option.textContent = label(model.name, this.lang);
      this.el.select.append(option);
    }

    this.el.select.value = this.model.id;
    this.el.select.addEventListener('change', () => {
      this._selectModel(byId(this.el.select.value));
    });
  }

  /* Switch model: remember the outgoing parameters, rebuild the panel from the
   * incoming descriptor, refresh the prose. The simulation is never restarted
   * — the agents keep their positions and simply start obeying new rules,
   * which is the whole point of being able to change model while it runs. */
  _selectModel(model, { silent = false } = {}) {
    if (this.model && this.model !== model) {
      const keep = {};
      for (const p of this.model.params) keep[p.key] = this.values[p.key];
      this.saved.set(this.model.id, keep);

      for (const p of this.model.params) delete this.values[p.key];
    }

    this.model = model;
    this.el.select.value = model.id;
    history.replaceState(null, '', `#${model.id}`);

    this._buildParams(model.params, this.el.params, this.saved.get(model.id));

    this.el.params.hidden = model.params.length === 0;
    this.el.paramsTitle.hidden = model.params.length === 0;

    this._applyModelText();
    this._applyTheme();

    if (!silent) this.handlers.onModel(model);
  }

  /* Render a list of parameter descriptors as labelled sliders.
   *
   * Called for the common parameters once, and for the model's own parameters
   * on every model change — hence the wholesale emptying of the container,
   * which is cheaper to reason about than diffing a handful of rows. */
  _buildParams(params, container, restore) {
    container.replaceChildren();

    for (const p of params) {
      this.values[p.key] = restore?.[p.key] ?? p.value;

      const row = document.createElement('div');
      row.className = 'param';

      const name = document.createElement('label');
      name.htmlFor = `param-${p.key}`;
      name.innerHTML = label(p.label, this.lang);
      name.dataset.paramLabel = p.key;

      const readout = document.createElement('output');
      readout.htmlFor = `param-${p.key}`;
      readout.textContent = this.values[p.key].toFixed(p.decimals);

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.id = `param-${p.key}`;
      slider.min = p.min;
      slider.max = p.max;
      slider.step = p.step;
      slider.value = this.values[p.key];

      /* 'input', not 'change': the simulation must follow the handle while it
       * is being dragged, not once it is released. This is the live behaviour
       * the desktop version had, and it is what makes the models legible —
       * you see the transition happen under your hand. */
      slider.addEventListener('input', () => {
        const value = Number(slider.value);
        this.values[p.key] = value;
        readout.textContent = value.toFixed(p.decimals);
        this.handlers.onParam(p.key, value);
        this._applyConstraints(p.key);
      });

      row.append(name, readout, slider);
      container.append(row);
    }
  }

  /* Put the parameters back to the defaults their descriptors declare — the
   * current model's own, and the values remembered for the models not
   * currently shown. A visitor who has lost track of what they changed gets a
   * clean slate.
   *
   * Two things are deliberately left alone. The simulation itself: positions,
   * orientations and colours are not parameters, and 'Répartir aléatoirement'
   * is the button for that. And the agent count: it is a property of the
   * scene being watched rather than a setting of the model, so resetting the
   * model's parameters should not empty out a crowd the visitor chose to
   * assemble.
   */
  reset() {
    this.saved.clear();

    this._buildParams(COMMON_PARAMS, this.el.general, { count: this.values.count });
    this._buildParams(this.model.params, this.el.params);

    /* Announce every value rather than just the ones that look interesting:
     * ui.js does not know which parameters the caller needs to act on. Only
     * the agent count currently triggers anything, but that is main.js's
     * business, not this method's. */
    for (const [key, value] of Object.entries(this.values)) {
      this.handlers.onParam(key, value);
    }
  }

  /* Let the model correct the other parameters after a slider moves.
   *
   * A model with related parameters — nested radii, say — declares a
   * constrain() function; this applies whatever it returns to the matching
   * sliders and readouts. Models with independent parameters declare nothing
   * and this does nothing.
   */
  _applyConstraints(changed) {
    if (typeof this.model.constrain !== 'function') return;

    const fixes = this.model.constrain(this.values, changed) ?? {};
    const descriptors = [...COMMON_PARAMS, ...this.model.params];

    for (const [key, wanted] of Object.entries(fixes)) {
      const descriptor = descriptors.find((d) => d.key === key);
      const slider = document.getElementById(`param-${key}`);
      if (!descriptor || !slider) continue;

      /* Snap the correction onto the target slider's own step, rounding *away*
       * from the value being corrected.
       *
       * This is not a nicety. A range input silently rebases whatever it is
       * given onto its own step, and the sliders in a constrained group need
       * not share one: pushing Rrep to 0.037 asked Ral for 0.037, which a step
       * of 0.005 rebased to 0.035 — back under Rrep, the very thing the
       * constraint exists to prevent. Rounding up when raising and down when
       * lowering keeps the relation true whatever the steps are. */
      const raising = wanted > this.values[key];
      const steps = (wanted - descriptor.min) / descriptor.step;
      const snapped = raising ? Math.ceil(steps - 1e-9) : Math.floor(steps + 1e-9);

      const value = Math.max(descriptor.min,
                             Math.min(descriptor.max,
                                      descriptor.min + snapped * descriptor.step));

      if (value === this.values[key]) continue;

      this.values[key] = value;
      slider.value = value;

      const readout = document.querySelector(`output[for="param-${key}"]`);
      if (readout) readout.textContent = value.toFixed(descriptor.decimals);

      this.handlers.onParam(key, value);
    }
  }

  // ─── presentation ──────────────────────────────────────────────────────

  _applyTheme() {
    document.documentElement.dataset.theme = this.dark ? 'dark' : 'light';

    const suffix = this.dark ? '_dark' : '';
    this.el.illustration.src = `img/${this.model.illustration}${suffix}.svg`;
    this.el.illustration.alt = label(this.model.name, this.lang);
  }

  _applyModelText() {
    this.el.description.innerHTML = label(this.model.description, this.lang);
  }

  _applyLanguage() {
    document.documentElement.lang = this.lang;

    this.el.subtitle.textContent = t('subtitle', this.lang);
    this.el.shuffle.textContent = t('shuffle', this.lang);
    this.el.play.textContent = t(this.running ? 'pause' : 'play', this.lang);
    this.el.reset.textContent = t('reset', this.lang);
    this.el.generalTitle.textContent = t('general', this.lang);
    this.el.modelLabel.textContent = t('model', this.lang);
    this.el.paramsTitle.textContent = t('parameters', this.lang);
    this.el.theme.title = t('theme', this.lang);
    this.el.dims.title = t('dimensions', this.lang);

    for (const [index, model] of models.entries()) {
      this.el.select.options[index].textContent = label(model.name, this.lang);
    }

    /* Only worded labels change with the language; the mathematical ones are
     * the same in both, and are left alone. */
    for (const p of [...COMMON_PARAMS, ...this.model.params]) {
      const node = document.querySelector(`[data-param-label="${p.key}"]`);
      if (node) node.innerHTML = label(p.label, this.lang);
    }

    for (const button of this.el.langs.children) {
      button.classList.toggle('active', button.textContent.toLowerCase() === this.lang);
    }

    this.el.play.classList.toggle('paused', !this.running);
    this._applyModelText();
    this.el.illustration.alt = label(this.model.name, this.lang);
  }
}
