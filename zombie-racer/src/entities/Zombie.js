import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { groundMaterial } from '../physics/PhysicsWorld.js';

const ZOMBIE_SPEED = 1.2;
const WANDER_INTERVAL_MIN = 2000;
const WANDER_INTERVAL_MAX = 5000;

export class Zombie {
  constructor() {
    this.mesh = null;
    this.body = null;
    this.isAlive = true;
    this._groundY = 0;
    this._wanderAngle = Math.random() * Math.PI * 2;
    this._nextWanderTime = Date.now() + Math.random() * 3000;
    this.onKilled = null;
  }

  spawn(scene, world, x, y, z) {
    this.mesh = new THREE.Group();

    const zombieMat = new THREE.MeshLambertMaterial({ color: 0x44aa44 });

    const bodyGeo = new THREE.BoxGeometry(0.5, 0.9, 0.3);
    const bodyMesh = new THREE.Mesh(bodyGeo, zombieMat);
    bodyMesh.position.y = 0;

    const headGeo = new THREE.BoxGeometry(0.35, 0.35, 0.35);
    const headMesh = new THREE.Mesh(headGeo, zombieMat);
    headMesh.position.y = 0.65;

    this.mesh.add(bodyMesh, headMesh);
    this.mesh.position.set(x, y, z);
    this.mesh.castShadow = true;
    scene.add(this.mesh);
    this._groundY = y;

    const shape = new CANNON.Box(new CANNON.Vec3(0.3, 0.9, 0.3));
    this.body = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, material: groundMaterial });
    this.body.addShape(shape);
    this.body.position.set(x, y, z);
    this.body.linearDamping = 0.9;
    this.body.angularDamping = 1.0;
    this.body.collisionResponse = false; // gracz przejedzie przez zombie bez zatrzymania
    this.body.userData = { zombie: this };
    world.addBody(this.body);
  }

  update(dt) {
    if (!this.isAlive) return;

    const now = Date.now();
    if (now >= this._nextWanderTime) {
      this._wanderAngle = Math.random() * Math.PI * 2;
      this._nextWanderTime =
        now + WANDER_INTERVAL_MIN + Math.random() * (WANDER_INTERVAL_MAX - WANDER_INTERVAL_MIN);
    }

    const vx = Math.sin(this._wanderAngle) * ZOMBIE_SPEED;
    const vz = Math.cos(this._wanderAngle) * ZOMBIE_SPEED;
    this.body.velocity.set(vx, 0, vz);
    this.body.position.x += vx * dt;
    this.body.position.z += vz * dt;
    this.body.position.y = this._groundY;

    this.mesh.position.copy(this.body.position);
    this.mesh.rotation.y = this._wanderAngle;
  }

  kill(scene, world) {
    if (!this.isAlive) return;
    this.isAlive = false;
    scene.remove(this.mesh);
    world.removeBody(this.body);
    if (this.onKilled) this.onKilled();
  }
}
