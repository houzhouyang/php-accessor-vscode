import * as vscode from 'vscode';
import { AccessorNavigator } from './accessorNavigator';

export function activate(context: vscode.ExtensionContext) {
    console.log('PHP Accessor is now active!');
    
    const navigator = new AccessorNavigator();

    // 注册命令
    let disposables = [
        vscode.commands.registerCommand('php-accessor-vscode.helloWorld', () => {
            vscode.window.showInformationMessage('Hello from PHP Accessor!');
        }),
        vscode.commands.registerCommand('php-accessor-vscode.navigateToProperty', async () => {
            try {
                await navigator.navigateToProperty();
            } catch (error) {
                vscode.window.showErrorMessage(`导航到属性失败: ${error}`);
            }
        }),
        vscode.commands.registerCommand('php-accessor-vscode.navigateToAccessor', async () => {
            try {
                await navigator.navigateToAccessor();
            } catch (error) {
                vscode.window.showErrorMessage(`导航到访问器失败: ${error}`);
            }
        })
    ];

    // 注册提供者
    disposables.push(
        vscode.languages.registerDefinitionProvider({ language: 'php' }, navigator.getDefinitionProvider()),
        vscode.languages.registerReferenceProvider({ language: 'php' }, navigator.getReferenceProvider())
    );

    context.subscriptions.push(...disposables);
}

export function deactivate() {}

