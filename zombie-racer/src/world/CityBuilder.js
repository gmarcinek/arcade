import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { MAP } from './mapData.js';
import { groundMaterial } from '../physics/PhysicsWorld.js';
import { makeAsphaltTexture, makeBuildingTextures } from '../utils/ProceduralTextures.js';

const _asphaltBase = makeAsphaltTexture();
const _buildingTextures = makeBuildingTextures();

export class CityBuilder {
  build(scene, world, terrain) {
    this._buildRoads(scene, terrain);
    this._buildBuildings(scene, world, terrain);
    this._buildRamps(scene, world, terrain);
  }

  _buildRoads(scene, terrain) {
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
}
