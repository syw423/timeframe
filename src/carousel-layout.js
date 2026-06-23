/**
 * 计算轮播布局参数
 * @param {number} total - 照片总数
 * @param {number} viewportWidth - 视口宽度
 * @param {number} viewportHeight - 视口高度
 * @param {object} options
 * @param {number} [options.gap=16] - 卡片间距
 * @param {number} [options.padding=40] - 两侧内边距
 * @param {number} [options.maxCardWidth=320] - 卡片最大宽度
 * @param {number} [options.minCardWidth=120] - 卡片最小宽度
 * @param {number} [options.cardAspect=0.75] - 卡片高宽比
 * @param {number} [options.maxCardHeight=420] - 卡片最大高度
 * @returns {{ cardWidth: number, cardHeight: number, totalWidth: number, visibleCount: number, gap: number, padding: number }}
 */
export function calculateCarouselLayout(total, viewportWidth, viewportHeight, options = {}) {
  const { gap = 16, padding = 40, maxCardWidth = 320, minCardWidth = 120, cardAspect = 0.75, maxCardHeight = 420 } = options;

  if (total === 0) {
    return { cardWidth: 0, cardHeight: 0, totalWidth: 0, visibleCount: 0, gap: 0, padding: 0 };
  }

  const availWidth = viewportWidth - padding * 2;
  const availHeight = viewportHeight - padding * 2;

  // 卡片宽度：在视口宽度占比20%-30%，受 min/max 约束
  let cardWidth = Math.round(Math.min(maxCardWidth, Math.max(minCardWidth, availWidth * 0.25)));
  let cardHeight = Math.round(Math.min(cardWidth * cardAspect, maxCardHeight));

  // 如果高度超出可用高度，按高度约束重新计算宽度
  if (cardHeight > availHeight) {
    cardHeight = availHeight;
    cardWidth = Math.round(Math.min(maxCardWidth, Math.max(minCardWidth, cardHeight / cardAspect)));
  }

  // 可见卡片数 = 能完整放入视口的卡片数（不超过总数）
  const visibleCount = Math.min(total, Math.max(1, Math.floor((availWidth + gap) / (cardWidth + gap))));

  // 总宽度 = total * cardWidth + (total + 1) * gap
  const totalWidth = total * (cardWidth + gap) + gap;

  return { cardWidth, cardHeight, totalWidth, visibleCount, gap, padding };
}
