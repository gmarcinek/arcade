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

  // Globalny mnożnik silnika (degradacja z uszkodzenia ENGINE).
  getEngineMultiplier() {
    return 1.0 - this.state[PARTS.ENGINE] * 0.70;
  }

  // Per-wheel modifiers — każde koło psuje się niezależnie.
  // Zwraca tablicę [FL, FR, RL, RR] z obiektami { tractionMult, steerMult, brakeMult }.
  getWheelModifiers() {
    const fl = this.state[PARTS.WHEEL_FL];
    const fr = this.state[PARTS.WHEEL_FR];
    const rl = this.state[PARTS.WHEEL_RL];
    const rr = this.state[PARTS.WHEEL_RR];
    return [
      { tractionMult: 1.0 - fl * 0.65, steerMult: 1.0 - fl * 0.60, brakeMult: 1.0 - fl * 0.50 },
      { tractionMult: 1.0 - fr * 0.65, steerMult: 1.0 - fr * 0.60, brakeMult: 1.0 - fr * 0.50 },
      { tractionMult: 1.0,              steerMult: 1.0,              brakeMult: 1.0 - rl * 0.50 },
      { tractionMult: 1.0,              steerMult: 1.0,              brakeMult: 1.0 - rr * 0.50 },
    ];
  }

  // Steering pull caused by asymmetric front wheel damage.
  // Returns an offset in normalised steer space (−1..1 fraction × MAX_STEER applied by caller).
  getToeOffset() {
    const fl = this.state[PARTS.WHEEL_FL];
    const fr = this.state[PARTS.WHEEL_FR];
    // Pull toward the more-damaged side; left damage → negative (pull left)
    return (fl - fr) * 0.35;
  }

  // 0..1 smoke intensity driven by engine + rear wheel damage.
  getSmokeLevel() {
    const engineDmg = this.state[PARTS.ENGINE];
    const rearDmg = (this.state[PARTS.WHEEL_RL] + this.state[PARTS.WHEEL_RR]) / 2;
    return Math.max(engineDmg, rearDmg * 0.6);
  }

  getTotalDamagePercent() {
    const values = Object.values(this.state);
    return values.reduce((a, b) => a + b, 0) / values.length;
  }
}
