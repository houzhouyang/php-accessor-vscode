import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { AccessorNavigator } from './accessorNavigator';

// 用于防抖的变量
let refreshDebounceTimer: NodeJS.Timeout | null = null;
let pendingFilesToRefresh: Set<string> = new Set();
const REFRESH_DEBOUNCE_DELAY = 2000; // 2秒防抖

/**
 * 带防抖功能的刷新索引函数
 * @param filePath 要刷新的文件路径，如果为空则刷新所有待处理文件
 */
function debouncedRefreshIndex(filePath?: string): void {
    if (filePath) {
        pendingFilesToRefresh.add(filePath);
    }
    
    // 清除之前的计时器
    if (refreshDebounceTimer) {
        clearTimeout(refreshDebounceTimer);
    }
    
    // 设置新的计时器
    refreshDebounceTimer = setTimeout(async () => {
        console.log(`开始批量刷新索引，共 ${pendingFilesToRefresh.size} 个文件`);
        
        // 当文件数量较多时，只刷新一部分代表性的文件
        const filesToProcess = Array.from(pendingFilesToRefresh);
        const MAX_FILES_TO_PROCESS = 5; // 最多处理5个文件即可触发语言服务器更新
        
        if (filesToProcess.length > MAX_FILES_TO_PROCESS) {
            console.log(`文件过多，仅处理 ${MAX_FILES_TO_PROCESS} 个代表性文件以触发索引更新`);
            
            // 优先处理最近修改的文件
            const processFiles = filesToProcess.slice(0, MAX_FILES_TO_PROCESS);
            
            for (const file of processFiles) {
                try {
                    const uri = vscode.Uri.file(file);
                    const doc = await vscode.workspace.openTextDocument(uri);
                    await vscode.languages.setTextDocumentLanguage(doc, 'php');
                    
                    // 避免打开过多标签
                    const openedEditor = vscode.window.visibleTextEditors.find(
                        e => e.document.uri.toString() === uri.toString()
                    );
                    
                    if (openedEditor) {
                        await safeExecuteCommand('workbench.action.closeActiveEditor');
                    }
                } catch (error) {
                    if (error instanceof Error && error.name === 'Canceled') {
                        console.log(`文件 ${file} 处理被取消，跳过`);
                    } else {
                        console.error(`处理文件 ${file} 时出错:`, error);
                    }
                }
            }
        } else {
            // 文件数量不多时，正常处理每个文件
            for (const file of filesToProcess) {
                try {
                    const uri = vscode.Uri.file(file);
                    const doc = await vscode.workspace.openTextDocument(uri);
                    await vscode.languages.setTextDocumentLanguage(doc, 'php');
                } catch (error) {
                    if (error instanceof Error && error.name === 'Canceled') {
                        console.log(`文件 ${file} 处理被取消，跳过`);
                    } else {
                        console.error(`处理文件 ${file} 时出错:`, error);
                    }
                }
            }
        }
        
        // 批量处理完成后，尝试刷新PHP语言服务器诊断
        await refreshPHPLanguageServerDiagnostics();
        
        // 清空待处理文件列表
        pendingFilesToRefresh.clear();
        console.log('索引刷新完成');
    }, REFRESH_DEBOUNCE_DELAY);
}

/**
 * 刷新工作区中.php-accessor目录的文件索引
 */
async function refreshAccessorDirectoryIndex() {
    try {
        // 获取当前所有打开的工作区文件夹
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return;
        }

        let accessorFilesCount = 0;
        
        // 遍历所有工作区文件夹
        for (const folder of workspaceFolders) {
            try {
                // 创建超时控制的 CancellationToken
                const source = new vscode.CancellationTokenSource();
                const timeout = setTimeout(() => {
                    source.cancel();
                }, 10000); // 10秒超时

                try {
                    // 查找所有PHP文件，使用超时控制
                    const phpFiles = await vscode.workspace.findFiles(
                        new vscode.RelativePattern(folder, '**/*.php'),
                        '**/vendor/**',
                        1000, // 限制最多1000个文件
                        source.token
                    );

                    clearTimeout(timeout);
                    
                    // 检查操作是否被取消
                    if (source.token.isCancellationRequested) {
                        console.log('文件搜索被取消，跳过该工作区文件夹');
                        continue;
                    }

                    // 遍历所有PHP文件所在的目录，检查是否有.php-accessor目录
                    for (const phpFile of phpFiles) {
                        const phpDir = path.dirname(phpFile.fsPath);
                        const accessorDir = path.join(phpDir, '.php-accessor');
                        
                        // 如果.php-accessor目录存在
                        if (fs.existsSync(accessorDir)) {
                            try {
                                // 获取.php-accessor目录中的所有PHP文件
                                const accessorFiles = fs.readdirSync(accessorDir)
                                    .filter(file => file.endsWith('.php'))
                                    .map(file => path.join(accessorDir, file));

                                // 只处理一部分文件即可触发索引刷新
                                accessorFilesCount += accessorFiles.length;
                                const MAX_FILES_PER_DIR = 3;  // 每个目录最多处理3个文件
                                
                                const filesToProcess = accessorFiles.length > MAX_FILES_PER_DIR 
                                    ? accessorFiles.slice(0, MAX_FILES_PER_DIR) 
                                    : accessorFiles;
                                
                                // 添加到待处理文件列表
                                for (const accessorFile of filesToProcess) {
                                    pendingFilesToRefresh.add(accessorFile);
                                }
                            } catch (dirError) {
                                console.log(`读取目录 ${accessorDir} 时出错:`, dirError);
                            }
                        }
                    }
                } catch (searchError) {
                    clearTimeout(timeout);
                    if (searchError instanceof Error && searchError.name === 'Canceled') {
                        console.log('文件搜索操作被取消，跳过该工作区文件夹');
                    } else {
                        console.log('搜索文件时出错:', searchError);
                    }
                } finally {
                    source.dispose();
                }
            } catch (folderError) {
                console.log(`处理工作区文件夹 ${folder.uri.fsPath} 时出错:`, folderError);
            }
        }
        
        console.log(`找到 ${accessorFilesCount} 个代理类文件，添加到待处理队列`);
        
        // 如果有文件需要处理，触发防抖刷新
        if (pendingFilesToRefresh.size > 0) {
            debouncedRefreshIndex();
        }
    } catch (error) {
        if (error instanceof Error && error.name === 'Canceled') {
            console.log('刷新 PHP Accessor 文件索引操作被取消');
        } else {
            console.error('刷新 PHP Accessor 文件索引时出错:', error);
            vscode.window.showErrorMessage('刷新 PHP Accessor 文件索引失败');
        }
    }
}

/**
 * 尝试刷新PHP语言服务器的诊断信息
 */
async function refreshPHPLanguageServerDiagnostics() {
    console.log('开始刷新PHP语言服务器诊断信息...');
    
    // 1. 尝试重启PHP语言服务器（支持多种常见PHP扩展）
    // 使用safeExecuteCommand函数来安全地执行命令，不会因为一个命令不存在而中断整个流程
    await safeExecuteCommand('php.unloadWorkspace'); // Intelephense 特有命令
    await safeExecuteCommand('intelephense.restartServer'); // Intelephense
    await safeExecuteCommand('php-intellisense.reloadServer'); // PHP IntelliSense
    await safeExecuteCommand('phpserver.restart'); // 通用尝试
    
    // 2. 进行额外的清理操作
    await clearPHPLanguageServerCache();
    
    console.log('PHP语言服务器诊断信息刷新完成');
}

/**
 * 安全地执行命令，如果命令不存在也不会抛出异常
 */
async function safeExecuteCommand(command: string, ...args: any[]): Promise<any> {
    try {
        // 检查命令是否存在
        const commands = await vscode.commands.getCommands();
        if (commands.includes(command)) {
            return await vscode.commands.executeCommand(command, ...args);
        } else {
            console.log(`命令 '${command}' 不存在，已跳过`);
            return null;
        }
    } catch (error) {
        console.error(`执行命令 '${command}' 时出错:`, error);
        return null;
    }
}

/**
 * 尝试清理PHP语言服务器缓存
 */
async function clearPHPLanguageServerCache() {
    try {
        // 获取用户目录
        const homeDir = process.env.HOME || process.env.USERPROFILE;
        if (!homeDir) {
            return;
        }
        
        // 常见的PHP语言服务器缓存位置
        const cachePaths = [
            path.join(homeDir, '.intelephense'), // Intelephense缓存
            path.join(homeDir, '.vscode', 'extensions', 'bmewburn.vscode-intelephense-client-*', 'cache'), // Intelephense扩展缓存
            path.join(homeDir, '.vscode', 'extensions', 'felixfbecker.php-intellisense-*', 'cache') // PHP IntelliSense缓存
        ];
        
        // 检查并重命名缓存目录（重命名比删除更安全）
        for (const cachePath of cachePaths) {
            try {
                // 不使用RelativePattern，直接使用glob模式
                const cacheDir = path.dirname(cachePath);
                const cachePattern = path.basename(cachePath) + '*';
                
                if (fs.existsSync(cacheDir)) {
                    // 读取目录，查找匹配的文件/文件夹
                    const dirEntries = fs.readdirSync(cacheDir);
                    const matchingEntries = dirEntries.filter(entry => {
                        // 简单的glob匹配，将*替换为.*用于正则表达式
                        const pattern = cachePattern.replace(/\*/g, '.*');
                        const regex = new RegExp(`^${pattern}$`);
                        return regex.test(entry);
                    });
                    
                    // 处理匹配的条目
                    for (const entry of matchingEntries) {
                        const fullPath = path.join(cacheDir, entry);
                        const backupPath = fullPath + '.bak-' + Date.now();
                        if (fs.existsSync(fullPath)) {
                            console.log(`重命名缓存目录: ${fullPath} -> ${backupPath}`);
                            fs.renameSync(fullPath, backupPath);
                        }
                    }
                }
            } catch (err) {
                console.error(`处理缓存目录时出错: ${cachePath}`, err);
            }
        }
    } catch (error) {
        console.error('清理PHP语言服务器缓存时出错:', error);
    }
}

/**
 * 主激活函数
 */
export function activate(context: vscode.ExtensionContext) {
    // 创建对象和订阅器
    const accessorNavigator = new AccessorNavigator();
    const disposables: vscode.Disposable[] = [];
    
    // 注册跳转命令
    disposables.push(vscode.commands.registerCommand('php-accessor.navigateToProperty', () => {
        accessorNavigator.navigateToProperty();
    }));
    
    disposables.push(vscode.commands.registerCommand('php-accessor.navigateToAccessor', () => {
        accessorNavigator.navigateToAccessor();
    }));
    
    // 注册调试命令
    disposables.push(vscode.commands.registerCommand('php-accessor-vscode.debug', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('请在PHP文件中使用调试功能');
            return;
        }

        const document = editor.document;
        const position = editor.selection.active;
        const word = document.getText(document.getWordRangeAtPosition(position));
        
        console.log('=== 🔧 PHP Accessor 手动调试 ===');
        console.log(`📁 当前文件: ${document.fileName}`);
        console.log(`📍 光标位置: 行${position.line + 1}, 列${position.character + 1}`);
        console.log(`🎯 选中词语: "${word}"`);
        
        // 检查是否是代理文件
        const isProxyFile = accessorNavigator.isHyperfProxyFile(document.fileName);
        console.log(`🔍 是否代理文件: ${isProxyFile ? '是' : '否'}`);
        
        if (isProxyFile) {
            vscode.window.showInformationMessage('🔍 代理类调试已启动，请查看控制台详细信息');
            console.log('💡 请在代理trait的方法上点击F12测试跳转，控制台将显示详细的调试信息');
        } else {
            vscode.window.showInformationMessage('📋 当前文档调试信息已输出到控制台');
        }
        
        // 显示项目结构信息
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            console.log(`📂 工作区根目录: ${workspaceFolders[0].uri.fsPath}`);
            
            // 检查.php-accessor目录
            const phpAccessorPath = path.join(workspaceFolders[0].uri.fsPath, '.php-accessor');
            const hasPhpAccessor = fs.existsSync(phpAccessorPath);
            console.log(`📦 .php-accessor目录: ${hasPhpAccessor ? '存在' : '不存在'} (${phpAccessorPath})`);
            
            if (hasPhpAccessor) {
                const metaPath = path.join(phpAccessorPath, 'meta');
                const hasMetaDir = fs.existsSync(metaPath);
                console.log(`📋 meta目录: ${hasMetaDir ? '存在' : '不存在'} (${metaPath})`);
                
                const proxyPath = path.join(phpAccessorPath, 'proxy');
                const hasProxyDir = fs.existsSync(proxyPath);
                console.log(`🎭 proxy目录: ${hasProxyDir ? '存在' : '不存在'} (${proxyPath})`);
            }
        }
        
        console.log('=== 🔧 手动调试信息输出完成 ===');
        
        // 如果不是代理文件且选中了方法名，尝试测试跳转逻辑
        if (!isProxyFile && word && (word.startsWith('get') || word.startsWith('set'))) {
            console.log('🚀 检测到accessor方法，尝试测试跳转逻辑...');
            try {
                const result = await accessorNavigator.getDefinitionProvider().provideDefinition(
                    document,
                    position,
                    { isCancellationRequested: false, onCancellationRequested: () => ({ dispose: () => {} }) }
                );
                if (result) {
                    console.log('✅ 跳转测试成功完成');
                } else {
                    console.log('❌ 跳转测试未找到结果');
                }
            } catch (error) {
                console.log('❌ 跳转测试出错:', error);
            }
        }
    }));
    
    // 注册代理类诊断命令
    disposables.push(vscode.commands.registerCommand('php-accessor-vscode.diagnose-proxy', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('请在代理trait文件中使用此功能');
            return;
        }

        const document = editor.document;
        const isProxyFile = accessorNavigator.isHyperfProxyFile(document.fileName);
        
        if (!isProxyFile) {
            vscode.window.showWarningMessage('当前文件不是Hyperf代理trait文件');
            return;
        }
        
        vscode.window.showInformationMessage('🔍 代理类诊断已启动，请查看控制台');
        
        console.log('=== 🏥 代理类诊断开始 ===');
        
        // 手动触发一次代理文件导航来获取详细诊断信息
        const fileName = path.basename(document.fileName, '.php');
        console.log(`🎭 诊断代理文件: ${fileName}`);
        
        // 模拟点击getAccessNo方法进行诊断
        console.log('💡 建议：在任意getter/setter方法上点击F12查看完整跳转过程');
        console.log('=== 🏥 代理类诊断完成 ===');
    }));
    
    // 注册提供器
    disposables.push(vscode.languages.registerDefinitionProvider(
        { language: 'php' },
        accessorNavigator.getDefinitionProvider()
    ));
    
    disposables.push(vscode.languages.registerReferenceProvider(
        { language: 'php' },
        accessorNavigator.getReferenceProvider()
    ));
    
    // 注册代码补全提供器，以支持PHPDoc注释中的类型
    disposables.push(vscode.languages.registerCompletionItemProvider(
        { language: 'php' },
        accessorNavigator.getCompletionItemProvider(),
        '>'  // 在输入->后触发补全
    ));
    
    // 注册代码诊断提供器，以消除对带有PHPDoc注解的方法调用的红线警告
    disposables.push(vscode.languages.registerCodeActionsProvider(
        { language: 'php' }, 
        accessorNavigator.getCodeActionsProvider(), 
        {
            providedCodeActionKinds: [vscode.CodeActionKind.QuickFix]
        }
    ));
    
    // 监听文件更改，以保持索引最新
    const accessorWatcher = vscode.workspace.createFileSystemWatcher('**/.php-accessor/**/*.php');
    
    accessorWatcher.onDidChange(uri => {
        if (uri.fsPath.endsWith('.php')) {
            debouncedRefreshIndex(uri.fsPath);
        }
    });
    
    accessorWatcher.onDidCreate(uri => {
        if (uri.fsPath.endsWith('.php')) {
            debouncedRefreshIndex(uri.fsPath);
        }
    });
    
    accessorWatcher.onDidDelete(uri => {
        if (uri.fsPath.endsWith('.php')) {
            debouncedRefreshIndex();
        }
    });
    
    // 在扩展激活时刷新一次文件索引
    refreshAccessorDirectoryIndex();

    // 添加监听器到订阅列表
    disposables.push(accessorWatcher);
    context.subscriptions.push(...disposables);
    
    // 配置PHP语言服务器以识别代理类
    configurePHPLanguageServer();
}

/**
 * 配置PHP语言服务器以识别.php-accessor目录下的代理类
 */
async function configurePHPLanguageServer() {
    try {
        // 如果可能，自动配置PHP Intelephense（最常用的PHP语言服务器）
        const config = vscode.workspace.getConfiguration();
        
        // 检查 Intelephense 是否已安装
        const intelephenseInstalled = vscode.extensions.getExtension('bmewburn.vscode-intelephense-client') !== undefined;
        
        if (intelephenseInstalled) {
            // 1. 确保Intelephense不会排除.php-accessor目录
            const intelephenseExclude = config.get('intelephense.files.exclude', []);
            let excludeModified = false;
            
            // 确保.php-accessor目录不在排除列表中
            const accessorExcludeIndex = intelephenseExclude.findIndex((pattern: string) => 
                pattern.includes('.php-accessor') || pattern.includes('**/.php-accessor/**')
            );
            
            if (accessorExcludeIndex >= 0) {
                intelephenseExclude.splice(accessorExcludeIndex, 1);
                excludeModified = true;
            }
            
            // 如果排除列表被修改，更新设置
            if (excludeModified) {
                await config.update('intelephense.files.exclude', intelephenseExclude, vscode.ConfigurationTarget.Workspace);
            }
            
            // 3. 设置PHP语言服务器以包含.php-accessor目录
            try {
                // 对于Intelephense
                await config.update('intelephense.files.associations', ['**/*.php', '**/.php-accessor/**/*.php'], vscode.ConfigurationTarget.Workspace);
            } catch (error) {
                console.log('设置intelephense.files.associations时出错:', error);
            }
            
            // 4. 查找并配置.php-accessor目录
            try {
                // 尝试查找工作区中所有的.php-accessor目录
                const workspaceFolders = vscode.workspace.workspaceFolders;
                if (workspaceFolders) {
                    for (const folder of workspaceFolders) {
                        try {
                            // 创建超时控制的 CancellationToken
                            const source = new vscode.CancellationTokenSource();
                            const timeout = setTimeout(() => {
                                source.cancel();
                            }, 8000); // 8秒超时（激活时间稍短）

                            try {
                                const phpFiles = await vscode.workspace.findFiles(
                                    new vscode.RelativePattern(folder, '**/*.php'),
                                    '**/vendor/**',
                                    500, // 激活时限制更少的文件数量
                                    source.token
                                );

                                clearTimeout(timeout);
                                
                                // 检查操作是否被取消
                                if (source.token.isCancellationRequested) {
                                    console.log('激活时文件搜索被取消，跳过该工作区');
                                    continue;
                                }
                                
                                for (const phpFile of phpFiles) {
                                    const phpDir = path.dirname(phpFile.fsPath);
                                    const accessorDir = path.join(phpDir, '.php-accessor');
                                    
                                    // 如果.php-accessor目录存在
                                    if (fs.existsSync(accessorDir)) {
                                        // 尝试设置Intelephense的存根目录
                                        try {
                                            const intelephenseStubs = config.get('intelephense.stubs', []) as string[];
                                            if (!intelephenseStubs.includes(accessorDir)) {
                                                intelephenseStubs.push(accessorDir);
                                                await config.update('intelephense.stubs', intelephenseStubs, vscode.ConfigurationTarget.Workspace);
                                            }
                                        } catch (error) {
                                            console.log('设置intelephense.stubs时出错:', error);
                                        }
                                    }
                                }
                            } catch (searchError) {
                                clearTimeout(timeout);
                                if (searchError instanceof Error && searchError.name === 'Canceled') {
                                    console.log('激活时文件搜索操作被取消');
                                } else {
                                    console.log('搜索文件时出错:', searchError);
                                }
                            } finally {
                                source.dispose();
                            }
                        } catch (folderError) {
                            console.log(`处理工作区文件夹 ${folder.uri.fsPath} 时出错:`, folderError);
                        }
                    }
                }
            } catch (error) {
                if (error instanceof Error && error.name === 'Canceled') {
                    console.log('查找.php-accessor目录操作被取消');
                } else {
                    console.log('查找.php-accessor目录时出错:', error);
                }
            }
        } else {
            console.log('Intelephense 扩展未安装，跳过相关配置');
        }
        
        // 2. 无论 Intelephense 是否安装，都确保代理类文件被包含在文件关联中
        const associations = config.get('files.associations', {}) as Record<string, string>;
        let associationsModified = false;
        
        // 添加.php-accessor目录中的PHP文件关联
        const accessorPattern = '**/.php-accessor/**/*.php';
        if (!associations[accessorPattern]) {
            associations[accessorPattern] = 'php';
            associationsModified = true;
        }
        
        // 如果文件关联被修改，更新设置
        if (associationsModified) {
            await config.update('files.associations', associations, vscode.ConfigurationTarget.Workspace);
        }
        
        console.log('PHP语言服务器配置已更新');
    } catch (error) {
        console.error('配置PHP语言服务器时出错:', error);
    }
}

export function deactivate() {}

