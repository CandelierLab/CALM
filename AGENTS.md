# CALM — verified architecture

This file describes what **is**, checked on the machine. The intentions are in
the README; the decisions taken are recalled at the end of the document.

## The name

CALM, for *Collective Animal Locomotion Models*. The software used to be called
COCOA (*COmportement COllectif Artificiel*).

The rename is done: GitHub repository `CandelierLab/CALM`, local directory
`Vulgarisation/CALM`, and `origin` repointed at the new URL.

## Where things are

`Programs/Web/` is the software. The PyQt5 desktop version it was ported from —
`Programs/Python/`: `main.py`, `Window.py`, `Animation.py`, `Engine.py` — is
archived on the **`desktop-pyqt5`** branch and is no longer in the `master`
tree.

It remains the reference for the models, and it is where the perceptrons have
to be fetched from:

```bash
git show desktop-pyqt5:Programs/Python/Engine.py
```

That version did **not** use lib-anim: `Animation.py` carries its own Qt layer
(`item`, `polygon`, `Animation2d`), an ancestor of lib-anim frozen on PyQt5,
whose items inherit directly from `QGraphicsPolygonItem`. That is why the web
port started from scratch rather than from a lib-anim backend.

## Programs/Web

No dependency, no build step, no `node_modules`: ES modules loaded as they are
by the browser. What is tested locally is literally what will be deployed.

```
index.html            the DOM skeleton; the content is generated
serve.py              development server, without caching
css/calm.css          light and dark themes as CSS variables
js/main.js            entry point and animation loop
js/engine.js          the state of the agents and motion on the torus
js/renderer2d.js      Canvas 2D rendering
js/renderer3d.js      WebGL rendering (three.js)
js/colormap.js        the colour of an orientation, in 2D and in 3D
js/ui.js              interface construction from the registry
js/common.js          parameters common to every model
js/i18n.js            bilingual interface strings
js/models/index.js    the registry
js/models/blind.js    the blind agents
js/models/vicsek.js   the Vicsek agents
js/models/mips.js     steric repulsion, sub-steps
js/models/topological.js   alignment on the k nearest
js/models/nematic.js  alignment on an axis
js/models/aoki-reynolds-couzin.js   the three concentric zones
js/models/peruani.js  attraction inside a vision cone
img/                  illustrations, one light/dark pair per model
vendor/three.min.js   three.js r160, UMD build
tests/                the test suites
```

### The model registry

This is the central architectural point. A model is an object that describes
itself: bilingual name, bilingual description, illustration, list of parameter
descriptors, and a `step` function. The `<select>`, the illustration, the text
and the sliders are all **generated** from that list; `ui.js` names no model.

Adding a model = one file in `js/models/` and one line in
`js/models/index.js`. No change to the interface, the loop or the rendering.
Verified in practice: adding Vicsek touched neither `ui.js`, nor `main.js`, nor
`renderer.js`.

The exact contract is documented at the top of `js/models/index.js`, and
checked for every model of the registry by the unit tests: an incomplete
descriptor fails a test instead of producing an empty panel. The interface
suite reads the registry too and checks that the `<select>` is exactly its
reflection, rather than comparing against a hard-coded list that would age
badly.

A model may also declare `constrain(p, key)`, called after every slider move,
which returns the corrections to apply to the other parameters. That is how
Aoki-Reynolds-Couzin enforces its nested radii without `ui.js` knowing what a
radius is. The slider under the hand always wins and the others give way — more
predictable than a slider that jams under the finger. The Qt version did a
mixture of the two (it blocked Rrep against Ral but pushed Ral against Rrep);
that is now harmonised.

A descriptor may also declare `dim3`, whose fields override its own when the 3D
view is on. MIPS is the case that forced it: σ is the diameter of a body, so
the same number is an *area* fraction in 2D and a *volume* fraction in 3D, and
one range cannot serve both. This is what makes the panel worth rebuilding on a
dimension switch, which it did not use to be — with the values in hand carried
over and clamped into whatever the new range allows.

And a model may declare `shape`, naming the parameter that gives the diameter
at which its agents should be drawn as bodies — discs in 2D, spheres in 3D —
rather than as arrows. The renderers stay ignorant of models: they are handed a
length, exactly the way they are handed a theme.

### Two dimensions, one engine

The state is **dimension-generic**, and that is what shaped the rest. An
orientation is a **unit vector**, not an angle: the only representation that
works in both dimensions — and the one the models were already using without
saying so, since they accumulated cosines and sines before calling `atan2`.
Summing unit vectors then normalising is the same operation without the detour,
and it costs less (`atan2` is not free).

Positions and directions are stored interleaved — x,y[,z] per agent — which
keeps an agent's coordinates on the same cache line and hands three.js a buffer
it can read directly.

What going vectorial demanded, model by model: nothing at all for the blind
agents, a mechanical transposition for five others, and a genuine change of
method for exactly one. **Nematic** alignment rested on angle doubling, which
only exists in 2D; in any dimension the director is the principal eigenvector
of the order tensor Σ u⊗u, obtained by power iteration. The tensor is blind to
the head/tail distinction because u and −u give the same outer product —
"modulo π" is no longer an operation on a number but a property of a tensor.

Two points of method that are paid for on the spot if forgotten:

- **The angular noise has to be isotropic.** A rotation by a Gaussian angle in
  a randomly drawn plane containing the heading: in 2D there is only one such
  plane and this gives back the reference's `a += σ·N(0,1)`, in 3D it explores
  the sphere uniformly. Perturbing spherical angles would crowd the poles, and
  a flock of blind agents would drift towards the z axis. A test measures it.
- **Renormalisation is needed.** The rotation is exact on paper, but these are
  32-bit floats and the error accumulates: over a few thousand steps the norm
  drifts far enough for the speed to change slowly. `move()` and
  `turnTowards()` both renormalise.

### The time step

The simulation advances at 25 Hz — one step every 40 ms — through an
accumulator in `main.js`, while the drawing follows `requestAnimationFrame`.

The two are deliberately decoupled: `requestAnimationFrame` fires at 60 Hz, or
120 Hz on some screens, and one step per frame would make the agents advance
half again as fast on a good monitor. The time credited to a frame is capped at
200 ms, or coming back to a backgrounded tab would replay every missed step at
once.

### The two views

The `2D`/`3D` selector switches **the view and the simulation together**: the
models run in whatever dimension the state carries, so it is a single change.
The agents are redistributed in the process — a 2D configuration lifted into 3D
would sit in a single plane, which reads as a bug and takes a long time to
undo.

There are **two `<canvas>` elements**, only one shown at a time: a canvas holds
either a 2D context or a WebGL one, never both. So this is not a mode on a
single element.

`vendor/three.min.js` is **vendored, not loaded from a CDN**: the tests run
offline and the deployed subdomain has no third-party dependency at runtime. It
is the UMD build of r160, the last one cdnjs offers in that form; it prints a
deprecation warning and works. The camera control (drag to turn, wheel to zoom)
is written by hand rather than vendoring `OrbitControls`, which ships
separately: some twenty lines against a second file.

The 3D view turns slowly on its own until the first drag. A still projection is
very hard to read; the motion supplies the parallax that makes depth legible.

### Colour

Both views encode **the same thing, the orientation**, on the same HSV basis. A
polarised flock turns a single colour, a disordered one stays confetti, and the
nematic phase shows two opposite hues on the wheel — which is precisely the
reading that makes it recognisable.

In 2D an orientation is an angle and the wheel is enough. In 3D it has two
degrees of freedom against one for the wheel, so the elevation goes onto the
other two axes of HSV, which is itself a cone: horizontal heading → pure hue,
upwards → the saturation falls towards white, downwards → the value falls
towards black. The blend stops short of pure white and pure black so that some
hue always remains and a vertical agent does not vanish into the background of
its own theme.

What is accepted: the elevation is not perceptually uniform against the
azimuth, and the poles crush the hue — an agent going straight up is nearly
white whatever its azimuth. That is correct (the azimuth is undefined there)
but the hue no longer informs.

> An earlier version coloured the 3D view by the z coordinate with colorcet's
> cyclic `colorwheel` colormap, chosen because z lives on a torus. It was
> dropped when the two views were unified on orientation; the table of 256
> colours is recoverable from the git history should depth become useful again.

### Neighbourhood

`Engine.py` finds neighbours by testing every pair, which is O(N²):
acceptable at the hundred agents of the desktop version, not at the thousand
the slider allows.

`NeighbourGrid` in `engine.js` cuts the box into cells never smaller than the
interaction radius; an agent's neighbours are then in the 3^d cells around it —
nine in 2D, twenty-seven in 3D. Occupancy is stored as linked lists over two
integer arrays, so a step allocates nothing.

Two guards in the code: the number of cells per side is capped — 64 in 2D, 16
in 3D, about four thousand cells in both cases (a tiny radius would otherwise
ask for a huge grid to clear on every step, and all correctness requires is
that the cells be at least as wide as the radius) — and below three cells per
side the neighbourhood would fold onto itself: the grid then falls back to
brute force.

The tests compare the grid against brute force over nine radii covering both
regimes: **0 disagreements over 180,944 neighbour relations**. That is the only
question that matters for an optimisation.

### Synchronous update

`State.freezeHeadings()` returns a copy of the orientations as they were at the
start of the step, reused from one step to the next so as to allocate nothing.

Every interacting model must read it, or an agent would align on neighbours
already updated within the same step — a sequential update, which is a
*different* model from the reference's. The Python version gets the same result
by compiling a field once per step (`agents.compile()`).

### Geometry

The domain is the unit torus [0,1[², as in `Engine.py`: positions wrap at both
edges, there is no wall and no boundary effect.

Two traps checked by the tests:

- **the JavaScript remainder keeps the sign of the dividend**, so `v % 1` on a
  negative position stays negative. `engine.js` uses `((v % 1) + 1) % 1`.
- **an agent near an edge is also near the opposite one** and has to be drawn
  there: without that the triangles are sliced clean at the border, which reads
  as a wall that does not exist. `renderer.js` paints up to four copies of a
  corner agent. This is the one accepted departure from the Qt reference, which
  let the agents be cut.

### Graphical representation

One oriented triangle per agent, in the proportions of the Qt reference: tip at
`+s` along the heading, base of half-width `s/2` at `-s/2`, with `s = 0.011` in
box units. The hue comes from the `x` position at the time of the shuffle
(HSV(x, 1, 1), that is HSL(x·360°, 100%, 50%)), which starts the group as a
rainbow and gives the eye a way to follow the mixing.

Fill and stroke are the agent's own colour, **in both themes**: the stroke is
there to round the outline and thicken it a little, not to ring it in a
contrasting ink. The Qt reference outlined in black on the light theme, which
made the agents read as heavy and drew the eye to the outlines rather than to
the group. Only the background and the frame depend on the theme.

At a hundred agents that is a few hundred drawing operations per frame: Canvas
2D is very far from saturating and WebGL would bring nothing but a dependency.

### Cost of a step, measured

Firefox on the development machine, averaged over 100 steps, rendering
excluded. The budget is 40 ms, the period of the simulation.

| Model | Agents | Radius | Step | Budget |
| --- | --- | --- | --- | --- |
| blind | 1000 | — | 0.10 ms | 0 % |
| Vicsek | 600 | 0.2 (max) | 3.8 ms | 10 % |
| Vicsek | 1000 | 0.2 (max) | 10.6 ms | 27 % |
| Vicsek | 1500 | 0.2 (max) | 22.1 ms | 55 % |
| Vicsek | 2000 | 0.2 (max) | 41.8 ms | **105 %** |
| Vicsek | 2000 | 0.02 | 3.9 ms | 10 % |

This is what sets the slider maximum at **1000 agents** (and not 2000, its
first value): beyond that, the most expensive combination reachable from the
interface exceeds the budget and the animation stalls. The last two rows also
show that the limiting factor at a wide radius is the number of actual
neighbours, not the algorithm — the grid, for its part, brings a factor of ten.

## Tests

`Programs/Web/tests/run.py` drives Firefox through selenium. **426 assertions**
at the last run. The full suite now takes more than two minutes, most of it the
physics tests which put thousands of steps through; `--only unit` is the slow
part of it.

| Suite | `--only` | What it covers |
| --- | --- | --- |
| `tests/unit.html` | `unit` | **in 2D and in 3D**: torus wrapping, resizing, dimension switching, `setDirection`/`turnTowards`, noise isotropy, grid / brute-force equivalence, k-nearest search against exhaustive scan, the physics of the seven models, both colour bases, registry contract |
| `registry_suite` | `registry` | the **generated** `<select>` and panel: the selector read from the registry, switching between models, slider regeneration, ARC's nested radii, dimension-dependent ranges, value memory, translation, and the fact that the `step` being run is the selected model's |
| `ui_suite` | `ui` | live parameters, pause, shuffle, reset, theme, language, canvas geometry at three window shapes |
| `view_suite` | `view` | the two views: exclusivity of the two canvases, three.js loading, liveness of the 3D rendering, every model in 3D, 3D canvas geometry, back to 2D |

A few tests are worth pointing out because they bear on the physics rather than
on the code:

- **Vicsek orders itself** — wide radius, low noise: the polarisation
  \|⟨e^{iθ}⟩\| rises to 1.00. Heavy noise: it falls back to 0.23. The
  transition is the model's reason for existing; if it disappears, the model is
  broken.
- **Blind agents do not order themselves** — polarisation 0.02, the value of
  chance at 400 agents. That is what makes them a null model.
- **Vicsek at zero radius becomes blind again** — an agent then has only itself
  for a neighbour. The limit has to be correct, not guarded by a special case.
- **The topological neighbourhood survives dilution** where the metric one
  gives way — 0.90 against 0.10 on the same thinned flock. If that test stops
  separating the two models, the topological rule has gone metric again.
- **The nematic phase is ordered without being polarised** — 0.99 against 0.18.
- **Aoki-Reynolds-Couzin does all three things** — alignment zone dominant:
  polarisation > 0.5. Attraction zone dominant: the mean distance to the
  nearest neighbour drops from 0.030 to 0.007. Repulsion alone: close pairs
  become five times rarer than in a blind walk.
- **Peruani aggregates without aligning** — the vision cone tightens the group
  (0.030 → 0.002), and two deterministic tests pin the non-reciprocity: the one
  that follows turns, the one that leads does not.
- **MIPS separates, and only when it is motile** — read against the same bodies
  at the same density with the propulsion switched off, not against the blind
  model: blind agents are an ideal gas, so any excess over them could be read
  as plain excluded volume.

Some of these tests first failed on a **false expectation of mine**, not on a
defect in the code, and are worth recording because the trap will be set again:

- "repulsion pushes the agents apart" is **false on a torus**: the area is
  fixed, so the mean density is imposed and nothing can spread it out. What
  repulsion does is dig a hole in the pair correlation *at the scale of its own
  zone* — so the probe distance has to be measured in units of `Rrep`, not
  fixed in advance.
- "fleeing a neighbour straight ahead must give +π/6" is **undetermined**: it
  is a bifurcation, left and right are equally good. Only the magnitude is
  assertable there; the sign is tested on a lateral neighbour.
- "a thinned flock loses its order with a metric radius" is **false at low
  noise**: over a long run, each agent crosses the torus dozens of times and
  the rare encounters are enough (Vicsek at 0.996). The comparison only lives
  where the noise is strong enough that order requires alignment at *every*
  step.
- "the fraction of agents in the largest cluster measures aggregation" is
  **unusable here**: at this density connectivity sits at the percolation
  threshold, and two draws of the *same* blind model gave 36 % and 69 %. That
  measure first made a MIPS aggregation look real when it did not yet exist,
  and would have been just as able to miss it once it did. What is read now is
  the mean number of neighbours within 2σ.

One consequence of all this: the registry contract now checks that every
default **lands on a step of its slider**. Otherwise the browser rounds it and
the model runs with a value its own descriptor never declared. The test found
two cases as soon as it was written (`Rrep` at 0.025 on a step of 0.002, `α` at
0.393 on a step of 0.01).

The same trap bit a second time, elsewhere, and is worth remembering: **an
`<input type="range">` silently rebases any value given to it onto its own
step**. ARC's radii did not share a step (0.001 for `Rrep`, 0.005 for the other
two), so pushing `Rrep` to 0.037 asked 0.037 of `Ral`, which its step pulled
back to 0.035 — below `Rrep`, which is exactly what the constraint exists to
prevent. Two fixes: `_applyConstraints` now rounds **in the direction of the
push** (up when it rises, down when it falls), which makes the mechanism
correct whatever the steps are, and the three radii now share the same step.

That bug slipped past the tests because they all used values landing on every
slider's steps. The test that catches it walks each slider through
deliberately awkward values and checks the invariant after every move — and it
was validated by mutation: restoring round-to-nearest makes it fail on
`rrep=0.037 -> [0.037, 0.035, 0.45]`, the observed case.

An implementation detail: the tests cannot capture a module error after the
fact. `run.py` therefore writes a throwaway copy of `index.html` carrying an
error hook (`index_test.html`), deleted at the end of the run: the shipped page
stays clean.

Another one, learned the hard way: **selenium's own HTTP client gives up on a
command after two minutes by default**, and `run.py` raises it. `unit.html`
runs every test synchronously while the page loads, so `driver.get()` does not
return until the physics is finished — a page load whose length is the length
of the suite. The MIPS separation test pushed it past the limit, and the suite
then failed with a read timeout that looked nothing like a slow test.

**The development server `serve.py` sends no cache header**, and that is not
cosmetic: the application is made of ES modules, which browsers cache hard, and
`python3 -m http.server` answers 304 on a timestamp. After editing three
modules you can find yourself running a mixture of old and new — an interface
whose behaviour matches no version of the code on disk. It looks exactly like a
bug.

Running the suite needs selenium and geckodriver. On this machine, selenium is
in the LJP site's environment and geckodriver in `/snap/bin`:

```bash
/var/www/LJP/.venv/bin/python Programs/Web/tests/run.py
```

The sandbox prevents selenium from killing geckodriver at the end of a run: a
`PermissionError` shows up **after** the test count. It has no effect on the
results.

## Deployment

**Online: <https://calm.labojeanperrin.fr/>**, served from `~/softwares/calm`
on the IONOS account, reached through the SSH alias `ljp-prod`.
`Programs/Web/deploy.sh` does everything: test suite, `rsync`, then a check
that the page answers, that every module it imports answers too, and that the
`.js` files come out with a JavaScript MIME type — a single 404 among the
modules leaves a blank screen without the slightest clue.

The domain is **`labojeanperrin.fr`**, not `laboratoirejeanperrin.fr`: the
latter does not resolve at all. The `*.labojeanperrin.fr` certificate covers one
label and runs until 20 January 2027, so the subdomain is protected with no
further step.

A purely static subdomain, with no visual consistency with the LJP site: the
software is independent.

### Drafts

A model may carry `draft: true`. It stays in the tree and in the tests, but
disappears from the selector on the public site — offering visitors a model
that does not do what it announces would be showing them a phenomenon that is
not there.

The rule is evaluated **at runtime**, against the page's own host, and not by a
build step: there is none, what runs in development is byte for byte what gets
deployed, so the distinction is made at runtime or not at all. Drafts appear on
a local host (`localhost`, `127.0.0.1`, `*.local`, a `file://` page) and,
anywhere, on explicit request with `?draft` — which is what makes it possible
to check a fix directly online.

No model is a draft today: `mips` was the last one, and it has been published
since it started producing the separation it is named after. The mechanism is
still tested — the suite marks a model as a draft for the length of the test
rather than depending on whichever one is in trouble. A draft, when there is
one, still goes to the server with its illustrations, which is deliberate: that
is what makes `?draft` usable.

`showsDrafts()` takes a `location` object as an argument, so the filtering is
tested on fictitious hosts without deploying anything.

What was checked on the hosting side, and what determined the whole
architecture:

- the LJP site's production is a **shared IONOS host served over CGI**, Python
  3.9, **768 MB of address space per process**, one process per request. No
  simulation can therefore run server-side: no persistent process, no
  WebSocket, no 25 Hz loop held between two requests. **This is the constraint
  that puts the computation in the browser**, and it comes from the host, not
  from a matter of style.
- the TLS certificate is `*.labojeanperrin.fr` and covers one label, so
  `calm.labojeanperrin.fr` works **without a new certificate**.
- a fully client-side piece of software deploys as static files: an `rsync`,
  and the CGI contract never comes into play.

The site itself (Flask, MySQL, blueprints, Flask-Babel i18n,
`deployment/deploy.sh`) has **not** been modified, as instructed.

## Decisions taken

1. **CALM** as the name. Ruled out for collision: SHOAL (`cazala/shoal`, a
   flocking library in JS — a head-on thematic collision), SWIRL and FLOCK
   (saturated), BOIDS (belongs to the literature, Reynolds 1986).
2. **Porting the engine to JavaScript**, not Pyodide: the fastest for the
   visitor, against 7 to 12 MB of download and 2 to 5 s of startup.
3. **A purely static subdomain**, visually independent of the site.
4. **lib-anim ruled out.** Extending the library to the web is feasible — its
   items *hold* a `qitem` instead of inheriting from one, which is the right
   separation — but the work (a backend layer to interpose in the twelve files
   of `anim/plane`, bounding boxes to extract from Qt, Qt3D and matplotlib not
   portable) costs several weeks against a few days for the software itself. To
   be reconsidered if the goal becomes publishing all of the laboratory's
   scientific animations from a single Python source.
5. **The Qt version is archived** on the `desktop-pyqt5` branch and removed
   from `master`. It remains the reference for checking the models.

## Ported models

| Displayed name | `id` | Own parameters | Origin |
| --- | --- | --- | --- |
| Blind agents | `blind` | none | null model |
| Metric alignment (Vicsek) | `vicsek` | `r` | Qt version |
| Steric repulsion (MIPS) | `mips` | `σ` | ARCMP **6**, 219 (2015) |
| Topological alignment (Ballerini) | `topological` | `k` | PNAS **105**, 1232 (2008) |
| Nematic alignment | `nematic` | `r` | PRL **104**, 184502 (2010) |
| Boids (Aoki - Reynolds - Couzin) | `aoki-reynolds-couzin` | `Rrep`, `Ral`, `Ratt`, `α` | Qt version |
| Vision cone (Peruani) | `peruani` | `R`, `β`, `γ` | PRL **117**, 248001 (2016) |
| Perceptrons | — | `w1`…`w4`, `δ` | **to be ported** |

The displayed names denote the **mechanism** rather than the authors, with the
reference in parentheses: that is what a visitor needs to know in order to
choose, and it makes the order of the selector legible at a glance.

That order puts **MIPS right after Vicsek**, and not at the end of the list:
Vicsek says a group orders itself because its members copy each other, MIPS
says a group can structure itself without copying anything at all. That is the
more surprising half, and it lands best while Vicsek is still in the eye. The
two other forms of alignment — by count, on an axis — come afterwards, as
variations on the first.

The `id`s do **not** follow the displayed names, and must not: they appear in
the URL fragment, so renaming a model in the interface must not break a link
somebody saved. `aoki-reynolds-couzin` remains the id of the model displayed as
"Boids".

**Boids** carries the full name of the three contributions: Aoki (1982) for the
concentric zones, Reynolds (1987) for the three rules of the *boids* — hence
the displayed name — and Couzin *et al.* (2002) for the phase diagram. The Qt
version called it "Aoki-Couzin".

One flagged departure from the Python reference: the "alignment **and**
attraction" branch is written there as `if Nal & Natt`, a bitwise *and* on two
counts, which is false for one alignment neighbour and two attraction ones
(`1 & 2 == 0`) and then drops the attraction. Read as the logical *and*
obviously intended.

**Peruani** is the only model in the list **with no velocity alignment at
all**: an agent is attracted by the position of the neighbours it sees, never
by their orientation. And since the vision cone is not reciprocal — *i* can see
*j* without being seen by it — Newton's third law is violated, which produces
patterns unreachable by an alignment model. That is what justifies its place
next to the other three.

The model's noise, `√(2Dθ)`, is the general reorientation noise slider, and the
step is one time unit, so `γ` reads as `γ·dt`.

**Topological agents** count their neighbourhood instead of measuring it: the
`k` nearest, whatever the distance. This is what is observed in starlings
(Ballerini *et al.*, 2008), and the consequence is tested directly — a thinned
flock stays ordered with a topological neighbourhood (polarisation 0.90) and
goes disordered with a metric radius (0.10).

The implementation is in two stages, in `KNearest`: the grid searches within a
radius computed to hold `k` neighbours at the mean density, and the agents that
find fewer — those in the sparse patches, precisely the ones the model is about
— trigger a full sweep. Truncating would have silently made the model metric,
which is the one thing it must not be.

**Nematic agents** align modulo π: doubling the angles makes the mean blind to
the head/tail distinction. The director names only an axis, hence two opposite
headings; the agent keeps the one it was already going towards. The test
measures both order parameters at once — nematic 0.99, polarisation 0.18 —
which is the signature of the phase and what distinguishes it from Vicsek.

**Steric repulsion** has no interaction of orientation: only a short-range,
reciprocal repulsion, and it is the first model that needs `State.displace()`
rather than `state.move()` alone. It is also the only one that subdivides its
time step.

> **This model was a draft for a long time, because it did not produce the
> separation it is named after.** The diagnosis of the day — "the box is some
> thirty diameters across where the literature uses hundreds" — was wrong. The
> cause was the integration, and it reads in two lines.
>
> For a pair at overlap `u = σ − r`, a harmonic repulsion applied as a
> displacement of `(A/σ)·u` per agent gives the recurrence `u ← u(1 − 2A/σ)`.
> The default of the day, `A = 0.02` with `σ = 0.03`, put `2A/σ` at 1.33:
> factor **−0.33**, so every contact overshot into a gap and came back. That
> was the "unnatural" motion one could see. The slider went up to `A = 0.05`,
> where the factor is −19 and only the per-agent cap kept the simulation on
> screen.
>
> And the stable settings were far too soft to block anything: the balance
> `A(1 − r/σ) = v₀` fell at `r = 0.7σ`, a third of interpenetration, an
> effective diameter of 0.7σ and an effective packing fraction cut in half.
> Measured on that version: `v/v₀ = 0.52` in the densest neighbourhoods, and a
> current `φ·v(φ)` **increasing everywhere**, so the instability criterion
> `v + ρv′ < 0` (Cates & Tailleur, ARCMP **6**, 219, 2015) was met nowhere on
> the sliders.
>
> Hardening the contact needs `A ≈ 4σ`, which the explicit step cannot carry.
> The two demands are only compatible at a smaller step, hence the
> **sub-step**: the frame stays one time unit, the physics runs in `h = 1/k`
> inside it. Advection scales as `h` and the angular noise as `√h`, so the
> visible speed and the rotational diffusion are unchanged — this is tested —
> and only the contacts change.
>
> The two constants of the file (`CONTRACTION = 0.4`, the fraction of an
> overlap removed per sub-step, under 1/2 hence never any ringing;
> `OVERLAP = 0.05`, the equilibrium depth in units of σ) fix `k` and leave only
> **σ** on the panel. `A` is gone: it was a slider whose upper half was
> numerically unstable.
>
> After the fix, at n = 900, σ = 0.03, noise = 0.03: `v/v₀ = 0.19–0.24` in the
> dense neighbourhoods, `φ·v` non-monotonic (a maximum around φ_loc ≈ 0.55 then
> decreasing), and the mean number of neighbours within 2σ rises above the same
> system **without motility**. The separation is visible to the eye within a
> minute.
>
> **Known limitation, in 3D: no separation, and it is not the ceiling on σ that
> prevents it.** Measured at a thousand agents, with σ pushed past the slider:
> the repulsion works — the mean nearest neighbour falls to 0.99 σ at σ = 0.08
> and 0.95 σ at σ = 0.10, against 0.70 σ and 0.57 σ for blind walks — but the
> flock stays homogeneous at every σ, including σ = 0.10 where the volume
> fraction is 0.52, a perfectly ordinary MIPS density. The ratio of the number
> of neighbours within 2σ to the blind model's stays between 0.97 and 1.02.
>
> What is missing is room. At a fixed density the box measures √n diameters in
> 2D but **n^⅓** in 3D: five hundred agents give 33 σ in 2D, where two phases
> fit, while a thousand give only 12 in 3D, where they do not. Matching the 2D
> case would take some twenty thousand agents, against a cap of one thousand
> set by the frame budget. Since the cost of MIPS is linear in n, fifteen
> thousand agents at four sub-steps come to ~46 ms per frame: that is playable,
> but it touches the cap common to every model and the three.js rendering, not
> this file.

## Still to port

The perceptrons, in `agent.update` of the archived version
(`git show desktop-pyqt5:Programs/Python/Engine.py`, `Perceptron` branch), need
the perception field in angular slices (`agent.perceive`) — the grid already
returns the toroidal offsets to each neighbour, which is half of it.

## Still to do

- Port the perceptrons, the last model of the Qt version.
