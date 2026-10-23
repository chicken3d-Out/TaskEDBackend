import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Role, AccountStatus } from '../common/enums/role.enum';
import { School } from '../schools/school.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'google_id', unique: true })
  googleId: string;

  @Column({ name: 'deped_email', unique: true })
  depedEmail: string;

  @Column({ nullable: true })
  name: string;

  @Column({ nullable: true })
  district: string;

  @Column({ nullable: true })
  designation: string;

  // Chosen at registration; null until the user completes the registration form.
  @Column({ type: 'enum', enum: Role, nullable: true })
  role: Role | null;

  @Column({
    type: 'enum',
    enum: AccountStatus,
    default: AccountStatus.PENDING,
  })
  status: AccountStatus;

  // TEACHER: single home school.
  @ManyToOne(() => School, { nullable: true, eager: true })
  @JoinColumn({ name: 'school_id' })
  school: School | null;

  // ADMIN_OFFICER: one or more schools they process tickets for.
  @ManyToMany(() => School, { eager: true })
  @JoinTable({
    name: 'ao_assigned_schools',
    joinColumn: { name: 'user_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'school_id', referencedColumnName: 'id' },
  })
  assignedSchools: School[];

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'approved_by_id' })
  approvedBy: User | null;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt: Date | null;

  // FCM device token from the mobile app (set via POST /users/me/push-token
  // once the Ionic/Capacitor wrapper registers for push). Null on the web.
  @Column({ name: 'push_token', type: 'varchar', nullable: true })
  pushToken: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // True once the registration form (school/district/designation/role) is done.
  get registrationComplete(): boolean {
    return !!this.role && !!this.designation && !!this.district;
  }
}
