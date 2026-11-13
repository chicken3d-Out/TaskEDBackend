import { MigrationInterface, QueryRunner } from 'typeorm';

export class TravelAuthority1794500000000 implements MigrationInterface {
  name = 'TravelAuthority1794500000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "signature" text`);
    await q.query(`ALTER TYPE "public"."notifications_type_enum" ADD VALUE IF NOT EXISTS 'travel_authority'`);
    await q.query(`CREATE TABLE IF NOT EXISTS "travel_signatories" ("key" character varying(30) NOT NULL, "name" character varying(150) NOT NULL DEFAULT '', "user_id" uuid, CONSTRAINT "PK_travel_signatories" PRIMARY KEY ("key"))`);
    await q.query(`CREATE TABLE IF NOT EXISTS "travel_authorities" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "data" jsonb NOT NULL,
      "outside" boolean NOT NULL DEFAULT false,
      "status" character varying(30) NOT NULL DEFAULT 'draft',
      "recommending_name" character varying(150) NOT NULL DEFAULT '',
      "approving_name" character varying(150) NOT NULL DEFAULT '',
      "sig_requester" jsonb, "sig_recommending" jsonb, "sig_approving" jsonb,
      "rev" integer NOT NULL DEFAULT 1,
      "drive_rev" integer NOT NULL DEFAULT 0,
      "drive_link" character varying(1500),
      "created_at" TIMESTAMP NOT NULL DEFAULT now(),
      "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
      "owner_id" uuid, "requester_id" uuid, "recommending_user_id" uuid, "approving_user_id" uuid,
      CONSTRAINT "PK_travel_authorities" PRIMARY KEY ("id"))`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_ta_owner" ON "travel_authorities" ("owner_id")`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_ta_requester" ON "travel_authorities" ("requester_id")`);
    await q.query(`ALTER TABLE "travel_signatories" ADD CONSTRAINT "FK_ts_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL`);
    await q.query(`ALTER TABLE "travel_authorities" ADD CONSTRAINT "FK_ta_owner" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE`);
    await q.query(`ALTER TABLE "travel_authorities" ADD CONSTRAINT "FK_ta_requester" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE CASCADE`);
    await q.query(`ALTER TABLE "travel_authorities" ADD CONSTRAINT "FK_ta_rec" FOREIGN KEY ("recommending_user_id") REFERENCES "users"("id") ON DELETE SET NULL`);
    await q.query(`ALTER TABLE "travel_authorities" ADD CONSTRAINT "FK_ta_appr" FOREIGN KEY ("approving_user_id") REFERENCES "users"("id") ON DELETE SET NULL`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "travel_authorities"`);
    await q.query(`DROP TABLE "travel_signatories"`);
    await q.query(`ALTER TABLE "users" DROP COLUMN "signature"`);
  }
}
