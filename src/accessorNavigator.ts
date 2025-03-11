import * as vscode from 'vscode';
import { parsePhpClass } from './utils/phpParser';

export class AccessorNavigator {
    /**
     * Navigate from an accessor to its property
     */
    public async navigateToProperty(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'php') {
            return;
        }

        const position = editor.selection.active;
        const wordRange = editor.document.getWordRangeAtPosition(position);
        if (!wordRange) {
            return;
        }

        const word = editor.document.getText(wordRange);
        if (!word.startsWith('get') && !word.startsWith('set')) {
            vscode.window.showInformationMessage('Not an accessor method');
            return;
        }

        // Extract property name from accessor
        const propertyName = word.substring(3).charAt(0).toLowerCase() + word.substring(4);
        
        // Find the property in the document
        const text = editor.document.getText();
        const propertyRegex = new RegExp(`(public|protected|private)\\s+(?:readonly\\s+)?(?:\\w+\\s+)?\\$${propertyName}`, 'g');
        const match = propertyRegex.exec(text);
        
        if (match) {
            const propertyPos = editor.document.positionAt(match.index);
            editor.selection = new vscode.Selection(propertyPos, propertyPos);
            editor.revealRange(new vscode.Range(propertyPos, propertyPos));
        } else {
            vscode.window.showInformationMessage(`Property $${propertyName} not found`);
        }
    }

    /**
     * Navigate from a property to its accessors
     */
    public async navigateToAccessor(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'php') {
            return;
        }

        const position = editor.selection.active;
        const line = editor.document.lineAt(position.line).text;
        
        // Check if the line contains a property declaration
        const propertyMatch = line.match(/\$(\w+)/);
        if (!propertyMatch) {
            vscode.window.showInformationMessage('Not a property declaration');
            return;
        }

        const propertyName = propertyMatch[1];
        const capitalizedName = propertyName.charAt(0).toUpperCase() + propertyName.slice(1);
        
        // Find the getter and setter in the document
        const text = editor.document.getText();
        const getterRegex = new RegExp(`function\\s+get${capitalizedName}\\s*\\(`, 'g');
        const setterRegex = new RegExp(`function\\s+set${capitalizedName}\\s*\\(`, 'g');
        
        const getterMatch = getterRegex.exec(text);
        const setterMatch = setterRegex.exec(text);
        
        if (getterMatch || setterMatch) {
            // Show a quick pick to choose between getter and setter
            const options = [];
            if (getterMatch) {
                options.push('Getter');
            }
            if (setterMatch) {
                options.push('Setter');
            }
            
            const choice = await vscode.window.showQuickPick(options, {
                placeHolder: 'Navigate to...'
            });
            
            if (choice === 'Getter' && getterMatch) {
                const getterPos = editor.document.positionAt(getterMatch.index);
                editor.selection = new vscode.Selection(getterPos, getterPos);
                editor.revealRange(new vscode.Range(getterPos, getterPos));
            } else if (choice === 'Setter' && setterMatch) {
                const setterPos = editor.document.positionAt(setterMatch.index);
                editor.selection = new vscode.Selection(setterPos, setterPos);
                editor.revealRange(new vscode.Range(setterPos, setterPos));
            }
        } else {
            vscode.window.showInformationMessage(`No accessors found for $${propertyName}`);
        }
    }

    /**
     * Get a definition provider for navigating between properties and accessors
     */
    public getDefinitionProvider(): vscode.DefinitionProvider {
        return {
            provideDefinition: (document, position, token) => {
                const wordRange = document.getWordRangeAtPosition(position);
                if (!wordRange) {
                    return null;
                }

                const word = document.getText(wordRange);
                const text = document.getText();
                
                // If it's an accessor method call
                if (word.startsWith('get') || word.startsWith('set')) {
                    const propertyName = word.substring(3).charAt(0).toLowerCase() + word.substring(4);
                    const propertyRegex = new RegExp(`(public|protected|private)\\s+(?:readonly\\s+)?(?:\\w+\\s+)?\\$${propertyName}`, 'g');
                    const match = propertyRegex.exec(text);
                    
                    if (match) {
                        const propertyPos = document.positionAt(match.index);
                        return new vscode.Location(document.uri, propertyPos);
                    }
                }
                
                // If it's a property
                if (word.startsWith('$')) {
                    const propertyName = word.substring(1);
                    const capitalizedName = propertyName.charAt(0).toUpperCase() + propertyName.slice(1);
                    
                    const getterRegex = new RegExp(`function\\s+get${capitalizedName}\\s*\\(`, 'g');
                    const getterMatch = getterRegex.exec(text);
                    
                    if (getterMatch) {
                        const getterPos = document.positionAt(getterMatch.index);
                        return new vscode.Location(document.uri, getterPos);
                    }
                }
                
                return null;
            }
        };
    }

    /**
     * Get a reference provider for finding all references to properties and accessors
     */
    public getReferenceProvider(): vscode.ReferenceProvider {
        return {
            provideReferences: (document, position, context, token) => {
                const wordRange = document.getWordRangeAtPosition(position);
                if (!wordRange) {
                    return null;
                }

                const word = document.getText(wordRange);
                const text = document.getText();
                const locations: vscode.Location[] = [];
                
                // If it's a property
                if (word.startsWith('$')) {
                    const propertyName = word.substring(1);
                    const capitalizedName = propertyName.charAt(0).toUpperCase() + propertyName.slice(1);
                    
                    // Find getter and setter definitions
                    const getterRegex = new RegExp(`function\\s+get${capitalizedName}\\s*\\(`, 'g');
                    const setterRegex = new RegExp(`function\\s+set${capitalizedName}\\s*\\(`, 'g');
                    
                    let match;
                    while ((match = getterRegex.exec(text)) !== null) {
                        const pos = document.positionAt(match.index);
                        locations.push(new vscode.Location(document.uri, pos));
                    }
                    
                    while ((match = setterRegex.exec(text)) !== null) {
                        const pos = document.positionAt(match.index);
                        locations.push(new vscode.Location(document.uri, pos));
                    }
                    
                    // Find accessor calls
                    const getterCallRegex = new RegExp(`->get${capitalizedName}\\s*\\(`, 'g');
                    const setterCallRegex = new RegExp(`->set${capitalizedName}\\s*\\(`, 'g');
                    
                    while ((match = getterCallRegex.exec(text)) !== null) {
                        const pos = document.positionAt(match.index + 2); // Position at 'g' in 'get'
                        locations.push(new vscode.Location(document.uri, pos));
                    }
                    
                    while ((match = setterCallRegex.exec(text)) !== null) {
                        const pos = document.positionAt(match.index + 2); // Position at 's' in 'set'
                        locations.push(new vscode.Location(document.uri, pos));
                    }
                }
                
                // If it's an accessor
                if (word.startsWith('get') || word.startsWith('set')) {
                    const propertyName = word.substring(3).charAt(0).toLowerCase() + word.substring(4);
                    
                    // Find the property
                    const propertyRegex = new RegExp(`(public|protected|private)\\s+(?:readonly\\s+)?(?:\\w+\\s+)?\\$${propertyName}`, 'g');
                    const match = propertyRegex.exec(text);
                    
                    if (match) {
                        const propertyPos = document.positionAt(match.index);
                        locations.push(new vscode.Location(document.uri, propertyPos));
                    }
                    
                    // Find accessor calls
                    const accessorCallRegex = new RegExp(`->${word}\\s*\\(`, 'g');
                    let callMatch;
                    
                    while ((callMatch = accessorCallRegex.exec(text)) !== null) {
                        const pos = document.positionAt(callMatch.index + 2); // Position at the start of the method name
                        locations.push(new vscode.Location(document.uri, pos));
                    }
                }
                
                return locations;
            }
        };
    }
} 