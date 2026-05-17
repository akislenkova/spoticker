import type { AwsCredentialIdentity } from "@aws-sdk/types";

export class SpottickerAwsNotConfiguredError extends Error {
  constructor() {
    super(
      "SPOTTICKER_AWS_ACCESS_KEY_ID and SPOTTICKER_AWS_SECRET_ACCESS_KEY are not set on the server"
    );
    this.name = "SpottickerAwsNotConfiguredError";
  }
}

/** Credentials for Spoticker's account used to call sts:AssumeRole into customer roles. */
export function getSpottickerCredentials(): AwsCredentialIdentity {
  const accessKeyId =
    process.env.SPOTTICKER_AWS_ACCESS_KEY_ID?.trim() ||
    process.env.AWS_ACCESS_KEY_ID?.trim();
  const secretAccessKey =
    process.env.SPOTTICKER_AWS_SECRET_ACCESS_KEY?.trim() ||
    process.env.AWS_SECRET_ACCESS_KEY?.trim();
  const sessionToken =
    process.env.SPOTTICKER_AWS_SESSION_TOKEN?.trim() ||
    process.env.AWS_SESSION_TOKEN?.trim();

  if (!accessKeyId || !secretAccessKey) {
    throw new SpottickerAwsNotConfiguredError();
  }

  return sessionToken
    ? { accessKeyId, secretAccessKey, sessionToken }
    : { accessKeyId, secretAccessKey };
}

export function isSpottickerAwsConfigured(): boolean {
  try {
    getSpottickerCredentials();
    return true;
  } catch {
    return false;
  }
}
