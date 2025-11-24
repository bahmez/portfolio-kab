import { Canvas, extend } from "@react-three/fiber";
import type { ReactElement } from "react";
import * as THREE from "three/webgpu";
import { WebGPURenderer } from "three/webgpu";
import { Experience } from "./components/Experience";

extend(THREE);

const initWebGpuRenderer = (canvas: HTMLCanvasElement | OffscreenCanvas) =>
  new WebGPURenderer({
    canvas,
    powerPreference: "high-performance",
    antialias: true,
    alpha: false,
    stencil: false,
    shadowMap: true,
  })
    .init()
    .then((renderer) => renderer);

const App = (): ReactElement => {
  return (
    <Canvas
      shadows
      camera={{ position: [3, 2, 3], fov: 30 }}
      gl={({ canvas }) => initWebGpuRenderer(canvas)}
    >
      <color attach="background" args={["#ececec"]} />
      <Experience />
    </Canvas>
  );
};

export default App;
