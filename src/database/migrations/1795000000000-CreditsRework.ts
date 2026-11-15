import { MigrationInterface, QueryRunner } from 'typeorm';

// Vacation and Sick Leave become two credits (earned monthly); CTO is kept in batches that expire.
export class CreditsRework1795000000000 implements MigrationInterface {
  name = 'CreditsRework1795000000000';
  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "leave_credits" ADD COLUMN IF NOT EXISTS "accrual_month" varchar(7)`);
    await q.query(`ALTER TABLE "leave_credit_logs" ADD COLUMN IF NOT EXISTS "expires_at" date`);
    await q.query(`ALTER TABLE "leave_credit_logs" ADD COLUMN IF NOT EXISTS "meta" jsonb`);
    await q.query(`CREATE TABLE IF NOT EXISTS "leave_credit_batches" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "user_id" uuid NOT NULL,
      "kind" varchar(20) NOT NULL DEFAULT 'cto',
      "amount" numeric(7,2) NOT NULL,
      "remaining" numeric(7,2) NOT NULL,
      "expires_at" date,
      "so_number" varchar(100),
      "created_at" TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "PK_leave_credit_batches" PRIMARY KEY ("id"),
      CONSTRAINT "FK_leave_credit_batches_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE)`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_leave_credit_batches_user" ON "leave_credit_batches" ("user_id")`);
    // the old combined credit becomes Vacation Leave
    await q.query(`UPDATE "leave_credits" SET "kind"='vl', "accrual_month"=to_char(now(),'YYYY-MM') WHERE "kind"='vl_sl'`);
    await q.query(`UPDATE "leave_credit_logs" SET "kind"='vl' WHERE "kind"='vl_sl'`);
    await q.query(`UPDATE "leave_credit_requests" SET "kind"='vl' WHERE "kind"='vl_sl'`);
    await q.query(`UPDATE "leave_applications" SET "kind"='vl' WHERE "kind"='vl_sl'`);
    // existing CTO counts become one batch with no expiry
    await q.query(`INSERT INTO "leave_credit_batches" ("user_id","kind","amount","remaining") SELECT "user_id",'cto',"balance","balance" FROM "leave_credits" WHERE "kind"='cto' AND "balance">0`);
  }
  public async down(): Promise<void> { /* data-only change */ }
}
