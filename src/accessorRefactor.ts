import * as vscode from 'vscode';

export class AccessorRefactor {
    /**
     * Get a rename provider for refactoring properties and accessors
     */
    public getRenameProvider(): vscode.RenameProvider {
        return {
            prepareRename: (document, position, token) => {
                const wordRange = document.getWordRangeAtPosition(position);
                if (!wordRange) {
                    return null;
                }

                const word = document.getText(wordRange);
                
                // Check if it's a property or accessor
                if (word.startsWith('$') || word.startsWith('get') || word.startsWith('set')) {
                    return wordRange;
                }
                
                return null;
            },
            
            provideRenameEdits: (document, position, newName, token) => {
                const wordRange = document.getWordRangeAtPosition(position);
                if (!wordRange) {
                    return null;
                }

                const word = document.getText(wordRange);
                const text = document.getText();
                const edit = new vscode.WorkspaceEdit();
                
                // If it's a property
                if (word.startsWith('$')) {
                    const propertyName = word.substring(1);
                    const capitalizedName = propertyName.charAt(0).toUpperCase() + propertyName.slice(1);
                    
                    // New property name without $
                    const newPropertyName = newName.startsWith('$') ? newName.substring(1) : newName;
                    const newCapitalizedName = newPropertyName.charAt(0).toUpperCase() + newPropertyName.slice(1);
                    
                    // Rename property
                    const propertyRegex = new RegExp(`\\$${propertyName}\\b`, 'g');
                    let match;
                    
                    while ((match = propertyRegex.exec(text)) !== null) {
                        const start = document.positionAt(match.index);
                        const end = document.positionAt(match.index + propertyName.length + 1);
                        edit.replace(document.uri, new vscode.Range(start, end), `$${newPropertyName}`);
                    }
                    
                    // Rename getter
                    const getterRegex = new RegExp(`get${capitalizedName}\\b`, 'g');
                    while ((match = getterRegex.exec(text)) !== null) {
                        const start = document.positionAt(match.index);
                        const end = document.positionAt(match.index + capitalizedName.length + 3);
                        edit.replace(document.uri, new vscode.Range(start, end), `get${newCapitalizedName}`);
                    }
                    
                    // Rename setter
                    const setterRegex = new RegExp(`set${capitalizedName}\\b`, 'g');
                    while ((match = setterRegex.exec(text)) !== null) {
                        const start = document.positionAt(match.index);
                        const end = document.positionAt(match.index + capitalizedName.length + 3);
                        edit.replace(document.uri, new vscode.Range(start, end), `set${newCapitalizedName}`);
                    }
                }
                
                // If it's a getter or setter
                if (word.startsWith('get') || word.startsWith('set')) {
                    const prefix = word.substring(0, 3); // 'get' or 'set'
                    const propertyNameCapitalized = word.substring(3);
                    const propertyName = propertyNameCapitalized.charAt(0).toLowerCase() + propertyNameCapitalized.slice(1);
                    
                    // New method name
                    if (!newName.startsWith(prefix)) {
                        vscode.window.showErrorMessage(`New name must start with '${prefix}'`);
                        return null;
                    }
                    
                    const newPropertyNameCapitalized = newName.substring(3);
                    const newPropertyName = newPropertyNameCapitalized.charAt(0).toLowerCase() + newPropertyNameCapitalized.slice(1);
                    
                    // Rename accessor method
                    const accessorRegex = new RegExp(`${prefix}${propertyNameCapitalized}\\b`, 'g');
                    let match;
                    
                    while ((match = accessorRegex.exec(text)) !== null) {
                        const start = document.positionAt(match.index);
                        const end = document.positionAt(match.index + propertyNameCapitalized.length + 3);
                        edit.replace(document.uri, new vscode.Range(start, end), newName);
                    }
                    
                    // Rename property
                    const propertyRegex = new RegExp(`\\$${propertyName}\\b`, 'g');
                    while ((match = propertyRegex.exec(text)) !== null) {
                        const start = document.positionAt(match.index);
                        const end = document.positionAt(match.index + propertyName.length + 1);
                        edit.replace(document.uri, new vscode.Range(start, end), `$${newPropertyName}`);
                    }
                    
                    // Rename the other accessor (getter if this is setter, or vice versa)
                    const otherPrefix = prefix === 'get' ? 'set' : 'get';
                    const otherAccessorRegex = new RegExp(`${otherPrefix}${propertyNameCapitalized}\\b`, 'g');
                    
                    while ((match = otherAccessorRegex.exec(text)) !== null) {
                        const start = document.positionAt(match.index);
                        const end = document.positionAt(match.index + propertyNameCapitalized.length + 3);
                        edit.replace(document.uri, new vscode.Range(start, end), `${otherPrefix}${newPropertyNameCapitalized}`);
                    }
                }
                
                return edit;
            }
        };
    }
} 