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

        // --- 🛡️ CLEANSE THE CLIENT ID ---
        let clientId = (process.env.SF_CLIENT_ID || '').trim();

        // If the user accidentally pasted "npx github:..." into the prompt
        if (clientId.includes('npx') || clientId.includes('github:')) {
            clientId = '';
        }

        // Clean any potential trailing junk or newlines
        clientId = clientId.replace(/[\r\n\t\s]/g, '');

        if (!clientId || clientId.length < 10) {
            throw new Error('Invalid Client ID. Please provide ONLY the Consumer Key from your Connected App.');
        }

        const maskedId = `${clientId.substring(0, 5)}...${clientId.substring(clientId.length - 5)}`;
        console.log(chalk.gray(`🛠️  Attempting login with Consumer Key: ${maskedId}`));

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
                        <div style="font-family: -apple-system, system-ui, sans-serif; text-align: center; padding: 50px; background: #f0f7ff; color: #1a1a1a;">
                            <div style="background: #ffffff; padding: 40px; border-radius: 12px; display: inline-block; box-shadow: 0 10px 25px rgba(0,0,0,0.1);">
                                <div style="font-size: 48px; margin-bottom: 20px;">✅</div>
                                <h1 style="color: #2c3e50; margin-bottom: 10px;">Authenticated!</h1>
                                <p style="font-size: 18px; color: #5d6d7e;">The Migration Planner CLI has received your token.</p>
                                <hr style="border: none; border-top: 1px solid #e1e8ed; margin: 25px 0;">
                                <p style="font-weight: bold; color: #3498db;">Return to your terminal to continue.</p>
                            </div>
                        </div>
                    `);

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
                if (err) {
                    if (err.code === 'EADDRINUSE') {
                        return reject(new Error('Port 3001 is already in use. Run "kill -9 $(lsof -t -i:3001)" to free it up.'));
                    }
                    return reject(err);
                }

                const authUrl = this.oauth2.getAuthorizationUrl({
                    scope: 'api web refresh_token',
                    prompt: 'login'
                });

                console.log(chalk.cyan(`\n🔗 Action Required: Complete Login in Browser`));
                console.log(chalk.blue.underline(authUrl));
                console.log(chalk.gray(`\nWaiting for up to 10 minutes for you to sign in...`));

                // macOS Specific command that works with long URLs and spaces
                const platform = process.platform;
                let openCmd;

                if (platform === 'darwin') {
                    openCmd = `open '${authUrl.replace(/'/g, "'\\''")}'`; // Properly escape for bash
                } else if (platform === 'win32') {
                    openCmd = `start "" "${authUrl.replace(/&/g, '^&')}"`;
                } else {
                    openCmd = `xdg-open "${authUrl}"`;
                }

                exec(openCmd, (e) => {
                    if (e) console.log(chalk.yellow(`\nBrowser failed to pop up. Please Command-Click the blue link above manually.`));
                });
            });

            // Handle server start error (for EADDRINUSE)
            server.on('error', (err) => {
                if (err.code === 'EADDRINUSE') {
                    reject(new Error(`Conflict: Port 3001 is locked. Run 'kill -9 $(lsof -t -i:3001)' to reset it.`));
                } else {
                    reject(err);
                }
            });

            setTimeout(() => {
                if (server.listening) {
                    server.close();
                    reject(new Error('Authentication timed out. If you had trouble, try the link again.'));
                }
            }, 600000); // 10 minutes
        });
    }

    getConnection() {
        return this.conn;
    }
}

module.exports = new SalesforceAuth();
