-- (선택) 처음 목록에 보일 충주 가게 4곳. 리뷰는 넣지 않습니다.
-- schema.sql 실행 후 SQL Editor 에서 Run 하세요.
insert into public.places (name, category, area, address, signature, price, description, added_by) values
  ('삼정면옥',            '면·냉면',   '성내동',   '충주시 관아3길 21',       '평양냉면, 수육',          2, '1979년부터 평양냉면과 수육을 내어온 노포.',       null),
  ('장금옥',              '해장국·탕', '동량면',   '충주시 동량면 대미길 13', '올갱이해장국, 올갱이장떡', 1, '된장 베이스의 순한 올갱이해장국 전문점.',       null),
  ('운정식당',            '해장국·탕', '',         '',                        '올뱅이해장국',            1, '새벽 6시부터 문을 여는 올뱅이해장국집.',        null),
  ('메밀마당 중앙탑본점', '면·냉면',   '중앙탑면', '',                        '메밀치킨, 막국수',        2, '바삭한 메밀치킨과 막국수 조합으로 알려진 곳.', null)
on conflict do nothing;
