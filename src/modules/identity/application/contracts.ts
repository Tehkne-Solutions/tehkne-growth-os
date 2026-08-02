import type {
  AccessScope,
  AuthorizationMembership,
} from "../domain/authorization";

export type UserRecordStatus = "ACTIVE" | "SUSPENDED" | "ARCHIVED";

export type CredentialRecord = Readonly<{
  userId: string;
  userStatus: UserRecordStatus;
  passwordHash: string;
  lockedUntil: Date | null;
}>;

export interface CredentialStore {
  findCredentialByEmail(email: string): Promise<CredentialRecord | null>;
  registerAuthenticationFailure(
    userId: string,
    occurredAt: Date,
    lockAfterAttempts: number,
    lockUntil: Date,
  ): Promise<void>;
  registerAuthenticationSuccess(
    userId: string,
    occurredAt: Date,
  ): Promise<void>;
}

export type NewSessionRecord = Readonly<{
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  lastSeenAt: Date;
  userAgentHash: string | null;
  ipPrefix: string | null;
}>;

export type SessionRecord = Readonly<{
  id: string;
  userId: string;
  userStatus: UserRecordStatus;
  expiresAt: Date;
  lastSeenAt: Date;
  revokedAt: Date | null;
}>;

export interface SessionStore {
  createSession(session: NewSessionRecord): Promise<{ id: string }>;
  findSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null>;
  touchSession(sessionId: string, seenAt: Date): Promise<void>;
  revokeSessionByTokenHash(
    tokenHash: string,
    revokedAt: Date,
    reason: string,
  ): Promise<void>;
  revokeAllUserSessions(
    userId: string,
    revokedAt: Date,
    reason: string,
  ): Promise<number>;
}

export type NewInvitationRecord = Readonly<{
  tokenHash: string;
  email: string;
  roleId: string;
  operatorOrganizationId: string;
  clientOrganizationId: string | null;
  brandId: string | null;
  workspaceId: string | null;
  scope: AccessScope;
  expiresAt: Date;
  invitedByUserId: string;
}>;

export type AcceptInvitationRecord = Readonly<{
  tokenHash: string;
  acceptedAt: Date;
  currentUserId: string | null;
  name: string | null;
  passwordHash: string | null;
}>;

export type AcceptedInvitation = Readonly<{
  invitationId: string;
  userId: string;
  membershipId: string;
  createdUser: boolean;
}>;

export interface InvitationStore {
  createInvitation(invitation: NewInvitationRecord): Promise<{ id: string }>;
  acceptInvitation(
    invitation: AcceptInvitationRecord,
  ): Promise<AcceptedInvitation>;
  revokeInvitation(invitationId: string, revokedAt: Date): Promise<boolean>;
}

export interface AuthorizationMembershipStore {
  listActiveMemberships(
    userId: string,
    operatorOrganizationId: string,
  ): Promise<readonly AuthorizationMembership[]>;
  getRolePermissionsForGrant(
    roleId: string,
    operatorOrganizationId: string,
  ): Promise<readonly string[] | null>;
  recordAuthorizationDenial(
    input: Readonly<{
      userId: string;
      permission: string;
      operatorOrganizationId: string;
      clientOrganizationId: string | null;
      workspaceId: string | null;
      occurredAt: Date;
    }>,
  ): Promise<void>;
}
