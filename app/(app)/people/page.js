import { createClient } from "@/lib/supabase/server";
import PeopleManager from "@/components/PeopleManager";

export const dynamic = "force-dynamic";

export default async function PeoplePage() {
  const supabase = createClient();
  const { data } = await supabase
    .from("people")
    .select("*")
    .order("created_at", { ascending: true });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">เพิ่มชื่อคน</h1>
        <p className="text-sm text-slate-500">
          รายชื่อเพื่อนหรือคนที่ร่วมหารบิลกับคุณ
        </p>
      </div>
      <PeopleManager people={data ?? []} />
    </div>
  );
}
