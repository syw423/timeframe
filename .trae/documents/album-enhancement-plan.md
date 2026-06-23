# 相册优化方案

## 决策汇总

| 问题 | 决定 |
|------|------|
| 导入方式 | 文件夹导入 + 单张导入 均支持 |
| 管理功能 | 导入 + 查看 + 删除 |
| 非 JPG 日期 | 用 `lastModified`（文件修改时间） |
| 备注编辑 | contenteditable 就地编辑，保存到 IndexedDB |

---

## Step 1: 备注现场编辑

**目标**：详情面板中备注可编辑，保存到 IndexedDB。

改动文件：
- `index.html` — 无变化（已有 `#detail-note`）
- `script.js` — `showPhotoDetail()` 中让 note 区域变成 `contenteditable`，添加 blur/保存逻辑更新 IndexedDB
- `src/db.js` — 添加 `updateNote(date, filename, newNote)` 方法

**流程**：
1. 双击照片 → 详情面板打开
2. 备注区域改成可编辑（`contenteditable`）
3. 用户编辑后点击外部或按 Ctrl+S 保存
4. 保存到 IndexedDB 更新对应记录的 note 字段
5. 同时更新内存中的 `allPhotoData` 和 `daysMap`

---

## Step 2: 日期优先级调整

**目标**：改为 EXIF → lastModified → 当前日期（去掉文件夹名作为日期回退，适配相册模型）。

改动文件：
- `script.js` — 修改 `selectDate()` 遍历文件时的日期确定逻辑

**新优先级**：
| 优先级 | 来源 | 条件 |
|--------|------|------|
| 1 | **EXIF DateTimeOriginal** | JPG/JPEG 文件 |
| 2 | **file.lastModified** | 所有文件（优先于文件夹名） |
| 3 | **当前日期** | 以上均失败时兜底 |

---

## Step 3: 相册架构 + 导入 + 删除

**目标**：从「选择文件夹浏览」改为「相册管理」模式。

### 3.1 欢迎界面调整
- 去掉多余卡片和提示
- 只保留一个「导入照片」按钮
- 点击后弹出选项：选择文件夹 / 选择单张照片

### 3.2 导入功能
- **文件夹导入**：保留 webkitdirectory，一次性导入全部照片
- **单张导入**：用普通 `<input type="file" multiple>` 选择一张或多张照片
- 导入后自动确定日期（按 Step 2 优先级）
- 存入 IndexedDB
- 支持多次增量导入

### 3.3 删除功能
- 在日历中右键或长按某日期 → 删除当天全部照片
- 或者在详情面板中添加删除按钮
- 从 IndexedDB 中删除记录，同时更新内存数据

### 3.4 数据存储
- IndexedDB 作为唯一持久化存储
- 源文件导入后可安全删除
- 添加「导出/下载」功能（可选，后续考虑）

### 改动文件
- `index.html` — 调整欢迎界面结构
- `style.css` — 调整欢迎界面样式
- `script.js` — 大幅修改：添加删除功能、多种导入方式
- `src/db.js` — 添加 `deleteByDate()`, `deleteByFilename()`, `addPhoto()` 等

---

## 验证步骤
1. 导入文件夹 → 确认照片正常显示、日期正确
2. 编辑备注 → 确认保存后刷新不丢失
3. 删除照片 → 确认从 IndexedDB 中移除
4. 单张导入 → 确认可以单独添加照片
5. 多次导入 → 确认增量添加不覆盖
6. 重置 → 确认清空所有数据回到欢迎界面
