require('dotenv').config();
const jsforce = require('jsforce');
const express = require('express');
const path = require('path');
const { exec } = require('child_process');

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

        // Clean the Client ID (pasting often adds newlines/spaces)
        let clientId = process.env.SF_CLIENT_ID || '';
        clientId = clientId.replace(/\s/g, ''); // Remove all whitespace

        if (!clientId) {
            throw new Error('No Client ID provided.');
        }

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
                        <div style="font-family: sans-serif; text-align: center; padding: 50px;">
                            <h1 style="color: #2e7d32;">✅ Authentication Successful!</h1>
                            <p>The Salesforce Migration Planner has received your secure token.</p>
                            <p><strong>You can now close this tab and return to your terminal.</strong></p>
                        </div>
                    `);

                    // Delay closing slightly to ensure the browser receives the response
                    setTimeout(() => {
                        server.close();
                        resolve(this.conn);
                    }, 1000);
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
                    prompt: 'login' // Force login screen
                });

                console.log(`\n🌐 Opening your browser for secure login...`);
                console.log(`If it doesn't open automatically, visit: ${authUrl}\n`);

                // Native platform command to open browser
                const platform = process.platform;
                const cmd = platform === 'win32' ? 'start' : platform === 'darwin' ? 'open' : 'xdg-open';

                exec(`${cmd} "${authUrl.replace(/&/g, '^&')}"`, (error) => {
                    if (error) {
                        console.log(chalk.yellow(`Note: Could not open browser automatically. Please click the link above manually.`));
                    }
                });
            });

            // Timeout after 5 minutes (increased for slower SSO logins)
            setTimeout(() => {
                if (server.listening) {
                    server.close();
                    reject(new Error('Authentication timed out after 5 minutes.'));
                }
            }, 300000);
        });
    }

    getConnection() {
        return this.conn;
    }
}

module.exports = new SalesforceAuth();
