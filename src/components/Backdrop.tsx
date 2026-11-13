"use client";

import { useEffect, useRef } from "react";

const VERTEX = `attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

// Slow smoke in the brand's ember and blue over the void. It is drawn, not a
// photograph, so it is sharp at any size.
const FRAGMENT = `
precision highp float;
uniform vec2 u_size;
uniform float u_time;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 turn = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 6; i++) { v += a * noise(p); p = turn * p * 2.03; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_size;
  vec2 p = (gl_FragCoord.xy - 0.5 * u_size) / u_size.y * 1.9;
  float t = u_time * 0.035;

  vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, 1.3) - t));
  vec2 r = vec2(fbm(p + 3.6 * q + vec2(1.7, 9.2) + 0.6 * t), fbm(p + 3.6 * q + vec2(8.3, 2.8) - 0.5 * t));
  float f = fbm(p + 3.4 * r);

  vec3 voidc = vec3(0.027, 0.043, 0.078);
  vec3 ember = vec3(1.0, 0.416, 0.169);
  vec3 coal = vec3(0.55, 0.13, 0.04);
  vec3 blue = vec3(0.10, 0.36, 0.86);

  // Ember gathers on the left, blue on the right, as in the brand artwork.
  float warm = smoothstep(0.15, 0.95, f * f * 2.6 + r.x * 0.7 - uv.x * 0.75);
  float cool = smoothstep(0.35, 1.05, f * 1.5 + q.y * 0.6 - (1.0 - uv.x) * 0.9);

  vec3 col = voidc;
  col = mix(col, coal, warm * 0.85);
  col = mix(col, ember, pow(warm, 3.0) * smoothstep(0.45, 0.9, r.y + f * 0.4));
  col = mix(col, blue * 0.55, cool * 0.7);
  col += blue * pow(cool, 4.0) * 0.25;

  // Fine veins of light where the smoke folds.
  float vein = smoothstep(0.012, 0.0, abs(f - 0.5) - 0.002) * 0.12;
  col += (ember * warm + blue * cool) * vein;

  float vignette = smoothstep(1.25, 0.25, length(uv - 0.5) * 1.35);
  col *= mix(0.45, 1.0, vignette);
  // A little grain keeps the dark gradients from banding.
  col += (hash(gl_FragCoord.xy + u_time) - 0.5) * 0.012;
  gl_FragColor = vec4(col, 1.0);
}`;

/**
 * The moving backdrop behind the console window. Falls back to the still
 * image underneath it if the browser cannot draw it, holds still for people
 * who have asked for less motion, and stops when the tab is hidden.
 */
export function Backdrop() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    // The console fills a small screen, so nothing would be seen behind it.
    if (!canvas || !window.matchMedia("(min-width: 861px)").matches) return;
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" });
    if (!gl) return;

    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
    };
    const vertex = compile(gl.VERTEX_SHADER, VERTEX);
    const fragment = compile(gl.FRAGMENT_SHADER, FRAGMENT);
    if (!vertex || !fragment) return;
    const program = gl.createProgram()!;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "p");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const uSize = gl.getUniformLocation(program, "u_size");
    const uTime = gl.getUniformLocation(program, "u_time");

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Soft smoke needs no more than this, and it keeps laptops cool.
    const resize = () => {
      const scale = Math.min(window.devicePixelRatio || 1, 2) * 0.6;
      canvas.width = Math.max(1, Math.round(window.innerWidth * scale));
      canvas.height = Math.max(1, Math.round(window.innerHeight * scale));
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    const draw = (seconds: number) => {
      gl.uniform2f(uSize, canvas.width, canvas.height);
      gl.uniform1f(uTime, seconds);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    resize();
    canvas.dataset.ready = "true";
    let frame = 0;
    let last = 0;
    const start = performance.now() - 40_000;
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      if (now - last < 33) return;
      last = now;
      draw((now - start) / 1000);
    };
    const onResize = () => {
      resize();
      if (still) draw(40);
    };
    const onVisibility = () => {
      cancelAnimationFrame(frame);
      if (!document.hidden && !still) frame = requestAnimationFrame(loop);
    };

    if (still) draw(40);
    else frame = requestAnimationFrame(loop);
    addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(frame);
      removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <div className="backdrop" aria-hidden="true">
      <canvas ref={ref} />
    </div>
  );
}
