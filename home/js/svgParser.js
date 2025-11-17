/**
 * SVG Parser - Load and convert SVG layers to WebGPU geometry
 */

import { parseSVGPath, normalizeVertices, earcut } from './utils.js';

const SVG_LAYERS = ['01', '02', '03', '04', '05', '06'];
const SVG_BASE_PATH = './logo/';

/**
 * Load all SVG layer files
 */
export async function loadSVGLayers() {
    const layers = [];

    for (const layerName of SVG_LAYERS) {
        const svgPath = `${SVG_BASE_PATH}${layerName}.svg`;
        try {
            const response = await fetch(svgPath);
            const svgText = await response.text();
            const layerData = parseSVGLayer(svgText, layerName);

            if (layerData) {
                layers.push(layerData);
                console.log(`Loaded layer ${layerName}: ${layerData.shapes.length} shapes`);
            }
        } catch (error) {
            console.error(`Failed to load SVG layer ${layerName}:`, error);
        }
    }

    return layers;
}

/**
 * Parse a single SVG layer into geometric data
 */
function parseSVGLayer(svgText, layerName) {
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
    const svgElement = svgDoc.querySelector('svg');

    if (!svgElement) {
        console.error(`No SVG element found in ${layerName}`);
        return null;
    }

    // Extract viewBox
    const viewBox = svgElement.getAttribute('viewBox');
    const [vbX, vbY, vbWidth, vbHeight] = viewBox
        ? viewBox.split(/\s+/).map(parseFloat)
        : [0, 0, 7200, 5400]; // Default from your SVGs

    const shapes = [];

    // Helper function to get accumulated transform from all ancestor groups
    function getAccumulatedTransform(element) {
        const matrices = [];
        let current = element.parentElement;

        while (current && current !== svgElement) {
            const transform = current.getAttribute('transform');
            if (transform) {
                matrices.unshift(parseTransformMatrix(transform));
            }
            current = current.parentElement;
        }

        // Multiply all matrices together
        let result = [1, 0, 0, 1, 0, 0]; // Identity
        for (const matrix of matrices) {
            result = multiplyMatrices(result, matrix);
        }
        return result;
    }

    // Parse all rectangles with their transforms
    const rects = svgDoc.querySelectorAll('rect');
    rects.forEach((rectElement, index) => {
        const matrix = getAccumulatedTransform(rectElement);
        const x = parseFloat(rectElement.getAttribute('x') || 0);
        const y = parseFloat(rectElement.getAttribute('y') || 0);
        const width = parseFloat(rectElement.getAttribute('width') || 0);
        const height = parseFloat(rectElement.getAttribute('height') || 0);

        if (width > 0 && height > 0) {
            let vertices = [
                x, y,
                x + width, y,
                x + width, y + height,
                x, y + height
            ];

            // Apply transform matrix
            vertices = applyTransform(vertices, matrix);

            const normalizedVertices = normalizeVertices(vertices, vbWidth, vbHeight);
            const indices = [0, 1, 2, 0, 2, 3];

            const style = rectElement.getAttribute('style') || '';
            const fill = extractFillFromStyle(style);

            const baseColor = parseColor(fill);
            // No dimming - full brightness with additive blending

            shapes.push({
                vertices: new Float32Array(normalizedVertices),
                indices: new Uint32Array(indices),
                color: baseColor,
                opacity: 1.0,
                pathIndex: shapes.length
            });
        }
    });

    // Parse all paths with their transforms
    const paths = svgDoc.querySelectorAll('path');
    paths.forEach((pathElement, index) => {
        const matrix = getAccumulatedTransform(pathElement);
        const d = pathElement.getAttribute('d');
        if (!d) return;

        let vertices = parseSVGPath(d);
        if (vertices.length < 6) return;

        // Apply transform matrix
        vertices = applyTransform(vertices, matrix);

        const normalizedVertices = normalizeVertices(vertices, vbWidth, vbHeight);
        const indices = earcut(normalizedVertices);

        if (indices.length > 0) {
            const style = pathElement.getAttribute('style') || '';
            const fill = extractFillFromStyle(style);

            const baseColor = parseColor(fill);
            // No dimming - full brightness with additive blending

            shapes.push({
                vertices: new Float32Array(normalizedVertices),
                indices: new Uint32Array(indices),
                color: baseColor,
                opacity: 1.0,
                pathIndex: shapes.length
            });
        }
    });

    const totalRects = svgDoc.querySelectorAll('rect').length;
    const totalPaths = svgDoc.querySelectorAll('path').length;
    console.log(`Parsed layer ${layerName}: ${shapes.length} shapes (${totalRects} rects, ${totalPaths} paths)`);

    // Debug: log first shape vertices
    if (shapes.length > 0) {
        console.log(`  First shape vertices:`, shapes[0].vertices.slice(0, 8));
    }

    return {
        name: layerName,
        viewBox: { x: vbX, y: vbY, width: vbWidth, height: vbHeight },
        shapes
    };
}

/**
 * Parse SVG transform matrix
 */
function parseTransformMatrix(transformString) {
    if (!transformString) {
        return [1, 0, 0, 1, 0, 0]; // Identity matrix
    }

    // Parse matrix(a, b, c, d, e, f) format
    const matrixMatch = transformString.match(/matrix\(([^)]+)\)/);
    if (matrixMatch) {
        const values = matrixMatch[1].split(/[\s,]+/).map(parseFloat);
        return values;
    }

    return [1, 0, 0, 1, 0, 0]; // Identity matrix if parsing fails
}

/**
 * Multiply two 2D affine transformation matrices
 */
function multiplyMatrices(m1, m2) {
    const [a1, b1, c1, d1, e1, f1] = m1;
    const [a2, b2, c2, d2, e2, f2] = m2;

    return [
        a1 * a2 + c1 * b2,
        b1 * a2 + d1 * b2,
        a1 * c2 + c1 * d2,
        b1 * c2 + d1 * d2,
        a1 * e2 + c1 * f2 + e1,
        b1 * e2 + d1 * f2 + f1
    ];
}

/**
 * Apply transform matrix to vertices
 */
function applyTransform(vertices, matrix) {
    const [a, b, c, d, e, f] = matrix;
    const transformed = [];

    for (let i = 0; i < vertices.length; i += 2) {
        const x = vertices[i];
        const y = vertices[i + 1];

        // Apply 2D affine transformation: [x', y'] = [a c e] [x]
        //                                              [b d f] [y]
        //                                              [0 0 1] [1]
        const newX = a * x + c * y + e;
        const newY = b * x + d * y + f;

        transformed.push(newX, newY);
    }

    return transformed;
}

/**
 * Extract fill color from SVG style attribute
 */
function extractFillFromStyle(styleString) {
    const fillMatch = styleString.match(/fill:([^;]+)/);
    if (fillMatch) {
        return fillMatch[1].trim();
    }
    return '#0000FF'; // Default blue
}

/**
 * Parse CSS color to RGBA array
 */
function parseColor(colorString) {
    // Handle rgb(r,g,b) format
    const rgbMatch = colorString.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (rgbMatch) {
        const r = parseInt(rgbMatch[1]) / 255;
        const g = parseInt(rgbMatch[2]) / 255;
        const b = parseInt(rgbMatch[3]) / 255;
        return [r, g, b, 1.0];
    }

    // Handle hex colors
    if (colorString.startsWith('#')) {
        const hex = colorString.slice(1);
        const r = parseInt(hex.slice(0, 2), 16) / 255;
        const g = parseInt(hex.slice(2, 4), 16) / 255;
        const b = parseInt(hex.slice(4, 6), 16) / 255;
        return [r, g, b, 1.0];
    }

    // Default to white
    return [1.0, 1.0, 1.0, 1.0];
}

/**
 * Create vertex buffer data for WebGPU
 * Format: [x, y, layerIndex, shapeIndex] per vertex
 */
export function createVertexBufferData(layers) {
    // First pass: find the bounding box of all content
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    layers.forEach(layer => {
        layer.shapes.forEach(shape => {
            const { vertices } = shape;
            for (let i = 0; i < vertices.length; i += 2) {
                minX = Math.min(minX, vertices[i]);
                maxX = Math.max(maxX, vertices[i]);
                minY = Math.min(minY, vertices[i + 1]);
                maxY = Math.max(maxY, vertices[i + 1]);
            }
        });
    });

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const width = maxX - minX;
    const height = maxY - minY;
    const scale = Math.min(1.8 / width, 1.8 / height); // Fit to 90% of screen

    console.log(`Content bounds: [${minX}, ${minY}] to [${maxX}, ${maxY}]`);
    console.log(`Center: [${centerX}, ${centerY}], Scale: ${scale}`);

    const buffers = [];

    layers.forEach((layer, layerIndex) => {
        layer.shapes.forEach((shape, shapeIndex) => {
            const { vertices, indices, color, opacity } = shape;

            // Create interleaved vertex data with centering and scaling
            const vertexData = [];
            for (let i = 0; i < vertices.length; i += 2) {
                // Center and scale
                const x = (vertices[i] - centerX) * scale;
                const y = (vertices[i + 1] - centerY) * scale;

                vertexData.push(
                    x,                     // x (centered and scaled)
                    y,                     // y (centered and scaled)
                    layerIndex / 5,        // layer index (normalized)
                    shapeIndex / 100,      // shape index (normalized)
                    ...color               // r, g, b, a
                );
            }

            buffers.push({
                layerIndex,
                shapeIndex,
                vertices: new Float32Array(vertexData),
                indices,
                vertexCount: vertices.length / 2,
                indexCount: indices.length,
                color,
                opacity
            });
        });
    });

    return buffers;
}

/**
 * Calculate total geometry stats
 */
export function getGeometryStats(buffers) {
    const totalVertices = buffers.reduce((sum, buf) => sum + buf.vertexCount, 0);
    const totalIndices = buffers.reduce((sum, buf) => sum + buf.indexCount, 0);
    const totalTriangles = totalIndices / 3;

    return {
        bufferCount: buffers.length,
        totalVertices,
        totalIndices,
        totalTriangles
    };
}
