# PHP Accessor VSCode Extension

**🤖 此项目完全由 Cursor AI 编程助手生成开发**

VSCode/Cursor 扩展，专为 PHP Hyperf 框架设计，提供智能的属性访问器导航和精确跳转功能。

## ✨ 主要功能

### 🧠 智能类型推断
- **变量类型智能识别**: 自动推断 `$entity` → `EntityDTO`
- **DTO优先策略**: 优先匹配数据传输对象类型
- **业务逻辑映射**: 支持常见的业务实体变量名映射

### 🔗 精确导航跳转
- **链式调用支持**: 区分 `(new Entity())->setProperty()` vs `$entityDTO->getProperty()`
- **代理类跳转**: 从 Hyperf 代理 trait 跳转到原始类属性
- **参数调用识别**: 正确处理方法参数中的调用

### 📋 Hyperf 框架支持
- **注解解析**: 支持 `#[Data]`, `#[HyperfData]` 注解
- **命名约定**: 自动适配 `UPPER_CAMEL_CASE`, `LOWER_CAMEL_CASE`, `NONE` 等
- **代理文件**: 自动识别 `.php-accessor` 代理目录结构

## 🚀 安装使用

### 快速安装
```bash
# 运行自动安装脚本
./install.sh
```

### 手动安装
1. 下载 `php-accessor-vscode-0.3.0.vsix`
2. 在 VSCode/Cursor 中按 `Cmd+Shift+P` (macOS) 或 `Ctrl+Shift+P` (Windows/Linux)
3. 输入 `Extensions: Install from VSIX...`
4. 选择下载的 vsix 文件并安装

## 🎯 使用示例

### 循环变量智能推断
```php
foreach ($entitiesDTO->getEntities() as $entity) {
    $entity->getCode(); // 自动跳转到 EntityDTO.code 属性
}
```

### 链式调用精确区分
```php
return (new Entity())
    ->setId($entityDTO->getId())        // 跳转到 EntityDTO.id
    ->setCode($entityDTO->getCode()); // 跳转到 EntityDTO.code
```

### 代理类跳转
```php
// 在代理 trait 中按 F12 或 Ctrl+Click
$this->getCode(); // 自动跳转到原始类的 code 属性
```

## 📋 支持的业务映射

| 变量名 | 推断类型 |
|--------|----------|
| `$entity` | `EntityDTO`, `Entity` |
| `$model` | `ModelDTO`, `Model` |
| `$data` | `DataDTO`, `Data` |
| `$item` | `ItemDTO`, `Item` |
| `$record` | `RecordDTO`, `Record` |
| `$object` | `ObjectDTO`, `Object` |
| `$user` | `UserDTO`, `User` |

## 🔧 技术要求

- **VSCode**: 1.96.0 或更高版本
- **PHP 项目**: 支持 Hyperf 框架
- **代理文件**: 需要 `.php-accessor` 目录结构

## 📖 更多信息

- **更新日志**: [CHANGELOG.md](CHANGELOG.md)
- **当前版本**: v0.3.0 (智能类型推断增强版)

## 🤖 关于开发

此扩展完全由 **Cursor AI 编程助手** 基于用户需求自动生成和开发：

- **需求分析**: AI 理解 Hyperf 框架的代理类机制
- **算法设计**: AI 设计智能类型推断和导航算法  
- **代码实现**: AI 编写完整的 TypeScript 扩展代码
- **测试优化**: AI 根据实际使用反馈不断优化算法
- **文档生成**: AI 自动生成完整的技术文档

展示了 AI 在复杂软件开发中的强大能力！ 🚀✨

---

**享受更智能的 PHP 代码导航体验！** 🎯📝