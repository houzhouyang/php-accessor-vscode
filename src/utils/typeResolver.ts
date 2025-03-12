import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * PHP类型解析器，用于支持IDE对PHPDoc注解的识别
 */
export class TypeResolver {
    /**
     * 从PHPDoc注释中解析类型
     */
    public static parseTypeFromPhpDoc(phpDoc: string, variableName: string): string | null {
        // 移除变量名中的$前缀
        const varName = variableName.replace('$', '');
        
        // 匹配PHPDoc中的@var标记
        const varPatterns = [
            // 匹配 /* @var ClassName $varName */
            new RegExp(`@var\\s+([\\w\\\\]+)\\s+\\$${varName}`, 'i'),
            // 匹配 /** @var ClassName */
            new RegExp(`@var\\s+([\\w\\\\]+)(?:\\s+\\$${varName}|\\s|$)`, 'i')
        ];
        
        for (const pattern of varPatterns) {
            const match = pattern.exec(phpDoc);
            if (match && match[1]) {
                return match[1].trim();
            }
        }
        
        return null;
    }
    
    /**
     * 从use语句中解析完整命名空间
     */
    public static resolveFullNamespace(typeName: string, useStatements: Array<{fullPath: string, className: string}>): string {
        // 如果已经是完整命名空间，直接返回
        if (typeName.includes('\\')) {
            return typeName;
        }
        
        // 从use语句中查找匹配的类名
        for (const useStatement of useStatements) {
            if (useStatement.className === typeName) {
                return useStatement.fullPath;
            }
        }
        
        // 如果没有找到匹配的use语句，返回原始类型名
        return typeName;
    }
    
    /**
     * 解析PHP类中的方法
     */
    public static async parseClassMethods(classFile: string): Promise<string[]> {
        try {
            if (!fs.existsSync(classFile)) {
                return [];
            }
            
            const content = fs.readFileSync(classFile, 'utf8');
            const methods: string[] = [];
            
            // 匹配类中的方法定义
            const methodPattern = /(?:public|protected|private)\s+function\s+(\w+)\s*\(/g;
            let match;
            
            while ((match = methodPattern.exec(content)) !== null) {
                methods.push(match[1]);
            }
            
            return methods;
        } catch (error) {
            console.error('解析类方法时出错:', error);
            return [];
        }
    }
    
    /**
     * 生成PHPDoc方法注释
     */
    public static generateMethodPhpDoc(className: string, methods: string[]): string {
        let phpDoc = `/**\n * @var ${className}\n`;
        
        for (const method of methods) {
            let returnType = 'mixed';
            let params = '';
            
            // 推断getter方法的返回类型
            if (method.startsWith('get')) {
                const propertyName = method.substring(3, 4).toLowerCase() + method.substring(4);
                phpDoc += ` * @method ${returnType} ${method}() 获取 ${propertyName} 属性\n`;
            }
            // 推断setter方法的参数和返回类型
            else if (method.startsWith('set')) {
                const propertyName = method.substring(3, 4).toLowerCase() + method.substring(4);
                phpDoc += ` * @method self ${method}(mixed $value) 设置 ${propertyName} 属性\n`;
            }
            // 其他方法
            else {
                phpDoc += ` * @method mixed ${method}() 方法\n`;
            }
        }
        
        phpDoc += ' */';
        return phpDoc;
    }
    
    /**
     * 生成内联注释以解决IDE警告
     */
    public static generateInlineMethodAnnotation(className: string, methodName: string): string {
        return `/* @method mixed ${methodName}() 方法存在于 ${className} 类中 */`;
    }
    
    /**
     * 生成完整IDE支持的PHPDoc注释
     */
    public static async generateFullPhpDoc(typeFromDoc: string, fullClassName: string, classFile: string): Promise<string | null> {
        try {
            // 获取类的方法
            const methods = await this.parseClassMethods(classFile);
            if (methods.length === 0) {
                return null;
            }
            
            return this.generateMethodPhpDoc(fullClassName, methods);
        } catch (error) {
            console.error('生成PHPDoc注释时出错:', error);
            return null;
        }
    }
} 