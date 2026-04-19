import * as THREE from 'three';

function mkCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

// ── Grass ──────────────────────────────────────────────────────────
export function makeGrassTexture() {
  const [c, ctx] = mkCanvas(256, 256);
  ctx.fillStyle = '#4a7a3a';
  ctx.fillRect(0, 0, 256, 256);
  // dirt patches
  for (let i = 0; i < 120; i++) {
    const x = Math.random() * 256, y = Math.random() * 256;
    ctx.fillStyle = `rgba(${80+Math.random()*40},${60+Math.random()*30},20,0.25)`;
    ctx.beginPath();
    ctx.ellipse(x, y, 4+Math.random()*8, 3+Math.random()*5, Math.random()*Math.PI, 0, Math.PI*2);
    ctx.fill();
  }
  // grass blades
  for (let i = 0; i < 700; i++) {
    const x = Math.random() * 256, y = Math.random() * 256;
    const l = 4 + Math.random() * 9;
    ctx.strokeStyle = `hsl(${100+Math.random()*30},${35+Math.random()*30}%,${18+Math.random()*22}%)`;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (Math.random()-0.5)*3, y - l);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(50, 50);
  return t;
}

// ── Asphalt ────────────────────────────────────────────────────────
export function makeAsphaltTexture() {
  const [c, ctx] = mkCanvas(256, 256);
  ctx.fillStyle = '#242430';
  ctx.fillRect(0, 0, 256, 256);
  // gravel noise
  for (let i = 0; i < 500; i++) {
    const x = Math.random()*256, y = Math.random()*256;
    const r = 0.5 + Math.random()*2;
    ctx.fillStyle = `rgba(${55+Math.random()*35},${55+Math.random()*35},${65+Math.random()*25},0.55)`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI*2);
    ctx.fill();
  }
  // subtle cracks
  for (let i = 0; i < 8; i++) {
    ctx.strokeStyle = `rgba(10,10,15,0.4)`;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(Math.random()*256, Math.random()*256);
    ctx.lineTo(Math.random()*256, Math.random()*256);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ── Building textures (5 variants) ────────────────────────────────
export function makeBuildingTextures() {
  const out = [];

  // 0 — glass curtain wall (office)
  {
    const [c, ctx] = mkCanvas(128, 256);
    ctx.fillStyle = '#5577aa';
    ctx.fillRect(0, 0, 128, 256);
    ctx.strokeStyle = '#334466';
    ctx.lineWidth = 2;
    for (let y = 0; y < 256; y += 32) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(128,y); ctx.stroke(); }
    for (let x = 0; x < 128; x += 32) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,256); ctx.stroke(); }
    ctx.fillStyle = 'rgba(160,210,255,0.28)';
    for (let row = 0; row < 8; row++) for (let col = 0; col < 4; col++)
      ctx.fillRect(col*32+3, row*32+3, 26, 26);
    out.push(new THREE.CanvasTexture(c));
  }

  // 1 — pale concrete with windows
  {
    const [c, ctx] = mkCanvas(128, 256);
    ctx.fillStyle = '#9aabb8';
    ctx.fillRect(0, 0, 128, 256);
    ctx.strokeStyle = '#7a8fa0';
    ctx.lineWidth = 1;
    for (let y = 48; y < 256; y += 48) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(128,y); ctx.stroke(); }
    ctx.fillStyle = 'rgba(180,220,245,0.35)';
    for (let row = 0; row < 5; row++) for (let col = 0; col < 3; col++)
      ctx.fillRect(col*42+5, row*48+10, 30, 30);
    out.push(new THREE.CanvasTexture(c));
  }

  // 2 — red brick
  {
    const [c, ctx] = mkCanvas(128, 128);
    ctx.fillStyle = '#c47a44';
    ctx.fillRect(0, 0, 128, 128);
    const bw = 28, bh = 12, gap = 3;
    for (let row = 0; row * (bh+gap) < 140; row++) {
      const off = (row % 2) * (bw/2 + gap/2);
      for (let col = -1; col*(bw+gap) - off < 140; col++) {
        const rx = col*(bw+gap) - off, ry = row*(bh+gap);
        ctx.fillStyle = `hsl(${20+Math.random()*12},${50+Math.random()*20}%,${38+Math.random()*15}%)`;
        ctx.fillRect(rx, ry, bw, bh);
        ctx.strokeStyle = '#8b5530';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(rx, ry, bw, bh);
      }
    }
    out.push(new THREE.CanvasTexture(c));
  }

  // 3 — dark industrial metal panels
  {
    const [c, ctx] = mkCanvas(128, 256);
    ctx.fillStyle = '#3d5060';
    ctx.fillRect(0, 0, 128, 256);
    ctx.strokeStyle = '#2a3a48';
    ctx.lineWidth = 2;
    for (let y = 0; y < 256; y += 24) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(128,y); ctx.stroke(); }
    ctx.fillStyle = '#2e4050';
    for (let row = 0; row < 10; row++) ctx.fillRect(8, row*24+5, 112, 14);
    // rivet dots
    ctx.fillStyle = '#5a7080';
    for (let row = 0; row < 10; row++) for (let x = 14; x < 120; x += 20) {
      ctx.beginPath(); ctx.arc(x, row*24+12, 2, 0, Math.PI*2); ctx.fill();
    }
    out.push(new THREE.CanvasTexture(c));
  }

  // 4 — sandy plaster with small windows
  {
    const [c, ctx] = mkCanvas(128, 256);
    ctx.fillStyle = '#c8b89a';
    ctx.fillRect(0, 0, 128, 256);
    for (let i = 0; i < 400; i++) {
      ctx.fillStyle = `rgba(${100+Math.random()*60},${85+Math.random()*55},${60+Math.random()*45},0.25)`;
      ctx.fillRect(Math.random()*128, Math.random()*256, 1+Math.random()*4, 1+Math.random()*4);
    }
    ctx.fillStyle = 'rgba(160,210,240,0.4)';
    for (let row = 0; row < 6; row++) for (let col = 0; col < 3; col++)
      ctx.fillRect(col*40+7, row*42+9, 24, 24);
    out.push(new THREE.CanvasTexture(c));
  }

  out.forEach(t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; });
  return out;
}

// ── Wheel ──────────────────────────────────────────────────────────
export function makeWheelTexture() {
  const [c, ctx] = mkCanvas(64, 64);
  // tyre
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath(); ctx.arc(32,32,32,0,Math.PI*2); ctx.fill();
  // tread bumps
  ctx.strokeStyle = '#303030';
  ctx.lineWidth = 2;
  for (let a = 0; a < Math.PI*2; a += Math.PI/8) {
    ctx.beginPath();
    ctx.arc(32, 32, 29, a, a + Math.PI/12);
    ctx.stroke();
  }
  // rim
  ctx.fillStyle = '#b0b8cc';
  ctx.beginPath(); ctx.arc(32,32,19,0,Math.PI*2); ctx.fill();
  // spokes
  ctx.strokeStyle = '#8890a8';
  ctx.lineWidth = 3;
  for (let a = 0; a < Math.PI*2; a += Math.PI/3) {
    ctx.beginPath();
    ctx.moveTo(32 + Math.cos(a)*7, 32 + Math.sin(a)*7);
    ctx.lineTo(32 + Math.cos(a)*18, 32 + Math.sin(a)*18);
    ctx.stroke();
  }
  // hub
  ctx.fillStyle = '#444455';
  ctx.beginPath(); ctx.arc(32,32,6,0,Math.PI*2); ctx.fill();
  return new THREE.CanvasTexture(c);
}
