import * as THREE from 'three';

// Intro screen eye: the photo below, brought to life with one full-screen
// shader (flame warp, flicker, smoke) plus a light GPU-only ember layer.
// The iris and pupil are never warped -- they only shift toward the pointer.
//
// Layers, bottom to top:
//   1. a still copy of the photo (CSS) -- always there, so if WebGL is
//      missing, the context is lost or the texture fails, students still
//      see the eye instead of a blank screen
//   2. the WebGL canvas, faded in once the texture has loaded
// With "reduce motion" on, only layer 1 is used, plus a slow soft glow.
export const INTRO_EYE_URL = '/backgrounds/intro-eye.jpg';

const BG_COLOR = '#050203';

type PointerRef = { current: { tx: number; ty: number } };

// Where the square photo sits in the frame (CSS px, cyTop measured from the
// top). Eye sits a little above the middle so the login form doesn't cover
// it; capped by height so landscape phones still show the whole eye.
function layout(w: number, h: number) {
  const size = Math.min(Math.max(w * 1.2, h * 0.55), h * 1.1);
  return { size, cx: w / 2, cyTop: h * 0.36 };
}

// Tileable value noise, greyscale in RGBA.
export function generateNoiseTexture(size = 256, octaves = 2) {
  const data = new Uint8Array(size * size * 4);
  function hash(x: number, y: number, s: number) {
    let n = x * 374761393 + y * 668265263 + s * 1274126177;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }
  function noise(px: number, py: number, freq: number, seed: number) {
    const fx = (px / size) * freq;
    const fy = (py / size) * freq;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = fx - ix;
    const ty = fy - iy;
    const w = freq | 0;
    const v00 = hash(((ix % w) + w) % w, ((iy % w) + w) % w, seed);
    const v10 = hash((((ix + 1) % w) + w) % w, ((iy % w) + w) % w, seed);
    const v01 = hash(((ix % w) + w) % w, (((iy + 1) % w) + w) % w, seed);
    const v11 = hash((((ix + 1) % w) + w) % w, (((iy + 1) % w) + w) % w, seed);
    return v00 * (1 - tx) * (1 - ty) + v10 * tx * (1 - ty) + v01 * (1 - tx) * ty + v11 * tx * ty;
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0;
      let amp = 0.4;
      let totalAmp = 0;
      for (let o = 0; o < octaves; o++) {
        v += amp * noise(x, y, 32 * (1 << o), o * 31);
        totalAmp += amp;
        amp *= 0.65;
      }
      v /= totalAmp;
      v = (v - 0.5) * 2.2 + 0.5;
      const val = Math.round(Math.max(0, Math.min(1, v)) * 255);
      const i = (y * size + x) * 4;
      data[i] = val;
      data[i + 1] = val;
      data[i + 2] = val;
      data[i + 3] = 255;
    }
  }
  return data;
}

const fullscreenVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const eyeFragmentShader = `
  precision highp float;
  uniform float uTime;
  uniform vec2 uResolution;
  uniform vec2 uImgCenter;
  uniform float uImgSize;
  uniform vec2 uLook;
  uniform float uDetail;
  uniform sampler2D uImage;
  uniform sampler2D uNoise;
  varying vec2 vUv;

  // Measured on intro-eye.jpg, in image units (0..1, eye centred).
  const float IRIS_R = 0.29;
  const float PUPIL_R = 0.10;
  const vec3 BG = vec3(0.02, 0.008, 0.012);

  void main() {
    vec2 p = (vUv * uResolution - uImgCenter) / uImgSize + 0.5;
    vec2 d = p - 0.5;
    float r = length(d);
    vec2 dir = d / max(r, 1e-4);
    vec2 tang = vec2(-dir.y, dir.x);
    float ft = uTime;
    float lookLen = length(uLook);
    float facing = lookLen > 0.001 ? max(dot(dir, uLook / lookLen), 0.0) * lookLen : 0.0;

    // Iris + pupil: no noise, just a rigid shift toward the pointer that
    // fades out before the rim, so the eye watches without smearing.
    float irisW = 1.0 - smoothstep(PUPIL_R * 1.3, IRIS_R * 0.9, r);
    vec2 shift = uLook * 0.035 * irisW;

    // Flames: same rhythm as the previous eye -- noise wrapped around the
    // eye and scrolled outward at 0.1 and 0.2 units/sec. Angular scales are
    // whole numbers so the wrap-around has no seam.
    vec2 polar = vec2(r * 2.0, atan(d.x, d.y) / 6.2831853);
    float nA = texture2D(uNoise, polar * vec2(0.5, 6.0) + vec2(-ft * 0.1, 0.0)).r;
    float nB = texture2D(uNoise, polar * vec2(0.8, 4.0) + vec2(-ft * 0.2, 0.0)).r;
    float nC = texture2D(uNoise, polar * vec2(0.3, 3.0) + vec2(-ft * 0.1, 0.0)).r;
    float flameZone = smoothstep(IRIS_R * 0.97, IRIS_R * 1.12, r);
    float reach = smoothstep(IRIS_R, 0.46, r); // tips move more than roots
    vec2 flow = dir * ((nB - 0.5) * 0.020 + (nA - 0.5) * 0.010 + facing * 0.012)
              + tang * (nC - 0.5) * 0.024
              + uLook * 0.010;
    flow *= flameZone * (0.35 + 0.65 * reach);

    vec3 col = texture2D(uImage, p - shift - flow).rgb;

    // Gentle flicker on bright flame pixels only (the dark background never
    // pulses), driven by the slow noise layer at +/-8% so it can't strobe.
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    float hot = smoothstep(0.25, 0.75, lum) * flameZone;
    col *= 1.0 + hot * ((nC - 0.5) * 0.16 + facing * 0.15);

    // Fade the square photo out into the background.
    col = mix(BG, col, 1.0 - smoothstep(0.35, 0.5, r));

    // Smoke drifting up and off the flames, leaning with the pointer.
    if (uDetail > 0.5) {
      vec2 sp = p - uLook * 0.02;
      float s1 = texture2D(uNoise, sp * vec2(0.35, 0.25) + vec2(0.0, -ft * 0.012)).r;
      float s2 = texture2D(uNoise, sp * vec2(0.22, 0.30) + vec2(ft * 0.006, -ft * 0.02)).r;
      float smoke = smoothstep(0.5, 0.85, s1 * 0.55 + s2 * 0.45);
      smoke *= smoothstep(0.34, 0.48, r) * (1.0 - smoothstep(0.6, 0.85, r));
      col = mix(col, vec3(0.30, 0.27, 0.26), smoke * 0.22 * (1.0 - hot));
    }

    gl_FragColor = vec4(col, 1.0);
  }
`;

// Embers are stateless: each one's position is a pure function of time and
// its seed, so there is no per-frame CPU work. They fade in and out over
// 2.5-5s; nothing pops.
const emberVertexShader = `
  attribute vec4 aSeed;
  uniform float uTime;
  uniform vec2 uResolution;
  uniform vec2 uImgCenter;
  uniform float uImgSize;
  uniform vec2 uLook;
  uniform float uDpr;
  varying float vAlpha;
  varying float vHeat;
  void main() {
    float life = 2.5 + aSeed.x * 2.5;
    float age = fract(uTime / life + aSeed.y);
    float t = age * life;
    float ang = aSeed.z * 6.2831853;
    vec2 dir = vec2(sin(ang), cos(ang));
    vec2 p = vec2(0.5) + dir * (0.30 + aSeed.w * 0.12)
           + dir * 0.035 * t + vec2(0.0, 0.03 * t)
           + vec2(sin(t * 1.7 + aSeed.x * 20.0) * 0.012, 0.0)
           + uLook * 0.03 * age;
    vec2 px = uImgCenter + (p - 0.5) * uImgSize;
    gl_Position = vec4(px / uResolution * 2.0 - 1.0, 0.0, 1.0);
    gl_PointSize = (1.5 + aSeed.w * 2.5) * uDpr;
    vAlpha = smoothstep(0.0, 0.12, age) * (1.0 - smoothstep(0.55, 1.0, age));
    vHeat = 1.0 - age;
  }
`;

const emberFragmentShader = `
  precision highp float;
  varying float vAlpha;
  varying float vHeat;
  void main() {
    float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5)) * vAlpha;
    vec3 c = mix(vec3(1.0, 0.35, 0.08), vec3(1.0, 0.85, 0.5), vHeat);
    gl_FragColor = vec4(c * a, a);
  }
`;

const EMBER_COUNT = 70;

function startWebGL(container: HTMLElement, pointerRef: PointerRef): (() => void) | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: false, antialias: false, powerPreference: 'low-power' });
  } catch {
    return null; // no WebGL -- the still photo underneath stays visible
  }

  const canvas = renderer.domElement;
  Object.assign(canvas.style, { position: 'absolute', inset: '0', opacity: '0', transition: 'opacity 600ms ease' });
  container.appendChild(canvas);

  let pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(pixelRatio);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const noiseTexture = new THREE.DataTexture(generateNoiseTexture(256, 2), 256, 256, THREE.RGBAFormat);
  noiseTexture.wrapS = THREE.RepeatWrapping;
  noiseTexture.wrapT = THREE.RepeatWrapping;
  noiseTexture.minFilter = THREE.LinearFilter;
  noiseTexture.magFilter = THREE.LinearFilter;
  noiseTexture.needsUpdate = true;

  let loaded = false;
  let stopped = false;
  const imageTexture = new THREE.TextureLoader().load(
    INTRO_EYE_URL,
    () => {
      loaded = true;
      canvas.style.opacity = '1';
    },
    undefined,
    () => dispose() // texture failed -- fall back to the still photo
  );

  // Shared uniform objects, so both materials stay in sync.
  const shared = {
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2() },
    uImgCenter: { value: new THREE.Vector2() },
    uImgSize: { value: 0 },
    uLook: { value: new THREE.Vector2() },
    uDpr: { value: pixelRatio },
  };

  const eyeGeometry = new THREE.PlaneGeometry(2, 2);
  const eyeMaterial = new THREE.ShaderMaterial({
    vertexShader: fullscreenVertexShader,
    fragmentShader: eyeFragmentShader,
    uniforms: { ...shared, uDetail: { value: 1 }, uImage: { value: imageTexture }, uNoise: { value: noiseTexture } },
    depthTest: false,
    depthWrite: false,
  });
  scene.add(new THREE.Mesh(eyeGeometry, eyeMaterial));

  const seeds = new Float32Array(EMBER_COUNT * 4);
  for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
  const emberGeometry = new THREE.BufferGeometry();
  emberGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(EMBER_COUNT * 3), 3));
  emberGeometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
  const emberMaterial = new THREE.ShaderMaterial({
    vertexShader: emberVertexShader,
    fragmentShader: emberFragmentShader,
    uniforms: shared,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const embers = new THREE.Points(emberGeometry, emberMaterial);
  embers.frustumCulled = false;
  embers.renderOrder = 1;
  scene.add(embers);

  let baseX = 0;
  let baseY = 0;
  let driftRangeX = 0;
  let driftRangeY = 0;
  let driftX = 0;
  let driftY = 0;
  const resize = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(w, h);
    const { size, cx, cyTop } = layout(w, h);
    shared.uResolution.value.set(w * pixelRatio, h * pixelRatio);
    baseX = cx * pixelRatio;
    baseY = (h - cyTop) * pixelRatio;
    // Whole-eye drift range: 6% of the width sideways, 4% of the height up
    // and down -- enough to feel it follow, never enough to leave the screen.
    driftRangeX = w * 0.06 * pixelRatio;
    driftRangeY = h * 0.04 * pixelRatio;
    shared.uImgCenter.value.set(baseX + driftX * driftRangeX, baseY + driftY * driftRangeY);
    shared.uImgSize.value = size * pixelRatio;
    shared.uDpr.value = pixelRatio;
  };
  resize();
  window.addEventListener('resize', resize);

  const onContextLost = () => {
    canvas.style.opacity = '0';
    stopped = true;
  };
  canvas.addEventListener('webglcontextlost', onContextLost);

  // Older Chromebooks: after a short warm-up, measure the real frame time
  // and step down (lower resolution, then fewer embers and no smoke) rather
  // than letting the animation stutter. The flame rhythm never changes.
  let quality = 0;
  let frames = 0;
  let sampleStart = 0;
  const degrade = (avgMs: number) => {
    if (quality === 0 && avgMs > 19) {
      quality = 1;
      pixelRatio = Math.min(pixelRatio, 1);
      emberGeometry.setDrawRange(0, EMBER_COUNT / 2);
    } else if (quality === 1 && avgMs > 30) {
      quality = 2;
      pixelRatio = 0.75;
      emberGeometry.setDrawRange(0, 0);
      eyeMaterial.uniforms.uDetail.value = 0;
    } else {
      return;
    }
    resize();
    frames = 0;
  };

  let lookX = 0;
  let lookY = 0;
  let raf = 0;
  const startTime = performance.now();
  const tick = (now: number) => {
    if (stopped) return;
    raf = requestAnimationFrame(tick);
    if (!loaded) return;

    // Same easing as before: close 10% of the gap to the pointer per frame.
    lookX += (pointerRef.current.tx - lookX) * 0.1;
    lookY += (pointerRef.current.ty - lookY) * 0.1;
    const len = Math.hypot(lookX, lookY);
    const k = len > 1 ? 1 / len : 1;
    shared.uLook.value.set(lookX * k, lookY * k);
    // The whole eye follows too, but more slowly than the iris (4% of the
    // gap per frame), so it drifts after the pointer rather than chasing it.
    driftX += (lookX * k - driftX) * 0.04;
    driftY += (lookY * k - driftY) * 0.04;
    shared.uImgCenter.value.set(baseX + driftX * driftRangeX, baseY + driftY * driftRangeY);
    shared.uTime.value = (now - startTime) * 0.001;
    renderer.render(scene, camera);

    frames++;
    if (frames === 30) {
      sampleStart = now;
    } else if (frames === 90) {
      const avgMs = (now - sampleStart) / 60;
      container.dataset.introEyeFrameMs = avgMs.toFixed(1);
      degrade(avgMs);
      container.dataset.introEyeQuality = String(quality);
    }
  };
  raf = requestAnimationFrame(tick);

  function dispose() {
    stopped = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
    canvas.removeEventListener('webglcontextlost', onContextLost);
    imageTexture.dispose();
    noiseTexture.dispose();
    eyeGeometry.dispose();
    eyeMaterial.dispose();
    emberGeometry.dispose();
    emberMaterial.dispose();
    renderer.dispose();
    canvas.remove();
  }
  return dispose;
}

// Mounts the intro eye into `container` and returns a cleanup function.
export function mountIntroEye(container: HTMLElement, pointerRef: PointerRef): () => void {
  const previousBackground = container.style.background;
  container.style.background = BG_COLOR;

  const still = document.createElement('div');
  Object.assign(still.style, {
    position: 'absolute',
    backgroundImage: `url('${INTRO_EYE_URL}')`,
    backgroundSize: 'cover',
    pointerEvents: 'none',
  });
  const mask = 'radial-gradient(closest-side, #000 70%, transparent 100%)';
  still.style.setProperty('mask-image', mask);
  still.style.setProperty('-webkit-mask-image', mask);

  const glow = document.createElement('div');
  Object.assign(glow.style, {
    position: 'absolute',
    inset: '0',
    background: 'radial-gradient(closest-side, rgba(255,140,60,0.55), rgba(255,90,20,0.15) 60%, transparent 100%)',
    mixBlendMode: 'screen',
    opacity: '0',
  });
  still.appendChild(glow);
  container.appendChild(still);

  const placeStill = () => {
    const { size, cx, cyTop } = layout(container.clientWidth, container.clientHeight);
    Object.assign(still.style, {
      width: `${size}px`,
      height: `${size}px`,
      left: `${cx - size / 2}px`,
      top: `${cyTop - size / 2}px`,
    });
  };
  placeStill();
  window.addEventListener('resize', placeStill);

  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let stopWebGL: (() => void) | null = null;
  let glowAnimation: Animation | null = null;

  const start = () => {
    stopWebGL?.();
    stopWebGL = null;
    glowAnimation?.cancel();
    glowAnimation = null;
    if (reduceMotion?.matches) {
      // Calm version: the still photo with a slow, soft glow -- no flames
      // moving, no embers, no eye tracking.
      glowAnimation = glow.animate?.(
        [{ opacity: 0.15 }, { opacity: 0.4 }],
        { duration: 5000, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' }
      ) ?? null;
      return;
    }
    stopWebGL = startWebGL(container, pointerRef);
  };
  start();
  reduceMotion?.addEventListener?.('change', start);

  return () => {
    reduceMotion?.removeEventListener?.('change', start);
    window.removeEventListener('resize', placeStill);
    stopWebGL?.();
    glowAnimation?.cancel();
    still.remove();
    container.style.background = previousBackground;
    delete container.dataset.introEyeFrameMs;
    delete container.dataset.introEyeQuality;
  };
}
