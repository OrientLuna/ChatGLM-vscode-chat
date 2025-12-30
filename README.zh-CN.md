# ChatGLM Router for GitHub Copilot Chat

本插件fork自 Hugging Face 发布的`huggingface-vscode-chat`项目，修改了默认API，将 **ChatGLM**（包含GLM Coding套餐和通用端）集成给 GitHub Copilot Chat 使用。

---

## 兼容性

*因本人设备有限，暂时无法充分测试兼容性，各位遇到问题可以随时在Github或者评论区提出，我会及时跟进修改*

## AI辅助声明

*插件的开发过程使用ChatGLM Coding完成了大部分API适配工作*

---

## 快速开始

1. 在 VS Code 扩展商店中搜索并安装 "ChatGLM Router for GitHub Copilot Chat"
2. 打开 VS Code Copilot聊天界面 (Ctrl/Cmd + Shift + A)
3. 点击模型选择器，然后点击 "Manage Models..."
4. 找到"ChatGLM Router" ，点击"Manage ChatGLM Router"
5. 选择Provider（GLM Coding），输入API Key（从 [https://open.bigmodel.cn/](https://open.bigmodel.cn/) 获取）
6. 选择要添加到模型选择器的模型

## 可用模型

### ChatGLM Coding套餐（默认）
- 针对代码生成和编程任务优化
- 端点：`https://open.bigmodel.cn/api/coding/paas/v4`

### ChatGLM 通用端（可选）
- 用于通用聊天和非编程任务
- 端点：`https://open.bigmodel.cn/api/paas/v4/`
- 需要在设置中启用（默认禁用）
- 提供相同的模型，针对对话式 AI 优化

### 自定义提供者（即将推出）
- 自定义提供者支持正在开发中
- 如需自定义 API，请参考 `OAI Compatible Provider for Copilot`

## 配置

### API Key

通过命令面板配置您的 ChatGLM API Key：
- 按下 `Ctrl/Cmd + Shift + P`
- 运行 "ChatGLM Router: Manage ChatGLM Router"
- 选择 "ChatGLM (Coding & General)"
- 输入从 [https://open.bigmodel.cn/](https://open.bigmodel.cn/) 获取的 API Key

### 清除 API Key

删除已存储的 ChatGLM API Key：
- 运行 "ChatGLM Router: Clear ChatGLM API Key" 来删除存储的 API Key
- 清除后需要重新输入 API Key 才能使用扩展功能

### 模型选择

模型使用提供商前缀标识：
- `chatglm-coding:glm-4-plus` - ChatGLM 编程端（默认，推荐用于 VS Code）
- `chatglm-general:glm-4-plus` - ChatGLM 通用端（需先在设置中启用）

**注意**：如果 ChatGLM 提供商尚未配置 API Key，该提供商仍会显示在模型选择器中。选择或使用该模型时会提示输入 API Key（非静默模式下）。

### 设置

在 VS Code 设置中的 `chatglmRouter` 下配置：

| 设置 | 选项 | 默认值 | 说明 |
|---------|---------|---------|-------------|
| `defaultProvider` | chatglm-coding, chatglm-general | chatglm-coding | 默认使用的提供商 |
| `enabledProviders` | 提供商数组 | [chatglm-coding] | 启用的提供商 |
| `statistics.enabled` | 布尔值 | true | 启用使用统计跟踪 |

## 使用统计

使用内置统计功能跟踪您的 API 使用情况：

### 查看统计
- 运行 "ChatGLM Router: Show Usage Statistics" 命令
- 查看每个提供商的请求数和 token 数
- 查看详细的每个模型的使用情况

### 重置统计
- 运行 "ChatGLM Router: Reset Usage Statistics" 命令
- 清除所有存储的使用数据

### 在输出中查看统计
- 运行 "ChatGLM Router: Show Statistics in Output" 命令
- 在输出通道中显示详细的统计信息

**注意**：统计数据存储在 VS Code 全局状态中，为估算值（4 字符 ≈ 1 token）。

## 开发

```bash
git clone https://github.com/OrientLuna/ChatGLM-vscode-chat
cd ChatGLM-vscode-chat
npm install
npm run compile
```

按 **F5** 启动扩展开发主机进行测试。

### 常用脚本
- **构建**：`npm run compile`
- **监听**：`npm run watch`
- **检查**：`npm run lint`
- **格式化**：`npm run format`
- **测试**：`npm run test`
- **打包**：`npm run package`（生成 .vsix 文件）

## 架构

- **多提供商设计**：支持 ChatGLM 编程端和 ChatGLM 通用端
- **提供商注册**：内置提供商在 `src/config.ts` 中配置
- **统计跟踪**：在 `src/statistics.ts` 中跟踪使用数据
- **API 优先的模型列表**：从提供商 API 获取最新模型
- **流式响应**：支持工具调用的 SSE 类流式响应

## 故障排除

### 模型未显示
1. 检查您的 ChatGLM API Key 是否配置正确
2. 运行 "ChatGLM Router: Manage ChatGLM Router" 验证 API Key
3. 检查 VS Code 开发者控制台是否有错误（帮助 → 切换开发人员工具）

### API 错误
1. 验证您的 API Key 是否具有所需的权限
2. 检查所选模型在您选择的端点上是否可用
3. 确保您有足够的 API 配额/额度

### ChatGLM 编程端 vs 通用端
- 使用 **ChatGLM 编程端** 处理代码相关任务（推荐用于 VS Code）
- 使用 **ChatGLM 通用端** 处理对话式 AI 和非编程任务
- 在设置中启用 ChatGLM 通用端：`chatglmRouter.enabledProviders` → 添加 `chatglm-general`

## 系统要求

- VS Code 1.104.0 或更高版本
- 来自 [https://open.bigmodel.cn/](https://open.bigmodel.cn/) 的 ChatGLM API Key

## 许可证

MIT License © OrientLuna

## 支持

- 报告问题：[GitHub Issues](https://github.com/OrientLuna/ChatGLM-vscode-chat/issues)
- ChatGLM 文档：[https://open.bigmodel.cn/](https://open.bigmodel.cn/)
