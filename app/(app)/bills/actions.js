"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { calcBill, computeShares, fromCents, shareStatusAfterEdit } from "@/lib/billCalc";

const SPLIT_TYPES = ["equal", "by_item", "custom"];
const TIER_TYPES = ["amount", "percent"];

/**
 * ตรวจข้อมูลบิลจากหน้าเว็บ แล้วคำนวณยอดทั้งหมดใหม่ฝั่ง server (ไม่เชื่อตัวเลขจากหน้าเว็บ)
 * input = {
 *   title, note, splitType, participants: string[],
 *   items: { name, price, qty, eaters: string[] }[],
 *   tiers: { minSpend?, type, value, maxDiscount? }[],
 *   deliveryFee, customAmounts: { [personId]: number }
 * }
 * คืนค่า { error } หรือ { title, note, splitType, participants, items, tiers, calc, details }
 */
function parseBillInput(input) {
  const title = String(input?.title ?? "").trim();
  const note = String(input?.note ?? "").trim();
  const splitType = input?.splitType;
  if (!title) return { error: "กรุณาระบุชื่อบิล" };
  if (!SPLIT_TYPES.includes(splitType)) return { error: "วิธีหารไม่ถูกต้อง" };

  const participants = [...new Set((input?.participants ?? []).map(String))];
  if (participants.length === 0) return { error: "กรุณาเลือกคนที่ร่วมหารอย่างน้อย 1 คน" };

  // ตรวจรายการเมนู
  const rawItems = Array.isArray(input?.items) ? input.items : [];
  if (rawItems.length === 0) return { error: "กรุณาเพิ่มเมนูอย่างน้อย 1 รายการ" };
  const items = [];
  for (const it of rawItems) {
    const name = String(it?.name ?? "").trim();
    const price = Number(it?.price);
    const qty = Number(it?.qty);
    if (!name) return { error: "กรุณาใส่ชื่อเมนูให้ครบ" };
    if (!Number.isFinite(price) || price < 0) return { error: `ราคาของ "${name}" ไม่ถูกต้อง` };
    if (!Number.isInteger(qty) || qty < 1 || qty > 9999) return { error: `จำนวนของ "${name}" ไม่ถูกต้อง` };
    const eaters = [...new Set((it?.eaters ?? []).map(String))].filter((id) =>
      participants.includes(id)
    );
    items.push({ name, price, qty, eaters });
  }

  // ตรวจขั้นส่วนลด (ข้ามแถวที่ว่าง)
  const tiers = [];
  for (const t of Array.isArray(input?.tiers) ? input.tiers : []) {
    if (t?.value === "" || t?.value == null) continue;
    // ยอดขั้นต่ำไม่บังคับ (ว่าง = ไม่มีขั้นต่ำ)
    const minSpend = Number(t.minSpend) || 0;
    const value = Number(t.value);
    const type = TIER_TYPES.includes(t.type) ? t.type : "amount";
    if (!Number.isFinite(minSpend) || minSpend < 0 || !Number.isFinite(value) || value <= 0) {
      return { error: "ขั้นส่วนลดไม่ถูกต้อง" };
    }
    if (type === "percent" && value > 100) return { error: "ส่วนลดเปอร์เซ็นต์ต้องไม่เกิน 100%" };

    const tier = { minSpend, type, value };
    // ส่วนลดสูงสุด ใช้กับแบบเปอร์เซ็นต์เท่านั้น (ว่าง = ไม่จำกัด)
    if (type === "percent" && t.maxDiscount !== "" && t.maxDiscount != null) {
      const maxDiscount = Number(t.maxDiscount);
      if (!Number.isFinite(maxDiscount) || maxDiscount < 0) {
        return { error: "ส่วนลดสูงสุดไม่ถูกต้อง" };
      }
      if (maxDiscount > 0) tier.maxDiscount = maxDiscount;
    }
    tiers.push(tier);
  }

  const deliveryFee = Number(input?.deliveryFee) || 0;
  if (deliveryFee < 0) return { error: "ค่าส่งต้องไม่ติดลบ" };

  const calc = calcBill({ items, tiers, deliveryFee });
  if (calc.totalCents <= 0) return { error: "ยอดสุทธิต้องมากกว่า 0" };

  const { details, error: shareErr } = computeShares({
    splitType,
    participants,
    items,
    discountCents: calc.discountCents,
    deliveryCents: calc.deliveryCents,
    totalCents: calc.totalCents,
    customAmounts: input?.customAmounts ?? {},
  });
  if (shareErr) return { error: shareErr };

  return { title, note, splitType, participants, items, tiers, calc, details };
}

/** สร้างบิลใหม่ */
export async function createBill(input) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "ไม่ได้เข้าสู่ระบบ" };

  const parsed = parseBillInput(input);
  if (parsed.error) return { error: parsed.error };
  const { title, note, splitType, participants, items, tiers, calc, details } = parsed;

  // 1) บิล
  const { data: bill, error: billErr } = await supabase
    .from("bills")
    .insert({
      owner_id: user.id,
      title,
      note: note || null,
      split_type: splitType,
      subtotal: fromCents(calc.subtotalCents),
      discount_amount: fromCents(calc.discountCents),
      delivery_fee: fromCents(calc.deliveryCents),
      discount_tiers: tiers,
      total_amount: fromCents(calc.totalCents),
    })
    .select("id")
    .single();
  if (billErr || !bill) {
    return { error: "สร้างบิลไม่สำเร็จ: " + (billErr?.message ?? "") };
  }

  const fail = async (msg) => {
    // ลบบิล (ตารางลูกถูกลบตามด้วย cascade)
    await supabase.from("bills").delete().eq("id", bill.id);
    return { error: msg };
  };

  // 2) เมนู
  const { data: savedItems, error: itemsErr } = await supabase
    .from("bill_items")
    .insert(
      items.map((it, i) => ({
        bill_id: bill.id,
        name: it.name,
        unit_price: it.price,
        quantity: it.qty,
        position: i,
      }))
    )
    .select("id, position");
  if (itemsErr || !savedItems) return fail("บันทึกเมนูไม่สำเร็จ: " + (itemsErr?.message ?? ""));

  // 3) ใครกินเมนูไหน
  const itemPeople = savedItems.flatMap((row) =>
    (items[row.position]?.eaters ?? []).map((pid) => ({ item_id: row.id, person_id: pid }))
  );
  if (itemPeople.length > 0) {
    const { error } = await supabase.from("bill_item_people").insert(itemPeople);
    if (error) return fail("บันทึกคนกินแต่ละเมนูไม่สำเร็จ: " + error.message);
  }

  // 4) ยอดที่แต่ละคนต้องจ่าย (คนที่ยอด 0 ถือว่าจ่ายแล้ว)
  const now = new Date().toISOString();
  const { error: sharesErr } = await supabase.from("bill_shares").insert(
    participants.map((pid) => {
      const amount = details[pid]?.amount ?? 0;
      return {
        bill_id: bill.id,
        person_id: pid,
        amount: fromCents(amount),
        is_paid: amount === 0,
        paid_at: amount === 0 ? now : null,
      };
    })
  );
  if (sharesErr) return fail("บันทึกรายการหารไม่สำเร็จ: " + sharesErr.message);

  revalidatePath("/bills");
  revalidatePath("/outstanding");
  redirect("/bills");
}

/**
 * แก้ไขบิลเดิม (input แบบเดียวกับ createBill)
 * - share ของคนเดิมใช้ id เดิม ลิงก์จ่ายเงินและสลิปที่ส่งมาแล้วจึงยังผูกกับคนเดิม
 * - สถานะจ่ายแล้วคงไว้ถ้ายอดไม่เปลี่ยน, ยอดเปลี่ยนจะกลับเป็นยังไม่จ่าย (ดู shareStatusAfterEdit)
 * - คนที่ถูกเอาออกจากบิล: ลบ share และไฟล์สลิปของคนนั้น
 */
export async function updateBill(billId, input) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "ไม่ได้เข้าสู่ระบบ" };
  if (!billId) return { error: "ไม่พบบิลนี้" };

  const parsed = parseBillInput(input);
  if (parsed.error) return { error: parsed.error };
  const { title, note, splitType, participants, items, tiers, calc, details } = parsed;

  // RLS ทำให้เห็นเฉพาะบิลของตัวเอง
  const { data: bill } = await supabase
    .from("bills")
    .select("id, bill_shares(id, person_id, amount, is_paid, paid_at, slip_path)")
    .eq("id", billId)
    .maybeSingle();
  if (!bill) return { error: "ไม่พบบิลนี้" };

  const prevByPerson = Object.fromEntries(
    (bill.bill_shares ?? []).map((s) => [s.person_id, s])
  );
  const now = new Date().toISOString();
  const shares = participants.map((pid) => {
    const prev = prevByPerson[pid];
    const cents = details[pid]?.amount ?? 0;
    return {
      id: prev?.id ?? null,
      person_id: pid,
      amount: fromCents(cents),
      ...shareStatusAfterEdit(prev, cents, now),
    };
  });
  const removedSlips = (bill.bill_shares ?? [])
    .filter((s) => !participants.includes(s.person_id) && s.slip_path)
    .map((s) => s.slip_path);

  const { error } = await supabase.rpc("update_bill", {
    p_bill_id: billId,
    p_bill: {
      title,
      note,
      split_type: splitType,
      subtotal: fromCents(calc.subtotalCents),
      discount_amount: fromCents(calc.discountCents),
      delivery_fee: fromCents(calc.deliveryCents),
      discount_tiers: tiers,
      total_amount: fromCents(calc.totalCents),
    },
    p_items: items.map((it) => ({
      name: it.name,
      unit_price: it.price,
      quantity: it.qty,
      eaters: it.eaters,
    })),
    p_shares: shares,
  });
  if (error) return { error: "บันทึกการแก้ไขไม่สำเร็จ: " + error.message };

  // ลบไฟล์สลิปของคนที่ถูกเอาออก (ทำหลังบันทึกสำเร็จ ถ้าพลาดก็แค่เหลือไฟล์ค้าง)
  if (removedSlips.length > 0) {
    await supabase.storage.from("slips").remove(removedSlips);
  }

  revalidatePath("/bills");
  revalidatePath("/outstanding");
  redirect("/bills");
}

export async function togglePaid(shareId, isPaid) {
  const supabase = createClient();
  await supabase
    .from("bill_shares")
    .update({
      is_paid: isPaid,
      paid_at: isPaid ? new Date().toISOString() : null,
    })
    .eq("id", shareId);

  revalidatePath("/bills");
  revalidatePath("/outstanding");
}

export async function markSharesPaid(shareIds) {
  if (!shareIds || shareIds.length === 0) return;
  const supabase = createClient();
  await supabase
    .from("bill_shares")
    .update({ is_paid: true, paid_at: new Date().toISOString() })
    .in("id", shareIds);

  revalidatePath("/bills");
  revalidatePath("/outstanding");
}

// ปฏิเสธสลิป: ลบไฟล์และล้างสถานะ ให้เพื่อนส่งใหม่ได้
export async function rejectSlip(shareId) {
  const supabase = createClient();
  // RLS ทำให้เห็นเฉพาะ share ในบิลของตัวเอง
  const { data: share } = await supabase
    .from("bill_shares")
    .select("slip_path")
    .eq("id", shareId)
    .single();
  if (!share) return { error: "ไม่พบรายการนี้" };

  const { error } = await supabase
    .from("bill_shares")
    .update({ slip_path: null, slip_submitted_at: null, is_paid: false, paid_at: null })
    .eq("id", shareId);
  if (error) return { error: error.message };

  if (share.slip_path) {
    await supabase.storage.from("slips").remove([share.slip_path]);
  }

  revalidatePath("/bills");
  revalidatePath("/outstanding");
  return {};
}

export async function deleteBill(billId) {
  const supabase = createClient();

  // ลบไฟล์สลิปของบิลนี้ใน Storage ด้วย (แถวในตารางถูกลบตาม cascade แต่ไฟล์ไม่ถูกลบเอง)
  const { data: shares } = await supabase
    .from("bill_shares")
    .select("slip_path")
    .eq("bill_id", billId)
    .not("slip_path", "is", null);
  const paths = (shares ?? []).map((s) => s.slip_path).filter(Boolean);
  if (paths.length > 0) {
    await supabase.storage.from("slips").remove(paths);
  }

  await supabase.from("bills").delete().eq("id", billId);
  revalidatePath("/bills");
  revalidatePath("/outstanding");
}
