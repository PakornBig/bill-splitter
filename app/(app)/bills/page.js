import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/supabase/queries";
import BillCard from "@/components/BillCard";

export const dynamic = "force-dynamic";

export default async function BillsPage() {
  const supabase = createClient();

  // ดึง profile (cache ร่วมกับ layout) และบิลพร้อมกัน
  const [profile, { data: bills }] = await Promise.all([
    getProfile(),
    supabase
      .from("bills")
      .select(
        "*, bill_items(*, bill_item_people(person_id, people(name))), bill_shares(*, people(id, name))"
      )
      .order("created_at", { ascending: false }),
  ]);
  const currency = profile?.currency ?? "THB";

  // สร้างลิงก์ชั่วคราว (1 ชม.) สำหรับดูรูปสลิปจาก bucket แบบ private
  const slipPaths = (bills ?? []).flatMap((b) =>
    (b.bill_shares ?? []).map((s) => s.slip_path).filter(Boolean)
  );
  const slipUrls = {};
  if (slipPaths.length > 0) {
    const { data: signed } = await supabase.storage
      .from("slips")
      .createSignedUrls(slipPaths, 60 * 60);
    for (const s of signed ?? []) {
      if (s.signedUrl && s.path) slipUrls[s.path] = s.signedUrl;
    }
  }

  const list = (bills ?? []).map((b) => ({
    ...b,
    bill_shares: (b.bill_shares ?? []).map((s) => ({
      ...s,
      slip_url: s.slip_path ? slipUrls[s.slip_path] ?? null : null,
    })),
  }));
  const pendingSlips = list.reduce(
    (n, b) => n + b.bill_shares.filter((s) => s.slip_path && !s.is_paid).length,
    0
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">บิลของฉัน</h1>
          <p className="text-sm text-slate-500">บิลทั้งหมดที่คุณสร้าง</p>
        </div>
        <Link href="/bills/new" className="btn-primary">
          ➕ สร้างบิล
        </Link>
      </div>

      {pendingSlips > 0 && (
        <p className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          📎 มีสลิปรอตรวจสอบ <strong>{pendingSlips}</strong> รายการ
        </p>
      )}

      {list.length === 0 ? (
        <div className="card text-center text-slate-500">
          <p>ยังไม่มีบิล</p>
          <Link
            href="/bills/new"
            className="mt-3 inline-block font-medium text-brand-600 hover:underline"
          >
            สร้างบิลแรกของคุณ
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {list.map((bill) => (
            <BillCard
              key={bill.id}
              bill={bill}
              currency={currency}
              hasPromptPay={!!profile?.promptpay_id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
