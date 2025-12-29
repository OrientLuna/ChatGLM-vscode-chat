# ChatGLM Router for GitHub Copilot Chat

A VS Code extension that integrates **ChatGLM** (with dedicated Coding and General endpoints) into GitHub Copilot Chat.

---

## Quick Start

1. Install the ChatGLM Router extension (search for "ChatGLM Router" in VS Code extensions)
2. Open VS Code's chat interface (Ctrl/Cmd + Shift + A)
3. Click the model picker and click "Manage Models..."
4. Select "ChatGLM Router" provider
5. Provide your ChatGLM API key (get one from [https://open.bigmodel.cn/](https://open.bigmodel.cn/))
6. Choose the models you want to add to the model picker

## Available Models

### ChatGLM Coding (Default)
- Optimized for code generation and programming tasks
- Endpoint: `https://open.bigmodel.cn/api/coding/paas/v4`

### ChatGLM General (Optional)
- For general chat and non-coding tasks
- Endpoint: `https://open.bigmodel.cn/api/paas/v4/`
- Enable in settings if needed (disabled by default)
- Same models available, optimized for conversational AI


## Configuration

### API Key

Configure your ChatGLM API key via the command palette:
- Press `Ctrl/Cmd + Shift + P`
- Run "ChatGLM Router: Manage ChatGLM Router"
- Select "ChatGLM (Coding & General)"
- Enter your API key from [https://open.bigmodel.cn/](https://open.bigmodel.cn/)

### Clear API Key

Remove your stored ChatGLM API key:
- Run `ChatGLM Router: Clear ChatGLM API Key` to delete the stored API key
- You will need to re-enter your API key to use the extension after clearing it

### Model Selection

Models are prefixed with their provider:
- `chatglm-coding:glm-4-plus` - ChatGLM Coding endpoint (default, recommended for VS Code)
- `chatglm-general:glm-4-plus` - ChatGLM General endpoint (enable in settings first)

Note: If a ChatGLM provider does not have an API key configured, it will still appear in the model picker with a tooltip **"API key not configured"**. Selecting or using that model will prompt you to enter an API key when the caller allows prompting (i.e., when not running in silent mode).

### Settings

Configure in VS Code Settings under `chatglmRouter`:

| Setting | Options | Default | Description |
|---------|---------|---------|-------------|
| `defaultProvider` | chatglm-coding, chatglm-general | chatglm-coding | Default provider to use |
| `enabledProviders` | Array of providers | [chatglm-coding] | Which providers to enable |
| `statistics.enabled` | boolean | true | Enable usage statistics tracking |

**Note**: ChatGLM General is disabled by default. Enable it in settings if you need conversational AI capabilities.

## Usage Statistics

Track your API usage with built-in statistics:

### View Statistics
- Run "ChatGLM Router: Show Usage Statistics" command
- View total requests and tokens per provider
- See detailed per-model usage

### Reset Statistics
- Run "ChatGLM Router: Reset Usage Statistics" command
- Clears all stored usage data

### Statistics in Output
- Run "ChatGLM Router: Show Statistics in Output" command
- Displays detailed statistics in an output channel

**Note**: Statistics are stored locally in VS Code's global state and are estimates (4 chars ≈ 1 token).

## Development

```bash
git clone https://github.com/OrientLuna/ChatGLM-vscode-chat
cd ChatGLM-vscode-chat
npm install
npm run compile
```

Press **F5** to launch an Extension Development Host for testing.

### Common Scripts
- **Build**: `npm run compile`
- **Watch**: `npm run watch`
- **Lint**: `npm run lint`
- **Format**: `npm run format`
- **Test**: `npm run test`
- **Package**: `npm run package` (generates .vsix file)

## Architecture

- **Multi-Provider Design**: Supports ChatGLM Coding and ChatGLM General
- **Provider Registry**: Built-in providers in `src/config.ts`
- **Statistics Tracking**: Usage data tracked in `src/statistics.ts`
- **API-First Model List**: Fetches latest models from provider APIs
- **Streaming Response**: SSE-like streaming with tool call support

## Troubleshooting

### Models not appearing
1. Check that your ChatGLM API key is configured correctly
2. Run "ChatGLM Router: Manage ChatGLM Router" to verify API key
3. Check VS Code developer console for errors (Help → Toggle Developer Tools)

### API Errors
1. Verify your API key has the required permissions
2. Check that the selected model is available on your chosen endpoint
3. Ensure you have sufficient API credits/quotas

### ChatGLM Coding vs General
- Use **ChatGLM Coding** for code-related tasks (recommended for VS Code)
- Use **ChatGLM General** for conversational AI and non-coding tasks
- Enable ChatGLM General in settings: `chatglmRouter.enabledProviders` → add `chatglm-general`

## Requirements

## Architecture

- **Multi-Provider Design**: Supports ChatGLM Coding and ChatGLM General
- **Provider Registry**: Built-in providers in `src/config.ts`
- **Statistics Tracking**: Usage data tracked in `src/statistics.ts`
- **API-First Model List**: Fetches latest models from provider APIs
- **Streaming Response**: SSE-like streaming with tool call support

## Requirements

- VS Code 1.104.0 or higher
- ChatGLM API key from [https://open.bigmodel.cn/](https://open.bigmodel.cn/)

## License

MIT License © OrientLuna

## Support

- Report issues: [GitHub Issues](https://github.com/OrientLuna/ChatGLM-vscode-chat/issues)
- ChatGLM Documentation: [https://open.bigmodel.cn/](https://open.bigmodel.cn/)
