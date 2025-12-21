import * as vscode from 'vscode';
import { ValidationParser } from './validationParser';
import { ValidatorInfo, BUILT_IN_VALIDATORS } from './validationTypes';

/**
 * Hover provider for Yii 1.1 validation rules
 */
export class ValidationHoverProvider implements vscode.HoverProvider {
    provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.Hover> {
        // Check if we're inside rules() method
        if (!ValidationParser.isInRulesMethod(document, position)) {
            return null;
        }

        const line = document.lineAt(position);
        const wordRange = document.getWordRangeAtPosition(position, /['"](\w+)['"]/);
        
        if (!wordRange) {
            return null;
        }

        const word = document.getText(wordRange);
        const match = word.match(/['"](\w+)['"]/);
        if (!match) {
            return null;
        }

        const value = match[1];

        // Check if it's a validator type
        if (BUILT_IN_VALIDATORS.includes(value as any)) {
            const info = this.getValidatorInfo(value);
            if (info) {
                const markdown = new vscode.MarkdownString();
                markdown.appendMarkdown(`## ${info.name} Validator\n\n`);
                markdown.appendMarkdown(`${info.description}\n\n`);
                
                if (info.requiredParams.length > 0) {
                    markdown.appendMarkdown(`**Required Parameters:**\n`);
                    info.requiredParams.forEach(param => {
                        markdown.appendMarkdown(`- \`${param}\`\n`);
                    });
                    markdown.appendMarkdown(`\n`);
                }
                
                if (info.optionalParams.length > 0) {
                    markdown.appendMarkdown(`**Optional Parameters:**\n`);
                    info.optionalParams.forEach(param => {
                        markdown.appendMarkdown(`- \`${param}\`\n`);
                    });
                    markdown.appendMarkdown(`\n`);
                }
                
                if (info.examples.length > 0) {
                    markdown.appendMarkdown(`**Examples:**\n`);
                    info.examples.forEach(example => {
                        markdown.appendCodeblock(example, 'php');
                    });
                }

                markdown.appendMarkdown(`\n**Validator Class:** \`${info.validatorClass}\``);

                return new vscode.Hover(markdown, wordRange);
            }
        }

        return null;
    }

    /**
     * Get validator information
     */
    private getValidatorInfo(validator: string): ValidatorInfo | null {
        const map = this.getValidatorInfoMap();
        return map.get(validator) || null;
    }

    /**
     * Get validator information map
     */
    private getValidatorInfoMap(): Map<string, ValidatorInfo> {
        const map = new Map<string, ValidatorInfo>();

        map.set('required', {
            name: 'required',
            description: 'Validates that the attribute value is not empty. The attribute will be considered empty if it is null, an empty string, or an empty array.',
            requiredParams: ['attribute'],
            optionalParams: ['allowEmpty', 'on', 'message'],
            examples: [
                "array('username', 'required')",
                "array('email', 'required', 'on' => 'register')",
                "array('name', 'required', 'message' => 'Name is required')"
            ],
            validatorClass: 'system.validators.CRequiredValidator'
        });

        map.set('email', {
            name: 'email',
            description: 'Validates that the attribute value is a valid email address.',
            requiredParams: ['attribute'],
            optionalParams: ['allowEmpty', 'on', 'message', 'pattern'],
            examples: [
                "array('email', 'email')",
                "array('email', 'email', 'allowEmpty' => true)",
                "array('email', 'email', 'pattern' => '/^[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}$/i')"
            ],
            validatorClass: 'system.validators.CEmailValidator'
        });

        map.set('numerical', {
            name: 'numerical',
            description: 'Validates that the attribute value is a number (integer or float).',
            requiredParams: ['attribute'],
            optionalParams: ['allowEmpty', 'on', 'message', 'integerOnly', 'min', 'max', 'tooSmall', 'tooBig'],
            examples: [
                "array('age', 'numerical')",
                "array('age', 'numerical', 'integerOnly' => true)",
                "array('price', 'numerical', 'min' => 0, 'max' => 1000)"
            ],
            validatorClass: 'system.validators.CNumberValidator'
        });

        map.set('string', {
            name: 'string',
            description: 'Validates that the attribute value is of certain length.',
            requiredParams: ['attribute'],
            optionalParams: ['allowEmpty', 'on', 'message', 'length', 'min', 'max', 'tooShort', 'tooLong', 'encoding'],
            examples: [
                "array('username', 'string', 'min' => 3, 'max' => 20)",
                "array('description', 'string', 'length' => 255)"
            ],
            validatorClass: 'system.validators.CStringValidator'
        });

        map.set('length', {
            name: 'length',
            description: 'Validates the length of a string attribute. This is an alias for the string validator.',
            requiredParams: ['attribute'],
            optionalParams: ['allowEmpty', 'on', 'message', 'min', 'max', 'is', 'tooShort', 'tooLong'],
            examples: [
                "array('username', 'length', 'min' => 3, 'max' => 20)",
                "array('password', 'length', 'is' => 8)"
            ],
            validatorClass: 'system.validators.CStringValidator'
        });

        map.set('unique', {
            name: 'unique',
            description: 'Validates that the attribute value is unique in the database table.',
            requiredParams: ['attribute'],
            optionalParams: ['allowEmpty', 'on', 'message', 'className', 'attributeName', 'criteria', 'caseSensitive'],
            examples: [
                "array('email', 'unique')",
                "array('username', 'unique', 'className' => 'User')",
                "array('email', 'unique', 'criteria' => array('condition' => 'status=1'))"
            ],
            validatorClass: 'system.validators.CUniqueValidator'
        });

        map.set('compare', {
            name: 'compare',
            description: 'Compares the attribute value with another attribute and validates if they are equal or satisfy a comparison operator.',
            requiredParams: ['attribute', 'compareAttribute'],
            optionalParams: ['allowEmpty', 'on', 'message', 'operator', 'strict'],
            examples: [
                "array('password', 'compare', 'compareAttribute' => 'passwordConfirm')",
                "array('age', 'compare', 'compareAttribute' => 'minAge', 'operator' => '>=')",
                "array('endDate', 'compare', 'compareAttribute' => 'startDate', 'operator' => '>')"
            ],
            validatorClass: 'system.validators.CCompareValidator'
        });

        map.set('exist', {
            name: 'exist',
            description: 'Validates that the attribute value exists in the specified database table.',
            requiredParams: ['attribute'],
            optionalParams: ['allowEmpty', 'on', 'message', 'className', 'attributeName', 'criteria'],
            examples: [
                "array('userId', 'exist', 'className' => 'User', 'attributeName' => 'id')",
                "array('categoryId', 'exist', 'className' => 'Category')"
            ],
            validatorClass: 'system.validators.CExistValidator'
        });

        map.set('in', {
            name: 'in',
            description: 'Validates that the attribute value is among a list of values.',
            requiredParams: ['attribute', 'range'],
            optionalParams: ['allowEmpty', 'on', 'message', 'strict'],
            examples: [
                "array('status', 'in', 'range' => array('active', 'inactive', 'pending'))",
                "array('type', 'in', 'range' => array(1, 2, 3), 'strict' => true)"
            ],
            validatorClass: 'system.validators.CRangeValidator'
        });

        map.set('date', {
            name: 'date',
            description: 'Validates that the attribute value is a valid date.',
            requiredParams: ['attribute'],
            optionalParams: ['allowEmpty', 'on', 'message', 'format'],
            examples: [
                "array('birthDate', 'date', 'format' => 'yyyy-MM-dd')",
                "array('createdAt', 'date')"
            ],
            validatorClass: 'system.validators.CDateValidator'
        });

        map.set('url', {
            name: 'url',
            description: 'Validates that the attribute value is a valid URL.',
            requiredParams: ['attribute'],
            optionalParams: ['allowEmpty', 'on', 'message', 'pattern', 'defaultScheme'],
            examples: [
                "array('website', 'url')",
                "array('website', 'url', 'defaultScheme' => 'http')"
            ],
            validatorClass: 'system.validators.CUrlValidator'
        });

        map.set('safe', {
            name: 'safe',
            description: 'Marks the attribute as safe for mass assignment. Attributes without this rule cannot be assigned via mass assignment.',
            requiredParams: ['attribute'],
            optionalParams: ['on'],
            examples: [
                "array('id', 'safe')",
                "array('createdAt, updatedAt', 'safe', 'on' => 'insert')"
            ],
            validatorClass: 'system.validators.CSafeValidator'
        });

        return map;
    }
}

