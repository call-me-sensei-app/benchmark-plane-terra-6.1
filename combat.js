import * as THREE from 'three';

export const PROJECTILE_SPEED=180;
const hash=(a,b)=>{const n=Math.sin(a*127.1+b*311.7)*43758.5453;return n-Math.floor(n)};
function radialTexture(inner, outer) {
 const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const ctx=canvas.getContext('2d'),g=ctx.createRadialGradient(64,64,2,64,64,62);
 g.addColorStop(0,inner);g.addColorStop(.35,outer);g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.fillRect(0,0,128,128);const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;return map;
}
function muzzleTexture(){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const ctx=canvas.getContext('2d'),image=ctx.createImageData(128,128);
 for(let y=0;y<128;y++)for(let x=0;x<128;x++){const dx=(x-64)/62,dy=(y-64)/62,r=Math.hypot(dx,dy),a=Math.atan2(dy,dx),spikes=Math.pow(Math.max(0,Math.cos(a*5+.3)),14)*.5+Math.pow(Math.max(0,Math.cos(a*3-.7)),20)*.24,alpha=Math.max(0,1-r/(.30+spikes)),i=(y*128+x)*4;image.data[i]=255;image.data[i+1]=Math.round(150+105*Math.max(0,1-r*2));image.data[i+2]=Math.round(38+185*Math.max(0,1-r*2));image.data[i+3]=Math.round(255*alpha*alpha)}ctx.putImageData(image,0,0);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}
function fragmentGeometry(points){
 const shape=new THREE.Shape();shape.moveTo(points[0][0],points[0][1]);for(const point of points.slice(1))shape.lineTo(point[0],point[1]);shape.closePath();
 const geometry=new THREE.ExtrudeGeometry(shape,{depth:.08,bevelEnabled:true,bevelSize:.012,bevelThickness:.012,bevelSegments:1,curveSegments:1});geometry.translate(0,0,-.04);return geometry;
}
export function createCombatEffects(scene) {
 const tracers=[],ripples=[],bursts=[],splashes=[],bulletSplashes=[],glow=radialTexture('rgba(255,247,184,1)','rgba(255,102,13,.7)'),muzzleMap=muzzleTexture(),smoke=radialTexture('rgba(85,79,72,.75)','rgba(36,37,39,.35)'),droplet=radialTexture('rgba(255,255,255,1)','rgba(185,225,220,.45)'),projectileGeometry=new THREE.CapsuleGeometry(.022,.095,4,8),projectileMaterial=new THREE.MeshStandardMaterial({color:0xb18b58,metalness:.82,roughness:.34}),trailGeometry=new THREE.CylinderGeometry(.032,.001,.65,8,1,true),upAxis=new THREE.Vector3(0,1,0);trailGeometry.translate(0,-.325,0);
 // Fine crests sit on the reflected water; its shader separately distorts the
 // actual reflection and surface normals beneath the propwash.
 const wakeMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,uniforms:{time:{value:0},strength:{value:0}},vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,fragmentShader:`varying vec2 vUv;uniform float time;uniform float strength;void main(){float along=(1.0-vUv.y)*45.0,x=abs(vUv.x-.5)*18.0;float width=.45+along*.15;float arm=exp(-pow((x-width)/(.12+along*.008),2.0));float interior=exp(-pow(x/max(width,.1),4.0));float crest=pow(max(0.0,cos(along*2.0-x*.4-time*2.3)),12.0);float fade=smoothstep(.5,2.5,along)*(1.0-smoothstep(20.0,45.0,along));float a=(arm*.55+interior*crest*.35)*fade*strength*.16;gl_FragColor=vec4(.65,.82,.80,a);}`});
 const wake=new THREE.Mesh(new THREE.PlaneGeometry(18,45),wakeMaterial);wake.rotation.order='YXZ';wake.rotation.x=-Math.PI/2;wake.visible=false;scene.add(wake);
 const shockCanvas=document.createElement('canvas');shockCanvas.width=shockCanvas.height=128;const shockCtx=shockCanvas.getContext('2d'),shockGradient=shockCtx.createRadialGradient(64,64,0,64,64,63);shockGradient.addColorStop(0,'rgba(0,0,0,0)');shockGradient.addColorStop(.62,'rgba(0,0,0,0)');shockGradient.addColorStop(.76,'rgba(255,204,133,.7)');shockGradient.addColorStop(.9,'rgba(255,130,54,.1)');shockGradient.addColorStop(1,'rgba(0,0,0,0)');shockCtx.fillStyle=shockGradient;shockCtx.fillRect(0,0,128,128);const shockMap=new THREE.CanvasTexture(shockCanvas);
 const ringGeometry=new THREE.PlaneGeometry(2,2),fireGeometry=new THREE.SphereGeometry(1,64,48),fragmentGeometries=[
  fragmentGeometry([[-.55,-.18],[.30,-.22],[.50,-.04],[.24,.14],[-.17,.23],[-.48,.09]]),
  fragmentGeometry([[-.32,-.25],[.42,-.12],[.22,.02],[.08,.34],[-.12,.10],[-.37,.08]]),
  fragmentGeometry([[-.50,-.12],[.46,-.09],[.23,.16],[-.08,.10],[-.37,.19]]),
  new THREE.BoxGeometry(.08,.10,.90),new THREE.BoxGeometry(.12,.65,.10)
 ];
 function fireMaterial(){return new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{age:{value:0},fade:{value:1},eyeLocal:{value:new THREE.Vector3()}},vertexShader:`varying vec3 vP;void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,fragmentShader:`
  varying vec3 vP;uniform vec3 eyeLocal;uniform float age;uniform float fade;
  float hash3(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
  float noise3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(mix(hash3(i),hash3(i+vec3(1,0,0)),f.x),mix(hash3(i+vec3(0,1,0)),hash3(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash3(i+vec3(0,0,1)),hash3(i+vec3(1,0,1)),f.x),mix(hash3(i+vec3(0,1,1)),hash3(i+vec3(1,1,1)),f.x),f.y),f.z);}
  void main(){
   vec3 ray=normalize(vP-eyeLocal);float b=dot(eyeLocal,ray),c=dot(eyeLocal,eyeLocal)-1.0,disc=b*b-c;if(disc<=0.0)discard;
   float root=sqrt(disc),nearT=max(0.0,-b-root),farT=-b+root,stepSize=(farT-nearT)/16.0;vec3 light=vec3(0.0);float opacity=0.0;
   float jitter=hash3(vec3(gl_FragCoord.xy,3.1));
   for(int i=0;i<16;i++){
    vec3 p=eyeLocal+ray*(nearT+(float(i)+jitter)*stepSize);float r=length(p);
    vec3 q=p*3.8+vec3(age*.45,-age*1.1,age*.35);float n=noise3(q)*.67+noise3(q*2.15+7.0)*.33;
    float edge=1.0-smoothstep(.56,1.0,r+(n-.5)*.28),density=edge*smoothstep(.28,.68,n);
    float heat=(1.0-smoothstep(.45,2.0,age))*smoothstep(.34,.67,n+(1.0-r)*.16);
    vec3 color=mix(vec3(.055,.041,.032),vec3(1.45,.19,.015),heat);color+=vec3(2.2,.82,.10)*pow(heat,4.0);
    float a=clamp(density*stepSize*4.0,0.0,.85);light+=(1.0-opacity)*a*color;opacity+=(1.0-opacity)*a;
   }
   if(opacity<.005)discard;gl_FragColor=vec4(light/max(opacity,.001),opacity*fade);
  }`});}

 function tracer(from,to,time,side,waterHit=false,sourceVelocity=new THREE.Vector3(),aircraftHit=null) {
  const delta=to.clone().sub(from),distance=delta.length(),direction=delta.clone().normalize(),projectile=new THREE.Group();projectile.position.copy(from);projectile.quaternion.setFromUnitVectors(upAxis,direction);scene.add(projectile);projectile.add(new THREE.Mesh(projectileGeometry,projectileMaterial));
  const trailMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,uniforms:{tint:{value:new THREE.Color(side==='hero'?0xffd890:0xff8c4d)}},vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,fragmentShader:`varying vec2 vUv;uniform vec3 tint;void main(){float a=smoothstep(0.0,.9,vUv.y)*.55;gl_FragColor=vec4(tint,a);}`});projectile.add(new THREE.Mesh(trailGeometry,trailMaterial));
  const headGlow=new THREE.Sprite(new THREE.SpriteMaterial({map:glow,color:side==='hero'?0xffdfaa:0xff9f68,transparent:true,opacity:.8,blending:THREE.AdditiveBlending,depthWrite:false}));headGlow.scale.setScalar(.15);projectile.add(headGlow);
  const flash=new THREE.Sprite(new THREE.SpriteMaterial({map:muzzleMap,transparent:true,opacity:.9,blending:THREE.AdditiveBlending,depthWrite:false}));flash.position.copy(from);flash.scale.setScalar(.55);flash.material.rotation=hash(time,side==='hero'?41:42)*Math.PI;scene.add(flash);
  tracers.push({projectile,trailMaterial,headGlow,flash,from:from.clone(),to:to.clone(),delta,sourceVelocity:sourceVelocity.clone(),start:time,duration:Math.max(.055,distance/PROJECTILE_SPEED),waterHit,aircraftHit});
 }
 function ripple(position,time,energy=1,spray=true) {
  const material=new THREE.ShaderMaterial({transparent:true,side:THREE.DoubleSide,depthWrite:false,uniforms:{fade:{value:1},strength:{value:spray? .13:.055},seed:{value:hash(time,position.x)*6.283}},vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,fragmentShader:`varying vec2 vUv;uniform float fade;uniform float strength;uniform float seed;void main(){vec2 p=vUv*2.0-1.0;float r=length(p),a=atan(p.y,p.x);float warp=.045*sin(a*3.0+seed)+.022*sin(a*9.0-seed);float crest=exp(-pow((r-.72+warp)/.09,2.0));float trailing=exp(-pow((r-.51+warp*.55)/.13,2.0))*.22;float variation=.68+.20*sin(a*7.0+seed)+.12*sin(a*17.0-seed);float alpha=(crest+trailing)*fade*strength*variation;gl_FragColor=vec4(.62,.78,.76,alpha);}`});
  const ring=new THREE.Mesh(ringGeometry,material);ring.rotation.x=-Math.PI/2;ring.position.set(position.x,-.40,position.z);scene.add(ring);const vel=[];let points=null;
  if(spray){const geometry=new THREE.BufferGeometry(),array=new Float32Array(28*3);geometry.setAttribute('position',new THREE.BufferAttribute(array,3).setUsage(THREE.DynamicDrawUsage));for(let i=0;i<28;i++){const a=hash(i,21)*Math.PI*2,s=.25+hash(i,22)*.7;vel.push([Math.cos(a)*s,.5+hash(i,23)*1.3,Math.sin(a)*s])}points=new THREE.Points(geometry,new THREE.PointsMaterial({color:0xe2fffc,map:droplet,size:.055,transparent:true,opacity:.7,depthWrite:false,blending:THREE.AdditiveBlending}));points.position.copy(ring.position);points.frustumCulled=false;scene.add(points)}
  ripples.push({ring,points,vel,start:time,energy});
 }
 function dolphinSplash(position,time,velocity,entering){
  const strength=entering?1:.68;ripple(position,time,entering?1.0:.72,false);
  const group=new THREE.Group();group.name='dolphin-splash';group.position.copy(position);scene.add(group);
  const foamMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,uniforms:{fade:{value:1},age:{value:0},strength:{value:strength}},vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,fragmentShader:`varying vec2 vUv;uniform float fade;uniform float age;uniform float strength;
   float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
   float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
   void main(){vec2 p=vUv*2.0-1.0;float mask=exp(-dot(p*vec2(1.05,.85),p*vec2(1.05,.85))*3.6);float turbulence=n(p*5.0+vec2(age*.5,-age*.6))*.6+n(p*12.0+3.2)*.4;float foam=smoothstep(.38,.67,turbulence)*mask;float bubbles=smoothstep(.62,.90,n(p*28.0+age*.3))*mask;float alpha=(foam*.48+bubbles*.20)*fade*strength;gl_FragColor=vec4(.70,.82,.80,alpha);}`});
  const foam=new THREE.Mesh(ringGeometry,foamMaterial);foam.rotation.x=-Math.PI/2;foam.position.y=.12;group.add(foam);
  const crownGeometry=new THREE.BufferGeometry(),crownPositions=new Float32Array(18*9);crownGeometry.setAttribute('position',new THREE.BufferAttribute(crownPositions,3).setUsage(THREE.DynamicDrawUsage));const crownMaterial=new THREE.MeshBasicMaterial({color:0xc5dbd8,transparent:true,opacity:.4,side:THREE.DoubleSide,depthWrite:false}),crown=new THREE.Mesh(crownGeometry,crownMaterial);crown.frustumCulled=false;group.add(crown);
  const count=56,dropGeometry=new THREE.BufferGeometry(),dropPositions=new Float32Array(count*3),velocities=[];dropGeometry.setAttribute('position',new THREE.BufferAttribute(dropPositions,3).setUsage(THREE.DynamicDrawUsage));
  for(let i=0;i<count;i++){const a=hash(i,time+81)*Math.PI*2,s=.25+hash(i,time+82)*.9;velocities.push(new THREE.Vector3(Math.cos(a)*s+velocity.x*.15,.65+hash(i,time+83)*1.25+Math.abs(velocity.y)*.16,Math.sin(a)*s+velocity.z*.15))}
  const drops=new THREE.Points(dropGeometry,new THREE.PointsMaterial({color:0xd3e3df,map:droplet,size:.075,transparent:true,opacity:.8,depthWrite:false}));drops.frustumCulled=false;group.add(drops);
  splashes.push({group,foam,foamMaterial,crown,crownGeometry,crownMaterial,drops,dropGeometry,velocities,start:time,strength});
 }
 function disposeSplash(s){scene.remove(s.group);s.foamMaterial.dispose();s.crownGeometry.dispose();s.crownMaterial.dispose();s.dropGeometry.dispose();s.drops.material.dispose()}
 function bulletImpact(position,time,direction){
  // A fast projectile makes a narrow, short-lived jet and a small patch of
  // aerated water, distinct from the broader splash of a breaching dolphin.
  ripple(position,time,.48,false);const group=new THREE.Group();group.name='bullet-water-impact';group.position.copy(position);scene.add(group);
  const foamMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,uniforms:{fade:{value:1}},vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,fragmentShader:`varying vec2 vUv;uniform float fade;float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}void main(){vec2 p=vUv*2.0-1.0;float r=length(p),speck=.45+.55*h(floor(p*18.0));float a=exp(-r*r*5.0)*speck*fade*.55;gl_FragColor=vec4(.74,.85,.82,a);}`});
  const foam=new THREE.Mesh(ringGeometry,foamMaterial);foam.rotation.x=-Math.PI/2;foam.position.y=.12;group.add(foam);
  const jetGeometry=new THREE.BufferGeometry();jetGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(12*9),3).setUsage(THREE.DynamicDrawUsage));const jetMaterial=new THREE.MeshBasicMaterial({color:0xd0e0dc,transparent:true,opacity:.45,side:THREE.DoubleSide,depthWrite:false}),jet=new THREE.Mesh(jetGeometry,jetMaterial);jet.frustumCulled=false;group.add(jet);
  const count=48,dropGeometry=new THREE.BufferGeometry(),velocities=[];dropGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(count*3),3).setUsage(THREE.DynamicDrawUsage));
  for(let i=0;i<count;i++){const a=hash(i,time+91)*Math.PI*2,s=.15+hash(i,time+92)*.65;velocities.push(new THREE.Vector3(Math.cos(a)*s+direction.x*.35,.55+hash(i,time+93)*1.15,Math.sin(a)*s+direction.z*.35))}
  const drops=new THREE.Points(dropGeometry,new THREE.PointsMaterial({color:0xd6e6e1,map:droplet,size:.045,transparent:true,opacity:.85,depthWrite:false}));drops.frustumCulled=false;group.add(drops);bulletSplashes.push({group,foam,foamMaterial,jet,jetGeometry,jetMaterial,drops,dropGeometry,velocities,start:time});
 }
 function disposeBulletSplash(s){scene.remove(s.group);s.foamMaterial.dispose();s.jetGeometry.dispose();s.jetMaterial.dispose();s.dropGeometry.dispose();s.drops.material.dispose()}
 function updateWake(position,time,strength,direction){wake.visible=strength>0;wake.position.set(position.x-direction.x*22.5,-.40,position.z-direction.y*22.5);wake.rotation.y=Math.atan2(-direction.x,-direction.y);wakeMaterial.uniforms.time.value=time;wakeMaterial.uniforms.strength.value=strength}
 function writeRipples(uniforms){
  for(let i=0;i<uniforms.length;i++){const ripple=ripples[ripples.length-1-i];if(ripple)uniforms[i].set(ripple.ring.position.x,ripple.ring.position.z,ripple.start,ripple.energy);else uniforms[i].set(0,0,-999,0)}
 }
 function explode(position,time,velocity=new THREE.Vector3()) {
  // The lake is also transparent. Draw the airborne blast after it so the
  // lake's large mesh cannot paint over the front half of the fireball.
  const group=new THREE.Group();group.renderOrder=1;group.position.copy(position);scene.add(group);
  const flash=new THREE.Sprite(new THREE.SpriteMaterial({map:glow,color:0xffd58a,transparent:true,opacity:1,blending:THREE.AdditiveBlending,depthWrite:false}));group.add(flash);
  const fireball=new THREE.Mesh(fireGeometry,fireMaterial());const localEye=new THREE.Vector3();fireball.onBeforeRender=(_renderer,_scene,camera)=>{camera.getWorldPosition(localEye);fireball.worldToLocal(localEye);fireball.material.uniforms.eyeLocal.value.copy(localEye)};group.add(fireball);
  const shock=new THREE.Sprite(new THREE.SpriteMaterial({map:shockMap,color:0xffbe73,transparent:true,opacity:.8,blending:THREE.AdditiveBlending,depthWrite:false}));group.add(shock);const light=new THREE.PointLight(0xff8b36,28,28);group.add(light);const parts=[];
  for(let i=0;i<32;i++){
   const a=hash(i,51)*Math.PI*2,z=hash(i,52)*2-1,r=Math.sqrt(1-z*z),speed=.6+hash(i,53)*2.7;
   const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:i<18?glow:smoke,color:i<18?(i%2?0xffa43e:0xffd67a):0x7d7770,transparent:true,opacity:.9,blending:i<18?THREE.AdditiveBlending:THREE.NormalBlending,depthWrite:false}));group.add(sprite);parts.push({sprite,velocity:new THREE.Vector3(Math.cos(a)*r,z,Math.sin(a)*r).multiplyScalar(speed),size:.7+hash(i,54)*1.8,fire:i<18});
  }
  const debris=[];for(let i=0;i<18;i++){const colors=[0xa2aaa1,0x4c5555,0x2d3435,0x8c9390],material=new THREE.MeshStandardMaterial({color:colors[i%colors.length],metalness:.55,roughness:.55}),piece=new THREE.Mesh(fragmentGeometries[i%fragmentGeometries.length],material),size=.34+hash(i,61)*.46;piece.scale.setScalar(size);group.add(piece);debris.push({piece,velocity:new THREE.Vector3((hash(i,63)-.5)*5,hash(i,64)*3,(hash(i,65)-.5)*5),spin:new THREE.Vector3(1+hash(i,66)*4,1+hash(i,67)*3,1+hash(i,68)*4),rotation:new THREE.Vector3(hash(i,69)*6.28,hash(i,70)*6.28,hash(i,71)*6.28)})}
  const sparkGeometry=new THREE.BufferGeometry(),sparkCount=72,sparkVelocity=[];sparkGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(sparkCount*3),3).setUsage(THREE.DynamicDrawUsage));
  for(let i=0;i<sparkCount;i++){const a=hash(i,121)*Math.PI*2,y=hash(i,122)*2-1,r=Math.sqrt(1-y*y),speed=2.5+hash(i,123)*7.5;sparkVelocity.push(new THREE.Vector3(Math.cos(a)*r,y,Math.sin(a)*r).multiplyScalar(speed))}
  const sparks=new THREE.Points(sparkGeometry,new THREE.PointsMaterial({map:glow,color:0xffbd68,size:.14,transparent:true,opacity:1,blending:THREE.AdditiveBlending,depthWrite:false}));sparks.frustumCulled=false;group.add(sparks);
  bursts.push({group,flash,fireball,shock,light,parts,debris,sparks,sparkGeometry,sparkVelocity,start:time,origin:position.clone(),velocity:velocity.clone()});return group;
 }
 function disposeBurst(b){scene.remove(b.group);b.group.traverse(o=>{if(o.material)o.material.dispose()});b.sparkGeometry.dispose()}
 function update(time) {
  let waterHits=0;const aircraftHits=[];for(let i=tracers.length-1;i>=0;i--){const p=tracers[i],u=(time-p.start)/p.duration;if(u>=1){if(p.waterHit){bulletImpact(p.to,p.start+p.duration,p.delta.clone().normalize());waterHits++}if(p.aircraftHit!==null)aircraftHits.push(p.aircraftHit);scene.remove(p.projectile,p.flash);p.trailMaterial.dispose();p.headGlow.material.dispose();p.flash.material.dispose();tracers.splice(i,1);continue}if(u<0)continue;
   p.flash.material.opacity=Math.max(0,.9-(time-p.start)*11);p.flash.position.copy(p.from).addScaledVector(p.sourceVelocity,Math.min(.08,time-p.start));p.projectile.position.copy(p.from).addScaledVector(p.delta,u);
  }
  for(let i=ripples.length-1;i>=0;i--){const r=ripples[i],age=time-r.start;if(age>2.4){scene.remove(r.ring);r.ring.material.dispose();if(r.points){scene.remove(r.points);r.points.geometry.dispose();r.points.material.dispose()}ripples.splice(i,1);continue}const scale=.10+age*1.65*r.energy;r.ring.scale.setScalar(scale);r.ring.material.uniforms.fade.value=Math.max(0,1-age/2.4);
   if(r.points){const a=r.points.geometry.attributes.position;for(let j=0;j<r.vel.length;j++){const v=r.vel[j];a.setXYZ(j,v[0]*age*r.energy,Math.max(0,v[1]*age-1.4*age*age)*r.energy,v[2]*age*r.energy)}a.needsUpdate=true;r.points.material.opacity=Math.max(0,.75-age*.7)}
  }
  for(let i=splashes.length-1;i>=0;i--){const s=splashes[i],age=time-s.start;if(age>2.4){disposeSplash(s);splashes.splice(i,1);continue}if(age<0)continue;
   const spread=1-Math.exp(-age*2.5);s.foam.scale.set(.24+spread*.32,.32+spread*.48,1);s.foamMaterial.uniforms.age.value=age;s.foamMaterial.uniforms.fade.value=Math.max(0,1-age/1.8);
   const progress=Math.min(1,age/.8),radius=.16+age*.52,peak=Math.sin(progress*Math.PI)*.42*s.strength,a=s.crownGeometry.attributes.position;
   for(let j=0;j<18;j++){const angle=j*Math.PI*2/18,half=.10+hash(j,41)*.05,h=peak*(.55+hash(j,42)*.8);a.setXYZ(j*3,Math.cos(angle-half)*radius,.10,Math.sin(angle-half)*radius);a.setXYZ(j*3+1,Math.cos(angle+half)*radius,.10,Math.sin(angle+half)*radius);a.setXYZ(j*3+2,Math.cos(angle)*(radius+.12),.10+h,Math.sin(angle)*(radius+.12))}a.needsUpdate=true;s.crownMaterial.opacity=.38*s.strength*(1-progress);
   const p=s.dropGeometry.attributes.position;for(let j=0;j<s.velocities.length;j++){const v=s.velocities[j],height=.12+v.y*age-1.65*age*age;p.setXYZ(j,v.x*age,height>.04?height:-100,v.z*age)}p.needsUpdate=true;s.drops.material.opacity=Math.max(0,1-age/1.15)*.78;
  }
  for(let i=bulletSplashes.length-1;i>=0;i--){const s=bulletSplashes[i],age=time-s.start;if(age>1.15){disposeBulletSplash(s);bulletSplashes.splice(i,1);continue}if(age<0)continue;
   s.foam.scale.setScalar(.12+age*.55);s.foamMaterial.uniforms.fade.value=Math.max(0,1-age/1.15);const progress=Math.min(1,age/.65),radius=.035+age*.18,height=Math.sin(progress*Math.PI)*.42,a=s.jetGeometry.attributes.position;
   for(let j=0;j<12;j++){const angle=j*Math.PI*2/12,half=.09+hash(j,51)*.07,h=height*(.55+hash(j,52)*.7);a.setXYZ(j*3,Math.cos(angle-half)*radius,.10,Math.sin(angle-half)*radius);a.setXYZ(j*3+1,Math.cos(angle+half)*radius,.10,Math.sin(angle+half)*radius);a.setXYZ(j*3+2,Math.cos(angle)*radius*1.6,.10+h,Math.sin(angle)*radius*1.6)}a.needsUpdate=true;s.jetMaterial.opacity=.28*(1-progress);
   const p=s.dropGeometry.attributes.position;for(let j=0;j<s.velocities.length;j++){const v=s.velocities[j],y=.12+v.y*age-2.1*age*age;p.setXYZ(j,v.x*age,y>.04?y:-100,v.z*age)}p.needsUpdate=true;s.drops.material.opacity=Math.max(0,1-age/.85)*.85;
  }
  for(let i=bursts.length-1;i>=0;i--){const b=bursts[i],age=time-b.start;if(age>5){disposeBurst(b);bursts.splice(i,1);continue}if(age<0)continue;
   // Wreckage retains the aircraft's momentum instead of hanging in the sky.
   b.group.position.copy(b.origin).addScaledVector(b.velocity,age*(1-.05*Math.min(age,3)));b.group.position.y-=age*age*.3;
   const flare=Math.exp(-age*4.5),expansion=1-Math.exp(-age*4.2);b.flash.scale.setScalar(1+Math.min(age,.6)*10);b.flash.material.opacity=flare;b.fireball.scale.setScalar(.35+expansion*6.2);b.fireball.material.uniforms.age.value=age;b.fireball.material.uniforms.fade.value=Math.max(0,1-age/2.5);b.shock.scale.setScalar(.5+age*8);b.shock.material.opacity=Math.max(0,.8-age*.7);b.light.intensity=85*flare;
   for(const p of b.parts){p.sprite.position.copy(p.velocity).multiplyScalar(age);p.sprite.position.y+=age*age*(p.fire?-.12:.1);p.sprite.scale.setScalar(p.size*(.4+age*1.2));p.sprite.material.opacity=p.fire?Math.max(0,1-age/1.8):Math.max(0,.65-age/7)}
   for(const d of b.debris){d.piece.position.copy(d.velocity).multiplyScalar(age);d.piece.position.y-=age*age*.75;d.piece.rotation.set(d.rotation.x+age*d.spin.x,d.rotation.y+age*d.spin.y,d.rotation.z+age*d.spin.z)}
   const sparkPos=b.sparkGeometry.attributes.position,drag=(1-Math.exp(-age*1.4))/1.4;for(let j=0;j<b.sparkVelocity.length;j++){const v=b.sparkVelocity[j];sparkPos.setXYZ(j,v.x*drag,v.y*drag-age*age*.8,v.z*drag)}sparkPos.needsUpdate=true;b.sparks.material.opacity=Math.exp(-age*2.2);
  }
  return {waterHits,aircraftHits};
 }
 function clear(){for(const p of tracers){scene.remove(p.projectile,p.flash);p.trailMaterial.dispose();p.headGlow.material.dispose();p.flash.material.dispose()}for(const r of ripples){scene.remove(r.ring);r.ring.material.dispose();if(r.points){scene.remove(r.points);r.points.geometry.dispose();r.points.material.dispose()}}for(const b of bursts)disposeBurst(b);for(const s of splashes)disposeSplash(s);for(const s of bulletSplashes)disposeBulletSplash(s);tracers.length=ripples.length=bursts.length=splashes.length=bulletSplashes.length=0}
 return {tracer,ripple,dolphinSplash,updateWake,writeRipples,explode,update,clear};
}
