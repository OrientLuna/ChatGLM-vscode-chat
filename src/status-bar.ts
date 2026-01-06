/**
 * Status bar controller for displaying real-time usage statistics
 */

import * as vscode from "vscode";
import { StatisticsManager } from "./statistics";

export class StatisticsStatusBarController {
	private statusBarItem: vscode.StatusBarItem;
	private updateTimer?: NodeJS.Timeout;
	private refreshTimer?: NodeJS.Timeout;

	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly statsManager: StatisticsManager
	) {
		// Create status bar item (right side, priority 100)
		this.statusBarItem = vscode.window.createStatusBarItem(
			vscode.StatusBarAlignment.Right,
			100
		);

		// Set click command to show detailed statistics
		this.statusBarItem.command = "chatglmRouter.showStatistics";

		// Initial update
		this.update();
		this.statusBarItem.show();

		// Listen to configuration changes
		this.context.subscriptions.push(
			vscode.workspace.onDidChangeConfiguration((e) => {
				if (
					e.affectsConfiguration("chatglmRouter.statistics.statusBar")
				) {
					this.update();
				}
			})
		);
	}

	/**
	 * Update status bar display
	 */
	async update(): Promise<void> {
		const config =
			vscode.workspace.getConfiguration("chatglmRouter.statistics");
		const enabled = config.get<boolean>("statusBar.enabled", true);

		if (!enabled) {
			this.statusBarItem.hide();
			return;
		}

		// Check if there is any statistical data
		const stats = await this.statsManager.getStatistics();
		const hasAnyData =
			Object.keys(stats.providers).length > 0 &&
			Object.values(stats.providers).some(
				(p) => Object.keys(p.models).length > 0
			);

		if (!hasAnyData) {
			this.statusBarItem.text = "$(database) 暂无数据";
			this.statusBarItem.tooltip =
				"开始对话后将显示本周/本月统计";
			this.statusBarItem.show();
			return;
		}

		// Get statistics
		const weekStats = await this.statsManager.getWeekStatistics();
		const monthStats = await this.statsManager.getMonthStatistics();

		// Format display
		const displayMode = config.get<string>(
			"statusBar.displayMode",
			"normal"
		);
		const timeRange = config.get<string>("statusBar.timeRange", "both");
		const showRequests = config.get<boolean>(
			"statusBar.showRequestCount",
			true
		);

		this.statusBarItem.text = this.formatText(
			weekStats,
			monthStats,
			displayMode,
			timeRange,
			showRequests
		);

		this.statusBarItem.tooltip = this.formatTooltip(weekStats, monthStats);
		this.statusBarItem.show();
	}

	/**
	 * Format status bar text
	 */
	private formatText(
		week: { totalRequests: number; totalTokens: number },
		month: { totalRequests: number; totalTokens: number },
		displayMode: string,
		timeRange: string,
		showRequests: boolean
	): string {
		const tokens =
			timeRange === "week" ? week.totalTokens : month.totalTokens;
		const requests =
			timeRange === "week" ? week.totalRequests : month.totalRequests;
		const tokenStr = StatisticsManager.formatTokenCount(tokens);

		switch (displayMode) {
			case "compact":
				return showRequests
					? `$(database) ${tokenStr}/${requests}`
					: `$(database) ${tokenStr}`;

			case "minimal":
				return `${tokenStr}`;

			case "normal":
			default:
				const rangeLabel = timeRange === "week" ? "本周" : "本月";
				return showRequests
					? `$(database) ${rangeLabel}: ${tokenStr} (${requests} 请求)`
					: `$(database) ${rangeLabel}: ${tokenStr}`;
		}
	}

	/**
	 * Format tooltip
	 */
	private formatTooltip(
		week: { totalRequests: number; totalTokens: number },
		month: { totalRequests: number; totalTokens: number }
	): string {
		return `ChatGLM Router 用量统计
━━━━━━━━━━━━━━━━━━━━
本周: ${StatisticsManager.formatTokenCount(week.totalTokens, "full")} tokens (${week.totalRequests} 请求)
本月: ${StatisticsManager.formatTokenCount(month.totalTokens, "full")} tokens (${month.totalRequests} 请求)

点击查看详细统计`;
	}

	/**
	 * Schedule update with debouncing (500ms)
	 */
	scheduleUpdate(): void {
		if (this.updateTimer) {
			clearTimeout(this.updateTimer);
		}

		this.updateTimer = setTimeout(() => {
			this.update();
			this.updateTimer = undefined;
		}, 500);
	}

	/**
	 * Start auto-refresh (every 5 minutes)
	 */
	startAutoRefresh(): void {
		// Refresh every 5 minutes to ensure week/month transitions are accurate
		this.refreshTimer = setInterval(() => {
			this.update();
		}, 5 * 60 * 1000);
	}

	/**
	 * Stop auto-refresh
	 */
	stopAutoRefresh(): void {
		if (this.refreshTimer) {
			clearInterval(this.refreshTimer);
			this.refreshTimer = undefined;
		}
	}

	/**
	 * Dispose resources
	 */
	dispose(): void {
		this.stopAutoRefresh();
		if (this.updateTimer) {
			clearTimeout(this.updateTimer);
		}
		this.statusBarItem.dispose();
	}
}
