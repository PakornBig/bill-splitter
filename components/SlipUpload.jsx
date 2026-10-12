"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const MAX_SIDE = 1600; // ย่อด้านยาวสุดเหลือ 1600px พออ่านสลิปได้ชัด
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

// ย่อรูปและแปลงเป็น JPEG ในเครื่องก่อนอัปโหลด (สลิปจากมือถือมักใหญ่ 2-5MB)
async function compressImage(file) {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    if (blob) return { blob, type: "image/jpeg", ext: "jpg" };
  } catch {
    // เบราว์เซอร์ถอดรหัสไฟล์ไม่ได้ (เช่น HEIC บางเครื่อง) -> ใช้ไฟล์เดิมถ้ารองรับ
  }
  if (ALLOWED.includes(file.type)) {
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    return { blob: file, type: file.type, ext };
  }
  return null;
}

export default function SlipUpload({ token, shareId, submitted }) {
  const router = useRouter();
  const inputRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | uploading | done | error
  const [message, setMessage] = useState(null);

  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // ให้เลือกไฟล์เดิมซ้ำได้
    if (!file) return;

    setMessage(null);
    if (!file.type.startsWith("image/")) {
      setStatus("error");
      setMessage("กรุณาเลือกไฟล์รูปภาพ");
      return;
    }

    setStatus("uploading");
    const img = await compressImage(file);
    if (!img) {
      setStatus("error");
      setMessage("ไม่รองรับไฟล์นี้ กรุณาแคปหน้าจอสลิปแล้วเลือกรูปใหม่ (JPG/PNG)");
      return;
    }
    if (img.blob.size > MAX_BYTES) {
      setStatus("error");
      setMessage("ไฟล์ใหญ่เกิน 5MB");
      return;
    }

    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(img.blob);
    });

    const supabase = createClient();
    const random = Math.random().toString(36).slice(2, 10);
    const path = `${token}/${shareId}/${Date.now()}-${random}.${img.ext}`;

    const { error: upErr } = await supabase.storage
      .from("slips")
      .upload(path, img.blob, { contentType: img.type, upsert: false });
    if (upErr) {
      setStatus("error");
      setMessage("อัปโหลดไม่สำเร็จ: " + upErr.message);
      return;
    }

    const { error: rpcErr } = await supabase.rpc("submit_slip", {
      p_token: token,
      p_share_id: shareId,
      p_path: path,
    });
    if (rpcErr) {
      setStatus("error");
      setMessage("บันทึกสลิปไม่สำเร็จ: " + rpcErr.message);
      return;
    }

    setStatus("done");
    setMessage("ส่งสลิปแล้ว รอเจ้าของบิลตรวจสอบ");
    router.refresh();
  }

  const uploading = status === "uploading";

  return (
    <div className="mt-4 border-t border-slate-100 pt-4 text-left">
      {submitted && status === "idle" && (
        <p className="mb-2 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700">
          📎 ส่งสลิปแล้ว รอเจ้าของบิลตรวจสอบ
        </p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        id={`slip-${shareId}`}
        onChange={handleFile}
        disabled={uploading}
      />
      <label
        htmlFor={`slip-${shareId}`}
        className={`btn-primary w-full cursor-pointer ${uploading ? "pointer-events-none opacity-60" : ""}`}
      >
        {uploading ? (
          <>
            <span className="spinner" aria-hidden="true" /> กำลังอัปโหลด...
          </>
        ) : submitted || status === "done" ? (
          "📎 ส่งสลิปใหม่"
        ) : (
          "📎 โอนแล้ว แนบสลิป"
        )}
      </label>

      {message && (
        <p
          role={status === "error" ? "alert" : "status"}
          className={`mt-2 text-sm ${status === "error" ? "text-red-600" : "text-green-700"}`}
        >
          {message}
        </p>
      )}

      {preview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview}
          alt="ตัวอย่างสลิปที่เลือก"
          className="mx-auto mt-3 max-h-64 rounded-lg border border-slate-200"
        />
      )}
    </div>
  );
}
