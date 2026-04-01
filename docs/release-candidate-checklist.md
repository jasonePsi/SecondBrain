# Release Candidate Checklist

Last updated: April 1, 2026

Use this checklist to decide whether the current branch is ready to hand off for beta/release-candidate distribution.

## 1) Automated Gate (Required)

- [ ] `npm ci` succeeds from repo root.
- [ ] `npm run verify:all` succeeds from repo root.
- [ ] CI on `.github/workflows/ci.yml` is green for the target commit.

## 2) Manual Gate A - First Serious QA Pass (Required)

Run and pass all `P0` scenarios from:

- `docs/manual-qa-checklist.md`

Pass condition:

- [ ] All `P0` scenarios = `Pass` (no `Fail`/`Blocked`).

## 3) Manual Gate B - Beta/RC Signoff (Required for release candidate)

Run and pass all `P1` scenarios from:

- `docs/manual-qa-checklist.md`

Pass condition:

- [ ] All `P0` + `P1` scenarios = `Pass` (no `Fail`/`Blocked`).

## 4) Deferred Risk Acknowledgement (Required)

Before signoff, confirm open deferred risks are explicitly accepted for this release branch:

- Dependency/deprecation posture: `docs/dependency-risk.md`
- Current redesign/release confidence and runtime gaps: `docs/redesign-progress.md`

Pass condition:

- [ ] Deferred risks are reviewed and accepted by maintainer/release owner.

## 5) Signoff Record

- Date:
- Commit SHA:
- Tester(s):
- Device/runtime matrix:
- Automated gate result:
- Manual Gate A result:
- Manual Gate B result:
- Open risks accepted:
- Go/No-Go decision:

