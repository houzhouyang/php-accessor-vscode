import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { parsePhpClass } from './utils/phpParser';

export class AccessorNavigator {
    // 用于缓存已找到的类关联和文件路径
    private classPropertyCache = new Map<string, Map<string, vscode.Location>>();
    private classFileCache = new Map<string, string | null>();

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
        
        // If not found in current document, try to find in Hyperf accessor directories  
        try {
            // Get the current file path
            const currentFilePath = editor.document.uri.fsPath;
            
            // Check if current file has Hyperf accessor traits
            const accessorInfo = await this.findHyperfAccessorForCurrentClass(editor.document);
            
            if (accessorInfo) {
                // Navigate to the accessor trait
                const accessorFilePath = accessorInfo.traitPath;
                const accessorDoc = await vscode.workspace.openTextDocument(accessorFilePath);
                
                // Search for the property accessor in the trait file
                const getterName = `get${propertyName.charAt(0).toUpperCase() + propertyName.slice(1)}`;
                const setterName = `set${propertyName.charAt(0).toUpperCase() + propertyName.slice(1)}`;
                
                const accessorText = accessorDoc.getText();
                
                // Look for getter or setter method
                const getterRegex = new RegExp(`function\\s+${getterName}\\s*\\(`, 'i');
                const setterRegex = new RegExp(`function\\s+${setterName}\\s*\\(`, 'i');
                
                const getterMatch = getterRegex.exec(accessorText);
                const setterMatch = setterRegex.exec(accessorText);
                
                if (getterMatch || setterMatch) {
                    const match = getterMatch || setterMatch;
                    const methodPos = accessorDoc.positionAt(match!.index);
                    const accessorEditor = await vscode.window.showTextDocument(accessorDoc);
                    accessorEditor.selection = new vscode.Selection(methodPos, methodPos);
                    accessorEditor.revealRange(new vscode.Range(methodPos, methodPos));
                        return;
                }
            }
            
            // If we get here, the property was not found anywhere
            vscode.window.showInformationMessage(`Property $${propertyName} not found in current file or accessor traits.`);
        } catch (error) {
            console.error('Error searching for property in accessor traits:', error);
            vscode.window.showInformationMessage(`Property $${propertyName} not found in current document.`);
        }
    }

    /**
     * 为当前类查找对应的Hyperf访问器trait
     */
    private async findHyperfAccessorForCurrentClass(document: vscode.TextDocument): Promise<{traitPath: string, className: string} | null> {
        try {
            const text = document.getText();
            const currentFilePath = document.uri.fsPath;
            
            // 从当前文件的include_once语句中查找accessor路径
            const includeMatch = text.match(/include_once\s+['"](accessor\/.+?\.php)['"]/);
            
            if (includeMatch) {
                const accessorRelativePath = includeMatch[1];
                const currentDir = path.dirname(currentFilePath);
                const accessorFilePath = path.join(currentDir, accessorRelativePath);
                
                if (fs.existsSync(accessorFilePath)) {
                    const className = this.getClassNameFromDocument(document);
                    return {
                        traitPath: accessorFilePath,
                        className: className || ''
                    };
                }
            }
            
            // 如果没有找到include_once，尝试基于类名推断
            const className = this.getClassNameFromDocument(document);
            if (!className) {
                return null;
            }
            
            // 获取当前类的命名空间
            const namespaceMatch = text.match(/namespace\s+([^;]+);/);
            if (!namespaceMatch) {
                return null;
            }
            
            const namespace = namespaceMatch[1];
            const fullClassName = `${namespace}\\${className}`;
            
            // 构造accessor文件名
            const accessorFileName = `_Proxy_${fullClassName.replace(/\\/g, '_')}Accessor.php`;
            const currentDir = path.dirname(currentFilePath);
            const accessorDir = path.join(currentDir, 'accessor');
            const accessorFilePath = path.join(accessorDir, accessorFileName);
            
            if (fs.existsSync(accessorFilePath)) {
                return {
                    traitPath: accessorFilePath,
                    className: className
                };
            }
            
            return null;
        } catch (error) {
            console.error('查找Hyperf访问器时出错:', error);
            return null;
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
        
        // If not found in current document, try to find in Hyperf accessor trait
        try {
            // Check if current file has Hyperf accessor traits
            const accessorInfo = await this.findHyperfAccessorForCurrentClass(editor.document);
            
            if (accessorInfo) {
                // Navigate to the accessor trait
                const accessorFilePath = accessorInfo.traitPath;
                const accessorDoc = await vscode.workspace.openTextDocument(accessorFilePath);
                
                // Search for the accessors in the trait file
                const accessorText = accessorDoc.getText();
                
                // Reset regex to search in the trait file
                const traitGetterRegex = new RegExp(`function\\s+get${capitalizedName}\\s*\\(`, 'g');
                const traitSetterRegex = new RegExp(`function\\s+set${capitalizedName}\\s*\\(`, 'g');
                
                const traitGetterMatch = traitGetterRegex.exec(accessorText);
                const traitSetterMatch = traitSetterRegex.exec(accessorText);
                
                if (traitGetterMatch || traitSetterMatch) {
                            // Show a quick pick to choose between getter and setter
                            const options = [];
                    if (traitGetterMatch) {
                        options.push('Getter (in accessor trait)');
                            }
                    if (traitSetterMatch) {
                        options.push('Setter (in accessor trait)');
                            }
                            
                            const choice = await vscode.window.showQuickPick(options, {
                                placeHolder: 'Navigate to...'
                            });
                            
                    // Open the editor for the trait file
                    const traitEditor = await vscode.window.showTextDocument(accessorDoc);
                    
                    if (choice === 'Getter (in accessor trait)' && traitGetterMatch) {
                        const getterPos = accessorDoc.positionAt(traitGetterMatch.index);
                        traitEditor.selection = new vscode.Selection(getterPos, getterPos);
                        traitEditor.revealRange(new vscode.Range(getterPos, getterPos));
                                return;
                    } else if (choice === 'Setter (in accessor trait)' && traitSetterMatch) {
                        const setterPos = accessorDoc.positionAt(traitSetterMatch.index);
                        traitEditor.selection = new vscode.Selection(setterPos, setterPos);
                        traitEditor.revealRange(new vscode.Range(setterPos, setterPos));
                                return;
                    }
                }
            }
            
            // If we get here, no accessors were found
            vscode.window.showInformationMessage(`No accessors found for $${propertyName}`);
        } catch (error) {
            console.error('Error searching for accessors in trait files:', error);
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
                const isProxyFile = this.isHyperfProxyFile(currentFilePath);
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
                    return this.handleMethodCallNavigation(document, position, word, propertyName, cacheKey, classPropertyCache);
                }
                
                return null;
            }
        };
    }

    /**
     * 处理从Hyperf代理trait跳转到原始类属性
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
            
            // 1. 解析Hyperf代理文件名格式
            const fileName = path.basename(currentFilePath, '.php');
            
            const originalClassInfo = this.parseHyperfProxyFileName(fileName);
            
            if (!originalClassInfo) {
                console.error(`❌ 无法解析代理文件名: ${fileName}`);
                return null;
            }
            
            
            // 2. 尝试加载meta文件获取精确的属性映射
            const propertyMapping = await this.loadPropertyMappingFromMeta(currentFilePath, word);
            
            if (propertyMapping) {
            } else {
            }
            
            // 3. 查找原始类文件以解析命名约定
            
            const originalClassFile = await this.findOriginalClassFromNamespace(originalClassInfo);
            
            if (!originalClassFile) {
                console.error(`❌ 未找到原始类文件:`);
                
                // 显示尝试的路径
                await this.debugShowAttemptedPaths(originalClassInfo);
                return null;
            }
            
            
            // 4. 读取原始类内容并解析命名约定
            let namingConvention = 2; // 默认 LOWER_CAMEL_CASE
            let propertyNameVariants: string[] = [];
            
            try {
                const originalClassContent = fs.readFileSync(originalClassFile, 'utf8');
                namingConvention = this.parseNamingConvention(originalClassContent);
                
                const conventionNames: Record<number, string> = {1: 'NONE', 2: 'LOWER_CAMEL_CASE', 3: 'UPPER_CAMEL_CASE'};
                
                // 生成可能的属性名变体
                propertyNameVariants = this.generatePropertyNameVariants(word, namingConvention);
                
            } catch (error) {
                console.error(`⚠️  读取原始类文件失败，使用默认命名约定:`, error);
                propertyNameVariants = [propertyName, this.camelToSnakeCase(propertyName)];
            }
            
            // 5. 确定最终的属性名（优先使用meta映射）
            let realPropertyName: string;
            if (propertyMapping?.fieldName) {
                realPropertyName = propertyMapping.fieldName;
            } else {
                // 使用命名约定的主要变体
                realPropertyName = propertyNameVariants[0];
            }
            
            // 5. 尝试多个属性名变体进行查找
            
            // 构建搜索候选列表（优先级顺序）
            const searchCandidates: string[] = [];
            
            // 1. 优先使用meta映射的名称
            if (propertyMapping?.fieldName) {
                searchCandidates.push(propertyMapping.fieldName);
            }
            
            // 2. 添加基于命名约定的变体
            if (propertyNameVariants.length > 0) {
                for (const variant of propertyNameVariants) {
                    if (!searchCandidates.includes(variant)) {
                        searchCandidates.push(variant);
                    }
                }
            }
            
            
            // 逐个尝试搜索候选
            for (let i = 0; i < searchCandidates.length; i++) {
                const candidateName = searchCandidates[i];
                
                const result = await this.findPropertyInFile(
                    originalClassFile, 
                    originalClassInfo.className, 
                    candidateName, 
                    `${cacheKey}_${candidateName}`, 
                    classPropertyCache,
                    true // 强制查找原始类
                );
                
                if (result) {
                    return result;
                }
                
            }
            
            console.error(`❌ 所有属性名变体都未找到:`);
            
            // 显示类中的所有属性供参考
            await this.debugShowClassProperties(originalClassFile);
            
            // 不进行错误的回退搜索，避免跳转到错误的类
            return null;
            
        } catch (error) {
            console.error('=== 💥 代理类跳转异常 ===');
            console.error('错误详情:', error);
            return null;
        }
    }
    
    /**
     * 调试：显示尝试查找的路径
     */
    private async debugShowAttemptedPaths(classInfo: {className: string, fullClassName: string, namespace: string}): Promise<void> {
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                return;
            }
            
            const workspaceRoot = workspaceFolders[0].uri.fsPath;
            const namespacePath = classInfo.namespace.split('\\');
            
            
            const possiblePaths = [
                path.join(workspaceRoot, namespacePath[0].toLowerCase(), ...namespacePath.slice(1), `${classInfo.className}.php`),
                path.join(workspaceRoot, ...namespacePath, `${classInfo.className}.php`),
                path.join(workspaceRoot, 'src', ...namespacePath.slice(1), `${classInfo.className}.php`),
                path.join(workspaceRoot, 'app', ...namespacePath.slice(1), `${classInfo.className}.php`),
                path.join(workspaceRoot, 'lib', ...namespacePath, `${classInfo.className}.php`),
            ];
            
            for (let i = 0; i < possiblePaths.length; i++) {
                const filePath = possiblePaths[i];
                const exists = fs.existsSync(filePath);
            }
        } catch (error) {
            console.error('   ❌ 调试路径显示失败:', error);
        }
    }
    
    /**
     * 调试：显示类中的所有属性
     */
    private async debugShowClassProperties(classFilePath: string): Promise<void> {
        try {
            const content = fs.readFileSync(classFilePath, 'utf8');
            const propertyPattern = /(public|protected|private)\s+(?:readonly\s+)?(?:\w+\s+)?\$(\w+)/g;
            const properties: string[] = [];
            
            let match;
            while ((match = propertyPattern.exec(content)) !== null) {
                properties.push(match[2]);
            }
            

        } catch (error) {
            console.error('   ❌ 读取类属性失败:', error);
        }
    }
    
    /**
     * 解析Hyperf代理文件名，提取原始类信息
     * 格式: _Proxy_App_Domain_Access_Entity_AccessModifyRecordAccessor.php
     */
    private parseHyperfProxyFileName(fileName: string): {className: string, fullClassName: string, namespace: string} | null {
        // 匹配_Proxy_开头的文件名
        const proxyPattern = /^_Proxy_(.+?)Accessor$/;
        const match = fileName.match(proxyPattern);
        
        if (!match) {
                return null;
            }

        // 将下划线分隔的路径转换为命名空间
        const namespaceParts = match[1].split('_');
        const className = namespaceParts[namespaceParts.length - 1];
        const namespace = namespaceParts.slice(0, -1).join('\\');
        const fullClassName = namespaceParts.join('\\');
        
        return {
            className,
            namespace,
            fullClassName
        };
    }
    
    /**
     * 从meta文件加载属性映射信息
     */
    private async loadPropertyMappingFromMeta(proxyFilePath: string, methodName: string): Promise<{fieldName: string, methodName: string} | null> {
        try {
            // 确定meta文件路径
            const proxyDir = path.dirname(proxyFilePath);
            const metaDir = path.join(path.dirname(proxyDir), 'meta');
            
            // 查找对应的meta文件
            if (!fs.existsSync(metaDir)) {
                return null;
            }
            
            const metaFiles = fs.readdirSync(metaDir).filter(file => file.endsWith('.json'));
            
            for (const metaFile of metaFiles) {
                const metaPath = path.join(metaDir, metaFile);
                
                try {
                    const metaContent = fs.readFileSync(metaPath, 'utf8');
                    const metaData = JSON.parse(metaContent);
                    
                    // 查找匹配的方法
                    if (metaData.methods && Array.isArray(metaData.methods)) {
                        const method = metaData.methods.find((m: any) => 
                            m.methodName && m.methodName.toLowerCase() === methodName.toLowerCase()
                        );
                        
                        if (method) {
                            return {
                                fieldName: method.fieldName,
                                methodName: method.methodName
                            };
                        }
                    }
                } catch (err) {
                    console.log(`解析meta文件失败: ${metaPath}`, err);
                    continue;
                }
            }
            
            return null;
        } catch (error) {
            return null;
        }
    }
    
    /**
     * 将访问器方法名转换为属性名（处理驼峰转换）
     */
    private convertAccessorToProperty(methodName: string, defaultPropertyName: string): string {
        // 对于Hyperf框架，可能存在以下转换规律：
        // getGroupcode -> groupCode
        // getAccessno -> accessNo  
        // getSuppliername -> supplierName
        
        // 移除get/set前缀
        const baseName = methodName.substring(3);
        
        // 常见的缩写词映射
        const abbreviationMap: Record<string, string> = {
            'code': 'Code',
            'no': 'No',
            'num': 'Num', 
            'name': 'Name',
            'id': 'Id',
            'type': 'Type',
            'info': 'Info',
            'key': 'Key'
        };
        
        // 尝试智能转换
        let result = defaultPropertyName;
        
        // 检查是否包含常见缩写
        for (const [abbr, proper] of Object.entries(abbreviationMap)) {
            const pattern = new RegExp(`${abbr}$`, 'i');
            if (pattern.test(baseName)) {
                const prefix = baseName.substring(0, baseName.length - abbr.length);
                result = prefix + proper;
                    break;
                                }
                            }
        
        return result;
    }
    
    /**
     * 解析类的命名约定
     */
    private parseNamingConvention(classContent: string): number {
        try {
            // 查找 #[Data(namingConvention: NamingConvention::XXX)] 注解
            const dataAnnotationMatch = classContent.match(/#\[Data\([^)]*namingConvention:\s*NamingConvention::(\w+)[^)]*\)]/);
            if (dataAnnotationMatch) {
                const convention = dataAnnotationMatch[1];
                switch (convention) {
                    case 'NONE': return 1;
                    case 'LOWER_CAMEL_CASE': return 2;
                    case 'UPPER_CAMEL_CASE': return 3;
                    default: return 2; // 默认小驼峰
                }
            }
            
            // 查找 #[HyperfData] 注解，默认使用小驼峰
            if (classContent.includes('#[HyperfData]')) {
                return 2; // LOWER_CAMEL_CASE
            }
            
            // 如果没有找到注解，默认不转换
            return 1; // NONE
        } catch (error) {
            console.error('解析命名约定时出错:', error);
            return 2; // 默认小驼峰
        }
    }
    
    /**
     * 根据命名约定转换属性名
     */
    private convertPropertyNameByConvention(methodName: string, convention: number): string {
        // 去掉 get/set 前缀
        let propertyBase = methodName.substring(3);
        
        switch (convention) {
            case 1: // NONE - 不转换，保持原样
                return propertyBase.charAt(0).toLowerCase() + propertyBase.slice(1);
                
            case 2: // LOWER_CAMEL_CASE - 小驼峰
                return propertyBase.charAt(0).toLowerCase() + propertyBase.slice(1);
                
            case 3: // UPPER_CAMEL_CASE - 大驼峰  
                return propertyBase.charAt(0).toUpperCase() + propertyBase.slice(1);
                
            default:
                return propertyBase.charAt(0).toLowerCase() + propertyBase.slice(1);
        }
    }
    
    /**
     * 根据命名约定将方法名转换为可能的属性名变体
     */
    private generatePropertyNameVariants(methodName: string, convention: number): string[] {
        const variants: string[] = [];
        const propertyBase = methodName.substring(3); // 去掉get/set
        
        // 根据约定生成主要变体
        const primaryName = this.convertPropertyNameByConvention(methodName, convention);
        variants.push(primaryName);
        
        // 总是添加一些常见变体以防注解解析错误
        variants.push(propertyBase.charAt(0).toLowerCase() + propertyBase.slice(1)); // 小驼峰
        variants.push(this.camelToSnakeCase(propertyBase)); // 下划线格式
        
        // 去重
        return [...new Set(variants)];
    }
    
    /**
     * 驼峰转下划线
     */
    private camelToSnakeCase(str: string): string {
        return str.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
    }
    
    /**
     * 检测是否为Hyperf代理文件
     */
    public isHyperfProxyFile(filePath: string): boolean {
        try {
            // 检查文件路径是否包含accessor目录
            if (!filePath.includes('accessor')) {
                return false;
            }
            
            const fileName = path.basename(filePath, '.php');
            
            // 检查文件名是否符合Hyperf代理文件格式
            const isProxyFileName = fileName.startsWith('_Proxy_') && fileName.endsWith('Accessor');
            
            if (!isProxyFileName) {
                return false;
            }
            
            // 进一步验证文件内容是否为trait
                if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf8');
                return content.includes('trait ' + fileName);
            }
            
            return true;
        } catch (error) {
            return false;
        }
    }
    
    /**
     * 根据命名空间查找原始类文件
     */
    private async findOriginalClassFromNamespace(classInfo: {className: string, fullClassName: string, namespace: string}): Promise<string | null> {
        try {
            // 使用现有的缓存查找机制
            const cachedPath = await this.findClassFileFromNamespaceWithCache(classInfo.fullClassName);
            if (cachedPath) {
                return cachedPath;
            }
            
            // 如果缓存查找失败，尝试基于PSR-4规范的路径推断
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                return null;
            }
            
            const workspaceRoot = workspaceFolders[0].uri.fsPath;
            
            // 将命名空间转换为文件路径
            // App\Domain\Access\Entity -> app/Domain/Access/Entity
            const namespacePath = classInfo.namespace.split('\\');
            
            // 增强的PSR-4映射规则，针对实际项目结构优化
            const possiblePaths = [
                // 标准PSR-4: App -> app/ (最常用)
                path.join(workspaceRoot, namespacePath[0].toLowerCase(), ...namespacePath.slice(1), `${classInfo.className}.php`),
                // 直接映射: App -> App/
                path.join(workspaceRoot, ...namespacePath, `${classInfo.className}.php`),
                // src目录映射: App -> src/
                path.join(workspaceRoot, 'src', ...namespacePath.slice(1), `${classInfo.className}.php`),
                // src直接映射: App -> src/App/
                path.join(workspaceRoot, 'src', ...namespacePath, `${classInfo.className}.php`),
                // 常见的web项目结构
                path.join(workspaceRoot, 'application', ...namespacePath.slice(1), `${classInfo.className}.php`),
            ];
            
            for (const filePath of possiblePaths) {
                if (fs.existsSync(filePath)) {
                    return filePath;
                }
            }
            
            return null;
        } catch (error) {
            console.error('查找原始类文件时出错:', error);
            return null;
        }
    }
    
    /**
     * 处理从方法调用跳转到原始属性
     */
    private async handleMethodCallNavigation(
        document: vscode.TextDocument,
        position: vscode.Position,
        word: string,
        propertyName: string,
        cacheKey: string,
        classPropertyCache: Map<string, Map<string, vscode.Location>>
    ): Promise<vscode.Location | null> {
        try {
            // **优先逻辑：尝试从上下文推断调用对象类型**
            const lineText = document.lineAt(position.line).text;
            
            // 智能提取调用对象（支持链式调用和直接调用）
            const callerInfo = this.extractMethodCaller(document, position, word);
            if (callerInfo && callerInfo.type) {
                // 尝试找到对应的代理文件
                const targetLocation = await this.findPropertyByTargetClass(callerInfo.type, propertyName);
                if (targetLocation) {
                    return targetLocation;
                }
            }
            
            // **回退逻辑：搜索包含目标方法的代理文件**
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                return null;
            }

            // 使用直接文件系统搜索代理文件
            const workspaceRoot = workspaceFolders[0].uri.fsPath;
            const proxyDir = path.join(workspaceRoot, '.php-accessor', 'proxy', 'accessor');
            
            let proxyFiles: vscode.Uri[] = [];
            if (fs.existsSync(proxyDir)) {
                const files = fs.readdirSync(proxyDir)
                    .filter(file => file.endsWith('Accessor.php'))
                    .map(file => vscode.Uri.file(path.join(proxyDir, file)));
                proxyFiles = files;
            } else {
                // 回退到vscode搜索
                proxyFiles = await vscode.workspace.findFiles(
                    '**/.php-accessor/proxy/accessor/*Accessor.php',
                    '**/vendor/**'
                );
            }
            
            for (const proxyFile of proxyFiles) {
                try {
                    const content = fs.readFileSync(proxyFile.fsPath, 'utf8');
                    
                    // 检查是否包含目标方法
                    const methodPattern = new RegExp(`function\\s+${word}\\s*\\(`, 'i');
                    if (!methodPattern.test(content)) {
                        continue;
                    }
                    
                    // **关键：直接从代理文件名解析原始类信息**
                    const fileName = path.basename(proxyFile.fsPath, '.php');
                    const originalClassInfo = this.parseHyperfProxyFileName(fileName);
                    
                    if (!originalClassInfo) {
                        continue;
                    }
                    
                    // **直接根据解析出的类名查找原始类文件**
                    const originalClassFile = await this.findClassFileByFullName(originalClassInfo.fullClassName);
                    if (!originalClassFile) {
                        continue;
                    }
                    
                    // **在原始类中查找属性**
                    const location = await this.findPropertyInFileSimple(originalClassFile, propertyName);
                    if (location) {
                        return location;
                    }
                    
                } catch (error) {
                    console.error(`处理代理文件 ${proxyFile.fsPath} 时出错:`, error);
                }
            }
            
            return null;
            
        } catch (error) {
            console.error('方法调用跳转时出错:', error);
            return null;
        }
    }
    

    /**
     * 智能提取方法调用者信息（支持链式调用和new表达式）
     */
    private extractMethodCaller(document: vscode.TextDocument, position: vscode.Position, targetMethod: string): {caller: string, type: string | null} | null {
        try {
            const lineText = document.lineAt(position.line).text;
            const wordStart = document.getWordRangeAtPosition(position)?.start.character || 0;
            const beforeMethod = lineText.substring(0, wordStart);
            
            // 1. 检查是否是真正的链式调用 (行开始是 -> 且不在参数中)
            if (beforeMethod.trim().endsWith('->')) {
                // 进一步检查：确保这不是方法参数中的调用
                const isParameterCall = this.isMethodCallInParameters(lineText, wordStart);
                
                if (!isParameterCall) {
                    
                    // 向前查找多行，寻找调用链的起始
                    const chainStart = this.findChainCallStart(document, position);
                    if (chainStart) {
                        
                        // 尝试从调用链起始推断类型
                        const type = this.inferTypeFromChainStart(chainStart.caller, document);
                        return {
                            caller: chainStart.caller,
                            type: type
                        };
                    } else {
                    }
                } else {
                }
            }
            
            // 2. 检查是否是直接调用 ($variable->method) - 支持方法参数中的调用
            // 更灵活的匹配模式，支持参数中的调用
            const directCallMatch = beforeMethod.match(/(\$\w+)\s*->\s*$/);
            if (directCallMatch) {
                const variableName = directCallMatch[1];
                
                const useStatements = this.extractUseStatements(document.getText());
                const type = this.inferTypeFromVariableName(variableName, useStatements);
                const fullType = type ? (this.resolveFullClassName(type, useStatements) || type) : null;
                
                return {
                    caller: variableName,
                    type: fullType
                };
            }
            
            // 3. 尝试从整行中提取变量调用（处理复杂情况）
            const complexCallMatch = lineText.match(/(\$\w+)\s*->\s*\w+\s*\(/);
            if (complexCallMatch) {
                // 检查匹配的方法是否是当前光标所在的方法
                const matchedVarName = complexCallMatch[1];
                const methodPattern = new RegExp(`\\${matchedVarName}\\s*->\\s*(\\w+)\\s*\\(`);
                const methodMatch = lineText.match(methodPattern);
                
                if (methodMatch && methodMatch[1] === targetMethod) {
                    
                    const useStatements = this.extractUseStatements(document.getText());
                    const type = this.inferTypeFromVariableName(matchedVarName, useStatements);
                    const fullType = type ? (this.resolveFullClassName(type, useStatements) || type) : null;
                    
                    return {
                        caller: matchedVarName,
                        type: fullType
                    };
                }
            }
            
            return null;
            
        } catch (error) {
            console.error('提取方法调用者时出错:', error);
            return null;
        }
    }

    /**
     * 检查方法调用是否在参数中（而非真正的链式调用）
     */
    private isMethodCallInParameters(lineText: string, methodStartPos: number): boolean {
        try {
            
            // 从方法位置向前查找，寻找最近的开括号和方法名
            let pos = methodStartPos - 1;
            let parenCount = 0;
            let foundOpenParen = false;
            
            // 向前扫描寻找括号平衡
            while (pos >= 0) {
                const char = lineText[pos];
                
                if (char === ')') {
                    parenCount++;
                } else if (char === '(') {
                    if (parenCount === 0) {
                        foundOpenParen = true;
                                break;
                    } else {
                        parenCount--;
                    }
                }
                pos--;
            }
            
            if (foundOpenParen) {
                // 检查开括号前是否有方法调用模式
                const beforeParen = lineText.substring(0, pos).trim();
                
                // 检查是否是方法调用模式: ->methodName( 或 methodName(
                const methodCallPattern = /->\s*\w+$|^\s*\w+$/;
                if (methodCallPattern.test(beforeParen)) {
                    return true;
                }
            }
            
            return false;
            
        } catch (error) {
            console.error('检查方法调用参数时出错:', error);
            return false;
        }
    }

    /**
     * 寻找链式调用的起始点
     */
    private findChainCallStart(document: vscode.TextDocument, position: vscode.Position): {caller: string, line: number} | null {
        try {
            // 从当前行向前查找，最多查找10行
            const maxLookBack = 10;
            const startLine = Math.max(0, position.line - maxLookBack);
            
            for (let lineNum = position.line; lineNum >= startLine; lineNum--) {
                const line = document.lineAt(lineNum);
                const lineText = line.text;
                
                
                // 检查 (new ClassName()) 模式
                const newMatch = lineText.match(/\(\s*new\s+(\w+)\s*\(\s*\)\s*\)/);
                if (newMatch) {
                    const className = newMatch[1];
                    return {
                        caller: `(new ${className}())`,
                        line: lineNum
                    };
                }
                
                // 检查 $variable = 模式
                const assignMatch = lineText.match(/(\$\w+)\s*=/);
                if (assignMatch) {
                    const variableName = assignMatch[1];
                    return {
                        caller: variableName,
                        line: lineNum
                    };
                }
                
                // 检查直接的 $variable-> 模式
                const varMatch = lineText.match(/(\$\w+)\s*->/);
                if (varMatch && !lineText.trim().startsWith('->')) {
                    const variableName = varMatch[1];
                    return {
                        caller: variableName,
                        line: lineNum
                    };
                }
                
                // 如果行不是以 -> 开始，说明调用链已经结束
                if (!lineText.trim().startsWith('->') && lineNum < position.line) {
                            break;
                        }
            }
            
            return null;
        } catch (error) {
            console.error('寻找链式调用起始时出错:', error);
            return null;
        }
    }

    /**
     * 从调用链起始推断类型
     */
    private inferTypeFromChainStart(caller: string, document: vscode.TextDocument): string | null {
        try {
            
            // 1. 处理 (new ClassName()) 模式
            const newMatch = caller.match(/\(\s*new\s+(\w+)\s*\(\s*\)\s*\)/);
            if (newMatch) {
                const className = newMatch[1];
                
                // 解析完整类名
                const useStatements = this.extractUseStatements(document.getText());
                const fullClassName = this.resolveFullClassName(className, useStatements) || className;
                return fullClassName;
            }
            
            // 2. 处理 $variable 模式
            if (caller.startsWith('$')) {
                const useStatements = this.extractUseStatements(document.getText());
                const type = this.inferTypeFromVariableName(caller, useStatements);
                const fullType = type ? (this.resolveFullClassName(type, useStatements) || type) : null;
                return fullType;
            }
            
            return null;
            
        } catch (error) {
            console.error('从调用链起始推断类型时出错:', error);
                return null;
        }
    }

    /**
     * 根据目标类名查找对应的属性位置
     */
    private async findPropertyByTargetClass(fullClassName: string, propertyName: string): Promise<vscode.Location | null> {
        try {
            
            // 构建期望的代理文件名
            const expectedProxyName = this.buildProxyFileNameFromClassName(fullClassName);
            
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                return null;
            }
            
            const workspaceRoot = workspaceFolders[0].uri.fsPath;
            const proxyDir = path.join(workspaceRoot, '.php-accessor', 'proxy', 'accessor');
            
            if (!fs.existsSync(proxyDir)) {
                return null;
            }
            
            // 检查期望的代理文件是否存在
            const expectedProxyPath = path.join(proxyDir, expectedProxyName);
            if (fs.existsSync(expectedProxyPath)) {
                
                // 直接查找原始类文件
                const originalClassFile = await this.findClassFileByFullName(fullClassName);
                if (!originalClassFile) {
                    return null;
                }
                
                
                // 解析NamingConvention并生成属性名变体
                let namingConvention = 2; // 默认 LOWER_CAMEL_CASE
                try {
                    const classContent = fs.readFileSync(originalClassFile, 'utf8');
                    namingConvention = this.parseNamingConvention(classContent);
                    const conventionNames: Record<number, string> = {1: 'NONE', 2: 'LOWER_CAMEL_CASE', 3: 'UPPER_CAMEL_CASE'};
                } catch (error) {
                }
                
                // 生成可能的属性名变体
                const methodName = propertyName.substring(0, 1).toUpperCase() + propertyName.substring(1);
                const propertyNameVariants = this.generatePropertyNameVariants('get' + methodName, namingConvention);
                
                // 逐个尝试搜索候选属性名
                for (let i = 0; i < propertyNameVariants.length; i++) {
                    const candidateName = propertyNameVariants[i];
                    
                    const location = await this.findPropertyInFileSimple(originalClassFile, candidateName);
                    if (location) {
                        return location;
                    } else {
                    }
                }
                
                } else {
                
                // 直接在原始类文件中查找属性（无代理文件的情况）
                const directLocation = await this.findPropertyInOriginalClass(fullClassName, propertyName);
                if (directLocation) {
                    return directLocation;
                } else {
                }
            }
            
            return null;
        } catch (error) {
            console.error('根据类名查找属性时出错:', error);
            return null;
        }
    }

    /**
     * 直接在原始类中查找属性（无代理文件时）
     */
    private async findPropertyInOriginalClass(fullClassName: string, propertyName: string): Promise<vscode.Location | null> {
        try {
            
            // 1. 找到原始类文件
            const originalClassFile = await this.findClassFileByFullName(fullClassName);
            if (!originalClassFile) {
                return null;
            }
            
            
            // 2. 解析命名约定（如果有的话）
            let namingConvention = 1; // 默认 NONE，因为这些类可能没有注解
            let propertyNameVariants: string[] = [];
            
            try {
                const classContent = fs.readFileSync(originalClassFile, 'utf8');
                
                // 检查是否有命名约定注解
                const hasDataAnnotation = classContent.includes('#[Data') || classContent.includes('#[HyperfData]');
                if (hasDataAnnotation) {
                    namingConvention = this.parseNamingConvention(classContent);
                    const conventionNames: Record<number, string> = {1: 'NONE', 2: 'LOWER_CAMEL_CASE', 3: 'UPPER_CAMEL_CASE'};
                } else {
                }
                
                // 生成属性名变体
                const methodName = propertyName.substring(0, 1).toUpperCase() + propertyName.substring(1);
                propertyNameVariants = this.generatePropertyNameVariants('get' + methodName, namingConvention);
                
                // 对于无注解的类，还要尝试原始属性名
                if (!hasDataAnnotation) {
                    propertyNameVariants.unshift(propertyName); // 优先尝试原始属性名
                }
                
                
            } catch (error) {
                propertyNameVariants = [propertyName, propertyName.toLowerCase()];
            }
            
            // 3. 逐个尝试搜索候选属性名
            for (let i = 0; i < propertyNameVariants.length; i++) {
                const candidateName = propertyNameVariants[i];
                
                const location = await this.findPropertyInFileSimple(originalClassFile, candidateName);
                if (location) {
                    return location;
                } else {
                }
            }
            
            return null;
            
                    } catch (error) {
            console.error('直接在原始类中查找属性时出错:', error);
            return null;
        }
    }

    /**
     * 根据类全名构建代理文件名
     */
    private buildProxyFileNameFromClassName(fullClassName: string): string {
        // App\Interfaces\Dto\Access\ProductDTO -> _Proxy_App_Interfaces_Dto_Access_ProductDTOAccessor.php
        const namespaceSegments = fullClassName.split('\\');
        const proxyName = '_Proxy_' + namespaceSegments.join('_') + 'Accessor.php';
        return proxyName;
    }

    /**
     * 根据完整类名查找类文件 - 简化版本
     */
    private async findClassFileByFullName(fullClassName: string): Promise<string | null> {
        try {
            
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
            return null;
            }
            
            const workspaceRoot = workspaceFolders[0].uri.fsPath;
            
            // 将命名空间转换为文件路径
            // App\Interfaces\Dto\Access\ProductDTO → app/Interfaces/Dto/Access/ProductDTO.php
            const classPath = fullClassName.replace(/\\/g, '/');
            
            // 尝试常见的PSR-4路径模式
            const possiblePaths = [
                path.join(workspaceRoot, 'app', classPath + '.php'),           // app/App/Interfaces/...
                path.join(workspaceRoot, classPath + '.php'),                 // App/Interfaces/...
                path.join(workspaceRoot, 'src', classPath + '.php'),          // src/App/Interfaces/...
                path.join(workspaceRoot, 'app', classPath.substring(4) + '.php'), // app/Interfaces/... (去掉App/)
            ];
            
            for (const filePath of possiblePaths) {
                if (fs.existsSync(filePath)) {
                    return filePath;
                }
            }
            
            return null;
            
        } catch (error) {
            console.error(`查找类文件时出错: ${fullClassName}`, error);
            return null;
        }
    }
    
    /**
     * 策略1: 通过代理类文件查找属性
     * 在项目中搜索包含目标方法的代理trait，然后追溯到原始类
     */
    private async findPropertyViaProxyFiles(methodName: string, propertyName: string): Promise<vscode.Location | null> {
        try {
            
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                return null;
            }
            
            // 使用直接文件系统搜索代理文件
            const workspaceRoot = workspaceFolders[0].uri.fsPath;
            const proxyDir = path.join(workspaceRoot, '.php-accessor', 'proxy', 'accessor');
            
            let proxyFiles: vscode.Uri[] = [];
            if (fs.existsSync(proxyDir)) {
                const files = fs.readdirSync(proxyDir)
                    .filter(file => file.endsWith('Accessor.php'))
                    .map(file => vscode.Uri.file(path.join(proxyDir, file)));
                proxyFiles = files;
            } else {
                // 回退到vscode搜索
                proxyFiles = await vscode.workspace.findFiles(
                    '**/.php-accessor/proxy/accessor/*Accessor.php',
                    '**/vendor/**'
                );
            }
            
            
            for (const proxyFile of proxyFiles) {
                try {
                    const content = fs.readFileSync(proxyFile.fsPath, 'utf8');
                    
                    // 检查是否包含目标方法
                    const methodPattern = new RegExp(`function\\s+${methodName}\\s*\\(`, 'i');
                    if (!methodPattern.test(content)) {
                        continue;
                    }
                    
                    
                    // 从代理文件名解析原始类信息
                    const fileName = path.basename(proxyFile.fsPath, '.php');
                    const originalClassInfo = this.parseHyperfProxyFileName(fileName);
                    
                    if (!originalClassInfo) {
                            continue;
                        }
                    
                    
                    // 尝试加载对应的meta文件获取精确属性映射
                    const propertyMapping = await this.loadPropertyMappingFromMeta(proxyFile.fsPath, methodName);
                    
                    // 查找原始类文件
                    const originalClassFile = await this.findOriginalClassFromNamespace(originalClassInfo);
                    if (!originalClassFile) {
                        continue;
                    }
                    
                    
                    // 读取原始类内容并解析命名约定
                    const originalContent = fs.readFileSync(originalClassFile, 'utf8');
                    const namingConvention = this.parseNamingConvention(originalContent);
                    
                    // 生成可能的属性名，优先使用meta映射
                    let propertyNameVariants = this.generatePropertyNameVariants(methodName, namingConvention);
                    
                    // 如果有meta映射，优先使用
                    if (propertyMapping && propertyMapping.fieldName) {
                        propertyNameVariants = [propertyMapping.fieldName, ...propertyNameVariants];
                    }
                    
                    
                    // 在原始类中查找属性
                    for (let i = 0; i < propertyNameVariants.length; i++) {
                        const candidatePropertyName = propertyNameVariants[i];
                        
                        const location = await this.findPropertyInFileSimple(originalClassFile, candidatePropertyName);
                        if (location) {
                            return location;
                        } else {
                        }
                    }
                    
        } catch (error) {
                    console.error(`处理代理文件 ${proxyFile.fsPath} 时出错:`, error);
                }
            }
            
            return null;
            
        } catch (error) {
            console.error('通过代理文件查找属性时出错:', error);
            return null;
        }
    }
    
    /**
     * 策略2: 通过变量名推断类型查找属性
     */
    private async findPropertyViaVariableName(
        document: vscode.TextDocument, 
        lineText: string, 
        methodName: string, 
        propertyName: string
    ): Promise<vscode.Location | null> {
        try {
            
            // 提取变量名 (例如: $productDTO->getAccessNo() 提取出 $productDTO)
            const variableMatch = lineText.match(/(\$\w+)\s*->\s*\w+/);
            if (!variableMatch) {
                return null;
            }
            
            const variableName = variableMatch[1];
            
            // 从变量名推断类型
            const documentText = document.getText();
            const useStatements = this.extractUseStatements(documentText);
            
            // 尝试不同的类型推断方法
            const inferredTypes: Array<{type: string, source: string, confidence: number}> = [];
            
            // 1. 从变量名直接推断
            const typeFromVarName = this.inferTypeFromVariableName(variableName, useStatements);
            if (typeFromVarName) {
                const fullClassName = this.resolveFullClassName(typeFromVarName, useStatements);
                inferredTypes.push({
                    type: fullClassName || typeFromVarName,
                    source: 'variableName',
                    confidence: 0.9
                });
            }
            
            // 2. 从new语句推断
            const typeFromNew = this.findObjectTypeFromNew(documentText, variableName);
            if (typeFromNew) {
                const fullClassName = this.resolveFullClassName(typeFromNew, useStatements);
                inferredTypes.push({
                    type: fullClassName || typeFromNew,
                    source: 'newStatement',
                    confidence: 0.95
                });
            }
            
            // 3. 从PHPDoc推断
            const position = document.positionAt(document.getText().indexOf(lineText));
            const typeFromDoc = await this.findTypeFromNearestPhpDoc(document, position.line, variableName);
            if (typeFromDoc) {
                const fullClassName = this.resolveFullClassName(typeFromDoc, useStatements);
                inferredTypes.push({
                    type: fullClassName || typeFromDoc,
                    source: 'phpDoc',
                    confidence: 0.85
                });
            }
            
            if (inferredTypes.length === 0) {
                return null;
            }
            
            // 按置信度排序
            inferredTypes.sort((a, b) => b.confidence - a.confidence);
            
            // 对每个推断的类型，尝试查找属性
            for (const typeInfo of inferredTypes) {
                
                // 查找类文件
                const classFile = await this.findClassFileFromNamespaceWithCache(typeInfo.type);
                if (!classFile) {
                            continue;
                        }
                
                
                // 严格验证：确保这是正确的类
                if (!await this.isStrictValidClass(classFile, typeInfo.type, propertyName, variableName)) {
                    continue;
                }
                
                // 在类中查找属性
                const location = await this.findPropertyInFileSimple(classFile, propertyName);
                if (location) {
                    return location;
                }
            }
            
            return null;
            
        } catch (error) {
            console.error('通过变量名推断查找属性时出错:', error);
            return null;
        }
    }
    
    /**
     * 简化的属性查找方法
     */
    private async findPropertyInFileSimple(filePath: string, propertyName: string): Promise<vscode.Location | null> {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split('\n');
            
            // 查找属性定义
            const propertyPattern = new RegExp(`(public|protected|private)\\s+(?:readonly\\s+)?(?:\\w+\\s+)?\\$${propertyName}\\b`);
            
            for (let i = 0; i < lines.length; i++) {
                if (propertyPattern.test(lines[i])) {
                    const uri = vscode.Uri.file(filePath);
                    const position = new vscode.Position(i, 0);
                    return new vscode.Location(uri, position);
                }
            }
            
            return null;
        } catch (error) {
            console.error(`查找属性 ${propertyName} 时出错:`, error);
            return null;
        }
    }
    
    /**
     * 严格的类验证
     */
    private async isStrictValidClass(classFile: string, fullClassName: string, propertyName: string, variableName: string): Promise<boolean> {
        try {
            const content = fs.readFileSync(classFile, 'utf8');
            
            // 1. 必须包含该属性
            const propertyPattern = new RegExp(`(public|protected|private)\\s+(?:\\w+\\s+)?\\$${propertyName}\\b`);
            if (!propertyPattern.test(content)) {
                return false;
            }
            
            // 2. 类名必须匹配
            const className = fullClassName.split('\\').pop();
            if (!className) {
                return false;
            }
            
            const classPattern = new RegExp(`class\\s+${className}\\b`);
            if (!classPattern.test(content)) {
                return false;
            }
            
            // 3. 变量名和类名应该相关
            const varName = variableName.replace('$', '').toLowerCase();
            const lowerClassName = className.toLowerCase();
            
            // 高度相关的命名模式
            if (varName.includes(lowerClassName) || lowerClassName.includes(varName)) {
                return true;
            }
            
            // DTO特殊模式
            if (varName.includes('dto') && lowerClassName.includes('dto')) {
                return true;
            }
            
            // 如果变量名不匹配，严格检查
            
            // 拒绝明显错误的匹配
            const suspiciousPatterns = ['invitation', 'assembler', 'service', 'controller'];
            for (const pattern of suspiciousPatterns) {
                if (lowerClassName.includes(pattern) && !varName.includes(pattern)) {
                    return false;
                }
            }
            
            return true;
        } catch (error) {
            console.error('验证类时出错:', error);
            return false;
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

                            return filePath;
                        }
                    } catch (e) {
                        continue;
                    }
                }
            }
            
            // 如果找不到精确的类路径，尝试基于类名在整个项目中搜索
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
                                return file.fsPath;
                            }
                        } else {
                            // 没有命名空间要求，直接返回找到的第一个匹配文件
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
                            return file.fsPath;
                        }
                    } catch (e) {
                        continue;
                    }
                }
            }
            
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
        // 处理 (new ClassName()) 直接实例化的情况
        if (objectName.startsWith('(new ') && objectName.endsWith('())')) {
            const classNameMatch = objectName.match(/\(new\s+([A-Za-z_][A-Za-z0-9_\\]*)\s*\(\s*\)\s*\)/);
            if (classNameMatch && classNameMatch[1]) {
                return classNameMatch[1].trim();
            }
        }
        
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
                    
                    return location;
                }
            }
            
            // 如果在当前类中未找到，检查父类
            const extendsMatch = classContent.match(/extends\s+([\w\\]+)/);
            if (extendsMatch && extendsMatch[1]) {
                const parentClass = extendsMatch[1];
                
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

    /**
     * 从最近的PHPDoc注释中查找类型（增强版）
     */
    private async findTypeFromNearestPhpDoc(document: vscode.TextDocument, lineIndex: number, objectName: string): Promise<string | null> {
        const maxLinesToSearch = 15;
        let searchLine = lineIndex - 1;
        
        while (searchLine >= 0 && searchLine >= lineIndex - maxLinesToSearch) {
            const searchText = document.lineAt(searchLine).text.trim();
            
            // 检查是否包含@var注释
            if (searchText.includes('@var') || searchText.includes('* @var')) {
                // 提取上下文
                const contextStart = Math.max(0, searchLine - 3);
                const contextEnd = Math.min(document.lineCount - 1, searchLine + 3);
                const contextLines = [];
                
                for (let i = contextStart; i <= contextEnd; i++) {
                    contextLines.push(document.lineAt(i).text);
                }
                
                const contextText = contextLines.join('\n');
                const type = this.findObjectTypeFromVarAnnotationEnhanced(contextText, objectName);
                
                if (type) {
                    return type;
                }
            }
            
            // 检查是否是赋值语句
            if (searchText.includes(objectName) && searchText.includes('=')) {
                // 向上查找可能的PHPDoc注释
                for (let i = searchLine - 1; i >= Math.max(0, searchLine - 5); i--) {
                    const prevLine = document.lineAt(i).text.trim();
                    if (prevLine.includes('@var')) {
                        const type = this.findObjectTypeFromVarAnnotationEnhanced(prevLine, objectName);
                        if (type) {
                            return type;
                        }
                    }
                }
            }
            
            // 如果遇到代码块结束或函数开始，停止搜索
            if (searchText === '}' || searchText.includes('function ')) {
                break;
            }
            
            searchLine--;
        }
        
        // 如果局部搜索没有结果，尝试全局搜索
        const fullText = document.getText();
        return this.findObjectTypeFromVarAnnotationEnhanced(fullText, objectName);
    }
    
    /**
     * 从@var注释中查找对象类型（增强版）
     */
    private findObjectTypeFromVarAnnotationEnhanced(text: string, objectName: string): string | null {
        // 去掉$符号，用于正则匹配
        const varName = objectName.replace('$', '');

        // 更强大的正则表达式，匹配各种PHPDoc @var注释格式
        const patterns = [
            // 1. 匹配精确的 @var ClassName $varName 格式
            new RegExp(`@var\\s+([\\w\\\\]+)\\s+\\$${varName}\\b`, 'g'),
            
            // 2. 匹配 /* @var ClassName $varName */ 格式
            new RegExp(`/\\*\\s*@var\\s+([\\w\\\\]+)\\s+\\$${varName}\\s*\\*/`, 'g'),
            
            // 3. 匹配多行PHPDoc格式 /** @var ClassName $varName */
            new RegExp(`/\\*\\*[\\s\\S]*?@var\\s+([\\w\\\\]+)\\s+\\$${varName}[\\s\\S]*?\\*/`, 'g'),
            
            // 4. 匹配行内注释: // @var ClassName $varName
            new RegExp(`//\\s*@var\\s+([\\w\\\\]+)\\s+\\$${varName}\\b`, 'g'),
            
            // 5. 匹配更宽松的格式（不包含变量名的@var）
            new RegExp(`@var\\s+([\\w\\\\]+)(?!\\s+\\$\\w)`, 'g')
        ];
        
        // 先尝试精确匹配（包含变量名的）
        for (let i = 0; i < 4; i++) {
            const pattern = patterns[i];
            let match;
            pattern.lastIndex = 0; // 重置正则表达式状态
            
            while ((match = pattern.exec(text)) !== null) {
                if (match && match[1]) {
                    const fullMatch = match[0];
                    return match[1].trim();
                }
            }
        }
        
        // 如果精确匹配失败，尝试宽松匹配
        // 查找最近的@var注释，然后检查上下文
        const lines = text.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.includes('@var')) {
                const match = line.match(/@var\s+([\w\\]+)/);
                if (match && match[1]) {
                    // 检查后续几行是否包含目标变量
                    for (let j = i; j < Math.min(i + 5, lines.length); j++) {
                        if (lines[j].includes(objectName)) {
                            return match[1].trim();
                        }
                    }
                }
            }
        }
        
        return null;
    }
    
    /**
     * 解析完整类名
     */
    private resolveFullClassName(typeName: string, useStatements: Array<{fullPath: string, className: string}>): string {
        if (typeName.includes('\\')) {
            return typeName;
        }
        
        for (const useStatement of useStatements) {
            if (useStatement.className === typeName) {
                return useStatement.fullPath;
            }
        }
        
        return typeName;
    }
    
    /**
     * 增强的类文件查找（带缓存）
     */
    private async findClassFileFromNamespaceWithCache(namespace: string): Promise<string | null> {
        if (this.classFileCache.has(namespace)) {
            return this.classFileCache.get(namespace) || null;
        }
        
        const result = await this.findClassFileFromNamespaceFast(namespace);
        this.classFileCache.set(namespace, result);
        
        // 限制缓存大小，避免内存泄漏
        if (this.classFileCache.size > 100) {
            const firstKey = this.classFileCache.keys().next().value;
            if (firstKey) {
                this.classFileCache.delete(firstKey);
            }
        }
        
        return result;
    }
    
    /**
     * 验证类是否适合当前属性查找上下文
     */
    private async validateClassForProperty(
        classFile: string, 
        fullClassName: string, 
        propertyName: string, 
        objectName: string,
        document: vscode.TextDocument
    ): Promise<boolean> {
        try {
            const content = fs.readFileSync(classFile, 'utf8');
            
            // 1. 检查类是否确实包含该属性
            const propertyPattern = new RegExp(`(public|protected|private)\\s+(?:readonly\\s+)?(?:\\w+\\s+)?\\$${propertyName}\\b`);
            if (!propertyPattern.test(content)) {
                return false;
            }
            
            // 2. 检查类名是否匹配
            const className = fullClassName.split('\\').pop();
            if (!className) {
                return false;
            }
            const classPattern = new RegExp(`class\\s+${className}\\b`);
            if (!classPattern.test(content)) {
                return false;
            }
            
            // 3. 如果有命名空间，验证命名空间
            if (fullClassName.includes('\\')) {
                const namespace = fullClassName.substring(0, fullClassName.lastIndexOf('\\'));
                const namespacePattern = new RegExp(`namespace\\s+${namespace.replace(/\\/g, '\\\\')}\\b`);
                if (!namespacePattern.test(content)) {
                    return false;
                }
            }
            
            // 4. 强化的变量名匹配验证
            const varName = objectName.replace('$', '');
            const isStrongNameMatch = this.isStrongVariableNameMatch(varName, className);
            if (isStrongNameMatch) {
                return true; // 变量名强匹配，直接通过
            }
            
            // 5. 上下文相关性检查 - 检查当前文档是否导入了这个类
            const documentText = document.getText();
            const useStatements = this.extractUseStatements(documentText);
            
            // 如果当前文档有use语句，优先考虑已导入的类
            if (useStatements.length > 0) {
                const isImported = useStatements.some(use => 
                    use.fullPath === fullClassName || use.className === className
                );
                
                if (isImported) {
                    return true;
                }
                
                // 如果类没有被导入且变量名不匹配，严格检查
                if (!isStrongNameMatch) {
                    
                    // 特别严格验证：避免AccessInvitation/AccessAssembler这类错误匹配
                    if (this.isLikelyIncorrectClassMatch(className, varName, fullClassName)) {
                        return false;
                    }
                    
                    return this.performStrictValidation(classFile, propertyName, varName, className, documentText);
                }
            }
            
            return true;
        } catch (error) {
            console.error('验证类时出错:', error);
            return false;
        }
    }
    
    /**
     * 检测可能的错误类匹配 (如AccessInvitation, AccessAssembler)
     */
    private isLikelyIncorrectClassMatch(className: string, varName: string, fullClassName: string): boolean {
        const lowerClassName = className.toLowerCase();
        const lowerVarName = varName.toLowerCase();
        
        // 排除常见的错误匹配模式
        const incorrectPatterns = [
            'invitation', 'assembler', 'service', 'controller', 'entity'
        ];
        
        // 如果类名包含这些词，但变量名明显不匹配，则可能是错误匹配
        for (const pattern of incorrectPatterns) {
            if (lowerClassName.includes(pattern) && !lowerVarName.includes(pattern)) {
                // 进一步检查：如果变量名是DTO格式，但类名不是DTO，可能有问题
                if (lowerVarName.includes('dto') && !lowerClassName.includes('dto')) {
                    return true;
                }
                
                // 如果命名空间差异很大，也可能有问题
                if (fullClassName.includes('\\Entity\\') && lowerVarName.includes('dto')) {
                    return true;
                }
                if (fullClassName.includes('\\Dto\\') && !lowerVarName.includes('dto')) {
                    return true;
                }
            }
        }
        
        return false;
    }
    
    /**
     * 检查变量名与类名是否强匹配
     */
    private isStrongVariableNameMatch(varName: string, className: string): boolean {
        const lowerVarName = varName.toLowerCase();
        const lowerClassName = className.toLowerCase();
        
        // 直接匹配：$productDTO -> ProductDTO
        if (lowerVarName === lowerClassName) {
            return true;
        }
        
        // DTO模式匹配：$productDTO -> ProductDTO
        if (lowerVarName.endsWith('dto') && lowerClassName.endsWith('dto')) {
            const varBase = lowerVarName.slice(0, -3);
            const classBase = lowerClassName.slice(0, -3);
            if (varBase === classBase) {
                return true;
            }
        }
        
        // 部分匹配但高相关性：$product -> ProductDTO (80%以上相似度)
        if (lowerClassName.includes(lowerVarName) || lowerVarName.includes(lowerClassName)) {
            const similarity = this.calculateStringSimilarity(lowerVarName, lowerClassName);
            if (similarity > 0.8) {
                return true;
            }
        }
        
        return false;
    }
    
    /**
     * 计算字符串相似度
     */
    private calculateStringSimilarity(str1: string, str2: string): number {
        if (str1 === str2) return 1.0;
        
        const longer = str1.length > str2.length ? str1 : str2;
        const shorter = str1.length > str2.length ? str2 : str1;
        
        if (longer.length === 0) return 1.0;
        
        const editDistance = this.levenshteinDistance(longer, shorter);
        return (longer.length - editDistance) / longer.length;
    }
    
    /**
     * 计算编辑距离
     */
    private levenshteinDistance(str1: string, str2: string): number {
        const matrix = [];
        
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
     * 严格验证 - 用于未导入且变量名不匹配的类
     */
    private performStrictValidation(
        classFile: string, 
        propertyName: string, 
        varName: string,
        className: string,
        documentText: string
    ): boolean {
        try {
            
            // 1. 如果变量名完全不相关，直接拒绝
            const similarity = this.calculateStringSimilarity(varName.toLowerCase(), className.toLowerCase());
            if (similarity < 0.3) {
                return false;
            }
            
            // 2. 检查文档中是否多次提到这个类
            const classReferences = (documentText.match(new RegExp(className, 'g')) || []).length;
            if (classReferences < 2) {
                return false;
            }
            
            return true;
        } catch (error) {
            console.error('严格验证时出错:', error);
            return false;
        }
    }
    
    /**
     * 对未导入的类进行额外验证
     */
    private performAdditionalValidation(classFile: string, propertyName: string, documentText: string): boolean {
        try {
            const content = fs.readFileSync(classFile, 'utf8');
            
            // 检查属性是否是unique的（比如id、name等常见属性要求更严格的验证）
            const commonProperties = ['id', 'name', 'title', 'status', 'type', 'value'];
            
            if (commonProperties.includes(propertyName.toLowerCase())) {
                // 对于常见属性，要求更强的上下文关联
                const documentDir = path.dirname(documentText);
                const classDir = path.dirname(classFile);
                
                // 检查文件路径的相关性
                const relativePath = path.relative(documentDir, classDir);
                if (relativePath.split(path.sep).length > 3) {
                    return false;
                }
            }
            
            return true;
        } catch (error) {
            return false;
        }
    }
    
    /**
     * 清理缓存
     */
    public clearCache(): void {
        this.classFileCache.clear();
        this.classPropertyCache.clear();
    }
    
    /**
     * 从变量名推断类型 - 支持常见的命名模式
     */
    private inferTypeFromVariableName(objectName: string, useStatements: Array<{className: string, fullPath: string}>): string | null {
        if (!objectName.startsWith('$')) {
            return null;
        }
        
        const varName = objectName.substring(1); // 移除 $ 前缀
        
        // 常见的命名模式
        const patterns = [
            // 直接匹配：$productDTO -> ProductDTO
            {
                pattern: /^(.+)(DTO|Dto)$/,
                transform: (match: RegExpMatchArray) => {
                    const baseName = match[1];
                    return this.capitalizeFirst(baseName) + 'DTO';
                }
            },
            // 实体类：$product -> Product
            {
                pattern: /^([a-z][a-zA-Z]+)$/,
                transform: (match: RegExpMatchArray) => {
                    return this.capitalizeFirst(match[1]);
                }
            },
            // 带前缀的：$newProduct -> Product
            {
                pattern: /^(new|current|old|temp)([A-Z][a-zA-Z]+)$/,
                transform: (match: RegExpMatchArray) => {
                    return match[2]; // 直接返回后半部分
                }
            },
            // 复合名称：$productInfo -> ProductInfo
            {
                pattern: /^([a-z]+)([A-Z][a-zA-Z]+)$/,
                transform: (match: RegExpMatchArray) => {
                    return this.capitalizeFirst(match[1]) + match[2];
                }
            },
            // 带Model后缀：$productModel -> Product
            {
                pattern: /^(.+)(Model|Entity|Service)$/i,
                transform: (match: RegExpMatchArray) => {
                    const baseName = match[1];
                    return this.capitalizeFirst(baseName);
                }
            }
        ];
        
        // **优先策略：检查特殊的业务逻辑映射**
        const businessLogicType = this.inferFromBusinessLogic(varName, useStatements);
        if (businessLogicType) {
            return businessLogicType;
        }
        
        // 生成所有可能的类名（按优先级排序）
        const possibleClassNames = this.generatePossibleClassNames(varName);
        
        // 按优先级查找匹配的use语句
        for (const className of possibleClassNames) {
            
            const foundInUse = useStatements.find(use => 
                use.className === className || 
                use.fullPath.endsWith('\\' + className)
            );
            
            if (foundInUse) {
                return className;
            } else {
            }
        }
        
        // 如果都没找到，使用传统逻辑作为回退
        for (const {pattern, transform} of patterns) {
            const match = varName.match(pattern);
            if (match) {
                const inferredType = transform(match);
                return inferredType;
            }
        }
        
        return null;
    }
    
    /**
     * 根据业务逻辑推断特殊的类型映射
     */
    private inferFromBusinessLogic(varName: string, useStatements: Array<{className: string, fullPath: string}>): string | null {
        
        // 特殊的业务逻辑映射规则
        const businessMappings: Record<string, string[]> = {
            // 循环变量常见映射：变量名 → 优先考虑的DTO类名
            'qualification': ['QualificationDTO', 'Qualification'],
            'product': ['ProductDTO', 'Product'],
            'access': ['AccessDTO', 'Access'],
            'invitation': ['InvitationDTO', 'InvitationListDTO', 'Invitation'],
            'contract': ['ContractDTO', 'Contract'],
            'supplier': ['SupplierDTO', 'Supplier'],
            'application': ['ApplicationDTO', 'AccessApplication', 'Application'],
            'user': ['UserDTO', 'User'],
            'file': ['FileDTO', 'FileInfo', 'File'],
            'item': ['ItemDTO', 'Item'],
            'record': ['RecordDTO', 'Record']
        };
        
        const lowerVarName = varName.toLowerCase();
        
        // 检查直接映射
        if (businessMappings[lowerVarName]) {
            const candidates = businessMappings[lowerVarName];
            
            // 按优先级查找
            for (const candidate of candidates) {
                const foundInUse = useStatements.find(use => 
                    use.className === candidate || 
                    use.fullPath.endsWith('\\' + candidate)
                );
                
                if (foundInUse) {
                    return candidate;
                }
            }
            
        }
        
        // 检查复合词的映射 (如 qualificationFile -> QualificationFileDTO)
        for (const [key, candidates] of Object.entries(businessMappings)) {
            if (lowerVarName.includes(key)) {
                
                // 构建复合词的DTO类名
                const capitalizedVarName = varName.charAt(0).toUpperCase() + varName.slice(1);
                const compoundCandidates = [
                    `${capitalizedVarName}DTO`,
                    `${capitalizedVarName}`,
                    ...candidates.map(c => c.replace(key.charAt(0).toUpperCase() + key.slice(1), capitalizedVarName))
                ];
                
                for (const candidate of compoundCandidates) {
                    const foundInUse = useStatements.find(use => 
                        use.className === candidate || 
                        use.fullPath.endsWith('\\' + candidate)
                    );
                    
                    if (foundInUse) {
                        return candidate;
                    }
                }
            }
        }
        
        return null;
    }

    /**
     * 生成可能的类名（按优先级排序，DTO类优先）
     */
    private generatePossibleClassNames(varName: string): string[] {
        const baseName = this.capitalizeFirst(varName);
        const lowerVarName = varName.toLowerCase();
        
        const candidates: string[] = [];
        
        // 1. 最高优先级：DTO后缀的变体
        if (lowerVarName.endsWith('dto')) {
            // $qualificationDTO -> QualificationDTO
            candidates.push(baseName);
        } else {
            // $qualification -> QualificationDTO (优先尝试DTO后缀)
            candidates.push(`${baseName}DTO`);
            candidates.push(`${baseName}Dto`);
        }
        
        // 2. 中等优先级：直接匹配
        if (!lowerVarName.endsWith('dto')) {
            candidates.push(baseName);
        }
        
        // 3. 低优先级：其他常见后缀
        candidates.push(`${baseName}Entity`);
        candidates.push(`${baseName}Model`);
        candidates.push(`${baseName}Service`);
        
        // 4. 特殊处理：如果是复合词，尝试提取主要部分 + DTO
        const compoundMatch = varName.match(/^([a-z]+)([A-Z][a-zA-Z]+)$/);
        if (compoundMatch) {
            const mainPart = this.capitalizeFirst(compoundMatch[1]);
            const secondPart = compoundMatch[2];
            candidates.push(`${mainPart}${secondPart}DTO`);
        }
        
        // 去重并保持顺序
        return [...new Set(candidates)];
    }
    
    /**
     * 首字母大写
     */
    private capitalizeFirst(str: string): string {
        if (!str) return str;
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
    
    /**
     * 增强的方法调用上下文提取 - 支持链式调用和复杂场景
     */
    private extractMethodCallContext(lineText: string, targetMethod: string): {
        objectName: string;
        objectType: string | null;
        confidence: number;
    } | null {
        const trimmedLine = lineText.trim();
        
        // 场景1: 直接的对象方法调用 $obj->method()
        const directCallPattern = /(\$\w+)->(\w+)\s*\(/;
        const directMatch = trimmedLine.match(directCallPattern);
        if (directMatch && directMatch[2] === targetMethod.replace(/[()]/g, '')) {
            return {
                objectName: directMatch[1],
                objectType: null, // 需要进一步推断
                confidence: 0.9
            };
        }
        
        // 场景2: 链式调用 (new Class())->method() 或 $obj->method1()->method2()
        // 分析链式调用，找出目标方法的真正调用者
        const methodCalls = this.parseChainedCalls(trimmedLine);
        for (let i = 0; i < methodCalls.length; i++) {
            if (methodCalls[i].method === targetMethod.replace(/[()]/g, '')) {
                if (i === 0) {
                    // 第一个方法调用，调用者是原始对象
                    return {
                        objectName: methodCalls[i].caller,
                        objectType: methodCalls[i].callerType,
                        confidence: 0.95
                    };
                } else {
                    // 链式调用中的后续方法，需要追溯调用链
                    const chainInfo = this.traceCallChain(methodCalls, i);
                    return {
                        objectName: chainInfo.objectName,
                        objectType: chainInfo.objectType,
                        confidence: chainInfo.confidence
                    };
                }
            }
        }
        
        // 场景3: 复杂表达式中的方法调用
        const complexPattern = /([^,\s(]+)->(\w+)\s*\(/g;
        let match;
        while ((match = complexPattern.exec(trimmedLine)) !== null) {
            if (match[2] === targetMethod.replace(/[()]/g, '')) {
                return {
                    objectName: match[1],
                    objectType: null,
                    confidence: 0.7
                };
            }
        }
        
        return null;
    }
    
    /**
     * 解析链式调用，返回每个方法调用的信息
     */
    private parseChainedCalls(lineText: string): Array<{
        caller: string;
        callerType: string | null;
        method: string;
        position: number;
    }> {
        const calls: Array<{caller: string; callerType: string | null; method: string; position: number}> = [];
        
        // 匹配 (new ClassName()) 模式
        const newClassPattern = /\(\s*new\s+([A-Za-z_][A-Za-z0-9_\\]*)\s*\(\s*[^)]*\s*\)\s*\)/;
        const newMatch = lineText.match(newClassPattern);
        
        if (newMatch) {
            // 处理 (new Class())->method() 场景
            const afterNew = lineText.substring(newMatch.index! + newMatch[0].length);
            const methodPattern = /->(\w+)\s*\([^)]*\)/g;
            let methodMatch;
            let position = newMatch.index! + newMatch[0].length;
            
            while ((methodMatch = methodPattern.exec(afterNew)) !== null) {
                calls.push({
                    caller: '(new ' + newMatch[1] + '())',
                    callerType: newMatch[1],
                    method: methodMatch[1],
                    position: position + methodMatch.index!
                });
                position += methodMatch.index! + methodMatch[0].length;
            }
        }
        
        // 匹配 $variable->method() 模式
        const varMethodPattern = /(\$\w+)->(\w+)\s*\([^)]*\)/g;
        let varMatch;
        while ((varMatch = varMethodPattern.exec(lineText)) !== null) {
            calls.push({
                caller: varMatch[1],
                callerType: null,
                method: varMatch[2],
                position: varMatch.index!
            });
        }
        
        // 按位置排序
        calls.sort((a, b) => a.position - b.position);
        
        return calls;
    }
    
    /**
     * 追溯调用链，确定目标方法的实际调用者
     */
    private traceCallChain(methodCalls: Array<{
        caller: string;
        callerType: string | null;
        method: string;
        position: number;
    }>, targetIndex: number): {
        objectName: string;
        objectType: string | null;
        confidence: number;
    } {
        // 对于链式调用，前一个方法的返回值通常是当前方法的调用者
        // 但在我们的场景中，我们更关心原始的对象类型
        
        if (targetIndex > 0) {
            // 链式调用中的后续方法，通常返回相同类型的对象
            const firstCall = methodCalls[0];
            return {
                objectName: firstCall.caller,
                objectType: firstCall.callerType,
                confidence: 0.8  // 稍低的置信度，因为可能有setter返回类型等情况
            };
        }
        
        // 第一个调用
        const call = methodCalls[targetIndex];
        return {
            objectName: call.caller,
            objectType: call.callerType,
            confidence: 0.95
        };
    }
} 