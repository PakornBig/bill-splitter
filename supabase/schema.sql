-- ===================================================================
-- Bill Splitter - Database Schema
-- รันไฟล์นี้ใน Supabase Dashboard -> SQL Editor -> New query
-- ===================================================================

-- ตารางโปรไฟล์ผู้ใช้ (ผูกกับ auth.users ของ Supabase)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  currency text not null default 'THB',
  created_at timestamptz not null default now()
);

-- ตารางรายชื่อคน (เพื่อน/คนที่ร่วมหารบิล) ของแต่ละ user
create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  note text,
  created_at timestamptz not null default now()
);

-- ตารางบิล
create table if not exists public.bills (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  total_amount numeric(12, 2) not null default 0,
  split_type text not null default 'equal', -- equal | custom
  note text,
  created_at timestamptz not null default now()
);

-- ตารางรายการแบ่งจ่ายในแต่ละบิล (ต่อ 1 คน)
create table if not exists public.bill_shares (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references public.bills(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  amount numeric(12, 2) not null default 0,
  is_paid boolean not null default false,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

-- ===================================================================
-- Row Level Security (RLS): ให้แต่ละ user เห็น/แก้ไขได้เฉพาะข้อมูลตัวเอง
-- ===================================================================
alter table public.profiles enable row level security;
alter table public.people enable row level security;
alter table public.bills enable row level security;
alter table public.bill_shares enable row level security;

-- profiles
drop policy if exists "own profile select" on public.profiles;
create policy "own profile select" on public.profiles
  for select using (auth.uid() = id);
drop policy if exists "own profile upsert" on public.profiles;
create policy "own profile upsert" on public.profiles
  for insert with check (auth.uid() = id);
drop policy if exists "own profile update" on public.profiles;
create policy "own profile update" on public.profiles
  for update using (auth.uid() = id);

-- people
drop policy if exists "own people all" on public.people;
create policy "own people all" on public.people
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- bills
drop policy if exists "own bills all" on public.bills;
create policy "own bills all" on public.bills
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- bill_shares: เข้าถึงได้ถ้าเป็นเจ้าของบิลที่ share นั้นอยู่
drop policy if exists "own bill_shares all" on public.bill_shares;
create policy "own bill_shares all" on public.bill_shares
  for all using (
    exists (
      select 1 from public.bills b
      where b.id = bill_shares.bill_id and b.owner_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.bills b
      where b.id = bill_shares.bill_id and b.owner_id = auth.uid()
    )
    and exists (
      select 1 from public.people p
      where p.id = bill_shares.person_id and p.owner_id = auth.uid()
    )
  );

-- ===================================================================
-- Trigger: สร้าง profile อัตโนมัติเมื่อมี user สมัครใหม่
-- ===================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ===================================================================
-- เมนูอาหาร ส่วนลดขั้นบันได และค่าส่ง
-- ===================================================================

-- คอลัมน์สรุปยอดในบิล
alter table public.bills add column if not exists subtotal numeric(12, 2) not null default 0;
alter table public.bills add column if not exists discount_amount numeric(12, 2) not null default 0;
alter table public.bills add column if not exists delivery_fee numeric(12, 2) not null default 0;
-- ขั้นส่วนลด เช่น [{"minSpend":300,"type":"amount","value":40},{"minSpend":0,"type":"percent","value":20,"maxDiscount":100}]
-- minSpend = 0 คือไม่มียอดขั้นต่ำ, maxDiscount (ไม่บังคับ) ใช้กับ percent เท่านั้น
alter table public.bills add column if not exists discount_tiers jsonb not null default '[]'::jsonb;

-- รายการเมนูในบิล
create table if not exists public.bill_items (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references public.bills(id) on delete cascade,
  name text not null,
  unit_price numeric(12, 2) not null default 0,
  quantity integer not null default 1 check (quantity > 0),
  position integer not null default 0,
  created_at timestamptz not null default now()
);

-- ใครกินเมนูไหนบ้าง (ใช้ตอนหารตามเมนู)
create table if not exists public.bill_item_people (
  item_id uuid not null references public.bill_items(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  primary key (item_id, person_id)
);

alter table public.bill_items enable row level security;
alter table public.bill_item_people enable row level security;

drop policy if exists "own bill_items all" on public.bill_items;
create policy "own bill_items all" on public.bill_items
  for all using (
    exists (
      select 1 from public.bills b
      where b.id = bill_items.bill_id and b.owner_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.bills b
      where b.id = bill_items.bill_id and b.owner_id = auth.uid()
    )
  );

drop policy if exists "own bill_item_people all" on public.bill_item_people;
create policy "own bill_item_people all" on public.bill_item_people
  for all using (
    exists (
      select 1 from public.bill_items i
      join public.bills b on b.id = i.bill_id
      where i.id = bill_item_people.item_id and b.owner_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.bill_items i
      join public.bills b on b.id = i.bill_id
      where i.id = bill_item_people.item_id and b.owner_id = auth.uid()
    )
    and exists (
      select 1 from public.people p
      where p.id = bill_item_people.person_id and p.owner_id = auth.uid()
    )
  );

-- ===================================================================
-- ลิงก์จ่ายเงินผ่าน PromptPay QR
-- ===================================================================

-- หมายเลข PromptPay ของเจ้าของบิล (เบอร์มือถือ / เลขบัตรประชาชน / e-Wallet)
alter table public.profiles add column if not exists promptpay_id text;

-- token สุ่มสำหรับลิงก์สาธารณะ /pay/<token> (บิลเก่าจะได้ token อัตโนมัติ)
alter table public.bills add column if not exists share_token uuid not null default gen_random_uuid();
create unique index if not exists bills_share_token_idx on public.bills(share_token);

-- ฟังก์ชันให้คนที่มีลิงก์ (ไม่ต้อง login) ดูข้อมูลได้เฉพาะบิลนั้นบิลเดียว
-- security definer = อ่านข้ามข้อจำกัด RLS ได้ แต่คืนเฉพาะ field ที่เลือกไว้ด้านล่าง
create or replace function public.get_shared_bill(p_token uuid)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'title', b.title,
    'note', b.note,
    'created_at', b.created_at,
    'split_type', b.split_type,
    'subtotal', b.subtotal,
    'discount_amount', b.discount_amount,
    'delivery_fee', b.delivery_fee,
    'total_amount', b.total_amount,
    'owner_name', pr.display_name,
    'currency', coalesce(pr.currency, 'THB'),
    'promptpay_id', pr.promptpay_id,
    'items', coalesce((
      select json_agg(json_build_object(
        'name', i.name,
        'unit_price', i.unit_price,
        'quantity', i.quantity,
        'eaters', coalesce((
          select json_agg(pe.name order by pe.name)
          from public.bill_item_people ip
          join public.people pe on pe.id = ip.person_id
          where ip.item_id = i.id
        ), '[]'::json)
      ) order by i.position)
      from public.bill_items i
      where i.bill_id = b.id
    ), '[]'::json),
    'shares', coalesce((
      select json_agg(json_build_object(
        'id', s.id,
        'name', pe.name,
        'amount', s.amount,
        'is_paid', s.is_paid
      ) order by pe.name)
      from public.bill_shares s
      join public.people pe on pe.id = s.person_id
      where s.bill_id = b.id
    ), '[]'::json)
  )
  from public.bills b
  left join public.profiles pr on pr.id = b.owner_id
  where b.share_token = p_token;
$$;

revoke all on function public.get_shared_bill(uuid) from public;
grant execute on function public.get_shared_bill(uuid) to anon, authenticated;

-- ===================================================================
-- แนบสลิปโอนเงิน (เพื่อนอัปโหลดผ่านลิงก์ -> เจ้าของบิลตรวจและยืนยัน)
-- ===================================================================

alter table public.bill_shares add column if not exists slip_path text;
alter table public.bill_shares add column if not exists slip_submitted_at timestamptz;

-- bucket แบบ private จำกัดเฉพาะรูป ไม่เกิน 5MB
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('slips', 'slips', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- path ของไฟล์: <share_token>/<bill_share_id>/<ชื่อไฟล์>
-- อัปโหลดได้เฉพาะถ้า token กับ share ตรงกัน และ share นั้นยังไม่จ่าย
create or replace function public.can_upload_slip(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.bills b
    join public.bill_shares s on s.bill_id = b.id
    where b.share_token::text = (storage.foldername(object_name))[1]
      and s.id::text = (storage.foldername(object_name))[2]
      and s.is_paid = false
  );
$$;

-- เป็นเจ้าของบิลที่ไฟล์นี้อยู่หรือไม่
create or replace function public.owns_slip(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.bills b
    where b.share_token::text = (storage.foldername(object_name))[1]
      and b.owner_id = auth.uid()
  );
$$;

grant execute on function public.can_upload_slip(text) to anon, authenticated;
grant execute on function public.owns_slip(text) to authenticated;

-- คนมีลิงก์: อัปโหลดได้อย่างเดียว (ดู/ลบ/เขียนทับไม่ได้)
drop policy if exists "slips upload via share link" on storage.objects;
create policy "slips upload via share link" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'slips' and public.can_upload_slip(name));

-- เจ้าของบิล: ดูและลบสลิปของบิลตัวเอง
drop policy if exists "slips owner read" on storage.objects;
create policy "slips owner read" on storage.objects
  for select to authenticated
  using (bucket_id = 'slips' and public.owns_slip(name));

drop policy if exists "slips owner delete" on storage.objects;
create policy "slips owner delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'slips' and public.owns_slip(name));

-- บันทึกว่าส่งสลิปแล้ว (เรียกหลังอัปโหลดไฟล์สำเร็จ)
create or replace function public.submit_slip(p_token uuid, p_share_id uuid, p_path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_path is null or p_path not like (p_token::text || '/' || p_share_id::text || '/%') then
    raise exception 'invalid slip path';
  end if;

  if not exists (select 1 from storage.objects where bucket_id = 'slips' and name = p_path) then
    raise exception 'slip file not found';
  end if;

  update public.bill_shares s
  set slip_path = p_path,
      slip_submitted_at = now()
  from public.bills b
  where b.id = s.bill_id
    and b.share_token = p_token
    and s.id = p_share_id
    and s.is_paid = false;

  if not found then
    raise exception 'share not found or already paid';
  end if;
end;
$$;

revoke all on function public.submit_slip(uuid, uuid, text) from public;
grant execute on function public.submit_slip(uuid, uuid, text) to anon, authenticated;

-- อัปเดตข้อมูลที่หน้าลิงก์เห็น: เพิ่มสถานะว่าส่งสลิปแล้วหรือยัง (ไม่ส่ง path รูปออกไป)
create or replace function public.get_shared_bill(p_token uuid)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'title', b.title,
    'note', b.note,
    'created_at', b.created_at,
    'split_type', b.split_type,
    'subtotal', b.subtotal,
    'discount_amount', b.discount_amount,
    'delivery_fee', b.delivery_fee,
    'total_amount', b.total_amount,
    'owner_name', pr.display_name,
    'currency', coalesce(pr.currency, 'THB'),
    'promptpay_id', pr.promptpay_id,
    'items', coalesce((
      select json_agg(json_build_object(
        'name', i.name,
        'unit_price', i.unit_price,
        'quantity', i.quantity,
        'eaters', coalesce((
          select json_agg(pe.name order by pe.name)
          from public.bill_item_people ip
          join public.people pe on pe.id = ip.person_id
          where ip.item_id = i.id
        ), '[]'::json)
      ) order by i.position)
      from public.bill_items i
      where i.bill_id = b.id
    ), '[]'::json),
    'shares', coalesce((
      select json_agg(json_build_object(
        'id', s.id,
        'name', pe.name,
        'amount', s.amount,
        'is_paid', s.is_paid,
        'slip_submitted', s.slip_path is not null,
        'slip_submitted_at', s.slip_submitted_at
      ) order by pe.name)
      from public.bill_shares s
      join public.people pe on pe.id = s.person_id
      where s.bill_id = b.id
    ), '[]'::json)
  )
  from public.bills b
  left join public.profiles pr on pr.id = b.owner_id
  where b.share_token = p_token;
$$;

-- ===================================================================
-- สร้าง profile ให้ user ที่สมัครไว้ก่อนรัน schema นี้ (ถ้ามี)
-- ===================================================================
insert into public.profiles (id, display_name)
select u.id, coalesce(u.raw_user_meta_data->>'display_name', split_part(u.email, '@', 1))
from auth.users u
on conflict (id) do nothing;

-- ให้ Supabase API รู้จักตารางใหม่ทันที
notify pgrst, 'reload schema';
