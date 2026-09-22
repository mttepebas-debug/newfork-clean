#!/usr/bin/env node
/**
 * Writes the local Meyhouse workspace out as plain SQL that can be replayed
 * into a database `supabase db reset` has just rebuilt.
 *
 * The point is not a backup. A backup of this database would carry thirty-one
 * workspaces, sixty-nine accounts and months of clicking around, and replaying
 * it would put the drift straight back. This writes down the part worth
 * keeping -- one workspace, its four locations, its people -- and rewrites the
 * parts that were accidents of how it grew:
 *
 *   - the owner becomes merttepebas@meyhousefood.com, not the fixture account
 *   - four accounts survive, each with the same throwaway password
 *   - every other account link is dropped; the employee records stay
 *   - the owner gets an employee record of their own, which this workspace
 *     never had
 *   - Lunch is retimed to 11:30-15:30; Dinner already matched
 *   - archived locations and shift types are left behind
 *
 * The file it writes is not committed. It carries real names and real contact
 * details for forty-four people.
 *
 * Usage: node scripts/export-local-fixture.mjs [outfile]
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const CONTAINER =
  process.env.SUPABASE_DB_CONTAINER ?? "supabase_db_newfork-clean";
const WORKSPACE = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const PASSWORD = "123456789";

const OWNER = "merttepebas@meyhousefood.com";
const ACTIVE_LINK = "theweiwuer@gmail.com";
const ARCHIVED_LINK = "theweiwuer3@gmail.com";
const INVITED = "mt.tepebas@gmail.com";

/** Which employee record each account is attached to, by employee code. */
const ACTIVE_LINK_CODE = "E-9006";
const ARCHIVED_LINK_CODE = "E-0002";
/** The owner's own employee record, created here because none exists. */
const OWNER_EMPLOYEE_CODE = "E-9100";

const KEPT_EMAILS = [OWNER, ACTIVE_LINK, ARCHIVED_LINK, INVITED];
const emailList = KEPT_EMAILS.map((email) => `'${email}'`).join(", ");
const ownerId = `(select id from auth.users where email = '${OWNER}')`;

function psql(sql) {
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      CONTAINER,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-Atq",
      "-c",
      sql,
    ],
    { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
  ).trim();
}

function rows(sql) {
  const out = psql(`select coalesce(json_agg(t), '[]')::text from (${sql}) t`);
  return JSON.parse(out || "[]");
}

/** Column types, so a jsonb value can be written back as the right literal. */
function typesOf(schema, table) {
  const out = psql(
    `select string_agg(column_name || '=' || udt_name, chr(10) order by ordinal_position)
     from information_schema.columns
     where table_schema = '${schema}' and table_name = '${table}'`,
  );
  return new Map(
    out
      .split("\n")
      .filter(Boolean)
      .map((line) => line.split("=")),
  );
}

const quote = (text) => `'${text.replaceAll("'", "''")}'`;

function literal(value, udt) {
  if (value === null || value === undefined) return "null";
  if (udt === "jsonb" || udt === "json")
    return `${quote(JSON.stringify(value))}::${udt}`;
  if (udt.startsWith("_")) {
    const inner = Array.isArray(value) ? value : [value];
    const packed = inner.map((one) => `"${String(one)}"`).join(",");
    return `${quote(`{${packed}}`)}::${udt.slice(1)}[]`;
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  return quote(String(value));
}

/**
 * One table's worth of rows. A `raw` column is written as a SQL expression
 * rather than a value, which is how the password never lands in the file.
 */
function block(title, schema, table, selectSql, options = {}) {
  const { raw = {}, conflict = "(id)" } = options;
  const data = rows(selectSql);
  if (data.length === 0) return `-- ${title}: nothing to write\n`;
  const types = typesOf(schema, table);
  const columns = [...Object.keys(data[0]), ...Object.keys(raw)];
  const lines = data.map((row) => {
    const values = [
      ...Object.entries(row).map(([name, value]) =>
        literal(value, types.get(name) ?? "text"),
      ),
      ...Object.values(raw),
    ];
    return `  (${values.join(", ")})`;
  });
  return [
    `-- ${title} (${data.length})`,
    `insert into ${schema}.${table} (${columns.join(", ")}) values`,
    lines.join(",\n"),
    `on conflict ${conflict} do nothing;`,
    "",
  ].join("\n");
}

/** Every column but the ones named, as a json object per row. */
const rowJson = (alias, drop = []) =>
  drop.length === 0
    ? `to_jsonb(${alias})`
    : `to_jsonb(${alias}) - ${drop.map((one) => `'${one}'`).join(" - ")}`;

const keptLocations = `
  select id from public.locations
  where workspace_id = '${WORKSPACE}' and archived_at is null`;

const parts = [];

parts.push(`-- Meyhouse local working fixture
-- Written by scripts/export-local-fixture.mjs on ${new Date().toISOString()}
--
-- Replay after \`supabase db reset\`:
--   docker exec -i ${CONTAINER} psql -U postgres -d postgres < <this file>
--
-- LOCAL ONLY. Every account's password is ${PASSWORD}, and the file carries
-- real names and contact details. It is not committed, and it must never be
-- run against the hosted project.

begin;
`);

parts.push(
  block(
    "accounts",
    "auth",
    "users",
    `select ${rowJson("u", ["encrypted_password"])} from auth.users u
     where u.email in (${emailList})`,
    {
      raw: {
        encrypted_password: `extensions.crypt('${PASSWORD}', extensions.gen_salt('bf'))`,
      },
    },
  ),
);

parts.push(
  block(
    "sign-in identities",
    "auth",
    "identities",
    `select ${rowJson("i")} from auth.identities i
     join auth.users u on u.id = i.user_id
     where u.email in (${emailList})`,
  ),
);

parts.push(
  block(
    "account profiles",
    "public",
    "user_profiles",
    `select ${rowJson("p")} from public.user_profiles p
     join auth.users u on u.id = p.user_id
     where u.email in (${emailList})`,
    { conflict: "(user_id)" },
  ),
);

parts.push(
  block(
    "the workspace",
    "public",
    "workspaces",
    `select ${rowJson("w")}
       || jsonb_build_object(
            'created_by', ${ownerId},
            'closed_by', null,
            'lifecycle_status', 'active',
            'closure_scheduled_at', null,
            'closure_effective_at', null,
            'closed_at', null)
     from public.workspaces w where w.id = '${WORKSPACE}'`,
  ),
);

parts.push(`-- Who is in it: the owner, one account that can sign in as an
-- employee, and one whose access was taken so there is something suspended to
-- look at. Everybody else keeps their employee record and loses the account
-- that was attached to it.
insert into public.workspace_memberships (workspace_id, user_id, role, status)
select '${WORKSPACE}', u.id,
       case when u.email = '${OWNER}' then 'owner'::public.workspace_role
            else 'employee'::public.workspace_role end,
       case when u.email = '${ARCHIVED_LINK}' then 'suspended'::public.membership_status
            else 'active'::public.membership_status end
from auth.users u
where u.email in ('${OWNER}', '${ACTIVE_LINK}', '${ARCHIVED_LINK}')
on conflict (workspace_id, user_id) do nothing;
`);

parts.push(
  block(
    "locations",
    "public",
    "locations",
    `select ${rowJson("l")} from public.locations l
     where l.workspace_id = '${WORKSPACE}' and l.archived_at is null
     order by l.name`,
  ),
);

parts.push(
  block(
    "departments",
    "public",
    "departments",
    `select ${rowJson("d")} from public.departments d
     where d.workspace_id = '${WORKSPACE}' order by d.name`,
  ),
);

parts.push(
  block(
    "jobs",
    "public",
    "jobs",
    `select ${rowJson("j")} from public.jobs j
     where j.workspace_id = '${WORKSPACE}' order by j.name`,
  ),
);

parts.push(
  block(
    "shift types, with Lunch retimed",
    "public",
    "shift_types",
    `select ${rowJson("s")}
       || case when s.name = 'Lunch'
               then jsonb_build_object(
                      'default_start_time', '11:30:00',
                      'default_end_time', '15:30:00')
               else '{}'::jsonb end
     from public.shift_types s
     where s.workspace_id = '${WORKSPACE}' and s.archived_at is null
     order by s.name`,
  ),
);

parts.push(
  block(
    "people",
    "public",
    "employee_profiles",
    `select ${rowJson("e")}
       || jsonb_build_object(
            'created_by', ${ownerId},
            'archived_by', case when e.archived_at is null then null else ${ownerId} end,
            'user_id', case
              when e.employee_code = '${ACTIVE_LINK_CODE}'
                then (select id from auth.users where email = '${ACTIVE_LINK}')
              when e.employee_code = '${ARCHIVED_LINK_CODE}'
                then (select id from auth.users where email = '${ARCHIVED_LINK}')
              else null end)
     from public.employee_profiles e
     where e.workspace_id = '${WORKSPACE}' order by e.employee_code`,
  ),
);

parts.push(`-- The owner's own employee record. This workspace never had one,
-- and the Employees tab is where an owner's own details now live.
insert into public.employee_profiles (
  workspace_id, employee_code, first_name, last_name, preferred_name,
  invitation_email, user_id, created_by
)
select '${WORKSPACE}', '${OWNER_EMPLOYEE_CODE}',
       coalesce(nullif(split_part(coalesce(p.display_name, ''), ' ', 1), ''), 'Mert'),
       coalesce(nullif(split_part(coalesce(p.display_name, ''), ' ', 2), ''), 'Tepebas'),
       '', '${OWNER}', u.id, u.id
from auth.users u
left join public.user_profiles p on p.user_id = u.id
where u.email = '${OWNER}'
on conflict (workspace_id, employee_code) do nothing;
`);

parts.push(
  block(
    "where they work",
    "public",
    "employee_location_assignments",
    `select ${rowJson("a")} || jsonb_build_object('created_by', ${ownerId})
     from public.employee_location_assignments a
     where a.workspace_id = '${WORKSPACE}'
       and a.location_id in (${keptLocations})`,
  ),
);

parts.push(
  block(
    "what they do",
    "public",
    "employee_job_assignments",
    `select ${rowJson("a")} || jsonb_build_object('created_by', ${ownerId})
     from public.employee_job_assignments a
     where a.workspace_id = '${WORKSPACE}'`,
  ),
);

parts.push(
  block(
    "the private half of the drawer",
    "public",
    "employee_private_profiles",
    `select ${rowJson("p")} from public.employee_private_profiles p
     where p.workspace_id = '${WORKSPACE}'`,
    { conflict: "(employee_id)" },
  ),
);

parts.push(`-- One invitation left waiting, so there is something to accept.
insert into public.employee_invitations (
  workspace_id, employee_id, email, role, status, created_by, expires_at
)
select '${WORKSPACE}',
       (select id from public.employee_profiles
        where workspace_id = '${WORKSPACE}'
          and archived_at is null and user_id is null
        order by employee_code limit 1),
       '${INVITED}', 'employee'::public.workspace_role, 'pending',
       ${ownerId}, now() + interval '14 days'
on conflict do nothing;
`);

parts.push(`-- So the next employee added gets a code nobody is using.
insert into public.workspace_employee_counters (workspace_id, next_value)
values ('${WORKSPACE}', 9200)
on conflict (workspace_id) do update set next_value = greatest(
  public.workspace_employee_counters.next_value, excluded.next_value);

commit;
`);

const outfile = resolve(process.argv[2] ?? "supabase/local-fixture/meyhouse.sql");
mkdirSync(dirname(outfile), { recursive: true });
writeFileSync(outfile, parts.join("\n"), "utf8");
console.log(`wrote ${outfile}`);
