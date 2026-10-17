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
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const CONTAINER =
  process.env.SUPABASE_DB_CONTAINER ?? "supabase_db_newfork-clean";
// Which database to read from. The working data now lives in a restored copy,
// because the live one was reset; SUPABASE_DB_NAME points this at it.
const DATABASE = process.env.SUPABASE_DB_NAME ?? "postgres";
const WORKSPACE = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
// The seed owns the id above, and both have to exist in the same database
// once the fixture loads on every reset, so the export is rewritten to this
// one on the way out.
const NEW_WORKSPACE = "6ea5d512-bc7f-4cf3-aad4-2f0815de0fa1";
const PASSWORD = "123456789";

// The structure this workspace is meant to have, rather than the one it grew.
// Everything outside these two lists is left behind: BOH, MANAGEMENT, two
// departments called deneme, and jobs called Deneme, kkk and oooo, none of
// which has a single person in it.
const DEPARTMENTS = ["FOH", "BAR"];
const JOBS = [
  "Server", "Busser", "Hostess", "Stocker", "Expo",
  "Jr. Bartender", "Freshman Bartender", "Core Bartender",
];
// The one job with people on it that the list above does not keep. FOH had a
// plain "Bartender" alongside BAR's three grades; its three people move to the
// grade they would hold.
const JOB_MERGED_AWAY = "Bartender";
const JOB_MERGED_INTO = "Core Bartender";

const OWNER = "merttepebas@meyhousefood.com";
const ACTIVE_LINK = "theweiwuer@gmail.com";
const SECOND_ACTIVE_LINK = "mt.tepebas@gmail.com";
const ARCHIVED_LINK = "theweiwuer3@gmail.com";

/** Which employee record each account is attached to, by employee code. */
const ACTIVE_LINK_CODE = "E-9006";
const SECOND_ACTIVE_LINK_CODE = "E-9008";
const ARCHIVED_LINK_CODE = "E-0002";
/** The owner's own employee record, created here because none exists. */
const OWNER_EMPLOYEE_CODE = "E-9100";
// Not user_profiles.display_name: that reads "Account owner" on this
// database, which is not a name to put in the Employees tab.
const OWNER_FIRST_NAME = "Mert";
const OWNER_LAST_NAME = "Tepebas";

const KEPT_EMAILS = [OWNER, ACTIVE_LINK, SECOND_ACTIVE_LINK, ARCHIVED_LINK];
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
      DATABASE,
      "-Atq",
      "-c",
      sql,
    ],
    { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
  ).trim();
}

/**
 * Every select below returns one jsonb value per row -- the row itself, with
 * the columns this export rewrites already replaced. Naming that column keeps
 * the aggregate from wrapping it in another object.
 */
function rows(sql) {
  const out = psql(
    `select coalesce(json_agg(row_json), '[]')::text from (${sql}) as source(row_json)`,
  );
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

/**
 * Columns the database computes for itself. auth.users.confirmed_at is one:
 * writing to it is an error, not a no-op, so they have to come back out.
 */
function generatedIn(schema, table) {
  const out = psql(
    `select string_agg(column_name, chr(10))
     from information_schema.columns
     where table_schema = '${schema}' and table_name = '${table}'
       and (is_generated = 'ALWAYS' or identity_generation = 'ALWAYS')`,
  );
  return new Set(out.split("\n").filter(Boolean));
}

/** Columns that point at an account, so rows can stop pointing at dropped ones. */
function accountColumns(schema, table) {
  const out = psql(
    `select string_agg(attribute.attname, chr(10))
     from pg_constraint reference
     join unnest(reference.conkey) as key(attnum) on true
     join pg_attribute attribute
       on attribute.attrelid = reference.conrelid and attribute.attnum = key.attnum
     where reference.contype = 'f'
       and reference.confrelid = 'auth.users'::regclass
       and reference.conrelid = '${schema}.${table}'::regclass`,
  );
  return new Set(out.split("\n").filter(Boolean));
}

/** The four accounts this export keeps. Everything else pointed at the owner. */
const keptIds = new Set(
  psql(`select string_agg(id::text, chr(10)) from auth.users where email in (${emailList})`)
    .split("\n")
    .filter(Boolean),
);
const ownerIdValue = psql(
  `select id::text from auth.users where email = '${OWNER}'`,
);

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
  // No conflict target: "on conflict do nothing" covers every unique
  // constraint a table has, which saves knowing which one each table uses.
  const { raw = {} } = options;
  const data = rows(selectSql);
  if (data.length === 0) return `-- ${title}: nothing to write\n`;
  const types = typesOf(schema, table);
  const computed = generatedIn(schema, table);
  const accounts = accountColumns(schema, table);
  const names = Object.keys(data[0]).filter((name) => !computed.has(name));
  const columns = [...names, ...Object.keys(raw)];
  const lines = data.map((row) => {
    const values = [
      ...names.map((name) => {
        // Whoever created or last touched a row is usually an account this
        // export drops. The row is still wanted; the finger pointing at a
        // missing account is not, so it points at the owner instead.
        const value =
          accounts.has(name) && row[name] !== null && !keptIds.has(row[name])
            ? ownerIdValue
            : row[name];
        return literal(value, types.get(name) ?? "text");
      }),
      ...Object.values(raw),
    ];
    return `  (${values.join(", ")})`;
  });
  return [
    `-- ${title} (${data.length})`,
    `insert into ${schema}.${table} (${columns.join(", ")}) values`,
    lines.join(",\n"),
    "on conflict do nothing;",
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

// Creating the workspace seeds its four system roles through a trigger, with
// ids of its own making, so the roles themselves are not exported -- only what
// this workspace decided each of them may do, keyed by the role's system name
// rather than by an id that will not exist on the other side.
const rolePermissions = rows(
  `select to_jsonb(p) - 'role_id' - 'workspace_id' - 'created_at'
     || jsonb_build_object('system_key', r.system_key)
   from public.workspace_role_permissions p
   join public.workspace_roles r on r.id = p.role_id
   where p.workspace_id = '${WORKSPACE}'
   order by r.system_key, p.permission_key`,
);

parts.push(`-- what each role may do (${rolePermissions.length})
delete from public.workspace_role_permissions where workspace_id = '${WORKSPACE}';
insert into public.workspace_role_permissions (workspace_id, role_id, permission_key)
select '${WORKSPACE}', role.id, wanted.permission_key
from (values
${rolePermissions
  .map((row) => `  (${quote(row.system_key)}, ${quote(row.permission_key)})`)
  .join(",\n")}
) as wanted(system_key, permission_key)
join public.workspace_roles role
  on role.workspace_id = '${WORKSPACE}' and role.system_key::text = wanted.system_key
on conflict do nothing;
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
     where d.workspace_id = '${WORKSPACE}'
       and d.name = any(array[${DEPARTMENTS.map(quote).join(", ")}])
     order by d.name`,
  ),
);

parts.push(
  block(
    "jobs",
    "public",
    "jobs",
    `select ${rowJson("j")} from public.jobs j
     join public.departments d on d.id = j.department_id
     where j.workspace_id = '${WORKSPACE}'
       and d.name = any(array[${DEPARTMENTS.map(quote).join(", ")}])
       and j.name = any(array[${JOBS.map(quote).join(", ")}])
     order by d.name, j.name`,
  ),
);

parts.push(
  block(
    "shift types, with Lunch retimed",
    "public",
    "shift_types",
    `select ${rowJson("s")}
       || case s.name
               when 'Lunch' then jsonb_build_object(
                 'default_start_time', '11:30:00', 'default_end_time', '15:30:00')
               when 'Dinner' then jsonb_build_object(
                 'default_start_time', '16:15:00', 'default_end_time', '23:30:00')
               else '{}'::jsonb end
     from public.shift_types s
     where s.workspace_id = '${WORKSPACE}' and s.archived_at is null
     order by s.name`,
  ),
);

parts.push(
  block(
    "the hours those shift types have run, with Lunch's current one retimed",
    "public",
    "shift_type_time_versions",
    `select ${rowJson("v")}
       || case when v.revision <> s.default_revision then '{}'::jsonb
               when s.name = 'Lunch'
                 then jsonb_build_object('start_time', '11:30:00', 'end_time', '15:30:00')
               when s.name = 'Dinner'
                 then jsonb_build_object('start_time', '16:15:00', 'end_time', '23:30:00')
               else '{}'::jsonb end
     from public.shift_type_time_versions v
     join public.shift_types s on s.id = v.shift_type_id
     where v.workspace_id = '${WORKSPACE}' and s.archived_at is null
     order by s.name, v.revision`,
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
              when e.employee_code = '${SECOND_ACTIVE_LINK_CODE}'
                then (select id from auth.users where email = '${SECOND_ACTIVE_LINK}')
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
       '${OWNER_FIRST_NAME}', '${OWNER_LAST_NAME}',
       '', '${OWNER}', u.id, u.id
from auth.users u
where u.email = '${OWNER}'
on conflict (workspace_id, employee_code) do nothing;
`);

parts.push(`-- Who is in it: the owner, one account that can sign in as an
-- employee, and one whose access was taken so there is something suspended to
-- look at. Everybody else keeps their employee record and loses the account
-- that was attached to it.
insert into public.workspace_memberships (
  workspace_id, user_id, role, role_id, status, employee_id, all_locations
)
select '${WORKSPACE}', u.id,
       (case when u.email = '${OWNER}' then 'owner' else 'employee' end)::public.workspace_role,
       (select r.id from public.workspace_roles r
        where r.workspace_id = '${WORKSPACE}'
          and r.access_class::text = case when u.email = '${OWNER}' then 'owner' else 'employee' end),
       (case when u.email = '${ARCHIVED_LINK}' then 'suspended' else 'active' end)::public.membership_status,
       (select e.id from public.employee_profiles e
        where e.workspace_id = '${WORKSPACE}' and e.user_id = u.id limit 1),
       true
from auth.users u
where u.email in ('${OWNER}', '${ACTIVE_LINK}', '${SECOND_ACTIVE_LINK}', '${ARCHIVED_LINK}')
on conflict do nothing;
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
    `select ${rowJson("a")}
       || jsonb_build_object('created_by', ${ownerId})
       || case when job.name = ${quote(JOB_MERGED_AWAY)}
               then jsonb_build_object('job_id', (
                 select kept.id from public.jobs kept
                 join public.departments dept on dept.id = kept.department_id
                 where kept.workspace_id = '${WORKSPACE}'
                   and kept.name = ${quote(JOB_MERGED_INTO)}
                   and dept.name = any(array[${DEPARTMENTS.map(quote).join(", ")}])))
               else '{}'::jsonb end
     from public.employee_job_assignments a
     join public.jobs job on job.id = a.job_id
     left join public.departments job_dept on job_dept.id = job.department_id
     where a.workspace_id = '${WORKSPACE}'
       and (
         (job.name = any(array[${JOBS.map(quote).join(", ")}])
          and job_dept.name = any(array[${DEPARTMENTS.map(quote).join(", ")}]))
         or job.name = ${quote(JOB_MERGED_AWAY)}
       )`,
  ),
);

parts.push(
  block(
    "the private half of the drawer",
    "public",
    "employee_private_profiles",
    `select ${rowJson("p")} from public.employee_private_profiles p
     where p.workspace_id = '${WORKSPACE}'`,
  ),
);


parts.push(
  block(
    "the owner's setup, already finished",
    "public",
    "workspace_onboarding",
    `select ${rowJson("o")} from public.workspace_onboarding o
     where o.workspace_id = '${WORKSPACE}'`,
  ),
);

parts.push(
  block(
    "scheduling settings",
    "public",
    "workspace_scheduling_settings",
    `select ${rowJson("g")} from public.workspace_scheduling_settings g
     where g.workspace_id = '${WORKSPACE}'`,
  ),
);

parts.push(`-- So the next employee added gets a code nobody is using.
insert into public.workspace_employee_counters (workspace_id, next_value)
values ('${WORKSPACE}', 9200)
on conflict (workspace_id) do update set next_value = greatest(
  public.workspace_employee_counters.next_value, excluded.next_value);

commit;
`);

const outfile = resolve(process.argv[2] ?? "supabase/local-fixture/meyhouse.sql");
mkdirSync(dirname(outfile), { recursive: true });
/**
 * This workspace grew out of the seed's own workspace, so it still holds rows
 * the seed will insert again under the same ids -- the FOH department carries
 * the id the seed gives "Dining Room". Both now load into the same database,
 * and `on conflict do nothing` would silently drop ours and leave every job
 * pointing at a department that is not there.
 *
 * So every id the two have in common is moved aside. Rewriting the text rather
 * than each select keeps the queries readable and cannot miss a column: an id
 * is the same string wherever it appears.
 */
function withoutSeedCollisions(sql) {
  const seed = readFileSync(resolve("supabase/seed.sql"), "utf8");
  const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
  // The all-zero id is not a row: it is auth's instance id, the same on every
  // account. Moving it aside breaks sign-in for every exported account.
  const shared = [...new Set(seed.match(uuid) ?? [])].filter(
    (id) => id !== "00000000-0000-0000-0000-000000000000" && sql.includes(id),
  );
  let moved = 0;
  for (const id of shared) {
    let replacement;
    do {
      // A uuid's last group is twelve characters; keeping thirty and adding
      // six leaves it exactly that long.
      replacement = `${id.slice(0, 30)}fa${(++moved).toString(16).padStart(4, "0")}`;
    } while (sql.includes(replacement) || seed.includes(replacement));
    sql = sql.replaceAll(id, replacement);
  }
  console.log(`moved ${moved} id${moved === 1 ? "" : "s"} the seed also uses`);
  return sql;
}

writeFileSync(
  outfile,
  withoutSeedCollisions(parts.join("\n").replaceAll(WORKSPACE, NEW_WORKSPACE)),
  "utf8",
);
console.log(`wrote ${outfile}`);
