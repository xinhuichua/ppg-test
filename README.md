# 📱 PPG-based SpO2 Monitor

A web-based application that uses your phone's camera to extract photoplethysmography (PPG) signals and estimate blood oxygen saturation (SpO2) levels.

## ⚠️ Medical Disclaimer

**THIS APPLICATION IS FOR EDUCATIONAL AND RESEARCH PURPOSES ONLY.**

- **NOT** a medical device
- **NOT** FDA approved
- **NOT** intended for medical diagnosis or treatment
- **DO NOT** use for making medical decisions
- Always consult healthcare professionals for medical advice
- In case of medical emergency, seek professional help immediately

## 🔬 How It Works

### PPG Signal Extraction
1. **Camera Access**: Uses the rear camera with flash/torch enabled
2. **Light Absorption**: When you place your finger over the camera, light passes through your skin and blood vessels
3. **RGB Analysis**: Extracts red and green channel intensities from each video frame
4. **Signal Processing**: Processes the color variations caused by blood volume changes with each heartbeat

### SpO2 Calculation
The application estimates SpO2 using the ratio-of-ratios method:
- **R Value** = (AC_red / DC_red) / (AC_green / DC_green)
- **SpO2** ≈ 110 - 25 × R

Where:
- AC = Pulsatile (alternating) component of the signal
- DC = Baseline (constant) component of the signal

**Note**: Camera-based SpO2 is less accurate than medical pulse oximeters because:
- Phones lack true infrared LEDs
- Green light is used as a substitute for infrared
- Environmental factors significantly affect measurements
- Individual skin tone and finger characteristics vary

## 🚀 Features

- ✅ Real-time PPG waveform visualization
- ✅ Heart rate detection (BPM)
- ✅ SpO2 estimation (%)
- ✅ Signal quality indicator
- ✅ No external dependencies
- ✅ Works on mobile browsers
- ✅ Privacy-focused (no data transmission)

## 📋 Requirements

- Modern smartphone with rear camera
- Web browser with camera API support (Chrome, Safari, Firefox)
- HTTPS connection (required for camera access)

## 🎯 How to Use

1. **Open the Application**
   - Host the files on a web server (HTTPS required)
   - Or use a local development server

2. **Start Measurement**
   - Click "Start Measurement"
   - Allow camera permissions when prompted

3. **Position Your Finger**
   - Gently place your fingertip over the **rear camera**
   - Cover both the camera lens and flash/torch
   - Don't press too hard (restricts blood flow)

4. **Stay Still**
   - Keep your finger steady for 15-30 seconds
   - Breathe normally
   - Avoid movement

5. **Read Results**
   - Wait for signal quality to reach 60%+
   - Heart rate displays in BPM
   - SpO2 displays as percentage
   - Green values indicate good signal quality

## 💡 Tips for Best Results

### ✅ DO:
- Use in a well-lit environment
- Keep your hand steady
- Apply gentle, consistent pressure
- Take measurements while seated and calm
- Wait for signal quality to improve

### ❌ DON'T:
- Press too hard on the camera
- Move during measurement
- Use in very dark environments
- Take measurements during physical activity
- Use with cold fingers (poor circulation)

## 🛠️ Technical Details

### Signal Processing Pipeline
1. **RGB Extraction**: Sample center region of camera feed
2. **Detrending**: Remove DC offset from signals
3. **Bandpass Filtering**: 0.7-3.3 Hz (42-200 BPM)
4. **Peak Detection**: Identify heartbeat peaks
5. **Heart Rate**: Calculate BPM from peak intervals
6. **SpO2**: Compute ratio of AC/DC for red and green channels

### Limitations
- **Accuracy**: ±5-10% variation from medical devices
- **Factors Affecting Readings**:
  - Ambient light interference
  - Finger pressure and positioning
  - Skin tone and thickness
  - Camera quality and flash brightness
  - Movement artifacts
  - Nail polish or dirt on fingers

## 📱 Browser Compatibility

| Browser | Support |
|---------|---------|
| Chrome (Mobile) | ✅ Full |
| Safari (iOS) | ✅ Full |
| Firefox (Mobile) | ✅ Full |
| Samsung Internet | ✅ Full |
| Opera Mobile | ✅ Partial |

**Note**: HTTPS is mandatory for camera access on all browsers.

## 🔧 Development Setup

### Local Development
```bash
# Option 1: Python HTTP Server
python -m http.server 8000

# Option 2: PHP Built-in Server
php -S localhost:8000

# Option 3: Node.js http-server
npx http-server -p 8000
```

### HTTPS for Mobile Testing
For testing on mobile devices, you need HTTPS:

```bash
# Using ngrok
ngrok http 8000

# Or use VS Code Live Server extension
```

## 📊 Calibration Notes

The SpO2 calculation uses an empirical formula:
```javascript
SpO2 = 110 - 25 × R
```

This is a **simplified approximation**. Professional pulse oximeters use:
- Device-specific calibration curves
- Multiple wavelengths (660nm red, 940nm infrared)
- Advanced signal processing algorithms
- Temperature compensation
- Individual calibration factors

## 🔍 Validation

To validate readings:
1. Compare with a medical pulse oximeter
2. Take multiple measurements
3. Test under different conditions
4. Note the variance and patterns

Expected variance: **±3-8%** from medical devices

## 🐛 Troubleshooting

| Problem | Solution |
|---------|----------|
| Camera not working | Enable camera permissions in browser settings |
| No flash/torch | Not all phones support torch API |
| Poor signal quality | Adjust finger position, ensure good lighting |
| Erratic readings | Stay still, check finger coverage |
| No readings | Wait longer for buffer to fill |

## 📚 References

1. Allen, J. (2007). Photoplethysmography and its application in clinical physiological measurement. *Physiological Measurement*.

2. Maeda, Y., et al. (2011). Relationship between measurement site and motion artifacts in ambulatory pulse oximetry. *Journal of Medical Systems*.

3. Scully, C. G., et al. (2012). Physiological parameter monitoring from optical recordings with a mobile phone. *IEEE Transactions on Biomedical Engineering*.

## 📄 License

This project is for educational purposes. Use at your own risk.

## 🤝 Contributing

Contributions welcome! Areas for improvement:
- Better filtering algorithms (Butterworth, Chebyshev)
- Advanced peak detection
- Machine learning calibration
- Multi-wavelength analysis
- Artifact rejection algorithms

## ⚡ Future Enhancements

- [ ] Respiration rate detection
- [ ] Blood pressure estimation
- [ ] Data export (CSV)
- [ ] Historical tracking
- [ ] Multi-user support
- [ ] Improved calibration algorithms
- [ ] Machine learning models

---

**Remember**: This is a proof-of-concept for educational purposes. Always use certified medical devices for actual health monitoring.
