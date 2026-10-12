"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function login(formData) {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "เข้าสู่ระบบไม่สำเร็จ: อีเมลหรือรหัสผ่านไม่ถูกต้อง" };
  }

  revalidatePath("/", "layout");
  redirect("/bills");
}

export async function register(formData) {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const displayName = String(formData.get("display_name") || "").trim();

  if (password.length < 6) {
    return { error: "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร" };
  }

  const supabase = createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName },
    },
  });

  if (error) {
    return { error: "สมัครสมาชิกไม่สำเร็จ: " + error.message };
  }

  // ถ้าเปิด email confirmation ไว้ user จะยังไม่มี session
  if (data.user && !data.session) {
    return { success: "สมัครสำเร็จ! กรุณาตรวจอีเมลเพื่อยืนยันตัวตนก่อนเข้าสู่ระบบ" };
  }

  revalidatePath("/", "layout");
  redirect("/bills");
}

export async function logout() {
  const supabase = createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
