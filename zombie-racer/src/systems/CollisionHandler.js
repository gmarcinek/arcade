export class CollisionHandler {
  constructor(world, player, zombies, npcCars, timer, hud, onZombieKill, onCarKill, onCarHit) {
    this.player      = player;
    this.zombies     = zombies;
    this.npcCars     = npcCars;
    this.timer       = timer;
    this.hud         = hud;
    this.onZombieKill = onZombieKill;
    this.onCarKill   = onCarKill;
    this.onCarHit    = onCarHit || (() => {});

    world.addEventListener('beginContact', (event) => {
      this._handleContact(event.bodyA, event.bodyB);
      this._handleContact(event.bodyB, event.bodyA);
    });
  }

  _handleContact(bodyA, bodyB) {
    if (bodyA !== this.player.chassisBody) return;

    // Player hits building
    if (bodyB.userData?.building) {
      const playerSpeed = bodyA.velocity.length();
      if (playerSpeed > 3) {
        const nx = bodyA.position.x - bodyB.position.x;
        const nz = bodyA.position.z - bodyB.position.z;
        const len = Math.sqrt(nx * nx + nz * nz) || 1;
        const contactNormal = { x: nx / len, y: 0, z: nz / len };
        // Pełna energia zderzenia (budynek statyczny = cała prędkość gracza)
        this.player.receiveImpact(playerSpeed * 0.5 * 800, contactNormal);
        const hpLost = Math.round(playerSpeed * 0.5 * 800 * 0.0008 * 100);
        this.hud.showMessage(`🏗️ BUDYNEK -${hpLost} HP`, '#ff6600', 900);
      }
      return;
    }

    // Player hits zombie
    if (bodyB.userData?.zombie) {
      const zombie = bodyB.userData.zombie;
      if (zombie.isAlive) {
        const relVelX = bodyA.velocity.x - bodyB.velocity.x;
        const relVelZ = bodyA.velocity.z - bodyB.velocity.z;
        const relSpeed = Math.sqrt(relVelX * relVelX + relVelZ * relVelZ);
        if (relSpeed > 2) {
          // Zombie: 10x mniej obrażeń gracza niż oryginalne uderzenie NPC
          const nx = bodyA.position.x - bodyB.position.x;
          const nz = bodyA.position.z - bodyB.position.z;
          const len = Math.sqrt(nx * nx + nz * nz) || 1;
          const contactNormal = { x: nx / len, y: 0, z: nz / len };
          this.player.receiveImpact(relSpeed * 0.5 * 80, contactNormal);
          this.onZombieKill(zombie);
        }
      }
      return;
    }

    // Player hits NPC car
    const npc = this.npcCars.find(c => c.chassisBody === bodyB);
    if (npc && npc.isAlive) {
      const relVelX = bodyA.velocity.x - bodyB.velocity.x;
      const relVelZ = bodyA.velocity.z - bodyB.velocity.z;
      const relSpeed = Math.sqrt(relVelX * relVelX + relVelZ * relVelZ);

      if (relSpeed > 1.5) {
        const nx = bodyA.position.x - bodyB.position.x;
        const nz = bodyA.position.z - bodyB.position.z;
        const len = Math.sqrt(nx * nx + nz * nz) || 1;
        const contactNormal = { x: nx / len, y: 0, z: nz / len };

        // Gracz: 50% mniej niż poprzednio (było * 800)
        const impactForce = relSpeed * 0.5;
        this.player.receiveImpact(impactForce * 400, contactNormal);

        // NPC: obrażenia zależne od energii kinetycznej i obrony
        const npcHpBefore = npc.hp;
        const npcDamageHP = (relSpeed * relSpeed * this.player.stats.offence) / (npc.stats.defence * 3);
        npc.hp = Math.max(0, npc.hp - npcDamageHP);
        const actualDamage = Math.floor(npcHpBefore - npc.hp);

        if (npc.hp <= 0 && npc.isAlive) {
          this.onCarKill(npc);
        } else {
          this.onCarHit(actualDamage);
        }

        this.hud.showMessage(`🚗 -${actualDamage} HP`, '#ffcc44', 800);
      }
    }
  }
}
