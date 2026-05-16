import {
  STSClient,
  AssumeRoleCommand,
  GetCallerIdentityCommand,
} from "@aws-sdk/client-sts";
import { EC2Client, GetSpotPlacementScoresCommand } from "@aws-sdk/client-ec2";

/** Instance types supported by GetSpotPlacementScores (p3.* is rejected by the API). */
const GPU_INSTANCE_TYPES = [
  "g4dn.xlarge",
  "g4dn.2xlarge",
  "g4dn.12xlarge",
  "g5.xlarge",
  "g5.2xlarge",
  "g5.12xlarge",
  "g6.xlarge",
  "g6.2xlarge",
  "p4d.24xlarge",
  "p5.48xlarge",
];

const REGIONS = [
  "us-east-1", "us-east-2", "us-west-2",
  "eu-west-1", "eu-central-1",
  "ap-northeast-1", "ap-southeast-1",
];

type TempCredentials = {
  AccessKeyId: string;
  SecretAccessKey: string;
  SessionToken?: string;
};

function stsWithCredentials(creds: TempCredentials) {
  return new STSClient({
    region: "us-east-1",
    credentials: {
      accessKeyId: creds.AccessKeyId,
      secretAccessKey: creds.SecretAccessKey,
      sessionToken: creds.SessionToken,
    },
  });
}

export async function assumeRole(roleArn: string, externalId: string) {
  const sts = new STSClient({ region: "us-east-1" });
  const { Credentials } = await sts.send(
    new AssumeRoleCommand({
      RoleArn: roleArn,
      RoleSessionName: "spotticker-session",
      ExternalId: externalId,
      DurationSeconds: 900,
    })
  );
  if (!Credentials?.AccessKeyId || !Credentials.SecretAccessKey) {
    throw new Error("AssumeRole returned no credentials");
  }
  return {
    AccessKeyId: Credentials.AccessKeyId,
    SecretAccessKey: Credentials.SecretAccessKey,
    SessionToken: Credentials.SessionToken,
  };
}

export async function getCallerAccountId(creds: TempCredentials): Promise<string> {
  const sts = stsWithCredentials(creds);
  const { Account } = await sts.send(new GetCallerIdentityCommand({}));
  if (!Account) throw new Error("GetCallerIdentity returned no account");
  return Account;
}

export type SpsEntry = { region: string; instanceType: string; score: number };

/** One API call per instance type so each GPU row can get its own score/color. */
export async function getSpotPlacementScores(
  roleArn: string,
  externalId: string
): Promise<SpsEntry[]> {
  const creds = await assumeRole(roleArn, externalId);

  const ec2 = new EC2Client({
    region: "us-east-1",
    credentials: {
      accessKeyId: creds.AccessKeyId,
      secretAccessKey: creds.SecretAccessKey,
      sessionToken: creds.SessionToken,
    },
  });

  const batches = await Promise.all(
    GPU_INSTANCE_TYPES.map(async (instanceType) => {
      const { SpotPlacementScores } = await ec2.send(
        new GetSpotPlacementScoresCommand({
          InstanceTypes: [instanceType],
          TargetCapacity: 1,
          SingleAvailabilityZone: false,
          RegionNames: REGIONS,
        })
      );
      const entries: SpsEntry[] = [];
      for (const s of SpotPlacementScores ?? []) {
        if (s.Region && s.Score != null) {
          entries.push({ region: s.Region, instanceType, score: s.Score });
        }
      }
      return entries;
    })
  );

  return batches.flat();
}
