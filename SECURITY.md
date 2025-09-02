# 🔒 Security Guidelines

This document outlines security best practices for the Khizr Learning System.

## 🚨 Critical Security Issues Fixed

### ✅ **Hardcoded Credentials Removed**
- Fixed `check-schema.js` - removed hardcoded Supabase credentials
- Fixed `old_apphtml/dapp.html` - removed hardcoded API keys
- All credentials now use environment variables

### ✅ **Enhanced .gitignore**
- Added comprehensive security exclusions
- Prevents accidental commit of sensitive files
- Includes environment files, logs, and temporary data

## 🔐 Security Best Practices

### Environment Variables
```bash
# NEVER commit these files to Git
.env
.env.local
.env.production
.env.development
```

### API Keys & Secrets
- ✅ Use environment variables for all secrets
- ✅ Never hardcode API keys in source code
- ✅ Use different keys for development/production
- ✅ Rotate keys regularly

### Database Credentials
- ✅ Use connection strings with environment variables
- ✅ Never expose database passwords in code
- ✅ Use Supabase service role keys only server-side

### Logging Sensitive Data
- ❌ Don't log passwords, tokens, or PII
- ❌ Don't log full request/response bodies with sensitive data
- ✅ Use structured logging with data sanitization

## 📋 Pre-GitHub Checklist

Before pushing to GitHub, run this checklist:

### 1. **Environment Variables**
```bash
# Check for .env files
ls -la | grep "\.env"

# Should return no results (files should be gitignored)
```

### 2. **Hardcoded Secrets**
```bash
# Search for potential hardcoded secrets
grep -r "eyJ" . --exclude-dir=node_modules --exclude-dir=.git
grep -r "sk-" . --exclude-dir=node_modules --exclude-dir=.git
grep -r "password.*=" . --exclude-dir=node_modules --exclude-dir=.git
```

### 3. **API Keys in Code**
```bash
# Check for API key patterns
grep -r "API_KEY\|SECRET\|TOKEN" . --exclude-dir=node_modules --exclude-dir=.git
```

### 4. **Git Status Check**
```bash
git status --ignored
```

## 🛡️ Safe Development Practices

### Adding New Features
1. **Always use environment variables** for any sensitive data
2. **Never commit test credentials** - use placeholder values
3. **Review code before committing** - check for sensitive data
4. **Use .env.example** files for required environment variables

### Example: Adding a New API Integration
```javascript
// ❌ BAD - Hardcoded
const API_KEY = "sk-1234567890abcdef";

// ✅ GOOD - Environment variable
const API_KEY = process.env.NEW_API_KEY;

if (!API_KEY) {
    throw new Error('NEW_API_KEY environment variable is required');
}
```

### Database Security
```javascript
// ❌ BAD - Hardcoded connection
const supabase = createClient("https://...", "hardcoded-key");

// ✅ GOOD - Environment variables
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);
```

## 🚨 Emergency Security Actions

If you accidentally commit sensitive data:

### 1. **Immediate Actions**
```bash
# Remove sensitive files from git history
git rm --cached .env
git rm --cached path/to/sensitive/file

# Force push to remove from remote
git push origin main --force-with-lease
```

### 2. **Rotate Compromised Credentials**
- Generate new API keys
- Update database passwords
- Revoke compromised tokens
- Update all environment configurations

### 3. **Notify Team**
- Inform all team members about the breach
- Update shared credentials
- Review access logs for suspicious activity

## 🔍 Security Monitoring

### Regular Security Audits
```bash
# Run security audit
npm audit

# Check for security vulnerabilities
npm audit --audit-level=high

# Search for potential security issues
grep -r "console.log.*password\|console.log.*token\|console.log.*key" .
```

## 📞 Security Contacts

- **Security Issues**: Create GitHub issue with "SECURITY" label
- **Immediate Threats**: Contact project maintainer directly
- **API Key Issues**: Rotate keys immediately and update documentation

## ✅ Security Status

- [x] Hardcoded credentials removed
- [x] Enhanced .gitignore implemented
- [x] Environment variable usage enforced
- [ ] Security audit completed (run checklist above)
- [ ] All team members trained on security practices

---

**Remember**: Security is everyone's responsibility. Always err on the side of caution when handling sensitive data.
