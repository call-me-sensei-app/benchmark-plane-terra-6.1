import assert from 'node:assert/strict';
import { createAudio } from '../audio.js';

// Exercise the sound graph and event scheduling without requiring a speaker.
const contexts=[];
class Param {
 constructor(){this.value=0;this.target=null;this.max=0;this.min=Infinity}
 setValueAtTime(value){this.value=value;this.max=Math.max(this.max,value);this.min=Math.min(this.min,value)}
 setTargetAtTime(value){this.target=value}
 linearRampToValueAtTime(value){this.value=value;this.max=Math.max(this.max,value);this.min=Math.min(this.min,value)}
 exponentialRampToValueAtTime(value){this.value=value;this.max=Math.max(this.max,value)}
 cancelScheduledValues(){}
}
class Node {
 constructor(context){this.context=context;this.gain=new Param();this.frequency=new Param();this.Q=new Param();this.pan=new Param();this.threshold=new Param();this.knee=new Param();this.ratio=new Param();this.attack=new Param();this.release=new Param()}
 connect(target){return target}
 start(time=0){this.context.starts++;this.context.startTimes.push(time)}
 stop(time=0){this.context.stopTimes.push(time)}
}
class MockAudioContext {
 constructor(){this.state='suspended';this.currentTime=0;this.sampleRate=8000;this.destination=new Node(this);this.starts=0;this.startTimes=[];this.stopTimes=[];this.gains=[];contexts.push(this)}
 createGain(){const n=new Node(this);this.gains.push(n);return n}
 createDynamicsCompressor(){return new Node(this)}
 createBiquadFilter(){return new Node(this)}
 createOscillator(){return new Node(this)}
 createBufferSource(){return new Node(this)}
 createMediaElementSource(){return new Node(this)}
 createStereoPanner(){return new Node(this)}
 createBuffer(channels,length){const samples=new Float32Array(length);return {getChannelData:()=>samples}}
 async resume(){this.state='running'}
}
globalThis.window={AudioContext:MockAudioContext};
const score={duration:159.88,currentTime:0,playbackRate:1,seeking:false,paused:true,plays:0,handlers:{},addEventListener(name,handler){this.handlers[name]=handler},play(){this.paused=false;this.plays++;return Promise.resolve()},pause(){this.paused=true}};
const audio=createAudio(score);assert.equal(await audio.startPlayback(0,155.4),true,'play should enable sound');
const context=contexts[0],master=context.gains[0];assert.equal(context.state,'running');assert.equal(master.gain.target,.55);
const musicGain=context.gains.at(-1);
assert.equal(score.paused,false,'the supplied background music should start with the film');assert.ok(Math.abs(score.playbackRate-159.88/155.4)<1e-8,'the score should fit the film runtime');
audio.syncPlayback(88,true);assert.ok(Math.abs(score.currentTime-88*score.playbackRate)<1e-6,'the chase shortcut should seek the score');
let starts=context.starts;audio.update(100,12,{enemyShots:[0,1],heroShot:true,waterHits:1,explosions:[0]});assert.ok(context.starts>=starts+5,'visual events must schedule corresponding sound');
starts=context.starts;const gainsBefore=context.gains.length;audio.update(101,13,{enemyShots:[0]});assert.ok(context.starts-starts>=3,'each gunshot needs a crack, body and thump');assert.ok(context.gains.slice(gainsBefore).some(g=>g.gain.max>=.36),'gunfire attack must cut through the engine mix');
starts=context.starts;const scheduleStart=context.startTimes.length;audio.update(142,54,{explosions:[1]});assert.equal(context.starts-starts,10,'an aircraft hit should schedule the complete explosion');assert.ok(context.startTimes.slice(scheduleStart).some(time=>time>=.84),'the blast should have delayed valley echoes');assert.ok(context.stopTimes.some(time=>time>=3.2),'the explosion should include a rolling tail');assert.ok(musicGain.gain.min<=.17&&musicGain.gain.target===.58,'the score should briefly make room for the blast and recover');
starts=context.starts;audio.update(142.1,54.1,{});assert.equal(context.starts,starts,'an explosion must not retrigger on later frames');
starts=context.starts;audio.update(150.8,62.8,{});assert.equal(context.starts,starts+1,'the farewell fly-through should have a sound');starts=context.starts;audio.update(150.9,62.9,{});assert.equal(context.starts,starts,'the farewell sound must not repeat every frame');
audio.setPaused(true);assert.equal(master.gain.target,0);assert.equal(score.paused,true,'pausing the film should pause the score');starts=context.starts;audio.update(101,13,{enemyShots:[0],waterHits:1,explosions:[0]});assert.equal(context.starts,starts,'paused playback must not emit effects');
audio.setPaused(false);assert.equal(master.gain.target,.55);assert.equal(score.paused,false,'resuming the film should resume the score');audio.setTourPaused(true);assert.equal(score.paused,true,'opening the tour should pause the score');audio.setTourPaused(false);assert.equal(score.paused,false,'closing the tour should resume the score');assert.equal(await audio.toggle(),false,'mute should turn sound off');assert.equal(await audio.startPlayback(0,155.4),false,'replay should respect an explicit mute');
assert.equal(await audio.toggle(),true,'sound can be enabled again');assert.equal(master.gain.target,.55);
const ambience=context.gains[1];audio.update(153,65,{});assert.ok(ambience.gain.target>0&&ambience.gain.target<1,'the engine should recede during the departure');audio.update(154.2,66.2,{});assert.equal(ambience.gain.target,0,'the propeller and wind should be silent by the end title');assert.equal(master.gain.target,.55,'the score should remain audible during the engine fade');
audio.stopPlayback();assert.equal(score.paused,true,'the score should stop at the ending screen');assert.equal(master.gain.target,0,'the engine and wind should fade out at the ending screen');assert.equal(await audio.startPlayback(0,155.4),true,'replay should restore sound after the ending');assert.equal(master.gain.target,.55,'replay should restore the sound mix');
audio.update(0,-1,{});assert.equal(ambience.gain.target,1,'replay should restore the propeller and wind');
console.log('Score synchronization, playback sound, rapid gunfire, pause and mute preference: OK');
