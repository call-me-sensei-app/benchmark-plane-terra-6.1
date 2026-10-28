// Sound effects are synthesized locally; the supplied score shares their mixer.
export function createAudio(score=null) {
 let context=null,master=null,musicGain=null,ambience=null,engine=null,harmonic=null,engineFilter=null,windGain=null,windFilter=null,noiseBuffer=null,enabled=false,paused=false,userMuted=false,lastTime=-1,passed=[false,false],endingWhoosh=false,eventId=0,shotCount=0,playbackActive=false,tourPaused=false,filmDuration=0,scoreRate=1,scoreTime=0,lastScoreSeek=-Infinity;
 const ease=(a,b,x)=>{const u=Math.max(0,Math.min(1,(x-a)/(b-a)));return u*u*(3-2*u)};
 function initialize(){
  const AudioContext=window.AudioContext||window.webkitAudioContext;if(!AudioContext)throw new Error('Web Audio is unavailable');context=new AudioContext();master=context.createGain();master.gain.value=0;const limiter=context.createDynamicsCompressor();limiter.threshold.value=-8;limiter.knee.value=8;limiter.ratio.value=12;limiter.attack.value=.001;limiter.release.value=.18;master.connect(limiter).connect(context.destination);
  ambience=context.createGain();ambience.gain.value=1;ambience.connect(master);
  noiseBuffer=context.createBuffer(1,context.sampleRate*2,context.sampleRate);const data=noiseBuffer.getChannelData(0);let seed=1234567;for(let i=0;i<data.length;i++){seed=(seed*16807)%2147483647;data[i]=(seed/2147483647)*2-1}
  engineFilter=context.createBiquadFilter();const engineGain=context.createGain();engineFilter.type='lowpass';engineFilter.frequency.value=390;engineGain.gain.value=.16;engineFilter.connect(engineGain).connect(ambience);
  engine=context.createOscillator();engine.type='sawtooth';engine.frequency.value=70;engine.connect(engineFilter);engine.start();
  harmonic=context.createOscillator();harmonic.type='triangle';harmonic.frequency.value=140;const harmonicGain=context.createGain();harmonicGain.gain.value=.30;harmonic.connect(harmonicGain).connect(engineFilter);harmonic.start();
  // A slow periodic pulse suggests individual propeller/engine cycles.
  const pulse=context.createOscillator(),pulseDepth=context.createGain();pulse.type='sine';pulse.frequency.value=13;pulseDepth.gain.value=.018;pulse.connect(pulseDepth).connect(engineGain.gain);pulse.start();
  const wind=context.createBufferSource();wind.buffer=noiseBuffer;wind.loop=true;windFilter=context.createBiquadFilter();windFilter.type='lowpass';windFilter.frequency.value=430;windGain=context.createGain();windGain.gain.value=.065;wind.connect(windFilter).connect(windGain).connect(ambience);wind.start();
  if(score){const music=context.createMediaElementSource(score);musicGain=context.createGain();musicGain.gain.value=.58;music.connect(musicGain).connect(master);score.addEventListener('loadedmetadata',()=>syncPlayback(scoreTime,true));}
 }
 function outputWithPan(node,pan,now,duration,move=false){
  if(!context.createStereoPanner){node.connect(master);return}
  const stereo=context.createStereoPanner();stereo.pan.setValueAtTime(pan,now);if(move)stereo.pan.linearRampToValueAtTime(-pan*.8,now+duration);node.connect(stereo).connect(master);
 }
 function gunshot(pan,hero,echo){
  if(!enabled||!context)return;const now=context.currentTime;
  // The close crack, low pressure punch and delayed valley reflections are
  // separate envelopes, so the weapon remains audible over wind and engine.
  const burst=(delay,length,volume,type,frequency,spread)=>{
   const start=now+delay,source=context.createBufferSource(),filter=context.createBiquadFilter(),gain=context.createGain();source.buffer=noiseBuffer;filter.type=type;filter.frequency.value=frequency;filter.Q.value=type==='bandpass' ? .65 : .35;
   gain.gain.setValueAtTime(.0001,start);gain.gain.linearRampToValueAtTime(volume,start+.002);gain.gain.exponentialRampToValueAtTime(.0001,start+length);source.connect(filter).connect(gain);outputWithPan(gain,spread,start,length);source.start(start,(eventId++*.173)%Math.max(.01,2-length));source.stop(start+length);
  };
  burst(0,.028,hero ? .50 : .39,'highpass',1500,pan);
  burst(0,.095,hero ? .46 : .36,'lowpass',1800,pan);
  if(echo){burst(.13,.16,hero ? .15 : .12,'bandpass',850,pan*.65);burst(.29,.20,hero ? .08 : .065,'bandpass',650,-pan*.3)}
  const thump=context.createOscillator(),gain=context.createGain();thump.type='sine';thump.frequency.setValueAtTime(hero?180:150,now);thump.frequency.exponentialRampToValueAtTime(48,now+.09);gain.gain.setValueAtTime(hero ? .25 : .20,now);gain.gain.exponentialRampToValueAtTime(.0001,now+.10);thump.connect(gain);outputWithPan(gain,pan,now,.10);thump.start(now);thump.stop(now+.10);
 }
 function transient(kind,pan=0){
  if(!enabled||!context)return;const now=context.currentTime,source=context.createBufferSource(),filter=context.createBiquadFilter(),gain=context.createGain();source.buffer=noiseBuffer;
  filter.type='lowpass';filter.frequency.value=1200;
  const length=.35,volume=.10;gain.gain.setValueAtTime(volume,now);gain.gain.exponentialRampToValueAtTime(.001,now+length);source.connect(filter).connect(gain);outputWithPan(gain,pan,now,length);source.start(now,(eventId++*.137)%Math.max(.01,2-length));source.stop(now+length);
 }
 function explosion(pan){
  if(!enabled||!context)return;const now=context.currentTime;
  // An impulse, a pressure wave, low rolling rumble and two distant valley
  // reflections share the same impact time but decay at different rates.
  const layer=(delay,length,volume,type,frequency,endFrequency,spread,loop=false)=>{
   const start=now+delay,source=context.createBufferSource(),filter=context.createBiquadFilter(),gain=context.createGain();source.buffer=noiseBuffer;source.loop=loop;filter.type=type;filter.frequency.setValueAtTime(frequency,start);filter.frequency.exponentialRampToValueAtTime(endFrequency,start+length);filter.Q.value=type==='bandpass'?.65:.35;
   gain.gain.setValueAtTime(.0001,start);gain.gain.linearRampToValueAtTime(volume,start+.008);gain.gain.exponentialRampToValueAtTime(.001,start+length);source.connect(filter).connect(gain);outputWithPan(gain,spread,start,length);source.start(start,(eventId++*.173)%Math.max(.01,loop?1.5:2-length));source.stop(start+length);
  };
  layer(0,.12,1.10,'highpass',2000,850,pan);
  layer(0,1.15,1.05,'lowpass',2400,200,pan);
  layer(.005,.72,.95,'bandpass',1400,620,pan*.8);
  layer(.018,.46,.58,'highpass',3800,1200,pan);
  layer(.03,3.2,.78,'lowpass',380,55,pan*.55,true);
  layer(.08,1.45,.38,'bandpass',2200,500,pan);
  layer(.22,.36,.32,'bandpass',1100,620,-pan*.3);
  layer(.38,.85,.38,'lowpass',900,230,-pan*.55);
  layer(.84,1.15,.23,'bandpass',520,160,pan*.35);
  const boom=context.createOscillator(),low=context.createGain();boom.type='sine';boom.frequency.setValueAtTime(120,now);boom.frequency.exponentialRampToValueAtTime(30,now+1.3);low.gain.setValueAtTime(.0001,now);low.gain.linearRampToValueAtTime(.82,now+.012);low.gain.exponentialRampToValueAtTime(.001,now+1.65);boom.connect(low);outputWithPan(low,pan*.4,now,1.65);boom.start(now);boom.stop(now+1.65);
  // Keep the supplied score audible, but give the transient room to cut through.
  if(musicGain){musicGain.gain.cancelScheduledValues(now);musicGain.gain.setValueAtTime(musicGain.gain.value,now);musicGain.gain.linearRampToValueAtTime(.17,now+.05);musicGain.gain.setTargetAtTime(.58,now+.65,.8)}
 }
 function flyby(pan){
  if(!enabled||!context)return;const now=context.currentTime,source=context.createBufferSource(),filter=context.createBiquadFilter(),gain=context.createGain();source.buffer=noiseBuffer;filter.type='bandpass';filter.frequency.setValueAtTime(1450,now);filter.frequency.exponentialRampToValueAtTime(420,now+.42);filter.Q.value=.65;gain.gain.setValueAtTime(.001,now);gain.gain.linearRampToValueAtTime(.16,now+.07);gain.gain.exponentialRampToValueAtTime(.001,now+.46);source.connect(filter).connect(gain);outputWithPan(gain,pan,now,.46,true);source.start(now,(eventId++*.137)%1.5);source.stop(now+.46);
 }
 async function setEnabled(value){if(value){if(!context)initialize();if(context.state!=='running')await context.resume();if(context.state!=='running')throw new Error('The browser did not start audio')};enabled=value;if(context)master.gain.setTargetAtTime((enabled && !paused) ? .55 : 0,context.currentTime,.08);return enabled}
 function syncPlayback(time,force=false){
  if(!score||!playbackActive)return;scoreTime=Math.max(0,time);
  if(Number.isFinite(score.duration)&&score.duration>0&&filmDuration>0){scoreRate=Math.max(.5,Math.min(2,score.duration/filmDuration));if(Math.abs(score.playbackRate-scoreRate)>.0001)score.playbackRate=scoreRate;if(!score.preservesPitch)score.preservesPitch=true;const target=Math.min(score.duration-.01,scoreTime*scoreRate);if(force||(!score.seeking&&Math.abs(score.currentTime-target)>.35&&context.currentTime-lastScoreSeek>1)){score.currentTime=target;lastScoreSeek=context.currentTime}}
 }
 function resumeScore(){if(score&&playbackActive&&!paused&&!tourPaused){const promise=score.play();if(promise)promise.catch(error=>console.error('Unable to resume background music:',error))}}
 async function startPlayback(offset=0,duration=0){
  if(!context)initialize();playbackActive=true;filmDuration=duration;scoreTime=offset;paused=false;syncPlayback(offset,true);
  const musicStart=score?score.play():Promise.resolve();const soundStart=userMuted?Promise.resolve(false):setEnabled(true);
  try{const [sound]=await Promise.all([soundStart,musicStart]);return sound}catch(error){if(score)score.pause();playbackActive=false;throw error}
 }
 async function toggle(){const value=!enabled;userMuted=!value;try{return await setEnabled(value)}catch(error){userMuted=false;throw error}}
 function setPaused(value){paused=value;if(context)master.gain.setTargetAtTime((enabled && !paused) ? .55 : 0,context.currentTime,.08);if(score&&playbackActive){if(value)score.pause();else resumeScore()}}
 function setTourPaused(value){tourPaused=value;if(score&&playbackActive){if(value)score.pause();else resumeScore()}}
 function stopPlayback(){playbackActive=false;if(score)score.pause();enabled=false;if(context)master.gain.setTargetAtTime(0,context.currentTime,.18)}
 function update(time,chase,events={}){
  if(!context)return;if(time<lastTime-.5){passed=[false,false];endingWhoosh=false;shotCount=0}lastTime=time;
  // Let the engine and wind recede with the departing aircraft without
  // fading the music or the final fly-by effect.
  ambience.gain.setTargetAtTime(chase>=60?1-ease(64.2,66.1,chase):1,context.currentTime,.14);
  const throttle=chase>=0&&chase<60?ease(0,5,chase):0;engine.frequency.setTargetAtTime(70+38*throttle,context.currentTime,.35);harmonic.frequency.setTargetAtTime(140+76*throttle,context.currentTime,.35);engineFilter.frequency.setTargetAtTime(390+390*throttle,context.currentTime,.45);windFilter.frequency.setTargetAtTime(430+1150*throttle,context.currentTime,.45);windGain.gain.setTargetAtTime(.065+.095*throttle,context.currentTime,.45);
  if(!enabled||paused)return;
  for(let i=0;i<2;i++)if(chase>=(i?2.2:.8)&&chase<4&&!passed[i]){passed[i]=true;flyby(i ? .7 : -.7)}
  if(chase>=62.8&&chase<64&&!endingWhoosh){endingWhoosh=true;flyby(-.85)}
  for(const i of events.enemyShots||[]){const pan=i ? .65 : -.65;gunshot(pan,false,shotCount++%5===0)}
  if(events.heroShot)gunshot(shotCount%2 ? .2 : -.2,true,shotCount++%5===0);
  for(let i=0;i<Math.min(2,events.waterHits||0);i++)transient('splash',i ? .35 : -.35);
  for(const i of events.explosions||[])explosion(i ? -.45 : .45);
 }
 return {startPlayback,toggle,setPaused,setTourPaused,stopPlayback,syncPlayback,update};
}
