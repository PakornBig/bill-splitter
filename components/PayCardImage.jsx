"use client";

import { useEffect, useRef, useState } from "react";

const W = 720;
const H = 1040;
const FONT = '"Noto Sans Thai", "Leelawadee UI", "Thonburi", Tahoma, sans-serif';

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ตัดข้อความยาวเกินให้มี … ต่อท้าย
function fitText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxWidth) t = t.slice(0, -1);
  return t + "…";
}

// วาดการ์ดจ่ายเงินเป็นรูป PNG
async function renderCard({ qr, title, name, amountText, promptpayText, ownerName, dateText }) {
  if (document.fonts?.ready) await document.fonts.ready;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  const cardX = 40;
  const cardY = 40;
  const cardW = W - 80;
  const cardH = H - 80;

  // พื้นหลัง + การ์ด
  ctx.fillStyle = "#eef6ff";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, cardX, cardY, cardW, cardH, 32);
  ctx.fill();

  // แถบหัวสีน้ำเงิน
  ctx.save();
  roundRect(ctx, cardX, cardY, cardW, cardH, 32);
  ctx.clip();
  ctx.fillStyle = "#2563eb";
  ctx.fillRect(cardX, cardY, cardW, 170);
  ctx.restore();

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = "#dbeafe";
  ctx.font = `500 26px ${FONT}`;
  ctx.fillText("หารบิล · PromptPay", W / 2, 100);

  ctx.fillStyle = "#ffffff";
  ctx.font = `bold 40px ${FONT}`;
  ctx.fillText(fitText(ctx, title, cardW - 60), W / 2, 160);

  // ชื่อ + ยอด
  ctx.fillStyle = "#475569";
  ctx.font = `30px ${FONT}`;
  ctx.fillText(fitText(ctx, `ยอดของ ${name}`, cardW - 60), W / 2, 265);

  ctx.fillStyle = "#0f172a";
  ctx.font = `bold 64px ${FONT}`;
  ctx.fillText(amountText, W / 2, 345);

  // QR
  if (qr) {
    const img = await loadImage(qr);
    const size = 420;
    ctx.imageSmoothingEnabled = false; // ให้ QR คม
    ctx.drawImage(img, (W - size) / 2, 380, size, size);
  }

  // ท้ายการ์ด
  ctx.fillStyle = "#334155";
  ctx.font = `500 26px ${FONT}`;
  ctx.fillText(fitText(ctx, promptpayText, cardW - 60), W / 2, 850);

  ctx.fillStyle = "#64748b";
  ctx.font = `24px ${FONT}`;
  const meta = [ownerName && `เรียกเก็บโดย ${ownerName}`, dateText].filter(Boolean).join(" · ");
  if (meta) ctx.fillText(fitText(ctx, meta, cardW - 60), W / 2, 892);

  ctx.fillStyle = "#94a3b8";
  ctx.font = `22px ${FONT}`;
  ctx.fillText("สแกนด้วยแอปธนาคารได้ทุกธนาคาร", W / 2, 950);

  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

function safeFileName(text) {
  return text.replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, "-").slice(0, 80) || "bill";
}

export default function PayCardImage(props) {
  const { title, name } = props;
  const dialogRef = useRef(null);
  const [image, setImage] = useState(null); // { blob, url }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [canShareFiles, setCanShareFiles] = useState(false);

  const fileName = `${safeFileName(`${title}-${name}`)}.png`;

  // เช็คหลัง mount เพื่อไม่ให้ HTML ฝั่ง server กับ browser ไม่ตรงกัน
  useEffect(() => {
    try {
      const probe = new File([new Blob()], "probe.png", { type: "image/png" });
      setCanShareFiles(!!navigator.canShare?.({ files: [probe] }));
    } catch {
      setCanShareFiles(false);
    }
  }, []);

  useEffect(() => () => image && URL.revokeObjectURL(image.url), [image]);

  async function ensureImage() {
    if (image) return image;
    setBusy(true);
    setError(null);
    try {
      const blob = await renderCard(props);
      if (!blob) throw new Error("toBlob failed");
      const next = { blob, url: URL.createObjectURL(blob) };
      setImage(next);
      return next;
    } catch {
      setError("สร้างรูปไม่สำเร็จ ลองกดค้างที่ QR ด้านบนเพื่อบันทึกแทน");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function preview() {
    const img = await ensureImage();
    if (img) dialogRef.current?.showModal();
  }

  async function download() {
    const img = await ensureImage();
    if (!img) return;
    const a = document.createElement("a");
    a.href = img.url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function share() {
    const img = await ensureImage();
    if (!img) return;
    const file = new File([img.blob], fileName, { type: "image/png" });
    try {
      await navigator.share({ files: [file], title, text: `ยอดของ ${name}` });
    } catch (e) {
      if (e?.name !== "AbortError") download(); // แชร์ไม่ได้ -> ดาวน์โหลดแทน
    }
  }

  return (
    <div className="mt-3">
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" onClick={preview} disabled={busy} className="btn-secondary !px-3 !py-1.5 text-xs">
          {busy ? <span className="spinner" aria-hidden="true" /> : "👁"} ดูรูป
        </button>
        <button type="button" onClick={download} disabled={busy} className="btn-secondary !px-3 !py-1.5 text-xs">
          ⬇ ดาวน์โหลด
        </button>
        {canShareFiles && (
          <button type="button" onClick={share} disabled={busy} className="btn-secondary !px-3 !py-1.5 text-xs">
            📤 แชร์รูป
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {error}
        </p>
      )}

      <dialog
        ref={dialogRef}
        aria-label={`รูปจ่ายเงินของ ${name}`}
        className="w-[min(92vw,420px)] rounded-2xl p-0 backdrop:bg-slate-900/60"
        onClick={(e) => {
          // คลิกพื้นหลังเพื่อปิด
          if (e.target === dialogRef.current) dialogRef.current.close();
        }}
      >
        <div className="p-3">
          {image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image.url} alt={`การ์ดจ่ายเงินของ ${name}`} className="w-full rounded-xl" />
          )}
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={download} className="btn-primary flex-1">
              ⬇ ดาวน์โหลด
            </button>
            {canShareFiles && (
              <button type="button" onClick={share} className="btn-secondary flex-1">
                📤 แชร์
              </button>
            )}
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="btn-secondary"
              autoFocus
            >
              ปิด
            </button>
          </div>
          <p className="mt-2 text-center text-xs text-slate-500">
            ถ้าดาวน์โหลดใน LINE ไม่ได้ ให้กดค้างที่รูปแล้วเลือกบันทึก
          </p>
        </div>
      </dialog>
    </div>
  );
}
