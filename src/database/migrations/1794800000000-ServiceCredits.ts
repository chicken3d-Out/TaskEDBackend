import { MigrationInterface, QueryRunner } from 'typeorm';

export class ServiceCredits1794800000000 implements MigrationInterface {
  name = 'ServiceCredits1794800000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TYPE "public"."users_role_enum" ADD VALUE IF NOT EXISTS 'non_teaching'`);
    await q.query(`ALTER TYPE "public"."notifications_type_enum" ADD VALUE IF NOT EXISTS 'service_credit'`);
    await q.query(`CREATE TABLE IF NOT EXISTS "leave_credits" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "user_id" uuid NOT NULL,
      "kind" character varying(20) NOT NULL,
      "balance" numeric(7,2) NOT NULL DEFAULT 0,
      "initial_set" boolean NOT NULL DEFAULT false,
      "year" integer,
      "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "PK_leave_credits" PRIMARY KEY ("id"),
      CONSTRAINT "FK_leave_credits_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE)`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_leave_credit_user_kind" ON "leave_credits" ("user_id", "kind")`);
    await q.query(`CREATE TABLE IF NOT EXISTS "leave_credit_logs" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "user_id" uuid NOT NULL,
      "kind" character varying(20) NOT NULL,
      "type" character varying(20) NOT NULL,
      "delta" numeric(7,2) NOT NULL,
      "balance_after" numeric(7,2) NOT NULL,
      "reason" text,
      "so_number" character varying(100),
      "file_name" character varying(200),
      "file_url" character varying(600),
      "file_public_id" character varying(300),
      "leave_id" uuid,
      "actor_id" uuid,
      "created_at" TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "PK_leave_credit_logs" PRIMARY KEY ("id"),
      CONSTRAINT "FK_lcl_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
      CONSTRAINT "FK_lcl_actor" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL)`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_lcl_user" ON "leave_credit_logs" ("user_id", "created_at")`);
    await q.query(`CREATE TABLE IF NOT EXISTS "leave_credit_requests" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "user_id" uuid NOT NULL,
      "kind" character varying(20) NOT NULL,
      "old_balance" numeric(7,2) NOT NULL,
      "new_balance" numeric(7,2) NOT NULL,
      "reason" text NOT NULL,
      "requested_by_id" uuid,
      "status" character varying(12) NOT NULL DEFAULT 'pending',
      "decided_by_id" uuid,
      "decided_note" text,
      "decided_at" TIMESTAMP WITH TIME ZONE,
      "created_at" TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "PK_leave_credit_requests" PRIMARY KEY ("id"),
      CONSTRAINT "FK_lcr_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
      CONSTRAINT "FK_lcr_by" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE SET NULL,
      CONSTRAINT "FK_lcr_dec" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "leave_credit_requests"`);
    await q.query(`DROP TABLE IF EXISTS "leave_credit_logs"`);
    await q.query(`DROP TABLE IF EXISTS "leave_credits"`);
  }
}
