import { MigrationInterface, QueryRunner } from "typeorm";

export class DriveFolderUrl1793786513819 implements MigrationInterface {
    name = 'DriveFolderUrl1793786513819'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD "drive_folder_url" character varying(1500)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "drive_folder_url"`);
    }

}
