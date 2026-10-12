"use client";

import { useRef, useState, useTransition } from "react";
import { addPerson, deletePerson, updatePerson } from "@/app/(app)/people/actions";

export default function PeopleManager({ people }) {
  const formRef = useRef(null);
  const [error, setError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [pending, startTransition] = useTransition();

  function onAdd(formData) {
    setError(null);
    startTransition(async () => {
      const res = await addPerson(formData);
      if (res.error) setError(res.error);
      else formRef.current?.reset();
    });
  }

  function onSaveEdit(id) {
    startTransition(async () => {
      const res = await updatePerson(id, editName);
      if (res.error) setError(res.error);
      else setEditingId(null);
    });
  }

  return (
    <div className="space-y-4">
      <form ref={formRef} action={onAdd} className="card space-y-3">
        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div>
            <label className="label" htmlFor="name">ชื่อ</label>
            <input id="name" name="name" required className="input" placeholder="เช่น บอส" />
          </div>
          <div>
            <label className="label" htmlFor="note">หมายเหตุ (ไม่บังคับ)</label>
            <input id="note" name="note" className="input" placeholder="เช่น เพื่อนที่ทำงาน" />
          </div>
          <button type="submit" disabled={pending} className="btn-primary">
            เพิ่ม
          </button>
        </div>
      </form>

      <div className="card !p-0">
        {people.length === 0 ? (
          <p className="p-5 text-center text-sm text-slate-500">ยังไม่มีรายชื่อ</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {people.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3">
                {editingId === p.id ? (
                  <input
                    className="input"
                    aria-label="แก้ไขชื่อ"
                    value={editName}
                    autoFocus
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && onSaveEdit(p.id)}
                  />
                ) : (
                  <div>
                    <p className="font-medium text-slate-800">{p.name}</p>
                    {p.note && <p className="text-xs text-slate-500">{p.note}</p>}
                  </div>
                )}
                <div className="flex shrink-0 gap-2">
                  {editingId === p.id ? (
                    <>
                      <button
                        className="btn-primary !px-3 !py-1 text-xs"
                        disabled={pending}
                        onClick={() => onSaveEdit(p.id)}
                      >
                        บันทึก
                      </button>
                      <button
                        className="btn-secondary !px-3 !py-1 text-xs"
                        onClick={() => setEditingId(null)}
                      >
                        ยกเลิก
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="btn-secondary !px-3 !py-1 text-xs"
                        onClick={() => {
                          setEditingId(p.id);
                          setEditName(p.name);
                        }}
                      >
                        แก้ไข
                      </button>
                      <button
                        className="btn-danger !px-3 !py-1 text-xs"
                        disabled={pending}
                        onClick={() => {
                          if (confirm(`ลบ "${p.name}"? รายการหารในบิลของคนนี้จะถูกลบด้วย`)) {
                            startTransition(() => deletePerson(p.id));
                          }
                        }}
                      >
                        ลบ
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
