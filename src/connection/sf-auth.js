require('dotenv').config();
const jsforce = require('jsforce');

class SalesforceAuth {
    constructor() {
        this.conn = null;
    }

    async login(username, password, loginUrl = 'https://login.salesforce.com') {
        // Priority: Arguments > Env Vars
        const user = username || process.env.SF_USERNAME;
        const pass = password || process.env.SF_PASSWORD; // Password + Token
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

    getConnection() {
        return this.conn;
    }
}

module.exports = new SalesforceAuth();
