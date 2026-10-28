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

  // Null until a DepEd-email user first signs in with Google (an Administrator
  // can pre-create their account), and always null for administrator accounts.
  @Column({ name: 'google_id', type: 'varchar', unique: true, nullable: true })
  googleId: string | null;

  @Column({ name: 'deped_email', type: 'varchar', unique: true, nullable: true })
  depedEmail: string | null;

  // Administrator accounts sign in with username + password instead of Google.
  @Column({ type: 'varchar', unique: true, nullable: true })
  username: string | null;

  // bcrypt hash; never selected unless asked for explicitly.
  @Column({ name: 'password_hash', type: 'varchar', nullable: true, select: false })
  passwordHash?: string | null;

  // Display name, kept in sync from first/middle/last (see UsersService.composeName).
  @Column({ nullable: true })
  name: string;

  @Column({ name: 'first_name', type: 'varchar', nullable: true })
  firstName: string | null;

  @Column({ name: 'middle_name', type: 'varchar', nullable: true })
  middleName: string | null;

  @Column({ name: 'last_name', type: 'varchar', nullable: true })
  lastName: string | null;

  @Column({ name: 'contact_number', type: 'varchar', nullable: true })
  contactNumber: string | null;

  @Column({ type: 'varchar', nullable: true })
  area: string | null;

  // Cloudinary URL of the (client-resized) profile picture.
  @Column({ name: 'avatar_url', type: 'varchar', nullable: true })
  avatarUrl: string | null;

  @Column({ nullable: true })
  district: string;

  @Column({ nullable: true })
  designation: string;

  // Assigned by an Administrator; null until then.
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

  // True once the registration form (name, contact, designation, school,
  // district, area) is done. Role is NOT part of it: admins assign roles.
  get registrationComplete(): boolean {
    return (
      !!this.firstName &&
      !!this.lastName &&
      !!this.contactNumber &&
      !!this.designation &&
      !!this.district &&
      !!this.area &&
      !!this.school
    );
  }

  // Getters aren't serialized by default; the frontend routes on this flag.
  toJSON() {
    const { passwordHash: _omit, ...rest } = this as any;
    return { ...rest, profileComplete: this.registrationComplete };
  }
}
