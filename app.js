import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js';
import { VRButton } from 'https://unpkg.com/three@0.160.0/examples/jsm/webxr/VRButton.js';
import { DeviceOrientationControls } from 'https://unpkg.com/three@0.160.0/examples/jsm/controls/DeviceOrientationControls.js';


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

function buildScene(){
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(70, innerWidth/innerHeight, .1, 200);
  camera.position.set(0,1.6,0);
  renderer = new THREE.WebGLRenderer({antialias:true,alpha:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.xr.enabled = true;
  xrWrap.appendChild(renderer.domElement);

  const roomGeo = new THREE.SphereGeometry(20, 48, 32); roomGeo.scale(-1,1,1);
  scene.add(new THREE.Mesh(roomGeo, new THREE.MeshBasicMaterial({color:0x0a1020})));

  const glow = new THREE.Mesh(new THREE.RingGeometry(1.8,2.2,64), new THREE.MeshBasicMaterial({color:0x1e5bff, side:THREE.DoubleSide, transparent:true, opacity:.12}));
  glow.rotation.x = -Math.PI/2; glow.position.y = 0.01; scene.add(glow);

  const h=3.0, w=h*(16/9);
  screen = new THREE.Mesh(new THREE.PlaneGeometry(w,h), new THREE.MeshBasicMaterial({color:0x000000}));
  screen.position.set(0,1.6,-4.2);
  scene.add(screen);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0,1.6,-4.2); controls.enableDamping=true; controls.minDistance=2.2; controls.maxDistance=8; controls.update();

  addEventListener('resize', ()=>{camera.aspect = innerWidth/innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth,innerHeight);});
  renderer.setAnimationLoop(()=>{controls.update(); renderer.render(scene,camera);});
}

async function startXR(){
  if(!mp4){ toast('No MP4 URL set'); return; }
  if(!renderer) buildScene();
  xrWrap.style.display='block';

  videoEl = document.createElement('video');
  videoEl.crossOrigin = 'anonymous';
  videoEl.playsInline = true; videoEl.setAttribute('webkit-playsinline','');
  videoEl.preload = 'auto'; videoEl.src = mp4; if(poster) videoEl.poster = poster;

  try { await videoEl.play(); } catch { toast('Tap again to allow video start'); }

  videoTex = new THREE.VideoTexture(videoEl);
  videoTex.colorSpace = THREE.SRGBColorSpace;
  screen.material = new THREE.MeshBasicMaterial({map:videoTex, toneMapped:false});

  if (!inTelegram() && await xrSupported()){
    const btn = VRButton.createButton(renderer);
    btn.style.position='fixed'; btn.style.right='10px'; btn.style.bottom='12px';
    document.body.appendChild(btn);
  } else {
    toast('3D viewer active (open in Chrome/Quest for VR)');
  }
}

// Enhance hero click
hero.addEventListener('click', async (e)=>{
  e.preventDefault(); // keep SPA behavior
  const canXR = await xrSupported();
  if (canXR && !inTelegram()) startXR();
  else {
    // fallback: open 2D overlay or YouTube
    if(mp4) document.getElementById('open2d').click();
    else    document.getElementById('openYT').click();
  }
});

// Optional deep-link: ?src=...&title=...
const q = new URLSearchParams(location.search);
const qs = q.get('src'); if(qs){ hero.dataset.mp4 = qs; document.getElementById('open2d').click(); }
