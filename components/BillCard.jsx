"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { togglePaid, deleteBill } from "@/app/(app)/bills/actions";
import { formatMoney, formatDate } from "@/lib/utils";

const SPLIT_LABELS = {
  equal: "หารเท่ากัน",
  by_item: "หารตามเมนู",
  custom: "กำหนดเอง",
};

export default function BillCard({ bill, currency, hasPromptPay }) {
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const payPath = bill.share_token ? `/pay/${bill.share_token}` : null;

  async function sharePayLink() {
    const url = `${window.location.origin}${payPath}`;
    const text = `บิล "${bill.title}" แตะชื่อตัวเองแล้วสแกน QR จ่ายได้เลย`;
    if (navigator.share) {
      try {
        await navigator.share({ title: bill.title, text, url });
        return;
      } catch (e) {
        if (e?.name === "AbortError") return; // ผู้ใช้กดยกเลิก
      }
    }
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("คัดลอกลิงก์นี้ส่งให้เพื่อน", url);
    }
  }
  const shares = bill.bill_shares ?? [];
  const paidCount = shares.filter((s) => s.is_paid).length;
  const allPaid = paidCount === shares.length && paidCount > 0;
  const remaining = shares
    .filter((s) => !s.is_paid)
    .reduce((sum, s) => sum + Number(s.amount), 0);
  const items = [...(bill.bill_items ?? [])].sort((a, b) => a.position - b.position);
  const pieceCount = items.reduce((s, it) => s + Number(it.quantity), 0);
  const discount = Number(bill.discount_amount ?? 0);
  const delivery = Number(bill.delivery_fee ?? 0);

  return (
    <div className={`card ${pending ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-900">{bill.title}</h3>
          <p className="text-xs text-slate-500">
            {formatDate(bill.created_at)} ·{" "}
            {SPLIT_LABELS[bill.split_type] ?? "กำหนดเอง"}
          </p>
          {bill.note && (
            <p className="mt-1 text-sm text-slate-600">{bill.note}</p>
          )}
        </div>
        <div className="text-right">
          <p className="font-bold text-slate-900">
            {formatMoney(Number(bill.total_amount), currency)}
          </p>
          <span
            className={`inline-block mt-1 rounded-full px-2 py-0.5 text-xs font-medium ${
              allPaid
                ? "bg-green-100 text-green-700"
                : "bg-amber-100 text-amber-700"
            }`}
          >
            {allPaid
              ? "จ่ายครบแล้ว"
              : `ค้าง ${formatMoney(remaining, currency)}`}
          </span>
        </div>
      </div>

      {items.length > 0 && (
        <details className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm">
          <summary className="cursor-pointer font-medium text-slate-700">
            เมนู {items.length} รายการ · {pieceCount} ชิ้น
          </summary>
          <ul className="mt-2 space-y-1.5">
            {items.map((it) => {
              const eaters = (it.bill_item_people ?? [])
                .map((x) => x.people?.name)
                .filter(Boolean);
              return (
                <li key={it.id} className="flex justify-between gap-3">
                  <div>
                    <span className="text-slate-800">{it.name}</span>{" "}
                    <span className="text-slate-500">
                      × {it.quantity} ({formatMoney(Number(it.unit_price), currency)})
                    </span>
                    {bill.split_type === "by_item" && eaters.length > 0 && (
                      <p className="text-xs text-slate-400">{eaters.join(", ")}</p>
                    )}
                  </div>
                  <span className="shrink-0 text-slate-700">
                    {formatMoney(Number(it.unit_price) * Number(it.quantity), currency)}
                  </span>
                </li>
              );
            })}
          </ul>
          <dl className="mt-2 space-y-1 border-t border-slate-200 pt-2">
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

      <ul className="mt-4 divide-y divide-slate-100 border-t border-slate-100">
        {shares.map((s) => (
          <li key={s.id} className="flex items-center justify-between py-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={s.is_paid}
                disabled={pending}
                onChange={(e) => {
                  const checked = e.target.checked;
                  startTransition(() => togglePaid(s.id, checked));
                }}
                className="h-4 w-4 accent-brand-600"
              />
              <span
                className={
                  s.is_paid ? "text-slate-400 line-through" : "text-slate-700"
                }
              >
                {s.people?.name ?? "(ถูกลบ)"}
              </span>
            </label>
            <span
              className={`text-sm ${
                s.is_paid ? "text-slate-400" : "font-medium text-slate-900"
              }`}
            >
              {formatMoney(Number(s.amount), currency)}
            </span>
          </li>
        ))}
      </ul>

      {payPath && !allPaid && !hasPromptPay && currency === "THB" && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          ยังไม่ได้ตั้งหมายเลข PromptPay เพื่อนจะยังสแกน QR จ่ายไม่ได้{" "}
          <Link href="/settings" className="font-medium underline">
            ตั้งค่าเลย
          </Link>
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        {payPath && !allPaid && (
          <>
            <button
              type="button"
              className="btn-primary !px-3 !py-1 text-xs"
              onClick={sharePayLink}
            >
              {copied ? "✓ คัดลอกลิงก์แล้ว" : "📤 ส่งลิงก์จ่ายเงิน"}
            </button>
            <a
              href={payPath}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary !px-3 !py-1 text-xs"
            >
              ดู QR
            </a>
          </>
        )}
        <button
          className="btn-danger !px-3 !py-1 text-xs"
          disabled={pending}
          onClick={() => {
            if (confirm(`ลบบิล "${bill.title}" ?`)) {
              startTransition(() => deleteBill(bill.id));
            }
          }}
        >
          ลบบิล
        </button>
      </div>
    </div>
  );
}
