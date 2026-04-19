export class CarStats {
  constructor({ engine = 1.0, defence = 1.0, offence = 1.0 } = {}) {
    this.engine  = engine;
    this.defence = defence;
    this.offence = offence;
  }
}
