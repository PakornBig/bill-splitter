export function formatMoney(amount, currency = "THB") {
  try {
    return new Intl.NumberFormat("th-TH", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(amount);
  } catch {
    return Number(amount).toFixed(2);
  }
}

export function formatDate(iso) {
  return new Date(iso).toLocaleDateString("th-TH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * แบ่งยอดเท่าๆ กัน โดยปัดเศษให้ลงตัวพอดีกับยอดรวม
 * (เศษสตางค์ที่เหลือจะถูกกระจายให้คนแรกๆ)
 * @param {number} total
 * @param {number} count
 * @returns {number[]}
 */
export function splitEqually(total, count) {
  if (count <= 0) return [];
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / count);
  let remainder = cents - base * count;
  const result = [];
  for (let i = 0; i < count; i++) {
    const extra = remainder > 0 ? 1 : 0;
    if (remainder > 0) remainder--;
    result.push((base + extra) / 100);
  }
  return result;
}
