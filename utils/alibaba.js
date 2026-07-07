const axios = require('axios');

// Singapore (international) region base URL. If you ever switch to a
// Beijing-region key, this must change to https://dashscope.aliyuncs.com/api/v1
// — Beijing and Singapore keys/endpoints are NOT interchangeable.
const BASE_URL = process.env.DASHSCOPE_ENDPOINT || 'https://dashscope-intl.aliyuncs.com/api/v1';

// Qwen-Image / Qwen-Image-Edit models and the newer Wan (2.6+) models are all
// called synchronously through the same "multimodal-generation" endpoint.
const SYNC_MODELS = new Set([
    'qwen-image-2.0-pro',
    'qwen-image-2.0',
    'qwen-image-edit-max',
    'qwen-image-edit-plus',
    'qwen-image-edit',
    'wan2.7-image-pro',
    'wan2.7-image',
    'wan2.6-image'
]);

// Older Wan models use the legacy async image2image task API (submit -> poll).
const ASYNC_IMAGE2IMAGE_MODELS = new Set([
    'wan2.5-i2i-preview'
]);

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Poll a DashScope async task until it succeeds or fails.
 */
async function pollTask(taskId, apiKey, { intervalMs = 5000, timeoutMs = 180000 } = {}) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        const res = await axios.get(`${BASE_URL}/tasks/${taskId}`, {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });

        const status = res.data?.output?.task_status;

        if (status === 'SUCCEEDED') {
            const result = res.data.output.results?.[0];
            if (!result?.url) {
                throw new Error('Task succeeded but no image URL was returned');
            }
            return result.url;
        }

        if (status === 'FAILED' || status === 'UNKNOWN') {
            const reason = res.data?.output?.message || res.data?.message || 'Task failed';
            throw new Error(`DashScope task failed: ${reason}`);
        }

        // PENDING or RUNNING - wait and try again
        await sleep(intervalMs);
    }

    throw new Error('DashScope task timed out waiting for a result');
}

/**
 * Call the synchronous multimodal-generation endpoint (Qwen-Image,
 * Qwen-Image-Edit, and Wan 2.6+ models).
 */
async function generateSync(model, prompt, imageData, negativePrompt, apiKey) {
    const content = [];
    if (imageData) {
        // DashScope expects the full data URI (data:image/png;base64,....)
        // or a public https URL - do NOT strip the "data:...;base64," prefix.
        content.push({ image: imageData });
    }
    content.push({ text: prompt });

    const payload = {
        model,
        input: {
            messages: [{ role: 'user', content }]
        },
        parameters: {
            negative_prompt: negativePrompt || undefined,
            watermark: false,
            n: 1
        }
    };

    const res = await axios.post(
        `${BASE_URL}/services/aigc/multimodal-generation/generation`,
        payload,
        {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 120000
        }
    );

    const contentBlocks = res.data?.output?.choices?.[0]?.message?.content;
    const imageBlock = Array.isArray(contentBlocks)
        ? contentBlocks.find(block => block.image)
        : null;

    if (!imageBlock) {
        throw new Error(res.data?.message || 'No image returned from DashScope');
    }

    return imageBlock.image;
}

/**
 * Call the async image2image endpoint for Wan 2.5 image editing (wan2.5-i2i-preview).
 * This model's request schema takes the reference image(s) as an "images" array
 * under input, not the legacy Wan2.1 "function" + "base_image_url" fields.
 */
async function generateAsyncImage2Image(model, prompt, imageData, negativePrompt, apiKey) {
    const createRes = await axios.post(
        `${BASE_URL}/services/aigc/image2image/image-synthesis`,
        {
            model,
            input: {
                prompt,
                images: [imageData]
            },
            parameters: {
                negative_prompt: negativePrompt || undefined,
                n: 1
            }
        },
        {
            headers: {
                'X-DashScope-Async': 'enable',
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 30000
        }
    );

    const taskId = createRes.data?.output?.task_id;
    if (!taskId) {
        throw new Error(createRes.data?.message || 'DashScope did not return a task_id');
    }

    return pollTask(taskId, apiKey);
}

/**
 * Generate (or edit) an image using Alibaba Cloud Model Studio / DashScope.
 * @param {string} model - Model name selected in the UI
 * @param {string} prompt - The prompt text
 * @param {string} imageData - Base64 data URI for image-editing models (optional)
 * @param {string} negativePrompt - Negative prompt (optional)
 * @param {number} guidanceScale - Currently unused by DashScope image APIs, kept for compatibility
 * @param {number} steps - Currently unused by DashScope image APIs, kept for compatibility
 * @returns {Promise<{imageUrl: string}>}
 */
async function generateImage(model, prompt, imageData, negativePrompt = null, guidanceScale = 7.5, steps = 30) {
    const apiKey = process.env.DASHSCOPE_API_KEY;
    const selectedModel = model || 'qwen-image-2.0-pro';

    if (!apiKey) {
        console.warn('DASHSCOPE_API_KEY not configured, using mock generation');
        return mockGenerateImage(prompt);
    }

    if (SYNC_MODELS.has(selectedModel)) {
        const imageUrl = await generateSync(selectedModel, prompt, imageData, negativePrompt, apiKey);
        return { imageUrl };
    }

    if (ASYNC_IMAGE2IMAGE_MODELS.has(selectedModel)) {
        const imageUrl = await generateAsyncImage2Image(selectedModel, prompt, imageData, negativePrompt, apiKey);
        return { imageUrl };
    }

    throw new Error(`Unknown model "${selectedModel}" - not mapped to a DashScope endpoint`);
}

/**
 * Mock image generation for local testing when no API key is configured.
 * Uses picsum.photos (a working, actively maintained placeholder service) -
 * via.placeholder.com was discontinued in 2023 and no longer resolves.
 */
function mockGenerateImage(prompt) {
    const seed = Math.floor(Math.random() * 1000);
    const placeholderUrl = `https://picsum.photos/seed/${seed}/800/600`;

    console.log(`Mock generated image for prompt: "${prompt.substring(0, 50)}..."`);

    return {
        imageUrl: placeholderUrl,
        isMock: true
    };
}

module.exports = { generateImage };
