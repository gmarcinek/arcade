export const PARTS = {
  WHEEL_FL:     'wheelFL',
  WHEEL_FR:     'wheelFR',
  WHEEL_RL:     'wheelRL',
  WHEEL_RR:     'wheelRR',
  BUMPER_FRONT: 'bumperFront',
  BUMPER_REAR:  'bumperRear',
  SIDE_LEFT:    'sideLeft',
  SIDE_RIGHT:   'sideRight',
  ENGINE:       'engine',
};

const CRITICAL_THRESHOLD = 0.6; // 60% damage = critical

export class DamageSystem {
  constructor() {
    this.state = {};
    for (const key of Object.values(PARTS)) {
      this.state[key] = 0; // 0 = intact, 1 = destroyed
    }
  }

  // impactNormalLocal: vector in car local space {x, y, z}
  applyDamage(rawImpact, impactNormalLocal, stats) {
    const mitigated = rawImpact * (2.0 - Math.min(stats.defence, 1.9));

    const nx = impactNormalLocal.x;
    const nz = impactNormalLocal.z;
    const absX = Math.abs(nx);
    const absZ = Math.abs(nz);

    let primaryPart;
    if (absZ > absX) {
      primaryPart = nz > 0 ? PARTS.BUMPER_FRONT : PARTS.BUMPER_REAR;
    } else {
      primaryPart = nx < 0 ? PARTS.SIDE_LEFT : PARTS.SIDE_RIGHT;
    }

    this._damagePart(primaryPart, mitigated * 0.6);
    this._damagePart(PARTS.ENGINE, mitigated * 0.2);

    if (primaryPart === PARTS.BUMPER_FRONT) {
      this._damagePart(PARTS.WHEEL_FL, mitigated * 0.1);
      this._damagePart(PARTS.WHEEL_FR, mitigated * 0.1);
    } else if (primaryPart === PARTS.BUMPER_REAR) {
      this._damagePart(PARTS.WHEEL_RL, mitigated * 0.1);
      this._damagePart(PARTS.WHEEL_RR, mitigated * 0.1);
    } else if (primaryPart === PARTS.SIDE_LEFT) {
      this._damagePart(PARTS.WHEEL_FL, mitigated * 0.1);
      this._damagePart(PARTS.WHEEL_RL, mitigated * 0.1);
    } else {
      this._damagePart(PARTS.WHEEL_FR, mitigated * 0.1);
      this._damagePart(PARTS.WHEEL_RR, mitigated * 0.1);
    }
  }

  _damagePart(part, amount) {
    this.state[part] = Math.min(1, this.state[part] + amount);
  }

  getHandlingModifier() {
    const engineDmg = this.state[PARTS.ENGINE];
    const speedMultiplier = engineDmg > CRITICAL_THRESHOLD
      ? 0.3 + (1 - engineDmg) * 0.7
      : 1.0;

    const avgFrontWheelDmg = (this.state[PARTS.WHEEL_FL] + this.state[PARTS.WHEEL_FR]) / 2;
    const steerMultiplier = avgFrontWheelDmg > CRITICAL_THRESHOLD
      ? 0.4 + (1 - avgFrontWheelDmg) * 0.6
      : 1.0;

    return { speedMultiplier, steerMultiplier };
  }

  getTotalDamagePercent() {
    const values = Object.values(this.state);
    return values.reduce((a, b) => a + b, 0) / values.length;
  }
}
