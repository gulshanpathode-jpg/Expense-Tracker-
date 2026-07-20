// Emergency password reset, run directly on the server by whoever has shell
// access. This is the recovery path of last resort — e.g. when the admin
// forgets their own password and there is no one left in-app to reset it.
//
//   npm run reset:password -- <email> <newPassword>
//
// Revokes every refresh token for the user so all existing sessions log out.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const [email, newPassword] = process.argv.slice(2);
  if (!email || !newPassword) {
    console.error('Usage: npm run reset:password -- <email> <newPassword>');
    process.exit(1);
  }
  if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
    console.error('Password must be at least 8 characters and include a letter and a number.');
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user) {
    console.error(`No user found with email "${email}".`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
    prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);

  console.log(`Password reset for ${user.email} (${user.name}). All existing sessions were signed out.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
