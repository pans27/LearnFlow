// User request bodies, validated updates, public records, and responses.
export type UserBody = {
  name?: string;
  email?: string;
  isAdmin?: boolean;
};

export type UserUpdateData = {
  name?: string;
  isAdmin?: boolean;
};

export type PublicUserRecord = {
  id: number;
  name: string;
  email: string;
  isAdmin: boolean;
  mustChangePassword: boolean;
};

export type UserResponse = {
  id: number;
  name: string;
  email: string;
  isAdmin: boolean;
  mustChangePassword: boolean;
};

export type CreateUserResponse = {
  user: UserResponse;
  temporaryPassword: string;
};

export type DefaultAdminOptions = {
  email?: string;
  password?: string;
};

export type DefaultAdminResult = {
  id: number;
  email: string;
  created: boolean;
  temporaryPassword?: string;
};
