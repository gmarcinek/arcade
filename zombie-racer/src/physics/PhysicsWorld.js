import * as CANNON from 'cannon-es';

export const groundMaterial  = new CANNON.Material('ground');
export const wheelMaterial   = new CANNON.Material('wheel');
export const carBodyMaterial = new CANNON.Material('carBody');


export function createPhysicsWorld() {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -20, 0) });
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.allowSleep = true;
  world.defaultContactMaterial.friction = 0.3;

  const wheelGround = new CANNON.ContactMaterial(groundMaterial, wheelMaterial, {
    friction: 0.8, restitution: 0.0, contactEquationStiffness: 1e8
  });
  const carGround = new CANNON.ContactMaterial(groundMaterial, carBodyMaterial, {
    friction: 0.4, restitution: 0.2
  });
  const carCar = new CANNON.ContactMaterial(carBodyMaterial, carBodyMaterial, {
    friction: 0.3, restitution: 0.4
  });

  world.addContactMaterial(wheelGround);
  world.addContactMaterial(carGround);
  world.addContactMaterial(carCar);

  return world;
}
