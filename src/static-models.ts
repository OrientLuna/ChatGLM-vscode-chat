/**
 * Static fallback model list for ChatGLM
 *
 * USER DECISION: Leave static model list empty.
 * Use API to fetch all models to ensure we always have the latest models (including GLM-4.7).
 */

import type { HFModelItem } from "./types";

/**
 * Static list of ChatGLM models as fallback
 *
 * NOTE: Currently empty - models are fetched from the API endpoint
 * to ensure we always have the latest available models.
 */
export const STATIC_CHATGLM_MODELS: HFModelItem[] = [];

/**
 * Get static models for a provider
 * @param providerId Provider identifier
 * @returns Empty array - models are fetched from API
 */
export function getStaticModelsForProvider(providerId: string): HFModelItem[] {
	// Return empty array - let the API fetch the latest models
	console.log(`[ChatGLM Router] No static models for ${providerId}, will fetch from API`);
	return [];
}
