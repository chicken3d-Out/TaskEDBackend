import { MigrationInterface, QueryRunner } from "typeorm";

export class ProfileAndTeacherFiles1794019748986 implements MigrationInterface {
    name = 'ProfileAndTeacherFiles1794019748986'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "hr_profiles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "school_id_no" character varying(20), "school_name" character varying(200), "item_number" character varying(60), "position_title" character varying(120), "salary_grade" character varying(10), "step" character varying(10), "item_from" character varying(40), "employee_no" character varying(30), "name_extension" character varying(10), "sex" character varying(10), "date_of_birth" character varying(10), "tin" character varying(20), "original_appointment" character varying(10), "last_promotion" character varying(10), "status" character varying(40), "employment_status" character varying(40), "eligibility" character varying(120), "nature_of_work" character varying(120), "monthly_salary" numeric(12,2), "source_of_fund" character varying(60), "contract_duration" character varying(60), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "user_id" uuid NOT NULL, CONSTRAINT "REL_e49e48b66ffb2b4ec5da3eba9b" UNIQUE ("user_id"), CONSTRAINT "PK_f587d72b1f12ad15de216d12446" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "teacher_files" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "section" character varying(60) NOT NULL, "label" character varying(150) NOT NULL, "link" character varying(1500) NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "owner_id" uuid NOT NULL, "teacher_id" uuid NOT NULL, CONSTRAINT "PK_760b8a6e7906faad5dcd8e10ac9" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_57a0d439440528fdefdf39a893" ON "teacher_files" ("owner_id", "teacher_id") `);
        await queryRunner.query(`ALTER TABLE "personal_files" ADD "section" character varying(20) NOT NULL DEFAULT 'storage'`);
        await queryRunner.query(`ALTER TABLE "hr_profiles" ADD CONSTRAINT "FK_e49e48b66ffb2b4ec5da3eba9b6" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "teacher_files" ADD CONSTRAINT "FK_b759e7221a3c617494730b77f50" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "teacher_files" ADD CONSTRAINT "FK_d70ef9ce7f27fcd3294f5168252" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "teacher_files" DROP CONSTRAINT "FK_d70ef9ce7f27fcd3294f5168252"`);
        await queryRunner.query(`ALTER TABLE "teacher_files" DROP CONSTRAINT "FK_b759e7221a3c617494730b77f50"`);
        await queryRunner.query(`ALTER TABLE "hr_profiles" DROP CONSTRAINT "FK_e49e48b66ffb2b4ec5da3eba9b6"`);
        await queryRunner.query(`ALTER TABLE "personal_files" DROP COLUMN "section"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_57a0d439440528fdefdf39a893"`);
        await queryRunner.query(`DROP TABLE "teacher_files"`);
        await queryRunner.query(`DROP TABLE "hr_profiles"`);
    }

}
