// ฟังก์ชันคำนวณบิล ใช้ร่วมกันทั้งฝั่งหน้าเว็บ (preview) และฝั่ง server (บันทึกจริง)
// คำนวณเป็น "สตางค์" (จำนวนเต็ม) ทั้งหมด เพื่อเลี่ยงปัญหาทศนิยมของ JavaScript

export function toCents(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function fromCents(cents) {
  return cents / 100;
}

function toQty(value) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** ราคารวมของเมนู 1 รายการ (ราคาต่อหน่วย × จำนวน) เป็นสตางค์ */
export function itemCents(item) {
  return Math.max(0, toCents(item.price)) * toQty(item.qty);
}

/**
 * แบ่ง totalCents ตามสัดส่วน weights ให้รวมกันได้พอดี (largest remainder)
 * ถ้า weights เป็น 0 ทั้งหมดจะแบ่งเท่ากัน
 */
export function allocate(totalCents, weights) {
  const n = weights.length;
  if (n === 0) return [];
  let w = weights.map((x) => (x > 0 ? x : 0));
  let sumW = w.reduce((a, b) => a + b, 0);
  if (sumW === 0) {
    w = weights.map(() => 1);
    sumW = n;
  }
  const raw = w.map((x) => (totalCents * x) / sumW);
  const result = raw.map((r) => Math.floor(r));
  let rest = totalCents - result.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => [r - Math.floor(r), i])
    .sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; rest > 0; k = (k + 1) % n) {
    result[order[k][1]] += 1;
    rest -= 1;
  }
  return result;
}

/** ยอดส่วนลดของขั้นเดียว (สตางค์) หรือ 0 ถ้ายอดไม่ถึงเกณฑ์/ขั้นไม่ถูกต้อง */
export function tierDiscountCents(t, subtotalCents) {
  // ไม่กรอกยอดขั้นต่ำ = ไม่มีขั้นต่ำ
  const min = toCents(t?.minSpend);
  const value = Number(t?.value);
  if (!(value > 0) || min < 0 || min > subtotalCents) return 0;
  if (t.type !== "percent") return toCents(value);

  let cents = Math.round((subtotalCents * Math.min(value, 100)) / 100);
  // ไม่กรอกส่วนลดสูงสุด = ไม่จำกัด
  const cap = toCents(t.maxDiscount);
  if (cap > 0) cents = Math.min(cents, cap);
  return cents;
}

/**
 * เลือกขั้นส่วนลดที่ "ลดได้มากที่สุด" จากขั้นที่ยอดถึงเกณฑ์
 * tier = { minSpend?, type: "amount" | "percent", value, maxDiscount? }
 * - minSpend ว่าง/0 = ไม่มียอดขั้นต่ำ
 * - maxDiscount ใช้กับ percent เท่านั้น เช่น ลด 20% สูงสุด 100 บาท
 */
export function pickDiscount(tiers, subtotalCents) {
  let tierIndex = null;
  let best = 0;
  (tiers ?? []).forEach((t, i) => {
    const cents = tierDiscountCents(t, subtotalCents);
    if (cents > best) {
      best = cents;
      tierIndex = i;
    }
  });
  return { tierIndex, discountCents: Math.min(best, subtotalCents) };
}

/** สรุปยอดบิล: ค่าอาหาร − ส่วนลด + ค่าส่ง */
export function calcBill({ items, tiers, deliveryFee }) {
  const subtotalCents = (items ?? []).reduce((s, it) => s + itemCents(it), 0);
  const { tierIndex, discountCents } = pickDiscount(tiers, subtotalCents);
  const deliveryCents = Math.max(0, toCents(deliveryFee));
  return {
    subtotalCents,
    tierIndex,
    discountCents,
    deliveryCents,
    totalCents: subtotalCents - discountCents + deliveryCents,
  };
}

/**
 * คำนวณยอดที่แต่ละคนต้องจ่าย
 * - equal:   ยอดสุทธิหารเท่ากันทุกคน
 * - by_item: แต่ละเมนูหารเท่ากันในกลุ่มคนที่กินเมนูนั้น,
 *            ส่วนลดเฉลี่ยตามสัดส่วนค่าอาหารของแต่ละคน,
 *            ค่าส่งหารเท่ากันในกลุ่มคนที่มีค่าอาหาร
 * - custom:  ใช้ยอดที่กรอกเอง ต้องรวมได้เท่ายอดสุทธิ
 *
 * คืนค่า { details: { [personId]: { amount, food, discount, delivery } }, error }
 * (ทุกค่าเป็นสตางค์)
 */
export function computeShares({
  splitType,
  participants,
  items,
  discountCents,
  deliveryCents,
  totalCents,
  customAmounts,
}) {
  const details = {};
  const ids = participants ?? [];
  if (ids.length === 0) return { details, error: "กรุณาเลือกคนที่ร่วมหารอย่างน้อย 1 คน" };

  if (splitType === "equal") {
    allocate(totalCents, ids.map(() => 1)).forEach((c, i) => {
      details[ids[i]] = { amount: c, food: 0, discount: 0, delivery: 0 };
    });
    return { details, error: null };
  }

  if (splitType === "custom") {
    let sum = 0;
    for (const id of ids) {
      const c = Math.max(0, toCents(customAmounts?.[id]));
      sum += c;
      details[id] = { amount: c, food: 0, discount: 0, delivery: 0 };
    }
    const diff = totalCents - sum;
    return {
      details,
      error:
        diff === 0
          ? null
          : `ยอดที่กรอกรวม ${fromCents(sum).toFixed(2)} ไม่เท่ากับยอดสุทธิ ${fromCents(totalCents).toFixed(2)} (ต่างกัน ${fromCents(diff).toFixed(2)})`,
    };
  }

  // by_item
  const food = Object.fromEntries(ids.map((id) => [id, 0]));
  for (const it of items ?? []) {
    const cents = itemCents(it);
    if (cents === 0) continue;
    const eaters = (it.eaters ?? []).filter((id) => id in food);
    if (eaters.length === 0) {
      return {
        details,
        error: `เมนู "${it.name || "(ไม่มีชื่อ)"}" ยังไม่ได้เลือกว่าใครกิน`,
      };
    }
    allocate(cents, eaters.map(() => 1)).forEach((c, i) => {
      food[eaters[i]] += c;
    });
  }

  const discounts = allocate(discountCents, ids.map((id) => food[id]));
  const deliveryPayers = ids.filter((id) => food[id] > 0);
  const payers = deliveryPayers.length > 0 ? deliveryPayers : ids;
  const deliveries = allocate(deliveryCents, payers.map(() => 1));
  const deliveryOf = Object.fromEntries(payers.map((id, i) => [id, deliveries[i]]));

  ids.forEach((id, i) => {
    const d = deliveryOf[id] ?? 0;
    details[id] = {
      food: food[id],
      discount: discounts[i],
      delivery: d,
      amount: food[id] - discounts[i] + d,
    };
  });
  return { details, error: null };
}
