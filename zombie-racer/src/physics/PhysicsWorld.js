import * as CANNON from 'cannon-es';
import { GRAVITY, FRICTION_GRASS, FRICTION_ASPHALT, FRICTION_SLICK, DEFAULT_CONTACT_FRICTION } from '../physicsConfig.js';

export const groundMaterial       = new CANNON.Material('ground');       // trawa
export const asphaltMaterial      = new CANNON.Material('asphalt');      // asfalt
export const slickMaterial        = new CANNON.Material('slick');        // kaluz/piasek
export const wheelMaterial        = new CANNON.Material('wheel');
export const carBodyMaterial      = new CANNON.Material('carBody');
export const buildingWallMaterial = new CANNON.Material('buildingWall'); // ściany budynków — bardzo niskie tarcie


export function createPhysicsWorld() {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, GRAVITY, 0) });
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.allowSleep = true;
  world.defaultContactMaterial.friction = DEFAULT_CONTACT_FRICTION;
  // Więcej iteracji solvera = lepsza rozdzielczość kolizji, mniej przenikania przy dużych prędkościach
  world.solver.iterations = 20;

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
  const wheelWall = new CANNON.ContactMaterial(buildingWallMaterial, wheelMaterial, {
    friction: FRICTION_ASPHALT, restitution: 0.0, contactEquationStiffness: 1e8
  });

  const carGround = new CANNON.ContactMaterial(groundMaterial, carBodyMaterial, {
    friction: 0.05, restitution: 0.2
  });
  // Karoseria na asfalcie/rampie — friction bliskie 0, inaczej chassis "przyklejone" do rampy hamuje auto
  const carAsphalt = new CANNON.ContactMaterial(asphaltMaterial, carBodyMaterial, {
    friction: 0.01, restitution: 0.1
  });
  const carCar = new CANNON.ContactMaterial(carBodyMaterial, carBodyMaterial, {
    friction: 0.05, restitution: 0.25
  });
  // Karoseria vs ściana budynku — 0.1× tarcia carGround → ślizganie się po ścianie
  const carWall = new CANNON.ContactMaterial(carBodyMaterial, buildingWallMaterial, {
    friction: 0.005, restitution: 0.15
  });

  world.addContactMaterial(wheelGrass);
  world.addContactMaterial(wheelAsphalt);
  world.addContactMaterial(wheelSlick);
  world.addContactMaterial(wheelWall);
  world.addContactMaterial(carGround);
  world.addContactMaterial(carAsphalt);
  world.addContactMaterial(carCar);
  world.addContactMaterial(carWall);

  return world;
}
