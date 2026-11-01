import { MigrationInterface, QueryRunner } from "typeorm";

export class GoogleDriveMyFiles1793500213878 implements MigrationInterface {
    name = 'GoogleDriveMyFiles1793500213878'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_849339b7a39deb7b638d66cfd1"`);
        await queryRunner.query(`CREATE TABLE "google_event_links" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "google_event_id" character varying NOT NULL, "user_id" uuid, "event_id" uuid, CONSTRAINT "PK_25d9511f2eed903252a3944ea84" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_f1e45f6df36a9fc39332ef4075" ON "google_event_links" ("user_id", "event_id") `);
        await queryRunner.query(`CREATE TABLE "personal_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "google_event_id" character varying NOT NULL, "title" character varying NOT NULL, "description" text, "starts_at" TIMESTAMP WITH TIME ZONE NOT NULL, "ends_at" TIMESTAMP WITH TIME ZONE, "all_day" boolean NOT NULL DEFAULT false, "location" character varying, "html_link" character varying, "user_id" uuid, CONSTRAINT "PK_8886c2adccbf466392547dfb1b7" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_f0224b363f85ec4818a3755a97" ON "personal_events" ("user_id", "google_event_id") `);
        await queryRunner.query(`CREATE TABLE "personal_files" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "label" character varying NOT NULL, "category" character varying, "file_name" character varying NOT NULL, "mime_type" character varying NOT NULL, "size" integer NOT NULL DEFAULT '0', "drive_file_id" character varying NOT NULL, "school_year" character varying NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "owner_id" uuid, CONSTRAINT "PK_f33d7ff49c5ad36c0a8d6128d25" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_8736b161ed2d30e8589fe6afd8" ON "personal_files" ("owner_id", "school_year") `);
        await queryRunner.query(`ALTER TABLE "users" ADD "google_refresh_token" text`);
        await queryRunner.query(`ALTER TABLE "users" ADD "google_scopes" text`);
        await queryRunner.query(`ALTER TABLE "school_files" ADD "drive_file_id" character varying`);
        await queryRunner.query(`ALTER TABLE "school_files" ADD "mime_type" character varying`);
        await queryRunner.query(`ALTER TABLE "school_files" ADD "school_year" character varying`);
        // Existing files belong to the school year they were uploaded in (June to May).
        await queryRunner.query(`UPDATE "school_files" SET "school_year" = CASE WHEN EXTRACT(MONTH FROM "created_at") >= 6 THEN EXTRACT(YEAR FROM "created_at")::int || '-' || (EXTRACT(YEAR FROM "created_at")::int + 1) ELSE (EXTRACT(YEAR FROM "created_at")::int - 1) || '-' || EXTRACT(YEAR FROM "created_at")::int END`);
        await queryRunner.query(`ALTER TABLE "school_files" ALTER COLUMN "school_year" SET NOT NULL`);
        await queryRunner.query(`ALTER TYPE "public"."users_role_enum" RENAME TO "users_role_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."users_role_enum" AS ENUM('teacher', 'admin_officer', 'publisher', 'school_head', 'school', 'administrator')`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" TYPE "public"."users_role_enum" USING "role"::"text"::"public"."users_role_enum"`);
        await queryRunner.query(`DROP TYPE "public"."users_role_enum_old"`);
        await queryRunner.query(`ALTER TABLE "school_files" ALTER COLUMN "file_url" DROP NOT NULL`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_eb6d1a52389c8cfa62e95a07d6" ON "school_files" ("school_id", "document_type_id", "kind", "school_year") `);
        await queryRunner.query(`ALTER TABLE "google_event_links" ADD CONSTRAINT "FK_e03eefd205bf4a6c0384fa651a2" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "google_event_links" ADD CONSTRAINT "FK_41d308dceb47faba49fd023c9b0" FOREIGN KEY ("event_id") REFERENCES "calendar_events"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "personal_events" ADD CONSTRAINT "FK_057d9c86865915d1115db22d9a2" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "personal_files" ADD CONSTRAINT "FK_dafb393fe42a45ab531d35a4418" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "personal_files" DROP CONSTRAINT "FK_dafb393fe42a45ab531d35a4418"`);
        await queryRunner.query(`ALTER TABLE "personal_events" DROP CONSTRAINT "FK_057d9c86865915d1115db22d9a2"`);
        await queryRunner.query(`ALTER TABLE "google_event_links" DROP CONSTRAINT "FK_41d308dceb47faba49fd023c9b0"`);
        await queryRunner.query(`ALTER TABLE "google_event_links" DROP CONSTRAINT "FK_e03eefd205bf4a6c0384fa651a2"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_eb6d1a52389c8cfa62e95a07d6"`);
        await queryRunner.query(`ALTER TABLE "school_files" ALTER COLUMN "file_url" SET NOT NULL`);
        await queryRunner.query(`CREATE TYPE "public"."users_role_enum_old" AS ENUM('teacher', 'admin_officer', 'publisher', 'school', 'administrator')`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" TYPE "public"."users_role_enum_old" USING "role"::"text"::"public"."users_role_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."users_role_enum_old" RENAME TO "users_role_enum"`);
        await queryRunner.query(`ALTER TABLE "school_files" DROP COLUMN "school_year"`);
        await queryRunner.query(`ALTER TABLE "school_files" DROP COLUMN "mime_type"`);
        await queryRunner.query(`ALTER TABLE "school_files" DROP COLUMN "drive_file_id"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "google_scopes"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "google_refresh_token"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_8736b161ed2d30e8589fe6afd8"`);
        await queryRunner.query(`DROP TABLE "personal_files"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f0224b363f85ec4818a3755a97"`);
        await queryRunner.query(`DROP TABLE "personal_events"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f1e45f6df36a9fc39332ef4075"`);
        await queryRunner.query(`DROP TABLE "google_event_links"`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_849339b7a39deb7b638d66cfd1" ON "school_files" ("kind", "school_id", "document_type_id") `);
    }

}
