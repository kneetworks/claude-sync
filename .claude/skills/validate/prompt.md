# /validate - Quality Verification

Comprehensive validation of implementation. Use AFTER /implement to ensure quality before commit.

## What This Skill Does

Runs all quality checks:
- TypeScript compilation
- Tests
- Linting (if configured)
- Manual verification checklist

## When to Use

- After completing implementation
- Before creating a commit
- Before opening a PR

## Checklist

### Build
```bash
pnpm build
```
- [ ] No TypeScript errors
- [ ] All files compile

### Tests
```bash
pnpm test
```
- [ ] All tests pass
- [ ] New code has test coverage (if applicable)

### Code Review
- [ ] No hardcoded secrets
- [ ] Error handling is appropriate
- [ ] Code follows existing patterns
- [ ] No console.log debugging left in

### Security (for this project especially)
- [ ] Encryption key never logged or exposed
- [ ] Session data always encrypted before storage
- [ ] File permissions are restrictive (0600 for key)
- [ ] No sensitive data in git commits

### Documentation
- [ ] CLAUDE.md updated if needed
- [ ] README updated if user-facing changes
