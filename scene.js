import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createCombatEffects, PROJECTILE_SPEED } from './combat.js?revision=18';

const PI = Math.PI;
const clamp = THREE.MathUtils.clamp;
const smooth = (a,b,x) => {const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t)};
function hash(x,z) { const n=Math.sin(x*127.1+z*311.7)*43758.5453123; return n-Math.floor(n); }
function noise(x,z) {
  const ix=Math.floor(x), iz=Math.floor(z), fx=x-ix, fz=z-iz;
  const u=fx*fx*(3-2*fx), v=fz*fz*(3-2*fz);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(hash(ix,iz),hash(ix+1,iz),u),THREE.MathUtils.lerp(hash(ix,iz+1),hash(ix+1,iz+1),u),v);
}
function fbm(x,z) {let sum=0,amp=.5;for(let i=0;i<5;i++){sum+=noise(x,z)*amp;x=x*2.03+17.2;z=z*2.03-11.7;amp*=.5}return sum;}
function shoreline(z){const phase=(z-220)/1350*PI*2;return 60+14*Math.sin(phase*3)+7*Math.sin(phase*7);}
export function lakeSurfaceHeight(x,z,time){const t=time*.32;return -.5+Math.sin(x*.06+z*.045+t*1.1)*.06+Math.sin(x*.025-z*.045-t*.7)*.025;}
// Meet the moving lake surface at the time the projectile arrives, rather than
// placing every impact on an imaginary flat plane.
export function intersectLakeSurface(from,direction,time,maxDistance=110){
 if(direction.y>=-.001)return null;
 let distance=(-.5-from.y)/direction.y;
 for(let i=0;i<4;i++){const x=from.x+direction.x*distance,z=from.z+direction.z*distance,arrival=time+Math.max(.055,distance/PROJECTILE_SPEED);distance=(lakeSurfaceHeight(x,z,arrival)-from.y)/direction.y;}
 return distance>0&&distance<maxDistance?distance:null;
}
function lakebedShoal(x,z){const phase=(z-220)/1350*PI*2,axis=4+5*Math.sin(phase),along=Math.pow(.5+.5*Math.cos(phase+1.5),6);return 12.5*Math.exp(-(((x-axis)/16)**2))*along;}
export function lakebedHeight(x,z){const phase=(z-220)/1350*PI*2,depth=-22+21*Math.pow(Math.min(1,Math.abs(x)/shoreline(z)),1.5)+lakebedShoal(x,z),silt=(noise(x*.09+Math.cos(phase)*2,Math.sin(phase)*2)-.5)*1.2;return Math.min(-.8,depth+silt);}
// Match the actual triangles of the lakebed, so plants and rocks do not float
// above or disappear below its relatively broad mesh cells.
export function lakebedSurfaceHeight(x,z){
 const zz=z-Math.round(z/1350)*1350,u=(x+400)/2.5,v=(zz+3000)/12.5,i=Math.floor(u),j=Math.floor(v),fx=u-i,fz=v-j,x0=-400+i*2.5,z0=-3000+j*12.5;
 const a=lakebedHeight(x0,z0),b=lakebedHeight(x0+2.5,z0),c=lakebedHeight(x0,z0+12.5),d=lakebedHeight(x0+2.5,z0+12.5);
 return fx+fz<=1?a*(1-fx-fz)+b*fx+c*fz:b*(1-fz)+c*(1-fx)+d*(fx+fz-1);
}
export function terrainHeight(x,z) {
  const d=Math.max(0,Math.abs(x)-shoreline(z)), rise=smooth(0,45,d);
  const heightAt=zz=>{
   const broad=noise(x*.009+23,zz*.010-7);
   const warp=fbm(x*.006+5,zz*.006-11);
   const folded=1-Math.abs(2*noise(x*.016+warp*1.5,zz*.014-3)-1);
   const rock=fbm(x*.065+8,zz*.055-4);
   let peaks=0;const cell=Math.floor(zz/140),side=x<0?19:43;
   for(let j=cell-1;j<=cell+1;j++){
    const centerX=105+hash(j,side)*65,centerZ=j*140+hash(j,side+1)*100;
    const distance=Math.abs(Math.abs(x)-centerX)/76+Math.abs(zz-centerZ)/105;
    peaks=Math.max(peaks,(60+hash(j,side+2)*30)*Math.pow(Math.max(0,1-distance),1.15));
   }
   const ridges=7+48*Math.pow(broad,1.5)+45*Math.pow(folded,4)+8*rock;
   const erosion=Math.pow(1-Math.abs(2*noise(x*.055+warp*3,zz*.06-2)-1),6);
   // Broken ledges and long, uneven drainage channels give the large ridges
   // smaller features that survive a close camera pass.
   const ledges=Math.pow(1-Math.abs(2*noise(x*.105+warp*1.7,zz*.095-4)-1),3);
   const gullies=Math.pow(1-Math.abs(2*noise(zz*.057+warp*1.5,x*.019+13)-1),9);
   const drainage=Math.pow(1-Math.abs(2*noise(x*.018+warp*.55+7,zz*.105-5)-1),10);
   const rubble=noise(x*.23+7,zz*.23-8)-.5;
   return -2 + rise*(Math.max(ridges,peaks)+(rock-.5)*14-5*erosion+4.2*(ledges-.3)-5.5*gullies-4.2*drainage+2.4*rubble);
  };
  const value=heightAt(z);let land=value;
  // Blend both ends to the same cross-section so the valley can repeat without a gap.
  if(z < -1010) land=THREE.MathUtils.lerp(heightAt(220),value,smooth(-1130,-1010,z));
  if(z > 100) land=THREE.MathUtils.lerp(value,heightAt(220),smooth(100,220,z));
  // Below the waterline, meet the lakebed instead of leaving a submerged shelf.
  return THREE.MathUtils.lerp(lakebedHeight(x,z)-1.0,land,smooth(0,3,d));
}
export function terrainSurfaceHeight(x,z) {
 const side=x<0?-1:1,u=(Math.abs(x)-32)/218*220,v=(220-z)/1350*600;if(u<0||u>220||v<0||v>600)return terrainHeight(x,z);
 const i=Math.min(219,Math.floor(u)),j=Math.min(599,Math.floor(v)),fx=u-i,fz=v-j,x0=side*(32+i*218/220),x1=side*(32+(i+1)*218/220),z0=220-j*1350/600,z1=220-(j+1)*1350/600;
 const a=terrainHeight(x0,z0),b=terrainHeight(x1,z0),c=terrainHeight(x0,z1),d=terrainHeight(x1,z1);
 return fx+fz<=1?a*(1-fx-fz)+b*fx+c*fz:b*(1-fz)+c*(1-fx)+d*(fx+fz-1);
}
function mat(color, opts={}) {return new THREE.MeshStandardMaterial({color, roughness:.64, ...opts});}
function plushMaterial(color) {
 const material=mat(color,{roughness:1});
 material.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader.replace('void main() {','varying vec3 vPlushPos;\nvoid main() {').replace('#include <begin_vertex>','#include <begin_vertex>\nvPlushPos=position;');
  shader.fragmentShader='varying vec3 vPlushPos;\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
   float nap=fract(sin(dot(floor(vPlushPos*115.0),vec3(12.9898,78.233,37.719)))*43758.5453);
   diffuseColor.rgb*=.88+nap*.20;`);
 };
 return material;
}
// Painted metal is generated locally: faded pigment, fine scratches, chips and roughness.
function paintedMetal(color,seed) {
 const size=512,paint=document.createElement('canvas'),wear=document.createElement('canvas');paint.width=paint.height=wear.width=wear.height=size;
 const p=paint.getContext('2d'),w=wear.getContext('2d');p.fillStyle=color;p.fillRect(0,0,size,size);w.fillStyle='#b9b9b9';w.fillRect(0,0,size,size);
 const pixels=p.getImageData(0,0,size,size);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const i=(y*size+x)*4,grain=hash(x+seed*17,y+seed*31),mottle=noise(x*.035+seed,y*.035)*.08;
  const factor=.90+grain*.10+mottle;pixels.data[i]*=factor;pixels.data[i+1]*=factor;pixels.data[i+2]*=factor;
 }
 p.putImageData(pixels,0,0);
 // Small directional scratches follow the airflow; some cut through to the metal beneath.
 for(let i=0;i<520;i++){
  const x=hash(i,seed+1)*size,y=hash(i,seed+2)*size,length=2+hash(i,seed+3)*42,slant=(hash(i,seed+4)-.5)*3;
  const chip=hash(i,seed+5)>.88,alpha=chip? .30:.08+hash(i,seed+6)*.10;
  p.strokeStyle=chip?`rgba(197,197,181,${alpha})`:`rgba(31,28,25,${alpha})`;p.lineWidth=chip? .7+hash(i,seed+7):.35+hash(i,seed+7)*.45;p.beginPath();p.moveTo(x,y);p.lineTo(x+slant,y+length);p.stroke();
  w.strokeStyle=chip?'rgba(245,245,245,.45)':'rgba(235,235,235,.15)';w.lineWidth=p.lineWidth;w.beginPath();w.moveTo(x,y);w.lineTo(x+slant,y+length);w.stroke();
 }
 // Uneven grime, panel joins and tiny exposed fasteners.
 for(let i=0;i<20;i++){const x=hash(i,seed+21)*size,y=hash(i,seed+22)*size,r=8+hash(i,seed+23)*24,g=p.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,'rgba(49,39,31,.10)');g.addColorStop(1,'rgba(49,39,31,0)');p.fillStyle=g;p.fillRect(x-r,y-r,r*2,r*2)}
 for(let y=96;y<size;y+=128){p.strokeStyle='rgba(37,35,32,.14)';p.lineWidth=1;p.beginPath();p.moveTo(0,y);p.lineTo(size,y);p.stroke();p.strokeStyle='rgba(255,250,235,.08)';p.beginPath();p.moveTo(0,y+1);p.lineTo(size,y+1);p.stroke();for(let x=8;x<size;x+=21){p.fillStyle='rgba(32,29,27,.25)';p.fillRect(x,y-1,1.4,2)}}
 const map=new THREE.CanvasTexture(paint),rough=new THREE.CanvasTexture(wear);map.colorSpace=THREE.SRGBColorSpace;map.wrapS=map.wrapT=rough.wrapS=rough.wrapT=THREE.RepeatWrapping;map.anisotropy=rough.anisotropy=4;
 return new THREE.MeshStandardMaterial({color:0xffffff,map,roughnessMap:rough,bumpMap:rough,bumpScale:.018,metalness:.36,roughness:.77});
}
function rubberMaterial() {
 const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d');ctx.fillStyle='#252728';ctx.fillRect(0,0,256,256);
 for(let i=0;i<256;i+=16){ctx.strokeStyle='rgba(0,0,0,.32)';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i+20,256);ctx.stroke();ctx.strokeStyle='rgba(180,180,170,.08)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(i+2,0);ctx.lineTo(i+22,256);ctx.stroke()}
 const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;map.wrapS=map.wrapT=THREE.RepeatWrapping;return new THREE.MeshStandardMaterial({map,bumpMap:map,bumpScale:.025,roughness:1});
}
function registrationTexture() {
 const c=document.createElement('canvas');c.width=512;c.height=128;const ctx=c.getContext('2d');ctx.clearRect(0,0,512,128);ctx.font='bold 72px sans-serif';ctx.fillStyle='rgba(237,233,213,.76)';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('HB-PNG',256,67);
 for(let i=0;i<80;i++){const x=hash(i,211)*512,y=hash(i,212)*128;ctx.clearRect(x,y,1+hash(i,213)*4,1+hash(i,214)*2)}
 const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;return map;
}
function wovenMaterial(color) {
 const size=128,c=document.createElement('canvas');c.width=c.height=size;const ctx=c.getContext('2d');ctx.fillStyle='#e6ded1';ctx.fillRect(0,0,size,size);
 for(let i=0;i<size;i+=2){ctx.strokeStyle=i%4?'rgba(56,45,38,.15)':'rgba(255,255,255,.18)';ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i,size);ctx.stroke();ctx.beginPath();ctx.moveTo(0,i);ctx.lineTo(size,i);ctx.stroke()}
 const map=new THREE.CanvasTexture(c);map.wrapS=map.wrapT=THREE.RepeatWrapping;map.repeat.set(6,6);map.colorSpace=THREE.SRGBColorSpace;
 return new THREE.MeshStandardMaterial({color,map,bumpMap:map,bumpScale:.012,roughness:1,side:THREE.DoubleSide});
}
function silkMaterial() {
 const size=256,height=new Float32Array(size*size),colorData=new Uint8Array(size*size*4),roughData=new Uint8Array(size*size*4),normalData=new Uint8Array(size*size*4);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const warp=Math.sin(PI*2*x/16+.16*Math.sin(PI*2*y/128)),weft=Math.sin(PI*2*y/16+.12*Math.sin(PI*2*x/64)),twill=Math.sin(PI*2*(x/32+y/64)),slub=Math.sin(PI*2*x/128)*Math.sin(PI*2*y/64);
  const h=.5+.16*warp+.10*weft+.04*twill+.035*slub,i=(y*size+x)*4; height[y*size+x]=h;
  const light=clamp(.79+h*.30,0,1);colorData[i]=Math.round(246*light);colorData[i+1]=Math.round(230*light);colorData[i+2]=Math.round(213*light);colorData[i+3]=255;
  const rough=Math.round(clamp(.94-h*.10+.025*twill,0,1)*255);roughData[i]=roughData[i+1]=roughData[i+2]=rough;roughData[i+3]=255;
 }
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const dx=(height[y*size+(x+1)%size]-height[y*size+(x+size-1)%size])*2,dy=(height[((y+1)%size)*size+x]-height[((y+size-1)%size)*size+x])*2,n=new THREE.Vector3(-dx,-dy,1).normalize(),i=(y*size+x)*4;
  normalData[i]=Math.round((n.x*.5+.5)*255);normalData[i+1]=Math.round((n.y*.5+.5)*255);normalData[i+2]=Math.round((n.z*.5+.5)*255);normalData[i+3]=255;
 }
 const texture=data=>{const t=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(2,6);t.generateMipmaps=true;t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.LinearFilter;t.anisotropy=8;t.needsUpdate=true;return t};
 const map=texture(colorData),roughnessMap=texture(roughData),normalMap=texture(normalData);map.colorSpace=THREE.SRGBColorSpace;
 return new THREE.MeshPhysicalMaterial({color:0xe48150,map,roughnessMap,normalMap,normalScale:new THREE.Vector2(.55,.55),roughness:.96,metalness:0,sheen:.6,sheenColor:new THREE.Color('#e6a37d'),sheenRoughness:.86,anisotropy:.18,side:THREE.DoubleSide});
}
export function scarfBackSurface(x,y){
 const body=Math.sqrt(Math.max(0,1-((y-.65)/.75)**2)),head=Math.sqrt(Math.max(0,1-((y-1.43)/.58)**2)),rx=Math.max(.57*body,.57*head)+.035,rz=Math.max(.48*body,.51*head)+.035;
 return rz*Math.sqrt(Math.max(0,1-clamp(x/rx,-1,1)**2));
}
function scarfKnot(parent,material){
 // A gathered patch overlaps both tail roots and sits just above the curved
 // back of the collar. This covers the seam even when the loose cloth moves.
 const positions=[],uv=[],indices=[],nx=24,ny=12;
 for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++){
  const u=i/nx,v=j/ny,x=(u-.5)*.52,y=1.03+(v-.5)*.20+.012*Math.sin(u*PI*3)*Math.sin(v*PI),bulge=.015+.035*Math.sin(u*PI)*Math.sin(v*PI);
  positions.push(x,y,scarfBackSurface(x,y)+bulge);uv.push(u,v);
 }
 for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const a=j*(nx+1)+i,b=a+nx+1;indices.push(a,a+1,b,b,a+1,b+1)}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();mesh(geometry,material,parent);
}
function scarfCollar(parent,material){
 const group=new THREE.Group();group.position.set(0,1.03,0);parent.add(group);const positions=[],uv=[],indices=[],segments=72,rows=12;
 for(let j=0;j<=rows;j++)for(let i=0;i<=segments;i++){const a=i/segments*PI*2,v=j/rows,y=(v-.5)*.22+.005*Math.sin(a*6+v*3),worldY=1.03+y,body=Math.sqrt(Math.max(0,1-((worldY-.65)/.75)**2)),head=Math.sqrt(Math.max(0,1-((worldY-1.43)/.58)**2)),wrinkle=.006*Math.sin(v*PI*5+a*7),rx=Math.max(.57*body,.57*head)+.035+wrinkle,rz=Math.max(.48*body,.51*head,Math.cos(a)<0 ? .50 : 0)+.035+wrinkle;positions.push(Math.sin(a)*rx,y,Math.cos(a)*rz);uv.push(i/segments,v)}
 for(let j=0;j<rows;j++)for(let i=0;i<segments;i++){const a=j*(segments+1)+i,b=a+segments+1;indices.push(a,b,a+1,b,b+1,a+1)}const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();mesh(geometry,material,group);
 const stitches=[];for(const row of [1,rows-1])for(let i=0;i<segments;i++){const a=(row*(segments+1)+i)*3,b=a+3;for(const t of [.18,.55])stitches.push(THREE.MathUtils.lerp(positions[a],positions[b],t)*1.006,THREE.MathUtils.lerp(positions[a+1],positions[b+1],t),THREE.MathUtils.lerp(positions[a+2],positions[b+2],t)*1.006)}const seam=new THREE.BufferGeometry();seam.setAttribute('position',new THREE.Float32BufferAttribute(stitches,3));group.add(new THREE.LineSegments(seam,new THREE.LineBasicMaterial({color:0xe9b18e,transparent:true,opacity:.28})));
 scarfKnot(parent,material);
}
function mesh(geometry, material, parent, x=0,y=0,z=0) {const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);parent.add(m);return m;}
function ellipsoid(parent, material, pos, scale, segments=24) {const m=mesh(new THREE.SphereGeometry(1,segments,16),material,parent,...pos);m.scale.set(...scale);return m;}
function rod(parent,a,b,r,material) {const va=new THREE.Vector3(...a),vb=new THREE.Vector3(...b),dir=vb.clone().sub(va);const m=mesh(new THREE.CylinderGeometry(r,r,dir.length(),8),material,parent);m.position.copy(va.add(vb).multiplyScalar(.5));m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir.normalize());return m;}
function ring(parent,r,tube,material,x,y,z) {return mesh(new THREE.TorusGeometry(r,tube,8,40),material,parent,x,y,z);}

function cloudNoiseTexture(){
 const size=256,data=new Uint8Array(size*size*4),mod=(n,p)=>((n%p)+p)%p;
 const periodic=(x,y,period)=>{const ix=Math.floor(x),iy=Math.floor(y),u=x-ix,v=y-iy,s=u*u*(3-2*u),t=v*v*(3-2*v),h=(a,b)=>hash(mod(a,period),mod(b,period));return THREE.MathUtils.lerp(THREE.MathUtils.lerp(h(ix,iy),h(ix+1,iy),s),THREE.MathUtils.lerp(h(ix,iy+1),h(ix+1,iy+1),s),t)};
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){let value=0,weight=.55;for(const period of [4,8,16,32]){value+=periodic(x/size*period,y/size*period,period)*weight;weight*=.5}const i=(y*size+x)*4;data[i]=data[i+1]=data[i+2]=Math.round(clamp(value,0,1)*255);data[i+3]=255}
 const texture=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.generateMipmaps=true;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;texture.needsUpdate=true;return texture;
}
function makeSky(scene) {
 const uniforms={dawn:{value:0},sunDirection:{value:new THREE.Vector3(.09,.16,-1).normalize()},cloudMap:{value:cloudNoiseTexture()},eyeWorld:{value:new THREE.Vector3()},time:{value:0}};
 const sky=new THREE.Mesh(new THREE.SphereGeometry(700,48,24),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms,vertexShader:`varying vec3 vDir; void main(){vDir=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,fragmentShader:`
 varying vec3 vDir; uniform float dawn; uniform vec3 sunDirection; uniform sampler2D cloudMap;uniform vec3 eyeWorld;uniform float time;
 void main(){
  vec3 d=normalize(vDir); float h=clamp(d.y*.5+.5,0.,1.);
  vec3 night=mix(vec3(.12,.18,.25),vec3(.015,.035,.08),smoothstep(.46,.9,h));
  vec3 day=mix(vec3(.96,.57,.38),vec3(.21,.39,.58),smoothstep(.43,.88,h));
  vec3 col=mix(night,day,dawn);
  float sun=max(dot(d,sunDirection),0.); float glow=pow(sun,18.)*.18+pow(sun,85.)*.45;
  col+=mix(vec3(.12,.18,.3),vec3(1.,.38,.16),dawn)*glow*(.12+.88*dawn);
  float disk=smoothstep(.99996,.99998,sun)*dawn; col=mix(col,vec3(2.0,1.36,.82),disk);
  // A shallow ray march through a procedural cloud layer gives the sky depth.
  if(abs(d.y)>.002){
   float a=(125.0-eyeWorld.y)/d.y,b=(175.0-eyeWorld.y)/d.y;float start=max(0.0,min(a,b)),end=min(2800.0,max(a,b));
   if(end>start){float opacity=0.0;float light=0.0;float stepSize=(end-start)/10.0;
    for(int i=0;i<10;i++){float dist=start+(float(i)+.5)*stepSize;vec3 p=eyeWorld+d*dist;float altitude=clamp((p.y-125.0)/50.0,0.0,1.0);
     vec2 drift=vec2(time*.00028,-time*.00016);float broad=texture2D(cloudMap,p.xz*.0028+drift).r;float fine=texture2D(cloudMap,p.xz*.0084-drift*.6+vec2(.37,.13)).r;
     float shape=smoothstep(.48,.67,broad*.78+fine*.22)*smoothstep(0.0,.22,altitude)*(1.0-smoothstep(.68,1.0,altitude));
     float sampleAlpha=(1.0-exp(-shape*min(stepSize,120.0)*.018))*(1.0-opacity);opacity+=sampleAlpha;light+=sampleAlpha*(.72+altitude*.28);
    }
    vec3 cloudNight=vec3(.045,.065,.105),cloudDay=mix(vec3(.64,.70,.74),vec3(1.0,.66,.46),pow(sun,7.0)*.65);vec3 cloudColor=mix(cloudNight,cloudDay,dawn)*(.75+light*.4);col=mix(col,cloudColor,clamp(opacity*.85*smoothstep(.08,.35,abs(d.y)),0.0,.85));
   }
  }
  gl_FragColor=vec4(col,1.);
 }`})); scene.add(sky);
 const starGeo=new THREE.BufferGeometry(), positions=[];for(let i=0;i<850;i++){const a=hash(i,1)*PI*2,h=.04+hash(i,2)*.94,r=Math.sqrt(1-h*h)*500;positions.push(Math.cos(a)*r,h*500,Math.sin(a)*r)}starGeo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));const starMat=new THREE.PointsMaterial({color:0xdbeaff,size:1.05,transparent:true,opacity:.75,depthWrite:false,sizeAttenuation:false});const stars=new THREE.Points(starGeo,starMat);scene.add(stars);
 return {sky,stars,starMat,uniforms};
}
// Sample the same moving 125–175 unit cloud layer used by the sky, along a ray
// toward the sun. A few height samples approximate its light transmission.
const cloudShadowShader=`
 uniform sampler2D cloudShadowMap; uniform vec3 cloudSunDirection; uniform float cloudTime; uniform float cloudDay;
 float cloudOcclusion(vec3 worldPoint){
  if(worldPoint.y>=175.0)return 0.0;
  float sunY=max(.12,cloudSunDirection.y),density=0.0;vec2 drift=vec2(cloudTime*.00028,-cloudTime*.00016);
  for(int k=0;k<3;k++){
   float h=133.0+float(k)*17.0;if(h>worldPoint.y){vec2 p=worldPoint.xz+cloudSunDirection.xz*((h-worldPoint.y)/sunY);
    float broad=texture2D(cloudShadowMap,p*.0028+drift).r,fine=texture2D(cloudShadowMap,p*.0084-drift*.6+vec2(.37,.13)).r;
    float vertical=(k==1)?1.0:.65;density+=smoothstep(.48,.67,broad*.78+fine*.22)*vertical;}
  }
  return 1.0-exp(-density*min(50.0/(3.0*sunY),120.0)*.018);
 }`;
function addCloudShadows(material,uniforms){
 const previous=material.onBeforeCompile,cacheKey=material.customProgramCacheKey();
 material.onBeforeCompile=function(shader,renderer){
  previous.call(this,shader,renderer);shader.uniforms.cloudShadowMap=uniforms.cloudMap;shader.uniforms.cloudSunDirection=uniforms.sunDirection;shader.uniforms.cloudTime=uniforms.time;shader.uniforms.cloudDay=uniforms.dawn;
  shader.vertexShader='varying vec3 vCloudWorld;\n'+shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
   vec4 cloudWorld=vec4(transformed,1.0);
   #ifdef USE_INSTANCING
    cloudWorld=instanceMatrix*cloudWorld;
   #endif
   vCloudWorld=(modelMatrix*cloudWorld).xyz;`);
  shader.fragmentShader='varying vec3 vCloudWorld;\n'+cloudShadowShader+'\n'+shader.fragmentShader.replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
   float cloudTransmission=1.0-cloudOcclusion(vCloudWorld)*(.16+.54*cloudDay);reflectedLight.directDiffuse*=cloudTransmission;reflectedLight.directSpecular*=cloudTransmission;`);
 };material.customProgramCacheKey=()=>cacheKey+'|cloud-shadow-v1';
}
function addTreeWind(material,timeUniform){
 const previous=material.onBeforeCompile,cacheKey=material.customProgramCacheKey();material.onBeforeCompile=function(shader,renderer){
  previous.call(this,shader,renderer);shader.uniforms.treeTime=timeUniform;shader.vertexShader='uniform float treeTime;\n'+shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
   #ifdef USE_INSTANCING
    vec3 treeRoot=instanceMatrix[3].xyz;float phase=treeTime*.8+treeRoot.x*.11+treeRoot.z*.075,bend=pow(max(position.y,0.0),2.0)*.004;
    transformed.x+=(sin(phase)+.25*sin(phase*2.1))*bend;transformed.z+=cos(phase*.72)*bend*.45;
   #endif`);
 };material.customProgramCacheKey=()=>cacheKey+'|tree-wind-v1';
}

function barkMaterial() {
 const c=document.createElement('canvas');c.width=128;c.height=256;const ctx=c.getContext('2d');ctx.fillStyle='#574a3c';ctx.fillRect(0,0,128,256);
 for(let i=0;i<180;i++){const x=hash(i,151)*128,y=hash(i,152)*256,len=10+hash(i,153)*70;ctx.strokeStyle=i%3?'rgba(22,19,16,.25)':'rgba(170,145,110,.15)';ctx.lineWidth=.4+hash(i,154)*1.4;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+(hash(i,155)-.5)*5,y+len);ctx.stroke()}
 const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;map.wrapS=map.wrapT=THREE.RepeatWrapping;return new THREE.MeshStandardMaterial({map,bumpMap:map,bumpScale:.025,roughness:1});
}
function groundShadowMaterial() {
 const c=document.createElement('canvas');c.width=c.height=64;const ctx=c.getContext('2d'),g=ctx.createRadialGradient(32,32,1,32,32,31);g.addColorStop(0,'rgba(5,12,9,.55)');g.addColorStop(1,'rgba(5,12,9,0)');ctx.fillStyle=g;ctx.fillRect(0,0,64,64);const map=new THREE.CanvasTexture(c);return new THREE.MeshBasicMaterial({map,transparent:true,opacity:.65,depthWrite:false,side:THREE.DoubleSide});
}
function distantConifer(variant=0) {
 const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const ctx=canvas.getContext('2d');ctx.fillStyle='#294a37';ctx.fillRect(0,0,128,128);
 for(let i=0;i<1600;i++){const x=hash(i,170)*128,y=hash(i,171)*128,light=hash(i,172);ctx.strokeStyle=light>.7?'rgba(119,150,103,.35)':light>.3?'rgba(61,105,72,.45)':'rgba(18,48,31,.55)';ctx.lineWidth=.5+hash(i,173);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+(hash(i,174)-.5)*5,y+3+hash(i,175)*5);ctx.stroke()}
 // Break the broad branch cards into fine irregular needle clusters, leaving a
 // central spine. The mask is generated with the colour map, not a bitmap asset.
 const pixels=ctx.getImageData(0,0,128,128);for(let y=0;y<128;y++)for(let x=0;x<128;x++){
  const u=Math.abs((x-63.5)/63.5),v=y/127,edge=.93-.24*v-.11*Math.sin(v*57+variant*.7)-.06*Math.sin(v*113),ragged=1-smooth(edge-.15,edge,u),twigs=.5+.5*Math.sin(v*74+u*19+variant*.4),spine=1-smooth(.10,.24,u),alpha=ragged*Math.max(spine,smooth(.25,.63,twigs));pixels.data[(y*128+x)*4+3]=Math.round(alpha*255);
 }ctx.putImageData(pixels,0,0);
 const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;map.wrapS=map.wrapT=THREE.RepeatWrapping;map.anisotropy=4;
 const positions=[],uv=[],colors=[],base=new THREE.Color('#d9e6d3');
 for(let tier=0;tier<8;tier++){
  const y=.45+tier*.4,radius=(1.02+variant*.09)*(1-tier/(8.45+variant*.25));
  for(let branch=0;branch<7;branch++){
   const angle=branch*PI*2/7+tier*.79+variant*.41+(hash(tier+variant*9,branch+12)-.5)*.20,r=radius*(.68+hash(tier+variant*11,branch)*.62),spread=.22+hash(branch,tier+variant)*.15;
   const root=[0,y,0],tip=[Math.cos(angle)*r,y-(.16+variant*.035)*r,Math.sin(angle)*r],left=[Math.cos(angle-spread)*r*.6,y-.07*r,Math.sin(angle-spread)*r*.6],right=[Math.cos(angle+spread)*r*.6,y-.07*r,Math.sin(angle+spread)*r*.6],shade=.78+hash(tier+4+variant,branch)*.3;
   for(const v of [root,left,tip,root,tip,right])positions.push(...v);uv.push(.5,0,0,.5,.5,1,.5,0,.5,1,1,.5);for(let n=0;n<6;n++)colors.push(base.r*shade,base.g*shade,base.b*shade);
  }
 }
 // A compact three-dimensional inner canopy fills out the branch layers.
 for(let tier=0;tier<5;tier++){const y=.4+tier*.57,radius=.64*(1-tier/5.8),top=y+1.0;for(let b=0;b<8;b++){const a=b*PI/4+tier*.35,n=(b+1)*PI/4+tier*.35;positions.push(Math.cos(a)*radius,y,Math.sin(a)*radius,Math.cos(n)*radius,y,Math.sin(n)*radius,0,top,0);uv.push(b/8,0,(b+1)/8,0,(b+.5)/8,1);for(let k=0;k<3;k++)colors.push(base.r*.72,base.g*.72,base.b*.72)}}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();
 return {geometry,material:new THREE.MeshStandardMaterial({map,bumpMap:map,bumpScale:.015,vertexColors:true,roughness:1,side:THREE.DoubleSide,alphaTest:.3})};
}

function coniferGeometry() {
 const positions=[],colors=[],dark=new THREE.Color('#223d31'),light=new THREE.Color('#41634b');
 const put=(a,b,c,col)=>{for(const v of [a,b,c]){positions.push(...v);colors.push(col.r,col.g,col.b)}};
 for(let tier=0;tier<8;tier++){
  const y=.48+tier*.39,radius=1.12*(1-tier/8.7);
  for(let branch=0;branch<7;branch++){
   const angle=branch*PI*2/7+tier*.79,r=radius*(.86+hash(tier,branch)*.26),spread=.27+hash(branch,tier)*.12;
   const root=[0,y,0],tip=[Math.cos(angle)*r,y-.20*r,Math.sin(angle)*r],left=[Math.cos(angle-spread)*r*.62,y-.08*r,Math.sin(angle-spread)*r*.62],right=[Math.cos(angle+spread)*r*.62,y-.08*r,Math.sin(angle+spread)*r*.62],ridge=[Math.cos(angle)*r*.53,y+.11,Math.sin(angle)*r*.53];
   const shade=dark.clone().lerp(light,.18+tier*.045+hash(tier+11,branch)*.17);
   put(root,left,ridge,shade);put(left,tip,ridge,shade);put(root,ridge,right,shade);put(right,ridge,tip,shade);
  }
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();return geometry;
}
function rockTexture() {
 const size=512,c=document.createElement('canvas');c.width=c.height=size;const ctx=c.getContext('2d'),pixels=ctx.createImageData(size,size);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const broad=fbm(x*.035+31,y*.035-9),fine=noise(x*.17,y*.17),grain=hash(x+391,y+337),crack=Math.pow(1-Math.abs(noise(x*.055+4,y*.055-3)*2-1),12);
  const v=clamp(.34+broad*.56+fine*.14+grain*.09-crack*.22,0,1)*255,i=(y*size+x)*4;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=v;pixels.data[i+3]=255;
 }
 ctx.putImageData(pixels,0,0);const texture=new THREE.CanvasTexture(c);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=4;return texture;
}
function makeTerrain(scene,cloudUniforms) {
 const stone=new THREE.Color('#536469'), rock=new THREE.Color('#879294'), snow=new THREE.Color('#e6ece8'), low=new THREE.Color('#324c49');
 const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1}),rockMap=rockTexture();
 material.onBeforeCompile = shader => {
  shader.uniforms.rockMap={value:rockMap};
  shader.vertexShader=shader.vertexShader.replace('void main() {','varying vec3 vTerrainPos; varying vec3 vTerrainNormal;\nvoid main() {').replace('#include <begin_vertex>','#include <begin_vertex>\nvTerrainPos=(modelMatrix*vec4(transformed,1.0)).xyz;vTerrainNormal=normalize(mat3(modelMatrix)*normal);');
  shader.fragmentShader=`varying vec3 vTerrainPos; varying vec3 vTerrainNormal; uniform sampler2D rockMap;
    float terrainHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float terrainNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(terrainHash(i),terrainHash(i+vec2(1.,0.)),f.x),mix(terrainHash(i+vec2(0.,1.)),terrainHash(i+vec2(1.,1.)),f.x),f.y);}
  `+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
    if(vTerrainPos.y < -.5) discard;
    vec2 rockUV=vTerrainPos.xz*.42+vTerrainPos.y*vec2(.31,.17);
    float rockGrain=terrainNoise(rockUV)*.65+terrainNoise(rockUV*3.1)*.35;
    float strata=sin(vTerrainPos.y*1.25+terrainNoise(rockUV*.16)*5.0);
    float fissure=pow(1.0-abs(terrainNoise(rockUV*.35)*2.0-1.0),9.0);
    vec3 weights=pow(abs(normalize(vTerrainNormal)),vec3(4.0));weights/=max(.001,weights.x+weights.y+weights.z);
    float mineral=texture2D(rockMap,vTerrainPos.yz*.12).r*weights.x+texture2D(rockMap,vTerrainPos.xz*.12).r*weights.y+texture2D(rockMap,vTerrainPos.xy*.12).r*weights.z;
    float slope=1.0-abs(normalize(vTerrainNormal).y),joint=pow(1.0-abs(sin(vTerrainPos.y*.72+terrainNoise(rockUV*.12)*4.0)),18.0),drain=pow(1.0-abs(terrainNoise(vec2(vTerrainPos.z*.17,vTerrainPos.y*.028)+vTerrainPos.x*.008)*2.0-1.0),8.0);
    float snowMix=smoothstep(48.0,64.0,vTerrainPos.y);float rockFactor=.50+mineral*.70+rockGrain*.20+strata*.045-fissure*.12-slope*(joint*.08+drain*.12);float snowFactor=.86+mineral*.23;
    diffuseColor.rgb*=mix(rockFactor,snowFactor,snowMix);
    float ledgeSnow=smoothstep(53.0,72.0,vTerrainPos.y)*smoothstep(.30,.68,normalize(vTerrainNormal).y)*smoothstep(.32,.66,terrainNoise(rockUV*.10));diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.82,.88,.89)*(0.90+mineral*.14),ledgeSnow*.65);`)
   .replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
    normal=normalize(normal+vec3(dFdx(mineral),dFdy(mineral),0.0)*.55+vec3(dFdx(rockGrain),dFdy(rockGrain),0.0)*.25);`);
 };
 addCloudShadows(material,cloudUniforms);
 for(const side of [-1,1]){
  const nx=220,nz=600,verts=[],colors=[],indices=[];
  for(let j=0;j<=nz;j++) for(let i=0;i<=nx;i++){
   const x=side*(32+i/nx*218),z=220-j/nz*1350,y=terrainHeight(x,z);verts.push(x,y,z);
   const detail=fbm(x*.09,z*.09),steep=Math.abs(terrainHeight(x+1,z)-terrainHeight(x-1,z))*.5+Math.abs(terrainHeight(x,z+1)-terrainHeight(x,z-1))*.5;
   const c=low.clone().lerp(stone,smooth(4,23,y)).lerp(rock,smooth(23,56,y)*.7);
   const snowLine=49+(noise(x*.035,z*.035)-.5)*13+Math.min(steep*3,8);
   const snowCover=smooth(snowLine,snowLine+13,y)*(1-.72*smooth(1.7,4.0,steep));
   c.lerp(snow,snowCover);c.multiplyScalar(.85+detail*.27);colors.push(c.r,c.g,c.b);
  }
  for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){const a=j*(nx+1)+i,b=a+1,c=a+nx+1,d=c+1;if(side===1)indices.push(a,b,c,b,d,c);else indices.push(a,c,b,b,c,d)}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.setIndex(indices);geo.computeVertexNormals();const m=new THREE.Mesh(geo,material);scene.add(m);
 }
 // Dense stratified forest: detailed branches plus layered three-dimensional conifers.
 const rows=510,columns=42,maxTrees=rows*columns*2,detailCapacity=2200,trunk=new THREE.CylinderGeometry(.10,.20,1.1,6),foliageMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,side:THREE.DoubleSide}),trunkMat=barkMaterial();
 foliageMaterial.onBeforeCompile=shader=>{shader.vertexShader=shader.vertexShader.replace('void main() {','varying vec3 vNeedlePos;\nvoid main() {').replace('#include <begin_vertex>','#include <begin_vertex>\nvNeedlePos=position;');shader.fragmentShader='varying vec3 vNeedlePos;\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
  float needle=fract(sin(dot(floor(vNeedlePos*75.0),vec3(19.17,73.21,41.79)))*43758.5453);diffuseColor.rgb*=.83+needle*.28;`)};
 const variants=[0,1,2].map(distantConifer);for(const item of [...variants.map(v=>v.material),foliageMaterial])addTreeWind(item,cloudUniforms.time);for(const item of [...variants.map(v=>v.material),foliageMaterial,trunkMat])addCloudShadows(item,cloudUniforms);
 const distant=variants.map(far=>new THREE.InstancedMesh(far.geometry,far.material,maxTrees)),foliage=new THREE.InstancedMesh(coniferGeometry(),foliageMaterial,detailCapacity),trunks=new THREE.InstancedMesh(trunk,trunkMat,maxTrees),shadows=new THREE.InstancedMesh(new THREE.PlaneGeometry(2,2),groundShadowMaterial(),maxTrees),dummy=new THREE.Object3D(),shadowTransform=new THREE.Object3D(),up=new THREE.Vector3(0,0,1),groundNormal=new THREE.Vector3();let distantCount=[0,0,0],detailCount=0,trunkCount=0;
 for(let side of [-1,1])for(let row=0;row<rows;row++)for(let column=0;column<columns;column++){
  const key=row*columns+column+(side>0?30000:0),z=220-row*(1320/rows)+(hash(key,181)-.5)*2.2,x=side*(shoreline(z)+2+column*2.2+(hash(key,182)-.5)*1.8),y=terrainSurfaceHeight(x,z);
  if(y<.25||y>39||hash(key,183)<.045)continue;
  const scale=.82+hash(key,184)*1.08,sx=scale*(.82+hash(key,191)*.34),sy=scale*(.78+hash(key,192)*.48),sz=scale*(.82+hash(key,193)*.34);dummy.rotation.set((hash(key,194)-.5)*.045,hash(key,185)*PI*2,(hash(key,195)-.5)*.045);dummy.position.set(x,y,z);dummy.scale.set(sx,sy,sz);dummy.updateMatrix();
  const tint=.78+hash(key,186)*.28,color=new THREE.Color(tint*(.88+hash(key,196)*.16),tint*(.94+hash(key,187)*.10),tint*(.85+hash(key,197)*.16));
  if(hash(key,188)>.93&&detailCount<detailCapacity){foliage.setMatrixAt(detailCount,dummy.matrix);foliage.setColorAt(detailCount,color);detailCount++}
  else{const v=Math.floor(hash(key,190)*3),tree=distant[v];tree.setMatrixAt(distantCount[v],dummy.matrix);tree.setColorAt(distantCount[v],color);distantCount[v]++}
  dummy.position.y=y+.5*sy;dummy.updateMatrix();trunks.setMatrixAt(trunkCount,dummy.matrix);
  const dx=(terrainHeight(x+.5,z)-terrainHeight(x-.5,z)),dz=(terrainHeight(x,z+.5)-terrainHeight(x,z-.5));groundNormal.set(-dx,1,-dz).normalize();shadowTransform.position.set(x+groundNormal.x*.06,y+groundNormal.y*.06,z+groundNormal.z*.06);shadowTransform.quaternion.setFromUnitVectors(up,groundNormal);shadowTransform.scale.setScalar(scale*1.3);shadowTransform.updateMatrix();shadows.setMatrixAt(trunkCount++,shadowTransform.matrix);
 }
 distant.forEach((tree,i)=>tree.count=distantCount[i]);foliage.count=detailCount;trunks.count=trunkCount;shadows.count=trunkCount;for(const trees of [...distant,foliage,trunks,shadows]){trees.instanceMatrix.needsUpdate=true;if(trees.instanceColor)trees.instanceColor.needsUpdate=true;scene.add(trees)}
}
function makeWater(scene, sunDirection,cloudUniforms) {
 const size=256,data=new Uint8Array(size*size*4),height=new Float32Array(size*size),wrap=(n,p)=>((n%p)+p)%p;
 const periodic=(x,y,period)=>{const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy),h=(a,b)=>hash(wrap(a,period),wrap(b,period));return THREE.MathUtils.lerp(THREE.MathUtils.lerp(h(ix,iy),h(ix+1,iy),u),THREE.MathUtils.lerp(h(ix,iy+1),h(ix+1,iy+1),u),v)};
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const u=x/size,v=y/size,a=u*PI*2,b=v*PI*2,broad=periodic(u*4,v*4,4),mid=periodic(u*8,v*8,8),fine=periodic(u*16,v*16,16),micro=periodic(u*32,v*32,32);
  height[y*size+x]=broad*.31+mid*.24+fine*.15+micro*.08+.055*Math.sin(a*5+b*3+2*broad)+.025*Math.sin(a*17-b*11+mid);
 }
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){const dx=height[y*size+(x+1)%size]-height[y*size+(x+size-1)%size],dy=height[((y+1)%size)*size+x]-height[((y+size-1)%size)*size+x],i=(y*size+x)*4;data[i]=Math.round(clamp(128-dx*145,0,255));data[i+1]=Math.round(clamp(128-dy*145,0,255));data[i+2]=250;data[i+3]=255}
 const normals=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);normals.wrapS=normals.wrapT=THREE.RepeatWrapping;normals.generateMipmaps=true;normals.minFilter=THREE.LinearMipmapLinearFilter;normals.magFilter=THREE.LinearFilter;normals.anisotropy=8;normals.needsUpdate=true;
 const water=new Water(new THREE.PlaneGeometry(2400,6000,160,240),{textureWidth:768,textureHeight:768,waterNormals:normals,sunDirection:sunDirection.clone(),sunColor:0xffd0a9,waterColor:0x1b5255,distortionScale:.42,fog:true});
 Object.assign(water.material.uniforms,{cloudShadowMap:cloudUniforms.cloudMap,cloudSunDirection:cloudUniforms.sunDirection,cloudTime:cloudUniforms.time,cloudDay:cloudUniforms.dawn,wakeOrigin:{value:new THREE.Vector2()},wakeDirection:{value:new THREE.Vector2(0,-1)},wakeStrength:{value:0},interactionTime:{value:0},impactRipples:{value:Array.from({length:8},()=>new THREE.Vector4(0,0,-999,0))},dolphinWakes:{value:Array.from({length:8},()=>new THREE.Vector4())}});
 water.material.vertexShader=water.material.vertexShader.replace('void main() {',`void main() {
   vec4 flatWorld=modelMatrix*vec4(position,1.0);vec3 displaced=position;
   displaced.z+=sin(flatWorld.x*.06+flatWorld.z*.045+time*1.1)*.06+sin(flatWorld.x*.025-flatWorld.z*.045-time*.7)*.025;`).replaceAll('vec4( position, 1.0 )','vec4( displaced, 1.0 )');
 water.material.fragmentShader=cloudShadowShader+'\nuniform vec2 wakeOrigin; uniform vec2 wakeDirection; uniform float wakeStrength; uniform float interactionTime; uniform vec4 impactRipples[8]; uniform vec4 dolphinWakes[8];\n'+water.material.fragmentShader
  .replace('vec3 surfaceNormal = normalize( noise.xzy * vec3( 1.5, 1.0, 1.5 ) );',`vec3 surfaceNormal=normalize(noise.xzy*vec3(1.5,1.0,1.5));
   vec2 rel=worldPosition.xz-wakeOrigin,forward=normalize(wakeDirection),right=vec2(-forward.y,forward.x);float behind=-dot(rel,forward),across=dot(rel,right);
   float width=.65+max(behind,0.0)*.20,footprint=smoothstep(.2,1.8,behind)*(1.0-smoothstep(24.0,46.0,behind))*exp(-pow(across/max(width,.1),2.0))*wakeStrength;
   float lateral=sin(across*3.2-behind*.22+time*2.0),crossWave=sin(behind*2.1+across*.6-time*2.4);
   vec2 disturbed=(right*lateral*.045+forward*crossWave*.025)*footprint;
   for(int i=0;i<8;i++){float age=interactionTime-impactRipples[i].z;if(age>=0.0&&age<2.4){vec2 delta=worldPosition.xz-impactRipples[i].xy;float radius=length(delta),crest=.8*(.10+age*1.65*impactRipples[i].w),envelope=exp(-pow((radius-crest)/(.12+age*.07),2.0));disturbed+=delta/max(radius,.01)*sin((radius-crest)*8.0)*envelope*(1.0-age/2.4)*.045;}}
   float dolphinFoam=0.0;
   for(int i=0;i<8;i++){vec4 wake=dolphinWakes[i];if(wake.z>.001){vec2 delta=worldPosition.xz-wake.xy,fwd=vec2(-sin(wake.w),-cos(wake.w)),side=vec2(-fwd.y,fwd.x);float back=-dot(delta,fwd),acrossD=dot(delta,side),centre=exp(-dot(delta,delta)*3.0),crest=exp(-pow((abs(acrossD)-(.15+max(back,0.0)*.20))/.13,2.0))*smoothstep(0.0,.3,back)*(1.0-smoothstep(1.7,3.2,back));disturbed+=side*sign(acrossD)*(centre*.035+crest*.025)*wake.z;dolphinFoam+=(centre*.30+crest*.16)*wake.z;}}
   surfaceNormal=normalize(surfaceNormal+vec3(disturbed.x,0.0,disturbed.y));
   float wakeFoam=pow(max(0.0,crossWave),12.0)*footprint;`)
  .replace('sunLight( surfaceNormal, eyeDirection, 100.0, 2.0, 0.5, diffuseLight, specularLight );',`sunLight(surfaceNormal,eyeDirection,100.0,2.0,0.5,diffuseLight,specularLight);
   float cloudTransmission=1.0-cloudOcclusion(worldPosition.xyz)*(.16+.54*cloudDay);diffuseLight*=cloudTransmission;specularLight*=cloudTransmission;`)
  .replace('vec3 outgoingLight = albedo;',`float phase=(worldPosition.z-220.0)/1350.0*6.2831853;
   float bank=60.0+14.0*sin(phase*3.0)+7.0*sin(phase*7.0);
   float shallows=smoothstep(bank-15.0,bank,abs(worldPosition.x));
   float shoalAxis=4.0+5.0*sin(phase),shoal=12.5*exp(-pow((worldPosition.x-shoalAxis)/16.0,2.0))*pow(.5+.5*cos(phase+1.5),6.0);
   float bedDepth=max(.3,21.5-21.0*pow(min(1.0,abs(worldPosition.x)/bank),1.5)-shoal);
   albedo=mix(albedo,vec3(.035,.24,.22),shallows*.22*(1.0-reflectance));
   albedo+=vec3(.12,.18,.17)*wakeFoam*.08;
   albedo+=vec3(.16,.23,.21)*dolphinFoam;
   vec3 outgoingLight = albedo;`).replace('gl_FragColor = vec4( outgoingLight, alpha );',
    'if (eye.y < worldPosition.y) { outgoingLight = mix(outgoingLight, vec3(0.015,0.12,0.14), 0.65); } float transmission=exp(-bedDepth*.030/max(theta,.18)); float waterOpacity=clamp(1.0-transmission*(1.0-reflectance),.08,.98); gl_FragColor = vec4( outgoingLight, alpha * (eye.y < worldPosition.y ? 0.72 : waterOpacity) );');
 water.material.transparent=true;water.material.depthWrite=false;water.material.side=THREE.DoubleSide;
 water.rotation.x=-PI/2;water.position.set(0,-.5,-450);scene.add(water);return water;
}
function fishGeometry() {
 const sections=[[-.68,.015,.02],[-.52,.10,.075],[-.28,.16,.13],[.05,.17,.14],[.32,.11,.09],[.55,.035,.035]],segments=12,p=[],uv=[],colors=[],idx=[],back=new THREE.Color('#536d62'),belly=new THREE.Color('#ccd7c8');
 sections.forEach(([z,rx,ry],j)=>{for(let i=0;i<=segments;i++){const a=i/segments*PI*2,x=Math.cos(a)*rx,y=Math.sin(a)*ry;p.push(x,y,z);uv.push(i/segments,j/(sections.length-1));const c=back.clone().lerp(belly,clamp(.48-y*2.7,0,1));c.multiplyScalar(.92+hash(i,j)*.12);colors.push(c.r,c.g,c.b)}});
 for(let j=0;j<sections.length-1;j++)for(let i=0;i<segments;i++){const a=j*(segments+1)+i,b=a+segments+1;idx.push(a,a+1,b,b,a+1,b+1)}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(p,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(idx);geometry.computeVertexNormals();return geometry;
}
function fishScales() {
 const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;const ctx=canvas.getContext('2d');ctx.fillStyle='#e4e8df';ctx.fillRect(0,0,256,256);ctx.strokeStyle='rgba(55,75,65,.17)';ctx.lineWidth=1;
 for(let y=0;y<270;y+=12)for(let x=-12;x<270;x+=16){ctx.beginPath();ctx.arc(x+(Math.floor(y/12)%2)*8,y,7,.15*PI,.85*PI);ctx.stroke()}
 const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;map.wrapS=map.wrapT=THREE.RepeatWrapping;return map;
}
function aquaticMaterial(){
 const canvas=document.createElement('canvas');canvas.width=64;canvas.height=128;const ctx=canvas.getContext('2d');ctx.fillStyle='#c3d8b8';ctx.fillRect(0,0,64,128);
 for(let x=0;x<64;x+=3){ctx.strokeStyle=x%2?'rgba(39,82,45,.16)':'rgba(245,245,208,.12)';ctx.lineWidth=.5;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,128);ctx.stroke()}
 const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;const material=new THREE.MeshStandardMaterial({color:0x709a70,map,roughness:.92,emissive:0x102919,emissiveIntensity:.35,side:THREE.DoubleSide});
 material.onBeforeCompile=shader=>{shader.uniforms.plantTime={value:0};material.userData.shader=shader;shader.vertexShader='uniform float plantTime;\n'+shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
  #ifdef USE_INSTANCING
   float phase=plantTime*.8+(instanceMatrix[3].x+instanceMatrix[3].z)*.13+position.y*2.0;transformed.x+=sin(phase)*position.y*position.y*.08;transformed.z+=cos(phase*.8)*position.y*position.y*.05;
  #endif`)};return material;
}
function aquaticFernGeometry(){
 const positions=[],uv=[];
 // Each stem has paired, curved leaves around it, rather than a flat card.
 for(let stem=0;stem<3;stem++)for(let level=0;level<5;level++)for(const side of [-1,1]){
  const angle=stem*PI*2/3+level*.47,height=.13+level*.18,length=.31*(1-level*.11),wide=.065*(1-level*.08),dx=Math.cos(angle)*side,dz=Math.sin(angle)*side;
  const root=[0,height,0],mid=[dx*length*.55,height+.07,dz*length*.55],tip=[dx*length,height+.03,dz*length],left=[mid[0]-dz*wide,mid[1],mid[2]+dx*wide],right=[mid[0]+dz*wide,mid[1],mid[2]-dx*wide];
  for(const p of [root,left,tip,root,tip,right])positions.push(...p);uv.push(.5,0,0,.5,.5,1,.5,0,.5,1,1,.5);
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.computeVertexNormals();return geometry;
}
function makeUnderwater(scene) {
 const group=new THREE.Group();scene.add(group);
 const bedHeight=lakebedHeight;
 const p=[],colors=[],indices=[],nx=320,nz=480,deep=new THREE.Color('#365c5d'),sand=new THREE.Color('#a0b6a1'),stone=new THREE.Color('#718a7d');
 for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){
  const x=-400+i/nx*800,z=-3000+j/nz*6000,y=bedHeight(x,z),n=fbm(x*.10,z*.10);p.push(x,y,z);
  const c=deep.clone().lerp(stone,smooth(-20,-7,y)).lerp(sand,smooth(-10,-3,y)*.65);c.multiplyScalar(.94+n*.06);colors.push(c.r,c.g,c.b);
 }
 for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){const a=j*(nx+1)+i,b=a+1,c=a+nx+1,d=c+1;indices.push(a,c,b,b,c,d)}
 const bedGeometry=new THREE.BufferGeometry();bedGeometry.setAttribute('position',new THREE.Float32BufferAttribute(p,3));bedGeometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));bedGeometry.setIndex(indices);bedGeometry.computeVertexNormals();
 const bedMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,side:THREE.DoubleSide}),siltMap=rockTexture();
 bedMaterial.onBeforeCompile=shader=>{shader.uniforms.bedTime={value:0};shader.uniforms.bedLight={value:0};shader.uniforms.siltMap={value:siltMap};bedMaterial.userData.shader=shader;shader.vertexShader=shader.vertexShader.replace('void main() {','varying vec3 vBedPos;\nvoid main() {').replace('#include <begin_vertex>','#include <begin_vertex>\nvBedPos=position;');shader.fragmentShader=`varying vec3 vBedPos; uniform float bedTime; uniform float bedLight; uniform sampler2D siltMap;
  float bedHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float bedNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(bedHash(i),bedHash(i+vec2(1.,0.)),f.x),mix(bedHash(i+vec2(0.,1.)),bedHash(i+vec2(1.,1.)),f.x),f.y);}
 `+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
  float grain=fract(sin(dot(floor(vBedPos.xz*3.0),vec2(12.9898,78.233)))*43758.5453);
  vec2 c=vBedPos.xz*.35;float warpA=bedNoise(c*.9+vec2(bedTime*.06,-bedTime*.04)),warpB=bedNoise(c*1.2+vec2(-bedTime*.035,bedTime*.05));
  float ribbonA=pow(1.0-abs(sin(c.x+c.y*.41+(warpA-.5)*2.7+bedTime*.32)),10.0);
  float ribbonB=pow(1.0-abs(sin(c.y-c.x*.32+(warpB-.5)*2.7-bedTime*.27)),12.0);
  float caustic=(ribbonA*.65+ribbonB*.35)*smoothstep(-18.0,-2.0,vBedPos.y)*(.32+.68*bedLight);
  float silt=texture2D(siltMap,vBedPos.xz*.3).r,sedimentPatch=bedNoise(vBedPos.xz*.20),fine=bedNoise(vBedPos.xz*.77+4.0);
  float sandRipple=sin(vBedPos.x*.62+bedNoise(vBedPos.xz*.12)*2.3)*.5+.5;
  diffuseColor.rgb*=.76+silt*.32+grain*.08+(sedimentPatch-.5)*.22+(fine-.5)*.12+(sandRipple-.5)*.07;
  diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.65,.82,.69),smoothstep(.56,.76,sedimentPatch)*.34);
  diffuseColor.rgb+=vec3(.075,.12,.10)*caustic;`).replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
  normal=normalize(normal+vec3(dFdx(silt),dFdy(silt),0.0)*.3);`)};
 const bed=new THREE.Mesh(bedGeometry,bedMaterial);group.add(bed);
 // Clusters follow the shallows. Their feet sit on the rendered bed triangles.
 const pebbleCount=2400,pebbles=new THREE.InstancedMesh(new THREE.SphereGeometry(1,7,5),mat('#8e9a89',{roughness:1}),pebbleCount),dummy=new THREE.Object3D();
 for(let i=0;i<pebbleCount;i++){const z=(hash(i,102)-.5)*2700,x=(i%2?1:-1)*shoreline(z)*(.55+hash(i,101)*.30),y=lakebedSurfaceHeight(x,z),r=.035+hash(i,103)*.13;dummy.position.set(x,y+r*.22,z);dummy.scale.set(r,r*.4,r*.8);dummy.rotation.y=hash(i,104)*PI;dummy.updateMatrix();pebbles.setMatrixAt(i,dummy.matrix)}pebbles.instanceMatrix.needsUpdate=true;group.add(pebbles);
 const plantPositions=[],plantUV=[],plantIndices=[];for(let blade=0;blade<5;blade++){const a=blade*PI*2/5,height=.8+hash(blade,202)*.4;for(let j=0;j<=4;j++){const v=j/4,bend=v*v*.30,width=.09*(1-v),cx=Math.cos(a)*bend,cz=Math.sin(a)*bend;plantPositions.push(cx-Math.sin(a)*width,v*height,cz+Math.cos(a)*width,cx+Math.sin(a)*width,v*height,cz-Math.cos(a)*width);plantUV.push(0,v,1,v);if(j<4){const n=blade*10+j*2;plantIndices.push(n,n+1,n+2,n+1,n+3,n+2)}}}
 const plantShape=new THREE.BufferGeometry();plantShape.setAttribute('position',new THREE.Float32BufferAttribute(plantPositions,3));plantShape.setAttribute('uv',new THREE.Float32BufferAttribute(plantUV,2));plantShape.setIndex(plantIndices);plantShape.computeVertexNormals();
 const plantMaterial=aquaticMaterial(),fernShape=aquaticFernGeometry(),fernMaterial=aquaticMaterial(),plantCount=7280,plants=new THREE.InstancedMesh(plantShape,plantMaterial,plantCount),ferns=new THREE.InstancedMesh(fernShape,fernMaterial,plantCount),tint=new THREE.Color();let grassCount=0,fernCount=0;
 for(let i=0;i<plantCount;i++){
  const patch=Math.floor(i/26),side=patch%2?1:-1,centreZ=(hash(patch,221)-.5)*2700,centreX=side*shoreline(centreZ)*(.62+hash(patch,222)*.22),a=hash(i,223)*PI*2,r=Math.sqrt(hash(i,224))*4.5,x=centreX+Math.cos(a)*r,z=centreZ+Math.sin(a)*r,y=lakebedSurfaceHeight(x,z),scale=.32+hash(i,225)*.55;
  dummy.position.set(x,y-.035,z);dummy.scale.setScalar(scale);dummy.rotation.y=hash(i,226)*PI*2;dummy.updateMatrix();tint.setRGB(.78+hash(i,227)*.22,.86+hash(i,228)*.14,.75+hash(i,229)*.18);
  if(i%3===0){ferns.setMatrixAt(fernCount,dummy.matrix);ferns.setColorAt(fernCount++,tint)}else{plants.setMatrixAt(grassCount,dummy.matrix);plants.setColorAt(grassCount++,tint)}
 }plants.count=grassCount;ferns.count=fernCount;for(const item of [plants,ferns]){item.instanceMatrix.needsUpdate=true;item.instanceColor.needsUpdate=true;group.add(item)}
 const rockMaterial=new THREE.MeshStandardMaterial({color:0x8c9a8c,map:siltMap,bumpMap:siltMap,bumpScale:.075,roughness:1}),rockGeometry=new THREE.IcosahedronGeometry(1,2),rockVertices=rockGeometry.attributes.position;
 for(let i=0;i<rockVertices.count;i++){const x=rockVertices.getX(i),y=rockVertices.getY(i),z=rockVertices.getZ(i),rough=.82+fbm(x*2.8+19,z*2.8-7)*.48;rockVertices.setXYZ(i,(x+.12*z)*rough,y*(.86+rough*.14),z*rough)}rockGeometry.computeVertexNormals();
 const rocks=new THREE.InstancedMesh(rockGeometry,rockMaterial,1100);
 for(let i=0;i<1100;i++){const z=(hash(i,230)-.5)*2700,side=i%2?1:-1,x=side*shoreline(z)*(.55+hash(i,231)*.3),y=lakebedSurfaceHeight(x,z),scale=.16+Math.pow(hash(i,232),2)*.92;dummy.position.set(x,y+scale*.22,z);dummy.rotation.set(hash(i,233)*.5,hash(i,234)*PI*2,hash(i,235)*.35);dummy.scale.set(scale*(.8+hash(i,236)*.5),scale*(.35+hash(i,237)*.35),scale);dummy.updateMatrix();rocks.setMatrixAt(i,dummy.matrix);const shade=.7+hash(i,238)*.35;rocks.setColorAt(i,tint.setRGB(shade,shade*(.96+hash(i,239)*.08),shade*.92))}rocks.instanceMatrix.needsUpdate=true;rocks.instanceColor.needsUpdate=true;group.add(rocks);
 // A patchy glacial shoal crosses the deeper central channel. Populate it in
 // fixed world-space patches, with the bases matched to the rendered bed.
 const shoalRocks=new THREE.InstancedMesh(rockGeometry,rockMaterial,2200),shoalPlants=new THREE.InstancedMesh(plantShape,plantMaterial,2800),shoalFerns=new THREE.InstancedMesh(fernShape,fernMaterial,1600);let sr=0,sp=0,sf=0;
 for(let i=0;i<14000;i++){
  const z=(hash(i,310)-.5)*2700,x=(hash(i,311)-.5)*36,y=lakebedSurfaceHeight(x,z);if(y<-14.5)continue;
  if(i%3===0&&sr<2200){const scale=.10+Math.pow(hash(i,312),2)*.72;dummy.position.set(x,y+scale*.22,z);dummy.rotation.set(hash(i,313)*.35,hash(i,314)*PI*2,hash(i,315)*.3);dummy.scale.set(scale*(.60+hash(i,316)*.8),scale*(.32+hash(i,317)*.3),scale*(.65+hash(i,325)*.7));dummy.updateMatrix();shoalRocks.setMatrixAt(sr,dummy.matrix);const shade=.72+hash(i,318)*.30;shoalRocks.setColorAt(sr++,tint.setRGB(shade,shade*(.96+hash(i,319)*.08),shade*.91))}
  else {const fern=i%4===0,item=fern?shoalFerns:shoalPlants,index=fern?sf:sp;if(index>=(fern?1600:2800))continue;const scale=.55+hash(i,320)*.75;dummy.position.set(x,y-.035,z);dummy.rotation.set(0,hash(i,321)*PI*2,0);dummy.scale.setScalar(scale);dummy.updateMatrix();item.setMatrixAt(index,dummy.matrix);item.setColorAt(index,tint.setRGB(.74+hash(i,322)*.25,.82+hash(i,323)*.18,.73+hash(i,324)*.18));if(fern)sf++;else sp++}
 }
 shoalRocks.count=sr;shoalPlants.count=sp;shoalFerns.count=sf;for(const item of [shoalRocks,shoalPlants,shoalFerns]){item.instanceMatrix.needsUpdate=true;if(item.instanceColor)item.instanceColor.needsUpdate=true;group.add(item)}
 const closePlants=new THREE.InstancedMesh(plantShape,plantMaterial,170),closeFerns=new THREE.InstancedMesh(fernShape,fernMaterial,90),closeRocks=new THREE.InstancedMesh(rockGeometry,rockMaterial,46);for(const item of [closePlants,closeFerns,closeRocks]){item.visible=false;group.add(item)}
 const fishCount=240,body=new THREE.InstancedMesh(fishGeometry(),new THREE.MeshStandardMaterial({vertexColors:true,map:fishScales(),metalness:.25,roughness:.42,emissive:0x20352b,emissiveIntensity:.42}),fishCount);
 const tailGeo=new THREE.BufferGeometry();tailGeo.setAttribute('position',new THREE.Float32BufferAttribute([0,0,.5,0,.24,.85,0,0,.72,0,0,.5,0,0,.72,0,-.24,.85,0,.11,-.1,0,.29,.15,0,.10,.32,0,-.10,.1,0,-.21,.25,0,-.08,.37],3));tailGeo.computeVertexNormals();
 const tails=new THREE.InstancedMesh(tailGeo,new THREE.MeshStandardMaterial({color:0x718b7d,metalness:.15,roughness:.65,side:THREE.DoubleSide}),fishCount),eyes=new THREE.InstancedMesh(new THREE.SphereGeometry(1,8,6),mat('#182624',{roughness:.25}),fishCount*2);group.add(body,tails,eyes);
 const fish=[];for(let i=0;i<fishCount;i++){const school=Math.floor(i/24),lane=school%5,band=Math.floor(school/5);fish.push({school,x:-8+lane*4+(hash(i,122)-.5)*2.8,baseZ:-123+band*19+(lane%2)*4+(hash(i,124)-.5)*4.5,y:-1.6-hash(i,125)*4.5,scale:.22+hash(i,126)*.14,phase:hash(i,128)*PI*2});const shade=.80+hash(i,129)*.2;body.setColorAt(i,tint.setRGB(shade*.91,shade,shade*.95))}body.instanceColor.needsUpdate=true;
 let lastCloseAnchor=null;
 function update(time,flightZ,schoolAnchor=null,dawn=0){
  const bedZ=Math.round(flightZ/1350)*1350;if(bedMaterial.userData.shader){bedMaterial.userData.shader.uniforms.bedTime.value=time;bedMaterial.userData.shader.uniforms.bedLight.value=dawn}for(const material of [plantMaterial,fernMaterial])if(material.userData.shader)material.userData.shader.uniforms.plantTime.value=time;
  for(const item of [bed,pebbles,plants,ferns,rocks,shoalRocks,shoalPlants,shoalFerns])item.position.z=bedZ;
  const closeX=schoolAnchor===null?0:shoreline(schoolAnchor)-16,closeY=schoolAnchor===null?-5.5:Math.min(-2.5,lakebedSurfaceHeight(closeX,schoolAnchor)+2.4);
  for(const item of [closePlants,closeFerns,closeRocks])item.visible=schoolAnchor!==null;
  if(schoolAnchor!==null&&schoolAnchor!==lastCloseAnchor){
   for(const [item,count,seed,isRock] of [[closePlants,170,240,false],[closeFerns,90,250,false],[closeRocks,46,260,true]]){
    for(let i=0;i<count;i++){const x=Math.min(shoreline(schoolAnchor)-3,closeX+(hash(i,seed)-.5)*13),z=schoolAnchor-2+(hash(i,seed+1)-.5)*16,y=lakebedSurfaceHeight(x,z),scale=isRock? .18+hash(i,seed+2)*.8:.42+hash(i,seed+2)*.7;dummy.position.set(x,y+(isRock?scale*.22:-.035),z);dummy.rotation.set(isRock?hash(i,seed+3)*.5:0,hash(i,seed+4)*PI*2,0);dummy.scale.set(scale,isRock?scale*.5:scale,scale);dummy.updateMatrix();item.setMatrixAt(i,dummy.matrix)}item.instanceMatrix.needsUpdate=true;
   }lastCloseAnchor=schoolAnchor;
  }
  for(let i=0;i<fishCount;i++){
   const f=fish[i],closeSchool=schoolAnchor!==null&&i<48,anchor=schoolAnchor===null?0:schoolAnchor,phase=time*.19+f.school*.7,driftX=Math.sin(phase)*1.1,driftZ=Math.cos(phase)*1.3;
   const x=closeSchool?closeX+.9+(hash(i,270)-.5)*3.8+driftX:f.x+driftX,z=closeSchool?anchor-4+(hash(i,271)-.5)*4+driftZ:f.baseZ+Math.round((flightZ-f.baseZ)/120)*120+driftZ;
   const angle=Math.atan2(-Math.cos(phase)*1.1,Math.sin(phase)*1.3),y=closeSchool?Math.min(-.8,Math.max(lakebedSurfaceHeight(x,z)+.4,closeY+(hash(i,272)-.5)*1.2)):Math.min(-.8,Math.max(lakebedSurfaceHeight(x,z)+.4,f.y)),scale=f.scale*(closeSchool?1.15:1);
   dummy.position.set(x,y,z);dummy.rotation.set(0,angle,0);dummy.scale.setScalar(scale);dummy.updateMatrix();body.setMatrixAt(i,dummy.matrix);
   dummy.rotation.y=angle+Math.sin(time*5+f.phase)*.24;dummy.updateMatrix();tails.setMatrixAt(i,dummy.matrix);
   for(const side of [-1,1]){const ex=side*.075*scale,ez=-.49*scale;dummy.position.set(x+ex*Math.cos(angle)+ez*Math.sin(angle),y+.035*scale,z-ex*Math.sin(angle)+ez*Math.cos(angle));dummy.scale.setScalar(.022*scale);dummy.rotation.set(0,0,0);dummy.updateMatrix();eyes.setMatrixAt(i*2+(side>0?1:0),dummy.matrix)}
  }body.instanceMatrix.needsUpdate=true;tails.instanceMatrix.needsUpdate=true;eyes.instanceMatrix.needsUpdate=true;
 }
 return {group,update};
}
function makeMist(scene) {
 const c=document.createElement('canvas');c.width=128;c.height=128;const ctx=c.getContext('2d'),g=ctx.createRadialGradient(64,64,0,64,64,62);g.addColorStop(0,'rgba(225,238,232,.32)');g.addColorStop(.45,'rgba(215,232,230,.14)');g.addColorStop(1,'rgba(220,235,232,0)');ctx.fillStyle=g;ctx.fillRect(0,0,128,128);const tex=new THREE.CanvasTexture(c);
 const sprites=[];for(let i=0;i<42;i++){const material=new THREE.SpriteMaterial({map:tex,transparent:true,depthWrite:false,opacity:.36,color:0xdce9e8});const s=new THREE.Sprite(material);s.position.set((hash(i,4)-.5)*100,2+hash(i,7)*10,180-hash(i,8)*1200);s.scale.set(45+hash(i,9)*60,5+hash(i,10)*9,1);s.userData.baseZ=s.position.z;scene.add(s);sprites.push(s)}return sprites;
}
function makeClouds(scene) {
 const canvas=document.createElement('canvas');canvas.width=256;canvas.height=128;const ctx=canvas.getContext('2d'), image=ctx.createImageData(256,128);
 for(let y=0;y<128;y++)for(let x=0;x<256;x++){
  const dx=(x-128)/124,dy=(y-64)/56,falloff=Math.max(0,1-Math.sqrt(dx*dx+dy*dy));
  const n=fbm(x*.038+4,y*.055-9),alpha=Math.pow(falloff,1.2)*smooth(.24,.68,n)*.45;
  const i=(y*256+x)*4;image.data[i]=235;image.data[i+1]=239;image.data[i+2]=238;image.data[i+3]=Math.round(alpha*255);
 }
 ctx.putImageData(image,0,0);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;const clouds=[];
 for(let i=0;i<18;i++){const material=new THREE.SpriteMaterial({map:texture,transparent:true,opacity:.58,depthWrite:false,color:0xb8c6d0});const cloud=new THREE.Sprite(material);cloud.position.set((hash(i,57)-.5)*420,42+hash(i,58)*65,140-hash(i,59)*1200);cloud.scale.set(100+hash(i,60)*120,18+hash(i,61)*24,1);cloud.userData.baseZ=cloud.position.z;cloud.userData.baseX=cloud.position.x;scene.add(cloud);clouds.push(cloud)}return clouds;
}
function birdWingGeometry(side,outer=false){
 const p=[],colors=[],tri=(a,b,c,shade)=>{for(const v of [a,b,c]){p.push(v[0]*side,v[1],v[2]);colors.push(shade,shade,shade*.97)}};
 if(!outer){const root=[.01,0,-.075],front=[.28,.025,-.105],back=[.28,-.01,.115],inner=[.04,-.01,.105];tri(root,front,back,.86);tri(root,back,inner,.82)}
 else{const root=[0,0,-.105],tip=[.34,.015,.025],back=[0,-.01,.115];tri(root,tip,back,.72);for(let i=0;i<6;i++){const x=i*.052,z=.10-i*.009,length=.13-i*.011;tri([x,-.008,z],[x+.055,-.008,z-.012],[x+.075,-.012,z+length],.56+i*.025)}}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(p,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();return geometry;
}
function birdTailGeometry(){
 const p=[],colors=[];for(let i=0;i<7;i++){const x=(i-3)*.025,z=.29+(.055-Math.abs(i-3)*.012),shade=.58+Math.abs(i-3)*.035;for(const v of [[0,0,0],[x-.018,.006,z-.04],[x,.002,z],[0,0,0],[x,.002,z],[x+.018,.006,z-.04]]){p.push(...v);colors.push(shade,shade,shade*.97)}}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(p,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();return geometry;
}
function makeBirds(scene){
 const flockCount=5,perFlock=11,count=flockCount*perFlock,bodyMaterial=new THREE.MeshStandardMaterial({color:0xb2bcb4,roughness:.9}),wingMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.9,side:THREE.DoubleSide}),beakMaterial=mat('#807b69',{roughness:.8}),body=new THREE.InstancedMesh(new THREE.SphereGeometry(1,12,10),bodyMaterial,count),heads=new THREE.InstancedMesh(new THREE.SphereGeometry(1,10,8),bodyMaterial,count),beaks=new THREE.InstancedMesh(new THREE.ConeGeometry(1,1,6),beakMaterial,count),tails=new THREE.InstancedMesh(birdTailGeometry(),wingMaterial,count),left=new THREE.InstancedMesh(birdWingGeometry(-1),wingMaterial,count),right=new THREE.InstancedMesh(birdWingGeometry(1),wingMaterial,count),leftTip=new THREE.InstancedMesh(birdWingGeometry(-1,true),wingMaterial,count),rightTip=new THREE.InstancedMesh(birdWingGeometry(1,true),wingMaterial,count),dummy=new THREE.Object3D(),heading=new THREE.Quaternion(),flap=new THREE.Quaternion(),outerFlap=new THREE.Quaternion(),beakTurn=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-PI/2),axisY=new THREE.Vector3(0,1,0),axisZ=new THREE.Vector3(0,0,1),centres=[];
 const meshes=[body,heads,beaks,tails,left,right,leftTip,rightTip];for(const object of meshes){object.frustumCulled=false;scene.add(object)}
 function update(time,flightZ){
  let closest=null,closestDistance=Infinity;for(let f=0;f<flockCount;f++){
   const baseZ=-95-f*235,phase=time*.05+f*1.37,centre=new THREE.Vector3(38*Math.sin(phase),24+f*4+Math.sin(time*.15+f)*1.2,baseZ+Math.round((flightZ-baseZ)/1350)*1350+35*Math.cos(phase)),vx=1.9*Math.cos(phase),vz=-1.75*Math.sin(phase),yaw=Math.atan2(-vx,-vz);heading.setFromAxisAngle(axisY,yaw).multiply(flap.setFromAxisAngle(axisZ,-.09));centres[f]=centre;
   const distance=Math.abs(centre.z-flightZ);if(distance<closestDistance){closestDistance=distance;closest=centre}
   for(let j=0;j<perFlock;j++){
    const id=f*perFlock+j,rank=Math.ceil(j/2),side=j===0?0:(j%2?1:-1),size=.42+hash(id,401)*.14,offset=new THREE.Vector3(side*rank*(.48+hash(id,402)*.08),Math.sin(time*.7+id)*.08+(hash(id,403)-.5)*.12,rank*(.39+hash(id,404)*.07)).applyQuaternion(heading),pos=centre.clone().add(offset),beat=Math.sin(time*5.2+id*.71)*(.47+.11*Math.sin(time*.34+f));
    dummy.position.copy(pos);dummy.quaternion.copy(heading);dummy.scale.set(size*.09,size*.075,size*.23);dummy.updateMatrix();body.setMatrixAt(id,dummy.matrix);
    dummy.position.copy(pos).add(new THREE.Vector3(0,.025,-.22).multiplyScalar(size).applyQuaternion(heading));dummy.scale.setScalar(size*.075);dummy.updateMatrix();heads.setMatrixAt(id,dummy.matrix);
    dummy.position.copy(pos).add(new THREE.Vector3(0,.015,-.30).multiplyScalar(size).applyQuaternion(heading));dummy.quaternion.copy(heading).multiply(beakTurn);dummy.scale.set(size*.018,size*.11,size*.018);dummy.updateMatrix();beaks.setMatrixAt(id,dummy.matrix);
    dummy.position.copy(pos).add(new THREE.Vector3(0,-.005,.15).multiplyScalar(size).applyQuaternion(heading));dummy.quaternion.copy(heading);dummy.scale.setScalar(size);dummy.updateMatrix();tails.setMatrixAt(id,dummy.matrix);
    for(const [wing,tip,sign] of [[left,leftTip,-1],[right,rightTip,1]]){flap.setFromAxisAngle(axisZ,sign*beat);dummy.position.copy(pos);dummy.quaternion.copy(heading).multiply(flap);dummy.scale.setScalar(size);dummy.updateMatrix();wing.setMatrixAt(id,dummy.matrix);const joint=new THREE.Vector3(sign*.28*size,0,0).applyQuaternion(dummy.quaternion);dummy.position.add(joint);outerFlap.setFromAxisAngle(axisZ,sign*Math.sin(time*5.2+id*.71-.45)*.28);dummy.quaternion.multiply(outerFlap);dummy.updateMatrix();tip.setMatrixAt(id,dummy.matrix)}
   }
  }
  for(const object of meshes)object.instanceMatrix.needsUpdate=true;return closest;
 }
 return {update};
}
function dolphinBodyGeometry(){
 const sections=[[-1.43,.035,.028],[-1.30,.065,.043],[-1.15,.075,.055],[-1.04,.15,.10],[-.86,.23,.16],[-.67,.28,.22],[-.22,.33,.27],[.25,.30,.23],[.65,.19,.14],[1.0,.07,.06],[1.12,.035,.035]],segments=32,rings=48,positions=[],colors=[],indices=[],back=new THREE.Color('#71898d'),belly=new THREE.Color('#c4d2c9');
 for(let j=0;j<=rings;j++){const z=THREE.MathUtils.lerp(sections[0][0],sections.at(-1)[0],j/rings);let k=0;while(k<sections.length-2&&z>sections[k+1][0])k++;const a=sections[Math.max(0,k-1)],b=sections[k],c=sections[k+1],d=sections[Math.min(sections.length-1,k+2)],u=clamp((z-b[0])/(c[0]-b[0]),0,1),u2=u*u,u3=u2*u,sample=n=>.5*(2*b[n]+(-a[n]+c[n])*u+(2*a[n]-5*b[n]+4*c[n]-d[n])*u2+(-a[n]+3*b[n]-3*c[n]+d[n])*u3),rx=Math.max(.01,sample(1)),ry=Math.max(.01,sample(2));
  for(let i=0;i<=segments;i++){const angle=i/segments*PI*2,x=Math.cos(angle)*rx,y=Math.sin(angle)*ry,color=back.clone().lerp(belly,clamp(.48-y*2.2,0,1)*.75);positions.push(x,y,z);colors.push(color.r,color.g,color.b)}
 }
 for(let j=0;j<rings;j++)for(let i=0;i<segments;i++){const a=j*(segments+1)+i,b=a+segments+1;indices.push(a,a+1,b,b,a+1,b+1)}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}
function dolphinDorsalGeometry(){
 const shape=new THREE.Shape();shape.moveTo(.26,.17);shape.bezierCurveTo(.13,.23,.03,.53,-.13,.61);shape.bezierCurveTo(-.11,.44,-.26,.22,-.44,.17);shape.closePath();const geometry=new THREE.ExtrudeGeometry(shape,{depth:.035,bevelEnabled:true,bevelThickness:.012,bevelSize:.012,bevelSegments:2,curveSegments:12});geometry.rotateY(PI/2);geometry.translate(-.017,0,0);return geometry;
}
function dolphinFlipperGeometry(){const shape=new THREE.Shape();shape.moveTo(.18,-.34);shape.bezierCurveTo(.33,-.30,.61,-.10,.72,.15);shape.bezierCurveTo(.55,.14,.32,.27,.20,.42);shape.closePath();const geometry=new THREE.ExtrudeGeometry(shape,{depth:.025,bevelEnabled:true,bevelThickness:.01,bevelSize:.01,bevelSegments:2,curveSegments:16});geometry.rotateX(PI/2);geometry.translate(0,.0125,0);return geometry;}
function dolphinTailGeometry(){const shape=new THREE.Shape();shape.moveTo(0,0);shape.bezierCurveTo(-.18,.03,-.49,.08,-.66,.32);shape.bezierCurveTo(-.43,.28,-.20,.22,-.06,.24);shape.lineTo(0,.29);shape.lineTo(.06,.24);shape.bezierCurveTo(.20,.22,.43,.28,.66,.32);shape.bezierCurveTo(.49,.08,.18,.03,0,0);shape.closePath();const geometry=new THREE.ExtrudeGeometry(shape,{depth:.022,bevelEnabled:true,bevelThickness:.008,bevelSize:.008,bevelSegments:2,curveSegments:16});geometry.rotateX(PI/2);geometry.translate(0,.011,0);return geometry;}
export function surfaceCrossing(previous,current,surface=-.5){const before=previous-surface,after=current-surface;if(!((before<0&&after>=0)||(before>0&&after<=0)))return null;return {fraction:clamp(-before/(after-before),0,1),entering:after<before};}
function makeDolphins(scene,combat){
 const skin=new THREE.MeshPhysicalMaterial({vertexColors:true,roughness:.34,metalness:.04,clearcoat:.55,clearcoatRoughness:.3}),finMaterial=new THREE.MeshPhysicalMaterial({color:0x71898d,roughness:.4,clearcoat:.4,side:THREE.DoubleSide}),eyeMaterial=mat('#192b2d',{roughness:.2}),bodyGeometry=dolphinBodyGeometry(),dorsal=dolphinDorsalGeometry(),flipper=dolphinFlipperGeometry(),tailGeometry=dolphinTailGeometry(),animals=[];
 skin.onBeforeCompile=shader=>{shader.vertexShader='varying vec3 vSkinPos;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvSkinPos=position;');shader.fragmentShader='varying vec3 vSkinPos;\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
  float mottling=sin(vSkinPos.z*35.0+sin(vSkinPos.x*29.0))*sin(vSkinPos.y*42.0-vSkinPos.z*12.0);diffuseColor.rgb*=.97+.025*mottling;`)};
 for(let pod=0;pod<2;pod++)for(let i=0;i<4;i++){
  const group=new THREE.Group();group.scale.setScalar(.7+hash(i,pod+510)*.13);scene.add(group);mesh(bodyGeometry,skin,group);mesh(dorsal,finMaterial,group);for(const side of [-1,1]){const fin=mesh(flipper,finMaterial,group);fin.scale.x=side;fin.rotation.z=-side*.34;ellipsoid(group,eyeMaterial,[side*.16,.09,-.86],[.026,.026,.022],10);const seam=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(side*.075,-.035,-1.18),new THREE.Vector3(side*.13,-.045,-1.03),new THREE.Vector3(side*.17,-.06,-.88)]);group.add(new THREE.Line(seam,new THREE.LineBasicMaterial({color:0x43585b,transparent:true,opacity:.45})))}ellipsoid(group,eyeMaterial,[0,.19,-.69],[.045,.008,.025],10);
  const tail=new THREE.Group();tail.position.z=1.08;group.add(tail);mesh(tailGeometry,finMaterial,tail);animals.push({group,tail,pod,i,lastNose:null,wakePosition:new THREE.Vector3(),wakeStrength:0});
 }
 let lastTime=-1;const wakes=animals.map(()=>new THREE.Vector4());
 function update(time,flightZ){
  let focusIndex=0,best=Infinity,splashes=0;const centres=[],dt=time-lastTime,continuous=lastTime>=0&&dt>0&&dt<.5;
  for(let pod=0;pod<2;pod++){
   const offset=pod*120,raw=-time*2.5+offset,z=raw+Math.round((flightZ-raw)/240)*240,x=(pod?13:-13)+3*Math.sin(time*.08+pod*2),phase=((time+pod*3)%12+12)%12,score=Math.abs(z-flightZ)+(phase<3?-90:phase>9?-60:0);centres[pod]=new THREE.Vector3(x,0,z);if(score<best){best=score;focusIndex=pod}
  }
  for(let index=0;index<animals.length;index++){
   const animal=animals[index],{group,tail,pod,i}=animal,centre=centres[pod],phase=((time+pod*3+i*.38+hash(i,pod+518)*.19)%12+12)%12,u=clamp(phase/2.8,0,1),leaping=phase<2.8,height=1.85+hash(i,pod+519)*.35,h=leaping?Math.sin(PI*u)**2:0,vy=leaping?height*PI/2.8*Math.sin(2*PI*u):0,x=centre.x+(i%2?1:-1)*(.55+Math.floor(i/2)*.48)+.12*Math.sin(time*.32+i),z=centre.z+Math.floor(i/2)*1.4+(i%2 ? .22 : -.18);
   group.position.set(x,-1.05+height*h,z);group.rotation.set(Math.atan2(vy,2.5),Math.atan2(-.24*Math.cos(time*.08+pod*2),2.5),.045*Math.sin(time*.8+i),'YXZ');tail.rotation.x=Math.sin(time*4+i)*.17;
   group.updateMatrixWorld(true);const nose=group.localToWorld(new THREE.Vector3(0,0,-1.20)),tailPoint=group.localToWorld(new THREE.Vector3(0,0,1.03)),surface=lakeSurfaceHeight(group.position.x,group.position.z,time);
   if(continuous&&animal.lastNose&&nose.distanceTo(animal.lastNose)<6){const previousSurface=lakeSurfaceHeight(animal.lastNose.x,animal.lastNose.z,lastTime),currentSurface=lakeSurfaceHeight(nose.x,nose.z,time),crossing=surfaceCrossing(animal.lastNose.y-previousSurface,nose.y-currentSurface,0);if(crossing){const contact=animal.lastNose.clone().lerp(nose,crossing.fraction),velocity=nose.clone().sub(animal.lastNose).multiplyScalar(1/dt);combat.dolphinSplash(contact,time-dt*(1-crossing.fraction),velocity,crossing.entering);splashes++}}
   if(lastTime<0||dt<0||dt>=.5)animal.wakeStrength=0;animal.lastNose=nose;
   const low=Math.min(nose.y,tailPoint.y)-.12,high=Math.max(nose.y,tailPoint.y)+.12,distance=surface<low?low-surface:surface>high?surface-high:0,contactStrength=1-smooth(.04,.40,distance);
   if(contactStrength>.01){const fraction=Math.abs(nose.y-tailPoint.y)>.001?clamp((surface-tailPoint.y)/(nose.y-tailPoint.y),0,1):.5;animal.wakePosition.copy(tailPoint).lerp(nose,fraction);animal.wakeStrength=contactStrength}else if(continuous)animal.wakeStrength*=Math.exp(-dt*2.4);
   wakes[index].set(animal.wakePosition.x,animal.wakePosition.z,animal.wakeStrength,group.rotation.y);
  }lastTime=time;return {centres,focusIndex,splashes,wakes};
 }
 return {update};
}
function makeAircraftTrail(scene){
 const size=96,canvas=document.createElement('canvas');canvas.width=canvas.height=size;const ctx=canvas.getContext('2d'),pixels=ctx.createImageData(size,size);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){const dx=(x-size/2)/(size*.47),dy=(y-size/2)/(size*.47),edge=Math.max(0,1-Math.hypot(dx,dy)),grain=fbm(x*.075+13,y*.075-8),i=(y*size+x)*4;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=255;pixels.data[i+3]=Math.round(255*Math.pow(edge,1.8)*smooth(.18,.65,grain))}ctx.putImageData(pixels,0,0);const sprite=new THREE.CanvasTexture(canvas);
 const count=96,positions=new Float32Array(count*3),alphas=new Float32Array(count),sizes=new Float32Array(count),colours=new Float32Array(count*3),geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));geometry.setAttribute('particleAlpha',new THREE.BufferAttribute(alphas,1).setUsage(THREE.DynamicDrawUsage));geometry.setAttribute('particleSize',new THREE.BufferAttribute(sizes,1).setUsage(THREE.DynamicDrawUsage));geometry.setAttribute('particleColor',new THREE.BufferAttribute(colours,3).setUsage(THREE.DynamicDrawUsage));
 const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{sprite:{value:sprite},pointScale:{value:500}},vertexShader:`attribute float particleAlpha;attribute float particleSize;attribute vec3 particleColor;uniform float pointScale;varying float vAlpha;varying vec3 vColor;void main(){vAlpha=particleAlpha;vColor=particleColor;vec4 mv=modelViewMatrix*vec4(position,1.0);gl_PointSize=clamp(particleSize*pointScale/max(.1,-mv.z),1.0,90.0);gl_Position=projectionMatrix*mv;}`,fragmentShader:`uniform sampler2D sprite;varying float vAlpha;varying vec3 vColor;void main(){float a=texture2D(sprite,gl_PointCoord).a*vAlpha;if(a<.002)discard;gl_FragColor=vec4(vColor,a);}`});
 const points=new THREE.Points(geometry,material);points.frustumCulled=false;scene.add(points);const particles=Array.from({length:count},()=>({alive:false,position:new THREE.Vector3(),velocity:new THREE.Vector3(),age:0,life:0,mist:false}));let lastTime=null,exhaustClock=0,mistClock=0,next=0,serial=0;
 function spawn(plane,velocity,mist){
  const particle=particles[next++%count],side=serial++%2?1:-1,local=mist?new THREE.Vector3(side*.42,-.95,1.8):new THREE.Vector3(side*.96,.13,-2.45),forward=new THREE.Vector3(0,0,-1).applyQuaternion(plane.quaternion);
  particle.position.copy(local).multiplyScalar(.25).applyQuaternion(plane.quaternion).add(plane.position);if(mist)particle.position.y=-.34;
  particle.velocity.copy(velocity).multiplyScalar(mist? .12:.58).addScaledVector(forward,mist?-1.2:-1.0);particle.velocity.y+=mist? .55:.10;particle.age=0;particle.life=mist?1.1:1.65;particle.mist=mist;particle.alive=true;
 }
 function update(time,plane,velocity,wakeStrength,camera,pixelRatio){
  if(lastTime===null||time<lastTime||time-lastTime>.5){for(const p of particles)p.alive=false;exhaustClock=mistClock=0;lastTime=time}const dt=clamp(time-lastTime,0,.08);lastTime=time;
  const fast=velocity.length()>12;exhaustClock+=dt*(fast?14:7);while(exhaustClock>=1){spawn(plane,velocity,false);exhaustClock--}mistClock+=dt*8*wakeStrength;while(mistClock>=1){spawn(plane,velocity,true);mistClock--}
  for(let i=0;i<count;i++){const p=particles[i],j=i*3;if(p.alive){p.age+=dt;if(p.age>=p.life)p.alive=false;else{p.position.addScaledVector(p.velocity,dt);p.velocity.multiplyScalar(Math.exp(-dt*(p.mist?1.4:1.8)));p.velocity.y+=dt*(p.mist? .05:.07);const age=p.age/p.life;positions[j]=p.position.x;positions[j+1]=p.position.y;positions[j+2]=p.position.z;alphas[i]=Math.sin(PI*age)*(p.mist? .22:.13);sizes[i]=(p.mist? .16:.10)+age*(p.mist? .38:.28);colours[j]=p.mist? .72:.27;colours[j+1]=p.mist? .82:.29;colours[j+2]=p.mist? .80:.28}}if(!p.alive)alphas[i]=0}
  for(const key of ['position','particleAlpha','particleSize','particleColor'])geometry.attributes[key].needsUpdate=true;material.uniforms.pointScale.value=innerHeight*pixelRatio/(2*Math.tan(camera.fov*PI/360));
 }
 return {update};
}
const fuselageStations=[[-4.3,.66,.63,-.02],[-3.7,.89,.78,0],[-2.5,1.02,.83,0],[-.8,.97,.79,0],[.8,.85,.72,0],[2.6,.65,.58,.08],[4.4,.43,.42,.17],[5.8,.19,.27,.25],[6.1,.07,.12,.28]];
function fuselageProfile(z){
 let j=0;while(j<fuselageStations.length-2&&z>fuselageStations[j+1][0])j++;const a=fuselageStations[Math.max(0,j-1)],b=fuselageStations[j],c=fuselageStations[j+1],d=fuselageStations[Math.min(fuselageStations.length-1,j+2)],u=clamp((z-b[0])/(c[0]-b[0]),0,1),u2=u*u,u3=u2*u;
 const sample=k=>.5*((2*b[k])+(-a[k]+c[k])*u+(2*a[k]-5*b[k]+4*c[k]-d[k])*u2+(-a[k]+3*b[k]-3*c[k]+d[k])*u3);
 return [Math.max(.04,sample(1)),Math.max(.04,sample(2)),sample(3)];
}
function fuselageGeometry(){
 const p=[],uv=[],idx=[],segments=48,rings=64,z0=fuselageStations[0][0],z1=fuselageStations.at(-1)[0];
 for(let j=0;j<=rings;j++){const z=THREE.MathUtils.lerp(z0,z1,j/rings),[rx,ry,cy]=fuselageProfile(z);for(let i=0;i<=segments;i++){const a=i/segments*PI*2;p.push(Math.sin(a)*rx,Math.cos(a)*ry+cy,z);uv.push(i/segments,j/rings)}}
 for(let j=0;j<rings;j++)for(let i=0;i<segments;i++){let a=j*(segments+1)+i,b=a+segments+1;idx.push(a,b,a+1,b,b+1,a+1)}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g;
}
function propellerBladeGeometry(){
 const sections=[[.18,.10,.055,.34],[.55,.19,.055,.28],[1.1,.25,.052,.21],[1.7,.23,.045,.14],[2.15,.16,.033,.08],[2.5,.07,.02,.04],[2.58,.01,.006,.03]],segments=12,p=[],uv=[],colors=[],idx=[],dark=new THREE.Color('#20292a'),tip=new THREE.Color('#d7bc75');
 for(let j=0;j<sections.length;j++){const [radius,width,thick,twist]=sections[j],t=smooth(2.3,2.5,radius),color=dark.clone().lerp(tip,t);for(let i=0;i<=segments;i++){const a=i/segments*PI*2,chord=Math.cos(a)*width,depth=Math.sin(a)*thick;p.push(radius,chord*Math.cos(twist)-depth*Math.sin(twist),chord*Math.sin(twist)+depth*Math.cos(twist));uv.push(j/(sections.length-1),i/segments);colors.push(color.r,color.g,color.b)}}
 for(let j=0;j<sections.length-1;j++)for(let i=0;i<segments;i++){const a=j*(segments+1)+i,b=a+segments+1,c=a+1,d=b+1;idx.push(a,c,b,b,c,d)}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(p,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(idx);geometry.computeVertexNormals();return geometry;
}
function propellerBlurMaterial(){
 const size=256,data=new Uint8Array(size*size*4);for(let y=0;y<size;y++)for(let x=0;x<size;x++){const dx=(x-size/2)/(size/2),dy=(y-size/2)/(size/2),r=Math.hypot(dx,dy),edge=smooth(.12,.28,r)*(1-smooth(.95,1,r)),tip=smooth(.88,.96,r),i=(y*size+x)*4;data[i]=Math.round(83+tip*61);data[i+1]=Math.round(91+tip*48);data[i+2]=Math.round(88+tip*23);data[i+3]=Math.round(255*edge*(.045+tip*.065))}
 const map=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);map.colorSpace=THREE.SRGBColorSpace;map.generateMipmaps=true;map.minFilter=THREE.LinearMipmapLinearFilter;map.magFilter=THREE.LinearFilter;map.needsUpdate=true;return new THREE.MeshBasicMaterial({map,transparent:true,opacity:.8,side:THREE.DoubleSide,depthWrite:false});
}
function wingGeometry(span=7,rootFront=-1.05,rootBack=1.3,tipFront=-.55,tipBack=.65,thick=.16){
 const p=[],uv=[],idx=[],chord=[0,.015,.045,.1,.2,.35,.5,.7,.85,1],n=chord.length;
 const sections=[[-span,tipFront+.12,tipBack-.12],[-span*.97,tipFront,tipBack],[-span*.82,tipFront-.08,tipBack+.08],[0,rootFront,rootBack],[span*.82,tipFront-.08,tipBack+.08],[span*.97,tipFront,tipBack],[span,tipFront+.12,tipBack-.12]];
 for(const [x,f,b] of sections)for(const surface of [1,-1])for(const v of chord){
  // A symmetric airfoil rounds the leading edge and tapers to a fine trailing edge.
  const thickness=clamp((.2969*Math.sqrt(v)-.126*v-.3516*v*v+.2843*v*v*v-.1015*v*v*v*v)/.1,0,1),dihedral=.035*Math.pow(Math.abs(x)/span,2),z=THREE.MathUtils.lerp(f,b,v),y=dihedral+thick*(.5+surface*.5*thickness);p.push(x,y,z);uv.push((x+span)/(span*2),(z+1.5)/3);
 }
 const at=(s,surface,j)=>s*n*2+surface*n+j;
 for(let s=0;s<sections.length-1;s++)for(let j=0;j<n-1;j++){
  const a=at(s,0,j),b=at(s+1,0,j),c=at(s,0,j+1),d=at(s+1,0,j+1);idx.push(a,c,b,b,c,d);
  const e=at(s,1,j),f=at(s+1,1,j),g=at(s,1,j+1),h=at(s+1,1,j+1);idx.push(e,f,g,f,h,g);
 }
 for(let j=0;j<n-1;j++)for(const [s,reverse] of [[0,false],[sections.length-1,true]]){const a=at(s,0,j),b=at(s,1,j),c=at(s,0,j+1),d=at(s,1,j+1);if(reverse)idx.push(a,c,b,b,c,d);else idx.push(a,b,c,b,d,c)}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g;
}
function windscreenPoint(u,v){
 const q=u*2-1,x=q*.68,bottom=.76-.035*q*q,height=.70-.16*q*q,z=-.28+.18*v+.10*q*q;return new THREE.Vector3(x,bottom+height*v,z);
}
function makeWindscreen(parent,metal){
 const p=[],uv=[],indices=[],nx=32,ny=12;
 for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++){const point=windscreenPoint(i/nx,j/ny);p.push(point.x,point.y,point.z);uv.push(i/nx,j/ny)}
 for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const a=j*(nx+1)+i,b=a+nx+1;indices.push(a,a+1,b,b,a+1,b+1)}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(p,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();
 const glass=new THREE.MeshPhysicalMaterial({color:0xb7d7d8,metalness:.03,roughness:.12,clearcoat:1,clearcoatRoughness:.14,transparent:true,opacity:.27,side:THREE.DoubleSide,depthWrite:false});mesh(geometry,glass,parent);
 // The four pieces of edging use the same coordinates as the glass itself.
 for(const edge of ['left','right','top','bottom']){const points=[];for(let i=0;i<=20;i++){const t=i/20,u=edge==='left'?0:edge==='right'?1:t,v=edge==='top'?1:edge==='bottom'?0:t;points.push(windscreenPoint(u,v))}mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),32,.025,8,false),metal,parent)}
}
// Follow the same airfoil and section profile as the visible upper wing. The
// small seams and access covers therefore sit on the surface, including its
// tapered tips, instead of hovering above a flat rectangle.
function upperWingPoint(x,chord){
 const u=Math.abs(x)/7;let f,b;
 if(u<=.82){f=THREE.MathUtils.lerp(-1.05,-.63,u/.82);b=THREE.MathUtils.lerp(1.3,.73,u/.82)}
 else if(u<=.97){const t=(u-.82)/.15;f=THREE.MathUtils.lerp(-.63,-.55,t);b=THREE.MathUtils.lerp(.73,.65,t)}
 else{const t=clamp((u-.97)/.03,0,1);f=THREE.MathUtils.lerp(-.55,-.43,t);b=THREE.MathUtils.lerp(.65,.53,t)}
 const thickness=clamp((.2969*Math.sqrt(chord)-.126*chord-.3516*chord**2+.2843*chord**3-.1015*chord**4)/.1,0,1);
 return new THREE.Vector3(x,-.2+.035*u*u+.16*(.5+.5*thickness),THREE.MathUtils.lerp(f,b,chord)+.15);
}
function addWingConstruction(plane,metal){
 const seamMat=new THREE.LineBasicMaterial({color:0x4f504b,transparent:true,opacity:.48}),seams=[];
 const segment=(a,b)=>{seams.push(a.x,a.y+.004,a.z,b.x,b.y+.004,b.z)};
 for(const side of [-1,1]){
  for(let i=0;i<48;i++){const a=side*(1.85+i*4.9/48),b=side*(1.85+(i+1)*4.9/48);segment(upperWingPoint(a,.77),upperWingPoint(b,.77))}
  for(const x of [1.85,4.3,6.72])for(let i=0;i<12;i++){segment(upperWingPoint(side*x,.77+i*.22/12),upperWingPoint(side*x,.77+(i+1)*.22/12))}
  const cover=upperWingPoint(side*2.55,.42),disc=mesh(new THREE.CircleGeometry(.14,32),metal,plane,cover.x,cover.y+.006,cover.z);disc.rotation.x=-PI/2;
  const rim=mesh(new THREE.TorusGeometry(.14,.008,6,32),metal,plane,cover.x,cover.y+.009,cover.z);rim.rotation.x=PI/2;
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(seams,3));plane.add(new THREE.LineSegments(geometry,seamMat));
}
function addFuselageConstruction(plane,metal){
 const seams=[],rivets=new THREE.InstancedMesh(new THREE.SphereGeometry(1,7,5),metal,144),dummy=new THREE.Object3D();let count=0;
 const surface=(z,a,offset=.006)=>{const [rx,ry,cy]=fuselageProfile(z);return new THREE.Vector3(Math.sin(a)*(rx+offset),Math.cos(a)*(ry+offset)+cy,z)};
 const line=(p,q)=>seams.push(p.x,p.y,p.z,q.x,q.y,q.z);
 for(const side of [-1,1]){
  for(const angle of [side*1.02,side*2.03])for(let i=0;i<35;i++){const a=-3.75+i*1.45/35,b=-3.75+(i+1)*1.45/35;line(surface(a,angle),surface(b,angle))}
  for(const z of [-3.75,-2.3])for(let i=0;i<30;i++)line(surface(z,side*(1.02+i*1.01/30)),surface(z,side*(1.02+(i+1)*1.01/30)));
  for(const angle of [side*1.05,side*2.0])for(let i=0;i<22;i++){
   const z=-3.70+i*1.35/21,p=surface(z,angle,.012);dummy.position.copy(p);dummy.scale.set(.018,.018,.018);dummy.updateMatrix();rivets.setMatrixAt(count++,dummy.matrix);
  }
  for(const z of [-3.7,-2.35])for(let i=1;i<13;i++){
   const p=surface(z,side*(1.05+i*.95/13),.012);dummy.position.copy(p);dummy.scale.set(.018,.018,.018);dummy.updateMatrix();rivets.setMatrixAt(count++,dummy.matrix);
  }
 }
 rivets.count=count;rivets.instanceMatrix.needsUpdate=true;plane.add(rivets);const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(seams,3));plane.add(new THREE.LineSegments(g,new THREE.LineBasicMaterial({color:0x261c19,transparent:true,opacity:.36})));
}
function makeCowling(plane,prop,red,dark,metal){
 const cowling=mesh(new THREE.CylinderGeometry(.66,.69,.22,48),red,plane,0,-.02,-4.24);cowling.rotation.x=PI/2;
 const face=mesh(new THREE.CircleGeometry(.65,48),red,plane,0,-.02,-4.36);face.rotation.y=PI;
 ring(plane,.65,.027,metal,0,-.02,-4.37);
 // A pair of recessed cooling intakes and grille bars give the front cowling
 // a real function; the spinner covers the blade roots in front of them.
 for(const side of [-1,1]){
  ellipsoid(plane,dark,[side*.42,-.025,-4.375],[.14,.23,.028],20);
  for(let i=-2;i<=2;i++)rod(plane,[side*.42-.085,-.025+i*.065,-4.41],[side*.42+.085,-.025+i*.065,-4.41],.008,metal);
 }
 for(let i=0;i<32;i++){const a=i/32*PI*2;ellipsoid(plane,metal,[Math.sin(a)*.602,Math.cos(a)*.584-.02,-4.385],[.014,.014,.009],8)}
 const profile=[[0,-.53],[.11,-.49],[.22,-.38],[.30,-.23],[.34,-.07],[.34,.05],[.30,.13]].map(([r,z])=>new THREE.Vector2(r,z));
 const spinner=mesh(new THREE.LatheGeometry(profile,48),metal,prop,0,0,-.08);spinner.rotation.x=PI/2;
 const seam=ring(prop,.32,.014,dark,0,0,.03);seam.rotation.z=0;
}
function makePlane(scene) {
 const plane=new THREE.Group();scene.add(plane);
 const red=paintedMetal('#b94531',11), cream=paintedMetal('#e5decb',23), dark=paintedMetal('#29343a',33),metal=paintedMetal('#a6aaa5',44), black=mat('#182025',{roughness:.92}),rubber=rubberMaterial(),brown=wovenMaterial('#594036'), scarfMat=silkMaterial();metal.metalness=.8;
 mesh(fuselageGeometry(),red,plane);
 const panelLines=new THREE.LineBasicMaterial({color:0x34231e,transparent:true,opacity:.38}),panelGeometry=new THREE.BufferGeometry(),panelPositions=[];
 for(const z of [-3.7,-2.5,-.8,.8,2.6,4.4]){const [rx,ry,cy]=fuselageProfile(z);for(let i=0;i<64;i++){const a=i/64*PI*2,b=(i+1)/64*PI*2;panelPositions.push(Math.sin(a)*rx*1.004,Math.cos(a)*ry*1.004+cy,z,Math.sin(b)*rx*1.004,Math.cos(b)*ry*1.004+cy,z)}}panelGeometry.setAttribute('position',new THREE.Float32BufferAttribute(panelPositions,3));plane.add(new THREE.LineSegments(panelGeometry,panelLines));
 const prop=new THREE.Group();prop.position.set(0,0,-4.55);plane.add(prop);
 makeCowling(plane,prop,red,dark,metal);addFuselageConstruction(plane,metal);
 const bladeGeometry=propellerBladeGeometry(),bladeMaterial=paintedMetal('#e4e3d7',51);bladeMaterial.vertexColors=true;bladeMaterial.transparent=true;bladeMaterial.opacity=.10;bladeMaterial.depthWrite=false;for(const side of [-1,1]){const blade=mesh(bladeGeometry,bladeMaterial,prop);if(side<0)blade.rotation.z=PI}
 const blur=mesh(new THREE.CircleGeometry(2.65,64),propellerBlurMaterial(),plane,0,0,-4.5);
 const wing=mesh(wingGeometry(),cream,plane,0,-.2,.15);
 addWingConstruction(plane,metal);
 const wingRivets=new THREE.InstancedMesh(new THREE.SphereGeometry(1,6,4),mat('#92948a',{metalness:.7,roughness:.54}),100),rivetTransform=new THREE.Object3D();let rivetIndex=0;
 for(const side of [-1,1])for(const chord of [.25,.72])for(let i=0;i<25;i++){
  const x=side*(.85+i*.225),t=Math.abs(x)/7,f=THREE.MathUtils.lerp(-1.05,-.55,t),b=THREE.MathUtils.lerp(1.3,.65,t),thickness=clamp((.2969*Math.sqrt(chord)-.126*chord-.3516*chord*chord+.2843*chord**3-.1015*chord**4)/.1,0,1);
  rivetTransform.position.set(x,-.2+.035*t*t+.16*(.5+.5*thickness)+.005,THREE.MathUtils.lerp(f,b,chord)+.15);rivetTransform.scale.set(.015,.007,.015);rivetTransform.updateMatrix();wingRivets.setMatrixAt(rivetIndex++,rivetTransform.matrix);
 }wingRivets.instanceMatrix.needsUpdate=true;plane.add(wingRivets);
 for(const side of [-1,1]){
  const stripe=mesh(new THREE.BoxGeometry(.23,.035,1.62),red,plane,side*5.7,.03,.15);
  rod(plane,[side*.65,-.4,.4],[side*4.25,-.09,.7],.055,metal);
  rod(plane,[side*.8,-.55,1.5],[side*3.9,-.08,.8],.035,dark);
  const wheel=mesh(new THREE.CylinderGeometry(.48,.48,.25,24),rubber,plane,side*1.5,-1.35,-.15);wheel.rotation.z=PI/2;
  const hub=mesh(new THREE.CylinderGeometry(.18,.18,.27,20),metal,plane,side*1.5,-1.35,-.15);hub.rotation.z=PI/2;
  rod(plane,[side*.55,-.5,-.15],[side*1.5,-1.28,-.15],.075,metal);
  rod(plane,[side*.7,-.5,1.3],[side*1.5,-1.28,-.15],.05,dark);
 }
 mesh(wingGeometry(2.45,-.5,.65,-.3,.4,.1),cream,plane,0,.45,5.1);
 const tailShape=new THREE.Shape();tailShape.moveTo(0,0);tailShape.lineTo(0,1.85);tailShape.quadraticCurveTo(.1,2.15,.45,1.8);tailShape.lineTo(1.1,0);tailShape.closePath();const tail=mesh(new THREE.ExtrudeGeometry(tailShape,{depth:.12,bevelEnabled:true,bevelThickness:.04,bevelSize:.04,bevelSegments:2}),red,plane,-.06,.3,5.25);tail.rotation.y=-PI/2;
 // A dark oval cockpit rim and a small translucent windscreen keep the pilot visible.
 ellipsoid(plane,dark,[0,.73,.85],[.76,.13,1.12]);
 makeWindscreen(plane,metal);
 // A simple instrument panel, with individual bezels, needles and a control stick.
 mesh(new THREE.BoxGeometry(1.12,.42,.10),brown,plane,0,.91,.05);
 for(const x of [-.33,0,.33]){
  mesh(new THREE.CircleGeometry(.115,20),black,plane,x,.96,.111);
  ring(plane,.12,.018,metal,x,.96,.12);
  rod(plane,[x,.96,.135],[x+.055,.995,.135],.008,cream);
 }
 rod(plane,[.28,.74,.3],[.28,1.04,.23],.035,dark);ellipsoid(plane,dark,[.28,1.05,.23],[.065,.07,.065],12);
 for(const side of [-1,1]){
  const nav=mat(side<0?'#d64033':'#68bd86',{emissive:side<0?'#a4150c':'#1b6f42',emissiveIntensity:.8});ellipsoid(plane,nav,[side*6.88,.01,.2],[.09,.07,.09],12);
  for(let i=0;i<5;i++){const vent=mesh(new THREE.BoxGeometry(.025,.045,.26),dark,plane,side*.98,.14+i*.09,-2.45);vent.rotation.y=side*.06}
 }
 // Swiss cross as raised enamel on each side of the fuselage.
 for(const side of [-1,1]){const h=mesh(new THREE.PlaneGeometry(.44,.12),cream,plane,side*.76,.06,2.1);h.rotation.y=side*PI/2;const v=mesh(new THREE.PlaneGeometry(.12,.44),cream,plane,side*.762,.06,2.1);v.rotation.y=side*PI/2}
 // A faded registration is painted on both sides of the tail.
 const registration=new THREE.MeshBasicMaterial({map:registrationTexture(),transparent:true,side:THREE.DoubleSide,depthWrite:false});
 for(const side of [-1,1]){const label=mesh(new THREE.PlaneGeometry(1.1,.28),registration,plane,side*.61,.23,3.25);label.rotation.y=side*PI/2}
 // Little rivets and side trim emphasize the aircraft's scale.
 for(let i=0;i<16;i++)for(const side of [-1,1])ellipsoid(plane,metal,[side*(.9-i*.027),-.14,-2.7+i*.39],[.035,.035,.035],8);
 const pilot=makePenguin(plane,black,brown,metal,cream,scarfMat);
 // A small warm bounce models light returning from the lake to the pilot's
 // shadowed face, with extra fill for the close farewell shot.
 const pilotFill=new THREE.PointLight(0xffe2c9,.05,2,2);pilotFill.position.set(.2,2.3,-2);plane.add(pilotFill);
 return {plane,prop,blur,pilot,pilotFill};
}
function plushFibers(body,head) {
 const dark=new THREE.Color('#66726b'),light=new THREE.Color('#f0eadc');
 const build=(parent,patches)=>{const positions=[],colors=[];for(const [center,scale,count,seed,color] of patches)for(let i=0;i<count;i++){
  const y=hash(i,seed)*2-1,a=hash(i,seed+1)*PI*2,r=Math.sqrt(Math.max(0,1-y*y)),nx=Math.cos(a)*r,ny=y,nz=Math.sin(a)*r;
  const p=[center[0]+nx*scale[0],center[1]+ny*scale[1],center[2]+nz*scale[2]],normal=new THREE.Vector3(nx/scale[0],ny/scale[1],nz/scale[2]).normalize(),length=.007+hash(i,seed+2)*.012;
  positions.push(...p,p[0]+normal.x*length,p[1]+normal.y*length,p[2]+normal.z*length);colors.push(color.r,color.g,color.b,color.r,color.g,color.b);
 }const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));parent.add(new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.22,depthWrite:false})));};
 build(body,[[[0,.65,.03],[.57,.75,.48],8000,300,dark],[[0,.58,-.37],[.41,.57,.13],3500,320,light]]);
 build(head,[[[0,1.43,-.02],[.57,.58,.51],8000,310,dark],[[0,1.4,-.43],[.45,.4,.12],3500,330,light]]);
}
function plushBeakGeometry(){
 // Rounded fabric bill: separate elliptical sections let it taper without a hard cone tip.
 const sections=[[0,.09,.055],[-.045,.145,.073],[-.13,.17,.078],[-.23,.142,.061],[-.33,.09,.039],[-.40,.012,.008]],segments=24,positions=[],uv=[],indices=[];
 for(let j=0;j<sections.length;j++){const [z,rx,ry]=sections[j];for(let i=0;i<=segments;i++){const a=i/segments*PI*2;positions.push(Math.cos(a)*rx,Math.sin(a)*ry,z);uv.push(i/segments,j/(sections.length-1))}}
 for(let j=0;j<sections.length-1;j++)for(let i=0;i<segments;i++){const a=j*(segments+1)+i,b=a+segments+1;indices.push(a,b,a+1,b,b+1,a+1)}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}
function makePenguin(plane,black,brown,metal,cream,scarfMat) {
 const pilot=new THREE.Group();pilot.position.set(0,.55,.85);plane.add(pilot);
 const headPivot=new THREE.Group(),head=new THREE.Group();headPivot.position.set(0,1.03,0);head.position.y=-1.03;headPivot.add(head);pilot.add(headPivot);
 const softBlack=plushMaterial('#20282b'),ivory=plushMaterial('#e4e0d2'),beakMat=plushMaterial('#d79a48');
 ellipsoid(pilot,softBlack,[0,.65,.03],[.57,.75,.48]);ellipsoid(pilot,ivory,[0,.58,-.37],[.41,.57,.13]);
 ellipsoid(head,softBlack,[0,1.43,-.02],[.57,.58,.51]);
 ellipsoid(head,ivory,[0,1.4,-.43],[.45,.4,.12]);plushFibers(pilot,head);
 // Short, slightly raised stitches follow the felt face and chest patches.
 const thread=plushMaterial('#b9b6aa'),stitchShape=new THREE.SphereGeometry(1,8,6),faceStitches=new THREE.InstancedMesh(stitchShape,thread,30),chestStitches=new THREE.InstancedMesh(stitchShape,thread,30),stitchTransform=new THREE.Object3D();
 for(let i=0;i<30;i++){
  const a=i/30*PI*2;stitchTransform.rotation.z=a+PI/2;
  stitchTransform.position.set(.36*Math.cos(a),1.4+.32*Math.sin(a),-.495);stitchTransform.scale.set(.022,.008,.006);stitchTransform.updateMatrix();faceStitches.setMatrixAt(i,stitchTransform.matrix);
  stitchTransform.position.set(.33*Math.cos(a),.58+.46*Math.sin(a),-.44);stitchTransform.scale.set(.018,.007,.005);stitchTransform.updateMatrix();chestStitches.setMatrixAt(i,stitchTransform.matrix);
 }faceStitches.instanceMatrix.needsUpdate=true;chestStitches.instanceMatrix.needsUpdate=true;head.add(faceStitches);pilot.add(chestStitches);
 // Woven shoulder straps and a buckle hold the pilot in the open cockpit,
 // including when the aircraft is inverted. The webbing follows the plush
 // body rather than floating as a flat band in front of it.
 const webbing=wovenMaterial('#716451');webbing.side=THREE.DoubleSide;
 const bodyFront=(x,y)=>{const surface=(cx,cy,cz,sx,sy,sz)=>{const q=1-((x-cx)/sx)**2-((y-cy)/sy)**2;return q>0?cz-sz*Math.sqrt(q):Infinity};return Math.min(surface(0,.65,.03,.57,.75,.48),surface(0,.58,-.37,.41,.57,.13))-.018};
 for(const side of [-1,1]){
  const positions=[],uv=[],indices=[],n=20,width=.10;
  for(let i=0;i<=n;i++){const u=i/n,y=THREE.MathUtils.lerp(1.10,.30,u),centre=side*THREE.MathUtils.lerp(.32,.10,u);for(const depth of [0,.018])for(const edge of [-1,1]){const x=centre+edge*width/2,z=bodyFront(x,y)+depth;positions.push(x,y,z);uv.push((edge+1)/2,u)}}
  for(let i=0;i<n;i++){const a=i*4,b=(i+1)*4;indices.push(a,b,a+1,b,b+1,a+1,a+2,a+3,b+2,b+2,a+3,b+3,a,a+2,b,b,a+2,b+2,a+1,b+1,a+3,b+1,b+3,a+3)}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();mesh(geometry,webbing,pilot);
 }
 const buckleZ=bodyFront(0,.30)-.025;mesh(new THREE.BoxGeometry(.25,.115,.045),metal,pilot,0,.30,buckleZ);mesh(new THREE.BoxGeometry(.13,.052,.012),brown,pilot,0,.30,buckleZ-.029);
 const flippers=[],eyes=[],eyeMaterial=new THREE.MeshPhysicalMaterial({color:0x101717,roughness:.18,metalness:.05,clearcoat:1,clearcoatRoughness:.14});
 for(const side of [-1,1]){
  const shoulder=new THREE.Group();shoulder.position.set(side*.55,.95,.06);pilot.add(shoulder);ellipsoid(shoulder,softBlack,[side*.04,-.27,.02],[.19,.49,.19]).rotation.z=side*.35;ellipsoid(shoulder,brown,[side*.04,-.69,.02],[.16,.15,.17],16);flippers.push(shoulder);
  const eye=ellipsoid(head,eyeMaterial,[side*.19,1.45,-.54],[.065,.075,.05],20),glint=ellipsoid(head,cream,[side*.175,1.475,-.581],[.018,.02,.012],12),closed=ellipsoid(head,softBlack,[side*.19,1.45,-.555],[.065,.009,.012],16);closed.rotation.z=side*.10;closed.visible=false;eyes.push({eye,glint,closed});
 }
 mesh(plushBeakGeometry(),beakMat,head,0,1.22,-.54);
 const billSeam=new THREE.LineBasicMaterial({color:0x8f6638,transparent:true,opacity:.55});
 for(const side of [-1,1]){const points=[new THREE.Vector3(side*.12,1.22,-.60),new THREE.Vector3(side*.169,1.22,-.67),new THREE.Vector3(side*.14,1.22,-.77),new THREE.Vector3(side*.09,1.22,-.87)];head.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),billSeam))}
 // Cap, goggles, leather strap and metal frames.
 ellipsoid(head,brown,[0,1.79,.02],[.58,.27,.51]);
 for(const side of [-1,1]){ellipsoid(head,brown,[side*.53,1.61,.07],[.105,.22,.22],20);ellipsoid(head,brown,[side*.53,1.44,.12],[.085,.14,.16],16)}
 const capSeam=mat('#342b26',{roughness:.9});
 for(const x of [-.22,.22]){const points=[];for(let i=0;i<=16;i++){const z=-.43+i*.86/16,y=1.79+.275*Math.sqrt(Math.max(0,1-(x/.58)**2-(z/.51)**2));points.push(new THREE.Vector3(x,y,z+.02))}mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),32,.009,6,false),capSeam,head)}
 const goggles=new THREE.Group();head.add(goggles);const strap=mesh(new THREE.TorusGeometry(.535,.055,10,32),brown,goggles,0,1.66,-.02);strap.rotation.x=PI/2;
 const lensMaterial=new THREE.MeshPhysicalMaterial({color:0x9fc6c9,metalness:.06,roughness:.12,clearcoat:1,clearcoatRoughness:.08,transparent:true,opacity:.38,depthWrite:false});
 for(const side of [-1,1]){
  ring(goggles,.205,.044,brown,side*.24,1.79,-.535);
  ellipsoid(goggles,lensMaterial,[side*.24,1.79,-.56],[.193,.193,.035],24);
  ring(goggles,.205,.019,metal,side*.24,1.79,-.58);
  const glint=new THREE.LineBasicMaterial({color:0xe2f0ed,transparent:true,opacity:.32}),curve=new THREE.EllipseCurve(side*.24,1.79,.145,.145,PI*.65,PI*.95,false,0),glintPoints=curve.getPoints(12).map(p=>new THREE.Vector3(p.x,p.y,-.594));goggles.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(glintPoints),glint));
 }
 rod(goggles,[-.055,1.79,-.59],[.055,1.79,-.59],.026,brown);
 scarfCollar(pilot,scarfMat);
 const ribbons=[];for(let k=0;k<2;k++)ribbons.push(createSilkRibbon(pilot,scarfMat,k));
 return {pilot,headPivot,eyes,ribbons,goggles,flippers};
}
export function createSilkRibbon(parent,material,which) {
 const nx=18,ny=56,width=.56,length=2.4+which*.35,vertices=(nx+1)*(ny+1),positions=new Float32Array(vertices*3),previous=new Float32Array(vertices*3),uv=[],indices=[],constraints=[];
 const vertex=(i,j)=>j*(nx+1)+i,side=which?-1:1;
 for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++){
  const id=vertex(i,j)*3,u=i/nx,v=j/ny,spread=smooth(0,.24,v),rootX=side*.10+(u-.5)*.23,rootY=1.03+side*.012,rootZ=scarfBackSurface(rootX,rootY)-.006;
  positions[id]=THREE.MathUtils.lerp(rootX,side*.20+(u-.5)*width*(1-.08*smooth(.75,1,v)),spread);positions[id+1]=rootY+Math.sin(v*PI)*.025;positions[id+2]=rootZ+v*length;uv.push(u,v);
  if(i<nx&&j<ny){const a=vertex(i,j),b=vertex(i+1,j),c=vertex(i,j+1),d=vertex(i+1,j+1);indices.push(a,b,c,b,d,c)}
 }
 previous.set(positions);
 const add=(a,b,stiffness)=>{const ai=a*3,bi=b*3,rest=Math.hypot(positions[bi]-positions[ai],positions[bi+1]-positions[ai+1],positions[bi+2]-positions[ai+2]);constraints.push(a,b,rest,stiffness)};
 for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++){
  const a=vertex(i,j);if(i<nx)add(a,vertex(i+1,j),1);if(j<ny)add(a,vertex(i,j+1),1);
  if(i<nx&&j<ny){add(a,vertex(i+1,j+1),.72);add(vertex(i+1,j),vertex(i,j+1),.72)}
  if(j<ny-1)add(a,vertex(i,j+2),.12);if(i<nx-1)add(a,vertex(i+2,j),.10);
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();const ribbon=new THREE.Mesh(geometry,material);ribbon.frustumCulled=false;parent.add(ribbon);
 const edgePositions=new Float32Array(ny*2*2*3),edgeGeometry=new THREE.BufferGeometry();edgeGeometry.setAttribute('position',new THREE.BufferAttribute(edgePositions,3).setUsage(THREE.DynamicDrawUsage));const edges=new THREE.LineSegments(edgeGeometry,new THREE.LineBasicMaterial({color:0xe7a67c,transparent:true,opacity:.24}));edges.frustumCulled=false;parent.add(edges);
 const stitchGeometry=new THREE.BufferGeometry();stitchGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(ny*2*2*3),3).setUsage(THREE.DynamicDrawUsage));const stitches=new THREE.LineSegments(stitchGeometry,new THREE.LineBasicMaterial({color:0xd89b76,transparent:true,opacity:.28}));stitches.frustumCulled=false;parent.add(stitches);
 return {nx,ny,positions,previous,constraints,geometry,edgeGeometry,stitchGeometry,which,lastTime:null,accumulator:0};
}
export function animateScarf(ribbons,time,windStrength=1) {
 const step=1/60;
 for(const cloth of ribbons){
  const {nx,ny,positions:p,previous:prev,constraints,which}=cloth;if(cloth.lastTime===null)cloth.lastTime=time;cloth.accumulator+=Math.min(.05,Math.max(0,time-cloth.lastTime));cloth.lastTime=time;
  let steps=0;while(cloth.accumulator>=step&&steps++<3){
   for(let j=1;j<=ny;j++)for(let i=0;i<=nx;i++){
    const n=(j*(nx+1)+i)*3,v=j/ny,x=p[n],y=p[n+1],z=p[n+2];
    const vx=(x-prev[n])*.987,vy=(y-prev[n+1])*.987,vz=(z-prev[n+2])*.987;prev[n]=x;prev[n+1]=y;prev[n+2]=z;
    const u=i/nx,gust=(Math.sin(time*3.1-v*8+which)*1.5+Math.sin(time*1.7+v*5)*.7)*windStrength;
    p[n]=x+vx+(gust*.85+Math.sin(time*2.4+i*.5)*.35+(which?-.8:.8)*v)*step*step;
    p[n+1]=y+vy+(-1.3+Math.sin(time*4.2-v*11+which+u*1.7)*2.4+Math.sin(time*2.2+u*PI*3-v*6)*.6)*step*step;
    p[n+2]=z+vz+(2.8+Math.sin(time*2+v*4)*.7)*windStrength*step*step;
   }
   for(let iteration=0;iteration<9;iteration++)for(let c=0;c<constraints.length;c+=4){
    const a=constraints[c],b=constraints[c+1],rest=constraints[c+2],stiff=constraints[c+3],ai=a*3,bi=b*3,dx=p[bi]-p[ai],dy=p[bi+1]-p[ai+1],dz=p[bi+2]-p[ai+2],distance=Math.sqrt(dx*dx+dy*dy+dz*dz)||1,amount=(distance-rest)/distance*stiff,afixed=a<=nx,bfixed=b<=nx;
    const wa=afixed?0:(bfixed?1:.5),wb=bfixed?0:(afixed?1:.5);p[ai]+=dx*amount*wa;p[ai+1]+=dy*amount*wa;p[ai+2]+=dz*amount*wa;p[bi]-=dx*amount*wb;p[bi+1]-=dy*amount*wb;p[bi+2]-=dz*amount*wb;
   }
   cloth.accumulator-=step;
  }
  cloth.geometry.attributes.position.needsUpdate=true;cloth.geometry.computeVertexNormals();const edge=cloth.edgeGeometry.attributes.position;let n=0;
  for(const i of [0,nx])for(let j=0;j<ny;j++)for(const row of [j,j+1]){const id=(row*(nx+1)+i)*3;edge.setXYZ(n++,p[id],p[id+1]+.003,p[id+2])}edge.needsUpdate=true;
  const stitch=cloth.stitchGeometry.attributes.position;let k=0;for(const i of [0,nx])for(let j=0;j<ny;j++){
   const edge0=(j*(nx+1)+i)*3,edge1=((j+1)*(nx+1)+i)*3,inside0=(j*(nx+1)+(i===0?1:nx-1))*3,inside1=((j+1)*(nx+1)+(i===0?1:nx-1))*3;
   stitch.setXYZ(k++,THREE.MathUtils.lerp(p[edge0],p[edge1],.32),THREE.MathUtils.lerp(p[edge0+1],p[edge1+1],.32)+.004,THREE.MathUtils.lerp(p[edge0+2],p[edge1+2],.32));
   stitch.setXYZ(k++,THREE.MathUtils.lerp(THREE.MathUtils.lerp(p[edge0],p[edge1],.52),THREE.MathUtils.lerp(p[inside0],p[inside1],.52),.3),THREE.MathUtils.lerp(THREE.MathUtils.lerp(p[edge0+1],p[edge1+1],.52),THREE.MathUtils.lerp(p[inside0+1],p[inside1+1],.52),.3)+.004,THREE.MathUtils.lerp(THREE.MathUtils.lerp(p[edge0+2],p[edge1+2],.52),THREE.MathUtils.lerp(p[inside0+2],p[inside1+2],.52),.3));
  }stitch.needsUpdate=true;
 }
}

export const CHASE_START=88;
export const CHASE_DURATION=60;
export const ENEMY_FIRE_RATE=10;
export const HERO_FIRE_RATE=12;
// Stop firing before the pull-up, allowing the last rounds to travel clear.
export const ENEMY_FIRE_STOP=41.25;
export const ENDING_DURATION=6.2;
export const FREEZE_DURATION=2;
export const FAREWELL_DETACH_TIME=CHASE_DURATION+4.35;
export const WINK_FREEZE_TIME=CHASE_START+CHASE_DURATION+1.85;
export const FILM_END=CHASE_START+CHASE_DURATION+ENDING_DURATION+FREEZE_DURATION;
// Hold the exact wink frame while the film clock keeps moving, then resume the
// same continuous scene timeline for the fly-through and departure.
export function filmSceneTime(time){return time<WINK_FREEZE_TIME?time:time<WINK_FREEZE_TIME+FREEZE_DURATION?WINK_FREEZE_TIME:time-FREEZE_DURATION}
// A short pressure kick with an irregular, damped tail. The returned offsets
// are fractions of the viewport, so the HUD and the underlying camera stay steady.
export function explosionShake(age,index=0){
 if(age<0||age>=1.7)return {x:0,y:0,flash:0};
 const decay=Math.exp(-age*2.8)*(1-smooth(1.3,1.7,age)),phase=index*1.37;
 return {x:decay*(.032*Math.sin(age*34+.7+phase)+.009*Math.sin(age*19+1.8+phase)),y:decay*(.028*Math.sin(age*29+1.3+phase)+.007*Math.sin(age*22+.4+phase)),flash:Math.exp(-age*11)};
}
const chaseIntegral=(t,d)=>{const q=clamp(t/d,0,1);return d*(q*q*q-.5*q*q*q*q)+Math.max(0,t-d)};
// Arrive inverted at the apex, hold the attitude briefly, and roll upright
// while descending. The aircraft keeps its forward velocity throughout.
const maneuverRoll=c=>PI*(smooth(45,48,c)+smooth(49,52.5,c));
function chaseZ(c){
 const cruise=4.3,fast=22,zStart=-CHASE_START*cruise,zAtClimb=zStart-(cruise*42+(fast-cruise)*chaseIntegral(42,5));
 if(c<=42)return zStart-(cruise*c+(fast-cruise)*chaseIntegral(c,5));
 // Trade forward speed for altitude, then accelerate into the dive. The
 // pursuers continue on their original heading and pass underneath.
 return zAtClimb-fast*(c-42)+11*chaseIntegral(c-42,4)-16*chaseIntegral(c-49,4);
}
function mountainRouteX(c,z){const localZ=z+Math.floor((220-z)/1350)*1350,mountain=smooth(28,36,c),target=shoreline(localZ)+20+Math.sin(c*.58)*5;return THREE.MathUtils.lerp(Math.sin(c*.8)*2.2,target,mountain)*(1-smooth(42,49,c));}
let clearanceProfile=null;
function mountainClearance(c){
 if(!clearanceProfile){
  // Look ahead before climbing over the terrain, then smooth the conservative
  // envelope. This prevents the plane and camera from chasing every rock bump.
  const start=28,step=.1,count=211,raw=[];
  for(let i=0;i<count;i++){const t=start+i*step,z=chaseZ(t),local=z+Math.floor((220-z)/1350)*1350,x=mountainRouteX(t,z),ground=Math.max(terrainHeight(x,local),terrainHeight(x-2,local),terrainHeight(x+2,local));raw.push(ground>0?ground+9:.58)}
  const envelope=raw.map((_,i)=>Math.max(...raw.slice(Math.max(0,i-12),Math.min(count,i+13))));
  const values=envelope.map((_,i)=>{const a=envelope.slice(Math.max(0,i-6),Math.min(count,i+7));return a.reduce((sum,v)=>sum+v,0)/a.length});
  const climbBase=Math.max(...values.slice(Math.round((40-start)/step),Math.round((49-start)/step)+1))+2;
  clearanceProfile={start,step,values,climbBase};
 }
 const f=clamp((c-clearanceProfile.start)/clearanceProfile.step,0,clearanceProfile.values.length-1),i=Math.floor(f),j=Math.min(i+1,clearanceProfile.values.length-1);return THREE.MathUtils.lerp(clearanceProfile.values[i],clearanceProfile.values[j],f-i);
}
export function flightPose(time,cruiseOnly=false) {
 const chase=time-CHASE_START;if(chase<0||cruiseOnly)return {x:Math.sin(time*.15)*1.3,y:13+Math.sin(time*.8)*.25,z:-time*4.3,pitch:Math.sin(time*.43)*.015,roll:Math.sin(time*.29)*.035,chase:cruiseOnly?-1:chase};
 const c=Math.max(0,chase),z=chaseZ(c);
 const react=smooth(0,4,c);let x=THREE.MathUtils.lerp(Math.sin(time*.15)*1.3,Math.sin(c*.9)*1.7,react),y=THREE.MathUtils.lerp(13+Math.sin(time*.8)*.25,13+Math.sin(c*1.3)*.35,react),roll=THREE.MathUtils.lerp(Math.sin(time*.29)*.035,Math.sin(c*.9)*.18,react),pitch=Math.sin(c*1.3)*.04*react;
 if(c>=18){const dive=smooth(18,22,c);y=THREE.MathUtils.lerp(y,.58,dive);x=THREE.MathUtils.lerp(x,Math.sin(c*.8)*2.2,smooth(18,21,c));roll=THREE.MathUtils.lerp(roll,Math.sin(c*.8)*.22,smooth(18,21,c))}
 if(c>=28&&c<49){x=mountainRouteX(c,z);y=mountainClearance(c);roll=THREE.MathUtils.lerp(roll,Math.sin(c*1.9)*.46,smooth(28,30,c));if(c>=40)y=THREE.MathUtils.lerp(y,clearanceProfile.climbBase,smooth(40,42,c));if(c>=42){const climb=smooth(42,48,c);y=THREE.MathUtils.lerp(clearanceProfile.climbBase,105,climb);pitch=1.1*smooth(42,46,c)*(1-smooth(47,50,c));roll*=1-climb}if(c>=48)y=THREE.MathUtils.lerp(105,33,smooth(48,54,c))}
 if(c>=45)roll=maneuverRoll(c);
 if(c>=49){pitch=-.7*smooth(48,50,c)*(1-smooth(52,54,c));y=THREE.MathUtils.lerp(105,33,smooth(48,54,c));x=Math.sin(c*.8)*.35*smooth(49,51,c)-3*smooth(52.5,53.7,c)+6*smooth(55,56.2,c)-3*smooth(58.6,60,c);const departure=smooth(62.3,66,c);x+=16*departure;y+=14*departure}
 return {x,y,z,pitch,roll,chase};
}
export function flightMotion(time,cruiseOnly=false){
 // Build the airframe's attitude from its path tangent. The up vector follows
 // the pitch-over continuously through vertical, and a coordinated bank comes
 // from lateral acceleration rather than an unrelated sine wave.
 const step=.14,bankStep=.65,position=t=>{const p=flightPose(t,cruiseOnly);return new THREE.Vector3(p.x,p.y,p.z)},p=position(time),before=position(time-step),after=position(time+step),velocity=after.sub(before).multiplyScalar(.5/step),acceleration=position(time+bankStep).add(position(time-bankStep)).addScaledVector(p,-2).multiplyScalar(1/(bankStep*bankStep)),speed=Math.max(.001,velocity.length());
 const pitch=Math.atan2(velocity.y,-velocity.z),up=new THREE.Vector3(0,Math.cos(pitch),Math.sin(pitch)),matrix=new THREE.Matrix4().lookAt(p,p.clone().add(velocity),up),orientation=new THREE.Quaternion().setFromRotationMatrix(matrix),c=time-CHASE_START;
 const bank=clamp((velocity.z*acceleration.x-velocity.x*acceleration.z)/(speed*18),-.65,.65),roll=cruiseOnly?0:maneuverRoll(c),bankFade=cruiseOnly?1:1-smooth(44.6,45.2,c)+smooth(52,53,c);
 orientation.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),bank*bankFade+roll));return {position:p,velocity,orientation,bank};
}
export function farewellCameraPose(time){
 // One continuous move: close in on the pilot, sweep around the aircraft as
 // it overtakes the lens, then leave the camera behind as the plane climbs.
 const c=time-CHASE_START,phase=c-CHASE_DURATION,detached=c>=FAREWELL_DETACH_TIME,flight=flightMotion(detached?CHASE_START+FAREWELL_DETACH_TIME:time),approach=smooth(.05,1.30,phase),orbit=smooth(2.05,4.35,phase);
 const radius=THREE.MathUtils.lerp(.60,5.8,orbit),angle=PI*orbit,x=Math.sin(angle)*radius*.85,z=THREE.MathUtils.lerp(-6.5,-.60,approach)*(1-orbit)+(-Math.cos(angle)*radius)*orbit,y=THREE.MathUtils.lerp(THREE.MathUtils.lerp(.93,.64,approach),1.6,orbit);
 const exit=detached?smooth(FAREWELL_DETACH_TIME,CHASE_DURATION+ENDING_DURATION,c):0,position=new THREE.Vector3(x,y,z).applyQuaternion(flight.orientation).add(flight.position),look=new THREE.Vector3(THREE.MathUtils.lerp(0,-.07,approach)-1.2*exit,.50-.35*exit,.10).applyQuaternion(flight.orientation).add(flight.position);
 return {position,look};
}
export function pilotHeadMotion(time,chase){
 if(chase>=CHASE_DURATION&&chase<CHASE_DURATION+ENDING_DURATION){const wink=smooth(61.5,61.7,chase)*(1-smooth(62.1,62.45,chase)),acknowledge=smooth(60.7,61.5,chase)*(1-smooth(62.2,62.8,chase));return {pitch:.015*Math.sin(time*.7)-.025*acknowledge,yaw:.02*Math.sin(time*.45),roll:.02*Math.sin(time*.5)-.07*acknowledge,blink:0,wink};}
 const alert=chase>=0&&chase<60,glance=(a,b,d,e)=>smooth(a,b,chase)*(1-smooth(d,e,chase)),lookDown=alert?glance(43,44.2,46.8,48):0,yaw=alert?(-.40*glance(.2,1.2,2.6,4)+.55*glance(7,8.5,10,11.5)-.48*glance(13,14.5,16,17.5)+.28*glance(32,34,37,39)-.30*lookDown):(.25*Math.sin(time*.27)+.12*Math.sin(time*.11)),phase=(time+1.1)%5.4;
 return {pitch:.035*Math.sin(time*.9)-(alert ? .15*glance(18,21,27,30)+.9*lookDown : 0),yaw,roll:.035*Math.sin(time*.53),blink:smooth(0,.07,phase)*(1-smooth(.09,.18,phase)),wink:0};
}
function pursuitPosition(c,index){
 // The initial crossing swaps their sides for the rest of the pursuit.
 const side=index?-1:1,delay=.9+index*.25+.12*Math.sin(c*.28+index),p=flightPose(CHASE_START+Math.max(0,c-delay));
 const mountainClearance=6.5*smooth(28,33,c)*(1-smooth(47,50,c));
 return new THREE.Vector3(p.x+side*(2.5+.45*Math.sin(c*.48+index)),p.y+1.7+mountainClearance+.3*Math.sin(c*.7+index),p.z);
}
function pathVelocity(fn,t){const d=.025;return fn(t+d).sub(fn(t-d)).multiplyScalar(.5/d)}
function hermite(a,b,t){
 const duration=b.time-a.time,u=clamp((t-a.time)/duration,0,1),u2=u*u,u3=u2*u;
 return a.position.clone().multiplyScalar(2*u3-3*u2+1).addScaledVector(a.velocity,(u3-2*u2+u)*duration).addScaledVector(b.position,-2*u3+3*u2).addScaledVector(b.velocity,(u3-u2)*duration);
}
const enemyPaths=[null,null];
function enemyPath(index){
 if(enemyPaths[index])return enemyPaths[index];const side=index?1:-1,hero=c=>{const p=flightPose(CHASE_START+c);return new THREE.Vector3(p.x,p.y,p.z)},following=c=>pursuitPosition(c,index);
 const waypoint=(time,position,velocity)=>({time,position,velocity});
 // Each aircraft banks inward after the head-on approach. Their broad arcs
 // cross at staggered heights before they sweep out to opposite sides and
 // accelerate back into the pursuit formation.
 const turnZ=hero(1.7).z-5-index*4,turnLevel=hero(0).y+(index?4.8:.8),radius=18;
 const early=[
  waypoint(0,new THREE.Vector3(hero(0).x+side*5.5,turnLevel,hero(0).z-40-index*5),new THREE.Vector3(side*2,0,14+index)),
  waypoint(1.7,new THREE.Vector3(side*6,turnLevel,turnZ),new THREE.Vector3(0,0,16)),
  waypoint(3.45,new THREE.Vector3(side*(6-radius),turnLevel,turnZ+radius),new THREE.Vector3(-side*16,0,0)),
  waypoint(5.2,new THREE.Vector3(side*(6-2*radius),turnLevel,turnZ),new THREE.Vector3(0,0,-16)),
  waypoint(9.2,following(9.2),pathVelocity(following,9.2))
 ];
 return enemyPaths[index]={early};
}
function overshootPosition(c,index){
 const side=index?-1:1,start=pursuitPosition(42,index),following=pursuitPosition(c,index),release=smooth(42,44,c),lane=smooth(47,50,c);
 // The pursuers hold altitude and momentum through the valley, crossing below
 // the climbing plane before it rolls over and dives in behind them.
 return new THREE.Vector3(THREE.MathUtils.lerp(following.x,side*3.5,lane),THREE.MathUtils.lerp(following.y,start.y,release),THREE.MathUtils.lerp(following.z,start.z-22*(c-42),release));
}
function sampleEnemyPosition(c,index){
 const path=enemyPath(index),sample=(keys,t)=>{for(let i=0;i<keys.length-1;i++)if(t<=keys[i+1].time)return hermite(keys[i],keys[i+1],t);return keys.at(-1).position.clone().addScaledVector(keys.at(-1).velocity,t-keys.at(-1).time)};
 if(c<9.2)return sample(path.early,Math.max(0,c));if(c<42)return pursuitPosition(c,index);return overshootPosition(c,index);
}
export function enemyFlightPose(time,index){
 const c=Math.max(0,time-CHASE_START),step=.22,position=sampleEnemyPosition(c,index),before=sampleEnemyPosition(Math.max(0,c-step),index),after=sampleEnemyPosition(c+step,index),velocity=after.sub(before).multiplyScalar(1/(c<step?c+step:step*2));
 return {position,velocity};
}
export function enemyFlightMotion(time,index){
 const pose=enemyFlightPose(time,index),step=.55,before=enemyFlightPose(time-step,index).velocity,after=enemyFlightPose(time+step,index).velocity,acceleration=after.sub(before).multiplyScalar(.5/step),speed=Math.max(.001,pose.velocity.length()),bank=clamp(Math.atan2(pose.velocity.z*acceleration.x-pose.velocity.x*acceleration.z,speed*9.81),-1.05,1.05),up=new THREE.Vector3(0,1,0);
 const orientation=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(pose.position,pose.position.clone().add(pose.velocity),up));
 orientation.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),bank));return {...pose,orientation,bank};
}
export function interceptEnemy(origin,time,index){
 // Predict the actual curved flight path at the time the projectile arrives.
 let travel=origin.distanceTo(enemyFlightPose(time,index).position)/PROJECTILE_SPEED,point;
 for(let i=0;i<8;i++){point=enemyFlightPose(time+travel,index).position;travel=origin.distanceTo(point)/PROJECTILE_SPEED}
 return point;
}
export function crossingCameraPose(time,aspect=16/9){
 const hero=flightMotion(time).position,a=enemyFlightPose(time,0).position,b=enemyFlightPose(time,1).position;
 const pullback=Math.max(1,(1.65+1.8*Math.max(0,1-aspect))/aspect);
 return {position:hero.clone().add(new THREE.Vector3(0,8,-22*pullback)),look:hero.clone().multiplyScalar(.65).addScaledVector(a,.175).addScaledVector(b,.175)};
}
export function overshootCameraPose(time){
 const hero=flightMotion(time),pilot=new THREE.Vector3(0,.52,.2).applyQuaternion(hero.orientation).add(hero.position),look=enemyFlightPose(time,0).position.add(enemyFlightPose(time,1).position).multiplyScalar(.5),direction=look.clone().sub(pilot).normalize(),right=direction.clone().cross(new THREE.Vector3(0,0,-1)).normalize();
 // Keep the pilot in the foreground while looking down toward both aircraft.
 const position=pilot.clone().addScaledVector(direction,-3).addScaledVector(right,-1.0);
 return {position,look};
}
function makeOpponents(scene) {
 const body=paintedMetal('#485354',71),wing=paintedMetal('#a9aca1',72),dark=paintedMetal('#242c2e',73),metal=mat('#b5b7ae',{metalness:.7,roughness:.4}),glass=new THREE.MeshPhysicalMaterial({color:0x74939a,transparent:true,opacity:.5,roughness:.18,side:THREE.DoubleSide});
 const opponents=[];for(let i=0;i<2;i++){
  const plane=new THREE.Group();plane.scale.setScalar(.25);scene.add(plane);mesh(fuselageGeometry(),body,plane);mesh(wingGeometry(),wing,plane,0,-.2,.15);mesh(wingGeometry(2.45,-.5,.65,-.3,.4,.1),wing,plane,0,.45,5.1);
  const fin=mesh(new THREE.BoxGeometry(.12,1.6,1.3),body,plane,0,1.1,5.25);ellipsoid(plane,glass,[0,1.05,.8],[.78,.55,1.05]);
  const nose=mesh(new THREE.CylinderGeometry(.69,.69,.28,24),metal,plane,0,0,-4.27);nose.rotation.x=PI/2;
  const prop=new THREE.Group();prop.position.z=-4.55;plane.add(prop);for(const side of [-1,1])ellipsoid(prop,dark,[side*1.35,0,0],[1.35,.16,.085]);ellipsoid(prop,metal,[0,0,-.15],[.25,.25,.26]);
  for(const side of [-1,1]){rod(plane,[side*.65,-.4,.4],[side*4.25,-.09,.7],.055,metal);const wheel=mesh(new THREE.CylinderGeometry(.42,.42,.23,16),dark,plane,side*1.45,-1.3,-.15);wheel.rotation.z=PI/2;rod(plane,[side*.5,-.5,-.15],[side*1.45,-1.25,-.15],.07,metal)}
  plane.visible=false;opponents.push({plane,prop});
 }return opponents;
}
export function createWorld(container) {
 const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.0;container.appendChild(renderer.domElement);
 const scene=new THREE.Scene();scene.fog=new THREE.FogExp2(0x26384b,.0024);const camera=new THREE.PerspectiveCamera(43,innerWidth/innerHeight,.02,1500);
 const composer=new EffectComposer(renderer);composer.addPass(new RenderPass(scene,camera));const bloom=new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),.12,.3,.95);composer.addPass(bloom);
 // A gentle edge-weighted shutter smear conveys speed without blurring the pilot
 // or shaking the viewpoint. The HTML controls are composed after this pass.
 const speedBlur=new ShaderPass({uniforms:{tDiffuse:{value:null},strength:{value:0},freeze:{value:0},shake:{value:new THREE.Vector2()},blastFlash:{value:0}},vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,fragmentShader:`uniform sampler2D tDiffuse;uniform float strength;uniform float freeze;uniform vec2 shake;uniform float blastFlash;varying vec2 vUv;void main(){float crop=2.05*max(abs(shake.x),abs(shake.y));vec2 uv=(vUv-.5)*(1.0-crop)+.5+shake;vec2 d=uv-vec2(.5);float edge=smoothstep(.18,.72,length(d));vec2 step=d*strength*edge;vec4 c=texture2D(tDiffuse,uv)*.30;c+=texture2D(tDiffuse,uv-step)*.25;c+=texture2D(tDiffuse,uv-step*2.)*.20;c+=texture2D(tDiffuse,uv-step*3.)*.15;c+=texture2D(tDiffuse,uv-step*4.)*.10;
  if(freeze>.001){float mask=smoothstep(.43,.56,vUv.x)*(1.0-smoothstep(.86,1.0,vUv.x))*(1.0-smoothstep(.13,.34,abs(vUv.y-.53)));if(mask>.001){vec4 streak=vec4(0.0);float total=0.0;for(int i=1;i<=32;i++){float s=float(i)/32.0,w=1.0-s*.55;streak+=texture2D(tDiffuse,uv-vec2(s*.22,0.0))*w;total+=w;}c=mix(c,streak/total,mask*freeze*.82);}}c.rgb+=vec3(1.0,.75,.46)*blastFlash*.24;gl_FragColor=c;}`});composer.addPass(speedBlur);composer.addPass(new OutputPass());
 const hemi=new THREE.HemisphereLight(0xacc9e1,0x293a39,1.65);scene.add(hemi);const sun=new THREE.DirectionalLight(0xffd1aa,2.25);sun.position.set(70,80,-280);scene.add(sun);
 const sky=makeSky(scene);sun.position.copy(sky.uniforms.sunDirection.value).multiplyScalar(300);const terrainTile=new THREE.Group();makeTerrain(terrainTile,sky.uniforms);const terrainTiles=[terrainTile,terrainTile.clone(),terrainTile.clone()];terrainTiles.forEach(tile=>scene.add(tile));const underwater=makeUnderwater(scene);const water=makeWater(scene,sky.uniforms.sunDirection.value,sky.uniforms);
 const reflectScene=water.onBeforeRender,skyBeforeReflection=new THREE.Vector3(),starsBeforeReflection=new THREE.Vector3(),eyeBeforeReflection=new THREE.Vector3(),mirrorEye=new THREE.Vector3();water.onBeforeRender=function(renderer,reflectedScene,viewCamera,...args){
  skyBeforeReflection.copy(sky.sky.position);starsBeforeReflection.copy(sky.stars.position);eyeBeforeReflection.copy(sky.uniforms.eyeWorld.value);mirrorEye.copy(viewCamera.position);mirrorEye.y=2*water.position.y-mirrorEye.y;sky.sky.position.copy(mirrorEye);sky.stars.position.copy(mirrorEye);sky.uniforms.eyeWorld.value.copy(mirrorEye);underwater.group.visible=false;
  try{reflectScene.call(this,renderer,reflectedScene,viewCamera,...args)}finally{underwater.group.visible=true;sky.sky.position.copy(skyBeforeReflection);sky.stars.position.copy(starsBeforeReflection);sky.uniforms.eyeWorld.value.copy(eyeBeforeReflection)}
 };
 const mist=makeMist(scene);const clouds=makeClouds(scene);const aircraft=makePlane(scene);const craftScale=.25;aircraft.plane.scale.setScalar(craftScale);const opponents=makeOpponents(scene);const combat=createCombatEffects(scene),birds=makeBirds(scene),dolphins=makeDolphins(scene,combat),aircraftTrail=makeAircraftTrail(scene);
 const handRest=new THREE.Quaternion(),handReach=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,-1,0),new THREE.Vector3(-.22,.70,-.70).normalize());
 const targetCamera=new THREE.Vector3(),targetLook=new THREE.Vector3(),currentLook=new THREE.Vector3(0,12,-4),localForward=new THREE.Vector3(0,0,-1),wakeDirection=new THREE.Vector2();
 const shots=[
  {name:'The alpine crossing',position:[-8,5,27],look:[-2,4,-12]},
  {name:'Meet the pilot',position:[4.6,4.0,-4.5],look:[1.1,1.5,1.35]},
  {name:'The lake below',position:[2,35,20],look:[0,1,-2]},
  {name:'Into the first light',position:[-12,2,18],look:[0,5,-18]},
  {name:'A view from the wing',position:[15,5,-4],look:[0,1,.5]},
  {name:'The scarf in flight',position:[-4,3,5.5],look:[-1.1,1.2,.4]},
  {name:'The spinning propeller',position:[4,2,-9],look:[0,.2,-4.3]},
  {name:'Inside the cockpit',position:[2.6,3.2,3.8],look:[0,1.1,.05]},
  {name:'The valley from above',position:[0,300,0],look:[0,0,0]},
  {name:'Beneath the surface',position:[5,-16,12],look:[0,-19,-6]},
  {name:'Along the mountainside',position:[32,28,8],look:[85,25,-45]},
  {name:'Incoming aircraft',position:[7,4,12],look:[0,0,-12]},
  {name:'Under fire',position:[-4,2.1,9],look:[0,.3,-5]},
  {name:'Skimming the lake',position:[-2.4,1.3,5.5],look:[0,.2,-5]},
  {name:'Mountain evasion',position:[-5,3.8,8],look:[0,.3,-6]},
  {name:'Climb and reversal',position:[-8,6,12],look:[0,0,0]},
  {name:'The final pass',position:[-3,3,-11],look:[0,0,6]},
  {name:'The pursuers close in',position:[3,2,-9],look:[0,0,7]},
  {name:'Over the wake',position:[0,4,6],look:[0,-1,-3]},
  {name:'Racing the treeline',position:[-10,8,-16],look:[0,0,5]},
  {name:'The reversal',position:[-12,7,0],look:[0,0,0]},
  {name:'Dolphins in the lake',position:[0,38,0],look:[0,0,0]},
  {name:'A flock crosses the valley',position:[8,4,10],look:[0,0,0]},
  {name:'A wink on the way home',position:[0,1,-7],look:[0,.5,0]},
  {name:'The pilot looks down',position:[0,1,-2],look:[0,.5,0]},
  {name:'The pursuers pass below',position:[2,1,2],look:[0,-3,-8]},
  {name:'Inverted at the top',position:[6,-1,2],look:[0,-.3,0]},
  {name:'The crossing turn',position:[0,8,-22],look:[0,0,0]}
 ];
 const reducedMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)'),cameraShocks=[];
 let initialized=false,lastShot=-1,lastZ=0,lastX=0,lastY=0,underwaterAnchor=0,dolphinFocusPod=0,lastTime=-1,lastEnemyBurst=-1,lastHeroBurst=-1,lastWake=-1,detonated=[false,false],explosions=[null,null];
 function update(time,dawn,shotIndex,cruiseOnly=false,freezeAmount=0){
  const events={enemyShots:[],heroShot:false,explosions:[],waterHits:0},dt=lastTime<0?1/60:clamp(time-lastTime,0,.1);if(time<lastTime-.5){combat.clear();cameraShocks.length=0;lastEnemyBurst=lastHeroBurst=lastWake=-1;detonated=[false,false];explosions=[null,null];initialized=false;lastShot=-1}lastTime=time;
  const pose=flightPose(time,cruiseOnly),z=pose.z,c=pose.chase;if(shotIndex===9&&lastShot!==9)underwaterAnchor=Math.round(z/240)*240;const tileIndex=Math.floor((220-z)/1350);terrainTiles.forEach((tile,i)=>{tile.position.z=-(tileIndex+i-1)*1350});water.position.z=z;underwater.update(time,z,shotIndex===9?underwaterAnchor:null,dawn);const birdFocus=birds.update(time,z),dolphinState=dolphins.update(time,z);if(shotIndex===21&&lastShot!==21)dolphinFocusPod=dolphinState.focusIndex;
  for(const sprite of [...mist,...clouds])sprite.position.z=sprite.userData.baseZ+Math.round((z-sprite.userData.baseZ)/1350)*1350;
  const motion=flightMotion(time,cruiseOnly),farewellFill=shotIndex===23?smooth(60.65,61.25,c)*(1-smooth(62.15,63.1,c)):0;aircraft.plane.position.copy(motion.position);aircraft.plane.quaternion.copy(motion.orientation);aircraft.prop.rotation.z=time*(c>=0?250:210);aircraft.pilotFill.intensity=(.05+.07*farewellFill)*(.55+.45*dawn);
  const actor=aircraft.pilot,alert=c>=0&&c<60,reach=Math.max(smooth(.15,1,c)*(1-smooth(2.7,4,c)),smooth(60,60.18,c)*(1-smooth(60.85,61.2,c)));
  actor.pilot.rotation.z=Math.sin(time*.8)*.025+(alert?Math.sin(c*2)*.05:0);actor.pilot.rotation.y=alert?Math.sin(c*.8)*.05:Math.sin(time*.3)*.08;actor.pilot.rotation.x=alert?-.05+Math.sin(c*1.6)*.025:Math.sin(time*.65)*.015;
  const head=pilotHeadMotion(time,c);actor.headPivot.rotation.set(head.pitch,head.yaw,head.roll);for(let i=0;i<actor.eyes.length;i++){const {eye,glint,closed}=actor.eyes[i],blink=Math.max(head.blink,i===0?head.wink:0);eye.scale.y=.075*(1-.93*blink);eye.visible=blink<.98;glint.scale.y=.02*(1-.93*blink);glint.visible=blink<.65;closed.visible=blink>=.65}
  actor.flippers[0].rotation.z=Math.sin(time*.6)*.04;actor.flippers[1].quaternion.copy(handRest).slerp(handReach,reach);actor.flippers[1].rotation.z+=Math.sin(time*.7)*.035*(1-reach);
  const gogglesDown=smooth(.7,2.8,c)*(1-smooth(60.12,60.85,c));actor.goggles.position.y=-.34*gogglesDown;actor.goggles.position.z=-.025*gogglesDown;animateScarf(actor.ribbons,time,alert?1.65:1);
  for(let i=0;i<opponents.length;i++){
   const enemy=opponents[i],path=enemyFlightMotion(time,i);enemy.velocity=path.velocity;enemy.plane.visible=c>=0&&c<60&&!detonated[i];enemy.plane.position.copy(path.position);enemy.plane.quaternion.copy(path.orientation);enemy.prop.rotation.z=time*230;
  }
  aircraft.plane.updateMatrixWorld(true);for(const enemy of opponents)enemy.plane.updateMatrixWorld(true);
  if(c>=7&&c<ENEMY_FIRE_STOP){const burst=Math.floor((c-7)*ENEMY_FIRE_RATE);if(burst>lastEnemyBurst){lastEnemyBurst=burst;for(let i=0;i<2;i++){const from=opponents[i].plane.localToWorld(new THREE.Vector3(0,.1,-4.6)),aimForWater=c>=18&&c<30&&((burst+i*2)%4===0),nearMiss=aircraft.plane.position.clone().add(new THREE.Vector3((i?1:-1)*(.65+hash(burst,i)*.7),aimForWater?-.58-pose.y:(hash(burst+2,i)-.5)*.8,-2.8+(hash(burst+3,i)-.5)*2)),direction=nearMiss.sub(from).normalize(),axis=localForward.clone().applyQuaternion(opponents[i].plane.quaternion).normalize();if(axis.dot(direction)>.9){const intersection=intersectLakeSurface(from,direction,time),distance=intersection===null?110:intersection,waterHit=intersection!==null,to=from.clone().addScaledVector(direction,distance);combat.tracer(from,to,time,'enemy',waterHit,opponents[i].velocity);events.enemyShots.push(i)}}}}
  const wakeStrength=smooth(19,21,c)*(1-smooth(28,30,c));wakeDirection.set(motion.velocity.x,motion.velocity.z).normalize();water.material.uniforms.wakeOrigin.value.set(pose.x,z);water.material.uniforms.wakeDirection.value.copy(wakeDirection);water.material.uniforms.wakeStrength.value=wakeStrength;combat.updateWake(aircraft.plane.position,time,wakeStrength,wakeDirection);aircraftTrail.update(time,aircraft.plane,motion.velocity,wakeStrength,camera,renderer.getPixelRatio());
  if(c>=19&&c<30){const wake=Math.floor((c-19)*3);if(wake>lastWake){lastWake=wake;combat.ripple(aircraft.plane.position,time,.3,false)}}
  if(c>=54&&c<59.5&&!(c>=55&&c<56.2)){const burst=Math.floor((c-54)*HERO_FIRE_RATE);if(burst>lastHeroBurst){lastHeroBurst=burst;const target=c<55?1:0;if(!detonated[target]){const from=aircraft.plane.localToWorld(new THREE.Vector3(0,.1,-4.6)),to=interceptEnemy(from,time,target),axis=localForward.clone().applyQuaternion(aircraft.plane.quaternion).normalize();if(axis.dot(to.clone().sub(from).normalize())>.992){combat.tracer(from,to,time,'hero',false,motion.velocity,target);events.heroShot=true}}}}
  const impacts=combat.update(time);combat.writeRipples(water.material.uniforms.impactRipples.value);water.material.uniforms.interactionTime.value=time;for(let i=0;i<dolphinState.wakes.length;i++)water.material.uniforms.dolphinWakes.value[i].copy(dolphinState.wakes[i]);for(const i of impacts.aircraftHits)if(!detonated[i]){detonated[i]=true;explosions[i]=combat.explode(opponents[i].plane.position,time,opponents[i].velocity);opponents[i].plane.visible=false;cameraShocks.push({start:time,index:i});events.explosions.push(i)}
  events.waterHits=impacts.waterHits+(shotIndex===21?dolphinState.splashes:0);
  const shot=shots[shotIndex%shots.length],p=shot.position,l=shot.look;
  if(shotIndex===9){const closeX=shoreline(underwaterAnchor)-16,closeY=Math.min(-2.5,lakebedSurfaceHeight(closeX,underwaterAnchor)+2.4);targetCamera.set(closeX+2.5,closeY+1.1,underwaterAnchor+3);targetLook.set(closeX+.7,closeY,underwaterAnchor-2.5)}else{const scale=(shotIndex===8||shotIndex===10||shotIndex>=11)?1:craftScale;targetCamera.set((p[0]+Math.sin(time*.15)*.5)*scale,(p[1]+Math.sin(time*.2)*.2)*scale,p[2]*scale);targetLook.set(l[0]*scale,l[1]*scale,l[2]*scale);if(c>=0&&c<49&&[12,13,14,17,18,19].includes(shotIndex)){targetCamera.applyQuaternion(aircraft.plane.quaternion);targetLook.applyQuaternion(aircraft.plane.quaternion)}targetCamera.add(aircraft.plane.position);targetLook.add(aircraft.plane.position)}
  if(shotIndex===21){targetLook.copy(dolphinState.centres[dolphinFocusPod]).add(new THREE.Vector3(-1,0,0));targetCamera.copy(targetLook).add(new THREE.Vector3(0,18,4))}else if(shotIndex===22&&birdFocus){targetLook.copy(birdFocus);targetCamera.copy(birdFocus).add(new THREE.Vector3(8,4,10))}
  if(shotIndex===23){const finale=farewellCameraPose(time);targetCamera.copy(finale.position);targetLook.copy(finale.look)}
  if(shotIndex===24){targetCamera.set(1.05,.55,-.65).applyQuaternion(motion.orientation).add(motion.position);targetLook.set(0,.48,.02).applyQuaternion(motion.orientation).add(motion.position)}
  if(shotIndex===25){const view=overshootCameraPose(time);targetCamera.copy(view.position);targetLook.copy(view.look)}
  if(shotIndex===26){const forward=new THREE.Vector3(motion.velocity.x,0,motion.velocity.z).normalize(),right=new THREE.Vector3(-forward.z,0,forward.x);targetCamera.copy(motion.position).addScaledVector(right,6).addScaledVector(forward,2.2).add(new THREE.Vector3(0,-1.2,0));targetLook.copy(motion.position).add(new THREE.Vector3(0,-.3,0))}
  if(shotIndex===27){const view=crossingCameraPose(time,camera.aspect);targetCamera.copy(view.position);targetLook.copy(view.look)}
  // Frame the real positions of the pursuers rather than assuming a fixed formation.
  if(c>=7&&c<49&&(shotIndex===17||shotIndex===19)){targetLook.copy(aircraft.plane.position).multiplyScalar(.45).addScaledVector(opponents[0].plane.position,.275).addScaledVector(opponents[1].plane.position,.275)}
  if(c>=48.7&&c<54&&shotIndex===20){const close=smooth(50,52,c),weight=THREE.MathUtils.lerp(.25,.38,close);targetCamera.copy(aircraft.plane.position).add(new THREE.Vector3(THREE.MathUtils.lerp(-10,-8,close),THREE.MathUtils.lerp(20,6,close),THREE.MathUtils.lerp(24,14,close)));targetLook.copy(aircraft.plane.position).multiplyScalar(1-weight).addScaledVector(opponents[0].plane.position,weight/2).addScaledVector(opponents[1].plane.position,weight/2)}
  if(c>=54&&c<60&&shotIndex===16){targetCamera.copy(aircraft.plane.position).add(new THREE.Vector3(6,4,13));const a=detonated[0]?(c<59.5?explosions[0].position:null):opponents[0].plane.position,b=detonated[1]?(c<56.5?explosions[1].position:null):opponents[1].plane.position,wa=a ? .225 : 0,wb=b ? .225 : 0;targetLook.copy(aircraft.plane.position).multiplyScalar(1-wa-wb);if(a)targetLook.addScaledVector(a,wa);if(b)targetLook.addScaledVector(b,wb)}
  if(initialized&&shotIndex!==9&&shotIndex!==21&&shotIndex!==22&&shotIndex!==23&&shotIndex!==24&&shotIndex!==25&&shotIndex!==26&&shotIndex!==27){const dx=pose.x-lastX,dy=pose.y-lastY,dz=z-lastZ;camera.position.x+=dx;camera.position.y+=dy;camera.position.z+=dz;currentLook.x+=dx;currentLook.y+=dy;currentLook.z+=dz}
  if(shotIndex===23||shotIndex===24||shotIndex===25||shotIndex===26||shotIndex===27||!initialized||lastShot!==shotIndex){camera.position.copy(targetCamera);currentLook.copy(targetLook);initialized=true}else{camera.position.lerp(targetCamera,1-Math.exp(-dt*3));currentLook.lerp(targetLook,1-Math.exp(-dt*4))}
  if(c>=18&&c<30&&(shotIndex===13||shotIndex===18))camera.position.y=Math.max(camera.position.y,.15);
  if(c>=28&&c<49&&(shotIndex===14||shotIndex===19)){const local=camera.position.z+Math.floor((220-camera.position.z)/1350)*1350,ground=terrainHeight(camera.position.x,local);if(ground>0)camera.position.y=Math.max(camera.position.y,ground+4)}
  lastShot=shotIndex;lastZ=z;lastX=pose.x;lastY=pose.y;if(shotIndex===8||shotIndex===21||shotIndex===25)camera.up.set(0,0,-1);else camera.up.set(0,1,0);camera.lookAt(currentLook);
  sky.sky.position.copy(camera.position);sky.stars.position.copy(camera.position);sky.uniforms.dawn.value=dawn;sky.uniforms.time.value=time;sky.uniforms.eyeWorld.value.copy(camera.position);sky.starMat.opacity=(1-dawn)*.78;for(const cloud of clouds){cloud.material.color.setRGB(.6+dawn*.32,.68+dawn*.2,.75+dawn*.12);cloud.position.x=cloud.userData.baseX+Math.sin(time*.025+cloud.userData.baseZ)*3;}hemi.intensity=1.55+dawn*.15+.8*farewellFill;sun.intensity=1.4+dawn*.9;sun.color.setRGB(1,.7+dawn*.16,.58+dawn*.2);if(shotIndex===9){scene.fog.color.setRGB(.015,.11,.12);scene.fog.density=.012}else{scene.fog.color.setRGB(.018+dawn*.50,.03+dawn*.25,.055+dawn*.12);scene.fog.density=shotIndex===8? .001:.0024}
  const fast=c>=0&&c<60,immersive=fast&&[12,13,14,17,18,19].includes(shotIndex),blurTarget=immersive? .025*smooth(3,8,c):0;
  let shakeX=0,shakeY=0,flash=0;for(let i=cameraShocks.length-1;i>=0;i--){const shock=cameraShocks[i],age=time-shock.start;if(age<0||age>=1.7){cameraShocks.splice(i,1);continue}const v=explosionShake(age,shock.index);shakeX+=v.x;shakeY+=v.y;flash=Math.max(flash,v.flash)}const motionScale=reducedMotion?.matches ? .15 : 1,effectiveFlash=flash*(reducedMotion?.matches ? .35 : 1);speedBlur.uniforms.shake.value.set(shakeX*motionScale,shakeY*motionScale);speedBlur.uniforms.blastFlash.value=effectiveFlash;bloom.strength=.12+effectiveFlash*.65;
  speedBlur.uniforms.strength.value=THREE.MathUtils.lerp(speedBlur.uniforms.strength.value,blurTarget,1-Math.exp(-dt*3));speedBlur.uniforms.freeze.value=freezeAmount;const targetFov=immersive?54+6*smooth(12,24,motion.velocity.length()):43;camera.fov=THREE.MathUtils.lerp(camera.fov,targetFov,1-Math.exp(-dt*3));camera.updateProjectionMatrix();
  water.material.uniforms.time.value=time*.32;water.material.uniforms.sunColor.value.setRGB(.22+dawn*.78,.19+dawn*.68,.18+dawn*.57);composer.render();return events;
 }
 function resize(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);composer.setSize(innerWidth,innerHeight)}addEventListener('resize',resize);
 return {update,shots,renderer,scene,camera};
}
