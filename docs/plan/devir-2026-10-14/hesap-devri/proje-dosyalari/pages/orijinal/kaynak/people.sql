begin;
select tests.demo_world('hv');
-- managers and admin
select tests.demo_person('hv','hannah','Hannah','Lee','manager',array['D'],array['server'],'active','2025-03-01');
select tests.demo_person('hv','ryan','Ryan','Walsh','manager',array['U'],array['server'],'active','2025-05-12');
select tests.demo_person('hv','laura','Laura','Bennett','admin',array['D','U'],array['host'],'active','2024-11-04');
-- the 16 from the Schedule test page
select tests.demo_person('hv','maria','Maria','Lopez','employee',array['D'],array['server','host'],'active','2025-06-02');
select tests.demo_person('hv','jake','Jake','Thompson','employee',array['D','U'],array['server','bartender'],'active','2025-01-20');
select tests.demo_person('hv','priya','Priya','Patel','employee',array['D'],array['host','server'],'active','2025-08-18');
select tests.demo_person('hv','ethan','Ethan','Brooks','employee',array['D'],array['busser','server'],'active','2026-02-09');
select tests.demo_person('hv','sophie','Sophie','Martin','employee',array['D','U'],array['bartender','barback'],'active','2024-09-30');
select tests.demo_person('hv','daniel','Daniel','Kim','employee',array['D'],array['barback','busser'],'active','2026-04-13');
select tests.demo_person('hv','carlos','Carlos','Rivera','employee',array['D'],array['linecook','prepcook'],'active','2024-07-15');
select tests.demo_person('hv','aisha','Aisha','Johnson','employee',array['D','U'],array['linecook'],'active','2025-10-06');
select tests.demo_person('hv','tom','Tom','Becker','employee',array['D'],array['prepcook','dishwasher'],'active','2025-02-24');
select tests.demo_person('hv','luis','Luis','Hernandez','employee',array['D'],array['dishwasher'],'active','2026-01-05');
select tests.demo_person('hv','emma','Emma','Wilson','employee',array['U'],array['server','host'],'active','2025-04-07');
select tests.demo_person('hv','noah','Noah','Garcia','employee',array['U'],array['server'],'active','2025-07-21');
select tests.demo_person('hv','olivia','Olivia','Chen','employee',array['U'],array['host'],'active','2026-03-02');
select tests.demo_person('hv','marcus','Marcus','Reed','employee',array['U'],array['linecook','prepcook'],'active','2024-12-09');
select tests.demo_person('hv','grace','Grace','Murphy','employee',array['U'],array['bartender'],'active','2025-09-15');
select tests.demo_person('hv','sam','Sam','Okafor','employee',array['U'],array['dishwasher','prepcook'],'active','2026-05-18');
-- people in other states for the list tabs
select tests.demo_person('hv','chloe','Chloe','Adams','employee',array['D'],array['server'],'pending','2026-10-19');
select tests.demo_person('hv','ben','Ben','Carter','employee',array['U'],array['busser'],'onboarding','2026-10-12');
select tests.demo_person('hv','kevin','Kevin','Wright','employee',array['D'],array['linecook'],'removed','2025-02-03');
commit;
