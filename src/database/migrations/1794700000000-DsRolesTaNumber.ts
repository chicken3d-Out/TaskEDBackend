import { MigrationInterface, QueryRunner } from 'typeorm';

export class DsRolesTaNumber1794700000000 implements MigrationInterface {
  name = 'DsRolesTaNumber1794700000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TYPE "public"."users_role_enum" ADD VALUE IF NOT EXISTS 'district_supervisor'`);
    await q.query(`ALTER TYPE "public"."users_role_enum" ADD VALUE IF NOT EXISTS 'ds_secretary'`);
    await q.query(`ALTER TABLE "travel_signatories" ADD COLUMN IF NOT EXISTS "signature" text`);
    await q.query(`ALTER TABLE "travel_authorities" ADD COLUMN IF NOT EXISTS "ta_number" character varying(30)`);
    await q.query(`ALTER TABLE "travel_authorities" ADD COLUMN IF NOT EXISTS "ta_numbered_at" TIMESTAMP WITH TIME ZONE`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_ta_number" ON "travel_authorities" ("ta_number")`);
    await q.query(`ALTER TABLE "travel_attachments" ADD COLUMN IF NOT EXISTS "url" character varying(600)`);
    await q.query(`ALTER TABLE "travel_attachments" ADD COLUMN IF NOT EXISTS "public_id" character varying(300)`);
    await q.query(`ALTER TABLE "travel_attachments" ALTER COLUMN "data" DROP NOT NULL`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "travel_attachments" DROP COLUMN "public_id", DROP COLUMN "url"`);
    await q.query(`DROP INDEX IF EXISTS "UQ_ta_number"`);
    await q.query(`ALTER TABLE "travel_authorities" DROP COLUMN "ta_numbered_at", DROP COLUMN "ta_number"`);
    await q.query(`ALTER TABLE "travel_signatories" DROP COLUMN "signature"`);
  }
}
