import * as vscode from 'vscode';
import { ValidationParser } from './validationParser';
import { ModelParser } from './modelParser';
import { ValidationRule, ValidationDiagnostic, BUILT_IN_VALIDATORS, ParsedModel, ModelAttribute } from './validationTypes';

/**
 * Diagnostics provider for Yii 1.1 validation rules
 */
export class ValidationDiagnostics {
    private diagnosticCollection: vscode.DiagnosticCollection;

    constructor() {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('yii1-validation');
    }

    public getDiagnosticCollection(): vscode.DiagnosticCollection {
        return this.diagnosticCollection;
    }

    /**
     * Update diagnostics for a document
     */
    public async updateDiagnostics(document: vscode.TextDocument): Promise<void> {
        const diagnostics: vscode.Diagnostic[] = [];

        // Check if this is a model file
        const model = ModelParser.parseModel(document);
        if (!model) {
            this.diagnosticCollection.set(document.uri, diagnostics);
            return;
        }

        // Parse validation rules
        const rules = ValidationParser.parseRules(document);
        
        // Get available attributes
        const availableAttributes = model.attributes.map(attr => attr.name.toLowerCase());
        const attributeMap = new Map<string, ModelAttribute>();
        model.attributes.forEach(attr => {
            attributeMap.set(attr.name.toLowerCase(), attr);
        });

        // Validate each rule
        for (const rule of rules) {
            const ruleDiagnostics = this.validateRule(rule, availableAttributes, attributeMap, model);
            diagnostics.push(...ruleDiagnostics);
        }

        // Check for duplicate rules
        const duplicateDiagnostics = this.checkDuplicates(rules);
        diagnostics.push(...duplicateDiagnostics);

        this.diagnosticCollection.set(document.uri, diagnostics);
    }

    /**
     * Validate a single validation rule
     */
    private validateRule(
        rule: ValidationRule,
        availableAttributes: string[],
        attributeMap: Map<string, ModelAttribute>,
        model: ParsedModel
    ): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = [];

        // Check each attribute in the rule
        for (const attribute of rule.attributes) {
            const attrLower = attribute.toLowerCase();
            // const found = availableAttributes.find(attr => attr === attrLower);

            // if (!found) {
            //     // Check for similar attributes (typo detection)
            //     const suggestions = this.findSimilarAttributes(attrLower, availableAttributes);
            //     let message = `Attribute '${attribute}' does not exist in model '${model.className}'`;
                
            //     if (suggestions.length > 0) {
            //         message += `. Did you mean: ${suggestions.slice(0, 3).join(', ')}?`;
            //     }

            //     const diagnostic = new vscode.Diagnostic(
            //         rule.range,
            //         message,
            //         vscode.DiagnosticSeverity.Error
            //     );
            //     diagnostic.source = 'Yii 1.1 Validation';
            //     diagnostic.code = 'missing-attribute';
            //     diagnostics.push(diagnostic);
            // }
        }

        // Validate validator type
        if (!this.isValidValidator(rule.validator)) {
            const diagnostic = new vscode.Diagnostic(
                rule.range,
                `Unknown validator type '${rule.validator}'. Valid types: ${BUILT_IN_VALIDATORS.slice(0, 10).join(', ')}...`,
                vscode.DiagnosticSeverity.Warning
            );
            diagnostic.source = 'Yii 1.1 Validation';
            diagnostic.code = 'unknown-validator';
            diagnostics.push(diagnostic);
        }

        // Validate rule-specific parameters
        const paramDiagnostics = this.validateRuleParameters(rule, model);
        diagnostics.push(...paramDiagnostics);

        return diagnostics;
    }

    /**
     * Validate rule-specific parameters
     */
    private validateRuleParameters(rule: ValidationRule, model: ParsedModel): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = [];

        switch (rule.validator) {
            case 'compare':
                // Check if compareAttribute exists
                const compareAttr = rule.params['compareAttribute'];
                if (compareAttr) {
                    const compareAttrLower = compareAttr.toLowerCase();
                    const availableAttributes = model.attributes.map(attr => attr.name.toLowerCase());
                    if (!availableAttributes.includes(compareAttrLower)) {
                        const diagnostic = new vscode.Diagnostic(
                            rule.range,
                            `Compare attribute '${compareAttr}' does not exist`,
                            vscode.DiagnosticSeverity.Error
                        );
                        diagnostic.source = 'Yii 1.1 Validation';
                        diagnostics.push(diagnostic);
                    }
                }
                // Validate operator
                const operator = rule.params['operator'];
                if (operator && !['==', '!=', '>', '>=', '<', '<='].includes(operator)) {
                    const diagnostic = new vscode.Diagnostic(
                        rule.range,
                        `Invalid operator '${operator}'. Valid operators: ==, !=, >, >=, <, <=`,
                        vscode.DiagnosticSeverity.Warning
                    );
                    diagnostic.source = 'Yii 1.1 Validation';
                    diagnostics.push(diagnostic);
                }
                break;

            case 'exist':
            case 'unique':
                // Check if className exists (for exist rule)
                const className = rule.params['className'];
                if (className && !this.classExists(className, model)) {
                    const diagnostic = new vscode.Diagnostic(
                        rule.range,
                        `Referenced class '${className}' not found`,
                        vscode.DiagnosticSeverity.Warning
                    );
                    diagnostic.source = 'Yii 1.1 Validation';
                    diagnostics.push(diagnostic);
                }
                break;

            case 'in':
                // Check if range is provided
                const range = rule.params['range'];
                if (!range || (Array.isArray(range) && range.length === 0)) {
                    const diagnostic = new vscode.Diagnostic(
                        rule.range,
                        "Rule 'in' requires a 'range' parameter",
                        vscode.DiagnosticSeverity.Error
                    );
                    diagnostic.source = 'Yii 1.1 Validation';
                    diagnostics.push(diagnostic);
                }
                break;
        }

        return diagnostics;
    }

    /**
     * Check for duplicate validation rules
     */
    private checkDuplicates(rules: ValidationRule[]): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = [];
        const ruleMap = new Map<string, ValidationRule[]>();

        // Group rules by attribute and validator
        for (const rule of rules) {
            for (const attribute of rule.attributes) {
                const key = `${attribute.toLowerCase()}:${rule.validator}`;
                if (!ruleMap.has(key)) {
                    ruleMap.set(key, []);
                }
                ruleMap.get(key)!.push(rule);
            }
        }

        // Check for duplicates
        for (const [key, ruleList] of ruleMap.entries()) {
            if (ruleList.length > 1) {
                // Check if scenarios are different (not a duplicate)
                const scenarios = ruleList.map(r => r.scenario || 'default');
                const uniqueScenarios = new Set(scenarios);
                
                if (uniqueScenarios.size === 1) {
                    // True duplicate
                    for (const rule of ruleList) {
                        const diagnostic = new vscode.Diagnostic(
                            rule.range,
                            `Duplicate validation rule: '${rule.validator}' for attribute(s) '${rule.attributes.join(', ')}'`,
                            vscode.DiagnosticSeverity.Warning
                        );
                        diagnostic.source = 'Yii 1.1 Validation';
                        diagnostic.code = 'duplicate-rule';
                        diagnostics.push(diagnostic);
                    }
                }
            }
        }

        return diagnostics;
    }

    /**
     * Find similar attributes (for typo detection)
     */
    private findSimilarAttributes(target: string, availableAttributes: string[]): string[] {
        const suggestions: Array<{ attr: string; score: number }> = [];

        for (const attr of availableAttributes) {
            const score = this.levenshteinDistance(target, attr);
            if (score <= 2) { // Max 2 character difference
                suggestions.push({ attr, score });
            }
        }

        return suggestions
            .sort((a, b) => a.score - b.score)
            .map(s => s.attr);
    }

    /**
     * Calculate Levenshtein distance between two strings
     */
    private levenshteinDistance(str1: string, str2: string): number {
        const matrix: number[][] = [];

        for (let i = 0; i <= str2.length; i++) {
            matrix[i] = [i];
        }

        for (let j = 0; j <= str1.length; j++) {
            matrix[0][j] = j;
        }

        for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }

        return matrix[str2.length][str1.length];
    }

    /**
     * Check if validator is valid
     */
    private isValidValidator(validator: string): boolean {
        return BUILT_IN_VALIDATORS.includes(validator as any) || 
               validator.startsWith('validate') || // Custom validator method
               validator.includes('.'); // Namespaced validator
    }

    /**
     * Check if a class exists (simplified check)
     */
    private classExists(className: string, model: ParsedModel): boolean {
        // This is a simplified check - in a real implementation,
        // we would search the codebase for the class
        // For now, just check if it's a common Yii class or looks valid
        const commonClasses = ['CActiveRecord', 'CModel', 'CFormModel'];
        return commonClasses.includes(className) || /^[A-Z]\w+$/.test(className);
    }
}

