public with sharing class MigrationArchitectSvc {
    
    public class ObjectDetail {
        @AuraEnabled public String name;
        @AuraEnabled public String label;
        @AuraEnabled public Boolean isCustom;
        @AuraEnabled public List<String> parentObjects;
        @AuraEnabled public List<FieldDetail> mandatoryFields;
        @AuraEnabled public List<FieldDetail> externalIds;
        
        public ObjectDetail(String name, String label, Boolean isCustom) {
            this.name = name;
            this.label = label;
            this.isCustom = isCustom;
            this.parentObjects = new List<String>();
            this.mandatoryFields = new List<FieldDetail>();
            this.externalIds = new List<FieldDetail>();
        }
    }
    
    public class FieldDetail {
        @AuraEnabled public String name;
        @AuraEnabled public String label;
        @AuraEnabled public String type;
        
        public FieldDetail(String name, String label, String type) {
            this.name = name;
            this.label = label;
            this.type = type;
        }
    }
    
    public class AnalysisResult {
        @AuraEnabled public List<String> sequence;
        @AuraEnabled public Map<String, ObjectDetail> details;
        @AuraEnabled public String aiPrompt;
    }

    @AuraEnabled(cacheable=true)
    public static List<Map<String, String>> getAllObjects() {
        List<Map<String, String>> results = new List<Map<String, String>>();
        for (Schema.SObjectType ot : Schema.getGlobalDescribe().values()) {
            Schema.DescribeSObjectResult descr = ot.getDescribe();
            if (descr.isQueryable() && descr.isCreateable()) {
                Map<String, String> obj = new Map<String, String>();
                obj.put('value', descr.getName());
                obj.put('label', descr.getLabel() + ' (' + descr.getName() + ')');
                results.add(obj);
            }
        }
        return results;
    }

    @AuraEnabled
    public static AnalysisResult analyzeMigration(List<String> targetObjects) {
        AnalysisResult res = new AnalysisResult();
        res.details = new Map<String, ObjectDetail>();
        res.sequence = new List<String>();
        
        Map<String, Set<String>> adjacency = new Map<String, Set<String>>();
        
        for (String objName : targetObjects) {
            Schema.SObjectType ot = Schema.getGlobalDescribe().get(objName);
            if (ot == null) continue;
            
            Schema.DescribeSObjectResult descr = ot.getDescribe();
            ObjectDetail detail = new ObjectDetail(descr.getName(), descr.getLabel(), descr.isCustom());
            
            Set<String> dependencies = new Set<String>();
            
            for (Schema.SObjectField field : descr.fields.getMap().values()) {
                Schema.DescribeFieldResult fDescr = field.getDescribe();
                
                // Track Mandatory Fields (excluding system fields)
                if (!fDescr.isNillable() && !fDescr.isDefaultedOnCreate() && fDescr.isCreateable()) {
                    detail.mandatoryFields.add(new FieldDetail(fDescr.getName(), fDescr.getLabel(), fDescr.getType().name()));
                }
                
                // Track External IDs
                if (fDescr.isExternalID()) {
                    detail.externalIds.add(new FieldDetail(fDescr.getName(), fDescr.getLabel(), fDescr.getType().name()));
                }
                
                // Track Relationships (Parents)
                if (fDescr.getType() == Schema.DisplayType.Reference) {
                    for (Schema.SObjectType parentType : fDescr.getReferenceTo()) {
                        String parentName = parentType.getDescribe().getName();
                        if (targetObjects.contains(parentName) && parentName != objName) {
                            dependencies.add(parentName);
                        }
                    }
                }
            }
            detail.parentObjects.addAll(dependencies);
            res.details.put(objName, detail);
            adjacency.put(objName, dependencies);
        }
        
        // Simple Topological Sort (Kahn's algorithm logic)
        List<String> sorted = new List<String>();
        Set<String> visited = new Set<String>();
        
        while (sorted.size() < targetObjects.size()) {
            Boolean foundOne = false;
            for (String obj : targetObjects) {
                if (visited.contains(obj)) continue;
                
                Set<String> deps = adjacency.get(obj);
                Boolean allDepsMet = true;
                for (String d : deps) {
                    if (!visited.contains(d)) {
                        allDepsMet = false;
                        break;
                    }
                }
                
                if (allDepsMet) {
                    sorted.add(obj);
                    visited.add(obj);
                    foundOne = true;
                    break;
                }
            }
            if (!foundOne) {
                // Circular or missing, just add remaining and break
                for(String obj : targetObjects) if(!visited.contains(obj)) sorted.add(obj);
                break;
            }
        }
        
        res.sequence = sorted;
        res.aiPrompt = generateAIPrompt(res);
        return res;
    }
    
    private static String generateAIPrompt(AnalysisResult res) {
        String prompt = '--- AI ARCHITECT PROMPT START ---\n';
        prompt += 'You are a Principal Salesforce Architect. Analyze this migration sequence:\n\n';
        prompt += 'SEQUENCE: ' + String.join(res.sequence, ' > ') + '\n\n';
        
        for (String objName : res.sequence) {
            ObjectDetail d = res.details.get(objName);
            prompt += '[OBJECT: ' + objName + ']\n';
            prompt += '- Parents: ' + String.join(d.parentObjects, ', ') + '\n';
            prompt += '- Mandatory: ' + d.mandatoryFields.size() + ' fields\n';
            prompt += '- External IDs: ' + d.externalIds.size() + ' found\n\n';
        }
        prompt += '--- AI ARCHITECT PROMPT END ---';
        return prompt;
    }
}
