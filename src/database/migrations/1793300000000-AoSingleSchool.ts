import { MigrationInterface, QueryRunner } from 'typeorm';

// An Administrative Officer now handles exactly one school: the school on
// their own profile. Rebuild the assignments from the profiles.
export class AoSingleSchool1793300000000 implements MigrationInterface {
  name = 'AoSingleSchool1793300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "ao_assigned_schools"`);
    // First AO (oldest account) keeps a school if two AOs chose the same one.
    await queryRunner.query(`
      INSERT INTO "ao_assigned_schools" ("user_id", "school_id")
      SELECT DISTINCT ON (u."school_id") u."id", u."school_id"
      FROM "users" u
      WHERE u."role" = 'admin_officer' AND u."school_id" IS NOT NULL AND u."status" IN ('pending', 'approved')
      ORDER BY u."school_id", u."created_at" ASC
    `);
  }

  public async down(): Promise<void> {
    // Nothing to restore: the old multi-school assignments are not kept.
  }
}
