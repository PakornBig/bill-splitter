"use client";

import { useState } from "react";
import Link from "next/link";
import { register } from "../actions";

export default function RegisterPage() {
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(formData) {
    setLoading(true);
    setError(null);
    setSuccess(null);
    const res = await register(formData);
    if (res?.error) {
      setError(res.error);
    } else if (res?.success) {
      setSuccess(res.success);
    }
    setLoading(false);
  }

  return (
    <form action={handleSubmit} className="card space-y-4">
      <h2 className="text-lg font-semibold text-slate-900">สมัครสมาชิก</h2>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      )}
      {success && (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
          {success}
        </p>
      )}

      <div>
        <label className="label" htmlFor="display_name">
          ชื่อที่แสดง
        </label>
        <input
          id="display_name"
          name="display_name"
          type="text"
          required
          className="input"
          placeholder="เช่น สมชาย"
        />
      </div>

      <div>
        <label className="label" htmlFor="email">
          อีเมล
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className="input"
          placeholder="you@example.com"
        />
      </div>

      <div>
        <label className="label" htmlFor="password">
          รหัสผ่าน
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={6}
          className="input"
          placeholder="อย่างน้อย 6 ตัวอักษร"
        />
      </div>

      <button type="submit" disabled={loading} className="btn-primary w-full">
        {loading ? (
          <>
            <span className="spinner" aria-hidden="true" /> กำลังสมัคร...
          </>
        ) : (
          "สมัครสมาชิก"
        )}
      </button>

      <p className="text-center text-sm text-slate-500">
        มีบัญชีแล้ว?{" "}
        <Link href="/login" className="font-medium text-brand-600 hover:underline">
          เข้าสู่ระบบ
        </Link>
      </p>
    </form>
  );
}
