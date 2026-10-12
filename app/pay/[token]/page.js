import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/server";
import { buildPromptPayPayload, maskPromptPayId } from "@/lib/promptpay";
import { formatDate, formatMoney } from "@/lib/utils";
import SlipUpload from "@/components/SlipUpload";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "จ่ายบิล | หารบิล",
  robots: { index: false, follow: false },
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PayPage({ params }) {
  if (!UUID_RE.test(params.token)) notFound();

  const supabase = createClient();
  const { data: bill, error } = await supabase.rpc("get_shared_bill", {
    p_token: params.token,
  });
  if (error || !bill) notFound();

  const currency = bill.currency ?? "THB";
  const canQr = currency === "THB" && !!bill.promptpay_id;

  // สร้าง QR (รูป PNG) ของแต่ละคนที่ยังไม่จ่าย ฝั่ง server
  const shares = await Promise.all(
    (bill.shares ?? []).map(async (s) => {
      const amount = Number(s.amount);
      if (!canQr || s.is_paid || !(amount > 0)) return { ...s, qr: null };
      const payload = buildPromptPayPayload(bill.promptpay_id, amount);
      const qr = payload
        ? await QRCode.toDataURL(payload, { width: 320, margin: 2, errorCorrectionLevel: "M" })
        : null;
      return { ...s, qr };
    })
  );
  const unpaid = shares.filter((s) => !s.is_paid);
  const items = bill.items ?? [];
  const discount = Number(bill.discount_amount ?? 0);
  const delivery = Number(bill.delivery_fee ?? 0);

  return (
    <main className="mx-auto max-w-md px-4 py-8 space-y-4">
      <header className="text-center">
        <p className="text-sm text-slate-500">💸 หารบิล</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">{bill.title}</h1>
        <p className="text-sm text-slate-500">
          {formatDate(bill.created_at)}
          {bill.owner_name && <> · เรียกเก็บโดย {bill.owner_name}</>}
        </p>
        <p className="mt-2 text-3xl font-bold text-brand-700">
          {formatMoney(Number(bill.total_amount), currency)}
        </p>
        {bill.note && <p className="mt-1 text-sm text-slate-600">{bill.note}</p>}
      </header>

      {!canQr && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
          {currency !== "THB"
            ? "QR PromptPay ใช้ได้เฉพาะสกุลเงินบาท กรุณาโอนตามช่องทางที่เจ้าของบิลแจ้ง"
            : "เจ้าของบิลยังไม่ได้ตั้งค่าหมายเลข PromptPay กรุณาติดต่อเจ้าของบิล"}
        </p>
      )}

      <section aria-labelledby="who-pays" className="space-y-2">
        <h2 id="who-pays" className="text-sm font-semibold text-slate-700">
          {unpaid.length > 0 ? "แตะชื่อของคุณเพื่อดู QR" : "ทุกคนจ่ายครบแล้ว 🎉"}
        </h2>

        {shares.map((s) =>
          s.is_paid ? (
            <div
              key={s.id}
              className="card flex items-center justify-between !py-3 text-slate-400"
            >
              <span className="line-through">{s.name}</span>
              <span className="text-sm">✓ จ่ายแล้ว</span>
            </div>
          ) : (
            <details
              key={s.id}
              className="card !p-0 group"
              open={unpaid.length === 1}
            >
              <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3">
                <span className="flex items-center gap-2">
                  <span className="font-medium text-slate-900">{s.name}</span>
                  {s.slip_submitted && (
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                      รอตรวจสลิป
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-2">
                  <span className="font-bold text-slate-900">
                    {formatMoney(Number(s.amount), currency)}
                  </span>
                  <span aria-hidden="true" className="text-slate-400 transition group-open:rotate-180">
                    ▾
                  </span>
                </span>
              </summary>

              {s.qr && (
                <div className="border-t border-slate-100 px-5 py-4 text-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={s.qr}
                    alt={`QR PromptPay สำหรับ ${s.name} ยอด ${formatMoney(Number(s.amount), currency)}`}
                    width={240}
                    height={240}
                    className="mx-auto rounded-lg"
                  />
                  <p className="mt-2 text-lg font-bold text-slate-900">
                    {formatMoney(Number(s.amount), currency)}
                  </p>
                  <p className="text-xs text-slate-500">
                    PromptPay {maskPromptPayId(bill.promptpay_id)}
                    {bill.owner_name && <> · {bill.owner_name}</>}
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    สแกนด้วยแอปธนาคาร หรือกดค้างที่รูปเพื่อบันทึก แล้วเลือกรูปจากแอปธนาคาร
                  </p>
                </div>
              )}

              <div className="px-5 pb-4">
                <SlipUpload token={params.token} shareId={s.id} submitted={!!s.slip_submitted} />
              </div>
            </details>
          )
        )}
      </section>

      {items.length > 0 && (
        <details className="card text-sm">
          <summary className="cursor-pointer font-medium text-slate-700">
            ดูรายการเมนู ({items.length} รายการ)
          </summary>
          <ul className="mt-3 space-y-1.5">
            {items.map((it, i) => (
              <li key={i} className="flex justify-between gap-3">
                <div>
                  <span className="text-slate-800">{it.name}</span>{" "}
                  <span className="text-slate-500">× {it.quantity}</span>
                  {bill.split_type === "by_item" && it.eaters?.length > 0 && (
                    <p className="text-xs text-slate-400">{it.eaters.join(", ")}</p>
                  )}
                </div>
                <span className="shrink-0">
                  {formatMoney(Number(it.unit_price) * Number(it.quantity), currency)}
                </span>
              </li>
            ))}
          </ul>
          <dl className="mt-3 space-y-1 border-t border-slate-100 pt-2">
            <div className="flex justify-between">
              <dt className="text-slate-500">ค่าอาหาร</dt>
              <dd>{formatMoney(Number(bill.subtotal ?? 0), currency)}</dd>
            </div>
            {discount > 0 && (
              <div className="flex justify-between">
                <dt className="text-slate-500">ส่วนลด</dt>
                <dd className="text-green-700">−{formatMoney(discount, currency)}</dd>
              </div>
            )}
            {delivery > 0 && (
              <div className="flex justify-between">
                <dt className="text-slate-500">ค่าส่ง</dt>
                <dd>+{formatMoney(delivery, currency)}</dd>
              </div>
            )}
          </dl>
        </details>
      )}

      <p className="text-center text-xs text-slate-400">
        โอนแล้วแนบสลิป เจ้าของบิลจะตรวจสอบและยืนยันให้
      </p>
    </main>
  );
}
