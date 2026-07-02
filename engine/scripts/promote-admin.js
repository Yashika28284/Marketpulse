'use strict';

/**
 * One-off CLI to promote an already-registered account to role='admin'.
 *
 * Deliberately NOT an HTTP route. An API endpoint that can grant admin —
 * even one gated behind "you must already be admin" — is a privilege-
 * escalation target the moment there's any bug in that gate (see: the
 * whole reason /auth/token got locked out of production). Doing this as
 * a script that requires direct DATABASE_URL access means promoting an
 * admin requires the same access level as touching the DB directly —
 * which is the right bar for "who can grant admin."
 *
 * Usage:
 *   1. Register normally through the app first (POST /api/auth/register)
 *      so the account/password/email already exist.
 *   2. Then, with DATABASE_URL pointed at the deployed DB:
 *        DATABASE_URL=postgresql://... node scripts/promote-admin.js you@example.com
 *   3. Log out and back in (or just re-request a token via /auth/login)
 *      to pick up a token with the new role — the old token still has
 *      the old role baked into it until it expires (12h).
 */

const { Pool } = require('pg');

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: node scripts/promote-admin.js <email>');
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error('Fatal: DATABASE_URL env var required (point it at the deployed DB).');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const result = await pool.query(
      `UPDATE users SET role = 'admin' WHERE email = $1 RETURNING account_id, email, role`,
      [email.toLowerCase()]
    );
    if (result.rows.length === 0) {
      console.error(`No user found with email '${email}'. Register the account first, then promote it.`);
      process.exit(1);
    }
    console.log('Promoted:', result.rows[0]);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
