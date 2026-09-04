# Security Policy

## Supported versions

| Version               | Supported |
| --------------------- | --------- |
| latest default branch | yes       |
| older tags            | no        |

## Reporting a vulnerability

Do not open a public issue for a security vulnerability.

Use GitHub’s “Report a vulnerability” option under the repository Security tab. Include reproduction steps, affected
files or endpoints, and any proof-of-concept details.

You should receive an acknowledgment within 7 days. Maintainers will coordinate a fix and disclosure timeline after
validation.

## Handling guidance

- Never commit GitHub tokens or credentials.
- Tokens used by cloud sync are held in memory only.
- Imported and downloaded JSON must pass domain validation before entering application state.
- Dependency audit failures block CI.
