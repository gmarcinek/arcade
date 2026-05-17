import c from './config.js';
import { f } from '../glsl-utils.js';

export const glsl = `
        // Controlled bloom gain.
        col *= (1.0 + uMusicEnergy * uFxEnergy * ${c.bloomGain});
        col += orangeTiles * uLavaColorHot * depthFade * emerge * uOpTilesOrange * ${c.orangeBloom};

        // ===== JUMP WAVES — up to ${c.waveCount} concurrent, each independent =====
        {
          float floorBias = exp(-absAngle * absAngle * 0.5);
          for (int _wi = 0; _wi < ${c.waveCount}; _wi++) {
            float _age   = uJumpWaveAge[_wi];
            float _power = uJumpWavePower[_wi];
            float _front = uJumpWaveS[_wi];
            float _active = step(_age, ${c.maxAge - 0.0001});
            float waveDist  = fragS - _front;
            float waveWidth = ${f(c.widthBase)} + _age * ${f(c.widthRate)};
            float ring      = exp(-waveDist * waveDist / (waveWidth * waveWidth));
            float ageFade   = max(0.0, 1.0 - _age / ${f(c.maxAge)});
            float waveMask  = ring * ageFade * (0.40 + 0.60 * floorBias) * _active * _power;
            col += waveMask * uElectricBlue * uJumpWaveGlowBlue;
            col += waveMask * vec3(0.88, 0.96, 1.00) * uJumpWaveGlowWhite * floorBias;
          }
        }

        // Slight blue/orange contrast shaping.
        col = mix(col, col * vec3(1.08, 0.94, 0.86), saturate(uBass * ${c.bassWarm}));
        col = mix(col, col + uElectricBlue * 0.10,   saturate(uTreble * ${c.trebleBlue}));
`;
