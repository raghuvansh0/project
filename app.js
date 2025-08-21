import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';

const hero = document.getElementById('hero');
const mp4 = hero.dataset.mp4;
const title = hero.dataset.title || 'RV-OTT';
const poster = hero.dataset.poster || '';
const YT_ID = 'JVAZGhSdczM';
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

// 2D Video Player Setup
const ov2d = document.getElementById('ov2d');
const v2d = document.getElementById('v2d');

document.getElementById('open2d').addEventListener('click', (e) => {
  e.preventDefault();
  v2d.src = mp4 || '';
  document.getElementById('t2d').textContent = title;
  ov2d.style.display = 'block';
  v2d.play().catch(() => toast('Tap to start video'));
});

document.querySelector('[data-close="ov2d"]').onclick = () => {
  v2d.pause();
  v2d.src = '';
  ov2d.style.display = 'none';
};

// YouTube Player Setup
const ovYT = document.getElementById('ovYT');
const yt = document.getElementById('yt');

document.getElementById('openYT').addEventListener('click', (e) => {
  e.preventDefault();
  yt.src = `https://www.youtube.com/embed/${YT_ID}?autoplay=1&modestbranding=1&rel=0&playsinline=1`;
  ovYT.style.display = 'block';
});

document.querySelector('[data-close="ovYT"]').onclick = () => {
  yt.src = '';
  ovYT.style.display = 'none';
};

// XR theater (Three.js)
let renderer, scene, camera, controls, screen, videoEl, videoTex, mwControls;
const xrWrap = document.getElementById('xrWrap');

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

// Custom Device Orientation Controls
class MobileOrientationControls {
  constructor(camera) {
    this.camera = camera;
    this.enabled = false;
    this.deviceOrientation = {};
    this.screenOrientation = 0;
    
    this.alphaOffset = 0;
    this.betaOffset = 0;
    this.gammaOffset = 0;
    
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
      const alpha = THREE.MathUtils.degToRad(device.alpha) + this.alphaOffset;
      const beta = THREE.MathUtils.degToRad(device.beta) + this.betaOffset;
      const gamma = THREE.MathUtils.degToRad(device.gamma) + this.gammaOffset;

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

function buildScene() {
  // Scene + camera
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, 1.6, 0);

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  xrWrap.appendChild(renderer.domElement);

  // Simple dark "room" (inside of a big sphere)
  const roomGeo = new THREE.SphereGeometry(20, 64, 32);
  roomGeo.scale(-1, 1, 1); // flip normals so we see the inside
  const roomMat = new THREE.MeshBasicMaterial({ color: 0x0a1020 });
  scene.add(new THREE.Mesh(roomGeo, roomMat));

  // Curved theater screen (IMAX-style)
  const radius = 4.2;
  const height = 3.0;
  const arc = Math.PI * 0.85;
  const segs = 96;

  const screenGeo = new THREE.CylinderGeometry(
    radius, radius, height, segs, 1, true,
    Math.PI / 2 - arc / 2,
    arc
  );

  screen = new THREE.Mesh(
    screenGeo,
    new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide })
  );
  screen.position.set(0, 1.6, 0);
  scene.add(screen);

  // Subtle floor glow for depth
  const glow = new THREE.Mesh(
    new THREE.RingGeometry(1.8, 2.2, 64),
    new THREE.MeshBasicMaterial({ color: 0x1e5bff, side: THREE.DoubleSide, transparent: true, opacity: 0.12 })
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.01;
  scene.add(glow);

  // Setup controls based on device type
  if (isMobile()) {
    // Use custom orientation controls for mobile
    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1.6, 0);
    controls.enableDamping = true;
    controls.minDistance = 2.2;
    controls.maxDistance = 8;
    controls.update();
  } else {
    // Desktop orbit controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1.6, 0);
    controls.enableDamping = true;
    controls.minDistance = 2.2;
    controls.maxDistance = 8;
    controls.update();
  }

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

async function startXR() {
  if (!renderer) buildScene();
  xrWrap.style.display = 'block';

  await attachVideoToScreen();

  // Add the VR button once
  if (!document.getElementById('vrbtn')) {
    const btn = VRButton.createButton(renderer);
    btn.id = 'vrbtn';
    btn.style.position = 'fixed';
    btn.style.right = '10px';
    btn.style.bottom = '12px';
    document.body.appendChild(btn);
  }

  // Render loop (WebXR will take over when user taps Enter VR)
  renderer.setAnimationLoop(() => {
    if (controls) controls.update();
    renderer.render(scene, camera);
  });
}

async function attachVideoToScreen() {
  if (!videoEl) {
    videoEl = document.createElement('video');
    videoEl.crossOrigin = 'anonymous';
    videoEl.playsInline = true;
    videoEl.setAttribute('webkit-playsinline', '');
    videoEl.preload = 'auto';
    videoEl.loop = true; // Add loop for better demo experience
    videoEl.muted = true; // Start muted to allow autoplay
    
    // Add error handling
    videoEl.onerror = (e) => {
      console.error('Video error:', e);
      toast('Video failed to load');
    };
    
    videoEl.onloadeddata = () => {
      console.log('Video loaded successfully');
      toast('Video ready');
    };
    
    videoEl.src = mp4;
    if (poster) videoEl.poster = poster;
  }

  try {
    await videoEl.play();
    console.log('Video playing');
  } catch (error) {
    console.warn('Video autoplay failed:', error);
    toast('Tap screen to start video');
    
    // Add click listener to start video on user interaction
    const startVideo = () => {
      videoEl.play().then(() => {
        console.log('Video started after user interaction');
        videoEl.muted = false; // Unmute after user interaction
      }).catch(e => console.error('Video play failed:', e));
      renderer.domElement.removeEventListener('click', startVideo);
    };
    renderer.domElement.addEventListener('click', startVideo);
  }

  // Create and apply video texture
  videoTex = new THREE.VideoTexture(videoEl);
  videoTex.colorSpace = THREE.SRGBColorSpace;
  videoTex.minFilter = THREE.LinearFilter;
  videoTex.magFilter = THREE.LinearFilter;
  videoTex.format = THREE.RGBFormat;
  
  screen.material = new THREE.MeshBasicMaterial({ 
    map: videoTex, 
    toneMapped: false, 
    side: THREE.BackSide 
  });
  
  console.log('Video texture applied to screen');
}

async function requestMotionPermission() {
  // iOS requires explicit permission
  if (typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function') {
    try {
      const response = await DeviceOrientationEvent.requestPermission();
      return response === 'granted';
    } catch {
      return false;
    }
  }
  return true; // Android/desktop typically ok
}

async function startMagicWindow() {
  if (!renderer) buildScene();
  xrWrap.style.display = 'block';
  await attachVideoToScreen();

  // Dispose orbit controls if active
  if (controls) {
    controls.dispose();
    controls = null;
  }

  // Setup mobile orientation controls
  mwControls = new MobileOrientationControls(camera);
  mwControls.connect();

  renderer.setAnimationLoop(() => {
    if (mwControls) mwControls.update();
    renderer.render(scene, camera);
  });

  toast('Move your phone to look around');
}

// Enhanced hero click handler
hero.addEventListener('click', async (e) => {
  e.preventDefault();

  // Check HTTPS requirement
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
    toast('HTTPS required for VR features');
    document.getElementById('open2d').click();
    return;
  }

  // 1) True VR if available and not inside Telegram webview
  if (!inTelegram() && await xrSupported()) {
    try {
      await startXR();
      return;
    } catch (error) {
      console.error('VR failed:', error);
    }
  }

  // 2) Magic-Window (mobile orientation)
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
    // 3) Desktop VR/3D mode
    try {
      await startXR();
      return;
    } catch (error) {
      console.error('Desktop VR failed:', error);
    }
  }

  // 4) Final fallback to 2D overlay
  document.getElementById('open2d').click();
});

// Optional deep-link: ?src=...&title=...
const q = new URLSearchParams(location.search);
const qs = q.get('src');
if (qs) {
  hero.dataset.mp4 = qs;
  document.getElementById('open2d').click();
}
