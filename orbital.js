let ephemerisData = {};
if (typeof ephemeris === 'undefined') ; else 
{
    ephemerisData=ephemeris;
    // Convert date strings to Date objects
    for (const [id, data] of Object.entries(ephemerisData)) {
        if (data && data[1]) {
            data[1] = data[1].map(entry => ({
                ...entry,
                date: new Date(entry.date)
            }));
        }
    }
}
const canvas = document.getElementById('solarSystem');
const ctx = canvas.getContext('2d');

let centerX,centerY,sunX,sunY;
// Set canvas size
canvas.width = 1400;
canvas.height = 600;
const sunRad=0.00465; // in AU
// Update planet data structure to not hardcode sizes
const planets = {
    mercury: { id: '199', color: 'rgba(160, 82, 45, 1)' ,linear:false}, // Mercury center
    venus: { id: '299', color: 'rgba(222, 184, 135, 1)' ,linear:false},   // Venus center
    earth: { id: '399', color: 'rgba(65, 105, 225, 1)' ,linear:false},   // Earth center
    moon: { id: '301', color: 'rgba(204, 204, 204, 1)', parent: '399' ,linear:false}, // Add Moon with Earth as parent
    mars: { id: '499', color: 'rgba(205, 92, 92, 1)' ,linear:false},    // Mars center
    jupiter: { id: '599', color: 'rgba(218, 165, 32, 1)' ,linear:false}, // Jupiter center
    io: { id: '501', color: 'rgba(255, 200, 0, 1)', parent: '599' ,linear:false},
    europa: { id: '502', color: 'rgba(255, 255, 224, 1)', parent: '599' ,linear:false},
    ganymede: { id: '503', color: 'rgba(139, 129, 76, 1)', parent: '599' ,linear:false},
    callisto: { id: '504', color: 'rgba(119, 119, 119, 1)', parent: '599' ,linear:false},
    saturn: { id: '699', color: 'rgba(244, 164, 96, 1)' ,linear:false},  // Saturn center
    stattmayer: { id: '3398', color: 'rgba(0, 255, 255, 1)', isComet: true ,linear:false}, // Add Halley's Comet
    osirisrex: { id: '-64', color: 'rgba(255, 0, 255, 1)', 
        isSpacecraft: true,
        linear:true,
        startDate: new Date('2016-09-09'),
        endDate: new Date('2023-09-24') }, // Add OSIRIS-REx
    bennu: { 
        id: '2101955',
        linear:true, 
        color: 'rgba(169, 169, 169, 1)',
        startDate: new Date('2016-09-08'),
        endDate: new Date('2023-09-24')
    }
};

const planetGroups = {
    mercurySystem: ['199'],          // Mercury
    venusSystem: ['299'],            // Venus
    earthSystem: ['399', '301'],     // Earth and Moon
    marsSystem: ['499'],             // Mars
    jupiterSystem: ['599', '501', '502', '503', '504'],          // Jupiter and moons
    saturnSystem: ['699'],           // Saturn and moons
    cometSystem: ['3398'],            // Comets
    spacecraftSystem: ['-64']  // Add spacecraft group
};

// Add after planets definition
function clearTrails() {
    Object.entries(planets).forEach(([name, planet]) => {
        planet.trails = [];
        
    });
}

let isRunning = false;
let currentDate = new Date('2010-01-01'); // Update initial date to 2010
let timeStep = 0.01; // days
let viewAngle = 45; // degrees

// Convert AU to pixels (scale factor)
let AU_TO_PIXELS = 17; // Reset to a smaller value

// Add system bounds tracking
const systemBounds = {
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity,
    minZ: Infinity,
    maxZ: -Infinity
};

let zoom = 9000; // Add back zoom variable

// Add orbit visibility state
let showOrbits = false;

// Add planet physical data storage
// const planetData = {};

// Add debug logging to fetchEphemerisData
async function fetchEphemerisData(objectId, startDate, endDate) {
    const planet = Object.values(planets).find(p => p.id === objectId);
    if (planet) {
        // Use object's date range if specified
        if (planet.startDate && planet.endDate) {
            startDate = new Date(Math.max(startDate.getTime(), planet.startDate.getTime()));
            endDate = new Date(Math.min(endDate.getTime(), planet.endDate.getTime()));
        }
    }

    console.log(`Fetching data for object ID: ${objectId} from ${startDate.toISOString()} to ${endDate.toISOString()}`);
    const params = new URLSearchParams({
        format: 'json',
        COMMAND: objectId,
        OBJ_DATA: 'YES',
        MAKE_EPHEM: 'YES',
        EPHEM_TYPE: 'VECTORS',
        CENTER: '@sun',        // Use sun as center
        REF_PLANE: 'ECLIPTIC', // Use ecliptic plane
        COORD_TYPE: 'GEODETIC',// Use geometric coordinates
        VEC_TABLE: '2',        // Type 2 vector table
        VEC_LABELS: 'YES',     // Include labels for easier parsing
        CSV_FORMAT: 'YES',      // Don't use CSV to get better formatted data
        OUT_UNITS: 'AU-D',      // Use Astronomical Units
        STEP_SIZE: '2000',       // Explicitly set to 1 day interval
        START_TIME: startDate.toISOString().split('T')[0],  // Just use the date part
        STOP_TIME: endDate.toISOString().split('T')[0]      // Just use the date part
    });

    try {
        const response = await fetch(`/api/horizons?${params}`);
        const data = await response.json();
        const vectors = parseEphemerisData(data, objectId);
        // console.log(`Received ${vectors.length} daily positions for ${objectId}`);
        return vectors;
    } catch (error) {
        console.error(`Error fetching data for object ${objectId}:`, error);
        return null;
    }
}

// Function to parse the JPL Horizons response
function parseEphemerisData(data, objectId) {
    const vectors = [];
    const lines = data.result.split('\n');
    let isDataSection = false;
    let isPhysicalDataSection = false;
    let  radiusAU=0.00000001;
    // Parse physical data first
    for (const lline of lines) {
        const line = lline.toLowerCase();
        if (line.includes('physical')) {
            isPhysicalDataSection = true;
            continue;
        }
        if (isPhysicalDataSection && line.includes('mean radius')) {
            // const match = line.match(/mean radius\s*=\s*([\d.]+)/);
            let match = line.match(/mean radius\s*[^=]*=\s*(\d+\.\d+)/i);
            if (!match) match = line.match(/mean radius\s*\(?km\)?\s*[^=]*=\s*(\d+\.\d+|\d+)/i);
            if (match) {
                const radiusKm = parseFloat(match[1]);
                // Convert km to AU for consistent scaling
                 radiusAU = radiusKm / 149597870.7;
                // planetData[objectId] = { radius: radiusAU };
                // console.log(`Found radius for planet ${objectId}: ${radiusKm} km (${radiusAU} AU)`);
            }
            break;
        }
    }

    // Parse position data with new format
    for (const line of lines) {
        if (line.includes('$$EOE')) break;
        if (isDataSection) {
            // Remove multiple spaces and split
            const cleanLine = line.trim().replace(/\s+/g, ' ');
            const parts = cleanLine.split(' ');
            
            // Find X, Y, Z values in the line
            if (parts.length >= 4) {
                const x = parseFloat(parts[4]);
                const y = parseFloat(parts[5]);
                const z = parseFloat(parts[6]);
                
                if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
                    vectors.push({
                        date: new Date(parts[1]+' '+parts[2]+' '+parts[3]),
                        position: { x, y, z }
                    });
                    
                    // Update system bounds
                    systemBounds.minX = Math.min(systemBounds.minX, x);
                    systemBounds.maxX = Math.max(systemBounds.maxX, x);
                    systemBounds.minY = Math.min(systemBounds.minY, y);
                    systemBounds.maxY = Math.max(systemBounds.maxY, y);
                    systemBounds.minZ = Math.min(systemBounds.minZ, z);
                    systemBounds.maxZ = Math.max(systemBounds.maxZ, z);

                    if (vectors.length === 1) {
                        console.log(`First position for ${objectId}:`, { x, y, z });
                    }
                }
            }
        }
        if (line.includes('$$SOE')) {
            isDataSection = true;
        }
    }
    
    return [radiusAU,vectors];
}

// Add center view tracking
let centerObject = 399;
let lightObject = 301;

// Modify calculatePosition to handle different centers
let centerPos=lightPos= { x: 0, y: 0, z: 0 };
function calculatePosition(planet, date) {
    planet.currentPosition=null;
    if (!ephemerisData[planet.id] || ephemerisData[planet.id].length === 0 ||
        (planet.startDate && date < planet.startDate) ||
        (planet.endDate && date > planet.endDate)) {
        return null; // Return null for invalid dates
    }
    
    const data = ephemerisData[planet.id][1];
    const closestIndex = data.findIndex(entry => entry.date >= date);
    let position = null;
    if (closestIndex === -1 || closestIndex === 0) {
        //
    } else {
    
        // Get surrounding points for interpolation
        const p_1 = data[Math.max(0, closestIndex - 2)].position;
        const p0 = data[closestIndex - 1].position;
        const p3 = data[closestIndex].position;
        const p4 = data[Math.min(data.length - 1, closestIndex + 1)].position;

        // Calculate interpolation progress
        const t = (date - data[closestIndex - 1].date) / (data[closestIndex].date - data[closestIndex - 1].date);

        // Linear interpolation
        const uselinear=planet.linear;
        if (uselinear) {
            const p0 = data[closestIndex - 1].position;
            const p1 = data[closestIndex].position;

            position = {
                x: p0.x + t * (p1.x - p0.x),
                y: p0.y + t * (p1.y - p0.y),
                z: p0.z + t * (p1.z - p0.z)
            };
        } else {
            // Calculate control points using Catmull-Rom approach
            const p1 = {
                x: p0.x + (p3.x - p_1.x) / 6,
                y: p0.y + (p3.y - p_1.y) / 6,
                z: p0.z + (p3.z - p_1.z) / 6
            };
    
            const p2 = {
                x: p3.x - (p4.x - p0.x) / 6,
                y: p3.y - (p4.y - p_1.y) / 6,
                z: p3.z - (p4.z - p0.z) / 6
            };
    
            // Cubic Bézier interpolation
            position = {
                x: Math.pow(1 - t, 3) * p0.x + 3 * Math.pow(1 - t, 2) * t * p1.x + 
                3 * (1 - t) * Math.pow(t, 2) * p2.x + Math.pow(t, 3) * p3.x,
                y: Math.pow(1 - t, 3) * p0.y + 3 * Math.pow(1 - t, 2) * t * p1.y + 
                3 * (1 - t) * Math.pow(t, 2) * p2.y + Math.pow(t, 3) * p3.y,
                z: Math.pow(1 - t, 3) * p0.z + 3 * Math.pow(1 - t, 2) * t * p1.z + 
                3 * (1 - t) * Math.pow(t, 2) * p2.z + Math.pow(t, 3) * p3.z
            };
        }
        // Update center position if this is the center object
        position=vec3.rotateXY(position, rotationAngle * Math.PI / 180);
        if (planet.id == centerObject) {
            centerPos = position;
        }
        if (planet.id == lightObject) {
            lightPos = position;
        }
    }

    planet.currentPosition = position;
    return position;
}

// Replace calculateAutoZoom with calculateScale
function calculateScale() {
    // Calculate the maximum extent in any dimension
    const xExtent = Math.abs(systemBounds.maxX - systemBounds.minX);
    const yExtent = Math.abs(systemBounds.maxY - systemBounds.minY);
    const zExtent = Math.abs(systemBounds.maxZ - systemBounds.minZ);
    const maxExtent = Math.max(xExtent, yExtent, zExtent);
    
    // Calculate scale to fit in canvas
    const targetSize = Math.min(canvas.width, canvas.height) * 0.4;
    AU_TO_PIXELS = targetSize / maxExtent;
}

// Initialize ephemeris data
async function initializeEphemeris() {
    isLoading = true;
    const startDate = new Date('2010-01-01');
    const endDate = new Date('2026-12-31');
    if (Object.keys(ephemerisData).length === 0) {
        for (const [name, planet] of Object.entries(planets)) {
            console.log(`Fetching data for ${name}...`);
            ephemerisData[planet.id] = await fetchEphemerisData(planet.id, startDate, endDate);
        }
    }
    
    isLoading = false;
    
}

// Add view offset tracking
let viewOffsetX = 0;
let viewOffsetY = 0;
let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;
centerX = canvas.width / 2 + viewOffsetX;
centerY = canvas.height / 2 + viewOffsetY;

// Add right-click drag tracking
let isRightDragging = false;
let lastRightY ,lastRightX= 0;

// Add mouse event listeners
canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) { // Left click
        isDragging = true;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
    } else if (e.button === 2) { // Right click
        e.preventDefault();
        isRightDragging = true;
        lastRightY = e.clientY;
    }
});

canvas.addEventListener('mousemove', (e) => {
    if (isDragging) {
        const dx = e.clientX - lastMouseX;
        const dy = e.clientY - lastMouseY;
        viewOffsetX += dx;
        viewOffsetY += dy;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;

        draw();
    } else if (isRightDragging) {
        const dy = e.clientY - lastRightY;
        const dx = e.clientX - lastRightX;
        viewAngle = Math.max(1, Math.min(89, viewAngle + dy * 0.5));
        rotationAngle = Math.max(0, Math.min(360, rotationAngle + dx * 0.5));
        document.getElementById('angleSlider').value = viewAngle;
        document.getElementById('angleValue').textContent = Math.round(viewAngle);
        document.getElementById('rotationSlider').value = rotationAngle;
        document.getElementById('rotationValue').textContent = Math.round(rotationAngle);
        lastRightY = e.clientY;
        lastRightX = e.clientX;
        //if (!isRunning) return;
        if (!this.lastDrawTime || Date.now() - this.lastDrawTime > 100) {
            this.lastDrawTime = Date.now();
            draw();
        }
    }
    
});

canvas.addEventListener('mouseup', (e) => {
    if (e.button === 0) {
        isDragging = false;
    } else if (e.button === 2) {
        isRightDragging = false;
        
    }
});

canvas.addEventListener('mouseleave', () => {
    isDragging = false;
    isRightDragging = false;
});

// Prevent context menu on canvas
canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
});

// Add wheel event for zooming
canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    
    const zoomSpeed = 0.1;
    if (e.deltaY < 0) {
        zoom = Math.min(zoom * (1 + zoomSpeed), 100000);
    } else {
        zoom = Math.max(zoom * (1 - zoomSpeed), 1);
    }
    
    document.getElementById('zoomValue').textContent = zoom.toFixed(1);
    document.getElementById('zoomSlider').value = zoom;

    draw();
});

// Add click-to-center functionality
canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    Object.entries(planets).forEach(([name, planet]) => {
        const pos = planet.screenPosition;
        if (pos === null) return; // Skip drawing if position is null
        const r = planet.screenRadius;
        screenX = centerX + pos.x;
        screenY = centerY + pos.y - pos.z;
        if (Math.hypot(clickX - screenX, clickY - screenY) < r) {
            centerObject = planet.id;
            viewOffsetX = 0;
            viewOffsetY = 0;
            draw();
        }
    });
});

// Add event listener for orbit toggle
document.getElementById('showOrbits').addEventListener('change', (e) => {
    showOrbits = e.target.checked;
    draw();
});

// Add function to calculate light vector
function calculateLightVector(planetPos) {
    // Apply view angle transformation to y and z components
    const angle = viewAngle * Math.PI / 180;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const dx=-planetPos.x;
    const dy=-planetPos.y;
    const dz=-planetPos.z;
    const mag = Math.sqrt(dx*dx + dy*dy + dz*dz);
    const rotatedVector = {
        x: dx,
        y: dy * cosA - dz * sinA,
        z: dy * sinA + dz * cosA
    };
    return [rotatedVector.x / mag, rotatedVector.y / mag, rotatedVector.z / mag];


}
function calculateColorWithExposure(r, g, b, exposure) {

    // Calculate new R, G, B values based on exposure
    r = Math.min(Math.max(r*0.1 + r * exposure, 0), 255);  
    g = Math.min(Math.max(g*0.1 + g * exposure, 0), 255);
    b = Math.min(Math.max(b*0.1 + b * exposure, 0), 255);

    // Return new color as RGB array
    return [r, g, b];

  }
// Add after other global variables
let rotationAngle = 0;

const vec3 = {
    add: (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }),
    sub: (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }),
    mul: (v, s) => ({ x: v.x * s, y: v.y * s, z: v.z * s }),
    dot: (a, b) => a.x * b.x + a.y * b.y + a.z * b.z,
    length: (v) => Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z),
    normalize: (v) => {
        const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
        return len > 0 ? { x: v.x/len, y: v.y/len, z: v.z/len } : v;
    },
    transformPoint: (v, angle) => {
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        return {
            x: v.x,
            y: v.y * cosA - v.z * sinA,
            z: v.y * sinA + v.z * cosA
        };
    },
    screenToWorld: (x, y, z, centerX, centerY, zoom, viewAngle) => {
        const angle = viewAngle * Math.PI / 180;
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        return {
            x: (x - centerX) / (AU_TO_PIXELS * zoom),
            y: ((y - centerY) / (AU_TO_PIXELS * zoom * cosA) + z * sinA) / cosA,
            z: (z * cosA - (y - centerY) / (AU_TO_PIXELS * zoom) * sinA) / cosA
        };
    },
    worldToScreen: (pos, centerX, centerY, zoom, viewAngle) => {
        const angle = viewAngle * Math.PI / 180;
        const transformed = vec3.transformPoint(pos, angle);
        return {
            x: centerX + transformed.x * AU_TO_PIXELS * zoom,
            y: centerY + transformed.y * AU_TO_PIXELS * zoom,
            z: transformed.z * AU_TO_PIXELS * zoom
        };
    },
    rotateXY: (v, angle) => {
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        return {
            x: v.x * cosA - v.y * sinA,
            y: v.x * sinA + v.y * cosA,
            z: v.z
        };
    }
};

// Add this intersection testing function
function intersectRaySphere(origin, direction, sphereCenter, sphereRadius) {
    const oc = vec3.sub(origin, sphereCenter);
    const a = vec3.dot(direction, direction);
    const b = 2 * vec3.dot(oc, direction);
    const c = vec3.dot(oc, oc) - sphereRadius * sphereRadius;
    const discriminant = b * b - 4 * a * c;

    if (discriminant < 0) return null;
    
    const t = (-b - Math.sqrt(discriminant)) / (2 * a);
    return t > 0 ? t : null;
}

// Replace renderPhase function with this improved version with ray tracing shadow (can do umbra and penumbra)
function renderPhase(canvas, screenX, screenY, screenRadius, col, planet) {
    const ctx = canvas.getContext('2d');
    
    // Setup parameters
    scd = Math.floor(screenRadius / 50);
    sc = Math.max(1, scd * 2);
    wd = Math.ceil(screenRadius / sc);

    // Find planet's group and get other planets in the same group
    const planetGroup = Object.entries(planetGroups).find(([_, ids]) => 
        ids.includes(planet.id)
    );
    
    // Get other planets in same group for shadow calculation
    const groupPlanets = planetGroup ? 
        planetGroup[1]
            .filter(id => id !== planet.id)
            .map(id => Object.values(planets)
                .find(p => p.id === id))
            .filter(p => p) 
        : [];

    // Get normalized vector to sun in world space
    const toSun = vec3.normalize({
        x: -planet.currentPosition.x,
        y: -planet.currentPosition.y,
        z: -planet.currentPosition.z
    });

    // Initialize brightness array
    const brightnessArray = Array.from({ length: 2 * wd }, () => Array(2 * wd).fill(0));

    // Multi-sample sun points for soft shadows


    for (let i = -wd; i < wd; i++) {
        for (let j = -wd; j < wd; j++) {
            for (let s = 0; s < 8; s++) {
                const sunPoint = {
                    x: toSun.x + (Math.random() - 0.5) * sunRad * 2,
                    y: toSun.y + (Math.random() - 0.5) * sunRad * 2,
                    z: toSun.z + (Math.random() - 0.5) * sunRad * 2
                };
        
                // Calculate light direction from surface point to sun sample
                const lightDir = vec3.normalize(sunPoint);
                const px = i * sc;
                const py = j * sc;

                if (px * px + py * py >= screenRadius * screenRadius) continue;

                // Calculate surface normal at this pixel
                const pz = Math.sqrt(screenRadius * screenRadius - px * px - py * py);
                
                // Convert to normalized vector (this is our normal)
                const normal = vec3.normalize({
                    x: px / screenRadius,
                    y: py / screenRadius,
                    z: pz / screenRadius
                });

                // Transform normal to world space
                const worldNormal = {
                    x: normal.x,
                    y: normal.y * Math.cos(-viewAngle * Math.PI / 180) - normal.z * Math.sin(-viewAngle * Math.PI / 180),
                    z: normal.y * Math.sin(-viewAngle * Math.PI / 180) + normal.z * Math.cos(-viewAngle * Math.PI / 180)
                };

                // Calculate world space position of this surface point
                const worldPoint = {
                    x: planet.currentPosition.x + worldNormal.x * ephemerisData[planet.id][0],
                    y: planet.currentPosition.y + worldNormal.y * ephemerisData[planet.id][0],
                    z: planet.currentPosition.z + worldNormal.z * ephemerisData[planet.id][0]
                };

                // Check for shadows from other planets in group
                let isLit = true;
                
                for (const otherPlanet of groupPlanets) {
                    if (otherPlanet.id !== planet.id) {
                        const otherRadius = ephemerisData[otherPlanet.id][0];
                        if (intersectRaySphere(worldPoint, lightDir, otherPlanet.currentPosition, otherRadius)) {
                            isLit = false;
                            break;
                        }
                    }
                }

                if (isLit) {
                    // Calculate diffuse lighting
                    const diffuse = Math.max(0, vec3.dot(worldNormal, lightDir));
                    brightnessArray[i + wd][j + wd] += diffuse;
                }
            }
        }
    }
    // Blur the brightness array to smooth noise
    const blurRadius = 1;
    const blurredBrightnessArray = Array.from({ length: 2 * wd }, () => Array(2 * wd).fill(0));

    for (let i = 0; i < 2 * wd; i++) {
        for (let j = 0; j < 2 * wd; j++) {
            let sum = 0;
            let count = 0;

            for (let di = -blurRadius; di <= blurRadius; di++) {
                for (let dj = -blurRadius; dj <= blurRadius; dj++) {
                    const ni = i + di;
                    const nj = j + dj;

                    if (ni >= 0 && ni < 2 * wd && nj >= 0 && nj < 2 * wd) {
                        sum += brightnessArray[ni][nj];
                        count++;
                    }
                }
            }

            blurredBrightnessArray[i][j] = sum / count;
        }
    }
   // brightnessArray = blurredBrightnessArray;
    // Render the brightness values
    for (let i = -wd; i < wd; i++) {
        for (let j = -wd; j < wd; j++) {
            const px = i * sc;
            const py = j * sc;

            if (px * px + py * py >= screenRadius * screenRadius) continue;

            // Calculate final brightness
            
            const brightness = blurredBrightnessArray[i + wd][j + wd] / 8;

            // Apply color
            const outputRGB = calculateColorWithExposure(col[0], col[1], col[2], brightness);
            ctx.fillStyle = `rgb(${outputRGB[0]},${outputRGB[1]},${outputRGB[2]})`;
            ctx.fillRect(screenX + px - scd, screenY + py - scd, sc, sc);
        }
    }
}

// Modify draw function to handle loading state
function draw() {
    if (isLoading) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#fff';
        ctx.font = '20px Arial';
        ctx.fillText('Loading ephemeris data...', canvas.width/2 - 100, canvas.height/2);
        return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    centerPos = { x: 0, y: 0, z: 0 };
    Object.entries(planets).forEach(([name, planet]) => {
        const pos = calculatePosition(planet, currentDate);
        
    });
    // rotate centerpos

    Object.entries(planets).forEach(([name, planet]) => {
          // Update trail
          const rotatedPos = planet.currentPosition;
          planet.screenPosition=null;
          if (rotatedPos === null) return; // Skip drawing if position is null
          // Apply rotation before screen transform
         
          const screenPos = {
              x: (rotatedPos.x - centerPos.x) * AU_TO_PIXELS * zoom,
              y: (rotatedPos.y - centerPos.y) * Math.cos(viewAngle * Math.PI / 180) * AU_TO_PIXELS * zoom,
              z: (rotatedPos.z - centerPos.z) * AU_TO_PIXELS * zoom
          };
          planet.screenRadius = ephemerisData[planet.id][0]*AU_TO_PIXELS*zoom;
          planet.screenPosition = screenPos;
          if (isRunning){
             planet.trails.push([rotatedPos.x-centerPos.x, rotatedPos.y-centerPos.y,rotatedPos.z-centerPos.z]);        
            if (planet.trails.length > 1000) {
                planet.trails.shift();
            }
            }
          const trail = planet.trails;
          if (trail.length > 1) {
              const transparency = Math.max(0.1, Math.min(0.7, 0.7 - (planet.screenRadius - 1) * 0.04));
              ctx.strokeStyle = planet.color.replace('1)', `${transparency})`); // Make the line transparent based on screen radius
              ctx.lineWidth = Math.max(1, planet.screenRadius);
              ctx.beginPath();
              
              for (let i = 0; i < trail.length; i++) {
                const screenX = centerX + (trail[i][0] - 0*centerPos.x) * AU_TO_PIXELS * zoom;
                const screenY = centerY + (trail[i][1] - 0*centerPos.y) * Math.cos(viewAngle * Math.PI / 180) * AU_TO_PIXELS * zoom 
                                - (trail[i][2] - 0*centerPos.z) * AU_TO_PIXELS * zoom;
                if (i === 0) ctx.moveTo(screenX, screenY);
                else ctx.lineTo(screenX, screenY);
              }
              ctx.stroke();
          }
    });
        // ...existing grid drawing code...


    // ...rest of existing drawing code...

    //calculateScale();
    // Draw grid
    ctx.strokeStyle = 'rgba(0, 0, 200, 1)'; // Thin green lines with transparency
    ctx.lineWidth = 0.2;
    ctx.beginPath();
    const gridSizeAU = 0.5; // Grid size in AU
    const gridSize = gridSizeAU * AU_TO_PIXELS * zoom; // Convert grid size to pixels
    const gridOffsetX = (viewOffsetX - centerPos.x * AU_TO_PIXELS * zoom) % gridSize;
    const gridOffsetY = (viewOffsetY - centerPos.y * Math.cos(viewAngle * Math.PI / 180) * AU_TO_PIXELS * zoom) % gridSize;
    
    for (let x = gridOffsetX; x < canvas.width; x += gridSize) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
    }
    for (let y = gridOffsetY; y < canvas.height; y += gridSize) {
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
    }
    ctx.stroke();

    // Draw Sun
    centerX = canvas.width / 2 + viewOffsetX;
    centerY = canvas.height / 2 + viewOffsetY;
    ctx.beginPath();
    ctx.fillStyle = '#FFD700';
    sunX = centerX + (0-centerPos.x) * AU_TO_PIXELS * zoom;
    sunY = centerY + (0-centerPos.y) * Math.cos(viewAngle * Math.PI / 180) * AU_TO_PIXELS * zoom - (0-centerPos.z) * AU_TO_PIXELS * zoom;

    ctx.arc(sunX, sunY, Math.max(2,sunRad*AU_TO_PIXELS*zoom) , 0, Math.PI * 2);
    ctx.fill();
    // Draw planets
    // update planet location and center position
    // Draw orbit paths first (behind everything)
    if (showOrbits) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)'; // Thin white lines with transparency
        ctx.lineWidth = 0.3;
        
        Object.entries(planets).forEach(([name, planet]) => {
            ctx.beginPath();
            const vectors = ephemerisData[planet.id][1];
            let firstScreenX = null;
            let firstScreenY = null;

            for (let index = 0; index < vectors.length; index += 2) {
                const vector = vectors[index];
                const pos = vector.position;
                const rotatedPos = vec3.rotateXY(pos, rotationAngle * Math.PI / 180);
                const screenX = centerX + (rotatedPos.x-centerPos.x) * AU_TO_PIXELS * zoom;
                const screenY = centerY + (rotatedPos.y-centerPos.y) * Math.cos(viewAngle * Math.PI / 180) * AU_TO_PIXELS * zoom - (rotatedPos.z-centerPos.z) * AU_TO_PIXELS * zoom;

                if (index === 0) {
                    firstScreenX = screenX;
                    firstScreenY = screenY;
                    ctx.moveTo(screenX, screenY);
                } else {
                    ctx.lineTo(screenX, screenY);
                    // Check if we are back to the first point
                    if (index > 100 && Math.abs(screenX - firstScreenX) < 3 && Math.abs(screenY - firstScreenY) < 3) {
                        break;
                    }
                }
            }
            
            // Do not close the path to avoid drawing a line back to the start
            ctx.stroke();
        });
    }

    // Draw lines from Sun to Earth and Moon
    // Draw lines from Sun to Earth and Moon
    const drawLine = (planet) => {
        const spos = planet.screenPosition;
        if (spos === null) return; // Skip drawing if position is null

        const screenX =centerX+ spos.x;
        const screenY = centerY+spos.y-spos.z;
        const vec=[-screenY+sunY,screenX-sunX];
        const mag=Math.sqrt(vec[0]*vec[0]+vec[1]*vec[1]);
        vec[0]=vec[0]/mag;
        vec[1]=vec[1]/mag;
        
        const sunR=sunRad*AU_TO_PIXELS*zoom;
        const pR = planet.screenRadius;

        const sunP=[[sunX-vec[0]*sunR,sunY-vec[1]*sunR],
                    [sunX+vec[0]*sunR,sunY+vec[1]*sunR]];

        const planetP=[[screenX-vec[0]*pR,screenY-vec[1]*pR],
                    [screenX+vec[0]*pR,screenY+vec[1]*pR]];

        
        function drawLightLine(sunPoint,planetPoint,col1,col2) {
                ctx.strokeStyle = col1;//'rgba(255, 255, 0, 0.5)'; // Red thin transparent line
                ctx.lineWidth = 0.5;
                ctx.beginPath();
                ctx.moveTo(sunPoint[0], sunPoint[1]);
                ctx.lineTo(planetPoint[0], planetPoint[1]);
                const vector = {
                    x: planetPoint[0] - sunPoint[0],
                    y: planetPoint[1] - sunPoint[1]
                };
                ctx.stroke();
                ctx.strokeStyle = col2;//'rgba(255, 0, 255, 0.5)'; // Red thin transparent line
                ctx.lineWidth = 0.5;
                ctx.beginPath();
                ctx.moveTo(planetPoint[0], planetPoint[1]);
                ctx.lineTo(planetPoint[0] + vector.x * 1, planetPoint[1] + vector.y * 1);
                ctx.stroke();
                return [sunPoint[0],sunPoint[1],planetPoint[0]+ vector.x * 1,planetPoint[1]+ vector.y * 1];
            
        };
        const col1='rgba(255, 255, 0, 0.5)';
        const col2='rgba(255, 155, 0, 0.5)';
        const col3='rgba(0, 0, 255, 0.85)';
        drawLightLine(sunP[0],planetP[1],col1,col2);
        drawLightLine(sunP[1],planetP[0],col1,col2);
        const l1 = drawLightLine(sunP[0], planetP[0],col1,col3);
        const l2 = drawLightLine(sunP[1], planetP[1],col1,col3);
        // Calculate intersection point of l1 and l2 using line intersection formula
        const denominator = (l1[0] - l1[2]) * (l2[1] - l2[3]) - (l1[1] - l1[3]) * (l2[0] - l2[2]);
        if (denominator !== 0) {
            const t = ((l1[0] - l2[0]) * (l2[1] - l2[3]) - (l1[1] - l2[1]) * (l2[0] - l2[2])) / denominator;
            const intersectionX = l1[0] + t * (l1[2] - l1[0]);
            const intersectionY = l1[1] + t * (l1[3] - l1[1]);

            // Draw red circle at the intersection point
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(0, 255, 0, 0.5)';
            ctx.arc(intersectionX, intersectionY, 5, 0, Math.PI * 2);
            ctx.stroke();
        }
        


    
    };

    Object.entries(planets).forEach(([name, planet]) => {
        let pos = planet.screenPosition;
        if (pos === null) return; // Skip drawing if position is null
        const screenX = centerX + pos.x;
        const screenY = centerY + pos.y - pos.z;
        
        // Draw planet
        const planetRadius = ephemerisData[planet.id][0];
        const screenRadius = Math.max(1, planetRadius * AU_TO_PIXELS * zoom);
        if (screenRadius <1) {
            ctx.beginPath();
            ctx.fillStyle = planet.color;
            ctx.arc(screenX, screenY, screenRadius, 0, Math.PI * 2);
            ctx.fill();
        } else {
        
            // Calculate light vector from sun to planet
            //const lightVector = calculateLightVector(planet.currentPosition);
            
            // Get planet color components
            const colorStr = planet.color;
            const colorMatch = planet.color.match(/rgba?\((\d+), (\d+), (\d+)/);
            const r = parseInt(colorMatch[1]);
            const g = parseInt(colorMatch[2]);
            const b = parseInt(colorMatch[3]);

            renderPhase(
                canvas,
                screenX, // x center
                screenY, // y center
                screenRadius, // radius in pixels
                [r,g,b], // planet color
                planet // planet object
            );
        }
        // Draw planet name
        ctx.font = '12px Arial';
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.fillText(name.charAt(0).toUpperCase() + name.slice(1), screenX, screenY - screenRadius - 5);
    });

    // After drawing everything else, render the overview if centered on a planet
    if (centerObject !== 0) {
        const centeredPlanet = Object.entries(planets).find(([name, planet]) => planet.id === lightObject.toString());
        drawLine(centeredPlanet[1]);

    }
}

// Event listeners
document.getElementById('playPauseBtn').addEventListener('click', () => {
    isRunning = !isRunning;
    document.getElementById('playPauseBtn').textContent = isRunning ? 'Pause' : 'Start';
    if (isRunning) {
        animate();
    }
});

document.getElementById('clearBtn').addEventListener('click', () => {
    clearTrails();
    draw();
});

document.getElementById('dateSlider').addEventListener('input', (e) => {
    currentDate = new Date(parseInt(e.target.value));
    document.getElementById('currentDate').textContent = currentDate.toLocaleDateString();
    document.getElementById('dateInput').value = currentDate.toISOString().split('T')[0];
    clearTrails();
    draw();
});

document.getElementById('timeStepSlider').addEventListener('input', (e) => {
    timeStep = parseFloat(e.target.value);
    document.getElementById('timeStepValue').textContent = timeStep;
});

document.getElementById('angleSlider').addEventListener('input', (e) => {
    viewAngle = parseInt(e.target.value);
    document.getElementById('angleValue').textContent = viewAngle;
    // Clear all trails when changing angle
    Object.entries(planets).forEach(([name, planet]) => {
        planet.trails = [];
    });
    draw();
});

// Add back zoom slider event listener
document.getElementById('zoomSlider').addEventListener('input', (e) => {
    zoom = parseFloat(e.target.value);
    document.getElementById('zoomValue').textContent = zoom.toFixed(1);
    draw();
});

// Add after other event listeners, before initialization
document.getElementById('solarEclipseBtn').addEventListener('click', () => {
    const solarEclipseDate = new Date('2024-04-08');
    currentDate = solarEclipseDate;
    document.getElementById('dateSlider').value = solarEclipseDate.getTime();
    document.getElementById('currentDate').textContent = solarEclipseDate.toLocaleDateString();
    clearTrails();
    draw();
});
document.getElementById('osirisLaunchBtn').addEventListener('click', () => {
    const osirisRexDate = new Date('2016-09-08');
    currentDate = osirisRexDate;
    document.getElementById('dateSlider').value = osirisRexDate.getTime();
    document.getElementById('currentDate').textContent = osirisRexDate.toLocaleDateString();
    clearTrails();
    draw();
});
    

function animate() {
    if (!isRunning) return;
    
    currentDate = new Date(currentDate.getTime() + timeStep * 86400000);
    document.getElementById('dateSlider').value = currentDate.getTime();
    document.getElementById('currentDate').textContent = currentDate.toLocaleDateString();
    
    draw();
    requestAnimationFrame(animate);
}

document.getElementById('lunarEclipseBtn').addEventListener('click', () => {
    const lunarEclipseDate = new Date('2025-09-07');
    currentDate = lunarEclipseDate;
    document.getElementById('dateSlider').value = lunarEclipseDate.getTime();
    document.getElementById('currentDate').textContent = lunarEclipseDate.toLocaleDateString();
    clearTrails();
    draw();
});
// Reset view when changing center object
document.getElementById('centerSelect').addEventListener('change', (e) => {
    centerObject = parseInt(e.target.value);
    viewOffsetX = 0;
    viewOffsetY = 0;
    clearTrails();
    draw();
});
document.getElementById('lightSelect').addEventListener('change', (e) => {
    lightObject = parseInt(e.target.value);
    viewOffsetX = 0;
    viewOffsetY = 0;
    clearTrails();
    draw();
});

// Add after other event listeners
document.getElementById('setDateBtn').addEventListener('click', () => {
    const dateStr = document.getElementById('dateInput').value;
    if (dateStr) {
        const newDate = new Date(dateStr);
        currentDate = newDate;
        document.getElementById('dateSlider').value = newDate.getTime();
        document.getElementById('currentDate').textContent = newDate.toLocaleDateString();
        clearTrails();
        draw();
    }
});

// Add event listener for rotation slider
document.getElementById('rotationSlider').addEventListener('input', (e) => {
    rotationAngle = parseInt(e.target.value);
    document.getElementById('rotationValue').textContent = rotationAngle;
    // Clear trails when changing angle
    clearTrails();
    draw();
});

// Initialize the simulation
clearTrails();
initializeEphemeris();

// Initial draw
currentDate = new Date(parseInt(dateSlider.value));
draw();
