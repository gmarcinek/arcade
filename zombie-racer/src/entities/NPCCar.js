import { Car } from '../car/Car.js';

const NPC_WAYPOINT_THRESHOLD = 8;
const NPC_MAX_HP = 600;
const NPC_ATTACK_RANGE = 80;   // m — poniżej tej odległości NPC atakuje gracza
const NPC_BOUNDS = 410;        // poza granicą = wypchnięty = śmierć

export class NPCCar extends Car {
  constructor(waypointRoute, color = 0xcc2200) {
    super({ stats: { engine: 1.2, defence: 0.7, offence: 0.7 } });
    this.waypointRoute = waypointRoute;
    this.waypointIdx = 0;
    this.npcColor = color;
    this.hp = NPC_MAX_HP;
    this.maxHp = NPC_MAX_HP;
    this.onDestroyed = null;
  }

  buildNPC(scene, world, terrain) {
    const spawn = this.waypointRoute[0];
    const hy = terrain.getHeightAt(spawn.x, spawn.z) + 2.5;
    this.build(scene, world, spawn.x, hy, spawn.z, this.npcColor);
  }

  update(terrain, playerPos) {
    if (!this.isAlive || !this.vehicle) return;

    const pos = this.chassisBody.position;

    // Wypchnięcie poza planszę = śmierć
    if (Math.abs(pos.x) > NPC_BOUNDS || Math.abs(pos.z) > NPC_BOUNDS) {
      this.isAlive = false;
      if (typeof this.onDestroy === 'function') this.onDestroy();
      return;
    }

    let targetX, targetZ;

    // Atak gracza jeśli w zasięgu — pełny gaz przy ataku
    let throttle = 0.7;
    if (playerPos) {
      const dpx = playerPos.x - pos.x;
      const dpz = playerPos.z - pos.z;
      const playerDist = Math.sqrt(dpx * dpx + dpz * dpz);
      if (playerDist < NPC_ATTACK_RANGE) {
        targetX = playerPos.x;
        targetZ = playerPos.z;
        throttle = 1.0;
      }
    }

    // Normalny ruch po waypointach
    if (targetX === undefined) {
      const target = this.waypointRoute[this.waypointIdx];
      const dx = target.x - pos.x;
      const dz = target.z - pos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < NPC_WAYPOINT_THRESHOLD) {
        this.waypointIdx = (this.waypointIdx + 1) % this.waypointRoute.length;
      }
      targetX = target.x;
      targetZ = target.z;
    }

    const dx = targetX - pos.x;
    const dz = targetZ - pos.z;
    const targetAngle = Math.atan2(dx, dz);

    const quat = this.chassisBody.quaternion;
    const carYaw = Math.atan2(
      2 * (quat.w * quat.y + quat.x * quat.z),
      1 - 2 * (quat.y * quat.y + quat.z * quat.z)
    );

    let steerAngle = targetAngle - carYaw;
    while (steerAngle >  Math.PI) steerAngle -= Math.PI * 2;
    while (steerAngle < -Math.PI) steerAngle += Math.PI * 2;
    const steer = Math.max(-1, Math.min(1, steerAngle / 0.8));

    this.applyControl(throttle, steer, false);
    this.sync();
  }
}
