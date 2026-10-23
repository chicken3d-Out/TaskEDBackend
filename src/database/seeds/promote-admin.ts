// One-time bootstrap: the approval chain requires an Administrator to
// approve AO / public-post accounts, but nobody exists to approve the
// very first Administrator. Run this once, manually, after that person
// has signed in via Google at least once (so their user row exists).
//
// Usage: ts-node src/database/seeds/promote-admin.ts someone@deped.gov.ph
import dataSource from '../data-source';
import { User } from '../../users/user.entity';
import { Role, AccountStatus } from '../../common/enums/role.enum';

async function run() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: ts-node src/database/seeds/promote-admin.ts <deped-email>');
    process.exit(1);
  }

  await dataSource.initialize();
  const repo = dataSource.getRepository(User);
  const user = await repo.findOne({ where: { depedEmail: email } });

  if (!user) {
    console.error(
      `No user found for ${email}. They need to sign in with Google at least once first.`,
    );
    await dataSource.destroy();
    process.exit(1);
  }

  user.role = Role.ADMINISTRATOR;
  user.status = AccountStatus.APPROVED;
  user.designation = user.designation || 'System Administrator';
  user.district = user.district || 'Division Office';
  user.approvedAt = new Date();
  await repo.save(user);

  console.log(`${email} is now an approved Administrator.`);
  await dataSource.destroy();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
