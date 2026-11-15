import { MigrationInterface, QueryRunner } from 'typeorm';

// The leave goes applicant -> corresponding signatory (no AO approval step); applications keep a history.
export class LeaveFlow1795100000000 implements MigrationInterface {
  name = 'LeaveFlow1795100000000';
  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "leave_applications" ADD COLUMN IF NOT EXISTS "events" jsonb NOT NULL DEFAULT '[]'`);
    await q.query(`UPDATE "leave_applications" SET "status"='awaiting_signatory' WHERE "status" IN ('awaiting_ao','ao_approved')`);
  }
  public async down(): Promise<void> { /* data-only change */ }
}
