/**
 * Utility functions for WebGPU and geometry processing
 */

/**
 * Check if WebGPU is supported
 */
export async function checkWebGPUSupport() {
    if (!navigator.gpu) {
        return {
            supported: false,
            error: 'WebGPU is not supported in this browser'
        };
    }

    try {
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) {
            return {
                supported: false,
                error: 'No WebGPU adapter found'
            };
        }

        const device = await adapter.requestDevice();
        return {
            supported: true,
            adapter,
            device
        };
    } catch (error) {
        return {
            supported: false,
            error: `WebGPU initialization failed: ${error.message}`
        };
    }
}

/**
 * Simple earcut-based triangulation for polygon paths
 * Based on earcut algorithm by Mapbox
 */
export function triangulatePath(vertices) {
    if (vertices.length < 6) return []; // Need at least 3 points (x,y pairs)

    const n = vertices.length / 2;
    const indices = [];

    // Simple ear clipping for convex/simple polygons
    // For complex SVG paths, you'd want full earcut implementation
    if (n === 3) {
        return [0, 1, 2];
    }

    // Triangle fan from first vertex (works for convex polygons)
    for (let i = 1; i < n - 1; i++) {
        indices.push(0, i, i + 1);
    }

    return indices;
}

/**
 * Earcut triangulation (simplified version)
 * Full implementation would handle holes and complex polygons
 */
export function earcut(data, holeIndices, dim = 2) {
    const hasHoles = holeIndices && holeIndices.length;
    const outerLen = hasHoles ? holeIndices[0] * dim : data.length;
    let outerNode = linkedList(data, 0, outerLen, dim, true);
    const triangles = [];

    if (!outerNode || outerNode.next === outerNode.prev) return triangles;

    // Simple triangulation for convex polygons
    if (data.length / dim <= 3) {
        return [0, 1, 2];
    }

    earcutLinked(outerNode, triangles, dim);

    return triangles;
}

function linkedList(data, start, end, dim, clockwise) {
    let last;

    if (clockwise === (signedArea(data, start, end, dim) > 0)) {
        for (let i = start; i < end; i += dim) {
            last = insertNode(i / dim, data[i], data[i + 1], last);
        }
    } else {
        for (let i = end - dim; i >= start; i -= dim) {
            last = insertNode(i / dim, data[i], data[i + 1], last);
        }
    }

    if (last && equals(last, last.next)) {
        removeNode(last);
        last = last.next;
    }

    if (last) {
        last.next.prev = last;
        last.prev.next = last;
    }

    return last;
}

function earcutLinked(ear, triangles, dim, minX, minY, invSize) {
    if (!ear) return;

    // Iterate through ears, slicing them one by one
    let stop = ear;

    while (ear.prev !== ear.next) {
        const prev = ear.prev;
        const next = ear.next;

        if (isEar(ear)) {
            triangles.push(prev.i, ear.i, next.i);

            removeNode(ear);
            ear = next.next;
            stop = next.next;

            continue;
        }

        ear = next;

        if (ear === stop) break;
    }
}

function isEar(ear) {
    const a = ear.prev;
    const b = ear;
    const c = ear.next;

    if (area(a, b, c) >= 0) return false;

    // Check if any point is inside the triangle
    let p = ear.next.next;

    while (p !== ear.prev) {
        if (pointInTriangle(a.x, a.y, b.x, b.y, c.x, c.y, p.x, p.y) &&
            area(p.prev, p, p.next) >= 0) return false;
        p = p.next;
    }

    return true;
}

function pointInTriangle(ax, ay, bx, by, cx, cy, px, py) {
    return (cx - px) * (ay - py) - (ax - px) * (cy - py) >= 0 &&
           (ax - px) * (by - py) - (bx - px) * (ay - py) >= 0 &&
           (bx - px) * (cy - py) - (cx - px) * (by - py) >= 0;
}

function area(p, q, r) {
    return (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
}

function equals(p1, p2) {
    return p1.x === p2.x && p1.y === p2.y;
}

function signedArea(data, start, end, dim) {
    let sum = 0;
    for (let i = start, j = end - dim; i < end; i += dim) {
        sum += (data[j] - data[i]) * (data[i + 1] + data[j + 1]);
        j = i;
    }
    return sum;
}

function insertNode(i, x, y, last) {
    const p = {
        i,
        x,
        y,
        prev: null,
        next: null,
        z: null,
        prevZ: null,
        nextZ: null,
        steiner: false
    };

    if (!last) {
        p.prev = p;
        p.next = p;
    } else {
        p.next = last.next;
        p.prev = last;
        last.next.prev = p;
        last.next = p;
    }

    return p;
}

function removeNode(p) {
    p.next.prev = p.prev;
    p.prev.next = p.next;

    if (p.prevZ) p.prevZ.nextZ = p.nextZ;
    if (p.nextZ) p.nextZ.prevZ = p.prevZ;
}

/**
 * Subdivide a cubic Bezier curve into line segments
 */
function subdivideCubicBezier(x0, y0, x1, y1, x2, y2, x3, y3, segments = 10) {
    const points = [];
    for (let i = 1; i <= segments; i++) {
        const t = i / segments;
        const t2 = t * t;
        const t3 = t2 * t;
        const mt = 1 - t;
        const mt2 = mt * mt;
        const mt3 = mt2 * mt;

        const x = mt3 * x0 + 3 * mt2 * t * x1 + 3 * mt * t2 * x2 + t3 * x3;
        const y = mt3 * y0 + 3 * mt2 * t * y1 + 3 * mt * t2 * y2 + t3 * y3;
        points.push(x, y);
    }
    return points;
}

/**
 * Subdivide a quadratic Bezier curve into line segments
 */
function subdivideQuadraticBezier(x0, y0, x1, y1, x2, y2, segments = 10) {
    const points = [];
    for (let i = 1; i <= segments; i++) {
        const t = i / segments;
        const t2 = t * t;
        const mt = 1 - t;
        const mt2 = mt * mt;

        const x = mt2 * x0 + 2 * mt * t * x1 + t2 * x2;
        const y = mt2 * y0 + 2 * mt * t * y1 + t2 * y2;
        points.push(x, y);
    }
    return points;
}

/**
 * Parse SVG path commands into vertices
 */
export function parseSVGPath(pathString) {
    const vertices = [];
    const commands = pathString.match(/[MmLlHhVvCcSsQqTtAaZz][^MmLlHhVvCcSsQqTtAaZz]*/g);

    if (!commands) return vertices;

    let currentX = 0;
    let currentY = 0;
    let startX = 0;
    let startY = 0;
    let lastControlX = 0;
    let lastControlY = 0;

    commands.forEach(cmd => {
        const type = cmd[0];
        const args = cmd.slice(1).trim().split(/[\s,]+/).map(parseFloat).filter(n => !isNaN(n));

        switch (type) {
            case 'M': // Move to (absolute)
                currentX = args[0];
                currentY = args[1];
                startX = currentX;
                startY = currentY;
                vertices.push(currentX, currentY);
                break;
            case 'm': // Move to (relative)
                currentX += args[0];
                currentY += args[1];
                startX = currentX;
                startY = currentY;
                vertices.push(currentX, currentY);
                break;
            case 'L': // Line to (absolute)
                for (let i = 0; i < args.length; i += 2) {
                    currentX = args[i];
                    currentY = args[i + 1];
                    vertices.push(currentX, currentY);
                }
                break;
            case 'l': // Line to (relative)
                for (let i = 0; i < args.length; i += 2) {
                    currentX += args[i];
                    currentY += args[i + 1];
                    vertices.push(currentX, currentY);
                }
                break;
            case 'H': // Horizontal line (absolute)
                currentX = args[0];
                vertices.push(currentX, currentY);
                break;
            case 'h': // Horizontal line (relative)
                currentX += args[0];
                vertices.push(currentX, currentY);
                break;
            case 'V': // Vertical line (absolute)
                currentY = args[0];
                vertices.push(currentX, currentY);
                break;
            case 'v': // Vertical line (relative)
                currentY += args[0];
                vertices.push(currentX, currentY);
                break;
            case 'C': // Cubic Bezier (absolute)
                for (let i = 0; i < args.length; i += 6) {
                    const points = subdivideCubicBezier(
                        currentX, currentY,
                        args[i], args[i + 1],
                        args[i + 2], args[i + 3],
                        args[i + 4], args[i + 5]
                    );
                    vertices.push(...points);
                    lastControlX = args[i + 2];
                    lastControlY = args[i + 3];
                    currentX = args[i + 4];
                    currentY = args[i + 5];
                }
                break;
            case 'c': // Cubic Bezier (relative)
                for (let i = 0; i < args.length; i += 6) {
                    const points = subdivideCubicBezier(
                        currentX, currentY,
                        currentX + args[i], currentY + args[i + 1],
                        currentX + args[i + 2], currentY + args[i + 3],
                        currentX + args[i + 4], currentY + args[i + 5]
                    );
                    vertices.push(...points);
                    lastControlX = currentX + args[i + 2];
                    lastControlY = currentY + args[i + 3];
                    currentX += args[i + 4];
                    currentY += args[i + 5];
                }
                break;
            case 'S': // Smooth cubic Bezier (absolute)
                for (let i = 0; i < args.length; i += 4) {
                    const cx1 = 2 * currentX - lastControlX;
                    const cy1 = 2 * currentY - lastControlY;
                    const points = subdivideCubicBezier(
                        currentX, currentY,
                        cx1, cy1,
                        args[i], args[i + 1],
                        args[i + 2], args[i + 3]
                    );
                    vertices.push(...points);
                    lastControlX = args[i];
                    lastControlY = args[i + 1];
                    currentX = args[i + 2];
                    currentY = args[i + 3];
                }
                break;
            case 's': // Smooth cubic Bezier (relative)
                for (let i = 0; i < args.length; i += 4) {
                    const cx1 = 2 * currentX - lastControlX;
                    const cy1 = 2 * currentY - lastControlY;
                    const points = subdivideCubicBezier(
                        currentX, currentY,
                        cx1, cy1,
                        currentX + args[i], currentY + args[i + 1],
                        currentX + args[i + 2], currentY + args[i + 3]
                    );
                    vertices.push(...points);
                    lastControlX = currentX + args[i];
                    lastControlY = currentY + args[i + 1];
                    currentX += args[i + 2];
                    currentY += args[i + 3];
                }
                break;
            case 'Q': // Quadratic Bezier (absolute)
                for (let i = 0; i < args.length; i += 4) {
                    const points = subdivideQuadraticBezier(
                        currentX, currentY,
                        args[i], args[i + 1],
                        args[i + 2], args[i + 3]
                    );
                    vertices.push(...points);
                    currentX = args[i + 2];
                    currentY = args[i + 3];
                }
                break;
            case 'q': // Quadratic Bezier (relative)
                for (let i = 0; i < args.length; i += 4) {
                    const points = subdivideQuadraticBezier(
                        currentX, currentY,
                        currentX + args[i], currentY + args[i + 1],
                        currentX + args[i + 2], currentY + args[i + 3]
                    );
                    vertices.push(...points);
                    currentX += args[i + 2];
                    currentY += args[i + 3];
                }
                break;
            case 'Z':
            case 'z': // Close path
                if (currentX !== startX || currentY !== startY) {
                    vertices.push(startX, startY);
                }
                currentX = startX;
                currentY = startY;
                break;
        }
    });

    return vertices;
}

/**
 * Normalize coordinates from SVG space to NDC (-1 to 1)
 */
export function normalizeVertices(vertices, viewBoxWidth, viewBoxHeight) {
    const normalized = [];

    for (let i = 0; i < vertices.length; i += 2) {
        // Normalize to 0-1 range
        let x = vertices[i] / viewBoxWidth;
        let y = vertices[i + 1] / viewBoxHeight;

        // Convert to -1 to 1 range (NDC)
        x = x * 2 - 1;
        y = y * 2 - 1;

        // Flip Y (SVG Y goes down, WebGL/WebGPU Y goes up)
        y = -y;

        normalized.push(x, y);
    }
    return normalized;
}

/**
 * Generate Perlin-like noise value
 */
export function noise2D(x, y) {
    // Simple pseudo-random noise
    const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return n - Math.floor(n);
}

/**
 * Smoothstep interpolation
 */
export function smoothstep(edge0, edge1, x) {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
}

/**
 * Linear interpolation
 */
export function lerp(a, b, t) {
    return a + (b - a) * t;
}

/**
 * Create a matrix for 2D transformations
 */
export function createMatrix3x3(translation = [0, 0], rotation = 0, scale = [1, 1]) {
    const c = Math.cos(rotation);
    const s = Math.sin(rotation);

    return new Float32Array([
        scale[0] * c, scale[0] * s, 0,
        -scale[1] * s, scale[1] * c, 0,
        translation[0], translation[1], 1
    ]);
}
