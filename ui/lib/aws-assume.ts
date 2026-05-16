import { STSClient, AssumeRoleCommand } from "@aws-sdk/client-sts";
import {
  EC2Client,
  GetSpotPlacementScoresCommand,
  SpotPlacementScore,
} from "@aws-sdk/client-ec2";

const GPU_INSTANCE_TYPES = [
  "g4dn.xlarge", "g4dn.2xlarge", "g4dn.12xlarge",
  "g5.xlarge", "g5.2xlarge", "g5.12xlarge",
  "p3.2xlarge", "p3.8xlarge",
  "p4d.24xlarge",
  "p5.48xlarge",
];

const REGIONS = [
  "us-east-1", "us-east-2", "us-west-2",
  "eu-west-1", "eu-central-1",
  "ap-northeast-1", "ap-southeast-1",
];

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
  if (!Credentials) throw new Error("No credentials returned from AssumeRole");
  return Credentials;
}

export async function getSpotPlacementScores(
  roleArn: string,
  externalId: string
): Promise<SpotPlacementScore[]> {
  const creds = await assumeRole(roleArn, externalId);

  const ec2 = new EC2Client({
    region: "us-east-1",
    credentials: {
      accessKeyId: creds.AccessKeyId!,
      secretAccessKey: creds.SecretAccessKey!,
      sessionToken: creds.SessionToken,
    },
  });

  const { SpotPlacementScores } = await ec2.send(
    new GetSpotPlacementScoresCommand({
      InstanceTypes: GPU_INSTANCE_TYPES,
      TargetCapacity: 1,
      SingleAvailabilityZone: false,
      RegionNames: REGIONS,
    })
  );

  return SpotPlacementScores ?? [];
}
