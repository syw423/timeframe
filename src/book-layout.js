// ==============================
// 翻页书布局 v4
// - 封面/封底是独立的 300px 单页元素
// - 翻开时是 600px 双页 (2 张照片)
// - 书本永远居中
// ==============================

let containerEl = null;
let bookEl = null;
let bookWrapper = null;
let coverEl = null;      // 封面元素 (独立)
let backCoverEl = null;  // 封底元素 (独立)
let openContainerEl = null; // 翻开状态容器
let currentFlippedCount = 0;  // 当前翻开次数
let totalPhotos = 0;
let isFlipping = false;
let photoData = [];
let blobUrls = [];

// ==============================
// 主渲染入口
// ==============================
export function renderBook(container, data) {
  if (!container) return;
  containerEl = container;
  photoData = data;
  currentFlippedCount = 0;
  isFlipping = false;
  totalPhotos = data.length;

  if (data.length === 0) return;

  container.innerHTML = '';

  // 创建书的外层容器
  bookWrapper = document.createElement('div');
  bookWrapper.className = 'book-wrapper';
  bookWrapper.addEventListener('click', onWrapperClick);

  // 书的容器
  bookEl = document.createElement('div');
  bookEl.className = 'book is-cover';
  bookEl.id = 'book-el';
  bookWrapper.appendChild(bookEl);

  // 创建封面 (单页)
  coverEl = document.createElement('div');
  coverEl.className = 'book-cover-page';
  coverEl.innerHTML = makeCoverHTML(totalPhotos, '回忆相册', 'Photo Journal');
  bookEl.appendChild(coverEl);

  // 创建翻开状态的容器 (放 2 张照片)
  openContainerEl = document.createElement('div');
  openContainerEl.className = 'book-open-pages';
  bookEl.appendChild(openContainerEl);

  // 创建封底 (单页)
  backCoverEl = document.createElement('div');
  backCoverEl.className = 'book-back-cover-page';
  backCoverEl.innerHTML = makeCoverHTML(totalPhotos, 'THE END', 'TimeFrame · ' + new Date().getFullYear(), true);
  bookEl.appendChild(backCoverEl);

  // 初始显示封面
  updateBookState();

  container.appendChild(bookWrapper);

  // 键盘 ← → 翻页
  document.addEventListener('keydown', onKeyDown);
}

// ==============================
// 翻页点击
// ==============================
function onWrapperClick(e) {
  if (isFlipping) return;
  if (!bookEl) return;

  const state = getCurrentState();
  if (state === 'cover') {
    flipRight();
    return;
  }
  if (state === 'back') {
    flipLeft();
    return;
  }

  // 翻开状态: 以书本中分线判断左右
  const bookRect = bookEl.getBoundingClientRect();
  const midX = bookRect.left + bookRect.width / 2;
  if (e.clientX < midX) {
    flipLeft();
  } else {
    flipRight();
  }
}

// ==============================
// 键盘支持
// ==============================
function onKeyDown(e) {
  if (e.key === 'ArrowRight') {
    e.preventDefault();
    if (!isFlipping && bookEl) flipRight();
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    if (!isFlipping && bookEl) flipLeft();
  }
}

// ==============================
// 状态判断
// ==============================
function getCurrentState() {
  if (currentFlippedCount === 0) return 'cover';
  const lastOpenIdx = Math.ceil(totalPhotos / 2);
  if (currentFlippedCount > lastOpenIdx) return 'back';
  return 'open';
}

function updateBookState() {
  if (!bookEl) return;
  bookEl.classList.remove('is-cover', 'is-open', 'is-back');
  const state = getCurrentState();
  bookEl.classList.add('is-' + state);

  // 翻开状态: 更新 2 张照片
  if (state === 'open' && openContainerEl) {
    renderOpenPages();
  }
}

// ==============================
// 渲染翻开的 2 张照片
// ==============================
function renderOpenPages() {
  if (!openContainerEl) return;
  openContainerEl.innerHTML = '';

  // 当前翻开 2 张: photo[currentFlippedCount*2 - 2] 和 photo[currentFlippedCount*2 - 1]
  // 例: currentFlippedCount=1 → 显示 photo[0] (左) + photo[1] (右)
  //     currentFlippedCount=2 → 显示 photo[2] (左) + photo[3] (右)
  const baseIdx = (currentFlippedCount - 1) * 2;
  const leftIdx = baseIdx;
  const rightIdx = baseIdx + 1;

  if (leftIdx < totalPhotos) {
    const page = createPhotoPage(leftIdx, 'left');
    openContainerEl.appendChild(page);
  }
  if (rightIdx < totalPhotos) {
    const page = createPhotoPage(rightIdx, 'right');
    openContainerEl.appendChild(page);
  }
}

function createPhotoPage(idx, side) {
  const page = document.createElement('div');
  page.className = `book-photo-page book-photo-${side}`;

  const frame = document.createElement('div');
  frame.className = 'book-photo-frame';

  const img = document.createElement('img');
  if (typeof photoData[idx].file === 'string') {
    img.src = photoData[idx].file;
  } else {
    const url = URL.createObjectURL(photoData[idx].file);
    blobUrls.push(url);
    img.src = url;
  }
  img.draggable = false;
  frame.appendChild(img);

  const meta = document.createElement('div');
  meta.className = 'book-photo-meta';
  meta.innerHTML = `<span class="book-photo-date">${photoData[idx].date || ''}</span><span class="book-photo-num">— ${String(idx + 1).padStart(2, '0')} / ${String(totalPhotos).padStart(2, '0')} —</span>`;

  page.appendChild(frame);
  page.appendChild(meta);
  return page;
}

// ==============================
// 翻页逻辑
// ==============================
function flipRight() {
  if (isFlipping) return;
  const maxFlipped = Math.ceil(totalPhotos / 2) + 1;
  if (currentFlippedCount >= maxFlipped) return;

  isFlipping = true;
  currentFlippedCount++;
  updateBookState();

  setTimeout(() => {
    isFlipping = false;
  }, 600);
}

function flipLeft() {
  if (isFlipping) return;
  if (currentFlippedCount <= 0) return;

  isFlipping = true;
  currentFlippedCount--;
  updateBookState();

  setTimeout(() => {
    isFlipping = false;
  }, 600);
}

// ==============================
// 封面/封底 HTML
// ==============================
function makeCoverHTML(total, title, subtitle, isEnd) {
  if (isEnd) {
    return `<div class="book-cover">
      <div class="book-cover-corner tl"></div>
      <div class="book-cover-corner tr"></div>
      <div class="book-cover-corner bl"></div>
      <div class="book-cover-corner br"></div>
      <div class="book-cover-deco">· FIN ·</div>
      <div class="book-cover-title">${title}</div>
      <div class="book-cover-rule"></div>
      <div class="book-cover-stat" style="margin-top:12px;">${subtitle}</div>
    </div>`;
  }
  return `<div class="book-cover">
    <div class="book-cover-corner tl"></div>
    <div class="book-cover-corner tr"></div>
    <div class="book-cover-corner bl"></div>
    <div class="book-cover-corner br"></div>
    <div class="book-cover-deco">· MEMORIES ·</div>
    <div class="book-cover-title">${title}</div>
    <div class="book-cover-rule"></div>
    <div class="book-cover-year">${subtitle}</div>
    <div class="book-cover-stat">共 <em>${total}</em> 张照片</div>
  </div>`;
}

// ==============================
// 销毁
// ==============================
export function destroyBook() {
  document.removeEventListener('keydown', onKeyDown);

  for (const url of blobUrls) {
    try { URL.revokeObjectURL(url); } catch (e) { /* ignore */ }
  }
  blobUrls = [];

  if (containerEl) {
    containerEl.innerHTML = '';
  }
  if (bookWrapper) {
    bookWrapper.removeEventListener('click', onWrapperClick);
  }
  photoData = [];
  currentFlippedCount = 0;
  totalPhotos = 0;
  isFlipping = false;
  containerEl = null;
  bookEl = null;
  bookWrapper = null;
  coverEl = null;
  backCoverEl = null;
  openContainerEl = null;
}
