-- 충슐랭 가이드 데이터베이스
-- Supabase 대시보드 > SQL Editor 에 통째로 붙여넣고 Run 하세요. 여러 번 실행해도 안전합니다.

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────
-- 1. 맛집
-- ─────────────────────────────────────────────
create table if not exists public.places (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 40),
  category    text not null check (category in ('한식','해장국·탕','면·냉면','고기·구이','중식','일식·회','분식','카페·디저트','기타')),
  area        text not null default '' check (char_length(area) <= 20),
  address     text not null default '' check (char_length(address) <= 80),
  signature   text not null default '' check (char_length(signature) <= 40),
  price       smallint not null default 2 check (price between 1 and 4),
  description text not null default '' check (char_length(description) <= 200),
  added_by    uuid default auth.uid() references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
-- 띄어쓰기·대소문자만 다른 같은 가게 중복 등록 방지
create unique index if not exists places_name_uniq on public.places (lower(replace(name, ' ', '')));

-- ─────────────────────────────────────────────
-- 2. 리뷰 (한 사람당 가게 하나에 리뷰 하나)
-- ─────────────────────────────────────────────
create table if not exists public.reviews (
  id         uuid primary key default gen_random_uuid(),
  place_id   uuid not null references public.places(id) on delete cascade,
  author     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nickname   text not null check (char_length(btrim(nickname)) between 1 and 20),
  taste      smallint not null check (taste   between 1 and 5),   -- 맛
  service    smallint not null check (service between 1 and 5),   -- 서비스
  mood       smallint not null check (mood    between 1 and 5),   -- 분위기·청결
  value      smallint not null check (value   between 1 and 5),   -- 가성비
  overall    numeric(2,1) generated always as (round((taste + service + mood + value) / 4.0, 1)) stored,
  revisit    boolean not null default false,                      -- 재방문 의사
  body       text not null default '' check (char_length(body) <= 600),
  visited    text not null default '' check (visited = '' or visited ~ '^\d{4}-\d{2}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (place_id, author)
);
create index if not exists reviews_place_idx on public.reviews (place_id);

-- ─────────────────────────────────────────────
-- 3. 사진 (파일은 Storage 'photos' 버킷, 여기엔 경로만)
--    path = '<작성자 id>/<사진 id>'  →  원본 <path>.jpg, 썸네일 <path>_t.jpg
-- ─────────────────────────────────────────────
create table if not exists public.photos (
  id         uuid primary key default gen_random_uuid(),
  place_id   uuid not null references public.places(id) on delete cascade,
  review_id  uuid references public.reviews(id) on delete cascade,   -- null 이면 가게 등록 때 올린 사진
  author     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  path       text not null unique,
  created_at timestamptz not null default now()
);
create index if not exists photos_place_idx on public.photos (place_id);

-- 리뷰(또는 가게 등록)당 사진 최대 3장
create or replace function public.photos_limit() returns trigger
language plpgsql as $$
begin
  if (select count(*) from public.photos
       where place_id = new.place_id and author = new.author
         and review_id is not distinct from new.review_id) >= 3 then
    raise exception '사진은 최대 3장까지 올릴 수 있어요';
  end if;
  return new;
end $$;
drop trigger if exists photos_limit on public.photos;
create trigger photos_limit before insert on public.photos
  for each row execute function public.photos_limit();

-- ─────────────────────────────────────────────
-- 4. 가게별 집계 뷰 (목록 화면용)
-- ─────────────────────────────────────────────
create or replace view public.place_stats with (security_invoker = on) as
select p.*,
       count(r.id)::int                   as review_count,
       avg(r.overall)::float8             as overall_avg,
       avg(r.taste)::float8               as taste_avg,
       avg(r.service)::float8             as service_avg,
       avg(r.mood)::float8                as mood_avg,
       avg(r.value)::float8               as value_avg,
       avg(r.revisit::int)::float8        as revisit_rate
from public.places p
left join public.reviews r on r.place_id = p.id
group by p.id;

-- ─────────────────────────────────────────────
-- 5. 접근 규칙 (RLS)
--    누구나 읽기 / 로그인(익명 포함)한 사람만 쓰기 / 자기 것만 수정·삭제
-- ─────────────────────────────────────────────
alter table public.places  enable row level security;
alter table public.reviews enable row level security;
alter table public.photos  enable row level security;

drop policy if exists "places read"   on public.places;
drop policy if exists "places insert" on public.places;
drop policy if exists "places update" on public.places;
drop policy if exists "places delete" on public.places;
create policy "places read"   on public.places for select using (true);
create policy "places insert" on public.places for insert to authenticated with check (added_by = auth.uid());
create policy "places update" on public.places for update to authenticated using (added_by = auth.uid()) with check (added_by = auth.uid());
-- 리뷰가 하나도 없을 때만 등록한 사람이 삭제 가능
create policy "places delete" on public.places for delete to authenticated
  using (added_by = auth.uid() and not exists (select 1 from public.reviews r where r.place_id = places.id));

drop policy if exists "reviews read"   on public.reviews;
drop policy if exists "reviews insert" on public.reviews;
drop policy if exists "reviews update" on public.reviews;
drop policy if exists "reviews delete" on public.reviews;
create policy "reviews read"   on public.reviews for select using (true);
create policy "reviews insert" on public.reviews for insert to authenticated with check (author = auth.uid());
create policy "reviews update" on public.reviews for update to authenticated using (author = auth.uid()) with check (author = auth.uid());
create policy "reviews delete" on public.reviews for delete to authenticated using (author = auth.uid());

drop policy if exists "photos read"   on public.photos;
drop policy if exists "photos insert" on public.photos;
drop policy if exists "photos delete" on public.photos;
create policy "photos read"   on public.photos for select using (true);
create policy "photos insert" on public.photos for insert to authenticated with check (
  author = auth.uid()
  and split_part(path, '/', 1) = auth.uid()::text
  and (review_id is null or exists (select 1 from public.reviews r where r.id = review_id and r.author = auth.uid()))
);
create policy "photos delete" on public.photos for delete to authenticated using (author = auth.uid());

grant select on public.places, public.reviews, public.photos, public.place_stats to anon, authenticated;
grant insert, update, delete on public.places, public.reviews, public.photos to authenticated;

-- ─────────────────────────────────────────────
-- 6. 사진 저장소 (공개 읽기, 자기 폴더에만 업로드, 파일당 2MB, JPEG만)
-- ─────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 2097152, array['image/jpeg'])
on conflict (id) do update set public = true, file_size_limit = 2097152, allowed_mime_types = array['image/jpeg'];

drop policy if exists "photos upload own folder" on storage.objects;
drop policy if exists "photos delete own folder" on storage.objects;
create policy "photos upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "photos delete own folder" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ─────────────────────────────────────────────
-- 7. 실시간 반영 (다른 사람이 올리면 바로 화면에 보이게)
-- ─────────────────────────────────────────────
do $$
begin
  begin alter publication supabase_realtime add table public.places;  exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.reviews; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.photos;  exception when duplicate_object then null; end;
end $$;
