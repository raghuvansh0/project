import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';

// Constants
const hero = document.getElementById('hero');
const mp4 = hero.dataset.mp4;
const title = hero.dataset.title || 'RV-OTT';
const poster = hero.dataset.poster || '';
const YT_ID = 'JVAZGhSdczM';

// Fixed Comfort Mode Settings with proper positioning
const COMFORT_MODES = {
  phone: {
    screenDistance: 3.0,    // Closer for mobile
    screenCurve: 0,         // Flat screen
    fov: 60,               // Slightly wider for mobile
    yawOnly: true,
    name: 'Comfort',
    cameraPosition: [0, 1.6, 3.5],  // Behind screen
    screenPosition: [0, 1.6, 0]     // At origin
  },
  tablet: {
    screenDistance: 2.5,    // Medium distance
    screenCurve: 15,        // Gentle curve
    fov: 65,
    yawOnly: false,
    name: 'Cinema',
    cameraPosition: [0, 1.6, 3.0],
    screenPosition: [0, 1.6, 0]
  },
  desktop: {
    screenDistance: 2.0,    // Closer for immersion
    screenCurve: 25,        // More curve
    fov: 70,
    yawOnly: false,
    name: 'Immersive',
    cameraPosition: [0, 1.6, 2.5],
    screenPosition: [0, 1.6, 0]
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
  console.log('Camera looking at screen:', camera.getWorldDirection(new THREE.Vector3()).dot(
    new THREE.Vector3().subVectors(screen.position, camera.position).normalize()
  ).toFixed(2));
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
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
         (navigator.maxTouchPoints && navigator.maxTouchPoints > 2);
}

function isTablet() {
  return (navigator.maxTouchPoints && navigator.maxTouchPoints > 2 && window.innerWidth > 768) ||
         /iPad/i.test(navigator.userAgent);
}

function detectBestMode() {
  if (isMobile() && !isTablet()) return 'phone';
  if (isTablet()) return 'tablet';
  return 'desktop';
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
    <option value="tablet">Cinema Mode</option>  
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
    if(mwControls) {
      //Mobile : just reset rotation
      camera.rotation.set(0,0,0);
      camera.position.set(0,1.6,0);
    } else if (controls) {
      //Desktop : simple reset that actually works
      const config = COMFORT_MODES[currentMode];
      camera.position.set(0, 1.6, config.screenDistance);
      controls.target.set(0,1.6,config.screenCurve=== 0 ? -2 : 0)
      controls.update();
    }
    toast('View recentered');
  });
}

/* 3. KEEP everything else exactly as it was in your working version
  The key insight: 
- Comfort mode (flat): screen at Z=-2, camera at Z=0
- Cinema/Immersive (curved): screen at Z=0, camera at Z=3.8/3.2
This way the video stays visible and properly oriented 
*/

// Fixed recenter function
function recenterToTheater() {
  const config = COMFORT_MODES[currentMode];
  
  if (mwControls) {
    // Mobile: Reset orientation and position
    camera.position.set(...config.cameraPosition);
    camera.rotation.set(0, 0, 0);
    camera.lookAt(...config.screenPosition);
  } else if (controls) {
    // Desktop: Reset orbit controls properly
    camera.position.set(...config.cameraPosition);
    controls.target.set(...config.screenPosition);
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

// Fixed stars creation
function createStars() {
  const starsGeometry = new THREE.BufferGeometry();
  const starsCount = 800; // Reduced for mobile performance
  const positions = new Float32Array(starsCount * 3);

  for (let i = 0; i < starsCount; i++) {
    const i3 = i * 3;
    
    const radius = 18 + Math.random() * 6;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    
    positions[i3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i3 + 1] = radius * Math.cos(phi);
    positions[i3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
  }

  starsGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const starsMaterial = new THREE.PointsMaterial({
    color: 0x9bb5ff,
    size: 0.8,
    transparent: true,
    opacity: 0.6,
    sizeAttenuation: true
  });

  const stars = new THREE.Points(starsGeometry, starsMaterial);
  scene.add(stars);

  console.log('Added', starsCount, 'stars to scene');
  return stars;
}

// Fixed screen building function with proper positioning
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
    // Flat screen
    screenGeo = new THREE.PlaneGeometry(4.8, 2.7, 32, 18); // 16:9 ratio
    materialSide = THREE.FrontSide;
    console.log('Created Flat Screen Geometry');
  } else {
    // Curved screen - positioned differently
    const radius = config.screenDistance; // Fixed radius for consistent curvature
    const arc = THREE.MathUtils.degToRad(config.screenCurve);
    const segs = Math.max(32, Math.floor(config.screenCurve * 2));
    
    screenGeo = new THREE.CylinderGeometry(
      radius, radius, 2.7, segs, 1, true,
      Math.PI / 2 - arc / 2, arc
    );
    
    materialSide = THREE.BackSide;
    
    // Fix UV mapping for proper video orientation
    const uvAttribute = screenGeo.attributes.uv;
    const uvArray = uvAttribute.array;
    for (let i = 0; i < uvArray.length; i += 2) {
      uvArray[i + 1] = 1.0 - uvArray[i + 1]; // Flip V
    }
    uvAttribute.needsUpdate = true;
    console.log('Created curved screen geometry with', config.screenCurve, 'degrees curve');
  }
  
  // Create screen with placeholder material
  const placeholderMaterial = new THREE.MeshBasicMaterial({
    color: 0x333333,
    side: materialSide,
    transparent: true,
    opacity: 0.8
  });
  
  screen = new THREE.Mesh(screenGeo, placeholderMaterial);
  // CRITICAL FIX: Position screen at origin, camera behind it
  if (config.screenCurve==0) {
    screen.position.set(0,1.6,-2) //Flat screen 2m in front
  } else {
    screen.position.set(0,1.6,0);
  }
  scene.add(screen);
  
  // Update camera FOV
  camera.fov = config.fov;
  camera.updateProjectionMatrix();
  
  console.log(`Built ${config.name} theater:`, {
    distance: config.screenDistance,
    curve: config.screenCurve,
    fov: config.fov,
    position:screen.position,
    side: materialSide
  });
  
  return screen;
}

// Mobile-optimized renderer
function createMobileRenderer() {
  const options = {
    antialias: !isMobile(), // Disable AA on mobile for performance
    alpha: false,
    stencil: false,
    depth: true,
    logarithmicDepthBuffer: false,
    powerPreference: "high-performance",
    failIfMajorPerformanceCaveat: false,
    preserveDrawingBuffer: false
  };

  const renderer = new THREE.WebGLRenderer(options);
  
  // Mobile-specific optimizations
  const pixelRatio = Math.min(window.devicePixelRatio, isMobile() ? 1.5 : 2);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  
  // Additional mobile optimizations
  if (isMobile()) {
    renderer.shadowMap.enabled = false;
    renderer.physicallyCorrectLights = false;
  }
  
  console.log('Created', isMobile() ? 'mobile-optimized' : 'desktop', 'renderer with pixel ratio:', pixelRatio);
  return renderer;
}

// Fixed scene building
function buildScene() {
  console.log("🏗️ Building scene...");

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
  
  // Position camera behind screen initially
  const config = COMFORT_MODES[currentMode];
  camera.position.set(...config.cameraPosition);

  // Create mobile-optimized renderer
  renderer = createMobileRenderer();
  xrWrap.appendChild(renderer.domElement);

  // Environment
  const roomGeo = new THREE.SphereGeometry(20, 32, 16);
  roomGeo.scale(-1, 1, 1);
  const roomMat = new THREE.MeshBasicMaterial({ color: 0x0a1020 });
  const room = new THREE.Mesh(roomGeo, roomMat);
  scene.add(room);
  console.log('Added room sphere');

  // Add stars
  createStars();

  // Build screen
  buildTheaterScreen(currentMode);

  // Floor effects
  const glow = new THREE.Mesh(
    new THREE.RingGeometry(1.8, 2.2, 32),
    new THREE.MeshBasicMaterial({
      color: 0x1e5bff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.12
    })
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.01;
  scene.add(glow);

  // CRITICAL: Setup controls to look at screen
  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(...config.screenPosition); // Look at screen
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.minDistance = 0.5;
  controls.maxDistance = 8;
  controls.maxPolarAngle = Math.PI * 0.8;
  controls.minPolarAngle = Math.PI * 0.2;
  controls.enableZoom = true;
  controls.enableRotate = true;
  controls.enablePan = false;
  
  // Update controls after setup
  controls.update();
  
  logPositions('After Scene Build');

  // Enhanced toolbar
  enhanceXRToolbar();

  // Resize handling
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Render loop
  renderer.setAnimationLoop(() => {
    if (controls) controls.update();
    renderer.render(scene, camera);
  });

  console.log('✅ Scene built successfully');
}

// Fixed rebuild function
function rebuildTheaterWithMode(mode) {
  console.log(`🔄 Rebuilding theater with ${mode} mode`);
  
  const oldConfig = COMFORT_MODES[currentMode];
  const newConfig = COMFORT_MODES[mode];
  
  // Rebuild screen
  buildTheaterScreen(mode);
  
  // Update camera and controls positions
  if (controls) {
    camera.position.set(...newConfig.cameraPosition);
    controls.target.set(...newConfig.screenPosition);
    controls.maxDistance = newConfig.screenDistance + 3;
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
  }
  
  // Update UI
  document.getElementById('currentMode').textContent = newConfig.name;
  
  logPositions(`After Mode Switch to ${mode}`);
}

// Fixed video texture creation
function createVideoTexture(videoElement) {
  const texture = new THREE.VideoTexture(videoElement);
  
  // Critical texture settings for consistent orientation
  texture.flipY = false;  // Prevent upside-down video
  texture.format = isMobile() ? THREE.RGBFormat : THREE.RGBAFormat;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  
  console.log('Created video texture with mobile optimization:', isMobile());
  return texture;
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
    renderer.render(scene, camera);
  });
  
  const modeName = COMFORT_MODES[currentMode].name;
  toast(`${modeName} theater mode active`);
  console.log(`✅ XR started in ${modeName} mode`);
  
  logPositions('After XR Start');
}

// Fixed video attachment
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
    videoEl.muted = true;
    videoEl.volume = 0.8;
    
    // Mobile-specific video settings
    if (isMobile()) {
      videoEl.setAttribute('webkit-playsinline', 'true');
      videoEl.setAttribute('x-webkit-airplay', 'deny');
    }
    
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
      console.log('Video can play, ready for texture');
    };
    
    videoEl.src = mp4;
    if (poster) videoEl.poster = poster;
    console.log('Video source set to:', mp4);
  }

  try {
    await videoEl.play();
    console.log('✅ Video playing automatically');
  } catch (error) {
    console.warn('Video autoplay failed:', error.message);
    toast('Tap screen to start video with sound');
    
    const startVideo = () => {
      videoEl.play().then(() => {
        console.log('✅ Video started after user interaction');
        videoEl.muted = false;
        toast('Video playing with sound');
      }).catch(e => console.error('Video play failed:', e));
      renderer.domElement.removeEventListener('click', startVideo);
    };
    renderer.domElement.addEventListener('click', startVideo);
  }

  // Create optimized video texture
  videoTex = createVideoTexture(videoEl);
  
  // Apply to screen with correct material side
  const config = COMFORT_MODES[currentMode];
  const side = config.screenCurve === 0 ? THREE.FrontSide : THREE.BackSide;

  const videoMaterial = new THREE.MeshBasicMaterial({ 
    map: videoTex, 
    toneMapped: false,
    side: side
  });
  
  if (screen.material) screen.material.dispose();
  screen.material = videoMaterial;
  
  console.log('✅ Video texture applied with side:', side === THREE.FrontSide ? 'FrontSide' : 'BackSide');
}

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

    // Auto-detect best mode
    currentMode = detectBestMode();
    console.log('Detected best mode:', currentMode);
    
    // Show control panel
    controlPanel.style.display = 'block';
    document.getElementById('currentMode').textContent = COMFORT_MODES[currentMode].name;
    
    // Hide panel after 8 seconds
    setTimeout(() => {
      controlPanel.style.display = 'none';
    }, 8000);

    // Check HTTPS requirement
    if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
      toast('HTTPS required for VR features');
      return;
    }
  });

  // Fixed Enter Theater button handler
  document.addEventListener('click', async (e) => {
    if (e.target.id === 'enterTheater') {
      e.preventDefault();
      document.getElementById('theaterControls').style.display = 'none';
      
      console.log('🎭 Entering theater mode...');

      // Check platform capabilities
      const hasXR = !inTelegram() && await xrSupported();
      const isMobileDevice = isMobile();
      
      console.log('Platform check:', { hasXR, isMobileDevice, inTelegram: inTelegram() });

      // Try VR/3D experience based on device
      if (hasXR) {
        try {
          console.log('Attempting XR mode...');
          await startXR();
          return;
        } catch (error) {
          console.error('XR failed:', error);
        }
      }

      // Mobile orientation mode
      if (isMobileDevice) {
        try {
          console.log('Attempting mobile magic window...');
          const permissionGranted = await requestMotionPermission();
          console.log('Motion permission granted:', permissionGranted);
          
          await startMagicWindow();
          return;
        } catch (error) {
          console.error('Magic Window failed:', error);
        }
      } else {
        // Desktop fallback to XR mode
        try {
          console.log('Attempting desktop XR mode...');
          await startXR();
          return;
        } catch (error) {
          console.error('Desktop XR failed:', error);
        }
      }

      // Ultimate fallback
      console.warn('All theater modes failed, suggesting fallback');
      toast('Theater mode not available - try 2D player');
    }
  });

  // Deep-link support
  const q = new URLSearchParams(location.search);
  const qs = q.get('src');
  if (qs) {
    hero.dataset.mp4 = qs;
    console.log('Using custom video source:', qs);
  }
  
  console.log('✅ App initialized successfully');
});
