import assert from 'node:assert/strict';
import * as THREE from 'three';
import { terrainHeight, terrainSurfaceHeight, lakebedHeight, lakebedSurfaceHeight, lakeSurfaceHeight, intersectLakeSurface, surfaceCrossing, createSilkRibbon, animateScarf, scarfBackSurface, flightPose, flightMotion, farewellCameraPose, crossingCameraPose, overshootCameraPose, pilotHeadMotion, enemyFlightPose, enemyFlightMotion, interceptEnemy, explosionShake, CHASE_START, CHASE_DURATION, ENEMY_FIRE_RATE, ENEMY_FIRE_STOP, HERO_FIRE_RATE, ENDING_DURATION, FREEZE_DURATION, WINK_FREEZE_TIME, FILM_END, filmSceneTime } from '../scene.js';
import { PROJECTILE_SPEED } from '../combat.js';

// The tiled valley must meet at both ends, including its meandering banks.
for (const x of [-230,-180,-120,-80,-50,-35,35,50,80,120,180,230]) {
  assert.ok(Math.abs(terrainHeight(x, 220) - terrainHeight(x, -1130)) < 1e-8, `terrain seam at x=${x}`);
}
for(const z of [-1000,-500,0,200])assert.ok(terrainHeight(32,z)<-5,'submerged terrain creates a shallow shelf in the lake');

// Tree roots use the same triangles as the visible terrain mesh.
for(const side of [-1,1])for(const i of [1,40,100,200])for(const j of [1,120,350,590]){
 const x=side*(32+i*218/220),z=220-j*1350/600;
 assert.ok(Math.abs(terrainSurfaceHeight(x,z)-terrainHeight(x,z))<1e-8,'tree root differs from terrain vertex');
}

// Run the cloth for 30 simulated seconds and check that its anchors stay fixed,
// the free end moves, and no vertex becomes non-finite or stretches excessively.
const cloth=createSilkRibbon(new THREE.Group(),new THREE.MeshBasicMaterial(),0);
const anchor=Array.from(cloth.positions.slice(0,(cloth.nx+1)*3));
for(let i=0;i<=cloth.nx;i++){const p=i*3;assert.ok(Math.abs(cloth.positions[p+2]-scarfBackSurface(cloth.positions[p],cloth.positions[p+1])+.006)<1e-5,'cloth root must meet the curved collar')}
const initial=Array.from(cloth.positions);
for(let frame=0;frame<=1800;frame++)animateScarf([cloth],frame/60);
assert.deepEqual(Array.from(cloth.positions.slice(0,anchor.length)),anchor,'cloth anchors moved');
assert.ok(cloth.positions.every(Number.isFinite),'cloth simulation became non-finite');
assert.ok(cloth.stitchGeometry.attributes.position.array.every(Number.isFinite),'hem stitches became non-finite');
assert.ok(Math.abs(cloth.positions.at(-2)-initial.at(-2))>.01,'cloth free edge did not move');
function maximumStretch(ribbon){let max=0;for(let c=0;c<ribbon.constraints.length;c+=4){const a=ribbon.constraints[c]*3,b=ribbon.constraints[c+1]*3,rest=ribbon.constraints[c+2],p=ribbon.positions;max=Math.max(max,Math.hypot(p[b]-p[a],p[b+1]-p[a+1],p[b+2]-p[a+2])/rest)}return max}
const maxStretch=maximumStretch(cloth);
assert.ok(maxStretch<1.35,`cloth stretched excessively: ${maxStretch.toFixed(3)}`);
const fastCloth=createSilkRibbon(new THREE.Group(),new THREE.MeshBasicMaterial(),1);for(let frame=0;frame<=600;frame++)animateScarf([fastCloth],frame/60,1.65);assert.ok(fastCloth.positions.every(Number.isFinite),'chase wind destabilized the cloth');assert.ok(maximumStretch(fastCloth)<1.35,'chase wind overstretched the cloth');
const looks=Array.from({length:60},(_,i)=>pilotHeadMotion(i*.25,-1).yaw);assert.ok(Math.max(...looks)-Math.min(...looks)>.3,'pilot should look around during the opening');assert.ok(pilotHeadMotion(CHASE_START+9,9).yaw>.4,'pilot should glance toward the pursuers');
assert.equal(ENDING_DURATION,6.2);assert.equal(FREEZE_DURATION,2);assert.equal(FILM_END,CHASE_START+CHASE_DURATION+ENDING_DURATION+FREEZE_DURATION);assert.equal(filmSceneTime(WINK_FREEZE_TIME-.1),WINK_FREEZE_TIME-.1);assert.equal(filmSceneTime(WINK_FREEZE_TIME+.5),WINK_FREEZE_TIME);assert.equal(filmSceneTime(WINK_FREEZE_TIME+1.9),WINK_FREEZE_TIME);assert.equal(filmSceneTime(WINK_FREEZE_TIME+FREEZE_DURATION+.5),WINK_FREEZE_TIME+.5);assert.ok(pilotHeadMotion(WINK_FREEZE_TIME,61.85).wink>.99,'pilot should wink during the freeze frame');assert.equal(pilotHeadMotion(WINK_FREEZE_TIME,61.85).blink,0,'the other eye should remain open during the wink');assert.equal(pilotHeadMotion(CHASE_START+62.6,62.6).wink,0,'the wink should reopen before the fly-through');
let previousCamera=null;for(let c=60;c<=66.2;c+=.05){const pose=farewellCameraPose(CHASE_START+c),direction=pose.look.clone().sub(pose.position).normalize();if(previousCamera){assert.ok(pose.position.distanceTo(previousCamera.position)/.05<30,'farewell camera must not jump');assert.ok(direction.angleTo(previousCamera.direction)/.05<3,'farewell camera must turn smoothly')}previousCamera={position:pose.position,direction}}
const projection=new THREE.PerspectiveCamera(43,16/9,.02,1500);function planeOnScreen(c){const pose=farewellCameraPose(CHASE_START+c);projection.position.copy(pose.position);projection.lookAt(pose.look);projection.updateMatrixWorld();projection.updateProjectionMatrix();return flightMotion(CHASE_START+c).position.project(projection)}const startOfExit=planeOnScreen(64.35),endOfExit=planeOnScreen(65.7);assert.ok(endOfExit.x>startOfExit.x&&endOfExit.y>startOfExit.y,'the departure should rise toward screen right');
console.log('Terrain seam and 30-second cloth simulation: OK');

// The story starts continuously, accelerates, skims the lake, climbs, and reverses.
const before=flightPose(CHASE_START-.001),start=flightPose(CHASE_START),low=flightPose(CHASE_START+25),climb=flightPose(CHASE_START+47),turn=flightPose(CHASE_START+53);
assert.ok(Math.abs(before.z-start.z)<.01,'chase position jumps at the transition');
assert.ok(Math.abs(flightPose(CHASE_START+1).z-start.z)>Math.abs(flightPose(CHASE_START-1).z-start.z),'chase did not accelerate');
assert.ok(low.y<1,'lake pass is not low');
assert.ok(climb.y>40 && climb.pitch>1,'climb is missing');
assert.ok(turn.pitch<-.1&&Math.abs(turn.roll-2*Math.PI)<.01,'the plane should complete its roll while diving');
assert.equal(CHASE_DURATION,60);
assert.ok(ENEMY_FIRE_RATE>=9&&HERO_FIRE_RATE>=10,'the machine guns should fire rapidly enough to read as automatic fire');
const departing=flightPose(CHASE_START+64.8),farewellStart=flightPose(CHASE_START+62.3);assert.ok(departing.x>farewellStart.x+8&&departing.y>farewellStart.y+7,'the plane should climb to screen right after the fly-through');
assert.ok(ENEMY_FIRE_STOP+110/PROJECTILE_SPEED<42,'the last incoming projectiles should clear before the pull-up');
assert.ok(pilotHeadMotion(CHASE_START+45,45).pitch<-.8,'the pilot should look down at the passing aircraft');
assert.ok(lakebedHeight(0,-108)>lakebedHeight(0,400)+8,'the central shoal should be shallower than the deep basin');for(const x of [-15,0,15])for(const z of [-130,-80,100])assert.ok(Math.abs(lakebedHeight(x,z)-lakebedHeight(x,z+1350))<1e-8,'the lakebed should tile without a seam');assert.ok(lakebedSurfaceHeight(0,-108)<lakeSurfaceHeight(0,-108,25)-2,'the shoal must remain underwater');assert.deepEqual(surfaceCrossing(-.75,-.25),{fraction:.5,entering:false});assert.deepEqual(surfaceCrossing(-.25,-.75),{fraction:.5,entering:true});assert.equal(surfaceCrossing(-.8,-.7),null,'no splash should be emitted without a surface crossing');
for(const direction of [new THREE.Vector3(.1,-.4,-1).normalize(),new THREE.Vector3(-.2,-.2,-1).normalize()]){const origin=new THREE.Vector3(2,5,-110),time=109,distance=intersectLakeSurface(origin,direction,time),point=origin.clone().addScaledVector(direction,distance),arrival=time+Math.max(.055,distance/PROJECTILE_SPEED);assert.ok(distance>0&&distance<110,'downward fire should reach the lake');assert.ok(Math.abs(point.y-lakeSurfaceHeight(point.x,point.z,arrival))<.0001,'the bullet should hit the moving surface at arrival')}
assert.equal(intersectLakeSurface(new THREE.Vector3(0,5,0),new THREE.Vector3(0,.1,-1).normalize(),109),null,'upward fire must not hit the lake');
assert.deepEqual(explosionShake(-.01),{x:0,y:0,flash:0});assert.deepEqual(explosionShake(1.7),{x:0,y:0,flash:0});assert.equal(explosionShake(0).flash,1,'the flash should begin at the impact');assert.ok(Math.hypot(explosionShake(.15).x,explosionShake(.15).y)>.01,'the blast should visibly shake the frame');assert.ok(Math.hypot(explosionShake(1.69).x,explosionShake(1.69).y)<.0001,'the shake should settle');assert.notDeepEqual(explosionShake(.1,0),explosionShake(.1,1),'the two impacts should not share identical motion');for(let age=0;age<1.7;age+=.01){const shake=explosionShake(age);assert.ok(Math.abs(shake.x)<.0411&&Math.abs(shake.y)<.0351,'screen shake must remain bounded')}
const apex=flightMotion(CHASE_START+48),pilotUp=new THREE.Vector3(0,1,0).applyQuaternion(apex.orientation);assert.ok(pilotUp.y<-.98,'the pilot should be upside down at the top of the climb');assert.ok(apex.velocity.length()>10,'the aircraft must keep moving through the inverted apex');
assert.equal(flightPose(CHASE_START+200,true).chase,-1,'guided tour must remain in cruise outside action previews');
for(let c=34;c<42;c+=.25){const p=flightPose(CHASE_START+c),local=p.z+Math.floor((220-p.z)/1350)*1350;const ground=Math.max(terrainHeight(p.x,local),terrainHeight(p.x-2,local),terrainHeight(p.x+2,local));assert.ok(p.y>=ground+6.9,`mountain clearance at ${c}`)}
let previous=flightPose(CHASE_START);
for(let c=.05;c<60;c+=.05){const p=flightPose(CHASE_START+c),distance=Math.hypot(p.x-previous.x,p.y-previous.y,p.z-previous.z);assert.ok(distance<2.1,`abrupt chase movement at ${c.toFixed(2)}s`);previous=p}
// On the first turn the aircraft exchange sides, stay apart in three
// dimensions, and remain visible as they sweep out and join the pursuit.
assert.ok(enemyFlightPose(CHASE_START+1.7,0).position.x<enemyFlightPose(CHASE_START+1.7,1).position.x,'pursuers should approach on opposite sides');
assert.ok(enemyFlightPose(CHASE_START+3.4,0).position.x>enemyFlightPose(CHASE_START+3.4,1).position.x,'pursuers should cross during the first turn');
assert.ok(enemyFlightPose(CHASE_START+5,0).position.x-enemyFlightPose(CHASE_START+5,1).position.x>50,'the turnaround should sweep out wide');
for(let c=0;c<10;c+=.05){const a=enemyFlightPose(CHASE_START+c,0),b=enemyFlightPose(CHASE_START+c,1);assert.ok(a.position.distanceTo(b.position)>4,`pursuers are too close at ${c.toFixed(2)}s`)}
for(const aspect of [16/9,1.1,.65])for(const c of [2.1,2.6,3.5,4.5,5.1,5.8]){const t=CHASE_START+c,view=crossingCameraPose(t,aspect),cam=new THREE.PerspectiveCamera(43,aspect,.02,1500);cam.position.copy(view.position);cam.lookAt(view.look);cam.updateMatrixWorld();cam.updateProjectionMatrix();for(const subject of [flightMotion(t).position,enemyFlightPose(t,0).position,enemyFlightPose(t,1).position]){const p=subject.project(cam);assert.ok(Math.abs(p.x)<.95&&Math.abs(p.y)<.95,`crossing camera loses an aircraft at ${c}s with aspect ${aspect}`)}}
for(let i=0;i<2;i++){
 const approaching=enemyFlightPose(CHASE_START,i),heroStart=flightPose(CHASE_START);assert.ok(approaching.position.z<heroStart.z,'pursuer did not approach from ahead');
 for(let c=0;c<58;c+=.1){const p=enemyFlightPose(CHASE_START+c,i),speed=p.velocity.length();assert.ok(speed>5&&speed<45,`pursuer ${i} has implausible speed at ${c.toFixed(1)}s`);
  if(c>=8&&c<=44.5){const hero=flightPose(CHASE_START+c);assert.ok(p.position.z>hero.z,`pursuer ${i} is not behind before the overshoot`)}
  if(c>=30&&c<=46){const local=p.position.z+Math.floor((220-p.position.z)/1350)*1350,g=Math.max(terrainHeight(p.position.x,local),terrainHeight(p.position.x-2,local),terrainHeight(p.position.x+2,local));assert.ok(p.position.y>=g+6.9,`pursuer ${i} clips the mountain at ${c.toFixed(1)}s`)}
 }
 for(const c of [48,50,52]){const p=enemyFlightPose(CHASE_START+c,i),hero=flightPose(CHASE_START+c);assert.ok(p.position.z<hero.z&&p.position.y<hero.y-10,`pursuer ${i} should pass below and ahead at ${c}s`)}
 for(const c of (i===1?[54.1,54.5]:[56.4,57])){const time=CHASE_START+c,hero=flightMotion(time),p=enemyFlightMotion(time,i),origin=new THREE.Vector3(0,.1,-4.6).multiplyScalar(.25).applyQuaternion(hero.orientation).add(hero.position),point=interceptEnemy(origin,time,i),arrival=time+origin.distanceTo(point)/PROJECTILE_SPEED,actual=enemyFlightPose(arrival,i).position,nose=new THREE.Vector3(0,0,-1).applyQuaternion(hero.orientation);assert.ok(point.distanceTo(actual)<.01,`shot must lead pursuer ${i} along its flight path at ${c}s`);assert.ok(nose.angleTo(point.clone().sub(origin))<.09,`the pilot must line up behind pursuer ${i} before firing at ${c}s`);assert.ok(hero.velocity.clone().normalize().dot(p.velocity.clone().normalize())>.95,'the aircraft should travel in the same direction for the counterattack')}
}
// The downward view keeps both passing planes and the pilot in the frame.
for(const c of [45.3,46,47,48]){const t=CHASE_START+c,view=overshootCameraPose(t),cam=new THREE.PerspectiveCamera(43,16/9,.02,1500);cam.position.copy(view.position);cam.up.set(0,0,-1);cam.lookAt(view.look);cam.updateMatrixWorld();cam.updateProjectionMatrix();const pilot=new THREE.Vector3(0,.52,.2).applyQuaternion(flightMotion(t).orientation).add(flightMotion(t).position),subjects=[pilot,enemyFlightPose(t,0).position,enemyFlightPose(t,1).position];for(const subject of subjects){const p=subject.project(cam);assert.ok(Math.abs(p.x)<.95&&Math.abs(p.y)<.95,`overshoot camera loses a subject at ${c}s`)}}
// A plane's nose follows its path, and its attitude changes continuously through
// the mountain turn and reversal instead of snapping through a near-vertical pose.
for(let i=-1;i<2;i++){
 let previousOrientation=null;
 for(let c=0;c<58;c+=.1){
  const motion=i<0?flightMotion(CHASE_START+c):enemyFlightMotion(CHASE_START+c,i),forward=new THREE.Vector3(0,0,-1).applyQuaternion(motion.orientation);
  assert.ok(forward.angleTo(motion.velocity)<.01,`aircraft ${i} points away from its path at ${c.toFixed(1)}s`);
  if(c>=6)assert.ok(motion.velocity.length()>10,`aircraft ${i} appears to stall at ${c.toFixed(1)}s`);
  if(previousOrientation)assert.ok(previousOrientation.angleTo(motion.orientation)/.1<2,`aircraft ${i} turns abruptly at ${c.toFixed(1)}s`);
  previousOrientation=motion.orientation;
 }
}
console.log('60-second chase, flight alignment, smooth turns and mountain clearance: OK');
