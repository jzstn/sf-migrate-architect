import { LightningElement, wire, track } from 'lwc';
import getAllObjects from '@salesforce/apex/MigrationArchitectSvc.getAllObjects';
import analyzeMigration from '@salesforce/apex/MigrationArchitectSvc.analyzeMigration';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

export default class MigrationMissionControl extends LightningElement {
    @track objectOptions = [];
    @track selectedObjects = ['Account', 'Contact', 'Opportunity'];
    @track results = null;
    @track isAnalyzing = false;
    @track error = null;

    @wire(getAllObjects)
    wiredObjects({ error, data }) {
        if (data) {
            this.objectOptions = data;
        } else if (error) {
            this.showToast('Error Loading Objects', error.body.message, 'error');
        }
    }

    handleObjectChange(event) {
        this.selectedObjects = event.detail.value;
    }

    async startAnalysis() {
        if (!this.selectedObjects || this.selectedObjects.length === 0) {
            this.showToast('Selection Required', 'Please select at least one object to analyze.', 'warning');
            return;
        }

        this.isAnalyzing = true;
        try {
            this.results = await analyzeMigration({ targetObjects: this.selectedObjects });
            this.isAnalyzing = false;
        } catch (e) {
            this.isAnalyzing = false;
            this.showToast('Analysis Failed', e.body.message, 'error');
        }
    }

    handleAiPrompt() {
        if (this.results && this.results.aiPrompt) {
            // Copy to clipboard
            const textarea = document.createElement('textarea');
            textarea.value = this.results.aiPrompt;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);

            this.showToast('AI Bundle Copied!', 'The AI-Ready Prompt has been copied to your clipboard. Paste it into ChatGPT/Claude.', 'success');
        } else {
            this.showToast('No Data', 'Please analyze a migration roadmap first.', 'warning');
        }
    }

    // Helper formatting functions
    stepDisplay(idx) {
        return idx + 1;
    }

    getObjectLabel(objName) {
        const detail = this.results.details[objName];
        return detail ? detail.label : objName;
    }

    getMandatoryCount(objName) {
        const detail = this.results.details[objName];
        return detail ? detail.mandatoryFields.length : 0;
    }

    getExternalCount(objName) {
        const detail = this.results.details[objName];
        return detail ? detail.externalIds.length : 0;
    }

    getParentList(objName) {
        const detail = this.results.details[objName];
        if (detail && detail.parentObjects && detail.parentObjects.length > 0) {
            return `Needs: ${detail.parentObjects.join(', ')}`;
        }
        return 'No Dependencies';
    }

    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}
