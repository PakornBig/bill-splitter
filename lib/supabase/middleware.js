import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

export async function updateSession(request) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getSession() อ่าน token จาก cookie (และ refresh ถ้าหมดอายุ) โดยไม่ต้องยิงไป Supabase ทุกครั้ง
  // ใช้แค่ตัดสินใจ redirect เพื่อความเร็ว ส่วนการตรวจสิทธิ์จริงทำใน (app)/layout ด้วย getUser()
  // และข้อมูลทุกตารางถูกป้องกันด้วย Row Level Security อีกชั้น
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const loggedIn = !!session;

  const path = request.nextUrl.pathname;
  const isAuthPage = path.startsWith("/login") || path.startsWith("/register");
  // /pay = หน้าจ่ายเงินที่ส่งให้เพื่อน เปิดได้โดยไม่ต้อง login
  const isPublic = isAuthPage || path.startsWith("/auth") || path.startsWith("/pay");

  if (!loggedIn && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (loggedIn && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/bills";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
