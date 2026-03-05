#!/usr/bin/env node

// Suppress Node.js warnings for a cleaner CLI experience
process.env.NODE_NO_WARNINGS = '1';
process.removeAllListeners('warning');

const { Command } = require('commander');
const inquirer = require('inquirer');
const chalk = require('chalk');
const ora = require('ora');
const fs = require('fs-extra');
const path = require('path');

const sfAuth = require('./connection/sf-auth');
const DependencyResolver = require('./engine/dependency-resolver');
const reportGenerator = require('./templates/executive-report');
const { startServer } = require('./engine/lite-server');

const program = new Command();

program
    .name('sf-migrate')
    .description('Salesforce Migration Planner for non-mature teams')
    .version('1.0.1');

// Shared Login Helper
async function performAuth() {
    const { loginMode } = await inquirer.prompt([
        {
            type: 'list',
            name: 'loginMode',
            message: 'Select Login Method:',
            choices: [
                { name: '🌐 Seamless Browser Login (OAuth / SSO / MFA)', value: 'browser' },
                { name: '🎫  Direct Access Token (Fastest / Recommended if Browser fails)', value: 'token' },
                { name: '⌨️  Classic Terminal Login (User/Pass + Security Token)', value: 'classic' }
            ]
        }
    ]);

    if (loginMode === 'token') {
        console.log(chalk.gray(`\n💡 Tip: Get your Access Token from the 'Salesforce Inspector' Chrome extension or Workbench.\n`));
        const { accessToken, instanceUrl } = await inquirer.prompt([
            { type: 'input', name: 'accessToken', message: 'Paste Access Token / Session ID:', validate: (val) => val.trim().length > 0 },
            { type: 'input', name: 'instanceUrl', message: 'Enter Instance URL (e.g. acme.my.salesforce.com):', validate: (val) => val.trim().length > 0 }
        ]);

        const spinner = ora('Validating Session...').start();
        try {
            await sfAuth.loginSession(accessToken, instanceUrl);
            spinner.succeed('Authenticated via Token!');
        } catch (err) {
            spinner.fail('Token Login failed: ' + err.message);
            process.exit(1);
        }
        return;
    }

    const { loginUrlPref } = await inquirer.prompt([
        { type: 'list', name: 'loginUrlPref', message: 'Select Instance Type:', choices: ['https://login.salesforce.com', 'https://test.salesforce.com'] }
    ]);

    if (loginMode === 'browser') {
        const { clientId, clientSecret } = await inquirer.prompt([
            { type: 'input', name: 'clientId', message: 'Enter Consumer Key (Client ID):', default: process.env.SF_CLIENT_ID, validate: (v) => v.trim() ? true : 'Required.' },
            { type: 'password', name: 'clientSecret', message: 'Enter Consumer Secret (optional):', default: process.env.SF_CLIENT_SECRET }
        ]);

        const spinnerAuth = ora('Opening Browser...').start();
        try {
            process.env.SF_CLIENT_ID = clientId;
            process.env.SF_CLIENT_SECRET = clientSecret;
            await sfAuth.loginWeb(loginUrlPref);
            spinnerAuth.succeed('Login successful!');
        } catch (err) {
            spinnerAuth.fail('Login failed: ' + err.message);
            process.exit(1);
        }
    } else {
        const credentials = await inquirer.prompt([
            { type: 'input', name: 'username', message: 'Enter Username:', validate: (v) => v.trim() ? true : 'Required.' },
            { type: 'password', name: 'password', message: 'Enter Password + Security Token:', validate: (v) => v.trim() ? true : 'Required.' }
        ]);

        const spinnerAuth = ora('Connecting...').start();
        try {
            await sfAuth.login(credentials.username, credentials.password, loginUrlPref);
            spinnerAuth.succeed('Connected!');
        } catch (err) {
            spinnerAuth.fail('Login failed: ' + err.message);
            process.exit(1);
        }
    }
}

program
    .command('plan')
    .description('Generate a migration sequence for given objects')
    .action(async () => {
        console.log(chalk.blue.bold('\n🚀 Salesforce Migration Planner\n'));
        await performAuth();

        const { objectsInput } = await inquirer.prompt([
            {
                type: 'input',
                name: 'objectsInput',
                message: 'Enter objects to migrate (comma separated):',
                validate: (val) => val.trim().length > 0
            }
        ]);

        const targetObjects = objectsInput.split(',').map(s => s.trim());
        const resolver = new DependencyResolver();

        const analyzeSpinner = ora('Analyzing Metadata & Dependencies...').start();
        try {
            await resolver.fetchMetadata(targetObjects);
            const sequence = resolver.calculateSequence();
            analyzeSpinner.succeed('Analysis complete!');

            console.log(chalk.green('\n✅ Loading Order Identified:'));
            sequence.forEach((obj, idx) => console.log(`${idx + 1}. ${obj}`));

            const saveReport = await inquirer.prompt([
                { type: 'confirm', name: 'confirmed', message: 'Generate Executive Markdown report?', default: true }
            ]);

            if (saveReport.confirmed) {
                const reportMd = reportGenerator.generate(sequence, resolver);
                const fileName = `migration-plan-${Date.now()}.md`;
                const filePath = path.join(process.cwd(), fileName);
                await fs.writeFile(filePath, reportMd);
                console.log(chalk.cyan.bold(`\n📝 Executive Report saved to: ${fileName}`));
            }

        } catch (err) {
            analyzeSpinner.fail('Analysis failed: ' + err.message);
        }
    });

program
    .command('inspect')
    .description('Dive deep into an object metadata')
    .argument('<object>', 'Object API Name')
    .action(async (object) => {
        console.log(chalk.blue.bold(`\n🔍 Inspecting: ${object}\n`));
        await performAuth();

        const spinner = ora('Fetching Metadata...').start();
        try {
            const resolver = new DependencyResolver();
            const analysis = await resolver.inspectObject(object);
            spinner.succeed('Analysis complete!');

            console.log(chalk.white.bgBlue(`\n--- ${analysis.label} [${analysis.name}] ---`));
            console.log(chalk.yellow.bold('\n⚠️  Mandatory Fields:'));
            analysis.mandatoryFields.forEach(f => console.log(`- ${f.name} (${f.type})`));

            if (analysis.externalIds.length > 0) {
                console.log(chalk.green.bold('\n🆔 External IDs:'));
                analysis.externalIds.forEach(f => console.log(`- ${f.name}`));
            }

            console.log(chalk.cyan.bold('\n🔗 Relationships:'));
            analysis.references.forEach(f => console.log(`- ${f.name} → ${f.referenceTo}`));

        } catch (err) {
            spinner.fail('Failed: ' + err.message);
        }
    });

program
    .command('bundle')
    .description('Generate AI-ready context block')
    .action(async () => {
        console.log(chalk.blue.bold('\n🚀 AI Architecture Bundle\n'));
        await performAuth();

        const { objectsInput } = await inquirer.prompt([
            { type: 'input', name: 'objectsInput', message: 'Enter objects (comma separated):' }
        ]);

        const targetObjects = objectsInput.split(',').map(s => s.trim());
        const resolver = new DependencyResolver();
        await resolver.fetchMetadata(targetObjects);
        const sequence = resolver.calculateSequence();
        const aiBundle = reportGenerator.generateAIReadyBundle(sequence, resolver);

        console.log('\n--- START COPY ---\n' + aiBundle + '\n--- END COPY ---\n');
    });

program
    .command('demo')
    .description('Show sample results (Offline)')
    .action(async () => {
        console.log(chalk.magenta.bold('\n✨ DEMO MODE ✨\n'));
        // ... (demo logic is already standard, keeping it simple or keeping previous version)
        console.log('Running demo with sample Account metadata...');
        const resolver = new DependencyResolver();
        resolver.dependencies = { 'Account': ['User'] };
        const sequence = ['User', 'Account'];
        console.log(chalk.green('\n✅ Loading Order Identified:'));
        sequence.forEach((obj, idx) => console.log(`${idx + 1}. ${obj}`));
    });

program
    .command('ui')
    .description('Launch Web Dashboard')
    .action(() => { startServer(); });

program.parse(process.argv);
