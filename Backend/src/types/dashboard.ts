import type { AccessibleCourseResponse } from './courses';

export type DashboardAnnouncement = {
  id: number;
  title: string;
  body: string;
  isVisible: boolean;
  createdAt: string;
};

export type DashboardAssessment = {
  id: number;
  type: 'assignment' | 'quiz';
  title: string;
  dueAt: string;
  opensAt: string | null;
  isVisible: boolean;
  status: string | null;
  submissionStatus?: string;
};

export type DashboardResource = {
  id: number;
  title: string;
  resourceType: string;
  ownerId: number;
  visibility: 'visible' | 'hidden';
  extractionStatus: string;
  createdAt: string;
};

export type DashboardPermissions = {
  canPublishAnnouncements: boolean;
  canCreateAssessments: boolean;
  canManageResources: boolean;
  canReviewSubmissions: boolean;
};

export type ActiveAssessmentStatistics = {
  assessmentId: number;
  type: 'assignment' | 'quiz';
  title: string;
  eligibleStudents: number;
  submittedCount: number;
  gradedCount: number | null;
  submissionRate: number;
};

export type DashboardResponse = {
  course: AccessibleCourseResponse;
  view: 'student' | 'instructor';
  readOnly: boolean;
  permissions: DashboardPermissions;
  recentAnnouncements: DashboardAnnouncement[];
  upcomingAssessments: DashboardAssessment[];
  recentResources: DashboardResource[];
  activeAssessmentStatistics?: ActiveAssessmentStatistics[];
};
