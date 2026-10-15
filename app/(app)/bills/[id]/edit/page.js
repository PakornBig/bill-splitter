import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/supabase/queries";
import CreateBillForm from "@/components/CreateBillForm";

export const dynamic = "force-dynamic";

export default async function EditBillPage({ params }) {
  const supabase = createClient();

  // RLS ทำให้ดึงได้เฉพาะบิลของตัวเอง บิลของคนอื่นจะได้ null -> 404
  const [profile, { data: people }, { data: bill }] = await Promise.all([
    getProfile(),
    supabase.from("people").select("id, name").order("name"),
    supabase
      .from("bills")
      .select(
        "id, title, note, split_type, delivery_fee, discount_tiers, " +
          "bill_items(name, unit_price, quantity, position, bill_item_people(person_id)), " +
          "bill_shares(person_id, amount, is_paid, slip_path, people(name))"
      )
      .eq("id", params.id)
      .maybeSingle(),
  ]);
  if (!bill) notFound();

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">แก้ไขบิล</h1>
          <p className="text-sm text-slate-500">
            คนที่ยอดไม่เปลี่ยนจะยังคงสถานะจ่ายแล้ว ลิงก์จ่ายเงินเดิมยังใช้ได้
          </p>
        </div>
        <Link href="/bills" className="btn-secondary !px-3 !py-1 text-sm">
          ยกเลิก
        </Link>
      </div>

      <CreateBillForm
        people={people ?? []}
        currency={profile?.currency ?? "THB"}
        bill={bill}
      />
    </div>
  );
}
