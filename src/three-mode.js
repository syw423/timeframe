// ==============================
// Three.js 3D 手势模式
// ==============================
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

let scene, camera, renderer, controls;
let photoMeshes = [];
let photoBlobUrls = [];
let particles = null;
let particleSpeed = 0;
let autoRotateActive = false;
let animId = null;
let containerEl = null;
let currentArrangement = 'sphere';

// 排列类型
const ARRANGEMENTS = ['sphere', 'helix', 'cube', 'wave'];

// ==============================
// 初始化
// ==============================
export function initThreeScene(container, photoData) {
  if (!container) return;
  containerEl = container;

  // Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d1117);

  // Camera
  const w = container.clientWidth || window.innerWidth;
  const h = container.clientHeight || window.innerHeight;
  const aspect = w / h;
  camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 2000);
  camera.position.set(0, 2, 8);

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  // Controls (手势控制)
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 2;
  controls.maxDistance = 30;
  controls.rotateSpeed = 0.8;
  controls.zoomSpeed = 1.2;
  controls.target.set(0, 0, 0);
  controls.autoRotate = true;
  controls.autoRotateSpeed = 1.5;
  autoRotateActive = true;
  controls.update();

  // 环境光
  const ambient = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambient);

  const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
  dirLight.position.set(5, 10, 7);
  scene.add(dirLight);

  const backLight = new THREE.DirectionalLight(0x8888ff, 0.3);
  backLight.position.set(-3, 0, -5);
  scene.add(backLight);

  // 窗口变化
  window.addEventListener('resize', onResize);

  // 粒子背景
  createParticles();

  // 创建照片
  buildPhotos(photoData);

  // 默认排列
  arrangeSphere();

  // 用户拖拽时暂停自动旋转
  controls.addEventListener('start', () => {
    controls.autoRotate = false;
    autoRotateActive = false;
  });
  controls.addEventListener('end', () => {
    // 1秒后恢复自动旋转
    setTimeout(() => {
      controls.autoRotate = true;
      autoRotateActive = true;
    }, 1000);
  });

  // 渲染循环
  startLoop();
}

// ==============================
// 切换排列
// ==============================
export function switchArrangement(type) {
  if (!photoMeshes.length) return;
  if (!ARRANGEMENTS.includes(type)) return;
  currentArrangement = type;

  switch (type) {
    case 'sphere': arrangeSphere(); break;
    case 'helix': arrangeHelix(); break;
    case 'cube': arrangeCube(); break;
    case 'wave': arrangeWave(); break;
  }

  // 重设控制器目标到中心
  controls.target.set(0, 0, 0);
  controls.update();
}

export { ARRANGEMENTS };

// ==============================
// 构建照片 Mesh
// ==============================
function buildPhotos(photoData) {
  // 清理旧数据
  for (const url of photoBlobUrls) { URL.revokeObjectURL(url); }
  photoBlobUrls = [];

  // 清理旧 mesh
  // 清理粒子
  if (particles) {
    scene?.remove(particles);
    particles.geometry?.dispose();
    particles.material?.dispose();
    particles = null;
  }

  for (const mesh of photoMeshes) {
    scene.remove(mesh);
    if (mesh.material) {
      if (mesh.material.map) mesh.material.map.dispose();
      mesh.material.dispose();
    }
    if (mesh.geometry) mesh.geometry.dispose();
  }
  photoMeshes = [];

  for (const data of photoData) {
    const url = URL.createObjectURL(data.file);
    photoBlobUrls.push(url);

    const img = new Image();
    img.src = url;

    const cardWidth = 1.4;
    const cardHeight = cardWidth / 0.75; // 默认 4:3

    const texture = new THREE.Texture(img);
    texture.needsUpdate = true;

    // 等图片加载完获取真实宽高比更新几何体 + 更新纹理
    img.onload = () => {
      texture.needsUpdate = true;
      const aspect = img.naturalWidth / img.naturalHeight;
      const mesh = photoMeshes.find(m => m.userData.url === url);
      if (mesh) {
        const w = aspect > 1 ? 1.4 : 1.4 * aspect;
        const h = aspect > 1 ? 1.4 / aspect : 1.4;
        const geo = new THREE.PlaneGeometry(w, h);
        mesh.geometry.dispose();
        mesh.geometry = geo;
        mesh.userData.aspect = aspect;
      }
    };

    const geo = new THREE.PlaneGeometry(cardWidth, cardHeight);
    const mat = new THREE.MeshStandardMaterial({
      map: texture,
      side: THREE.DoubleSide,
      roughness: 0.4,
      metalness: 0.05,
      transparent: true,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData = { url, aspect: 0.75 };
    scene.add(mesh);
    photoMeshes.push(mesh);
  }
}

// ==============================
// 粒子背景
// ==============================
function createParticles() {
  const count = 600;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const colors = new Float32Array(count * 3);

  const color1 = new THREE.Color(0x58a6ff);
  const color2 = new THREE.Color(0x8b5cf6);

  for (let i = 0; i < count; i++) {
    const radius = 15 + Math.random() * 35;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);

    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta) * 0.6;
    positions[i * 3 + 2] = radius * Math.cos(phi);
    sizes[i] = 0.8 + Math.random() * 2.5;

    const c = color1.clone().lerp(color2, Math.random());
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 0.15,
    vertexColors: true,
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });

  particles = new THREE.Points(geometry, material);
  particleSpeed = 0.05 + Math.random() * 0.03;
  scene.add(particles);
}

// ==============================
// 排列算法
// ==============================

/** 球体排列 */
function arrangeSphere() {
  const n = photoMeshes.length;
  const radius = Math.max(2.5, n * 0.25);
  photoMeshes.forEach((mesh, i) => {
    const phi = Math.acos(-1 + (2 * i + 1) / n);
    const theta = Math.sqrt(n * Math.PI) * phi;
    mesh.position.set(
      radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.sin(phi) * Math.sin(theta),
      radius * Math.cos(phi)
    );
    mesh.lookAt(0, 0, 0);
    mesh.scale.set(1, 1, 1);
  });
}

/** 螺旋排列 */
function arrangeHelix() {
  const n = photoMeshes.length;
  const radius = 2.5;
  const height = Math.max(3, n * 0.25);
  photoMeshes.forEach((mesh, i) => {
    const t = i / n;
    const angle = t * Math.PI * 4;
    mesh.position.set(
      radius * Math.cos(angle),
      t * height - height / 2,
      radius * Math.sin(angle)
    );
    mesh.lookAt(0, mesh.position.y * 0.3, 0);
    mesh.scale.set(1, 1, 1);
  });
}

/** 立方体排列（每面一张） */
function arrangeCube() {
  const n = photoMeshes.length;
  const size = 2.5;
  const positions = [];
  const faceSize = Math.ceil(n / 6);
  // 6 个面 + 中心方向
  const dirs = [
    [1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]
  ];
  photoMeshes.forEach((mesh, i) => {
    const faceIdx = Math.min(Math.floor(i / faceSize), 5);
    const idxInFace = i - faceIdx * faceSize;
    const [dx, dy, dz] = dirs[faceIdx];
    const spacing = 0.25;
    const offset = (faceSize - 1) * spacing / 2;
    const ox = (dx === 0 ? (idxInFace % 2 === 0 ? -1 : 1) : 0) * spacing;
    const oy = (dy === 0 ? (idxInFace % 2 === 0 ? -1 : 1) : 0) * spacing;
    const oz = (dz === 0 ? (idxInFace % 2 === 0 ? -1 : 1) : 0) * spacing;
    mesh.position.set(
      dx * size + ox,
      dy * size + oy,
      dz * size + oz
    );
    // 面向外
    const lookTarget = new THREE.Vector3(dx * (size + 1), dy * (size + 1), dz * (size + 1));
    mesh.lookAt(lookTarget);
    mesh.scale.set(1, 1, 1);
  });
}

/** 波浪排列 */
function arrangeWave() {
  const n = photoMeshes.length;
  const spacing = 1.0;
  const totalW = (n - 1) * spacing;
  const waveAmp = 1.2;
  const waveFreq = 1.5;
  photoMeshes.forEach((mesh, i) => {
    const x = i * spacing - totalW / 2;
    const z = waveAmp * Math.sin(x * waveFreq);
    const y = waveAmp * 0.5 * Math.cos(x * waveFreq);
    mesh.position.set(x, y, z);
    mesh.lookAt(x, y, 0);
    mesh.scale.set(1, 1, 1);
  });
}

// ==============================
// 渲染循环
// ==============================
function startLoop() {
  if (animId) cancelAnimationFrame(animId);
  function tick() {
    animId = requestAnimationFrame(tick);
    controls.update();

    // 粒子缓慢漂浮
    if (particles && !autoRotateActive) {
      const time = Date.now() * 0.00008;
      particles.rotation.y = time * particleSpeed;
      particles.rotation.x = Math.sin(time * 0.5) * 0.02;
    } else if (particles) {
      particles.rotation.y += 0.0003;
    }

    renderer.render(scene, camera);
  }
  tick();
}

// ==============================
// 窗口变化
// ==============================
function onResize() {
  if (!containerEl || !renderer || !camera) return;
  const w = containerEl.clientWidth || window.innerWidth;
  const h = containerEl.clientHeight || window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

// ==============================
// 销毁
// ==============================
export function destroyThreeScene() {
  if (animId) { cancelAnimationFrame(animId); animId = null; }

  if (controls) { controls.dispose(); controls = null; }

  if (renderer) {
    renderer.dispose();
    if (renderer.domElement && renderer.domElement.parentNode) {
      renderer.domElement.parentNode.removeChild(renderer.domElement);
    }
    renderer = null;
  }

  // 清理 blob URL
  for (const url of photoBlobUrls) { URL.revokeObjectURL(url); }
  photoBlobUrls = [];

  for (const mesh of photoMeshes) {
    scene?.remove(mesh);
    if (mesh.material) {
      if (mesh.material.map) mesh.material.map.dispose();
      mesh.material.dispose();
    }
    if (mesh.geometry) mesh.geometry.dispose();
  }
  photoMeshes = [];

  scene = null;
  camera = null;
  containerEl = null;
  currentArrangement = 'sphere';
}

// ==============================
// 获取当前排列名
// ==============================
export function getCurrentArrangement() {
  return currentArrangement;
}
