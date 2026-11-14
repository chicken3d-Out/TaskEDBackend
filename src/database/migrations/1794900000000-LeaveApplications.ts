import { MigrationInterface, QueryRunner } from 'typeorm';

export class LeaveApplications1794900000000 implements MigrationInterface {
  name = 'LeaveApplications1794900000000';
  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE IF NOT EXISTS "leave_applications" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "applicant_id" uuid NOT NULL,
      "filed_by_id" uuid,
      "status" varchar(24) NOT NULL DEFAULT 'awaiting_applicant',
      "data" jsonb NOT NULL,
      "kind" varchar(20),
      "days" numeric(6,2) NOT NULL DEFAULT 0,
      "sigs" jsonb NOT NULL DEFAULT '{}',
      "credit" jsonb,
      "deducted" boolean NOT NULL DEFAULT false,
      "recommendation" jsonb,
      "note" varchar(300),
      "created_at" TIMESTAMP NOT NULL DEFAULT now(),
      "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "PK_leave_applications" PRIMARY KEY ("id"),
      CONSTRAINT "FK_leave_app_applicant" FOREIGN KEY ("applicant_id") REFERENCES "users"("id") ON DELETE CASCADE,
      CONSTRAINT "FK_leave_app_filed_by" FOREIGN KEY ("filed_by_id") REFERENCES "users"("id") ON DELETE SET NULL)`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_leave_app_applicant" ON "leave_applications" ("applicant_id")`);
  }
  public async down(q: QueryRunner): Promise<void> { await q.query(`DROP TABLE IF EXISTS "leave_applications"`); }
}
