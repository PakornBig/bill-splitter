import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

export async function updateSession(request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // ไม่มี env -> ไม่ให้ middleware crash ทั้งเว็บ แต่บอกสาเหตุใน log (Vercel -> Logs)
  if (!url || !anonKey) {
    console.error(
      "[middleware] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
        "Set them in Vercel -> Settings -> Environment Variables, then redeploy."
    );
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  let loggedIn = false;
  try {
    const supabase = createServerClient(url, anonKey, {
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
    });

    // getSession() อ่าน token จาก cookie (และ refresh ถ้าหมดอายุ) โดยไม่ต้องยิงไป Supabase ทุกครั้ง
    // ใช้แค่ตัดสินใจ redirect เพื่อความเร็ว ส่วนการตรวจสิทธิ์จริงทำใน (app)/layout ด้วย getUser()
    // และข้อมูลทุกตารางถูกป้องกันด้วย Row Level Security อีกชั้น
    const {
      data: { session },
    } = await supabase.auth.getSession();
    loggedIn = !!session;
  } catch (err) {
    // เช่น เชื่อมต่อ Supabase ไม่ได้ชั่วคราว: ถือว่ายังไม่ login แล้วไปต่อ
    // (หน้าในแอปยังถูกป้องกันโดย getUser() ใน layout)
    console.error("[middleware] Supabase session check failed:", err);
  }

  const path = request.nextUrl.pathname;
  const isAuthPage = path.startsWith("/login") || path.startsWith("/register");
  // /pay = หน้าจ่ายเงินที่ส่งให้เพื่อน เปิดได้โดยไม่ต้อง login
  const isPublic = isAuthPage || path.startsWith("/auth") || path.startsWith("/pay");

  if (!loggedIn && !isPublic) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    return NextResponse.redirect(redirectUrl);
  }

  if (loggedIn && isAuthPage) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/bills";
    return NextResponse.redirect(redirectUrl);
  }

  return supabaseResponse;
}
