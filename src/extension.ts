import * as vscode from "vscode";
import { ChatGLMRouterProvider } from "./provider";
import { StatisticsManager } from "./statistics";
import { StatisticsViewProvider } from "./statistics-view";
import { getDefaultProvider, type ProviderConfig } from "./config";

export function activate(context: vscode.ExtensionContext) {
	console.log("[ChatGLM Router] Extension is activating...");

	// Build a descriptive User-Agent to help quantify API usage
	const ext = vscode.extensions.getExtension("OrientLuna.chatglm-router-vscode");
	const extVersion = ext?.packageJSON?.version ?? "unknown";
	const vscodeVersion = vscode.version;
	const ua = `chatglm-router-vscode/${extVersion} VSCode/${vscodeVersion}`;

	console.log(`[ChatGLM Router] Version: ${extVersion}, VS Code: ${vscodeVersion}`);

	// Initialize statistics manager
	const statsManager = new StatisticsManager(context);
	const statsView = new StatisticsViewProvider(statsManager);

	// Create the router provider
	const provider = new ChatGLMRouterProvider(context.secrets, statsManager, ua);

	// Register the ChatGLM Router provider under the vendor id used in package.json
	vscode.lm.registerLanguageModelChatProvider("chatglm-router", provider);
	console.log("[ChatGLM Router] Provider registered successfully with vendor ID: chatglm-router");

	// Management command to configure API keys
	context.subscriptions.push(
		vscode.commands.registerCommand("chatglmRouter.manage", async () => {
			// ChatGLM management (custom providers support removed)
			const secretKey = "chatglm-router.apiKey.chatglm";
			const providerName = "ChatGLM";

			console.log(`[ChatGLM Router] Manage command invoked`);

			// Present a quick pick to match the host's expected management flow
			const selected = await vscode.window.showQuickPick(["ChatGLM (Coding & General)"], {
				placeHolder: "Select provider to manage API key",
			});
			if (!selected) {
				return; // User cancelled
			}

			console.log(`[ChatGLM Router] Managing API key for ${providerName}, using key: ${secretKey}`);

			const existing = await context.secrets.get(secretKey);
			const apiKey = await vscode.window.showInputBox({
				title: `${providerName} API Key`,
				prompt: existing ? `Update your ${providerName} API key` : `Enter your ${providerName} API key`,
				ignoreFocusOut: true,
				password: true,
				value: existing ?? "",
			});
			if (apiKey === undefined) {
				return; // user canceled
			}
			if (!apiKey.trim()) {
				await context.secrets.delete(secretKey);
				vscode.window.showInformationMessage(`${providerName} API key cleared.`);
				return;
			}
			await context.secrets.store(secretKey, apiKey.trim());
			vscode.window.showInformationMessage(`${providerName} API key saved.`);
			console.log(`[ChatGLM Router] API key saved for ${providerName}`);
		})
		);

	// Show statistics command
	context.subscriptions.push(
		vscode.commands.registerCommand("chatglmRouter.showStatistics", () => {
			statsView.showStatistics();
		})
	);

	// Reset statistics command
	context.subscriptions.push(
		vscode.commands.registerCommand("chatglmRouter.resetStatistics", () => {
			statsView.resetStatistics();
		})
	);

	// Show statistics in output channel command
	context.subscriptions.push(
		vscode.commands.registerCommand("chatglmRouter.showStatisticsInOutput", () => {
			statsView.showStatisticsInOutput();
		})
	);

	// Command to clear ChatGLM API key
	context.subscriptions.push(
		vscode.commands.registerCommand("chatglmRouter.clearApiKey", async () => {
			const secretKey = "chatglm-router.apiKey.chatglm";
			const providerName = "ChatGLM";

			try {
				const existing = await context.secrets.get(secretKey);
				if (!existing) {
					vscode.window.showInformationMessage("No ChatGLM API key found to delete.");
					return;
				}

				const choice = await vscode.window.showWarningMessage(
					"Do you want to delete your ChatGLM API key? You will need to re-enter it to use the extension.",
					{ modal: true },
					"Delete",
					"Cancel"
				);

				if (choice === "Delete") {
					await context.secrets.delete(secretKey);
					console.log(`[ChatGLM Router] Deleted secret ${secretKey}`);
					vscode.window.showInformationMessage(`${providerName} API key deleted.`);
				}
			} catch (err) {
				console.error("Failed to delete API key:", err);
				vscode.window.showErrorMessage("Failed to clear API key. See console for details.");
			}
		})
	);
}


export function deactivate() {}
