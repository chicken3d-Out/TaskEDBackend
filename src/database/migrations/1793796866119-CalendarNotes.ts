import { MigrationInterface, QueryRunner } from "typeorm";

export class CalendarNotes1793796866119 implements MigrationInterface {
    name = 'CalendarNotes1793796866119'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "calendar_notes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "note_date" character varying(10) NOT NULL, "title" character varying(200) NOT NULL, "body" text, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "owner_id" uuid, CONSTRAINT "PK_5e1bc776c8f7e55d1bc86898c01" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_8044c52ffb6bf1104b3f9cb577" ON "calendar_notes" ("owner_id", "note_date") `);
        await queryRunner.query(`ALTER TABLE "calendar_notes" ADD CONSTRAINT "FK_a6abe8796e80559f9ece4db78da" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "calendar_notes" DROP CONSTRAINT "FK_a6abe8796e80559f9ece4db78da"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_8044c52ffb6bf1104b3f9cb577"`);
        await queryRunner.query(`DROP TABLE "calendar_notes"`);
    }

}
