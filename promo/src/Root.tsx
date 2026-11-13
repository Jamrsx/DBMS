import React from "react";
import { Composition } from "remotion";
import { Main } from "./Main";
import { FPS, TOTAL } from "./timeline";
import { Tutorial } from "./tutorial/Tutorial";
import { TOTAL as TUT_TOTAL } from "./tutorial/lines";
import { MacTeaser, TOTAL as MAC_TOTAL } from "./mac/MacTeaser";

export const Root: React.FC = () => (
  <>
    <Composition id="NexdbPromo" component={Main} durationInFrames={TOTAL} fps={FPS} width={1920} height={1080} defaultProps={{ bgm: true }} />
    <Composition id="MacTeaser" component={MacTeaser} durationInFrames={MAC_TOTAL} fps={30} width={1920} height={1080} />
    <Composition id="TailscaleTutorial" component={Tutorial} durationInFrames={TUT_TOTAL} fps={30} width={1920} height={1080} />
  </>
);
