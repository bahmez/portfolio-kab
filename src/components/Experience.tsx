import { OrbitControls, useGLTF } from "@react-three/drei";
import { useEffect, useRef } from "react";
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

  useFrame((_, delta) => {
    // 1. Update Animation Mixer (handles position, rotation, etc.)
    mixer.current.update(delta);
    const loopTime = mixer.current.time % duration;
    
    actionsRef.current.forEach((action) => {
       const clipDuration = action.getClip().duration;
       if (clipDuration > 0) {
          action.time = (loopTime / duration) * clipDuration;
       }
    });

    // 2. Apply Hover Scale (independently, with smooth transition)
    signsRef.current.forEach((data, sign) => {
      const isHovered = sign === hoveredSignRef.current;
      
      // Target: 1.0 (normal) or 1.2 (hovered)
      const targetScaleFactor = isHovered ? 1.2 : 1.0;
      
      // Smooth interpolation of the scale factor with higher lerp speed for responsiveness
      data.targetScale = THREE.MathUtils.lerp(data.targetScale, targetScaleFactor, 0.15);
      
      // Apply: baseScale * currentScaleFactor
      sign.scale.copy(data.baseScale).multiplyScalar(data.targetScale);
    });

    // Camera limits
    if (controlsRef.current) {
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
      />
    </>
  );
};
