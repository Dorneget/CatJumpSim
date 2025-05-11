// Design Constants (based on original fixed values)
const DESIGN_CANVAS_WIDTH = 800;
const DESIGN_CANVAS_HEIGHT = 500;
const INITIAL_PIXELS_PER_METER = 30;

// Metric Constants for simulation objects
const GRAVITY = 9.81; // m/s^2
const CAT_RADIUS_METERS = 0.2;
const GROUND_HEIGHT_METERS = 1.0; // Equivalent to 30px at INITIAL_PIXELS_PER_METER
const LEDGE_WIDTH_METERS = 50 / INITIAL_PIXELS_PER_METER; // Approx 1.67m
const LEDGE_X_OFFSET_METERS = 0; // Ledge starts from the left edge of canvas in terms of world space

const SIM_TIME_STEP = 0.016; // Simulation time step per animation frame (s)
const CRITICAL_FALL_HEIGHT_METERS = 7.0;

// Colors
const LEDGE_COLOR = '#795548';
const CAT_COLOR = '#FF9800';
const DANGER_CAT_COLOR = '#FF0000';
const GROUND_COLOR = '#4CAF50';

// DOM Elements
const canvas = document.getElementById('simulationCanvas');
const ctx = canvas.getContext('2d');

const ledgeHeightSlider = document.getElementById('ledgeHeight');
const launchSpeedSlider = document.getElementById('launchSpeed');
const launchAngleSlider = document.getElementById('launchAngle');

const ledgeHeightValueSpan = document.getElementById('ledgeHeightValue');
const launchSpeedValueSpan = document.getElementById('launchSpeedValue');
const launchAngleValueSpan = document.getElementById('launchAngleValue');

const simulateButton = document.getElementById('simulateButton');
const resetButton = document.getElementById('resetButton');

const resultRangeSpan = document.getElementById('resultRange');
const resultMaxHeightSpan = document.getElementById('resultMaxHeight');
const resultTimeOfFlightSpan = document.getElementById('resultTimeOfFlight');

const safetyAdvisoryPanelDiv = document.getElementById('safetyAdvisoryPanelDiv');
const safetyAdvisoryMessageElement = document.getElementById('safetyAdvisoryMessage');

// Dynamic Viewport & Scaling Variables
let DESIGN_ASPECT_RATIO = DESIGN_CANVAS_WIDTH / DESIGN_CANVAS_HEIGHT;
let DESIGN_WORLD_WIDTH_METERS = DESIGN_CANVAS_WIDTH / INITIAL_PIXELS_PER_METER;

let currentPixelsPerMeter = INITIAL_PIXELS_PER_METER;
let currentCatRadiusPx = CAT_RADIUS_METERS * currentPixelsPerMeter;
let currentGroundHeightPx = GROUND_HEIGHT_METERS * currentPixelsPerMeter;
let currentLedgeWidthPx = LEDGE_WIDTH_METERS * currentPixelsPerMeter;
let currentLedgeXOffsetPx = LEDGE_X_OFFSET_METERS * currentPixelsPerMeter;


// Simulation State
let animationFrameId = null;
let simTime = 0;
let catPath = [];

let currentLedgeHeight_m = parseFloat(ledgeHeightSlider.value);
let currentLaunchSpeed_mps = parseFloat(launchSpeedSlider.value);
let currentLaunchAngle_deg = parseFloat(launchAngleSlider.value);

// Helper Functions
function degToRad(degrees) {
    return degrees * (Math.PI / 180);
}

function updateSliderValueDisplay(slider, displayElement, unit = '') {
    displayElement.textContent = `${slider.value}${unit}`;
}

// Drawing Functions
function clearCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function drawGround() {
    ctx.fillStyle = GROUND_COLOR;
    ctx.fillRect(0, canvas.height - currentGroundHeightPx, canvas.width, currentGroundHeightPx);
}

function drawLedge(ledgeHeight_m) {
    const ledgeHeight_px = ledgeHeight_m * currentPixelsPerMeter;
    const ledgeY_px = canvas.height - currentGroundHeightPx - ledgeHeight_px;

    ctx.fillStyle = LEDGE_COLOR;
    ctx.fillRect(currentLedgeXOffsetPx, ledgeY_px, currentLedgeWidthPx, ledgeHeight_px);
}

function drawCat(catCanvasX, catCanvasY, color) {
    ctx.beginPath();
    ctx.arc(catCanvasX, catCanvasY, currentCatRadiusPx, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.closePath();
}

function drawTrajectory(points) {
    if (points.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.closePath();
}

// Feline Safety Module Logic
function assessFallSafety(fall_height_m) {
    const isAdverseEvent = fall_height_m > CRITICAL_FALL_HEIGHT_METERS;
    let outcomeMessage;

    if (isAdverseEvent) {
        outcomeMessage = `ALERT: A fall from ${fall_height_m.toFixed(1)} meters exceeds the critical safety threshold of ${CRITICAL_FALL_HEIGHT_METERS.toFixed(1)} meters. This height presents a high risk of severe injury or fatality to the cat.`;
    } else {
        outcomeMessage = `NOTICE: A fall from ${fall_height_m.toFixed(1)} meters is below the critical safety threshold. While the immediate risk of severe injury is lower, all falls can potentially cause harm. Monitor the cat.`;
    }
    return { isAdverseEvent, outcomeMessage };
}

function displaySafetyAdvisory(safetyInfo) {
    safetyAdvisoryMessageElement.textContent = safetyInfo.outcomeMessage;
    safetyAdvisoryPanelDiv.classList.remove('adverse-event', 'notice-event');
    if (safetyInfo.isAdverseEvent) {
        safetyAdvisoryPanelDiv.classList.add('adverse-event');
    } else {
        safetyAdvisoryPanelDiv.classList.add('notice-event');
    }
}

// Physics and Simulation Logic
function calculateInitialVelocities(speed_mps, angle_deg) {
    const angle_rad = degToRad(angle_deg);
    const vx0 = speed_mps * Math.cos(angle_rad);
    const vy0 = speed_mps * Math.sin(angle_rad);
    return { vx0, vy0 };
}

function resetResultsDisplay() {
    resultRangeSpan.textContent = '--';
    resultMaxHeightSpan.textContent = '--';
    resultTimeOfFlightSpan.textContent = '--';
    safetyAdvisoryMessageElement.textContent = '';
    safetyAdvisoryPanelDiv.className = 'safety-advisory-panel';
}

function displayResults(range_m, maxHeight_m, timeOfFlight_s) {
    resultRangeSpan.textContent = range_m.toFixed(2);
    resultMaxHeightSpan.textContent = maxHeight_m.toFixed(2);
    resultTimeOfFlightSpan.textContent = timeOfFlight_s.toFixed(2);
}

// Viewport Management
function redrawInitialSceneState() {
    clearCanvas();
    drawGround();
    drawLedge(currentLedgeHeight_m);
    const launchPointCanvasX = currentLedgeXOffsetPx + currentLedgeWidthPx;
    const launchPointCanvasY = canvas.height - currentGroundHeightPx - (currentLedgeHeight_m * currentPixelsPerMeter);
    drawCat(launchPointCanvasX, launchPointCanvasY, CAT_COLOR);
}

function handleResize() {
    const screenWidth = window.innerWidth;
    // Use clientHeight of documentElement for more reliable viewport height
    const screenHeight = document.documentElement.clientHeight; 
    
    const simulationAreaWrapper = document.querySelector('.simulation-area-wrapper');
    const availableWidth = simulationAreaWrapper.clientWidth;
    const availableHeight = simulationAreaWrapper.clientHeight;

    let newCanvasWidth, newCanvasHeight;
    const screenAspectRatio = availableWidth / availableHeight;

    if (screenAspectRatio > DESIGN_ASPECT_RATIO) { // Screen is wider than design (pillarbox)
        newCanvasHeight = availableHeight;
        newCanvasWidth = newCanvasHeight * DESIGN_ASPECT_RATIO;
    } else { // Screen is taller or same aspect ratio (letterbox)
        newCanvasWidth = availableWidth;
        newCanvasHeight = newCanvasWidth / DESIGN_ASPECT_RATIO;
    }

    canvas.width = newCanvasWidth;
    canvas.height = newCanvasHeight;

    currentPixelsPerMeter = canvas.width / DESIGN_WORLD_WIDTH_METERS;
    currentCatRadiusPx = CAT_RADIUS_METERS * currentPixelsPerMeter;
    currentGroundHeightPx = GROUND_HEIGHT_METERS * currentPixelsPerMeter;
    currentLedgeWidthPx = LEDGE_WIDTH_METERS * currentPixelsPerMeter;
    currentLedgeXOffsetPx = LEDGE_X_OFFSET_METERS * currentPixelsPerMeter;

    if (!animationFrameId) {
        redrawInitialSceneState();
    }
    // If animation is running, the next frame will use new dimensions/scales
}

function setupViewport() {
    handleResize(); // Initial call
    window.addEventListener('resize', handleResize);
    // orientationchange is often covered by resize, but can be added for robustness if needed
    // window.addEventListener('orientationchange', handleResize);
}


// Core Simulation Control
function animationLoop() {
    simTime += SIM_TIME_STEP;

    const { vx0, vy0 } = calculateInitialVelocities(currentLaunchSpeed_mps, currentLaunchAngle_deg);
    const x_displacement_m = vx0 * simTime;
    const y_displacement_m = vy0 * simTime - 0.5 * GRAVITY * simTime * simTime;
    const catAbsoluteY_m = currentLedgeHeight_m + y_displacement_m;

    const launchPointCanvasX = currentLedgeXOffsetPx + currentLedgeWidthPx;
    const launchPointCanvasY = canvas.height - currentGroundHeightPx - (currentLedgeHeight_m * currentPixelsPerMeter);
    
    const catCanvasX = launchPointCanvasX + (x_displacement_m * currentPixelsPerMeter);
    const catCanvasY = launchPointCanvasY - (y_displacement_m * currentPixelsPerMeter);

    catPath.push({ x: catCanvasX, y: catCanvasY });

    clearCanvas();
    drawGround();
    drawLedge(currentLedgeHeight_m);
    drawTrajectory(catPath);
    drawCat(catCanvasX, catCanvasY, CAT_COLOR);

    const groundSurfaceCanvasY = canvas.height - currentGroundHeightPx;
    if (catCanvasY + currentCatRadiusPx >= groundSurfaceCanvasY || catAbsoluteY_m - CAT_RADIUS_METERS <= 0) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
        simulateButton.disabled = false;

        const totalTimeOfFlight = simTime;
        const actualRange_m = vx0 * totalTimeOfFlight;
        
        let maxSimHeightAboveGround = currentLedgeHeight_m;
        for(let t_step = 0; t_step <= totalTimeOfFlight; t_step += SIM_TIME_STEP) {
            const y_disp_step = vy0 * t_step - 0.5 * GRAVITY * t_step * t_step;
            const h_step = currentLedgeHeight_m + y_disp_step;
            if (h_step > maxSimHeightAboveGround) {
                maxSimHeightAboveGround = h_step;
            }
        }
        maxSimHeightAboveGround = Math.max(0, maxSimHeightAboveGround);

        const safetyInfo = assessFallSafety(maxSimHeightAboveGround);
        displaySafetyAdvisory(safetyInfo);
        displayResults(actualRange_m, maxSimHeightAboveGround, totalTimeOfFlight);

        clearCanvas();
        drawGround();
        drawLedge(currentLedgeHeight_m);
        drawTrajectory(catPath);
        drawCat(catCanvasX, catCanvasY, safetyInfo.isAdverseEvent ? DANGER_CAT_COLOR : CAT_COLOR);
        return;
    }
    
    if (catCanvasX > canvas.width + currentCatRadiusPx * 5 || catCanvasX < -currentCatRadiusPx * 5) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
        simulateButton.disabled = false;
        resetResultsDisplay();
        safetyAdvisoryMessageElement.textContent = 'Cat flew off-screen. Simulation stopped.';
        safetyAdvisoryPanelDiv.className = 'safety-advisory-panel notice-event';
        return;
    }

    animationFrameId = requestAnimationFrame(animationLoop);
}

function startSimulation() {
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
    }
    simTime = 0;
    catPath = [];
    resetResultsDisplay();

    currentLedgeHeight_m = parseFloat(ledgeHeightSlider.value);
    currentLaunchSpeed_mps = parseFloat(launchSpeedSlider.value);
    currentLaunchAngle_deg = parseFloat(launchAngleSlider.value);

    simulateButton.disabled = true;
    redrawInitialSceneState(); // Draw initial state before starting animation
    animationFrameId = requestAnimationFrame(animationLoop);
}

function resetSimulation() {
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    simTime = 0;
    catPath = [];

    ledgeHeightSlider.value = "2.0";
    launchSpeedSlider.value = "5.0";
    launchAngleSlider.value = "30";

    updateSliderValueDisplay(ledgeHeightSlider, ledgeHeightValueSpan, ' m');
    updateSliderValueDisplay(launchSpeedSlider, launchSpeedValueSpan, ' m/s');
    updateSliderValueDisplay(launchAngleSlider, launchAngleValueSpan, '°');
    
    currentLedgeHeight_m = parseFloat(ledgeHeightSlider.value);
    currentLaunchSpeed_mps = parseFloat(launchSpeedSlider.value);
    currentLaunchAngle_deg = parseFloat(launchAngleSlider.value);

    resetResultsDisplay();
    simulateButton.disabled = false;
    redrawInitialSceneState();
}

// Event Listeners
ledgeHeightSlider.addEventListener('input', () => {
    updateSliderValueDisplay(ledgeHeightSlider, ledgeHeightValueSpan, ' m');
    currentLedgeHeight_m = parseFloat(ledgeHeightSlider.value);
    if (!animationFrameId) {
        redrawInitialSceneState();
        resetResultsDisplay(); 
    }
});

launchSpeedSlider.addEventListener('input', () => {
    updateSliderValueDisplay(launchSpeedSlider, launchSpeedValueSpan, ' m/s');
    currentLaunchSpeed_mps = parseFloat(launchSpeedSlider.value);
});

launchAngleSlider.addEventListener('input', () => {
    updateSliderValueDisplay(launchAngleSlider, launchAngleValueSpan, '°');
    currentLaunchAngle_deg = parseFloat(launchAngleSlider.value);
});

simulateButton.addEventListener('click', startSimulation);
resetButton.addEventListener('click', resetSimulation);

// Initialization
function init() {
    // Calculate design constants based on initial values
    DESIGN_ASPECT_RATIO = DESIGN_CANVAS_WIDTH / DESIGN_CANVAS_HEIGHT;
    DESIGN_WORLD_WIDTH_METERS = DESIGN_CANVAS_WIDTH / INITIAL_PIXELS_PER_METER;

    // Initialize dynamic pixel values based on initial constants
    currentPixelsPerMeter = INITIAL_PIXELS_PER_METER;
    currentCatRadiusPx = CAT_RADIUS_METERS * currentPixelsPerMeter;
    currentGroundHeightPx = GROUND_HEIGHT_METERS * currentPixelsPerMeter;
    currentLedgeWidthPx = LEDGE_WIDTH_METERS * currentPixelsPerMeter;
    currentLedgeXOffsetPx = LEDGE_X_OFFSET_METERS * currentPixelsPerMeter;
    
    setupViewport(); // This will call handleResize once to set initial canvas size

    updateSliderValueDisplay(ledgeHeightSlider, ledgeHeightValueSpan, ' m');
    updateSliderValueDisplay(launchSpeedSlider, launchSpeedValueSpan, ' m/s');
    updateSliderValueDisplay(launchAngleSlider, launchAngleValueSpan, '°');

    resetSimulation(); // Set initial state and draw
}

init();
