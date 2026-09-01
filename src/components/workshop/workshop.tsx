import { Canvas } from "@react-three/fiber";
import { ACESFilmicToneMapping } from "three";
import { Toaster } from "sonner";
import { WorkshopScene } from "./canvas";
import { DropOverlay, Hud } from "./hud";

export function Workshop() {
  return (
    <div className="relative h-dvh w-full overflow-hidden bg-bg text-fg">
      <Canvas
        shadows
        dpr={[1, 1.75]}
        camera={{ fov: 42, near: 0.08, far: 90, position: [4.1, 2.3, 5.1] }}
        gl={{ antialias: true, toneMapping: ACESFilmicToneMapping, toneMappingExposure: 1.25 }}
        style={{ touchAction: "none", position: "absolute", inset: 0 }}
      >
        <WorkshopScene />
      </Canvas>
      <Hud />
      <DropOverlay />
      <Toaster theme="dark" position="bottom-center" />
    </div>
  );
}
