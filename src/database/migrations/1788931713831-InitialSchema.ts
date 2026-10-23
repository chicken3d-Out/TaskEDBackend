import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1788931713831 implements MigrationInterface {
    name = 'InitialSchema1788931713831'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "schools" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "district" character varying NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_95b932e47ac129dd8e23a0db548" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."users_role_enum" AS ENUM('teacher', 'admin_officer', 'admin_office_account', 'administrator')`);
        await queryRunner.query(`CREATE TYPE "public"."users_status_enum" AS ENUM('pending', 'approved', 'rejected', 'suspended')`);
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "google_id" character varying NOT NULL, "deped_email" character varying NOT NULL, "name" character varying, "district" character varying, "designation" character varying, "role" "public"."users_role_enum", "status" "public"."users_status_enum" NOT NULL DEFAULT 'pending', "approved_at" TIMESTAMP WITH TIME ZONE, "push_token" character varying, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "school_id" uuid, "approved_by_id" uuid, CONSTRAINT "UQ_0bd5012aeb82628e07f6a1be53b" UNIQUE ("google_id"), CONSTRAINT "UQ_d3c050c2bdd2c00451100124e29" UNIQUE ("deped_email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "ticket_updates" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "message" text NOT NULL, "image_url" character varying, "attachment_request" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "ticket_id" uuid, "author_id" uuid, CONSTRAINT "PK_8a7159eb39c55b08f8e85b46eeb" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "ticket_attachments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "file_url" character varying NOT NULL, "file_name" character varying, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "ticket_id" uuid, "uploaded_by_id" uuid, CONSTRAINT "PK_7e5011f87f95e78fe4bd7d982a3" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."tickets_status_enum" AS ENUM('submitted', 'acknowledged', 'in_progress', 'needs_attachment', 'resolved', 'closed')`);
        await queryRunner.query(`CREATE TABLE "tickets" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "title" character varying NOT NULL, "description" text NOT NULL, "status" "public"."tickets_status_enum" NOT NULL DEFAULT 'submitted', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "requester_id" uuid, "assigned_ao_id" uuid, "school_id" uuid, CONSTRAINT "PK_343bc942ae261cf7a1377f48fd0" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."notifications_type_enum" AS ENUM('ticket_update', 'attachment_request', 'ticket_status_change', 'account_approved', 'account_rejected', 'calendar_reminder')`);
        await queryRunner.query(`CREATE TABLE "notifications" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "type" "public"."notifications_type_enum" NOT NULL, "message" character varying NOT NULL, "related_entity_id" character varying, "read" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "user_id" uuid, CONSTRAINT "PK_6a72c3c0f683f6462415e653c3a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "calendar_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "title" character varying NOT NULL, "description" text NOT NULL, "event_date" TIMESTAMP WITH TIME ZONE NOT NULL, "zoom_link" character varying, "is_announcement" boolean NOT NULL DEFAULT true, "reminder_sent" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "created_by_id" uuid, CONSTRAINT "PK_faf5391d232322a87cdd1c6f30c" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "forum_replies" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "body" text NOT NULL, "upvotes" integer NOT NULL DEFAULT '0', "downvotes" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "question_id" uuid, "parent_reply_id" uuid, "author_id" uuid, CONSTRAINT "PK_5ae886513e9828a592aefa1b7b9" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "forum_questions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "title" character varying NOT NULL, "body" text NOT NULL, "upvotes" integer NOT NULL DEFAULT '0', "downvotes" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "author_id" uuid, CONSTRAINT "PK_7abc66af01a47b3a0c23f0f7c8b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."forum_votes_target_type_enum" AS ENUM('question', 'reply')`);
        await queryRunner.query(`CREATE TABLE "forum_votes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "target_type" "public"."forum_votes_target_type_enum" NOT NULL, "target_id" character varying NOT NULL, "value" integer NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "user_id" uuid, CONSTRAINT "PK_8932d378eb87a6b613241dacc4c" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_72f418382097fb5f2815ee9724" ON "forum_votes" ("user_id", "target_type", "target_id") `);
        await queryRunner.query(`CREATE TABLE "ao_assigned_schools" ("user_id" uuid NOT NULL, "school_id" uuid NOT NULL, CONSTRAINT "PK_2fd46d2d97e721735dd2727a77b" PRIMARY KEY ("user_id", "school_id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_d3a4b05c404e1cf41c30f4bb11" ON "ao_assigned_schools" ("user_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_8c11a6119aadf477449156b2f9" ON "ao_assigned_schools" ("school_id") `);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "FK_25e1cf8f41bae2f3d11f3c2a028" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "FK_4e589ae9e8fde5a605d1064dfe9" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ticket_updates" ADD CONSTRAINT "FK_aa9db1e0e5f3636a4886115c340" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ticket_updates" ADD CONSTRAINT "FK_3f0db9645f8c5d4c2b157fe56d3" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ticket_attachments" ADD CONSTRAINT "FK_0301cfaf908edba6ce419eb66b0" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ticket_attachments" ADD CONSTRAINT "FK_d630ff7eb312f8245df1b952de1" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "tickets" ADD CONSTRAINT "FK_2a06f5cdaf003ceaa9fcf08be77" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "tickets" ADD CONSTRAINT "FK_6b5072c8bc3800997d89875808a" FOREIGN KEY ("assigned_ao_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "tickets" ADD CONSTRAINT "FK_9291543c00bf5dd7eb6683d687a" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "notifications" ADD CONSTRAINT "FK_9a8a82462cab47c73d25f49261f" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "calendar_events" ADD CONSTRAINT "FK_f8217d6cb7344062d4a96a4d9bf" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "forum_replies" ADD CONSTRAINT "FK_1332ed48045f2c879fd8fc28d71" FOREIGN KEY ("question_id") REFERENCES "forum_questions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "forum_replies" ADD CONSTRAINT "FK_46d2341dda6f1703a7224c9d984" FOREIGN KEY ("parent_reply_id") REFERENCES "forum_replies"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "forum_replies" ADD CONSTRAINT "FK_79baa14b39dc9221041c70fd5a9" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "forum_questions" ADD CONSTRAINT "FK_7c96976e3bf0cb4b47306b9f629" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "forum_votes" ADD CONSTRAINT "FK_24d8a6248190fd1b788139b7aef" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ao_assigned_schools" ADD CONSTRAINT "FK_d3a4b05c404e1cf41c30f4bb11c" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "ao_assigned_schools" ADD CONSTRAINT "FK_8c11a6119aadf477449156b2f9e" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "ao_assigned_schools" DROP CONSTRAINT "FK_8c11a6119aadf477449156b2f9e"`);
        await queryRunner.query(`ALTER TABLE "ao_assigned_schools" DROP CONSTRAINT "FK_d3a4b05c404e1cf41c30f4bb11c"`);
        await queryRunner.query(`ALTER TABLE "forum_votes" DROP CONSTRAINT "FK_24d8a6248190fd1b788139b7aef"`);
        await queryRunner.query(`ALTER TABLE "forum_questions" DROP CONSTRAINT "FK_7c96976e3bf0cb4b47306b9f629"`);
        await queryRunner.query(`ALTER TABLE "forum_replies" DROP CONSTRAINT "FK_79baa14b39dc9221041c70fd5a9"`);
        await queryRunner.query(`ALTER TABLE "forum_replies" DROP CONSTRAINT "FK_46d2341dda6f1703a7224c9d984"`);
        await queryRunner.query(`ALTER TABLE "forum_replies" DROP CONSTRAINT "FK_1332ed48045f2c879fd8fc28d71"`);
        await queryRunner.query(`ALTER TABLE "calendar_events" DROP CONSTRAINT "FK_f8217d6cb7344062d4a96a4d9bf"`);
        await queryRunner.query(`ALTER TABLE "notifications" DROP CONSTRAINT "FK_9a8a82462cab47c73d25f49261f"`);
        await queryRunner.query(`ALTER TABLE "tickets" DROP CONSTRAINT "FK_9291543c00bf5dd7eb6683d687a"`);
        await queryRunner.query(`ALTER TABLE "tickets" DROP CONSTRAINT "FK_6b5072c8bc3800997d89875808a"`);
        await queryRunner.query(`ALTER TABLE "tickets" DROP CONSTRAINT "FK_2a06f5cdaf003ceaa9fcf08be77"`);
        await queryRunner.query(`ALTER TABLE "ticket_attachments" DROP CONSTRAINT "FK_d630ff7eb312f8245df1b952de1"`);
        await queryRunner.query(`ALTER TABLE "ticket_attachments" DROP CONSTRAINT "FK_0301cfaf908edba6ce419eb66b0"`);
        await queryRunner.query(`ALTER TABLE "ticket_updates" DROP CONSTRAINT "FK_3f0db9645f8c5d4c2b157fe56d3"`);
        await queryRunner.query(`ALTER TABLE "ticket_updates" DROP CONSTRAINT "FK_aa9db1e0e5f3636a4886115c340"`);
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "FK_4e589ae9e8fde5a605d1064dfe9"`);
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "FK_25e1cf8f41bae2f3d11f3c2a028"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_8c11a6119aadf477449156b2f9"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_d3a4b05c404e1cf41c30f4bb11"`);
        await queryRunner.query(`DROP TABLE "ao_assigned_schools"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_72f418382097fb5f2815ee9724"`);
        await queryRunner.query(`DROP TABLE "forum_votes"`);
        await queryRunner.query(`DROP TYPE "public"."forum_votes_target_type_enum"`);
        await queryRunner.query(`DROP TABLE "forum_questions"`);
        await queryRunner.query(`DROP TABLE "forum_replies"`);
        await queryRunner.query(`DROP TABLE "calendar_events"`);
        await queryRunner.query(`DROP TABLE "notifications"`);
        await queryRunner.query(`DROP TYPE "public"."notifications_type_enum"`);
        await queryRunner.query(`DROP TABLE "tickets"`);
        await queryRunner.query(`DROP TYPE "public"."tickets_status_enum"`);
        await queryRunner.query(`DROP TABLE "ticket_attachments"`);
        await queryRunner.query(`DROP TABLE "ticket_updates"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TYPE "public"."users_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
        await queryRunner.query(`DROP TABLE "schools"`);
    }

}
