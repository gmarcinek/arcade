# Changes: Enable tunnelAngularGravity in Physics

## Metadata

- **Feature**: tunnel-angular-gravity
- **Mode**: FAST
- **Status**: COMPLETE
- **Plan**: none
- **Details**: none
- **Review**: none

## Summary

Wired `tunnelAngularGravity` from config into the physics update loop as a pendulum restoring force (`−gravity * sin(θ)`), pulling the car back toward the tube floor (θ=0). Updated the config comment to reflect it is now active.

## Tasks

- [x] Add gravity line to `physics.js` between steering accumulation and clamp
- [x] Update `config.js` comment to remove `[UNUSED]` marker
- [x] Build verification

## Files Modified

| File                          | Action   | Why                                          |
| ----------------------------- | -------- | -------------------------------------------- |
| `tron-tunel-3/src/physics.js` | Modified | Added `−tunnelAngularGravity * sin(θ)` force |
| `tron-tunel-3/src/config.js`  | Modified | Updated comment; value unchanged (2120.0)    |

## Verification

- Backend build (`mvn`): SKIPPED
- Frontend build (`npm`): PASS — 541 kB, built in 679 ms
- Tests: SKIPPED
