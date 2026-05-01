import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Car } from '../car/Car.js';
import { carBodyMaterial } from '../physics/PhysicsWorld.js';
import { CHASSIS_COM_OFFSET_X, CHASSIS_COM_OFFSET_Y, CHASSIS_COM_OFFSET_Z, CAR_MASS } from '../physicsConfig.js';

// Stałe geometrii kół (zgodne z physicsConfig.js)
const W_R  = 0.35;  // WHEEL_RADIUS
const W_X  = 0.9;   // WHEEL_POS_X
const W_ZF = 1.45;  // WHEEL_POS_Z_FRONT
const W_ZR = 1.40;  // WHEEL_POS_Z_REAR

/** Buduje wizualną grupę auta (bez fizyki) — klon GLTF lub fallback box. */
function buildCarVisual(color) {
  const group  = new THREE.Group();

  const paintMat = new THREE.MeshPhysicalMaterial({
    color,
    metalness: 0.55,
    roughness: 0.26,
    clearcoat: 1.0,
    clearcoatRoughness: 0.07,
  });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x6688aa,
    metalness: 0.0,
    roughness: 0.05,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
  });
  const hlMat = new THREE.MeshStandardMaterial({
    color: 0xfff8e0,
    emissive: new THREE.Color(0xffeeaa),
    emissiveIntensity: 2.0,
    roughness: 0.05,
  });
  const tlMat = new THREE.MeshStandardMaterial({
    color: 0xff0800,
    emissive: new THREE.Color(0xff0000),
    emissiveIntensity: 1.8,
    roughness: 0.10,
    transparent: true,
    opacity: 0.90,
  });

  const chassis = new THREE.Group();

  if (Car.suvGltf) {
    const src = Car.suvGltf.scene.getObjectByName('SUV_Cube');
    if (src) {
      const body = src.clone(true);
      body.traverse(child => {
        if (!child.isMesh) return;
        child.castShadow = true;
        child.receiveShadow = true;
        const wasArray = Array.isArray(child.material);
        const mats = wasArray ? child.material : [child.material];
        const newMats = mats.map(m => {
          if (m.name === 'White')      return paintMat;
          if (m.name === 'Windows')    return glassMat;
          if (m.name === 'Headlights') return hlMat;
          if (m.name === 'TailLights') return tlMat;
          return m;
        });
        child.material = wasArray ? newMats : newMats[0];
      });
      body.position.y = -0.745;
      chassis.add(body);
    }
  } else {
    // Fallback: nadwozie + kabina
    const base  = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.6, 4.3), paintMat);
    base.position.y = 0.3;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.55, 2.2), paintMat);
    cabin.position.set(0, 0.88, -0.1);
    chassis.add(base, cabin);
  }

  group.add(chassis);

  // Koła
  const tireMat   = new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.95 });
  const rimMat    = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.14, metalness: 0.98 });
  const tireGeo   = new THREE.CylinderGeometry(W_R, W_R, 0.26, 16);
  tireGeo.rotateZ(Math.PI / 2);
  const rimGeo    = new THREE.CylinderGeometry(W_R * 0.62, W_R * 0.62, 0.28, 5);
  rimGeo.rotateZ(Math.PI / 2);

  const wheelPositions = [
    [-W_X,  0,  W_ZF],
    [ W_X,  0,  W_ZF],
    [-W_X,  0, -W_ZR],
    [ W_X,  0, -W_ZR],
  ];
  const wheelGroups = [];
  for (const [wx, wy, wz] of wheelPositions) {
    const wg = new THREE.Group();
    wg.add(
      new THREE.Mesh(tireGeo, tireMat),
      new THREE.Mesh(rimGeo,  rimMat),
    );
    wg.position.set(wx, wy, wz);
    group.add(wg);
    wheelGroups.push(wg);
  }

  return { group, paintMat, wheelGroups };
}

/** Buduje prosty wskaźnik zombie (zielona figura). */
function buildZombieMarker() {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0x44aa44 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.3), mat);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.35), mat);
  head.position.y = 0.65;
  g.add(body, head);
  return g;
}

/**
 * RemotePlayers — renderuje auta innych graczy i ich zombie w scenie.
 * Używa prawdziwego modelu auta (Car.suvGltf lub fallback).
 * Interpoluje do ostatniej odebranej pozycji (~50ms paczki).
 */
export class RemotePlayers {
  constructor(scene, world, terrain = null) {
    this._scene   = scene;
    this._world   = world;
    this._terrain = terrain;
    this._entries = new Map(); // socketId → Entry

    /** @type {(id:string, ip:string, pos:THREE.Vector3) => void} */
    this.onPlayerDied = null;
    /** @type {(x:number, y:number, z:number, type:string) => void} */
    this.onSmoke = null;
    /** @type {(id:string, prevHp:number, newHp:number) => void} — wykrywa nieautomatyczny damage */
    this.onHpDrop = null;
  }

  /** Zwraca Map<CANNON.Body, socketId> dla CollisionHandler. */
  getBodyMap() {
    const m = new Map();
    for (const [id, e] of this._entries) {
      if (e.phyBody) m.set(e.phyBody, id);
    }
    return m;
  }

  /** Dodaj nowego gracza (po połączeniu lub z danych init). */
  add(id, ip, initData = {}) {
    if (this._entries.has(id)) {
      // Aktualizuj dane jeśli już istnieje
      const e = this._entries.get(id);
      if (initData.color !== undefined) {
        e.paintMat.color.set(initData.color);
      }
      return;
    }

    const color = initData.color ?? _pickColor(id);
    const { group, paintMat, wheelGroups } = buildCarVisual(color);

    // Etykieta IP nad autem
    const canvas  = document.createElement('canvas');
    canvas.width  = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    ctx.roundRect(4, 4, 248, 56, 8);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ip, 128, 28);

    const tex    = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
    sprite.scale.set(3.2, 0.8, 1);
    sprite.position.y = 3.2;
    group.add(sprite);

    // Pasek HP (sprite nad autem)
    const hpCanvas  = document.createElement('canvas');
    hpCanvas.width  = 128; hpCanvas.height = 14;
    const hpCtx = hpCanvas.getContext('2d');
    const hpTex    = new THREE.CanvasTexture(hpCanvas);
    const hpSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: hpTex, depthTest: false }));
    hpSprite.scale.set(2.4, 0.28, 1);
    hpSprite.position.y = 2.6;
    group.add(hpSprite);

    this._scene.add(group);

    // ── Ciało fizyczne (DYNAMIC, ta sama masa co gracz) — cannon-es oblicza 2-ciałowy impuls
    // Collision filter: tylko z gracza (group 2). Nie koliduje z NPC, budynkami, innymi remote.
    const phyBody = new CANNON.Body({
      mass:     CAR_MASS,
      material: carBodyMaterial,
      collisionFilterGroup: 8, // remote players group
      collisionFilterMask:  2, // only collide with player (group 2)
    });
    // Bryła kolizji identyczna jak chassisBody gracza (Car.js) — 3 warstwy
    const _com = new CANNON.Vec3(CHASSIS_COM_OFFSET_X, CHASSIS_COM_OFFSET_Y, CHASSIS_COM_OFFSET_Z);
    phyBody.addShape(new CANNON.Box(new CANNON.Vec3(1.15, 0.22, 2.35)), new CANNON.Vec3(_com.x, _com.y - 0.18, _com.z));
    phyBody.addShape(new CANNON.Box(new CANNON.Vec3(0.85, 0.40, 1.15)), new CANNON.Vec3(_com.x, _com.y + 0.42, _com.z + 0.12));
    phyBody.addShape(new CANNON.Box(new CANNON.Vec3(0.75, 0.12, 1.0)),  new CANNON.Vec3(_com.x, _com.y + 0.90, _com.z + 0.08));
    phyBody.linearDamping  = 0; // reset w każdej klatce — tłumienie zbędne
    phyBody.angularDamping = 0;
    phyBody.allowSleep = false; // musi reagować na kolizje każdą klatkę
    // CCD — lokalny gracz nie przeleci przez remote przy dużej prędkości
    phyBody.ccdSpeedThreshold = 0.1;
    phyBody.ccdIterations     = 10;
    // Ustaw pod ziemią — brak prawdziwej pozycji przed pierwszym updateState().
    // Zapobiega kolizjom z graczem zanim ciało zostanie ustawione na właściwym miejscu.
    phyBody.position.set(0, -1000, 0);
    this._world.addBody(phyBody);

    this._entries.set(id, {
      group, paintMat, wheelGroups,
      hpCanvas, hpCtx, hpTex, hpSprite,
      phyBody,
      ip,
      curPos:     new THREE.Vector3(),
      curQuat:    new THREE.Quaternion(),
      tgtPos:     new THREE.Vector3(),
      tgtQuat:    new THREE.Quaternion(),
      tgtVel:     new THREE.Vector3(),
      wheelRoll:  0,  // kumulowany kąt toczenia [rad]
      ready:      false,
      hp: 100, maxHp: 100,
      smokeTimer: 0,
    });
  }

  remove(id) {
    const e = this._entries.get(id);
    if (!e) return;
    this._scene.remove(e.group);
    e.group.traverse((obj) => {
      if (obj.isMesh) { obj.geometry?.dispose(); obj.material?.dispose(); }
      if (obj.isSprite) obj.material?.map?.dispose();
    });
    if (e.phyBody) this._world.removeBody(e.phyBody);
    this._entries.delete(id);
  }

  /** Jak remove(), ale wcześniej odpala onPlayerDied (eksplozja / disconnect). */
  removeWithDeath(id) {
    const e = this._entries.get(id);
    if (e && this.onPlayerDied) {
      this.onPlayerDied(id, e.ip, e.curPos.clone());
    }
    this.remove(id);
  }

  /**
   * Aktualizuj stan graczy (zombie zarządzane w main.js).
   * @param {Object} players  - {[id]: {x,y,z,qx,qy,qz,qw,vx,vy,vz,hp,maxHp,dmg,color}}
   * @param {string} myId     - własny socketId (pomijamy)
   */
  updateState(players, myId) {
    // Usuń duchy — wpisy których serwer już nie zawiera w pełnej liście (restart, rozłączenie)
    for (const id of [...this._entries.keys()]) {
      if (!(id in players)) this.remove(id);
    }

    for (const [id, d] of Object.entries(players)) {
      if (id === myId) continue;

      // Auto-create entry jeśli gracz dołączył zanim remotePlayers istniał
      if (!this._entries.has(id)) {
        this.add(id, d.ip ?? id, { color: d.color });
      }

      const e = this._entries.get(id);
      if (!e) continue;

      if (d.color !== undefined && e.paintMat.color.getHex() !== d.color) {
        e.paintMat.color.set(d.color);
      }

      e.tgtPos.set(d.x, d.y, d.z);
      e.tgtQuat.set(d.qx, d.qy, d.qz, d.qw);
      if (!e.ready) {
        e.curPos.copy(e.tgtPos);
        e.curQuat.copy(e.tgtQuat);
        e.group.position.copy(e.curPos);
        e.group.quaternion.copy(e.curQuat);
        // Snapshotuj ciało fizyczne bezpośrednio — bez tego przez jedną klatkę
        // prędkość korekcji byłaby (cel - (-1000)) * 30 = ogromny impuls.
        if (e.phyBody) {
          e.phyBody.position.set(e.curPos.x, e.curPos.y, e.curPos.z);
          e.phyBody.velocity.set(0, 0, 0);
          e.phyBody.quaternion.set(e.curQuat.x, e.curQuat.y, e.curQuat.z, e.curQuat.w);
        }
        e.ready = true;
      }

      const prevHp = e.hp;
      e.hp    = d.hp    ?? 100;
      e.maxHp = d.maxHp ?? 100;
      _drawHpBar(e.hpCtx, e.hpCanvas, e.hp, e.maxHp);
      e.hpTex.needsUpdate = true;

      // Powiadom o spadku HP (do śledzenia last-hitter)
      if (prevHp > e.hp && this.onHpDrop) {
        this.onHpDrop(id, prevHp, e.hp);
      }

      // Wykryj śmierć zdalnego gracza
      if (prevHp > 0 && e.hp <= 0 && this.onPlayerDied) {
        this.onPlayerDied(id, e.ip, e.curPos.clone());
      }

      e.tgtVel.set(d.vx ?? 0, d.vy ?? 0, d.vz ?? 0);
    }
  }

  /** Wywołaj raz na klatkę w game loop. */
  update(dt) {
    const alpha = Math.min(1, dt * 18);
    for (const e of this._entries.values()) {
      if (!e.ready) continue;
      e.curPos.lerp(e.tgtPos, alpha);
      e.curQuat.slerp(e.tgtQuat, alpha);

      // Napędzaj ciało ku pozycji serwerowej przez prędkość (nie teleport).
      // Gdy ciało jest w KONTAKCIE z graczem — cannon-es sam liczy impuls 2-ciałowy
      // (równa masa, poprawny transfer pędu, punkt styku). Nie ingerujemy.
      // Gdy brak kontaktu — kierujemy prędkością ku pozycji serwerowej.
      if (e.phyBody) {
        const inContact = _isBodyInContact(this._world, e.phyBody);
        if (!inContact) {
          const p = e.phyBody.position;
          e.phyBody.velocity.set(
            e.tgtVel.x + (e.curPos.x - p.x) * 30,
            e.tgtVel.y + (e.curPos.y - p.y) * 60,
            e.tgtVel.z + (e.curPos.z - p.z) * 30
          );
          e.phyBody.angularVelocity.set(0, 0, 0);
          e.phyBody.wakeUp();
        }
        // Orientacja zawsze z serwera
        e.phyBody.quaternion.set(e.curQuat.x, e.curQuat.y, e.curQuat.z, e.curQuat.w);
      }

      // ── Dym uszkodzenia — proporcjonalny do utraty HP (jak u gracza lokalnego) ──────
      // smokeLevel: 0 = brak dymu, 0.45 = biały, 0.62 = czarny, 0.78 = ogień
      if (this.onSmoke && e.maxHp > 0) {
        const smokeLevel = 1 - Math.max(0, e.hp) / e.maxHp;
        if (smokeLevel > 0.45) {
          e.smokeTimer += dt;
          let smokeType, interval;
          if (smokeLevel >= 0.78) {
            smokeType = Math.random() > 0.45 ? 'fire' : 'black';
            interval  = 0.04;
          } else if (smokeLevel >= 0.62) {
            smokeType = 'black';
            interval  = 0.10;
          } else {
            smokeType = 'white';
            interval  = 0.20;
          }
          if (e.smokeTimer >= interval) {
            e.smokeTimer = 0;
            const p = e.group.position;
            // Dym z maski — przód auta w world space (offset Z=1.55 w układzie lokalnym)
            const fwd = new THREE.Vector3(0, 0.5, 1.55).applyQuaternion(e.curQuat);
            this.onSmoke(p.x + fwd.x, p.y + fwd.y, p.z + fwd.z, smokeType);
          }
        } else {
          e.smokeTimer = 0;
        }
      }

      // Wizualizacja śledzi ciało fizyczne — widać efekt pchnięcia podczas zderzenia
      const vPos = e.phyBody ? e.phyBody.position : e.curPos;
      e.group.position.set(vPos.x, vPos.y, vPos.z);
      e.group.quaternion.copy(e.curQuat);

      // ── Koła: toczenie + skręt ────────────────────────────────
      const speed = e.tgtVel.length();
      e.wheelRoll += (speed / W_R) * dt;

      let steer = 0;
      if (speed > 0.5) {
        const invQ     = e.curQuat.clone().invert();
        const velWorld = e.tgtVel.clone().normalize();
        const velLocal = velWorld.applyQuaternion(invQ);
        steer = Math.atan2(-velLocal.x, -velLocal.z);
        steer = Math.max(-0.55, Math.min(0.55, steer));
      }

      const T = this._terrain;
      for (let i = 0; i < e.wheelGroups.length; i++) {
        const wg   = e.wheelGroups[i];
        const wPos = wg.position.clone();
        const wx = vPos.x + wPos.x * (e.curQuat.w < 0 ? -1 : 1);
        const wz = vPos.z + wPos.z;
        const terrainY = T ? T.getHeightAt(wx, wz) : vPos.y;
        const suspension = terrainY - vPos.y + W_R;
        wg.position.y = Math.max(-0.25, Math.min(0.25, suspension - 0.45));
        wg.rotation.x = e.wheelRoll;
        if (i < 2) wg.rotation.y = steer;
      }
    }
  }

  dispose() {
    for (const id of [...this._entries.keys()]) this.remove(id);
  }
}

// ── Helpers ──────────────────────────────────────────────────────

/** Czy ciało uczestniczy w aktywnym kontakcie (world.contacts po world.step). */
function _isBodyInContact(world, body) {
  for (const c of world.contacts) {
    if (c.bi === body || c.bj === body) return true;
  }
  return false;
}

const _COLORS = [
  0xff4400, 0x0088ff, 0xffcc00, 0xcc00ff,
  0x00ffcc, 0xff0088, 0x88ff00, 0xff8800,
];
const _colorMap = new Map();
let _colorIdx = 0;
function _pickColor(id) {
  if (!_colorMap.has(id)) _colorMap.set(id, _COLORS[_colorIdx++ % _COLORS.length]);
  return _colorMap.get(id);
}

function _drawHpBar(ctx, canvas, hp, maxHp) {
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  // Tło
  ctx.fillStyle = '#333';
  ctx.fillRect(2, 2, W - 4, H - 4);
  // Pasek HP
  const ratio = Math.max(0, Math.min(1, hp / (maxHp || 100)));
  const hue   = ratio * 120; // zielony → czerwony
  ctx.fillStyle = `hsl(${hue},90%,50%)`;
  ctx.fillRect(2, 2, (W - 4) * ratio, H - 4);
}

