export const vertexShaderSource = `
      varying vec3 vWorld;
      varying vec2 vUv;

      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `;
