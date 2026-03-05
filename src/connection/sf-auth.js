require('dotenv').config();
const jsforce = require('jsforce');
const express = require('express');
const path = require('path');
const { exec } = require('child_process');
const chalk = require('chalk');

class SalesforceAuth {
    constructor() {
        this.conn = null;
        this.oauth2 = null;
    }

    // Standard Login (Classic Terminal)
    async login(username, password, loginUrl = 'https://login.salesforce.com') {
        const user = username || process.env.SF_USERNAME;
        const pass = password || process.env.SF_PASSWORD;
        const url = loginUrl || process.env.SF_LOGIN_URL || 'https://login.salesforce.com';

        if (!user || !pass) {
            throw new Error('Missing Salesforce credentials. Provide them via CLI or .env file.');
        }

        this.conn = new jsforce.Connection({ loginUrl: url });

        return new Promise((resolve, reject) => {
            this.conn.login(user, pass, (err, userInfo) => {
                if (err) return reject(err);
                resolve(this.conn);
            });
        });
    }

    // Web-Based OAuth Login (Modern Browser Flow)
    async loginWeb(loginUrl = 'https://login.salesforce.com') {
        const PORT = 3001;
        const REDIRECT_URI = `http://localhost:${PORT}/oauth2/callback`;

        // Final Clean for the Client ID
        let clientId = (process.env.SF_CLIENT_ID || '').trim().replace(/[\r\n\t]/g, '');

        if (!clientId) {
            throw new Error('No Client ID provided.');
        }

        // Verification for the user
        const maskedId = `${clientId.substring(0, 4)}...${clientId.substring(clientId.length - 4)}`;
        console.log(chalk.gray(`\n🛠️  Using Client ID: ${maskedId}`));

        this.oauth2 = new jsforce.OAuth2({
            loginUrl: loginUrl,
            clientId: clientId,
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

            server = app.listen(PORT, (err) => {
                if (err) return reject(err);

                const authUrl = this.oauth2.getAuthorizationUrl({
                    scope: 'api web refresh_token',
                    prompt: 'login'
                });

                console.log(chalk.cyan(`\n🌐 Authentication Link Generated:`));
                console.log(chalk.blue.underline(authUrl));
                console.log(chalk.gray(`\nAttempting to open your default browser...`));

                // Platforms-Specific Launch
                const platform = process.platform;
                let openCmd;

                if (platform === 'darwin') {
                    openCmd = `open "${authUrl}"`; // Mac doesn't need escapes for simple browser opens
                } else if (platform === 'win32') {
                    openCmd = `start "" "${authUrl.replace(/&/g, '^&')}"`; // Windows shell needs escapes
                } else {
                    openCmd = `xdg-open "${authUrl}"`;
                }

                exec(openCmd);
            });

            // Increased timeout for slow MFA responses
            setTimeout(() => {
                if (server.listening) {
                    server.close();
                    reject(new Error('Authentication timed out. Ensure you finished the login in your browser.'));
                }
            }, 600000); // 10 minutes
        });
    }

    getConnection() {
        return this.conn;
    }
}

module.exports = new SalesforceAuth();
