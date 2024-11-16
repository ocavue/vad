var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var src_exports = {};
__export(src_exports, {
  AudioNodeVAD: () => AudioNodeVAD,
  FrameProcessor: () => FrameProcessor,
  Message: () => Message,
  MicVAD: () => MicVAD,
  NonRealTimeVAD: () => NonRealTimeVAD,
  defaultNonRealTimeVADOptions: () => defaultNonRealTimeVADOptions2,
  defaultRealTimeVADOptions: () => defaultRealTimeVADOptions,
  utils: () => utils
});
module.exports = __toCommonJS(src_exports);
var ort2 = __toESM(require("onnxruntime-web"));

// src/asset-path.ts
var isWeb = typeof window !== "undefined" && typeof window.document !== "undefined";
var currentScript = isWeb ? window.document.currentScript : null;
var basePath = "/";
if (currentScript) {
  basePath = currentScript.src.replace(/#.*$/, "").replace(/\?.*$/, "").replace(/\/[^\/]+$/, "/");
}
var assetPath = (file) => {
  return basePath + file;
};

// src/default-model-fetcher.ts
var defaultModelFetcher = (path) => {
  return fetch(path).then((model) => model.arrayBuffer());
};

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

// src/messages.ts
var Message = /* @__PURE__ */ ((Message2) => {
  Message2["AudioFrame"] = "AUDIO_FRAME";
  Message2["SpeechStart"] = "SPEECH_START";
  Message2["VADMisfire"] = "VAD_MISFIRE";
  Message2["SpeechEnd"] = "SPEECH_END";
  Message2["SpeechStop"] = "SPEECH_STOP";
  return Message2;
})(Message || {});

// src/frame-processor.ts
var RECOMMENDED_FRAME_SAMPLES = [512, 1024, 1536];
var defaultFrameProcessorOptions = {
  positiveSpeechThreshold: 0.5,
  negativeSpeechThreshold: 0.5 - 0.15,
  preSpeechPadFrames: 1,
  redemptionFrames: 8,
  frameSamples: 1536,
  minSpeechFrames: 3,
  submitUserSpeechOnPause: false
};
function validateOptions(options) {
  if (!RECOMMENDED_FRAME_SAMPLES.includes(options.frameSamples)) {
    log.warn("You are using an unusual frame size");
  }
  if (options.positiveSpeechThreshold < 0 || options.positiveSpeechThreshold > 1) {
    log.error("positiveSpeechThreshold should be a number between 0 and 1");
  }
  if (options.negativeSpeechThreshold < 0 || options.negativeSpeechThreshold > options.positiveSpeechThreshold) {
    log.error(
      "negativeSpeechThreshold should be between 0 and positiveSpeechThreshold"
    );
  }
  if (options.preSpeechPadFrames < 0) {
    log.error("preSpeechPadFrames should be positive");
  }
  if (options.redemptionFrames < 0) {
    log.error("redemptionFrames should be positive");
  }
}
var concatArrays = (arrays) => {
  const sizes = arrays.reduce(
    (out, next) => {
      out.push(out.at(-1) + next.length);
      return out;
    },
    [0]
  );
  const outArray = new Float32Array(sizes.at(-1));
  arrays.forEach((arr, index) => {
    const place = sizes[index];
    outArray.set(arr, place);
  });
  return outArray;
};
var FrameProcessor = class {
  constructor(modelProcessFunc, modelResetFunc, options) {
    this.modelProcessFunc = modelProcessFunc;
    this.modelResetFunc = modelResetFunc;
    this.options = options;
    this.speaking = false;
    this.redemptionCounter = 0;
    this.active = false;
    this.reset = () => {
      this.speaking = false;
      this.audioBuffer = [];
      this.modelResetFunc();
      this.redemptionCounter = 0;
    };
    this.pause = () => {
      this.active = false;
      if (this.options.submitUserSpeechOnPause) {
        return this.endSegment();
      } else {
        this.reset();
        return {};
      }
    };
    this.resume = () => {
      this.active = true;
    };
    this.endSegment = () => {
      const audioBuffer = this.audioBuffer;
      this.audioBuffer = [];
      const speaking = this.speaking;
      this.reset();
      const speechFrameCount = audioBuffer.reduce((acc, item) => {
        return acc + +item.isSpeech;
      }, 0);
      if (speaking) {
        if (speechFrameCount >= this.options.minSpeechFrames) {
          const audio = concatArrays(audioBuffer.map((item) => item.frame));
          return { msg: "SPEECH_END" /* SpeechEnd */, audio };
        } else {
          return { msg: "VAD_MISFIRE" /* VADMisfire */ };
        }
      }
      return {};
    };
    this.process = async (frame) => {
      if (!this.active) {
        return {};
      }
      const probs = await this.modelProcessFunc(frame);
      this.audioBuffer.push({
        frame,
        isSpeech: probs.isSpeech >= this.options.positiveSpeechThreshold
      });
      if (probs.isSpeech >= this.options.positiveSpeechThreshold && this.redemptionCounter) {
        this.redemptionCounter = 0;
      }
      if (probs.isSpeech >= this.options.positiveSpeechThreshold && !this.speaking) {
        this.speaking = true;
        return { probs, msg: "SPEECH_START" /* SpeechStart */, frame };
      }
      if (probs.isSpeech < this.options.negativeSpeechThreshold && this.speaking && ++this.redemptionCounter >= this.options.redemptionFrames) {
        this.redemptionCounter = 0;
        this.speaking = false;
        const audioBuffer = this.audioBuffer;
        this.audioBuffer = [];
        const speechFrameCount = audioBuffer.reduce((acc, item) => {
          return acc + +item.isSpeech;
        }, 0);
        if (speechFrameCount >= this.options.minSpeechFrames) {
          const audio = concatArrays(audioBuffer.map((item) => item.frame));
          return { probs, msg: "SPEECH_END" /* SpeechEnd */, audio, frame };
        } else {
          return { probs, msg: "VAD_MISFIRE" /* VADMisfire */, frame };
        }
      }
      if (!this.speaking) {
        while (this.audioBuffer.length > this.options.preSpeechPadFrames) {
          this.audioBuffer.shift();
        }
      }
      return { probs, frame };
    };
    this.audioBuffer = [];
    this.reset();
  }
};

// src/models.ts
var _Silero = class _Silero {
  constructor(ort3, modelFetcher) {
    this.ort = ort3;
    this.modelFetcher = modelFetcher;
    this.init = async () => {
      log.debug("initializing vad");
      const modelArrayBuffer = await this.modelFetcher();
      this._session = await this.ort.InferenceSession.create(modelArrayBuffer);
      this._sr = new this.ort.Tensor("int64", [16000n]);
      this.reset_state();
      log.debug("vad is initialized");
    };
    this.reset_state = () => {
      const zeroes = Array(2 * 64).fill(0);
      this._h = new this.ort.Tensor("float32", zeroes, [2, 1, 64]);
      this._c = new this.ort.Tensor("float32", zeroes, [2, 1, 64]);
    };
    this.process = async (audioFrame) => {
      const t = new this.ort.Tensor("float32", audioFrame, [1, audioFrame.length]);
      const inputs = {
        input: t,
        h: this._h,
        c: this._c,
        sr: this._sr
      };
      const out = await this._session.run(inputs);
      this._h = out.hn;
      this._c = out.cn;
      const [isSpeech] = out.output.data;
      const notSpeech = 1 - isSpeech;
      return { notSpeech, isSpeech };
    };
  }
};
_Silero.new = async (ort3, modelFetcher) => {
  const model = new _Silero(ort3, modelFetcher);
  await model.init();
  return model;
};
var Silero = _Silero;

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

// src/non-real-time-vad.ts
var defaultNonRealTimeVADOptions = {
  ...defaultFrameProcessorOptions,
  ortConfig: void 0
};
var PlatformAgnosticNonRealTimeVAD = class {
  constructor(modelFetcher, ort3, options) {
    this.modelFetcher = modelFetcher;
    this.ort = ort3;
    this.options = options;
    this.init = async () => {
      const model = await Silero.new(this.ort, this.modelFetcher);
      this.frameProcessor = new FrameProcessor(model.process, model.reset_state, {
        frameSamples: this.options.frameSamples,
        positiveSpeechThreshold: this.options.positiveSpeechThreshold,
        negativeSpeechThreshold: this.options.negativeSpeechThreshold,
        redemptionFrames: this.options.redemptionFrames,
        preSpeechPadFrames: this.options.preSpeechPadFrames,
        minSpeechFrames: this.options.minSpeechFrames,
        submitUserSpeechOnPause: this.options.submitUserSpeechOnPause
      });
      this.frameProcessor.resume();
    };
    this.run = async function* (inputAudio, sampleRate) {
      const resamplerOptions = {
        nativeSampleRate: sampleRate,
        targetSampleRate: 16e3,
        targetFrameSize: this.options.frameSamples
      };
      const resampler = new Resampler(resamplerOptions);
      let start = 0;
      let end = 0;
      let frameIndex = 0;
      for await (const frame of resampler.stream(inputAudio)) {
        const { msg: msg2, audio: audio2 } = await this.frameProcessor.process(frame);
        switch (msg2) {
          case "SPEECH_START" /* SpeechStart */:
            start = frameIndex * this.options.frameSamples / 16;
            break;
          case "SPEECH_END" /* SpeechEnd */:
            end = (frameIndex + 1) * this.options.frameSamples / 16;
            yield { audio: audio2, start, end };
            break;
          default:
            break;
        }
        frameIndex++;
      }
      const { msg, audio } = this.frameProcessor.endSegment();
      if (msg == "SPEECH_END" /* SpeechEnd */) {
        yield {
          audio,
          start,
          end: frameIndex * this.options.frameSamples / 16
        };
      }
    };
    validateOptions(options);
  }
  static async _new(modelFetcher, ort3, options = {}) {
    const fullOptions = {
      ...defaultNonRealTimeVADOptions,
      ...options
    };
    if (fullOptions.ortConfig !== void 0) {
      fullOptions.ortConfig(ort3);
    }
    const vad = new this(modelFetcher, ort3, fullOptions);
    await vad.init();
    return vad;
  }
};

// src/utils.ts
function minFramesForTargetMS(targetDuration, frameSamples, sr = 16e3) {
  return Math.ceil(targetDuration * sr / 1e3 / frameSamples);
}
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  const binary = new Array(len);
  for (var i = 0; i < len; i++) {
    const byte = bytes[i];
    if (byte === void 0) {
      break;
    }
    binary[i] = String.fromCharCode(byte);
  }
  return btoa(binary.join(""));
}
function encodeWAV(samples, format = 3, sampleRate = 16e3, numChannels = 1, bitDepth = 32) {
  var bytesPerSample = bitDepth / 8;
  var blockAlign = numChannels * bytesPerSample;
  var buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
  var view = new DataView(buffer);
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * bytesPerSample, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, "data");
  view.setUint32(40, samples.length * bytesPerSample, true);
  if (format === 1) {
    floatTo16BitPCM(view, 44, samples);
  } else {
    writeFloat32(view, 44, samples);
  }
  return buffer;
}
function writeFloat32(output, offset, input) {
  for (var i = 0; i < input.length; i++, offset += 4) {
    output.setFloat32(offset, input[i], true);
  }
}
function floatTo16BitPCM(output, offset, input) {
  for (var i = 0; i < input.length; i++, offset += 2) {
    var s = Math.max(-1, Math.min(1, input[i]));
    output.setInt16(offset, s < 0 ? s * 32768 : s * 32767, true);
  }
}
function writeString(view, offset, string) {
  for (var i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}
async function audioFileToArray(audioFileData) {
  const ctx = new OfflineAudioContext(1, 1, 44100);
  const reader = new FileReader();
  let audioBuffer = null;
  await new Promise((res) => {
    reader.addEventListener("loadend", (ev) => {
      const audioData = reader.result;
      ctx.decodeAudioData(
        audioData,
        (buffer) => {
          audioBuffer = buffer;
          ctx.startRendering().then((renderedBuffer) => {
            console.log("Rendering completed successfully");
            res();
          }).catch((err) => {
            console.error(`Rendering failed: ${err}`);
          });
        },
        (e) => {
          console.log(`Error with decoding audio data: ${e}`);
        }
      );
    });
    reader.readAsArrayBuffer(audioFileData);
  });
  if (audioBuffer === null) {
    throw Error("some shit");
  }
  let _audioBuffer = audioBuffer;
  let out = new Float32Array(_audioBuffer.length);
  for (let i = 0; i < _audioBuffer.length; i++) {
    for (let j = 0; j < _audioBuffer.numberOfChannels; j++) {
      out[i] += _audioBuffer.getChannelData(j)[i];
    }
  }
  return { audio: out, sampleRate: _audioBuffer.sampleRate };
}

// src/real-time-vad.ts
var ortInstance = __toESM(require("onnxruntime-web"));
var ort = ortInstance;
var defaultRealTimeVADOptions = {
  ...defaultFrameProcessorOptions,
  onFrameProcessed: (probabilities) => {
  },
  onVADMisfire: () => {
    log.debug("VAD misfire");
  },
  onSpeechStart: () => {
    log.debug("Detected speech start");
  },
  onSpeechEnd: () => {
    log.debug("Detected speech end");
  },
  workletURL: assetPath("vad.worklet.bundle.min.js"),
  modelURL: assetPath("silero_vad.onnx"),
  modelFetcher: defaultModelFetcher,
  stream: void 0,
  ortConfig: void 0,
  workletOptions: {
    processorOptions: {
      frameSamples: defaultFrameProcessorOptions.frameSamples
    }
  }
};
var MicVAD = class _MicVAD {
  constructor(options, audioContext, stream, audioNodeVAD, sourceNode, listening = false) {
    this.options = options;
    this.audioContext = audioContext;
    this.stream = stream;
    this.audioNodeVAD = audioNodeVAD;
    this.sourceNode = sourceNode;
    this.listening = listening;
    this.pause = () => {
      this.audioNodeVAD.pause();
      this.listening = false;
    };
    this.start = () => {
      this.audioNodeVAD.start();
      this.listening = true;
    };
    this.destroy = () => {
      if (this.listening) {
        this.pause();
      }
      if (this.options.stream === void 0) {
        this.stream.getTracks().forEach((track) => track.stop());
      }
      this.sourceNode.disconnect();
      this.audioNodeVAD.destroy();
      this.audioContext.close();
    };
  }
  static async new(options = {}) {
    const fullOptions = {
      ...defaultRealTimeVADOptions,
      ...options
    };
    validateOptions(fullOptions);
    let stream;
    if (fullOptions.stream === void 0)
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          ...fullOptions.additionalAudioConstraints,
          channelCount: 1,
          echoCancellation: true,
          autoGainControl: true,
          noiseSuppression: true
        }
      });
    else stream = fullOptions.stream;
    const audioContext = new AudioContext();
    const sourceNode = new MediaStreamAudioSourceNode(audioContext, {
      mediaStream: stream
    });
    const audioNodeVAD = await AudioNodeVAD.new(audioContext, fullOptions);
    audioNodeVAD.receive(sourceNode);
    return new _MicVAD(
      fullOptions,
      audioContext,
      stream,
      audioNodeVAD,
      sourceNode
    );
  }
};
var AudioNodeVAD = class _AudioNodeVAD {
  constructor(ctx, options, frameProcessor, entryNode) {
    this.ctx = ctx;
    this.options = options;
    this.frameProcessor = frameProcessor;
    this.entryNode = entryNode;
    this.pause = () => {
      const ev = this.frameProcessor.pause();
      this.handleFrameProcessorEvent(ev);
    };
    this.start = () => {
      this.frameProcessor.resume();
    };
    this.receive = (node) => {
      node.connect(this.entryNode);
    };
    this.processFrame = async (frame) => {
      const ev = await this.frameProcessor.process(frame);
      this.handleFrameProcessorEvent(ev);
    };
    this.handleFrameProcessorEvent = (ev) => {
      if (ev.probs !== void 0) {
        this.options.onFrameProcessed(ev.probs, ev.frame);
      }
      switch (ev.msg) {
        case "SPEECH_START" /* SpeechStart */:
          this.options.onSpeechStart();
          break;
        case "VAD_MISFIRE" /* VADMisfire */:
          this.options.onVADMisfire();
          break;
        case "SPEECH_END" /* SpeechEnd */:
          this.options.onSpeechEnd(ev.audio);
          break;
        default:
          break;
      }
    };
    this.destroy = () => {
      this.entryNode.port.postMessage({
        message: "SPEECH_STOP" /* SpeechStop */
      });
      this.entryNode.disconnect();
    };
  }
  static async new(ctx, options = {}) {
    const fullOptions = {
      ...defaultRealTimeVADOptions,
      ...options
    };
    validateOptions(fullOptions);
    if (fullOptions.ortConfig !== void 0) {
      fullOptions.ortConfig(ort);
    }
    try {
      await ctx.audioWorklet.addModule(fullOptions.workletURL);
    } catch (e) {
      console.error(
        `Encountered an error while loading worklet. Please make sure the worklet vad.bundle.min.js included with @ricky0123/vad-web is available at the specified path:
        ${fullOptions.workletURL}
        If need be, you can customize the worklet file location using the \`workletURL\` option.`
      );
      throw e;
    }
    const vadNode = new AudioWorkletNode(
      ctx,
      "vad-helper-worklet",
      fullOptions.workletOptions
    );
    let model;
    try {
      model = await Silero.new(
        ort,
        () => fullOptions.modelFetcher(fullOptions.modelURL)
      );
    } catch (e) {
      console.error(
        `Encountered an error while loading model file. Please make sure silero_vad.onnx, included with @ricky0123/vad-web, is available at the specified path:
      ${fullOptions.modelURL}
      If need be, you can customize the model file location using the \`modelURL\` option.`
      );
      throw e;
    }
    const frameProcessor = new FrameProcessor(
      model.process,
      model.reset_state,
      {
        frameSamples: fullOptions.frameSamples,
        positiveSpeechThreshold: fullOptions.positiveSpeechThreshold,
        negativeSpeechThreshold: fullOptions.negativeSpeechThreshold,
        redemptionFrames: fullOptions.redemptionFrames,
        preSpeechPadFrames: fullOptions.preSpeechPadFrames,
        minSpeechFrames: fullOptions.minSpeechFrames,
        submitUserSpeechOnPause: fullOptions.submitUserSpeechOnPause
      }
    );
    const audioNodeVAD = new _AudioNodeVAD(
      ctx,
      fullOptions,
      frameProcessor,
      vadNode
    );
    vadNode.port.onmessage = async (ev) => {
      switch (ev.data?.message) {
        case "AUDIO_FRAME" /* AudioFrame */:
          let buffer = ev.data.data;
          if (!(buffer instanceof ArrayBuffer)) {
            buffer = new ArrayBuffer(ev.data.data.byteLength);
            new Uint8Array(buffer).set(new Uint8Array(ev.data.data));
          }
          const frame = new Float32Array(buffer);
          await audioNodeVAD.processFrame(frame);
          break;
        default:
          break;
      }
    };
    return audioNodeVAD;
  }
};

// src/index.ts
var defaultNonRealTimeVADOptions2 = {
  modelURL: assetPath("silero_vad.onnx"),
  modelFetcher: defaultModelFetcher
};
var NonRealTimeVAD = class extends PlatformAgnosticNonRealTimeVAD {
  static async new(options = {}) {
    const { modelURL, modelFetcher } = {
      ...defaultNonRealTimeVADOptions2,
      ...options
    };
    return await this._new(() => modelFetcher(modelURL), ort2, options);
  }
};
var utils = {
  audioFileToArray,
  minFramesForTargetMS,
  arrayBufferToBase64,
  encodeWAV
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AudioNodeVAD,
  FrameProcessor,
  Message,
  MicVAD,
  NonRealTimeVAD,
  defaultNonRealTimeVADOptions,
  defaultRealTimeVADOptions,
  utils
});
