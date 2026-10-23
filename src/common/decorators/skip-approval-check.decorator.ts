import { SetMetadata } from '@nestjs/common';

// A handful of routes (e.g. "who am I", "log out") must work for
// pending/rejected accounts too, so they can see their status.
export const SKIP_APPROVAL_CHECK_KEY = 'skipApprovalCheck';
export const SkipApprovalCheck = () => SetMetadata(SKIP_APPROVAL_CHECK_KEY, true);
