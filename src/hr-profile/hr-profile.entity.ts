import { Column, Entity, JoinColumn, OneToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { User } from '../users/user.entity';

// Employment / HR details of one person. Kept apart from the User row so
// sensitive fields never travel with ordinary user objects. Visible only to
// the person, the AO of their school and Administrators.
@Entity('hr_profiles')
export class HrProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'school_id_no', type: 'varchar', length: 20, nullable: true }) schoolIdNo: string | null;
  @Column({ name: 'school_name', type: 'varchar', length: 200, nullable: true }) schoolName: string | null;
  @Column({ name: 'item_number', type: 'varchar', length: 60, nullable: true }) itemNumber: string | null;
  @Column({ name: 'position_title', type: 'varchar', length: 120, nullable: true }) positionTitle: string | null;
  @Column({ name: 'salary_grade', type: 'varchar', length: 10, nullable: true }) salaryGrade: string | null;
  @Column({ type: 'varchar', length: 10, nullable: true }) step: string | null;
  @Column({ name: 'item_from', type: 'varchar', length: 40, nullable: true }) itemFrom: string | null;
  @Column({ name: 'employee_no', type: 'varchar', length: 30, nullable: true }) employeeNo: string | null;
  @Column({ name: 'name_extension', type: 'varchar', length: 10, nullable: true }) nameExtension: string | null;
  @Column({ type: 'varchar', length: 10, nullable: true }) sex: string | null;
  @Column({ name: 'date_of_birth', type: 'varchar', length: 10, nullable: true }) dateOfBirth: string | null;
  @Column({ type: 'varchar', length: 20, nullable: true }) tin: string | null;
  @Column({ name: 'original_appointment', type: 'varchar', length: 10, nullable: true }) originalAppointment: string | null;
  @Column({ name: 'last_promotion', type: 'varchar', length: 10, nullable: true }) lastPromotion: string | null;
  @Column({ type: 'varchar', length: 40, nullable: true }) status: string | null;
  @Column({ name: 'employment_status', type: 'varchar', length: 40, nullable: true }) employmentStatus: string | null;
  @Column({ type: 'varchar', length: 120, nullable: true }) eligibility: string | null;
  @Column({ name: 'nature_of_work', type: 'varchar', length: 120, nullable: true }) natureOfWork: string | null;
  @Column({ name: 'monthly_salary', type: 'numeric', precision: 12, scale: 2, nullable: true }) monthlySalary: string | null;
  @Column({ name: 'source_of_fund', type: 'varchar', length: 60, nullable: true }) sourceOfFund: string | null;
  @Column({ name: 'contract_duration', type: 'varchar', length: 60, nullable: true }) contractDuration: string | null;

  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}
