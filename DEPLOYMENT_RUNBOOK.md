# Deployment Runbook — Knockit CRM

This document is the bridge between the CI/CD pipeline (already written, in
`.github/workflows/`) and a real AWS account. The workflows reference AWS
resources and GitHub secrets that don't exist yet — this file is the
checklist for creating them. Nothing here can be done by Claude; it all
requires access to your actual AWS account and GitHub repository settings.

## How the pipeline is structured

- **`ci.yml`** — runs on every PR and every push to `develop`/`main`. Lints,
  type-checks, runs the full Jest suite against a real ephemeral Postgres
  container, and confirms the production build succeeds. This is the gate;
  nothing below ever runs if this fails.
- **`deploy-staging.yml`** — runs automatically after CI succeeds on
  `develop`. No manual approval — staging is meant to be a fast feedback
  loop.
- **`deploy-production.yml`** — runs automatically after CI succeeds on
  `main`, but **pauses for manual approval** if you configure required
  reviewers on the `production` GitHub Environment (see below). This is the
  one human checkpoint in the entire pipeline, placed deliberately at the
  point of highest consequence.

Branch flow: feature branch → PR into `develop` → CI runs → merge → auto-
deploys to staging → once verified, PR `develop` → `main` → CI runs again →
approve → deploys to production.

## One-time AWS setup (do this once per environment: staging, production)

1. **ECR repository** — `aws ecr create-repository --repository-name knockit-api-staging --region eu-west-2` (and again with `-production` for prod).
2. **RDS Postgres instance** — one per environment, in a private subnet, with automated backups enabled (7+ day retention for production). Note the endpoint, username, and password — these go into AWS Secrets Manager, never into GitHub secrets or `.env` files in git.
3. **ElastiCache Redis instance** — one per environment, same private subnet group as RDS.
4. **ECS Fargate cluster** — `knockit-staging-cluster` / `knockit-production-cluster`.
5. **Two ECS task definitions per environment**:
   - `knockit-api-staging` (or `-production`) — the long-running API service, behind an Application Load Balancer with the health check path set to `/api/v1/health`.
   - `knockit-api-migrate-staging` (or `-production`) — a one-off task definition using the same image, whose only job is to run `npm run migration:run` and exit. This is intentionally separate from the running service (see comment in `deploy-staging.yml`) so migrations never race against multiple service instances starting up simultaneously.
6. **Secrets in AWS Secrets Manager**: `DB_PASSWORD`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `RESEND_API_KEY`, `PUSHER_SECRET` — generate long random values for the JWT secrets (e.g. `openssl rand -hex 64`), never reuse the dev values from `.env.development`.
7. **IAM OIDC provider for GitHub Actions** — if not already set up for this AWS account: `token.actions.githubusercontent.com` as the provider, so GitHub Actions can assume an AWS role without any long-lived AWS access keys ever being stored anywhere.
8. **IAM deploy role per environment** — trust policy allowing the GitHub OIDC provider to assume it (scoped to this specific repo, via the `sub` condition), with permissions limited to: ECR push, ECS update-service / run-task / describe-services / wait, and (production only) RDS create-db-snapshot.

## GitHub repository setup

1. **Settings → Environments** — create `staging` and `production`. On `production`, add required reviewers under "Deployment protection rules" — this is what makes `deploy-production.yml` pause for approval.
2. **Settings → Secrets → Actions** (or per-environment secrets) — add:
   - `AWS_STAGING_DEPLOY_ROLE_ARN`
   - `AWS_PRODUCTION_DEPLOY_ROLE_ARN`
   - `STAGING_PRIVATE_SUBNET_IDS` / `PRODUCTION_PRIVATE_SUBNET_IDS` (comma-separated)
   - `STAGING_SECURITY_GROUP_ID` / `PRODUCTION_SECURITY_GROUP_ID`
3. **Branch protection** — on `main` and `develop`, require the `CI` workflow to pass before merging is allowed. This is what actually makes the test suite meaningful rather than advisory.

## DNS / domain (out of scope for this pipeline, done separately)

`staging.knockit.app` and `app.knockit.co.uk` need to point at the
respective ALB. Whoever owns the domain registrar does this once; it isn't
part of the CI/CD workflows themselves.

## What to verify after first setup

Before relying on this pipeline for anything real, do one full manual dry
run: push a trivial change to `develop`, watch the Actions tab, confirm
staging actually updates and the health check passes. Same for `main` once
staging looks right. The workflows have been written carefully but have
never run against a real AWS account — that first real run is the actual
test.
