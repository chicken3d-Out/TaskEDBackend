import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { School } from './school.entity';

@Injectable()
export class SchoolsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SchoolsService.name);

  constructor(
    @InjectRepository(School) private schoolsRepo: Repository<School>,
  ) {}

  findAll(): Promise<School[]> {
    return this.schoolsRepo.find({ order: { district: 'ASC', name: 'ASC' } });
  }

  findById(id: string): Promise<School | null> {
    return this.schoolsRepo.findOne({ where: { id } });
  }

  findByIds(ids: string[]): Promise<School[]> {
    if (!ids.length) return Promise.resolve([]);
    return this.schoolsRepo.find({ where: { id: In(ids) } });
  }

  create(name: string, district: string): Promise<School> {
    const school = this.schoolsRepo.create({ name, district });
    return this.schoolsRepo.save(school);
  }

  // Optional: set SEED_SCHOOLS_ON_BOOT=true on the host to insert any schools
  // from src/database/seeds/schools.json that are missing. Lets you seed a
  // hosted database from inside the host's network (no direct DB access).
  async onApplicationBootstrap() {
    if (process.env.SEED_SCHOOLS_ON_BOOT !== 'true') return;
    const file = join(process.cwd(), 'src/database/seeds/schools.json');
    if (!existsSync(file)) {
      this.logger.warn(`schools.json not found at ${file}`);
      return;
    }
    const list: { name: string; district: string }[] = JSON.parse(readFileSync(file, 'utf8'));
    let added = 0;
    for (const s of list) {
      const exists = await this.schoolsRepo.findOne({ where: { name: s.name } });
      if (!exists) {
        await this.schoolsRepo.save(this.schoolsRepo.create(s));
        added++;
      }
    }
    this.logger.log(`School seed done, ${added} added`);
  }
}
