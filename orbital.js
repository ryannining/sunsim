let ephemerisData = {};
// ephemeris=null;
if (typeof ephemeris === 'undefined') ; else 
{
    if (ephemeris) {
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
}
const canvas = document.getElementById('solarSystem');
const ctx = canvas.getContext('2d');
// Load Earth texture

let centerX,centerY,sunX,sunY;
// Set canvas size and performance monitoring
let maxres=100;
let lastFrameTime = performance.now();
let frameCount = 0;
let frameRate = 60;
const targetFrameRate = 20; // Target frame rate in FPS
const frameWindow = 2; // Number of frames to average



// Set canvas size
canvas.width = 1400;
canvas.height = 600;
const sunRad=0.00465; // in AU
// Update planet data structure to not hardcode sizes
const planets = {
    mercury: { 
        id: '199', 
        color: 'rgba(160, 82, 45, 1)', 
        linear: false,
        rotationPeriod: 58.646, // days
        initialRotation: 0 
    },
    venus: { 
        id: '299', 
        color: 'rgba(222, 184, 135, 1)', 
        linear: false,
        rotationPeriod: -243.018, // negative indicates retrograde rotation
        initialRotation: 0 ,
        textureFile: 'venus.jpg'
    },
    earth: { 
        id: '399', 
        color: 'rgba(65, 105, 225, 1)', 
        linear: false,
        rotationPeriod: 0.99726968, // sidereal day in days
        initialRotation: 0 ,
        textureFile: 'earth.jpg'
    },
    moon: { 
        id: '301', 
        color: 'rgba(204, 204, 204, 1)', 
        parent: '399', 
        linear: false,
        rotationPeriod: 27.321661, // tidally locked to orbital period
        initialRotation: 0 ,
        textureFile: 'moon.jpg'
    },
    mars: { 
        id: '499', 
        color: 'rgba(205, 92, 92, 1)', 
        linear: false,
        rotationPeriod: 1.02595675, 
        initialRotation: 0 ,
        textureFile: 'mars.jpg'
    },
    jupiter: { 
        id: '599', 
        color: 'rgba(218, 165, 32, 1)', 
        linear: false,
        rotationPeriod: 0.41354, 
        initialRotation: 0 ,
        textureFile: 'jupiter.jpg'
    },
    io: { id: '501', color: 'rgba(255, 200, 0, 1)', parent: '599' ,linear:false},
    europa: { id: '502', color: 'rgba(255, 255, 224, 1)', parent: '599' ,linear:false},
    ganymede: { id: '503', color: 'rgba(139, 129, 76, 1)', parent: '599' ,linear:false},
    callisto: { id: '504', color: 'rgba(119, 119, 119, 1)', parent: '599' ,linear:false},
    saturn: { 
        id: '699', 
        color: 'rgba(244, 164, 96, 1)', 
        linear: false, 
        textureFile: 'saturn.jpg',
        rings: {
            innerRadius: 1.17, // Relative to planet radius
            outerRadius: 2.3,  // Relative to planet radius
            color: 'rgba(222, 184, 135, 0.8)'
        }
    },
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

function loadTextures() {
    Object.entries(planets).forEach(([name, planet]) => {
        planet.texture = null;
        if (planet.textureFile) {
            const img = new Image();
            img.src = planet.textureFile;
            img.onload = () => {
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = img.width;
                tempCanvas.height = img.height;
                const tempCtx = tempCanvas.getContext('2d');
                tempCtx.drawImage(img, 0, 0);
                planet.texture = tempCtx.getImageData(0, 0, img.width, img.height).data;
                console.log(`${name.charAt(0).toUpperCase() + name.slice(1)} texture loaded`);
            };
        }
    });
}

loadTextures();

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

let zoom = 97000; // Add back zoom variable

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
            // Calculate control points using Lagrange polynomial interpolation
            const L = (t, t0, t1, t2, t3, p0, p1, p2, p3) => {
                const L0 = ((t - t1) * (t - t2) * (t - t3)) / ((t0 - t1) * (t0 - t2) * (t0 - t3));
                const L1 = ((t - t0) * (t - t2) * (t - t3)) / ((t1 - t0) * (t1 - t2) * (t1 - t3));
                const L2 = ((t - t0) * (t - t1) * (t - t3)) / ((t2 - t0) * (t2 - t1) * (t2 - t3));
                const L3 = ((t - t0) * (t - t1) * (t - t2)) / ((t3 - t0) * (t3 - t1) * (t3 - t2));
                return p0 * L0 + p1 * L1 + p2 * L2 + p3 * L3;
            };

            const t0 = data[closestIndex - 2].date.getTime();
            const t1 = data[closestIndex - 1].date.getTime();
            const t2 = data[closestIndex].date.getTime();
            const t3 = data[Math.min(data.length - 1, closestIndex + 1)].date.getTime();
            const tCurrent = date.getTime();

            position = {
                x: L(tCurrent, t0, t1, t2, t3, p_1.x, p0.x, p3.x, p4.x),
                y: L(tCurrent, t0, t1, t2, t3, p_1.y, p0.y, p3.y, p4.y),
                z: L(tCurrent, t0, t1, t2, t3, p_1.z, p0.z, p3.z, p4.z)
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
        lastRightX = e.clientX;
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

    } else if (isRightDragging) {
        const dy = e.clientY - lastRightY;
        const dx = e.clientX - lastRightX;
        viewAngle = Math.max(1, Math.min(179, viewAngle + dy * 0.5));
        rotationAngle = (rotationAngle + dx * 0.5) % 360;
        document.getElementById('angleSlider').value = viewAngle;
        document.getElementById('angleValue').textContent = Math.round(viewAngle);
        document.getElementById('rotationSlider').value = rotationAngle;
        document.getElementById('rotationValue').textContent = Math.round(rotationAngle);
        lastRightY = e.clientY;
        lastRightX = e.clientX;
    }
    draw();
    
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

// Add after vec3 object definition
const rayPlaneIntersect = (rayOrigin, rayDir, planePoint, planeNormal) => {
    const denom = vec3.dot(planeNormal, rayDir);
    if (Math.abs(denom) > 0.000001) {
        const t = vec3.dot(vec3.sub(planePoint, rayOrigin), planeNormal) / denom;
        return t >= 0 ? t : null;
    }
    return null;
};

// Replace renderPhase function with this improved version with ray tracing shadow (can do umbra and penumbra)
function renderPhase(canvas, screenX, screenY, screenRadius, col, planet) {
    const ctx = canvas.getContext('2d');
    
    

    // Setup parameters
    scd = Math.floor(screenRadius / maxres);
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
    const brightnessArray = Array.from({ length: wd }, () => Array(wd).fill(0));
    const texArray = Array.from({ length: 2 * wd }, () => Array(2 * wd).fill(0));

    // Multi-sample sun points for soft shadows
    pRot = calculateRotationAngle(planet, currentDate);
    const scr2=screenRadius * screenRadius;
    const d2r=Math.PI / 180;
    for (let i = -wd; i < wd; i++) {
        for (let j = -wd; j < wd; j++) {
            const px = i * sc;
            const py = j * sc;
            const px2=px * px + py * py;
            if (px2 >= scr2) continue;
            // Calculate surface normal at this pixel
            const pz = Math.sqrt(scr2 - px2);
            // Convert to normalized vector (this is our normal)
            const normal = vec3.normalize({
                x: px / screenRadius,
                y: py / screenRadius,
                z: pz / screenRadius
            });

            // Transform normal to world space
            const cosA = Math.cos(-viewAngle * d2r);
            const sinA = Math.sin(-viewAngle * d2r);
            const worldNormal = {
                x: normal.x,
                y: normal.y * cosA - normal.z * sinA,
                z: normal.y * sinA + normal.z * cosA
            };

            if (planet.texture) {
                let uvNormal = { ...worldNormal};
                const tilt = 23.5;
                const cosB = Math.cos(tilt * d2r);
                const sinB = Math.sin(tilt * d2r);
                // Apply rotation around the planet's axis
                uvNormal = vec3.rotateXY(uvNormal, (-rotationAngle) * d2r);
                // Apply tilt rotation first
                uvNormal = {
                    x: uvNormal.x,
                    y: uvNormal.y * cosB - uvNormal.z * sinB,
                    z: uvNormal.y * sinB + uvNormal.z * cosB
                };

                const u = 0.5 + Math.atan2(uvNormal.y, uvNormal.x) / (2 * Math.PI);
                const v = 0.5 - Math.asin(uvNormal.z) / Math.PI;
                const texX = Math.floor(u * 400+(pRot*400/360)) % 400;
                const texY = Math.floor(v * 200);
                const texIndex = (texY * 400 + texX) * 4;
                col = [
                    planet.texture[texIndex],
                    planet.texture[texIndex + 1],
                    planet.texture[texIndex + 2]
                ];
            }
            texArray[i + wd][j + wd] = col;
            //brightnessArray[i+ wd][j + wd] = 10;

            for (let s = 0; s < 2; s++) {


                const sunPoint = {
                    x: toSun.x + (Math.random() - 0.5) * sunRad * 2,
                    y: toSun.y + (Math.random() - 0.5) * sunRad * 2,
                    z: toSun.z + (Math.random() - 0.5) * sunRad * 2
                };
        
                // Calculate light direction from surface point to sun sample
                const lightDir = vec3.normalize(sunPoint);
                

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
                    brightnessArray[(i + wd)>>1][(j + wd)>>1] += diffuse;
                }
            }
        }
    }
    // Blur the brightness array to smooth noise
    const blurRadius = 1;
    const blurredBrightnessArray = Array.from({ length: wd }, () => Array(wd).fill(0));

    for (let i = 0; i < wd; i++) {
        for (let j = 0; j < wd; j++) {
            let sum = 0;
            let count = 0;

            for (let di = -blurRadius; di <= blurRadius; di++) {
                for (let dj = -blurRadius; dj <= blurRadius; dj++) {
                    const ni = i + di;
                    const nj = j + dj;

                    if (ni >= 0 && ni < wd && nj >= 0 && nj < wd) {
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
            
            const brightness = blurredBrightnessArray[(i + wd)>>1][(j + wd)>>1] / 8;

            // Apply color
            const outputRGB = calculateColorWithExposure(col[0], col[1], col[2], brightness);
            col= texArray[i + wd][j + wd];
            ctx.fillStyle = `rgb(${outputRGB[0]},${outputRGB[1]},${outputRGB[2]})`;
            ctx.fillRect(screenX + px - scd, screenY + py - scd, sc, sc);
        }
    }

    // Draw Saturn's rings if this is Saturn
    if (screenRadius>20 && planet.id === '699' && planet.rings) {
        const ringTilt = 26.7 * Math.PI / 180;
        const viewRad = viewAngle * Math.PI / 180;
        
        // Camera position approximation
        const cameraPos = {
            x: 0,
            y: -Math.sin(viewRad) * 10,
            z: -Math.cos(viewRad) * 10
        };

        // Normalized vector to sun for lighting
        const toSun = vec3.normalize({
            x: -planet.currentPosition.x,
            y: -planet.currentPosition.y,
            z: -planet.currentPosition.z
        });

        ctx.save();
        ctx.translate(screenX, screenY);
        
        const segments = 180; // More segments for smoother rings
        const angleStep = (2 * Math.PI) / segments;
        const sz=screenRadius/250;
        const cosc=Math.cos(viewRad);
        const sinc=Math.sin(viewRad);
        for (let r = planet.rings.innerRadius; r <= planet.rings.outerRadius; r += 0.05) {
            let lastX = null;
            let lastY = null;
            for (let i = 0; i < segments; i++) {
                const angle = i * angleStep;
                const nextAngle = (i + 1) * angleStep;

                // Calculate ring point in world space relative to Saturn
                const ringX = Math.cos(angle) * r * screenRadius;
                const ringY = Math.sin(angle) * r * screenRadius;
                const ringZ = 0;

                // Transform by ring tilt
                const tiltedY = ringY * Math.cos(ringTilt);
                const tiltedZ = ringY * Math.sin(ringTilt);

                // World space position
                const ringPoint = {
                    x: ringX,
                    y: tiltedY,
                    z: tiltedZ
                };

                // Check if ring point is visible (not occluded by planet)
                const toCamera = vec3.normalize({
                    x: cameraPos.x - ringPoint.x,
                    y: cameraPos.y - ringPoint.y,
                    z: cameraPos.z - ringPoint.z
                });

                // Project point to screen space
                const screenRingX = ringX;
                const screenRingY = tiltedY * cosc - tiltedZ * sinc;
                const screenRingZ = tiltedY * sinc - tiltedZ * cosc;

                if (screenRingZ < 0 && Math.hypot(screenRingX, screenRingY) < screenRadius) {
                    lastX = null;
                    continue; // Skip points behind camera
                }
                // Check if ring point is in shadow
                const inShadow = intersectRaySphere(ringPoint, toSun, { x: 0, y: 0, z: 0 }, screenRadius);
                if (lastX != null) {
                    // Draw ring point
                    ctx.beginPath();
                    ctx.moveTo(lastX, lastY);
                    ctx.lineTo(screenRingX, screenRingY);
                    ctx.strokeStyle = `rgba(222, 184, 135, ${inShadow ? 0.2 : 0.8})`;
                    ctx.lineWidth = sz;
                    ctx.stroke();
                    lastX = screenRingX;
                    lastY = screenRingY;
                } else {
                    lastX = screenRingX;
                    lastY = screenRingY;
                }
            }
        }
        
        ctx.restore();
    }
}

// Modify draw function to handle loading state
function draw() {
    const currentTime = performance.now();
    if (!this.lastDrawTime || currentTime - this.lastDrawTime > 50) {
        this.lastDrawTime = currentTime;
    } else {
        return;
    }
    if (isLoading) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#fff';
        ctx.font = '20px Arial';
        ctx.fillText('Loading ephemeris data...', canvas.width/2 - 100, canvas.height/2);
        return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Display date and time at top left corner
    ctx.fillStyle = '#fff';
    ctx.font = '20px Arial';
    ctx.fillText(currentDate.toLocaleString(), 200, 590);
    
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
    // Save total draw time
    const drawEndTime = performance.now();
    const drawTime = drawEndTime - currentTime;
    console.log(`Total draw time: ${drawTime.toFixed(2)} ms`);
    maxres = Math.min(maxres,100*50/drawTime);
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

// Add this function after planets definition
function calculateRotationAngle(planet, date) {
    if (!planet.rotationPeriod) return 0;
    
    // Calculate days since epoch (2010-01-01)
    const epochDate = new Date('2010-01-01');
    const daysSinceEpoch = (date - epochDate) / (1000 * 60 * 60 * 24);
    
    // Calculate total rotations
    const rotations = daysSinceEpoch / planet.rotationPeriod;
    
    // Convert to degrees (keep just the fractional part * 360)
    const degrees = (rotations % 1) * 360;
    
    return degrees + planet.initialRotation;
}
