alter table public.locations
  drop constraint if exists locations_street_address_check,
  drop constraint if exists locations_city_check,
  drop constraint if exists locations_region_check,
  drop constraint if exists locations_postal_code_check;

alter table public.locations
  add constraint locations_street_address_check
    check (char_length(btrim(street_address)) <= 180),
  add constraint locations_city_check
    check (char_length(btrim(city)) <= 100),
  add constraint locations_region_check
    check (char_length(btrim(region)) <= 100),
  add constraint locations_postal_code_check
    check (char_length(btrim(postal_code)) <= 20);
