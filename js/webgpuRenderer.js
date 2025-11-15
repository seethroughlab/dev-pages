/**
 * WebGPU Renderer
 * Handles WebGPU initialization, pipeline creation, and rendering
 */

import { ShaderUniforms } from './shaderUniforms.js';

export class WebGPURenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.device = null;
        this.context = null;
        this.pipeline = null;
        this.uniformBindGroup = null;
        this.geometryBuffers = [];
        this.uniforms = null;
        this.format = 'bgra8unorm';
    }

    /**
     * Initialize WebGPU
     */
    async initialize() {
        // Get GPU adapter
        const adapter = await navigator.gpu?.requestAdapter();
        if (!adapter) {
            throw new Error('WebGPU adapter not available');
        }

        // Get device
        this.device = await adapter.requestDevice();
        if (!this.device) {
            throw new Error('WebGPU device not available');
        }

        // Configure canvas context
        this.context = this.canvas.getContext('webgpu');
        this.format = navigator.gpu.getPreferredCanvasFormat();

        this.context.configure({
            device: this.device,
            format: this.format,
            alphaMode: 'premultiplied',
        });

        // Create shader uniforms
        this.uniforms = new ShaderUniforms(this.device);

        console.log('WebGPU initialized successfully');
        return true;
    }

    /**
     * Load shaders from files
     */
    async loadShaders() {
        const [vertexShaderCode, fragmentShaderCode] = await Promise.all([
            fetch('./shaders/logo.vert.wgsl').then(r => r.text()),
            fetch('./shaders/logo.frag.wgsl').then(r => r.text())
        ]);

        return { vertexShaderCode, fragmentShaderCode };
    }

    /**
     * Create render pipeline
     */
    async createPipeline() {
        const { vertexShaderCode, fragmentShaderCode } = await this.loadShaders();

        // Create shader modules
        const vertexShaderModule = this.device.createShaderModule({
            label: 'Vertex Shader',
            code: vertexShaderCode,
        });

        const fragmentShaderModule = this.device.createShaderModule({
            label: 'Fragment Shader',
            code: fragmentShaderCode,
        });

        // Create bind group layout
        const bindGroupLayout = ShaderUniforms.createBindGroupLayout(this.device);

        // Create pipeline layout
        const pipelineLayout = this.device.createPipelineLayout({
            bindGroupLayouts: [bindGroupLayout],
        });

        // Create render pipeline
        this.pipeline = this.device.createRenderPipeline({
            label: 'Logo Render Pipeline',
            layout: pipelineLayout,
            vertex: {
                module: vertexShaderModule,
                entryPoint: 'main',
                buffers: [
                    {
                        arrayStride: 32, // 8 floats * 4 bytes
                        attributes: [
                            {
                                // position
                                shaderLocation: 0,
                                offset: 0,
                                format: 'float32x2',
                            },
                            {
                                // layerIndex
                                shaderLocation: 1,
                                offset: 8,
                                format: 'float32',
                            },
                            {
                                // shapeIndex
                                shaderLocation: 2,
                                offset: 12,
                                format: 'float32',
                            },
                            {
                                // color
                                shaderLocation: 3,
                                offset: 16,
                                format: 'float32x4',
                            },
                        ],
                    },
                ],
            },
            fragment: {
                module: fragmentShaderModule,
                entryPoint: 'main',
                targets: [
                    {
                        format: this.format,
                        // Additive blending - colors add together
                        blend: {
                            color: {
                                srcFactor: 'one',
                                dstFactor: 'one',
                                operation: 'add',
                            },
                            alpha: {
                                srcFactor: 'one',
                                dstFactor: 'one',
                                operation: 'add',
                            },
                        },
                    },
                ],
            },
            primitive: {
                topology: 'triangle-list',
                cullMode: 'none',
            },
        });

        // Create bind group
        this.uniformBindGroup = this.uniforms.createBindGroup(bindGroupLayout);

        console.log('Render pipeline created');
    }

    /**
     * Upload geometry to GPU
     */
    uploadGeometry(buffers) {
        this.geometryBuffers = buffers.map((buffer, index) => {
            // Create vertex buffer
            const vertexBuffer = this.device.createBuffer({
                label: `Vertex Buffer ${index}`,
                size: buffer.vertices.byteLength,
                usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
            });

            this.device.queue.writeBuffer(
                vertexBuffer,
                0,
                buffer.vertices.buffer,
                0,
                buffer.vertices.byteLength
            );

            // Create index buffer
            const indexBuffer = this.device.createBuffer({
                label: `Index Buffer ${index}`,
                size: buffer.indices.byteLength,
                usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
            });

            this.device.queue.writeBuffer(
                indexBuffer,
                0,
                buffer.indices.buffer,
                0,
                buffer.indices.byteLength
            );

            return {
                vertexBuffer,
                indexBuffer,
                indexCount: buffer.indexCount,
                layerIndex: buffer.layerIndex,
            };
        });

        console.log(`Uploaded ${this.geometryBuffers.length} geometry buffers`);
    }

    /**
     * Render frame
     */
    render() {
        if (!this.device || !this.pipeline) return;

        // Update uniforms
        this.uniforms.writeToBuffer();

        // Get current texture
        const textureView = this.context.getCurrentTexture().createView();

        // Create command encoder
        const commandEncoder = this.device.createCommandEncoder();

        // Create render pass
        const renderPass = commandEncoder.beginRenderPass({
            colorAttachments: [
                {
                    view: textureView,
                    clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
                    loadOp: 'clear',
                    storeOp: 'store',
                },
            ],
        });

        renderPass.setPipeline(this.pipeline);
        renderPass.setBindGroup(0, this.uniformBindGroup);

        // Draw all geometry buffers (layers in order)
        this.geometryBuffers
            .sort((a, b) => a.layerIndex - b.layerIndex) // Ensure correct layer order
            .forEach(({ vertexBuffer, indexBuffer, indexCount }) => {
                renderPass.setVertexBuffer(0, vertexBuffer);
                renderPass.setIndexBuffer(indexBuffer, 'uint32');
                renderPass.drawIndexed(indexCount);
            });

        renderPass.end();

        // Submit commands
        this.device.queue.submit([commandEncoder.finish()]);
    }

    /**
     * Handle canvas resize
     */
    resize(width, height) {
        this.canvas.width = width;
        this.canvas.height = height;

        const aspectRatio = width / height;
        this.uniforms.setAspectRatio(aspectRatio);
    }

    /**
     * Get uniforms manager
     */
    getUniforms() {
        return this.uniforms;
    }

    /**
     * Destroy resources
     */
    destroy() {
        this.geometryBuffers.forEach(({ vertexBuffer, indexBuffer }) => {
            vertexBuffer.destroy();
            indexBuffer.destroy();
        });

        if (this.uniforms) {
            this.uniforms.destroy();
        }

        if (this.device) {
            this.device.destroy();
        }
    }
}
