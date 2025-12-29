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
	}

	/**
	 * Reset all statistics
	 */
	async resetStatistics(): Promise<void> {
		await this.context.globalState.update(
			StatisticsManager.STORAGE_KEY,
			this.createEmptyStatistics()
		);
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
}
