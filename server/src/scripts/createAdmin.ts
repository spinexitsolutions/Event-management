/**
 * Creates (or promotes) a Super Admin. No default credentials exist.
 *   npm run create-admin -- --email you@company.com --name "Your Name"
 * The password is read from ADMIN_PASSWORD or prompted interactively (never passed as an argument).
 */
import readline from 'node:readline';
import { ROLE_KEYS } from '@maison/shared';
import { prisma } from '../config/db';
import { assertStrongPassword, hashPassword } from '../services/auth.service';

const arg = (k: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};

function ask(q: string, hidden = false): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (hidden) (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => process.stdout.write(s.includes(q) ? s : '*');
  return new Promise((res) => rl.question(q, (a) => (rl.close(), process.stdout.write(hidden ? '\n' : ''), res(a.trim()))));
}

async function main() {
  const roles = await prisma.role.count({ where: { key: { in: [...ROLE_KEYS] } } });
  if (roles < ROLE_KEYS.length) throw new Error('Roles missing. Run "npm run seed" first.');
  const email = (arg('email') ?? (await ask('Admin email: '))).toLowerCase();
  const name = arg('name') ?? (await ask('Full name: '));
  const password = process.env.ADMIN_PASSWORD ?? (await ask('Password (10+ chars, letters & numbers): ', true));
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Invalid email');
  assertStrongPassword(password);
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.upsert({ where: { email }, update: { passwordHash, roleKey: 'SUPER_ADMIN', status: 'ACTIVE', name }, create: { email, name, passwordHash, roleKey: 'SUPER_ADMIN', status: 'ACTIVE' } });
  await prisma.auditLog.create({ data: { actorId: user.id, action: 'staff.create_admin_cli', entityType: 'User', entityId: user.id, summary: 'Super Admin created from CLI' } });
  console.log(`Super Admin ready: ${user.email}. Sign in at /login`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
