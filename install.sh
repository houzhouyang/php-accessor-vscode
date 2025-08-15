#!/bin/bash

# PHP Accessor VSCode Extension 快速安装脚本
# 版本: 0.3.1 (取消错误修复版)

echo "🚀 PHP Accessor VSCode Extension 安装器"
echo "======================================"

# 获取扩展包路径
EXTENSION_PATH="$(pwd)/php-accessor-vscode-0.3.1.vsix"

# 检查文件是否存在
if [ ! -f "$EXTENSION_PATH" ]; then
    echo "❌ 错误：找不到扩展包文件"
    echo "   期望路径: $EXTENSION_PATH"
    echo "   请确认您在正确的目录中运行此脚本"
    exit 1
fi

echo "📦 找到扩展包: $EXTENSION_PATH"
echo "📊 文件大小: $(ls -lh "$EXTENSION_PATH" | awk '{print $5}')"

# 尝试安装到VSCode
echo ""
echo "🔧 正在安装到VSCode..."

if command -v code &> /dev/null; then
    code --install-extension "$EXTENSION_PATH"
    if [ $? -eq 0 ]; then
        echo "✅ VSCode安装成功！"
        VSCODE_INSTALLED=true
    else
        echo "❌ VSCode安装失败"
        VSCODE_INSTALLED=false
    fi
else
    echo "⚠️  VSCode命令行工具未找到"
    VSCODE_INSTALLED=false
fi

# 尝试安装到Cursor
echo ""
echo "🔧 正在安装到Cursor..."

if command -v cursor &> /dev/null; then
    cursor --install-extension "$EXTENSION_PATH"
    if [ $? -eq 0 ]; then
        echo "✅ Cursor安装成功！"
        CURSOR_INSTALLED=true
    else
        echo "❌ Cursor安装失败"
        CURSOR_INSTALLED=false
    fi
else
    echo "⚠️  Cursor命令行工具未找到"
    CURSOR_INSTALLED=false
fi

# 安装结果总结
echo ""
echo "📋 安装结果总结"
echo "==============="

if [ "$VSCODE_INSTALLED" = true ]; then
    echo "✅ VSCode: 安装成功"
else
    echo "❌ VSCode: 安装失败或未找到"
fi

if [ "$CURSOR_INSTALLED" = true ]; then
    echo "✅ Cursor: 安装成功"
else
    echo "❌ Cursor: 安装失败或未找到"
fi

# 手动安装说明
if [ "$VSCODE_INSTALLED" = false ] && [ "$CURSOR_INSTALLED" = false ]; then
    echo ""
    echo "🔧 手动安装说明"
    echo "================"
    echo "1. 打开VSCode/Cursor"
    echo "2. 按 Cmd+Shift+P (macOS) 或 Ctrl+Shift+P (Windows/Linux)" 
    echo "3. 输入: Extensions: Install from VSIX..."
    echo "4. 选择文件: $EXTENSION_PATH"
    echo "5. 点击安装并重启编辑器"
fi

# 测试建议
echo ""
echo "🧪 测试建议"
echo "==========="
echo "1. 重启VSCode/Cursor以确保扩展正常加载"
echo "2. 打开一个Hyperf项目进行测试"
echo "3. 查看INSTALL_TEST.md文件获取详细测试指南"
echo "4. 在代理trait中按F12测试跳转功能"

echo ""
echo "📖 更多信息:"
echo "   - 安装指南: $(pwd)/INSTALL_TEST.md"
echo "   - Hyperf支持: $(pwd)/HYPERF_SUPPORT.md"
echo "   - 更新日志: $(pwd)/CHANGELOG.md"

echo ""
echo "🎉 安装完成！祝您使用愉快！"
