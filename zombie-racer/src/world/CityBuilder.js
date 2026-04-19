import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { MAP } from './mapData.js';
import { groundMaterial, asphaltMaterial, slickMaterial } from '../physics/PhysicsWorld.js';
import { makeAsphaltTexture, makeBuildingTextures } from '../utils/ProceduralTextures.js';

const _asphaltBase = makeAsphaltTexture();
const _buildingTextures = makeBuildingTextures();

export class CityBuilder {
  build(scene, world, terrain) {
    this._buildRoads(scene, world, terrain);
    this._buildBuildings(scene, world, terrain);
    this._buildRamps(scene, world, terrain);
    this._buildTrees(scene, world, terrain);
    this._buildObstacles(scene, world, terrain);
  }

  _buildRoads(scene, world, terrain) {
    for (const r of MAP.roads) {
      const segsW = Math.max(1, Math.floor(r.w / 8));
      const segsD = Math.max(1, Math.floor(r.d / 8));
      const geo = new THREE.PlaneGeometry(r.w, r.d, segsW, segsD);
      geo.rotateX(-Math.PI / 2);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const wx = r.x + pos.getX(i);
        const wz = r.z + pos.getZ(i);
        pos.setY(i, terrain.getHeightAt(wx, wz) + 0.06);
      }
      pos.needsUpdate = true;
      geo.computeVertexNormals();
      const tex = _asphaltBase.clone();
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(r.w / 6, r.d / 6);
      tex.needsUpdate = true;
      const mat = new THREE.MeshLambertMaterial({ map: tex });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.receiveShadow = true;
      scene.add(mesh);

      // Fizyczne ciało z asphaltMaterial — lepsza przyczepność niż trawa
      const phyShape = new CANNON.Box(new CANNON.Vec3(r.w / 2, 0.05, r.d / 2));
      const phyBody = new CANNON.Body({ mass: 0, material: asphaltMaterial });
      phyBody.addShape(phyShape);
      phyBody.position.set(r.x, terrain.getHeightAt(r.x, r.z) + 0.05, r.z);
      world.addBody(phyBody);
    }
  }

  _buildBuildings(scene, world, terrain) {
    let ci = 0;
    for (const b of MAP.buildings) {
      const hy = terrain.getHeightAt(b.x, b.z);
      const geo = new THREE.BoxGeometry(b.w, b.h, b.d);
      const tex = _buildingTextures[ci % _buildingTextures.length].clone();
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(b.w / 4, b.h / 4);
      tex.needsUpdate = true;
      const mat = new THREE.MeshLambertMaterial({ map: tex });
      ci++;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(b.x, hy + b.h / 2, b.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);

      const shape = new CANNON.Box(new CANNON.Vec3(b.w / 2, b.h / 2, b.d / 2));
      const body = new CANNON.Body({ mass: 0, material: groundMaterial });
      body.addShape(shape);
      body.position.set(b.x, hy + b.h / 2, b.z);
      body.userData = { building: true };
      world.addBody(body);
    }
  }

  _buildRamps(scene, world, terrain) {
    const rampMat = new THREE.MeshLambertMaterial({ color: 0x888866, side: THREE.DoubleSide });
    for (const r of MAP.ramps) {
      const hy = terrain.getHeightAt(r.x, r.z);
      const rampY = hy + (r.length / 2) * Math.sin(r.angleX);

      const geo = new THREE.PlaneGeometry(r.width, r.length);
      const mesh = new THREE.Mesh(geo, rampMat);
      mesh.rotation.x = -Math.PI / 2 + r.angleX;
      mesh.rotation.y = r.rotY;
      mesh.position.set(r.x, rampY, r.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);

      const shape = new CANNON.Box(new CANNON.Vec3(r.width / 2, 0.1, r.length / 2));
      const body = new CANNON.Body({ mass: 0, material: groundMaterial });
      body.addShape(shape);
      body.position.set(r.x, rampY, r.z);
      body.quaternion.setFromEuler(-Math.PI / 2 + r.angleX, r.rotY, 0);
      world.addBody(body);
    }
  }

  _buildTrees(scene, world, terrain) {
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x4a2c0a });
    const canopyMat = new THREE.MeshLambertMaterial({ color: 0x1a7a2a });
    const trunkGeoBase = new THREE.CylinderGeometry(0.4, 0.55, 4, 8);
    const canopyGeoBase = new THREE.SphereGeometry(3, 8, 6);

    for (const t of MAP.trees) {
      const hy = terrain.getHeightAt(t.x, t.z);

      const trunk = new THREE.Mesh(trunkGeoBase, trunkMat);
      trunk.position.set(t.x, hy + 2, t.z);
      trunk.castShadow = true;
      scene.add(trunk);

      const canopy = new THREE.Mesh(canopyGeoBase, canopyMat);
      canopy.position.set(t.x, hy + 6.5, t.z);
      canopy.castShadow = true;
      scene.add(canopy);

      const shape = new CANNON.Box(new CANNON.Vec3(0.5, 2, 0.5));
      const body = new CANNON.Body({ mass: 0, material: groundMaterial });
      body.addShape(shape);
      body.position.set(t.x, hy + 2, t.z);
      body.userData = { building: true };
      world.addBody(body);
    }
  }

  _buildObstacles(scene, world, terrain) {
    const barrierMat = new THREE.MeshLambertMaterial({ color: 0xbbbbbb });
    const stripeMat  = new THREE.MeshLambertMaterial({ color: 0xdd5500 });
    const geo     = new THREE.BoxGeometry(0.8, 1.2, 3.5);
    const stripeG = new THREE.BoxGeometry(0.82, 0.2, 3.52);

    for (const o of MAP.obstacles) {
      const hy = terrain.getHeightAt(o.x, o.z);
      const pivot = new THREE.Group();
      pivot.rotation.y = o.rotY || 0;
      pivot.position.set(o.x, hy + 0.6, o.z);

      const body = new THREE.Mesh(geo, barrierMat);
      body.castShadow = true;
      body.receiveShadow = true;
      pivot.add(body);

      const stripe = new THREE.Mesh(stripeG, stripeMat);
      stripe.position.y = 0.25;
      pivot.add(stripe);

      scene.add(pivot);

      const shape = new CANNON.Box(new CANNON.Vec3(0.4, 0.6, 1.75));
      const phyBody = new CANNON.Body({ mass: 0, material: groundMaterial });
      phyBody.addShape(shape);
      phyBody.position.set(o.x, hy + 0.6, o.z);
      phyBody.quaternion.setFromEuler(0, o.rotY || 0, 0);
      phyBody.userData = { building: true };
      world.addBody(phyBody);
    }
  }
}
