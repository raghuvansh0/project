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

  /* 4) Subtle ambience + stars */
  const hemi = new THREE.HemisphereLight(0x4a6b8a, 0x050810, 0.25);
  scene.add(hemi);
  createStars();

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
  

  

