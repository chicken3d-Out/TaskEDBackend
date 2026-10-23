import dataSource from '../data-source';
import { School } from '../../schools/school.entity';

// Placeholder seed data - replace with the real SDO Leyte school list.
const SCHOOLS: { name: string; district: string }[] = [
  { name: 'Santa Fe Central School', district: 'Santa Fe District' },
  { name: 'Leyte National High School', district: 'Leyte District' },
  { name: 'Palo Central Elementary School', district: 'Palo District' },
];

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
