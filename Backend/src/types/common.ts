// Response types shared across API domains.
export type ErrorResponse = {
  message: string;
};

export type HealthResponse = {
  status: 'ok';
};
