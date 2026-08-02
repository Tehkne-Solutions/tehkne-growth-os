import { describe, expect, it } from "vitest";

import {
  acceptInvitation,
  createInvitation,
  InvalidInvitationScopeError,
} from "@/modules/identity";
import type {
  AcceptInvitationRecord,
  InvitationStore,
  NewInvitationRecord,
} from "@/modules/identity/application/contracts";
import { parseTenantContext } from "@/modules/tenancy";

const secret = "test-secret-value-that-is-at-least-thirty-two-characters";
const now = new Date("2026-08-02T12:00:00.000Z");

class MemoryInvitationStore implements InvitationStore {
  created: NewInvitationRecord | null = null;
  accepted: AcceptInvitationRecord | null = null;

  async createInvitation(invitation: NewInvitationRecord) {
    this.created = invitation;
    return { id: "invitation-1" };
  }
  async acceptInvitation(invitation: AcceptInvitationRecord) {
    this.accepted = invitation;
    return {
      invitationId: "invitation-1",
      userId: "user-1",
      membershipId: "membership-1",
      createdUser: true,
    };
  }
  async revokeInvitation() {
    return true;
  }
}

describe("single-use invitations", () => {
  it("creates a normalized, bounded workspace invitation", async () => {
    const store = new MemoryInvitationStore();
    const tenant = parseTenantContext({
      operatorOrganizationId: "8ecbb057-70d7-4b22-b814-8c6abc2d1bcb",
      clientOrganizationId: "d0a5c149-bd54-4093-b184-02f8343e06d0",
      workspaceId: "de90d598-f75a-4fb5-912b-b8a3ade1b8a1",
    });
    const invitation = await createInvitation(
      store,
      {
        email: "  PERSON@EXAMPLE.COM ",
        roleId: "3f7ee36c-1ad3-4ec8-ae4e-f2f23f38dc2c",
        scope: "WORKSPACE",
        tenant,
        invitedByUserId: "e796a943-a80f-43c9-b34c-08106fdcf891",
        secret,
      },
      now,
    );

    expect(store.created?.email).toBe("person@example.com");
    expect(store.created?.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(store.created?.tokenHash).not.toContain(invitation.token);
    expect(invitation.expiresAt.getTime() - now.getTime()).toBe(
      72 * 60 * 60 * 1000,
    );
  });

  it("rejects a workspace scope without a workspace", async () => {
    const store = new MemoryInvitationStore();
    const tenant = parseTenantContext({
      operatorOrganizationId: "8ecbb057-70d7-4b22-b814-8c6abc2d1bcb",
      clientOrganizationId: "d0a5c149-bd54-4093-b184-02f8343e06d0",
    });

    await expect(
      createInvitation(store, {
        email: "person@example.com",
        roleId: "3f7ee36c-1ad3-4ec8-ae4e-f2f23f38dc2c",
        scope: "WORKSPACE",
        tenant,
        invitedByUserId: "e796a943-a80f-43c9-b34c-08106fdcf891",
        secret,
      }),
    ).rejects.toBeInstanceOf(InvalidInvitationScopeError);
  });

  it("derives a credential before the transactional acceptance", async () => {
    const store = new MemoryInvitationStore();
    await acceptInvitation(
      store,
      {
        token: "opaque-invitation-token-value-with-enough-entropy",
        secret,
        name: "Pessoa Convidada",
        password: "senha-segura-para-convite",
      },
      now,
    );

    expect(store.accepted?.passwordHash).toMatch(/^scrypt\$/);
    expect(store.accepted?.tokenHash).toMatch(/^[a-f0-9]{64}$/);
  });
});
