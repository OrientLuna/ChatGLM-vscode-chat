/**
 * Provider configuration for ChatGLM Router
 * Supports multiple LLM providers with different endpoints
 */
import * as vscode from "vscode";

/**
 * Configuration for a single provider
 */
export interface ProviderConfig {
	/** Unique provider identifier */
	id: string;
	/** Display name shown to users */
	name: string;
	/** API base URL */
	baseUrl: string;
	/** Secret storage key for API key */
	apiKeySecret: string;
	/** Model family identifier */
	family: string;
	/** Whether this provider supports tool calling */
	supportsTools: boolean;
	/** Default maximum output tokens */
	defaultMaxTokens: number;
	/** Default context length */
	defaultContextLength: number;
	/** Whether this is the default provider */
	isDefault: boolean;
}

/**
 * Registry of all available providers
 */
export const PROVIDERS: Record<string, ProviderConfig> = {
	"chatglm-coding": {
		id: "chatglm-coding",
		name: "ChatGLM Coding",
		baseUrl: "https://open.bigmodel.cn/api/coding/paas/v4",
		apiKeySecret: "chatglm-router.apiKey.chatglm",
		family: "chatglm",
		supportsTools: true,
		defaultMaxTokens: 8192,
		defaultContextLength: 128000,
		isDefault: true,
	},
	"chatglm-general": {
		id: "chatglm-general",
		name: "ChatGLM General",
		baseUrl: "https://open.bigmodel.cn/api/paas/v4/",
		apiKeySecret: "chatglm-router.apiKey.chatglm",
		family: "chatglm",
		supportsTools: true,
		defaultMaxTokens: 8192,
		defaultContextLength: 128000,
		isDefault: false,
	},
};

/**
 * Get provider configuration by ID
 * @param id Provider identifier
 * @returns Provider config or undefined
 */
export function getProviderById(id: string): ProviderConfig | undefined {
	return PROVIDERS[id];
}

/**
 * Parse model ID to determine which provider to use
 * Model IDs can be prefixed with provider ID (e.g., "chatglm-coding:glm-4-plus")
 * Unprefixed model IDs default to chatglm-coding
 * @param modelId Model identifier (may include provider prefix)
 * @returns Provider configuration
 */
export function getProviderByModelId(modelId: string): ProviderConfig {
	const parts = modelId.split(":");
	// Check if first part is a known provider ID
	if (parts.length > 0 && parts[0] in PROVIDERS) {
		return PROVIDERS[parts[0]];
	}
	// Default to chatglm-coding
	return PROVIDERS["chatglm-coding"];
}

/**
 * Get the default provider configuration
 * @returns Default provider (chatglm-coding)
 */
export function getDefaultProvider(): ProviderConfig {
	return PROVIDERS["chatglm-coding"];
}

/**
 * Get all providers that support tool calling
 * @returns Array of provider configs
 */
export function getToolSupportingProviders(): ProviderConfig[] {
	return Object.values(PROVIDERS).filter((p) => p.supportsTools);
}

/**
 * Custom providers support removed.
 * Previously supported custom providers via settings; feature removed.
 */

export function getAllProviders(): ProviderConfig[] {
	return Object.values(PROVIDERS);
}

export function getProviderByIdAny(id: string): ProviderConfig | undefined {
	return PROVIDERS[id];
}
