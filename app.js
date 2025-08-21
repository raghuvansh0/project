import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js';
import { VRButton } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/webxr/VRButton.js';
import { DeviceOrientationControls } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/DeviceOrientationControls.js';


const hero = document.getElementById('hero');
const mp4  = hero.dataset.mp4;
const title= hero.dataset.title || 'RV‑OTT';
const poster = hero.dataset.poster || '';
const YT_ID = 'JVAZGhSdczM';
const toast = (m)=>{const el=document.getElementById('toast'); el.textContent=m; el.style.display='block'; setTimeout(()=>el.style.display='none',2200);};

async function xrSupported(){
  if(!('xr' in navigator)) return false;
  try { return await navigator.xr.isSessionSupported('immersive-vr'); } catch { return false; }
}
function inTelegram(){ return /Telegram/i.test(navigator.userAgent) || (window.Telegram && Telegram.WebApp); }

// Enhance buttons (will override fallback hrefs when JS is allowed)
const ov2d = document.getElementById('ov2d'), v2d = document.getElementById('v2d');
document.getElementById('open2d').addEventListener('click', (e)=>{
  e.preventDefault();
  v2d.src = mp4 || '';
  document.getElementById('t2d').textContent = title;
  ov2d.style.display='block';
  v2d.play().catch(()=>toast('Tap to start video'));
});
document.querySelector('[data-close="ov2d"]').onclick = ()=>{ v2d.pause(); v2d.src=''; ov2d.style.display='none'; };

const ovYT = document.getElementById('ovYT'), yt = document.getElementById('yt');
document.getElementById('openYT').addEventListener('click', (e)=>{
  e.preventDefault();
  yt.src = `https://www.youtube.com/embed/${YT_ID}?autoplay=1&modestbranding=1&rel=0&playsinline=1`;
  ovYT.style.display='block';
});
document.querySelector('[data-close="ovYT"]').onclick = ()=>{ yt.src=''; ovYT.style.display='none'; };

// XR theater (Three.js)
let renderer, scene, camera, controls, screen, videoEl, videoTex;
const xrWrap = document.getElementById('xrWrap');
document.getElementById('xrClose').onclick = ()=>{
  try{renderer.setAnimationLoop(null);}catch{}
  if(videoEl){videoEl.pause(); videoEl.src='';}
  xrWrap.style.display='none';
};


  function buildScene() {
  // Scene + camera
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, 1.6, 0);

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;                // enables true VR when a headset exists
  xrWrap.appendChild(renderer.domElement);

  // Simple dark "room" (inside of a big sphere)
  const roomGeo = new THREE.SphereGeometry(20, 64, 32);
  roomGeo.scale(-1, 1, 1);                   // flip normals so we see the inside
  const roomMat = new THREE.MeshBasicMaterial({ color: 0x0a1020 });
  scene.add(new THREE.Mesh(roomGeo, roomMat));

  // Curved theater screen (IMAX-style)
  const radius = 4.2;                        // distance to viewer
  const height = 3.0;                        // screen height
  const arc = Math.PI * 0.85;                // how curved (≈153°)
  const segs = 96;

  const screenGeo = new THREE.CylinderGeometry(
    radius, radius, height, segs, 1, true,
    Math.PI / 2 - arc / 2,                   // start angle
    arc                                      // sweep
  );

  screen = new THREE.Mesh(
    screenGeo,
    new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide }) // show inside face
  );
  screen.position.set(0, 1.6, 0);
  scene.add(screen);

  // Subtle floor glow for depth
  const glow = new THREE.Mesh(
    new THREE.RingGeometry(1.8, 2.2, 64),
    new THREE.MeshBasicMaterial({ color: 0x1e5bff, side: THREE.DoubleSide, transparent: true, opacity: 0.12 })
  );
  glow.rotation.x = -Math.PI / 2; glow.position.y = 0.01;
  scene.add(glow);

  // Orbit controls (desktop / fallback). We switch to DeviceOrientationControls in Magic-Window.
  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1.6, 0);            // look at screen center
  controls.enableDamping = true;
  controls.minDistance = 2.2;
  controls.maxDistance = 8;
  controls.update();

  // Resize handling
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Default render loop (overridden when startXR/startMagicWindow set their own)
  renderer.setAnimationLoop(() => {
    if (controls) controls.update();
    renderer.render(scene, camera);
  });
} //end buildscene



// Requires: buildScene(), attachVideoToScreen(), and
// import { VRButton } from 'https://unpkg.com/three@0.160.0/examples/jsm/webxr/VRButton.js';

async function startXR() {
  if (!renderer) buildScene();          // make sure scene/renderer exist
  xrWrap.style.display = 'block';       // show the canvas overlay

  await attachVideoToScreen();          // put the video on the curved screen

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
    videoEl.playsInline = true; videoEl.setAttribute('webkit-playsinline','');
    videoEl.preload = 'auto'; videoEl.src = mp4;
    if (poster) videoEl.poster = poster;
  }
  try { await videoEl.play(); } catch { toast('Tap again to start video'); }
  videoTex = new THREE.VideoTexture(videoEl);
  videoTex.colorSpace = THREE.SRGBColorSpace;
  screen.material = new THREE.MeshBasicMaterial({ map: videoTex, toneMapped: false, side: THREE.BackSide });
}

let mwControls;

async function requestMotionPermission() {
  // iOS requires explicit permission
  if (typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function') {
    try { return (await DeviceOrientationEvent.requestPermission()) === 'granted'; }
    catch { return false; }
  }
  return true; // Android/desktop typically ok
}

async function startMagicWindow() {
  if (!renderer) buildScene();
  xrWrap.style.display = 'block';
  await attachVideoToScreen();   // reuse the same video texture

  // Dispose orbit controls if active
  if (controls) { controls.dispose(); controls = null; }

  // Tilt-to-look controls
  mwControls = new DeviceOrientationControls(camera);
  mwControls.connect();

  renderer.setAnimationLoop(() => {
    mwControls.update();
    renderer.render(scene, camera);
  });

  toast('Move your phone to look around');
}


// Enhance hero click
hero.addEventListener('click', async (e) => {
  e.preventDefault();

  // 1) True VR if available and not inside Telegram webview
  if (!inTelegram() && await xrSupported()) {
    startXR();
    return;
  }

  // 2) Magic-Window (no headset)
  const ok = await requestMotionPermission();
  if (ok) {
    startMagicWindow();
    return;
  }

  // 3) Fallback to 2D overlay
  document.getElementById('open2d').click();
});


// Optional deep-link: ?src=...&title=...
const q = new URLSearchParams(location.search);
const qs = q.get('src'); if(qs){ hero.dataset.mp4 = qs; document.getElementById('open2d').click(); }
