import { getProfile, getUser } from "@/lib/supabase/queries";
import SettingsForms from "@/components/SettingsForms";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [user, profile] = await Promise.all([getUser(), getProfile()]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">ตั้งค่าข้อมูล</h1>
        <p className="text-sm text-slate-500">จัดการข้อมูลส่วนตัวและบัญชี</p>
      </div>
      <SettingsForms
        email={user?.email ?? ""}
        displayName={profile?.display_name ?? ""}
        currency={profile?.currency ?? "THB"}
        promptpayId={profile?.promptpay_id ?? ""}
      />
    </div>
  );
}
