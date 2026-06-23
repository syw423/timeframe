const DB_NAME = 'TimeFrame';
const STORE_NAME = 'photos';
const TAGS_STORE_NAME = 'tags';
const DB_VERSION = 2; // 升级到版本2以支持标签功能

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      const oldVersion = e.oldVersion;

      // 创建/升级 photos 仓库
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const photoStore = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        photoStore.createIndex('date', 'date', { unique: false });
        photoStore.createIndex('filename', 'filename', { unique: false });
      } else if (oldVersion < 2) {
        // 升级现有仓库，添加 tags 字段支持
        const photoStore = req.transaction.objectStore(STORE_NAME);
        if (!photoStore.indexNames.contains('date')) {
          photoStore.createIndex('date', 'date', { unique: false });
        }
      }

      // 创建 tags 仓库
      if (!db.objectStoreNames.contains(TAGS_STORE_NAME)) {
        const tagsStore = db.createObjectStore(TAGS_STORE_NAME, { keyPath: 'name' });
        tagsStore.createIndex('type', 'type', { unique: false });
        tagsStore.createIndex('lastUsed', 'lastUsed', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * 将照片数据保存到 IndexedDB
 * @param {Array<{ file: File|Blob, date: string, note: string, tags?: string[] }>} photoData
 */
export async function saveToIndexedDB(photoData) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME, TAGS_STORE_NAME], 'readwrite');
    const photoStore = tx.objectStore(STORE_NAME);
    const tagsStore = tx.objectStore(TAGS_STORE_NAME);

    for (const item of photoData) {
      // 确保 tags 字段存在
      const tags = item.tags || [];

      photoStore.add({
        filename: item.file.name,
        date: item.date,
        note: item.note,
        blob: item.file,
        tags: tags,
        savedAt: Date.now(),
      });

      // 更新标签使用记录
      for (const tagName of tags) {
        const getReq = tagsStore.get(tagName);
        getReq.onsuccess = () => {
          const existing = getReq.result;
          if (existing) {
            tagsStore.put({
              ...existing,
              count: (existing.count || 0) + 1,
              lastUsed: Date.now(),
            });
          }
        };
      }
    }

    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/**
 * 从 IndexedDB 加载所有照片数据
 * @returns {Promise<Array<{ file: Blob, date: string, note: string, filename: string, tags: string[] }>>}
 */
export async function loadFromIndexedDB() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();

    req.onsuccess = () => {
      const records = req.result || [];
      db.close();
      resolve(records.map(r => ({
        id: r.id,
        file: r.blob,
        date: r.date,
        note: r.note,
        filename: r.filename,
        tags: r.tags || [],
      })));
    };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

/**
 * 清空 IndexedDB
 */
export async function clearIndexedDB() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME, TAGS_STORE_NAME], 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    tx.objectStore(TAGS_STORE_NAME).clear();
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/**
 * 检查 IndexedDB 是否有数据
 * @returns {Promise<boolean>}
 */
export async function hasData() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.count();

    req.onsuccess = () => { db.close(); resolve(req.result > 0); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

/**
 * 更新某张照片的备注
 * @param {string} filename
 * @param {string} date
 * @param {string} newNote
 */
export async function updateNote(filename, date, newNote) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.openCursor();

    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        const record = cursor.value;
        if (record.filename === filename && record.date === date) {
          cursor.update({ ...record, note: newNote });
        }
        cursor.continue();
      }
    };

    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/**
 * 删除指定日期的所有照片
 * @param {string} date
 */
export async function deleteByDate(date) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.openCursor();

    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        if (cursor.value.date === date) {
          cursor.delete();
        }
        cursor.continue();
      }
    };

    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/**
 * 删除指定照片（按文件名和日期）
 * @param {string} filename
 * @param {string} date
 */
export async function deleteByFilename(filename, date) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME, TAGS_STORE_NAME], 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const tagsStore = tx.objectStore(TAGS_STORE_NAME);
    const req = store.openCursor();

    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        const record = cursor.value;
        if (record.filename === filename && record.date === date) {
          // 减少标签计数
          const tags = record.tags || [];
          for (const tagName of tags) {
            const getReq = tagsStore.get(tagName);
            getReq.onsuccess = () => {
              const existing = getReq.result;
              if (existing && existing.count > 0) {
                tagsStore.put({
                  ...existing,
                  count: existing.count - 1,
                });
              }
            };
          }
          cursor.delete();
        }
        cursor.continue();
      }
    };

    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

// ==============================
// 标签相关操作
// ==============================

/**
 * 创建新标签
 * @param {string} name - 标签名称
 * @param {string} type - 'custom' | 'system'
 * @returns {Promise<boolean>} - 是否创建成功
 */
export async function createTag(name, type = 'custom') {
  if (!name || name.trim() === '') return false;

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TAGS_STORE_NAME, 'readwrite');
    const store = tx.objectStore(TAGS_STORE_NAME);

    // 先检查标签是否已存在
    const getReq = store.get(name.trim());
    getReq.onsuccess = () => {
      const existing = getReq.result;
      if (existing) {
        // 标签已存在，不覆盖
        db.close();
        resolve(true);
      } else {
        // 创建新标签
        const tagData = {
          name: name.trim(),
          type: type,
          createdAt: Date.now(),
          lastUsed: Date.now(),
          count: 0,
        };
        const putReq = store.put(tagData);
        putReq.onsuccess = () => { db.close(); resolve(true); };
        putReq.onerror = () => { db.close(); resolve(false); };
      }
    };
    getReq.onerror = () => { db.close(); resolve(false); };
  });
}

/**
 * 获取所有标签
 * @returns {Promise<Array<{ name: string, type: string, count: number, lastUsed: number }>>}
 */
export async function getAllTags() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TAGS_STORE_NAME, 'readonly');
    const store = tx.objectStore(TAGS_STORE_NAME);
    const req = store.getAll();

    req.onsuccess = () => {
      db.close();
      resolve(req.result || []);
    };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

/**
 * 获取最近使用的标签
 * @param {number} limit - 返回数量限制
 * @returns {Promise<Array<{ name: string, type: string, count: number }>>}
 */
export async function getRecentTags(limit = 5) {
  const tags = await getAllTags();
  return tags
    .filter(t => t.count > 0 || t.type === 'system')
    .sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0))
    .slice(0, limit);
}

/**
 * 为照片添加标签（按文件名和日期查找）
 * @param {string} filename - 照片文件名
 * @param {string} date - 照片日期
 * @param {string} tagName - 标签名称
 */
export async function addTagToPhotoByFile(filename, date, tagName) {
  if (!tagName || tagName.trim() === '') return false;

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME, TAGS_STORE_NAME], 'readwrite');
    const photoStore = tx.objectStore(STORE_NAME);
    const tagsStore = tx.objectStore(TAGS_STORE_NAME);

    // 用游标查找匹配的照片
    const cursorReq = photoStore.openCursor();
    cursorReq.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        const record = cursor.value;
        if (record.filename === filename && record.date === date) {
          // 找到匹配的照片
          const tags = record.tags || [];
          if (!tags.includes(tagName)) {
            tags.push(tagName);
            cursor.update({ ...record, tags });

            // 更新标签使用记录
            const tagGetReq = tagsStore.get(tagName);
            tagGetReq.onsuccess = () => {
              const existing = tagGetReq.result;
              if (existing) {
                tagsStore.put({
                  ...existing,
                  count: (existing.count || 0) + 1,
                  lastUsed: Date.now(),
                });
              } else {
                tagsStore.put({
                  name: tagName,
                  type: 'custom',
                  createdAt: Date.now(),
                  lastUsed: Date.now(),
                  count: 1,
                });
              }
            };
          }
        }
        cursor.continue();
      }
    };

    tx.oncomplete = () => { db.close(); resolve(true); };
    tx.onerror = () => { db.close(); resolve(false); };
  });
}

/**
 * 从照片移除标签（按文件名和日期查找）
 * @param {string} filename - 照片文件名
 * @param {string} date - 照片日期
 * @param {string} tagName - 标签名称
 */
export async function removeTagFromPhotoByFile(filename, date, tagName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME, TAGS_STORE_NAME], 'readwrite');
    const photoStore = tx.objectStore(STORE_NAME);
    const tagsStore = tx.objectStore(TAGS_STORE_NAME);

    const cursorReq = photoStore.openCursor();
    cursorReq.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        const record = cursor.value;
        if (record.filename === filename && record.date === date) {
          const tags = record.tags || [];
          const idx = tags.indexOf(tagName);
          if (idx > -1) {
            tags.splice(idx, 1);
            cursor.update({ ...record, tags });

            // 减少标签计数
            const tagGetReq = tagsStore.get(tagName);
            tagGetReq.onsuccess = () => {
              const existing = tagGetReq.result;
              if (existing && existing.count > 0) {
                tagsStore.put({
                  ...existing,
                  count: existing.count - 1,
                });
              }
            };
          }
        }
        cursor.continue();
      }
    };

    tx.oncomplete = () => { db.close(); resolve(true); };
    tx.onerror = () => { db.close(); resolve(false); };
  });
}

/**
 * 获取指定标签的所有照片
 * @param {string} tagName - 标签名称
 * @returns {Promise<Array>}
 */
export async function getPhotosByTag(tagName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const results = [];
    const cursorReq = store.openCursor();
    cursorReq.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        const photo = cursor.value;
        if (photo.tags && photo.tags.includes(tagName)) {
          results.push({
            id: photo.id,
            file: photo.blob,
            date: photo.date,
            note: photo.note,
            filename: photo.filename,
            tags: photo.tags || [],
          });
        }
        cursor.continue();
      } else {
        db.close();
        resolve(results);
      }
    };
    cursorReq.onerror = () => { db.close(); reject(cursorReq.error); };
  });
}

/**
 * 删除标签（仅自定义标签可删除）
 * @param {string} tagName - 标签名称
 */
export async function deleteTag(tagName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([TAGS_STORE_NAME, STORE_NAME], 'readwrite');
    const tagsStore = tx.objectStore(TAGS_STORE_NAME);
    const photoStore = tx.objectStore(STORE_NAME);

    // 获取标签信息
    const getReq = tagsStore.get(tagName);
    getReq.onsuccess = () => {
      const tag = getReq.result;
      if (!tag || tag.type === 'system') {
        db.close();
        resolve(false);
        return;
      }

      // 删除标签
      tagsStore.delete(tagName);

      // 从所有照片中移除该标签
      const cursorReq = photoStore.openCursor();
      cursorReq.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          const photo = cursor.value;
          if (photo.tags && photo.tags.includes(tagName)) {
            const newTags = photo.tags.filter(t => t !== tagName);
            cursor.update({ ...photo, tags: newTags });
          }
          cursor.continue();
        }
      };
    };

    tx.oncomplete = () => { db.close(); resolve(true); };
    tx.onerror = () => { db.close(); resolve(false); };
  });
}

/**
 * 生成系统月份标签
 * @param {string} dateStr - 日期字符串 (YYYY-MM-DD)
 * @returns {string} - 标签名称 (如 "2026年6月")
 */
export function generateMonthTag(dateStr) {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return null;
  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

/**
 * 修复标签计数（重新统计每个标签的照片数量）
 */
export async function repairTagCounts() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME, TAGS_STORE_NAME], 'readwrite');
    const photoStore = tx.objectStore(STORE_NAME);
    const tagsStore = tx.objectStore(TAGS_STORE_NAME);

    // 统计每个标签的照片数量
    const tagCounts = {};

    const cursorReq = photoStore.openCursor();
    cursorReq.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        const photo = cursor.value;
        if (photo.tags && photo.tags.length > 0) {
          for (const tag of photo.tags) {
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
          }
        }
        cursor.continue();
      } else {
        // 遍历完成，更新所有标签的 count
        const tagsReq = tagsStore.getAll();
        tagsReq.onsuccess = () => {
          const allTags = tagsReq.result || [];
          for (const tag of allTags) {
            const correctCount = tagCounts[tag.name] || 0;
            if (tag.count !== correctCount) {
              tagsStore.put({
                ...tag,
                count: correctCount,
              });
            }
          }
        };
      }
    };

    tx.oncomplete = () => {
      db.close();
      console.log('[DB] 标签计数已修复:', tagCounts);
      resolve(true);
    };
    tx.onerror = () => { db.close(); resolve(false); };
  });
}
