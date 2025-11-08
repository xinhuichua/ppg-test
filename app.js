// PPG SpO2 Monitor Application - Enhanced with D3.js visualization

document.querySelector('#record').addEventListener('click', onRecord);
document.querySelector('#stopBtn').addEventListener('click', stopMeasurement);

const inProduction = false; // set to true to hide video and canvas
const channel = 'r'; // red channel for PPG

let video, c_tmp, ctx_tmp;
let frameCount = 0;
let delay = 0; // processing delay
let xMeanArr = [];
let xMean = 0;
let initTime;
let isSignal = 0;
let acFrame = 0.008;
let acWindow = 0.008;
let stream = null;

let nFrame = 0;
const WINDOW_LENGTH = 300; // 300 frames = 5s @ 60 FPS
let acdc = Array(WINDOW_LENGTH).fill(0.5);
let ac = Array(WINDOW_LENGTH).fill(0.5);

// For SpO2 calculation - track red and green channels
let redBuffer = [];
let greenBuffer = [];
let rawRedBuffer = [];
let rawGreenBuffer = [];
const BUFFER_SIZE = 256;

// Measurements
let heartRate = 0;
let spo2 = 0;
let signalQuality = 0;

// D3 Chart
let lineArr = [];
const MAX_LENGTH = 100;
const DURATION = 100;
let chart = realTimeLineChart();

let constraintsObj = {
  audio: false,
  video: {
    maxWidth: 1280,
    maxHeight: 720,
    frameRate: { ideal: 60 },
    facingMode: 'environment'
  }
};

function setWH() {
  let [w, h] = [video.videoWidth, video.videoHeight];
  document.getElementById('delay').innerHTML = `Frame compute delay: ${delay}`;
  document.getElementById('resolution').innerHTML = `Video resolution: ${w} x ${h}`;
  c_tmp.setAttribute('width', w);
  c_tmp.setAttribute('height', h);
}

function init() {
  c_tmp = document.getElementById('output-canvas');
  if (inProduction) {
    c_tmp.style.display = 'none';
  }
  ctx_tmp = c_tmp.getContext('2d');
}

function computeFrame() {
  if (!stream) return; // Stop if stream is null
  
  if (nFrame > DURATION) {
    ctx_tmp.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
    let frame = ctx_tmp.getImageData(0, 0, video.videoWidth, video.videoHeight);

    // Process each frame - extract RGB values
    const count = frame.data.length / 4;
    let rgbRed = 0;
    let rgbGreen = 0;
    let rgbBlue = 0;
    
    for (let i = 0; i < count; i++) {
      rgbRed += frame.data[i * 4];
      rgbGreen += frame.data[i * 4 + 1];
      rgbBlue += frame.data[i * 4 + 2];
    }
    
    // Calculate mean values
    const redMean = rgbRed / (count * 255);
    const greenMean = rgbGreen / (count * 255);
    
    // Store raw values for SpO2 calculation
    rawRedBuffer.push(redMean);
    rawGreenBuffer.push(greenMean);
    
    // Maintain buffer size
    if (rawRedBuffer.length > BUFFER_SIZE) {
      rawRedBuffer.shift();
      rawGreenBuffer.shift();
    }
    
    // Invert to plot the PPG signal
    xMean = 1 - redMean;

    let xMeanData = {
      time: (new Date() - initTime) / 1000,
      x: xMean
    };

    acdc[nFrame % WINDOW_LENGTH] = xMean;

    // Calculate AC from AC-DC every WINDOW_LENGTH frames
    if (nFrame % WINDOW_LENGTH == 0) {
      document.getElementById('signal-window').innerHTML = `nWindow: ${nFrame / WINDOW_LENGTH}`;
      
      if ((nFrame / 100) % 2 == 0) {
        isSignal = 1;
        ac = detrend(acdc);
        acWindow = windowMean(ac);
        
        // Store processed signals for SpO2 calculation
        redBuffer.push(...ac);
        greenBuffer.push(...detrend(Array(WINDOW_LENGTH).fill(0).map((_, i) => 
          1 - rawGreenBuffer[rawGreenBuffer.length - WINDOW_LENGTH + i]
        )));
        
        // Maintain buffer size
        if (redBuffer.length > BUFFER_SIZE) {
          redBuffer = redBuffer.slice(-BUFFER_SIZE);
          greenBuffer = greenBuffer.slice(-BUFFER_SIZE);
        }
        
        // Calculate measurements
        calculateMeasurements();
        
      } else {
        ac = Array(WINDOW_LENGTH).fill(acWindow);
        isSignal = 0;
      }
    }

    acFrame = ac[nFrame % WINDOW_LENGTH];
    xMeanArr.push(xMeanData);

    document.getElementById('frame-time').innerHTML = `Frame time: ${xMeanData.time.toFixed(2)}`;
    document.getElementById('video-time').innerHTML = `Video time: ${(video.currentTime.toFixed(2))}`;

    const fps = (++frameCount / video.currentTime).toFixed(3);
    document.getElementById('frame-fps').innerHTML = `Frame count: ${frameCount}, FPS: ${fps}`;

    ctx_tmp.putImageData(frame, 0, 0);
  }
  
  nFrame += 1;
  setTimeout(computeFrame, delay);
}

function calculateMeasurements() {
  if (redBuffer.length < 90) return;
  
  // Calculate Heart Rate
  heartRate = calculateHeartRate(redBuffer, 60); // assuming ~60 fps
  
  // Calculate SpO2
  spo2 = calculateSpO2(redBuffer, greenBuffer, rawRedBuffer, rawGreenBuffer);
  
  // Calculate Signal Quality
  signalQuality = calculateSignalQuality(redBuffer);
  
  // Update display
  updateDisplay();
}

function calculateHeartRate(signal, fps) {
  if (signal.length < 60) return 0;
  
  const peaks = findPeaks(signal);
  if (peaks.length < 2) return heartRate; // Keep previous value
  
  const intervals = [];
  for (let i = 1; i < peaks.length; i++) {
    intervals.push(peaks[i] - peaks[i - 1]);
  }
  
  const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const bpm = (60 * fps) / avgInterval;
  
  // Validate range (40-200 BPM)
  if (bpm < 40 || bpm > 200) return heartRate;
  
  return Math.round(bpm);
}

function findPeaks(signal) {
  const peaks = [];
  const threshold = calculateThreshold(signal);
  
  for (let i = 1; i < signal.length - 1; i++) {
    if (signal[i] > signal[i - 1] && 
        signal[i] > signal[i + 1] && 
        signal[i] > threshold) {
      if (peaks.length === 0 || i - peaks[peaks.length - 1] > 9) {
        peaks.push(i);
      }
    }
  }
  
  return peaks;
}

function calculateThreshold(signal) {
  const sorted = [...signal].sort((a, b) => a - b);
  const percentile75 = sorted[Math.floor(sorted.length * 0.75)];
  return percentile75 * 0.5;
}

function calculateSpO2(redProcessed, greenProcessed, redRaw, greenRaw) {
  if (redRaw.length < 90 || greenRaw.length < 90) return 0;
  
  // Calculate AC (pulsatile component) from processed signals
  const redAC = calculateAC(redProcessed);
  const greenAC = calculateAC(greenProcessed);
  
  // Calculate DC (baseline) from raw signals
  const redDC = calculateDC(redRaw);
  const greenDC = calculateDC(greenRaw);
  
  if (redDC === 0 || greenDC === 0) return spo2;
  
  // R value (ratio of ratios)
  const R = (redAC / redDC) / (greenAC / greenDC);
  
  // Empirical calibration formula
  let newSpo2 = 110 - 25 * R;
  
  // Clamp to valid range
  newSpo2 = Math.max(70, Math.min(100, newSpo2));
  
  // Smooth with previous value
  if (spo2 > 0) {
    newSpo2 = spo2 * 0.7 + newSpo2 * 0.3;
  }
  
  return Math.round(newSpo2);
}

function calculateAC(signal) {
  const max = Math.max(...signal);
  const min = Math.min(...signal);
  return (max - min) / 2;
}

function calculateDC(signal) {
  return signal.reduce((a, b) => a + b, 0) / signal.length;
}

function calculateSignalQuality(signal) {
  if (signal.length < 30) return 0;
  
  const ac = calculateAC(signal);
  const noise = calculateNoise(signal);
  
  if (noise === 0) return 100;
  
  const snr = ac / noise;
  const quality = Math.min(100, snr * 20);
  
  return Math.round(quality);
}

function calculateNoise(signal) {
  const diffs = [];
  for (let i = 1; i < signal.length; i++) {
    diffs.push(Math.abs(signal[i] - signal[i - 1]));
  }
  
  const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  const variance = diffs.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / diffs.length;
  
  return Math.sqrt(variance);
}

function updateDisplay() {
  document.getElementById('heartRate').textContent = heartRate > 0 ? heartRate : '--';
  document.getElementById('spo2').textContent = spo2 > 0 ? spo2 : '--';
  document.getElementById('quality').textContent = signalQuality > 0 ? signalQuality : '--';
  
  const qualityElement = document.getElementById('quality');
  if (signalQuality > 70) {
    qualityElement.style.color = '#4caf50';
  } else if (signalQuality > 40) {
    qualityElement.style.color = '#ff9800';
  } else {
    qualityElement.style.color = '#f44336';
  }
  
  // Update status
  if (signalQuality > 60) {
    document.getElementById('status').textContent = 'Measuring... Keep finger steady';
  } else if (nFrame > DURATION) {
    document.getElementById('status').textContent = 'Poor signal quality. Adjust finger position';
  }
}

function windowMean(y) {
  const n = y.length;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += y[i];
  }
  return sum / n;
}

function detrend(y) {
  const n = y.length;
  let x = [];
  for (let i = 0; i <= n; i++) {
    x.push(i);
  }

  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) {
    sx += x[i];
    sy += y[i];
    sxy += x[i] * y[i];
    sxx += x[i] * x[i];
  }
  
  const mx = sx / n;
  const my = sy / n;
  const xx = n * sxx - sx * sx;
  const xy = n * sxy - sx * sy;
  const slope = xy / xx;
  const intercept = my - slope * mx;

  let detrended = [];
  for (let i = 0; i < n; i++) {
    detrended.push(y[i] - (intercept + slope * i));
  }

  return detrended;
}

function onRecord() {
  this.disabled = true;
  document.getElementById('stopBtn').disabled = false;
  document.getElementById('finger-guide').style.display = 'flex';
  document.getElementById('status').textContent = 'Starting camera...';
  
  navigator.mediaDevices.getUserMedia(constraintsObj)
    .then(function(mediaStreamObj) {
      stream = mediaStreamObj;
      
      // Turn on the LED / torch
      const track = mediaStreamObj.getVideoTracks()[0];
      const imageCapture = new ImageCapture(track);
      const photoCapabilities = imageCapture.getPhotoCapabilities()
        .then(() => {
          track.applyConstraints({
            advanced: [{ torch: true }]
          }).catch(err => console.log('No torch available:', err));
        })
        .catch(err => console.log('No torch support:', err));

      video = document.getElementById('video');
      if (inProduction) {
        video.style.display = 'none';
      }

      if ("srcObject" in video) {
        video.srcObject = mediaStreamObj;
      } else {
        video.src = window.URL.createObjectURL(mediaStreamObj);
      }

      video.onloadedmetadata = function(ev) {
        video.play();
      };

      init();
      video.addEventListener('play', setWH);
      video.addEventListener('play', computeFrame);
      video.addEventListener('play', drawLineChart);
      
      document.getElementById('status').textContent = 'Place finger over camera lens...';
    })
    .catch(error => {
      console.log(error);
      document.getElementById('status').textContent = 'Error: Unable to access camera';
      document.getElementById('record').disabled = false;
    });
}

function stopMeasurement() {
  if (stream) {
    // Turn off torch
    const track = stream.getVideoTracks()[0];
    if (track.getCapabilities && track.getCapabilities().torch) {
      track.applyConstraints({
        advanced: [{ torch: false }]
      }).catch(e => console.log('Could not turn off torch'));
    }
    
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
  
  if (video) {
    video.srcObject = null;
  }
  
  document.getElementById('record').disabled = false;
  document.getElementById('stopBtn').disabled = true;
  document.getElementById('finger-guide').style.display = 'none';
  document.getElementById('status').textContent = 'Measurement stopped';
  
  // Reset variables
  nFrame = 0;
  frameCount = 0;
  redBuffer = [];
  greenBuffer = [];
  rawRedBuffer = [];
  rawGreenBuffer = [];
}

function seedData() {
  let now = new Date();
  for (let i = 0; i < MAX_LENGTH; ++i) {
    lineArr.push({
      time: new Date(now.getTime() - initTime - ((MAX_LENGTH - i) * DURATION)),
      x: 0.5,
      signal: isSignal
    });
  }
}

function updateData() {
  if (!stream) return; // Stop updating if measurement stopped
  
  let now = new Date();
  let lineData = {
    time: now - initTime,
    x: acFrame,
    signal: isSignal
  };
  lineArr.push(lineData);
  lineArr.shift();
  
  d3.select("#chart").datum(lineArr).call(chart);
}

function resize() {
  if (d3.select("#chart svg").empty()) {
    return;
  }
  chart.width(+d3.select("#chart").style("width").replace(/(px)/g, ""));
  d3.select("#chart").call(chart);
}

function drawLineChart() {
  initTime = new Date();
  seedData();
  window.setInterval(updateData, 100);
  d3.select("#chart").datum(lineArr).call(chart);
  d3.select(window).on('resize', resize);
}
