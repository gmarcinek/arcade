# Changes: Debug Arrows and Pivot Axes renderOrder Fix

## Metadata

- **Feature**: debug-renderorder
- **Mode**: FAST
- **Status**: COMPLETE
- **Plan**: none
- **Details**: none
- **Review**: none

## Summary

Three.js does not propagate `renderOrder` from a parent `Group` to its leaf children. Set `renderOrder = 999` and `transparent = true` on every child inside `makeArrow` and `pivotAxes` traversals so debug overlays render above the tunnel shader.

## Tasks

- [x] `makeArrow`: set `renderOrder` and `transparent` on each traversed child
- [x] `pivotAxes`: replace direct material property access with a traverse that sets `renderOrder` and `transparent` on each child
- [x] Build verification

## Files Modified

| File                       | Action   | Why                                                                        |
| -------------------------- | -------- | -------------------------------------------------------------------------- |
| `tron-tunel-3/src/ball.js` | Modified | Apply renderOrder + transparent to leaf objects in makeArrow and pivotAxes |

## Verification

- Backend build (`mvn`): SKIPPED
- Frontend build (`npm`): PASS
- Tests: SKIPPED
