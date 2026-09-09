/*
 * CALM — colour from a heading.
 *
 * Both views encode the same thing, an agent's direction of travel, so they
 * share one colour basis: HSV, the plain hue wheel, as the Qt reference used.
 * A flock that agrees on a direction goes one colour; a disordered one stays a
 * confetti of everything. In the nematic phase the two ends of the axis come
 * out opposite on the wheel, which is exactly the reading that makes the phase
 * recognisable.
 *
 * In two dimensions a heading is one angle and the wheel is enough. In three
 * it has two degrees of freedom against the wheel's one, so the elevation goes
 * on the other two HSV axes — the natural shape for a direction, since HSV is
 * itself a cone:
 *
 *   heading level         full saturation, full value   — the pure hue
 *   heading up            saturation falls towards white
 *   heading down          value falls towards black
 *
 * The poles are where hue stops meaning anything, which is correct: straight
 * up has no azimuth. The blend deliberately stops short of pure white and
 * pure black so some hue always survives and an agent never vanishes into the
 * background of its own theme.
 */

/* Hues per turn, for the 2D table. Headings change every frame, so building a
 * colour string per agent per frame would allocate thousands of short-lived
 * strings a second; the table is built once and indexed by angle instead. One
 * degree of quantisation is well below what the eye resolves at this size. */
const HUES = 360;

const TWO_PI = 2 * Math.PI;

/* HSV(h, 1, 1) is exactly HSL(h, 100%, 50%), so the flat wheel needs no
 * conversion of its own. */
export const WHEEL = Array.from({ length: HUES },
                                (_, i) => `hsl(${(i * 360) / HUES} 100% 50%)`);

/* CSS colour for a 2D heading, in radians. Accepts any angle: the models never
 * normalise their headings, since only sines and cosines ever matter to them. */
export function headingColor(angle) {
  const turn = ((angle % TWO_PI) + TWO_PI) % TWO_PI;
  return WHEEL[((turn / TWO_PI) * HUES) | 0] ?? WHEEL[0];
}

/* How far the poles are allowed to wash out. At 1 they would reach pure white
 * and pure black; short of that, a vertical agent keeps a trace of hue and
 * stays visible against either theme's background. */
const POLE_BLEND = 0.75;

/* Bias on |elevation| before blending. Below 1 it widens the band where hue
 * is still readable — most directions on a sphere sit at middling elevations
 * and would otherwise wash out together. */
const POLE_SHAPE = 0.85;

/* HSV to RGB, all components in [0,1]. The standard sextant formulation. */
function hsv(h, s, v, out) {
  const sextant = h * 6;
  const i = Math.floor(sextant) % 6;
  const f = sextant - Math.floor(sextant);

  const p = v * (1 - s);
  const q = v * (1 - s * f);
  const t = v * (1 - s * (1 - f));

  switch (i) {
    case 0: out[0] = v; out[1] = t; out[2] = p; break;
    case 1: out[0] = q; out[1] = v; out[2] = p; break;
    case 2: out[0] = p; out[1] = v; out[2] = t; break;
    case 3: out[0] = p; out[1] = q; out[2] = v; break;
    case 4: out[0] = t; out[1] = p; out[2] = v; break;
    default: out[0] = v; out[1] = p; out[2] = q; break;
  }
  return out;
}

/* Colour for a 3D heading, assumed unit, written into `out` as three
 * components in [0,1] — the form three.js wants, and no allocation per agent
 * per frame. */
export function directionRgb(ux, uy, uz, out) {
  /* Azimuth on the wheel: atan2 returns (-π, π], shifted into [0, 1). */
  const hue = ((Math.atan2(uy, ux) / TWO_PI) + 1) % 1;

  const lift = Math.pow(Math.min(1, Math.abs(uz)), POLE_SHAPE) * POLE_BLEND;

  /* Up drains the saturation towards white, down drains the value towards
   * black. Two directions, two axes, no ambiguity between them. */
  const saturation = uz >= 0 ? 1 - lift : 1;
  const value = uz >= 0 ? 1 : 1 - lift;

  return hsv(hue, saturation, value, out);
}
