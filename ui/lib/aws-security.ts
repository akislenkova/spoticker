import type { User } from "@supabase/supabase-js";

const ROLE_ARN_RE = /^arn:aws:iam::\d{12}:role\/[\w+=,.@\/-]+$/;

export function isValidRoleArn(arn: string): boolean {
  return ROLE_ARN_RE.test(arn.trim());
}

export function auditAwsEvent(
  event: string,
  fields: Record<string, string | number | boolean | null | undefined>
) {
  console.info(
    JSON.stringify({
      ts: new Date().toISOString(),
      component: "aws-connect",
      event,
      ...fields,
    })
  );
}

export async function requireUser(
  getUser: () => Promise<{ data: { user: User | null } }>
): Promise<User | null> {
  const {
    data: { user },
  } = await getUser();
  return user;
}

export const AWS_CONNECTION_COOKIE = "spotticker_aws_connection";

export function connectionCookieOptions(maxAgeSeconds = 60 * 60 * 24 * 90) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
