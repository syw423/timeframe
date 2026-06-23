// ==============================
// DOM 引用
// ==============================
import { saveToIndexedDB, loadFromIndexedDB, hasData, updateNote, deleteByFilename, generateMonthTag, createTag, addTagToPhotoByFile, repairTagCounts } from './src/db.js';
import { calculateGridLayout } from './src/grid-layout.js';
import { calculateCarouselLayout } from './src/carousel-layout.js';
import { initThreeScene, destroyThreeScene, switchArrangement, getCurrentArrangement, ARRANGEMENTS } from './src/three-mode.js';
import { renderBook, destroyBook } from './src/book-layout.js';
import { renderTagsHome, renderPhotoDetailTags, initTagManager, bindGalleryTagEvents } from './src/tag-manager.js';

// 隐藏文件输入
const folderInput = document.getElementById('folderInput');
const fileInput = document.getElementById('fileInput');
const statusDiv = document.getElementById('status');

// 欢迎界面
const welcomeImportBtn = document.getElementById('welcome-import-btn');

// 导入选项弹窗
const importModal = document.getElementById('import-modal');
const importFolderOpt = document.getElementById('import-folder');
const importFilesOpt = document.getElementById('import-files');

// 顶部按钮
const topBar = document.querySelector('.top-bar');
const dateTrigger = document.getElementById('date-trigger');
const addPhotosBtn = document.getElementById('add-photos-btn');

// 布局切换
const layoutGrid = document.getElementById('layout-grid');
const layoutCarousel = document.getElementById('layout-carousel');
const layoutCircle = null;
const layoutThree = document.getElementById('layout-three');
const layoutBook = document.getElementById('layout-book');

// 排列切换栏
const arrangementBar = document.getElementById('arrangement-bar');
const arrBtns = arrangementBar?.querySelectorAll('.arr-btn') || [];

// 日期弹窗 + 日历
const dateModal = document.getElementById('date-modal');
const dateModalClose = document.getElementById('date-modal-close');
const pickerAll = document.getElementById('picker-all');
const calTitle = document.getElementById('cal-title');
const calGrid = document.getElementById('cal-grid');
const calPrev = document.getElementById('cal-prev');
const calNext = document.getElementById('cal-next');

// 导航标签
const navPhotos = document.getElementById('nav-photos');
const navTags = document.getElementById('nav-tags');

// 标签容器
const tagsHomeContainer = document.getElementById('tags-home-container');
const tagDetailContainer = document.getElementById('tag-detail-container');

// 照片详情
const detailPanel = document.getElementById('photo-detail');
const detailClose = document.getElementById('detail-close');
const detailImg = document.getElementById('detail-img');
const detailVideo = document.getElementById('detail-video');
const detailDateEl = document.getElementById('detail-date');
const detailNote = document.getElementById('detail-note');
const detailFilename = document.getElementById('detail-filename');
const detailTags = document.getElementById('detail-tags');
const detailDelete = document.getElementById('detail-delete');

// ==============================
// 文件类型
// ==============================
const IMAGE_EXTS = ['jpg','jpeg','png','gif','bmp','webp','heic'];
const VIDEO_EXTS = ['mp4','mov','webm','avi'];
const ALLOWED_EXTS = [...IMAGE_EXTS, ...VIDEO_EXTS];

// ==============================
// 全局状态
// ==============================
let daysMap = {};
let allPhotoData = [];
let detailBlobUrl = null;
let currentDate = 'all';
let currentTag = null; // 当前筛选的标签
let tagReturnView = null; // 返回目标: 'tags-home' | 'month-list' | null
let photoBlobUrls = [];
let currentLayout = 'grid'; // 'grid' | 'carousel' | 'circle'

// ==============================
// 导入弹窗逻辑
// ==============================
function openImportModal() {
  if (importModal) importModal.classList.add('open');
}
function closeImportModal() {
  if (importModal) importModal.classList.remove('open');
}

if (welcomeImportBtn) welcomeImportBtn.addEventListener('click', openImportModal);
if (addPhotosBtn) addPhotosBtn.addEventListener('click', openImportModal);
if (importModal) importModal.addEventListener('click', (e) => {
  if (e.target === importModal) closeImportModal();
});

// 选择文件夹导入
if (importFolderOpt) importFolderOpt.addEventListener('click', () => {
  closeImportModal();
  folderInput?.click();
});

// 选择单张照片导入
if (importFilesOpt) importFilesOpt.addEventListener('click', () => {
  closeImportModal();
  fileInput?.click();
});

// ==============================
// 通用照片处理（文件夹 + 单张）
// ==============================
async function processFiles(fileArray) {
  if (!fileArray || fileArray.length === 0) return;

  const isFirstImport = allPhotoData.length === 0;

  if (isFirstImport) {
    const welcome = document.getElementById('welcome');
    if (welcome) welcome.classList.add('hidden');
  }
  setText(statusDiv, '⏳ 正在读取回忆...');

  try {
    const newPhotos = [];

    for (const file of fileArray) {
      // 跳过备注文件（从 note.txt 读取，但文件夹导入时处理）
      if (file.name === 'note.txt' || file.name === 'readme.md' || file.name === '备注.txt') {
        if (file.webkitRelativePath) {
          const parts = file.webkitRelativePath.split('/');
          const dateFolder = parts[0];
          const text = await file.text();
          if (!daysMap[dateFolder]) daysMap[dateFolder] = { photos: [], note: '' };
          daysMap[dateFolder].note = (daysMap[dateFolder].note || '') + text.trim();
        }
        continue;
      }

      const ext = file.name.split('.').pop().toLowerCase();
      if (!ALLOWED_EXTS.includes(ext)) continue;

      // 检查是否已导入（相同文件名 且 相同大小）
      const isDuplicate = allPhotoData.some(p =>
        p.filename === file.name && p.file.size === file.size
      );
      if (isDuplicate) continue;

      let dateTaken = null;
      if (ext === 'jpg' || ext === 'jpeg') dateTaken = await tryExifDate(file);

      if (!dateTaken) {
        const ts = file.lastModified;
        const d = ts && !isNaN(ts) ? new Date(ts) : new Date();
        dateTaken = d.toISOString().split('T')[0];
      }

      if (!daysMap[dateTaken]) daysMap[dateTaken] = { photos: [], note: '' };
      daysMap[dateTaken].photos.push(file);
      newPhotos.push({ file, filename: file.name, date: dateTaken, note: '' });
    }

    // 回填备注
    for (const item of newPhotos) {
      if (daysMap[item.date]) item.note = daysMap[item.date].note || '';
    }

    if (newPhotos.length === 0 && allPhotoData.length === 0) {
      setText(statusDiv, '❌ 没找到新的图片');
      return;
    }
    if (newPhotos.length === 0 && allPhotoData.length > 0) {
      setText(statusDiv, '✨ 没有新照片（已全部导入）');
      return;
    }

    // 合并到全局数据
    const wasEmpty = allPhotoData.length === 0;
    // 为每个新照片分配临时ID（用于标签操作）
    let nextId = allPhotoData.reduce((max, p) => Math.max(max, p.id || 0), 0) + 1;
    for (const item of newPhotos) {
      item.id = nextId++;
    }
    allPhotoData.push(...newPhotos);

    // 显示顶部按钮
    topBar?.classList.add('visible');
    showResetButton();

    // 更新日历
    rebuildAvailableSet();

    // 选中全部照片
    addClass(pickerAll, 'active');
    await selectDate('all');

    setText(statusDiv, `✨ 已导入 ${newPhotos.length} 张照片，共 ${allPhotoData.length} 张`);

    // 保存到 IndexedDB（等待完成后再关联标签）
    await saveToIndexedDB(newPhotos).catch(e => console.warn('[TimeFrame] 缓存保存失败:', e));

    // 自动生成月份系统标签并关联照片
    for (const item of newPhotos) {
      const monthTag = generateMonthTag(item.date);
      if (monthTag) {
        // 创建系统标签（如果已存在会忽略）
        await createTag(monthTag, 'system').catch(() => {});
        // 把照片加入月份标签
        await addTagToPhotoByFile(item.filename, item.date, monthTag).catch(() => {});
        // 同步更新内存中的 tags
        if (!item.tags) item.tags = [];
        if (!item.tags.includes(monthTag)) item.tags.push(monthTag);
      }
    }

    // 清空 input 以便重复选择
    folderInput.value = '';
    fileInput.value = '';
  } catch (err) {
    console.error('[TimeFrame v2]', err);
    setText(statusDiv, '❌ 出错: ' + err.message);
    folderInput.value = '';
    fileInput.value = '';
  }
}

// 文件夹选择
if (folderInput) {
  folderInput.addEventListener('change', async (event) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    await processFiles(Array.from(files));
  });
}

// 单张/多张照片选择
if (fileInput) {
  fileInput.addEventListener('change', async (event) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    await processFiles(Array.from(files));
  });
}

function tryExifDate(file) {
  return new Promise((resolve) => {
    if (typeof EXIF === 'undefined') { resolve(null); return; }
    const timer = setTimeout(() => resolve(null), 3000);
    try {
      EXIF.getData(file, function() {
        clearTimeout(timer);
        const dt = EXIF.getTag(this, 'DateTimeOriginal') || EXIF.getTag(this, 'DateTimeDigitized') || EXIF.getTag(this, 'DateTime');
        if (dt) resolve(dt.split(' ')[0].replace(/:/g, '-'));
        else resolve(null);
      });
    } catch (e) { clearTimeout(timer); resolve(null); }
  });
}

// ==============================
// 日期弹窗 + 日历
// ==============================
let calYear = 2026;
let calMonth = 1;
let availableDatesSet = new Set();

function rebuildAvailableSet() {
  availableDatesSet = new Set(allPhotoData.map(p => p.date));
  if (availableDatesSet.size > 0) {
    const first = [...availableDatesSet].sort()[0];
    const [y, m] = first.split('-').map(Number);
    calYear = y;
    calMonth = m;
  } else {
    const now = new Date();
    calYear = now.getFullYear();
    calMonth = now.getMonth() + 1;
  }
}

function renderCalendar() {
  if (!calTitle || !calGrid) return;
  const firstDay = new Date(calYear, calMonth - 1, 1);
  const daysInMonth = new Date(calYear, calMonth, 0).getDate();
  const startWeekday = firstDay.getDay();
  const startOffset = startWeekday === 0 ? 6 : startWeekday - 1;

  calTitle.textContent = `${calYear}年${calMonth}月`;

  const todayStr = new Date().toISOString().split('T')[0];
  let html = '';

  const prevDays = new Date(calYear, calMonth - 1, 0).getDate();
  for (let i = startOffset - 1; i >= 0; i--) {
    html += `<div class="cal-day">${prevDays - i}</div>`;
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${calYear}-${String(calMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const classes = ['cal-day'];
    if (availableDatesSet.has(dateStr)) classes.push('has-photo');
    if (dateStr === todayStr) classes.push('today');
    html += `<div class="${classes.join(' ')}" data-date="${dateStr}">${day}</div>`;
  }

  const total = startOffset + daysInMonth;
  const remain = (7 - (total % 7)) % 7;
  for (let day = 1; day <= remain; day++) {
    html += `<div class="cal-day">${day}</div>`;
  }

  calGrid.innerHTML = html;
}

function openDateModal() { addClass(dateModal, 'open'); renderCalendar(); }
function closeDateModal() { removeClass(dateModal, 'open'); }

if (dateTrigger) dateTrigger.addEventListener('click', openDateModal);
if (dateModalClose) dateModalClose.addEventListener('click', closeDateModal);
if (dateModal) dateModal.addEventListener('click', (e) => { if (e.target === dateModal) closeDateModal(); });

window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (importModal?.classList.contains('open')) closeImportModal();
  else if (detailPanel?.classList.contains('open')) hidePhotoDetail();
  else if (dateModal?.classList.contains('open')) closeDateModal();
});

if (calPrev) calPrev.addEventListener('click', () => {
  calMonth--;
  if (calMonth < 1) { calMonth = 12; calYear--; }
  renderCalendar();
});
if (calNext) calNext.addEventListener('click', () => {
  calMonth++;
  if (calMonth > 12) { calMonth = 1; calYear++; }
  renderCalendar();
});
if (calGrid) calGrid.addEventListener('click', (e) => {
  const dayEl = e.target.closest('.cal-day');
  if (!dayEl || !dayEl.classList.contains('has-photo')) return;
  const date = dayEl.dataset.date;
  if (date) {
    removeClass(pickerAll, 'active');
    closeDateModal();
    selectDate(date).catch(e => console.error('[TimeFrame] 跳转失败:', e));
  }
});

function handleAll() {
  addClass(pickerAll, 'active');
  closeDateModal();
  selectDate('all').catch(e => console.error('[TimeFrame] 全部失败:', e));
}
if (pickerAll) pickerAll.addEventListener('click', handleAll);

// ==============================
// 日期筛选
// ==============================
async function selectDate(date) {
  currentDate = date;
  clearGalleryRing();

  // 隐藏标签容器（如果在照片视图下）
  if (tagsHomeContainer) tagsHomeContainer.style.display = 'none';
  if (tagDetailContainer) tagDetailContainer.style.display = 'none';

  // 先按日期筛选
  let photos = date === 'all'
    ? allPhotoData
    : allPhotoData.filter(p => p.date === date);

  // 再按标签筛选
  if (currentTag) {
    photos = photos.filter(p => p.tags && p.tags.includes(currentTag));
  }

  if (photos.length === 0) {
    setText(statusDiv, currentTag
      ? `🏷️ 标签「${currentTag}」下暂无照片`
      : date === 'all' ? '✨ 没有照片' : `📅 ${date} - 没有照片`);
    return;
  }

  setText(statusDiv, currentTag
    ? `🏷️ 标签「${currentTag}」的 ${photos.length} 张照片`
    : date === 'all'
      ? `⏳ 正在加载 ${photos.length} 张照片...`
      : `⏳ 正在加载 ${date} 的 ${photos.length} 张照片...`);

  if (currentLayout === 'grid') {
    buildGridMode(photos);
    bindGalleryTagEvents();
  } else if (currentLayout === 'carousel') {
    buildCarouselMode(photos);
    bindGalleryTagEvents();
  } else if (currentLayout === 'three') {
    buildThreeMode(photos);
    bindGalleryTagEvents();
  } else if (currentLayout === 'book') {
    buildBookMode(photos);
    bindGalleryTagEvents();
  } else {
    buildGridMode(photos);
    bindGalleryTagEvents(); // fallback
  }

  setText(statusDiv, currentTag
    ? `🏷️ 标签「${currentTag}」- ${photos.length} 张照片`
    : date === 'all'
      ? `✨ 全部回忆 - ${photos.length} 张照片`
      : `📅 ${date} - ${photos.length} 张照片`);
}

// ==============================
// CSS 3D 画廊
// ==============================
function buildGalleryRing(photoData) {
  const total = photoData.length;
  if (total === 0) return;

  const container = document.getElementById('gallery-3d');
  if (!container) return;

  const ring = document.createElement('div');
  ring.className = 'gallery-ring';

  if (total <= 3) {
    buildLinearLayout(ring, photoData);
  } else if (total <= 6) {
    buildArcLayout(ring, photoData);
  } else {
    buildCircleLayout(ring, photoData);
  }

  container.appendChild(ring);
  startAutoRotate();
}

function buildLinearLayout(ring, photoData) {
  const total = photoData.length;
  const cardWidth = 280;
  const cardHeight = cardWidth * 1.3;
  const gap = 40;
  const totalWidth = total * cardWidth + (total - 1) * gap;
  const startX = -totalWidth / 2 + cardWidth / 2;

  for (let i = 0; i < total; i++) {
    const { file, filename, date, note, tags } = photoData[i];
    const url = URL.createObjectURL(file);
    photoBlobUrls.push(url);

    const x = startX + i * (cardWidth + gap);

    const card = createCard(file, filename, date, note, url, cardWidth, cardHeight, tags);
    card.style.transform = `translateX(${x}px) translateZ(0)`;
    ring.appendChild(card);
    addTagBadge(card, photoData[i]);
  }
}

function buildArcLayout(ring, photoData) {
  const total = photoData.length;
  const cardWidth = 240;
  const cardHeight = cardWidth * 1.3;
  const radius = 500;
  const arcAngle = Math.min(120, total * 30);
  const startAngle = -arcAngle / 2;

  for (let i = 0; i < total; i++) {
    const { file, filename, date, note, tags } = photoData[i];
    const url = URL.createObjectURL(file);
    photoBlobUrls.push(url);

    const angle = startAngle + (i / (total - 1)) * arcAngle;

    const card = createCard(file, filename, date, note, url, cardWidth, cardHeight, tags);
    card.style.transform = `rotateY(${angle}deg) translateZ(${radius}px)`;
    ring.appendChild(card);
    addTagBadge(card, photoData[i]);
  }
}

function buildCircleLayout(ring, photoData) {
  const total = photoData.length;
  const cardWidth = Math.min(200, Math.max(140, 400 / Math.sqrt(total)));
  const cardHeight = cardWidth * 1.3;
  const angle = (2 * Math.PI) / total;
  const radius = Math.round((cardWidth / 2) / Math.tan(angle / 2)) + 100;

  for (let i = 0; i < total; i++) {
    const { file, filename, date, note, tags } = photoData[i];
    const url = URL.createObjectURL(file);
    photoBlobUrls.push(url);

    const deg = ((i / total) * 360).toFixed(1);

    const card = createCard(file, filename, date, note, url, cardWidth, cardHeight, tags);
    card.style.transform = `rotateY(${deg}deg) translateZ(${radius}px)`;
    ring.appendChild(card);
    addTagBadge(card, photoData[i]);
  }
}

function createCard(file, filename, date, note, url, width, height, tags) {
  const card = document.createElement('div');
  card.className = 'gallery-card';
  card.style.width = width + 'px';
  card.style.height = height + 'px';
  card.style.marginLeft = '-' + Math.round(width / 2) + 'px';
  card.style.marginTop = '-' + Math.round(height / 2) + 'px';
  card.dataset.date = date;
  card.dataset.filename = filename;
  card.dataset.note = note || '';
  card.dataset.tags = JSON.stringify(tags || []);

  const ext = filename.split('.').pop().toLowerCase();
  const isVideo = VIDEO_EXTS.includes(ext);

  if (isVideo) {
    const video = document.createElement('video');
    video.className = 'gallery-img';
    video.src = url;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.style.objectFit = 'cover';
    // 悬停自动播放预览
    card.addEventListener('mouseenter', () => {
      video.play().catch(() => {});
    });
    card.addEventListener('mouseleave', () => {
      video.pause();
      video.currentTime = 0;
    });
    card.appendChild(video);
  } else {
    const img = document.createElement('img');
    img.className = 'gallery-img';
    img.src = url;
    img.alt = file.name;
    img.loading = 'lazy';
    card.appendChild(img);
  }

  return card;
}

/**
 * 如果照片有标签，添加标签徽标
 * @param {HTMLElement} card - 卡片元素
 * @param {Object} photo - 照片数据对象
 */
function addTagBadge(card, photo) {
  const tags = photo.tags || [];
  if (tags.length > 0) {
    const badge = document.createElement('div');
    badge.className = 'photo-tag-badge';
    badge.textContent = `🏷 ${tags.length}`;
    card.appendChild(badge);
    card.style.position = 'relative';
  }
}

function clearGalleryRing() {
  // 清理 Three.js 场景
  destroyThreeScene();

  // 清理翻页书
  destroyBook();

  const container = document.getElementById('gallery-3d');
  if (container) {
    container.innerHTML = '';
    container.classList.remove('grid-mode');
    container.style.perspective = '';
    container.style.alignItems = '';
  }

  for (const url of photoBlobUrls) {
    try { URL.revokeObjectURL(url); } catch (e) { /* ignore */ }
  }
  photoBlobUrls = [];

  if (detailBlobUrl) { URL.revokeObjectURL(detailBlobUrl); detailBlobUrl = null; }
  ringAngle = 0;
}

// ==============================
// 网格布局
// ==============================
function buildGridMode(photoData) {
  const total = photoData.length;
  if (total === 0) return;

  const container = document.getElementById('gallery-3d');
  if (!container) return;

  container.classList.add('grid-mode');

  const grid = document.createElement('div');
  grid.className = 'grid-container';

  // 计算布局参数
  const vw = container.clientWidth || window.innerWidth;
  const vh = container.clientHeight || window.innerHeight;
  const layout = calculateGridLayout(total, vw, vh);

  for (let i = 0; i < total; i++) {
    const { file, filename, date, note, tags } = photoData[i];
    const url = URL.createObjectURL(file);
    photoBlobUrls.push(url);

    const card = document.createElement('div');
    card.className = 'grid-card';
    card.style.width = layout.cardWidth + 'px';
    card.style.height = layout.cardHeight + 'px';
    card.dataset.date = date;
    card.dataset.filename = filename;
    card.dataset.note = note || '';
    card.dataset.tags = JSON.stringify(tags || []);

    const ext = filename.split('.').pop().toLowerCase();
    const isVideo = VIDEO_EXTS.includes(ext);

    if (isVideo) {
      const video = document.createElement('video');
      video.className = 'gallery-img';
      video.src = url;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = 'metadata';
      card.addEventListener('mouseenter', () => video.play().catch(() => {}));
      card.addEventListener('mouseleave', () => { video.pause(); video.currentTime = 0; });
      card.appendChild(video);
    } else {
      const img = document.createElement('img');
      img.className = 'gallery-img';
      img.src = url;
      img.alt = filename;
      img.loading = 'lazy';
      card.appendChild(img);
    }

    grid.appendChild(card);
    addTagBadge(card, photoData[i]);
  }

  container.appendChild(grid);
}

// ==============================
// 布局切换
// ==============================
function setLayout(mode) {
  if (mode === currentLayout) return;
  currentLayout = mode;

  // 更新按钮状态
  [layoutGrid, layoutCarousel, layoutCircle, layoutThree, layoutBook].forEach(btn => btn?.classList.remove('active'));
  const btnMap = { grid: layoutGrid, carousel: layoutCarousel, three: layoutThree, book: layoutBook };
  btnMap[mode]?.classList.add('active');

  // 排列切换栏：仅 3D 模式显示
  if (arrangementBar) {
    arrangementBar.style.display = mode === 'three' ? 'flex' : 'none';
  }

  // 重新渲染
  if (allPhotoData.length > 0) {
    selectDate(currentDate).catch(e => console.error('[TimeFrame] 布局切换失败:', e));
  }
}

if (layoutGrid) layoutGrid.addEventListener('click', () => setLayout('grid'));
if (layoutCarousel) layoutCarousel.addEventListener('click', () => setLayout('carousel'));
if (layoutCircle) layoutCircle.addEventListener('click', () => setLayout('circle'));
if (layoutThree) layoutThree.addEventListener('click', () => setLayout('three'));
if (layoutBook) layoutBook.addEventListener('click', () => setLayout('book'));

// 排列切换
for (const btn of arrBtns) {
  btn.addEventListener('click', () => {
    const arr = btn.dataset.arr;
    if (!arr) return;
    switchArrangement(arr);
    arrBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
}

// ==============================
// 导航切换（照片 / 分类）
// ==============================
function switchView(view) {
  // 更新按钮状态
  [navPhotos, navTags].forEach(btn => btn?.classList.remove('active'));
  if (view === 'photos') navPhotos?.classList.add('active');
  else if (view === 'tags') navTags?.classList.add('active');

  // 隐藏所有容器
  const gallery = document.getElementById('gallery-3d');
  if (gallery) gallery.style.display = 'none';
  if (tagsHomeContainer) tagsHomeContainer.style.display = 'none';
  if (tagDetailContainer) tagDetailContainer.style.display = 'none';

  // 显示选中视图
  if (view === 'photos') {
    if (gallery) gallery.style.display = '';
    if (tagFilterBarEl) tagFilterBarEl.style.display = currentTag ? 'flex' : 'none';
    // 如果已有照片，重新渲染当前视图
    if (allPhotoData.length > 0) {
      selectDate(currentDate).catch(e => console.error('[TimeFrame] 切换视图失败:', e));
    }
  } else if (view === 'tags') {
    hideTagFilterBar();
    if (tagsHomeContainer) {
      tagsHomeContainer.style.display = 'block';
      renderTagsHome(tagsHomeContainer);
    }
  }
}

if (navPhotos) navPhotos.addEventListener('click', () => {
  // 点击「所有照片」只切换到照片视图，不清除标签筛选
  switchView('photos');
});
if (navTags) navTags.addEventListener('click', () => switchView('tags'));

// ==============================
// 标签筛选功能
// ==============================
/**
 * 选择标签，切换到照片视图并筛选
 * @param {string} tagName - 标签名称
 * @param {string} [returnView] - 返回目标: 'tags-home' 或 'month-list'
 */
window.selectTag = function(tagName, returnView) {
  currentTag = tagName;
  tagReturnView = returnView || null;
  // 切换到照片视图
  switchView('photos');
  // 自动选中「全部照片」
  addClass(pickerAll, 'active');
  // 显示标签筛选指示器
  showTagFilterBar(tagName, tagReturnView);
  // 重新加载数据以确保 tags 同步
  reloadPhotoTags().then(() => {
    selectDate('all').catch(e => console.error('[TimeFrame] 标签筛选失败:', e));
  });
};

/**
 * 重新加载照片标签数据（从 IndexedDB）
 */
async function reloadPhotoTags() {
  try {
    const { loadFromIndexedDB } = await import('./src/db.js');
    const loaded = await loadFromIndexedDB();
    // 更新 allPhotoData 中的 tags
    for (const item of loaded) {
      const match = allPhotoData.find(p => p.filename === item.filename && p.date === item.date);
      if (match) {
        match.tags = item.tags || [];
      }
    }
  } catch (e) {
    console.warn('[TimeFrame] 重新加载标签失败:', e);
  }
}

/**
 * 同步照片标签到内存（由 tag-manager 调用）
 */
window.__syncPhotoTag = function(filename, date, tagName, isAdded) {
  const photo = allPhotoData.find(p => p.filename === filename && p.date === date);
  if (photo) {
    if (isAdded) {
      if (!photo.tags) photo.tags = [];
      if (!photo.tags.includes(tagName)) photo.tags.push(tagName);
    } else {
      if (photo.tags) {
        photo.tags = photo.tags.filter(t => t !== tagName);
      }
    }
    // 同步更新 availableDatesSet（如果有需要）
  }
};

/**
 * 清除标签筛选
 */
window.clearTagFilter = function() {
  currentTag = null;
  tagReturnView = null;
  hideTagFilterBar();
  // 切换到照片视图
  const gallery = document.getElementById('gallery-3d');
  if (gallery) gallery.style.display = '';
  if (tagsHomeContainer) tagsHomeContainer.style.display = 'none';
  if (tagDetailContainer) tagDetailContainer.style.display = 'none';
  addClass(pickerAll, 'active');
  // 确保 nav-photos 高亮
  if (navPhotos) navPhotos.classList.add('active');
  if (navTags) navTags.classList.remove('active');
  selectDate('all').then(() => {
    setText(statusDiv, '✅ 已返回默认所有照片');
    setTimeout(() => {
      setText(statusDiv, currentTag
        ? `🏷️ 标签「${currentTag}」- ${allPhotoData.filter(p => p.tags && p.tags.includes(currentTag)).length} 张照片`
        : `📷 共 ${allPhotoData.length} 张照片`);
    }, 1500);
  }).catch(e => console.error('[TimeFrame] 清除筛选失败:', e));
};

let tagFilterBarEl = null;
let tagReturnBtnEl = null; // 返回按钮自身

function showTagFilterBar(tagName, returnView) {
  if (!tagFilterBarEl) {
    tagFilterBarEl = document.createElement('div');
    tagFilterBarEl.className = 'tag-filter-bar';
    // 插到导航栏下方
    const topBar = document.querySelector('.top-bar');
    if (topBar && topBar.parentElement) {
      topBar.parentElement.insertBefore(tagFilterBarEl, topBar.nextSibling);
    } else {
      document.body.appendChild(tagFilterBarEl);
    }
  }

  const isReturnMode = returnView && (returnView === 'month-list' || returnView === 'tags-home');
  const label = returnView === 'month-list' ? '返回月份' : (returnView === 'tags-home' ? '返回分类' : '退出');

  if (isReturnMode) {
    tagFilterBarEl.innerHTML = `
      <button class="tag-filter-back" id="tag-filter-back-btn">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        ${label}
      </button>
    `;
    tagFilterBarEl.className = 'tag-filter-bar tag-filter-bar-back';
    const backBtn = tagFilterBarEl.querySelector('#tag-filter-back-btn');
    if (backBtn) {
      backBtn.onclick = () => window.returnToTagView();
    }
  } else {
    tagFilterBarEl.innerHTML = `
      <button class="tag-filter-clear" onclick="window.clearTagFilter()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
        ${label}
      </button>
    `;
    tagFilterBarEl.className = 'tag-filter-bar';
  }
  tagFilterBarEl.style.display = 'flex';
}

/**
 * 返回标签视图（由「返回」按钮调用）
 */
window.returnToTagView = function() {
  const target = tagReturnView;
  tagReturnView = null;
  currentTag = null;
  hideTagFilterBar();
  switchView('tags');

  if (target === 'month-list') {
    // 标签主页渲染后自动进入月份列表
    setTimeout(() => {
      const container = document.querySelector('.tags-home-container');
      if (!container) return;
      const monthFolder = container.querySelector('.tag-card-folder[data-folder="month"]');
      if (monthFolder) monthFolder.click();
    }, 50);
  }
};

function hideTagFilterBar() {
  if (tagFilterBarEl) tagFilterBarEl.style.display = 'none';
}

// ==============================
// 轮播布局
// ==============================
function buildCarouselMode(photoData) {
  const total = photoData.length;
  if (total === 0) return;

  const container = document.getElementById('gallery-3d');
  if (!container) return;

  container.classList.add('grid-mode'); // 复用 overflow 行为
  container.style.perspective = 'none';
  container.style.alignItems = 'center';

  const vw = container.clientWidth || window.innerWidth;
  const vh = container.clientHeight || window.innerHeight;
  const layout = calculateCarouselLayout(total, vw, vh);

  // 视口容器（裁剪超出部分）
  const viewport = document.createElement('div');
  viewport.className = 'carousel-viewport';
  viewport.style.width = '100%';
  viewport.style.maxWidth = (layout.visibleCount * (layout.cardWidth + layout.gap) + layout.gap) + 'px';

  // 内部条带（可拖拽）
  const strip = document.createElement('div');
  strip.className = 'carousel-strip';
  strip.style.width = layout.totalWidth + 'px';
  strip.style.gap = layout.gap + 'px';
  strip.style.paddingLeft = layout.gap + 'px';
  strip.style.paddingRight = layout.gap + 'px';

  for (let i = 0; i < total; i++) {
    const { file, filename, date, note, tags } = photoData[i];
    const url = URL.createObjectURL(file);
    photoBlobUrls.push(url);

    const card = document.createElement('div');
    card.className = 'carousel-card';
    card.style.width = layout.cardWidth + 'px';
    card.style.height = layout.cardHeight + 'px';
    card.dataset.date = date;
    card.dataset.filename = filename;
    card.dataset.note = note || '';
    card.dataset.tags = JSON.stringify(tags || []);

    const ext = filename.split('.').pop().toLowerCase();
    const isVideo = VIDEO_EXTS.includes(ext);

    if (isVideo) {
      const video = document.createElement('video');
      video.className = 'gallery-img';
      video.src = url;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = 'metadata';
      card.addEventListener('mouseenter', () => video.play().catch(() => {}));
      card.addEventListener('mouseleave', () => { video.pause(); video.currentTime = 0; });
      card.appendChild(video);
    } else {
      const img = document.createElement('img');
      img.className = 'gallery-img';
      img.src = url;
      img.alt = filename;
      img.loading = 'lazy';
      card.appendChild(img);
    }

    strip.appendChild(card);
    addTagBadge(card, photoData[i]);
  }

  viewport.appendChild(strip);
  container.appendChild(viewport);

  // 拖拽滚动
  let isDrag = false;
  let startX = 0;
  let scrollLeft = 0;

  const onStart = (e) => {
    if (e.target.closest('.carousel-card')) {
      isDrag = true;
      startX = e.clientX;
      scrollLeft = parseFloat(strip.dataset.x) || 0;
      viewport.style.cursor = 'grabbing';
    }
  };

  const onMove = (e) => {
    if (!isDrag) return;
    e.preventDefault();
    const delta = e.clientX - startX;
    const maxScroll = Math.max(0, layout.totalWidth - viewport.clientWidth);
    let newX = Math.max(-maxScroll, Math.min(0, scrollLeft + delta));
    strip.dataset.x = newX;
    strip.style.transform = `translateX(${newX}px)`;
  };

  const onEnd = () => {
    if (!isDrag) return;
    isDrag = false;
    viewport.style.cursor = 'grab';
    // 对齐到最近卡片
    const x = parseFloat(strip.dataset.x) || 0;
    const cellW = layout.cardWidth + layout.gap;
    const snapped = Math.round(-x / cellW) * cellW;
    const maxSnap = Math.max(0, layout.totalWidth - viewport.clientWidth);
    const finalX = Math.max(-maxSnap, Math.min(0, -snapped));
    strip.dataset.x = finalX;
    strip.style.transform = `translateX(${finalX}px)`;
    strip.style.transition = 'transform 0.25s cubic-bezier(0.22, 1, 0.36, 1)';
    setTimeout(() => { strip.style.transition = ''; }, 300);
  };

  viewport.addEventListener('mousedown', onStart);
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onEnd);

  // 鼠标滚轮水平滚动
  viewport.addEventListener('wheel', (e) => {
    if (e.deltaY === 0) return;
    e.preventDefault();
    const x = parseFloat(strip.dataset.x) || 0;
    const maxScroll = Math.max(0, layout.totalWidth - viewport.clientWidth);
    const newX = Math.max(-maxScroll, Math.min(0, x - e.deltaY));
    strip.dataset.x = newX;
    strip.style.transform = `translateX(${newX}px)`;
    strip.style.transition = 'transform 0.15s ease';
    setTimeout(() => { strip.style.transition = ''; }, 150);
  }, { passive: false });

  viewport.style.cursor = 'grab';
}

// ==============================
// 3D 手势模式
// ==============================
function buildThreeMode(photoData) {
  const total = photoData.length;
  if (total === 0) return;

  const container = document.getElementById('gallery-3d');
  if (!container) return;

  // 清空容器让 Three.js 接管
  container.innerHTML = '';

  // 排列切换栏重置为当前排列
  const curArr = getCurrentArrangement();
  arrBtns.forEach(b => {
    b.classList.toggle('active', b.dataset.arr === curArr);
  });

  initThreeScene(container, photoData);
}

// ==============================
// 翻页书模式
// ==============================
function buildBookMode(photoData) {
  const container = document.getElementById('gallery-3d');
  if (!container) return;
  container.innerHTML = '';
  renderBook(container, photoData);
}

// ==============================
// 鼠标拖拽旋转
// ==============================
let ringAngle = 0;
let isDragging = false;
let dragStartX = 0;
let isRotPaused = false;
let autoRotateId = null;

function applyRingRotation() {
  const ring = document.querySelector('.gallery-ring');
  if (ring) {
    ring.style.transform = `rotateY(${ringAngle}deg)`;
  }
}

function startAutoRotate() {
  stopAutoRotate();
  
  // 只有环形模式下自动旋转
  if (currentLayout !== 'circle') return;
  
  const cards = document.querySelectorAll('.gallery-card');
  if (cards.length <= 3) return;
  
  let lastTime = performance.now();
  const speed = 0.08;

  function tick(now) {
    if (!isRotPaused && !isDragging) {
      const delta = (now - lastTime) / 16.667;
      ringAngle = (ringAngle + speed * delta) % 360;
      applyRingRotation();
    }
    lastTime = now;
    autoRotateId = requestAnimationFrame(tick);
  }
  autoRotateId = requestAnimationFrame(tick);
}

function stopAutoRotate() {
  if (autoRotateId) {
    cancelAnimationFrame(autoRotateId);
    autoRotateId = null;
  }
}

(function initRotation() {
  const gallery = document.getElementById('gallery-3d');
  if (!gallery) return;

  gallery.addEventListener('mousedown', (e) => {
    if (e.target.closest('.gallery-card')) return;
    // 网格/轮播模式下不拦截拖拽（让原生滚动生效）
    if (currentLayout !== 'circle') return;
    isDragging = true;
    dragStartX = e.clientX;
    gallery.style.cursor = 'grabbing';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    
    const cards = document.querySelectorAll('.gallery-card');
    const deltaX = e.clientX - dragStartX;
    
    if (cards.length <= 3) {
      const ring = document.querySelector('.gallery-ring');
      if (ring) {
        const currentTransform = ring.style.transform || '';
        const match = currentTransform.match(/translateX\(([-\d.]+)px\)/);
        let currentX = match ? parseFloat(match[1]) : 0;
        const maxOffset = cards.length * 160;
        currentX = Math.max(-maxOffset, Math.min(maxOffset, currentX + deltaX * 0.5));
        ring.style.transform = `translateX(${currentX}px)`;
      }
    } else {
      const delta = deltaX * 0.35;
      ringAngle = (ringAngle + delta) % 360;
      applyRingRotation();
    }
    
    dragStartX = e.clientX;
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      gallery.style.cursor = '';
    }
  });
})();

// ==============================
// 双击 → 详情
// ==============================
document.getElementById('gallery-3d')?.addEventListener('dblclick', (e) => {
  const card = e.target.closest('.gallery-card, .grid-card, .carousel-card');
  if (!card) return;

  const date = card.dataset.date;
  const filename = card.dataset.filename;
  const photo = allPhotoData.find(p => p.date === date && (p.filename || p.file?.name) === filename);
  if (photo) showPhotoDetail(photo);
});

function showPhotoDetail(data) {
  if (!data || !data.file) return;
  if (detailBlobUrl) { URL.revokeObjectURL(detailBlobUrl); detailBlobUrl = null; }
  detailBlobUrl = URL.createObjectURL(data.file);

  const ext = (data.filename || data.file?.name || '').split('.').pop().toLowerCase();
  const isVideo = VIDEO_EXTS.includes(ext);

  if (isVideo) {
    detailImg.style.display = 'none';
    detailVideo.style.display = 'block';
    detailVideo.src = detailBlobUrl;
    detailVideo.load();
    detailVideo.play().catch(() => {});
  } else {
    detailVideo.style.display = 'none';
    detailVideo.pause();
    detailVideo.src = '';
    detailImg.style.display = 'block';
    setSrc(detailImg, detailBlobUrl);
  }

  setText(detailDateEl, data.date);
  
  detailNote.contentEditable = 'plaintext-only';
  detailNote.textContent = data.note || '';
  detailNote.dataset.filename = data.filename;
  detailNote.dataset.date = data.date;
  detailNote.classList.add('editing');
  
  setText(detailFilename, data.filename);

  // 渲染标签
  if (detailTags) {
    renderPhotoDetailTags(detailTags, data, async () => {
      // 更新回调：重新渲染标签
      await renderPhotoDetailTags(detailTags, data, null);
      // 重建日历可用日期集（标签变更不影响可用日期，只是展示）
    });
  }

  addClass(detailPanel, 'open');
  isRotPaused = true;
}

function hidePhotoDetail() {
  removeClass(detailPanel, 'open');
  if (detailBlobUrl) { URL.revokeObjectURL(detailBlobUrl); detailBlobUrl = null; }
  detailVideo.pause();
  detailVideo.src = '';
  detailVideo.style.display = 'none';
  detailImg.style.display = 'block';
  detailImg.src = '';
  detailNote.contentEditable = false;
  detailNote.classList.remove('editing');
  isRotPaused = false;
}

if (detailClose) detailClose.addEventListener('click', hidePhotoDetail);
if (detailPanel) detailPanel.addEventListener('click', (e) => { if (e.target === detailPanel) hidePhotoDetail(); });

// 备注自动保存
detailNote.addEventListener('blur', async () => {
  const newNote = detailNote.textContent.trim();
  const filename = detailNote.dataset.filename;
  const date = detailNote.dataset.date;
  if (!filename || !date) return;

  const photo = allPhotoData.find(p => p.date === date && (p.filename || p.file?.name) === filename);
  if (photo) photo.note = newNote;
  if (daysMap[date]) daysMap[date].note = newNote;

  try {
    await updateNote(filename, date, newNote);
  } catch (e) {
    console.warn('[TimeFrame] 备注保存失败:', e);
  }
});

detailNote.addEventListener('keydown', (e) => {
  if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    detailNote.blur();
  }
});

// ==============================
// 删除功能
// ==============================
if (detailDelete) {
  detailDelete.addEventListener('click', async () => {
    const filename = detailNote.dataset.filename;
    const date = detailNote.dataset.date;
    if (!filename || !date) return;

    if (!confirm(`确定删除 "${filename}" 吗？`)) return;

    try {
      // 从 IndexedDB 删除
      await deleteByFilename(filename, date);

      // 从内存中删除
      allPhotoData = allPhotoData.filter(p => !(p.date === date && (p.filename || p.file?.name) === filename));

      // 更新 daysMap
      if (daysMap[date]) {
        daysMap[date].photos = daysMap[date].photos.filter(f => f.name !== filename);
        if (daysMap[date].photos.length === 0) {
          delete daysMap[date];
        }
      }

      hidePhotoDetail();
      rebuildAvailableSet();
      
      // 重新显示当前视图
      if (currentDate === date || currentDate === 'all') {
        await selectDate(currentDate);
      } else {
        addClass(pickerAll, 'active');
        await selectDate('all');
      }

      setText(statusDiv, `🗑️ 已删除「${filename}」，共 ${allPhotoData.length} 张照片`);
    } catch (e) {
      console.error('[TimeFrame] 删除失败:', e);
      setText(statusDiv, '❌ 删除失败: ' + e.message);
    }
  });
}

// ==============================
// 辅助：安全 DOM 操作
// ==============================
function setText(el, text) { if (el) el.textContent = text; }
function setSrc(el, src)   { if (el) el.src = src; }
function addClass(el, cls)  { if (el) el.classList.add(cls); }
function removeClass(el, cls) { if (el) el.classList.remove(cls); }

// ==============================
// 重置功能
// ==============================
async function resetApp() {
  stopAutoRotate();
  clearGalleryRing();

  const { clearIndexedDB } = await import('./src/db.js');
  await clearIndexedDB();

  daysMap = {};
  allPhotoData = [];
  currentDate = 'all';
  currentTag = null;
  currentLayout = 'grid';
  availableDatesSet = new Set();

  topBar?.classList.remove('visible');
  hideResetButton();

  // 重置布局按钮状态
  [layoutGrid, layoutCarousel, layoutCircle, layoutThree].forEach(btn => btn?.classList.remove('active'));
  layoutGrid?.classList.add('active');

  // 隐藏排列切换栏
  if (arrangementBar) arrangementBar.style.display = 'none';

  const welcome = document.getElementById('welcome');
  if (welcome) welcome.classList.remove('hidden');

  setText(statusDiv, '点击「导入照片」开始');

  console.log('[TimeFrame] ✅ 已重置');
}

let resetBtnEl = null;
function addResetButton() {
  resetBtnEl = document.createElement('button');
  resetBtnEl.id = 'reset-btn';
  resetBtnEl.className = 'reset-btn';
  resetBtnEl.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 12"/>
      <path d="M3 3v9h9"/>
    </svg>
    重置
  `;
  resetBtnEl.addEventListener('click', resetApp);
  const topBar = document.querySelector('.top-bar');
  if (topBar) {
    topBar.insertBefore(resetBtnEl, topBar.firstChild);
  } else {
    document.body.appendChild(resetBtnEl);
  }
  // 初始时隐藏
  resetBtnEl.style.display = 'none';
}
function showResetButton() {
  if (resetBtnEl) {
    resetBtnEl.style.display = '';
    resetBtnEl.classList.add('visible');
  }
}
function hideResetButton() {
  if (resetBtnEl) {
    resetBtnEl.style.display = 'none';
    resetBtnEl.classList.remove('visible');
  }
}

// ==============================
// 从缓存恢复
// ==============================
async function initFromCache() {
  try {
    const cached = await hasData();
    if (!cached) return;

    console.log('[TimeFrame] ⏳ 正在从本地缓存加载...');
    setText(statusDiv, '⏳ 正在从本地缓存加载...');

    const loaded = await loadFromIndexedDB();
    if (!loaded || loaded.length === 0) return;

    allPhotoData = loaded.map(item => ({
      file: item.file,
      filename: item.filename || item.file?.name,
      date: item.date,
      note: item.note || '',
      tags: item.tags || [],
      id: item.id,
    }));

    daysMap = {};
    for (const item of allPhotoData) {
      if (!daysMap[item.date]) daysMap[item.date] = { photos: [], note: '' };
      daysMap[item.date].photos.push(item.file);
      if (item.note) daysMap[item.date].note = item.note;
    }

    // 为已有照片补充月份标签
    for (const item of allPhotoData) {
      const monthTag = generateMonthTag(item.date);
      if (monthTag) {
        // 创建系统标签（如果已存在会忽略）
        await createTag(monthTag, 'system').catch(() => {});
        // 如果照片没有这个月份标签，则添加
        if (!item.tags || !item.tags.includes(monthTag)) {
          await addTagToPhotoByFile(item.filename, item.date, monthTag).catch(() => {});
          if (!item.tags) item.tags = [];
          if (!item.tags.includes(monthTag)) item.tags.push(monthTag);
        }
      }
    }
    // 修复标签计数（确保 count 与实际照片数量一致）
    await repairTagCounts().catch(() => {});

    const welcome = document.getElementById('welcome');
    if (welcome) welcome.classList.add('hidden');

    topBar?.classList.add('visible');
    showResetButton();
    addClass(pickerAll, 'active');
    rebuildAvailableSet();
    await selectDate('all');

    console.log(`[TimeFrame] ✅ 已从缓存恢复 ${allPhotoData.length} 张照片`);
  } catch (e) {
    console.warn('[TimeFrame] 缓存加载失败:', e);
  }
}

// ==============================
// 启动自检 + 初始化
// ==============================
(function selfTest() {
  const ids = ['welcome','welcome-import-btn','import-modal','import-folder','import-files',
    'folderInput','fileInput','add-photos-btn','date-trigger',
    'nav-photos','nav-tags','tags-home-container','tag-detail-container',
    'layout-grid','layout-carousel','layout-three','layout-book',
    'arrangement-bar',
    'date-modal','date-modal-close',
    'cal-title','cal-grid','cal-prev','cal-next','picker-all',
    'status','gallery-3d','photo-detail','detail-close','detail-img','detail-video',
    'detail-date','detail-note','detail-filename','detail-tags','detail-delete'];
  const missing = ids.filter(id => !document.getElementById(id));
  if (missing.length) {
    console.error('[TimeFrame v2] ❌ 缺失 DOM 元素:', missing);
  } else {
    console.log('[TimeFrame v2] ✅ 初始化完成');
  }
})();

initFromCache();
addResetButton();
initTagManager();
