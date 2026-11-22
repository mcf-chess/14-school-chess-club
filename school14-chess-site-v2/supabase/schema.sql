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
--    Зочин хүснэгтүүдийг шууд уншиж, бичиж ЧАДАХГҮЙ. Зөвхөн доорх хоёр функцийг дуудна:
--      submit_registration  — шинэ бүртгэл нэмж, гүйлгээний кодыг буцаана
--      registration_status  — код + утасны дугаараар төлөв, төлсөн саруудыг харна
--    Хүүхдийн мэдээлэл сайтад хэзээ ч нийтлэгдэхгүй; зөвхөн админ харна.
-- ---------------------------------------------------------------------------

create sequence if not exists public.registration_code_seq start 1;

create table if not exists public.registrations (
  id            uuid primary key default gen_random_uuid(),
  ref_code      text not null unique
                default 'CH' || lpad(nextval('public.registration_code_seq')::text, 4, '0'),
  child_name    text not null check (char_length(btrim(child_name)) between 2 and 120),
  child_age     integer check (child_age between 3 and 18),
  school_grade  text check (char_length(school_grade) <= 80),
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
  month           date not null check (extract(day from month) = 1),  -- сарын 1-ний өдөр
  amount          integer not null check (amount between 1 and 10000000),
  paid_on         date,
  bank_ref        text check (char_length(bank_ref) <= 200),           -- гүйлгээний утга
  note            text check (char_length(note) <= 300),
  confirmed_by    uuid default auth.uid() references auth.users (id) on delete set null,
  confirmed_at    timestamptz not null default now(),
  unique (registration_id, month)
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

-- Эцэг эхийн бүртгэл. Хүснэгтэд шууд бичих эрхгүй тул зөвхөн энэ функцээр орно.
-- Нэг утаснаас 24 цагт 5, бүх сайтаас 10 минутад 30-аас олон бүртгэл хүлээн авахгүй.
create or replace function public.submit_registration(
  p_child_name   text,
  p_child_age    integer,
  p_school_grade text,
  p_parent_name  text,
  p_parent_phone text,
  p_shift        text,
  p_experience   text,
  p_note         text,
  p_consent      boolean
)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_phone text := regexp_replace(coalesce(p_parent_phone, ''), '\D', '', 'g');
  v_code  text;
begin
  if length(v_phone) = 11 and left(v_phone, 3) = '976' then
    v_phone := right(v_phone, 8);
  end if;
  if coalesce(p_consent, false) is not true then
    raise exception 'consent_required';
  end if;
  if (select count(*) from registrations
        where parent_phone = v_phone and created_at > now() - interval '24 hours') >= 5
     or (select count(*) from registrations
        where created_at > now() - interval '10 minutes') >= 30 then
    raise exception 'too_many_registrations';
  end if;

  insert into registrations
    (child_name, child_age, school_grade, parent_name, parent_phone, shift, experience, note, consent_data)
  values
    (btrim(p_child_name), p_child_age, nullif(btrim(p_school_grade), ''), btrim(p_parent_name),
     v_phone, p_shift, nullif(p_experience, ''), nullif(btrim(p_note), ''), true)
  returning ref_code into v_code;

  return v_code;
end;
$$;

-- Эцэг эх кодоо болон утсаа оруулж төлөв, баталгаажсан саруудаа харна.
-- Хүүхдийн нэр, бусад мэдээллийг буцаахгүй.
create or replace function public.registration_status(p_code text, p_phone text)
returns table (status text, shift text, paid_months date[])
language sql
stable
security definer
set search_path = public
as $$
  select r.status,
         r.shift,
         coalesce(array_agg(p.month order by p.month) filter (where p.month is not null), '{}')
  from registrations r
  left join payments p on p.registration_id = r.id
  where r.ref_code = upper(btrim(p_code))
    and r.parent_phone = right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 8)
  group by r.id;
$$;

revoke all on function public.submit_registration(text, integer, text, text, text, text, text, text, boolean) from public;
revoke all on function public.registration_status(text, text) from public;
grant execute on function public.submit_registration(text, integer, text, text, text, text, text, text, boolean) to anon, authenticated;
grant execute on function public.registration_status(text, text) to anon, authenticated;
