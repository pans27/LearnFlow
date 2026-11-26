// Upload inputs, validated metadata, database records, and resource responses.
export type ResourceType = 'instructor_material' | 'student_note';

export type ResourceUploadFields = {
  title: string;
  resourceType: ResourceType;
  isVisible: boolean;
};

export type ResourceFile = {
  filename: string;
  body: Buffer;
};

export type UploadedPdf = {
  filename: string;
  mimeType: string;
  body: Buffer;
  fields: Record<string, string>;
};

export type ResourceCreateData = {
  title: string;
  resourceType: ResourceType;
  originalFilename: string;
  fileSizeBytes: number;
  s3Key: string;
  isVisible: boolean;
};

export type ResourceDatabaseRecord = Omit<ResourceRecord, 'resourceType' | 'extractionStatus'> & {
  resourceType: string;
  extractionStatus: string;
};

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

export type ResourceSearchMatch = {
  page: number;
  snippet: string;
};

export type ResourceSearchResult = {
  resource: ResourceRecord;
  matches: ResourceSearchMatch[];
};
