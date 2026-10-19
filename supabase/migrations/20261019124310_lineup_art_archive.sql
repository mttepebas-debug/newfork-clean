-- AVATAR-IKON 1.3: the drawing archive's keys and the job-name suggestion rule, in the database.
--
-- The archive itself (names, SVGs) is scripts/lineup-art/archive.json; this table keeps only what the
-- database decides with: which keys exist, their number, kind, style and the jobs each suits. The
-- insert block below is written by scripts/lineup-art/gen.mjs (`--check` fails when it is stale);
-- edit archive.json and rerun the generator, never the block.
--
-- Nothing here is for the browser: app_private, no grant to anon or authenticated, row level security
-- on with no policy. The services and triggers that need it run as the owner.

create table app_private.lineup_art (
  key text primary key,
  no integer not null unique,
  kind text not null check (kind in ('person', 'object', 'team')),
  style text not null check (style in ('line', 'color')),
  jobs text[] not null default '{}'
);

alter table app_private.lineup_art enable row level security;

comment on table app_private.lineup_art is
  'The Lineup drawing archive''s keys (AVATAR-IKON), filled from scripts/lineup-art/archive.json by scripts/lineup-art/gen.mjs. Read through app_private.lineup_art_keys_valid() and app_private.suggest_lineup_art().';

-- lineup-art:begin
insert into app_private.lineup_art (key, no, kind, style, jobs) values
  ('001-server', 1, 'object', 'line', array['server', 'waiter']::text[]),
  ('002-busser', 2, 'object', 'line', array['busser']::text[]),
  ('003-bartender', 3, 'object', 'line', array['bartender']::text[]),
  ('004-cashier', 4, 'object', 'line', array['cashier']::text[]),
  ('005-host', 5, 'object', 'line', array['host']::text[]),
  ('006-hostess', 6, 'object', 'line', array['hostess']::text[]),
  ('007-gm', 7, 'object', 'line', array['general manager (gm)']::text[]),
  ('008-shift-lead', 8, 'object', 'line', array['shift lead']::text[]),
  ('009-barback', 9, 'object', 'line', array['barback']::text[]),
  ('010-food-runner', 10, 'object', 'line', array['food runner']::text[]),
  ('011-expo', 11, 'object', 'line', array['expo']::text[]),
  ('012-delivery-driver', 12, 'object', 'line', array['delivery driver']::text[]),
  ('013-chef', 13, 'object', 'line', array['chef', 'executive chef']::text[]),
  ('014-sous-chef', 14, 'object', 'line', array['sous chef']::text[]),
  ('015-line-cook', 15, 'object', 'line', array['line cook']::text[]),
  ('016-prep-cook', 16, 'object', 'line', array['prep cook']::text[]),
  ('017-dishwasher', 17, 'object', 'line', array['dishwasher']::text[]),
  ('018-barista', 18, 'object', 'line', array['barista']::text[]),
  ('019-sommelier', 19, 'object', 'line', array['sommelier']::text[]),
  ('020-pastry-chef', 20, 'object', 'line', array['pastry chef']::text[]),
  ('021-grill-cook', 21, 'object', 'line', array['grill cook']::text[]),
  ('022-fry-cook', 22, 'object', 'line', array['fry cook']::text[]),
  ('023-keyholder', 23, 'object', 'line', array['keyholder', 'assistant manager']::text[]),
  ('024-to-go', 24, 'object', 'line', array['to-go', 'takeout']::text[]),
  ('025-porter', 25, 'object', 'line', array['porter', 'janitor']::text[]),
  ('026-cleaning', 26, 'object', 'line', array['cleaning duty']::text[]),
  ('027-server-notepad', 27, 'person', 'line', array['server']::text[]),
  ('028-server-mustache', 28, 'person', 'line', array['server', 'waiter']::text[]),
  ('029-server-tray', 29, 'person', 'line', array['server', 'food runner']::text[]),
  ('030-bartender-shaking', 30, 'person', 'line', array['bartender']::text[]),
  ('031-gm-suit', 31, 'person', 'line', array['general manager (gm)']::text[]),
  ('032-host-stand', 32, 'person', 'line', array['host']::text[]),
  ('033-hostess-menu', 33, 'person', 'line', array['hostess']::text[]),
  ('034-chef-person', 34, 'person', 'line', array['chef', 'executive chef']::text[]),
  ('035-cook-tossing', 35, 'person', 'line', array['line cook']::text[]),
  ('036-runner-two-plates', 36, 'person', 'line', array['food runner']::text[]),
  ('037-busser-person', 37, 'person', 'line', array['busser']::text[]),
  ('038-driver-cap-box', 38, 'person', 'line', array['delivery driver']::text[]),
  ('039-expo-bell', 39, 'person', 'line', array['expo']::text[]),
  ('040-sommelier-bottle', 40, 'person', 'line', array['sommelier']::text[]),
  ('041-barista-person', 41, 'person', 'line', array['barista']::text[]),
  ('042-manager-headset', 42, 'person', 'line', array['floor manager', 'shift lead']::text[]),
  ('043-trainer', 43, 'person', 'line', array['trainer']::text[]),
  ('044-security', 44, 'person', 'line', array['security', 'doorman']::text[]),
  ('045-order-pad', 45, 'object', 'line', array['server tool']::text[]),
  ('046-wine-key', 46, 'object', 'line', array['server', 'sommelier tool']::text[]),
  ('047-cocktail-glass', 47, 'object', 'line', array['bartender', 'mixologist']::text[]),
  ('048-tongs', 48, 'object', 'line', array['line cook', 'grill tool']::text[]),
  ('049-ladle', 49, 'object', 'line', array['cook', 'soup station']::text[]),
  ('050-pizza-slice', 50, 'object', 'line', array['pizza cook']::text[]),
  ('051-thermometer', 51, 'object', 'line', array['food safety duty']::text[]),
  ('052-walkie-talkie', 52, 'object', 'line', array['manager', 'host tool']::text[]),
  ('053-server-tray-ill', 53, 'person', 'color', array['server', 'food runner']::text[]),
  ('054-server-mustache-ill', 54, 'person', 'color', array['server', 'waiter']::text[]),
  ('055-server-order-ill', 55, 'person', 'color', array['server']::text[]),
  ('056-bartender-shaking-ill', 56, 'person', 'color', array['bartender']::text[]),
  ('057-gm-suit-ill', 57, 'person', 'color', array['general manager (gm)']::text[]),
  ('058-chef-pot-ill', 58, 'person', 'color', array['chef', 'cook']::text[]),
  ('059-busser-tub-ill', 59, 'person', 'color', array['busser']::text[]),
  ('060-host-stand-ill', 60, 'person', 'color', array['host']::text[]),
  ('061-hostess-menus-ill', 61, 'person', 'color', array['hostess']::text[]),
  ('062-barback-crate-ill', 62, 'person', 'color', array['barback']::text[]),
  ('063-expo-ticket-ill', 63, 'person', 'color', array['expo']::text[]),
  ('064-driver-box-ill', 64, 'person', 'color', array['delivery driver']::text[]),
  ('065-sous-chef-ill', 65, 'person', 'color', array['sous chef']::text[]),
  ('066-line-cook-flame-ill', 66, 'person', 'color', array['line cook']::text[]),
  ('067-prep-cook-ill', 67, 'person', 'color', array['prep cook']::text[]),
  ('068-dishwasher-ill', 68, 'person', 'color', array['dishwasher']::text[]),
  ('069-runner-plates-ill', 69, 'person', 'color', array['food runner']::text[]),
  ('070-cashier-pos-ill', 70, 'person', 'color', array['cashier']::text[]),
  ('071-barista-ill', 71, 'person', 'color', array['barista']::text[]),
  ('072-sommelier-pour-ill', 72, 'person', 'color', array['sommelier']::text[]),
  ('073-pastry-chef-ill', 73, 'person', 'color', array['pastry chef']::text[]),
  ('074-pizza-toss-ill', 74, 'person', 'color', array['pizza cook']::text[]),
  ('075-grill-cook-ill', 75, 'person', 'color', array['grill cook']::text[]),
  ('076-shift-lead-ill', 76, 'person', 'color', array['shift lead']::text[]),
  ('077-porter-mop-ill', 77, 'person', 'color', array['porter']::text[]),
  ('078-bartender-tap-ill', 78, 'person', 'color', array['bartender']::text[]),
  ('079-cocktail-server-ill', 79, 'person', 'color', array['cocktail server', 'server']::text[]),
  ('080-manager-tablet-ill', 80, 'person', 'color', array['manager', 'assistant manager']::text[]),
  ('081-salad-prep-ill', 81, 'person', 'color', array['salad prep', 'prep cook']::text[]),
  ('082-receiver-ill', 82, 'person', 'color', array['receiver']::text[]),
  ('083-martini-glass-obj', 83, 'object', 'color', array['bartender', 'mixologist']::text[]),
  ('084-baker-bread-ill', 84, 'person', 'color', array['baker']::text[]),
  ('085-sushi-chef-ill', 85, 'person', 'color', array['sushi chef']::text[]),
  ('086-supervisor-ill', 86, 'person', 'color', array['supervisor', 'floor manager']::text[]),
  ('087-stocker-shelf-ill', 87, 'person', 'color', array['stocker', 'prep']::text[]),
  ('088-shaker-obj', 88, 'object', 'color', array['bartender', 'mixologist']::text[]),
  ('089-glass-polisher-ill', 89, 'person', 'color', array['polisher', 'busser', 'barback']::text[]),
  ('090-mixologist-ill', 90, 'person', 'color', array['mixologist', 'bartender']::text[]),
  ('091-butcher-ill', 91, 'person', 'color', array['butcher']::text[]),
  ('092-valet-key-ill', 92, 'person', 'color', array['valet']::text[]),
  ('093-old-fashioned-obj', 93, 'object', 'color', array['bartender', 'mixologist']::text[]),
  ('094-security-rope-ill', 94, 'person', 'color', array['security', 'doorman']::text[]),
  ('095-togo-bag-ill', 95, 'person', 'color', array['to-go specialist', 'cashier']::text[]),
  ('096-banquet-server-ill', 96, 'person', 'color', array['banquet server', 'catering']::text[]),
  ('097-owner-open-ill', 97, 'person', 'color', array['owner', 'general manager']::text[]),
  ('098-waiter-silhouette-obj', 98, 'object', 'color', array['server', 'waiter']::text[]),
  ('099-cloche-obj', 99, 'object', 'color', array['server', 'room service']::text[]),
  ('100-order-pad-obj', 100, 'object', 'color', array['server']::text[]),
  ('101-wine-corkscrew-obj', 101, 'object', 'color', array['sommelier']::text[]),
  ('102-bus-tub-obj', 102, 'object', 'color', array['busser', 'dishwasher']::text[]),
  ('103-menu-obj', 103, 'object', 'color', array['host', 'hostess', 'server']::text[]),
  ('104-guest-pager-obj', 104, 'object', 'color', array['host', 'hostess']::text[]),
  ('105-chef-knife-board-obj', 105, 'object', 'color', array['chef', 'prep cook', 'line cook']::text[]),
  ('106-toque-obj', 106, 'object', 'color', array['chef', 'sous chef']::text[]),
  ('107-pan-flame-obj', 107, 'object', 'color', array['line cook', 'cook']::text[]),
  ('108-grill-spatula-obj', 108, 'object', 'color', array['grill cook']::text[]),
  ('109-ticket-rail-obj', 109, 'object', 'color', array['expo', 'line cook']::text[]),
  ('110-service-bell-obj', 110, 'object', 'color', array['expo', 'food runner']::text[]),
  ('111-whisk-bowl-obj', 111, 'object', 'color', array['pastry chef', 'baker']::text[]),
  ('112-latte-art-obj', 112, 'object', 'color', array['barista']::text[]),
  ('113-beer-taps-obj', 113, 'object', 'color', array['bartender', 'barback']::text[]),
  ('114-ice-bucket-obj', 114, 'object', 'color', array['barback', 'bartender']::text[]),
  ('115-dish-sprayer-obj', 115, 'object', 'color', array['dishwasher']::text[]),
  ('116-delivery-bag-obj', 116, 'object', 'color', array['delivery driver']::text[]),
  ('117-card-terminal-obj', 117, 'object', 'color', array['cashier', 'server']::text[]),
  ('118-schedule-board-obj', 118, 'object', 'color', array['manager', 'general manager', 'shift lead']::text[]),
  ('119-range-obj', 119, 'object', 'color', array['line cook', 'cook']::text[]),
  ('120-fryer-obj', 120, 'object', 'color', array['fry cook', 'line cook']::text[]),
  ('121-pizza-oven-obj', 121, 'object', 'color', array['pizza cook']::text[]),
  ('122-espresso-machine-obj', 122, 'object', 'color', array['barista']::text[]),
  ('123-dish-rack-obj', 123, 'object', 'color', array['dishwasher']::text[]),
  ('124-server-pitcher-ill', 124, 'person', 'color', array['server']::text[]),
  ('125-fry-cook-ill', 125, 'person', 'color', array['fry cook', 'line cook']::text[]),
  ('126-server-check-ill', 126, 'person', 'color', array['server']::text[]),
  ('127-diner-coffee-ill', 127, 'person', 'color', array['server', 'diner']::text[]),
  ('128-kitchen-manager-ill', 128, 'person', 'color', array['kitchen manager', 'chef']::text[]),
  ('129-busser-wipe-ill', 129, 'person', 'color', array['busser']::text[]),
  ('130-stand-mixer-obj', 130, 'object', 'color', array['pastry chef', 'baker']::text[]),
  ('131-drive-thru-ill', 131, 'person', 'color', array['drive-thru', 'cashier']::text[]),
  ('132-bar-tools-obj', 132, 'object', 'color', array['bartender', 'mixologist']::text[]),
  ('133-barback-keg-ill', 133, 'person', 'color', array['barback']::text[]),
  ('134-trainer-ill', 134, 'person', 'color', array['trainer', 'shift lead']::text[]),
  ('135-chef-tasting-ill', 135, 'person', 'color', array['chef', 'sous chef']::text[]),
  ('136-ice-cream-ill', 136, 'person', 'color', array['ice cream', 'dessert']::text[]),
  ('137-mop-bucket-obj', 137, 'object', 'color', array['porter', 'dishwasher']::text[]),
  ('138-bar-manager-ill', 138, 'person', 'color', array['bar manager']::text[]),
  ('139-server-corkscrew-ill', 139, 'person', 'color', array['server', 'sommelier']::text[]),
  ('140-expo-pass-ill', 140, 'person', 'color', array['expo']::text[]),
  ('141-host-phone-ill', 141, 'person', 'color', array['host', 'hostess']::text[]),
  ('142-pastry-piping-ill', 142, 'person', 'color', array['pastry chef']::text[]),
  ('143-baker-peel-ill', 143, 'person', 'color', array['baker']::text[]),
  ('144-driver-map-ill', 144, 'person', 'color', array['delivery driver']::text[]),
  ('145-server-pos-ill', 145, 'person', 'color', array['server', 'cashier']::text[]),
  ('146-sommelier-present-ill', 146, 'person', 'color', array['sommelier']::text[]),
  ('147-cash-drawer-obj', 147, 'object', 'color', array['cashier', 'manager']::text[]),
  ('148-prep-label-ill', 148, 'person', 'color', array['prep cook']::text[]),
  ('149-catering-canape-ill', 149, 'person', 'color', array['catering', 'banquet server']::text[]),
  ('150-shift-lead-keys-ill', 150, 'person', 'color', array['shift lead', 'manager']::text[]),
  ('151-dishwasher-gloves-ill', 151, 'person', 'color', array['dishwasher']::text[]),
  ('152-barista-steam-ill', 152, 'person', 'color', array['barista']::text[]),
  ('153-drinks-tray-obj', 153, 'object', 'color', array['server', 'cocktail server']::text[]),
  ('154-piping-bag-obj', 154, 'object', 'color', array['pastry chef', 'baker']::text[]),
  ('155-hand-truck-obj', 155, 'object', 'color', array['receiver', 'stocker']::text[]),
  ('156-manager-badge-obj', 156, 'object', 'color', array['manager', 'general manager']::text[]),
  ('157-pizza-peel-obj', 157, 'object', 'color', array['pizza cook']::text[]),
  ('158-salad-tongs-obj', 158, 'object', 'color', array['salad prep', 'prep cook']::text[]),
  ('159-bartender-muddle-ill', 159, 'person', 'color', array['bartender', 'mixologist']::text[]),
  ('160-bartender-pour-ill', 160, 'person', 'color', array['bartender']::text[]),
  ('161-barista-latte-ill', 161, 'person', 'color', array['barista']::text[]),
  ('162-sommelier-swirl-ill', 162, 'person', 'color', array['sommelier']::text[]),
  ('163-sushi-roll-ill', 163, 'person', 'color', array['sushi chef']::text[]),
  ('164-pizza-sauce-ill', 164, 'person', 'color', array['pizza cook']::text[]),
  ('165-wok-toss-ill', 165, 'person', 'color', array['line cook', 'cook']::text[]),
  ('166-grill-tongs-ill', 166, 'person', 'color', array['grill cook']::text[]),
  ('167-cook-squeeze-ill', 167, 'person', 'color', array['line cook', 'chef']::text[]),
  ('168-busser-plates-ill', 168, 'person', 'color', array['busser', 'dishwasher']::text[]),
  ('169-barback-ice-ill', 169, 'person', 'color', array['barback']::text[]),
  ('170-porter-trash-ill', 170, 'person', 'color', array['porter', 'dishwasher']::text[]),
  ('171-rolling-pin-obj', 171, 'object', 'color', array['baker', 'pastry chef']::text[]),
  ('172-tamper-obj', 172, 'object', 'color', array['barista']::text[]),
  ('173-pizza-cutter-obj', 173, 'object', 'color', array['pizza cook']::text[]),
  ('174-team-apron', 174, 'team', 'color', array[]::text[]),
  ('175-team-cap', 175, 'team', 'color', array[]::text[]),
  ('176-team-bun', 176, 'team', 'color', array[]::text[]),
  ('177-team-beanie', 177, 'team', 'color', array[]::text[]),
  ('178-team-glasses', 178, 'team', 'color', array[]::text[]),
  ('179-team-wave', 179, 'team', 'color', array[]::text[]),
  ('180-team-headband', 180, 'team', 'color', array[]::text[]),
  ('181-team-mustache', 181, 'team', 'color', array[]::text[]);
-- lineup-art:end

-- True when every key is in the archive and none repeats; an empty list is valid, a null list or a
-- null key is not.
create function app_private.lineup_art_keys_valid(keys text[])
returns boolean
language sql
stable
set search_path = ''
as $$
  select lineup_art_keys_valid.keys is not null
    and array_position(lineup_art_keys_valid.keys, null) is null
    and cardinality(lineup_art_keys_valid.keys) = (
      select count(distinct given.key) from unnest(lineup_art_keys_valid.keys) as given(key)
    )
    and not exists (
      select 1
      from unnest(lineup_art_keys_valid.keys) as given(key)
      where not exists (select 1 from app_private.lineup_art art where art.key = given.key)
    );
$$;

-- The drawings suggested for a job's name: the database's copy of packages/shared/src/lineup-art-rule.ts
-- (suggestLineupArtFrom), and the one that decides; supabase/tests/lineup_art_parity.test.sql keeps the
-- two answering alike. The name is lower-cased (ICU, as JavaScript's toLowerCase does), every run of
-- JavaScript's \s whitespace becomes one space, and the ends are trimmed. A drawing matches when one of
-- its jobs equals the name, sits inside it, or holds a name of three letters or more. Team drawings are
-- never suggested. Colour drawings first, then by number; at most eight. No name, no suggestion: '{}'.
create function app_private.suggest_lineup_art(job_name text)
returns text[]
language sql
stable
set search_path = ''
as $$
  with normalized as (
    select btrim(
      regexp_replace(
        lower(coalesce(suggest_lineup_art.job_name, '') collate "und-x-icu") collate "default",
        '[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+',
        ' ',
        'g'
      ),
      ' '
    ) as name
  )
  select array(
    select art.key
    from app_private.lineup_art art, normalized
    where normalized.name <> ''
      and art.kind <> 'team'
      and exists (
        select 1
        from unnest(art.jobs) as term(job)
        where term.job = normalized.name
          or strpos(normalized.name, term.job) > 0
          or (char_length(normalized.name) >= 3 and strpos(term.job, normalized.name) > 0)
      )
    order by art.style = 'color' desc, art.no
    limit 8
  );
$$;

revoke all on function app_private.lineup_art_keys_valid(text[]) from public;
revoke all on function app_private.suggest_lineup_art(text) from public;
