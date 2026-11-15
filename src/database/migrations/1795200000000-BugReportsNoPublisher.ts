import { MigrationInterface, QueryRunner } from 'typeorm';

// Bug reports from users (read by the Administrator); the Publisher role is gone: every Administrative Officer publishes events.
export class BugReportsNoPublisher1795200000000 implements MigrationInterface {
  name = 'BugReportsNoPublisher1795200000000';
  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE IF NOT EXISTS "bug_reports" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "reporter_id" uuid,
      "title" character varying(140) NOT NULL,
      "description" text NOT NULL,
      "page" character varying(300),
      "user_agent" character varying(300),
      "status" character varying(12) NOT NULL DEFAULT 'open',
      "admin_note" text,
      "created_at" TIMESTAMP NOT NULL DEFAULT now(),
      "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "PK_bug_reports" PRIMARY KEY ("id"),
      CONSTRAINT "FK_bug_reports_reporter" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE SET NULL
    )`);
    await q.query(`UPDATE "users" SET "role" = 'admin_officer' WHERE "role" = 'publisher'`);
  }
  public async down(): Promise<void> { /* data-only role change */ }
}
