import * as vscode from 'vscode';

/**
 * Represents a validation rule in Yii 1.1
 */
export interface ValidationRule {
    /** The attributes this rule applies to (can be comma-separated string or array) */
    attributes: string[];
    /** The validator type (e.g., 'required', 'email', 'numerical') */
    validator: string;
    /** Additional parameters for the validator */
    params: Record<string, any>;
    /** The scenario this rule applies to (optional) */
    scenario?: string;
    /** Whether to allow empty values */
    allowEmpty?: boolean;
    /** Whether this rule is safe (allows mass assignment) */
    safe?: boolean;
    /** The range of the rule in the document */
    range: vscode.Range;
    /** The line number where this rule appears */
    line: number;
}

/**
 * Represents a model attribute
 */
export interface ModelAttribute {
    /** The attribute name */
    name: string;
    /** The type of attribute (property, column, virtual) */
    type: 'property' | 'column' | 'virtual';
    /** The range where the attribute is defined */
    range?: vscode.Range;
    /** Whether it's a public property */
    isPublic?: boolean;
    /** Whether it's a protected property */
    isProtected?: boolean;
}

/**
 * Represents a parsed model
 */
export interface ParsedModel {
    /** The class name */
    className: string;
    /** The parent class (e.g., 'CActiveRecord', 'CModel') */
    parentClass: string;
    /** The table name (for CActiveRecord) */
    tableName?: string;
    /** The attributes found in the model */
    attributes: ModelAttribute[];
    /** The range of the class definition */
    classRange: vscode.Range;
    /** The range of the rules() method */
    rulesRange?: vscode.Range;
}

/**
 * Built-in Yii 1.1 validators
 */
export const BUILT_IN_VALIDATORS = [
    'required',
    'email',
    'numerical',
    'string',
    'length',
    'unique',
    'compare',
    'default',
    'exist',
    'in',
    'date',
    'time',
    'datetime',
    'url',
    'file',
    'image',
    'type',
    'boolean',
    'integer',
    'double',
    'array',
    'safe',
    'match',
    'filter',
    'unsafe',
] as const;

export type ValidatorType = typeof BUILT_IN_VALIDATORS[number];

/**
 * Validator information for documentation
 */
export interface ValidatorInfo {
    name: string;
    description: string;
    requiredParams: string[];
    optionalParams: string[];
    examples: string[];
    validatorClass: string;
    insertText?: string;
}

/**
 * Validation diagnostic information
 */
export interface ValidationDiagnostic {
    /** The diagnostic message */
    message: string;
    /** The severity level */
    severity: vscode.DiagnosticSeverity;
    /** The range where the issue occurs */
    range: vscode.Range;
    /** The validation rule that caused this diagnostic (if applicable) */
    rule?: ValidationRule;
    /** Suggested fixes */
    suggestions?: string[];
}

