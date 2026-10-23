import { readFileSync } from 'fs';
import { join } from 'path';
import dataSource from '../data-source';
import { School } from '../../schools/school.entity';

// Edit schools.json (same folder) with the real SDO Leyte school list.
const SCHOOLS: { name: string; district: string }[] = JSON.parse(
  readFileSync(join(__dirname, 'schools.json'), 'utf8'),
);

async function run() {
  await dataSource.initialize();
  const repo = dataSource.getRepository(School);

  for (const s of SCHOOLS) {
    const exists = await repo.findOne({ where: { name: s.name } });
    if (!exists) {
      await repo.save(repo.create(s));
      console.log(`Seeded school: ${s.name}`);
    }
  }

  await dataSource.destroy();
  console.log('Done.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
