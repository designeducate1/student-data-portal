import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

interface Character3DProps {
  currentBgUrl: string;
  pointerPos: {
    tx: number;
    ty: number;
  };
}

export default function Character3D({ currentBgUrl, pointerPos }: Character3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef(pointerPos);

  // Sync pointerPos ref to avoid triggering useEffect re-runs during animation
  useEffect(() => {
    pointerRef.current = pointerPos;
  }, [pointerPos]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer | null = null;
    let scene: THREE.Scene | null = null;
    let camera: THREE.PerspectiveCamera | null = null;
    let mixer: THREE.AnimationMixer | null = null;
    let charModel: THREE.Group | THREE.Object3D | null = null;
    let charHead: THREE.Object3D | null = null;
    let clock = new THREE.Clock();
    let animationFrameId: number;

    // Click reaction variables
    let baselineY = 0;
    let baselineRotY = 0;
    let isReacting = false;
    let reactionTime = 0;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const EYE_BG = 'https://i.postimg.cc/P50825cB/Lord-of-the-rings-shhire.png';
    const MINECRAFT_BG = 'https://i.postimg.cc/QNY1CNnH/mixboard-image-(13).png';

    // 1. Scene Setup
    scene = new THREE.Scene();

    const aspect = container.clientWidth / container.clientHeight;
    camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 100);
    camera.position.set(0, 0, 8);

    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;
    container.appendChild(renderer.domElement);

    // 2. Lighting Setup
    const isMinecraft = currentBgUrl === MINECRAFT_BG;

    const ambLight = new THREE.AmbientLight(isMinecraft ? 0xeff6ff : 0xffffff, isMinecraft ? 0.95 : 0.7);
    scene.add(ambLight);

    const hemiLight = new THREE.HemisphereLight(
      isMinecraft ? 0xffffff : 0xffffff,
      isMinecraft ? 0xbbccdd : 0x888888,
      isMinecraft ? 0.7 : 0.5
    );
    hemiLight.position.set(0, 20, 0);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(isMinecraft ? 0xfffdf5 : 0xffffff, isMinecraft ? 1.3 : 1.0);
    dirLight.position.set(isMinecraft ? 5 : 5, 10, isMinecraft ? 8 : 5);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 25;
    dirLight.shadow.camera.left = -8;
    dirLight.shadow.camera.right = 8;
    dirLight.shadow.camera.top = 8;
    dirLight.shadow.camera.bottom = -8;
    dirLight.shadow.bias = -0.0001;
    dirLight.shadow.radius = isMinecraft ? 4 : 4;
    scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0xe0eaff, isMinecraft ? 0.5 : 0.3);
    fillLight.position.set(-5, 5, -5);
    scene.add(fillLight);

    // 3. Shadow Plane
    const planeGeo = new THREE.PlaneGeometry(50, 50);
    const planeMat = new THREE.ShadowMaterial({ opacity: isMinecraft ? 0.6 : 0.35 });
    const plane = new THREE.Mesh(planeGeo, planeMat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = -2.5;
    plane.receiveShadow = true;
    scene.add(plane);

    // 4. Load Character Model
    let modelUrlToLoad = 'https://neuroappv1.netlify.app/assets/DonkeynewV1.glb';
    if (currentBgUrl === EYE_BG) {
      modelUrlToLoad = 'https://neuroappv1.netlify.app/assets/LordoftheringsV2.glb';
    } else if (currentBgUrl === MINECRAFT_BG) {
      modelUrlToLoad = 'https://collegeappjunev1.netlify.app/Assets/Minecraft.glb';
    }

    const loader = new GLTFLoader();
    loader.load(
      modelUrlToLoad,
      (gltf) => {
        if (!scene) return;
        charModel = gltf.scene;

        if (currentBgUrl === MINECRAFT_BG) {
          charModel.updateMatrixWorld(true);
          const box = new THREE.Box3().setFromObject(charModel);
          const size = box.getSize(new THREE.Vector3());

          if (size.y > 0.001) {
            charModel.scale.setScalar(2.56 / size.y);
          } else {
            charModel.scale.setScalar(2.56);
          }

          charModel.updateMatrixWorld(true);
          const scaledBox = new THREE.Box3().setFromObject(charModel);
          const center = scaledBox.getCenter(new THREE.Vector3());

          charModel.position.x = -1.2 - center.x;
          charModel.position.y = -3.9 - scaledBox.min.y;
          charModel.position.z = 0 - center.z;
        } else {
          charModel.scale.setScalar(1.6);
          charModel.position.set(-1.2, -2.5, 0);
        }

        if (gltf.animations && gltf.animations.length > 0) {
          mixer = new THREE.AnimationMixer(charModel);
          gltf.animations.forEach((clip) => {
            mixer?.clipAction(clip).play();
          });
        }

        charModel.traverse((node: any) => {
          if (node.isBone && (node.name.toLowerCase().includes('head') || node.name.toLowerCase().includes('neck'))) {
            charHead = node;
          }
          if (node.isMesh) {
            node.castShadow = true;
            node.receiveShadow = true;
            if (node.material) {
              node.material.side = THREE.DoubleSide;
              node.material.depthWrite = true;
              node.material.depthTest = true;
              if (node.material.transparent) {
                node.material.alphaTest = 0.5;
              }
            }
          }
        });

        scene.add(charModel);
        baselineY = charModel.position.y;
        baselineRotY = charModel.rotation.y;
      },
      undefined,
      (error) => {
        console.warn('3D Model failed to load:', error);
      }
    );

    // 5. Resize Handler
    const handleResize = () => {
      if (!container || !camera || !renderer) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    // 6. Interactive Click/Touch Raycasting Handler
    const triggerReaction = () => {
      if (isReacting) return;
      isReacting = true;
      reactionTime = 0;
    };

    const handleGlobalClick = (event: MouseEvent) => {
      if (!container || !camera || !charModel || !scene) return;

      // Get relative canvas coordinates from click screen position
      const rect = container.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      // Only handle click events within canvas boundaries
      if (x < 0 || x > rect.width || y < 0 || y > rect.height) return;

      // Prevent triggering when clicking on standard HTML interactive interface (e.g., buttons, input fields, Chat Panel, or Options)
      const target = event.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'BUTTON' ||
        target.tagName === 'A' ||
        target.closest('.pointer-events-auto') ||
        target.closest('button') ||
        target.closest('input')
      ) {
        return;
      }

      // Convert local coordinates to Normalized Device Coordinates (-1 to 1)
      mouse.x = (x / rect.width) * 2 - 1;
      mouse.y = -(y / rect.height) * 2 + 1;

      // Cast a ray from the camera into the scene to see if we hit our avatar model
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObject(charModel, true);

      if (intersects.length > 0) {
        triggerReaction();
      }
    };

    const handleGlobalTouch = (event: TouchEvent) => {
      if (event.touches.length === 0) return;
      const touch = event.touches[0];
      const fakeEvent = {
        clientX: touch.clientX,
        clientY: touch.clientY,
        target: touch.target,
      } as any;
      handleGlobalClick(fakeEvent);
    };

    window.addEventListener('click', handleGlobalClick);
    window.addEventListener('touchstart', handleGlobalTouch);

    // 7. Animation Loop
    let currentRotationY = 0;
    let currentRotationX = 0;

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      const delta = clock.getDelta();
      if (mixer) {
        mixer.update(delta);
      }

      if (charModel && charHead) {
        if (isReacting) {
          reactionTime += delta;
          const duration = 0.9; // Fast and satisfying 0.9s duration

          if (reactionTime < duration) {
            const t = reactionTime / duration; // normalized 0.0 -> 1.0

            // Play elegant programmatic 3D animation (perfectly synchronized physical reaction)
            // 1. Dynamic upward jump/hop (sinusoidal curve)
            const jumpHeight = 1.2;
            charModel.position.y = baselineY + Math.sin(t * Math.PI) * jumpHeight;

            // 2. High-speed 360-degree spin
            charModel.rotation.y = baselineRotY + t * Math.PI * 2;

            // 3. Suspend pointer head tracking: Lerp head smoothly back to neutral look-forward state
            currentRotationY = THREE.MathUtils.lerp(currentRotationY, 0, 0.15);
            currentRotationX = THREE.MathUtils.lerp(currentRotationX, 0, 0.15);
            charHead.rotation.y = currentRotationY;
            charHead.rotation.x = currentRotationX;
          } else {
            // Restore exact baseline positions and end reaction mode
            charModel.position.y = baselineY;
            charModel.rotation.y = baselineRotY;
            isReacting = false;
          }
        } else {
          // Normal behavior: head smoothly follows mouse/pointer location
          const targetRotY = pointerRef.current.tx * 0.55;
          const targetRotX = -pointerRef.current.ty * 0.35;

          // Smooth bone rotation
          currentRotationY = THREE.MathUtils.lerp(currentRotationY, targetRotY, 0.08);
          currentRotationX = THREE.MathUtils.lerp(currentRotationX, targetRotX, 0.08);

          charHead.rotation.y = currentRotationY;
          charHead.rotation.x = currentRotationX;
        }
      }

      if (scene && camera && renderer) {
        renderer.render(scene, camera);
      }
    };

    animate();

    // Cleanup
    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('click', handleGlobalClick);
      window.removeEventListener('touchstart', handleGlobalTouch);
      if (renderer) {
        if (renderer.domElement && renderer.domElement.parentNode) {
          renderer.domElement.parentNode.removeChild(renderer.domElement);
        }
        renderer.dispose();
      }
      if (planeGeo) planeGeo.dispose();
      if (planeMat) planeMat.dispose();
    };
  }, [currentBgUrl]); // Re-load when the theme model changes

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-[15] pointer-events-none transition-opacity duration-700 touch-none"
      style={{ touchAction: 'none' }}
    />
  );
}
