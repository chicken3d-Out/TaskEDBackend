export enum Role {
  TEACHER = 'teacher',
  ADMIN_OFFICER = 'admin_officer', // Administrative Officer (AO), assigned to school(s)
  PUBLISHER = 'publisher', // posts calendar events and announcements (was "Administrative Office")
  SCHOOL_HEAD = 'school_head', // one per school: same school powers as the School account
  DISTRICT_SUPERVISOR = 'district_supervisor', // signs Travel Authorities as the District Supervisor
  DS_SECRETARY = 'ds_secretary', // signs for the District Supervisor (using the signature set by the Administrator) and numbers Travel Authorities
  SCHOOL = 'school', // one account per school: school profile, teachers, school files
  ADMINISTRATOR = 'administrator', // top-level: users, roles, approvals, forum moderation
}

export enum AccountStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  SUSPENDED = 'suspended',
}
