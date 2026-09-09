/*
 * CALM — WebGL renderer (the 3D view), on three.js.
 *
 * One instanced cone per agent: a single draw call for the whole flock,
 * whatever its size, with position, orientation and colour per instance. A
 * thousand cones is nothing for a GPU.
 *
 * Colour encodes the **heading**, as the 2D view does and on the same HSV
 * basis, so a polarised flock goes one colour in either view. A 3D heading has
 * two degrees of freedom against a hue wheel's one, so the elevation rides the
 * other two HSV axes — see directionRgb().
 *
 * three.js is vendored in vendor/, not loaded from a CDN: the tests then run
 * offline and the deployed subdomain has no third-party dependency at
 * runtime. It is exposed as the global THREE by its UMD build.
 */

import { directionRgb } from './colormap.js';

/* Agent size in box units — the cone's height. Larger than the 2D triangle,
 * because perspective shrinks whatever is far away and a flock thinned across
 * depth needs the help. */
const LENGTH = 0.026;
const RADIUS = 0.009;

/* Cone segments. Six reads as a cone and costs a quarter of what a smooth one
 * would at a thousand instances. */
const SEGMENTS = 6;

export class Renderer3d {

  constructor(canvas) {
    this.canvas = canvas;
    this.dark = false;
    this.ready = typeof THREE !== 'undefined';

    /* Camera orbit, in radians and box units. */
    this.yaw = 0.6;
    this.pitch = 0.35;
    this.distance = 2.4;
    this.spin = 0.04;          // radians per second of idle rotation

    if (!this.ready) return;

    /* preserveDrawingBuffer keeps the rendered frame readable after
     * compositing, which is what makes canvas.toDataURL() return the picture
     * rather than a blank. The tests rely on it, and the cost at this
     * instance count is not measurable. */
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(window.devicePixelRatio || 1);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.05, 40);

    /* The cone points along +y by default; the agents' headings are computed
     * against +y for that reason, see _orient(). */
    this.geometry = new THREE.ConeGeometry(RADIUS, LENGTH, SEGMENTS);
    this.material = new THREE.MeshLambertMaterial();

    this.mesh = null;
    this.capacity = 0;

    /* Lighting: one directional light fixed to the camera plus a soft ambient
     * fill, so an agent's shade reads as its facing rather than as where it
     * happens to be in the box. */
    this.key = new THREE.DirectionalLight(0xffffff, 2.2);
    this.scene.add(this.key);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));

    /* Wireframe box: without it there is no depth cue at all and no way to
     * see that the domain is a cube.
     *
     * BoxGeometry is centred on the origin, while the agents live in [0,1[³,
     * so it has to be moved by half a side. Without this the box sits a half
     * unit low in every axis and a good third of the flock appears to be
     * outside it. */
    this.box = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
      new THREE.LineBasicMaterial({ transparent: true, opacity: 0.6 }));
    this.box.position.set(0.5, 0.5, 0.5);
    this.scene.add(this.box);

    this._matrix = new THREE.Matrix4();
    this._quaternion = new THREE.Quaternion();
    this._up = new THREE.Vector3(0, 1, 0);
    this._heading = new THREE.Vector3();
    this._scale = new THREE.Vector3(1, 1, 1);
    this._offset = new THREE.Vector3();
    /* Three components in [0,1], reused: the colour is recomputed for every
     * agent on every frame and must not allocate. */
    this._rgb = [0, 0, 0];

    this._bindPointer();
  }

  /* Drag to orbit, wheel to zoom.
   *
   * Hand-rolled rather than three's OrbitControls, which ships separately from
   * the UMD build: two dozen lines against a second vendored file. */
  _bindPointer() {
    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    this.canvas.addEventListener('pointerdown', (event) => {
      dragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
      this.canvas.setPointerCapture(event.pointerId);
    });

    this.canvas.addEventListener('pointermove', (event) => {
      if (!dragging) return;

      this.yaw -= (event.clientX - lastX) * 0.008;
      this.pitch -= (event.clientY - lastY) * 0.008;

      /* Stop just short of the poles, where the up vector degenerates and the
       * view flips over. */
      const limit = Math.PI / 2 - 0.05;
      this.pitch = Math.max(-limit, Math.min(limit, this.pitch));

      lastX = event.clientX;
      lastY = event.clientY;

      /* Any manual move ends the idle spin: the visitor has taken over. */
      this.spin = 0;
    });

    const release = (event) => {
      dragging = false;
      if (this.canvas.hasPointerCapture?.(event.pointerId)) {
        this.canvas.releasePointerCapture(event.pointerId);
      }
    };
    this.canvas.addEventListener('pointerup', release);
    this.canvas.addEventListener('pointercancel', release);

    this.canvas.addEventListener('wheel', (event) => {
      event.preventDefault();
      this.distance = Math.max(0.9, Math.min(6, this.distance * (1 + event.deltaY * 0.001)));
    }, { passive: false });
  }

  resize() {
    if (!this.ready) return;

    const rect = this.canvas.getBoundingClientRect();
    const side = Math.max(1, Math.min(rect.width, rect.height));

    this.renderer.setSize(side, side, false);
    this.camera.aspect = 1;
    this.camera.updateProjectionMatrix();
  }

  /* Grow the instanced mesh to hold at least n agents.
   *
   * InstancedMesh has a fixed capacity, so it is rebuilt when the count
   * slider outgrows it — and kept when the count merely drops, with `count`
   * limiting what is drawn. */
  _ensure(n) {
    if (this.mesh !== null && this.capacity >= n) {
      this.mesh.count = n;
      return;
    }

    if (this.mesh !== null) {
      this.scene.remove(this.mesh);
      this.mesh.dispose();
    }

    this.capacity = Math.max(n, 128);
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, this.capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor =
      new THREE.InstancedBufferAttribute(new Float32Array(this.capacity * 3), 3);
    this.mesh.count = n;
    this.scene.add(this.mesh);
  }

  draw(state, elapsedSeconds = 0) {
    if (!this.ready) return;

    const dim = state.dim;
    const n = state.n;

    this._ensure(n);

    /* Idle rotation, until the visitor drags. A still 3D projection is very
     * hard to read; a slow turn supplies the parallax that makes depth
     * legible. */
    this.yaw += this.spin * elapsedSeconds;

    const background = this.dark ? 0x000000 : 0xffffff;
    this.scene.background = new THREE.Color(background);
    this.box.material.color.set(this.dark ? 0x777777 : 0x999999);

    /* Camera on its orbit, looking at the centre of the box. */
    const cx = Math.cos(this.pitch);
    this.camera.position.set(
      0.5 + this.distance * cx * Math.sin(this.yaw),
      0.5 + this.distance * Math.sin(this.pitch),
      0.5 + this.distance * cx * Math.cos(this.yaw));
    this.camera.lookAt(0.5, 0.5, 0.5);
    this.key.position.copy(this.camera.position);

    for (let i = 0; i < n; i++) {
      const o = i * dim;

      /* A 2D state drawn in the 3D view sits in the z = 1/2 plane rather than
       * being refused: the view is switched by the interface, which also
       * reseeds the state, so this is only ever seen for a frame. */
      const x = state.pos[o];
      const y = state.pos[o + 1];
      const z = dim === 3 ? state.pos[o + 2] : 0.5;

      this._heading.set(
        state.dir[o],
        state.dir[o + 1],
        dim === 3 ? state.dir[o + 2] : 0).normalize();

      /* The cone models +y, so the instance rotation is whatever takes +y to
       * the heading. */
      this._quaternion.setFromUnitVectors(this._up, this._heading);
      this._offset.set(x, y, z);
      this._matrix.compose(this._offset, this._quaternion, this._scale);
      this.mesh.setMatrixAt(i, this._matrix);

      const rgb = directionRgb(this._heading.x, this._heading.y, this._heading.z,
                               this._rgb);
      this.mesh.instanceColor.setXYZ(i, rgb[0], rgb[1], rgb[2]);
    }

    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;

    this.renderer.render(this.scene, this.camera);
  }

  /* Free the GPU resources when the view is switched away. */
  dispose() {
    if (!this.ready) return;

    if (this.mesh !== null) {
      this.scene.remove(this.mesh);
      this.mesh.dispose();
      this.mesh = null;
      this.capacity = 0;
    }
  }
}
