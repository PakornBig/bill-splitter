import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ใช้เคลียร์ session ที่ใช้งานไม่ได้แล้ว (เช่น token ถูกเพิกถอน) แล้วส่งกลับหน้า login
export async function GET(request) {
  const supabase = createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url));
}
