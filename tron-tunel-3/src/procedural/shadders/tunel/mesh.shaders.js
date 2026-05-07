import { vertexShaderSource } from './mesh.shaders.vertex.js';
import { uniformsGlsl }       from './mesh.shaders.uniforms.glsl.js';
import { helpersGlsl }        from './mesh.shaders.helpers.glsl.js';
import { layersGlsl }         from './mesh.shaders.layers.glsl.js';
import { silenceGlsl }        from './mesh.shaders.silence.glsl.js';
import { postGlsl }           from './mesh.shaders.post.glsl.js';

export const vertexShader = vertexShaderSource;

export const fragmentShader = /* glsl */`
${uniformsGlsl}
${helpersGlsl}
${layersGlsl}
${silenceGlsl}
${postGlsl}
`;
