import * as vscode from "vscode";
import {
	CancellationToken,
	LanguageModelChatInformation,
	LanguageModelChatMessage,
	LanguageModelChatProvider,
	LanguageModelChatRequestHandleOptions,
	LanguageModelResponsePart,
	Progress,
} from "vscode";

import type { HFModelItem, HFModelsResponse } from "./types";

import { convertTools, convertMessages, tryParseJSONObject, validateRequest } from "./utils";
import { getProviderByModelId, getToolSupportingProviders, getAllProviders, getProviderByIdAny, type ProviderConfig } from "./config";
import { getStaticModelsForProvider } from "./static-models";
import { StatisticsManager } from "./statistics";

const DEFAULT_MAX_OUTPUT_TOKENS = 8192;
const DEFAULT_CONTEXT_LENGTH = 128000;

/**
 * VS Code Chat provider backed by multiple LLM providers.
 * Supports ChatGLM (coding and general endpoints).
 */
export class ChatGLMRouterProvider implements LanguageModelChatProvider {
	private _chatEndpoints: { model: string; modelMaxPromptTokens: number }[] = [];
	/** Buffer for assembling streamed tool calls by index. */
	private _toolCallBuffers: Map<number, { id?: string; name?: string; args: string }> = new Map<
		number,
		{ id?: string; name?: string; args: string }
	>();

	/** Indices for which a tool call has been fully emitted. */
	private _completedToolCallIndices = new Set<number>();

	/** Track if we emitted any assistant text before seeing tool calls (SSE-like begin-tool-calls hint). */
	private _hasEmittedAssistantText = false;

	/** Track if we emitted the begin-tool-calls whitespace flush. */
	private _emittedBeginToolCallsHint = false;

	// Lightweight tokenizer state for tool calls embedded in text
	private _textToolParserBuffer = "";
	private _textToolActive:
		| undefined
		| {
			name?: string;
			index?: number;
			argBuffer: string;
			emitted?: boolean;
		};
	private _emittedTextToolCallKeys = new Set<string>();
	private _emittedTextToolCallIds = new Set<string>();

	/** Track output tokens for statistics */
	private _outputTokenCount = 0;

	/**
	 * Create a provider using the given secret storage and statistics manager.
	 * @param secrets VS Code secret storage.
	 * @param statsManager Statistics manager for tracking usage.
	 * @param userAgent User agent string for API requests.
	 */
	constructor(
		private readonly secrets: vscode.SecretStorage,
		private readonly statsManager: StatisticsManager,
		private readonly userAgent: string
	) {}

	/** Roughly estimate tokens for VS Code chat messages (text only) */
	private estimateMessagesTokens(msgs: readonly vscode.LanguageModelChatMessage[]): number {
		let total = 0;
		for (const m of msgs) {
			for (const part of m.content) {
				if (part instanceof vscode.LanguageModelTextPart) {
					total += Math.ceil(part.value.length / 4);
				}
			}
		}
		return total;
	}

	/** Rough token estimate for tool definitions by JSON size */
	private estimateToolTokens(tools: { type: string; function: { name: string; description?: string; parameters?: object } }[] | undefined): number {
		if (!tools || tools.length === 0) { return 0; }
		try {
			const json = JSON.stringify(tools);
			return Math.ceil(json.length / 4);
		} catch {
			return 0;
		}
	}

	/**
	 * Get the list of available language models contributed by this provider
	 * @param options Options which specify the calling context of this function
	 * @param token A cancellation token which signals if the user cancelled the request or not
	 * @returns A promise that resolves to the list of available language models
	 */
	async prepareLanguageModelChatInformation(
		options: { silent: boolean },
		_token: CancellationToken
	): Promise<LanguageModelChatInformation[]> {
		// Get all providers (built-in + custom)
		const allProviders = getAllProviders();

		// Get enabled providers from configuration
		const config = vscode.workspace.getConfiguration("chatglmRouter");
		const enabledProviderIds = config.get<string[]>("enabledProviders", ["chatglm-coding"]);

		// Filter providers: must be enabled (API key may be missing; we'll show static or placeholder models)
		const providersToFetch: Array<{ provider: ProviderConfig; apiKey?: string }> = [];
		for (const provider of allProviders) {
			// Check if provider is enabled in settings
			if (!enabledProviderIds.includes(provider.id)) {
				console.log(`[ChatGLM Router] Provider ${provider.id} is not enabled in settings, skipping`);
				continue;
			}

			// Check if API key exists (without prompting)
			const apiKey = await this.secrets.get(provider.apiKeySecret);
			if (!apiKey) {
				console.log(`[ChatGLM Router] Provider ${provider.id} has no API key configured, will show static/placeholder models`);
			}

			providersToFetch.push({ provider, apiKey });
		}

		const allInfos: LanguageModelChatInformation[] = [];

		for (const { provider, apiKey } of providersToFetch) {
			if (apiKey) {
				try {
					const { models } = await this.fetchModels(provider, apiKey);
					const infos = this.buildModelInformation(models, provider);
					allInfos.push(...infos);
				} catch (error) {
					console.error(`[ChatGLM Router] Failed to fetch models from ${provider.id}:`, error);
					if (provider.id.startsWith("chatglm")) {
						const staticModels = getStaticModelsForProvider(provider.id);
					const staticInfos = this.buildModelInformation(staticModels, provider, { tooltipSuffix: "API key not configured" });
						allInfos.push(...staticInfos);
					}
				}
			} else {
				// No API key: show static models or a placeholder so provider appears in UI
				if (provider.id.startsWith("chatglm")) {
					const staticModels = getStaticModelsForProvider(provider.id);
					if (staticModels.length > 0) {
						const staticInfos = this.buildModelInformation(staticModels, provider, { tooltipSuffix: "API key not configured" });
						allInfos.push(...staticInfos);
					} else {
						// Add a placeholder entry so the provider is visible
						allInfos.push({
							id: `${provider.id}:__no_api_key__`,
							name: `${provider.name} (API key not configured)`,
							tooltip: `${provider.name} — API key not configured`,
							family: provider.family,
							version: "1.0.0",
							maxInputTokens: Math.max(1, provider.defaultContextLength - provider.defaultMaxTokens),
							maxOutputTokens: provider.defaultMaxTokens,
							capabilities: {
								toolCalling: true,
								imageInput: false,
							},
						} as LanguageModelChatInformation);
					}
				} else {
					console.log(`[ChatGLM Router] Provider ${provider.id} has no API key and no static models; skipping`);
				}
			}
		}

		// Deduplicate by base model ID (keep first occurrence)
		const seenBaseModels = new Set<string>();
		const uniqueInfos: LanguageModelChatInformation[] = [];
		for (const info of allInfos) {
			// Extract base model ID (remove provider prefix and variant)
			const parts = info.id.split(":");
			const baseModelId = parts[parts.length > 1 ? 1 : 0];

			if (!seenBaseModels.has(baseModelId)) {
				seenBaseModels.add(baseModelId);
				uniqueInfos.push(info);
			} else {
				console.log(`[ChatGLM Router] Skipping duplicate model ${info.id} (base: ${baseModelId})`);
			}
		}

		this._chatEndpoints = uniqueInfos.map((info) => ({
			model: info.id,
			modelMaxPromptTokens: info.maxInputTokens + info.maxOutputTokens,
		}));

		return uniqueInfos;
	}

	async provideLanguageModelChatInformation(
		options: { silent: boolean },
		_token: CancellationToken
	): Promise<LanguageModelChatInformation[]> {
		return this.prepareLanguageModelChatInformation({ silent: options.silent ?? false }, _token);
	}

	/**
	 * Build LanguageModelChatInformation entries from models
	 * @param models Array of model items
	 * @param provider Provider configuration
	 * @returns Array of model information entries
	 */
	private buildModelInformation(
		models: HFModelItem[],
		provider: ProviderConfig,
		opts?: { tooltipSuffix?: string }
	): LanguageModelChatInformation[] {
		const infos: LanguageModelChatInformation[] = [];

		for (const m of models) {
			// For all providers (ChatGLM and custom), create simple entries without variants
			const contextLen = provider.defaultContextLength;
			const maxOutput = provider.defaultMaxTokens;
			const maxInput = Math.max(1, contextLen - maxOutput);

			const tooltipBase = `${provider.name}`;
			const tooltip = opts?.tooltipSuffix ? `${tooltipBase} — ${opts.tooltipSuffix}` : tooltipBase;

			infos.push({
				id: `${provider.id}:${m.id}`,
				name: `${m.id} (${provider.name})`,
				tooltip,
				family: provider.family,
				version: "1.0.0",
				maxInputTokens: maxInput,
				maxOutputTokens: maxOutput,
				capabilities: {
					toolCalling: true,
					imageInput: false,
				},
			} satisfies LanguageModelChatInformation);
		}

		return infos;
	}

	/**
	 * Fetch the list of models from a provider's API
	 * @param provider Provider configuration
	 * @param apiKey The API key used to authenticate
	 */
	private async fetchModels(
		provider: ProviderConfig,
		apiKey: string
	): Promise<{ models: HFModelItem[] }> {
		const modelsList = (async () => {
			const resp = await fetch(`${provider.baseUrl}/models`, {
				method: "GET",
				headers: { Authorization: `Bearer ${apiKey}`, "User-Agent": this.userAgent },
			});
			if (!resp.ok) {
				let text = "";
				try {
					text = await resp.text();
				} catch (error) {
					console.error(`[ChatGLM Router] Failed to read response text from ${provider.id}`, error);
				}
				const err = new Error(
					`Failed to fetch models from ${provider.name}: ${resp.status} ${resp.statusText}${text ? `\n${text}` : ""}`
				);
				console.error(`[ChatGLM Router] Failed to fetch models from ${provider.id}`, err);
				throw err;
			}
			const parsed = (await resp.json()) as HFModelsResponse;
			return parsed.data ?? [];
		})();

		try {
			const models = await modelsList;
			return { models };
		} catch (err) {
			console.error(`[ChatGLM Router] Failed to fetch models from ${provider.id}`, err);
			throw err;
		}
	}

	/**
	 * Returns the response for a chat request, passing the results to the progress callback.
	 * @param model The language model to use
	 * @param messages The messages to include in the request
	 * @param options Options for the request
	 * @param progress The progress to emit the streamed response chunks to
	 * @param token A cancellation token for the request
	 */
	async provideLanguageModelChatResponse(
		model: LanguageModelChatInformation,
		messages: readonly LanguageModelChatMessage[],
		options: LanguageModelChatRequestHandleOptions,
		progress: Progress<LanguageModelResponsePart>,
		token: CancellationToken
	): Promise<void> {

		this._toolCallBuffers.clear();
		this._completedToolCallIndices.clear();
		this._hasEmittedAssistantText = false;
		this._emittedBeginToolCallsHint = false;
		this._textToolParserBuffer = "";
		this._textToolActive = undefined;
		this._emittedTextToolCallKeys.clear();
		this._emittedTextToolCallIds.clear();
		this._outputTokenCount = 0;

		let requestBody: Record<string, unknown> | undefined;
		const trackingProgress: Progress<LanguageModelResponsePart> = {
			report: (part) => {
				try {
					progress.report(part);
				} catch (e) {
					console.error("[ChatGLM Router] Progress.report failed", {
						modelId: model.id,
						error: e instanceof Error ? { name: e.name, message: e.message } : String(e),
					});
				}
			},
		};

		// Detect provider from model ID
		const provider = getProviderByModelId(model.id);

		try {
			const apiKey = await this.ensureApiKey(provider, (options as any).silent ?? false);
			if (!apiKey) {
				throw new Error(`${provider.name} API key not found`);
			}

			const openaiMessages = convertMessages(messages);

			validateRequest(messages);

			const toolConfig = convertTools(options);

			if (options.tools && options.tools.length > 128) {
				throw new Error("Cannot have more than 128 tools per request.");
			}

			const inputTokenCount = this.estimateMessagesTokens(messages);
			const toolTokenCount = this.estimateToolTokens(toolConfig.tools);
			const tokenLimit = Math.max(1, model.maxInputTokens);
			if (inputTokenCount + toolTokenCount > tokenLimit) {
				console.error("[ChatGLM Router] Message exceeds token limit", { total: inputTokenCount + toolTokenCount, tokenLimit });
				throw new Error("Message exceeds token limit.");
			}

			// Extract actual model ID (remove provider prefix)
			const actualModelId = this.extractActualModelId(model.id, provider);

			requestBody = {
				model: actualModelId,
				messages: openaiMessages,
				stream: true,
				max_tokens: Math.min(options.modelOptions?.max_tokens || 4096, model.maxOutputTokens),
				temperature: options.modelOptions?.temperature ?? 0.7,
			};

			// Allow-list model options
			if (options.modelOptions) {
				const mo = options.modelOptions as Record<string, unknown>;
				if (typeof mo.stop === "string" || Array.isArray(mo.stop)) {
					(requestBody as Record<string, unknown>).stop = mo.stop;
				}
				if (typeof mo.frequency_penalty === "number") {
					(requestBody as Record<string, unknown>).frequency_penalty = mo.frequency_penalty;
				}
				if (typeof mo.presence_penalty === "number") {
					(requestBody as Record<string, unknown>).presence_penalty = mo.presence_penalty;
				}
			}

			if (toolConfig.tools) {
				(requestBody as Record<string, unknown>).tools = toolConfig.tools;
			}
			if (toolConfig.tool_choice) {
				(requestBody as Record<string, unknown>).tool_choice = toolConfig.tool_choice;
			}

			const response = await fetch(`${provider.baseUrl}/chat/completions`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${apiKey}`,
					"Content-Type": "application/json",
					"User-Agent": this.userAgent,
				},
				body: JSON.stringify(requestBody),
			});

			if (!response.ok) {
				const errorText = await response.text();
				console.error("[ChatGLM Router] API error response", { provider: provider.id, error: errorText });
				throw new Error(
					`${provider.name} API error: ${response.status} ${response.statusText}${errorText ? `\n${errorText}` : ""}`
				);
			}

			if (!response.body) {
				throw new Error("No response body from API");
			}

			await this.processStreamingResponse(response.body, trackingProgress, token);

			// Record statistics after successful response
			await this.statsManager.recordRequest(
				provider.id,
				model.id,
				inputTokenCount,
				this._outputTokenCount
			);
		} catch (err) {
			console.error("[ChatGLM Router] Chat request failed", {
				provider: provider.id,
				modelId: model.id,
				messageCount: messages.length,
				error: err instanceof Error ? { name: err.name, message: err.message } : String(err),
			});
			throw err;
		}
	}

	/**
	 * Extract actual model ID from prefixed model ID
	 * @param modelId Full model ID with provider prefix
	 * @param provider Provider configuration
	 * @returns Actual model ID for API request
	 */
	private extractActualModelId(modelId: string, provider: ProviderConfig): string {
		const parts = modelId.split(":");
		if (parts.length > 1) {
			// Remove provider prefix if present
			if (parts[0] === provider.id) {
				return parts.slice(1).join(":");
			}
		}
		return modelId;
	}

	/**
	 * Returns the number of tokens for a given text
	 * @param model The language model to use
	 * @param text The text to count tokens for
	 * @param token A cancellation token
	 */
	async provideTokenCount(
		model: LanguageModelChatInformation,
		text: string | LanguageModelChatMessage,
		_token: CancellationToken
	): Promise<number> {
		if (typeof text === "string") {
			return Math.ceil(text.length / 4);
		} else {
			let totalTokens = 0;
			for (const part of text.content) {
				if (part instanceof vscode.LanguageModelTextPart) {
					totalTokens += Math.ceil(part.value.length / 4);
				}
			}
			return totalTokens;
		}
	}

	/**
	 * Ensure an API key exists in SecretStorage for a provider
	 * @param provider Provider configuration
	 * @param silent If true, do not prompt the user
	 */
	private async ensureApiKey(provider: ProviderConfig, silent: boolean): Promise<string | undefined> {
		let apiKey = await this.secrets.get(provider.apiKeySecret);
		if (!apiKey && !silent) {
			const entered = await vscode.window.showInputBox({
				title: `${provider.name} API Key`,
				prompt: `Enter your ${provider.name} API key`,
				ignoreFocusOut: true,
				password: true,
			});
			if (entered && entered.trim()) {
				apiKey = entered.trim();
				await this.secrets.store(provider.apiKeySecret, apiKey);
			}
		}
		return apiKey;
	}

	/**
	 * Read and parse the streaming (SSE-like) response and report parts
	 * @param responseBody The readable stream body
	 * @param progress Progress reporter for streamed parts
	 * @param token Cancellation token
	 */
	private async processStreamingResponse(
		responseBody: ReadableStream<Uint8Array>,
		progress: vscode.Progress<vscode.LanguageModelResponsePart>,
		token: vscode.CancellationToken,
	): Promise<void> {
		const reader = responseBody.getReader();
		const decoder = new TextDecoder();
		let buffer = "";

		try {
			while (!token.isCancellationRequested) {
				const { done, value } = await reader.read();
				if (done) { break; }

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split("\n");
				buffer = lines.pop() || "";

				for (const line of lines) {
					if (!line.startsWith("data: ")) {
						continue;
					}
					const data = line.slice(6);
					if (data === "[DONE]") {
						await this.flushToolCallBuffers(progress, /*throwOnInvalid*/ false);
						await this.flushActiveTextToolCall(progress);
						continue;
					}

					try {
						const parsed = JSON.parse(data);
						await this.processDelta(parsed, progress);
					} catch {
						// Silently ignore malformed SSE lines temporarily
					}
				}
			}
		} finally {
			reader.releaseLock();
			this._toolCallBuffers.clear();
			this._completedToolCallIndices.clear();
			this._hasEmittedAssistantText = false;
			this._emittedBeginToolCallsHint = false;
			this._textToolParserBuffer = "";
			this._textToolActive = undefined;
			this._emittedTextToolCallKeys.clear();
		}
	}

	/**
	 * Handle a single streamed delta chunk, emitting text and tool call parts
	 * @param delta Parsed SSE chunk
	 * @param progress Progress reporter for parts
	 */
	private async processDelta(
		delta: Record<string, unknown>,
		progress: vscode.Progress<vscode.LanguageModelResponsePart>,
	): Promise<boolean> {
		let emitted = false;
		const choice = (delta.choices as Record<string, unknown>[] | undefined)?.[0];
		if (!choice) { return false; }

		const deltaObj = choice.delta as Record<string, unknown> | undefined;

		// report thinking progress if backend provides it and host supports it
		try {
			const maybeThinking = (choice as Record<string, unknown> | undefined)?.thinking ?? (deltaObj as Record<string, unknown> | undefined)?.thinking;
			if (maybeThinking !== undefined) {
				const vsAny = (vscode as unknown as Record<string, unknown>);
				const ThinkingCtor = vsAny["LanguageModelThinkingPart"] as
					| (new (text: string, id?: string, metadata?: unknown) => unknown)
					| undefined;
				if (ThinkingCtor) {
					let text = "";
					let id: string | undefined;
					let metadata: unknown;
					if (maybeThinking && typeof maybeThinking === "object") {
						const mt = maybeThinking as Record<string, unknown>;
						text = typeof mt["text"] === "string" ? (mt["text"] as string) : "";
						id = typeof mt["id"] === "string" ? (mt["id"] as string) : undefined;
						metadata = mt["metadata"];
					} else if (typeof maybeThinking === "string") {
						text = maybeThinking;
					}
					if (text) {
						progress.report(new (ThinkingCtor as new (text: string, id?: string, metadata?: unknown) => unknown)(text, id, metadata) as unknown as vscode.LanguageModelResponsePart);
						emitted = true;
					}
				}
			}
		} catch {
			// ignore errors here temporarily
		}

		if (deltaObj?.content) {
			const content = String(deltaObj.content);
			const res = this.processTextContent(content, progress);
			if (res.emittedText) {
				this._hasEmittedAssistantText = true;
			}
			if (res.emittedAny) {
				emitted = true;
			}
			// Count output tokens (rough estimate)
			this._outputTokenCount += Math.ceil(content.length / 4);
		}

		if (deltaObj?.tool_calls) {
			const toolCalls = deltaObj.tool_calls as Array<Record<string, unknown>>;

			if (!this._emittedBeginToolCallsHint && this._hasEmittedAssistantText && toolCalls.length > 0) {
				progress.report(new vscode.LanguageModelTextPart(" "));
				this._emittedBeginToolCallsHint = true;
			}

			for (const tc of toolCalls) {
				const idx = (tc.index as number) ?? 0;
				if (this._completedToolCallIndices.has(idx)) {
					continue;
				}
				const buf = this._toolCallBuffers.get(idx) ?? { args: "" };
				if (tc.id && typeof tc.id === "string") {
					buf.id = tc.id as string;
				}
				const func = tc.function as Record<string, unknown> | undefined;
				if (func?.name && typeof func.name === "string") {
					buf.name = func.name as string;
				}
				if (typeof func?.arguments === "string") {
					buf.args += func.arguments as string;
					// Count tool call arguments as output tokens
					this._outputTokenCount += Math.ceil((func.arguments as string).length / 4);
				}
				this._toolCallBuffers.set(idx, buf);
				await this.tryEmitBufferedToolCall(idx, progress);
			}
		}

		const finish = (choice.finish_reason as string | undefined) ?? undefined;
		if (finish === "tool_calls" || finish === "stop") {
			await this.flushToolCallBuffers(progress, /*throwOnInvalid*/ true);
		}
		return emitted;
	}

	/**
	 * Process streamed text content for inline tool-call control tokens
	 */
	private processTextContent(
		input: string,
		progress: vscode.Progress<vscode.LanguageModelResponsePart>,
	): { emittedText: boolean; emittedAny: boolean } {
		const BEGIN = "<|tool_call_begin|>";
		const ARG_BEGIN = "<|tool_call_argument_begin|>";
		const END = "<|tool_call_end|>";

		let data = this._textToolParserBuffer + input;
		let emittedText = false;
		let emittedAny = false;
		let visibleOut = "";

		while (data.length > 0) {
			if (!this._textToolActive) {
				const b = data.indexOf(BEGIN);
				if (b === -1) {
					const longestPartialPrefix = ((): number => {
						for (let k = Math.min(BEGIN.length - 1, data.length - 1); k > 0; k--) {
							if (data.endsWith(BEGIN.slice(0, k))) { return k; }
						}
						return 0;
					})();
					if (longestPartialPrefix > 0) {
						const visible = data.slice(0, data.length - longestPartialPrefix);
						if (visible) { visibleOut += this.stripControlTokens(visible); }
						this._textToolParserBuffer = data.slice(data.length - longestPartialPrefix);
						data = "";
						break;
					} else {
						visibleOut += this.stripControlTokens(data);
						data = "";
						break;
					}
				}
				const pre = data.slice(0, b);
				if (pre) {
					visibleOut += this.stripControlTokens(pre);
				}
				data = data.slice(b + BEGIN.length);

				const a = data.indexOf(ARG_BEGIN);
				const e = data.indexOf(END);
				let delimIdx = -1;
				let delimKind: "arg" | "end" | undefined = undefined;
				if (a !== -1 && (e === -1 || a < e)) { delimIdx = a; delimKind = "arg"; }
				else if (e !== -1) { delimIdx = e; delimKind = "end"; }
				else {
					this._textToolParserBuffer = BEGIN + data;
					data = "";
					break;
				}

				const header = data.slice(0, delimIdx).trim();
				const m = header.match(/^([A-Za-z0-9_\-.]+)(?::(\d+))?/);
				const name = m?.[1] ?? undefined;
				const index = m?.[2] ? Number(m?.[2]) : undefined;
				this._textToolActive = { name, index, argBuffer: "", emitted: false };
				if (delimKind === "arg") {
					data = data.slice(delimIdx + ARG_BEGIN.length);
				} else {
					data = data.slice(delimIdx + END.length);
					const did = this.emitTextToolCallIfValid(progress, this._textToolActive, "{}");
					if (did) {
						this._textToolActive.emitted = true;
						emittedAny = true;
					}
					this._textToolActive = undefined;
				}
				continue;
			}

			const e2 = data.indexOf(END);
			if (e2 === -1) {
				this._textToolActive.argBuffer += data;
				if (!this._textToolActive.emitted) {
					const did = this.emitTextToolCallIfValid(progress, this._textToolActive, this._textToolActive.argBuffer);
					if (did) {
						this._textToolActive.emitted = true;
						emittedAny = true;
					}
				}
				data = "";
				break;
			} else {
				this._textToolActive.argBuffer += data.slice(0, e2);
				data = data.slice(e2 + END.length);
				if (!this._textToolActive.emitted) {
					const did = this.emitTextToolCallIfValid(progress, this._textToolActive, this._textToolActive.argBuffer);
					if (did) {
						emittedAny = true;
					}
				}
				this._textToolActive = undefined;
				continue;
			}
		}

		const textToEmit = visibleOut;
		if (textToEmit && textToEmit.length > 0) {
			progress.report(new vscode.LanguageModelTextPart(textToEmit));
			emittedText = true;
			emittedAny = true;
		}

		this._textToolParserBuffer = data;

		return { emittedText, emittedAny };
	}

	private emitTextToolCallIfValid(
		progress: vscode.Progress<vscode.LanguageModelResponsePart>,
		call: { name?: string; index?: number; argBuffer: string; emitted?: boolean },
		argText: string,
	): boolean {
		const name = call.name ?? "unknown_tool";
		const parsed = tryParseJSONObject(argText);
		if (!parsed.ok) {
			return false;
		}
		const canonical = JSON.stringify(parsed.value);
		const key = `${name}:${canonical}`;
		if (typeof call.index === "number") {
			const idKey = `${name}:${call.index}`;
			if (this._emittedTextToolCallIds.has(idKey)) {
				return false;
			}
			this._emittedTextToolCallIds.add(idKey);
		} else if (this._emittedTextToolCallKeys.has(key)) {
			return false;
		}
		this._emittedTextToolCallKeys.add(key);
		const id = `tct_${Math.random().toString(36).slice(2, 10)}`;
		progress.report(new vscode.LanguageModelToolCallPart(id, name, parsed.value));
		return true;
	}

	private async flushActiveTextToolCall(
		progress: vscode.Progress<vscode.LanguageModelResponsePart>,
	): Promise<void> {
		if (!this._textToolActive) {
			return;
		}
		const argText = this._textToolActive.argBuffer;
		const parsed = tryParseJSONObject(argText);
		if (!parsed.ok) {
			return;
		}
		this.emitTextToolCallIfValid(progress, this._textToolActive, argText);
		this._textToolActive = undefined;
	}

	private async tryEmitBufferedToolCall(
		index: number,
		progress: vscode.Progress<vscode.LanguageModelResponsePart>
	): Promise<void> {
		const buf = this._toolCallBuffers.get(index);
		if (!buf) {
			return;
		}
		if (!buf.name) {
			return;
		}
		const canParse = tryParseJSONObject(buf.args);
		if (!canParse.ok) {
			return;
		}
		const id = buf.id ?? `call_${Math.random().toString(36).slice(2, 10)}`;
		const parameters = canParse.value;
		try {
			const canonical = JSON.stringify(parameters);
			this._emittedTextToolCallKeys.add(`${buf.name}:${canonical}`);
		} catch { /* ignore */ }
		progress.report(new vscode.LanguageModelToolCallPart(id, buf.name, parameters));
		this._toolCallBuffers.delete(index);
		this._completedToolCallIndices.add(index);
	}

	private async flushToolCallBuffers(
		progress: vscode.Progress<vscode.LanguageModelResponsePart>,
		throwOnInvalid: boolean,
	): Promise<void> {
		if (this._toolCallBuffers.size === 0) {
			return;
		}
		for (const [idx, buf] of Array.from(this._toolCallBuffers.entries())) {
			const parsed = tryParseJSONObject(buf.args);
			if (!parsed.ok) {
				if (throwOnInvalid) {
					console.error("[ChatGLM Router] Invalid JSON for tool call", { idx, snippet: (buf.args || "").slice(0, 200) });
					throw new Error("Invalid JSON for tool call");
				}
				continue;
			}
			const id = buf.id ?? `call_${Math.random().toString(36).slice(2, 10)}`;
			const name = buf.name ?? "unknown_tool";
			try {
				const canonical = JSON.stringify(parsed.value);
				this._emittedTextToolCallKeys.add(`${name}:${canonical}`);
			} catch { /* ignore */ }
			progress.report(new vscode.LanguageModelToolCallPart(id, name, parsed.value));
			this._toolCallBuffers.delete(idx);
			this._completedToolCallIndices.add(idx);
		}
	}

	/** Strip provider control tokens from streamed text */
	private stripControlTokens(text: string): string {
		try {
			return text
				.replace(/<\|[a-zA-Z0-9_-]+_section_(?:begin|end)\|>/g, "")
				.replace(/<\|tool_call_(?:argument_)?(?:begin|end)\|>/g, "");
		} catch {
			return text;
		}
	}
}
