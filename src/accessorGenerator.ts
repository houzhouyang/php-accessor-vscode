import * as vscode from 'vscode';
import { parsePhpClass, PhpClass, PhpProperty } from './utils/phpParser';
import { generateGetterMethod, generateSetterMethod } from './utils/templates';

export class AccessorGenerator {
    /**
     * Generate accessors for the current active file
     */
    public async generateForCurrentFile(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'php') {
            vscode.window.showInformationMessage('Please open a PHP file to generate accessors');
            return;
        }

        await this.generateForDocument(editor.document);
    }

    /**
     * Generate accessors for a specific document
     */
    public async generateForDocument(document: vscode.TextDocument): Promise<void> {
        try {
            // Parse the PHP class
            const phpClass = parsePhpClass(document.getText());
            if (!phpClass) {
                return;
            }

            // Check if the class has the #[Data] attribute
            if (!this.hasDataAttribute(phpClass)) {
                return;
            }

            // Generate accessors
            const edit = new vscode.WorkspaceEdit();
            const accessors = this.generateAccessorsForClass(phpClass);
            
            // Find the position to insert the accessors (before the last closing brace)
            const lastLine = document.lineCount - 1;
            let insertPosition: vscode.Position | null = null;
            
            for (let i = lastLine; i >= 0; i--) {
                const line = document.lineAt(i);
                if (line.text.includes('}')) {
                    insertPosition = new vscode.Position(i, 0);
                    break;
                }
            }
            
            if (insertPosition) {
                edit.insert(document.uri, insertPosition, accessors);
                await vscode.workspace.applyEdit(edit);
            }
        } catch (error) {
            console.error('Error generating accessors:', error);
            vscode.window.showErrorMessage('Error generating accessors');
        }
    }

    /**
     * Generate setter calls for an object
     */
    public async generateSetterCalls(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'php') {
            vscode.window.showInformationMessage('Please open a PHP file to generate setter calls');
            return;
        }

        // Get the selected variable name
        const selection = editor.selection;
        const variableName = editor.document.getText(selection);
        if (!variableName) {
            vscode.window.showInformationMessage('Please select a variable name');
            return;
        }

        // Ask for the class name
        const className = await vscode.window.showInputBox({
            prompt: 'Enter the class name',
            placeHolder: 'App\\Entity'
        });

        if (!className) {
            return;
        }

        try {
            // Find the class file
            const files = await vscode.workspace.findFiles('**/*.php');
            let classFile: vscode.Uri | undefined;
            
            for (const file of files) {
                const document = await vscode.workspace.openTextDocument(file);
                const content = document.getText();
                if (content.includes(`class ${className.split('\\').pop()}`)) {
                    classFile = file;
                    break;
                }
            }
            
            if (!classFile) {
                vscode.window.showErrorMessage(`Class ${className} not found`);
                return;
            }
            
            // Parse the class
            const document = await vscode.workspace.openTextDocument(classFile);
            const phpClass = parsePhpClass(document.getText());
            if (!phpClass) {
                vscode.window.showErrorMessage(`Failed to parse class ${className}`);
                return;
            }
            
            // Generate setter calls
            let setterCalls = '';
            for (const property of phpClass.properties) {
                const setterName = `set${this.capitalizeFirstLetter(property.name)}`;
                setterCalls += `${variableName}->${setterName}(null);\n`;
            }
            
            // Insert the setter calls
            const edit = new vscode.WorkspaceEdit();
            edit.insert(editor.document.uri, selection.end, '\n' + setterCalls);
            await vscode.workspace.applyEdit(edit);
        } catch (error) {
            console.error('Error generating setter calls:', error);
            vscode.window.showErrorMessage('Error generating setter calls');
        }
    }

    /**
     * Check if the class has the #[Data] attribute
     */
    private hasDataAttribute(phpClass: PhpClass): boolean {
        return phpClass.attributes.some(attr => 
            attr === 'Data' || 
            attr === '\\PhpAccessor\\Attribute\\Data' ||
            attr === 'PhpAccessor\\Attribute\\Data'
        );
    }

    /**
     * Generate accessors for a PHP class
     */
    private generateAccessorsForClass(phpClass: PhpClass): string {
        let accessors = '';
        
        for (const property of phpClass.properties) {
            // Skip properties that already have accessors
            if (this.hasAccessors(phpClass, property)) {
                continue;
            }
            
            // Generate getter
            accessors += generateGetterMethod(property);
            
            // Generate setter
            accessors += generateSetterMethod(property);
        }
        
        return accessors;
    }

    /**
     * Check if a property already has accessors
     */
    private hasAccessors(phpClass: PhpClass, property: PhpProperty): boolean {
        const getterName = `get${this.capitalizeFirstLetter(property.name)}`;
        const setterName = `set${this.capitalizeFirstLetter(property.name)}`;
        
        return phpClass.methods.some(method => 
            method === getterName || method === setterName
        );
    }

    /**
     * Capitalize the first letter of a string
     */
    private capitalizeFirstLetter(str: string): string {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
} 