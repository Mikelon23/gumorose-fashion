/**
 * Ruta WebGL (webgl2/webgl) con shaders GLSL de tejido: difuso +
 * especular satinado por mapa de brillo. Si el contexto no existe
 * (jsdom, GPU bloqueada), devuelve null y manda el fallback software.
 */
import type { AtlasTexture } from './UvTextureComposer';
import {
  MANNEQUIN_ALABASTER_RGB,
  cameraFocusOffset,
  clampCamera,
  degToRad,
  type CameraState,
  type LightPreset,
  type MeshData,
} from './types3d';
import type { SceneMesh } from './SoftwareRenderer3D';

const VERT = `
attribute vec3 aPos; attribute vec3 aNorm; attribute vec2 aUv;
uniform mat4 uMvp; uniform mat4 uModel;
varying vec3 vNorm; varying vec2 vUv; varying vec3 vWorld;
void main() {
  vec4 world = uModel * vec4(aPos, 1.0);
  vWorld = world.xyz;
  vNorm = mat3(uModel) * aNorm;
  vUv = aUv;
  gl_Position = uMvp * vec4(aPos, 1.0);
}`;

const FRAG = `
precision mediump float;
varying vec3 vNorm; varying vec2 vUv; varying vec3 vWorld;
uniform sampler2D uTex; uniform sampler2D uGloss;
uniform vec3 uLightDir; uniform vec3 uTint; uniform float uAmbient; uniform float uIntensity;
uniform vec3 uBase; uniform float uUseTex; uniform vec3 uBg;
void main() {
  vec3 n = normalize(vNorm);
  if (!gl_FrontFacing) n = -n;
  vec4 tex = texture2D(uTex, vUv);
  vec3 base = mix(uBase, tex.rgb, uUseTex);
  float diff = max(dot(n, uLightDir), 0.0);
  float shade = uAmbient + diff * uIntensity * (1.0 - uAmbient);
  vec3 viewDir = vec3(0.0, 0.0, 1.0);
  vec3 hv = normalize(uLightDir + viewDir);
  float gloss = texture2D(uGloss, vUv).r;
  float spec = pow(max(dot(n, hv), 0.0), 42.0) * (0.08 + gloss * 0.85) * uUseTex;
  vec3 col = base * shade * uTint + spec;
  gl_FragColor = vec4(col, 1.0);
}`;

function mat4Identity(): Float32Array {
  return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
}
function mat4Multiply(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c += 1) for (let r = 0; r < 4; r += 1) {
    out[c * 4 + r] = a[r]! * b[c * 4]! + a[4 + r]! * b[c * 4 + 1]! + a[8 + r]! * b[c * 4 + 2]! + a[12 + r]! * b[c * 4 + 3]!;
  }
  return out;
}
function mat4RotY(deg: number): Float32Array {
  const r = degToRad(deg); const c = Math.cos(r); const s = Math.sin(r);
  return new Float32Array([c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1]);
}
function mat4RotX(deg: number): Float32Array {
  const r = degToRad(deg); const c = Math.cos(r); const s = Math.sin(r);
  return new Float32Array([1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1]);
}
function mat4ScaleTranslate(sx: number, sy: number, sz: number, tx: number, ty: number, tz: number): Float32Array {
  return new Float32Array([sx,0,0,0, 0,sy,0,0, 0,0,sz,0, tx,ty,tz,1]);
}
function mat4Perspective(fovDeg: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan(degToRad(fovDeg) / 2);
  const nf = 1 / (near - far);
  return new Float32Array([f / aspect,0,0,0, 0,f,0,0, 0,0,(far + near) * nf,-1, 0,0,2 * far * near * nf,0]);
}

export interface GLRenderer {
  draw: (meshes: SceneMesh[], camera: CameraState, light: LightPreset) => void;
  dispose: () => void;
}

export function tryCreateGLRenderer(canvas: HTMLCanvasElement): GLRenderer | null {
  try {
    const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) return null;
    const compile = (type: number, src: string): WebGLShader | null => {
      const sh = gl.createShader(type);
      if (!sh) return null;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) return null;
      return sh;
    };
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return null;
    const prog = gl.createProgram();
    if (!prog) return null;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    gl.useProgram(prog);
    gl.enable(gl.DEPTH_TEST);

    const loc = {
      aPos: gl.getAttribLocation(prog, 'aPos'),
      aNorm: gl.getAttribLocation(prog, 'aNorm'),
      aUv: gl.getAttribLocation(prog, 'aUv'),
      uMvp: gl.getUniformLocation(prog, 'uMvp'),
      uModel: gl.getUniformLocation(prog, 'uModel'),
      uTex: gl.getUniformLocation(prog, 'uTex'),
      uGloss: gl.getUniformLocation(prog, 'uGloss'),
      uLightDir: gl.getUniformLocation(prog, 'uLightDir'),
      uTint: gl.getUniformLocation(prog, 'uTint'),
      uAmbient: gl.getUniformLocation(prog, 'uAmbient'),
      uIntensity: gl.getUniformLocation(prog, 'uIntensity'),
      uBase: gl.getUniformLocation(prog, 'uBase'),
      uUseTex: gl.getUniformLocation(prog, 'uUseTex'),
    };

    const meshCache = new Map<MeshData, { pos: WebGLBuffer; norm: WebGLBuffer; uv: WebGLBuffer; idx: WebGLBuffer; count: number }>();
    const texCache = new Map<AtlasTexture, { color: WebGLTexture; gloss: WebGLTexture }>();

    function buffer(data: Float32Array | Uint32Array, target: number): WebGLBuffer {
      const buf = gl!.createBuffer()!;
      gl!.bindBuffer(target, buf);
      gl!.bufferData(target, data as unknown as BufferSource, gl!.STATIC_DRAW);
      return buf;
    }
    function uploadMesh(mesh: MeshData) {
      let entry = meshCache.get(mesh);
      if (entry) return entry;
      entry = {
        pos: buffer(mesh.positions, gl!.ARRAY_BUFFER),
        norm: buffer(mesh.normals, gl!.ARRAY_BUFFER),
        uv: buffer(mesh.uvs, gl!.ARRAY_BUFFER),
        idx: buffer(mesh.indices, gl!.ELEMENT_ARRAY_BUFFER),
        count: mesh.indices.length,
      };
      meshCache.set(mesh, entry);
      return entry;
    }
    function uploadTexture(tex: AtlasTexture) {
      let entry = texCache.get(tex);
      if (entry) return entry;
      const make = (pixels: Uint8Array, format: number) => {
        const t = gl!.createTexture()!;
        gl!.bindTexture(gl!.TEXTURE_2D, t);
        gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
        gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
        gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR);
        gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR);
        gl!.texImage2D(gl!.TEXTURE_2D, 0, format, tex.width, tex.height, 0, format, gl!.UNSIGNED_BYTE, pixels);
        return t;
      };
      const glossPixels = new Uint8Array(tex.width * tex.height * 4);
      for (let i = 0; i < tex.gloss.length; i += 1) {
        glossPixels[i * 4] = tex.gloss[i]!;
        glossPixels[i * 4 + 3] = 255;
      }
      entry = { color: make(tex.data as unknown as Uint8Array, gl!.RGBA), gloss: make(glossPixels, gl!.RGBA) };
      texCache.set(tex, entry);
      return entry;
    }

    return {
      draw(meshes, camera, light) {
        const w = canvas.width;
        const h = canvas.height;
        gl.viewport(0, 0, w, h);
        gl.clearColor(light.background[0] / 255, light.background[1] / 255, light.background[2] / 255, 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const item of meshes) {
          const b = item.mesh.bounds;
          const t = item.transform ?? {};
          minX = Math.min(minX, b[0] * (t.sx ?? 1) + (t.tx ?? 0));
          maxX = Math.max(maxX, b[3] * (t.sx ?? 1) + (t.tx ?? 0));
          minY = Math.min(minY, b[1] * (t.sy ?? 1) + (t.ty ?? 0));
          maxY = Math.max(maxY, b[4] * (t.sy ?? 1) + (t.ty ?? 0));
        }
        if (!Number.isFinite(minX)) return;
        const safeCamera = clampCamera(camera);
        const worldW = Math.max(0.001, maxX - minX);
        const worldH = Math.max(0.001, maxY - minY);
        const [focusX, focusY] = cameraFocusOffset(safeCamera.focus, safeCamera.zoom);
        const cx = (minX + maxX) / 2 + ((safeCamera.panX ?? 0) + focusX) * worldW;
        const cy = (minY + maxY) / 2 + ((safeCamera.panY ?? 0) + focusY) * worldH;
        const dist = (worldH * 1.9) / Math.max(0.4, safeCamera.zoom);
        const proj = mat4Perspective(38, w / h, 0.1, 100);
        const view = mat4ScaleTranslate(1, 1, 1, -cx, -cy, -dist - 1.6);
        const rot = mat4Multiply(mat4RotY(safeCamera.yawDeg), mat4RotX(safeCamera.pitchDeg));
        const vp = mat4Multiply(proj, mat4Multiply(view, rot));
        const toLight: [number, number, number] = [-light.dir[0], -light.dir[1], -light.dir[2]];
        gl.uniform3f(loc.uLightDir, toLight[0], toLight[1], toLight[2]);
        gl.uniform3f(loc.uTint, light.tint[0], light.tint[1], light.tint[2]);
        gl.uniform1f(loc.uAmbient, light.ambient);
        gl.uniform1f(loc.uIntensity, light.intensity);

        for (const item of meshes) {
          const entry = uploadMesh(item.mesh);
          const t = item.transform ?? {};
          const model = mat4ScaleTranslate(t.sx ?? 1, t.sy ?? 1, t.sz ?? 1, t.tx ?? 0, t.ty ?? 0, t.tz ?? 0);
          gl.uniformMatrix4fv(loc.uModel, false, model);
          gl.uniformMatrix4fv(loc.uMvp, false, mat4Multiply(vp, model));
          gl.bindBuffer(gl.ARRAY_BUFFER, entry.pos);
          gl.enableVertexAttribArray(loc.aPos);
          gl.vertexAttribPointer(loc.aPos, 3, gl.FLOAT, false, 0, 0);
          gl.bindBuffer(gl.ARRAY_BUFFER, entry.norm);
          gl.enableVertexAttribArray(loc.aNorm);
          gl.vertexAttribPointer(loc.aNorm, 3, gl.FLOAT, false, 0, 0);
          gl.bindBuffer(gl.ARRAY_BUFFER, entry.uv);
          gl.enableVertexAttribArray(loc.aUv);
          gl.vertexAttribPointer(loc.aUv, 2, gl.FLOAT, false, 0, 0);
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, entry.idx);
          if (item.texture) {
            const tex = uploadTexture(item.texture);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, tex.color);
            gl.uniform1i(loc.uTex, 0);
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, tex.gloss);
            gl.uniform1i(loc.uGloss, 1);
            gl.uniform1f(loc.uUseTex, 1);
          } else {
            gl.uniform1f(loc.uUseTex, 0);
            const tint = item.skinTint ?? MANNEQUIN_ALABASTER_RGB;
            gl.uniform3f(loc.uBase, tint[0], tint[1], tint[2]);
          }
          const indexType =
            typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext
              ? gl.UNSIGNED_INT
              : gl.UNSIGNED_SHORT;
          gl.drawElements(gl.TRIANGLES, entry.count, indexType, 0);
        }
      },
      dispose() {
        meshCache.clear();
        texCache.clear();
      },
    };
  } catch {
    return null;
  }
}
