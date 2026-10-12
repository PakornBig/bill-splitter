import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/supabase/queries";
import CreateBillForm from "@/components/CreateBillForm";

export const dynamic = "force-dynamic";

export default async function NewBillPage() {
  const supabase = createClient();

  const [profile, { data: people }] = await Promise.all([
    getProfile(),
    supabase.from("people").select("id, name").order("name"),
  ]);
  const list = people ?? [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">สร้างบิล</h1>
        <p className="text-sm text-slate-500">ใส่เมนู ส่วนลด ค่าส่ง แล้วเลือกคนที่ร่วมหาร</p>
      </div>

      {list.length === 0 ? (
        <div className="card text-center text-slate-500">
          <p>ยังไม่มีรายชื่อคน กรุณาเพิ่มรายชื่อก่อนสร้างบิล</p>
          <Link
            href="/people"
            className="mt-3 inline-block font-medium text-brand-600 hover:underline"
          >
            ไปหน้าเพิ่มชื่อคน
          </Link>
        </div>
      ) : (
        <CreateBillForm people={list} currency={profile?.currency ?? "THB"} />
      )}
    </div>
  );
}
