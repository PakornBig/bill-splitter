import { cache } from "react";
import { createClient } from "./server";

// cache() ทำให้ layout และ page ที่ render ใน request เดียวกัน
// ใช้ผลลัพธ์ร่วมกัน ไม่ต้องยิงไป Supabase ซ้ำ

export const getUser = cache(async () => {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export const getProfile = cache(async () => {
  const user = await getUser();
  if (!user) return null;
  const supabase = createClient();
  const { data } = await supabase
    .from("profiles")
    .select("display_name, currency, promptpay_id")
    .eq("id", user.id)
    .single();
  return data;
});
