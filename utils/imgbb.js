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

module.exports = { uploadToImgBB };
