# PHP Accessor

VSCode 扩展，用于在 PHP 类中快速导航属性和访问器方法（Getter/Setter）。

## 功能

- 在属性和其对应的访问器方法之间快速导航
- 支持从 Getter/Setter 跳转到对应的属性
- 支持从属性跳转到其 Getter/Setter 方法

## 使用方法

1. 在 PHP 类文件中，将光标放在属性或访问器方法上
2. 使用以下命令：
   - `PHP Accessor: Navigate to Property`: 从访问器跳转到属性
   - `PHP Accessor: Navigate to Accessor`: 从属性跳转到访问器

## 要求

- VSCode 1.96.0 或更高版本
- PHP 文件

## 已知问题

如果您发现任何问题，请在 GitHub 仓库中提交 issue。

## 发布说明

### 0.0.1

初始版本：
- 基本的属性和访问器导航功能
- 支持 public、protected 和 private 属性
- 支持类型声明

### 0.0.2

- 其他问题修复

### 0.0.3

- 优化查找代理类跳转问题
- 优化文件索引生成问题
- 修复命令生成的代理类无法找到问题

### 0.0.4
- 其他问题修复