-- ============================================================================
-- 14 дүгээр сургуулийн шатрын клуб — өгөгдлийн сангийн бүтэц (Supabase / PostgreSQL)
--
-- Ажиллуулах: Supabase Dashboard → SQL Editor → энэ файлыг бүхэлд нь хуулж тавиад Run.
-- Дахин ажиллуулахад аюулгүй (байгаа хүснэгт, өгөгдлийг устгахгүй).
--
-- Хамгаалалтын зарчим:
--   1. Хүснэгтүүдэд Row Level Security (RLS) асаалттай. Нэвтрээгүй зочин хүснэгтээс
--      шууд юу ч уншиж, бичиж чадахгүй.
--   2. Зочин зөвхөн public_athletes, public_achievements гэсэн хоёр «харагдац»-аас
--      уншина. Тэнд зөвхөн НИЙТЭЛСЭН бөгөөд ЗӨВШӨӨРӨЛ БАТАЛГААЖСАН мөр гарна.
--   3. Бичих эрх зөвхөн admins хүснэгтэд бүртгэгдсэн хэрэглэгчид бий. Supabase-д
--      бүртгэлтэй ч admins-д байхгүй хэрэглэгч юу ч өөрчилж чадахгүй.
--   4. Зураг хувийн (private) саванд хадгалагдана. Зочин зөвхөн нийтэлсэн, зураг
--      нийтлэх зөвшөөрөлтэй тамирчны зургийг татаж чадна.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Админ хэрэглэгчдийн жагсаалт
-- ---------------------------------------------------------------------------

create table if not exists public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  note       text,
  created_at timestamptz not null default now()
);

-- Бодлого (policy) тодорхойлоогүй тул API-аар хэн ч энэ хүснэгтийг уншиж, өөрчилж чадахгүй.
-- Админ нэмэх, хасахыг зөвхөн SQL Editor-оос хийнэ (ADMIN-SETUP.md-г үзнэ үү).
alter table public.admins enable row level security;

-- Одоо нэвтэрсэн хэрэглэгч админ мөн эсэх.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Тамирчид
-- ---------------------------------------------------------------------------

create table if not exists public.athletes (
  id              uuid primary key default gen_random_uuid(),
  full_name       text not null check (char_length(btrim(full_name)) between 1 and 120),
  grade           text check (char_length(grade) <= 40),            -- Сурч буй анги
  class_teacher   text check (char_length(class_teacher) <= 120),   -- Анги хариуцсан багш
  national_title  text check (char_length(national_title) <= 80),   -- Дотоодын цол
  national_rating integer check (national_rating between 0 and 4000),
  intl_title      text check (char_length(intl_title) <= 80),       -- Олон улсын цол
  intl_rating     integer check (intl_rating between 0 and 4000),
  photo_path      text,                                             -- Зургийн сав доторх зам
  consent_info    boolean not null default false,  -- Нэр, мэдээлэл нийтлэх зөвшөөрөл авсан
  consent_photo   boolean not null default false,  -- Зураг нийтлэх зөвшөөрөл авсан
  is_published    boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- Зөвшөөрөл баталгаажаагүй тамирчныг нийтлэх боломжгүй (сервер талд шалгана).
  constraint publish_requires_consent check (not is_published or consent_info)
);

-- ---------------------------------------------------------------------------
-- 3. Тэмцээний амжилт (тамирчинтай холбогдоно)
-- ---------------------------------------------------------------------------

create table if not exists public.achievements (
  id              uuid primary key default gen_random_uuid(),
  athlete_id      uuid not null references public.athletes (id) on delete cascade,
  tournament_name text not null check (char_length(btrim(tournament_name)) between 1 and 200),
  result          text not null check (char_length(btrim(result)) between 1 and 120),
  event_date      date,
  description     text check (char_length(description) <= 600),
  is_published    boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists achievements_athlete_id_idx on public.achievements (athlete_id);

-- Гол амжилт: тамирчны картан дээр харуулах 2–3 том амжилт (тамирчны маягтаас бөглөнө).
-- Өмнө нь үүсгэсэн өгөгдлийн санд ч энэ мөр баганыг аюулгүй нэмнэ.
alter table public.achievements
  add column if not exists is_featured boolean not null default false;

-- Мөр өөрчлөгдөх бүрт updated_at-ийг шинэчилнэ.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists athletes_touch_updated_at on public.athletes;
create trigger athletes_touch_updated_at
  before update on public.athletes
  for each row execute function public.touch_updated_at();

drop trigger if exists achievements_touch_updated_at on public.achievements;
create trigger achievements_touch_updated_at
  before update on public.achievements
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 4. Хандах эрх (Row Level Security)
-- ---------------------------------------------------------------------------

alter table public.athletes     enable row level security;
alter table public.achievements enable row level security;

-- Зочин (anon) хүснэгтэд шууд хандахгүй; зөвхөн доорх харагдацуудаар уншина.
revoke all on public.athletes, public.achievements, public.admins from public, anon, authenticated;
grant select, insert, update, delete on public.athletes, public.achievements to authenticated;

drop policy if exists "Админ тамирчдыг удирдана" on public.athletes;
create policy "Админ тамирчдыг удирдана" on public.athletes
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Админ амжилтыг удирдана" on public.achievements;
create policy "Админ амжилтыг удирдана" on public.achievements
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 5. Олон нийтэд харагдах хэсэг
--    Харагдац нь эзэмшигчийнхээ эрхээр ажилладаг тул RLS-ийг тойрч, зөвхөн доорх
--    нөхцөлд тохирсон мөр, багануудыг гаргана. (Supabase-ийн «Security Definer View»
--    анхааруулга энэ хоёр харагдацад зориуд гарна — зөв тохиргоо.)
-- ---------------------------------------------------------------------------

create or replace view public.public_athletes as
  select
    id,
    full_name,
    grade,
    class_teacher,
    national_title,
    national_rating,
    intl_title,
    intl_rating,
    case when consent_photo then photo_path end as photo_path  -- зөвшөөрөлгүй бол зураг нуугдана
  from public.athletes
  where is_published and consent_info;

create or replace view public.public_achievements as
  select
    a.id,
    a.athlete_id,
    a.tournament_name,
    a.result,
    a.event_date,
    a.description,
    a.is_featured
  from public.achievements a
  join public.athletes t on t.id = a.athlete_id
  where a.is_published
    and t.is_published
    and t.consent_info;

-- Харагдацаар зөвхөн УНШИНА. Supabase шинэ хүснэгт, харагдац бүрд бүх эрхийг анхнаасаа
-- олгодог тул эхлээд бүгдийг хурааж, дараа нь зөвхөн унших эрх өгнө. Эс тэгвээс зочин
-- харагдацаар дамжуулан мөр нэмж, өөрчилж чадах байсан.
revoke all on public.public_athletes, public.public_achievements from public, anon, authenticated;
grant select on public.public_athletes, public.public_achievements to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Тамирчны зураг (Storage)
-- ---------------------------------------------------------------------------

-- Хувийн сав: 2 MB хүртэлх JPEG, PNG, WebP зураг. Хязгаарыг сервер өөрөө шалгана.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('athlete-photos', 'athlete-photos', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Энэ зураг олон нийтэд харагдаж болох эсэх.
create or replace function public.photo_is_public(path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.athletes
    where photo_path = path
      and is_published
      and consent_info
      and consent_photo
  );
$$;

revoke all on function public.photo_is_public(text) from public;
grant execute on function public.photo_is_public(text) to anon, authenticated;

drop policy if exists "Админ тамирчны зургийг удирдана" on storage.objects;
create policy "Админ тамирчны зургийг удирдана" on storage.objects
  for all to authenticated
  using (bucket_id = 'athlete-photos' and public.is_admin())
  with check (bucket_id = 'athlete-photos' and public.is_admin());

drop policy if exists "Зочин зөвшөөрөлтэй зургийг үзнэ" on storage.objects;
create policy "Зочин зөвшөөрөлтэй зургийг үзнэ" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'athlete-photos' and public.photo_is_public(name));

-- ---------------------------------------------------------------------------
-- 7. Хүүхдийн бүртгэл ба сарын төлбөр
--    Эцэг эх сайтаас бүртгүүлнэ. Төлбөрийг дансаар шилжүүлнэ; сайт мөнгө хүлээн
--    авахгүй. Мөнгө орсныг админ шалгаад «баталгаажуулна».
--
--    Сарын төлбөр: 14-р сургуулийн сурагч 100,000₮, бусад сургуулийн сурагч 250,000₮
--    (submit_registration дотор сервер тогтооно; админ хүүхэд бүрээр өөрчилж болно).
--    Төлбөрийн сар бүртгэл эхэлсэн өдрөөс тоологдоно: 11/22-нд эхэлсэн бол
--    11/22–12/21 эхний сар, дараагийн төлбөр 12/22.
--
--    Зочин хүснэгтүүдийг шууд уншиж, бичиж ЧАДАХГҮЙ. Зөвхөн submit_registration функцийг
--    дуудаж шинэ бүртгэл нэмнэ; тэр нь төлөх дүн, огноо, гүйлгээний утгыг буцаана.
--    Гүйлгээний утга: хүүхдийн овог нэр + эцэг эхийн утас.
--    Хүүхдийн мэдээлэл сайтад хэзээ ч нийтлэгдэхгүй; зөвхөн админ харна.
-- ---------------------------------------------------------------------------

create sequence if not exists public.registration_code_seq start 1;

create table if not exists public.registrations (
  id            uuid primary key default gen_random_uuid(),
  ref_code      text not null unique
                default 'CH' || lpad(nextval('public.registration_code_seq')::text, 4, '0'),
  child_name    text not null check (char_length(btrim(child_name)) between 2 and 120),
  birth_date    date not null check (birth_date between date '2000-01-01' and date '2100-01-01'),
  school_type   text not null check (school_type in ('14', 'other')),
  monthly_fee   integer not null check (monthly_fee between 1 and 10000000),
  start_date    date not null default (now() at time zone 'Asia/Ulaanbaatar')::date,
  school_grade  text not null
                constraint registrations_school_grade_check
                check (char_length(btrim(school_grade)) between 1 and 80),
  parent_name   text not null check (char_length(btrim(parent_name)) between 2 and 120),
  parent_phone  text not null check (parent_phone ~ '^[0-9]{8}$'),
  shift         text not null check (shift in ('10:00–11:30', '12:00–13:30', '14:00–16:00')),
  experience    text check (experience in ('Шатар мэдэхгүй', 'Нүүдлээ мэднэ', 'Тэмцээнд оролцож байсан')),
  note          text check (char_length(note) <= 500),
  consent_data  boolean not null check (consent_data),
  status        text not null default 'Шинэ'
                check (status in ('Шинэ', 'Идэвхтэй', 'Түр зогссон', 'Гарсан')),
  admin_note    text check (char_length(admin_note) <= 500),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter sequence public.registration_code_seq owned by public.registrations.ref_code;

create index if not exists registrations_phone_idx on public.registrations (parent_phone);

create table if not exists public.payments (
  id              uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations (id) on delete cascade,
  period_start    date not null,                                       -- төлбөрийн сар эхлэх өдөр
  amount          integer not null check (amount between 1 and 10000000),
  paid_on         date,
  bank_ref        text check (char_length(bank_ref) <= 200),           -- гүйлгээний утга
  note            text check (char_length(note) <= 300),
  confirmed_by    uuid default auth.uid() references auth.users (id) on delete set null,
  confirmed_at    timestamptz not null default now(),
  constraint payments_one_per_period unique (registration_id, period_start)
);

create index if not exists payments_confirmed_by_idx on public.payments (confirmed_by);

drop trigger if exists registrations_touch_updated_at on public.registrations;
create trigger registrations_touch_updated_at
  before update on public.registrations
  for each row execute function public.touch_updated_at();

alter table public.registrations enable row level security;
alter table public.payments      enable row level security;

revoke all on public.registrations, public.payments from public, anon, authenticated;
revoke all on sequence public.registration_code_seq from public, anon, authenticated;
grant select, insert, update, delete on public.registrations, public.payments to authenticated;
grant usage on sequence public.registration_code_seq to authenticated;

drop policy if exists "Админ бүртгэлийг удирдана" on public.registrations;
create policy "Админ бүртгэлийг удирдана" on public.registrations
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "Админ төлбөрийг удирдана" on public.payments;
create policy "Админ төлбөрийг удирдана" on public.payments
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- Төлбөрийн үе: бүртгэл эхэлсэн өдрөөс k сарын дараа эхэлнэ.
-- (1/31 + 1 сар = 2/28 гэх мэт сарын сүүлд таацуулна.)
create or replace function public.billing_period(p_start date, p_k integer)
returns date
language sql
immutable
set search_path = public
as $$ select (p_start + make_interval(months => p_k))::date $$;

-- Дараагийн төлөх ёстой үеийн эхлэх өдөр (эхний төлөгдөөгүй үе).
create or replace function public.next_due_date(p_registration uuid)
returns date
language sql
stable
security definer
set search_path = public
as $$
  select public.billing_period(r.start_date, k)
  from registrations r, generate_series(0, 240) k
  where r.id = p_registration
    and not exists (
      select 1 from payments p
      where p.registration_id = r.id
        and p.period_start = public.billing_period(r.start_date, k))
  order by k
  limit 1;
$$;
revoke all on function public.next_due_date(uuid) from public, anon;
grant execute on function public.next_due_date(uuid) to authenticated;

-- Эцэг эхийн бүртгэл. Хүснэгтэд шууд бичих эрхгүй тул зөвхөн энэ функцээр орно.
-- Нэг утаснаас 24 цагт 5, бүх сайтаас 10 минутад 30-аас олон бүртгэл хүлээн авахгүй.
drop function if exists public.registration_status(text, text);
drop function if exists public.submit_registration(text, integer, text, text, text, text, text, text, boolean);
drop function if exists public.submit_registration(text, integer, text, text, text, text, text, text, text, boolean);
create or replace function public.submit_registration(
  p_child_name   text,
  p_birth_date   date,
  p_school_type  text,
  p_school_grade text,
  p_parent_name  text,
  p_parent_phone text,
  p_shift        text,
  p_experience   text,
  p_note         text,
  p_consent      boolean
)
returns json
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_phone text := regexp_replace(coalesce(p_parent_phone, ''), '\D', '', 'g');
  v_today date := (now() at time zone 'Asia/Ulaanbaatar')::date;
  v_fee   integer;
  v_row   registrations%rowtype;
begin
  if length(v_phone) = 11 and left(v_phone, 3) = '976' then
    v_phone := right(v_phone, 8);
  end if;
  if coalesce(p_consent, false) is not true then
    raise exception 'consent_required';
  end if;
  -- 3–18 настай хүүхэд.
  if p_birth_date is null or p_birth_date > v_today - interval '3 years'
     or p_birth_date < v_today - interval '19 years' then
    raise exception 'birth_date_invalid';
  end if;
  -- Төлбөрийг сервер тогтооно: 14-р сургуулийн сурагч 100,000₮, бусад 250,000₮.
  v_fee := case p_school_type when '14' then 100000 when 'other' then 250000 end;
  if v_fee is null then
    raise exception 'school_type_required';
  end if;
  if (select count(*) from registrations
        where parent_phone = v_phone and created_at > now() - interval '24 hours') >= 5
     or (select count(*) from registrations
        where created_at > now() - interval '10 minutes') >= 30 then
    raise exception 'too_many_registrations';
  end if;

  insert into registrations
    (child_name, birth_date, school_type, monthly_fee, school_grade, parent_name, parent_phone,
     shift, experience, note, consent_data)
  values
    (btrim(p_child_name), p_birth_date, p_school_type, v_fee, btrim(p_school_grade),
     btrim(p_parent_name), v_phone, p_shift, nullif(p_experience, ''), nullif(btrim(p_note), ''), true)
  returning * into v_row;

  return json_build_object(
    'fee', v_row.monthly_fee,
    'shift', v_row.shift,
    'start_date', v_row.start_date,
    'period_end', public.billing_period(v_row.start_date, 1) - 1,
    'next_due', public.billing_period(v_row.start_date, 1),
    'reference', v_row.child_name || ' ' || v_row.parent_phone
  );
end;
$$;

revoke all on function public.submit_registration(text, date, text, text, text, text, text, text, text, boolean) from public;
grant execute on function public.submit_registration(text, date, text, text, text, text, text, text, text, boolean) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. Ирц ба 8 хичээлийн төлбөр
--    Нэг төлбөр = 8 хичээл (payments.lessons). Ирц бүртгэсэн хичээл бүр (ирсэн,
--    тасалсан, чөлөөтэй аль нь ч) хүүхдийн хичээлээс нэгийг хасна. Үлдсэн нь 0
--    болоход дараагийн төлбөр төлнө. Анхны хичээл 2026-11-28 (Бямба).
--    Зөвхөн админ уншиж, бичнэ.
-- ---------------------------------------------------------------------------

alter table public.payments
  add column if not exists lessons integer not null default 8 check (lessons between 1 and 100);
alter table public.payments drop constraint if exists payments_one_per_period;

create table if not exists public.class_sessions (
  id          uuid primary key default gen_random_uuid(),
  shift       text not null check (shift in ('10:00–11:30', '12:00–13:30', '14:00–16:00')),
  class_date  date not null,
  created_by  uuid default auth.uid() references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (shift, class_date)
);

create table if not exists public.attendance (
  session_id      uuid not null references public.class_sessions (id) on delete cascade,
  registration_id uuid not null references public.registrations (id) on delete cascade,
  status          text not null check (status in ('Ирсэн', 'Тасалсан', 'Чөлөөтэй')),
  marked_by       uuid default auth.uid() references auth.users (id) on delete set null,
  marked_at       timestamptz not null default now(),
  primary key (session_id, registration_id)
);

create index if not exists attendance_registration_idx on public.attendance (registration_id);
create index if not exists attendance_marked_by_idx on public.attendance (marked_by);
create index if not exists class_sessions_created_by_idx on public.class_sessions (created_by);

alter table public.class_sessions enable row level security;
alter table public.attendance     enable row level security;

revoke all on public.class_sessions, public.attendance from public, anon, authenticated;
grant select, insert, update, delete on public.class_sessions, public.attendance to authenticated;

drop policy if exists "Админ хичээлийг удирдана" on public.class_sessions;
create policy "Админ хичээлийг удирдана" on public.class_sessions
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "Админ ирцийг удирдана" on public.attendance;
create policy "Админ ирцийг удирдана" on public.attendance
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- Сарын тооцоо 8 хичээлийн багцаар солигдсон тул next_due_date-ийг сайт ашиглахаа больсон.
revoke execute on function public.next_due_date(uuid) from authenticated;

-- 9. Давхар бүртгэлээс сэргийлэх (2026-11-28) -------------------------------
-- Ижил утас + төрсөн өдөр + хүүхдийн өөрийн нэр (сүүлийн 3+ үсэгтэй үг) бол
-- шинээр бүртгэхгүй, хуучин бүртгэлийг нь буцаана. Өөр нэртэй ихэр бүртгэгдэнэ.

create or replace function public.given_name(p text)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select t.tok
  from regexp_split_to_table(lower(coalesce(p, '')), '[^а-яөүёa-z]+') with ordinality as t(tok, ord)
  where length(t.tok) >= 3
  order by t.ord desc
  limit 1
$$;

create or replace function public.submit_registration(
  p_child_name text, p_birth_date date, p_school_type text, p_school_grade text,
  p_parent_name text, p_parent_phone text, p_shift text, p_experience text,
  p_note text, p_consent boolean)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_phone text := regexp_replace(coalesce(p_parent_phone, ''), '\D', '', 'g');
  v_today date := (now() at time zone 'Asia/Ulaanbaatar')::date;
  v_fee   integer;
  v_row   registrations%rowtype;
begin
  if length(v_phone) = 11 and left(v_phone, 3) = '976' then
    v_phone := right(v_phone, 8);
  end if;
  if coalesce(p_consent, false) is not true then
    raise exception 'consent_required';
  end if;
  if p_birth_date is null or p_birth_date > v_today - interval '3 years'
     or p_birth_date < v_today - interval '19 years' then
    raise exception 'birth_date_invalid';
  end if;
  v_fee := case p_school_type when '14' then 100000 when 'other' then 250000 end;
  if v_fee is null then
    raise exception 'school_type_required';
  end if;

  select * into v_row from registrations
   where parent_phone = v_phone and birth_date = p_birth_date and status <> 'Гарсан'
     and public.given_name(child_name) = public.given_name(p_child_name)
   order by created_at limit 1;
  if found then
    return json_build_object(
      'duplicate', true,
      'fee', v_row.monthly_fee,
      'shift', v_row.shift,
      'reference', v_row.child_name || ' ' || v_row.parent_phone);
  end if;

  if (select count(*) from registrations
        where parent_phone = v_phone and created_at > now() - interval '24 hours') >= 5
     or (select count(*) from registrations
        where created_at > now() - interval '10 minutes') >= 30 then
    raise exception 'too_many_registrations';
  end if;

  insert into registrations
    (child_name, birth_date, school_type, monthly_fee, school_grade, parent_name, parent_phone,
     shift, experience, note, consent_data)
  values
    (btrim(p_child_name), p_birth_date, p_school_type, v_fee, btrim(p_school_grade),
     btrim(p_parent_name), v_phone, p_shift, nullif(p_experience, ''), nullif(btrim(p_note), ''), true)
  returning * into v_row;

  return json_build_object(
    'duplicate', false,
    'fee', v_row.monthly_fee,
    'shift', v_row.shift,
    'start_date', v_row.start_date,
    'reference', v_row.child_name || ' ' || v_row.parent_phone);
end;
$$;

-- 10. Дөрвөн ээлж, ээлж бүрт 26 хүүхэд (2026-11-28) -------------------------
-- 10:00–11:00 (1-р анги), 11:00–12:00 (1–2-р анги), 12:00–13:30 (3–5-р анги),
-- 14:00–16:00 (6-р ангиас дээш). Хүүхдүүдийг шинэ ээлжид шилжүүлсэн (админ хэсгээс харна).
-- 2026-11-28-ны хичээл хуучин 10:00–11:30 ээлжээр бүртгэгдсэн тул class_sessions-д үлдээв.

alter table public.registrations drop constraint if exists registrations_shift_check;
alter table public.class_sessions drop constraint if exists class_sessions_shift_check;
update public.registrations set shift = '10:00–11:00' where shift = '10:00–11:30';
alter table public.registrations add constraint registrations_shift_check
  check (shift in ('10:00–11:00', '11:00–12:00', '12:00–13:30', '14:00–16:00'));
alter table public.class_sessions add constraint class_sessions_shift_check
  check (shift in ('10:00–11:00', '11:00–12:00', '12:00–13:30', '14:00–16:00', '10:00–11:30'));

create or replace function public.shift_capacity() returns integer language sql immutable as $$ select 26 $$;

create or replace function public.shift_availability()
returns json
language sql
stable
security definer
set search_path to 'public'
as $$
  select json_agg(json_build_object('shift', s.shift, 'taken', coalesce(c.n, 0), 'capacity', public.shift_capacity()) order by s.ord)
  from (values ('10:00–11:00', 1), ('11:00–12:00', 2), ('12:00–13:30', 3), ('14:00–16:00', 4)) as s(shift, ord)
  left join (select shift, count(*) n from registrations where status <> 'Гарсан' group by shift) c on c.shift = s.shift
$$;
revoke all on function public.shift_availability() from public;
grant execute on function public.shift_availability() to anon, authenticated;

-- submit_registration (9-р хэсгийнх) дээр нэмэгдсэн шалгалт:
--   if p_shift not in (...4 ээлж...) then raise exception 'shift_invalid'; end if;
--   perform pg_advisory_xact_lock(hashtext('shift:' || p_shift));
--   if (select count(*) from registrations where shift = p_shift and status <> 'Гарсан')
--      >= public.shift_capacity() then raise exception 'shift_full'; end if;
