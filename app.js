import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';

// Constants
const hero = document.getElementById('hero');
const mp4 = hero.dataset.mp4;
const title = hero.dataset.title || 'RV-OTT';
const poster = hero.dataset.poster || '';
const YT_ID = 'JVAZGhSdczM';

// ASUS ZenBook Duo optimized comfort modes
const COMFORT_MODES = {
  phone: {
    screenDistance: 2.5,    
    screenCurve: 0,         // Flat screen
    fov: 70,                // Comfortable for laptop screen
    yawOnly: true,
    name: 'Comfort',
    cameraPosition: [0, 1.6, 0],      // Camera at center
    screenPosition: [0, 1.6, -2.5]     // Screen in front
  },
  desktop: {
    screenDistance: 4.0,    // Optimized for laptop screen size
    screenCurve: 130,       // Full wrap-around for immersion
    fovMin: 65,
    fovMax:85,
    fov:78,
    yawOnly: false,
    name: 'Immersive',
    cameraPosition: [0, 1.6, 0],      // Camera at center
    screenPosition: [0, 1.6, 0]       // sphere segment is centered at camera
  }
};

let currentMode = 'phone';

// Utility Functions
const toast = (m) => {
  const el = document.getElementById('toast');
  el.textContent = m;
  el.style.display = 'block';
  setTimeout(() => el.style.display = 'none', 2200);
};

// Debug position logging
function logPositions(label) {
  if (!camera || !controls || !screen) return;
  console.group(`🎯 Position Debug: ${label}`);
  console.log('Camera position:', camera.position.toArray());
  console.log('Controls target:', controls.target.toArray());
  console.log('Screen position:', screen.position.toArray());
  console.log('Camera-to-screen distance:', camera.position.distanceTo(screen.position).toFixed(2));
  console.groupEnd();
}

async function xrSupported() {
  if (!('xr' in navigator)) return false;
  try {
    return await navigator.xr.isSessionSupported('immersive-vr');
  } catch {
    return false;
  }
}

function inTelegram() {
  return /Telegram/i.test(navigator.userAgent) || (window.Telegram && window.Telegram.WebApp);
}

function isMobile() {
  // ASUS ZenBook Duo specific: treat as desktop even with touch
  return false; // Force desktop behavior for laptop testing
}

function isTablet() {
  return (navigator.maxTouchPoints && navigator.maxTouchPoints > 2 && window.innerWidth > 768) ||
         /iPad/i.test(navigator.userAgent);
}

function detectBestMode() {
  // Force desktop for Zenbook Duo testing
  console.log('ZenBook Duo: Forcing desktop mode, window width:', window.innerWidth);
  return 'desktop';  // Always return desktop for your testing
  //if (window.innerWidth >= 1200) return 'desktop';  // Full immersive for laptop
  //if (window.innerWidth >= 900) return 'tablet';    // Cinema mode for smaller windows
  //return 'phone';  // Comfort fallback
}

// Enhanced Media Player Setup
function setupMediaPlayers() {
  const ov2d = document.getElementById('ov2d');
  const v2d = document.getElementById('v2d');
  
  const controlPanel = document.createElement('div');
  controlPanel.id = 'theaterControls';
  controlPanel.style.cssText = `
    position: fixed; bottom: 80px; right: 20px; z-index: 999;
    background: rgba(10, 15, 40, 0.85); 
    border: 1px solid rgba(56, 182, 255, 0.3);
    border-radius: 12px; padding: 16px; 
    color: #dfe8ff; display: none;
    backdrop-filter: blur(10px);
    min-width: 180px;
  `;
  
  controlPanel.innerHTML = `
    <div style="margin-bottom: 12px; font-weight: 700; font-size: 14px; color: #38b6ff;">
      Choose Experience
    </div>
    <button id="enterTheater" style="
      width: 100%; margin-bottom: 8px; background: rgba(56, 182, 255, 0.2);
      color: #fff; border: 1px solid #38b6ff; border-radius: 8px; 
      padding: 10px; font-weight: 600; cursor: pointer;
    ">Enter Theater</button>
    <button id="play2d" style="
      width: 100%; margin-bottom: 8px; background: rgba(255, 255, 255, 0.08);
      color: #dfe8ff; border: 1px solid #4a7c9e; border-radius: 8px; 
      padding: 10px; font-weight: 600; cursor: pointer;
    ">Play 2D</button>
    <button id="openYT" style="
      width: 100%; background: rgba(255, 0, 0, 0.2);
      color: #fff; border: 1px solid #ff4444; border-radius: 8px; 
      padding: 10px; font-weight: 600; cursor: pointer;
    ">YouTube Trailer</button>
    <div style="margin-top: 12px; font-size: 11px; color: #8aa3c7;">
      Mode: <span id="currentMode">Comfort</span>
    </div>
  `;
  
  document.body.appendChild(controlPanel);

  // Event handlers
  document.getElementById('play2d').addEventListener('click', (e) => {
    e.preventDefault();
    v2d.src = mp4 || '';
    document.getElementById('t2d').textContent = title;
    ov2d.style.display = 'block';
    controlPanel.style.display = 'none';
    v2d.play().catch(() => toast('Tap to start video'));
  });

  document.querySelector('[data-close="ov2d"]').onclick = () => {
    v2d.pause();
    v2d.src = '';
    ov2d.style.display = 'none';
  };

  const ovYT = document.getElementById('ovYT');
  const yt = document.getElementById('yt');

  document.getElementById('openYT').addEventListener('click', (e) => {
    e.preventDefault();
    yt.src = `https://www.youtube.com/embed/${YT_ID}?autoplay=1&modestbranding=1&rel=0&playsinline=1`;
    ovYT.style.display = 'block';
    controlPanel.style.display = 'none';
  });

  document.querySelector('[data-close="ovYT"]').onclick = () => {
    yt.src = '';
    ovYT.style.display = 'none';
  };

  return { controlPanel };
}

// Global variables
let renderer, scene, camera, controls, screen, videoEl, videoTex, mwControls;
const xrWrap = document.getElementById('xrWrap');
let audioCtx, mediaSource, masterGain, stereoPanner, lowShelf,highShelf, compressor;//audio global variables
let delay,delayFeedback,reverb,reverbGain = false
let audioReady=false;
let prevPan=0;

// Fixed XR toolbar with proper recenter
function enhanceXRToolbar() {
  const toolbar = document.getElementById('xrToolbar');
  
  const modeSelector = document.createElement('select');
  modeSelector.id = 'modeSelector';
  modeSelector.style.cssText = `
    border: 0; background: rgba(0,0,0,.5); color: #fff;
    padding: 8px 10px; border-radius: 8px; margin-right: 8px;
    border: 1px solid rgba(120,160,255,.3); cursor: pointer;
  `;
  
  modeSelector.innerHTML = `
    <option value="phone">Comfort Mode</option> 
    <option value="desktop">Immersive Mode</option>
  `;
  
  modeSelector.value = currentMode;
  
  const recenterBtn = document.createElement('button');
  recenterBtn.textContent = 'Recenter';
  recenterBtn.style.cssText = `
    border: 0; background: rgba(0,0,0,.5); color: #fff;
    padding: 10px 12px; border-radius: 10px; margin-right: 8px;
    border: 1px solid rgba(120,160,255,.3); cursor: pointer;
  `;
  
  const closeBtn = document.getElementById('xrClose');
  toolbar.insertBefore(modeSelector, closeBtn);
  toolbar.insertBefore(recenterBtn, closeBtn);
  
  // Fixed event handlers
  modeSelector.addEventListener('change', (e) => {
    currentMode = e.target.value;
    rebuildTheaterWithMode(currentMode);
    toast(`Switched to ${COMFORT_MODES[currentMode].name} mode`);
  });
  
  recenterBtn.addEventListener('click', () => {
    recenterToTheater();
    toast('View recentered');
  });
}

// Fixed recenter function
function recenterToTheater() {
  const config = COMFORT_MODES[currentMode];
  
  if (mwControls) {
    // Mobile: Reset orientation and position
    camera.position.set(...config.cameraPosition);
    camera.rotation.set(0, 0, 0);
    if (config.screenCurve === 0) {
      camera.lookAt(...config.screenPosition);
    }
  } else if (controls) {
    // Desktop: Reset orbit controls properly
    camera.position.set(...config.cameraPosition);
    if (config.screenCurve === 0) {
     controls.target.set(...config.screenPosition); // flat: aim at the plane
    }   
    else {
      controls.target.set(0, 1.6, -1);               // curved: aim forward
    }
    controls.update();
  }
  
  logPositions('After Recenter');
}

document.getElementById('xrClose').onclick = () => {
  try {
    renderer.setAnimationLoop(null);
  } catch {}
  if (videoEl) {
    videoEl.pause();
    videoEl.src = '';
  }
  if (mwControls && mwControls.disconnect) {
    mwControls.disconnect();
  }
  xrWrap.style.display = 'none';
};

// Enhanced Mobile Orientation Controls
class MobileOrientationControls {
  constructor(camera, yawOnly = false) {
    this.camera = camera;
    this.enabled = false;
    this.yawOnly = yawOnly;
    this.deviceOrientation = {};
    this.screenOrientation = 0;
    
    this.alphaOffset = 0;
    this.betaOffset = 0;
    this.gammaOffset = 0;
    
    this.lastAlpha = 0;
    this.lastBeta = 0;
    this.lastGamma = 0;
    this.smoothing = 0.1;
    
    this.onDeviceOrientationChangeEvent = this.onDeviceOrientationChangeEvent.bind(this);
    this.onScreenOrientationChangeEvent = this.onScreenOrientationChangeEvent.bind(this);
  }

  async connect() {
    // Request permission for iOS 13+
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const permission = await DeviceOrientationEvent.requestPermission();
        if (permission !== 'granted') {
          console.warn('Device orientation permission denied');
          return false;
        }
      } catch (error) {
        console.error('Error requesting device orientation permission:', error);
        return false;
      }
    }
    
    this.onScreenOrientationChangeEvent();
    
    if (window.DeviceOrientationEvent) {
      window.addEventListener('orientationchange', this.onScreenOrientationChangeEvent, false);
      window.addEventListener('deviceorientation', this.onDeviceOrientationChangeEvent, false);
      this.enabled = true;
      console.log('Mobile orientation controls connected');
      return true;
    }
    return false;
  }

  disconnect() {
    window.removeEventListener('orientationchange', this.onScreenOrientationChangeEvent, false);
    window.removeEventListener('deviceorientation', this.onDeviceOrientationChangeEvent, false);
    this.enabled = false;
  }

  onScreenOrientationChangeEvent() {
    this.screenOrientation = window.orientation || 0;
  }

  onDeviceOrientationChangeEvent(event) {
    if (this.enabled === false) return;
    
    this.deviceOrientation.alpha = event.alpha;
    this.deviceOrientation.beta = event.beta;
    this.deviceOrientation.gamma = event.gamma;
  }

  update() {
    if (this.enabled === false) return;

    const device = this.deviceOrientation;
    if (device && device.alpha !== null && device.beta !== null && device.gamma !== null) {
      
      this.lastAlpha = this.lastAlpha + (device.alpha - this.lastAlpha) * this.smoothing;
      this.lastBeta = this.lastBeta + (device.beta - this.lastBeta) * this.smoothing;
      this.lastGamma = this.lastGamma + (device.gamma - this.lastGamma) * this.smoothing;
      
      const alpha = THREE.MathUtils.degToRad(this.lastAlpha) + this.alphaOffset;
      let beta = THREE.MathUtils.degToRad(this.lastBeta) + this.betaOffset;
      let gamma = THREE.MathUtils.degToRad(this.lastGamma) + this.gammaOffset;

      if (this.yawOnly) {
        beta = 0;
        gamma = 0;
      }

      const orient = this.screenOrientation ? THREE.MathUtils.degToRad(this.screenOrientation) : 0;

      const zee = new THREE.Vector3(0, 0, 1);
      const euler = new THREE.Euler();
      const q0 = new THREE.Quaternion();
      const q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));

      euler.set(beta, alpha, -gamma, 'YXZ');
      this.camera.quaternion.setFromEuler(euler);
      this.camera.quaternion.multiply(q1);
      this.camera.quaternion.multiply(q0.setFromAxisAngle(zee, -orient));
    }
  }
}

// FIXED stars creation - less distracting
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

  const stars = new THREE.Points(starsGeometry, starsMaterial);
  scene.add(stars);

  console.log('Added', starsCount, 'subtle stars to scene');
  return stars;
}

// FIXED screen building function with proper immersive positioning
function buildTheaterScreen(mode = 'phone') {
  const config = COMFORT_MODES[mode];
  
  // Remove old screen
  if (screen) {
    scene.remove(screen);
    if (screen.material && screen.material.map) {
      screen.material.map.dispose();
    }
    if (screen.material) screen.material.dispose();
    if (screen.geometry) screen.geometry.dispose();
  }
  
  let screenGeo;
  let materialSide;
  
  if (config.screenCurve === 0) {
    // Flat screen for comfort mode
    screenGeo = new THREE.PlaneGeometry(6, 3.375, 32, 18); // 16:9 ratio, bigger
    materialSide = THREE.FrontSide;
    // Fixed : Flip UV coordinates to fix upside-down video
    const uvAttr = screenGeo.attributes.uv;
    for (let i=0;i < uvAttr.array.length; i+=2){
      uvAttr.array[i+1] = 1 - uvAttr.array[i+1]; //flip Y coordinate
    }
    uvAttr.needsUpdate=true;
    console.log('Created Flat Screen Geometry with fixed UV coordinates');
  }
  else {
    // use a sphere segment for IMMERSIVE mode
    const radius = config.screenDistance;
    const phiLength = THREE.MathUtils.degToRad(config.screenCurve); // horizontal span
    const thetaLength = THREE.MathUtils.degToRad(110); // vertical span (half dome)
    
    screenGeo = new THREE.SphereGeometry(
      radius,
      128, 128,
      3*Math.PI/2 - phiLength/2, // phiStart: center forward 3* added now
      phiLength,               // phiLength
      Math.PI/2 - thetaLength/2, // thetaStart: tilt vertical window
      thetaLength              // thetaLength
    );
  
    //✅ we are *inside* the segment → render its inside
    materialSide = THREE.BackSide;
      
    console.log('Created immersive sphere segment with', config.screenCurve, 'degrees horizontal curve');
   }
  
  // Create screen with visible placeholder material
    const placeholderMaterial = new THREE.MeshBasicMaterial({
    color: 0x333333,  // Dark grey instead of red
    side: materialSide,
    transparent: false
  });
  
  screen = new THREE.Mesh(screenGeo, placeholderMaterial);
  screen.position.set(...config.screenPosition);
  // FIXED : Rotate curved screens 180 deg to face camera
  if (config.screenCurve!==0) {
    screen.rotation.x = Math.PI; // ✅ face the camera (-Z)
    console.log("Rotated curved screen 180° to face camera");
  }
  
  scene.add(screen);

  // Update camera FOV for proper immersion
  camera.fov = config.fov;
  camera.updateProjectionMatrix();
  
  console.log(`Built ${config.name} theater:`, {
    distance: config.screenDistance,
    curve: config.screenCurve,
    fov: config.fov,
    position: screen.position,
    side: materialSide
  });
  
  return screen;
}

// ASUS ZenBook Duo optimized renderer
function createMobileRenderer() {
  const options = {
    antialias: true,        // Enable for laptop quality
    alpha: false,
    stencil: false,
    depth: true,
    logarithmicDepthBuffer: false,
    powerPreference: "high-performance",
    failIfMajorPerformanceCaveat: false,
    preserveDrawingBuffer: false
  };

  const renderer = new THREE.WebGLRenderer(options);
  
  // High quality for laptop screen
  const pixelRatio = Math.min(window.devicePixelRatio, 2);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  
  // Enable high-quality features for laptop
  renderer.shadowMap.enabled = false; // Keep disabled for performance
  renderer.physicallyCorrectLights = false;
  
  console.log('Created ASUS ZenBook Duo optimized renderer with pixel ratio:', pixelRatio);
  return renderer;
}

// FIXED scene building with proper theater setup
function buildScene() {
  console.log("🏗️ Building scene...");

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
  
  // CRITICAL: Position camera at center for proper immersion
  const config = COMFORT_MODES[currentMode];
  camera.position.set(...config.cameraPosition);

  // Create mobile-optimized renderer
  renderer = createMobileRenderer();
  xrWrap.appendChild(renderer.domElement);

  // Environment - darker and more cinematic
  const roomGeo = new THREE.SphereGeometry(30, 32, 16);
  roomGeo.scale(-1, 1, 1);
  const roomMat = new THREE.MeshBasicMaterial({ color: 0x050810 }); // Darker
  const room = new THREE.Mesh(roomGeo, roomMat);
  scene.add(room);
  console.log('Added room sphere');

  // Add subtle stars
  createStars();

  // Build screen
  buildTheaterScreen(currentMode);

  // Subtle floor glow
    const glow = new THREE.Mesh(
    new THREE.RingGeometry(2, 2.5, 32),
    new THREE.MeshBasicMaterial({
      color: 0x1a4d6b,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.08    // Very subtle
    })
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.01;
  scene.add(glow);

  // Ambient vibe lighting (doesn't affect the video, but tints stars/UI)
  const hemi = new THREE.HemisphereLight(0x4a6b8a, 0x050810, 0.25);
  scene.add(hemi);


  // Setup controls based on mode
  if (config.screenCurve === 0) {
    // Flat screen - traditional controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(...config.screenPosition);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 1;
    controls.maxDistance = 6;
    controls.maxPolarAngle = Math.PI * 0.8;
    controls.minPolarAngle = Math.PI * 0.2;
    controls.enableZoom = true;
    controls.enableRotate = true;
    controls.enablePan = false;
    controls.update();
  } else {
    // Curved screen - free look controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0,1.6,-1);
    controls.enableDamping = true;
    controls.dampingFactor = 0.02;
    controls.minDistance = 0.1;
    controls.maxDistance = 1; // Stay at center for immersion
    controls.enableZoom = false; // Prevent breaking immersion
    controls.enableRotate = true;
    controls.enablePan = false;
    controls.update();
  }
  
  logPositions('After Scene Build');

  // Enhanced toolbar
  enhanceXRToolbar();

  // Resize handling
    window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  console.log('✅ Scene built successfully');
}

// FIXED rebuild function
function rebuildTheaterWithMode(mode) {
  console.log(`🔄 Rebuilding theater with ${mode} mode`);
  
  const newConfig = COMFORT_MODES[mode];
  
  // Rebuild screen
  buildTheaterScreen(mode);
  
  // Update camera and controls positions
  if (controls) {
    camera.position.set(...newConfig.cameraPosition);
    
    if (newConfig.screenCurve === 0) {
      // Flat screen controls
      controls.target.set(...newConfig.screenPosition);
      controls.minDistance = 1;
      controls.maxDistance = 6;
      controls.enableZoom = true;
    } else {
      // Curved screen controls
      controls.target.set(0, 1.6, -1);  // ✅ critical for Immersive
      controls.minDistance = 0.1;
      controls.maxDistance = 1;
      controls.enableZoom = false;
    }
    
    controls.update();
  }
  
  // Reapply video texture if exists
  if (videoTex && screen) {
    const side = newConfig.screenCurve === 0 ? THREE.FrontSide : THREE.BackSide;
    const videoMaterial = new THREE.MeshBasicMaterial({ 
      map: videoTex, 
      toneMapped: false, 
      side: side
    });
    screen.material.dispose();
    screen.material = videoMaterial;
    // ✅ ensure the recycled texture pushes a fresh frame
    if (videoTex) videoTex.needsUpdate = true;
    //Ensure audio context active & set pan mode correctly after switch
    if (videoEl){
      buildAudioGraph(videoEl);
      enableAudioforMode(COMFORT_MODES[mode]);
    }
  }
  
  // Update UI
  document.getElementById('currentMode').textContent = newConfig.name;
  
  logPositions(`After Mode Switch to ${mode}`);
}

// FIXED video texture creation - addresses WebGL format error
function createVideoTexture(videoElement) {
  const texture = new THREE.VideoTexture(videoElement);
  
  // CRITICAL FIX: Proper texture settings to avoid WebGL errors
  texture.flipY = false;
  //texture.format = THREE.RGBAFormat;     // FIXED: Use RGB format ; Let Three.js auto detect
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  
  console.log('✅ Created video texture with fixed format settings');
  return texture;
}

// === Audio helpers (ADD) ===
// === Enhanced Audio System ===
function buildAudioGraph(videoEl){
  if (audioCtx) return; //already built

  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  mediaSource = audioCtx.createMediaElementSource(videoEl);

  // Enhanced EQ system - much more detailed
  lowShelf = audioCtx.createBiquadFilter();
  lowShelf.type = 'lowshelf';
  lowShelf.frequency.value = 120;
  lowShelf.gain.value = 3;

  // Add mid-range control
  const midRange = audioCtx.createBiquadFilter();
  midRange.type = 'peaking';
  midRange.frequency.value = 800;
  midRange.Q.value = 1.2;
  midRange.gain.value = 0;

  highShelf = audioCtx.createBiquadFilter();
  highShelf.type = 'highshelf';
  highShelf.frequency.value = 8000;
  highShelf.gain.value = 1.2;

  // Enhanced spatial processing
  const stereoWidener = audioCtx.createDelay(0.05);
  stereoWidener.delayTime.value = 0.003; // 3ms for widening

  const widenerGain = audioCtx.createGain();
  widenerGain.gain.value = 0.15; // Will be adjusted per mode

  // Advanced compressor settings
  compressor = audioCtx.createDynamicsCompressor();
  compressor.threshold.value = -15;
  compressor.knee.value = 12;
  compressor.ratio.value = 3.5;
  compressor.attack.value = 0.002;
  compressor.release.value = 0.15;

  // Immersive effects
  delay = audioCtx.createDelay(0.3);
  delay.delayTime.value = 0.0028; // Longer delay for space was 0.08 too long->echoey

  delayFeedback = audioCtx.createGain();
  delayFeedback.gain.value = 0.0; // Will be set per mode

  // Create actual convolution reverb
  const convolver = audioCtx.createConvolver();
  
  // Create synthetic reverb impulse response
  const reverbLength = audioCtx.sampleRate * 2.5; // 2.5 seconds
  const reverbBuffer = audioCtx.createBuffer(2, reverbLength, audioCtx.sampleRate);
  
  for (let channel = 0; channel < 2; channel++) {
    const channelData = reverbBuffer.getChannelData(channel);
    for (let i = 0; i < reverbLength; i++) {
      const t = i / audioCtx.sampleRate;
      const decay = Math.exp(-t * 1.2); // Exponential decay
      channelData[i] = (Math.random() * 2 - 1) * decay * 0.4;
    }
  }
  convolver.buffer = reverbBuffer;

  reverbGain = audioCtx.createGain();
  reverbGain.gain.value = 0.0;

  stereoPanner = audioCtx.createStereoPanner();
  
  // Harmonic enhancer for presence
  const enhancer = audioCtx.createWaveShaper();
  const curve = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const x = (i - 128) / 128;
    curve[i] = x + 0.15 * x * x * x; // Subtle harmonic distortion
  }
  enhancer.curve = curve;
  enhancer.oversample = '2x';

  const enhancerGain = audioCtx.createGain();
  enhancerGain.gain.value = 0.1; // Subtle enhancement

  masterGain = audioCtx.createGain();
  masterGain.gain.value = 1.0;

  // Wire the enhanced audio graph
  mediaSource.connect(lowShelf);
  lowShelf.connect(midRange);
  midRange.connect(highShelf);
  highShelf.connect(compressor);
  
  // Parallel processing: main path + effects
  compressor.connect(stereoPanner); // Main dry path
  
  // Stereo widening
  compressor.connect(stereoWidener);
  stereoWidener.connect(widenerGain);
  widenerGain.connect(stereoPanner);
  
  // Add delay mix control for bypassing delay completely
  const delayMix = audioCtx.createGain();
  delayMix.gain.value = 0.0; //Start with no delay
  // Store reference for mode switching  
  window.delayMix = delayMix;
  
  // Delay/echo path
  compressor.connect(delay);
  delay.connect(delayFeedback);
  delayFeedback.connect(delay); // Feedback loop
  delay.connect(delayMix);
  delayMix.connect(stereoPanner);
  
  // Reverb path
  compressor.connect(convolver);
  convolver.connect(reverbGain);
  reverbGain.connect(stereoPanner);
  
  // Harmonic enhancement
  compressor.connect(enhancer);
  enhancer.connect(enhancerGain);
  enhancerGain.connect(stereoPanner);

  stereoPanner.connect(masterGain);
  masterGain.connect(audioCtx.destination);

  // Store references for mode switching
  window.midRange = midRange;
  window.stereoWidener = stereoWidener;
  window.widenerGain = widenerGain;
  window.convolver = convolver;
  window.enhancer = enhancer;
  window.enhancerGain = enhancerGain;

  console.log("Enhanced audio graph built with advanced processing");
}

async function enableAudioforMode(modeConfig){
  // Resume AudioContext (required on mobile/desktop until user gesture)
  if(!audioCtx) return;
  if(audioCtx.state === "suspended"){
    try{await audioCtx.resume();} catch(e) {console.warn('Audio resume failed',e);}
  }
  //Unmute video once we have a gesture
  if (videoEl) {
    videoEl.muted = false;  //we call this for user gesture
    videoEl.volume=1.0;
  }
  // DRAMATICALLY different audio profiles for each mode
  if (modeConfig.screenCurve === 0) {

    // COMFORT MODE: Clean, intimate, focused sound
    console.log('Applying COMFORT audio profile');
    
    masterGain.gain.setTargetAtTime(0.85, audioCtx.currentTime, 0.1);
    
    // Clean, natural EQ
    lowShelf.gain.setTargetAtTime(0.0, audioCtx.currentTime, 0.1);      // Slight bass warmth
    if (window.midRange) window.midRange.gain.setTargetAtTime(-1.0, audioCtx.currentTime, 0.1); // Reduce muddiness
    highShelf.gain.setTargetAtTime(0.6, audioCtx.currentTime, 0.1);        // Clear highs
    
    // Minimal spatial effects - stay centered
    stereoPanner.pan.value = 0.0;
    if (window.widenerGain) window.widenerGain.gain.setTargetAtTime(0.00, audioCtx.currentTime, 0.1); // Almost no widening
    
    
    // No reverb or delay - intimate sound
    delayFeedback.gain.setTargetAtTime(0.0, audioCtx.currentTime, 0.1);
    reverbGain.gain.setTargetAtTime(0.0, audioCtx.currentTime, 0.1);
    if (window.delayMix) window.delayMix.gain.setTargetAtTime(0.0, audioCtx.currentTime, 0.1); // Completely bypass delay
    if (window.enhancerGain) window.enhancerGain.gain.setTargetAtTime(0.0, audioCtx.currentTime, 0.1); // No enhancement
    
  } else {
    // IMMERSIVE MODE: Full 3D spatial experience with rich acoustics
    console.log('Applying IMMERSIVE audio profile');
    masterGain.gain.setTargetAtTime(1.15, audioCtx.currentTime, 0.1);     // Louder for impact
    
    // Enhanced frequency response for immersion
    lowShelf.gain.setTargetAtTime(6, audioCtx.currentTime, 0.1);         // Deep, powerful bass
    if (window.midRange) window.midRange.gain.setTargetAtTime(2, audioCtx.currentTime, 0.1);   // Present mids
    highShelf.gain.setTargetAtTime(3.5, audioCtx.currentTime, 0.1);      // Sparkling highs
    
    // Full spatial processing
    if (window.widenerGain) window.widenerGain.gain.setTargetAtTime(0.4, audioCtx.currentTime, 0.1); // Wide soundstage
    
    // Rich environmental acoustics
    delayFeedback.gain.setTargetAtTime(0.25, audioCtx.currentTime, 0.1);  // Spacious echo
    reverbGain.gain.setTargetAtTime(0.35, audioCtx.currentTime, 0.1);     // Cathedral-like reverb
    if (window.enhancerGain) window.enhancerGain.gain.setTargetAtTime(0.15, audioCtx.currentTime, 0.1); // Rich harmonics
    
    // Longer delay for bigger space feeling
    delay.delayTime.setTargetAtTime(0.12, audioCtx.currentTime, 0.1);
    if (window.delayMix) window.delayMix.gain.setTargetAtTime(1.0, audioCtx.currentTime, 0.1); // Enable delay
  }

  audioReady = true;
  console.log('Enhanced audio enabled for', modeConfig.name, 'with dramatic profile differences');
}

  function ensureUnmuteOverlay(){
    if(document.getElementById('unmuteOverlay')) return;
    const btn = document.createElement('button');
    btn.id = 'unmuteOverlay'
    btn.textContent = 'Tap for Sound';
    btn.style.cssText=`
    position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%);
    z-index: 1004; padding: 10px 14px; border-radius: 10px;
    border: 1px solid rgba(120,160,255,.35); color: #fff;
    background: rgba(15,20,40,.85); font-weight: 700; cursor: pointer;
    `;
    btn.addEventListener('click',async()=>{
      buildAudioGraph(videoEl);
      await enableAudioforMode(COMFORT_MODES[currentMode]);
      btn.remove()
      toast('Sound on');
    });
    document.body.appendChild(btn);
  }


async function startXR() {
  console.log('🚀 Starting XR mode...');
  
  if (!renderer) {
    console.log('No renderer found, building scene...');
    buildScene();
  }
  
  xrWrap.style.display = 'block';
  console.log('XR wrapper displayed');

  await attachVideoToScreen();

  // Add VR button for headset users
  if (!document.getElementById('vrbtn')) {
    const btn = VRButton.createButton(renderer);
    btn.id = 'vrbtn';
    btn.style.cssText = `
      position: fixed; right: 10px; bottom: 12px; z-index: 999;
      background: rgba(56,182,255,.9); color: #fff; border: 0;
      padding: 12px 16px; border-radius: 8px; font-weight: 700;
    `;
    document.body.appendChild(btn);
  }

  // Ensure render loop is active
  renderer.setAnimationLoop(() => {
    if (controls) controls.update();
    if (mwControls) mwControls.update();
  
    // === Audio panner update (ADD inside the render loop) ===
    // === Enhanced spatial audio update ===
if (audioReady && stereoPanner && COMFORT_MODES[currentMode]) {
  const cfg = COMFORT_MODES[currentMode];
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const yaw = Math.atan2(dir.x, -dir.z);
  
  if (cfg.screenCurve === 0) {
    // COMFORT MODE: Fixed center, no movement
    stereoPanner.pan.value = 0;
    
    // Keep reverb and delay minimal
    if (reverbGain) reverbGain.gain.value = 0;
    if (delayFeedback) delayFeedback.gain.value = 0;
    
  } else if (cfg.screenCurve === 70) {
    // CINEMA MODE: Gentle panning, moderate space
    const pan = Math.max(-0.4, Math.min(0.4, (yaw / (Math.PI / 2)) * 0.25));
    stereoPanner.pan.value = pan;
    
    // Distance-based reverb adjustment
    const distance = camera.position.length();
    const reverbLevel = Math.max(0.15, Math.min(0.35, 0.25 + distance * 0.02));
    if (reverbGain) reverbGain.gain.value = reverbLevel;
    
  } else {
    // IMMERSIVE MODE: Full 3D spatial experience
    const pan = Math.max(-1, Math.min(1, (yaw / (Math.PI / 2)) * 0.85));
    stereoPanner.pan.value = pan;
    
    // Dynamic acoustic space based on head movement
    const distance = camera.position.length();
    const velocity = Math.abs(yaw - (window.lastYaw || 0)) * 100;
    window.lastYaw = yaw;
    
    // Reverb responds to movement and distance
    const baseReverb = 0.35;
    const movementReverb = Math.min(0.15, velocity * 0.3);
    const distanceReverb = Math.max(0.1, Math.min(0.2, distance * 0.03));
    const totalReverb = Math.min(0.6, baseReverb + movementReverb + distanceReverb);
    
    if (reverbGain) reverbGain.gain.setTargetAtTime(totalReverb, audioCtx.currentTime, 0.1);
    
    // Delay feedback responds to turning speed
    const delayAmount = Math.max(0.25, Math.min(0.5, 0.35 + velocity * 0.2));
    if (delayFeedback) delayFeedback.gain.setTargetAtTime(delayAmount, audioCtx.currentTime, 0.05);
    
    // High frequency filtering based on angle (simulates head shadow effect)
    const hfAttenuation = 1.0 - Math.abs(pan) * 0.3;
    if (window.highShelf) {
      window.highShelf.gain.setTargetAtTime(3.5 * hfAttenuation, audioCtx.currentTime, 0.05);
    }
  }
}
      
    // Force video texture update
    if (videoTex && videoEl && videoEl.readyState >= videoEl.HAVE_CURRENT_DATA) {
    videoTex.needsUpdate = true;
  }  
  renderer.render(scene, camera);
});
  
  const modeName = COMFORT_MODES[currentMode].name;
  toast(`${modeName} theater mode active`);
  console.log(`✅ XR started in ${modeName} mode`);
  
  logPositions('After XR Start');
}

// FIXED video attachment with proper error handling
async function attachVideoToScreen() {
  console.log('🎬 Attaching video to screen...');
  
  if (!screen) {
    console.error("No screen found to attach video to!");
    return;
  }

  if (!videoEl) {
    console.log('Creating video element...');
    videoEl = document.createElement('video');
    videoEl.crossOrigin = 'anonymous';
    videoEl.playsInline = true;
    videoEl.setAttribute('webkit-playsinline', '');
    videoEl.setAttribute('playsinline', '');
    videoEl.preload = 'metadata';
    videoEl.loop = true;
    videoEl.muted = true;  // start muted to satisfy autoplay; we unmute on gesture
    videoEl.volume = 0.8;
    
    videoEl.onerror = (e) => {
      console.error('Video error:', e, videoEl.error);
      toast('Video failed to load');
    };
    
    videoEl.onloadeddata = () => {
      console.log('✅ Video loaded successfully', {
        width: videoEl.videoWidth,
        height: videoEl.videoHeight,
        duration: videoEl.duration?.toFixed(1) + 's'
      });
      toast('Video ready - click to unmute');
    };
    
    videoEl.oncanplay = () => {
      console.log('✅ Video can play, creating texture...');
      
      // Create texture when video is ready
      if (!videoTex) {
        videoTex = createVideoTexture(videoEl);
        videoTex.needsUpdate=true;
        
        // Apply to screen immediately
        const config = COMFORT_MODES[currentMode];
        const side = config.screenCurve === 0 ? THREE.FrontSide : THREE.BackSide;
        
        const videoMaterial = new THREE.MeshBasicMaterial({ 
          map: videoTex, 
          toneMapped: false,
          side: side
        });
        
        if (screen.material) screen.material.dispose();
        screen.material = videoMaterial;
        // prepare audio graph (actual sound starts on user gesture)
        if (!audioCtx){
          buildAudioGraph(videoEl);
        }
        console.log('✅ Video texture applied to screen');
      }
      // We still need a user gesture to start sound on most browsers:
      // show “Tap for sound” overlay (make sure ensureUnmuteOverlay() is top-level)
        ensureUnmuteOverlay();
    };
    
    // Set video source
    if (mp4) {
      videoEl.src = mp4;
      console.log('Video source set to:', mp4);
    } else {
      console.warn('No video source available');
      toast('No video source configured');
      return;
    }
    
    if (poster) videoEl.poster = poster;
  }

  try {
    await videoEl.play();
    console.log('✅ Video playing automatically (muted)');
  } catch (error) {
    console.warn('Video autoplay failed:', error.message);
    toast('Click screen to start video with sound');
        // One-click start with audio
        const startVideo = async () => {
        renderer.domElement.removeEventListener('click', startVideo);
        try {
         await videoEl.play(); // user gesture allows sound
         console.log('✅ Video started after user interaction');
         buildAudioGraph(videoEl);
         await enableAudioforMode(COMFORT_MODES[currentMode]);
         const btn = document.getElementById('unmuteOverlay');
         if (btn) btn.remove();
          toast('Video playing with sound');
        } catch (e) {
        console.error('Video play failed:', e);
      }
    };
    renderer.domElement.addEventListener('click', startVideo);
  }
}

// Optional: Audio debug logging
function logAudioState(label) {
  if (!audioCtx || !audioReady) return;
  
  console.group(`🔊 Audio Debug: ${label}`);
  console.log('Master gain:', masterGain?.gain?.value?.toFixed(2));
  console.log('Low shelf gain:', lowShelf?.gain?.value?.toFixed(2));
  console.log('High shelf gain:', highShelf?.gain?.value?.toFixed(2));
  console.log('Pan position:', stereoPanner?.pan?.value?.toFixed(2));
  console.log('Reverb level:', reverbGain?.gain?.value?.toFixed(2));
  console.log('Delay feedback:', delayFeedback?.gain?.value?.toFixed(2));
  console.log('Widener gain:', window.widenerGain?.gain?.value?.toFixed(2));
  console.groupEnd();
}

// Add this line to your mode switching to see the changes:
// logAudioState('After mode switch to ' + currentMode);

async function requestMotionPermission() {
  if (typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function') {
    try {
      const response = await DeviceOrientationEvent.requestPermission();
      console.log('Device orientation permission:', response);
      return response === 'granted';
    } catch (error) {
      console.error('Motion permission error:', error);
      return false;
    }
  }
  return true;
}

async function startMagicWindow() {
  console.log('📱 Starting Magic Window mode...');
  
  if (!renderer) buildScene();
  xrWrap.style.display = 'block';
  await attachVideoToScreen();

  // Dispose orbit controls for mobile
  if (controls) {
    controls.dispose();
    controls = null;
  }

  // Setup mobile orientation controls
  const config = COMFORT_MODES[currentMode];
  mwControls = new MobileOrientationControls(camera, config.yawOnly);
  const connected = await mwControls.connect();
  
  if (!connected) {
    console.warn('Failed to connect mobile orientation controls');
    toast('Touch controls available - swipe to look around');
  }

  // Render loop for mobile
  renderer.setAnimationLoop(() => {
    if (mwControls) mwControls.update();
    renderer.render(scene, camera);
  });

  const modeText = config.yawOnly ? ' (yaw only for comfort)' : '';
  toast(`${config.name} mode: ${connected ? 'move your phone' : 'touch and drag'} to look around${modeText}`);
  
  logPositions('After Magic Window Start');
}

// Main initialization
document.addEventListener('DOMContentLoaded', function() {
  console.log('🎯 App initializing...');
  
  // Setup enhanced media players
  const { controlPanel } = setupMediaPlayers();

  // Enhanced hero click handler
  hero.addEventListener('click', async (e) => {
    e.preventDefault();

    // Auto-detect best mode for ASUS ZenBook Duo
    currentMode = detectBestMode();
    console.log('Detected best mode for ZenBook Duo:', currentMode);
  
    // Check HTTPS requirement
    if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
      toast('HTTPS required for VR features');
      return;
    }
      //Go directly to theater mode
      console.log('🎭 Entering theater mode directly...');
      try{
        console.log('Starting XR mode for laptop...');
        // Prep audio early since we have user gesture
        if(videoEl){
          buildAudioGraph(videoEl);
          await enableAudioforMode(COMFORT_MODES[currentMode]);
        }
        await startXR();
      } catch(error) {
        console.error('XR failed:',error);
        toast('Theater mode failed - check console for details');
      }
  });

  /*
  // FIXED Enter Theater button handler - optimized for laptop
  document.addEventListener('click', async (e) => {
    if (e.target.id === 'enterTheater') {
      e.preventDefault();
      document.getElementById('theaterControls').style.display = 'none';
      
      console.log('🎭 Entering theater mode on ASUS ZenBook Duo...');

      // For laptop testing, always go to XR mode (desktop behavior)
      try {
        console.log('Starting XR mode for laptop...');
        // we have a user gesture here; prep audio early
        if (videoEl) {
          buildAudioGraph(videoEl);
          await enableAudioforMode(COMFORT_MODES[currentMode]);
        } else {
          // if videoEl gets created inside attachVideoToScreen, the oncanplay path will show the Unmute button anyway
        }
          await startXR();
        return;
      } catch (error) {
        console.error('XR failed:', error);
        toast('Theater mode failed - check console for details');
      }
    }
  });
*/
  // Deep-link support
  const q = new URLSearchParams(location.search);
  const qs = q.get('src');
  if (qs) {
    hero.dataset.mp4 = qs;
    console.log('Using custom video source:', qs);
  }
  
  console.log('✅ App initialized successfully for ASUS ZenBook Duo');
}); 
