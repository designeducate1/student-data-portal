import * as THREE from 'three';
import { generateNoiseTexture } from './introEye';

// Intro screen woodland scene: the illustration below, gently animated by
// one full-screen shader. Only areas painted into the mask image move:
//   red   = the stream (ripples, reflection wobble)
//   green = canopy (thin branches and hanging leaves sway)
//   blue  = far tree line (faint drifting mist)
// The child is cut out of every channel. Their head and ears get a separate
// soft local warp that leans a few pixels toward the pointer.
//
// Layers, bottom to top:
//   1. the still picture (<picture>: AVIF, then WebP, then JPG) -- always
//      present, so with no WebGL, a lost context or "reduce motion" on,
//      students simply see the still illustration
//   2. the WebGL canvas, faded in once the picture has decoded
//   3. the same light dimming the other themes get, for text contrast
export const INTRO_SCENE_URL = '/backgrounds/intro-scene.jpg';
const SCENE_SOURCES = [
  { srcset: '/backgrounds/intro-scene.avif', type: 'image/avif' },
  { srcset: '/backgrounds/intro-scene.webp', type: 'image/webp' },
];
const MASKS_URL = '/backgrounds/intro-scene-masks.png';
const SCENE_DESCRIPTION =
  'Illustration: a child in a pink bunny onesie sits on a mossy log in a misty wood, bare feet dangling over a small stream.';

// Where to keep the picture anchored when the screen shape crops it
// (CSS object-position): the child sits just left of centre, upper-middle.
const FOCUS_X = 0.46;
const FOCUS_Y = 0.42;

type PointerRef = { current: { tx: number; ty: number } };

const fullscreenVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const sceneFragmentShader = `
  precision highp float;
  uniform float uTime;
  uniform vec2 uResolution;
  uniform vec2 uOffset;   // top-left of the cover-fitted picture, device px
  uniform vec2 uDisplay;  // size of the cover-fitted picture, device px
  uniform sampler2D uImage;
  uniform sampler2D uMasks;
  uniform sampler2D uNoise;
  uniform vec2 uLook;     // eased pointer, -1..1, y up

  // Head + ears, measured on intro-scene.jpg (picture units, y down).
  const vec2 HEAD_C = vec2(0.475, 0.34);
  const vec2 HEAD_R = vec2(0.13, 0.12);

  void main() {
    // Same cover/focus fit as the still picture underneath, so the two
    // line up exactly when the canvas fades in.
    vec2 fragTop = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y);
    vec2 uv = (fragTop - uOffset) / uDisplay;          // 0..1, y down
    vec2 tuv = vec2(uv.x, 1.0 - uv.y);                 // texture space

    vec3 masks = texture2D(uMasks, tuv).rgb;
    float water = masks.r;
    float canopy = masks.g;
    float mistZone = masks.b;
    float t = uTime;

    // Slow stream: long horizontal ripples drifting downstream, bent by a
    // slower cross-wave so they never look like a regular grid. Periods are
    // several seconds; displacement is a few pixels at most.
    float bend = sin(uv.x * 7.0 + t * 0.25) * 1.4;
    float r1 = sin(uv.y * 85.0 - t * 1.1 + bend);
    float r2 = sin(uv.y * 150.0 + uv.x * 18.0 - t * 1.6);
    // Vertical stretch wave -- makes the pink reflection lengthen and
    // shorten slightly, like it would on moving water.
    float stretch = sin(uv.y * 30.0 - t * 0.7);
    vec2 ripple = vec2(r1 * 0.0030 + r2 * 0.0012, stretch * 0.0025 + r1 * 0.0008);

    // Canopy: a slow sway (6-12s cycles, about 6-8px at the tips on a phone) plus a
    // smaller, quicker stir so twigs and hanging leaves don't move as one
    // rigid sheet. Fades out toward the trunks and away from the child.
    vec2 sway = vec2(
      sin(t * 0.55 + uv.y * 5.0 + uv.x * 2.0) * 0.6 + sin(t * 0.31 + uv.x * 4.0) * 0.4,
      sin(t * 0.45 + uv.x * 3.0) * 0.25
    ) * 0.012;
    sway += vec2(sin(t * 1.2 + uv.x * 30.0 + uv.y * 20.0), cos(t * 0.9 + uv.x * 25.0)) * 0.0025;
    sway.y = -sway.y; // uv is y-down, texture space is y-up

    // Head and gaze: everything inside a soft ellipse around the head leans
    // toward the pointer, full strength at the centre fading to nothing at
    // the edge, so there's no cut-out outline. At most ~4px sideways and
    // ~3px up/down on a phone; the ears (top of the ellipse) lean a little
    // further, like a slight head tilt.
    float headW = 1.0 - smoothstep(0.35, 1.0, length((uv - HEAD_C) / HEAD_R));
    float earsW = smoothstep(0.34, 0.27, uv.y);
    vec2 lean = vec2(uLook.x * (0.0065 + 0.003 * earsW), -uLook.y * 0.0045) * headW;
    lean.y = -lean.y; // uv is y-down, texture space is y-up

    vec3 col = texture2D(uImage, tuv - ripple * water - sway * canopy - lean).rgb;
    // Faint light catching the ripple crests (+/-2%, never a flash).
    col += water * r2 * 0.02;

    // Mist: large soft patches drifting sideways across the far tree line,
    // crossing the picture in about half a minute. At most 60% haze.
    float m1 = texture2D(uNoise, uv * vec2(0.12, 0.30) + vec2(t * 0.004, 0.0)).r;
    float m2 = texture2D(uNoise, uv * vec2(0.20, 0.45) + vec2(-t * 0.003, t * 0.001)).r;
    float mist = smoothstep(0.25, 0.65, m1 * 0.6 + m2 * 0.4) * mistZone;
    col = mix(col, vec3(0.96, 0.97, 0.96), mist * 0.60);

    gl_FragColor = vec4(col, 1.0);
  }
`;

function startWebGL(container: HTMLElement, img: HTMLImageElement, pointerRef: PointerRef): (() => void) | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: false, antialias: false, powerPreference: 'low-power' });
  } catch {
    return null; // no WebGL -- the still picture underneath stays visible
  }

  const canvas = renderer.domElement;
  Object.assign(canvas.style, { position: 'absolute', inset: '0', opacity: '0', transition: 'opacity 600ms ease' });
  container.insertBefore(canvas, container.lastChild); // under the dimming layer

  let pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  let stopped = false;
  let imageReady = false;
  let maskReady = false;
  const imageTexture = new THREE.Texture(img);
  imageTexture.minFilter = THREE.LinearFilter;
  imageTexture.generateMipmaps = false;
  const reveal = () => {
    if (imageReady && maskReady && !stopped) canvas.style.opacity = '1';
  };
  // Reuse whichever format the browser already picked for the still
  // picture, so the illustration is only downloaded once.
  (img.complete && img.naturalWidth ? Promise.resolve() : img.decode())
    .then(() => {
      imageTexture.needsUpdate = true;
      imageReady = true;
      resize();
      reveal();
    })
    .catch(() => dispose());
  const maskTexture = new THREE.TextureLoader().load(
    MASKS_URL,
    () => {
      maskReady = true;
      reveal();
    },
    undefined,
    () => dispose()
  );

  const noiseTexture = new THREE.DataTexture(generateNoiseTexture(256, 2), 256, 256, THREE.RGBAFormat);
  noiseTexture.wrapS = THREE.RepeatWrapping;
  noiseTexture.wrapT = THREE.RepeatWrapping;
  noiseTexture.minFilter = THREE.LinearFilter;
  noiseTexture.magFilter = THREE.LinearFilter;
  noiseTexture.needsUpdate = true;

  const material = new THREE.ShaderMaterial({
    vertexShader: fullscreenVertexShader,
    fragmentShader: sceneFragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2() },
      uOffset: { value: new THREE.Vector2() },
      uDisplay: { value: new THREE.Vector2(1, 1) },
      uImage: { value: imageTexture },
      uMasks: { value: maskTexture },
      uNoise: { value: noiseTexture },
      uLook: { value: new THREE.Vector2() },
    },
    depthTest: false,
    depthWrite: false,
  });
  const geometry = new THREE.PlaneGeometry(2, 2);
  scene.add(new THREE.Mesh(geometry, material));

  const resize = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(w, h);
    const iw = img.naturalWidth || 1508;
    const ih = img.naturalHeight || 2049;
    const scale = Math.max(w / iw, h / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    material.uniforms.uResolution.value.set(w * pixelRatio, h * pixelRatio);
    material.uniforms.uDisplay.value.set(dw * pixelRatio, dh * pixelRatio);
    material.uniforms.uOffset.value.set((w - dw) * FOCUS_X * pixelRatio, (h - dh) * FOCUS_Y * pixelRatio);
  };
  resize();
  window.addEventListener('resize', resize);

  const onContextLost = () => {
    canvas.style.opacity = '0';
    stopped = true;
  };
  canvas.addEventListener('webglcontextlost', onContextLost);

  // Older Chromebooks: after a short warm-up, measure real frame time and
  // drop resolution rather than stutter. The motion itself never changes.
  let frames = 0;
  let sampleStart = 0;
  let raf = 0;
  let elapsed = 0;
  let lookX = 0;
  let lookY = 0;
  let last = performance.now();
  const tick = (now: number) => {
    if (stopped) return;
    raf = requestAnimationFrame(tick);
    // Clamp the step so coming back to the tab doesn't jump the water.
    elapsed += Math.min(now - last, 100) * 0.001;
    last = now;
    if (!imageReady || !maskReady) return;

    // Ease toward the pointer slowly (6% of the gap per frame) so the head
    // drifts rather than snaps; a faint idle drift keeps it alive when
    // nobody is touching. Released pointer -> back to looking ahead.
    lookX += (pointerRef.current.tx - lookX) * 0.06;
    lookY += (pointerRef.current.ty - lookY) * 0.06;
    const len = Math.hypot(lookX, lookY);
    const k = len > 1 ? 1 / len : 1;
    material.uniforms.uLook.value.set(
      lookX * k + Math.sin(elapsed * 0.35) * 0.15,
      lookY * k + Math.sin(elapsed * 0.27) * 0.1
    );
    material.uniforms.uTime.value = elapsed;
    renderer.render(scene, camera);

    frames++;
    if (frames === 30) {
      sampleStart = now;
    } else if (frames === 90) {
      const avgMs = (now - sampleStart) / 60;
      container.dataset.introSceneFrameMs = avgMs.toFixed(1);
      if (avgMs > 19 && pixelRatio > 1) {
        pixelRatio = 1;
        resize();
        frames = 0;
      } else if (avgMs > 30 && pixelRatio > 0.75) {
        pixelRatio = 0.75;
        resize();
        frames = 0;
      }
      container.dataset.introSceneRatio = String(pixelRatio);
    }
  };

  // Pause completely while the tab is hidden, resume where it left off.
  const onVisibility = () => {
    if (stopped) return;
    cancelAnimationFrame(raf);
    if (!document.hidden) {
      last = performance.now();
      raf = requestAnimationFrame(tick);
    }
  };
  document.addEventListener('visibilitychange', onVisibility);
  raf = requestAnimationFrame(tick);

  function dispose() {
    stopped = true;
    cancelAnimationFrame(raf);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('resize', resize);
    canvas.removeEventListener('webglcontextlost', onContextLost);
    imageTexture.dispose();
    maskTexture.dispose();
    noiseTexture.dispose();
    geometry.dispose();
    material.dispose();
    renderer.dispose();
    canvas.remove();
  }
  return dispose;
}

// Mounts the intro scene into `container` and returns a cleanup function.
export function mountIntroScene(container: HTMLElement, pointerRef: PointerRef): () => void {
  const picture = document.createElement('picture');
  for (const s of SCENE_SOURCES) {
    const source = document.createElement('source');
    source.srcset = s.srcset;
    source.type = s.type;
    picture.appendChild(source);
  }
  const img = document.createElement('img');
  img.src = INTRO_SCENE_URL;
  img.alt = SCENE_DESCRIPTION;
  img.decoding = 'async';
  Object.assign(img.style, {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    objectPosition: `${FOCUS_X * 100}% ${FOCUS_Y * 100}%`,
  });
  picture.appendChild(img);
  container.appendChild(picture);

  const dim = document.createElement('div');
  Object.assign(dim.style, { position: 'absolute', inset: '0', background: 'rgba(0,0,0,0.15)' });
  container.appendChild(dim);

  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let stopWebGL: (() => void) | null = null;
  const start = () => {
    stopWebGL?.();
    stopWebGL = reduceMotion?.matches ? null : startWebGL(container, img, pointerRef);
  };
  start();
  reduceMotion?.addEventListener?.('change', start);

  return () => {
    reduceMotion?.removeEventListener?.('change', start);
    stopWebGL?.();
    picture.remove();
    dim.remove();
    delete container.dataset.introSceneFrameMs;
    delete container.dataset.introSceneRatio;
  };
}
