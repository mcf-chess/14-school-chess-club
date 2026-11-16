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
    a.description
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
