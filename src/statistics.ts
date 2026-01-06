/**
 * Usage statistics management for ChatGLM Router
 * Tracks token usage and request counts per model and provider
 */

import * as vscode from "vscode";

/**
 * Statistics for a single model
 */
export interface ModelUsageStats {
	modelId: string;
	requestCount: number;
	totalInputTokens: number;
	totalOutputTokens: number;
	lastUsed: number; // Timestamp
}

/**
 * Complete statistics data structure
 */
export interface StatisticsData {
	version: string;
	providers: {
		[providerId: string]: {
			models: {
				[modelId: string]: ModelUsageStats;
			};
			totalRequests: number;
			totalTokens: number;
		};
	};
}

/**
 * Manages usage statistics tracking and persistence
 */
export class StatisticsManager {
	private static readonly STORAGE_KEY = "chatglm-router.statistics";
	private static readonly VERSION = "1.0.0";

	// Event emitter for statistics changes
	private readonly _onDidChangeStatistics = new vscode.EventEmitter<void>();
	readonly onDidChangeStatistics = this._onDidChangeStatistics.event;

	constructor(private readonly context: vscode.ExtensionContext) {}

	/**
	 * Get all statistics from storage
	 */
	async getStatistics(): Promise<StatisticsData> {
		const stored = await this.context.globalState.get<StatisticsData>(
			StatisticsManager.STORAGE_KEY
		);
		return stored || this.createEmptyStatistics();
	}

	/**
	 * Create empty statistics structure
	 */
	private createEmptyStatistics(): StatisticsData {
		return {
			version: StatisticsManager.VERSION,
			providers: {},
		};
	}

	/**
	 * Record a request with token usage
	 * @param providerId Provider identifier
	 * @param modelId Model identifier
	 * @param inputTokens Input token count (estimated)
	 * @param outputTokens Output token count
	 */
	async recordRequest(
		providerId: string,
		modelId: string,
		inputTokens: number,
		outputTokens: number
	): Promise<void> {
		const stats = await this.getStatistics();

		// Initialize provider if not exists
		if (!stats.providers[providerId]) {
			stats.providers[providerId] = {
				models: {},
				totalRequests: 0,
				totalTokens: 0,
			};
		}

		const provider = stats.providers[providerId];

		// Initialize model if not exists
		if (!provider.models[modelId]) {
			provider.models[modelId] = {
				modelId,
				requestCount: 0,
				totalInputTokens: 0,
				totalOutputTokens: 0,
				lastUsed: 0,
			};
		}

		const modelStats = provider.models[modelId];
		modelStats.requestCount++;
		modelStats.totalInputTokens += inputTokens;
		modelStats.totalOutputTokens += outputTokens;
		modelStats.lastUsed = Date.now();

		provider.totalRequests++;
		provider.totalTokens += inputTokens + outputTokens;

		await this.context.globalState.update(StatisticsManager.STORAGE_KEY, stats);

		// Emit event to notify listeners
		this._onDidChangeStatistics.fire();
	}

	/**
	 * Reset all statistics
	 */
	async resetStatistics(): Promise<void> {
		await this.context.globalState.update(
			StatisticsManager.STORAGE_KEY,
			this.createEmptyStatistics()
		);

		// Emit event to notify listeners
		this._onDidChangeStatistics.fire();
	}

	/**
	 * Get statistics for a specific provider
	 * @param providerId Provider identifier
	 * @returns Array of model statistics
	 */
	async getProviderStats(providerId: string): Promise<ModelUsageStats[]> {
		const stats = await this.getStatistics();
		const providerStats = stats.providers[providerId];
		if (!providerStats) {
			return [];
		}
		return Object.values(providerStats.models);
	}

	/**
	 * Get summary statistics for all providers
	 * @returns Map of provider ID to summary
	 */
	async getSummary(): Promise<
		Map<string, { totalRequests: number; totalTokens: number }>
	> {
		const stats = await this.getStatistics();
		const summary = new Map();

		for (const [providerId, providerStats] of Object.entries(stats.providers)) {
			summary.set(providerId, {
				totalRequests: providerStats.totalRequests,
				totalTokens: providerStats.totalTokens,
			});
		}

		return summary;
	}

	/**
	 * Get total statistics across all providers
	 * @returns Total requests and tokens
	 */
	async getTotal(): Promise<{ totalRequests: number; totalTokens: number }> {
		const summary = await this.getSummary();
		let totalRequests = 0;
		let totalTokens = 0;

		for (const [, value] of summary) {
			totalRequests += value.totalRequests;
			totalTokens += value.totalTokens;
		}

		return { totalRequests, totalTokens };
	}

	/**
	 * Get the start of the current week (Monday 00:00:00)
	 * 使用 UTC 时间避免时区问题
	 */
	private getWeekStart(): number {
		const now = new Date();
		const day = now.getUTCDay();
		const diff = now.getUTCDate() - day + (day === 0 ? -6 : 1);
		const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), diff));
		monday.setUTCHours(0, 0, 0, 0);
		return monday.getTime();
	}

	/**
	 * Get the start of the current month (1st 00:00:00)
	 * 使用 UTC 时间避免时区问题
	 */
	private getMonthStart(): number {
		const now = new Date();
		const firstDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
		return firstDay.getTime();
	}

	/**
	 * Get statistics for the current week
	 * @returns Week statistics (approximate, based on lastUsed timestamp)
	 */
	async getWeekStatistics(): Promise<{
		totalRequests: number;
		totalTokens: number;
	}> {
		const stats = await this.getStatistics();
		const weekStart = this.getWeekStart();

		let totalRequests = 0;
		let totalTokens = 0;

		for (const provider of Object.values(stats.providers)) {
			for (const model of Object.values(provider.models)) {
				// If model was used during this week, count it
				if (model.lastUsed >= weekStart) {
					totalRequests += model.requestCount;
					totalTokens +=
						model.totalInputTokens + model.totalOutputTokens;
				}
			}
		}

		return { totalRequests, totalTokens };
	}

	/**
	 * Get statistics for the current month
	 * @returns Month statistics (approximate, based on lastUsed timestamp)
	 */
	async getMonthStatistics(): Promise<{
		totalRequests: number;
		totalTokens: number;
	}> {
		const stats = await this.getStatistics();
		const monthStart = this.getMonthStart();

		let totalRequests = 0;
		let totalTokens = 0;

		for (const provider of Object.values(stats.providers)) {
			for (const model of Object.values(provider.models)) {
				// If model was used during this month, count it
				if (model.lastUsed >= monthStart) {
					totalRequests += model.requestCount;
					totalTokens +=
						model.totalInputTokens + model.totalOutputTokens;
				}
			}
		}

		return { totalRequests, totalTokens };
	}

	/**
	 * Get statistics for a specific model
	 * @param providerId Provider identifier
	 * @param modelId Model identifier
	 * @returns Model statistics or null if not found
	 */
	async getModelStats(
		providerId: string,
		modelId: string
	): Promise<ModelUsageStats | null> {
		const stats = await this.getStatistics();
		return stats.providers[providerId]?.models[modelId] || null;
	}

	/**
	 * Format time difference as human-readable string (e.g., "2 小时前")
	 * @param timestamp Timestamp to format
	 * @returns Formatted string
	 */
	static formatTimeAgo(timestamp: number): string {
		const now = Date.now();
		const diff = now - timestamp;

		const minutes = Math.floor(diff / 60000);
		const hours = Math.floor(diff / 3600000);
		const days = Math.floor(diff / 86400000);

		if (minutes < 1) return "刚刚";
		if (minutes < 60) return `${minutes} 分钟前`;
		if (hours < 24) return `${hours} 小时前`;
		if (days < 7) return `${days} 天前`;

		const date = new Date(timestamp);
		return date.toLocaleDateString();
	}

	/**
	 * Format token count (e.g., 123456 -> 123K)
	 * @param tokens Token count to format
	 * @param format Format type: 'short' (K/M/B) or 'full' (with commas)
	 * @returns Formatted string
	 */
	static formatTokenCount(
		tokens: number,
		format: "short" | "full" = "short"
	): string {
		if (format === "full") {
			return tokens.toLocaleString();
		}

		if (tokens >= 1_000_000_000) {
			return `${(tokens / 1_000_000_000).toFixed(1)}B`;
		} else if (tokens >= 1_000_000) {
			return `${(tokens / 1_000_000).toFixed(1)}M`;
		} else if (tokens >= 1_000) {
			return `${(tokens / 1_000).toFixed(1)}K`;
		}
		return tokens.toString();
	}

	/**
	 * Dispose resources
	 */
	dispose(): void {
		this._onDidChangeStatistics.dispose();
	}
}
