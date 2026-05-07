# Plan: Death Blast Visual (Fast)

## Metadata

- **Feature**: death-blast-visual
- **Mode**: FAST
- **Status**: COMPLETE

## Goal

Add a death-blast visual during out-of-bounds respawn so the ball stays visible, shoots forward, and scales from 1x to 10x over 2 seconds, then resets on restart.

## Tasks

- [x] Add death-blast constants to config.
- [x] Wire death-blast runtime state in game death/respawn flow.
- [x] Apply death-blast motion and growth in ball visuals update.

## Verification

- Frontend build via `npm.cmd run build`
- Validate death trigger and respawn reset path compile cleanly
