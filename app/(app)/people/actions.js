"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function addPerson(formData) {
  const name = String(formData.get("name") || "").trim();
  const note = String(formData.get("note") || "").trim();
  if (!name) return { error: "กรุณาใส่ชื่อ" };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "ไม่ได้เข้าสู่ระบบ" };

  const { error } = await supabase
    .from("people")
    .insert({ owner_id: user.id, name, note: note || null });
  if (error) return { error: "เพิ่มไม่สำเร็จ: " + error.message };

  revalidatePath("/people");
  revalidatePath("/bills/new");
  return {};
}

export async function updatePerson(id, name) {
  const trimmed = String(name || "").trim();
  if (!trimmed) return { error: "กรุณาใส่ชื่อ" };
  const supabase = createClient();
  const { error } = await supabase.from("people").update({ name: trimmed }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/people");
  return {};
}

export async function deletePerson(id) {
  const supabase = createClient();
  await supabase.from("people").delete().eq("id", id);
  revalidatePath("/people");
  revalidatePath("/bills");
  revalidatePath("/outstanding");
}
