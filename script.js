class AudioPitchAnalyzer {
    constructor() {
        this.audioContext = null;
        this.analyser = null;
        this.microphone = null;
        this.scriptProcessor = null;
        this.isAnalyzing = false;
        
        // Graph data
        this.pitchData = [];
        this.maxDataPoints = 200; // Maximum points to keep
        
        // DOM elements
        this.startBtn = document.getElementById('startBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.pitchValue = document.getElementById('pitchValue');
        this.noteValue = document.getElementById('noteValue');
        this.confidenceValue = document.getElementById('confidenceValue');
        this.graphCanvas = document.getElementById('pitchGraph');
        this.ctx = this.graphCanvas.getContext('2d');
        
        // Settings
        this.smoothing = 0.8;
        this.threshold = 0.1;
        
        // Initialize
        this.initEventListeners();
        this.setupSettings();
    }
    
    initEventListeners() {
        this.startBtn.addEventListener('click', () => this.start());
        this.stopBtn.addEventListener('click', () => this.stop());
    }
    
    setupSettings() {
        const smoothingSlider = document.getElementById('smoothing');
        const thresholdSlider = document.getElementById('threshold');
        const smoothingValue = document.getElementById('smoothingValue');
        const thresholdValue = document.getElementById('thresholdValue');
        
        smoothingSlider.addEventListener('input', (e) => {
            this.smoothing = parseFloat(e.target.value);
            smoothingValue.textContent = this.smoothing.toFixed(2);
        });
        
        thresholdSlider.addEventListener('input', (e) => {
            this.threshold = parseFloat(e.target.value);
            thresholdValue.textContent = this.threshold.toFixed(2);
        });
    }
    
    async start() {
        try {
            // Create audio context
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 2048;
            
            // Get microphone stream
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: { 
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false
                } 
            });
            
            this.microphone = this.audioContext.createMediaStreamSource(stream);
            this.microphone.connect(this.analyser);
            
            // Create script processor for real-time analysis
            this.scriptProcessor = this.audioContext.createScriptProcessor(2048, 1, 1);
            this.scriptProcessor.onaudioprocess = this.processAudio.bind(this);
            this.analyser.connect(this.scriptProcessor);
            this.scriptProcessor.connect(this.audioContext.destination);
            
            // Enable buttons
            this.startBtn.disabled = true;
            this.stopBtn.disabled = false;
            
            this.isAnalyzing = true;
            this.animate();
            
        } catch (error) {
            console.error('Error accessing microphone:', error);
            alert('Could not access microphone. Please ensure you have granted permission and that your browser supports this feature.');
        }
    }
    
    stop() {
        if (this.microphone) {
            this.microphone.disconnect();
        }
        if (this.scriptProcessor) {
            this.scriptProcessor.disconnect();
        }
        if (this.analyser) {
            this.analyser.disconnect();
        }
        if (this.audioContext) {
            this.audioContext.close();
        }
        
        this.isAnalyzing = false;
        this.startBtn.disabled = false;
        this.stopBtn.disabled = true;
        
        // Clear canvas
        this.ctx.clearRect(0, 0, this.graphCanvas.width, this.graphCanvas.height);
    }
    
    processAudio(event) {
        if (!this.isAnalyzing) return;
        
        const inputData = event.inputBuffer.getChannelData(0);
        const pitchInfo = this.getPitch(inputData);
        
        if (pitchInfo && pitchInfo.confidence > this.threshold) {
            // Update current values
            this.pitchValue.textContent = Math.round(pitchInfo.frequency) + ' Hz';
            this.noteValue.textContent = this.frequencyToNote(pitchInfo.frequency);
            this.confidenceValue.textContent = Math.round(pitchInfo.confidence * 100) + '%';
            
            // Add to graph data
            this.pitchData.push({
                frequency: pitchInfo.frequency,
                confidence: pitchInfo.confidence,
                timestamp: Date.now()
            });
            
            // Keep only recent data points
            if (this.pitchData.length > this.maxDataPoints) {
                this.pitchData.shift();
            }
        } else {
            // No confident pitch detected
            this.pitchValue.textContent = '-- Hz';
            this.noteValue.textContent = '--';
            this.confidenceValue.textContent = '0%';
        }
    }
    
    getPitch(buffer) {
        // Autocorrelation algorithm for pitch detection
        const SIZE = buffer.length;
        const rms = this.getRootMeanSquare(buffer);
        
        if (rms < 0.01) {
            return null; // Not enough signal
        }
        
        let r1 = 0, r2 = SIZE - 1, thres = 0.2;
        for (let i = 0; i < SIZE / 2; i++) {
            if (Math.abs(buffer[i]) < thres) {
                r1 = i;
                break;
            }
        }
        for (let i = 1; i < SIZE / 2; i++) {
            if (Math.abs(buffer[SIZE - i]) < thres) {
                r2 = SIZE - i;
                break;
            }
        }
        
        // Create autocorrelation function
        const autocorrelation = new Float32Array(SIZE);
        for (let lag = 0; lag < SIZE; lag++) {
            let sum = 0;
            for (let i = 0; i < SIZE - lag; i++) {
                sum += buffer[i] * buffer[i + lag];
            }
            autocorrelation[lag] = sum;
        }
        
        // Find peak in autocorrelation
        let maxValue = 0;
        let maxIndex = 0;
        for (let i = r1; i < r2; i++) {
            if (autocorrelation[i] > maxValue) {
                maxValue = autocorrelation[i];
                maxIndex = i;
            }
        }
        
        if (maxIndex === 0) return null;
        
        const frequency = this.audioContext.sampleRate / maxIndex;
        const confidence = maxValue / autocorrelation[0];
        
        return {
            frequency: frequency,
            confidence: confidence
        };
    }
    
    getRootMeanSquare(buffer) {
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
            sum += buffer[i] * buffer[i];
        }
        return Math.sqrt(sum / buffer.length);
    }
    
    frequencyToNote(frequency) {
        if (!frequency || frequency < 20 || frequency > 2000) return '--';
        
        const A4 = 440;
        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        
        const semitonesFromA4 = 12 * Math.log2(frequency / A4);
        const noteIndex = Math.round(semitonesFromA4) % 12;
        const octave = Math.floor(semitonesFromA4 / 12) + 4;
        
        return noteNames[(noteIndex + 12) % 12] + octave;
    }
    
    animate() {
        if (!this.isAnalyzing) return;
        
        this.drawGraph();
        requestAnimationFrame(this.animate.bind(this));
    }
    
    drawGraph() {
        const width = this.graphCanvas.width;
        const height = this.graphCanvas.height;
        
        // Clear canvas
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
        this.ctx.fillRect(0, 0, width, height);
        
        if (this.pitchData.length < 2) return;
        
        // Calculate min/max frequencies for scaling
        let minFreq = Infinity, maxFreq = 0;
        this.pitchData.forEach(point => {
            if (point.frequency) {
                minFreq = Math.min(minFreq, point.frequency);
                maxFreq = Math.max(maxFreq, point.frequency);
            }
        });
        
        if (minFreq === Infinity) return;
        
        // Add some padding to the scale
        const padding = (maxFreq - minFreq) * 0.1;
        minFreq -= padding;
        maxFreq += padding;
        
        // Draw grid lines
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        this.ctx.lineWidth = 1;
        
        // Horizontal grid lines
        for (let i = 0; i <= 10; i++) {
            const y = (height / 10) * i;
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(width, y);
            this.ctx.stroke();
            
            // Frequency labels
            const freq = maxFreq - ((maxFreq - minFreq) * (i / 10));
            if (i % 2 === 0) {
                this.ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
                this.ctx.font = '12px Arial';
                this.ctx.fillText(Math.round(freq) + ' Hz', 5, y - 5);
            }
        }
        
        // Draw pitch curve
        this.ctx.strokeStyle = '#4CAF50';
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        
        const stepX = width / (this.maxDataPoints - 1);
        
        for (let i = 0; i < this.pitchData.length; i++) {
            const point = this.pitchData[i];
            if (!point.frequency) continue;
            
            const x = i * stepX;
            const y = height - ((point.frequency - minFreq) / (maxFreq - minFreq)) * height;
            
            if (i === 0) {
                this.ctx.moveTo(x, y);
            } else {
                this.ctx.lineTo(x, y);
            }
        }
        
        this.ctx.stroke();
        
        // Draw current position indicator
        if (this.pitchData.length > 0) {
            const lastPoint = this.pitchData[this.pitchData.length - 1];
            if (lastPoint.frequency) {
                const x = width - 10;
                const y = height - ((lastPoint.frequency - minFreq) / (maxFreq - minFreq)) * height;
                
                this.ctx.fillStyle = '#FFEB3B';
                this.ctx.beginPath();
                this.ctx.arc(x, y, 6, 0, 2 * Math.PI);
                this.ctx.fill();
            }
        }
    }
}

// Initialize the application when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new AudioPitchAnalyzer();
});