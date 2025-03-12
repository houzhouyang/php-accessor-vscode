import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
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
        
        // First, try to find the property in the current document
        const text = editor.document.getText();
        const propertyRegex = new RegExp(`(public|protected|private)\\s+(?:readonly\\s+)?(?:\\w+\\s+)?\\$${propertyName}`, 'g');
        const match = propertyRegex.exec(text);
        
        if (match) {
            const propertyPos = editor.document.positionAt(match.index);
            editor.selection = new vscode.Selection(propertyPos, propertyPos);
            editor.revealRange(new vscode.Range(propertyPos, propertyPos));
            return;
        }
        
        // If not found in current document, try to find in .php-accessor proxy classes
        try {
            // Get the current file path
            const currentFilePath = editor.document.uri.fsPath;
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
            
            if (workspaceFolder) {
                // Look for a .php-accessor directory in the workspace
                const phpAccessorDir = path.join(path.dirname(currentFilePath), '.php-accessor');
                
                // If directory exists, search for property in proxy classes
                if (fs.existsSync(phpAccessorDir)) {
                    // Get class name from current file
                    const className = this.getClassNameFromDocument(editor.document);
                    if (!className) {
                        vscode.window.showInformationMessage(`Property $${propertyName} not found, and couldn't determine class name.`);
                        return;
                    }
                    
                    // Look for a proxy class file
                    const proxyFiles = fs.readdirSync(phpAccessorDir)
                        .filter(file => file.endsWith('.php') && file.includes(className));
                    
                    if (proxyFiles.length > 0) {
                        // Open the first matching proxy file
                        const proxyFilePath = path.join(phpAccessorDir, proxyFiles[0]);
                        const proxyDoc = await vscode.workspace.openTextDocument(proxyFilePath);
                        
                        // Search for the property in the proxy file
                        const proxyText = proxyDoc.getText();
                        const proxyMatch = propertyRegex.exec(proxyText);
                        
                        if (proxyMatch) {
                            // Open the file and navigate to the property
                            const propertyPos = proxyDoc.positionAt(proxyMatch.index);
                            const editor = await vscode.window.showTextDocument(proxyDoc);
                            editor.selection = new vscode.Selection(propertyPos, propertyPos);
                            editor.revealRange(new vscode.Range(propertyPos, propertyPos));
                            return;
                        }
                    }
                }
            }
            
            // If we get here, the property was not found anywhere
            vscode.window.showInformationMessage(`Property $${propertyName} not found in current file or proxy classes.`);
        } catch (error) {
            console.error('Error searching for property in proxy classes:', error);
            vscode.window.showInformationMessage(`Property $${propertyName} not found in current document.`);
        }
    }

    /**
     * Get the class name from a document
     */
    private getClassNameFromDocument(document: vscode.TextDocument): string | null {
        const text = document.getText();
        const classMatch = text.match(/class\s+(\w+)/);
        return classMatch ? classMatch[1] : null;
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
                return;
            } else if (choice === 'Setter' && setterMatch) {
                const setterPos = editor.document.positionAt(setterMatch.index);
                editor.selection = new vscode.Selection(setterPos, setterPos);
                editor.revealRange(new vscode.Range(setterPos, setterPos));
                return;
            }
        }
        
        // If not found in current document, try to find in .php-accessor proxy classes
        try {
            // Get the current file path
            const currentFilePath = editor.document.uri.fsPath;
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
            
            if (workspaceFolder) {
                // Look for a .php-accessor directory in the workspace
                const phpAccessorDir = path.join(path.dirname(currentFilePath), '.php-accessor');
                
                // If directory exists, search for accessors in proxy classes
                if (fs.existsSync(phpAccessorDir)) {
                    // Get class name from current file
                    const className = this.getClassNameFromDocument(editor.document);
                    if (!className) {
                        vscode.window.showInformationMessage(`Accessors for $${propertyName} not found, and couldn't determine class name.`);
                        return;
                    }
                    
                    // Look for a proxy class file
                    const proxyFiles = fs.readdirSync(phpAccessorDir)
                        .filter(file => file.endsWith('.php') && file.includes(className));
                    
                    if (proxyFiles.length > 0) {
                        // Open the first matching proxy file
                        const proxyFilePath = path.join(phpAccessorDir, proxyFiles[0]);
                        const proxyDoc = await vscode.workspace.openTextDocument(proxyFilePath);
                        
                        // Search for the accessors in the proxy file
                        const proxyText = proxyDoc.getText();
                        const proxyGetterMatch = getterRegex.exec(proxyText);
                        const proxySetterMatch = setterRegex.exec(proxyText);
                        
                        if (proxyGetterMatch || proxySetterMatch) {
                            // Show a quick pick to choose between getter and setter
                            const options = [];
                            if (proxyGetterMatch) {
                                options.push('Getter (in proxy class)');
                            }
                            if (proxySetterMatch) {
                                options.push('Setter (in proxy class)');
                            }
                            
                            const choice = await vscode.window.showQuickPick(options, {
                                placeHolder: 'Navigate to...'
                            });
                            
                            // Open the editor for the proxy file
                            const proxyEditor = await vscode.window.showTextDocument(proxyDoc);
                            
                            if (choice === 'Getter (in proxy class)' && proxyGetterMatch) {
                                const getterPos = proxyDoc.positionAt(proxyGetterMatch.index);
                                proxyEditor.selection = new vscode.Selection(getterPos, getterPos);
                                proxyEditor.revealRange(new vscode.Range(getterPos, getterPos));
                                return;
                            } else if (choice === 'Setter (in proxy class)' && proxySetterMatch) {
                                const setterPos = proxyDoc.positionAt(proxySetterMatch.index);
                                proxyEditor.selection = new vscode.Selection(setterPos, setterPos);
                                proxyEditor.revealRange(new vscode.Range(setterPos, setterPos));
                                return;
                            }
                        }
                    }
                }
            }
            
            // If we get here, no accessors were found
            vscode.window.showInformationMessage(`No accessors found for $${propertyName}`);
        } catch (error) {
            console.error('Error searching for accessors in proxy classes:', error);
            vscode.window.showInformationMessage(`No accessors found for $${propertyName}`);
        }
    }

    /**
     * Get a definition provider for navigating between properties and accessors
     */
    public getDefinitionProvider(): vscode.DefinitionProvider {
        // 用于缓存已找到的类关联
        const classPropertyCache = new Map<string, Map<string, vscode.Location>>();
        
        return {
            provideDefinition: async (document, position, token) => {
                // 1. 基本检查和提取信息
                const wordRange = document.getWordRangeAtPosition(position);
                if (!wordRange) {
                    return null;
                }

                const word = document.getText(wordRange);
                const currentFilePath = document.uri.fsPath;
                
                // 只处理getter和setter方法
                if (!word.startsWith('get') && !word.startsWith('set')) {
                    return null;
                }
                
                const propertyName = word.substring(3).charAt(0).toLowerCase() + word.substring(4);
                
                // 检查缓存
                const cacheKey = `${currentFilePath}:${word}`;
                if (classPropertyCache.has(cacheKey)) {
                    const propertyCache = classPropertyCache.get(cacheKey);
                    if (propertyCache && propertyCache.has(propertyName)) {
                        return propertyCache.get(propertyName);
                    }
                }
                
                // 2. 确定处理策略
                const isProxyFile = currentFilePath.includes('.php-accessor');
                const lineText = document.lineAt(position.line).text;
                const wordStart = wordRange.start.character;
                const beforeWordText = lineText.substring(0, wordStart);
                const isMethodCall = beforeWordText.trim().endsWith('->');
                
                // 3. 处理代理文件中的跳转
                if (isProxyFile) {
                    return this.handleProxyFileNavigation(document, word, propertyName, currentFilePath, cacheKey, classPropertyCache);
                }
                
                // 4. 处理方法调用的跳转
                if (isMethodCall) {
                    return this.handleMethodCallNavigation(document, word, propertyName, cacheKey, classPropertyCache);
                }
                
                return null;
            }
        };
    }

    /**
     * 处理从代理文件内部跳转到原始属性
     */
    private async handleProxyFileNavigation(
        document: vscode.TextDocument, 
        word: string, 
        propertyName: string,
        currentFilePath: string,
        cacheKey: string,
        classPropertyCache: Map<string, Map<string, vscode.Location>>
    ): Promise<vscode.Location | null> {
        try {
            // 1. 确定目录结构
            const proxyDirPath = path.dirname(currentFilePath);
            const originalDirPath = path.dirname(proxyDirPath);
            
            // 2. 提取类名
            const text = document.getText();
            let className = this.extractClassNameFromContent(text) || 
                           this.extractClassNameFromFileName(path.basename(currentFilePath));
            
            if (!className) {
                return null;
            }
            
            // 3. 快速查找可能的原始文件 - 不使用异步搜索API
            const directFilePath = path.join(originalDirPath, `${className}.php`);
            
            if (fs.existsSync(directFilePath)) {
                return this.findPropertyInFile(directFilePath, className, propertyName, cacheKey, classPropertyCache);
            }
            
            // 尝试几个常见的命名模式
            const alternativeFilePaths = [
                path.join(originalDirPath, `class.${className.toLowerCase()}.php`),
                path.join(originalDirPath, `${className.toLowerCase()}.php`),
                path.join(originalDirPath, `class-${className.toLowerCase()}.php`)
            ];
            
            for (const filePath of alternativeFilePaths) {
                if (fs.existsSync(filePath)) {
                    const result = await this.findPropertyInFile(filePath, className, propertyName, cacheKey, classPropertyCache);
                    if (result) return result;
                }
            }
            
            // 4. 当所有快速查找方法失败时，使用更昂贵的搜索 - 但有限制
            const phpFiles = await this.findPhpFilesInDir(originalDirPath, 10); // 限制最多搜索10个文件
            
            for (const phpFile of phpFiles) {
                const result = await this.findPropertyInFile(phpFile, className, propertyName, cacheKey, classPropertyCache);
                if (result) return result;
            }
            
            return null;
        } catch (error) {
            console.error('Error finding property in proxy file:', error);
            return null;
        }
    }
    
    /**
     * 处理从方法调用跳转到原始属性
     */
    private async handleMethodCallNavigation(
        document: vscode.TextDocument,
        word: string,
        propertyName: string,
        cacheKey: string,
        classPropertyCache: Map<string, Map<string, vscode.Location>>
    ): Promise<vscode.Location | null> {
        try {
            // 获取光标所在行和位置
            const position = document.positionAt(document.getText().indexOf(word));
            const lineText = document.lineAt(position.line).text;
            const lineIndex = position.line;
            
            // 提取对象名称 - 更精确的匹配
            const methodCallPattern = /(\$\w+)->(?:get|set)\w+/;
            const objNameMatch = lineText.match(methodCallPattern);
            
            if (!objNameMatch || !objNameMatch[1]) {
                return null;
            }

            const objectName = objNameMatch[1];
            const fullText = document.getText();
            
            // 缓存use语句以提高性能
            const useStatements = this.extractUseStatements(fullText);
            
            // 创建类型数组，按优先级存储可能的类型
            const potentialTypes: Array<{type: string, source: string, fullClassName: string | null}> = [];
            
            // 1. 首先查找PHPDoc注释类型（优先级最高）
            // 向上查找最近的PHPDoc注释
            let typeFromPhpDoc = null;
            let searchLine = lineIndex - 1;
            const maxLinesToSearch = 10; // 限制最大搜索行数，避免查找过多
            
            while (searchLine >= 0 && searchLine >= lineIndex - maxLinesToSearch) {
                const searchText = document.lineAt(searchLine).text.trim();
                if (searchText.includes('@var') && searchText.includes(objectName.replace('$', ''))) {
                    // 提取当前行及上下文构成的文本块
                    const contextStart = Math.max(0, searchLine - 2);
                    const contextEnd = searchLine + 1;
                    const contextLines = [];
                    
                    for (let i = contextStart; i <= contextEnd; i++) {
                        contextLines.push(document.lineAt(i).text);
                    }
                    
                    const contextText = contextLines.join('\n');
                    typeFromPhpDoc = this.findObjectTypeFromVarAnnotation(contextText, objectName);
                    
                    if (typeFromPhpDoc) {
                        console.log(`在PHPDoc注释中找到 ${objectName} 的类型: ${typeFromPhpDoc}`);
                        
                        // 解析完整类名
                        let fullClassName = typeFromPhpDoc;
                        if (!typeFromPhpDoc.includes('\\')) {
                            // 查找匹配的use语句
                            for (const useStatement of useStatements) {
                                if (useStatement.className === typeFromPhpDoc) {
                                    fullClassName = useStatement.fullPath;
                                    console.log(`PHPDoc类型 ${typeFromPhpDoc} 解析为完整类名: ${fullClassName}`);
                                    break;
                                }
                            }
                        }
                        
                        potentialTypes.push({
                            type: typeFromPhpDoc, 
                            source: 'phpDoc',
                            fullClassName: fullClassName
                        });
                        break;
                    }
                }
                
                // 如果遇到空行或代码块结束，可以停止向上搜索
                if (searchText === '' || searchText === '}') {
                    break;
                }
                
                searchLine--;
            }
            
            // 2. 其次搜索文件中的所有PHPDoc注释
            if (!typeFromPhpDoc) {
                const globalTypeFromPhpDoc = this.findObjectTypeFromVarAnnotation(fullText, objectName);
                if (globalTypeFromPhpDoc) {
                    console.log(`在全局PHPDoc注释中找到 ${objectName} 的类型: ${globalTypeFromPhpDoc}`);
                    
                    // 解析完整类名
                    let fullClassName = globalTypeFromPhpDoc;
                    if (!globalTypeFromPhpDoc.includes('\\')) {
                        // 查找匹配的use语句
                        for (const useStatement of useStatements) {
                            if (useStatement.className === globalTypeFromPhpDoc) {
                                fullClassName = useStatement.fullPath;
                                console.log(`全局PHPDoc类型 ${globalTypeFromPhpDoc} 解析为完整类名: ${fullClassName}`);
                                break;
                            }
                        }
                    }
                    
                    potentialTypes.push({
                        type: globalTypeFromPhpDoc, 
                        source: 'globalPhpDoc',
                        fullClassName: fullClassName
                    });
                }
            }
            
            // 3. 再次查找通过new实例化的类型
            const typeFromNew = this.findObjectTypeFromNew(fullText, objectName);
            if (typeFromNew) {
                console.log(`通过 new 语句找到对象 ${objectName} 的类型: ${typeFromNew}`);
                
                // 解析完整类名
                let fullClassName = typeFromNew;
                if (!typeFromNew.includes('\\')) {
                    // 查找匹配的use语句
                    for (const useStatement of useStatements) {
                        if (useStatement.className === typeFromNew) {
                            fullClassName = useStatement.fullPath;
                            console.log(`new类型 ${typeFromNew} 解析为完整类名: ${fullClassName}`);
                            break;
                        }
                    }
                }
                
                potentialTypes.push({
                    type: typeFromNew, 
                    source: 'new',
                    fullClassName: fullClassName
                });
            }
            
            // 4. 最后查找函数参数类型提示
            const typeFromParam = this.findObjectTypeFromFunctionParams(fullText, objectName);
            if (typeFromParam) {
                console.log(`从函数参数中找到 ${objectName} 的类型: ${typeFromParam}`);
                
                // 解析完整类名
                let fullClassName = typeFromParam;
                if (!typeFromParam.includes('\\')) {
                    // 查找匹配的use语句
                    for (const useStatement of useStatements) {
                        if (useStatement.className === typeFromParam) {
                            fullClassName = useStatement.fullPath;
                            console.log(`参数类型 ${typeFromParam} 解析为完整类名: ${fullClassName}`);
                            break;
                        }
                    }
                }
                
                potentialTypes.push({
                    type: typeFromParam, 
                    source: 'param',
                    fullClassName: fullClassName
                });
            }
            
            // 如果没有找到任何类型，返回null
            if (potentialTypes.length === 0) {
                console.log(`未找到 ${objectName} 的类型信息`);
                return null;
            }
            
            // 对每个可能的类型，尝试查找属性
            for (const typeInfo of potentialTypes) {
                const fullClassName = typeInfo.fullClassName || typeInfo.type;
                console.log(`尝试在类型 ${typeInfo.type} (${typeInfo.source}) 查找属性 ${propertyName}`);
                
                // 尝试查找类文件
                const classFile = await this.findClassFileFromNamespaceFast(fullClassName);
                
                if (classFile) {
                    // 提取简短类名用于属性搜索
                    const shortClassName = fullClassName.split('\\').pop() || typeInfo.type;
                    
                    console.log(`找到类文件: ${classFile}, 准备查找属性: ${propertyName}`);
                    
                    // 查找属性, 确保查找原始类中的属性
                    const result = await this.findPropertyInFile(
                        classFile, 
                        shortClassName, 
                        propertyName, 
                        cacheKey, 
                        classPropertyCache,
                        true // 强制使用原始类而非代理类
                    );
                    
                    if (result) {
                        console.log(`成功在类型 ${typeInfo.type} (${typeInfo.source}) 中找到属性 ${propertyName}`);
                        return result;
                    } else {
                        console.log(`在类型 ${typeInfo.type} (${typeInfo.source}) 中未找到属性 ${propertyName}`);
                    }
                } else {
                    console.log(`未找到类型 ${typeInfo.type} 的类文件`);
                }
            }
            
            // 如果从所有类型中都未找到属性，尝试基于属性名查找可能的类（更通用的方法）
            console.log(`从所有已知类型中未找到属性 ${propertyName}，尝试基于属性名搜索...`);
            
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
            if (!workspaceFolder) return null;
            
            // 优化：限制搜索范围到几个可能的目录
            const commonDirs = [
                'app/Domain',
                'app/Entity',
                'src/Domain',
                'src/Entity',
                'domain',
                'entity',
                'app/Models',
                'src/Models',
                'models',
                'app/Infrastructure',
                'src/Infrastructure'
            ];
            
            for (const dir of commonDirs) {
                const basePath = path.join(workspaceFolder.uri.fsPath, dir);
                if (!fs.existsSync(basePath)) continue;
                
                // 快速搜索可能的PHP文件
                const phpFiles = await this.quickFindPhpFilesWithProperty(basePath, propertyName);
                
                for (const phpFile of phpFiles) {
                    try {
                        const fileDoc = await vscode.workspace.openTextDocument(vscode.Uri.file(phpFile));
                        const fileContent = fileDoc.getText();
                        
                        // 检查文件是否包含该属性
                        const propertyRegex = new RegExp(`(public|protected|private)\\s+(?:readonly\\s+)?(?:\\w+\\s+)?\\$${propertyName}\\b`, 'g');
                        const match = propertyRegex.exec(fileContent);
                        
                        if (match) {
                            // 提取类名用于日志
                            const classMatch = fileContent.match(/class\s+(\w+)/);
                            const className = classMatch ? classMatch[1] : path.basename(phpFile, '.php');
                            
                            console.log(`通过属性名匹配找到属性 ${propertyName} 在类 ${className}`);
                            
                            const propertyPos = fileDoc.positionAt(match.index);
                            return new vscode.Location(vscode.Uri.file(phpFile), propertyPos);
                        }
                    } catch (error) {
                        // 不中断流程，继续尝试下一个文件
                        continue;
                    }
                }
            }
            
            console.log(`未能找到属性 ${propertyName} 的任何匹配`);
            return null;
        } catch (error) {
            console.error('跳转到属性时出错:', error);
            return null;
        }
    }
    
    /**
     * 快速查找可能包含指定属性的PHP文件
     * 使用文件系统API直接查找，而不是vscode的findFiles (性能显著提升)
     */
    private async quickFindPhpFilesWithProperty(dirPath: string, propertyName: string, maxFiles: number = 20): Promise<string[]> {
        try {
            const result: string[] = [];
            const queue: string[] = [dirPath];
            
            // 广度优先搜索，查找可能包含属性的PHP文件
            while (queue.length > 0 && result.length < maxFiles) {
                const currentDir = queue.shift();
                if (!currentDir) continue;
                
                const items = fs.readdirSync(currentDir);
                
                for (const item of items) {
                    if (result.length >= maxFiles) break;
                    
                    const itemPath = path.join(currentDir, item);
                    const stats = fs.statSync(itemPath);
                    
                    if (stats.isDirectory() && !itemPath.includes('vendor') && !itemPath.includes('.php-accessor')) {
                        queue.push(itemPath);
                    } else if (stats.isFile() && itemPath.endsWith('.php')) {
                        // 快速内容检查 - 仅读取文件一次并检查是否包含属性模式
                        try {
                            const content = fs.readFileSync(itemPath, 'utf8');
                            // 简单字符串检查比正则表达式快
                            if (content.includes(`$${propertyName}`) && 
                                (content.includes('public') || content.includes('protected') || content.includes('private'))) {
                                result.push(itemPath);
                            }
                        } catch (e) {
                            // 忽略文件读取错误，继续下一个
                            continue;
                        }
                    }
                }
            }
            
            return result;
        } catch (error) {
            console.error('Error in quick find:', error);
            return [];
        }
    }
    
    /**
     * 快速查找类文件 - 基于PSR-4规范和典型项目结构
     */
    private async findClassFileFromNamespaceFast(namespace: string): Promise<string | null> {
        try {
            // 获取工作空间
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                return null;
            }
            
            console.log(`尝试查找类文件: ${namespace}`);
            const workspaceRoot = workspaceFolders[0].uri.fsPath;
            
            // 从命名空间创建可能的文件路径
            const namespaceSegments = namespace.split('\\');
            const className = namespaceSegments.pop() || '';
            
            // 创建可能的文件路径 - PSR-4标准
            const possiblePaths = [
                // 标准PSR-4
                path.join(workspaceRoot, 'app', ...namespaceSegments, `${className}.php`),
                path.join(workspaceRoot, 'src', ...namespaceSegments, `${className}.php`),
                
                // 使用小写首段
                path.join(workspaceRoot, namespaceSegments[0]?.toLowerCase() || '', ...namespaceSegments.slice(1), `${className}.php`),
                
                // Laravel风格路径
                path.join(workspaceRoot, 'app', ...namespaceSegments.map(s => s.toLowerCase()), `${className}.php`),
                
                // 无命名空间路径 - 直接查找类文件
                path.join(workspaceRoot, `${className}.php`),
                path.join(workspaceRoot, 'app', `${className}.php`),
                path.join(workspaceRoot, 'src', `${className}.php`),
                
                // 常见模型目录
                path.join(workspaceRoot, 'app', 'Models', `${className}.php`),
                path.join(workspaceRoot, 'app', 'Entity', `${className}.php`),
                path.join(workspaceRoot, 'app', 'Domain', `${className}.php`),
                path.join(workspaceRoot, 'src', 'Models', `${className}.php`),
                path.join(workspaceRoot, 'src', 'Entity', `${className}.php`),
                path.join(workspaceRoot, 'src', 'Domain', `${className}.php`)
            ];
            
            // 直接检查文件是否存在
            for (const filePath of possiblePaths) {
                if (fs.existsSync(filePath)) {
                    // 验证文件是否包含类定义
                    try {
                        const content = fs.readFileSync(filePath, 'utf8');
                        // 简单检查是否包含类定义
                        if (content.includes(`class ${className}`) || 
                            content.includes(`abstract class ${className}`) || 
                            content.includes(`final class ${className}`)) {
                            console.log(`找到类文件: ${filePath}`);
                            return filePath;
                        }
                    } catch (e) {
                        continue;
                    }
                }
            }
            
            // 如果找不到精确的类路径，尝试基于类名在整个项目中搜索
            console.log(`未找到精确路径，使用模糊搜索查找类: ${className}`);
            const searchPattern = `**/${className}.php`;
            const files = await vscode.workspace.findFiles(
                searchPattern,
                '**/vendor/**/.php-accessor/**',
                10 // 限制结果
            );
            
            for (const file of files) {
                try {
                    const content = fs.readFileSync(file.fsPath, 'utf8');
                    
                    // 检查更精确的类名匹配 (避免部分匹配)
                    const classPattern = new RegExp(`class\\s+${className}\\b`);
                    const abstractClassPattern = new RegExp(`abstract\\s+class\\s+${className}\\b`);
                    const finalClassPattern = new RegExp(`final\\s+class\\s+${className}\\b`);
                    
                    if (classPattern.test(content) || 
                        abstractClassPattern.test(content) || 
                        finalClassPattern.test(content)) {
                        
                        // 如果有命名空间，检查是否匹配
                        if (namespaceSegments.length > 0) {
                            const nsPattern = new RegExp(`namespace\\s+${namespaceSegments.join('\\\\')}\\b`);
                            if (nsPattern.test(content)) {
                                console.log(`通过完整命名空间匹配找到类: ${file.fsPath}`);
                                return file.fsPath;
                            }
                        } else {
                            // 没有命名空间要求，直接返回找到的第一个匹配文件
                            console.log(`通过类名模式匹配找到类: ${file.fsPath}`);
                            return file.fsPath;
                        }
                    }
                } catch (e) {
                    continue;
                }
            }
            
            // 如果还找不到，尝试模糊搜索包含类名的文件
            if (files.length === 0) {
                const fuzzyPattern = `**/*${className}*.php`;
                const fuzzyFiles = await vscode.workspace.findFiles(
                    fuzzyPattern,
                    '**/vendor/**/.php-accessor/**',
                    5 // 限制结果
                );
                
                for (const file of fuzzyFiles) {
                    try {
                        const content = fs.readFileSync(file.fsPath, 'utf8');
                        if (content.includes(`class ${className}`) || 
                            content.includes(`abstract class ${className}`) || 
                            content.includes(`final class ${className}`)) {
                            console.log(`通过模糊搜索找到类: ${file.fsPath}`);
                            return file.fsPath;
                        }
                    } catch (e) {
                        continue;
                    }
                }
            }
            
            console.log(`未找到类 ${namespace} 的文件`);
            return null;
        } catch (error) {
            console.error('查找类文件时出错:', error);
            return null;
        }
    }
    
    /**
     * 从@var注释中查找对象类型
     */
    private findObjectTypeFromVarAnnotation(text: string, objectName: string): string | null {
        // 去掉$符号，用于正则匹配
        const varName = objectName.replace('$', '');

        // 更强大的正则表达式，匹配各种PHPDoc @var注释格式
        const patterns = [
            // 1. 匹配用户提到的特定格式 /* @var CommonConfigPayBank $bank */
            new RegExp(`/\\*\\s*@var\\s+([\\w\\\\]+)\\s+\\$${varName}\\s*\\*/`, 'g'),
            
            // 2. 匹配标准多行PHPDoc: /** @var ClassName $varName */
            new RegExp(`/\\*\\*.*?@var\\s+([\\w\\\\]+)(?:\\s+\\$${varName}|[\\s\\*]|$).*?\\*/`, 'gs'),
            
            // 3. 匹配单行PHPDoc: /* @var ClassName $varName */
            new RegExp(`/\\*\\s*@var\\s+([\\w\\\\]+)(?:\\s+\\$${varName}|[\\s\\*]|$).*?\\*/`, 'g'),
            
            // 4. 匹配行内注释: // @var ClassName $varName
            new RegExp(`//\\s*@var\\s+([\\w\\\\]+)(?:\\s+\\$${varName}|\\s|$)`, 'g')
        ];
        
        for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(text)) !== null) {
                if (match && match[1]) {
                    // 检查匹配中是否包含当前变量名
                    const fullMatch = match[0];
                    // 如果注释包含变量名或者不包含任何$变量（通用注释）
                    if (fullMatch.includes(`$${varName}`) || !fullMatch.includes('$')) {
                        console.log(`在 "${fullMatch}" 中找到类型: ${match[1].trim()}`);
                        return match[1].trim();
                    }
                }
            }
        }
        
        return null;
    }
    
    /**
     * 从函数参数类型提示中查找对象类型
     */
    private findObjectTypeFromFunctionParams(text: string, objectName: string): string | null {
        // 匹配函数参数类型: function xyz(TypeName $varName)
        const paramRegex = new RegExp(`function\\s+\\w+\\s*\\([^)]*([\\w\\\\]+)\\s+${objectName.replace('$', '\\$')}[,\\)]`, 'g');
        const match = paramRegex.exec(text);
        
        if (match && match[1]) {
            return match[1].trim();
        }
        
        return null;
    }
    
    /**
     * 从文本中提取use语句
     */
    private extractUseStatements(text: string): Array<{fullPath: string, className: string}> {
        const results: Array<{fullPath: string, className: string}> = [];
        
        // 匹配PHP文件顶部的use语句
        const useRegex = /use\s+([^;]+);/g;
        let match;
        
        while ((match = useRegex.exec(text)) !== null) {
            const fullPath = match[1].trim();
            const className = fullPath.split('\\').pop() || '';
            
            // 处理带as别名的情况
            if (fullPath.includes(' as ')) {
                const parts = fullPath.split(' as ');
                results.push({
                    fullPath: parts[0].trim(),
                    className: parts[1].trim()
                });
            } else {
                results.push({fullPath, className});
            }
        }
        
        return results;
    }
    
    /**
     * 从new语句中查找对象类型
     */
    private findObjectTypeFromNew(text: string, objectName: string): string | null {
        // 移除objectName中的$前缀以便于正则匹配
        const varName = objectName.replace('$', '');
        
        // 优先查找最精确匹配的实例化语句 - 直接new的类
        // 尝试查找 "$bank = new Bank()" 或 "$bank = new Bank;"
        const exactNewPattern = new RegExp(`\\$${varName}\\s*=\\s*new\\s+([\\w\\\\]+)\\s*[\\(;]`, 'g');
        let match = exactNewPattern.exec(text);
        if (match && match[1]) {
            return match[1].trim();
        }
        
        // 尝试查找类名带命名空间的情况，如 $bank = new Domain\Bank()
        const namespaceNewPattern = new RegExp(`\\$${varName}\\s*=\\s*new\\s+([\\w\\\\]+(?:\\\\[\\w\\\\]+)+)\\s*[\\(;]`, 'g');
        match = namespaceNewPattern.exec(text);
        if (match && match[1]) {
            return match[1].trim();
        }
        
        // 尝试查找多行实例化，如：
        // $bank = new Bank(
        //     $arg1,
        //     $arg2
        // );
        const multilineNewPattern = new RegExp(`\\$${varName}\\s*=\\s*new\\s+([\\w\\\\]+)\\s*\\(`, 'g');
        match = multilineNewPattern.exec(text);
        if (match && match[1]) {
            return match[1].trim();
        }
        
        // 一般性匹配: $obj = new ClassName() 或 $obj = new ClassName
        const generalNewPattern = new RegExp(`${objectName.replace('$', '\\$')}\\s*=\\s*new\\s+([\\w\\\\]+)`, 'g');
        match = generalNewPattern.exec(text);
        if (match && match[1]) {
            return match[1].trim();
        }
        
        // 匹配 $obj = $factory->create(ClassName::class)
        const factoryRegex = new RegExp(`${objectName.replace('$', '\\$')}\\s*=\\s*.*?\\(\\s*([\\w\\\\]+)::class`, 'g');
        const factoryMatch = factoryRegex.exec(text);
        if (factoryMatch && factoryMatch[1]) {
            return factoryMatch[1].trim();
        }
        
        return null;
    }
    
    /**
     * 根据命名空间查找类文件
     */
    private async findClassFileFromNamespace(namespace: string): Promise<string | null> {
        try {
            // 获取工作空间
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                return null;
            }
            
            // 从命名空间创建可能的路径模式
            // 例如 App\Domain\Entity\User 可能对应 */app/Domain/Entity/User.php
            const namespaceSegments = namespace.split('\\');
            
            // 创建几种可能的搜索模式
            const searchPatterns = [
                // 通常的PSR-4结构
                `**/${namespaceSegments.join('/')}.php`,
                
                // 尝试小写第一个命名空间部分
                `**/${namespaceSegments.map((s, i) => i === 0 ? s.toLowerCase() : s).join('/')}.php`,
                
                // 使用类名检查所有PHP文件
                `**/${namespaceSegments[namespaceSegments.length-1]}.php`
            ];
            
            // 按顺序尝试每个模式
            for (const pattern of searchPatterns) {
                const files = await vscode.workspace.findFiles(
                    pattern,
                    '**/vendor/**/.php-accessor/**', 
                    5 // 限制结果数量
                );
                
                if (files.length > 0) {
                    for (const file of files) {
                        // 验证文件是否真的包含这个类
                        const doc = await vscode.workspace.openTextDocument(file);
                        const content = doc.getText();
                        
                        // 检查命名空间声明和类定义
                        const nsMatch = content.match(/namespace\s+([^;]+);/);
                        if (nsMatch) {
                            const fileNs = nsMatch[1].trim();
                            const className = namespaceSegments[namespaceSegments.length-1];
                            const classPattern = new RegExp(`class\\s+${className}\\b`);
                            
                            // 检查是否包含指定类
                            if (classPattern.test(content)) {
                                // 检查命名空间是否匹配
                                const fullNs = `${fileNs}\\${className}`;
                                const shortNs = namespace.split('\\').pop();
                                
                                // 如果完全匹配或者至少类名匹配
                                if (fullNs === namespace || (shortNs && content.includes(`class ${shortNs}`))) {
                                    return file.fsPath;
                                }
                            }
                        }
                    }
                }
            }
            
            return null;
        } catch (error) {
            console.error('Error finding class file from namespace:', error);
            return null;
        }
    }
    
    /**
     * 查找指定目录中的PHP文件
     */
    private async findPhpFilesInDir(dirPath: string, limit: number = 20): Promise<string[]> {
        try {
            const files: string[] = [];
            
            if (!fs.existsSync(dirPath)) return files;
            
            const items = fs.readdirSync(dirPath);
            for (const item of items) {
                if (files.length >= limit) break;
                
                const itemPath = path.join(dirPath, item);
                const stat = fs.statSync(itemPath);
                
                if (stat.isFile() && itemPath.endsWith('.php') && !itemPath.includes('.php-accessor')) {
                    files.push(itemPath);
                }
            }
            
            return files;
        } catch (error) {
            console.error('Error finding PHP files:', error);
            return [];
        }
    }
    
    /**
     * 从文件内容中提取类名
     */
    private extractClassNameFromContent(text: string): string | null {
        const classMatch = text.match(/class\s+(\w+)/);
        if (classMatch && classMatch[1]) {
            return classMatch[1].replace(/Proxy.*$/, '');
        }
        return null;
    }
    
    /**
     * 从文件名中提取类名
     */
    private extractClassNameFromFileName(fileName: string): string | null {
        const patterns = [
            /^(.+?)(?:__Proxy|\.php)/,  // OriginalClass__Proxy.php
            /^(.+?)(?:_Proxy|\.php)/,   // OriginalClass_Proxy.php
            /^Proxy(.+?)(?:\.php)/      // ProxyOriginalClass.php
        ];
        
        for (const pattern of patterns) {
            const match = fileName.match(pattern);
            if (match && match[1]) {
                return match[1];
            }
        }
        
        return null;
    }
    
    /**
     * 在指定文件中查找属性
     */
    private async findPropertyInFile(
        filePath: string, 
        className: string, 
        propertyName: string,
        cacheKey: string,
        classPropertyCache: Map<string, Map<string, vscode.Location>>,
        forceOriginalClass: boolean = false
    ): Promise<vscode.Location | null> {
        try {
            // 确保我们使用的是原始类而非代理类
            if (forceOriginalClass && filePath.includes('.php-accessor')) {
                const proxyDirPath = path.dirname(filePath);
                const originalDirPath = path.dirname(proxyDirPath);
                
                // 尝试在原始目录找到对应文件
                const originalFilePath = path.join(originalDirPath, path.basename(filePath).replace(/(Proxy|__Proxy|_Proxy)\.php$/, '.php'));
                
                if (fs.existsSync(originalFilePath)) {
                    filePath = originalFilePath;
                }
            }
            
            // 查看文件是否存在
            if (!fs.existsSync(filePath)) {
                return null;
            }
            
            console.log(`在文件 ${filePath} 中查找属性 ${propertyName}`);
            
            // 读取文件内容
            const fileDoc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
            const fileContent = fileDoc.getText();
            
            // 检查文件是否包含目标类
            // 改进类定义的正则，考虑更多情况
            const classDefinitionPatterns = [
                // 直接类定义
                new RegExp(`class\\s+${className}\\b`),
                // 继承类定义
                new RegExp(`class\\s+\\w+\\s+extends\\s+${className}\\b`),
                // 实现接口的类定义
                new RegExp(`class\\s+${className}\\s+implements\\b`),
                // 带修饰符的类定义
                new RegExp(`(abstract|final)\\s+class\\s+${className}\\b`)
            ];
            
            let classFound = false;
            for (const pattern of classDefinitionPatterns) {
                if (pattern.test(fileContent)) {
                    classFound = true;
                    break;
                }
            }
            
            if (!classFound) {
                console.log(`文件 ${filePath} 中未找到类 ${className}`);
                return null;
            }
            
            // 提取当前类的范围
            let classStart = -1;
            let classEnd = -1;
            const classStartPattern = new RegExp(`class\\s+${className}\\b`);
            const classMatch = classStartPattern.exec(fileContent);
            
            if (classMatch) {
                classStart = classMatch.index;
                // 查找类结束的位置（最外层的大括号）
                let braceCount = 0;
                let insideClass = false;
                
                for (let i = classStart; i < fileContent.length; i++) {
                    const char = fileContent[i];
                    if (char === '{') {
                        if (!insideClass) {
                            insideClass = true;
                        }
                        braceCount++;
                    } else if (char === '}') {
                        braceCount--;
                        if (insideClass && braceCount === 0) {
                            classEnd = i;
                            break;
                        }
                    }
                }
            }
            
            const classContent = classEnd > classStart && classStart >= 0 
                ? fileContent.substring(classStart, classEnd + 1) 
                : fileContent;
            
            // 扩展属性搜索模式，处理更多可能的格式
            const propertyPatterns = [
                // 标准属性声明
                new RegExp(`(public|protected|private)\\s+(?:readonly\\s+)?(?:\\w+\\s+)?\\$${propertyName}\\b`, 'g'),
                // 带注释的属性声明
                new RegExp(`/\\*\\*[\\s\\S]*?\\*/\\s+(public|protected|private)\\s+(?:readonly\\s+)?(?:\\w+\\s+)?\\$${propertyName}\\b`, 'g'),
                // 属性声明可能带有默认值
                new RegExp(`(public|protected|private)\\s+(?:readonly\\s+)?(?:\\w+\\s+)?\\$${propertyName}(?:\\s*=\\s*[^;]+)?;`, 'g'),
                // PHP 8.0+ 构造函数属性提升
                new RegExp(`\\s*function\\s+__construct\\([^)]*?(public|protected|private)\\s+(?:\\w+\\s+)?\\$${propertyName}\\b[^)]*?\\)`, 'g'),
                // 类属性（PHP 8.1+）
                new RegExp(`(public|protected|private)\\s+const\\s+${propertyName}\\b`, 'g')
            ];
            
            let match = null;
            for (const pattern of propertyPatterns) {
                const matches = Array.from(classContent.matchAll(pattern));
                if (matches.length > 0) {
                    match = matches[0];
                    // 计算全局位置（考虑类内容的起始位置）
                    const globalIndex = classStart >= 0 ? classStart + (match.index || 0) : (match.index || 0);
                    
                    const propertyPos = fileDoc.positionAt(globalIndex);
                    const location = new vscode.Location(vscode.Uri.file(filePath), propertyPos);
                    
                    // 更新缓存
                    if (!classPropertyCache.has(cacheKey)) {
                        classPropertyCache.set(cacheKey, new Map<string, vscode.Location>());
                    }
                    classPropertyCache.get(cacheKey)?.set(propertyName, location);
                    
                    console.log(`在文件 ${filePath} 中找到属性 ${propertyName} 在位置 ${propertyPos.line}:${propertyPos.character}`);
                    return location;
                }
            }
            
            // 如果在当前类中未找到，检查父类
            const extendsMatch = classContent.match(/extends\s+([\w\\]+)/);
            if (extendsMatch && extendsMatch[1]) {
                const parentClass = extendsMatch[1];
                console.log(`在当前类未找到属性，尝试在父类 ${parentClass} 中查找`);
                
                // 如果父类包含命名空间，尝试解析完整路径
                if (parentClass.includes('\\')) {
                    const parentClassFile = await this.findClassFileFromNamespaceFast(parentClass);
                    if (parentClassFile) {
                        const shortParentClass = parentClass.split('\\').pop() || parentClass;
                        return this.findPropertyInFile(
                            parentClassFile,
                            shortParentClass,
                            propertyName,
                            cacheKey + '::parent',
                            classPropertyCache,
                            forceOriginalClass
                        );
                    }
                } else {
                    // 否则，尝试从use语句中解析
                    const useStatements = this.extractUseStatements(fileContent);
                    for (const useStatement of useStatements) {
                        if (useStatement.className === parentClass) {
                            const parentClassFile = await this.findClassFileFromNamespaceFast(useStatement.fullPath);
                            if (parentClassFile) {
                                return this.findPropertyInFile(
                                    parentClassFile,
                                    parentClass,
                                    propertyName,
                                    cacheKey + '::parent',
                                    classPropertyCache,
                                    forceOriginalClass
                                );
                            }
                        }
                    }
                }
            }
            
            console.log(`在文件 ${filePath} 中未找到属性 ${propertyName}`);
            return null;
        } catch (error) {
            console.error(`在文件 ${filePath} 中搜索属性 ${propertyName} 时出错:`, error);
            return null;
        }
    }

    /**
     * Get a reference provider for finding all references to properties and accessors
     */
    public getReferenceProvider(): vscode.ReferenceProvider {
        return {
            provideReferences: async (document, position, context, token) => {
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
                    
                    // Also look in proxy classes
                    try {
                        // Get the current file path
                        const currentFilePath = document.uri.fsPath;
                        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
                        
                        if (workspaceFolder) {
                            // Look for a .php-accessor directory in the workspace
                            const phpAccessorDir = path.join(path.dirname(currentFilePath), '.php-accessor');
                            
                            // If directory exists, search for references in proxy classes
                            if (fs.existsSync(phpAccessorDir)) {
                                // Get class name from current file
                                const className = this.getClassNameFromDocument(document);
                                if (className) {
                                    // Look for proxy class files
                                    const proxyFiles = fs.readdirSync(phpAccessorDir)
                                        .filter(file => file.endsWith('.php') && file.includes(className));
                                    
                                    for (const proxyFile of proxyFiles) {
                                        // Open the proxy file
                                        const proxyFilePath = path.join(phpAccessorDir, proxyFile);
                                        const proxyUri = vscode.Uri.file(proxyFilePath);
                                        try {
                                            const proxyDoc = await vscode.workspace.openTextDocument(proxyUri);
                                            const proxyText = proxyDoc.getText();
                                            
                                            // Search for accessors in proxy file
                                            let proxyMatch;
                                            const resetGetterRegex = new RegExp(`function\\s+get${capitalizedName}\\s*\\(`, 'g');
                                            const resetSetterRegex = new RegExp(`function\\s+set${capitalizedName}\\s*\\(`, 'g');
                                            
                                            while ((proxyMatch = resetGetterRegex.exec(proxyText)) !== null) {
                                                const pos = proxyDoc.positionAt(proxyMatch.index);
                                                locations.push(new vscode.Location(proxyUri, pos));
                                            }
                                            
                                            while ((proxyMatch = resetSetterRegex.exec(proxyText)) !== null) {
                                                const pos = proxyDoc.positionAt(proxyMatch.index);
                                                locations.push(new vscode.Location(proxyUri, pos));
                                            }
                                            
                                            // Find accessor calls in proxy file
                                            const resetGetterCallRegex = new RegExp(`->get${capitalizedName}\\s*\\(`, 'g');
                                            const resetSetterCallRegex = new RegExp(`->set${capitalizedName}\\s*\\(`, 'g');
                                            
                                            while ((proxyMatch = resetGetterCallRegex.exec(proxyText)) !== null) {
                                                const pos = proxyDoc.positionAt(proxyMatch.index + 2);
                                                locations.push(new vscode.Location(proxyUri, pos));
                                            }
                                            
                                            while ((proxyMatch = resetSetterCallRegex.exec(proxyText)) !== null) {
                                                const pos = proxyDoc.positionAt(proxyMatch.index + 2);
                                                locations.push(new vscode.Location(proxyUri, pos));
                                            }
                                        } catch (err) {
                                            console.error(`Error opening proxy file ${proxyFilePath}:`, err);
                                        }
                                    }
                                }
                            }
                        }
                    } catch (error) {
                        console.error('Error searching for references in proxy classes:', error);
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
                    
                    // Also look in proxy classes
                    try {
                        // Get the current file path
                        const currentFilePath = document.uri.fsPath;
                        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
                        
                        if (workspaceFolder) {
                            // Look for a .php-accessor directory in the workspace
                            const phpAccessorDir = path.join(path.dirname(currentFilePath), '.php-accessor');
                            
                            // If directory exists, search for references in proxy classes
                            if (fs.existsSync(phpAccessorDir)) {
                                // Get class name from current file
                                const className = this.getClassNameFromDocument(document);
                                if (className) {
                                    // Look for proxy class files
                                    const proxyFiles = fs.readdirSync(phpAccessorDir)
                                        .filter(file => file.endsWith('.php') && file.includes(className));
                                    
                                    for (const proxyFile of proxyFiles) {
                                        // Open the proxy file
                                        const proxyFilePath = path.join(phpAccessorDir, proxyFile);
                                        const proxyUri = vscode.Uri.file(proxyFilePath);
                                        try {
                                            const proxyDoc = await vscode.workspace.openTextDocument(proxyUri);
                                            const proxyText = proxyDoc.getText();
                                            
                                            // Find the property in proxy file
                                            const proxyPropertyMatch = propertyRegex.exec(proxyText);
                                            if (proxyPropertyMatch) {
                                                const propertyPos = proxyDoc.positionAt(proxyPropertyMatch.index);
                                                locations.push(new vscode.Location(proxyUri, propertyPos));
                                            }
                                            
                                            // Find accessor calls in proxy file
                                            const proxyCallRegex = new RegExp(`->${word}\\s*\\(`, 'g');
                                            let proxyCallMatch;
                                            
                                            while ((proxyCallMatch = proxyCallRegex.exec(proxyText)) !== null) {
                                                const pos = proxyDoc.positionAt(proxyCallMatch.index + 2);
                                                locations.push(new vscode.Location(proxyUri, pos));
                                            }
                                        } catch (err) {
                                            console.error(`Error opening proxy file ${proxyFilePath}:`, err);
                                        }
                                    }
                                }
                            }
                        }
                    } catch (error) {
                        console.error('Error searching for references in proxy classes:', error);
                    }
                }
                
                return locations;
            }
        };
    }
    
    /**
     * 获取代码补全提供程序，用于为PHPDoc注解的变量提供方法补全
     */
    public getCompletionItemProvider(): vscode.CompletionItemProvider {
        return {
            provideCompletionItems: async (document, position, token, context) => {
                // 检查是否在PHP文件中
                if (document.languageId !== 'php') {
                    return null;
                }
                
                // 检查是否在输入->后触发补全
                const linePrefix = document.lineAt(position).text.substring(0, position.character);
                if (!linePrefix.endsWith('->')) {
                    return null;
                }
                
                // 提取当前行中的变量名
                const variableMatch = linePrefix.match(/(\$\w+)->$/);
                if (!variableMatch || !variableMatch[1]) {
                    return null;
                }
                
                const variableName = variableMatch[1];
                
                // 查找变量类型
                const fullText = document.getText();
                
                // 1. 从PHPDoc注释中查找
                const typeFromDoc = this.findObjectTypeFromVarAnnotation(fullText, variableName);
                if (!typeFromDoc) {
                    return null;
                }
                
                // 解析完整命名空间
                const useStatements = this.extractUseStatements(fullText);
                let fullClassName = typeFromDoc;
                
                // 如果类型不包含命名空间分隔符(\)，尝试从use语句中查找
                if (!typeFromDoc.includes('\\')) {
                    for (const useStatement of useStatements) {
                        if (useStatement.className === typeFromDoc) {
                            fullClassName = useStatement.fullPath;
                            break;
                        }
                    }
                }
                
                console.log(`变量 ${variableName} 的类型: ${fullClassName}`);
                
                // 查找类文件
                const classFile = await this.findClassFileFromNamespaceFast(fullClassName);
                if (!classFile) {
                    return null;
                }
                
                // 读取类文件内容
                try {
                    const fileContent = fs.readFileSync(classFile, 'utf8');
                    
                    // 提取类中的所有方法
                    const methodPattern = /public\s+function\s+(\w+)\s*\(/g;
                    const methods: string[] = [];
                    let methodMatch;
                    
                    while ((methodMatch = methodPattern.exec(fileContent)) !== null) {
                        methods.push(methodMatch[1]);
                    }
                    
                    // 生成补全项
                    const completionItems: vscode.CompletionItem[] = [];
                    
                    for (const method of methods) {
                        const item = new vscode.CompletionItem(method, vscode.CompletionItemKind.Method);
                        
                        // 根据方法名判断是否是getter或setter
                        if (method.startsWith('get')) {
                            item.detail = `${fullClassName}::${method}()`;
                            item.documentation = new vscode.MarkdownString(`从 ${fullClassName} 获取属性`);
                        } else if (method.startsWith('set')) {
                            item.detail = `${fullClassName}::${method}(\$value)`;
                            item.documentation = new vscode.MarkdownString(`设置 ${fullClassName} 的属性`);
                            item.insertText = new vscode.SnippetString(`${method}(\${1:\$value})`);
                        } else {
                            item.detail = `${fullClassName}::${method}()`;
                            item.insertText = new vscode.SnippetString(`${method}(\${1})`);
                        }
                        
                        completionItems.push(item);
                    }
                    
                    return completionItems;
                } catch (error) {
                    console.error('读取类文件时出错:', error);
                    return null;
                }
            }
        };
    }
    
    /**
     * 获取代码操作提供程序，用于消除对PHPDoc注解变量的方法调用的红线警告
     */
    public getCodeActionsProvider(): vscode.CodeActionProvider {
        return {
            provideCodeActions: async (document: vscode.TextDocument, range: vscode.Range, context: vscode.CodeActionContext, token: vscode.CancellationToken) => {
                // 检查是否有诊断问题需要修复
                if (!context.diagnostics || context.diagnostics.length === 0) {
                    return null;
                }
                
                // 获取当前行文本
                const line: string = document.lineAt(range.start.line).text;
                
                // 检查是否是对PHPDoc注解变量的方法调用
                const methodCallMatch = line.match(/(\$\w+)->(\w+)\(/);
                if (!methodCallMatch) {
                    return null;
                }
                
                const variableName = methodCallMatch[1];
                const methodName = methodCallMatch[2];
                
                // 提取变量类型
                const fullText = document.getText();
                const typeFromDoc = this.findObjectTypeFromVarAnnotation(fullText, variableName);
                
                if (!typeFromDoc) {
                    return null;
                }
                
                // 解析完整命名空间
                const useStatements = this.extractUseStatements(fullText);
                let fullClassName = typeFromDoc;
                
                if (!typeFromDoc.includes('\\')) {
                    for (const useStatement of useStatements) {
                        if (useStatement.className === typeFromDoc) {
                            fullClassName = useStatement.fullPath;
                            break;
                        }
                    }
                }
                
                // 查找类文件
                const classFile = await this.findClassFileFromNamespaceFast(fullClassName);
                if (!classFile) {
                    return null;
                }
                
                const actions: vscode.CodeAction[] = [];
                
                try {
                    // 读取类文件内容
                    const fileContent = fs.readFileSync(classFile, 'utf8');
                    
                    // 验证类中是否有这个方法
                    const methodPattern = new RegExp(`function\\s+${methodName}\\s*\\(`, 'i');
                    if (!methodPattern.test(fileContent)) {
                        return null;
                    }
                    
                    // 导入TypeResolver
                    const { TypeResolver } = require('./utils/typeResolver');
                    
                    // 创建添加内联注释的修复操作
                    const inlineAction = new vscode.CodeAction(
                        `添加内联 @method ${methodName} 注释以解决警告`,
                        vscode.CodeActionKind.QuickFix
                    );
                    
                    // 创建编辑，在调用行上方添加注释
                    const inlineEdit = new vscode.WorkspaceEdit();
                    const inlinePosition = new vscode.Position(range.start.line, 0);
                    
                    // 查找行的缩进级别
                    const indentation = line.match(/^\s*/)?.[0] || '';
                    
                    // 生成内联注释
                    const inlineComment = `${indentation}// ${TypeResolver.generateInlineMethodAnnotation(fullClassName, methodName)}\n`;
                    
                    inlineEdit.insert(document.uri, inlinePosition, inlineComment);
                    inlineAction.edit = inlineEdit;
                    inlineAction.isPreferred = true;
                    actions.push(inlineAction);
                    
                    // 创建添加完整PHPDoc注释的修复操作
                    const fullDocAction = new vscode.CodeAction(
                        `为 ${variableName} 生成完整PHPDoc注释`,
                        vscode.CodeActionKind.QuickFix
                    );
                    
                    // 获取类中的所有方法
                    const methods = await TypeResolver.parseClassMethods(classFile);
                    if (methods.length > 0) {
                        // 生成完整的PHPDoc
                        const fullPhpDoc = TypeResolver.generateMethodPhpDoc(fullClassName, methods);
                        
                        // 查找变量定义所在行
                        let varDefLine = -1;
                        const varDefPattern = new RegExp(`${variableName}\\s*=`, 'g');
                        
                        // 从当前行向上搜索变量定义
                        for (let i = range.start.line; i >= 0; i--) {
                            const lineText: string = document.lineAt(i).text;
                            if (varDefPattern.test(lineText)) {
                                varDefLine = i;
                                break;
                            }
                        }
                        
                        if (varDefLine >= 0) {
                            const fullDocEdit = new vscode.WorkspaceEdit();
                            const defLineIndentation = document.lineAt(varDefLine).text.match(/^\s*/)?.[0] || '';
                            
                            // 格式化PHPDoc注释，保持正确缩进
                            const formattedPhpDoc = fullPhpDoc
                                .split('\n')
                                .map((line: string) => `${defLineIndentation}${line}`)
                                .join('\n');
                            
                            fullDocEdit.insert(
                                document.uri, 
                                new vscode.Position(varDefLine, 0), 
                                `${formattedPhpDoc}\n`
                            );
                            
                            fullDocAction.edit = fullDocEdit;
                            actions.push(fullDocAction);
                        }
                    }
                    
                    return actions;
                } catch (error) {
                    console.error('创建代码修复操作时出错:', error);
                    return null;
                }
            }
        };
    }
} 