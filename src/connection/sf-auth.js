require('dotenv').config();
const jsforce = require('jsforce');
const express = require('express');
const { exec } = require('child_process');
const chalk = require('chalk');
const inquirer = require('inquirer');

class SalesforceAuth {
    constructor() {
        this.conn = null;
        this.oauth2 = null;
    }

    async login(username, password, loginUrl = 'https://login.salesforce.com') {
        const url = loginUrl || 'https://login.salesforce.com';
        this.conn = new jsforce.Connection({ loginUrl: url });

        return new Promise((resolve, reject) => {
            this.conn.login(username, password, (err) => {
                if (err) return reject(err);
                resolve(this.conn);
            });
        });
    }

    async loginSession(accessToken, instanceUrl) {
        if (!accessToken || !instanceUrl) {
            throw new Error('Access Token and Instance URL are required.');
        }

        // Clean the URL
        let instUrl = instanceUrl.trim().replace(/\/$/, ''); // Remove trailing slash
        if (!instUrl.startsWith('http')) instUrl = `https://${instUrl}`;

        console.log(chalk.gray(`\n🛠️  Debugging Session...`));
        console.log(chalk.gray(`Instance: ${instUrl}`));
        console.log(chalk.gray(`Token: ${accessToken.substring(0, 10)}...`));

        this.conn = new jsforce.Connection({
            instanceUrl: instUrl,
            accessToken: accessToken.trim()
        });

        // Test with a simple metadata call instead of identity()
        try {
            await this.conn.describeGlobal();
            return this.conn;
        } catch (err) {
            console.log(chalk.red(`\n❌ Session Validation Failed: ${err.message}`));
            throw err;
        }
    }

    async loginWeb(loginUrl = 'https://login.salesforce.com') {
        const PORT = 3001;
        const REDIRECT_URI = `http://localhost:${PORT}/oauth2/callback`;

        let clientId = (process.env.SF_CLIENT_ID || '').trim().replace(/[\r\n\t\s]/g, '');
        let clientSecret = (process.env.SF_CLIENT_SECRET || '').trim().replace(/[\r\n\t\s]/g, '');

        this.oauth2 = new jsforce.OAuth2({
            loginUrl,
            clientId,
            clientSecret: clientSecret || undefined,
            redirectUri: REDIRECT_URI
        });

        return new Promise((resolve, reject) => {
            const app = express();
            let server;

            app.get('/oauth2/callback', async (req, res) => {
                const conn = new jsforce.Connection({ oauth2: this.oauth2 });
                const code = req.query.code;
                try {
                    await conn.authorize(code);
                    this.conn = conn;
                    res.send('<h1>✅ Auth Successful!</h1><p>Check your terminal.</p>');
                    setTimeout(() => { server.close(); resolve(this.conn); }, 500);
                } catch (err) {
                    res.status(500).send(`Error: ${err.message}`);
                    server.close();
                    reject(err);
                }
            });

            server = app.listen(PORT, (err) => {
                if (err) return reject(err);
                const authUrl = this.oauth2.getAuthorizationUrl({ scope: 'api web refresh_token', prompt: 'login' });
                console.log(chalk.cyan(`\n🔗 Open this link in your browser:`));
                console.log(chalk.blue.underline(authUrl));
                exec(`open "${authUrl.replace(/"/g, '\\"')}"`);
            });

            setTimeout(async () => {
                if (server.listening) {
                    console.log(chalk.yellow(`\n🕒 Redirect taking too long...`));
                    const { manualCode } = await inquirer.prompt([{
                        type: 'input',
                        name: 'manualCode',
                        message: 'Paste the "code" from the browser URL (or hit Enter to cancel):'
                    }]);
                    if (manualCode && manualCode.trim()) {
                        try {
                            const conn = new jsforce.Connection({ oauth2: this.oauth2 });
                            await conn.authorize(manualCode.trim());
                            this.conn = conn;
                            console.log(chalk.green('✅ Connected!'));
                            server.close();
                            resolve(this.conn);
                        } catch (e) { console.log(chalk.red(`Failed: ${e.message}`)); }
                    }
                }
            }, 60000);
        });
    }

    getConnection() { return this.conn; }
}

module.exports = new SalesforceAuth();
