// PPG SpO2 Monitor Application

class PPGMonitor {
    constructor() {
        this.video = document.getElementById('video');
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.isRunning = false;
        this.stream = null;
        
        // Signal buffers
        this.redBuffer = [];
        this.greenBuffer = [];
        this.blueBuffer = [];
        this.bufferSize = 256; // ~8-10 seconds at 30fps
        this.minBufferSize = 90; // Minimum samples needed
        
        // Measurements
        this.heartRate = 0;
        this.spo2 = 0;
        this.signalQuality = 0;
        
        // Chart setup
        this.setupChart();
        
        // Bind events
        this.bindEvents();
    }
    
    bindEvents() {
        document.getElementById('startBtn').addEventListener('click', () => this.start());
        document.getElementById('stopBtn').addEventListener('click', () => this.stop());
    }
    
    async start() {
        try {
            this.updateStatus('Requesting camera access...');
            
            // Request rear camera with flash/torch
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'environment', // Rear camera
                    width: { ideal: 640 },
                    height: { ideal: 480 }
                },
                audio: false
            });
            
            this.video.srcObject = this.stream;
            
            // Try to enable flash/torch
            const track = this.stream.getVideoTracks()[0];
            if (track.getCapabilities && track.getCapabilities().torch) {
                await track.applyConstraints({
                    advanced: [{ torch: true }]
                });
            }
            
            this.isRunning = true;
            this.resetBuffers();
            
            document.getElementById('startBtn').disabled = true;
            document.getElementById('stopBtn').disabled = false;
            document.getElementById('finger-guide').style.display = 'flex';
            
            this.updateStatus('Place finger over camera lens...');
            
            // Start processing
            this.processFrame();
            
        } catch (error) {
            console.error('Error accessing camera:', error);
            this.updateStatus('Error: Unable to access camera. ' + error.message);
        }
    }
    
    stop() {
        this.isRunning = false;
        
        if (this.stream) {
            // Turn off torch
            const track = this.stream.getVideoTracks()[0];
            if (track.getCapabilities && track.getCapabilities().torch) {
                track.applyConstraints({
                    advanced: [{ torch: false }]
                }).catch(e => console.log('Could not turn off torch'));
            }
            
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        
        this.video.srcObject = null;
        
        document.getElementById('startBtn').disabled = false;
        document.getElementById('stopBtn').disabled = true;
        document.getElementById('finger-guide').style.display = 'none';
        
        this.updateStatus('Measurement stopped');
        this.resetBuffers();
    }
    
    resetBuffers() {
        this.redBuffer = [];
        this.greenBuffer = [];
        this.blueBuffer = [];
    }
    
    processFrame() {
        if (!this.isRunning) return;
        
        // Set canvas size to match video
        this.canvas.width = this.video.videoWidth;
        this.canvas.height = this.video.videoHeight;
        
        // Draw current frame to canvas
        this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
        
        // Extract RGB values from center region
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        const sampleSize = Math.min(this.canvas.width, this.canvas.height) / 4;
        
        const imageData = this.ctx.getImageData(
            centerX - sampleSize / 2,
            centerY - sampleSize / 2,
            sampleSize,
            sampleSize
        );
        
        // Calculate average RGB values
        const { red, green, blue } = this.extractRGB(imageData);
        
        // Add to buffers
        this.redBuffer.push(red);
        this.greenBuffer.push(green);
        this.blueBuffer.push(blue);
        
        // Maintain buffer size
        if (this.redBuffer.length > this.bufferSize) {
            this.redBuffer.shift();
            this.greenBuffer.shift();
            this.blueBuffer.shift();
        }
        
        // Process signal if we have enough data
        if (this.redBuffer.length >= this.minBufferSize) {
            this.processSignal();
            this.updateDisplay();
            this.drawChart();
        } else {
            const progress = Math.round((this.redBuffer.length / this.minBufferSize) * 100);
            this.updateStatus(`Collecting data... ${progress}%`);
        }
        
        // Continue processing
        requestAnimationFrame(() => this.processFrame());
    }
    
    extractRGB(imageData) {
        const data = imageData.data;
        let r = 0, g = 0, b = 0;
        const pixelCount = data.length / 4;
        
        for (let i = 0; i < data.length; i += 4) {
            r += data[i];
            g += data[i + 1];
            b += data[i + 2];
        }
        
        return {
            red: r / pixelCount,
            green: g / pixelCount,
            blue: b / pixelCount
        };
    }
    
    processSignal() {
        // Detrend signals (remove DC component)
        const redSignal = this.detrend(this.redBuffer);
        const greenSignal = this.detrend(this.greenBuffer);
        
        // Apply bandpass filter (0.7-3.3 Hz for 42-200 BPM)
        const redFiltered = this.bandpassFilter(redSignal, 0.7, 3.3, 30);
        const greenFiltered = this.bandpassFilter(greenSignal, 0.7, 3.3, 30);
        
        // Calculate heart rate from red channel
        this.heartRate = this.calculateHeartRate(redFiltered, 30);
        
        // Calculate SpO2 using R/IR ratio
        this.spo2 = this.calculateSpO2(redFiltered, greenFiltered);
        
        // Calculate signal quality
        this.signalQuality = this.calculateSignalQuality(redFiltered);
        
        // Update status
        if (this.signalQuality > 60) {
            this.updateStatus('Measuring... Keep finger steady');
        } else {
            this.updateStatus('Poor signal quality. Adjust finger position');
        }
    }
    
    detrend(signal) {
        const mean = signal.reduce((a, b) => a + b, 0) / signal.length;
        return signal.map(val => val - mean);
    }
    
    bandpassFilter(signal, lowCut, highCut, fps) {
        // Simple moving average filter for demonstration
        // In production, use proper Butterworth or IIR filter
        const windowSize = 5;
        const filtered = [];
        
        for (let i = 0; i < signal.length; i++) {
            let sum = 0;
            let count = 0;
            
            for (let j = Math.max(0, i - windowSize); j <= Math.min(signal.length - 1, i + windowSize); j++) {
                sum += signal[j];
                count++;
            }
            
            filtered.push(sum / count);
        }
        
        return filtered;
    }
    
    calculateHeartRate(signal, fps) {
        if (signal.length < 60) return 0;
        
        // Find peaks in the signal
        const peaks = this.findPeaks(signal);
        
        if (peaks.length < 2) return 0;
        
        // Calculate average interval between peaks
        const intervals = [];
        for (let i = 1; i < peaks.length; i++) {
            intervals.push(peaks[i] - peaks[i - 1]);
        }
        
        const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        
        // Convert to BPM
        const bpm = (60 * fps) / avgInterval;
        
        // Validate range (40-200 BPM)
        if (bpm < 40 || bpm > 200) return this.heartRate;
        
        return Math.round(bpm);
    }
    
    findPeaks(signal) {
        const peaks = [];
        const threshold = this.calculateThreshold(signal);
        
        for (let i = 1; i < signal.length - 1; i++) {
            if (signal[i] > signal[i - 1] && 
                signal[i] > signal[i + 1] && 
                signal[i] > threshold) {
                // Ensure minimum distance between peaks (at least 0.3 seconds)
                if (peaks.length === 0 || i - peaks[peaks.length - 1] > 9) {
                    peaks.push(i);
                }
            }
        }
        
        return peaks;
    }
    
    calculateThreshold(signal) {
        const sorted = [...signal].sort((a, b) => a - b);
        const percentile75 = sorted[Math.floor(sorted.length * 0.75)];
        return percentile75 * 0.5;
    }
    
    calculateSpO2(redSignal, greenSignal) {
        // Calculate AC/DC ratio for red and green channels
        const redAC = this.calculateAC(redSignal);
        const redDC = this.calculateDC(this.redBuffer);
        
        const greenAC = this.calculateAC(greenSignal);
        const greenDC = this.calculateDC(this.greenBuffer);
        
        if (redDC === 0 || greenDC === 0) return 0;
        
        // R value (ratio of ratios)
        const R = (redAC / redDC) / (greenAC / greenDC);
        
        // Empirical calibration formula
        // Note: This is a simplified approximation
        // Real devices use sophisticated calibration curves
        let spo2 = 110 - 25 * R;
        
        // Clamp to valid range
        spo2 = Math.max(70, Math.min(100, spo2));
        
        // Add noise reduction
        if (this.spo2 > 0) {
            spo2 = this.spo2 * 0.7 + spo2 * 0.3; // Smooth with previous value
        }
        
        return Math.round(spo2);
    }
    
    calculateAC(signal) {
        // AC component (peak-to-peak amplitude)
        const max = Math.max(...signal);
        const min = Math.min(...signal);
        return (max - min) / 2;
    }
    
    calculateDC(signal) {
        // DC component (mean)
        return signal.reduce((a, b) => a + b, 0) / signal.length;
    }
    
    calculateSignalQuality(signal) {
        if (signal.length < 30) return 0;
        
        // Calculate SNR-like metric
        const ac = this.calculateAC(signal);
        const noise = this.calculateNoise(signal);
        
        if (noise === 0) return 100;
        
        const snr = ac / noise;
        const quality = Math.min(100, snr * 20);
        
        return Math.round(quality);
    }
    
    calculateNoise(signal) {
        // Estimate noise as standard deviation of high-frequency components
        const diffs = [];
        for (let i = 1; i < signal.length; i++) {
            diffs.push(Math.abs(signal[i] - signal[i - 1]));
        }
        
        const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
        const variance = diffs.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / diffs.length;
        
        return Math.sqrt(variance);
    }
    
    updateDisplay() {
        document.getElementById('heartRate').textContent = this.heartRate > 0 ? this.heartRate : '--';
        document.getElementById('spo2').textContent = this.spo2 > 0 ? this.spo2 : '--';
        document.getElementById('quality').textContent = this.signalQuality > 0 ? this.signalQuality : '--';
        
        // Color code quality
        const qualityElement = document.getElementById('quality');
        if (this.signalQuality > 70) {
            qualityElement.style.color = '#4caf50';
        } else if (this.signalQuality > 40) {
            qualityElement.style.color = '#ff9800';
        } else {
            qualityElement.style.color = '#f44336';
        }
    }
    
    updateStatus(message) {
        document.getElementById('status').textContent = message;
    }
    
    setupChart() {
        this.chartCanvas = document.getElementById('ppgChart');
        this.chartCtx = this.chartCanvas.getContext('2d');
        this.chartCanvas.width = this.chartCanvas.offsetWidth;
        this.chartCanvas.height = 200;
    }
    
    drawChart() {
        const canvas = this.chartCanvas;
        const ctx = this.chartCtx;
        
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        if (this.redBuffer.length === 0) return;
        
        // Detrend for visualization
        const signal = this.detrend(this.redBuffer);
        
        // Normalize signal
        const max = Math.max(...signal);
        const min = Math.min(...signal);
        const range = max - min;
        
        if (range === 0) return;
        
        const normalized = signal.map(val => (val - min) / range);
        
        // Draw grid
        ctx.strokeStyle = '#e0e0e0';
        ctx.lineWidth = 1;
        for (let i = 0; i < 5; i++) {
            const y = (canvas.height / 4) * i;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.width, y);
            ctx.stroke();
        }
        
        // Draw waveform
        ctx.strokeStyle = '#e91e63';
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        const step = canvas.width / (normalized.length - 1);
        
        for (let i = 0; i < normalized.length; i++) {
            const x = i * step;
            const y = canvas.height - (normalized[i] * canvas.height * 0.8 + canvas.height * 0.1);
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        
        ctx.stroke();
    }
}

// Initialize app
const monitor = new PPGMonitor();
