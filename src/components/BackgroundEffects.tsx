import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { mountIntroEye, INTRO_EYE_URL } from './introEye';
import { mountIntroScene, INTRO_SCENE_URL } from './introScene';

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
    dispose?: () => void;
  }>({});

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Clean up current effect if exists
    const cleanCurrentEffect = () => {
      const effect = currentEffectRef.current;
      effect.dispose?.();
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

    const SCENE_BG = INTRO_SCENE_URL;
    const EYE_BG = INTRO_EYE_URL;
    const MINECRAFT_BG = '/backgrounds/minecraft-scene.png';

    // RENDER DETECTED BG
    // A device without WebGL (or with it blocked) must still get the plain
    // background picture, not a crashed page -- so any setup failure here
    // just leaves the effect off.
    try {
      if (currentBgUrl === SCENE_BG) {
        // 1. Woodland theme. Before login the animated intro scene sits
        // underneath (see introScene.ts); the interactive snow falls over it,
        // and over the plain after-login picture once logged in.
        const disposeScene = isAuthenticated ? undefined : mountIntroScene(container, pointerPosRef);
        const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        if (!isAuthenticated && reduceMotion) {
          // Intro with "reduce motion" on: still picture only, no snow
          currentEffectRef.current = { dispose: disposeScene };
          return;
        }

        // Snow Particles Effect
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(25, container.clientWidth / container.clientHeight, 0.1, 100);
        camera.position.set(0, 0, 20);

        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(container.clientWidth, container.clientHeight);
        // Positioned so it paints above the intro scene's (positioned) layers
        Object.assign(renderer.domElement.style, { position: 'absolute', inset: '0' });
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
          resizeHandler: updateSize,
          dispose: disposeScene
        };

      } else if (currentBgUrl === EYE_BG) {
        if (isAuthenticated) {
          // After login the hillside picture shows on its own, no eye overlay
          return;
        }
        // 2. Intro eye (photo + flame shader + embers), see introEye.ts
        currentEffectRef.current = { dispose: mountIntroEye(container, pointerPosRef) };

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
    } catch (err) {
      console.warn('Background effect unavailable, showing the still picture', err);
      cleanCurrentEffect();
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
