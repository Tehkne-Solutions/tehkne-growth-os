import type { DatabaseClient } from "@/shared/db/client";

import type {
  AcceptInvitationRecord,
  AcceptedInvitation,
  AuthorizationMembershipStore,
  CredentialRecord,
  CredentialStore,
  InvitationStore,
  NewInvitationRecord,
  NewSessionRecord,
  SessionRecord,
  SessionStore,
} from "../application/contracts";
import type { AuthorizationMembership } from "../domain/authorization";

export class InvalidInvitationError extends Error {
  constructor() {
    super("The invitation is invalid, expired, or already consumed.");
    this.name = "InvalidInvitationError";
  }
}

export class ExistingAccountAuthenticationRequiredError extends Error {
  constructor() {
    super("Authentication is required to add access to an existing account.");
    this.name = "ExistingAccountAuthenticationRequiredError";
  }
}

export class PrismaIdentityRepository
  implements
    CredentialStore,
    SessionStore,
    InvitationStore,
    AuthorizationMembershipStore
{
  constructor(private readonly database: DatabaseClient) {}

  async findCredentialByEmail(email: string): Promise<CredentialRecord | null> {
    const user = await this.database.user.findUnique({
      where: { email },
      select: {
        id: true,
        status: true,
        passwordCredential: {
          select: { passwordHash: true, lockedUntil: true },
        },
      },
    });

    if (!user?.passwordCredential) return null;

    return {
      userId: user.id,
      userStatus: user.status,
      passwordHash: user.passwordCredential.passwordHash,
      lockedUntil: user.passwordCredential.lockedUntil,
    };
  }

  async registerAuthenticationFailure(
    userId: string,
    occurredAt: Date,
    lockAfterAttempts: number,
    lockUntil: Date,
  ): Promise<void> {
    await this.database.$transaction(async (transaction) => {
      const credential = await transaction.passwordCredential.findUnique({
        where: { userId },
        select: { failedAttempts: true, lockedUntil: true },
      });
      if (!credential) return;

      const previousAttempts =
        credential.lockedUntil && credential.lockedUntil <= occurredAt
          ? 0
          : credential.failedAttempts;
      const failedAttempts = previousAttempts + 1;

      await transaction.passwordCredential.update({
        where: { userId },
        data: {
          failedAttempts,
          ...(failedAttempts >= lockAfterAttempts
            ? { lockedUntil: lockUntil }
            : {}),
        },
      });
    });
  }

  async registerAuthenticationSuccess(
    userId: string,
    occurredAt: Date,
  ): Promise<void> {
    await this.database.passwordCredential.update({
      where: { userId },
      data: { failedAttempts: 0, lockedUntil: null, lastUsedAt: occurredAt },
    });
  }

  async createSession(session: NewSessionRecord): Promise<{ id: string }> {
    return this.database.session.create({
      data: session,
      select: { id: true },
    });
  }

  async findSessionByTokenHash(
    tokenHash: string,
  ): Promise<SessionRecord | null> {
    const session = await this.database.session.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
        lastSeenAt: true,
        revokedAt: true,
        user: { select: { status: true } },
      },
    });
    if (!session) return null;

    return {
      id: session.id,
      userId: session.userId,
      userStatus: session.user.status,
      expiresAt: session.expiresAt,
      lastSeenAt: session.lastSeenAt,
      revokedAt: session.revokedAt,
    };
  }

  async touchSession(sessionId: string, seenAt: Date): Promise<void> {
    await this.database.session.updateMany({
      where: { id: sessionId, revokedAt: null, expiresAt: { gt: seenAt } },
      data: { lastSeenAt: seenAt },
    });
  }

  async revokeSessionByTokenHash(
    tokenHash: string,
    revokedAt: Date,
    reason: string,
  ): Promise<void> {
    await this.database.session.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt, revokeReason: reason },
    });
  }

  async revokeAllUserSessions(
    userId: string,
    revokedAt: Date,
    reason: string,
  ): Promise<number> {
    const result = await this.database.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt, revokeReason: reason },
    });
    return result.count;
  }

  async createInvitation(
    invitation: NewInvitationRecord,
  ): Promise<{ id: string }> {
    return this.database.$transaction(async (transaction) => {
      const created = await transaction.invitation.create({
        data: invitation,
        select: { id: true },
      });
      await transaction.auditEvent.create({
        data: {
          operatorOrganizationId: invitation.operatorOrganizationId,
          clientOrganizationId: invitation.clientOrganizationId,
          workspaceId: invitation.workspaceId,
          actorUserId: invitation.invitedByUserId,
          action: "identity.invitation.created",
          resourceType: "Invitation",
          resourceId: created.id,
          metadata: { roleId: invitation.roleId, scope: invitation.scope },
        },
      });
      return created;
    });
  }

  async acceptInvitation(
    input: AcceptInvitationRecord,
  ): Promise<AcceptedInvitation> {
    return this.database.$transaction(async (transaction) => {
      const invitation = await transaction.invitation.findUnique({
        where: { tokenHash: input.tokenHash },
      });
      if (
        !invitation ||
        invitation.status !== "PENDING" ||
        invitation.expiresAt <= input.acceptedAt
      ) {
        throw new InvalidInvitationError();
      }

      let user = await transaction.user.findUnique({
        where: { email: invitation.email },
        select: { id: true, status: true },
      });
      let createdUser = false;

      if (user) {
        if (user.status !== "ACTIVE" || input.currentUserId !== user.id) {
          throw new ExistingAccountAuthenticationRequiredError();
        }
      } else {
        if (!input.passwordHash) throw new InvalidInvitationError();
        user = await transaction.user.create({
          data: {
            email: invitation.email,
            name: input.name,
            passwordCredential: {
              create: { passwordHash: input.passwordHash },
            },
          },
          select: { id: true, status: true },
        });
        createdUser = true;
      }

      const membershipIdentity = {
        userId: user.id,
        roleId: invitation.roleId,
        operatorOrganizationId: invitation.operatorOrganizationId,
        clientOrganizationId: invitation.clientOrganizationId,
        brandId: invitation.brandId,
        workspaceId: invitation.workspaceId,
      };
      const existingMembership = await transaction.membership.findFirst({
        where: membershipIdentity,
        select: { id: true },
      });
      const membership = existingMembership
        ? await transaction.membership.update({
            where: { id: existingMembership.id },
            data: {
              scope: invitation.scope,
              status: "ACTIVE",
              activatedAt: input.acceptedAt,
              revokedAt: null,
            },
            select: { id: true },
          })
        : await transaction.membership.create({
            data: {
              ...membershipIdentity,
              scope: invitation.scope,
              status: "ACTIVE",
              activatedAt: input.acceptedAt,
            },
            select: { id: true },
          });

      const consumed = await transaction.invitation.updateMany({
        where: {
          id: invitation.id,
          status: "PENDING",
          expiresAt: { gt: input.acceptedAt },
        },
        data: {
          status: "ACCEPTED",
          acceptedAt: input.acceptedAt,
          acceptedByUserId: user.id,
          membershipId: membership.id,
        },
      });
      if (consumed.count !== 1) throw new InvalidInvitationError();

      await transaction.auditEvent.create({
        data: {
          operatorOrganizationId: invitation.operatorOrganizationId,
          clientOrganizationId: invitation.clientOrganizationId,
          workspaceId: invitation.workspaceId,
          actorUserId: user.id,
          action: "identity.invitation.accepted",
          resourceType: "Invitation",
          resourceId: invitation.id,
          metadata: { membershipId: membership.id },
        },
      });

      return {
        invitationId: invitation.id,
        userId: user.id,
        membershipId: membership.id,
        createdUser,
      };
    });
  }

  async revokeInvitation(
    invitationId: string,
    revokedAt: Date,
  ): Promise<boolean> {
    const result = await this.database.invitation.updateMany({
      where: { id: invitationId, status: "PENDING" },
      data: { status: "REVOKED", revokedAt },
    });
    return result.count === 1;
  }

  async listActiveMemberships(
    userId: string,
    operatorOrganizationId: string,
  ): Promise<readonly AuthorizationMembership[]> {
    const memberships = await this.database.membership.findMany({
      where: { userId, operatorOrganizationId, status: "ACTIVE" },
      include: {
        role: { include: { permissions: { include: { permission: true } } } },
      },
    });

    return memberships.map((membership) => ({
      id: membership.id,
      scope: membership.scope,
      operatorOrganizationId: membership.operatorOrganizationId,
      ...(membership.clientOrganizationId
        ? { clientOrganizationId: membership.clientOrganizationId }
        : {}),
      ...(membership.brandId ? { brandId: membership.brandId } : {}),
      ...(membership.workspaceId
        ? { workspaceId: membership.workspaceId }
        : {}),
      permissionKeys: membership.role.permissions.map(
        ({ permission }) => permission.key,
      ),
    }));
  }

  async getRolePermissionsForGrant(
    roleId: string,
    operatorOrganizationId: string,
  ): Promise<readonly string[] | null> {
    const role = await this.database.role.findFirst({
      where: {
        id: roleId,
        OR: [
          { operatorOrganizationId },
          { isSystem: true, operatorOrganizationId: null },
        ],
      },
      select: {
        permissions: { select: { permission: { select: { key: true } } } },
      },
    });

    return role?.permissions.map(({ permission }) => permission.key) ?? null;
  }

  async recordAuthorizationDenial(
    input: Readonly<{
      userId: string;
      permission: string;
      operatorOrganizationId: string;
      clientOrganizationId: string | null;
      workspaceId: string | null;
      occurredAt: Date;
    }>,
  ): Promise<void> {
    await this.database.auditEvent.create({
      data: {
        operatorOrganizationId: input.operatorOrganizationId,
        clientOrganizationId: input.clientOrganizationId,
        workspaceId: input.workspaceId,
        actorUserId: input.userId,
        action: "identity.authorization.denied",
        resourceType: "Permission",
        resourceId: input.permission,
        occurredAt: input.occurredAt,
      },
    });
  }
}
