import bcrypt from "bcryptjs";

const COST = process.env.NODE_ENV === "test" ? 4 : 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, COST);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** Minimum policy: 8+ chars with at least one letter and one number. */
export function passwordProblem(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (password.length > 128) return "Password is too long.";
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return "Password must contain letters and numbers.";
  return null;
}

let dummyHash: string | null = null;
/** Spend the same time as a real check so login timing does not reveal whether an email exists. */
export async function dummyVerify(password: string) {
  dummyHash ??= await bcrypt.hash("timing-equaliser", COST);
  await bcrypt.compare(password, dummyHash);
}
