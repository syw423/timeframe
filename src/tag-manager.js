// ==============================
// 标签管理模块
// ==============================

import {
  createTag,
  getAllTags,
  getRecentTags,
  addTagToPhotoByFile,
  removeTagFromPhotoByFile,
  getPhotosByTag,
  deleteTag,
  generateMonthTag,
} from './db.js';

// 标签选择器状态
let tagSelectorVisible = false;
let currentPhotoFilename = null;
let currentPhotoDate = null;
let currentPhotoElement = null;
let selectorElement = null;

// ==============================
// 标签主页渲染
// ==============================

/**
 * 渲染标签主页
 * @param {HTMLElement} container - 容器元素
 */
export async function renderTagsHome(container) {
  if (!container) return;

  const tags = await getAllTags();

  // 分离系统标签和自定义标签，过滤掉没有照片的系统标签
  const systemTags = tags.filter(t => t.type === 'system' && t.count > 0).sort((a, b) => b.name.localeCompare(a.name));
  const customTags = tags.filter(t => t.type === 'custom').sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0));

  // 计算月份标签总数
  const monthTotalCount = systemTags.reduce((sum, t) => sum + (t.count || 0), 0);

  const html = `
    <div class="tags-home">
      <div class="tags-header">
        <h2>标签分类</h2>
        <div class="tags-header-actions">
          <button class="tag-exit-btn" id="tag-exit-btn" onclick="window.clearTagFilter()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
            退出
          </button>
          <button class="create-tag-btn" id="create-tag-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            新建标签
          </button>
        </div>
      </div>

      ${systemTags.length > 0 ? `
        <div class="tags-section">
          <h3 class="tags-section-title">系统默认</h3>
          <div class="tags-grid">
            <div class="tag-card tag-card-folder" data-folder="month">
              <div class="tag-card-icon">📅</div>
              <div class="tag-card-info">
                <div class="tag-card-name">月份</div>
                <div class="tag-card-count">${systemTags.length} 个分类 · ${monthTotalCount} 张照片</div>
              </div>
            </div>
          </div>
        </div>
      ` : ''}

      ${customTags.length > 0 ? `
        <div class="tags-section">
          <h3 class="tags-section-title">用户自定义</h3>
          <div class="tags-grid">
            ${customTags.map(tag => renderTagCard(tag)).join('')}
          </div>
        </div>
      ` : ''}

      ${tags.length === 0 ? `
        <div class="tags-empty">
          <p>暂无标签</p>
          <p class="tags-empty-hint">点击上方「新建标签」创建第一个标签</p>
        </div>
      ` : ''}
    </div>
  `;

  container.innerHTML = html;

  // 绑定事件
  bindTagCardEvents(container, 'tags-home');
  bindCreateTagEvent(container);

  // 绑定月份文件夹点击事件
  const monthFolder = container.querySelector('.tag-card-folder[data-folder="month"]');
  if (monthFolder) {
    monthFolder.addEventListener('click', () => {
      showMonthList(container, systemTags);
    });
  }
}

/**
 * 显示月份列表
 */
function showMonthList(container, monthTags) {
  const html = `
    <div class="tags-home">
      <div class="tags-header">
        <button class="tag-back-btn" id="tag-back-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          返回
        </button>
        <h2>月份分类</h2>
      </div>

      ${monthTags.length > 0 ? `
        <div class="tags-section">
          <div class="tags-grid">
            ${monthTags.map(tag => renderTagCard(tag)).join('')}
          </div>
        </div>
      ` : `
        <div class="tags-empty">
          <p>暂无月份分类</p>
          <p class="tags-empty-hint">导入照片后会自动生成月份标签</p>
        </div>
      `}
    </div>
  `;

  container.innerHTML = html;

  // 绑定返回按钮
  const backBtn = container.querySelector('#tag-back-btn');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      renderTagsHome(container);
    });
  }

  // 绑定月份卡片点击 → 筛选该月份的照片
  container.querySelectorAll('.tag-card').forEach(card => {
    card.addEventListener('click', async (e) => {
      if (e.target.closest('.tag-card-delete')) return;
      const tagName = card.dataset.tag;
      if (window.selectTag) {
        window.selectTag(tagName, 'month-list');
      }
    });
  });
}

function renderTagCard(tag) {
  const isSystem = tag.type === 'system';
  return `
    <div class="tag-card" data-tag="${tag.name}" data-type="${tag.type}">
      <div class="tag-card-icon">
        ${isSystem ? '📅' : '🏷️'}
      </div>
      <div class="tag-card-info">
        <div class="tag-card-name">${tag.name}</div>
        <div class="tag-card-count">${tag.count || 0} 张照片</div>
      </div>
      ${!isSystem ? `
        <button class="tag-card-delete" data-tag="${tag.name}" title="删除标签">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      ` : ''}
    </div>
  `;
}

function bindTagCardEvents(container, returnView) {
  // 点击标签卡片 → 使用布局模式显示
  container.querySelectorAll('.tag-card').forEach(card => {
    card.addEventListener('click', (e) => {
      // 如果点击的是删除按钮，不触发卡片点击
      if (e.target.closest('.tag-card-delete')) return;

      const tagName = card.dataset.tag;
      // 跳过没有 data-tag 的卡片（如月份文件夹卡片）
      if (!tagName) return;
      // 使用全局 selectTag 切换到照片视图的标签筛选模式
      if (window.selectTag) {
        window.selectTag(tagName, returnView);
      }
    });
  });

  // 删除标签按钮
  container.querySelectorAll('.tag-card-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const tagName = btn.dataset.tag;
      if (confirm(`确定要删除标签「${tagName}」吗？\n标签内的照片不会被删除。`)) {
        await deleteTag(tagName);
        // 重新渲染
        const homeContainer = document.getElementById('tags-home-container');
        if (homeContainer) {
          await renderTagsHome(homeContainer);
        }
      }
    });
  });
}

function bindCreateTagEvent(container) {
  const btn = container.querySelector('#create-tag-btn');
  if (btn) {
    btn.addEventListener('click', showCreateTagDialog);
  }
}

// ==============================
// 标签详情页
// ==============================

/**
 * 显示标签详情页
 * @param {string} tagName - 标签名称
 */
async function showTagDetail(tagName) {
  const detailContainer = document.getElementById('tag-detail-container');
  const homeContainer = document.getElementById('tags-home-container');
  const galleryContainer = document.getElementById('gallery-3d');

  if (!detailContainer) return;

  // 获取该标签的所有照片
  const photos = await getPhotosByTag(tagName);

  // 按拍摄时间升序排列
  photos.sort((a, b) => new Date(a.date) - new Date(b.date));

  // 隐藏其他容器
  if (homeContainer) homeContainer.style.display = 'none';
  if (galleryContainer) galleryContainer.style.display = 'none';

  // 显示详情容器
  detailContainer.style.display = 'block';

  // 渲染详情页头部
  detailContainer.innerHTML = `
    <div class="tag-detail-header">
      <button class="tag-detail-back" id="tag-detail-back">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        返回
      </button>
      <h2 class="tag-detail-title">${tagName}</h2>
      <span class="tag-detail-count">${photos.length} 张照片</span>
    </div>
    <div class="tag-detail-photos" id="tag-detail-photos"></div>
  `;

  // 渲染照片网格
  const photosContainer = detailContainer.querySelector('#tag-detail-photos');
  if (photos.length === 0) {
    photosContainer.innerHTML = `
      <div class="tag-detail-empty">
        <p>该标签下暂无照片</p>
        <p class="tag-detail-empty-hint">在照片页面右键/长按照片添加到此标签</p>
      </div>
    `;
  } else {
    photosContainer.innerHTML = photos.map(photo => `
      <div class="photo-card" data-id="${photo.id}" data-filename="${photo.filename}" data-date="${photo.date}">
        <img src="${URL.createObjectURL(photo.file)}" alt="${photo.filename}" loading="lazy">
        <div class="photo-card-overlay">
          <span class="photo-card-date">${photo.date}</span>
        </div>
      </div>
    `).join('');

    // 绑定照片点击事件（显示详情）
    photosContainer.querySelectorAll('.photo-card').forEach(card => {
      card.addEventListener('click', () => {
        const photoId = parseInt(card.dataset.id);
        const photo = photos.find(p => p.id === photoId);
        if (photo && window.showPhotoDetail) {
          window.showPhotoDetail(photo);
        }
      });
    });

    // 绑定右键/长按事件（打标签）
    bindTagSelectorEvents(photosContainer, photos);
  }

  // 绑定返回按钮
  const backBtn = detailContainer.querySelector('#tag-detail-back');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      detailContainer.style.display = 'none';
      if (homeContainer) homeContainer.style.display = 'block';
    });
  }
}

// ==============================
// 标签选择器（右键/长按）
// ==============================

/**
 * 绑定标签选择器事件
 * @param {HTMLElement} container - 容器元素
 * @param {Array} photos - 照片数据数组
 */
function bindTagSelectorEvents(container, photos) {
  let longPressTimer = null;
  let isLongPress = false;
  const LONG_PRESS_DURATION = 500; // 长按触发时间（毫秒）

  container.querySelectorAll('.photo-card').forEach(card => {
    // 右键菜单
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const filename = card.dataset.filename;
      const date = card.dataset.date;
      showTagSelector(filename, date, card, e.clientX, e.clientY);
    });

    // 长按（触摸设备）
    card.addEventListener('touchstart', (e) => {
      isLongPress = false;
      longPressTimer = setTimeout(() => {
        isLongPress = true;
        const filename = card.dataset.filename;
        const date = card.dataset.date;
        const touch = e.touches[0];
        showTagSelector(filename, date, card, touch.clientX, touch.clientY);
      }, LONG_PRESS_DURATION);
    }, { passive: true });

    card.addEventListener('touchend', () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    });

    card.addEventListener('touchmove', () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    });

    // 鼠标长按
    card.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return; // 仅左键
      isLongPress = false;
      longPressTimer = setTimeout(() => {
        isLongPress = true;
        const filename = card.dataset.filename;
        const date = card.dataset.date;
        showTagSelector(filename, date, card, e.clientX, e.clientY);
      }, LONG_PRESS_DURATION);
    });

    card.addEventListener('mouseup', () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    });

    card.addEventListener('mouseleave', () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    });
  });
}

/**
 * 显示标签选择器
 * @param {string} filename - 照片文件名
 * @param {string} date - 照片日期
 * @param {HTMLElement} photoElement - 照片元素
 * @param {number} x - 触发位置X
 * @param {number} y - 触发位置Y
 */
async function showTagSelector(filename, date, photoElement, x, y) {
  // 关闭已有的选择器
  hideTagSelector();

  currentPhotoFilename = filename;
  currentPhotoDate = date;
  currentPhotoElement = photoElement;

  // 获取最近使用的标签和所有标签
  const recentTags = await getRecentTags(5);
  const allTags = await getAllTags();

  // 合并：最近使用排在前面
  const recentTagNames = new Set(recentTags.map(t => t.name));
  const sortedTags = [
    ...recentTags,
    ...allTags.filter(t => !recentTagNames.has(t.name))
  ];

  // 获取照片已有的标签
  const photoTags = photoElement.dataset.tags ? JSON.parse(photoElement.dataset.tags) : [];

  // 创建选择器元素
  selectorElement = document.createElement('div');
  selectorElement.className = 'tag-selector';
  selectorElement.style.left = `${Math.min(x, window.innerWidth - 200)}px`;
  selectorElement.style.top = `${Math.min(y, window.innerHeight - 300)}px`;

  selectorElement.innerHTML = `
    <div class="tag-selector-header">
      <span>添加到标签</span>
      <button class="tag-selector-close">×</button>
    </div>
    <div class="tag-selector-content">
      <div class="tag-selector-section">
        <div class="tag-selector-tags">
          ${sortedTags.map(tag => renderTagSelectorItem(tag, photoTags.includes(tag.name))).join('')}
        </div>
      </div>

      <div class="tag-selector-new">
        <button class="tag-selector-new-btn" id="tag-selector-new-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          新建标签
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(selectorElement);
  tagSelectorVisible = true;

  // 绑定事件
  selectorElement.querySelector('.tag-selector-close').addEventListener('click', hideTagSelector);

  // 点击标签
  selectorElement.querySelectorAll('.tag-selector-item').forEach(item => {
    item.addEventListener('click', async () => {
      try {
        const tagName = item.dataset.tag;
        const isSelected = item.classList.contains('selected');

        if (isSelected) {
          await removeTagFromPhotoByFile(filename, date, tagName);
          item.classList.remove('selected');
        } else {
          await addTagToPhotoByFile(filename, date, tagName);
          item.classList.add('selected');
          showTagSuccessFeedback(item);
        }

        // 显示 Toast 提示
        const toast = document.createElement('div');
        toast.className = 'tag-toast';
        toast.textContent = isSelected ? '✅ 已移除标签「' + tagName + '」' : '✅ 已添加标签「' + tagName + '」';
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 1200);

        // 同步更新内存中的 tags
        if (window.__syncPhotoTag) {
          window.__syncPhotoTag(filename, date, tagName, !isSelected);
        }

        // 更新照片元素的标签数据
        updatePhotoElementTags(photoElement, tagName, !isSelected);
      } catch(err) {
        console.error('[Tags] 标签操作失败:', err);
      }
    });
  });

  // 新建标签按钮
  selectorElement.querySelector('#tag-selector-new-btn').addEventListener('click', () => {
    hideTagSelector();
    showCreateTagDialog(filename, date);
  });

  // 点击外部关闭
  setTimeout(() => {
    document.addEventListener('click', handleOutsideClick);
  }, 0);
}

function renderTagSelectorItem(tag, isSelected) {
  const isSystem = tag.type === 'system';
  return `
    <div class="tag-selector-item ${isSelected ? 'selected' : ''}" data-tag="${tag.name}" data-type="${tag.type}">
      <span class="tag-selector-item-icon">${isSystem ? '📅' : '🏷️'}</span>
      <span class="tag-selector-item-name">${tag.name}</span>
      ${isSelected ? '<span class="tag-selector-item-check">✓</span>' : ''}
    </div>
  `;
}

function updatePhotoElementTags(photoElement, tagName, isAdded) {
  let tags = photoElement.dataset.tags ? JSON.parse(photoElement.dataset.tags) : [];
  if (isAdded) {
    if (!tags.includes(tagName)) tags.push(tagName);
  } else {
    tags = tags.filter(t => t !== tagName);
  }
  photoElement.dataset.tags = JSON.stringify(tags);
}

function showTagSuccessFeedback(element) {
  const check = document.createElement('span');
  check.className = 'tag-success-check';
  check.textContent = '✓';
  check.style.cssText = `
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 24px;
    color: #4CAF50;
    animation: tagSuccessPop 0.3s ease;
    pointer-events: none;
  `;
  element.appendChild(check);
  setTimeout(() => check.remove(), 1000);
}

function hideTagSelector() {
  if (selectorElement) {
    selectorElement.remove();
    selectorElement = null;
  }
  tagSelectorVisible = false;
  currentPhotoFilename = null;
  currentPhotoDate = null;
  currentPhotoElement = null;
  document.removeEventListener('click', handleOutsideClick);
}

function handleOutsideClick(e) {
  if (selectorElement && !selectorElement.contains(e.target)) {
    hideTagSelector();
  }
}

// ==============================
// 新建标签对话框
// ==============================

function showCreateTagDialog(filename = null, date = null) {
  // 创建对话框
  const dialog = document.createElement('div');
  dialog.className = 'tag-dialog-overlay';
  dialog.innerHTML = `
    <div class="tag-dialog">
      <h3>新建标签</h3>
      <input type="text" id="new-tag-input" placeholder="输入标签名称" maxlength="20">
      <div class="tag-dialog-buttons">
        <button class="tag-dialog-btn tag-dialog-cancel">取消</button>
        <button class="tag-dialog-btn tag-dialog-confirm">确定</button>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);

  const input = dialog.querySelector('#new-tag-input');
  const cancelBtn = dialog.querySelector('.tag-dialog-cancel');
  const confirmBtn = dialog.querySelector('.tag-dialog-confirm');

  input.focus();

  // 取消
  cancelBtn.addEventListener('click', () => {
    dialog.remove();
  });

  // 确定
  const handleConfirm = async () => {
    const name = input.value.trim();
    if (!name) {
      input.style.borderColor = '#ff4444';
      return;
    }

    try {
      const success = await createTag(name, 'custom');
      if (success) {
        // 如果指定了照片，自动添加标签
        if (filename && date) {
          await addTagToPhotoByFile(filename, date, name);
          // 同步更新内存
          if (window.__syncPhotoTag) {
            window.__syncPhotoTag(filename, date, name, true);
          }
        }

        // 显示成功提示
        const toast = document.createElement('div');
        toast.className = 'tag-toast';
        toast.textContent = `✅ 标签「${name}」创建成功`;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 1500);

        dialog.remove();

        // 刷新标签主页（如果可见）
        const homeContainer = document.getElementById('tags-home-container');
        if (homeContainer && homeContainer.style.display !== 'none') {
          await renderTagsHome(homeContainer);
        }
      } else {
        input.style.borderColor = '#ff4444';
        input.placeholder = '标签已存在或名称无效';
        input.value = '';
      }
    } catch (e) {
      console.warn('[Tags] 创建标签失败:', e);
      dialog.remove();
    }
  };

  confirmBtn.addEventListener('click', handleConfirm);
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleConfirm();
  });

  // 点击背景关闭
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.remove();
  });
}

// ==============================
// 照片详情页标签管理
// ==============================

/**
 * 渲染照片详情页的标签区域
 * @param {HTMLElement} container - 容器元素
 * @param {Object} photo - 照片数据
 * @param {Function} onUpdate - 更新回调
 */
export async function renderPhotoDetailTags(container, photo, onUpdate) {
  if (!container || !photo) return;

  const tags = photo.tags || [];
  const allTags = await getAllTags();

  container.innerHTML = `
    <div class="detail-tags-section">
      <div class="detail-tags-header">
        <span>标签</span>
        <button class="detail-tags-add" id="detail-tags-add">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          添加
        </button>
      </div>
      <div class="detail-tags-list">
        ${tags.length > 0 ? tags.map(tag => `
          <span class="detail-tag" data-tag="${tag}">
            ${tag}
            <button class="detail-tag-remove" data-tag="${tag}">×</button>
          </span>
        `).join('') : '<span class="detail-tags-empty">暂无标签</span>'}
      </div>
    </div>
  `;

  // 添加标签按钮
  const addBtn = container.querySelector('#detail-tags-add');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      showTagSelectorForDetail(photo, container, onUpdate);
    });
  }

  // 移除标签按钮
  container.querySelectorAll('.detail-tag-remove').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const tagName = btn.dataset.tag;
      await removeTagFromPhotoByFile(photo.filename, photo.date, tagName);
      // 同步更新内存
      if (window.__syncPhotoTag) {
        window.__syncPhotoTag(photo.filename, photo.date, tagName, false);
      }
      if (onUpdate) onUpdate();
    });
  });
}

async function showTagSelectorForDetail(photo, container, onUpdate) {
  const recentTags = await getRecentTags(5);
  const allTags = await getAllTags();
  const photoTags = photo.tags || [];

  // 合并：最近使用排在前面，并过滤掉照片已有标签
  const recentTagNames = new Set(recentTags.map(t => t.name));
  const sortedTags = [
    ...recentTags,
    ...allTags.filter(t => !recentTagNames.has(t.name))
  ].filter(t => !photoTags.includes(t.name));

  // 创建下拉选择器
  const selector = document.createElement('div');
  selector.className = 'detail-tag-selector';
  selector.innerHTML = `
    <div class="detail-tag-selector-content">
      <div class="detail-tag-selector-section">
        ${sortedTags.map(tag => `
          <div class="detail-tag-selector-item" data-tag="${tag.name}">
            ${tag.type === 'system' ? '📅' : '🏷️'} ${tag.name}
          </div>
        `).join('')}
      </div>
      <div class="detail-tag-selector-new" id="detail-tag-selector-new">
        + 新建标签
      </div>
    </div>
  `;

  container.appendChild(selector);

  // 点击标签
  selector.querySelectorAll('.detail-tag-selector-item').forEach(item => {
    item.addEventListener('click', async () => {
      const tagName = item.dataset.tag;
      await addTagToPhotoByFile(photo.filename, photo.date, tagName);
      // 同步更新内存
      if (window.__syncPhotoTag) {
        window.__syncPhotoTag(photo.filename, photo.date, tagName, true);
      }
      selector.remove();
      if (onUpdate) onUpdate();
    });
  });

  // 新建标签
  selector.querySelector('#detail-tag-selector-new').addEventListener('click', () => {
    selector.remove();
    showCreateTagDialog(photo.filename, photo.date);
    // 延迟刷新
    setTimeout(() => {
      if (onUpdate) onUpdate();
    }, 500);
  });

  // 点击外部关闭
  setTimeout(() => {
    const closeHandler = (e) => {
      if (!selector.contains(e.target)) {
        selector.remove();
        document.removeEventListener('click', closeHandler);
      }
    };
    document.addEventListener('click', closeHandler);
  }, 0);
}

// ==============================
// 导出初始化函数
// ==============================

/**
 * 初始化标签管理模块
 * @param {Object} options - 配置选项
 */
export function initTagManager(options = {}) {
  // 全局暴露一些函数供其他模块使用
  window.showTagSelector = showTagSelector;
  window.renderTagsHome = renderTagsHome;
  window.generateMonthTag = generateMonthTag;
}

/**
 * 绑定主画廊视图（网格/轮播/环形）的卡片标签事件
 * 每次布局重建后调用
 */
export function bindGalleryTagEvents() {
  const gallery = document.getElementById('gallery-3d');
  if (!gallery) return;

  const cards = gallery.querySelectorAll('.grid-card, .carousel-card, .gallery-card');
  let longPressTimer = null;
  const LONG_PRESS_DURATION = 500;

  cards.forEach(card => {
    // 避免重复绑定
    if (card.dataset._tagBound) return;
    card.dataset._tagBound = '1';

    // 右键菜单
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      try {
        showTagSelector(card.dataset.filename, card.dataset.date, card, e.clientX, e.clientY);
      } catch(err) { console.error('[Tags] 右键打开失败:', err); }
    });

    // 长按（触摸设备）
    card.addEventListener('touchstart', (e) => {
      longPressTimer = setTimeout(() => {
        try {
          const touch = e.touches[0];
          showTagSelector(card.dataset.filename, card.dataset.date, card, touch.clientX, touch.clientY);
        } catch(err) { console.error('[Tags] 长按打开失败:', err); }
      }, LONG_PRESS_DURATION);
    }, { passive: true });

    card.addEventListener('touchend', () => { if (longPressTimer) clearTimeout(longPressTimer); });
    card.addEventListener('touchmove', () => { if (longPressTimer) clearTimeout(longPressTimer); });

    // 鼠标长按
    card.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      longPressTimer = setTimeout(() => {
        try {
          showTagSelector(card.dataset.filename, card.dataset.date, card, e.clientX, e.clientY);
        } catch(err) { console.error('[Tags] 长按打开失败:', err); }
      }, LONG_PRESS_DURATION);
    });

    card.addEventListener('mouseup', () => { if (longPressTimer) clearTimeout(longPressTimer); });
    card.addEventListener('mouseleave', () => { if (longPressTimer) clearTimeout(longPressTimer); });
  });
}
