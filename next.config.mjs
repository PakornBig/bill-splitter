/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // เก็บหน้าที่เคยเปิดไว้ในฝั่ง browser 30 วินาที กดกลับไปหน้าเดิมจะขึ้นทันที
    // (ทุกครั้งที่บันทึก/แก้ข้อมูล server action เรียก revalidatePath ซึ่งล้าง cache ให้อยู่แล้ว)
    staleTimes: {
      dynamic: 30,
    },
  },
};

export default nextConfig;
