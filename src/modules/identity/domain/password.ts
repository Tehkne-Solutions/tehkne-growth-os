import {
  randomBytes,
  scrypt as nodeScrypt,
  timingSafeEqual,
} from "node:crypto";

const ALGORITHM = "scrypt";
const COST = 16_384;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
const KEY_LENGTH = 64;
const MAX_MEMORY = 32 * 1024 * 1024;
const MIN_PASSWORD_BYTES = 12;
const MAX_PASSWORD_BYTES = 128;

export class PasswordPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PasswordPolicyError";
  }
}

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    nodeScrypt(
      password,
      salt,
      KEY_LENGTH,
      {
        N: COST,
        r: BLOCK_SIZE,
        p: PARALLELIZATION,
        maxmem: MAX_MEMORY,
      },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(derivedKey);
      },
    );
  });
}

function assertPasswordPolicy(password: string): void {
  const passwordBytes = Buffer.byteLength(password, "utf8");

  if (passwordBytes < MIN_PASSWORD_BYTES) {
    throw new PasswordPolicyError(
      `Password must contain at least ${MIN_PASSWORD_BYTES} bytes.`,
    );
  }

  if (passwordBytes > MAX_PASSWORD_BYTES) {
    throw new PasswordPolicyError(
      `Password must contain at most ${MAX_PASSWORD_BYTES} bytes.`,
    );
  }
}

export async function hashPassword(password: string): Promise<string> {
  assertPasswordPolicy(password);

  const salt = randomBytes(16);
  const derivedKey = await deriveKey(password, salt);

  return [
    ALGORITHM,
    COST,
    BLOCK_SIZE,
    PARALLELIZATION,
    salt.toString("base64url"),
    derivedKey.toString("base64url"),
  ].join("$");
}

export async function verifyPassword(
  password: string,
  encodedHash: string,
): Promise<boolean> {
  const [algorithm, cost, blockSize, parallelization, saltValue, hashValue] =
    encodedHash.split("$");

  if (
    algorithm !== ALGORITHM ||
    Number(cost) !== COST ||
    Number(blockSize) !== BLOCK_SIZE ||
    Number(parallelization) !== PARALLELIZATION ||
    !saltValue ||
    !hashValue
  ) {
    return false;
  }

  try {
    const expected = Buffer.from(hashValue, "base64url");
    const received = await deriveKey(
      password,
      Buffer.from(saltValue, "base64url"),
    );

    return (
      expected.length === received.length && timingSafeEqual(expected, received)
    );
  } catch {
    return false;
  }
}
