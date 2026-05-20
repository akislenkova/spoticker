# Spoticker AWS IAM setup

The Next.js app calls `sts:AssumeRole` into **your** account using credentials from **Spoticker’s** account (`601883338057`).

## 1. Create an IAM user in account 601883338057

1. IAM → Users → Create user (e.g. `spotticker-connect`)
2. Attach inline policy from [`spotticker-assume-role-policy.json`](./spotticker-assume-role-policy.json) (`sts:AssumeRole` into customer roles)
3. Create **access key** → copy Access key ID + Secret

## 2. Configure the app

In **`ui/.env.local`** (restart `npm run dev` after saving):

```env
SPOTTICKER_AWS_ACCESS_KEY_ID=AKIA...
SPOTTICKER_AWS_SECRET_ACCESS_KEY=...

# Shown in CloudFormation "SpottickerRoleArn" parameter
NEXT_PUBLIC_AWS_ACCOUNT_ID=601883338057
NEXT_PUBLIC_SPOTTICKER_ASSUME_ROLE_ARN=arn:aws:iam::601883338057:root
```

On **Vercel**, add the same `SPOTTICKER_AWS_*` vars (not `NEXT_PUBLIC_`).

> The GitHub scraper keys (`AWS_ACCESS_KEY_ID` in Actions) only work if that IAM user also has `sts:AssumeRole`. The scraper policy alone does not include it.

## 3. Connect your AWS account (browser)

1. Sign in at `/login`
2. Open `/connect` → Generate External ID
3. Deploy [`../cloudformation/spoticker-role.yaml`](../cloudformation/spoticker-role.yaml) in **your** AWS account
4. Parameters:
   - **SpottickerRoleArn:** `arn:aws:iam::601883338057:root`
   - **ExternalId:** paste from Spoticker exactly
5. After `CREATE_COMPLETE`, paste **RoleArn** from Outputs → Verify

## Troubleshooting

| Error | Fix |
|-------|-----|
| Server not configured | Add `SPOTTICKER_AWS_*` to `ui/.env.local`, restart dev |
| Invalid principal | Use root ARN above, not `role/SpottickerAssumeRole` unless you created it |
| External ID mismatch | Re-copy ExternalId from Spoticker into the stack |
| Access denied AssumeRole | Trust policy must allow `601883338057` with your ExternalId |

Test server credentials locally:

```bash
cd ui && npx tsx scripts/test-aws-connect.ts
```
