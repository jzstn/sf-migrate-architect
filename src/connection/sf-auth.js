require('dotenv').config();
const jsforce = require('jsforce');
const express = require('express');
const open = require('open');
const path = require('path');

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

        // We use a default Salesforce CLI Client ID for universal access
        // Or you can overwrite this with your own Connected App ID in .env
        const clientId = process.env.SF_CLIENT_ID || '3MVG99Oxm_qI6wh0S1m99f8m99l99f8m99l99f8m99l99f8m99l99f8m99l99f8m99l99f8m99';

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
                    res.send('<h1>Authentication Successful!</h1><p>You can now close this tab and return to your terminal.</p>');
                    server.close();
                    resolve(this.conn);
                } catch (err) {
                    res.status(500).send(`Authentication Error: ${err.message}`);
                    server.close();
                    reject(err);
                }
            });

            server = app.listen(PORT, async () => {
                const authUrl = this.oauth2.getAuthorizationUrl({ scope: 'api web refresh_token' });
                console.log(`\n🌐 Opening your browser for secure login...`);
                console.log(`If it doesn't open automatically, visit: ${authUrl}\n`);
                await open(authUrl);
            });

            // Timeout after 3 minutes
            setTimeout(() => {
                server.close();
                reject(new Error('Authentication timed out after 3 minutes.'));
            }, 180000);
        });
    }

    getConnection() {
        return this.conn;
    }
}

module.exports = new SalesforceAuth();
