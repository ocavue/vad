(() => {
  // src/logging.ts
  var LOG_PREFIX = "[VAD]";
  var levels = ["error", "debug", "warn"];
  function getLog(level) {
    return (...args) => {
      console[level](LOG_PREFIX, ...args);
    };
  }
  var _log = levels.reduce((acc, level) => {
    acc[level] = getLog(level);
    return acc;
  }, {});
  var log = _log;

  // src/resampler.ts
  var Resampler = class {
    constructor(options) {
      this.options = options;
      this.process = (audioFrame) => {
        const outputFrames = [];
        for (const sample of audioFrame) {
          this.inputBuffer.push(sample);
          while (this.hasEnoughDataForFrame()) {
            const outputFrame = this.generateOutputFrame();
            outputFrames.push(outputFrame);
          }
        }
        return outputFrames;
      };
      this.stream = async function* (audioInput) {
        for (const sample of audioInput) {
          this.inputBuffer.push(sample);
          while (this.hasEnoughDataForFrame()) {
            const outputFrame = this.generateOutputFrame();
            yield outputFrame;
          }
        }
      };
      if (options.nativeSampleRate < 16e3) {
        log.error(
          "nativeSampleRate is too low. Should have 16000 = targetSampleRate <= nativeSampleRate"
        );
      }
      this.inputBuffer = [];
    }
    hasEnoughDataForFrame() {
      return this.inputBuffer.length * this.options.targetSampleRate / this.options.nativeSampleRate >= this.options.targetFrameSize;
    }
    generateOutputFrame() {
      const outputFrame = new Float32Array(this.options.targetFrameSize);
      let outputIndex = 0;
      let inputIndex = 0;
      while (outputIndex < this.options.targetFrameSize) {
        let sum = 0;
        let num = 0;
        while (inputIndex < Math.min(
          this.inputBuffer.length,
          (outputIndex + 1) * this.options.nativeSampleRate / this.options.targetSampleRate
        )) {
          const value = this.inputBuffer[inputIndex];
          if (value !== void 0) {
            sum += value;
            num++;
          }
          inputIndex++;
        }
        outputFrame[outputIndex] = sum / num;
        outputIndex++;
      }
      this.inputBuffer = this.inputBuffer.slice(inputIndex);
      return outputFrame;
    }
  };

  // src/worklet.ts
  var Processor = class extends AudioWorkletProcessor {
    constructor(options) {
      super();
      this._initialized = false;
      this._stopProcessing = false;
      this.init = async () => {
        log.debug("initializing worklet");
        this.resampler = new Resampler({
          nativeSampleRate: sampleRate,
          targetSampleRate: 16e3,
          targetFrameSize: this.options.frameSamples
        });
        this._initialized = true;
        log.debug("initialized worklet");
      };
      this.options = options.processorOptions;
      this.port.onmessage = (ev) => {
        if (ev.data.message === "SPEECH_STOP" /* SpeechStop */) {
          this._stopProcessing = true;
        }
      };
      this.init();
    }
    process(inputs, outputs, parameters) {
      if (this._stopProcessing) {
        return false;
      }
      const arr = inputs[0][0];
      if (this._initialized && arr instanceof Float32Array) {
        const frames = this.resampler.process(arr);
        for (const frame of frames) {
          this.port.postMessage(
            { message: "AUDIO_FRAME" /* AudioFrame */, data: frame.buffer },
            [frame.buffer]
          );
        }
      }
      return true;
    }
  };
  registerProcessor("vad-helper-worklet", Processor);
})();
