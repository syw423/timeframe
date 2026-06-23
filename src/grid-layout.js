/**
 * 计算网格布局的参数
 * @param {number} total - 照片总数
 * @param {number} viewportWidth - 视口宽度（px）
 * @param {number} viewportHeight - 视口高度（px）
 * @param {object} options
 * @param {number} [options.gap=16] - 卡片间距
 * @param {number} [options.padding=40] - 容器内边距
 * @param {number} [options.maxCardWidth=280] - 卡片最大宽度
 * @param {number} [options.minCardWidth=180] - 卡片最小宽度
 * @param {number} [options.cardAspect=3/4] - 卡片高宽比
 * @returns {{ cols: number, rows: number, cardWidth: number, cardHeight: number, totalWidth: number, totalHeight: number }}
 */
export function calculateGridLayout(total, viewportWidth, viewportHeight, options = {}) {
  const { gap = 16, padding = 40, maxCardWidth = 280, minCardWidth = 180, cardAspect = 3 / 4 } = options;

  if (total === 0) {
    return { cols: 0, rows: 0, cardWidth: 0, cardHeight: 0, totalWidth: 0, totalHeight: 0 };
  }

  const availWidth = viewportWidth - padding * 2;
  const availHeight = viewportHeight - padding * 2;

  // 初始估算卡片宽度（不超过 max，不低于 min）
  let cardWidth = Math.min(maxCardWidth, Math.max(minCardWidth, Math.round(availWidth * 0.25)));
  let cardHeight = Math.round(cardWidth * cardAspect);

  // 计算列数：在可用宽度内能放多少列
  let cols = Math.max(1, Math.floor((availWidth + gap) / (cardWidth + gap)));
  // 1-2 张时限制列数不超过总数，避免空列
  if (total < 4) cols = Math.min(cols, total);
  // 如果列数太少，尝试缩小卡片以增加列数
  if (cols < 3 && total > 3) {
    cardWidth = Math.max(minCardWidth, Math.round((availWidth - (3 - 1) * gap) / 3));
    cardHeight = Math.round(cardWidth * cardAspect);
    cols = Math.max(1, Math.floor((availWidth + gap) / (cardWidth + gap)));
  }
  let rows = Math.ceil(total / cols);

  // 检查高度是否超过可用高度，如果超过则缩小卡片
  let neededHeight = rows * (cardHeight + gap) - gap;
  if (neededHeight > availHeight && rows > 1) {
    const maxCardH = Math.round((availHeight - (rows - 1) * gap) / rows);
    cardHeight = Math.min(cardHeight, maxCardH);
    cardWidth = Math.round(cardHeight / cardAspect);

    // 如果缩小后宽度低于最小宽度，重新计算
    if (cardWidth < minCardWidth) {
      cardWidth = minCardWidth;
      cardHeight = Math.round(cardWidth * cardAspect);
      cols = Math.max(1, Math.floor((availWidth + gap) / (cardWidth + gap)));
      rows = Math.ceil(total / cols);
    }
  }

  const totalWidth = cols * (cardWidth + gap) - gap;
  const totalHeight = rows * (cardHeight + gap) - gap;

  return { cols, rows, cardWidth, cardHeight, totalWidth, totalHeight };
}
