/* ==========================================================================
 * 渐变波浪背景（原生 WebGL2）
 * --------------------------------------------------------------------------
 * 用 raymarching 渲染一片流动的渐变波浪，作为首页/模组列表页背景。
 * - 仅首页与模组列表页渲染：切换页面时由 setPage 显式控制启停，
 *   窗口隐藏时由 visibilitychange 暂停
 * - 随主题切换配色：ThemeManager.setTheme 会调用 HomeBackground.setTheme
 * - 无第三方依赖，纯 WebGL2
 * ========================================================================== */
(function () {
  'use strict';

  /* ---- 顶点着色器：全屏三角形 ---- */
  const VERTEX = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}`;

  /* ---- 片段着色器：渐变波浪（raymarching plasma） ---- */
  const FRAGMENT = `#version 300 es
precision highp float;
uniform vec2 iResolution;
uniform float iTime;
uniform float uSpeed;
uniform float uAmplitude;
uniform float uWaveScale;
uniform float uWaveRatio;
uniform float uSwell;
uniform float uTurbulence;
uniform float uTilt;
uniform float uZoom;
uniform float uHeight;
uniform float uFogDepth;
uniform float uSteps;
uniform float uBrightness;
uniform float uOpacity;
uniform float uGrain;
uniform float uGrainIntensity;
uniform vec2 uMouse;
uniform float uParallax;
uniform bool uEnableMouse;
uniform vec3 uHorizonColor;
uniform vec3 uWaveColor;
uniform vec3 uCrestColor;
out vec4 fragColor;

const float MAX_DIST = 20000.0;

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float plasma(vec3 r, vec2 freq, vec4 tc) {
  float mx = r.x + tc.x;
  mx += uSwell * sin((r.y + mx) / 20.0 + tc.y);
  float my = r.y - tc.z;
  my += uTurbulence * cos(r.x / 23.0 + tc.w);
  return r.z - (sin(mx * freq.x) * uAmplitude + sin(my * freq.y) * uAmplitude + uHeight);
}

float raymarch(vec3 pos, vec3 dir, vec2 freq, vec4 tc) {
  float dist = 0.0;
  for (int i = 0; i < 128; i++) {
    if (float(i) >= uSteps) break;
    float dscene = plasma(pos + dist * dir, freq, tc);
    if (abs(dscene) < 0.1) break;
    dist += 0.9 * dscene;
    if (!(abs(dist) < MAX_DIST)) return MAX_DIST;
  }
  return dist;
}

void main() {
  float T = iTime * uSpeed;
  vec2 freq = vec2(uWaveScale / 7.0, (uWaveScale * uWaveRatio) / 3.0);
  vec4 tc = vec4(T / 0.130, T / 0.810, T / 0.200, T / 0.710);
  float c, s;
  float vfov = (3.14159 / 2.3) / max(uZoom, 0.05);
  vec3 cam = vec3(0.0, 0.0, 30.0);
  vec2 uv = (gl_FragCoord.xy / iResolution.xy) - 0.5;
  uv.x *= iResolution.x / iResolution.y;
  uv.y *= -1.0;

  vec3 dir = vec3(0.0, 0.0, -1.0);
  float ulen = length(uv);
  float xrot = vfov * ulen;
  c = cos(xrot); s = sin(xrot);
  dir = mat3(1.0, 0.0, 0.0, 0.0, c, -s, 0.0, s, c) * dir;
  vec2 nuv = ulen > 1e-5 ? uv / ulen : vec2(1.0, 0.0);
  c = nuv.x; s = nuv.y;
  dir = mat3(c, -s, 0.0, s, c, 0.0, 0.0, 0.0, 1.0) * dir;
  c = cos(uTilt); s = sin(uTilt);
  dir = mat3(c, 0.0, s, 0.0, 1.0, 0.0, -s, 0.0, c) * dir;

  if (uEnableMouse) {
    float yaw = (uMouse.x - 0.5) * uParallax * 0.4;
    float pitch = (uMouse.y - 0.5) * uParallax * 0.4;
    c = cos(yaw); s = sin(yaw);
    dir = mat3(c, 0.0, s, 0.0, 1.0, 0.0, -s, 0.0, c) * dir;
    c = cos(pitch); s = sin(pitch);
    dir = mat3(1.0, 0.0, 0.0, 0.0, c, -s, 0.0, s, c) * dir;
  }

  float dist = raymarch(cam, dir, freq, tc);
  vec3 pos = cam + dist * dir;

  float t = clamp(uFogDepth / max(dist, 0.001), 0.0, 1.0);
  vec3 body = mix(uWaveColor, uCrestColor, clamp(pos.z * 0.08 + 0.5, 0.0, 1.0));
  vec3 col = mix(uHorizonColor, body, t);
  col *= uBrightness;
  col = clamp(col, 0.0, 1.0);

  float alpha = clamp(t, 0.0, 1.0) * uOpacity;
  if (uGrain > 0.5) {
    float g = hash21(gl_FragCoord.xy + mod(iTime, 64.0) * 11.0);
    alpha += (g - 0.5) * uGrainIntensity;
  }
  alpha = clamp(alpha, 0.0, 1.0);
  fragColor = vec4(col * alpha, alpha);
}`;

  /* ---- 两套主题配色（暖羊皮纸 / 暗夜森林） ---- */
  const THEMES = {
    default: {
      horizonColor: '#c0ab84', // 远处：米棕（白金）
      waveColor: '#fffdf0',    // 波浪主体：特别白（微暖）
      crestColor: '#ffffff',   // 波峰：纯白
      opacity: 0.6,
      pageBg: '#c0ab84',       // 首页背景：与地平线一致的米棕
      grainIntensity: 0.05,
      fogDepth: 45             // 雾深调大：让白色波浪占据主体，米棕只在远景
    },
    'dark-forest': {
      horizonColor: '#0f1610', // 远处：深墨绿
      waveColor: '#2e5c44',    // 波浪主体：松绿
      crestColor: '#7ab88a',   // 波峰：浅青绿
      opacity: 0.5,
      pageBg: 'transparent',   // 透出 body 深色背景
      grainIntensity: 1.0,     // 噪点拉到最大
      fogDepth: 15             // 保持原雾深
    }
  };

  /* ---- 通用渲染参数（文档默认值） ---- */
  const PARAMS = {
    speed: 0.4,
    amplitude: 2.5,
    breathAmplitude: 0.7,  // 呼吸幅度：波浪起伏的振幅范围
    breathSpeed: 0.52,      // 呼吸频率：约 12 秒一个周期
    waveScale: 0.6,
    waveRatio: 0.9,
    swell: 35,
    turbulence: 20,
    tilt: 0.8,
    zoom: 0.75,
    height: 5.5,
    fogDepth: 15,
    steps: 70.0,
    brightness: 1.0,
    grain: 1.0,
    grainIntensity: 0.05,
    parallax: 0.5,
    mouseInteraction: true
  };

  let host = null;
  let layer = null;
  let canvas = null;
  let gl = null;
  let uniforms = {};
  let initialized = false;
  let pendingTheme = 'default';
  let raf = 0;
  let t0 = 0;
  let isVisible = true;
  let isPageVisible = !document.hidden;
  let ro = null;
  const currentMouse = [0.5, 0.5];
  const targetMouse = [0.5, 0.5];

  function hexToRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!m) return [1, 1, 1];
    return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255];
  }

  function compile(type, source) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, source);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.error('[HomeBackground] 着色器编译失败:', gl.getShaderInfoLog(sh));
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }

  function setupGL() {
    const vs = compile(gl.VERTEX_SHADER, VERTEX);
    const fs = compile(gl.FRAGMENT_SHADER, FRAGMENT);
    if (!vs || !fs) return false;

    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('[HomeBackground] 程序链接失败:', gl.getProgramInfoLog(program));
      return false;
    }
    gl.useProgram(program);

    // 全屏三角形（三个顶点覆盖整个裁剪空间）
    const posLoc = gl.getAttribLocation(program, 'position');
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const names = [
      'iResolution', 'iTime', 'uSpeed', 'uAmplitude', 'uWaveScale', 'uWaveRatio',
      'uSwell', 'uTurbulence', 'uTilt', 'uZoom', 'uHeight', 'uFogDepth', 'uSteps',
      'uBrightness', 'uOpacity', 'uGrain', 'uGrainIntensity', 'uMouse', 'uParallax',
      'uEnableMouse', 'uHorizonColor', 'uWaveColor', 'uCrestColor'
    ];
    uniforms = {};
    names.forEach(n => { uniforms[n] = gl.getUniformLocation(program, n); });

    // 静态参数（一次性设置）
    gl.uniform1f(uniforms.uSpeed, PARAMS.speed);
    gl.uniform1f(uniforms.uAmplitude, PARAMS.amplitude);
    gl.uniform1f(uniforms.uWaveScale, PARAMS.waveScale);
    gl.uniform1f(uniforms.uWaveRatio, PARAMS.waveRatio);
    gl.uniform1f(uniforms.uSwell, PARAMS.swell);
    gl.uniform1f(uniforms.uTurbulence, PARAMS.turbulence);
    gl.uniform1f(uniforms.uTilt, PARAMS.tilt);
    gl.uniform1f(uniforms.uZoom, PARAMS.zoom);
    gl.uniform1f(uniforms.uHeight, PARAMS.height);
    gl.uniform1f(uniforms.uFogDepth, PARAMS.fogDepth);
    gl.uniform1f(uniforms.uSteps, PARAMS.steps);
    gl.uniform1f(uniforms.uBrightness, PARAMS.brightness);
    gl.uniform1f(uniforms.uGrain, PARAMS.grain);
    gl.uniform1f(uniforms.uGrainIntensity, PARAMS.grainIntensity);
    gl.uniform1f(uniforms.uParallax, PARAMS.parallax);
    gl.uniform1i(uniforms.uEnableMouse, PARAMS.mouseInteraction ? 1 : 0);

    return true;
  }

  function resize() {
    if (!gl || !layer) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(layer.clientWidth * dpr));
    const h = Math.max(1, Math.floor(layer.clientHeight * dpr));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(uniforms.iResolution, canvas.width, canvas.height);
  }

  function loop(now) {
    const time = (now - t0) * 0.001;
    gl.uniform1f(uniforms.iTime, time);

    // 呼吸式：波浪幅度随时间缓慢起伏
    const breath = Math.sin(time * PARAMS.breathSpeed);
    gl.uniform1f(uniforms.uAmplitude, PARAMS.amplitude + PARAMS.breathAmplitude * breath);

    // 鼠标视差平滑过渡
    currentMouse[0] += 0.05 * (targetMouse[0] - currentMouse[0]);
    currentMouse[1] += 0.05 * (targetMouse[1] - currentMouse[1]);
    gl.uniform2f(uniforms.uMouse, currentMouse[0], currentMouse[1]);

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    raf = requestAnimationFrame(loop);
  }

  function tryStart() {
    if (isVisible && isPageVisible && raf === 0) {
      raf = requestAnimationFrame(loop);
    }
  }

  function tryStop() {
    if (raf !== 0) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  function onPointerMove(e) {
    const rect = host.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    targetMouse[0] = (e.clientX - rect.left) / rect.width;
    targetMouse[1] = 1.0 - (e.clientY - rect.top) / rect.height;
  }

  function onPointerLeave() {
    targetMouse[0] = 0.5;
    targetMouse[1] = 0.5;
  }

  function onVisibility() {
    isPageVisible = !document.hidden;
    if (isPageVisible) tryStart();
    else tryStop();
  }

  function init() {
    if (initialized) return;
    host = document.getElementById('pageHome');
    if (!host) return;

    // 背景层：绝对定位铺满整个首页，位于内容之下
    layer = document.createElement('div');
    layer.style.cssText = 'position:absolute;inset:0;z-index:-1;overflow:hidden;pointer-events:none;';
    host.insertBefore(layer, host.firstChild);

    canvas = document.createElement('canvas');
    canvas.style.cssText = 'width:100%;height:100%;display:block;pointer-events:none;';
    layer.appendChild(canvas);

    gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false });
    if (!gl) {
      console.warn('[HomeBackground] WebGL2 不可用，跳过首页动效');
      return;
    }

    if (!setupGL()) return;

    initialized = true;
    t0 = performance.now();

    // 应用当前（或待定）主题配色
    setTheme(pendingTheme);
    resize();

    host.addEventListener('pointermove', onPointerMove);
    host.addEventListener('pointerleave', onPointerLeave);
    document.addEventListener('visibilitychange', onVisibility);

    ro = new ResizeObserver(resize);
    ro.observe(layer);

    tryStart();
  }

  function setTheme(name) {
    pendingTheme = name;
    if (!initialized) return;
    const cfg = THEMES[name] || THEMES.default;
    const h = hexToRgb(cfg.horizonColor);
    const w = hexToRgb(cfg.waveColor);
    const c = hexToRgb(cfg.crestColor);
    gl.uniform3f(uniforms.uHorizonColor, h[0], h[1], h[2]);
    gl.uniform3f(uniforms.uWaveColor, w[0], w[1], w[2]);
    gl.uniform3f(uniforms.uCrestColor, c[0], c[1], c[2]);
    gl.uniform1f(uniforms.uOpacity, cfg.opacity);
    gl.uniform1f(uniforms.uGrainIntensity, cfg.grainIntensity != null ? cfg.grainIntensity : PARAMS.grainIntensity);
    gl.uniform1f(uniforms.uFogDepth, cfg.fogDepth != null ? cfg.fogDepth : PARAMS.fogDepth);

    // 首页背景底色调暗（仅羊皮卷用暗色底，暗夜森林透出 body 深色）
    if (layer) {
      layer.style.background = cfg.pageBg || 'transparent';
    }
  }

  function setPage(page) {
    if (!initialized) return;
    const idMap = { home: 'pageHome', modules: 'pageModules' };
    const targetId = idMap[page];
    const newHost = targetId ? document.getElementById(targetId) : null;

    if (newHost === host) return;

    // 解绑旧容器上的鼠标事件
    if (host) {
      host.removeEventListener('pointermove', onPointerMove);
      host.removeEventListener('pointerleave', onPointerLeave);
    }

    host = newHost;

    if (newHost) {
      newHost.insertBefore(layer, newHost.firstChild);
      newHost.addEventListener('pointermove', onPointerMove);
      newHost.addEventListener('pointerleave', onPointerLeave);
      layer.style.display = '';
      resize();
      isVisible = true;   // 显式标记可见，不再依赖 IntersectionObserver
      tryStart();
    } else {
      document.body.appendChild(layer);
      layer.style.display = 'none';
      isVisible = false;  // 显式标记隐藏
      tryStop();
    }
  }

  window.HomeBackground = { init, setTheme, setPage };
})();
