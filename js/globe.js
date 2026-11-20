(function () {

const D2R = Math.PI / 180;
const TAU = Math.PI * 2;

const latLonToVec = (lat, lon, r = 1) =>
  new THREE.Vector3(
    Math.cos(lat * D2R) * Math.cos(lon * D2R) * r,
    Math.sin(lat * D2R) * r,
    -Math.cos(lat * D2R) * Math.sin(lon * D2R) * r
  );

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;

function tween(ms, fn) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - t0) / ms);
      fn(t);
      t < 1 ? requestAnimationFrame(step) : resolve();
    };
    requestAnimationFrame(step);
  });
}

const EARTH_VERT = /* glsl */ `
  varying vec2 vUv; varying vec3 vN; varying vec3 vW;
  void main(){
    vUv = uv;
    vN = normalize(mat3(modelMatrix) * normal);
    vec4 w = modelMatrix * vec4(position,1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;

const EARTH_FRAG = /* glsl */ `
  uniform sampler2D dayMap; uniform sampler2D nightMap; uniform sampler2D specMap;
  uniform vec3 sunDir;
  varying vec2 vUv; varying vec3 vN; varying vec3 vW;
  void main(){
    vec3 N = normalize(vN);
    vec3 V = normalize(cameraPosition - vW);
    float d = dot(N, sunDir);
    float dayMix = smoothstep(-0.12, 0.22, d);
    vec3 day = texture2D(dayMap, vUv).rgb;
    vec3 night = texture2D(nightMap, vUv).rgb;
    float spec = texture2D(specMap, vUv).r;
    vec3 dayCol = day * (0.10 + 1.05 * max(d, 0.0));
    vec3 nightCol = night * vec3(1.6, 1.15, 0.65) + day * 0.012;
    vec3 col = mix(nightCol, dayCol, dayMix);
    vec3 R = reflect(-sunDir, N);
    col += vec3(0.8,0.9,1.0) * pow(max(dot(R, V), 0.0), 38.0) * spec * 0.55 * dayMix;
    float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    col += vec3(0.18, 0.45, 0.9) * rim * (0.25 + 0.6 * dayMix);
    gl_FragColor = vec4(col, 1.0);
  }`;

const ATMO_VERT = /* glsl */ `
  varying vec3 vNormal;
  void main(){ vNormal = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const ATMO_FRAG = /* glsl */ `
  varying vec3 vNormal;
  void main(){
    float i = pow(max(0.68 - dot(vNormal, vec3(0.0,0.0,1.0)), 0.0), 3.2);
    gl_FragColor = vec4(0.25, 0.55, 1.0, 1.0) * i * 1.6;
  }`;

function createGlobe(container, labelLayer) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000402);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.002, 300);

  const state = {
    camDir: new THREE.Vector3(0, 0.18, 1).normalize(),
    dist: 3.6,
    baseDist: 3.6,
    spin: true,
    interactive: true,
    active: true,
    sunOffset: new THREE.Vector3(1.1, 0.35, 0.2),
    target: null, // world-space surface point of the locked target
    lockAmt: 0,
    comm: 0,
    commOn: false,
  };

  // ---------- Earth ----------
  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin('anonymous');
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const load = (file, srgb = true) =>
    new Promise((res) => {
      loader.load(
        EARTH_TEX[file],
        (t) => {
          t.anisotropy = maxAniso;
          res(t);
        },
        undefined,
        () => res(new THREE.Texture())
      );
    });

  const dayMap = new THREE.Texture();
  const nightMap = new THREE.Texture();
  const specMap = new THREE.Texture();
  const uniforms = {
    dayMap: { value: dayMap },
    nightMap: { value: nightMap },
    specMap: { value: specMap },
    sunDir: { value: new THREE.Vector3(1, 0.3, 0.6).normalize() },
  };

  const tilt = new THREE.Group();
  tilt.rotation.z = -0.41;
  scene.add(tilt);
  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(1, 160, 160),
    new THREE.ShaderMaterial({ uniforms, vertexShader: EARTH_VERT, fragmentShader: EARTH_FRAG })
  );
  earth.rotation.y = 2.2;
  tilt.add(earth);

  const cloudMat = new THREE.MeshLambertMaterial({ transparent: true, opacity: 0.55, depthWrite: false });
  const clouds = new THREE.Mesh(new THREE.SphereGeometry(1.007, 128, 128), cloudMat);
  earth.add(clouds);

  const sunLight = new THREE.DirectionalLight(0xffffff, 1.3);
  scene.add(sunLight, new THREE.AmbientLight(0xffffff, 0.15));

  const atmo = new THREE.Mesh(
    new THREE.SphereGeometry(1.14, 96, 96),
    new THREE.ShaderMaterial({
      vertexShader: ATMO_VERT,
      fragmentShader: ATMO_FRAG,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    })
  );
  scene.add(atmo);

  const ready = Promise.all([
    load('day'),
    load('night'),
    load('spec', false),
    load('clouds'),
  ]).then(([d, n, s, c]) => {
    uniforms.dayMap.value = d;
    uniforms.nightMap.value = n;
    uniforms.specMap.value = s;
    cloudMat.map = c;
    cloudMat.alphaMap = null;
    cloudMat.needsUpdate = true;
  });

  // ---------- Stars ----------
  {
    const n = 5000;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(120 + Math.random() * 40);
      pos.set([v.x, v.y, v.z], i * 3);
      const b = 0.35 + Math.random() * 0.65;
      col.set([b * 0.85, b, b * 0.9], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 0.55, vertexColors: true, sizeAttenuation: true, transparent: true, opacity: 0.9 })));
  }

  // ---------- Orbits & satellites ----------
  const ringDefs = [
    { r: 1.28, tx: 1.15, tz: 0.2, speed: 0.22, phase: 0.6, tag: 'SAT-0412' },
    { r: 1.46, tx: 0.55, tz: -0.5, speed: -0.16, phase: 2.4, tag: 'UNIDENTIFIED', watcher: true },
    { r: 1.7, tx: 1.35, tz: 0.9, speed: 0.11, phase: 4.1, tag: 'SAT-2203' },
    { r: 1.2, tx: 0.2, tz: 1.1, speed: -0.28, phase: 5.2, tag: 'SAT-1187' },
  ];
  const sats = [];
  const ringMat = new THREE.LineBasicMaterial({ color: 0x33ff66, transparent: true, opacity: 0.22 });
  for (const def of ringDefs) {
    const pts = [];
    for (let i = 0; i < 160; i++) pts.push(new THREE.Vector3(Math.cos((i / 160) * TAU) * def.r, 0, Math.sin((i / 160) * TAU) * def.r));
    const ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), ringMat);
    ring.rotation.set(def.tx, 0, def.tz);
    scene.add(ring);

    const body = new THREE.Group();
    const color = def.watcher ? 0xff3b3b : 0x9dffb4;
    const m = new THREE.MeshBasicMaterial({ color });
    body.add(new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.018, 0.018), m));
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.002, 0.022), new THREE.MeshBasicMaterial({ color: 0x4aa8ff }));
      p.position.x = s * 0.04;
      body.add(p);
    }
    scene.add(body);

    const tag = document.createElement('div');
    tag.className = 'sat-tag' + (def.watcher ? ' unknown' : '');
    tag.innerHTML = '<i></i><span></span>';
    tag.querySelector('span').textContent = def.tag;
    labelLayer.appendChild(tag);
    sats.push({ def, ring, body, tag, angle: def.phase, pos: new THREE.Vector3() });
  }
  const watcher = sats.find((s) => s.def.watcher);

  // ---------- Communication link ----------
  const CURVE_N = 64;
  const linkGeo = new THREE.BufferGeometry();
  linkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(CURVE_N * 3), 3));
  const link = new THREE.Line(linkGeo, new THREE.LineBasicMaterial({ color: 0x66ff99, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  link.frustumCulled = false;
  scene.add(link);

  const PULSES = 7;
  const pulseGeo = new THREE.BufferGeometry();
  pulseGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PULSES * 3), 3));
  const pulses = new THREE.Points(pulseGeo, new THREE.PointsMaterial({ color: 0xcfffe0, size: 0.03, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  pulses.frustumCulled = false;
  scene.add(pulses);

  const ringMatT = new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const impact = [0, 1].map(() => {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 64), ringMatT.clone());
    m.visible = false;
    scene.add(m);
    return m;
  });

  const curvePts = Array.from({ length: CURVE_N }, () => new THREE.Vector3());
  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();
  function bezier(P, C, T, t, out) {
    const a = 1 - t;
    return out.set(
      a * a * P.x + 2 * a * t * C.x + t * t * T.x,
      a * a * P.y + 2 * a * t * C.y + t * t * T.y,
      a * a * P.z + 2 * a * t * C.z + t * t * T.z
    );
  }

  // ---------- Helpers ----------
  function occluded(p) {
    const c = camera.position;
    tmpA.copy(p).sub(c);
    const len = tmpA.length();
    tmpA.divideScalar(len);
    const b = c.dot(tmpA);
    const disc = b * b - (c.lengthSq() - 1);
    if (disc < 0) return false;
    const t = -b - Math.sqrt(disc);
    return t > 0 && t < len;
  }
  function toScreen(v) {
    const p = v.clone().project(camera);
    return {
      x: (p.x * 0.5 + 0.5) * container.clientWidth,
      y: (-p.y * 0.5 + 0.5) * container.clientHeight,
      behind: p.z > 1,
    };
  }

  function resize() {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const base = 3.6 * Math.max(1, 0.8 / camera.aspect);
    if (state.dist === state.baseDist) state.dist = base;
    state.baseDist = base;
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------- Interaction (drag to rotate before authentication) ----------
  let drag = null;
  renderer.domElement.addEventListener('pointerdown', (e) => {
    if (!state.interactive) return;
    drag = { x: e.clientX, y: e.clientY };
    renderer.domElement.setPointerCapture(e.pointerId);
  });
  renderer.domElement.addEventListener('pointermove', (e) => {
    if (!drag || !state.interactive) return;
    earth.rotation.y += (e.clientX - drag.x) * 0.006;
    tilt.rotation.x = THREE.MathUtils.clamp(tilt.rotation.x + (e.clientY - drag.y) * 0.003, -0.6, 0.6);
    drag = { x: e.clientX, y: e.clientY };
  });
  const endDrag = () => (drag = null);
  renderer.domElement.addEventListener('pointerup', endDrag);
  renderer.domElement.addEventListener('pointercancel', endDrag);

  // ---------- Render loop ----------
  let last = performance.now();
  const frameCbs = [];
  const mouse = { x: 0, y: 0 };
  window.addEventListener('pointermove', (e) => {
    mouse.x = e.clientX / window.innerWidth - 0.5;
    mouse.y = e.clientY / window.innerHeight - 0.5;
  });

  function frame(now) {
    requestAnimationFrame(frame);
    if (!state.active) {
      last = now;
      return;
    }
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    if (state.spin) earth.rotation.y += dt * 0.035;
    clouds.rotation.y += dt * 0.006;

    // camera
    const parallax = state.interactive ? 1 : 0;
    const dir = state.camDir.clone();
    dir.x += mouse.x * 0.04 * parallax;
    dir.y += -mouse.y * 0.03 * parallax;
    dir.normalize();
    camera.position.copy(dir).multiplyScalar(state.dist);
    camera.near = Math.max(0.0005, (state.dist - 1) * 0.08);
    camera.updateProjectionMatrix();
    camera.lookAt(0, 0, 0);

    // sun follows the camera hemisphere so the target area is always lit
    const sun = state.camDir.clone().add(state.sunOffset).normalize();
    uniforms.sunDir.value.copy(sun);
    sunLight.position.copy(sun).multiplyScalar(10);

    // satellites
    for (const s of sats) {
      s.angle += s.def.speed * dt;
      tmpB.set(Math.cos(s.angle) * s.def.r, 0, Math.sin(s.angle) * s.def.r);
      s.ring.updateMatrixWorld();
      s.ring.localToWorld(tmpB);
      s.pos.copy(tmpB);
      if (s === watcher && state.target && state.lockAmt > 0) {
        s.pos.lerp(state.lockPos, easeSine(state.lockAmt));
      }
      s.body.position.copy(s.pos);
      s.body.lookAt(0, 0, 0);
      const sc = toScreen(s.pos);
      const hide = sc.behind || occluded(s.pos) || state.dist < 1.6;
      s.tag.style.opacity = hide ? '0' : '1';
      s.tag.style.transform = `translate(${sc.x}px, ${sc.y}px)`;
      s.body.visible = !hide || state.dist >= 1.6;
    }

    // comm link
    const wantComm = state.commOn && state.target ? 1 : 0;
    state.comm += (wantComm - state.comm) * Math.min(1, dt * 2.2);
    const showComm = state.comm > 0.01 && state.target;
    link.visible = pulses.visible = !!showComm;
    for (const r of impact) r.visible = !!showComm;
    if (showComm) {
      const P = watcher.pos;
      const T = state.target;
      tmpA.copy(P).add(T).multiplyScalar(0.5);
      const C = tmpA.clone().multiplyScalar(1.0);
      for (let i = 0; i < CURVE_N; i++) bezier(P, C, T, i / (CURVE_N - 1), curvePts[i]);
      const lp = linkGeo.attributes.position;
      curvePts.forEach((v, i) => lp.setXYZ(i, v.x, v.y, v.z));
      lp.needsUpdate = true;
      link.material.opacity = 0.75 * state.comm;
      const pp = pulseGeo.attributes.position;
      for (let i = 0; i < PULSES; i++) {
        const t = (now * 0.00055 + i / PULSES) % 1;
        bezier(P, C, T, t, tmpB);
        pp.setXYZ(i, tmpB.x, tmpB.y, tmpB.z);
      }
      pp.needsUpdate = true;
      pulses.material.opacity = state.comm;
      pulses.material.size = 0.03 * Math.max(0.35, Math.min(1, state.dist / 3));

      const sizeK = Math.max(0.1, Math.min(1, (state.dist - 1) / 2.6));
      impact.forEach((m, i) => {
        const t = ((now * 0.0007 + i * 0.5) % 1);
        m.position.copy(T).multiplyScalar(1.002);
        m.lookAt(T.clone().multiplyScalar(2));
        m.scale.setScalar((0.02 + t * 0.07) * (0.35 + sizeK));
        m.material.opacity = (1 - t) * 0.9 * state.comm;
      });
    }

    for (const cb of frameCbs) cb(dt);
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);

  // ---------- Public API ----------
  const api = {
    ready,
    onFrame: (cb) => frameCbs.push(cb),
    setActive: (v) => (state.active = v),
    setInteractive: (v) => (state.interactive = v),
    get dist() {
      return state.dist;
    },
    /** Camera sub-point in lat/lon. */
    getSubPoint() {
      const local = state.camDir.clone();
      earth.updateWorldMatrix(true, false);
      const inv = earth.matrixWorld.clone().invert();
      local.transformDirection(inv);
      return { lat: Math.asin(local.y) / D2R, lon: Math.atan2(-local.z, local.x) / D2R };
    },
    setWatcherLabel(text, identified) {
      watcher.tag.querySelector('span').textContent = text;
      watcher.tag.classList.toggle('unknown', !identified);
      watcher.tag.classList.toggle('locked', !!identified);
    },
    /** Spin the Earth so the given point faces the camera. */
    async spinToward(lat, lon, ms) {
      state.spin = false;
      const L = lon * D2R;
      let psi = -Math.PI / 2 - L;
      const cur = earth.rotation.y;
      psi += TAU * Math.ceil((cur - psi) / TAU); // always continue eastward
      const t0 = tilt.rotation.z;
      const x0 = tilt.rotation.x;
      await tween(ms, (t) => {
        const e = easeInOut(t);
        earth.rotation.y = cur + (psi - cur) * e;
        tilt.rotation.z = t0 * (1 - e);
        tilt.rotation.x = x0 * (1 - e);
      });
      earth.rotation.y = psi;
      earth.updateWorldMatrix(true, true);
      state.target = earth.localToWorld(latLonToVec(lat, lon)).clone();
      const n = state.target.clone().normalize();
      state.lockPos = n.clone().multiplyScalar(1.5).add(new THREE.Vector3(0.45, 0.35, 0.3));
    },
    async setComm(on) {
      state.commOn = on;
      if (on && state.target) await tween(1800, (t) => (state.lockAmt = t));
      else state.lockAmt = 0;
    },
    /** Fly the camera from orbit down to the locked target. */
    async flyIn(endDist, ms, onProgress) {
      state.interactive = false;
      const from = state.camDir.clone();
      const to = state.target.clone().normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(from, to);
      const qi = new THREE.Quaternion();
      const d0 = state.dist;
      const off0 = state.sunOffset.clone();
      const off1 = new THREE.Vector3(0.45, 0.3, 0.1);
      await tween(ms, (t) => {
        const eRot = easeInOut(Math.min(1, t * 1.25));
        const eZoom = easeInOut(t);
        state.camDir.copy(from).applyQuaternion(qi.identity().slerp(q, eRot));
        state.dist = Math.exp(Math.log(d0) + (Math.log(endDist) - Math.log(d0)) * eZoom);
        state.sunOffset.lerpVectors(off0, off1, eRot);
        onProgress && onProgress(t, state.dist);
      });
    },
    /** Screen position of the locked target. */
    getTargetScreen() {
      if (!state.target) return null;
      const s = toScreen(state.target);
      return { ...s, visible: !s.behind && !occluded(state.target.clone().multiplyScalar(1.001)) };
    },
    /** Pixel size of one degree-ish scale for reticle sizing. */
    pixelsPerUnit() {
      const h = container.clientHeight;
      const dist = Math.max(0.05, state.dist - 1);
      return h / (2 * Math.tan((camera.fov * D2R) / 2) * dist);
    },
  };
  return api;
}

window.createGlobe = createGlobe;
})();
