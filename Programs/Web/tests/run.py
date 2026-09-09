#!/usr/bin/env python3
"""CALM — test runner.

Two suites, both in a real browser, because that is where the code runs:

  * tests/unit.html  — the modules: torus wrapping, resizing, noise, the blind
                       model's null behaviour, the renderer's edge duplication,
                       and the registry contract every future model must meet.
  * this file         — the interface: the selector and the panel generated
                       from the registry, live parameters, pause, shuffle,
                       theme, language, and the canvas geometry.

Usage:

    tests/run.py                 # both suites, headless
    tests/run.py --headed        # watch it happen
    tests/run.py --shots DIR     # also write screenshots there

Needs Firefox, geckodriver and selenium. On this machine selenium lives in the
LJP site's virtualenv, so:

    /var/www/LJP/.venv/bin/python Programs/Web/tests/run.py
"""

import argparse
import http.server
import shutil
import socket
import socketserver
import subprocess
import sys
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Installed before any module loads, so a syntax error or a failed import shows
# up as a test failure with its message rather than as a mysteriously blank
# page. Injected into a throwaway copy of index.html: the shipped page stays
# free of test scaffolding.
ERROR_HOOK = """<script>
window.__errors = [];
window.addEventListener('error', e => window.__errors.push(String(e.message || e.error)));
window.addEventListener('unhandledrejection', e => window.__errors.push('rejection: ' + String(e.reason)));
</script>
"""



class Results:
    def __init__(self):
        self.rows = []

    def check(self, label, passed, detail=""):
        self.rows.append((bool(passed), label, str(detail)))

    def report(self):
        for passed, label, detail in self.rows:
            print(f"{'PASS' if passed else 'FAIL'} {label}" + (f" — {detail}" if detail else ""))
        failed = [r for r in self.rows if not r[0]]
        print(f"\n{len(self.rows) - len(failed)} passed, {len(failed)} failed")
        return not failed


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def serve(directory, port):
    """Static server on a background thread, like the deployed subdomain."""

    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **kw):
            super().__init__(*a, directory=str(directory), **kw)

        def log_message(self, *a):
            pass

    httpd = socketserver.TCPServer(("127.0.0.1", port), Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def browser(headed):
    from selenium import webdriver
    from selenium.webdriver.firefox.options import Options
    from selenium.webdriver.firefox.service import Service

    options = Options()
    if not headed:
        options.add_argument("--headless")

    driver_path = shutil.which("geckodriver") or "/snap/bin/geckodriver"
    driver = webdriver.Firefox(options=options, service=Service(driver_path))
    driver.set_window_size(1400, 900)
    return driver


def unit_suite(driver, base, r):
    driver.get(f"{base}/tests/unit.html")

    deadline = time.time() + 30
    rows = None
    while time.time() < deadline:
        rows = driver.execute_script("return window.__results || null")
        if rows:
            break
        time.sleep(0.2)

    if not rows:
        r.check("unit suite ran", False, driver.execute_script(
            "return document.getElementById('report').textContent"))
        return

    for row in rows:
        r.check(f"[unit] {row['label']}", row["pass"], row["detail"])


def ui_suite(driver, base, r, shots=None):
    from selenium.webdriver.common.by import By

    driver.get(f"{base}/index_test.html")
    time.sleep(2.0)

    js = driver.execute_script
    errors = lambda: js("return window.__errors || []")
    snap = lambda: js("return document.getElementById('view').toDataURL()")
    click = lambda name: driver.find_element(By.ID, name).click()

    def slide(key, value):
        js(f"""
          const s = document.getElementById('param-{key}');
          s.value = {value};
          s.dispatchEvent(new Event('input', {{bubbles: true}}));
        """)

    r.check("no JS error on load", not errors(), "; ".join(errors()))

    # ─── interface generated from the registry
    options = js("return [...document.querySelectorAll('#model-select option')]"
                 ".map(o => [o.value, o.textContent])")
    r.check("selector is populated", len(options) >= 1, str(options))
    r.check("every option is labelled", all(value and text for value, text in options),
            str(options))
    r.check("selection matches the displayed model",
            js("return document.getElementById('model-select').value") == "blind",
            js("return document.getElementById('model-select').value"))

    keys = js("return [...document.querySelectorAll('#general-params input')].map(i => i.id)")
    r.check("general parameters rendered",
            keys == ["param-count", "param-speed", "param-noise"], str(keys))

    r.check("model panel hidden when the model has no parameter",
            js("return document.getElementById('model-params').hidden") is True)
    r.check("model panel title hidden too",
            js("return document.getElementById('params-title').hidden") is True)
    r.check("description filled",
            len(js("return document.getElementById('description').textContent").strip()) > 40)

    illustration = js("const i = document.getElementById('illustration');"
                      "return [i.src, i.naturalWidth, i.complete]")
    r.check("illustration decoded", illustration[1] > 0 and illustration[2],
            illustration[0].split("/")[-1])

    # ─── canvas geometry, at three window shapes
    for width, height in [(1400, 900), (1000, 1000), (700, 1200)]:
        driver.set_window_size(width, height)
        time.sleep(0.6)
        box = js("""
          const c = document.getElementById('view');
          const b = c.getBoundingClientRect();
          return [c.width, c.height, b.width, b.height, b.top, b.left,
                  innerWidth, innerHeight];
        """)
        buf_w, buf_h, css_w, css_h, top, left, vw, vh = box
        r.check(f"canvas square at {width}×{height}",
                buf_w == buf_h and abs(css_w - css_h) < 1.5, f"buffer {buf_w}×{buf_h}, css {css_w:.0f}×{css_h:.0f}")
        r.check(f"canvas fits the viewport at {width}×{height}",
                top >= -1 and left >= -1 and css_w <= vw + 1 and css_h <= vh + 1,
                f"top {top:.0f}, left {left:.0f}, {css_w:.0f}×{css_h:.0f} in {vw}×{vh}")
        r.check(f"canvas has a usable size at {width}×{height}", buf_w > 200, buf_w)

    driver.set_window_size(1400, 900)
    time.sleep(0.6)

    # ─── the loop runs, pauses and resumes
    a = snap(); time.sleep(0.7)
    r.check("the simulation advances", a != snap())

    click("play"); time.sleep(0.3)
    frozen = snap(); time.sleep(0.7)
    r.check("pause freezes the animation", frozen == snap())
    r.check("pause relabels the button",
            driver.find_element(By.ID, "play").text in ("Reprendre", "Resume"),
            driver.find_element(By.ID, "play").text)

    # ─── shuffle, while paused so only the redistribution shows
    before = snap()
    click("shuffle"); time.sleep(0.3)
    r.check("shuffle redistributes the agents", before != snap())

    click("play"); time.sleep(0.4)
    resumed = snap(); time.sleep(0.7)
    r.check("resume restarts the animation", resumed != snap())

    # ─── live parameters
    slide("count", 800); time.sleep(0.5)
    r.check("agent count readout follows the slider",
            js("return document.querySelector('#general-params output').textContent") == "800")
    r.check("no error after resizing to 800 agents", not errors(), "; ".join(errors()))

    slide("count", 3); time.sleep(0.4)
    r.check("no error after shrinking to 3 agents", not errors(), "; ".join(errors()))

    slide("count", 200)
    slide("speed", 0); slide("noise", 0); time.sleep(0.4)
    still = snap(); time.sleep(0.7)
    r.check("zero speed and zero noise hold the agents still", still == snap())

    slide("speed", 0.006); slide("noise", 0.1); time.sleep(0.4)
    moving = snap(); time.sleep(0.7)
    r.check("restoring speed restarts the motion", moving != snap())

    # ─── reset puts every parameter back to its declared default
    for key, value in [("count", 742), ("speed", 0.018), ("noise", 0.43)]:
        slide(key, value)
    time.sleep(0.4)
    r.check("parameters moved away from their defaults",
            js("return [...document.querySelectorAll('#general-params input')]"
               ".map(i => i.value)") == ["742", "0.018", "0.43"],
            str(js("return [...document.querySelectorAll('#general-params input')].map(i => i.value)")))

    click("reset")
    time.sleep(0.5)
    values = js("return [...document.querySelectorAll('#general-params input')].map(i => i.value)")
    r.check("reset restores the general defaults",
            values == ["742", "0.006", "0.1"], str(values))
    r.check("reset leaves the agent count alone", values[0] == "742", values[0])
    readouts = js("return [...document.querySelectorAll('#general-params output')].map(o => o.textContent)")
    r.check("reset updates the readouts too",
            readouts == ["742", "0.0060", "0.100"], str(readouts))
    r.check("reset raises no error", not errors(), "; ".join(errors()))

    time.sleep(0.4)
    after_reset = snap(); time.sleep(0.7)
    r.check("the simulation is still running after a reset", after_reset != snap())

    # ─── theme
    theme_before = js("return document.documentElement.dataset.theme")
    js("document.getElementById('theme').click()"); time.sleep(0.5)
    theme_after = js("return document.documentElement.dataset.theme")
    r.check("theme toggles", theme_before != theme_after, f"{theme_before} → {theme_after}")
    r.check("illustration follows the theme",
            ("_dark" in js("return document.getElementById('illustration').src"))
            == (theme_after == "dark"))

    # ─── language
    pick = lambda code: js(
        f"[...document.querySelectorAll('#langs button')]"
        f".find(b => b.textContent === '{code}').click()")

    pick("EN"); time.sleep(0.3)
    r.check("switching to English", js("return document.documentElement.lang") == "en")
    r.check("English button labels",
            driver.find_element(By.ID, "shuffle").text == "Shuffle agents",
            driver.find_element(By.ID, "shuffle").text)
    r.check("English description",
            "random walks" in js("return document.getElementById('description').textContent"))
    r.check("worded parameter label translated",
            js("return document.querySelector('[data-param-label=\"speed\"]').textContent") == "Speed")

    pick("FR"); time.sleep(0.3)
    r.check("switching back to French",
            js("return document.documentElement.lang") == "fr"
            and driver.find_element(By.ID, "shuffle").text == "Répartir aléatoirement")
    r.check("French description",
            "marches aléatoires" in js("return document.getElementById('description').textContent"))

    # ─── the model id is in the URL, so a configuration can be linked to
    r.check("model id kept in the fragment",
            js("return location.hash") == "#blind", js("return location.hash"))

    if shots:
        out = Path(shots)
        out.mkdir(parents=True, exist_ok=True)
        slide("count", 300); time.sleep(1.5)
        for theme in ("light", "dark"):
            current = js("return document.documentElement.dataset.theme")
            if current != theme:
                js("document.getElementById('theme').click()")
                time.sleep(0.6)
            driver.save_screenshot(str(out / f"calm-{theme}.png"))
        print(f"\nscreenshots written to {out}")

    r.check("no JS error over the whole session", not errors(), "; ".join(errors()))


def registry_suite(driver, base, r):
    """The selector and the panel are generated, not hand-written.

    Switching between the two shipped models exercises the whole chain: the
    option list, the illustration, the prose, and the sliders built from the
    descriptors — none of which is written out by hand anywhere.
    """
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import Select

    driver.get(f"{base}/index_test.html")
    time.sleep(1.5)

    js = driver.execute_script
    snap = lambda: js("return document.getElementById('view').toDataURL()")
    select = lambda: Select(driver.find_element(By.ID, "model-select"))

    def slide(key, value):
        js(f"""
          const s = document.getElementById('param-{key}');
          s.value = {value};
          s.dispatchEvent(new Event('input', {{bubbles: true}}));
        """)

    # Read the registry itself rather than hard-coding the models: the point of
    # the test is that the selector *is* the registry, and it must keep holding
    # as models are added.
    driver.set_script_timeout(30)
    registry = driver.execute_async_script("""
      const done = arguments[0];
      import('./js/models/index.js').then(m => done(
        m.models.map(x => ({id: x.id, name: x.name, params: x.params.map(p => p.key)}))));
    """)
    r.check("[registry] the registry was read", len(registry) >= 2, str(len(registry)))

    offered = [o.get_attribute("value") for o in select().options]
    r.check("[registry] selector lists exactly the registered models",
            offered == [m["id"] for m in registry], str(offered))

    # Every model must build its own panel correctly, not just the two the
    # rest of this suite exercises in detail.
    for model in registry:
        select().select_by_value(model["id"])
        time.sleep(0.45)
        built = js("return [...document.querySelectorAll('#model-params input')]"
                   ".map(i => i.id.replace('param-', ''))")
        r.check(f"[registry] {model['id']} builds its sliders",
                built == model["params"], f"{built} vs {model['params']}")
        r.check(f"[registry] {model['id']} panel visibility matches its parameters",
                js("return document.getElementById('model-params').hidden")
                == (len(model["params"]) == 0))
        r.check(f"[registry] {model['id']} shows an illustration",
                js("const i = document.getElementById('illustration');"
                   "return i.naturalWidth > 0 && i.complete"),
                js("return document.getElementById('illustration').src").split("/")[-1])
        r.check(f"[registry] {model['id']} shows a description",
                len(js("return document.getElementById('description').textContent").strip()) > 40)
        r.check(f"[registry] {model['id']} runs without error",
                not js("return window.__errors || []"),
                "; ".join(js("return window.__errors || []")))

    select().select_by_value("blind")
    time.sleep(0.4)

    # The rest of the suite works on blind and vicsek in detail: between them
    # they cover both shapes the panel has to render — no parameter, and some.
    r.check("[registry] parameterless model hides the panel",
            js("return document.getElementById('model-params').hidden") is True)

    driver.find_element(By.ID, "play").click()      # pause: judge the panel, not the motion
    time.sleep(0.3)
    before_switch = snap()

    select().select_by_value("vicsek")
    time.sleep(0.5)

    sliders = js("return [...document.querySelectorAll('#model-params input')].map(i => i.id)")
    r.check("[registry] switching builds the model's sliders",
            sliders == ["param-r"], str(sliders))
    r.check("[registry] parameter panel revealed",
            js("return document.getElementById('model-params').hidden") is False)
    r.check("[registry] panel title revealed",
            js("return document.getElementById('params-title').hidden") is False)
    r.check("[registry] readout shows the descriptor's default",
            js("return document.querySelector('#model-params output').textContent") == "0.050",
            js("return document.querySelector('#model-params output').textContent"))
    r.check("[registry] symbolic label rendered as markup",
            js("return document.querySelector('[data-param-label=\"r\"]').innerHTML") == "<i>r</i>",
            js("return document.querySelector('[data-param-label=\"r\"]').innerHTML"))
    r.check("[registry] illustration follows the model",
            "Vicsek" in js("return document.getElementById('illustration').src"),
            js("return document.getElementById('illustration').src").split("/")[-1])
    r.check("[registry] description follows the model",
            "rayon" in js("return document.getElementById('description').textContent")
            or "radius" in js("return document.getElementById('description').textContent"))
    r.check("[registry] fragment follows the model",
            js("return location.hash") == "#vicsek", js("return location.hash"))

    r.check("[registry] switching model does not restart the simulation",
            before_switch == snap())

    # A parameter placed by hand must survive a round trip through the other
    # model, or comparing two models costs the visitor their settings.
    slide("r", 0.15)
    time.sleep(0.3)
    select().select_by_value("blind")
    time.sleep(0.4)
    r.check("[registry] sliders removed when the model leaves",
            js("return document.querySelectorAll('#model-params input').length") == 0)
    r.check("[registry] panel hidden again",
            js("return document.getElementById('model-params').hidden") is True)

    select().select_by_value("vicsek")
    time.sleep(0.4)
    r.check("[registry] parameter remembered across a round trip",
            js("return document.getElementById('param-r').value") == "0.15",
            js("return document.getElementById('param-r').value"))

    # Reset must reach the model's own parameters, and clear what was
    # remembered for the models that are not on screen.
    slide("r", 0.19)
    time.sleep(0.3)
    select().select_by_value("blind")
    time.sleep(0.4)
    driver.find_element(By.ID, "reset").click()
    time.sleep(0.4)
    select().select_by_value("vicsek")
    time.sleep(0.4)
    r.check("[registry] reset clears the remembered model parameters",
            js("return document.getElementById('param-r').value") == "0.05",
            js("return document.getElementById('param-r').value"))

    slide("r", 0.19)
    time.sleep(0.3)
    driver.find_element(By.ID, "reset").click()
    time.sleep(0.4)
    r.check("[registry] reset restores the visible model parameter",
            js("return document.getElementById('param-r').value") == "0.05",
            js("return document.getElementById('param-r').value"))
    r.check("[registry] reset keeps the model selected",
            js("return document.getElementById('model-select').value") == "vicsek")

    # Whatever language is current, the option labels must be the registry's
    # own names in that language — checked against the registry, not a list
    # written out here that would go stale on the next model.
    lang = js("return document.documentElement.lang")
    expected = [m["name"][lang] for m in registry]
    r.check("[registry] option labels are the registry names in the current language",
            [o.text for o in select().options] == expected,
            f"{[o.text for o in select().options]} vs {expected}")

    # ─── the selected model's step is the one actually running.
    #
    # With speed and noise at zero, blind agents are perfectly still while
    # Vicsek agents keep reorienting towards their neighbours. The contrast
    # between the two frozen configurations is what proves the loop calls the
    # selected model rather than the first in the registry.
    slide("speed", 0)
    slide("noise", 0)
    slide("r", 0.2)
    driver.find_element(By.ID, "play").click()        # resume
    driver.find_element(By.ID, "shuffle").click()     # away from any converged state
    time.sleep(0.25)
    turning = snap()
    time.sleep(0.35)
    r.check("[registry] vicsek reorients with speed and noise at zero",
            turning != snap())

    select().select_by_value("blind")
    driver.find_element(By.ID, "shuffle").click()
    time.sleep(0.5)
    still = snap()
    time.sleep(0.6)
    r.check("[registry] blind agents are still with speed and noise at zero",
            still == snap())

    # ─── nested radii: the slider under the hand wins, the others give way
    select().select_by_value("aoki-reynolds-couzin")
    time.sleep(0.5)

    radii = lambda: [float(js(f"return document.getElementById('param-{k}').value"))
                     for k in ("rrep", "ral", "ratt")]
    ordered = lambda v: v[0] <= v[1] <= v[2]

    r.check("[registry] ARC radii start ordered", ordered(radii()), str(radii()))

    # Push the innermost radius past the two outer ones.
    slide("rrep", 0.4)
    time.sleep(0.4)
    pushed = radii()
    r.check("[registry] raising Rrep carries Ral and Ratt along",
            pushed == [0.4, 0.4, 0.4], str(pushed))

    # Pull the outermost down below the others.
    slide("ratt", 0.1)
    time.sleep(0.4)
    pulled = radii()
    r.check("[registry] lowering Ratt carries Ral and Rrep down",
            pulled == [0.1, 0.1, 0.1], str(pulled))

    # A middle move must push in one direction only.
    slide("ratt", 0.45)
    slide("rrep", 0.02)
    time.sleep(0.4)
    slide("ral", 0.3)
    time.sleep(0.4)
    middle = radii()
    r.check("[registry] moving Ral leaves the radii it does not cross alone",
            middle == [0.02, 0.3, 0.45], str(middle))

    slide("ral", 0.01)
    time.sleep(0.4)
    crossed = radii()
    r.check("[registry] lowering Ral below Rrep pushes Rrep down",
            crossed == [0.01, 0.01, 0.45], str(crossed))

    r.check("[registry] readouts follow the corrected sliders",
            js("return [...document.querySelectorAll('#model-params output')]"
               ".map(o => o.textContent)")[:3] == ["0.010", "0.010", "0.450"],
            str(js("return [...document.querySelectorAll('#model-params output')].map(o => o.textContent)")))

    driver.find_element(By.ID, "reset").click()
    time.sleep(0.4)
    r.check("[registry] reset restores ordered radii",
            radii() == [0.025, 0.125, 0.25], str(radii()))

    # A model without a constrain() function must be unaffected by all this.
    select().select_by_value("vicsek")
    time.sleep(0.4)
    slide("r", 0.18)
    time.sleep(0.3)
    r.check("[registry] a model without constraints is left alone",
            js("return document.getElementById('param-r').value") == "0.18",
            js("return document.getElementById('param-r').value"))

    r.check("[registry] no JS error over the suite",
            not js("return window.__errors || []"),
            "; ".join(js("return window.__errors || []")))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--headed", action="store_true", help="show the browser")
    parser.add_argument("--shots", metavar="DIR", help="write screenshots there")
    parser.add_argument("--only", choices=["unit", "ui", "registry"],
                        help="run one suite")
    args = parser.parse_args()

    port = free_port()
    base = f"http://127.0.0.1:{port}"
    httpd = serve(ROOT, port)

    # Throwaway copy of the page carrying the error hook; removed on the way out
    # whatever happens, so it can never be committed or deployed.
    probe = ROOT / "index_test.html"
    probe.write_text((ROOT / "index.html").read_text().replace(
        '<link rel="stylesheet"', ERROR_HOOK + '<link rel="stylesheet"'))

    results = Results()
    driver = None
    try:
        driver = browser(args.headed)
        if args.only in (None, "unit"):
            unit_suite(driver, base, results)
        if args.only in (None, "ui"):
            ui_suite(driver, base, results, args.shots)
        if args.only in (None, "registry"):
            registry_suite(driver, base, results)
    finally:
        if driver is not None:
            try:
                driver.quit()
            except Exception:
                pass          # geckodriver sometimes outlives us; harmless
        httpd.shutdown()
        probe.unlink(missing_ok=True)

    sys.exit(0 if results.report() else 1)


if __name__ == "__main__":
    main()
