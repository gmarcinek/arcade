import { readdirSync } from 'node:fs';
import { join, parse } from 'node:path';
import { spawnSync } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';

const projectRoot = process.cwd();
const audioDir = join(projectRoot, 'src', 'audio');
const wavFiles = readdirSync(audioDir)
  .filter((fileName) => fileName.toLowerCase().endsWith('.wav'))
  .sort((left, right) => left.localeCompare(right));

if (wavFiles.length === 0) {
  console.log('No WAV files found in src/audio.');
  process.exit(0);
}

for (const wavFileName of wavFiles) {
  const inputPath = join(audioDir, wavFileName);
  const outputPath = join(audioDir, `${parse(wavFileName).name}.mp3`);
  const result = spawnSync(
    ffmpegPath,
    [
      '-y',
      '-i', inputPath,
      '-vn',
      '-map_metadata', '-1',
      '-codec:a', 'libmp3lame',
      '-q:a', '4',
      outputPath,
    ],
    { stdio: 'inherit' },
  );

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  console.log(`Converted ${wavFileName} -> ${parse(wavFileName).name}.mp3`);
}