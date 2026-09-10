# CALM — Collective Animal Locomotion Models

An interactive simulator of collective motion models, meant for outreach: pick
a model, move the sliders, and the simulation rearranges itself under your
hand.

The software runs in the browser, with no dependency and no build step:
[`Programs/Web`](Programs/Web). It is online at
**<https://calm.labojeanperrin.fr/>**.

The PyQt5 desktop version this one was ported from is archived on the
**`desktop-pyqt5`** branch:

```bash
git switch desktop-pyqt5      # the Qt version, in Programs/Python
git switch master             # back to the web version
```

It remains the reference the models were checked against, but is no longer
maintained.

## Running it

No dependency, no build step: the ES modules are loaded as they are by the
browser. All it takes is an HTTP server, because ES modules will not load from
`file://`.

```bash
Programs/Web/serve.py
```

Then <http://127.0.0.1:8000/> (`serve.py 8080` for another port). Any change
shows up on a reload.

Do use this script rather than `python3 -m http.server`: it turns caching off.
Without that the browser holds on to the ES modules, and you can end up running
a mixture of old and new, which looks exactly like a bug.

## Tests

The suite runs in a real browser (Firefox, driven by selenium): that is where
the code runs, so that is where it is checked.

```bash
Programs/Web/tests/run.py                      # all four suites, headless
Programs/Web/tests/run.py --headed             # watching the browser
Programs/Web/tests/run.py --only unit          # a single suite
Programs/Web/tests/run.py --shots /tmp/calm    # with screenshots
```

The suites are `unit`, `ui`, `registry` and `view`. The full run takes a few
minutes: most of it is the physics, which puts thousands of steps through both
dimensions.

The unit tests also open by hand in a browser, at `tests/unit.html`, where they
report as text.

It needs `selenium` and `geckodriver`.

## Models

Seven models are available:

- **Blind agents** — they perceive nothing and follow independent random walks.
  This is the collection's null model, the one that calibrates the eye before
  any interaction comes into play.
- **Metric alignment (Vicsek)** — agents take the mean orientation of their
  neighbours within a radius *r*. Alignment is their only interaction, and it
  is enough to make aggregation emerge. Raise *r* and the group orders itself;
  raise the reorientation noise and the order comes undone.
- **Steric repulsion (MIPS)** — no interaction of orientation at all, only
  bodies of diameter *σ* that cannot pass through one another. And yet the
  group separates into dense clusters and empty space: it aggregates *because*
  it repels. An agent that runs into others keeps pushing, because its heading
  only turns by diffusion; it slows down where it is crowded, so it spends
  longer there. Raise *σ* and the agent count, lower the noise, and the
  separation sets in — in 2D. It does not appear in 3D, and not for want of
  density: a thousand agents give a box only twelve diameters across, where two
  phases have no room. See `AGENTS.md` for the measurements.
- **Topological alignment (Ballerini)** — agents align on their *k* nearest
  neighbours whatever the distance: the neighbourhood is counted, not measured.
  This is what starlings do (Ballerini *et al.*, *PNAS* **105**, 1232, 2008).
  Compare with Vicsek by lowering the agent count: a metric neighbourhood
  empties and the order collapses, a topological one never empties.
- **Nematic alignment** — rods with no head and no tail, aligned on an *axis*
  rather than a direction. The result is lanes travelled both ways: the group
  is ordered while its polarisation stays zero.
- **Boids (Aoki - Reynolds - Couzin)** — three concentric zones: repulsion,
  alignment, attraction, plus a blind sector behind. Since the turn is capped
  at every step, the group can start milling in a torus.
- **Vision cone (Peruani)** — agents are attracted to the *position* of the
  neighbours they see inside a vision cone, with no velocity alignment at all.
  The cone is not reciprocal, which gives clusters, mills and led trails.
  After Barberis & Peruani, *Phys. Rev. Lett.* **117**, 248001 (2016).

## Two views

The **2D / 3D** selector, at the top of the panel, switches the view *and* the
simulation: the models run in both dimensions. In 3D the view turns slowly on
its own until you grab it — drag to orient, wheel to zoom.

Agents are **coloured by their orientation**, live and in both views: a
polarised group turns a single colour, a nematic phase shows two opposite hues
in separate lanes, a disordered gas stays confetti. In 3D the hue gives the
azimuth, and the elevation lightens towards white or darkens towards black.

A model may ask to be drawn as **bodies rather than arrows**, at the diameter
one of its own parameters gives — discs in 2D, spheres in 3D. MIPS is the case:
its agents have no orientation interaction to show, and whether two of them
touch is the whole mechanism.

The 3D view builds on three.js, vendored in `Programs/Web/vendor/`: nothing is
loaded from a CDN, neither for the tests nor in production.

Each model is one file in
[`Programs/Web/js/models/`](Programs/Web/js/models) plus a line in the
registry; the interface follows from that.

## Licence

The repository is open. Crafted with ❤️ by Raphaël Candelier.
