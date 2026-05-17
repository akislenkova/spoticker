/** User-safe messages for STS / IAM failures during connect or SPS fetch. */
export function formatAwsError(err: unknown): { message: string; hint?: string } {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "Unknown error";

  const name = err && typeof err === "object" && "name" in err ? String(err.name) : "";
  const code =
    err && typeof err === "object" && "Code" in err
      ? String((err as { Code?: string }).Code)
      : err && typeof err === "object" && "$metadata" in err
        ? ""
        : "";

  const text = `${name} ${code} ${raw}`.toLowerCase();

  if (
    text.includes("credentials") &&
    (text.includes("could not be loaded") ||
      text.includes("missing credentials") ||
      text.includes("credential"))
  ) {
    return {
      message: "Spoticker server is not configured with AWS credentials.",
      hint: "Set SPOTTICKER_AWS_ACCESS_KEY_ID and SPOTTICKER_AWS_SECRET_ACCESS_KEY on Vercel (IAM user in account 601883338057 with sts:AssumeRole).",
    };
  }

  if (text.includes("accessdenied") || text.includes("not authorized")) {
    return {
      message: "AWS denied AssumeRole.",
      hint: "In CloudFormation, SpottickerRoleArn must be arn:aws:iam::601883338057:root (or SpottickerAssumeRole if created). ExternalId must match Spoticker exactly.",
    };
  }

  if (text.includes("externalid") || text.includes("external id")) {
    return {
      message: "External ID mismatch.",
      hint: "Re-copy ExternalId from Spoticker into the stack parameters, update the stack, then verify again.",
    };
  }

  if (text.includes("malformedpolicydocument") || text.includes("invalid principal")) {
    return {
      message: "CloudFormation trust policy is invalid.",
      hint: "Use arn:aws:iam::601883338057:root for SpottickerRoleArn unless role/SpottickerAssumeRole exists in that account.",
    };
  }

  if (text.includes("nosuchentity") || text.includes("role not found")) {
    return {
      message: "Role ARN not found in your AWS account.",
      hint: "Paste RoleArn from the stack Outputs tab after CREATE_COMPLETE.",
    };
  }

  return {
    message: raw.length > 200 ? `${raw.slice(0, 200)}…` : raw,
    hint: "Check stack CREATE_COMPLETE, ExternalId, and RoleArn from Outputs.",
  };
}
