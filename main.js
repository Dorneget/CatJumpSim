// Constants
const GRAVITY = 9.81; // m/s^2
const PIXELS_PER_METER = 30; // Scale for drawing
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 500;
const LEDGE_COLOR = '#795548'; // Brown
const CAT_COLOR = '#FF9800'; // Orange
const CAT_RADIUS_METERS = 0.2; // For visual representation
const CAT_RADIUS_PX = CAT_RADIUS_METERS * PIXELS_PER_METER;
const GROUND_COLOR = '#4CAF50'; // Green
const GROUND_HEIGHT_PX = 30;
const LEDGE_X_OFFSET_PX = 0; // Ledge starts from the left edge of canvas
const LEDGE_WIDTH_PX = 50;
const SIM_TIME_STEP = 0.016; // Simulation time step per animation frame (s)

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

// Simulation State
let animationFrameId = null;
let simTime = 0;
let catPath = []; // To store points for drawing trajectory

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
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
}

function drawGround() {
    ctx.fillStyle = GROUND_COLOR;
    ctx.fillRect(0, CANVAS_HEIGHT - GROUND_HEIGHT_PX, CANVAS_WIDTH, GROUND_HEIGHT_PX);
}

function drawLedge(ledgeHeight_m) {
    const ledgeHeight_px = ledgeHeight_m * PIXELS_PER_METER;
    const ledgeY_px = CANVAS_HEIGHT - GROUND_HEIGHT_PX - ledgeHeight_px;

    ctx.fillStyle = LEDGE_COLOR;
    ctx.fillRect(LEDGE_X_OFFSET_PX, ledgeY_px, LEDGE_WIDTH_PX, ledgeHeight_px);
}

function drawCat(catCanvasX, catCanvasY) {
    ctx.beginPath();
    ctx.arc(catCanvasX, catCanvasY, CAT_RADIUS_PX, 0, Math.PI * 2);
    ctx.fillStyle = CAT_COLOR;
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

// Physics and Simulation Logic
function calculateInitialVelocities(speed_mps, angle_deg) {
    const angle_rad = degToRad(angle_deg);
    const vx0 = speed_mps * Math.cos(angle_rad);
    const vy0 = speed_mps * Math.sin(angle_rad); // Positive y is upwards in physics model
    return { vx0, vy0 };
}

function resetResultsDisplay() {
    resultRangeSpan.textContent = '--';
    resultMaxHeightSpan.textContent = '--';
    resultTimeOfFlightSpan.textContent = '--';
}

function displayResults(range_m, maxHeight_m, timeOfFlight_s) {
    resultRangeSpan.textContent = range_m.toFixed(2);
    resultMaxHeightSpan.textContent = maxHeight_m.toFixed(2);
    resultTimeOfFlightSpan.textContent = timeOfFlight_s.toFixed(2);
}

function animationLoop() {
    simTime += SIM_TIME_STEP;

    const { vx0, vy0 } = calculateInitialVelocities(currentLaunchSpeed_mps, currentLaunchAngle_deg);

    // Calculate displacement from launch point (physics coordinates, y is up)
    const x_displacement_m = vx0 * simTime;
    const y_displacement_m = vy0 * simTime - 0.5 * GRAVITY * simTime * simTime;

    // Absolute cat position in meters from ground
    const catAbsoluteY_m = currentLedgeHeight_m + y_displacement_m;

    // Convert to canvas coordinates (y is down)
    // Launch point on canvas
    const launchPointCanvasX = LEDGE_X_OFFSET_PX + LEDGE_WIDTH_PX;
    const launchPointCanvasY = CANVAS_HEIGHT - GROUND_HEIGHT_PX - (currentLedgeHeight_m * PIXELS_PER_METER);

    const catCanvasX = launchPointCanvasX + (x_displacement_m * PIXELS_PER_METER);
    // catCanvasY is relative to the top of the canvas.
    // y_displacement_m is positive upwards, so subtract from launchPointCanvasY.
    const catCanvasY = launchPointCanvasY - (y_displacement_m * PIXELS_PER_METER);

    catPath.push({ x: catCanvasX, y: catCanvasY });

    // Drawing
    clearCanvas();
    drawGround();
    drawLedge(currentLedgeHeight_m);
    drawTrajectory(catPath);
    drawCat(catCanvasX, catCanvasY);

    // Check for ground collision (cat's bottom hits ground surface)
    const groundSurfaceCanvasY = CANVAS_HEIGHT - GROUND_HEIGHT_PX;
    if (catCanvasY + CAT_RADIUS_PX >= groundSurfaceCanvasY || catAbsoluteY_m - CAT_RADIUS_METERS <= 0) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
        simulateButton.disabled = false;

        // Final calculations for results
        // Time of flight can be approximated by current simTime or calculated more accurately
        // For simplicity, use simTime when collision detected.
        const totalTimeOfFlight = simTime;
        const actualRange_m = vx0 * totalTimeOfFlight;
        
        let maxReachedHeight_m = currentLedgeHeight_m;
        if (vy0 > 0) {
            maxReachedHeight_m = currentLedgeHeight_m + (vy0 * vy0) / (2 * GRAVITY);
        }
        // If the cat was launched downwards, the max height is the ledge height.
        // Or, iterate through path to find min canvas Y / max physics Y.
        // The formula above is for max height above launch point.
        
        // More accurate max height from path:
        let maxSimHeightAboveGround = currentLedgeHeight_m;
        for(let t_step = 0; t_step <= totalTimeOfFlight; t_step += SIM_TIME_STEP) {
            const y_disp_step = vy0 * t_step - 0.5 * GRAVITY * t_step * t_step;
            const h_step = currentLedgeHeight_m + y_disp_step;
            if (h_step > maxSimHeightAboveGround) {
                maxSimHeightAboveGround = h_step;
            }
        }

        displayResults(actualRange_m, maxSimHeightAboveGround, totalTimeOfFlight);
        return;
    }
    
    // Stop if cat goes way off screen horizontally
    if (catCanvasX > CANVAS_WIDTH + CAT_RADIUS_PX * 5 || catCanvasX < -CAT_RADIUS_PX * 5) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
        simulateButton.disabled = false;
        // Display results based on current simTime if desired, or mark as off-screen
        console.log("Cat flew off-screen horizontally.");
        resetResultsDisplay(); // Or partial results
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

    // Get current values from sliders
    currentLedgeHeight_m = parseFloat(ledgeHeightSlider.value);
    currentLaunchSpeed_mps = parseFloat(launchSpeedSlider.value);
    currentLaunchAngle_deg = parseFloat(launchAngleSlider.value);

    simulateButton.disabled = true;

    // Initial draw before animation starts
    clearCanvas();
    drawGround();
    drawLedge(currentLedgeHeight_m);
    const launchPointCanvasX = LEDGE_X_OFFSET_PX + LEDGE_WIDTH_PX;
    const launchPointCanvasY = CANVAS_HEIGHT - GROUND_HEIGHT_PX - (currentLedgeHeight_m * PIXELS_PER_METER);
    drawCat(launchPointCanvasX, launchPointCanvasY);


    animationFrameId = requestAnimationFrame(animationLoop);
}

function resetSimulation() {
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    simTime = 0;
    catPath = [];

    // Reset sliders to default values
    ledgeHeightSlider.value = "2.0";
    launchSpeedSlider.value = "5.0";
    launchAngleSlider.value = "30";

    // Update display spans
    updateSliderValueDisplay(ledgeHeightSlider, ledgeHeightValueSpan, ' m');
    updateSliderValueDisplay(launchSpeedSlider, launchSpeedValueSpan, ' m/s');
    updateSliderValueDisplay(launchAngleSlider, launchAngleValueSpan, '°');
    
    currentLedgeHeight_m = parseFloat(ledgeHeightSlider.value); // Update internal state too

    resetResultsDisplay();
    simulateButton.disabled = false;

    // Draw initial scene
    clearCanvas();
    drawGround();
    drawLedge(currentLedgeHeight_m);
    const launchPointCanvasX = LEDGE_X_OFFSET_PX + LEDGE_WIDTH_PX;
    const launchPointCanvasY = CANVAS_HEIGHT - GROUND_HEIGHT_PX - (currentLedgeHeight_m * PIXELS_PER_METER);
    drawCat(launchPointCanvasX, launchPointCanvasY);
}

// Event Listeners
ledgeHeightSlider.addEventListener('input', () => {
    updateSliderValueDisplay(ledgeHeightSlider, ledgeHeightValueSpan, ' m');
    // If not simulating, update the static drawing of the ledge
    if (!animationFrameId) {
        currentLedgeHeight_m = parseFloat(ledgeHeightSlider.value);
        clearCanvas();
        drawGround();
        drawLedge(currentLedgeHeight_m);
        const launchPointCanvasX = LEDGE_X_OFFSET_PX + LEDGE_WIDTH_PX;
        const launchPointCanvasY = CANVAS_HEIGHT - GROUND_HEIGHT_PX - (currentLedgeHeight_m * PIXELS_PER_METER);
        drawCat(launchPointCanvasX, launchPointCanvasY);
    }
});

launchSpeedSlider.addEventListener('input', () => {
    updateSliderValueDisplay(launchSpeedSlider, launchSpeedValueSpan, ' m/s');
});

launchAngleSlider.addEventListener('input', () => {
    updateSliderValueDisplay(launchAngleSlider, launchAngleValueSpan, '°');
});

simulateButton.addEventListener('click', startSimulation);
resetButton.addEventListener('click', resetSimulation);

// Initialization
function init() {
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;

    // Set initial slider display values
    updateSliderValueDisplay(ledgeHeightSlider, ledgeHeightValueSpan, ' m');
    updateSliderValueDisplay(launchSpeedSlider, launchSpeedValueSpan, ' m/s');
    updateSliderValueDisplay(launchAngleSlider, launchAngleValueSpan, '°');

    resetSimulation(); // Call reset to draw initial state
}

// Run initialization when the script loads
init();
