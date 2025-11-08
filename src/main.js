document.querySelector('#record').addEventListener('click', onRecord);

const inProduction = true; // hide video and tmp canvas
const channel = 'r'; // red only, green='g' and blue='b' channels can be added

let video, c_tmp, ctx_tmp; // video from rear-facing-camera and tmp canvas
let frameCount = 0; // count number of video frames processed 
let delay = 0; // delay = 100; should give us 10 fps, estimated around 7
let numOfQualityFrames = 0; // TODO: count the number of quality frames
let xMeanArr = [];
let xMean = 0;
let initTime;
let isSignal = 0;
let acFrame = 0.008; // start with dummy flat signal
let acWindow = 0.008;

let nFrame = 0;
const WINDOW_LENGTH = 300; // 300 frames = 5s @ 60 FPS
let acdc = Array(WINDOW_LENGTH).fill(0.5);
let ac = Array(WINDOW_LENGTH).fill(0.5);

// SpO2 calculation buffers
let redRawBuffer = [];
let greenRawBuffer = [];
let redProcessedBuffer = [];
let greenProcessedBuffer = [];
const SPO2_BUFFER_SIZE = 256;

// Measurements
let heartRate = 0;
let spo2 = 0;
let signalQuality = 0;

// draw the signal data as it comes
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
    facingMode: 'environment' // rear-facing-camera
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
  if (nFrame > DURATION) {
    ctx_tmp.drawImage(video,
      0, 0, video.videoWidth, video.videoHeight);
    let frame = ctx_tmp.getImageData(
      0, 0, video.videoWidth, video.videoHeight);

    // process each frame - extract RGB values
    const count = frame.data.length / 4;
    let rgbRed = 0;
    let rgbGreen = 0;
    
    for (let i = 0; i < count; i++) {
      rgbRed += frame.data[i * 4];
      rgbGreen += frame.data[i * 4 + 1];
    }
    
    // Calculate raw mean values for SpO2
    const redRaw = rgbRed / (count * 255);
    const greenRaw = rgbGreen / (count * 255);
    
    // Store raw values for DC calculation
    redRawBuffer.push(redRaw);
    greenRawBuffer.push(greenRaw);
    
    // Maintain buffer size
    if (redRawBuffer.length > SPO2_BUFFER_SIZE) {
      redRawBuffer.shift();
      greenRawBuffer.shift();
    }
    
    // invert to plot the PPG signal
    xMean = 1 - redRaw;

    let xMeanData = {
      time: (new Date() - initTime) / 1000,
      x: xMean
    };

    acdc[nFrame % WINDOW_LENGTH] = xMean;

    // TODO: calculate AC from AC-DC only each WINDOW_LENGTH time:
    if (nFrame % WINDOW_LENGTH == 0) {
      document.getElementById('signal-window').innerHTML = `nWindow: ${nFrame / WINDOW_LENGTH}`;
      console.log('Window complete at nFrame:', nFrame, 'buffers:', redRawBuffer.length, greenRawBuffer.length);
      
      if ((nFrame / 100) % 2 == 0) {
        isSignal = 1;
        ac = detrend(acdc);
        acWindow = windowMean(ac);
        
        // Store processed signals for SpO2 calculation
        const greenSignal = [];
        for (let i = 0; i < WINDOW_LENGTH; i++) {
          if (greenRawBuffer.length >= WINDOW_LENGTH) {
            greenSignal.push(1 - greenRawBuffer[greenRawBuffer.length - WINDOW_LENGTH + i]);
          }
        }
        
        console.log('Green signal length:', greenSignal.length);
        
        if (greenSignal.length === WINDOW_LENGTH) {
          const greenDetrended = detrend(greenSignal);
          
          // Add to processed buffers
          redProcessedBuffer.push(...ac);
          greenProcessedBuffer.push(...greenDetrended);
          
          // Maintain buffer size
          if (redProcessedBuffer.length > SPO2_BUFFER_SIZE) {
            redProcessedBuffer = redProcessedBuffer.slice(-SPO2_BUFFER_SIZE);
            greenProcessedBuffer = greenProcessedBuffer.slice(-SPO2_BUFFER_SIZE);
          }
          
          console.log('Processed buffers updated:', redProcessedBuffer.length, greenProcessedBuffer.length);
          
          // Calculate measurements
          calculateVitalSigns();
        } else {
          console.log('Not enough green signal data yet');
        }
        
      } else {
        ac = Array(WINDOW_LENGTH).fill(acWindow);
        isSignal = 0;
      }
    }

    acFrame = ac[nFrame % WINDOW_LENGTH];

    xMeanArr.push(xMeanData);

    document.getElementById('frame-time').innerHTML = `Frame time: ${xMeanData.time.toFixed(2)}`;
    document.getElementById('video-time').innerHTML = `Video time: ${(video.currentTime.toFixed(2))}`;
    document.getElementById('signal').innerHTML = `X: ${xMeanData.x}`;

    const fps = (++frameCount / video.currentTime).toFixed(3);
    document.getElementById('frame-fps').innerHTML = `Frame count: ${frameCount}, FPS: ${fps}`;

    ctx_tmp.putImageData(frame, 0, 0);
  }
  nFrame += 1;
  setTimeout(computeFrame, delay); // continue with delay
}

function calculateVitalSigns() {
  console.log('calculateVitalSigns called');
  console.log('Buffer lengths - redProcessed:', redProcessedBuffer.length, 'redRaw:', redRawBuffer.length);
  
  if (redProcessedBuffer.length < 90 || redRawBuffer.length < 90) {
    console.log('Not enough data yet');
    return;
  }
  
  // Calculate Heart Rate
  heartRate = calculateHeartRate(redProcessedBuffer, 60);
  console.log('Heart Rate calculated:', heartRate);
  
  // Calculate SpO2
  spo2 = calculateSpO2(redProcessedBuffer, greenProcessedBuffer, redRawBuffer, greenRawBuffer);
  console.log('SpO2 calculated:', spo2);
  
  // Calculate Signal Quality
  signalQuality = calculateSignalQuality(redProcessedBuffer);
  console.log('Signal Quality calculated:', signalQuality);
  
  // Update display
  updateVitalSignsDisplay();
}

function calculateHeartRate(signal, fps) {
  if (signal.length < 60) return heartRate; // Keep previous
  
  const peaks = findPeaks(signal);
  if (peaks.length < 2) return heartRate;
  
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
  console.log('SpO2 calc - lengths:', {
    redProcessed: redProcessed.length,
    greenProcessed: greenProcessed.length,
    redRaw: redRaw.length,
    greenRaw: greenRaw.length
  });
  
  if (redRaw.length < 90 || greenRaw.length < 90) {
    console.log('SpO2: Not enough raw data');
    return spo2;
  }
  
  if (redProcessed.length < 90 || greenProcessed.length < 90) {
    console.log('SpO2: Not enough processed data');
    return spo2;
  }
  
  // Calculate AC (pulsatile component) from processed signals
  const redAC = calculateAC(redProcessed);
  const greenAC = calculateAC(greenProcessed);
  
  // Calculate DC (baseline) from raw signals
  const redDC = calculateDC(redRaw.slice(-Math.min(SPO2_BUFFER_SIZE, redRaw.length)));
  const greenDC = calculateDC(greenRaw.slice(-Math.min(SPO2_BUFFER_SIZE, greenRaw.length)));
  
  console.log('AC/DC values:', { redAC, greenAC, redDC, greenDC });
  
  if (redDC === 0 || greenDC === 0 || redAC === 0 || greenAC === 0) {
    console.log('SpO2: Zero AC or DC value');
    return spo2;
  }
  
  // R value (ratio of ratios)
  // Using red and green channels (green approximates IR in phone cameras)
  const R = (redAC / redDC) / (greenAC / greenDC);
  console.log('R value:', R);
  
  // Empirical calibration formula
  // Note: Coefficients may need tuning based on device
  let newSpo2 = 110 - 25 * R;
  console.log('Raw SpO2 before clamping:', newSpo2);
  
  // Clamp to valid range
  newSpo2 = Math.max(70, Math.min(100, newSpo2));
  
  // Smooth with previous value (exponential moving average)
  if (spo2 > 0) {
    newSpo2 = spo2 * 0.7 + newSpo2 * 0.3;
  }
  
  console.log('Final SpO2:', Math.round(newSpo2));
  return Math.round(newSpo2);
}

function calculateAC(signal) {
  if (signal.length === 0) return 0;
  const max = Math.max(...signal);
  const min = Math.min(...signal);
  return (max - min) / 2;
}

function calculateDC(signal) {
  if (signal.length === 0) return 0;
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
  if (signal.length < 2) return 0;
  
  const diffs = [];
  for (let i = 1; i < signal.length; i++) {
    diffs.push(Math.abs(signal[i] - signal[i - 1]));
  }
  
  const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  const variance = diffs.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / diffs.length;
  
  return Math.sqrt(variance);
}

function updateVitalSignsDisplay() {
  console.log('Updating display with:', { heartRate, spo2, signalQuality });
  
  const hrElement = document.getElementById('heartRate');
  const spo2Element = document.getElementById('spo2');
  const qualityElement = document.getElementById('quality');
  
  if (hrElement) {
    hrElement.textContent = `Heart Rate: ${heartRate > 0 ? heartRate : '--'} BPM`;
  }
  
  if (spo2Element) {
    spo2Element.textContent = `SpO2: ${spo2 > 0 ? spo2 : '--'} %`;
    spo2Element.style.color = spo2 > 0 ? '#e91e63' : '#666';
  }
  
  const qualityText = signalQuality > 0 ? signalQuality : '--';
  let qualityColor = '#666';
  
  if (signalQuality > 70) {
    qualityColor = '#4caf50'; // green
  } else if (signalQuality > 40) {
    qualityColor = '#ff9800'; // orange
  } else if (signalQuality > 0) {
    qualityColor = '#f44336'; // red
  }
  
  if (qualityElement) {
    qualityElement.innerHTML = `Signal Quality: <span style="color: ${qualityColor}; font-weight: bold;">${qualityText}%</span>`;
  }
  
  console.log('Display updated successfully');
}

function windowMean(y) {
  const n = y.length;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += y[i]
  }

  return sum / n;
}

function detrend(y) {
  const n = y.length;
  let x = [];
  for (let i = 0; i <= n; i++) {
    x.push(i);
  }

  let sx = 0;
  let sy = 0;
  let sxy = 0;
  let sxx = 0;
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

  detrended = [];
  for (let i = 0; i < n; i++) {
    detrended.push(y[i] - (intercept + slope * i));
  }

  return detrended;
}

function onRecord() {
  this.disabled = true;
  navigator.mediaDevices.getUserMedia(constraintsObj)
    .then(function(mediaStreamObj) {

      // we must turn on the LED / torch
      const track = mediaStreamObj.getVideoTracks()[0];
      const imageCapture = new ImageCapture(track)
      const photoCapabilities = imageCapture.getPhotoCapabilities()
        .then(() => {
          track.applyConstraints({
              advanced: [{ torch: true }]
            })
            .catch(err => console.log('No torch', err));
        })
        .catch(err => console.log('No torch', err));

      video = document.getElementById('video');
      if (inProduction) {
        video.style.display = 'none';
      }

      if ("srcObject" in video) {
        video.srcObject = mediaStreamObj;
      } else {
        // for older versions of browsers
        video.src = window.URL.createObjectURL(mediaStreamObj);
      }

      video.onloadedmetadata = function(ev) {
        video.play();
      };

      init();
      video.addEventListener('play', setWH);
      video.addEventListener('play', computeFrame);
      video.addEventListener('play', drawLineChart);

      video.onpause = function() {
        console.log('paused');
      };
    })
    .catch(error => console.log(error));
}

function pauseVideo() {
  video.pause();
  video.currentTime = 0;
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
  let now = new Date();

  let lineData = {
    time: now - initTime,
    x: acFrame,
    signal: isSignal
  };
  lineArr.push(lineData);

  // if (lineArr.length > 1) {
  lineArr.shift();
  // }
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
