# End-to-End Deployment Guide — Knockit CRM

This is the full path from an empty AWS account to a working production
deployment. Follow it in order — each section depends on the one before it.

Two real bugs were found and fixed while preparing this guide (not
hypothetical — both were reproduced and proven before being fixed):

1. The Dockerfile was building from `apps/api` in isolation, but this is an
   npm-workspaces monorepo whose lockfile lives at the repo root. The image
   would have failed or resolved dependencies incorrectly. Fixed: the
   Dockerfile now expects the **repo root** as build context, and both
   deploy workflows were updated to pass `-f apps/api/Dockerfile .` from
   the repo root rather than `-f Dockerfile .` from inside `apps/api`.
2. The database migration script (`migration:run`) only works via
   `ts-node` against raw `.ts` source — but the production Docker image
   contains only compiled `dist/*.js`, no `src/*.ts` at all. The migration
   ECS task would have failed every time. Fixed: added `migration:run:prod`,
   which runs against the compiled `dist/database/data-source.js`, and
   updated `data-source.ts` to point at the right file extension depending
   on whether it's running compiled or via ts-node. This was tested for
   real — full migration chain run successfully against a fresh database
   using only the compiled output, exactly as the production task will.

Everything below this point — actual AWS resource creation, real Terraform
applies, real GitHub secrets — has **not** been run against a live AWS
account (no AWS access in this environment). Treat each AWS step as
correct-as-written but unverified; the first real run is the actual test.

---

## Part 1 — AWS account preparation

Do this once, before touching Terraform or GitHub.

### 1.1 Decide on region and naming
This guide assumes `eu-west-2` (London) per the brand's UK base, and the
naming pattern `knockit-{resource}-{env}` (e.g. `knockit-api-staging`).
Adjust if your team prefers differently, but keep it consistent — the
GitHub Actions workflows below assume these exact names.

### 1.2 Create the OIDC provider for GitHub Actions
This lets GitHub Actions assume an AWS role without ever storing AWS
access keys anywhere. One-time, account-wide:

```bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
```

If your AWS account already has this provider from another project, skip
this step — there can only be one per account.

### 1.3 Create the two deploy IAM roles
One for staging, one for production, each trusted only by this specific
GitHub repo (replace `YOUR_GITHUB_ORG/knockit-crm` and your AWS account ID):

```bash
cat > /tmp/trust-policy-staging.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "arn:aws:iam::ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
      "StringLike": { "token.actions.githubusercontent.com:sub": "repo:YOUR_GITHUB_ORG/knockit-crm:ref:refs/heads/develop" }
    }
  }]
}
EOF

aws iam create-role \
  --role-name knockit-deploy-staging \
  --assume-role-policy-document file:///tmp/trust-policy-staging.json
```

Repeat for production with a different trust policy file (condition on
`refs/heads/main`) and role name `knockit-deploy-production`.

Attach a permissions policy to each role scoped to exactly what the deploy
workflow needs: ECR push/pull, ECS update-service / run-task /
describe-services, and (production role only) `rds:CreateDBSnapshot` plus
`rds:DescribeDBSnapshots`. Do not attach broad managed policies like
`AdministratorAccess` — these roles are reachable from CI, so keep the
blast radius small.

---

## Part 2 — Provision infrastructure

`infra/terraform/` in the repo is currently **empty** — this is the one
piece of "everything" that genuinely was not built, because writing
Terraform without the ability to `terraform plan` against a real AWS
account means every line would be unverified guesswork dressed up as
finished infrastructure. Below is the resource list to provision, in
dependency order, whether you write it as Terraform yourselves or do it
through the console first and codify it afterward.

### 2.1 Networking
- VPC with public and private subnets across 2 availability zones (ECS
  Fargate tasks and RDS go in private subnets; the ALB goes in public
  subnets).
- NAT gateway so private-subnet tasks can reach the internet (outbound
  calls to things like Resend or Pusher at runtime).

### 2.2 Database and cache
- RDS PostgreSQL 16, one instance per environment, in private subnets,
  automated backups on (7-day retention minimum for production).
- ElastiCache Redis, one per environment, same private subnet group.
- Security group rule: only the ECS task security group can reach RDS or
  Redis on their respective ports — nothing should be open to 0.0.0.0/0.

### 2.3 Secrets
Create these in AWS Secrets Manager (one set per environment): `DB_PASSWORD`,
`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `RESEND_API_KEY`, `PUSHER_SECRET`.
Generate the JWT secrets fresh — never reuse the `.env.development`
placeholder values:

```bash
openssl rand -hex 64   # run twice, once for each JWT secret
```

### 2.4 ECR
```bash
aws ecr create-repository --repository-name knockit-api-staging --region eu-west-2
aws ecr create-repository --repository-name knockit-api-production --region eu-west-2
```

### 2.5 ECS
- One Fargate cluster per environment: `knockit-staging-cluster`,
  `knockit-production-cluster`.
- Two task definitions per environment, both pointing at the same ECR
  image:
  - `knockit-api-staging` / `knockit-api-production` — the long-running
    service, behind an ALB. Health check path: `/api/v1/health`. Pull
    secrets from Secrets Manager via the task definition's secrets block,
    not plain environment variables.
  - `knockit-api-migrate-staging` / `knockit-api-migrate-production` — a
    one-off task definition, same image, container name must be exactly
    `migrate` (the deploy workflows override this container's command).
    Deliberately separate from the running service so a migration never
    races against multiple service instances starting up at once.
- ALB with a target group pointed at the service task definition, health
  check on `/api/v1/health`, HTTPS listener with an ACM certificate for
  your domain.

### 2.6 DNS
Point `staging.knockit.app` and `app.knockit.co.uk` (or whichever domains
you're actually using) at the respective ALB via a CNAME or Route 53 alias
record.

---

## Part 3 — GitHub repository setup

### 3.1 Push the code
```bash
cd knockit-crm
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_GITHUB_ORG/knockit-crm.git
git push -u origin main
git checkout -b develop
git push -u origin develop
```

### 3.2 Create GitHub Environments
Settings → Environments → New environment, twice: `staging` and
`production`.

On `production`, add required reviewers under "Deployment protection
rules" — this is what makes the production deploy workflow pause and wait
for a human click. Staging deploys automatically; production does not.

### 3.3 Add secrets
Settings → Secrets and variables → Actions (or scope them per-environment
under each Environment's own secrets):

| Secret | Value |
|---|---|
| `AWS_STAGING_DEPLOY_ROLE_ARN` | ARN of the role from step 1.3 |
| `AWS_PRODUCTION_DEPLOY_ROLE_ARN` | ARN of the production role from step 1.3 |
| `STAGING_PRIVATE_SUBNET_IDS` | comma-separated subnet IDs from step 2.1 |
| `STAGING_SECURITY_GROUP_ID` | security group ID for staging ECS tasks |
| `PRODUCTION_PRIVATE_SUBNET_IDS` | comma-separated subnet IDs |
| `PRODUCTION_SECURITY_GROUP_ID` | security group ID for production ECS tasks |

### 3.4 Branch protection
Settings → Branches → add a rule for both `main` and `develop`: require
the `CI` workflow to pass before merging. This is what makes the test
suite meaningful rather than advisory.

---

## Part 4 — First real deployment

Do staging first, always. Never deploy straight to production on a
pipeline that has never run.

### 4.1 Trigger staging
```bash
git checkout develop
git commit --allow-empty -m "Trigger first staging deploy"
git push origin develop
```
Watch the Actions tab. `CI` runs first; once it's green, `Deploy to
Staging` fires automatically (triggered by CI's completion via the
`workflow_run` trigger, not by the push itself).

### 4.2 Watch for the two likeliest first-run failures
- ECR login or push fails → almost always the IAM role's trust policy
  condition doesn't match the actual branch ref. Double-check the `sub`
  condition in step 1.3 matches `refs/heads/develop` exactly.
- `ecs run-task` for migrations fails → check the task definition's
  container name is literally `migrate` (case-sensitive, must match the
  `containerOverrides` name in the workflow) and that the subnet and
  security group secrets in step 3.3 are correct.

### 4.3 Verify staging manually
```bash
curl https://staging.knockit.app/api/v1/health
```
Should return `{"status":"ok","database":{"connected":true},...}`. If this
fails, check ECS service logs in CloudWatch before retrying — the deploy
workflow's own health check retries 10 times over roughly 100 seconds and
fails the workflow run with a clear message if it never goes green.

### 4.4 Promote to production
Only once staging is genuinely healthy and you've smoke-tested the actual
features — register a tenant, create a lead, raise a ticket, the kind of
walkthrough already proven directly against the API in this build process:

```bash
git checkout main
git merge develop
git push origin main
```

`CI` runs again, then `Deploy to Production` starts and pauses at the
environment gate. Go to the Actions tab, find the waiting run, and approve
it — this is the human checkpoint by design.

### 4.5 Verify production
```bash
curl https://app.knockit.co.uk/api/v1/health
```

---

## Part 5 — Ongoing operations

- Every future deploy is just: merge a PR into `develop`, staging updates
  automatically, merge `develop` into `main`, approve, production updates.
- Rolling back: re-run a previous successful workflow run from the Actions
  tab (it redeploys that commit's image, still in ECR tagged by SHA), or
  revert the merge commit on `main` and push — either triggers a fresh
  deploy of the known-good state. The production workflow always snapshots
  RDS before migrating, so a bad migration has a fast path back.
- Scheduled jobs (`TicketsService.detectBreaches()`,
  `AmcService.detectExpiredContracts()`) are not yet wired to run
  automatically — they exist as callable methods but nothing currently
  schedules them. Add this before relying on SLA breach detection
  happening without a manual trigger — an EventBridge scheduled rule
  invoking an ECS task, or BullMQ if you'd rather keep it in-process, both
  work.
