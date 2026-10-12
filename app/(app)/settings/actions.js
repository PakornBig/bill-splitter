"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { normalizePromptPayId } from "@/lib/promptpay";

const ALLOWED_CURRENCIES = ["THB", "USD", "EUR", "JPY", "GBP"];

export async function updateProfile(formData) {
  const displayName = String(formData.get("display_name") || "").trim();
  const currency = String(formData.get("currency") || "THB");
  if (!ALLOWED_CURRENCIES.includes(currency)) return { error: "สกุลเงินไม่ถูกต้อง" };

  const rawPromptPay = String(formData.get("promptpay_id") || "").trim();
  let promptpayId = null;
  if (rawPromptPay) {
    const n = normalizePromptPayId(rawPromptPay);
    if (!n) {
      return { error: "หมายเลข PromptPay ไม่ถูกต้อง (เบอร์มือถือ 10 หลัก, เลขบัตร 13 หลัก หรือ e-Wallet 15 หลัก)" };
    }
    promptpayId = n.value;
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "ไม่ได้เข้าสู่ระบบ" };

  const { error } = await supabase
    .from("profiles")
    .upsert({ id: user.id, display_name: displayName || null, currency, promptpay_id: promptpayId });
  if (error) return { error: "บันทึกไม่สำเร็จ: " + error.message };

  revalidatePath("/", "layout");
  return { success: "บันทึกข้อมูลแล้ว" };
}

export async function changePassword(formData) {
  const password = String(formData.get("password") || "");
  const confirm = String(formData.get("confirm") || "");
  if (password.length < 6) return { error: "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร" };
  if (password !== confirm) return { error: "รหัสผ่านทั้งสองช่องไม่ตรงกัน" };

  const supabase = createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: "เปลี่ยนรหัสผ่านไม่สำเร็จ: " + error.message };
  return { success: "เปลี่ยนรหัสผ่านแล้ว" };
}
