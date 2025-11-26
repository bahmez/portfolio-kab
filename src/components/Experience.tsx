import { OrbitControls, useGLTF } from "@react-three/drei";
import { useEffect, useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import type { GLTF, OrbitControls as OrbitControlsImpl } from "three-stdlib";

type GLTFResult = GLTF & {
  nodes: Record<string, THREE.Object3D>;
  materials: Record<string, THREE.Material>;
};

export const Experience = () => {
  const gltf = useGLTF("/models/portfolio.glb") as GLTFResult;

  const mixer = useRef(new THREE.AnimationMixer(gltf.scene));
  const actionsRef = useRef<THREE.AnimationAction[]>([]);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const signsRef = useRef<Map<THREE.Mesh, { baseScale: THREE.Vector3; targetScale: number }>>(new Map());
  const hoveredSignRef = useRef<THREE.Mesh | null>(null);
  
  // Camera animation state
  const [focusedSign, setFocusedSign] = useState<THREE.Mesh | null>(null);
  const cameraTransitionRef = useRef({ 
    isAnimating: false, 
    startPosition: new THREE.Vector3(),
    startTarget: new THREE.Vector3(),
    endPosition: new THREE.Vector3(),
    endTarget: new THREE.Vector3(),
    progress: 0 
  });

  const fps = 24;
  const totalFrames = 100;
  const duration = totalFrames / fps;

  // Initialize mixer and find signs
  useEffect(() => {
    if (!gltf.animations) return;

    mixer.current.stopAllAction();
    actionsRef.current = [];

    // 1. Filter out scale tracks for Signs to avoid conflict
    gltf.animations.forEach((clip) => {
      clip.tracks = clip.tracks.filter((track) => {
        const [nodeName, propertyName] = track.name.split(".");
        if (nodeName?.includes("Sign") && propertyName === "scale") {
          return false;
        }
        return true;
      });
    });

    actionsRef.current = gltf.animations.map((clip) => {
      const action = mixer.current.clipAction(clip);
      action.play();
      return action;
    });

    // Cache signs with their base scale (at rest, 1.0)
    const signsMap = new Map<THREE.Mesh, { baseScale: THREE.Vector3; targetScale: number }>();
    gltf.scene.traverse((child) => {
      if (child instanceof THREE.Mesh && child.name.includes("Sign")) {
        // Store the scale at initialization time (should be 1,1,1 or whatever Blender exported)
        signsMap.set(child, {
          baseScale: child.scale.clone(),
          targetScale: 1.0, // Start at base scale (1.0 = no hover)
        });
      }
    });
    signsRef.current = signsMap;

    return () => {
      mixer.current.stopAllAction();
    };
  }, [gltf]);

  useFrame((state, delta) => {
    // 1. Update Animation Mixer (handles position, rotation, etc.)
    mixer.current.update(delta);
    const loopTime = mixer.current.time % duration;
    
    actionsRef.current.forEach((action) => {
       const clipDuration = action.getClip().duration;
       if (clipDuration > 0) {
          action.time = (loopTime / duration) * clipDuration;
       }
    });

    // 2. Handle camera zoom transition
    if (cameraTransitionRef.current.isAnimating && controlsRef.current) {
      cameraTransitionRef.current.progress += delta * 2; // 2 = speed (completes in ~0.5s)
      
      if (cameraTransitionRef.current.progress >= 1) {
        // Animation complete
        cameraTransitionRef.current.isAnimating = false;
        cameraTransitionRef.current.progress = 1;
      }
      
      const t = THREE.MathUtils.smoothstep(cameraTransitionRef.current.progress, 0, 1);
      
      // Interpolate camera position
      state.camera.position.lerpVectors(
        cameraTransitionRef.current.startPosition,
        cameraTransitionRef.current.endPosition,
        t
      );
      
      // Interpolate controls target
      controlsRef.current.target.lerpVectors(
        cameraTransitionRef.current.startTarget,
        cameraTransitionRef.current.endTarget,
        t
      );
      
      controlsRef.current.update();
    }

    // 3. Apply Hover Scale (independently, with smooth transition)
    signsRef.current.forEach((data, sign) => {
      const isHovered = sign === hoveredSignRef.current;
      
      // Target: 1.0 (normal) or 1.2 (hovered)
      const targetScaleFactor = isHovered ? 1.2 : 1.0;
      
      // Smooth interpolation of the scale factor with higher lerp speed for responsiveness
      data.targetScale = THREE.MathUtils.lerp(data.targetScale, targetScaleFactor, 0.15);
      
      // Apply: baseScale * currentScaleFactor
      sign.scale.copy(data.baseScale).multiplyScalar(data.targetScale);
    });

    // 4. Camera limits (only when not animating to a sign)
    if (controlsRef.current && !cameraTransitionRef.current.isAnimating) {
      const target = controlsRef.current.target;
      target.x = THREE.MathUtils.clamp(target.x, -0.6, 0.6);
      target.y = THREE.MathUtils.clamp(target.y, 0.3, 1.0);
    }
  });

  // Texture Baking
  gltf.scene.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || Array.isArray(child.material)) {
       return;
    }

    const material = child.material as THREE.Material & { map?: THREE.Texture | null };
    
    if (material && material.map && !(child.material instanceof THREE.MeshBasicMaterial)) {
         const mat = new THREE.MeshBasicMaterial({ map: material.map });
         mat.map!.colorSpace = THREE.SRGBColorSpace;
         mat.map!.generateMipmaps = false;
         mat.map!.minFilter = THREE.LinearFilter;
         mat.map!.magFilter = THREE.LinearFilter;
         mat.map!.needsUpdate = true;
         child.material = mat;
    }
  });

  return (
    <>
      <OrbitControls
        ref={controlsRef}
        target={[0, 0.5, 0]}
        enableZoom
        minDistance={2.5}
        maxDistance={6}
        enablePan
        screenSpacePanning
        panSpeed={0.5}
        minPolarAngle={Math.PI / 3}
        maxPolarAngle={Math.PI / 2}
        minAzimuthAngle={-Math.PI / 10}
        maxAzimuthAngle={Math.PI / 2}
      />

      <primitive 
        object={gltf.scene}
        onPointerMove={(e: ThreeEvent<PointerEvent>) => {
          // Primary logic: always update based on what we're currently hovering
          if (e.object instanceof THREE.Mesh && e.object.name.includes("Sign")) {
            // Over a sign - set it as hovered
            hoveredSignRef.current = e.object;
            e.stopPropagation();
          } else {
            // Not over a sign - clear hover
            hoveredSignRef.current = null;
          }
        }}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          if (e.object instanceof THREE.Mesh && e.object.name.includes("Sign") && controlsRef.current) {
            e.stopPropagation();
            
            const sign = e.object;
            setFocusedSign(sign);
            
            // Log the sign identifier for debugging and custom offset configuration
            console.log("Clicked on Sign:", {
              name: sign.name,
              uuid: sign.uuid,
              userData: sign.userData,
            });
            
            // Get the world position of the sign
            const signWorldPos = new THREE.Vector3();
            sign.getWorldPosition(signWorldPos);
            
            // Calculate camera position: offset from sign position
            // Position camera in front and slightly above the sign
            const offset = new THREE.Vector3(0, 0.3, 1.5); // Adjust these values for desired zoom level
            const cameraEndPos = signWorldPos.clone().add(offset);
            
            // Setup transition
            cameraTransitionRef.current.startPosition.copy(e.camera.position);
            cameraTransitionRef.current.startTarget.copy(controlsRef.current.target);
            cameraTransitionRef.current.endPosition.copy(cameraEndPos);
            cameraTransitionRef.current.endTarget.copy(signWorldPos);
            cameraTransitionRef.current.progress = 0;
            cameraTransitionRef.current.isAnimating = true;
          }
        }}
      />
    </>
  );
};
