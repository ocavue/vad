declare enum Message {
    AudioFrame = "AUDIO_FRAME",
    SpeechStart = "SPEECH_START",
    VADMisfire = "VAD_MISFIRE",
    SpeechEnd = "SPEECH_END",
    SpeechStop = "SPEECH_STOP"
}

type ONNXRuntimeAPI = any;
type ModelFetcher = () => Promise<ArrayBuffer>;
type OrtOptions = {
    ortConfig?: (ort: ONNXRuntimeAPI) => any;
};
interface SpeechProbabilities {
    notSpeech: number;
    isSpeech: number;
}

interface FrameProcessorOptions {
    /** Threshold over which values returned by the Silero VAD model will be considered as positively indicating speech.
     * The Silero VAD model is run on each frame. This number should be between 0 and 1.
     */
    positiveSpeechThreshold: number;
    /** Threshold under which values returned by the Silero VAD model will be considered as indicating an absence of speech.
     * Note that the creators of the Silero VAD have historically set this number at 0.15 less than `positiveSpeechThreshold`.
     */
    negativeSpeechThreshold: number;
    /** After a VAD value under the `negativeSpeechThreshold` is observed, the algorithm will wait `redemptionFrames` frames
     * before running `onSpeechEnd`. If the model returns a value over `positiveSpeechThreshold` during this grace period, then
     * the algorithm will consider the previously-detected "speech end" as having been a false negative.
     */
    redemptionFrames: number;
    /** Number of audio samples (under a sample rate of 16000) to comprise one "frame" to feed to the Silero VAD model.
     * The `frame` serves as a unit of measurement of lengths of audio segments and many other parameters are defined in terms of
     * frames. The authors of the Silero VAD model offer the following warning:
     * > WARNING! Silero VAD models were trained using 512, 1024, 1536 samples for 16000 sample rate and 256, 512, 768 samples for 8000 sample rate.
     * > Values other than these may affect model perfomance!!
     * In this context, audio fed to the VAD model always has sample rate 16000. It is probably a good idea to leave this at 1536.
     */
    frameSamples: number;
    /** Number of frames to prepend to the audio segment that will be passed to `onSpeechEnd`. */
    preSpeechPadFrames: number;
    /** If an audio segment is detected as a speech segment according to initial algorithm but it has fewer than `minSpeechFrames`,
     * it will be discarded and `onVADMisfire` will be run instead of `onSpeechEnd`.
     */
    minSpeechFrames: number;
    /**
     * If true, when the user pauses the VAD, it may trigger `onSpeechEnd`.
     */
    submitUserSpeechOnPause: boolean;
}
interface FrameProcessorInterface {
    resume: () => void;
    process: (arr: Float32Array) => Promise<{
        probs?: SpeechProbabilities;
        msg?: Message;
        audio?: Float32Array;
    }>;
    endSegment: () => {
        msg?: Message;
        audio?: Float32Array;
    };
}
declare class FrameProcessor implements FrameProcessorInterface {
    modelProcessFunc: (frame: Float32Array) => Promise<SpeechProbabilities>;
    modelResetFunc: () => any;
    options: FrameProcessorOptions;
    speaking: boolean;
    audioBuffer: {
        frame: Float32Array;
        isSpeech: boolean;
    }[];
    redemptionCounter: number;
    active: boolean;
    constructor(modelProcessFunc: (frame: Float32Array) => Promise<SpeechProbabilities>, modelResetFunc: () => any, options: FrameProcessorOptions);
    reset: () => void;
    pause: () => {
        msg: Message;
        audio: Float32Array;
    } | {
        msg: Message;
        audio?: undefined;
    } | {
        msg?: undefined;
        audio?: undefined;
    };
    resume: () => void;
    endSegment: () => {
        msg: Message;
        audio: Float32Array;
    } | {
        msg: Message;
        audio?: undefined;
    } | {
        msg?: undefined;
        audio?: undefined;
    };
    process: (frame: Float32Array) => Promise<{
        probs?: undefined;
        msg?: undefined;
        frame?: undefined;
        audio?: undefined;
    } | {
        probs: SpeechProbabilities;
        msg: Message;
        frame: Float32Array;
        audio?: undefined;
    } | {
        probs: SpeechProbabilities;
        msg: Message;
        audio: Float32Array;
        frame: Float32Array;
    } | {
        probs: SpeechProbabilities;
        frame: Float32Array;
        msg?: undefined;
        audio?: undefined;
    }>;
}

interface NonRealTimeVADSpeechData {
    audio: Float32Array;
    start: number;
    end: number;
}
interface NonRealTimeVADOptions extends FrameProcessorOptions, OrtOptions {
}
declare class PlatformAgnosticNonRealTimeVAD {
    modelFetcher: ModelFetcher;
    ort: ONNXRuntimeAPI;
    options: NonRealTimeVADOptions;
    frameProcessor: FrameProcessorInterface | undefined;
    static _new<T extends PlatformAgnosticNonRealTimeVAD>(modelFetcher: ModelFetcher, ort: ONNXRuntimeAPI, options?: Partial<NonRealTimeVADOptions>): Promise<T>;
    constructor(modelFetcher: ModelFetcher, ort: ONNXRuntimeAPI, options: NonRealTimeVADOptions);
    init: () => Promise<void>;
    run: (inputAudio: Float32Array, sampleRate: number) => AsyncGenerator<NonRealTimeVADSpeechData>;
}

declare function minFramesForTargetMS(targetDuration: number, frameSamples: number, sr?: number): number;
declare function arrayBufferToBase64(buffer: ArrayBuffer): string;
declare function encodeWAV(samples: Float32Array, format?: number, sampleRate?: number, numChannels?: number, bitDepth?: number): ArrayBuffer;
declare function audioFileToArray(audioFileData: Blob): Promise<{
    audio: Float32Array;
    sampleRate: number;
}>;

interface RealTimeVADCallbacks {
    /** Callback to run after each frame. The size (number of samples) of a frame is given by `frameSamples`. */
    onFrameProcessed: (probabilities: SpeechProbabilities, frame: Float32Array) => any;
    /** Callback to run if speech start was detected but `onSpeechEnd` will not be run because the
     * audio segment is smaller than `minSpeechFrames`.
     */
    onVADMisfire: () => any;
    /** Callback to run when speech start is detected */
    onSpeechStart: () => any;
    /**
     * Callback to run when speech end is detected.
     * Takes as arg a Float32Array of audio samples between -1 and 1, sample rate 16000.
     * This will not run if the audio segment is smaller than `minSpeechFrames`.
     */
    onSpeechEnd: (audio: Float32Array) => any;
}
/**
 * Customizable audio constraints for the VAD.
 * Excludes certain constraints that are set for the user by default.
 */
type AudioConstraints = Omit<MediaTrackConstraints, "channelCount" | "echoCancellation" | "autoGainControl" | "noiseSuppression">;
type AssetOptions = {
    workletURL: string;
    workletOptions: AudioWorkletNodeOptions;
    modelURL: string;
    modelFetcher: (path: string) => Promise<ArrayBuffer>;
};
interface RealTimeVADOptionsWithoutStream extends FrameProcessorOptions, RealTimeVADCallbacks, OrtOptions, AssetOptions {
    additionalAudioConstraints?: AudioConstraints;
    stream: undefined;
}
interface RealTimeVADOptionsWithStream extends FrameProcessorOptions, RealTimeVADCallbacks, OrtOptions, AssetOptions {
    stream: MediaStream;
}
type RealTimeVADOptions = RealTimeVADOptionsWithStream | RealTimeVADOptionsWithoutStream;
declare const defaultRealTimeVADOptions: RealTimeVADOptions;
declare class MicVAD {
    options: RealTimeVADOptions;
    private audioContext;
    private stream;
    private audioNodeVAD;
    private sourceNode;
    private listening;
    static new(options?: Partial<RealTimeVADOptions>): Promise<MicVAD>;
    private constructor();
    pause: () => void;
    start: () => void;
    destroy: () => void;
}
declare class AudioNodeVAD {
    ctx: AudioContext;
    options: RealTimeVADOptions;
    private frameProcessor;
    private entryNode;
    static new(ctx: AudioContext, options?: Partial<RealTimeVADOptions>): Promise<AudioNodeVAD>;
    constructor(ctx: AudioContext, options: RealTimeVADOptions, frameProcessor: FrameProcessor, entryNode: AudioWorkletNode);
    pause: () => void;
    start: () => void;
    receive: (node: AudioNode) => void;
    processFrame: (frame: Float32Array) => Promise<void>;
    handleFrameProcessorEvent: (ev: Partial<{
        probs: SpeechProbabilities;
        msg: Message;
        audio: Float32Array;
        frame: Float32Array;
    }>) => void;
    destroy: () => void;
}

interface NonRealTimeVADOptionsWeb extends NonRealTimeVADOptions {
    modelURL: string;
    modelFetcher: (path: string) => Promise<ArrayBuffer>;
}
declare const defaultNonRealTimeVADOptions: {
    modelURL: string;
    modelFetcher: (path: string) => Promise<ArrayBuffer>;
};
declare class NonRealTimeVAD extends PlatformAgnosticNonRealTimeVAD {
    static new(options?: Partial<NonRealTimeVADOptionsWeb>): Promise<NonRealTimeVAD>;
}
declare const utils: {
    audioFileToArray: typeof audioFileToArray;
    minFramesForTargetMS: typeof minFramesForTargetMS;
    arrayBufferToBase64: typeof arrayBufferToBase64;
    encodeWAV: typeof encodeWAV;
};

export { AudioNodeVAD, FrameProcessor, type FrameProcessorOptions, Message, MicVAD, NonRealTimeVAD, type NonRealTimeVADOptions, type NonRealTimeVADOptionsWeb, type RealTimeVADOptions, defaultNonRealTimeVADOptions, defaultRealTimeVADOptions, utils };
