import * as CANNON from 'cannon-es';
import { GRAVITY, FRICTION_GRASS, FRICTION_ASPHALT, FRICTION_SLICK, DEFAULT_CONTACT_FRICTION } from '../physicsConfig.js';

export const groundMaterial  = new CANNON.Material('ground');    // trawa
export const asphaltMaterial = new CANNON.Material('asphalt');   // asfalt
export const slickMaterial   = new CANNON.Material('slick');     // kaluz/piasek
export const wheelMaterial   = new CANNON.Material('wheel');
export const carBodyMaterial = new CANNON.Material('carBody');


export function createPhysicsWorld() {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, GRAVITY, 0) });
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.allowSleep = true;
  world.defaultContactMaterial.friction = DEFAULT_CONTACT_FRICTION;

  // Kolo vs nawierzchnie — wartosci z physicsConfig.js
  const wheelGrass = new CANNON.ContactMaterial(groundMaterial, wheelMaterial, {
    friction: FRICTION_GRASS, restitution: 0.0, contactEquationStiffness: 1e8
  });
  const wheelAsphalt = new CANNON.ContactMaterial(asphaltMaterial, wheelMaterial, {
    friction: FRICTION_ASPHALT, restitution: 0.0, contactEquationStiffness: 1e8
  });
  const wheelSlick = new CANNON.ContactMaterial(slickMaterial, wheelMaterial, {
    friction: FRICTION_SLICK, restitution: 0.0, contactEquationStiffness: 1e8
  });

  const carGround = new CANNON.ContactMaterial(groundMaterial, carBodyMaterial, {
    friction: 0.4, restitution: 0.2
  });
  const carCar = new CANNON.ContactMaterial(carBodyMaterial, carBodyMaterial, {
    friction: 0.3, restitution: 0.4
  });

  world.addContactMaterial(wheelGrass);
  world.addContactMaterial(wheelAsphalt);
  world.addContactMaterial(wheelSlick);
  world.addContactMaterial(carGround);
  world.addContactMaterial(carCar);

  return world;
}
