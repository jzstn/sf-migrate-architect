const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const sfAuth = require('../connection/sf-auth');
const DependencyResolver = require('../engine/dependency-resolver');
const reportGenerator = require('../templates/executive-report');

const app = express();
const PORT = 3000;

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../../public')));

// API: Perform Analysis
app.post('/api/plan', async (req, res) => {
    const { username, password, loginUrl, objects } = req.body;

    try {
        await sfAuth.login(username, password, loginUrl);
        const targetObjects = objects.split(',').map(s => s.trim());
        const resolver = new DependencyResolver();

        await resolver.fetchMetadata(targetObjects);
        const sequence = resolver.calculateSequence();

        // Prepare for UI
        const reportMd = reportGenerator.generate(sequence, resolver);
        const aiPrompt = reportGenerator.generateAIReadyBundle(sequence, resolver);

        // Extract Mermaid content from report if possible, or regenerate
        const mermaid = extractMermaid(reportMd);

        res.json({ sequence, mermaid, aiPrompt });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Demo Mode
app.get('/api/demo', async (req, res) => {
    const sequence = ['User', 'Account', 'Contact', 'Opportunity'];
    const resolver = new DependencyResolver();

    // Mock Data
    resolver.dependencies = {
        'User': [],
        'Account': ['User'],
        'Contact': ['Account'],
        'Opportunity': ['Account']
    };
    resolver.objectMetadata = {
        'User': { label: 'User' },
        'Account': { label: 'Account' },
        'Contact': { label: 'Contact' },
        'Opportunity': { label: 'Opportunity' }
    };

    const aiPrompt = reportGenerator.generateAIReadyBundle(sequence, resolver);
    const reportMd = reportGenerator.generate(sequence, resolver);
    const mermaid = extractMermaid(reportMd);

    res.json({ sequence, mermaid, aiPrompt });
});

function extractMermaid(md) {
    const match = md.match(/```mermaid([\s\S]*?)```/);
    return match ? match[1].trim() : '';
}

function startServer() {
    app.listen(PORT, () => {
        console.log(`\n🚀 Mission Control is active at: http://localhost:${PORT}`);
        console.log(`Keep this terminal open to maintain the link to Salesforce.\n`);
    });
}

module.exports = { startServer };
