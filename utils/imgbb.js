const axios = require('axios');
const FormData = require('form-data');

/**
 * Upload an image to ImgBB
 * @param {Buffer|string} imageData - Image buffer or base64 string
 * @param {string} apiKey - ImgBB API key from environment
 * @returns {Promise<string>} - URL of uploaded image
 */
async function uploadToImgBB(imageData, apiKey) {
    try {
        const formData = new FormData();
        
        // If imageData is a buffer, convert to base64
        let imageBase64;
        if (Buffer.isBuffer(imageData)) {
            imageBase64 = imageData.toString('base64');
        } else if (typeof imageData === 'string' && imageData.startsWith('data:image')) {
            // If it's a data URL, extract the base64 part
            imageBase64 = imageData.split(',')[1];
        } else {
            imageBase64 = imageData;
        }
        
        formData.append('key', apiKey);
        formData.append('image', imageBase64);
        
        const response = await axios.post('https://api.imgbb.com/1/upload', formData, {
            headers: formData.getHeaders()
        });
        
        if (response.data && response.data.success) {
            return response.data.data.url;
        } else {
            throw new Error(response.data.error?.message || 'ImgBB upload failed');
        }
    } catch (error) {
        console.error('ImgBB upload error:', error.message);
        throw new Error(`Failed to upload to ImgBB: ${error.message}`);
    }
}

/**
 * Persist a generated image permanently on ImgBB.
 *
 * DashScope (Alibaba) image URLs are hosted on temporary OSS storage and
 * expire (typically within 24 hours), so anything we want users to be able
 * to come back and download later needs to be re-hosted somewhere durable.
 *
 * Accepts either a remote https URL (the common case for DashScope results)
 * or a base64 data URI, downloads/decodes the bytes as needed, and re-uploads
 * them to ImgBB.
 *
 * @param {string} imageUrlOrDataUri - The image location returned by the generator
 * @param {string} apiKey - ImgBB API key
 * @returns {Promise<string>} - Permanent ImgBB URL
 */
async function persistImage(imageUrlOrDataUri, apiKey) {
    if (typeof imageUrlOrDataUri === 'string' && imageUrlOrDataUri.startsWith('data:image')) {
        // Already a data URI - uploadToImgBB knows how to strip the prefix.
        return uploadToImgBB(imageUrlOrDataUri, apiKey);
    }

    // Otherwise treat it as a remote URL and download the bytes first.
    const imageResponse = await axios.get(imageUrlOrDataUri, {
        responseType: 'arraybuffer',
        timeout: 60000
    });

    const buffer = Buffer.from(imageResponse.data);
    return uploadToImgBB(buffer, apiKey);
}

module.exports = { uploadToImgBB, persistImage };