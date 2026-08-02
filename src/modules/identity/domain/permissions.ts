export const IDENTITY_PERMISSIONS = Object.freeze({
  invitationsCreate: "identity.invitations.create",
  invitationsRevoke: "identity.invitations.revoke",
  membershipsRead: "identity.memberships.read",
  membershipsManage: "identity.memberships.manage",
  rolesAssignAny: "identity.roles.assign_any",
  sessionsRevoke: "identity.sessions.revoke",
} as const);
