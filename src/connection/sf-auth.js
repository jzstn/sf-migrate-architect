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
        const user = username || process.env.SF_USERNAME;
        const pass = password || process.env.SF_PASSWORD;
        const url = loginUrl || process.env.SF_LOGIN_URL || 'https://login.salesforce.com';

        if (!user || !pass) {
            throw new Error('Missing Salesforce credentials.');
        }

        this.conn = new jsforce.Connection({ loginUrl: url });
        return new Promise((resolve, reject) => {
            this.conn.login(user, pass, (err) => {
                if (err) return reject(err);
                resolve(this.conn);
            });
        });
    }

    async loginWeb(loginUrl = 'https://login.salesforce.com') {
        // Switch to 127.0.0.1 for maximum stability with Salesforce redirects
        const PORT = 3001;
        const REDIRECT_URI = `http://127.0.0.1:${PORT}/oauth2/callback`;

        let clientId = (process.env.SF_CLIENT_ID || '').trim().replace(/[\r\n\t\s]/g, '');
        let clientSecret = (process.env.SF_CLIENT_SECRET || '').trim().replace(/[\r\n\t\s]/g, '');

        console.log(chalk.gray(`\n🛠️  Redirect URI must be: ${REDIRECT_URI}`));
        console.log(chalk.yellow(`(Update your Salesforce Connected App if it still says 'localhost')\n`));

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
                    res.send('<h1>✅ Auth Successful!</h1><p>You can close this tab and return to the terminal.</p>');
                    setTimeout(() => { server.close(); resolve(this.conn); }, 1000);
                } catch (err) {
                    res.status(500).send(`Error: ${err.message}`);
                    server.close();
                    reject(err);
                }
            });

            server = app.listen(PORT, (err) => {
                if (err) return reject(new Error(`Port ${PORT} is busy.`));

                const authUrl = this.oauth2.getAuthorizationUrl({ scope: 'api web refresh_token', prompt: 'login' });
                console.log(chalk.cyan(`🔗 Secure Link:`) + ` ${authUrl}`);

                // Mac 'open' fix
                exec(`open "${authUrl.replace(/"/g, '\\"')}"`);

                console.log(chalk.white.dim(`\nWaiting for browser... (Or press Ctrl+C to abort)`));

                console.log(chalk.magenta(`\n💡 Pro-Tip: If you see 'Redirect URI Mismatch' in the browser:`));
                console.log(`1. Copy the 'code' from the browser URL.`);
                console.log(`2. I will prompt you for it if the automatic redirect fails.\n`);
            });

            // Fallback: If no redirect in 2 mins, ask for code manually
            setTimeout(async () => {
                if (server.listening) {
                    console.log(chalk.yellow(`\n🕒 Automatic redirect taking too long...`));
                    const { manualCode } = await inquirer.prompt([{
                        type: 'input',
                        name: 'manualCode',
                        message: 'Paste the authorization "code" from the browser URL (or hit Enter to keep waiting):'
                    }]);

                    if (manualCode) {
                        try {
                            const conn = new jsforce.Connection({ oauth2: this.oauth2 });
                            await conn.authorize(manualCode);
                            this.conn = conn;
                            console.log(chalk.green('✅ Manual Handshake Successful!'));
                            server.close();
                            resolve(this.conn);
                        } catch (e) {
                            console.log(chalk.red(`Failed to authorize with manual code: ${e.message}`));
                        }
                    }
                }
            }, 45000);
        });
    }

    getConnection() { return this.conn; }
}

module.exports = new SalesforceAuth();
