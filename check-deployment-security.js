#!/usr/bin/env node

// Deployment Security Checklist
// Run this before deploying to ensure security compliance

const fs = require('fs');
const path = require('path');

console.log('🔒 Khizr Assistant - Deployment Security Checklist\n');

// Security checks
const checks = {
    environmentVariables: false,
    hardcodedSecrets: false,
    gitIgnoreStatus: false,
    productionConfig: false,
    apiKeysValidation: false
};

let allPassed = true;

// 1. Check for environment variables
console.log('1. 🔍 Checking Environment Variables...');
try {
    const envPath = path.join(__dirname, '.env');

    // Check if .env file exists
    if (fs.existsSync(envPath)) {
        // Check if it's gitignored
        const { execSync } = require('child_process');
        try {
            execSync('git check-ignore .env', { cwd: __dirname });
            console.log('   ✅ .env file exists but is properly gitignored');
            checks.environmentVariables = true;
        } catch (error) {
            console.log('   ❌ .env file found but NOT gitignored - SECURITY RISK!');
            allPassed = false;
        }
    } else {
        console.log('   ✅ No .env file in repository');
        checks.environmentVariables = true;
    }
} catch (error) {
    console.log('   ❌ Error checking environment variables:', error.message);
    allPassed = false;
}

// 2. Check for hardcoded secrets
console.log('\n2. 🔍 Checking for Hardcoded Secrets...');
try {
    const filesToCheck = [
        'public/js/supabase.js',
        'public/js/config.js',
        'server.js',
        'public/app.html'
    ];

    let secretsFound = false;
    const secretPatterns = [
        /SUPABASE_ANON_KEY.*=.*["'][^"']*["']/,
        /API_KEY.*=.*["'][^"']*["']/,
        /SECRET.*=.*["'][^"']*["']/,
        /PASSWORD.*=.*["'][^"']*["']/,
        /TOKEN.*=.*["'][^"']*["']/,
        /eyJ[A-Za-z0-9-_]+\.eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+/, // JWT pattern
        /sk-[a-zA-Z0-9]{48}/ // OpenAI API key pattern
    ];

    filesToCheck.forEach(file => {
        const filePath = path.join(__dirname, file);
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf8');
            secretPatterns.forEach(pattern => {
                if (pattern.test(content)) {
                    console.log(`   ❌ Potential secret found in ${file}`);
                    secretsFound = true;
                }
            });
        }
    });

    if (!secretsFound) {
        console.log('   ✅ No hardcoded secrets detected');
        checks.hardcodedSecrets = true;
    } else {
        allPassed = false;
    }
} catch (error) {
    console.log('   ❌ Error checking for secrets:', error.message);
    allPassed = false;
}

// 3. Check .gitignore status
console.log('\n3. 🔍 Checking .gitignore Configuration...');
try {
    const gitignorePath = path.join(__dirname, '.gitignore');
    if (fs.existsSync(gitignorePath)) {
        const gitignore = fs.readFileSync(gitignorePath, 'utf8');
        const requiredIgnores = ['.env', 'node_modules', '*.log', 'logs/'];

        let gitignoreComplete = true;
        requiredIgnores.forEach(ignore => {
            if (!gitignore.includes(ignore)) {
                console.log(`   ❌ Missing .gitignore entry: ${ignore}`);
                gitignoreComplete = false;
            }
        });

        if (gitignoreComplete) {
            console.log('   ✅ .gitignore properly configured');
            checks.gitIgnoreStatus = true;
        } else {
            allPassed = false;
        }
    } else {
        console.log('   ❌ .gitignore file not found');
        allPassed = false;
    }
} catch (error) {
    console.log('   ❌ Error checking .gitignore:', error.message);
    allPassed = false;
}

// 4. Check production configuration
console.log('\n4. 🔍 Checking Production Configuration...');
try {
    const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));

    if (packageJson.scripts && packageJson.scripts.start) {
        console.log('   ✅ Production start script configured');
    } else {
        console.log('   ⚠️ No production start script found');
    }

    // Check for required dependencies
    const requiredDeps = ['express', 'cors', 'helmet', 'dotenv'];
    const allDeps = { ...packageJson.dependencies, ...packageJson.devDependencies };
    let depsOk = true;

    requiredDeps.forEach(dep => {
        if (!allDeps[dep]) {
            console.log(`   ❌ Missing required dependency: ${dep}`);
            depsOk = false;
        }
    });

    if (depsOk) {
        console.log('   ✅ Required dependencies present');
        checks.productionConfig = true;
    } else {
        allPassed = false;
    }
} catch (error) {
    console.log('   ❌ Error checking production config:', error.message);
    allPassed = false;
}

// 5. Validate API configuration
console.log('\n5. 🔍 Validating API Configuration...');
try {
    const supabaseJs = fs.readFileSync(path.join(__dirname, 'public/js/supabase.js'), 'utf8');

    if (supabaseJs.includes('window.ENV?.SUPABASE_ANON_KEY') &&
        supabaseJs.includes('throw new Error')) {
        console.log('   ✅ Secure API key configuration');
        checks.apiKeysValidation = true;
    } else {
        console.log('   ❌ API key configuration may not be secure');
        allPassed = false;
    }
} catch (error) {
    console.log('   ❌ Error validating API config:', error.message);
    allPassed = false;
}

// Summary
console.log('\n' + '='.repeat(50));
console.log('📋 DEPLOYMENT SECURITY CHECKLIST SUMMARY');
console.log('='.repeat(50));

const checkResults = Object.entries(checks).map(([check, passed]) => {
    const status = passed ? '✅' : '❌';
    const name = check.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
    return `${status} ${name}`;
});

checkResults.forEach(result => console.log(result));

console.log('\n' + '='.repeat(50));

if (allPassed) {
    console.log('🎉 ALL SECURITY CHECKS PASSED!');
    console.log('✅ Your application appears safe for deployment');
    console.log('\n📝 Next Steps:');
    console.log('   1. Set environment variables on your deployment platform');
    console.log('   2. Test the application in your deployment environment');
    console.log('   3. Monitor logs for any security-related issues');
} else {
    console.log('⚠️ SOME SECURITY CHECKS FAILED!');
    console.log('❌ Please address the issues above before deploying');
    console.log('\n🔧 Common Fixes:');
    console.log('   • Remove any hardcoded API keys or secrets');
    console.log('   • Ensure .env files are not committed to git');
    console.log('   • Set environment variables in your deployment platform');
    console.log('   • Update .gitignore to exclude sensitive files');
}

console.log('\n🔗 Useful Commands:');
console.log('   • View environment variables: node -e "console.log(process.env)"');
console.log('   • Test API endpoints: curl https://your-domain.com/api/config/health');
console.log('   • Check git status: git status --ignored');

process.exit(allPassed ? 0 : 1);
