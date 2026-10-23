export enum Role {
  TEACHER = 'teacher',
  ADMIN_OFFICER = 'admin_officer', // Administrative Officer (AO), assigned to school(s)
  ADMIN_OFFICE_ACCOUNT = 'admin_office_account', // public-post office account
  ADMINISTRATOR = 'administrator', // top-level, approves AOs and public-post accounts
}

export enum AccountStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  SUSPENDED = 'suspended',
}
