"use client";

import { Player } from "@remotion/player";
import { PerspectiveMarquee } from "@/components/ui/remocn-perspective-marquee";

const settings = {
  rotateY: -28,
  rotateX: 8,
  perspective: 1200,
  pixelsPerFrame: 2,
  speed: 1,
  fontSize: 84,
};

export default function Demo(props: Partial<typeof settings>) {
  const s = { ...settings, ...props };

  return (
    <div className="h-screen w-screen">
      <Player
        component={PerspectiveMarquee as any}
        inputProps={s}
        durationInFrames={100000}
        compositionWidth={1200}
        compositionHeight={900}
        fps={30}
        autoPlay
        loop
        controls={false}
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}
