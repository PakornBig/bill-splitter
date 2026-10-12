"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { calcBill, computeShares, fromCents } from "@/lib/billCalc";

const SPLIT_TYPES = ["equal", "by_item", "custom"];
const TIER_TYPES = ["amount", "percent"];

/**
 * สร้างบิลใหม่ ยอดทั้งหมดถูกคำนวณซ้ำฝั่ง server ไม่เชื่อตัวเลขจากหน้าเว็บ
 * input = {
 *   title, note, splitType, participants: string[],
 *   items: { name, price, qty, eaters: string[] }[],
 *   tiers: { minSpend, type, value }[],
 *   deliveryFee, customAmounts: { [personId]: number }
 * }
 */
export async function createBill(input) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "ไม่ได้เข้าสู่ระบบ" };

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
    const minSpend = Number(t.minSpend) || 0;
    const value = Number(t.value);
    const type = TIER_TYPES.includes(t.type) ? t.type : "amount";
    if (minSpend < 0 || !Number.isFinite(value) || value <= 0) {
      return { error: "ขั้นส่วนลดไม่ถูกต้อง" };
    }
    if (type === "percent" && value > 100) return { error: "ส่วนลดเปอร์เซ็นต์ต้องไม่เกิน 100%" };
    tiers.push({ minSpend, type, value });
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

export async function deleteBill(billId) {
  const supabase = createClient();
  await supabase.from("bills").delete().eq("id", billId);
  revalidatePath("/bills");
  revalidatePath("/outstanding");
}
