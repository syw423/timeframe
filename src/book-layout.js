// ==============================
// 3D 翻页书布局 - 纸模型
// ==============================

let containerEl = null;
let bookEl = null;
let bookWrapper = null;
let currentPage = 0;
let totalPapers = 0;
let papers = [];
let years = [];
let currentYearIdx = 0;
let isFlipping = false;
let photoData = [];
let yearNavEl = null;
let coverUrl = null;
let blobUrls = [];
let backCoverEl = null; // 封底元素

// ==============================
// 主渲染入口
// ==============================
export function renderBook(container, data) {
  if (!container) return;
  containerEl = container;
  photoData = data;
  currentPage = 0;
  isFlipping = false;

  if (data.length === 0) return;

  // 获取年份列表
  const yearSet = new Set();
  data.forEach(p => {
    const y = p.date ? p.date.split('-')[0] : '未知';
    yearSet.add(y);
  });
  years = [...yearSet].sort();
  currentYearIdx = 0;

  container.innerHTML = '';

  // 创建书的外层容器
  bookWrapper = document.createElement('div');
  bookWrapper.className = 'book-wrapper';

  // 年份导航
  yearNavEl = document.createElement('div');
  yearNavEl.className = 'book-year-nav';
  renderYearNav();
  bookWrapper.appendChild(yearNavEl);

  // 书的容器
  bookEl = document.createElement('div');
  bookEl.className = 'book';
  bookEl.id = 'book-el';
  bookWrapper.appendChild(bookEl);

  // 创建页面
  buildBookPages(bookEl, data);

  // 封底
  backCoverEl = document.createElement('div');
  backCoverEl.className = 'book-back-cover';
  backCoverEl.innerHTML = makeBackCoverHTML();
  bookEl.appendChild(backCoverEl);

  // 翻页点击：检测点击位置在左页还是右页
  bookWrapper.addEventListener('click', onWrapperClick);

  container.appendChild(bookWrapper);

  // 窗口变化
  window.addEventListener('resize', onResize);

  // 初始化：显示封面
  setTimeout(() => {
    updateVisiblePages();
  }, 100);
}

// ==============================
// 翻页点击检测
// ==============================
function onWrapperClick(e) {
  // 排除年份导航等控件点击
  if (e.target.closest('.book-year-nav, .book-year-btn')) return;
  if (isFlipping) return;
  if (!bookEl) return;

  const bookRect = bookEl.getBoundingClientRect();
  const clickX = e.clientX;
  const deadZone = 10; // px 容差

  if (currentPage === 0) {
    // 封面模式：右半页翻下一页
    if (clickX > bookRect.left + bookRect.width * 0.5) {
      flipRight();
    }
  } else if (currentPage >= totalPapers) {
    // 封底模式：左半页翻回上一页
    if (clickX < bookRect.left + bookRect.width * 0.5) {
      flipLeft();
    }
  } else {
    // 翻开模式：左页翻上一页，右页翻下一页
    if (clickX < bookRect.left - deadZone) {
      flipLeft();
    } else if (clickX > bookRect.left + deadZone) {
      flipRight();
    }
  }
}

// ==============================
// 构建书页
// ==============================
function buildBookPages(bookEl, data) {
  papers = [];
  totalPapers = data.length;

  function createBlob(file) {
    const url = URL.createObjectURL(file);
    blobUrls.push(url);
    return url;
  }

  // Paper 0: 封面 - 随机选一张照片
  const coverPaper = document.createElement('div');
  coverPaper.className = 'book-paper';
  coverPaper.style.zIndex = totalPapers;
  coverPaper.dataset.origZ = totalPapers;

  const coverFront = document.createElement('div');
  coverFront.className = 'book-page front';

  const coverIdx = Math.floor(Math.random() * data.length);
  const coverImg = document.createElement('img');
  coverImg.src = createBlob(data[coverIdx].file);
  coverImg.draggable = false;
  coverFront.appendChild(coverImg);

  const coverTitleEl = document.createElement('div');
  coverTitleEl.className = 'book-cover-title';
  coverTitleEl.textContent = '📒 回忆相册';
  coverFront.appendChild(coverTitleEl);

  const coverSub = document.createElement('div');
  coverSub.className = 'book-cover-sub';
  coverSub.textContent = '📷 ' + data.length + ' 张照片';
  coverFront.appendChild(coverSub);
  coverPaper.appendChild(coverFront);

  // 封面背面：显示第一张照片
  const coverBack = document.createElement('div');
  coverBack.className = 'book-page back';
  const backImg = document.createElement('img');
  backImg.src = createBlob(data[0].file);
  backImg.draggable = false;
  coverBack.appendChild(backImg);
  const backLabel = document.createElement('div');
  backLabel.className = 'book-page-label';
  backLabel.textContent = data[0].date || '';
  coverBack.appendChild(backLabel);
  coverPaper.appendChild(coverBack);

  bookEl.appendChild(coverPaper);
  papers.push(coverPaper);

  // Paper 1 起：data[1] 到 data[last]
  for (let i = 1; i < data.length; i++) {
    const paper = document.createElement('div');
    paper.className = 'book-paper';
    paper.style.zIndex = totalPapers - i;
    paper.dataset.origZ = totalPapers - i;

    // 正面
    const front = document.createElement('div');
    front.className = 'book-page front';
    const imgFront = document.createElement('img');
    imgFront.src = createBlob(data[i].file);
    imgFront.draggable = false;
    const dateLabel = document.createElement('div');
    dateLabel.className = 'book-page-label';
    dateLabel.textContent = data[i].date || '';
    front.appendChild(imgFront);
    front.appendChild(dateLabel);
    paper.appendChild(front);

    // 背面
    const back = document.createElement('div');
    back.className = 'book-page back';
    const imgBack = document.createElement('img');
    imgBack.src = createBlob(data[i].file);
    imgBack.draggable = false;
    const backDateLabel = document.createElement('div');
    backDateLabel.className = 'book-page-label';
    backDateLabel.textContent = data[i].date || '';
    back.appendChild(imgBack);
    back.appendChild(backDateLabel);
    paper.appendChild(back);

    bookEl.appendChild(paper);
    papers.push(paper);
  }
}

// ==============================
// 翻页逻辑
// ==============================
function flipRight() {
  if (isFlipping) return;
  if (currentPage >= totalPapers) return;

  isFlipping = true;
  const paper = papers[currentPage];
  paper.style.zIndex = 9999;
  paper.classList.add('flipping');
  paper.classList.add('flipped');

  currentPage++;
  updateYearNav();

  // 去掉上一张纸的翻转过渡
  if (currentPage > 1 && currentPage < totalPapers) {
    const prevPaper = papers[currentPage - 2];
    prevPaper.classList.remove('flipping');
  }

  setTimeout(() => {
    paper.classList.remove('flipping');
    paper.style.zIndex = 0;
    updateBookPosition();
    isFlipping = false;
  }, 600);
}

function flipLeft() {
  if (isFlipping) return;
  if (currentPage <= 0) return;

  // 从封底返回
  if (currentPage >= totalPapers) {
    isFlipping = true;
    currentPage = totalPapers - 1;
    // 显示纸页，隐藏封底
    papers.forEach(p => p.style.display = '');
    if (backCoverEl) backCoverEl.style.display = 'none';
    // 翻回最后一张纸
    const paper = papers[currentPage];
    paper.classList.add('flipping');
    paper.classList.remove('flipped');
    paper.style.zIndex = 9999;

    updateYearNav();

    setTimeout(() => {
      paper.classList.remove('flipping');
      const origZ = parseInt(paper.dataset.origZ) || 0;
      paper.style.zIndex = origZ;
      updateBookPosition();
      isFlipping = false;
    }, 600);
    return;
  }

  isFlipping = true;
  currentPage--;
  const paper = papers[currentPage];
  paper.style.zIndex = 9999;
  paper.classList.add('flipping');
  paper.classList.remove('flipped');

  updateYearNav();

  // 去掉过渡
  setTimeout(() => {
    paper.classList.remove('flipping');
    const origZ = parseInt(paper.dataset.origZ) || 0;
    paper.style.zIndex = origZ;
    updateBookPosition();
    isFlipping = false;
  }, 600);
}

// ==============================
// 更新可见页面
// ==============================
function updateVisiblePages() {
  // 隐藏封底
  if (backCoverEl) backCoverEl.style.display = 'none';
  
  if (papers.length > 0) {
    // 初始状态：封面在右侧，不翻转
    for (let i = 0; i < papers.length; i++) {
      const p = papers[i];
      p.classList.remove('flipped');
      p.classList.remove('flipping');
      p.style.display = ''; // 确保可见
      const origZ = parseInt(p.dataset.origZ) || 0;
      p.style.zIndex = origZ;
    }
  }
  currentPage = 0;
  updateBookPosition();
}

// ==============================
// 更新书的位置（封面居中 vs 翻开居中 vs 封底居中）
// ==============================
function updateBookPosition() {
  if (!bookEl) return;
  if (currentPage >= totalPapers) {
    // 封底: 居中单页
    bookEl.classList.add('is-back');
    bookEl.classList.remove('open');
    // 隐藏所有纸页，显示封底
    papers.forEach(p => p.style.display = 'none');
    if (backCoverEl) backCoverEl.style.display = 'flex';
  } else if (currentPage > 0) {
    // 翻开: 书脊居中
    bookEl.classList.add('open');
    bookEl.classList.remove('is-back');
    // 确保纸页可见，封底隐藏
    papers.forEach(p => p.style.display = '');
    if (backCoverEl) backCoverEl.style.display = 'none';
  } else {
    // 封面: 居中单页
    bookEl.classList.remove('open');
    bookEl.classList.remove('is-back');
    papers.forEach(p => p.style.display = '');
    if (backCoverEl) backCoverEl.style.display = 'none';
  }
}

// ==============================
// 年份导航
// ==============================
function renderYearNav() {
  if (!yearNavEl) return;
  yearNavEl.innerHTML = '';
  years.forEach((year, idx) => {
    const btn = document.createElement('button');
    btn.className = 'book-year-btn' + (idx === currentYearIdx ? ' active' : '');
    btn.textContent = year;
    btn.addEventListener('click', () => jumpToYear(year));
    yearNavEl.appendChild(btn);
  });
}

function updateYearNav() {
  if (!yearNavEl) return;
  const btns = yearNavEl.querySelectorAll('.book-year-btn');
  const photoIdx = currentPage > 0 ? currentPage - 1 : 0;
  const currentData = photoData[photoIdx];
  if (!currentData) return;
  const curYear = currentData.date ? currentData.date.split('-')[0] : '未知';
  const yearIdx = years.indexOf(curYear);
  if (yearIdx !== -1 && yearIdx !== currentYearIdx) {
    currentYearIdx = yearIdx;
    btns.forEach((btn, i) => {
      btn.classList.toggle('active', i === currentYearIdx);
    });
    if (yearNavEl) {
      const activeBtn = yearNavEl.querySelector('.active');
      if (activeBtn) activeBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }
}

function jumpToYear(year) {
  if (currentPage >= totalPapers) return; // 封底状态不可跳转
  const idx = photoData.findIndex(p => p.date && p.date.startsWith(year));
  if (idx === -1) return;

  const targetPage = idx + 1;
  if (targetPage === currentPage) return;
  if (targetPage < 0 || targetPage >= totalPapers) return;

  // 批量翻页
  isFlipping = true;
  const step = targetPage > currentPage ? 1 : -1;

  function stepFlip() {
    if (targetPage > currentPage) {
      if (currentPage >= targetPage) {
        // 重置所有翻过的纸的 z-index
        for (let i = 0; i < currentPage; i++) {
          papers[i].style.zIndex = 0;
          papers[i].classList.remove('flipping');
        }
        isFlipping = false;
        updateBookPosition();
        return;
      }
      const paper = papers[currentPage];
      paper.style.zIndex = 9999;
      paper.classList.add('flipping');
      paper.classList.add('flipped');
      currentPage++;
    } else {
      if (currentPage <= targetPage) {
        isFlipping = false;
        updateVisiblePages();
        return;
      }
      currentPage--;
      const paper = papers[currentPage];
      paper.style.zIndex = 9999;
      paper.classList.add('flipping');
      paper.classList.remove('flipped');
    }
    updateYearNav();

    setTimeout(stepFlip, 200);
  }

  stepFlip();
}

// ==============================
// 封底 HTML
// ==============================
function makeBackCoverHTML() {
  return `<div class="book-back-cover-inner">
    <div class="book-cover-title">📕 THE END</div>
    <div class="book-cover-sub">TimeFrame · ${new Date().getFullYear()}</div>
  </div>`;
}

// ==============================
// 窗口变化
// ==============================
function onResize() {
  // 书会自动按比例缩放
}

// ==============================
// 销毁
// ==============================
export function destroyBook() {
  // 撤销 blob URLs
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
  papers = [];
  photoData = [];
  currentPage = 0;
  totalPapers = 0;
  isFlipping = false;
  containerEl = null;
  bookEl = null;
  bookWrapper = null;
  yearNavEl = null;
  coverUrl = null;
  backCoverEl = null;
  window.removeEventListener('resize', onResize);
}
