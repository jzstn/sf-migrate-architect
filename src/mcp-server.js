#!/usr/bin/env node

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const { z } = require('zod');
const sfAuth = require('./connection/sf-auth');
const DependencyResolver = require('./engine/dependency-resolver');
const reportGenerator = require('./templates/executive-report');
require('dotenv').config();

const server = new Server(
    {
        name: 'salesforce-migration-architect',
        version: '1.0.0',
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

/**
 * Tool 1: Connect to Salesforce
 */
const ConnectSchema = z.object({
    username: z.string().optional(),
    password: z.string().optional(),
    loginUrl: z.string().default('https://login.salesforce.com'),
    accessToken: z.string().optional(),
    instanceUrl: z.string().optional()
});

/**
 * Tool 2: Inspect Object
 */
const InspectSchema = z.object({
    objectName: z.string().describe('Salesforce API Name of the object (e.g. Account, Contact)')
});

/**
 * Tool 3: Migration Plan
 */
const PlanSchema = z.object({
    objects: z.array(z.string()).describe('List of Salesforce objects to migrate (e.g. ["Account", "Contact", "Opportunity"])')
});

server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: 'sf_connect',
                description: 'Establish a secure connection to a Salesforce Org using either User/Pass/Token or direct Access Token.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        username: { type: 'string' },
                        password: { type: 'string', description: 'Password + Security Token' },
                        loginUrl: { type: 'string', default: 'https://login.salesforce.com' },
                        accessToken: { type: 'string', description: 'Faster login using a valid session ID' },
                        instanceUrl: { type: 'string', description: 'Required if using accessToken' }
                    }
                },
            },
            {
                name: 'sf_inspect_object',
                description: 'Retrieve deep metadata for a specific Salesforce object: mandatory fields, external IDs, and relationships.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        objectName: { type: 'string' }
                    },
                    required: ['objectName']
                },
            },
            {
                name: 'sf_migration_plan',
                description: 'Calculate the optimal data loading sequence for a set of Salesforce objects based on their parent-child dependencies.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        objects: { type: 'array', items: { type: 'string' } }
                    },
                    required: ['objects']
                },
            },
        ],
    };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
        // 🛡️ Ensure we are connected for non-connect tools
        if (name !== 'sf_connect' && !sfAuth.getConnection()) {
            // Auto-attempt using .env if it exists
            if (process.env.SF_USERNAME && process.env.SF_PASSWORD) {
                await sfAuth.login();
            } else {
                throw new Error('No active Salesforce connection. Please run sf_connect first.');
            }
        }

        switch (name) {
            case 'sf_connect': {
                const { username, password, loginUrl, accessToken, instanceUrl } = ConnectSchema.parse(args);
                if (accessToken && instanceUrl) {
                    await sfAuth.loginSession(accessToken, instanceUrl);
                    return { content: [{ type: 'text', text: '✅ Securely connected via Access Token!' }] };
                } else if (username && password) {
                    await sfAuth.login(username, password, loginUrl);
                    return { content: [{ type: 'text', text: '✅ Securely connected via Credentials!' }] };
                } else {
                    throw new Error('Please provide either Username/Password or AccessToken/InstanceUrl.');
                }
            }

            case 'sf_inspect_object': {
                const { objectName } = InspectSchema.parse(args);
                const resolver = new DependencyResolver();
                const analysis = await resolver.inspectObject(objectName);

                return {
                    content: [
                        {
                            type: 'text',
                            text: `### 🔍 Analysis: ${analysis.label} (${analysis.name})\n\n` +
                                `**Mandatory Fields:**\n` +
                                analysis.mandatoryFields.map(f => `- ${f.name} (${f.type})`).join('\n') +
                                `\n\n**External IDs:**\n` +
                                (analysis.externalIds.length ? analysis.externalIds.map(f => `- ${f.name}`).join('\n') : 'None found.') +
                                `\n\n**Relationships:**\n` +
                                analysis.references.map(f => `- ${f.name} → ${f.referenceTo}`).join('\n')
                        }
                    ]
                };
            }

            case 'sf_migration_plan': {
                const { objects } = PlanSchema.parse(args);
                const resolver = new DependencyResolver();
                await resolver.fetchMetadata(objects);
                const sequence = resolver.calculateSequence();

                const report = reportGenerator.generate(sequence, resolver);

                return {
                    content: [
                        {
                            type: 'text',
                            text: `### 🚀 Optimal Migration Plan\n\n` +
                                `**Recommended Loading Order:**\n` +
                                sequence.map((obj, i) => `${i + 1}. ${obj}`).join('\n') +
                                `\n\n**Detailed Sequence Breakdown:**\n\n` + report
                        }
                    ]
                };
            }

            default:
                throw new Error(`Unknown tool: ${name}`);
        }
    } catch (error) {
        return {
            content: [{ type: 'text', text: `❌ Error: ${error.message}` }],
            isError: true,
        };
    }
});

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('🚀 Salesforce Migration Architect MCP Server running!');
}

main().catch((error) => {
    console.error('Fatal error starting MCP server:', error);
    process.exit(1);
});
