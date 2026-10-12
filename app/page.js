import { redirect } from "next/navigation";

// middleware ส่งคนที่ยังไม่ login ไป /login แล้ว ถึงตรงนี้ได้แปลว่า login อยู่
export default function Home() {
  redirect("/bills");
}
