import * as THREE from 'three';

const hero = document.getElementById('hero');
const mp4 = hero?.dataset.mp4;
const title = hero?.dataset?.title || 'RV-OTT';
const poster = hero?.dataset?.poster || '';


const MOB_COMFORT_MODES = {
  mob_comfort: {
    screenDistance: 2.5,    
    screenCurve: 0,          //flat plane
    fov: 70,                
    yawOnly: true,          // turn left and right
    name: 'Comfort',
    cameraPosition: [0, 1.6, 0],      
    screenPosition: [0, 1.6, -2.5]   
  },
    mob_immersive: { 
        screenDistance: 3.0,   
        screenCurve: 120,     
    fovMin: 65,
    fovMax:85,
    fov:78,               
    yawOnly: false,       
    name: 'Immersive',
    cameraPosition: [0, 1.6, 0],      
    screenPosition: [0, 1.6, 0]      
  },
};

let currentMode = 'mob_comfort';
/* Utility Function
const toast = (m) => {
  const el = document.getElementById('toast');
  
  el.textContent = m;
  el.style.display = 'block';
  setTimeout(() => el.style.display = 'none', 2200);
};*/

// Debug position logging
function logPositions(label) {
  if (!camera || !screen) return;
  console.group(`🎯 Position Debug: ${label}`);
  console.log('Camera position:', camera.position.toArray());
  console.log('Screen position:', screen.position.toArray());
  console.log('Camera-to-screen distance:', camera.position.distanceTo(screen.position).toFixed(2));
  console.groupEnd();
}

 // -------------------- CHECK --------------------- 
function shortSide(){
  return Math.min(window.screen.width,window.screen.height);
}
function isTouch(){
  return (navigator.maxTouchPoints || 0) >=1;
}

function detectBestMode() {
  //optional manual override  
  const override = new URLSearchParams(location.search).get('mode');
  if (override && ['mob_comfort','mob_immersive'].includes(override)) {
    console.log('Using manual override mode for mobile:', override);
    return override;
  }

  //touch devices only; pick mob_comfort for small screens
  if (isTouch() && shortSide() <=800) return 'mob_comfort';
  if (isTouch() && shortSide() >800) return 'mob_immersive'
  // Fallback (still mobile first)
  return 'mob_comfort';
}

/* Mobile only controller : reads phone sensors (alpha:yaw, beta:pitch, gamma:roll)& rotates the
Three.js camera accordingly. Ask ioS for motion permission seed current angle once then start listening
to deviceOrientation + orientationChange events.
Failure risks: permission denied, unsupported APIs, null sensor frames, insecure origin (HTTP), 
handler name mismatches, render loop not calling update(), extreme DPR causing 
jank/thermal throttling (mitigated elsewhere).
*/

class MobileOrientationControls {
  constructor(camera, yawOnly = false) {
    this.camera = camera;
    this.enabled = false;
    
    this.yawOnly = yawOnly;
    this.smoothing=0.10;
    
    this.deviceOrientation = {alpha:null, beta:null,gamma:null};
    this.screenAngle = 0;  //correct math when user rotates screen portrait/landscape
    
    this._alpha = 0; //yaw
    this._beta = 0;  //pitch
    this._gamma = 0; //roll
    
    this._alphaOffset = 0;
    this._betaOffset=0;
    this._gammaOffset=0;
    
    this._onDO=this._onDO.bind(this);
    this._onSO = this._onSO.bind(this);
  }

  //public API
  setYawOnly(flag) {this.yawOnly=!!flag;}
  setSmoothing(value=0.1) {this.smoothing=Math.max(0,Math.min(1,value));}

  async connect() {
    // Request permission for iOS 13+
    if (typeof DeviceOrientationEvent!='undefined' &&
       typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const p = await DeviceOrientationEvent.requestPermission();
        if (p !== 'granted') {
          console.warn('Device orientation permission denied');
          return false;
        }
      } catch (error) {
          console.error('Error requesting device orientation permission:', error);
        return false;
      }
    }
    
      this._onSO();
    
      if (!window.DeviceOrientationEvent) return false;
      window.addEventListener('deviceorientation', this._onDO, false);
      window.addEventListener('orientationchange', this._onSO, false);
      this.enabled = true;
      console.log('Mobile orientation controls connected');
      return true;
    }

  disconnect() {
    window.removeEventListener('deviceorientation', this._onDO, false);
    window.removeEventListener('orientationchange', this._onSO, false);
    this.enabled = false;
  }
  dispose() {this.disconnect();}

  calibrateYaw(){
    if(this.deviceOrientation.alpha === null) return;
    this._alphaOffset = -THREE.MathUtils.degToRad(this._alpha);
  }

  recenterAll(){
    if(this.deviceOrientation.alpha === null) return;
    this._alphaOffset = -THREE.MathUtils.degToRad(this._alpha);
    this._betaOffset = -THREE.MathUtils.degToRad(this._alpha);
    this._gammaOffset = -THREE.MathUtils.degToRad(this._alpha);
  }

  update() {
    if (!this.enabled) return;
  
    const d = this.deviceOrientation;
    if (d.alpha == null || d.beta == null|| d.gamma==null) return;

    const k = this.smoothing;
    this._alpha += (d.alpha-this._alpha) * k;
    this._beta += (d.beta - this._beta) * k;
    this._gamma += (d.gamma - this._gamma) * k;

    const a = THREE.MathUtils.degToRad(this._alpha) + this._alphaOffset;
    let b = THREE.MathUtils.degToRad(this._beta) + this._betaOffset;
    let g = THREE.MathUtils.degToRad(this._gamma) + this._gammaOffset;

    if(this.yawOnly) {b=0; g=0;}
      const orient = THREE.MathUtils.degToRad(this.screenAngle || 0);

    const zee = new THREE.Vector3(0,0,1);
    const euler = new THREE.Euler();
    const q0 = new THREE.Quaternion();
    const q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // -PI/2 around X
    euler.set(b,a,-g,'YXZ');
    this.camera.quaternion.setFromEuler(euler);
    this.camera.quaternion.multiply(q1);
    q0.setFromAxisAngle(zee,-orient);
    this.camera.quaternion.multiply(q0);
  }
  _onDO(e){
    this.deviceOrientation.alpha = (e.alpha ?? null);
    this.deviceOrientation.beta = (e.beta ?? null);
    this.deviceOrientation.gamma = (e.gamma ?? null);
  }
  _SO(){
    this.screenAngle = (screen.orientation && typeof screen.orientation.angle === 'number')
      ? screen.orientation.angle
      : (window.orientation || 0);
  }
}


/*
 * createMobileRenderer
 * Essence: Build a lean WebGL renderer tuned for phones/tablets (magic window only).
 * - Disables WebXR (no headset), caps pixel ratio to save battery/heat,
 * - chooses a fast power profile, and sets sane defaults for video textures.
 *
 * Can fail because:
 * - WebGL not supported / blocked (renderer creation throws or returns null).
 * - Context lost on low-memory devices (we attach a listener to warn/recover).
 * - Extreme devicePixelRatio causing huge canvases (we clamp DPR).
 */

function createMobileRenderer() {
  const options = {
    antialias: true,        
    alpha: false,
    stencil: false,
    depth: true,
    logarithmicDepthBuffer: false,
    powerPreference: "high-performance",
    failIfMajorPerformanceCaveat: false,
    preserveDrawingBuffer: false
  };

  let r;
  try {
    r = new THREE.WebGLRenderer(options);
  } catch(e){
    console.error('WebGLRenderer creation failed:', e);
    return null;
  }
  
  r.xr.enabled = false;
  r.setSize(window.innerWidth, window.innerHeight);
  const maxDPR = 1.5;
  r.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDPR));
  r.shadowMap.enabled = false; // Keep disabled for performance
  r.physicallyCorrectLights = false;
  r.setPixelRatio(pixelRatio);

  r.domElement.addEventListener('webglcontextlost',(ev)=>{
    ev.preventDefault();
    console.warn('WebGL context lost (mobile). Will attempt to recover on restore.');
  });
  r.domElement.addEventListener('webglcontextrestored',()=>{
    console.warn('WebGL context restored. You may need to rebuild materials/textures.');
  });

  return r;
}

/* Essence: add a lightweight starfield around the viewer by placing ~300 points on a sphere
  (radius ~25–35). Uses BufferGeometry for speed and a subtle PointsMaterial so the backdrop
  feels cinematic without distraction. depthWrite=false keeps stars from occluding other objects.
  Fail if too many stars - test with very high stars count (Expect dropped FPS or )
*/
function createStars() {
  const starsGeometry = new THREE.BufferGeometry();
  const starsCount = 300; // Reduced count for less distraction
  const positions = new Float32Array(starsCount * 3);

  for (let i = 0; i < starsCount; i++) {
    const i3 = i * 3;
    
    const radius = 25 + Math.random() * 10; // Further away
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    
    positions[i3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i3 + 1] = radius * Math.cos(phi);
    positions[i3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
  }

  starsGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const starsMaterial = new THREE.PointsMaterial({
    color: 0x4a6b8a,  // More subtle blue-grey
    size: 0.3,        // Much smaller
    transparent: true,
    opacity: 0.3,     // More transparent
    sizeAttenuation: true
  });
  starsMaterial.depthWrite = false; // <-- add this
  const stars = new THREE.Points(starsGeometry, starsMaterial);
  scene.add(stars);

  console.log('Added', starsCount, 'subtle stars to scene');
  return stars;
}


/* Essence: (mobile) build the video surface for the current mode.
 - Comfort → flat 16:9 plane in front (FrontSide, UV V flipped)
 - Immersive → inside a sphere segment (BackSide, centered at origin)
 - Updates camera FOV and disposes old meshes to avoid GPU leaks.
 - We pick comfort or immersive from the mode
   We dispose the old screen so that it stays clean
   comfort = make flat screen immersive = make inside of a bowl
   we put in the environment mesh (room) and set camera lens width(fov)
   now the screen mesh (tv) is ready for video texture
 */

function buildTheaterScreen() {
  const config = MOB_COMFORT_MODES[currentMode];
  if (!config || !scene || !camera) { console.warn('buildTheaterScreen: missing config/scene/camera');
     return null; }

  if (screen) {
    scene.remove(screen);
    if (screen.material && screen.material.map) screen.material.map.dispose(); 
    if (screen.material) screen.material.dispose();
    if (screen.geometry) screen.geometry.dispose();
    screen = null;
  }

  let screenGeo, materialSide;
  
  if (config.screenCurve === 0) {   //flat screen (comfort)
    screenGeo = new THREE.PlaneGeometry(6, 3.375, 32, 18); // 16:9 ratio
    materialSide = THREE.FrontSide;

    const uv = screenGeo.attributes.uv;
    for (let i = 0; i < uv.array.length; i += 2) uv.array[i + 1] = 1 - uv.array[i + 1];
      uv.needsUpdate = true;
  }
     else{
     const radius = config.screenDistance;
     const phiLength = THREE.MathUtils.degToRad(config.screenCurve); //how wide the arc is
     const thetaLength = THREE.MathUtils.degToRad(90);               // how tall
     const phiStart = (3*Math.PI)/2 - phiLength/2;                   // center arc in front
     screenGeo = new THREE.SphereGeometry(
      radius, 64, 64, phiStart, phiLength,
      Math.PI/2 - thetaLength/2, thetaLength
    );
    materialSide = THREE.BackSide;   
  }

    const placeholderMaterial = new THREE.MeshBasicMaterial({color: 0x333333,side: materialSide});
    screen = new THREE.Mesh(screenGeo,placeholderMaterial);

    if (config.screenCurve===0) screen.position.set(...config.screenPosition);
    else screen.position.set(0,0,0); 
    scene.add(screen);

    camera.fov = config.fov;
    camera.updateProjectionMatrix();

    console.log(`Built ${config.name} theater:`, {
    distance: config.screenDistance,
    curve: config.screenCurve,
    fov: config.fov,
    position: screen.position.toArray(),
    side: materialSide
  });

  return screen;
}

  function buildScene() {
  /* 1) scene + camera */
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
  
  const cfg = MOB_COMFORT_MODES[currentMode];
  camera.position.set(...cfg.cameraPosition);

  /* 2) Create mobile-optimized renderer */
  renderer = createMobileRenderer();
  if (!renderer) {console.error('No WebGL renderer'); return false;}

  /* Mount to container(prefer xrWrap,else body) */
  const mountEl = document.getElementById('xrWrap') || document.body;
  mountEl.appendChild(renderer.domElement);

  /* 3) Room (inverted sphere -> you are inside it) */
  const roomGeo = new THREE.SphereGeometry(30, 32, 16);
  roomGeo.scale(-1, 1, 1);
  const roomMat = new THREE.MeshBasicMaterial({ color: 0x050810 }); // Darker
  const room = new THREE.Mesh(roomGeo, roomMat);
  scene.add(room);
  console.log('Added room sphere');

  /* 4) Subtle ambience + stars + glow*/
  const hemi = new THREE.HemisphereLight(0x4a6b8a, 0x050810, 0.25);
  scene.add(hemi);
  createStars();

  const glow = new THREE.Mesh(
    new THREE.RingGeometry(2,2.5,32),
    new THREE.MeshBasicMaterial({
      color : 0x1a4d6b,
      side : THREE.DoubleSide,
      transparent : true,
      opacity : 0.08
    })
  );
  glow.rotation.x = -Math.PI/2;   //lay flat
  glow.position.y  = 0.01;       // slightly above floor to avoid z-fighting
  glow.renderOrder = -1;        // draw behind most things
  scene.add(glow);


  /* 5) Video surface (tv) */
  buildTheaterScreen(currentMode);

  /* 6) Handle resize */
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
  
  /* 7) First paint (optional) */
  renderer.render(scene, camera);
  return true;
}

/**
 * enhanceXRToolbar()
 * Essence: Build the tiny mobile toolbar: mode switch (Comfort/Immersive),
 * Recenter (zeros yaw + recenters camera), and Close.
 * Mobile-only: uses currentMode + MOB_COMFORT_MODES; no desktop/XR paths.
 * Can fail because: toolbar elements missing; mwControls not connected yet.
 */  


function enhanceXRToolbar() {
  const toolbar = document.getElementById('xrToolbar');
  const closeBtn = document.getElementById('xrClose');
  if (!toolbar || !closeBtn) return;
  const modeSelector = document.createElement('select');
  modeSelector.id = 'modeSelector';
  modeSelector.setAttribute('aria-label','Viewing Mode');
  modeSelector.style.cssText = 
     'border:0;background:rgba(0,0,0,.55);color:#fff;padding:10px 12px;border-radius:12px;margin-right:10px;border:1px solid rgba(120,160,255,.35);font-size:14px;touch-action:manipulation;';
  modeSelector.innerHTML = `
    <option value="mob_comfort">Comfort</option>
    <option value="mob_immersive">Immersive</option>
  `;
  modeSelector.value = currentMode;

  const recenterBtn = document.createElement('button');
  recenterBtn.textContent = 'Recenter';
  recenterBtn.setAttribute('aria-label','Recenter View');
  recenterBtn.style.cssText = `
    border: 0; background: rgba(0,0,0,.5); color: #fff;
    padding: 10px 14px; border-radius: 12px; margin-right: 10px;
    border: 1px solid rgba(120,160,255,.3); font-size:14px;touch-action:manipulation;`;

  toolbar.insertBefore(modeSelector,closeBtn);
  toolbar.insertBefore(recenterBtn,closeBtn);

  modeSelector.addEventListener('change',(e)=>{
    currentMode = e.target.value;  
    rebuildTheaterWithMode(currentMode);
    if(mwControls) mwControls.setYawOnly(MOB_COMFORT_MODES[currentMode].yawOnly);
    const name = MOB_COMFORT_MODES[currentMode]?.name || 'Mode';
    const el = document.getElementById('toast'); 
    if (el) { el.textContent = `Switched to ${name}`; el.style.display = 'block'; setTimeout(() => el.style.display = 'none', 1800); }
  });

  recenterBtn.addEventListener('click',() => {
    if (mwControls && typeof mwControls.calibrateYaw === 'function') mwControls.calibrateYaw();
    recenterToTheater();
    const el = document.getElementById('toast');
    if (el) { el.textContent = 'View recentered'; el.style.display = 'block'; setTimeout(() => el.style.display = 'none', 1200); }
    if (navigator.vibrate) try { navigator.vibrate(10); } catch {} // Optional subtle haptic (mobile Safari/Chrome where supported)
  });
}

/**
 * recenterToTheater()
 * Essence (mobile): Reset camera back to the right seat for current mode.
 * - Comfort → reset position & rotation, look at flat screen
 * - Immersive → reset position & zero rotation (screen wraps around you)
 * Can fail if: scene/camera not ready, config missing.
 */

function recenterToTheater() {
  const cfg = MOB_COMFORT_MODES[currentMode];
  if (!cfg||!camera) {
    console.warn('recenterToTheater: missing config/camera');
    return;
  }
  camera.position.set(...cfg.cameraPosition);
  camera.rotation.set(0, 0, 0);

  if (cfg.screenCurve === 0) {
    camera.lookAt(...cfg.screenPosition);
  }
}

/*
  Essence (mobile): Wrap an <video> element as a THREE.VideoTexture and
 * set UV settings for our two screen types:
 *  - Comfort (flat plane / FrontSide): no flipY, clamp edges
 *  - Immersive (curved / BackSide): flipY, repeat horizontally (mirrors UVs)
 * Can fail if: videoEl missing/blocked (CORS/autoplay), or THREE not loaded. 
*/

function createVideoTexture(videoEl) {
  if(!videoEl) {console.warn('createVideoTexture: no <video> element'); return null;}
  const tex = new THREE.VideoTexture(videoEl);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  if('colorSpace' in tex){
    tex.colorSpace = THREE.SRGBColorSpace;}
  else{
    tex.encoding = THREE.sRGBEncoding;
   }

  const isFlat = MOB_COMFORT_MODES[currentMode]?.screenCurve === 0;
  if (isFlat){
    tex.flipY = false;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.offset.set(0,0);
    tex.repeat.set(1,1);
  } else {
    tex.flipY = true;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.offset.set(1,0);
    tex.repeat.set(-1,1);
  }
  return tex;
}
  
/**
 - attachVideoToScreen()
 - Essence (mobile): Create/configure the <video>, build a VideoTexture, put it on the screen.
 - Adjusts flat screen geometry to match the real video aspect (after metadata).
 - Keeps curved mode as-is (the texture wraps around the bowl).
 - Can fail if: screen missing, mp4 missing, autoplay blocked (handled by user tap elsewhere).
 */

async function attachVideoToScreen(){
  if (!screen) {console.warn('attachVideoToScreen: no screen yet'); return null; }
  if (!mp4) {console.warn('attachVideoToScreen: no mp4 source'); return null; }

/* 1) Make the <video> element (mobile-friendly flags) */
const videoEl = document.createElement('video');
videoEl.src = mp4;
if (needsCORS(mp4)) {videoEl.crossOrigin = 'anonymous'; videoEl.setAttribute('crossorigin','anonymous');}
videoEl.playsInline = true;
videoEl.setAttribute('playsinline', '');
videoEl.setAttribute('webkit-playsinline', '');
//videoEl.muted = false; 
//videoEl.volume = 1.0;
videoEl.loop = true;
videoEl.preload = 'auto';
if (poster) videoEl.poster = poster;

/* 2) When we learn the real size, fix flat TV aspect */
const isFlat = MOB_COMFORT_MODES[currentMode]?.screenCurve === 0;
videoEl.addEventListener('loadedmetadata',() => {
    if (isFlat && screen.geometry) {
      const vw = videoEl.videoWidth || 1920;
      const vh = videoEl.videoHeight || 1080;
      const aspect = vw / vh; 
      const h = 3.0;
      const w = h * aspect;

      screen.geometry.dispose();
      screen.geometry = new THREE.PlaneGeometry(w,h,32,18);

      const uv = screen.geometry.attributes.uv;
      for (let i = 0 ;i < uv.array.length; i+=2) uv.array[i+1] = 1 - uv.array[i+1];
      uv.needsUpdate = true;
    }
});

/* 3) Build the VideoTexture and audiograph so not muted on starting */
const tex = createVideoTexture(videoEl);
if (!tex) { console.warn('attachVideoToScreen: texture creation failed'); return null; }
const audio = buildAudioGraph(videoEl);
await audio?.ensureRunning();

/* 4) Swap material on screen (keep side from existing placeholder) */
const oldMat = screen.material;
const side = oldMat?.side ?? THREE.FrontSide;
screen.material = new THREE.MeshBasicMaterial({
  map : tex,
  side,
  toneMapped : false,
});
if (oldMat && oldMat.map) oldMat.map.dispose()
if (oldMat) oldMat.dispose();

/* 5) Try to start (may require user gesture handle elsewhere) */
try { await videoEl.play(); } catch (err) { console.warn('video play() failed:', err); }

/* 6) Keep texture fresh in the render loop (tick elsewhere uses needsUpdate) */
screen.material.map.needsUpdate = true;

return {videoEl,texture:tex};
}
/* SUMMARY 
Kid-mode pass (what each block does)
- Check we have a TV & a movie: if not, we stop politely.
- Make a movie player (<video>) and set it to behave inside the page (no forced fullscreen), with sound on.
- When the movie tells us its real size, if we’re using a flat TV, we reshape the TV so the picture isn’t squished.
- Turn the movie into a sticker (VideoTexture) that the 3D world understands.
- Wire up the sound (video → volume knob → speakers) and unlock audio (some phones require this).
- Glue the sticker onto the TV by replacing the material; throw the old material away to keep the GPU tidy.
- Ask the movie to start; if the browser still wants a tap, we log why and wait.
- Mark the sticker fresh so the first frame appears.
- Return both the video element and the texture for later control.
*/


/* AUDIO GRAPH 
Essence (mobile): Create a simple Web Audio chain for the <video>:
 -  building sound wire for the movie
 -  <video> → masterGain → speakers
 - Keeps it minimal (government-grade stability): one master gain for fades/mute.
 - Can fail if: no AudioContext support, constructed before a user gesture on iOS.
*/
function buildAudioGraph(videoEl){
  if (!videoEl) {console.warn('buildAudioGraph: no videoEl'); return null; } 

/* 1) Audio context (mobile safe) */
const AC = window.AudioContext || window.webkitAudioContext;
if (!AC) {console.warn('Web Audio API not supported'); return null; }
const audioCtx  = new AC();

/* 2) Nodes : source->masterGain->destination */
const src = audioCtx.createMediaElementSource(videoEl);
const masterGain = audioCtx.createGain();
masterGain.gain.value = 1.0; 
src.connect(masterGain).connect(audioCtx.destination);

/* 3) Helpful : expose a resume hook for iOS (needs user gesture)*/
const ensureRunning = async() =>{
  if (audioCtx.state !== 'running'){
    try {await audioCtx.resume();} catch(e) {console.warn('AudioContext resume failed:', e);}
  }
};
  return {audioCtx,masterGain,ensureRunning};
}

/**
 - enableAudioForMode(videoEl, mode = currentMode)
 - Essence: Make sure audio is active, unmuted, and gently set volume for the chosen mode.
 - Comfort  → natural loudness (1.0)
 - Immersive → tiny lift (+~1 dB) for a bigger-room feel (1.1)
 - Uses the audio graph you built via buildAudioGraph(videoEl).
 - Safe to call on every mode change and right after attachVideoToScreen().
 - Can fail if: audio graph not created yet, or AudioContext needs a user gesture.
 */
async function enableAudioForMode(videoEl,mode = currentMode){
  if (!audio || !audio.audioCtx || !audio.masterGain) {
      console.warn('enableAudioForMode: audio graph not ready');
      return false;
  }
  if (!videoEl){
    console.warn('enableAudioForMode: missing videoEl');
    return false;
  }
  /* make sure the browser lets us output audio (iOS needs a user gesture) */
  await audio.ensureRunning?.();
  /* ensure the element isn't muted and is at full volume */
  try {
    videoEl.muted=false;
    videoEl.volume=1.0;
  } catch(e){
    console.warn('enableAudioForMode: could not unmute video element:', e);
  }
  /* per-mode loudness (subtle; premium but not jarring) */
  const ctx = audio.audioCtx;
  const targetGain = (mode === 'mob_immersive') ? 1.1 : 1.0; 
  audio.masterGain.gain.setTargetAtTime(targetGain,ctx.currentTime,0.08);
  return true;
}

/**
 * startMagicWindow()
 * Essence (mobile): run the frame loop — update phone controls, render the scene.
 * Returns: a stop() function to cancel the loop.
 * Notes: assumes scene/camera/renderer exist; video already attached.
 */
function startMagicWindow() {
  if (!scene||!camera||!renderer){
    console.warn('startMagicWindow: scene/camera/renderer missing');  return ()=>{};
  }
  let rafId=0;
  let running=false;

  const tick=()=>{
    /* update phone orientation controls(magic-window) */
    if (mwControls && mwControls.enabled) mwControls.update();
  
    /* keep VideoTexture fresh (safe no-op if not present)*/
    if (screen && screen.material && screen.material.map){
      screen.material.map.needsUpdate = true;
    }
      renderer.render(scene, camera);
      rafId = requestAnimationFrame(tick);};
    
    
      const onVis = ()=>{
        if (document.hidden){
          if(running) cancelAnimationFrame(rafId);
          running = false;
        } else{
          if(!running){
            running=true;
            rafId = requestAnimationFrame(tick);
          }
        }
      };
      document.addEventListener('visibilitychange',onVis);
      running = true;
      rafId = requestAnimationFrame(tick);

      return() => {
        running = false;
        cancelAnimationFrame(rafId);
        document.removeEventListener('visibilitychange',onVis)
      };
  }

  let stopLoop = null;
  let videoElRef = null;
  
  /*
  - Essence: bind the Close (X) button so we can stop the loop, pause video,
  - dispose screen/material/texture, dispose renderer, and hide the canvas.
  - Can fail if: elements not in DOM; guards prevent crashes.
 */
function wireXRClose() {
  const btn  = document.getElementById('xrClose');
  const wrap = document.getElementById('xrWrap');
  if (!btn) return;

  btn.addEventListener('click', () => {
    // 1) stop the render loop
    try { if (stopLoop) stopLoop(); } catch {}

    if (videoElRef) {
      try { videoElRef.pause(); } catch {}
      try { videoElRef.src = ''; videoElRef.load(); } catch {}
      videoElRef = null;
    }
    
    if (screen) {
      try { if (screen.material && screen.material.map) screen.material.map.dispose(); } catch {}
      try { if (screen.material) screen.material.dispose(); } catch {}
      try { if (screen.geometry) screen.geometry.dispose(); } catch {}
      try { scene.remove(screen); } catch {}
      screen = null;
    }

    if (renderer) {
      try { renderer.dispose(); } catch {}
      try {
        const canvas = renderer.domElement;
        if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
      } catch {}
      renderer = null;
    }
    
    if (wrap) wrap.style.display = 'none';

    const t = document.getElementById('toast');
    if (t) {
      t.textContent = 'Closed Theater';
      t.style.display = 'block';
      setTimeout(() => { t.style.display = 'none'; }, 1200);
    }

    // optional: clear loop handle
    stopLoop = null;
  });
}

document.addEventListener('DOMContentLoaded',()=>{
  const heroEl = document.getElementById('hero');
  if (!heroEl) return;
  heroEl.addEventListener('click',async()=>{
    try{
      currentMode = detectBestMode();
      
      const ok = buildScene();
      if (!ok) {console.warn('Failed to build scene'); return; }
      
      enhanceXRToolbar();
      wireXRClose();
      
      const res = await attachVideoToScreen();
      if (!res) {console.warn('attachVideoToScreen failed');return;}
      const {videoEl} = res;  
      videoElRef = videoEl;

      audio = buildAudioGraph(videoElRef);
      await enabledAudioForMode(videoElRef,currentMode);

      startLoop = startMagicWindow();

      const t = document.getElementById('toast');
      if (t) {t.textContent='Theater started'; t.style.display='block';setTimeout(() => t.style.display = 'none', 1200); }
    } catch(e){
      console.error('Startup failed: ',e);
    }
  });
});


     










 
  
  
  
  

