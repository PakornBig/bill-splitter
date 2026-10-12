import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/supabase/queries";
import { formatMoney, formatDate } from "@/lib/utils";
import OutstandingPayButton from "@/components/OutstandingPayButton";

export const dynamic = "force-dynamic";

export default async function OutstandingPage() {
  const supabase = createClient();

  const [{ data: shares }, profile] = await Promise.all([
    supabase
      .from("bill_shares")
      .select("id, amount, person_id, slip_path, people(id, name), bills(id, title, created_at)")
      .eq("is_paid", false),
    getProfile(),
  ]);
  const currency = profile?.currency ?? "THB";
  const rows = shares ?? [];

  // จัดกลุ่มตามคน
  const groups = new Map();
  for (const r of rows) {
    const key = r.person_id;
    const g = groups.get(key) ?? {
      name: r.people?.name ?? "(ถูกลบ)",
      total: 0,
      items: [],
    };
    g.total += Number(r.amount);
    g.items.push(r);
    groups.set(key, g);
  }
  const sorted = Array.from(groups.entries()).sort(
    (a, b) => b[1].total - a[1].total
  );
  const grandTotal = rows.reduce((s, r) => s + Number(r.amount), 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">รวมบิลคงค้าง</h1>
        <p className="text-sm text-slate-500">ยอดที่แต่ละคนยังไม่ได้จ่าย</p>
      </div>

      <div className="card flex items-center justify-between bg-brand-50 border-brand-100">
        <span className="text-sm font-medium text-brand-700">ยอดค้างทั้งหมด</span>
        <span className="text-2xl font-bold text-brand-700">
          {formatMoney(grandTotal, currency)}
        </span>
      </div>

      {sorted.length === 0 ? (
        <div className="card text-center text-slate-500">
          🎉 ไม่มียอดคงค้าง ทุกคนจ่ายครบแล้ว
        </div>
      ) : (
        <div className="space-y-4">
          {sorted.map(([personId, g]) => (
            <div key={personId} className="card">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-900">{g.name}</h3>
                <span className="font-bold text-amber-600">
                  {formatMoney(g.total, currency)}
                </span>
              </div>
              <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100">
                {g.items.map((it) => (
                  <li key={it.id} className="flex items-center justify-between py-2 text-sm">
                    <div>
                      <p className="text-slate-700">
                        {it.bills?.title}
                        {it.slip_path && (
                          <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                            📎 รอตรวจสลิป
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-slate-400">
                        {it.bills ? formatDate(it.bills.created_at) : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-medium">
                        {formatMoney(Number(it.amount), currency)}
                      </span>
                      <OutstandingPayButton shareIds={[it.id]} label="จ่ายแล้ว" />
                    </div>
                  </li>
                ))}
              </ul>
              {g.items.length > 1 && (
                <div className="mt-3 flex justify-end">
                  <OutstandingPayButton
                    shareIds={g.items.map((i) => i.id)}
                    label="จ่ายครบทุกบิล"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
