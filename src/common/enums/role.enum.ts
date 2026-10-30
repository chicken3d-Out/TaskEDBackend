export enum Role {
  TEACHER = 'teacher',
  ADMIN_OFFICER = 'admin_officer', // Administrative Officer (AO), assigned to school(s)
  PUBLISHER = 'publisher', // posts calendar events and announcements (was "Administrative Office")
  SCHOOL = 'school', // one account per school: school profile, teachers, school files
  ADMINISTRATOR = 'administrator', // top-level: users, roles, approvals, forum moderation
}

export enum AccountStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  SUSPENDED = 'suspended',
}
