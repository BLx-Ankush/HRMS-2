// Creates the two demo auth users (admin + employee) via the Supabase Admin API.
// The on_auth_user_created trigger turns each into a `profiles` row.
//
// Run from the project root AFTER applying supabase/migrations/0001_init.sql:
//
//   node --env-file=.env scripts/seed-users.mjs
//
// (Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env — server-only,
//  never prefixed with VITE_, never committed.)

import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (e.g. in .env, run with --env-file=.env).");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const users = [
  { email: "admin@dayflow.com",    password: "admin123",    name: "Sarah Johnson", employee_id: "EMP001", role: "admin" },
  { email: "employee@dayflow.com", password: "employee123", name: "John Smith",    employee_id: "EMP002", role: "employee" },
];

for (const u of users) {
  const { data, error } = await admin.auth.admin.createUser({
    email: u.email,
    password: u.password,
    email_confirm: true,
    user_metadata: { name: u.name, employee_id: u.employee_id, role: u.role },
  });
  if (error) {
    if (String(error.message).toLowerCase().includes("already")) {
      console.log(`• ${u.email} already exists — skipping`);
    } else {
      console.error(`✗ ${u.email}:`, error.message);
    }
  } else {
    console.log(`✓ created ${u.email} (${u.employee_id}, ${u.role}) — id ${data.user.id}`);
  }
}

console.log("\nDone. Now run supabase/seed.sql in the SQL Editor to add the rest of the data.");
