import { OrbitControls, useGLTF } from "@react-three/drei";
import { useEffect, useRef, useState, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { GLTF, OrbitControls as OrbitControlsImpl } from "three-stdlib";

type HoverSignProps = {
  mesh: THREE.Mesh;
};

const HoverSign = ({ mesh }: HoverSignProps) => {
  const [hovered, setHovered] = useState(false);

  useFrame(() => {
    const targetScale = hovered ? 1.2 : 1;
    mesh.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.1);
  });

  return (
    <primitive
      object={mesh}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
    />
  );
};

type GLTFResult = GLTF & {
  nodes: Record<string, THREE.Object3D>;
  materials: Record<string, THREE.Material>;
};

export const Experience = () => {
  const gltf = useGLTF("/models/portfolio.glb") as GLTFResult;

  const mixer = useRef(new THREE.AnimationMixer(gltf.scene));
  const actionsRef = useRef<THREE.AnimationAction[]>([]);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  const fps = 24;
  const totalFrames = 100;
  const duration = totalFrames / fps;

  useEffect(() => {
    if (!gltf.animations) return;

    const findNodeName = (nodeName: string): string | null => {
      const exact = gltf.scene.getObjectByName(nodeName);
      if (exact) return exact.name;

      const cleaned = nodeName.replace(/_Baked$/i, "");
      const cleanedNode = gltf.scene.getObjectByName(cleaned);
      if (cleanedNode) return cleanedNode.name;

      let foundName: string | null = null;
      gltf.scene.traverse((n: THREE.Object3D) => {
        if (!foundName && n.name?.includes(nodeName)) {
          foundName = n.name;
        }
      });
      if (foundName) return foundName;

      foundName = null;
      gltf.scene.traverse((n: THREE.Object3D) => {
        if (!foundName && n.name?.includes(cleaned)) {
          foundName = n.name;
        }
      });
      if (foundName) return foundName;

      return null;
    };

    gltf.animations.forEach((clip) => {
      clip.tracks.forEach((track) => {
        const parts = track.name.split(".");
        if (parts.length < 2) return;

        const nodePart = parts[0];
        const propPart = parts.slice(1).join(".");

        const mapped = findNodeName(nodePart);
        if (mapped && mapped !== nodePart) {
          track.name = `${mapped}.${propPart}`;
        }
      });
    });

    // Initialize actions similarly to ExperienceAnimationLoop
    actionsRef.current = gltf.animations.map((clip) => {
      const action = mixer.current.clipAction(clip);
      action.play(); // Just play, loop control is manual
      return action;
    });

    return () => {
      mixer.current.stopAllAction();
    };
  }, [gltf, mixer]);

  useFrame((_, delta) => {
    mixer.current.update(delta);
    const loopTime = mixer.current.time % duration;

    actionsRef.current.forEach((action) => {
       const clipDuration = action.getClip().duration;
       // Map global loop time to clip time
       action.time = (loopTime / duration) * clipDuration;
    });

    if (controlsRef.current) {
      const target = controlsRef.current.target;
      target.x = THREE.MathUtils.clamp(target.x, -0.6, 0.6);
      target.y = THREE.MathUtils.clamp(target.y, 0.3, 1.0);
    }
  });

  // Bake textures logic - using useMemo to run it once safely during render phase
  // This mimics the original behavior of running in the function body but prevents re-running unnecessarily if not needed.
  // However, the original code ran it every render. To be safe and match "original behavior" that worked, 
  // we can check if the material is already converted.
  
  useMemo(() => {
    gltf.scene.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) {
         return;
      }

      // If material is array, we skip it (matching original JS behavior which would have crashed or skipped on child.material.map)
      if (Array.isArray(child.material)) {
          return;
      }

      const material = child.material as THREE.Material & { map?: THREE.Texture | null };
      
      // In original JS: if (child.isMesh && child.material?.map)
      if (material && material.map) {
        // Check if it's already a MeshBasicMaterial to avoid double-wrapping if this runs again
        if (!(child.material instanceof THREE.MeshBasicMaterial)) {
             const mat = new THREE.MeshBasicMaterial({ map: material.map });
             mat.map!.colorSpace = THREE.SRGBColorSpace;
             mat.map!.generateMipmaps = false;
             mat.map!.minFilter = THREE.LinearFilter;
             mat.map!.magFilter = THREE.LinearFilter;
             mat.map!.needsUpdate = true;
             child.material = mat;
        }
      }
    });
  }, [gltf]);

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

      {gltf.scene.children.map((child) => {
        if (child instanceof THREE.Mesh && child.name.includes("Sign")) {
          return <HoverSign key={child.uuid} mesh={child} />;
        }

        return <primitive key={child.uuid} object={child} />;
      })}
    </>
  );
};
