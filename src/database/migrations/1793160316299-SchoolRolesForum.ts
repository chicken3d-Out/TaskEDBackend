import { MigrationInterface, QueryRunner } from "typeorm";

export class SchoolRolesForum1793160316299 implements MigrationInterface {
    name = 'SchoolRolesForum1793160316299'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "school_document_types" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "description" character varying, "required" boolean NOT NULL DEFAULT false, "active" boolean NOT NULL DEFAULT true, "sort_order" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_4faf12cc6c5465aeb128c003afa" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "school_files" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "kind" character varying NOT NULL, "file_name" character varying NOT NULL, "file_url" character varying NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "school_id" uuid, "document_type_id" uuid, "uploaded_by_id" uuid, CONSTRAINT "PK_57533bdb4d8641a840006520fff" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_849339b7a39deb7b638d66cfd1" ON "school_files" ("school_id", "document_type_id", "kind") `);
        await queryRunner.query(`ALTER TABLE "schools" ADD "area" character varying NOT NULL DEFAULT '1'`);
        await queryRunner.query(`ALTER TABLE "schools" ADD "school_code" character varying`);
        await queryRunner.query(`ALTER TABLE "schools" ADD "address" character varying`);
        await queryRunner.query(`ALTER TABLE "schools" ADD "contact_number" character varying`);
        await queryRunner.query(`ALTER TABLE "schools" ADD "email" character varying`);
        await queryRunner.query(`ALTER TABLE "schools" ADD "school_head_name" character varying`);
        await queryRunner.query(`ALTER TABLE "schools" ADD "school_head_contact" character varying`);
        await queryRunner.query(`CREATE TYPE "public"."forum_questions_status_enum" AS ENUM('pending', 'approved', 'rejected')`);
        await queryRunner.query(`ALTER TABLE "forum_questions" ADD "status" "public"."forum_questions_status_enum" NOT NULL DEFAULT 'pending'`);
        // Questions that already exist were visible before approval was required.
        await queryRunner.query(`UPDATE "forum_questions" SET "status" = 'approved'`);
        await queryRunner.query(`ALTER TABLE "forum_questions" ADD "reviewed_at" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "forum_questions" ADD "reject_reason" character varying`);
        await queryRunner.query(`ALTER TABLE "forum_questions" ADD "reviewed_by_id" uuid`);
        await queryRunner.query(`ALTER TYPE "public"."users_role_enum" RENAME TO "users_role_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."users_role_enum" AS ENUM('teacher', 'admin_officer', 'publisher', 'school', 'administrator')`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" TYPE "public"."users_role_enum" USING (CASE WHEN "role"::"text" = 'admin_office_account' THEN 'publisher' ELSE "role"::"text" END)::"public"."users_role_enum"`);
        await queryRunner.query(`DROP TYPE "public"."users_role_enum_old"`);
        await queryRunner.query(`ALTER TYPE "public"."notifications_type_enum" RENAME TO "notifications_type_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."notifications_type_enum" AS ENUM('ticket_update', 'attachment_request', 'ticket_status_change', 'account_approved', 'account_rejected', 'calendar_reminder', 'forum_review')`);
        await queryRunner.query(`ALTER TABLE "notifications" ALTER COLUMN "type" TYPE "public"."notifications_type_enum" USING "type"::"text"::"public"."notifications_type_enum"`);
        await queryRunner.query(`DROP TYPE "public"."notifications_type_enum_old"`);
        // ---- Sta. Fe schools (all in STA. FE DISTRICT, Area 1) ----
        const schools = [
            'BADIANGAY ELEMENTARY SCHOOL', 'BULOD ELEMENTARY SCHOOL', 'CATOOGAN ELEMENTARY SCHOOL',
            'GAPAS ELEMENTARY SCHOOL', 'KATIPUNAN ELEMENTARY SCHOOL', 'MILAGROSA ELEMENTARY SCHOOL',
            'PILIT ELEMENTARY SCHOOL', 'PITOGO ELEMENTARY SCHOOL', 'SAN ISIDRO ELEMENTARY SCHOOL',
            'SAN JUAN ELEMENTARY SCHOOL', 'SAN MIGUELAY ELEMENTARY SCHOOL', 'SAN ROQUE ELEMENTARY SCHOOL',
            'STA. FE CENTRAL SCHOOL', 'TIBAK ELEMENTARY SCHOOL', 'VICTORIA ELEMENTARY SCHOOL',
            'BACULANAD ELEMENTARY SCHOOL', 'CUTAY ELEMENTARY SCHOOL', 'STA. FE NATIONAL HIGH SCHOOL',
            'STA. FE STAND ALONE SENIOR HIGH SCHOOL',
        ];
        for (const name of schools) {
            const found = await queryRunner.query(`SELECT id FROM "schools" WHERE lower("name") = lower($1)`, [name]);
            if (found.length) {
                await queryRunner.query(`UPDATE "schools" SET "name" = $1, "district" = 'STA. FE DISTRICT', "area" = '1' WHERE id = $2`, [name, found[0].id]);
            } else {
                await queryRunner.query(`INSERT INTO "schools" ("name", "district", "area") VALUES ($1, 'STA. FE DISTRICT', '1')`, [name]);
            }
        }
        // Remove the old sample schools, but only if nothing refers to them.
        const legacy = ['Santa Fe Central School', 'Leyte National High School', 'Palo Central Elementary School'];
        for (const name of legacy) {
            await queryRunner.query(
                `DELETE FROM "schools" s WHERE s."name" = $1
                   AND NOT EXISTS (SELECT 1 FROM "users" u WHERE u."school_id" = s.id)
                   AND NOT EXISTS (SELECT 1 FROM "tickets" t WHERE t."school_id" = s.id)
                   AND NOT EXISTS (SELECT 1 FROM "ao_assigned_schools" a WHERE a."school_id" = s.id)`,
                [name],
            );
        }
        // Everyone who is already registered gets the same district and area.
        await queryRunner.query(`UPDATE "schools" SET "district" = 'STA. FE DISTRICT', "area" = '1'`);
        await queryRunner.query(`UPDATE "users" u SET "district" = s."district", "area" = s."area" FROM "schools" s WHERE u."school_id" = s.id`);
        await queryRunner.query(`ALTER TABLE "forum_questions" ADD CONSTRAINT "FK_01c2430d4f21f142fa07f27f908" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "school_files" ADD CONSTRAINT "FK_f4848348dce3d474fbd02cc6411" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "school_files" ADD CONSTRAINT "FK_a059926debad00748a7eaaa603b" FOREIGN KEY ("document_type_id") REFERENCES "school_document_types"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "school_files" ADD CONSTRAINT "FK_f7b0117445ced8be97cc4894fe5" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "school_files" DROP CONSTRAINT "FK_f7b0117445ced8be97cc4894fe5"`);
        await queryRunner.query(`ALTER TABLE "school_files" DROP CONSTRAINT "FK_a059926debad00748a7eaaa603b"`);
        await queryRunner.query(`ALTER TABLE "school_files" DROP CONSTRAINT "FK_f4848348dce3d474fbd02cc6411"`);
        await queryRunner.query(`ALTER TABLE "forum_questions" DROP CONSTRAINT "FK_01c2430d4f21f142fa07f27f908"`);
        await queryRunner.query(`CREATE TYPE "public"."notifications_type_enum_old" AS ENUM('ticket_update', 'attachment_request', 'ticket_status_change', 'account_approved', 'account_rejected', 'calendar_reminder')`);
        await queryRunner.query(`ALTER TABLE "notifications" ALTER COLUMN "type" TYPE "public"."notifications_type_enum_old" USING "type"::"text"::"public"."notifications_type_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."notifications_type_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."notifications_type_enum_old" RENAME TO "notifications_type_enum"`);
        await queryRunner.query(`CREATE TYPE "public"."users_role_enum_old" AS ENUM('teacher', 'admin_officer', 'admin_office_account', 'administrator')`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" TYPE "public"."users_role_enum_old" USING "role"::"text"::"public"."users_role_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."users_role_enum_old" RENAME TO "users_role_enum"`);
        await queryRunner.query(`ALTER TABLE "forum_questions" DROP COLUMN "reviewed_by_id"`);
        await queryRunner.query(`ALTER TABLE "forum_questions" DROP COLUMN "reject_reason"`);
        await queryRunner.query(`ALTER TABLE "forum_questions" DROP COLUMN "reviewed_at"`);
        await queryRunner.query(`ALTER TABLE "forum_questions" DROP COLUMN "status"`);
        await queryRunner.query(`DROP TYPE "public"."forum_questions_status_enum"`);
        await queryRunner.query(`ALTER TABLE "schools" DROP COLUMN "school_head_contact"`);
        await queryRunner.query(`ALTER TABLE "schools" DROP COLUMN "school_head_name"`);
        await queryRunner.query(`ALTER TABLE "schools" DROP COLUMN "email"`);
        await queryRunner.query(`ALTER TABLE "schools" DROP COLUMN "contact_number"`);
        await queryRunner.query(`ALTER TABLE "schools" DROP COLUMN "address"`);
        await queryRunner.query(`ALTER TABLE "schools" DROP COLUMN "school_code"`);
        await queryRunner.query(`ALTER TABLE "schools" DROP COLUMN "area"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_849339b7a39deb7b638d66cfd1"`);
        await queryRunner.query(`DROP TABLE "school_files"`);
        await queryRunner.query(`DROP TABLE "school_document_types"`);
    }

}
