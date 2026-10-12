"use client";

import { useRef, useState, useTransition } from "react";
import { changePassword, updateProfile } from "@/app/(app)/settings/actions";

function Message({ msg }) {
  if (!msg) return null;
  if (msg.error)
    return <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{msg.error}</p>;
  if (msg.success)
    return <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{msg.success}</p>;
  return null;
}

export default function SettingsForms({ email, displayName, currency, promptpayId }) {
  const [profileMsg, setProfileMsg] = useState(null);
  const [pwMsg, setPwMsg] = useState(null);
  const [pending, startTransition] = useTransition();
  const pwRef = useRef(null);

  return (
    <div className="space-y-5">
      <form
        className="card space-y-4"
        action={(fd) =>
          startTransition(async () => setProfileMsg(await updateProfile(fd)))
        }
      >
        <h2 className="font-semibold text-slate-900">ข้อมูลส่วนตัว</h2>
        <Message msg={profileMsg} />
        <div>
          <label className="label" htmlFor="email">อีเมล</label>
          <input id="email" className="input bg-slate-50" value={email} disabled />
        </div>
        <div>
          <label className="label" htmlFor="display_name">ชื่อที่แสดง</label>
          <input id="display_name" name="display_name" className="input" defaultValue={displayName} />
        </div>
        <div>
          <label className="label" htmlFor="currency">สกุลเงิน</label>
          <select id="currency" name="currency" className="input" defaultValue={currency}>
            <option value="THB">THB - บาท</option>
            <option value="USD">USD - ดอลลาร์สหรัฐ</option>
            <option value="EUR">EUR - ยูโร</option>
            <option value="JPY">JPY - เยน</option>
            <option value="GBP">GBP - ปอนด์</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="promptpay_id">หมายเลข PromptPay (สำหรับ QR รับเงิน)</label>
          <input
            id="promptpay_id"
            name="promptpay_id"
            inputMode="numeric"
            autoComplete="off"
            className="input"
            defaultValue={promptpayId}
            placeholder="เบอร์มือถือ 10 หลัก หรือเลขบัตรประชาชน 13 หลัก"
            aria-describedby="promptpay_help"
          />
          <p id="promptpay_help" className="mt-1 text-xs text-slate-500">
            หมายเลขนี้จะอยู่ใน QR ที่เพื่อนสแกน (QR ใช้ได้เฉพาะสกุลเงิน THB)
          </p>
        </div>
        <button type="submit" disabled={pending} className="btn-primary">บันทึก</button>
      </form>

      <form
        ref={pwRef}
        className="card space-y-4"
        action={(fd) =>
          startTransition(async () => {
            const res = await changePassword(fd);
            setPwMsg(res);
            if (res.success) pwRef.current?.reset();
          })
        }
      >
        <h2 className="font-semibold text-slate-900">เปลี่ยนรหัสผ่าน</h2>
        <Message msg={pwMsg} />
        <div>
          <label className="label" htmlFor="password">รหัสผ่านใหม่</label>
          <input id="password" name="password" type="password" minLength={6} required className="input" />
        </div>
        <div>
          <label className="label" htmlFor="confirm">ยืนยันรหัสผ่านใหม่</label>
          <input id="confirm" name="confirm" type="password" minLength={6} required className="input" />
        </div>
        <button type="submit" disabled={pending} className="btn-primary">เปลี่ยนรหัสผ่าน</button>
      </form>
    </div>
  );
}
