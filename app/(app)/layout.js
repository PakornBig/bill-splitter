import { redirect } from "next/navigation";
import { getProfile, getUser } from "@/lib/supabase/queries";
import NavBar from "@/components/NavBar";

export default async function AppLayout({ children }) {
  // ตรวจสิทธิ์จริงที่นี่ (getUser ยืนยัน token กับ Supabase)
  const [user, profile] = await Promise.all([getUser(), getProfile()]);

  if (!user) {
    // มี cookie แต่ยืนยันกับ Supabase ไม่ผ่าน -> เคลียร์ session ก่อน กัน redirect วนกับ middleware
    redirect("/auth/signout");
  }

  return (
    <div className="min-h-screen">
      <NavBar email={user.email ?? ""} displayName={profile?.display_name ?? null} />
      <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
    </div>
  );
}
