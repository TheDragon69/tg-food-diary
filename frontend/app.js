// --- Telegram Initialization ---
const tg = window.Telegram.WebApp;
tg.expand();
tg.ready();

// Config: Change this to your deployed backend URL on Railway/Render
const BACKEND_URL = 'http://localhost:3000'; 

// --- State Management ---
let db = JSON.parse(localStorage.getItem('food_diary_db')) || { meals: [] };
let currentTempMeal = null; // Holds meal data before saving

function saveDb() {
    localStorage.setItem('food_diary_db', JSON.stringify(db));
}

function getTodayStr() {
    return new Date().toLocaleDateString();
}

// --- Navigation Logic ---
document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        
        const targetId = e.target.getAttribute('data-target');
        e.target.classList.add('active');
        
        const targetView = document.getElementById(targetId);
        targetView.classList.remove('hidden');
        targetView.classList.add('active');

        // Trigger renders
        if(targetId === 'view-today') renderToday();
        if(targetId === 'view-history') renderHistory();
    });
});

// --- Utility Functions ---
function showToast(message, isError = false) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.style.background = isError ? '#ff3b30' : '#34c759';
    toast.style.display = 'block';
    toast.style.opacity = '1';
    
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.style.display = 'none', 300);
    }, 3000);
}

function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        let r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// Compress and convert image to Base64
function processImage(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 800;
                const scaleSize = MAX_WIDTH / img.width;
                canvas.width = MAX_WIDTH;
                canvas.height = img.height * scaleSize;
                
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', 0.7)); // Compress to 70% quality
            };
        };
    });
}

// --- Add Meal Logic ---
const cameraInput = document.getElementById('camera-input');
const imagePreview = document.getElementById('image-preview');
const uploadBtn = document.getElementById('upload-btn');
const skeleton = document.getElementById('loading-skeleton');
const analysisResult = document.getElementById('analysis-result');
const portionSlider = document.getElementById('portion-slider');

cameraInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Show preview
    const base64Image = await processImage(file);
    imagePreview.src = base64Image;
    imagePreview.classList.remove('hidden');
    uploadBtn.classList.add('hidden');
    
    // UI states
    analysisResult.classList.add('hidden');
    skeleton.classList.remove('hidden');

    try {
        const response = await fetch(`${BACKEND_URL}/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageBase64: base64Image })
        });

        if (!response.ok) throw new Error('API Error');
        const data = await response.json();

        // Store temporarily
        currentTempMeal = {
            id: uuidv4(),
            timestamp: new Date().toISOString(),
            photo_base64_thumb: base64Image,
            label: data.label,
            base_calories: data.calories,
            base_protein: data.protein,
            base_fat: data.fat,
            base_carbs: data.carbs,
            portion_multiplier: 1.0,
            // Calculated values
            calories: data.calories,
            protein: data.protein,
            fat: data.fat,
            carbs: data.carbs
        };

        updateMacroUI();
        skeleton.classList.add('hidden');
        analysisResult.classList.remove('hidden');

    } catch (err) {
        skeleton.classList.add('hidden');
        imagePreview.classList.add('hidden');
        uploadBtn.classList.remove('hidden');
        showToast('Failed to analyze image. Try again.', true);
    }
});

// Portion slider listener
portionSlider.addEventListener('input', (e) => {
    const mult = parseFloat(e.target.value);
    document.getElementById('portion-val').textContent = mult.toFixed(1);
    
    if (currentTempMeal) {
        currentTempMeal.portion_multiplier = mult;
        currentTempMeal.calories = Math.round(currentTempMeal.base_calories * mult);
        currentTempMeal.protein = Math.round(currentTempMeal.base_protein * mult);
        currentTempMeal.fat = Math.round(currentTempMeal.base_fat * mult);
        currentTempMeal.carbs = Math.round(currentTempMeal.base_carbs * mult);
        updateMacroUI();
    }
});

function updateMacroUI() {
    document.getElementById('result-label').textContent = currentTempMeal.label;
    document.getElementById('res-cal').textContent = currentTempMeal.calories;
    document.getElementById('res-pro').textContent = currentTempMeal.protein + 'g';
    document.getElementById('res-fat').textContent = currentTempMeal.fat + 'g';
    document.getElementById('res-car').textContent = currentTempMeal.carbs + 'g';
}

document.getElementById('btn-save-meal').addEventListener('click', () => {
    if (!currentTempMeal) return;
    db.meals.push(currentTempMeal);
    saveDb();
    showToast('Meal saved successfully!');
    
    // Reset Add View
    currentTempMeal = null;
    imagePreview.src = '';
    imagePreview.classList.add('hidden');
    uploadBtn.classList.remove('hidden');
    analysisResult.classList.add('hidden');
    portionSlider.value = 1;
    document.getElementById('portion-val').textContent = '1.0';
    
    // Navigate to Today
    document.querySelector('[data-target="view-today"]').click();
});

// --- Render Logic (Today & History) ---
function renderToday() {
    const todayStr = getTodayStr();
    const todayMeals = db.meals.filter(m => new Date(m.timestamp).toLocaleDateString() === todayStr);
    
    let tCal = 0, tPro = 0, tFat = 0, tCar = 0;
    
    const listEl = document.getElementById('today-meals-list');
    listEl.innerHTML = '';

    todayMeals.forEach(meal => {
        tCal += meal.calories; tPro += meal.protein; tFat += meal.fat; tCar += meal.carbs;
        listEl.appendChild(createMealDOM(meal));
    });

    // Update Ring and Texts
    document.getElementById('tot-cal').textContent = tCal;
    document.getElementById('tot-pro').textContent = tPro;
    document.getElementById('tot-fat').textContent = tFat;
    document.getElementById('tot-car').textContent = tCar;

    // Daily Calorie Goal (Assume 2000 for standard)
    const goal = 2000;
    const percent = Math.min((tCal / goal) * 100, 100);
    document.getElementById('ring-cal').setAttribute('stroke-dasharray', `${percent}, 100`);
}

function renderHistory() {
    const listEl = document.getElementById('history-meals-list');
    listEl.innerHTML = '';
    
    // Sort descending
    const sorted = [...db.meals].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    sorted.forEach(meal => {
        listEl.appendChild(createMealDOM(meal));
    });
}

function createMealDOM(meal) {
    const wrapper = document.createElement('div');
    wrapper.className = 'meal-item-wrapper';

    const timeStr = new Date(meal.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

    wrapper.innerHTML = `
        <button class="delete-btn" data-id="${meal.id}">Delete</button>
        <div class="meal-item">
            <img src="${meal.photo_base64_thumb}" class="meal-thumb">
            <div class="meal-info">
                <div class="meal-name">${meal.label} <span style="font-weight:normal; font-size:12px; color:var(--hint-color)">(${timeStr})</span></div>
                <div class="meal-macros">${meal.calories} kcal • P:${meal.protein}g F:${meal.fat}g C:${meal.carbs}g</div>
            </div>
        </div>
    `;

    // Swipe to delete logic
    const item = wrapper.querySelector('.meal-item');
    const deleteBtn = wrapper.querySelector('.delete-btn');
    
    let startX = 0;
    let currentX = 0;

    item.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, {passive: true});
    item.addEventListener('touchmove', e => {
        currentX = e.touches[0].clientX;
        const diff = currentX - startX;
        if (diff < -30) item.classList.add('swiped'); // Swipe Left
        if (diff > 30) item.classList.remove('swiped'); // Swipe Right
    }, {passive: true});

    deleteBtn.addEventListener('click', () => {
        db.meals = db.meals.filter(m => m.id !== meal.id);
        saveDb();
        wrapper.remove();
        renderToday(); // Update totals
        showToast('Meal deleted');
    });

    return wrapper;
}