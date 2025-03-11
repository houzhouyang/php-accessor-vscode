import { PhpProperty } from './phpParser';

/**
 * Generate a getter method for a property
 */
export function generateGetterMethod(property: PhpProperty): string {
    const capitalizedName = property.name.charAt(0).toUpperCase() + property.name.slice(1);
    const returnType = property.type ? `: ${property.type}` : '';
    
    return `
    /**
     * Get ${property.name}
     * 
     * @return ${property.type}
     */
    public function get${capitalizedName}()${returnType}
    {
        return $this->${property.name};
    }
    `;
}

/**
 * Generate a setter method for a property
 */
export function generateSetterMethod(property: PhpProperty): string {
    const capitalizedName = property.name.charAt(0).toUpperCase() + property.name.slice(1);
    const paramType = property.type ? `${property.type} ` : '';
    
    return `
    /**
     * Set ${property.name}
     * 
     * @param ${property.type} $${property.name}
     * @return self
     */
    public function set${capitalizedName}(${paramType}$${property.name}): self
    {
        $this->${property.name} = $${property.name};
        return $this;
    }
    `;
} 