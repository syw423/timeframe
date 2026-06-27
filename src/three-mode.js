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
let raycaster, mouse, hoveredGroup;

// 排列类型
const ARRANGEMENTS = ['sphere', 'helix', 'cube', 'wave'];

// ==============================
// 初始化
// ==============================
export function initThreeScene(container, photoData) {
  if (!container) return;
  containerEl = container;

  // Scene — 背景色跟随 CSS 主题
  scene = new THREE.Scene();
  const cssBg = getComputedStyle(document.body).getPropertyValue('--bg').trim();
  scene.background = new THREE.Color(cssBg || '#0a0a0f');

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

  // 灯光（中性柔和，不扭曲照片原色）
  const ambient = new THREE.AmbientLight(0xffffff, 0.8);
  scene.add(ambient);

  const softLight = new THREE.DirectionalLight(0xffffff, 0.5);
  softLight.position.set(3, 6, 5);
  scene.add(softLight);

  // 窗口变化
  window.addEventListener('resize', onResize);

  // 粒子背景
  createParticles();

  // 创建照片
  buildPhotos(photoData);

  // 默认排列
  arrangeSphere();

  // 鼠标追踪（用于悬停高亮）
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();
  hoveredGroup = null;

  renderer.domElement.addEventListener('mousemove', (e) => {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  });

  // 用户拖拽时暂停自动旋转
  controls.addEventListener('start', () => {
    controls.autoRotate = false;
    autoRotateActive = false;
  });
  controls.addEventListener('end', () => {
    // 5秒后恢复自动旋转
    setTimeout(() => {
      controls.autoRotate = true;
      autoRotateActive = true;
    }, 5000);
  });

  // 渲染循环
  startLoop();

  // 监听主题切换，自动更新背景色
  const themeObserver = new MutationObserver(() => {
    if (!scene) return;
    const newBg = getComputedStyle(document.body).getPropertyValue('--bg').trim();
    if (newBg) scene.background = new THREE.Color(newBg);
  });
  themeObserver.observe(document.body, { attributes: true, attributeFilter: ['data-theme'] });
  // 存引用以便销毁时断开
  window.__threeThemeObserver = themeObserver;
}

// ==============================
// 切换排列（带动画过渡）
// ==============================
export function switchArrangement(type) {
  if (!photoMeshes.length) return;
  if (!ARRANGEMENTS.includes(type)) return;
  currentArrangement = type;

  // 保存当前位置/旋转
  const startPos = photoMeshes.map(m => m.position.clone());
  const startQuat = photoMeshes.map(m => m.quaternion.clone());

  // 计算目标位置
  switch (type) {
    case 'sphere': arrangeSphere(); break;
    case 'helix': arrangeHelix(); break;
    case 'cube': arrangeCube(); break;
    case 'wave': arrangeWave(); break;
  }

  // 保存目标位置/旋转
  const endPos = photoMeshes.map(m => m.position.clone());
  const endQuat = photoMeshes.map(m => m.quaternion.clone());

  // 恢复到起始位置，播放过渡动画
  photoMeshes.forEach((m, i) => {
    m.position.copy(startPos[i]);
    m.quaternion.copy(startQuat[i]);
  });
  animateArrangement(endPos, endQuat);

  // 重设控制器目标到中心
  controls.target.set(0, 0, 0);
  controls.update();
}

export { ARRANGEMENTS };

/** 平滑过渡到目标排列 */
function animateArrangement(endPositions, endQuaternions) {
  const duration = 600;
  const startTime = performance.now();
  const startPos = photoMeshes.map(m => m.position.clone());
  const startQuat = photoMeshes.map(m => m.quaternion.clone());

  function tick() {
    const elapsed = performance.now() - startTime;
    const t = Math.min(elapsed / duration, 1);
    const ease = 1 - Math.pow(1 - t, 3); // ease-out cubic

    photoMeshes.forEach((mesh, i) => {
      mesh.position.lerpVectors(startPos[i], endPositions[i], ease);
      if (startQuat[i] && endQuaternions[i]) {
        mesh.quaternion.slerpQuaternions(startQuat[i], endQuaternions[i], ease);
      }
    });

    if (t < 1) requestAnimationFrame(tick);
  }
  tick();
}

// ==============================
// 构建照片 Mesh + 相框
// ==============================
function createPlaceholderTexture() {
  const c = document.createElement('canvas');
  c.width = 2; c.height = 2;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#e8e0d0';
  ctx.fillRect(0, 0, 2, 2);
  return new THREE.CanvasTexture(c);
}

function buildPhotos(photoData) {
  // 清理旧数据
  for (const url of photoBlobUrls) { URL.revokeObjectURL(url); }
  photoBlobUrls = [];

  // 清理旧 mesh
  if (particles) {
    scene?.remove(particles);
    particles.geometry?.dispose();
    particles.material?.dispose();
    particles = null;
  }

  for (const group of photoMeshes) {
    scene.remove(group);
    group.traverse((child) => {
      if (child.isMesh) {
        if (child.material) {
          if (child.material.map) child.material.map.dispose();
          child.material.dispose();
        }
        if (child.geometry) child.geometry.dispose();
      }
    });
  }
  photoMeshes = [];

  const placeholderTex = createPlaceholderTexture();
  photoBlobUrls = [];

  for (const data of photoData) {
    const url = URL.createObjectURL(data.file);
    photoBlobUrls.push(url);

    const cardW = 1.4;
    const cardH = 1.87; // 默认 4:3 比例

    const group = new THREE.Group();
    group.userData = { url, isPhoto: true, loaded: false };

    // --- 白色相框 ---
    const fw = cardW + 0.1;
    const fh = cardH + 0.1;
    const frameGeo = new THREE.PlaneGeometry(fw, fh);
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0xf5f0e8,
      roughness: 0.6,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });
    const frameMesh = new THREE.Mesh(frameGeo, frameMat);
    frameMesh.raycast = () => {};
    group.add(frameMesh);

    // --- 正面照片 ---
    const photoGeo = new THREE.PlaneGeometry(cardW, cardH);
    const photoMat = new THREE.MeshStandardMaterial({
      map: placeholderTex,
      roughness: 0.3,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });
    const photoMesh = new THREE.Mesh(photoGeo, photoMat);
    photoMesh.position.z = 0.002;
    group.add(photoMesh);

    // --- 背面照片（镜像，从外侧看也是图） ---
    const backMat = new THREE.MeshStandardMaterial({
      map: placeholderTex,
      roughness: 0.3,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });
    const backMesh = new THREE.Mesh(photoGeo.clone(), backMat);
    backMesh.position.z = -0.002;
    backMesh.scale.x = -1; // 水平镜像，背面看文字不反
    group.add(backMesh);

    scene.add(group);
    photoMeshes.push(group);

    // 异步加载真实图片
    const img = new Image();
    img.onload = () => {
      const aspect = img.naturalWidth / img.naturalHeight;
      let w, h;
      if (aspect > 1) { w = 1.4; h = 1.4 / aspect; }
      else { w = 1.4 * aspect; h = 1.4; }

      // 更新相框
      frameMesh.geometry.dispose();
      frameMesh.geometry = new THREE.PlaneGeometry(w + 0.1, h + 0.1);

      // 更新正面照片
      photoMesh.geometry.dispose();
      photoMesh.geometry = new THREE.PlaneGeometry(w, h);
      const tex = new THREE.Texture(img);
      tex.needsUpdate = true;
      photoMat.map = tex;
      photoMat.needsUpdate = true;

      // 更新背面照片（宽度为负数需要 clone 新几何体）
      backMesh.geometry.dispose();
      const backGeo = new THREE.PlaneGeometry(w, h);
      backMesh.geometry = backGeo;
      backMesh.scale.x = -1;
      const backTex = new THREE.Texture(img);
      backTex.needsUpdate = true;
      backMat.map = backTex;
      backMat.needsUpdate = true;

      group.userData.loaded = true;
    };
    img.onerror = () => { group.userData.loaded = true; };
    img.src = url;
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

    // 悬停高亮：鼠标指向照片时放大 + 提亮
    if (raycaster && mouse && renderer) {
      raycaster.setFromCamera(mouse, camera);
      // 收集所有 photoMesh 子节点（排除相框）
      const targets = [];
      for (const g of photoMeshes) {
        g.children.forEach(child => {
          if (child.isMesh && child.raycast !== (() => {})) targets.push(child);
        });
      }
      const intersects = raycaster.intersectObjects(targets);

      let hitGroup = null;
      if (intersects.length > 0) {
        const obj = intersects[0].object;
        hitGroup = obj.parent;
      }

      if (hitGroup && hitGroup !== hoveredGroup) {
        // 移除旧高亮
        if (hoveredGroup) hoveredGroup.scale.set(1, 1, 1);
        hoveredGroup = hitGroup;
        hoveredGroup.scale.set(1.12, 1.12, 1.12);
        renderer.domElement.style.cursor = 'pointer';
      } else if (!hitGroup && hoveredGroup) {
        hoveredGroup.scale.set(1, 1, 1);
        hoveredGroup = null;
        renderer.domElement.style.cursor = 'default';
      }
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

  // 断开主题监听
  if (window.__threeThemeObserver) {
    window.__threeThemeObserver.disconnect();
    window.__threeThemeObserver = null;
  }
}

// ==============================
// 获取当前排列名
// ==============================
export function getCurrentArrangement() {
  return currentArrangement;
}
