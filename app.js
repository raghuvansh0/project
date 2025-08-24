import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';

// Constants
const hero = document.getElementById('hero');
const mp4 = hero.dataset.mp4;
const title = hero.dataset.title || 'RV-OTT';
const poster = hero.dataset.poster || '';
const YT_ID = 'JVAZGhSdczM';

// Comfort Mode Settings
const COMFORT_MODES = {
  phone: {
    screenDistance: 4.5,
    screenCurve: 0, // Flat screen
    fov: 55,
    yawOnly: true,
    name: 'Comfort'
  },
  tablet: {
    screenDistance: 3.8,
    screenCurve: 15, // Gentle curve in degrees
    fov: 60,
    yawOnly: false,
    name: 'Cinema'
  },
  desktop: {
    screenDistance: 3.2,
    screenCurve: 25, // More immersive curve
    fov: 65,
    yawOnly: false,
    name: 'Immersive'
  }
};

let currentMode = 'phone'; // Default to safest mode

// Utility Functions
const toast = (m) => {
  const el = document.getElementById('toast');
  el.textContent = m;
  el.style.display = 'block';
  setTimeout(() => el.style.display = 'none', 2200);
};

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

// Enhanced Media Player Setup with Mode Selection
function setupMediaPlayers() {
  // 2D Video Player
  const ov2d = document.getElementById('ov2d');
  const v2d = document.getElementById('v2d');
  
  // Create improved UI panel
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

  // YouTube Player
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

// Enhanced VR/XR Theater Setup
let renderer, scene, camera, controls, screen, videoEl, videoTex, mwControls;
const xrWrap = document.getElementById('xrWrap');

// Add mode selector to XR toolbar
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
  
  // Insert before close button
  const closeBtn = document.getElementById('xrClose');
  toolbar.insertBefore(modeSelector, closeBtn);
  toolbar.insertBefore(recenterBtn, closeBtn);
  
  // Event handlers
  modeSelector.addEventListener('change', (e) => {
    currentMode = e.target.value;
    rebuildTheaterWithMode(currentMode);
    toast(`Switched to ${COMFORT_MODES[currentMode].name} mode`);
  });
  
  recenterBtn.addEventListener('click', () => {
    if (mwControls) {
      // Reset mobile controls
      camera.rotation.set(0, 0, 0);
      camera.position.set(0, 1.6, 0);
      toast('View recentered');
    } else if (controls) {
      // Reset orbit controls
      controls.reset();
      toast('View recentered');
    }
  });
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

// Enhanced Mobile Orientation Controls with Yaw-Only Option
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
    
    // Smoothing
    this.lastAlpha = 0;
    this.lastBeta = 0;
    this.lastGamma = 0;
    this.smoothing = 0.1;
    
    this.onDeviceOrientationChangeEvent = this.onDeviceOrientationChangeEvent.bind(this);
    this.onScreenOrientationChangeEvent = this.onScreenOrientationChangeEvent.bind(this);
  }

  connect() {
    this.onScreenOrientationChangeEvent();
    
    if (window.DeviceOrientationEvent) {
      window.addEventListener('orientationchange', this.onScreenOrientationChangeEvent, false);
      window.addEventListener('deviceorientation', this.onDeviceOrientationChangeEvent, false);
      this.enabled = true;
    }
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
      
      // Smooth the values to reduce jitter
      this.lastAlpha = this.lastAlpha + (device.alpha - this.lastAlpha) * this.smoothing;
      this.lastBeta = this.lastBeta + (device.beta - this.lastBeta) * this.smoothing;
      this.lastGamma = this.lastGamma + (device.gamma - this.lastGamma) * this.smoothing;
      
      const alpha = THREE.MathUtils.degToRad(this.lastAlpha) + this.alphaOffset;
      let beta = THREE.MathUtils.degToRad(this.lastBeta) + this.betaOffset;
      let gamma = THREE.MathUtils.degToRad(this.lastGamma) + this.gammaOffset;

      // Yaw-only mode for comfort
      if (this.yawOnly) {
        beta = 0; // No pitch
        gamma = 0; // No roll
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

function buildTheaterScreen(mode = 'phone') {
  const config = COMFORT_MODES[mode];
  
  // Remove old screen
  if (screen) {
    scene.remove(screen);
    if (screen.material.map) {
      screen.material.map.dispose();
    }
    screen.material.dispose();
    screen.geometry.dispose();
  }

  let screenGeo;
  
  if (config.screenCurve === 0) {
    // Flat screen for maximum comfort
    screenGeo = new THREE.PlaneGeometry(4.8, 2.7, 32, 18); // 16:9 aspect ratio
    
  } else {
    // Gently curved screen
    const radius = config.screenDistance + 1;
    const arc = THREE.MathUtils.degToRad(config.screenCurve);
    const segs = Math.max(32, Math.floor(config.screenCurve * 2));
    
    screenGeo = new THREE.CylinderGeometry(
      radius, radius, 2.7, segs, 1, true,
      Math.PI / 2 - arc / 2, arc
    );

    // Fix UV mapping for curved screen
    const uvAttribute = screenGeo.attributes.uv;
    const uvArray = uvAttribute.array;
    for (let i = 0; i < uvArray.length; i += 2) {
      uvArray[i + 1] = 1.0 - uvArray[i + 1]; // Flip V coordinate
    }
    uvAttribute.needsUpdate = true;
  }

  // Create screen mesh
  screen = new THREE.Mesh(
    screenGeo,
    new THREE.MeshBasicMaterial({ 
      color: 0x111111, 
      side: config.screenCurve === 0 ? THREE.FrontSide : THREE.BackSide 
    })
  );
  
  // Position screen in front of camera
  screen.position.set(0, 1.6, -config.screenDistance);
  scene.add(screen);
  
  // Update camera FOV
  camera.fov = config.fov;
  camera.updateProjectionMatrix();
  
  console.log(`Built ${config.name} theater: distance=${config.screenDistance}, curve=${config.screenCurve}°, fov=${config.fov}°`);
}

function buildScene() {
  // Scene + camera
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, 1.6, 0);

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  xrWrap.appendChild(renderer.domElement);

  // Enhanced environment
  const roomGeo = new THREE.SphereGeometry(25, 64, 32);
  roomGeo.scale(-1, 1, 1);
  const roomMat = new THREE.MeshBasicMaterial({ color: 0x0a1020 });
  scene.add(new THREE.Mesh(roomGeo, roomMat));

  // Add some subtle stars
  const starsGeo = new THREE.BufferGeometry();
  const starsCount = 200;
  const starsPositions = new Float32Array(starsCount * 3);
  
  for (let i = 0; i < starsCount * 3; i += 3) {
    const radius = 20 + Math.random() * 4;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI;
    
    starsPositions[i] = radius * Math.sin(phi) * Math.cos(theta);
    starsPositions[i + 1] = radius * Math.cos(phi);
    starsPositions[i + 2] = radius * Math.sin(phi) * Math.sin(theta);
  }
  
  starsGeo.setAttribute('position', new THREE.BufferAttribute(starsPositions, 3));
  const starsMat = new THREE.PointsMaterial({ 
    color: 0x88bbff, 
    size: 2, 
    transparent: true, 
    opacity: 0.6 
  });
  scene.add(new THREE.Points(starsGeo, starsMat));

  // Build screen based on detected mode
  currentMode = detectBestMode();
  buildTheaterScreen(currentMode);

  // Enhanced floor glow
  const glow = new THREE.Mesh(
    new THREE.RingGeometry(2.2, 2.8, 64),
    new THREE.MeshBasicMaterial({ 
      color: 0x1e5bff, 
      side: THREE.DoubleSide, 
      transparent: true, 
      opacity: 0.15 
    })
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.01;
  scene.add(glow);

  // Add subtle ambient lighting effect
  const ambientRing = new THREE.Mesh(
    new THREE.RingGeometry(3.5, 4, 32),
    new THREE.MeshBasicMaterial({ 
      color: 0x4488ff, 
      side: THREE.DoubleSide, 
      transparent: true, 
      opacity: 0.05 
    })
  );
  ambientRing.rotation.x = -Math.PI / 2;
  ambientRing.position.y = 0.02;
  scene.add(ambientRing);

  // Controls based on device type and mode
  const config = COMFORT_MODES[currentMode];
  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1.6, -config.screenDistance);
  controls.enableDamping = true;
  controls.minDistance = 1.5;
  controls.maxDistance = config.screenDistance + 2;
  
  // Limit vertical rotation for comfort
  controls.maxPolarAngle = Math.PI * 0.75;
  controls.minPolarAngle = Math.PI * 0.25;
  
  controls.update();

  // Enhanced toolbar
  enhanceXRToolbar();

  // Resize handling
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Default render loop
  renderer.setAnimationLoop(() => {
    if (controls) controls.update();
    renderer.render(scene, camera);
  });
}

function rebuildTheaterWithMode(mode) {
  buildTheaterScreen(mode);
  
  // Update controls
  const config = COMFORT_MODES[mode];
  if (controls) {
    controls.target.set(0, 1.6, -config.screenDistance);
    controls.maxDistance = config.screenDistance + 2;
    controls.update();
  }
  
  // Reapply video texture if exists
  if (videoTex && screen) {
    const videoMaterial = new THREE.MeshBasicMaterial({ 
      map: videoTex, 
      toneMapped: false, 
      side: config.screenCurve === 0 ? THREE.FrontSide : THREE.BackSide 
    });
    screen.material = videoMaterial;
  }
  
  // Update UI
  document.getElementById('currentMode').textContent = config.name;
}

async function startXR() {
  if (!renderer) buildScene();
  xrWrap.style.display = 'block';

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

  renderer.setAnimationLoop(() => {
    if (controls) controls.update();
    renderer.render(scene, camera);
  });
  
  toast(`${COMFORT_MODES[currentMode].name} theater mode active`);
}

async function attachVideoToScreen() {
  if (!videoEl) {
    videoEl = document.createElement('video');
    videoEl.crossOrigin = 'anonymous';
    videoEl.playsInline = true;
    videoEl.setAttribute('webkit-playsinline', '');
    videoEl.preload = 'auto';
    videoEl.loop = true;
    videoEl.muted = true; // Start muted for autoplay
    videoEl.volume = 0.8;
    
    videoEl.onerror = (e) => {
      console.error('Video error:', e);
      toast('Video failed to load');
    };
    
    videoEl.onloadeddata = () => {
      console.log('Video loaded successfully');
      toast('Video ready - click to unmute');
    };
    
    videoEl.src = mp4;
    if (poster) videoEl.poster = poster;
  }

  try {
    await videoEl.play();
    console.log('Video playing');
  } catch (error) {
    console.warn('Video autoplay failed:', error);
    toast('Tap screen to start video with sound');
    
    const startVideo = () => {
      videoEl.play().then(() => {
        console.log('Video started after user interaction');
        videoEl.muted = false;
        toast('Video playing with sound');
      }).catch(e => console.error('Video play failed:', e));
      renderer.domElement.removeEventListener('click', startVideo);
    };
    renderer.domElement.addEventListener('click', startVideo);
  }

  // Apply video texture with correct settings
  videoTex = new THREE.VideoTexture(videoEl);
  videoTex.colorSpace = THREE.SRGBColorSpace;
  videoTex.minFilter = THREE.LinearFilter;
  videoTex.magFilter = THREE.LinearFilter;
  videoTex.format = THREE.RGBAFormat;
  videoTex.flipY = false;
  videoTex.generateMipmaps = false;
  
  // Create material based on current screen type
  const config = COMFORT_MODES[currentMode];
  const videoMaterial = new THREE.MeshBasicMaterial({ 
    map: videoTex, 
    toneMapped: false, 
    side: config.screenCurve === 0 ? THREE.FrontSide : THREE.BackSide 
  });
  
  screen.material = videoMaterial;
  console.log('Video texture applied to screen');
}

async function requestMotionPermission() {
  if (typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function') {
    try {
      const response = await DeviceOrientationEvent.requestPermission();
      return response === 'granted';
    } catch {
      return false;
    }
  }
  return true;
}

async function startMagicWindow() {
  if (!renderer) buildScene();
  xrWrap.style.display = 'block';
  await attachVideoToScreen();

  // Dispose orbit controls
  if (controls) {
    controls.dispose();
    controls = null;
  }

  // Mobile orientation controls with yaw-only option for comfort
  const config = COMFORT_MODES[currentMode];
  mwControls = new MobileOrientationControls(camera, config.yawOnly);
  mwControls.connect();

  renderer.setAnimationLoop(() => {
    if (mwControls) mwControls.update();
    renderer.render(scene, camera);
  });

  const modeText = config.yawOnly ? ' (yaw only for comfort)' : '';
  toast(`${config.name} mode: move your phone to look around${modeText}`);
}

// Main initialization
document.addEventListener('DOMContentLoaded', function() {
  // Setup enhanced media players
  const { controlPanel } = setupMediaPlayers();

  // Enhanced hero click handler
  hero.addEventListener('click', async (e) => {
    e.preventDefault();

    // Auto-detect best mode
    currentMode = detectBestMode();
    
    // Show control panel instead of immediate action
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

  // Enter Theater button handler
  document.addEventListener('click', async (e) => {
    if (e.target.id === 'enterTheater') {
      e.preventDefault();
      document.getElementById('theaterControls').style.display = 'none';

      // Try VR/3D experience based on device
      if (!inTelegram() && await xrSupported()) {
        try {
          await startXR();
          return;
        } catch (error) {
          console.error('VR failed:', error);
        }
      }

      // Mobile orientation mode
      if (isMobile()) {
        const ok = await requestMotionPermission();
        if (ok) {
          try {
            await startMagicWindow();
            return;
          } catch (error) {
            console.error('Magic Window failed:', error);
          }
        }
      } else {
        // Desktop VR mode
        try {
          await startXR();
          return;
        } catch (error) {
          console.error('Desktop VR failed:', error);
        }
      }

      // Fallback
      toast('Theater mode not available - try 2D player');
    }
  });

  // Deep-link support
  const q = new URLSearchParams(location.search);
  const qs = q.get('src');
  if (qs) {
    hero.dataset.mp4 = qs;
  }
});
