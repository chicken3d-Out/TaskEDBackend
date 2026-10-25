import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProfileFields1790000000000 implements MigrationInterface {
  name = 'AddProfileFields1790000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "first_name" character varying`);
    await queryRunner.query(`ALTER TABLE "users" ADD "middle_name" character varying`);
    await queryRunner.query(`ALTER TABLE "users" ADD "last_name" character varying`);
    await queryRunner.query(`ALTER TABLE "users" ADD "contact_number" character varying`);
    await queryRunner.query(`ALTER TABLE "users" ADD "area" character varying`);
    await queryRunner.query(`ALTER TABLE "users" ADD "avatar_url" character varying`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "avatar_url"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "area"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "contact_number"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "last_name"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "middle_name"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "first_name"`);
  }
}
