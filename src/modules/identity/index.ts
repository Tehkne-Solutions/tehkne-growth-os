export {
  authenticateWithPassword,
  InvalidCredentialsError,
} from "./application/authenticate-with-password";
export {
  authorize,
  authorizeRoleGrant,
} from "./application/authorization-service";
export {
  acceptInvitation,
  createInvitation,
  InvalidInvitationScopeError,
} from "./application/invitation-service";
export {
  createSession,
  InvalidSessionError,
  revokeSession,
  validateSession,
} from "./application/session-service";
export {
  assertPermission,
  assertRoleGrantAllowed,
  AuthorizationDeniedError,
  buildAuthorizationContext,
  membershipCoversTenant,
  type AccessScope,
  type AuthorizationContext,
  type AuthorizationMembership,
} from "./domain/authorization";
export {
  hashPassword,
  PasswordPolicyError,
  verifyPassword,
} from "./domain/password";
export { IDENTITY_PERMISSIONS } from "./domain/permissions";
export {
  ExistingAccountAuthenticationRequiredError,
  InvalidInvitationError,
  PrismaIdentityRepository,
} from "./infrastructure/prisma-identity-repository";
