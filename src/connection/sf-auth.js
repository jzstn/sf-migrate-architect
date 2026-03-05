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
            throw new Error('Missing Salesforce credentials. Provide them via CLI or .env file.');
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
        const PORT = 3001;
        // Salesforce ONLY allows http for 'localhost'. 127.0.0.1 is often blocked.
        const REDIRECT_URI = `http://localhost:${PORT}/oauth2/callback`;

        let clientId = (process.env.SF_CLIENT_ID || '').trim().replace(/[\r\n\t\s]/g, '');
        let clientSecret = (process.env.SF_CLIENT_SECRET || '').trim().replace(/[\r\n\t\s]/g, '');

        console.log(chalk.gray(`\n🛠️  Target Redirect URI: ${REDIRECT_URI}`));
        console.log(chalk.yellow(`(Ensure this matches EXACTLY in Salesforce Setup → Connected App)\n`));

        this.oauth2 = new jsforce.OAuth2({
            loginUrl,
            clientId,
            clientSecret: clientSecret || undefined,
            redirectUri: REDIRECT_URI
        });

        return new Promise((resolve, reject) => {
            const app = express();
            let server;

            // Handle the OAuth callback
            app.get('/oauth2/callback', async (req, res) => {
                const conn = new jsforce.Connection({ oauth2: this.oauth2 });
                const code = req.query.code;

                try {
                    await conn.authorize(code);
                    this.conn = conn;
                    res.send(`
                        <div style="font-family: sans-serif; text-align: center; padding: 50px; background: #f4f7f9; min-height: 100vh;">
                            <div style="background: white; padding: 30px; border-radius: 8px; display: inline-block; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                                <h1 style="color: #2e7d32;">✅ Success!</h1>
                                <p>Salesforce Architecture CLI is now authenticated.</p>
                                <p style="color: #666;"><strong>Close this tab and check your terminal.</strong></p>
                            </div>
                        </div>
                    `);

                    setTimeout(() => {
                        server.close();
                        resolve(this.conn);
                    }, 500);
                } catch (err) {
                    res.status(500).send(`Authentication Error: ${err.message}`);
                    server.close();
                    reject(err);
                }
            });

            // Start the local server
            server = app.listen(PORT, (err) => {
                if (err) {
                    if (err.code === 'EADDRINUSE') {
                        return reject(new Error(`Port ${PORT} is busy. Run "kill -9 $(lsof -t -i:${PORT})" to free it.`));
                    }
                    return reject(err);
                }

                const authUrl = this.oauth2.getAuthorizationUrl({
                    scope: 'api web refresh_token',
                    prompt: 'login'
                });

                console.log(chalk.cyan(`\n🌐 Authentication Link Generated:`));
                console.log(chalk.blue.underline(authUrl));
                console.log(chalk.gray(`\nOpening your default browser...`));

                // macOS Native 'open' command
                exec(`open "${authUrl.replace(/"/g, '\\"')}"`);

                console.log(chalk.magenta(`\n💡 IF REDIRECT FAILS:`));
                console.log(`Copy the 'code' from the browser address bar (after code=) and paste it below if prompted.\n`);
            });

            // Provide a manual input fallback if it takes too long
            setTimeout(async () => {
                if (server.listening) {
                    console.log(chalk.yellow(`\n🕒 Still waiting for the browser to finish...`));
                    const { manualCode } = await inquirer.prompt([{
                        type: 'input',
                        name: 'manualCode',
                        message: 'Paste the authorization "code" from the browser URL (or hit Enter to cancel):'
                    }]);

                    if (manualCode && manualCode.trim()) {
                        try {
                            const conn = new jsforce.Connection({ oauth2: this.oauth2 });
                            await conn.authorize(manualCode.trim());
                            this.conn = conn;
                            console.log(chalk.green('✅ Manual Link Successful!'));
                            server.close();
                            resolve(this.conn);
                        } catch (e) {
                            console.log(chalk.red(`\nManual Code failed: ${e.message}`));
                        }
                    }
                }
            }, 60000);

            // Hard timeout after 10 minutes
            setTimeout(() => {
                if (server.listening) {
                    server.close();
                    reject(new Error('Authentication timed out.'));
                }
            }, 600000);
        });
    }

    getConnection() {
        return this.conn;
    }
}

module.exports = new SalesforceAuth();
