/** Ensure a JS number serializes as a GLSL float literal (always has a decimal point). */
export const f = n => Number.isInteger(n) ? `${n}.0` : String(n);
