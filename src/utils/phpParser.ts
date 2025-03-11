export interface PhpProperty {
    name: string;
    type: string;
    visibility: 'public' | 'protected' | 'private';
}

export interface PhpClass {
    name: string;
    namespace: string;
    attributes: string[];
    properties: PhpProperty[];
    methods: string[];
}

/**
 * Parse a PHP class from source code
 */
export function parsePhpClass(source: string): PhpClass | null {
    try {
        // Extract namespace
        const namespaceMatch = source.match(/namespace\s+([^;]+);/);
        const namespace = namespaceMatch ? namespaceMatch[1] : '';
        
        // Extract class name
        const classMatch = source.match(/class\s+(\w+)/);
        if (!classMatch) {
            return null;
        }
        const className = classMatch[1];
        
        // Extract attributes
        const attributes: string[] = [];
        const attrRegex = /#\[([^\]]+)\]/g;
        let attrMatch;
        while ((attrMatch = attrRegex.exec(source)) !== null) {
            attributes.push(attrMatch[1]);
        }
        
        // Extract properties
        const properties: PhpProperty[] = [];
        const propRegex = /(public|protected|private)\s+(?:readonly\s+)?(?:(\w+)\s+)?\$(\w+)/g;
        let propMatch;
        while ((propMatch = propRegex.exec(source)) !== null) {
            properties.push({
                visibility: propMatch[1] as 'public' | 'protected' | 'private',
                type: propMatch[2] || 'mixed',
                name: propMatch[3]
            });
        }
        
        // Extract methods
        const methods: string[] = [];
        const methodRegex = /function\s+(\w+)\s*\(/g;
        let methodMatch;
        while ((methodMatch = methodRegex.exec(source)) !== null) {
            methods.push(methodMatch[1]);
        }
        
        return {
            name: className,
            namespace,
            attributes,
            properties,
            methods
        };
    } catch (error) {
        console.error('Error parsing PHP class:', error);
        return null;
    }
} 