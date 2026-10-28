"use client";

import { useRef, useState, useTransition } from "react";
import { createBill, updateBill } from "@/app/(app)/bills/actions";
import { formatMoney } from "@/lib/utils";
import { calcBill, computeShares, fromCents, itemCents, nextTier, toCents } from "@/lib/billCalc";

const SPLIT_TYPES = [
  { value: "by_item", label: "หารตามเมนู", hint: "แต่ละคนจ่ายตามเมนูที่กิน" },
  { value: "equal", label: "หารเท่ากัน", hint: "ยอดสุทธิหารเท่ากันทุกคน" },
  { value: "custom", label: "กำหนดเอง", hint: "กรอกยอดของแต่ละคนเอง" },
];

const blankItem = (key, eaters = []) => ({ key, name: "", price: "", qty: "1", eaters });
const blankTier = (key) => ({ key, minSpend: "", type: "amount", value: "", maxDiscount: "" });

// ตัวเลขจาก DB -> ค่าในช่องกรอก (0 หรือว่าง = เว้นช่องไว้)
const numText = (v) => (Number(v) > 0 ? String(Number(v)) : "");

/** สร้าง state เริ่มต้นของฟอร์ม จากบิลเดิม (โหมดแก้ไข) หรือค่าว่าง (โหมดสร้าง) */
function buildInitial(bill, people) {
  let key = 0;
  if (!bill) {
    return {
      title: "",
      note: "",
      splitType: "by_item",
      selected: [],
      items: [blankItem(key++)],
      tiers: [],
      delivery: "",
      custom: {},
      nextKey: key,
    };
  }

  const shares = bill.bill_shares ?? [];
  const sharePids = new Set(shares.map((s) => s.person_id));
  // เรียงตามลำดับในรายชื่อ และข้ามคนที่ถูกลบไปแล้ว
  const selected = people.filter((p) => sharePids.has(p.id)).map((p) => p.id);

  const items = [...(bill.bill_items ?? [])]
    .sort((a, b) => a.position - b.position)
    .map((it) => ({
      key: key++,
      name: it.name ?? "",
      price: String(Number(it.unit_price ?? 0)),
      qty: String(it.quantity ?? 1),
      eaters: (it.bill_item_people ?? [])
        .map((x) => x.person_id)
        .filter((pid) => selected.includes(pid)),
    }));
  // บิลเก่าที่สร้างก่อนมีระบบเมนูจะไม่มีรายการ ให้เริ่มด้วยแถวว่าง 1 แถว
  if (items.length === 0) items.push(blankItem(key++, [...selected]));

  const tiers = (Array.isArray(bill.discount_tiers) ? bill.discount_tiers : []).map((t) => ({
    key: key++,
    minSpend: numText(t.minSpend),
    type: t.type === "percent" ? "percent" : "amount",
    value: numText(t.value),
    maxDiscount: numText(t.maxDiscount),
  }));

  const custom =
    bill.split_type === "custom"
      ? Object.fromEntries(shares.map((s) => [s.person_id, String(Number(s.amount))]))
      : {};

  return {
    title: bill.title ?? "",
    note: bill.note ?? "",
    splitType: ["by_item", "equal", "custom"].includes(bill.split_type) ? bill.split_type : "equal",
    selected,
    items,
    tiers,
    delivery: numText(bill.delivery_fee),
    custom,
    nextKey: key,
  };
}

/**
 * ฟอร์มสร้างบิล / แก้ไขบิล
 * ส่ง `bill` (พร้อม bill_items, bill_item_people, bill_shares) มาเพื่อเปิดในโหมดแก้ไข
 */
export default function CreateBillForm({ people, currency, bill = null }) {
  const isEdit = !!bill;
  const [init] = useState(() => buildInitial(bill, people));
  const keyRef = useRef(init.nextKey);
  const nextKey = () => keyRef.current++;

  const [title, setTitle] = useState(init.title);
  const [note, setNote] = useState(init.note);
  const [splitType, setSplitType] = useState(init.splitType);
  const [selected, setSelected] = useState(init.selected);
  const [items, setItems] = useState(init.items);
  const [tiers, setTiers] = useState(init.tiers);
  const [delivery, setDelivery] = useState(init.delivery);
  const [custom, setCustom] = useState(init.custom);
  const [error, setError] = useState(null);
  const [pending, startTransition] = useTransition();

  const fm = (cents) => formatMoney(fromCents(cents), currency);

  // คนที่ร่วมหาร เรียงตามลำดับในรายชื่อ
  const participants = people.filter((p) => selected.includes(p.id));
  const participantIds = participants.map((p) => p.id);
  const nameOf = (id) => people.find((p) => p.id === id)?.name ?? "";

  const calc = calcBill({ items, tiers, deliveryFee: delivery });
  // index ของขั้นที่ถูกใช้ -> ยอดที่ลดจริง (สตางค์)
  const appliedCents = Object.fromEntries(calc.appliedTiers.map((a) => [a.tierIndex, a.cents]));
  const shares = computeShares({
    splitType,
    participants: participantIds,
    items,
    discountCents: calc.discountCents,
    deliveryCents: calc.deliveryCents,
    totalCents: calc.totalCents,
    customAmounts: custom,
  });

  // ยอดรวมที่เก็บจากทุกคน (หลังปัดเศษขึ้น อาจมากกว่ายอดสุทธิ)
  const collectedCents = shares.error
    ? 0
    : participantIds.reduce((s, id) => s + (shares.details[id]?.amount ?? 0), 0);

  const filledItems = items.filter((it) => it.name.trim() || it.price !== "");
  const pieceCount = filledItems.reduce((s, it) => s + (Math.floor(Number(it.qty)) || 0), 0);

  // โหมดแก้ไข: เตือนถ้าการแก้จะกระทบคนที่จ่ายแล้ว/ส่งสลิปแล้ว (ตรงกับ shareStatusAfterEdit ฝั่ง server)
  const editWarnings =
    isEdit && !shares.error
      ? (bill.bill_shares ?? []).flatMap((s) => {
          const name = s.people?.name ?? nameOf(s.person_id) ?? "";
          if (!selected.includes(s.person_id)) {
            if (s.slip_path) return [`${name}: ถูกเอาออกจากบิล สลิปที่ส่งมาจะถูกลบ`];
            if (s.is_paid && Number(s.amount) > 0) return [`${name}: จ่ายแล้วแต่ถูกเอาออกจากบิล`];
            return [];
          }
          const oldCents = toCents(s.amount);
          const newCents = shares.details[s.person_id]?.amount ?? 0;
          if (newCents === 0 || newCents === oldCents) return [];
          const change = `ยอดเปลี่ยนจาก ${fm(oldCents)} เป็น ${fm(newCents)}`;
          if (s.is_paid) return [`${name}: ${change} จะกลับเป็น "ยังไม่จ่าย"`];
          if (s.slip_path) return [`${name}: ${change} ตรวจสลิปที่ส่งมาอีกครั้ง`];
          return [];
        })
      : [];

  // ---------- คนร่วมหาร ----------
  function setParticipants(nextIds) {
    const added = nextIds.filter((id) => !selected.includes(id));
    setSelected(nextIds);
    // คนที่เพิ่มใหม่จะถูกใส่เป็นคนกินทุกเมนู, คนที่เอาออกจะถูกเอาออกจากทุกเมนู
    setItems((prev) =>
      prev.map((it) => ({
        ...it,
        eaters: [
          ...it.eaters.filter((id) => nextIds.includes(id)),
          ...added.filter((id) => !it.eaters.includes(id)),
        ],
      }))
    );
  }
  const togglePerson = (id) =>
    setParticipants(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  // ---------- เมนู ----------
  const updateItem = (key, patch) =>
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  const removeItem = (key) => setItems((prev) => prev.filter((it) => it.key !== key));
  const addItem = () => setItems((prev) => [...prev, blankItem(nextKey(), [...participantIds])]);
  const toggleEater = (item, pid) =>
    updateItem(item.key, {
      eaters: item.eaters.includes(pid)
        ? item.eaters.filter((x) => x !== pid)
        : [...item.eaters, pid],
    });

  // ---------- ขั้นส่วนลด ----------
  const updateTier = (key, patch) =>
    setTiers((prev) => prev.map((t) => (t.key === key ? { ...t, ...patch } : t)));
  const removeTier = (key) => setTiers((prev) => prev.filter((t) => t.key !== key));
  const addTier = () => setTiers((prev) => [...prev, blankTier(nextKey())]);
  const upcoming = nextTier(tiers, calc.subtotalCents);

  /** รายการขั้นส่วนลด */
  function renderTiers() {
    return (
      <div>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">ส่วนลดแบบขั้นบันได</h2>
          <button type="button" onClick={addTier} className="text-sm font-medium text-brand-600 hover:underline">
            ＋ เพิ่มขั้น
          </button>
        </div>
        <p className="text-xs text-slate-500">
          เช่น ลด 8%, ครบ 300 ลด 40, ครบ 500 ลด 15% สูงสุด 100 ทุกขั้นที่ค่าอาหารถึงจะถูกใช้ซ้อนกัน
          โดยลดตามลำดับจากบนลงล่าง ขั้นแบบ % คิดจากยอดหลังหักขั้นก่อนหน้า
          (ไม่กรอกยอดขั้นต่ำ = ไม่มีขั้นต่ำ, ไม่กรอกสูงสุด = ไม่จำกัด)
        </p>

        {tiers.length > 0 && (
          <ul className="mt-3 space-y-2">
            {tiers.map((t, idx) => {
              const active = idx in appliedCents;
              return (
                <li
                  key={t.key}
                  className={`flex flex-wrap items-center gap-2 rounded-lg border p-2 text-sm ${
                    active ? "border-green-400 bg-green-50" : "border-slate-200"
                  }`}
                >
                  <label htmlFor={`tier-min-${t.key}`}>ซื้อครบ</label>
                  <input
                    id={`tier-min-${t.key}`}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    className="input !w-28"
                    value={t.minSpend}
                    onChange={(e) => updateTier(t.key, { minSpend: e.target.value })}
                    placeholder="ไม่มีขั้นต่ำ"
                  />
                  <label htmlFor={`tier-val-${t.key}`}>ลด</label>
                  <input
                    id={`tier-val-${t.key}`}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    className="input !w-24"
                    value={t.value}
                    onChange={(e) => updateTier(t.key, { value: e.target.value })}
                    placeholder="0"
                  />
                  <select
                    aria-label="ประเภทส่วนลด"
                    className="input !w-auto"
                    value={t.type}
                    onChange={(e) => updateTier(t.key, { type: e.target.value })}
                  >
                    <option value="amount">{currency}</option>
                    <option value="percent">%</option>
                  </select>
                  {t.type === "percent" && (
                    <>
                      <label htmlFor={`tier-max-${t.key}`}>สูงสุด</label>
                      <input
                        id={`tier-max-${t.key}`}
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        className="input !w-28"
                        value={t.maxDiscount}
                        onChange={(e) => updateTier(t.key, { maxDiscount: e.target.value })}
                        placeholder="ไม่จำกัด"
                      />
                      <span>{currency}</span>
                    </>
                  )}
                  {active && (
                    <span className="text-xs font-medium text-green-700">
                      ✓ ใช้ขั้นนี้ (−{fm(appliedCents[idx])})
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => removeTier(t.key)}
                    aria-label={`ลบขั้นที่ ${idx + 1}`}
                    className="ml-auto rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  >
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {upcoming && (
          <p className="mt-2 text-xs text-brand-700">
            ซื้อเพิ่มอีก {fm(upcoming.missingCents)} เพื่อได้ส่วนลดขั้นถัดไป (ครบ {fm(upcoming.minCents)})
          </p>
        )}
      </div>
    );
  }

  // ---------- บันทึก ----------
  function submit(e) {
    e.preventDefault();
    setError(null);

    if (!title.trim()) return setError("กรุณาระบุชื่อบิล");
    if (participantIds.length === 0) return setError("กรุณาเลือกคนที่ร่วมหารอย่างน้อย 1 คน");
    if (filledItems.length === 0) return setError("กรุณาเพิ่มเมนูอย่างน้อย 1 รายการ");
    if (filledItems.some((it) => !it.name.trim())) return setError("กรุณาใส่ชื่อเมนูให้ครบ");
    if (calc.totalCents <= 0) return setError("ยอดสุทธิต้องมากกว่า 0");
    if (shares.error) return setError(shares.error);

    startTransition(async () => {
      const payload = {
        title,
        note,
        splitType,
        participants: participantIds,
        items: filledItems.map(({ name, price, qty, eaters }) => ({ name, price, qty, eaters })),
        tiers: tiers.map(({ minSpend, type, value, maxDiscount }) => ({
          minSpend,
          type,
          value,
          maxDiscount: type === "percent" ? maxDiscount : "",
        })),
        deliveryFee: delivery,
        customAmounts: custom,
      };
      const res = isEdit ? await updateBill(bill.id, payload) : await createBill(payload);
      if (res?.error) setError(res.error);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {/* ข้อมูลบิล */}
      <section className="card space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="title">ชื่อบิล</label>
            <input
              id="title"
              className="input"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="เช่น ข้าวเที่ยง LINE MAN"
            />
          </div>
          <div>
            <label className="label" htmlFor="note">หมายเหตุ (ไม่บังคับ)</label>
            <input id="note" className="input" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>

        <fieldset>
          <legend className="label">วิธีหาร</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {SPLIT_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setSplitType(t.value)}
                aria-pressed={splitType === t.value}
                className={`rounded-lg border px-3 py-2 text-left transition ${
                  splitType === t.value
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                <span className="block text-sm font-medium">{t.label}</span>
                <span className="block text-xs text-slate-500">{t.hint}</span>
              </button>
            ))}
          </div>
        </fieldset>
      </section>

      {/* คนร่วมหาร */}
      <section className="card">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">
            คนที่ร่วมหาร ({selected.length}/{people.length})
          </h2>
          <button
            type="button"
            className="text-xs font-medium text-brand-600 hover:underline"
            onClick={() =>
              setParticipants(selected.length === people.length ? [] : people.map((p) => p.id))
            }
          >
            {selected.length === people.length ? "ยกเลิกทั้งหมด" : "เลือกทั้งหมด"}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {people.map((p) => {
            const on = selected.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={on}
                onClick={() => togglePerson(p.id)}
                className={`rounded-full border px-3 py-1 text-sm transition ${
                  on
                    ? "border-brand-500 bg-brand-600 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {on ? "✓ " : ""}
                {p.name}
              </button>
            );
          })}
        </div>
      </section>

      {/* เมนู */}
      <section className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">เมนู</h2>
          <span className="text-xs text-slate-500">
            {filledItems.length} เมนู · {pieceCount} ชิ้น
          </span>
        </div>

        <ul className="space-y-3">
          {items.map((it, idx) => (
            <li key={it.key} className="rounded-lg border border-slate-200 p-3 space-y-2">
              <div className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-12 sm:col-span-5">
                  <label className="text-xs text-slate-500" htmlFor={`item-name-${it.key}`}>
                    เมนูที่ {idx + 1}
                  </label>
                  <input
                    id={`item-name-${it.key}`}
                    className="input"
                    value={it.name}
                    onChange={(e) => updateItem(it.key, { name: e.target.value })}
                    placeholder="เช่น ข้าวกะเพราไก่"
                  />
                </div>
                <div className="col-span-5 sm:col-span-3">
                  <label className="text-xs text-slate-500" htmlFor={`item-price-${it.key}`}>
                    ราคา/หน่วย
                  </label>
                  <input
                    id={`item-price-${it.key}`}
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    className="input"
                    value={it.price}
                    onChange={(e) => updateItem(it.key, { price: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
                <div className="col-span-3 sm:col-span-2">
                  <label className="text-xs text-slate-500" htmlFor={`item-qty-${it.key}`}>
                    จำนวน
                  </label>
                  <input
                    id={`item-qty-${it.key}`}
                    type="number"
                    inputMode="numeric"
                    step="1"
                    min="1"
                    className="input"
                    value={it.qty}
                    onChange={(e) => updateItem(it.key, { qty: e.target.value })}
                  />
                </div>
                <div className="col-span-4 sm:col-span-2 flex items-center justify-end gap-2 pb-2">
                  <span className="text-sm font-medium text-slate-800">{fm(itemCents(it))}</span>
                  <button
                    type="button"
                    onClick={() => removeItem(it.key)}
                    disabled={items.length === 1}
                    aria-label={`ลบเมนูที่ ${idx + 1}`}
                    className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {splitType === "by_item" && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-slate-500">ใครกิน:</span>
                  {participants.length === 0 ? (
                    <span className="text-xs text-amber-600">เลือกคนที่ร่วมหารก่อน</span>
                  ) : (
                    <>
                      {participants.map((p) => {
                        const on = it.eaters.includes(p.id);
                        return (
                          <button
                            key={p.id}
                            type="button"
                            aria-pressed={on}
                            onClick={() => toggleEater(it, p.id)}
                            className={`rounded-full border px-2 py-0.5 text-xs transition ${
                              on
                                ? "border-brand-500 bg-brand-50 text-brand-700"
                                : "border-slate-200 text-slate-500 hover:bg-slate-50"
                            }`}
                          >
                            {p.name}
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        className="text-xs text-brand-600 hover:underline"
                        onClick={() =>
                          updateItem(it.key, {
                            eaters: it.eaters.length === participantIds.length ? [] : [...participantIds],
                          })
                        }
                      >
                        {it.eaters.length === participantIds.length ? "ไม่มีใคร" : "ทุกคน"}
                      </button>
                    </>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>

        <button type="button" onClick={addItem} className="btn-secondary w-full">
          ＋ เพิ่มเมนู
        </button>
      </section>

      {/* ส่วนลด & ค่าส่ง */}
      <section className="card space-y-4">
        {renderTiers()}

        <div className="sm:w-1/2">
          <label className="label" htmlFor="delivery">ค่าส่ง ({currency})</label>
          <input
            id="delivery"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            className="input"
            value={delivery}
            onChange={(e) => setDelivery(e.target.value)}
            placeholder="0.00"
          />
          {splitType === "by_item" && (
            <p className="mt-1 text-xs text-slate-500">ค่าส่งหารเท่ากันในกลุ่มคนที่สั่งเมนู</p>
          )}
        </div>
      </section>

      {/* สรุป */}
      <section className="card space-y-4">
        <h2 className="font-semibold text-slate-900">สรุปยอด</h2>
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-600">ค่าอาหาร ({filledItems.length} เมนู, {pieceCount} ชิ้น)</dt>
            <dd>{fm(calc.subtotalCents)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-600">ส่วนลด</dt>
            <dd className="text-green-700">−{fm(calc.discountCents)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-600">ค่าส่ง</dt>
            <dd>+{fm(calc.deliveryCents)}</dd>
          </div>
          <div className="flex justify-between border-t border-slate-100 pt-2 text-base font-bold">
            <dt>ยอดสุทธิ</dt>
            <dd>{fm(calc.totalCents)}</dd>
          </div>
          {collectedCents > calc.totalCents && (
            <div className="flex justify-between text-xs text-slate-500">
              <dt>ยอดเก็บจริงหลังปัดเศษขึ้นเป็นบาทเต็ม</dt>
              <dd>
                {fm(collectedCents)} (+{fm(collectedCents - calc.totalCents)})
              </dd>
            </div>
          )}
        </dl>

        {participants.length > 0 && (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {participants.map((p) => {
              const d = shares.details[p.id];
              return (
                <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="text-sm text-slate-700">{p.name}</span>
                  {splitType === "custom" ? (
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      aria-label={`ยอดของ ${p.name}`}
                      className="input !w-32 text-right"
                      value={custom[p.id] ?? ""}
                      onChange={(e) => setCustom((c) => ({ ...c, [p.id]: e.target.value }))}
                      placeholder="0.00"
                    />
                  ) : (
                    <div className="text-right">
                      <span className="text-sm font-semibold text-slate-900">{fm(d?.amount ?? 0)}</span>
                      {splitType === "by_item" && d && (d.discount > 0 || d.delivery > 0 || d.rounding > 0) && (
                        <p className="text-xs text-slate-400">
                          อาหาร {fm(d.food)}
                          {d.discount > 0 && ` − ลด ${fm(d.discount)}`}
                          {d.delivery > 0 && ` + ส่ง ${fm(d.delivery)}`}
                          {d.rounding > 0 && ` + ปัดเศษ ${fm(d.rounding)}`}
                        </p>
                      )}
                      {splitType === "equal" && d?.rounding > 0 && (
                        <p className="text-xs text-slate-400">
                          {fm(d.amount - d.rounding)} + ปัดเศษ {fm(d.rounding)}
                        </p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {shares.error && participants.length > 0 && (
          <p className="text-sm text-amber-600">{shares.error}</p>
        )}
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </p>
        )}

        {editWarnings.length > 0 && (
          <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <p className="font-medium">การแก้ไขนี้กระทบคนที่จ่ายแล้วหรือส่งสลิปแล้ว</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
              {editWarnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        <button type="submit" disabled={pending} className="btn-primary w-full">
          {pending ? (
            <>
              <span className="spinner" aria-hidden="true" /> กำลังบันทึก...
            </>
          ) : isEdit ? (
            "บันทึกการแก้ไข"
          ) : (
            "บันทึกบิล"
          )}
        </button>
      </section>
    </form>
  );
}
