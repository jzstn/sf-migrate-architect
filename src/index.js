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
    .version('1.0.0');

program
    .command('plan')
    .description('Generate a migration sequence for given objects')
    .action(async () => {
        console.log(chalk.blue.bold('\n🚀 Salesforce Migration Planner\n'));

        // 0. Login Mode Selection
        const { loginMode } = await inquirer.prompt([
            {
                type: 'list',
                name: 'loginMode',
                message: 'How would you like to login?',
                choices: [
                    { name: '🌐 Seamless Browser Login (Modern / SSO / MFA)', value: 'browser' },
                    { name: '⌨️  Classic Terminal Login (Username/Password + Token)', value: 'classic' }
                ]
            }
        ]);

        const { loginUrlPref } = await inquirer.prompt([
            { type: 'list', name: 'loginUrlPref', message: 'Instance Type:', choices: ['https://login.salesforce.com', 'https://test.salesforce.com'] }
        ]);

        if (loginMode === 'browser') {
            const { clientId, clientSecret } = await inquirer.prompt([
                {
                    type: 'input',
                    name: 'clientId',
                    message: 'Enter Salesforce Connected App Client ID:',
                    default: process.env.SF_CLIENT_ID,
                    validate: (input) => input.trim() ? true : 'Client ID is required.'
                },
                {
                    type: 'password',
                    name: 'clientSecret',
                    message: 'Enter Client Secret (Leave blank if not required):',
                    default: process.env.SF_CLIENT_SECRET
                }
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
                {
                    type: 'input',
                    name: 'username',
                    message: 'Enter Salesforce Username:',
                    validate: (input) => input.trim() ? true : 'Username is required.'
                },
                {
                    type: 'password',
                    name: 'password',
                    message: 'Enter Salesforce Password + Security Token:',
                    validate: (input) => input.trim() ? true : 'Password is required.'
                }
            ]);

            const spinnerAuth = ora('Logging in to Salesforce...').start();
            try {
                await sfAuth.login(credentials.username, credentials.password, loginUrlPref);
                spinnerAuth.succeed('Login successful!');
            } catch (err) {
                spinnerAuth.fail('Login failed: ' + err.message);
                process.exit(1);
            }
        }

        // 2. Object Selection
        const { objectsInput } = await inquirer.prompt([
            {
                type: 'input',
                name: 'objectsInput',
                message: 'Enter objects to migrate (comma separated, e.g. Account,Opportunity):',
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

            // 3. Report Generation
            const saveReport = await inquirer.prompt([
                { type: 'confirm', name: 'confirmed', message: 'Would you like to generate the Executive Markdown report?', default: true }
            ]);

            if (saveReport.confirmed) {
                const reportMd = reportGenerator.generate(sequence, resolver);
                const fileName = `migration-plan-${Date.now()}.md`;
                const filePath = path.join(process.cwd(), fileName);

                await fs.writeFile(filePath, reportMd);
                console.log(chalk.cyan.bold(`\n📝 Executive Report saved to: ${fileName}`));
                console.log(chalk.gray('Use this file in a Markdown viewer or provide it to your AI agent for further analysis.'));
            }

        } catch (err) {
            analyzeSpinner.fail('Analysis failed: ' + err.message);
            console.error(err);
        }
    });

program
    .command('inspect')
    .description('Dive deep into an object to find mandatory fields and external IDs')
    .argument('<object>', 'Salesforce Object API Name (e.g. Account)')
    .action(async (object) => {
        console.log(chalk.blue.bold(`\n🔍 Inspecting Salesforce Object: ${object}\n`));

        // 0. Login Selection
        const { loginMode } = await inquirer.prompt([
            {
                type: 'list',
                name: 'loginMode',
                message: 'How would you like to login?',
                choices: [
                    { name: '🌐 Seamless Browser Login (Modern / SSO / MFA)', value: 'browser' },
                    { name: '⌨️  Classic Terminal Login (Username/Password + Token)', value: 'classic' }
                ]
            }
        ]);

        const { loginUrlPref } = await inquirer.prompt([
            { type: 'list', name: 'loginUrlPref', message: 'Instance Type:', choices: ['https://login.salesforce.com', 'https://test.salesforce.com'] }
        ]);

        if (loginMode === 'browser') {
            const { clientId, clientSecret } = await inquirer.prompt([
                {
                    type: 'input',
                    name: 'clientId',
                    message: 'Enter Salesforce Connected App Client ID:',
                    default: process.env.SF_CLIENT_ID,
                    validate: (input) => input.trim() ? true : 'Client ID is required.'
                },
                {
                    type: 'password',
                    name: 'clientSecret',
                    message: 'Enter Client Secret (Leave blank if not required):',
                    default: process.env.SF_CLIENT_SECRET
                }
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
                {
                    type: 'input',
                    name: 'username',
                    message: 'Enter Salesforce Username:',
                    validate: (input) => input.trim() ? true : 'Username is required.'
                },
                {
                    type: 'password',
                    name: 'password',
                    message: 'Enter Salesforce Password + Security Token:',
                    validate: (input) => input.trim() ? true : 'Password is required.'
                }
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

        const spinner = ora('Fetching Object Metadata...').start();
        try {
            const resolver = new DependencyResolver();
            const analysis = await resolver.inspectObject(object);
            spinner.succeed('Analysis complete!');

            console.log(chalk.white.bgBlue(`\n--- ${analysis.label} [${analysis.name}] ---`));
            console.log(chalk.gray(`Total Fields: ${analysis.totalFields}`));

            console.log(chalk.yellow.bold('\n⚠️  Mandatory Fields (Required for Migration):'));
            analysis.mandatoryFields.forEach(f => {
                console.log(`- ${f.name} (${f.type}) - ${f.label}`);
            });

            if (analysis.externalIds.length > 0) {
                console.log(chalk.green.bold('\n🆔 External ID Fields (Best for UPSERT/Matching):'));
                analysis.externalIds.forEach(f => {
                    console.log(`- ${f.name} (${f.type})`);
                });
            } else {
                console.log(chalk.red('\n🚫 No External IDs found. Suggest creating one for data exchange.'));
            }

            console.log(chalk.cyan.bold('\n🔗 Relationships (Parents):'));
            analysis.references.forEach(f => {
                const referencedTo = Array.isArray(f.referenceTo) ? f.referenceTo.join(', ') : f.referenceTo;
                console.log(`- ${f.name} (Points to: ${referencedTo})`);
            });

        } catch (err) {
            spinner.fail('Inspection failed: ' + err.message);
        }
    });

program
    .command('bundle')
    .description('Analyze and generate a single copy-paste block for AI')
    .action(async () => {
        console.log(chalk.blue.bold('\n🚀 Salesforce Migration Bundle (AI-Ready)\n'));

        // 0. Login Selection
        const { loginMode } = await inquirer.prompt([
            {
                type: 'list',
                name: 'loginMode',
                message: 'How would you like to login?',
                choices: [
                    { name: '🌐 Seamless Browser Login (Modern / SSO / MFA)', value: 'browser' },
                    { name: '⌨️  Classic Terminal Login (Username/Password + Token)', value: 'classic' }
                ]
            }
        ]);

        const { loginUrlPref } = await inquirer.prompt([
            { type: 'list', name: 'loginUrlPref', message: 'Instance Type:', choices: ['https://login.salesforce.com', 'https://test.salesforce.com'] }
        ]);

        if (loginMode === 'browser') {
            const { clientId, clientSecret } = await inquirer.prompt([
                {
                    type: 'input',
                    name: 'clientId',
                    message: 'Enter Salesforce Connected App Client ID:',
                    default: process.env.SF_CLIENT_ID,
                    validate: (input) => input.trim() ? true : 'Client ID is required.'
                },
                {
                    type: 'password',
                    name: 'clientSecret',
                    message: 'Enter Client Secret (Leave blank if not required):',
                    default: process.env.SF_CLIENT_SECRET
                }
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
                {
                    type: 'input',
                    name: 'username',
                    message: 'Enter Salesforce Username:',
                    validate: (input) => input.trim() ? true : 'Username is required.'
                },
                {
                    type: 'password',
                    name: 'password',
                    message: 'Enter Salesforce Password + Security Token:',
                    validate: (input) => input.trim() ? true : 'Password is required.'
                }
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

        const spinner = ora('Analyzing Metadata...').start();
        try {
            const { objectsInput } = await inquirer.prompt([
                { type: 'input', name: 'objectsInput', message: 'Enter objects (comma separated):' }
            ]);

            const targetObjects = objectsInput.split(',').map(s => s.trim());
            const resolver = new DependencyResolver();
            await resolver.fetchMetadata(targetObjects);
            const sequence = resolver.calculateSequence();

            spinner.succeed('Analysis complete!');

            const aiBundle = reportGenerator.generateAIReadyBundle(sequence, resolver);
            console.log('\n--- START COPY ---');
            console.log(aiBundle);
            console.log('--- END COPY ---\n');
            console.log(chalk.green('Successfully bundled. Copy the text above into ChatGPT/Claude.'));

        } catch (err) {
            spinner.fail('Bundle failed: ' + err.message);
        }
    });

program
    .command('demo')
    .description('Show sample results for non-mature teams (no Salesforce login required)')
    .action(async () => {
        console.log(chalk.magenta.bold('\n✨ Salesforce Migration Architect - DEMO MODE ✨\n'));

        const resolver = new DependencyResolver();

        // 1. Mock Metadata for Account
        const mockAccountMetadata = {
            name: 'Account',
            label: 'Account',
            totalFields: 54,
            mandatoryFields: [
                { name: 'Name', type: 'string', label: 'Account Name' }
            ],
            externalIds: [
                { name: 'AccountNumber', type: 'string' },
                { name: 'Oracle_ID__c', type: 'string' }
            ],
            references: [
                { name: 'OwnerId', referenceTo: ['User'] },
                { name: 'ParentId', referenceTo: ['Account'] }
            ]
        };

        // 2. Mock Metadata for Dependency Calculation
        resolver.dependencies = {
            'User': [],
            'Account': ['User'],
            'Contact': ['Account'],
            'Opportunity': ['Account']
        };
        resolver.objectMetadata = {
            'User': { label: 'User', custom: false },
            'Account': { label: 'Account', custom: false },
            'Contact': { label: 'Contact', custom: false },
            'Opportunity': { label: 'Opportunity', custom: false }
        };

        console.log(chalk.blue.bold('🔍 STEP 1: Deep Object Inspection (Sample: Account)'));
        console.log(chalk.white.bgBlue(`\n--- ${mockAccountMetadata.label} [${mockAccountMetadata.name}] ---`));
        console.log(chalk.yellow.bold('\n⚠️  Mandatory Fields:'));
        mockAccountMetadata.mandatoryFields.forEach(f => console.log(`- ${f.name} (${f.type}) - ${f.label}`));
        console.log(chalk.green.bold('\n🆔 External ID Fields:'));
        mockAccountMetadata.externalIds.forEach(f => console.log(`- ${f.name} (${f.type})`));
        console.log(chalk.cyan.bold('\n🔗 Relationships:'));
        mockAccountMetadata.references.forEach(f => console.log(`- ${f.name} (Points to: ${f.referenceTo.join(', ')})`));

        console.log(chalk.blue.bold('\n🛣️  STEP 2: Sequence Identification (Sample Flow)'));
        const sequence = resolver.calculateSequence();
        console.log(chalk.green('✅ Calculated Loading Order:'));
        sequence.forEach((obj, idx) => console.log(`${idx + 1}. ${obj}`));

        console.log(chalk.blue.bold('\n📝 STEP 3: Executive Reporting'));
        const reportMd = reportGenerator.generate(sequence, resolver);
        const fileName = 'sample-migration-plan.md';
        const filePath = path.join(process.cwd(), fileName);

        await fs.writeFile(filePath, reportMd);
        console.log(chalk.cyan.bold(`\n📝 Executive Report saved to: ${fileName}`));

        console.log(chalk.white.bgMagenta('\n🚀 AI ARCHITECT READY: Copy the block below to ChatGPT/Claude! \n'));
        const aiPrompt = reportGenerator.generateAIReadyBundle(sequence, resolver);
        console.log(aiPrompt);
    });

program
    .command('ui')
    .description('Launch the beautiful Mission Control web dashboard')
    .action(() => {
        startServer();
    });

program.parse(process.argv);
