import * as vscode from 'vscode';
import { ValidationParser } from './validationParser';
import { ModelParser } from './modelParser';
import { BUILT_IN_VALIDATORS, ValidatorInfo, ParsedModel } from './validationTypes';

/**
 * Completion provider for Yii 1.1 validation rules
 */
export class ValidationCompletionProvider implements vscode.CompletionItemProvider {
    provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        context: vscode.CompletionContext
    ): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
        // Check if we're inside rules() method
        if (!ValidationParser.isInRulesMethod(document, position)) {
            return null;
        }

        const line = document.lineAt(position);
        const lineText = line.text;
        const textBeforeCursor = lineText.substring(0, position.character);
        const textAfterCursor = lineText.substring(position.character);

        const completions: vscode.CompletionItem[] = [];
        
        // Check if cursor is inside quotes (check both before and after cursor)
        const isInsideQuotes = this.isInsideQuotes(textBeforeCursor, textAfterCursor);

        // Check if there's a closing quote after cursor
        const hasClosingQuote = this.hasClosingQuoteAfter(textAfterCursor);
        
        // Check if we're typing an attribute name (first parameter)
        if (this.isTypingAttribute(textBeforeCursor)) {
            const model = ModelParser.parseModel(document);
            if (model) {
                const attributeCompletions = this.getAttributeCompletions(model, isInsideQuotes, hasClosingQuote);
                completions.push(...attributeCompletions);
            }
        }

        // Check if we're typing a validator type (second parameter)
        if (this.isTypingValidator(textBeforeCursor)) {
            const validatorCompletions = this.getValidatorCompletions(isInsideQuotes, hasClosingQuote, document, position, textBeforeCursor, textAfterCursor);
            completions.push(...validatorCompletions);
        }

        // Check if we're typing a parameter name
        if (this.isTypingParameter(textBeforeCursor)) {
            const parameterCompletions = this.getParameterCompletions(textBeforeCursor);
            completions.push(...parameterCompletions);
        }

        return completions.length > 0 ? completions : null;
    }

    /**
     * Check if cursor is inside quotes (single or double)
     * Also checks text after cursor to see if there's a closing quote
     */
    private isInsideQuotes(textBeforeCursor: string, textAfterCursor: string = ''): boolean {
        let inSingleQuote = false;
        let inDoubleQuote = false;
        let escaped = false;

        // Check text before cursor to see if we're inside a quote
        for (let i = textBeforeCursor.length - 1; i >= 0; i--) {
            const char = textBeforeCursor[i];

            if (escaped) {
                escaped = false;
                continue;
            }

            if (char === '\\') {
                escaped = true;
                continue;
            }

            if (char === "'" && !inDoubleQuote) {
                inSingleQuote = !inSingleQuote;
            } else if (char === '"' && !inSingleQuote) {
                inDoubleQuote = !inDoubleQuote;
            }
        }

        // If we're inside a quote, check if there's a closing quote after cursor
        if (inSingleQuote || inDoubleQuote) {
            const expectedQuote = inSingleQuote ? "'" : '"';
            
            // Check if there's a closing quote immediately after cursor (possibly with whitespace)
            const trimmedAfter = textAfterCursor.trim();
            if (trimmedAfter.startsWith(expectedQuote)) {
                // There's a closing quote, we're definitely inside quotes
                return true;
            }
            
            // Check if there's a closing quote somewhere after (not escaped)
            let afterEscaped = false;
            for (let i = 0; i < textAfterCursor.length; i++) {
                const char = textAfterCursor[i];
                
                if (afterEscaped) {
                    afterEscaped = false;
                    continue;
                }
                
                if (char === '\\') {
                    afterEscaped = true;
                    continue;
                }
                
                if (char === expectedQuote) {
                    // Found closing quote, we're inside quotes
                    return true;
                }
                
                // If we hit a comma, closing paren/bracket, or newline before finding quote,
                // we might not be in a complete quote context
                if (char === ',' || char === ')' || char === ']' || char === '\n') {
                    // Still consider it inside quotes if we opened one before cursor
                    return true;
                }
            }
            
            // We opened a quote but no closing quote found - still inside quotes
            return true;
        }

        return false;
    }

    /**
     * Check if there's a closing quote immediately after cursor
     */
    private hasClosingQuoteAfter(textAfterCursor: string): boolean {
        const trimmed = textAfterCursor.trim();
        return trimmed.startsWith("'") || trimmed.startsWith('"');
    }

    /**
     * Find the range of quotes (opening and closing) around the cursor position
     * Returns the range to replace, or null if no quotes found
     */
    private findQuoteRange(
        textBeforeCursor: string,
        textAfterCursor: string,
        position: vscode.Position
    ): vscode.Range | null {
        // Find opening quote before cursor
        let openingQuotePos = -1;
        let openingQuoteChar = '';
        let escaped = false;
        
        // Search backwards from cursor for opening quote
        for (let i = textBeforeCursor.length - 1; i >= 0; i--) {
            const char = textBeforeCursor[i];
            
            if (escaped) {
                escaped = false;
                continue;
            }
            
            if (char === '\\') {
                escaped = true;
                continue;
            }
            
            if ((char === "'" || char === '"') && !escaped) {
                openingQuotePos = i;
                openingQuoteChar = char;
                break;
            }
        }
        
        if (openingQuotePos === -1) {
            return null;
        }
        
        // Find closing quote after cursor
        let closingQuotePos = -1;
        escaped = false;
        
        // Search forwards from cursor for closing quote
        for (let i = 0; i < textAfterCursor.length; i++) {
            const char = textAfterCursor[i];
            
            if (escaped) {
                escaped = false;
                continue;
            }
            
            if (char === '\\') {
                escaped = true;
                continue;
            }
            
            if (char === openingQuoteChar && !escaped) {
                closingQuotePos = i;
                break;
            }
        }
        
        if (closingQuotePos === -1) {
            return null;
        }
        
        // Calculate the range (including both quotes)
        const startPos = new vscode.Position(
            position.line,
            position.character - (textBeforeCursor.length - openingQuotePos)
        );
        const endPos = new vscode.Position(
            position.line,
            position.character + 1
        );
        
        return new vscode.Range(startPos, endPos);
    }

    /**
     * Check if user is typing an attribute name
     */
    private isTypingAttribute(textBeforeCursor: string): boolean {
        // Pattern: array(' or array(" or [' or ["
        return /(?:array\s*\(|\[)\s*['"]?[^'"]*$/.test(textBeforeCursor) ||
               /,\s*['"]?[^'"]*$/.test(textBeforeCursor);
    }

    /**
     * Check if user is typing a validator type
     */
    private isTypingValidator(textBeforeCursor: string): boolean {
        // Pattern: array('attribute', ' or array('attribute', " or ['attribute', ' or ['attribute', "
        return /(?:array\s*\(|\[)\s*['"][^'"]+['"]\s*,\s*['"]?[^'"]*$/.test(textBeforeCursor);
    }

    /**
     * Check if user is typing a parameter name
     */
    private isTypingParameter(textBeforeCursor: string): boolean {
        // Pattern: array('attr', 'validator', 'param' => or ['attr', 'validator', 'param' =>
        return /(?:array\s*\(|\[)[^)\]]+,\s*['"]?[^'"]*['"]?\s*,\s*['"]?[^'"]*['"]?\s*=>/.test(textBeforeCursor) ||
               /['"]?(\w+)['"]?\s*=>/.test(textBeforeCursor);
    }

    /**
     * Get completion items for model attributes
     */
    private getAttributeCompletions(model: ParsedModel, isInsideQuotes: boolean, hasClosingQuote: boolean): vscode.CompletionItem[] {
        const items: vscode.CompletionItem[] = [];

        for (const attribute of model.attributes) {
            const item = new vscode.CompletionItem(
                attribute.name,
                vscode.CompletionItemKind.Property
            );
            item.detail = `Model attribute (${attribute.type})`;
            item.documentation = `Attribute from ${model.className} model`;
            // Don't add quotes if already inside quotes or if there's a closing quote after cursor
            item.insertText = (isInsideQuotes || hasClosingQuote) ? attribute.name : `'${attribute.name}'`;
            items.push(item);
        }

        return items;
    }

    /**
     * Get completion items for validators
     */
    private getValidatorCompletions(
        isInsideQuotes: boolean, 
        hasClosingQuote: boolean, 
        document: vscode.TextDocument, 
        position: vscode.Position,
        textBeforeCursor: string,
        textAfterCursor: string
    ): vscode.CompletionItem[] {
        const items: vscode.CompletionItem[] = [];
        const validatorInfo = this.getValidatorInfo();
        const shouldRemoveQuotes = isInsideQuotes || hasClosingQuote;

        for (const validator of BUILT_IN_VALIDATORS) {
            const info = validatorInfo.get(validator);
            const item = new vscode.CompletionItem(
                validator,
                vscode.CompletionItemKind.Enum
            );
            item.detail = info?.description || `Yii 1.1 ${validator} validator`;
            item.documentation = info ? this.formatValidatorDocumentation(info) : undefined;
            
            // Use SnippetString if insertText contains snippet placeholders
            if (info?.insertText) {
                let insertText = info.insertText;
                
                if (insertText.includes('${')) {
                    item.insertText = new vscode.SnippetString(insertText);
                } else {
                    item.insertText = insertText;
                }

                // If cursor is between quotes, replace everything from opening quote to closing quote
                if (shouldRemoveQuotes && hasClosingQuote) {
                    const quoteRange = this.findQuoteRange(textBeforeCursor, textAfterCursor, position);
                    if (quoteRange) {
                        
                        let startQuoteRange = new vscode.Range(quoteRange.start, new vscode.Position(quoteRange.start.line, quoteRange.start.character + 1));
                        let endQuoteRange = new vscode.Range(new vscode.Position(quoteRange.end.line, quoteRange.end.character - 1), quoteRange.end);
                        item.additionalTextEdits = [
                            vscode.TextEdit.delete(startQuoteRange),
                            vscode.TextEdit.delete(endQuoteRange),
                        ];
                       
                    }
                }
            }
            
            items.push(item);
        }

        // Add custom validator option
        const customItem = new vscode.CompletionItem(
            'validateMethodName',
            vscode.CompletionItemKind.Method
        );
        customItem.detail = 'Custom validator method';
        customItem.documentation = 'Use a custom validation method in the model class';
        const customInsertText = shouldRemoveQuotes 
            ? 'validate${1:MethodName}' 
            : "'validate${1:MethodName}'";
        customItem.insertText = new vscode.SnippetString(customInsertText);
        items.push(customItem);

        return items;
    }

    /**
     * Remove quotes from insertText when cursor is inside quotes
     * Examples:
     *   "'email'" -> "email" (removes both quotes)
     *   "'numerical', 'integerOnly' => ${1:true}" -> "numerical', 'integerOnly' => ${1:true}" (removes leading quote only)
     */
    private removeQuotesFromInsertText(text: string, hasClosingQuoteAfter: boolean): string {
        // Remove leading quote (single or double) if present
        let result = text.replace(/^['"]/, '');
        
        // If there's a closing quote after cursor, also remove trailing quote from insertText
        // This prevents double quotes like: 'numerical''
        if (hasClosingQuoteAfter) {
            // Remove trailing quote if present (only if it's a simple case without comma)
            // For complex cases with parameters, we only want to remove the first ending quote
            const firstCommaIndex = result.indexOf(',');
            if (firstCommaIndex === -1) {
                // Simple case: remove trailing quote
                result = result.replace(/['"]$/, '');
            } else {
                // Complex case: find and remove the first ending quote (before the comma)
                const beforeComma = result.substring(0, firstCommaIndex);
                const afterComma = result.substring(firstCommaIndex);
                
                // Remove trailing quote from beforeComma if present
                const cleanedBeforeComma = beforeComma.replace(/['"]$/, '');
                result = cleanedBeforeComma + afterComma;
            }
        }
        
        return result;
    }

    /**
     * Get completion items for rule parameters
     */
    private getParameterCompletions(textBeforeCursor: string): vscode.CompletionItem[] {
        const items: vscode.CompletionItem[] = [];

        // Common parameters
        const commonParams = [
            { name: 'on', description: 'Scenario name', example: "'on' => 'scenario'" },
            { name: 'allowEmpty', description: 'Allow empty values', example: "'allowEmpty' => true" },
            { name: 'safe', description: 'Safe for mass assignment', example: "'safe' => true" },
            { name: 'message', description: 'Custom error message', example: "'message' => 'Custom error'" },
            { name: 'scenario', description: 'Scenario name', example: "'scenario' => 'scenario'" },
            { name: 'except', description: 'Except scenario name', example: "'except' => 'scenario'" },
        ];

        for (const param of commonParams) {
            const item = new vscode.CompletionItem(
                param.name,
                vscode.CompletionItemKind.Property
            );
            item.detail = param.description;
            item.documentation = `Example: ${param.example}`;
            item.insertText = `'${param.name}' => `;
            items.push(item);
        }

        return items;
    }

    /**
     * Get validator information map
     */
    private getValidatorInfo(): Map<string, ValidatorInfo> {
        const map = new Map<string, ValidatorInfo>();

        map.set('required', {
            name: 'required',
            description: 'Validates that the attribute value is not empty',
            requiredParams: ['attribute'],
            optionalParams: ['allowEmpty', 'on', 'message'],
            examples: [
                "array('username', 'required')",
                "array('email', 'required', 'on' => 'register')"
            ],
            validatorClass: 'system.validators.CRequiredValidator',
            insertText:  "'required'"
        });

        map.set('email', {
            name: 'email',
            description: 'Validates that the attribute value is a valid email address',
            requiredParams: ['attribute'],
            optionalParams: ['allowEmpty', 'on', 'message', 'pattern'],
            examples: [
                "array('email', 'email')",
                "array('email', 'email', 'allowEmpty' => true)"
            ],
            validatorClass: 'system.validators.CEmailValidator',
            insertText: "'email'"
        });

        map.set('numerical', {
            name: 'numerical',
            description: 'Validates that the attribute value is a number',
            requiredParams: ['attribute'],
            optionalParams: ['allowEmpty', 'on', 'message', 'integerOnly', 'min', 'max'],
            examples: [
                "array('age', 'numerical')",
                "array('age', 'numerical', 'integerOnly' => true, 'min' => 18, 'max' => 100)"
            ],
            validatorClass: 'system.validators.CNumberValidator',
            insertText: "'numerical', 'integerOnly' => ${1:true}, 'min' => ${2:0}, 'max' => ${3:100}"
        });

        map.set('length', {
            name: 'length',
            description: 'Validates the length of a string attribute',
            requiredParams: ['attribute'],
            optionalParams: ['allowEmpty', 'on', 'message', 'min', 'max', 'is', 'tooShort', 'tooLong'],
            examples: [
                "array('username', 'length', 'min' => 3, 'max' => 20)",
                "array('password', 'length', 'is' => 8)"
            ],
            validatorClass: 'system.validators.CStringValidator',
            insertText: "'length', 'min' => ${1:3}, 'max' => ${2:20}"
        });

        map.set('unique', {
            name: 'unique',
            description: 'Validates that the attribute value is unique in the database',
            requiredParams: ['attribute'],
            optionalParams: ['allowEmpty', 'on', 'message', 'className', 'attributeName', 'criteria'],
            examples: [
                "array('email', 'unique')",
                "array('username', 'unique', 'className' => 'User')"
            ],
            validatorClass: 'system.validators.CUniqueValidator',
            insertText: "'unique', 'className' => '${1:User}'"
        });

        map.set('compare', {
            name: 'compare',
            description: 'Compares the attribute value with another attribute',
            requiredParams: ['attribute', 'compareAttribute'],
            optionalParams: ['allowEmpty', 'on', 'message', 'operator'],
            examples: [
                "array('password', 'compare', 'compareAttribute' => 'passwordConfirm')",
                "array('age', 'compare', 'compareAttribute' => 'minAge', 'operator' => '>=')"
            ],
            validatorClass: 'system.validators.CCompareValidator',
            insertText: "'compare', 'compareAttribute' => '${1:passwordConfirm}'"
        });

        map.set('boolean', {
            name: 'boolean',
            description: 'Ensures the attribute has a value that is either CBooleanValidator::trueValue or CBooleanValidator::falseValue',
            requiredParams: ['attribute'],
            optionalParams: ['allowEmpty', 'on', 'message', 'trueValue', 'falseValue', 'strict'],
            examples: [
                "array('isActive', 'boolean')",
                "array('isPublished', 'boolean', 'trueValue' => 1, 'falseValue' => 0)"
            ],
            validatorClass: 'system.validators.CBooleanValidator',
            insertText: "'boolean', 'trueValue' => ${1:1}, 'falseValue' => ${2:0}"
        });

        map.set('captcha', {
            name: 'captcha',
            description: 'Ensures the attribute is equal to the verification code displayed in a CAPTCHA',
            requiredParams: ['attribute'],
            optionalParams: ['allowEmpty', 'on', 'message', 'caseSensitive'],
            examples: [
                "array('verifyCode', 'captcha')",
                "array('captcha', 'captcha', 'caseSensitive' => false)"
            ],
            validatorClass: 'system.validators.CCaptchaValidator',
            insertText: "'captcha', 'caseSensitive' => ${1:false}"
        });

        map.set('date', {
            name: 'date',
            description: 'Ensures the attribute represents a valid date, time, or datetime value',
            requiredParams: ['attribute'],
            optionalParams: ['allowEmpty', 'on', 'message', 'format'],
            examples: [
                "array('birthDate', 'date', 'format' => 'yyyy-MM-dd')",
                "array('createdAt', 'date')"
            ],
            validatorClass: 'system.validators.CDateValidator',
            insertText: "'date', 'format' => '${1:yyyy-MM-dd}'"
        });

        map.set('default', {
            name: 'default',
            description: 'Assigns a default value to the specified attributes',
            requiredParams: ['attribute', 'value'],
            optionalParams: ['on', 'setOnEmpty'],
            examples: [
                "array('status', 'default', 'value' => 'pending')",
                "array('createdAt', 'default', 'value' => date('Y-m-d H:i:s'), 'setOnEmpty' => true)"
            ],
            validatorClass: 'system.validators.CDefaultValueValidator',
            insertText: "'default', 'value' => '${1:pending}'"
        });

        map.set('exist', {
            name: 'exist',
            description: 'Ensures the attribute value can be found in the specified table column',
            requiredParams: ['attribute'],
            optionalParams: ['allowEmpty', 'on', 'message', 'className', 'attributeName', 'criteria'],
            examples: [
                "array('userId', 'exist', 'className' => 'User', 'attributeName' => 'id')",
                "array('categoryId', 'exist', 'className' => 'Category')"
            ],
            validatorClass: 'system.validators.CExistValidator',
            insertText: "'exist', 'className' => '${1:User}', 'attributeName' => '${2:id}'"
        });

        map.set('file', {
            name: 'file',
            description: 'Ensures the attribute contains the name of an uploaded file',
            requiredParams: ['attribute'],
            optionalParams: ['allowEmpty', 'on', 'message', 'types', 'maxSize', 'minSize', 'tooLarge', 'tooSmall', 'wrongType'],
            examples: [
                "array('avatar', 'file', 'types' => 'jpg, jpeg, png, gif', 'maxSize' => 1024*1024)",
                "array('document', 'file', 'types' => array('pdf', 'doc', 'docx'))"
            ],
            validatorClass: 'system.validators.CFileValidator',
            insertText: "'file', 'types' => '${1:jpg, jpeg, png, gif}', 'maxSize' => ${2:1024*1024}"
        });

        map.set('filter', {
            name: 'filter',
            description: 'Transforms the attribute with a filter',
            requiredParams: ['attribute', 'filter'],
            optionalParams: ['on', 'skipOnError'],
            examples: [
                "array('username', 'filter', 'filter' => 'trim')",
                "array('email', 'filter', 'filter' => 'strtolower')"
            ],
            validatorClass: 'system.validators.CFilterValidator',
            insertText: "'filter', 'filter' => '${1:trim}'"  
        });

        map.set('in', {
            name: 'in',
            description: 'Ensures the data is among a pre-specified list of values',
            requiredParams: ['attribute', 'range'],
            optionalParams: ['allowEmpty', 'on', 'message', 'strict'],
            examples: [
                "array('status', 'in', 'range' => array('active', 'inactive', 'pending'))",
                "array('type', 'in', 'range' => array(1, 2, 3), 'strict' => true)"
            ],
            validatorClass: 'system.validators.CRangeValidator',
            insertText: "'in', 'range' => array('${1:active}', '${2:inactive}', '${3:pending}')"
        });

        map.set('match', {
            name: 'match',
            description: 'Ensures the data matches a regular expression',
            requiredParams: ['attribute', 'pattern'],
            optionalParams: ['allowEmpty', 'on', 'message', 'not'],
            examples: [
                "array('username', 'match', 'pattern' => '/^[a-z0-9_]+$/i')",
                "array('phone', 'match', 'pattern' => '/^\\d{10}$/', 'message' => 'Phone must be 10 digits')"
            ],
            validatorClass: 'system.validators.CRegularExpressionValidator',
            insertText: "'match', 'pattern' => '/^[a-z0-9_]+$/i'"
        });

        map.set('type', {
            name: 'type',
            description: 'Ensures the attribute is of specific data type',
            requiredParams: ['attribute', 'type'],
            optionalParams: ['allowEmpty', 'on', 'message'],
            examples: [
                "array('age', 'type', 'type' => 'integer')",
                "array('price', 'type', 'type' => 'float')",
                "array('tags', 'type', 'type' => 'array')"
            ],
            validatorClass: 'system.validators.CTypeValidator',
            insertText: "'type', 'type' => '${1:integer}'"
        });

        map.set('url', {
            name: 'url',
            description: 'Ensures the data is a valid URL',
            requiredParams: ['attribute'],
            optionalParams: ['allowEmpty', 'on', 'message', 'pattern', 'defaultScheme'],
            examples: [
                "array('website', 'url')",
                "array('website', 'url', 'defaultScheme' => 'http')"
            ],
            validatorClass: 'system.validators.CUrlValidator',
            insertText: "'url', 'defaultScheme' => '${1:http}'"
        });

        return map;
    }

    /**
     * Format validator documentation
     */
    private formatValidatorDocumentation(info: ValidatorInfo): string {
        let doc = `**${info.name}**\n\n${info.description}\n\n`;
        
        if (info.requiredParams.length > 0) {
            doc += `**Required:** ${info.requiredParams.join(', ')}\n`;
        }
        
        if (info.optionalParams.length > 0) {
            doc += `**Optional:** ${info.optionalParams.join(', ')}\n`;
        }
        
        if (info.examples.length > 0) {
            doc += `\n**Examples:**\n`;
            info.examples.forEach(ex => {
                doc += `\`${ex}\`\n`;
            });
        }

        return doc;
    }
}

