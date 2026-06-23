// scripts/make-admin.js
// One-time CLI helper to promote an existing user to admin.
//
// Usage:
//   node scripts/make-admin.js you@example.com
//
// Run this AFTER you've signed up normally on the site at least once.

require('dotenv').config();
const usersDb = require('../db/users');

async function main() {
  const email = process.argv[2];

  if (!email) {
    console.error('Usage: node scripts/make-admin.js <email>');
    process.exit(1);
  }

  const user = await usersDb.getUserByEmail(email);

  if (!user) {
    console.error(`No user found with email "${email}". Sign up on the site first, then run this again.`);
    process.exit(1);
  }

  await usersDb.setUserAdmin(user.id, true);
  console.log(`✅ ${user.email} is now an admin. Log out and back in on the site to see the Admin link.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
