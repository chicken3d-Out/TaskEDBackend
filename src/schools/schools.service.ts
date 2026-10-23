import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { School } from './school.entity';

@Injectable()
export class SchoolsService {
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
}
