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

/** ขั้นนี้ใช้ได้กับค่าอาหารนี้หรือไม่ (ไม่กรอกยอดขั้นต่ำ = ไม่มีขั้นต่ำ) */
function tierReached(t, subtotalCents) {
  const min = toCents(t?.minSpend);
  return Number(t?.value) > 0 && min >= 0 && min <= subtotalCents;
}

/**
 * ยอดส่วนลดของขั้นเดียว (สตางค์) คิดจาก baseCents
 * percent คิดจาก baseCents และไม่เกิน maxDiscount (ไม่กรอก = ไม่จำกัด)
 */
export function tierDiscountCents(t, baseCents) {
  const value = Number(t?.value);
  if (!(value > 0) || !(baseCents > 0)) return 0;
  let cents =
    t.type === "percent"
      ? Math.round((baseCents * Math.min(value, 100)) / 100)
      : toCents(value);
  const cap = toCents(t.maxDiscount);
  if (t.type === "percent" && cap > 0) cents = Math.min(cents, cap);
  return Math.min(cents, baseCents);
}

/**
 * คิดส่วนลดแบบขั้นบันได ใช้ได้หลายขั้นซ้อนกัน
 * - ทุกขั้นที่ค่าอาหารถึงยอดขั้นต่ำจะถูกใช้ (ยอดขั้นต่ำเทียบกับค่าอาหารก่อนลด)
 * - ลดทีละขั้นตามลำดับในรายการ (บนลงล่าง) ขั้นแบบ % คิดจากยอดที่เหลือหลังหักขั้นก่อนหน้า
 *   เช่น ค่าอาหาร 1,000: ลด 8% (80) แล้วลด 70 → ลดรวม 150
 * - ส่วนลดรวมไม่เกินค่าอาหาร
 *
 * tier = { minSpend?, type: "amount" | "percent", value, maxDiscount? }
 * คืน { applied: [{ tierIndex, cents }], discountCents }
 */
export function pickDiscount(tiers, subtotalCents) {
  const applied = [];
  if (!(subtotalCents > 0)) return { applied, discountCents: 0 };

  let remaining = subtotalCents;
  (tiers ?? []).forEach((t, i) => {
    if (remaining <= 0 || !tierReached(t, subtotalCents)) return;
    const cents = tierDiscountCents(t, remaining);
    if (cents <= 0) return;
    applied.push({ tierIndex: i, cents });
    remaining -= cents;
  });
  return { applied, discountCents: subtotalCents - remaining };
}

/**
 * ขั้นถัดไปที่ยังไม่ถึง (ยอดขั้นต่ำน้อยที่สุดที่มากกว่าค่าอาหาร)
 * ใช้แสดง "ซื้อเพิ่มอีก X เพื่อได้ส่วนลดขั้นถัดไป" คืน { tierIndex, minCents, missingCents } หรือ null
 */
export function nextTier(tiers, subtotalCents) {
  let found = null;
  (tiers ?? []).forEach((t, i) => {
    const min = toCents(t?.minSpend);
    if (!(Number(t?.value) > 0) || min <= subtotalCents) return;
    if (!found || min < found.min) found = { tierIndex: i, min };
  });
  return found
    ? { tierIndex: found.tierIndex, minCents: found.min, missingCents: found.min - subtotalCents }
    : null;
}

/** สรุปยอดบิล: ค่าอาหาร − ส่วนลด + ค่าส่ง */
export function calcBill({ items, tiers, deliveryFee }) {
  const subtotalCents = (items ?? []).reduce((s, it) => s + itemCents(it), 0);
  const { applied, discountCents } = pickDiscount(tiers, subtotalCents);
  const deliveryCents = Math.max(0, toCents(deliveryFee));
  return {
    subtotalCents,
    appliedTiers: applied,
    discountCents,
    deliveryCents,
    totalCents: subtotalCents - discountCents + deliveryCents,
  };
}

/**
 * สถานะการจ่ายหลังแก้ไขบิล
 * - ยอดใหม่เป็น 0  → ถือว่าจ่ายแล้ว
 * - ยอดเท่าเดิม    → คงสถานะเดิม
 * - ยอดเปลี่ยน/คนใหม่ → กลับเป็นยังไม่จ่าย
 * prev = share เดิม { amount, is_paid, paid_at } หรือ undefined ถ้าเป็นคนใหม่
 */
export function shareStatusAfterEdit(prev, newCents, nowIso) {
  if (newCents === 0) {
    return { is_paid: true, paid_at: prev?.is_paid ? prev.paid_at : nowIso };
  }
  if (prev && toCents(prev.amount) === newCents) {
    return { is_paid: !!prev.is_paid, paid_at: prev.is_paid ? prev.paid_at : null };
  }
  return { is_paid: false, paid_at: null };
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
