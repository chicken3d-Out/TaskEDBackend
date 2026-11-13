import { MigrationInterface, QueryRunner } from 'typeorm';

export class TravelAuthorityCountersign1794600000000 implements MigrationInterface {
  name = 'TravelAuthorityCountersign1794600000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "travel_authorities" ADD COLUMN IF NOT EXISTS "countersign_name" character varying(150) NOT NULL DEFAULT ''`);
    await q.query(`ALTER TABLE "travel_authorities" ADD COLUMN IF NOT EXISTS "sig_countersign" jsonb`);
    await q.query(`ALTER TABLE "travel_authorities" ADD COLUMN IF NOT EXISTS "approving_by_email" boolean NOT NULL DEFAULT false`);
    await q.query(`ALTER TABLE "travel_authorities" ADD COLUMN IF NOT EXISTS "emailed_at" TIMESTAMP WITH TIME ZONE`);
    await q.query(`ALTER TABLE "travel_authorities" ADD COLUMN IF NOT EXISTS "countersign_user_id" uuid`);
    await q.query(`ALTER TABLE "travel_authorities" ADD CONSTRAINT "FK_ta_counter" FOREIGN KEY ("countersign_user_id") REFERENCES "users"("id") ON DELETE SET NULL`);
    await q.query(`CREATE TABLE IF NOT EXISTS "travel_attachments" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "name" character varying(200) NOT NULL,
      "mime" character varying(100) NOT NULL,
      "size" integer NOT NULL,
      "data" bytea NOT NULL,
      "created_at" TIMESTAMP NOT NULL DEFAULT now(),
      "travel_authority_id" uuid,
      CONSTRAINT "PK_travel_attachments" PRIMARY KEY ("id"))`);
    await q.query(`ALTER TABLE "travel_attachments" ADD CONSTRAINT "FK_tatt_ta" FOREIGN KEY ("travel_authority_id") REFERENCES "travel_authorities"("id") ON DELETE CASCADE`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "travel_attachments"`);
    await q.query(`ALTER TABLE "travel_authorities" DROP COLUMN "countersign_user_id", DROP COLUMN "emailed_at", DROP COLUMN "approving_by_email", DROP COLUMN "sig_countersign", DROP COLUMN "countersign_name"`);
  }
}
