import { CONFIG } from "./config.js";

export function createState() {
  return {
    z: 0,
    theta: 0,
    zVelocity: CONFIG.baseSpeed,
    thetaVelocity: 0,

    radialOffset: 0,
    radialVelocity: 0,
    grounded: true,

    boost: 1,

    trickUsed: false,
    trickActive: false,
    trickRollAngle: 0,
    trickRollVelocity: 0,
    trickRollDirection: 0,

    doubleJumpUsed: false,
    ceilingTransferActive: false,
    ceilingTransferTime: 0,
    ceilingTransferStartTheta: 0,
    ceilingTransferTargetTheta: 0,
    transferLandingMode: false,

    jumpTakeoffTheta: 0,
    jumpStartedAtMs: -Infinity,
    doubleJumpStartedAtMs: -Infinity,

    crashed: false,
    crashTimer: 0,
    tumbleRollAngle: 0,
    tumblePitchAngle: 0,
    tumbleRollVelocity: 0,
    tumblePitchVelocity: 0,

    score: 0,
    combo: 1,
    lastTrick: "—",
  };
}

export function resetState(state) {
  Object.assign(state, createState());
}
