// Create or reset an Administrator account (username + password) straight in
// the database. Usage: npm run create-admin -- <username> <password>
// Only needed when you can reach the database directly; on hosted setups
// set ADMIN_USERNAME / ADMIN_PASSWORD on the server instead.
import * as bcrypt from 'bcryptjs';
import dataSource from '../data-source';
import { User } from '../../users/user.entity';
import { Role, AccountStatus } from '../../common/enums/role.enum';

async function run() {
  const [username, password] = process.argv.slice(2);
  if (!username || !password || password.length < 10) {
    console.error('Usage: npm run create-admin -- <username> <password of 10+ characters>');
    process.exit(1);
  }
  await dataSource.initialize();
  const repo = dataSource.getRepository(User);
  let user = await repo
    .createQueryBuilder('u')
    .where('lower(u.username) = lower(:username)', { username })
    .getOne();
  const hash = await bcrypt.hash(password, 10);
  if (!user) {
    user = repo.create({
      username,
      firstName: 'System',
      lastName: 'Administrator',
      name: 'System Administrator',
      designation: 'System Administrator',
    });
  }
  user.passwordHash = hash;
  user.role = Role.ADMINISTRATOR;
  user.status = AccountStatus.APPROVED;
  user.approvedAt = new Date();
  await repo.save(user);
  console.log(`Administrator "${username}" is ready.`);
  await dataSource.destroy();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
