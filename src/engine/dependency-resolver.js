const sfAuth = require('../connection/sf-auth');

class DependencyResolver {
    constructor() {
        this.dependencies = {}; // Mapping of Object: [Dependent Parents]
        this.objectMetadata = {}; // Store raw describe data
    }

    async fetchMetadata(objects) {
        const conn = sfAuth.getConnection();
        if (!conn) throw new Error('Salesforce Connection not established.');

        for (const obj of objects) {
            if (this.objectMetadata[obj]) continue; // Skip if already fetched

            try {
                const metadata = await conn.sobject(obj).describe();
                this.objectMetadata[obj] = metadata;

                // Find Mandatory Parents (Required Lookups or Master-Detail)
                const parents = metadata.fields
                    .filter(f => f.type === 'reference' && (f.nillable === false || f.relationshipOrder !== null))
                    .map(f => f.referenceTo[0]); // Usually points to one object

                this.dependencies[obj] = [...new Set(parents)];

                // Recursively fetch for parents if they aren't standard or provided
                for (const parent of parents) {
                    if (!objects.includes(parent)) {
                        // We should ideally fetch metadata for these too, to build a full chain
                        await this.fetchMetadata([parent]);
                    }
                }
            } catch (err) {
                console.error(`Error describing object ${obj}:`, err.message);
            }
        }
    }

    calculateSequence() {
        const sorted = [];
        const visited = new Set();
        const visiting = new Set();

        const visit = (obj) => {
            if (visiting.has(obj)) throw new Error('Circular dependency detected at ' + obj);
            if (visited.has(obj)) return;

            visiting.add(obj);

            const parents = this.dependencies[obj] || [];
            for (const parent of parents) {
                visit(parent);
            }

            visiting.delete(obj);
            visited.add(obj);
            sorted.push(obj);
        };

        Object.keys(this.dependencies).forEach(visit);
        return sorted;
    }

    getChecklist(obj) {
        const metadata = this.objectMetadata[obj];
        if (!metadata) return null;

        return {
            name: obj,
            label: metadata.label,
            preOps: [
                'Disable Validation Rules',
                'Disable Triggers/Flows (if high volume)',
                'Check for Duplicate Rules'
            ],
            postOps: [
                'Re-enable Triggers/Flows',
                'Run Sharing Recalculation (if needed)',
                'Verify Record Counts'
            ],
            dependencies: this.dependencies[obj] || []
        };
    }

    async inspectObject(obj) {
        const conn = sfAuth.getConnection();
        if (!conn) throw new Error('Salesforce Connection not established.');

        try {
            const metadata = await conn.sobject(obj).describe();
            this.objectMetadata[obj] = metadata;

            const fields = metadata.fields.map(f => ({
                name: f.name,
                label: f.label,
                type: f.type,
                nillable: f.nillable,
                createable: f.createable,
                updateable: f.updateable,
                externalId: f.externalId,
                referenceTo: f.referenceTo,
                length: f.length,
                precision: f.precision
            }));

            // Crucial for Non-Matured Teams: Identify Mandatory vs Optional
            const mandatoryFields = fields.filter(f => !f.nillable && f.createable && !f.defaultedOnCreate);
            const externalIds = fields.filter(f => f.externalId);
            const references = fields.filter(f => f.type === 'reference');

            return {
                name: obj,
                label: metadata.label,
                totalFields: fields.length,
                mandatoryFields,
                externalIds,
                references,
                allFields: fields
            };
        } catch (err) {
            console.error(`Error inspecting object ${obj}:`, err.message);
            throw err;
        }
    }
}

module.exports = DependencyResolver;
