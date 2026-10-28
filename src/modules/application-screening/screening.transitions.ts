import type { ApplicationScreeningStatus } from '@prisma/client';
import { UnprocessableError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';

export const SCREENING_TRANSITIONS: Record<ApplicationScreeningStatus, readonly ApplicationScreeningStatus[]> = {
  PENDING_CV_REVIEW: ['CV_REVIEW_IN_PROGRESS', 'ADDITIONAL_INFO_REQUIRED', 'CV_APPROVED', 'NOT_SELECTED', 'WITHDRAWN', 'CANCELLED'],
  CV_REVIEW_IN_PROGRESS: ['ADDITIONAL_INFO_REQUIRED', 'CV_APPROVED', 'NOT_SELECTED', 'WITHDRAWN', 'CANCELLED'],
  ADDITIONAL_INFO_REQUIRED: ['PENDING_CV_REVIEW', 'CV_APPROVED', 'NOT_SELECTED', 'WITHDRAWN', 'CANCELLED'],
  CV_APPROVED: ['INTERVIEW_SCHEDULED', 'NOT_SELECTED', 'WITHDRAWN', 'CANCELLED'],
  INTERVIEW_SCHEDULED: ['CV_APPROVED', 'INTERVIEW_COMPLETED', 'FINAL_REVIEW_PENDING', 'NOT_SELECTED', 'WITHDRAWN', 'CANCELLED'],
  INTERVIEW_COMPLETED: ['INTERVIEW_SCHEDULED', 'FINAL_REVIEW_PENDING', 'NOT_SELECTED', 'WITHDRAWN', 'CANCELLED'],
  FINAL_REVIEW_PENDING: ['INTERVIEW_COMPLETED', 'APPROVED_FOR_SUBMISSION', 'NOT_SELECTED', 'WITHDRAWN', 'CANCELLED'],
  APPROVED_FOR_SUBMISSION: ['RELEASED_TO_COMPANY', 'WITHDRAWN', 'CANCELLED'],
  RELEASED_TO_COMPANY: ['WITHDRAWN', 'CANCELLED'],
  NOT_SELECTED: ['WITHDRAWN'],
  WITHDRAWN: [],
  CANCELLED: [],
};

export function canTransitionScreening(from: ApplicationScreeningStatus, to: ApplicationScreeningStatus): boolean {
  return from === to || SCREENING_TRANSITIONS[from].includes(to);
}

export function assertScreeningTransition(from: ApplicationScreeningStatus | null, to: ApplicationScreeningStatus): void {
  if (from && !canTransitionScreening(from, to)) {
    throw new UnprocessableError(ErrorCode.SCREENING_INVALID_TRANSITION, `Screening cannot move from ${from} to ${to}.`);
  }
}
