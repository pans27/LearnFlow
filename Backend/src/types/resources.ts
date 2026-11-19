export type StoredResourceType = 'instructor_material' | 'student_note' | 'assignment_file';
export type ExtractionStatus = 'pending' | 'processing' | 'completed' | 'failed';

export type ResourceRecord = {
  id: number;
  title: string;
  resourceType: StoredResourceType;
  ownerId: number;
  isVisible: boolean;
  extractionStatus: ExtractionStatus;
  s3Key: string;
  originalFilename: string;
  createdAt: Date;
};

export type ResourceResponse = {
  id: number;
  title: string;
  resourceType: StoredResourceType;
  ownerId: number;
  visibility: 'visible' | 'hidden';
  extractionStatus: ExtractionStatus;
  fileKey: string;
  createdAt: string;
};

export type PresignedUrlResponse = {
  url: string;
  expiresAt: string;
};
