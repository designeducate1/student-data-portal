import { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface BackgroundEffectsProps {
  currentBgUrl: string;
  pointerPos: {
    tx: number;
    ty: number;
    rayTx: number;
    rayTy: number;
  };
  isAuthenticated?: boolean;
}

// Shaders Constants
const particlesVertexShader = `
  attribute vec4 aRandom;
  attribute vec3 aColor;
  uniform float uTime;
  uniform float uSpread;
  uniform float uBaseSize;
  uniform float uSizeRandomness;
  varying vec4 vRandom;
  varying vec3 vColor;
  void main() {
    vRandom = aRandom;
    vColor = aColor;
    vec3 pos = position * uSpread;
    
    float t = uTime * 0.15;
    pos.x += sin(t * aRandom.z + 6.28 * aRandom.w) * 1.5;
    pos.y = mod(pos.y - t * (1.5 + aRandom.y * 2.5) + 15.0, 30.0) - 15.0;
    pos.z += sin(t * aRandom.w + 6.28 * aRandom.y) * 1.5;
    
    vec4 mvPos = viewMatrix * modelMatrix * vec4(pos, 1.0);
    gl_PointSize = (uBaseSize * (1.0 + uSizeRandomness * (aRandom.x - 0.5))) / length(mvPos.xyz);
    gl_Position = projectionMatrix * mvPos;
  }
`;

const particlesFragmentShader = `
  precision highp float;
  uniform float uTime;
  varying vec4 vRandom;
  varying vec3 vColor;
  void main() {
    vec2 uv = gl_PointCoord.xy;
    float d = length(uv - vec2(0.5));
    if(d > 0.5) discard;
    float circle = smoothstep(0.5, 0.2, d) * 0.8;
    gl_FragColor = vec4(vColor + 0.1 * sin(uTime + vRandom.y * 6.28), circle);
  }
`;

const eyeVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const eyeFragmentShader = `
  precision highp float;
  uniform float uTime;
  uniform vec3 uResolution;
  uniform sampler2D uNoiseTexture;
  uniform float uPupilSize;
  uniform float uIrisWidth;
  uniform float uGlowIntensity;
  uniform float uIntensity;
  uniform float uScale;
  uniform float uNoiseScale;
  uniform vec2 uMouse;
  uniform float uPupilFollow;
  uniform float uFlameSpeed;
  uniform vec3 uEyeColor;
  uniform vec3 uBgColor;

  void main() {
    vec2 eyeCenter = vec2(0.0, 1.0); 
    vec2 uv = (gl_FragCoord.xy * 2.0 - uResolution.xy) / uResolution.y;
    uv -= eyeCenter; uv /= uScale;

    // Calculate mouse offset for iris and pupil tracking
    vec2 aspectMouse = vec2(uMouse.x * uResolution.z, uMouse.y);
    vec2 trackingCenter = vec2(0.0, 0.0); 
    vec2 relativeMouse = aspectMouse - trackingCenter;
    
    // Greater movement offset for responsiveness (increased factor from 0.12 to 0.42)
    vec2 pupilOffset = relativeMouse * uPupilFollow * 0.42;
    float maxOffset = 0.35;
    if (length(pupilOffset) > maxOffset) {
      pupilOffset = normalize(pupilOffset) * maxOffset;
    }

    // Offset iris coordinates so the flaming inner core shifts seamlessly with the pupil
    vec2 irisUv = uv - pupilOffset * 0.65;
    vec2 pupilUv = uv - pupilOffset;

    float ft = uTime * uFlameSpeed;
    float polarRadius = length(irisUv) * 2.0;
    float polarAngle = (2.0 * atan(irisUv.x, irisUv.y)) / 6.28 * 0.3;
    vec2 polarUv = vec2(polarRadius, polarAngle);
    vec4 noiseA = texture2D(uNoiseTexture, polarUv * vec2(0.2, 7.0) * uNoiseScale + vec2(-ft * 0.1, 0.0));
    vec4 noiseB = texture2D(uNoiseTexture, polarUv * vec2(0.3, 4.0) * uNoiseScale + vec2(-ft * 0.2, 0.0));
    vec4 noiseC = texture2D(uNoiseTexture, polarUv * vec2(0.1, 5.0) * uNoiseScale + vec2(-ft * 0.1, 0.0));
    float distanceMask = 1.0 - length(uv);
    float irisDistanceMask = 1.0 - length(irisUv);
    float innerRing = clamp(-1.0 * ((irisDistanceMask - 0.7) / uIrisWidth), 0.0, 1.0);
    innerRing = (innerRing * irisDistanceMask - 0.2) / 0.28; innerRing += noiseA.r - 0.5; innerRing *= 1.3; innerRing = clamp(innerRing, 0.0, 1.0);
    float outerRing = clamp(-1.0 * ((irisDistanceMask - 0.5) / 0.2), 0.0, 1.0);
    outerRing = (outerRing * irisDistanceMask - 0.1) / 0.38; outerRing += noiseC.r - 0.5; outerRing *= 1.3; outerRing = clamp(outerRing, 0.0, 1.0);
    innerRing += outerRing;
    float innerEye = irisDistanceMask - 0.1 * 2.0; innerEye *= noiseB.r * 2.0;

    float pupil = 1.0 - length(pupilUv * vec2(9.0, 2.3)); pupil *= uPupilSize; pupil = clamp(pupil, 0.0, 1.0); pupil /= 0.35;
    float outerEyeGlow = 1.0 - length(uv * vec2(0.5, 1.5)); outerEyeGlow = clamp(outerEyeGlow + 0.5, 0.0, 1.0); outerEyeGlow += noiseC.r - 0.5;
    float outerBgGlow = outerEyeGlow; outerEyeGlow = pow(outerEyeGlow, 2.0); outerEyeGlow += distanceMask; outerEyeGlow *= uGlowIntensity;
    outerEyeGlow = clamp(outerEyeGlow, 0.0, 1.0); outerEyeGlow *= pow(1.0 - distanceMask, 2.0) * 2.5;
    outerBgGlow += distanceMask; outerBgGlow = pow(outerBgGlow, 0.5); outerBgGlow *= 0.15;
    vec3 color = uEyeColor * uIntensity * clamp(max(innerRing + innerEye, outerEyeGlow + outerBgGlow) - pupil, 0.0, 3.0);
    color += uBgColor;
    gl_FragColor = vec4(color, 1.0);
  }
`;

const raysVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const raysFragmentShader = `
  precision highp float;
  uniform float iTime; uniform vec2 iResolution; uniform vec2 rayPos; uniform vec2 rayDir; uniform vec3 raysColor; uniform float raysSpeed; uniform float lightSpread; uniform float rayLength; uniform float pulsating; uniform float fadeDistance; uniform float saturation; uniform vec2 mousePos; uniform float mouseInfluence; uniform float noiseAmount; uniform float distortion;
  uniform sampler2D uBgTexture;
  varying vec2 vUv;
  float noise(vec2 st) { return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123); }
  float rayStrength(vec2 raySource, vec2 rayRefDirection, vec2 coord, float seedA, float seedB, float speed) {
    vec2 sourceToCoord = coord - raySource; vec2 dirNorm = normalize(sourceToCoord); float cosAngle = dot(dirNorm, rayRefDirection);
    float distortedAngle = cosAngle + distortion * sin(iTime * 2.0 + length(sourceToCoord) * 0.01) * 0.2;
    float spreadFactor = pow(max(distortedAngle, 0.0), 1.0 / max(lightSpread, 0.001));
    float distance = length(sourceToCoord); float maxDistance = iResolution.x * rayLength; float lengthFalloff = clamp((maxDistance - distance) / maxDistance, 0.0, 1.0);
    float fadeFalloff = clamp((iResolution.x * fadeDistance - distance) / (iResolution.x * fadeDistance), 0.5, 1.0);
    float pulse = pulsating > 0.5 ? (0.8 + 0.2 * sin(iTime * speed * 3.0)) : 1.0;
    float baseStrength = clamp((0.45 + 0.15 * sin(distortedAngle * seedA + iTime * speed)) + (0.3 + 0.2 * cos(-distortedAngle * seedB + iTime * speed)), 0.0, 1.0);
    return baseStrength * lengthFalloff * fadeFalloff * spreadFactor * pulse;
  }
  void main() {
    vec2 fragCoord = vUv * iResolution; vec2 coord = vec2(fragCoord.x, iResolution.y - fragCoord.y); vec2 finalRayDir = rayDir;
    if (mouseInfluence > 0.0) { vec2 mouseScreenPos = mousePos * iResolution.xy; vec2 mouseDirection = normalize(mouseScreenPos - rayPos); finalRayDir = normalize(mix(rayDir, mouseDirection, mouseInfluence)); }
    vec4 rays1 = vec4(1.0) * rayStrength(rayPos, finalRayDir, coord, 36.2214, 21.11349, 1.5 * raysSpeed);
    vec4 rays2 = vec4(1.0) * rayStrength(rayPos, finalRayDir, coord, 22.3991, 18.0234, 1.1 * raysSpeed);
    vec4 fragColor = rays1 * 0.85 + rays2 * 0.65;
    if (noiseAmount > 0.0) { float n = noise(coord * 0.01 + iTime * 0.1); fragColor.rgb *= (1.0 - noiseAmount + noiseAmount * n); }
    float brightness = 1.0 - (coord.y / iResolution.y); fragColor.x *= 0.1 + brightness * 0.8; fragColor.y *= 0.3 + brightness * 0.6; fragColor.z *= 0.5 + brightness * 0.5;
    if (saturation != 1.0) { float gray = dot(fragColor.rgb, vec3(0.299, 0.587, 0.114)); fragColor.rgb = mix(vec3(gray), fragColor.rgb, saturation); }
    fragColor.rgb *= raysColor * 1.3;
    
    // Beautiful interactive warm torch spotlight following the cursor
    vec2 mouseScreenPos = mousePos * iResolution.xy;
    float torchDist = length(coord - mouseScreenPos);
    float torchRadius = min(iResolution.x, iResolution.y) * 0.42;
    float torchIntensity = smoothstep(torchRadius, 0.0, torchDist);
    float torchCore = smoothstep(torchRadius * 0.25, 0.0, torchDist) * 0.8;
    vec3 torchColor = vec3(1.0, 0.72, 0.40); // Warm cozy torch glow
    vec3 torchLight = torchColor * (torchIntensity + torchCore) * 2.2;

    // Dark mysterious atmospheric cave ambient
    vec3 ambientLight = vec3(0.12, 0.11, 0.15);
    
    // Both torchlight and volumetric rays illuminate the background cave
    vec3 finalRevealLight = ambientLight + torchLight + fragColor.rgb * 1.5;
    vec4 texColor = texture2D(uBgTexture, vUv);
    gl_FragColor = vec4(clamp(texColor.rgb * finalRevealLight, 0.0, 1.0), 1.0);
  }
`;

// Noise generator for Evil Eye
function generateNoiseTexture(size = 256) {
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
      for (let o = 0; o < 8; o++) {
        const f = 32 * (1 << o);
        v += amp * noise(x, y, f, o * 31);
        totalAmp += amp;
        amp *= 0.65;
      }
      v /= totalAmp;
      v = (v - 0.5) * 2.2 + 0.5;
      v = Math.max(0, Math.min(1, v));
      const val = Math.round(v * 255);
      const i = (y * size + x) * 4;
      data[i] = val;
      data[i + 1] = val;
      data[i + 2] = val;
      data[i + 3] = 255;
    }
  }
  return data;
}

export default function BackgroundEffects({ currentBgUrl, pointerPos, isAuthenticated }: BackgroundEffectsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pointerPosRef = useRef(pointerPos);
  pointerPosRef.current = pointerPos;

  // References to keep track of active Three.js elements
  const currentEffectRef = useRef<{
    renderer?: THREE.WebGLRenderer;
    scene?: THREE.Scene;
    camera?: THREE.Camera;
    material?: THREE.ShaderMaterial;
    mesh?: THREE.Mesh | THREE.Points;
    animationFrameId?: number;
    resizeHandler?: () => void;
  }>({});

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Clean up current effect if exists
    const cleanCurrentEffect = () => {
      const effect = currentEffectRef.current;
      if (effect.animationFrameId) {
        cancelAnimationFrame(effect.animationFrameId);
      }
      if (effect.resizeHandler) {
        window.removeEventListener('resize', effect.resizeHandler);
      }
      if (effect.renderer) {
        if (effect.renderer.domElement && effect.renderer.domElement.parentNode) {
          effect.renderer.domElement.parentNode.removeChild(effect.renderer.domElement);
        }
        effect.renderer.dispose();
      }
      if (effect.material) {
        effect.material.dispose();
      }
      if (effect.mesh) {
        if (effect.mesh.geometry) {
          effect.mesh.geometry.dispose();
        }
      }
      currentEffectRef.current = {};
    };

    cleanCurrentEffect();

    const EEYORE_BG = 'https://i.postimg.cc/Dwj6cP3m/Eeyore_Cover_Concept.png';
    const EYE_BG = 'https://i.postimg.cc/P50825cB/Lord-of-the-rings-shhire.png';
    const MINECRAFT_BG = 'https://i.postimg.cc/QNY1CNnH/mixboard-image-(13).png';

    // RENDER DETECTED BG
    if (currentBgUrl === EEYORE_BG) {
      // 1. Snow Particles Effect
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(25, container.clientWidth / container.clientHeight, 0.1, 100);
      camera.position.set(0, 0, 20);

      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(container.clientWidth, container.clientHeight);
      container.appendChild(renderer.domElement);

      const count = 400;
      const pos = new Float32Array(count * 3);
      const rnd = new Float32Array(count * 4);
      for (let i = 0; i < count; i++) {
        pos.set([(Math.random() * 2 - 1) * 15, (Math.random() * 2 - 1) * 15, (Math.random() * 2 - 1) * 10], i * 3);
        rnd.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('aRandom', new THREE.BufferAttribute(rnd, 4));
      geo.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(count * 3).fill(1.0), 3));

      const material = new THREE.ShaderMaterial({
        vertexShader: particlesVertexShader,
        fragmentShader: particlesFragmentShader,
        uniforms: {
          uTime: { value: 0 },
          uSpread: { value: 1.0 },
          uBaseSize: { value: 75 * (window.devicePixelRatio || 1) },
          uSizeRandomness: { value: 1.0 }
        },
        transparent: true,
        depthTest: false,
        blending: THREE.AdditiveBlending
      });

      const mesh = new THREE.Points(geo, material);
      scene.add(mesh);

      const updateSize = () => {
        if (!container) return;
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
      };

      window.addEventListener('resize', updateSize);

      let targetRotationX = 0;
      let targetRotationY = 0;

      const startTime = performance.now();
      const animate = () => {
        const id = requestAnimationFrame(animate);
        currentEffectRef.current.animationFrameId = id;

        material.uniforms.uTime.value = (performance.now() - startTime) * 0.001;

        targetRotationX = pointerPosRef.current.ty * 0.2;
        targetRotationY = pointerPosRef.current.tx * 0.2;

        mesh.rotation.x += (targetRotationX - mesh.rotation.x) * 0.05;
        mesh.rotation.y += (targetRotationY - mesh.rotation.y) * 0.05;

        renderer.render(scene, camera);
      };

      animate();

      currentEffectRef.current = {
        renderer,
        scene,
        camera,
        material,
        mesh,
        resizeHandler: updateSize
      };

    } else if (currentBgUrl === EYE_BG) {
      if (isAuthenticated) {
        // Return early to do nothing, letting the original Shire image (EYE_BG) be visible without the floating eye overlay
        return;
      }
      // 2. Evil Eye Shader Effect
      const scene = new THREE.Scene();
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(container.clientWidth, container.clientHeight);
      container.appendChild(renderer.domElement);

      const noiseData = generateNoiseTexture(256);
      const noiseTexture = new THREE.DataTexture(noiseData, 256, 256, THREE.RGBAFormat);
      noiseTexture.needsUpdate = true;
      noiseTexture.wrapS = THREE.RepeatWrapping;
      noiseTexture.wrapT = THREE.RepeatWrapping;
      noiseTexture.minFilter = THREE.LinearFilter;
      noiseTexture.magFilter = THREE.LinearFilter;

      const uEyeColor = new THREE.Vector3(1.0, 0.435, 0.215); // #FF6F37
      const uBgColor = new THREE.Vector3(0.023, 0.0, 0.062); // #060010

      const material = new THREE.ShaderMaterial({
        vertexShader: eyeVertexShader,
        fragmentShader: eyeFragmentShader,
        uniforms: {
          uTime: { value: 0 },
          uResolution: { value: new THREE.Vector3(container.clientWidth, container.clientHeight, container.clientWidth / container.clientHeight) },
          uNoiseTexture: { value: noiseTexture },
          uPupilSize: { value: 0.6 },
          uIrisWidth: { value: 0.25 },
          uGlowIntensity: { value: 0.35 },
          uIntensity: { value: 1.5 },
          uScale: { value: 1.4 },
          uNoiseScale: { value: 1.0 },
          uMouse: { value: new THREE.Vector2(0, 0) },
          uPupilFollow: { value: 1.0 },
          uFlameSpeed: { value: 1.0 },
          uEyeColor: { value: uEyeColor },
          uBgColor: { value: uBgColor }
        },
        transparent: true
      });

      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
      scene.add(mesh);

      const updateSize = () => {
        if (!container) return;
        renderer.setSize(container.clientWidth, container.clientHeight);
        material.uniforms.uResolution.value.set(
          container.clientWidth,
          container.clientHeight,
          container.clientWidth / container.clientHeight
        );
      };

      window.addEventListener('resize', updateSize);

      let eyeX = 0;
      let eyeY = 0;
      const startTime = performance.now();

      const animate = () => {
        const id = requestAnimationFrame(animate);
        currentEffectRef.current.animationFrameId = id;

        eyeX += (pointerPosRef.current.tx - eyeX) * 0.10;
        eyeY += (pointerPosRef.current.ty - eyeY) * 0.10;

        material.uniforms.uTime.value = (performance.now() - startTime) * 0.001;
        material.uniforms.uMouse.value.set(eyeX, eyeY);

        renderer.render(scene, camera);
      };

      animate();

      currentEffectRef.current = {
        renderer,
        scene,
        camera,
        material,
        mesh,
        resizeHandler: updateSize
      };

    } else if (currentBgUrl === MINECRAFT_BG) {
      // 3. Volumetric Rays Shader Effect
      const scene = new THREE.Scene();
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

      const renderer = new THREE.WebGLRenderer({ alpha: false, antialias: false });
      renderer.setClearColor(0x000000, 1);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(container.clientWidth, container.clientHeight);
      container.appendChild(renderer.domElement);

      const uRaysColor = new THREE.Vector3(1.0, 1.0, 1.0);

      const loader = new THREE.TextureLoader();
      loader.setCrossOrigin('anonymous');
      const bgTexture = loader.load(MINECRAFT_BG);
      bgTexture.minFilter = THREE.LinearFilter;
      bgTexture.magFilter = THREE.LinearFilter;

      const material = new THREE.ShaderMaterial({
        vertexShader: raysVertexShader,
        fragmentShader: raysFragmentShader,
        uniforms: {
          iTime: { value: 0 },
          iResolution: { value: new THREE.Vector2(container.clientWidth * renderer.getPixelRatio(), container.clientHeight * renderer.getPixelRatio()) },
          rayPos: { value: new THREE.Vector2() },
          rayDir: { value: new THREE.Vector2(0, 1) },
          raysColor: { value: uRaysColor },
          raysSpeed: { value: 1.0 },
          lightSpread: { value: 0.5 },
          rayLength: { value: 3.0 },
          pulsating: { value: 0.0 },
          fadeDistance: { value: 1.0 },
          saturation: { value: 1.0 },
          mousePos: { value: new THREE.Vector2(0.5, 0.5) },
          mouseInfluence: { value: 0.85 },
          noiseAmount: { value: 0.0 },
          distortion: { value: 0.0 },
          uBgTexture: { value: bgTexture }
        },
        transparent: false,
        depthTest: false
      });

      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
      scene.add(mesh);

      const updateSize = () => {
        if (!container) return;
        const w = container.clientWidth;
        const h = container.clientHeight;
        renderer.setSize(w, h);
        const dpr = renderer.getPixelRatio();
        const rw = w * dpr;
        const rh = h * dpr;
        material.uniforms.iResolution.value.set(rw, rh);
        const outside = 0.2;
        material.uniforms.rayPos.value.set(0.5 * rw, -outside * rh);
        material.uniforms.rayDir.value.set(0, 1);
      };

      updateSize();
      window.addEventListener('resize', updateSize);

      let rayX = 0.5;
      let rayY = 0.5;
      const startTime = performance.now();

      const animate = () => {
        const id = requestAnimationFrame(animate);
        currentEffectRef.current.animationFrameId = id;

        rayX += (pointerPosRef.current.rayTx - rayX) * 0.08;
        rayY += (pointerPosRef.current.rayTy - rayY) * 0.08;

        material.uniforms.iTime.value = (performance.now() - startTime) * 0.001;
        material.uniforms.mousePos.value.set(rayX, rayY);

        renderer.render(scene, camera);
      };

      animate();

      currentEffectRef.current = {
        renderer,
        scene,
        camera,
        material,
        mesh,
        resizeHandler: updateSize
      };
    }

    return () => {
      cleanCurrentEffect();
    };
  }, [currentBgUrl, isAuthenticated]); // Re-init on BG or auth change

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-[1] transition-opacity duration-1000 overflow-hidden touch-none"
      style={{ touchAction: 'none' }}
    />
  );
}
