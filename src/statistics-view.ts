/**
 * Statistics view provider for ChatGLM Router
 * Displays usage statistics through QuickPick interface
 */

import * as vscode from "vscode";
import { StatisticsManager, type ModelUsageStats } from "./statistics";

/**
 * Provides UI for viewing and managing usage statistics
 */
export class StatisticsViewProvider {
	constructor(
		private readonly statsManager: StatisticsManager
	) {}

	/**
	 * Show statistics overview
	 */
	async showStatistics(): Promise<void> {
		const stats = await this.statsManager.getStatistics();
		const total = await this.statsManager.getTotal();
		const providerIds = Object.keys(stats.providers);

		if (providerIds.length === 0) {
			await vscode.window.showInformationMessage(
				"No usage statistics recorded yet."
			);
			return;
		}

		// Show total summary
		const totalMessage = `Total: ${total.totalRequests} requests, ${total.totalTokens} tokens across ${providerIds.length} provider(s)`;
		const choice = await vscode.window.showQuickPick(
			[
				{
					label: "$(database) View by Provider",
					description: totalMessage,
					action: "providers" as const,
				},
				{
					label: "$(refresh) Refresh Statistics",
					description: "Reload and display current statistics",
					action: "refresh" as const,
				},
				{
					label: "$(close) 关闭",
					description: "关闭统计视图",
					action: "close" as const,
				},
			],
			{
				placeHolder: "ChatGLM Router Usage Statistics",
			}
		);

		if (choice?.action === "providers") {
			await this.showProviderList();
		} else if (choice?.action === "refresh") {
			await vscode.window.showInformationMessage("统计已刷新");
			await this.showStatistics();
		} else if (choice?.action === "close") {
			return; // 明确关闭对话框
		}
	}

	/**
	 * Show list of providers with statistics
	 */
	private async showProviderList(): Promise<void> {
		const summary = await this.statsManager.getSummary();
		const items: (vscode.QuickPickItem & { providerId: string })[] = [];

		for (const [providerId, data] of summary) {
			items.push({
				label: `$(server) ${providerId}`,
				description: `${data.totalRequests} requests, ${data.totalTokens} tokens`,
				providerId,
			});
		}

		if (items.length === 0) {
			await vscode.window.showInformationMessage(
				"No provider statistics available."
			);
			return;
		}

		const selected = await vscode.window.showQuickPick(items, {
			placeHolder: "Select a provider to view detailed statistics",
		});

		if (selected) {
			await this.showProviderDetails(selected.providerId);
		}
	}

	/**
	 * Show detailed statistics for a specific provider
	 */
	private async showProviderDetails(providerId: string): Promise<void> {
		const modelStats = await this.statsManager.getProviderStats(providerId);

		if (modelStats.length === 0) {
			await vscode.window.showInformationMessage(
				`No model statistics available for ${providerId}.`
			);
			return;
		}

		// Sort by request count (descending)
		modelStats.sort((a, b) => b.requestCount - a.requestCount);

		const items: vscode.QuickPickItem[] = modelStats.map((m) => ({
			label: m.modelId,
			description: `${m.requestCount} requests`,
			detail: `${m.totalInputTokens + m.totalOutputTokens} tokens (in: ${m.totalInputTokens}, out: ${m.totalOutputTokens})`,
		}));

		await vscode.window.showQuickPick(items, {
			placeHolder: `Statistics for ${providerId}`,
			canPickMany: false,
		});
	}

	/**
	 * Reset all statistics with confirmation
	 */
	async resetStatistics(): Promise<void> {
		const total = await this.statsManager.getTotal();

		if (total.totalRequests === 0) {
			await vscode.window.showInformationMessage(
				"No statistics to reset."
			);
			return;
		}

		const confirmed = await vscode.window.showWarningMessage(
			`Are you sure you want to reset all usage statistics?\n\nThis will delete:\n${total.totalRequests} requests, ${total.totalTokens} tokens`,
			{ modal: true },
			"Reset",
			"Cancel"
		);

		if (confirmed === "Reset") {
			await this.statsManager.resetStatistics();
			await vscode.window.showInformationMessage(
				"Statistics have been reset."
			);
		}
	}

	/**
	 * Show statistics in output channel
	 */
	async showStatisticsInOutput(): Promise<void> {
		const stats = await this.statsManager.getStatistics();
		const total = await this.statsManager.getTotal();

		const outputChannel = vscode.window.createOutputChannel("ChatGLM Router Statistics");
		outputChannel.clear();
		outputChannel.appendLine("=== ChatGLM Router Usage Statistics ===");
		outputChannel.appendLine("");
		outputChannel.appendLine(`Total: ${total.totalRequests} requests, ${total.totalTokens} tokens`);
		outputChannel.appendLine("");

		for (const [providerId, providerStats] of Object.entries(stats.providers)) {
			outputChannel.appendLine(`--- ${providerId} ---`);
			outputChannel.appendLine(`Total Requests: ${providerStats.totalRequests}`);
			outputChannel.appendLine(`Total Tokens: ${providerStats.totalTokens}`);
			outputChannel.appendLine("");

			for (const [modelId, modelStats] of Object.entries(providerStats.models)) {
				const totalTokens = modelStats.totalInputTokens + modelStats.totalOutputTokens;
				const lastUsed = modelStats.lastUsed
					? new Date(modelStats.lastUsed).toLocaleString()
					: "Never";

				outputChannel.appendLine(`  ${modelId}`);
				outputChannel.appendLine(`    Requests: ${modelStats.requestCount}`);
				outputChannel.appendLine(`    Tokens: ${totalTokens} (in: ${modelStats.totalInputTokens}, out: ${modelStats.totalOutputTokens})`);
				outputChannel.appendLine(`    Last Used: ${lastUsed}`);
				outputChannel.appendLine("");
			}
		}

		outputChannel.show();
	}
}
