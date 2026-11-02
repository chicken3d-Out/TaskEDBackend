import { MigrationInterface, QueryRunner } from "typeorm";

export class LinksAndIcal1793597353478 implements MigrationInterface {
    name = 'LinksAndIcal1793597353478'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Files and calendar events are no longer copied through Google's APIs.
        // Rows that only pointed at Drive files (v9) cannot become links, so they
        // are removed; the files themselves stay in the owners' Drive.
        await queryRunner.query(`DELETE FROM "school_files" WHERE "file_url" IS NULL`);
        await queryRunner.query(`DELETE FROM "personal_files"`);
        await queryRunner.query(`DELETE FROM "personal_events"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "google_event_links"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f0224b363f85ec4818a3755a97"`);
        await queryRunner.query(`ALTER TABLE "personal_events" RENAME COLUMN "google_event_id" TO "uid"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "google_refresh_token"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "google_scopes"`);
        await queryRunner.query(`ALTER TABLE "school_files" DROP COLUMN "drive_file_id"`);
        await queryRunner.query(`ALTER TABLE "school_files" DROP COLUMN "mime_type"`);
        await queryRunner.query(`ALTER TABLE "personal_files" DROP COLUMN "file_name"`);
        await queryRunner.query(`ALTER TABLE "personal_files" DROP COLUMN "mime_type"`);
        await queryRunner.query(`ALTER TABLE "personal_files" DROP COLUMN "size"`);
        await queryRunner.query(`ALTER TABLE "personal_files" DROP COLUMN "drive_file_id"`);
        await queryRunner.query(`ALTER TABLE "users" ADD "calendar_ical_url" text`);
        await queryRunner.query(`ALTER TABLE "users" ADD "calendar_linked" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "personal_files" ADD "link" character varying(1500) NOT NULL`);
        await queryRunner.query(`ALTER TABLE "school_files" ALTER COLUMN "file_url" SET NOT NULL`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_6e98270fc4141efb15b1699395" ON "personal_events" ("user_id", "uid") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DELETE FROM "personal_files"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_6e98270fc4141efb15b1699395"`);
        await queryRunner.query(`ALTER TABLE "school_files" ALTER COLUMN "file_url" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "personal_files" DROP COLUMN "link"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "calendar_linked"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "calendar_ical_url"`);
        await queryRunner.query(`ALTER TABLE "personal_files" ADD "drive_file_id" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "personal_files" ADD "size" integer NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "personal_files" ADD "mime_type" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "personal_files" ADD "file_name" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "school_files" ADD "mime_type" character varying`);
        await queryRunner.query(`ALTER TABLE "school_files" ADD "drive_file_id" character varying`);
        await queryRunner.query(`ALTER TABLE "users" ADD "google_scopes" text`);
        await queryRunner.query(`ALTER TABLE "users" ADD "google_refresh_token" text`);
        await queryRunner.query(`ALTER TABLE "personal_events" RENAME COLUMN "uid" TO "google_event_id"`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_f0224b363f85ec4818a3755a97" ON "personal_events" ("google_event_id", "user_id") `);
    }

}
