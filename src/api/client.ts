export interface Identity {
  id: string;
  username: string;
  isAdmin: boolean;
  locale?: string;
}

export interface World {
  id: string;
  slug: string;
  title: string;
  systemId: string;
  role?: string;
}

export interface Member {
  userId: string;
  username: string;
  role: string;
}

export interface Invite {
  id: string;
  role: string;
  expiresAt: string;
  maxUses: number;
  uses: number;
  revoked: boolean;
  token?: string;
}

export interface Ticket {
  ticket: string;
  expiresAt: string;
  worldId: string;
  role: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly messageKey: string,
  ) {
    super(`${code}: ${messageKey}`);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: init.body ? { "Content-Type": "application/json" } : undefined,
    ...init,
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  const body = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new ApiError(response.status, body.code ?? "error", body.messageKey ?? "core.api.unknown");
  }

  return body as T;
}

function post<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) });
}

export const api = {
  setupState: () => request<{ needsSetup: boolean }>("/api/setup"),
  setup: (username: string, password: string) =>
    post<Identity>("/api/setup", { username, password }),

  me: () => request<Identity>("/api/auth/me"),
  login: (username: string, password: string) =>
    post<Identity>("/api/auth/login", { username, password }),
  logout: () => request<void>("/api/auth/logout", { method: "POST" }),

  worlds: () => request<World[]>("/api/worlds"),
  createWorld: (title: string, systemId: string) =>
    post<World>("/api/worlds", { title, systemId }),

  members: (worldId: string) => request<Member[]>(`/api/worlds/${worldId}/members`),
  invites: (worldId: string) => request<Invite[]>(`/api/worlds/${worldId}/invites`),
  createInvite: (worldId: string, role: string, maxUses: number) =>
    post<Invite>(`/api/worlds/${worldId}/invites`, { role, maxUses }),
  revokeInvite: (worldId: string, inviteId: string) =>
    request<void>(`/api/worlds/${worldId}/invites/${inviteId}`, { method: "DELETE" }),

  previewInvite: (token: string) =>
    request<{ worldTitle: string; role: string; valid: boolean }>(`/api/invites/${token}`),
  acceptInvite: (token: string, username: string, password: string) =>
    post<Identity>(`/api/invites/${token}/accept`, { username, password }),

  ticket: (worldId: string) => post<Ticket>("/api/session/ticket", { worldId }),

  health: () => request<{ status: string; storage?: string }>("/readyz"),
};
