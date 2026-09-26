import type { Role } from "./constants";

/** Minimal identity carried in the session / access token. */
export interface SessionUser {
  id: string;
  email: string;
  role: Role;
  employeeId: string | null;
  name: string;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface LeaveBalance {
  leaveTypeId: string;
  leaveTypeName: string;
  leaveTypeCode: string;
  color: string;
  year: number;
  entitled: number;
  carriedOver: number;
  adjustment: number;
  used: number;
  pending: number;
  available: number;
}
