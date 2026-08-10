import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

export const operationsCookieName = "commutemap_operations_session";
export const operationsSessionMaxAgeSeconds = 8 * 60 * 60;

const sessionMessage = "commutemap-ph-operations-session-v1";

export function getOperationsAccessToken() {
  const token = process.env.OPERATIONS_ACCESS_TOKEN?.trim();

  if (!token || token.length < 32) {
    return null;
  }

  return token;
}

export function createOperationsSessionValue(token: string) {
  return createHmac("sha256", token).update(sessionMessage).digest("base64url");
}

export function safelyMatches(value: string, expected: string) {
  const valueBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);

  return (
    valueBuffer.length === expectedBuffer.length &&
    timingSafeEqual(valueBuffer, expectedBuffer)
  );
}

export function isOperationsSessionValid(cookieValue: string | undefined) {
  const token = getOperationsAccessToken();

  return Boolean(
    token &&
    cookieValue &&
    safelyMatches(cookieValue, createOperationsSessionValue(token)),
  );
}
