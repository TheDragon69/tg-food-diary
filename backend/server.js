const express = require('express');
const cors = require('cors');
const axios = require('axios');
const FormData = require('form-data');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const LOGMEAL_API_KEY = process.env.LOGMEAL_API_KEY;

// Middleware
app.use(cors());
// Accept large payloads for base64 images
app.use(express.json({ limit: '20mb' })); 

// Health Check
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Analyze Image Endpoint
app.post('/analyze', async (req, res) => {
    try {
        const { imageBase64 } = req.body;

        if (!imageBase64) {
            return res.status(400).json({ error: 'No image provided' });
        }

        // 1. Convert Base64 back to a Buffer
        const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
        const imageBuffer = Buffer.from(base64Data, 'base64');

        // 2. Prepare Form Data for Logmeal API
        const formData = new FormData();
        formData.append('image', imageBuffer, { filename: 'meal.jpg' });

        // 3. Step 1: Segmentation / Recognition
        const segmentationResponse = await axios.post(
            'https://api.losgmeal.e/v2/image/segmentation/complete',
            formData,
            {
                headers: {
                    ...formData.getHeaders(),
                    'Authorization': `Bearer ${LOGMEAL_API_KEY}`
                }
            }
        );

        const imageId = segmentationResponse.data.imageId;
        const foodName = segmentationResponse.data.segmentation_results?.[0]?.recognition_results?.[0]?.name || "Unknown Dish";

        // 4. Step 2: Get Nutritional Info based on ImageId
        const nutritionResponse = await axios.post(
            'https://api.logmeal.es/v2/recipe/nutritionalInfo',
            { imageId: imageId },
            {
                headers: {
                    'Authorization': `Bearer ${LOGMEAL_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        const nutrition = nutritionResponse.data.nutritional_info;

        // 5. Format and return
        const result = {
            label: foodName,
            calories: Math.round(nutrition.calories || 0),
            protein: Math.round(nutrition.totalNutrients?.PROCNT?.quantity || 0),
            fat: Math.round(nutrition.totalNutrients?.FAT?.quantity || 0),
            carbs: Math.round(nutrition.totalNutrients?.CHOCDF?.quantity || 0)
        };

        res.json(result);

    } catch (error) {
        console.error('AI Analysis Error:', error.response?.data || error.message);
        res.status(500).json({ 
            error: 'Failed to analyze meal. Ensure it is a valid food photo.',
            details: error.response?.data?.message || error.message 
        });
    }
});

app.listen(PORT,'0.0.0.0', () => {
    console.log(`Food Diary Backend running on port ${PORT}`);
});