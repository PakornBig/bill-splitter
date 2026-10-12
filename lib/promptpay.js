// สร้าง payload ของ Thai QR / PromptPay ตามมาตรฐาน EMVCo
// แปลงเป็นรูป QR ได้ด้วย library "qrcode"

const PROMPTPAY_AID = "A000000677010111";

function tlv(id, value) {
  return id + String(value.length).padStart(2, "0") + value;
}

// CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF) ตามที่ Thai QR กำหนด
function crc16(str) {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/**
 * ตรวจและจัดรูปแบบหมายเลข PromptPay
 * รองรับ: เบอร์มือถือ 10 หลัก, เลขบัตรประชาชน/เลขผู้เสียภาษี 13 หลัก, e-Wallet ID 15 หลัก
 * คืนค่า { type, value } หรือ null ถ้ารูปแบบไม่ถูกต้อง
 */
export function normalizePromptPayId(raw) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (/^0\d{9}$/.test(digits)) return { type: "phone", value: digits };
  if (/^\d{13}$/.test(digits)) return { type: "national_id", value: digits };
  if (/^\d{15}$/.test(digits)) return { type: "ewallet", value: digits };
  return null;
}

/** แสดงหมายเลขแบบปิดบางส่วน เช่น 08x-xxx-5678 */
export function maskPromptPayId(raw) {
  const n = normalizePromptPayId(raw);
  if (!n) return "";
  const last4 = n.value.slice(-4);
  if (n.type === "phone") return `${n.value.slice(0, 2)}x-xxx-${last4}`;
  return `${"x".repeat(n.value.length - 4)}${last4}`;
}

/**
 * สร้างข้อความสำหรับ QR PromptPay
 * @param {string} id หมายเลข PromptPay
 * @param {number} [amount] ยอดเงิน (บาท) ถ้าไม่ใส่ผู้จ่ายจะกรอกเอง
 * @returns {string | null}
 */
export function buildPromptPayPayload(id, amount) {
  const n = normalizePromptPayId(id);
  if (!n) return null;

  let account;
  if (n.type === "phone") {
    // 0812345678 -> 0066812345678
    account = tlv("01", "0066" + n.value.slice(1));
  } else if (n.type === "national_id") {
    account = tlv("02", n.value);
  } else {
    account = tlv("03", n.value);
  }

  const hasAmount = Number.isFinite(amount) && amount > 0;
  const parts = [
    tlv("00", "01"),
    tlv("01", hasAmount ? "12" : "11"), // 12 = ใช้ครั้งเดียว (มียอด), 11 = ใช้ซ้ำได้
    tlv("29", tlv("00", PROMPTPAY_AID) + account),
    tlv("58", "TH"),
    tlv("53", "764"), // THB
  ];
  if (hasAmount) parts.push(tlv("54", amount.toFixed(2)));

  const data = parts.join("") + "6304";
  return data + crc16(data);
}
