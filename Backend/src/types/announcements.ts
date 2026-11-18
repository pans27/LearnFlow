export type AnnouncementBody = {
  title?: string;
  body?: string;
  isVisible?: boolean;
};

export type AnnouncementCreateData = {
  title: string;
  body: string;
  isVisible: boolean;
};

export type AnnouncementUpdateData = {
  title?: string;
  body?: string;
  isVisible?: boolean;
};

export type AnnouncementQuery = {
  limit: number;
  cursor?: number;
};

export type AnnouncementRecord = {
  id: number;
  courseId: number;
  authorId: number;
  title: string;
  body: string;
  isVisible: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type AnnouncementResponse = {
  id: number;
  courseId: number;
  authorId: number;
  title: string;
  body: string;
  isVisible: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AnnouncementPage = {
  items: AnnouncementRecord[];
  nextCursor?: number;
};
