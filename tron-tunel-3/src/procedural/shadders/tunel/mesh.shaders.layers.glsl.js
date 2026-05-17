import { glsl as preamble     } from './layers/_preamble/glsl.js';
import { glsl as bgFlares     } from './layers/bg-flares/glsl.js';
import { glsl as lava         } from './layers/lava/glsl.js';
import { glsl as waveform     } from './layers/waveform/glsl.js';
import { glsl as longBands    } from './layers/long-bands/glsl.js';
import { glsl as twistBands   } from './layers/twist-bands/glsl.js';
import { glsl as grid         } from './layers/grid/glsl.js';
import { glsl as strips       } from './layers/strips/glsl.js';
import { glsl as tilesOrange  } from './layers/tiles-orange/glsl.js';
import { glsl as tilesBlue    } from './layers/tiles-blue/glsl.js';
import { glsl as chevrons     } from './layers/chevrons/glsl.js';
import { glsl as floorEdge    } from './layers/floor-edge/glsl.js';
import { glsl as frontPalette } from './layers/front-palette/glsl.js';
import { glsl as contact      } from './layers/contact/glsl.js';
import { glsl as postamble    } from './layers/_postamble/glsl.js';

export const layersGlsl = [
  preamble,
  bgFlares,
  lava,
  waveform,
  longBands,
  twistBands,
  grid,
  strips,
  tilesOrange,
  tilesBlue,
  chevrons,
  floorEdge,
  frontPalette,
  contact,
  postamble,
].join('\n');
