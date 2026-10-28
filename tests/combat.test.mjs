import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCombatEffects, PROJECTILE_SPEED } from '../combat.js';

// The locally drawn sprite textures only need a minimal canvas for this test.
globalThis.document={createElement(name){assert.equal(name,'canvas');return {width:0,height:0,getContext(){return {
 createRadialGradient(){return {addColorStop(){}}},fillRect(){},putImageData(){},
 createImageData(width,height){return {data:new Uint8ClampedArray(width*height*4)}}
 }}}}};
const scene=new THREE.Scene(),effects=createCombatEffects(scene),from=new THREE.Vector3(0,5,0),to=new THREE.Vector3(0,-.5,-18),velocity=new THREE.Vector3(0,0,-20),duration=from.distanceTo(to)/PROJECTILE_SPEED;
effects.tracer(from,to,0,'enemy',true,velocity);
const projectile=scene.children.find(object=>object.isGroup&&object.children.some(child=>child.geometry?.type==='CapsuleGeometry'));
assert.ok(projectile,'a shot should contain a physical projectile mesh');
assert.ok(!scene.children.some(object=>object.isLine),'shots must not be flat line segments');
assert.deepEqual(effects.update(duration/2),{waterHits:0,aircraftHits:[]});assert.ok(projectile.position.distanceTo(from.clone().lerp(to,.5))<1e-6,'projectile must travel along its path');
assert.deepEqual(effects.update(duration+.01),{waterHits:1,aircraftHits:[]},'a water impact should be reported exactly on arrival');assert.ok(!scene.children.includes(projectile),'a completed projectile must be removed');
const impact=scene.getObjectByName('bullet-water-impact');assert.ok(impact,'a bullet should create a dedicated surface plume');assert.ok(impact.children.some(object=>object.isPoints&&object.geometry.attributes.position.count===48),'a bullet impact should throw fine droplets');
const reflectedRipples=Array.from({length:8},()=>new THREE.Vector4());effects.writeRipples(reflectedRipples);assert.equal(reflectedRipples[0].x,to.x);assert.equal(reflectedRipples[0].y,to.z);assert.ok(Math.abs(reflectedRipples[0].z-duration)<1e-8,'the water shader should receive the true impact time');
effects.update(duration+.15);assert.ok(impact.children.find(object=>object.isPoints).geometry.attributes.position.array.some((value,index)=>index%3===1&&value>.12),'impact droplets should rise above the surface');
assert.deepEqual(effects.update(duration+3),{waterHits:0,aircraftHits:[]},'an impact must not repeat');effects.writeRipples(reflectedRipples);assert.equal(reflectedRipples[0].z,-999,'expired ripples should stop distorting the reflection');
assert.ok(!scene.getObjectByName('bullet-water-impact'),'the bullet plume should be removed after fading');
effects.dolphinSplash(new THREE.Vector3(3,-.5,4),4,new THREE.Vector3(0,-2,-2.5),true);const breach=scene.getObjectByName('dolphin-splash');assert.ok(breach,'a dolphin crossing should create a separate splash');assert.ok(breach.children.some(object=>object.isPoints&&object.geometry.attributes.position.count===56),'a dolphin breach should have broader spray');effects.update(4.2);assert.ok(breach.children.find(object=>object.isPoints).geometry.attributes.position.array.some((value,index)=>index%3===1&&value>.12),'breach droplets should rise above the lake');effects.writeRipples(reflectedRipples);assert.equal(reflectedRipples[0].x,3);assert.equal(reflectedRipples[0].y,4);effects.update(6.5);assert.ok(!scene.getObjectByName('dolphin-splash'),'the dolphin splash should be removed after fading');
effects.tracer(from,to,7,'hero',false,velocity,0);
assert.deepEqual(effects.update(7+duration/2),{waterHits:0,aircraftHits:[]},'an aircraft must not be hit before the projectile arrives');
assert.deepEqual(effects.update(7+duration+.01),{waterHits:0,aircraftHits:[0]},'arrival should identify the hit aircraft');
assert.deepEqual(effects.update(8),{waterHits:0,aircraftHits:[]},'an aircraft impact must not repeat');effects.clear();
const blast=effects.explode(new THREE.Vector3(1,10,2),10,new THREE.Vector3(0,0,-10)),sparks=blast.children.find(object=>object.isPoints&&object.geometry.attributes.position.count===72),fireball=blast.children.find(object=>object.geometry?.type==='SphereGeometry'&&object.material?.uniforms?.age),debris=blast.children.filter(object=>object.isMesh&&['ExtrudeGeometry','BoxGeometry'].includes(object.geometry?.type));assert.ok(sparks&&fireball,'the blast should include a fireball and sparks');assert.ok(blast.renderOrder>0,'the airborne blast must render after the transparent lake');assert.equal(debris.length,18,'aircraft wreckage should use broken panels and structural pieces');let sparkDisposed=false;sparks.geometry.addEventListener('dispose',()=>sparkDisposed=true);effects.update(10.25);assert.ok(fireball.scale.x>2,'the fireball should expand rapidly after impact');assert.ok(sparks.geometry.attributes.position.array.some(value=>Math.abs(value)>.1),'the sparks should move away from the impact');assert.ok(debris.some(piece=>piece.position.length()>.2),'wreckage should move with the blast');assert.notDeepEqual(debris[0].rotation.toArray(),debris[1].rotation.toArray(),'fragments should tumble independently');effects.update(15.1);assert.ok(!scene.children.includes(blast)&&sparkDisposed,'expired explosions should release their particles');
console.log('Projectile travel and water/aircraft-impact timing: OK');
