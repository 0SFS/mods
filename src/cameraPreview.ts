/** Sensor pixels are packed RGBA, with the first row at the top of the image. */
export interface CameraPreviewFrame {
  width: number;
  height: number;
  rgba: Uint8Array;
}

/** Optional host-owned input binding; it starts inactive just like the display. */
export interface CameraPreviewInteraction {
  /** Ends held gestures when hidden. Reactivation takes input again. */
  setActive(on: boolean): void;
  destroy(): void;
}

/** The host supplies the sensor view; the provider owns only presentation and pacing. */
export interface CameraPreviewOptions {
  document: Document;
  label: string;
  readFrame(): Promise<CameraPreviewFrame>;
  maxFps?: number;
  /** Bind the host's shared image-viewer controls without coupling a provider to its runtime. */
  attachInteraction?(surface: HTMLCanvasElement): CameraPreviewInteraction;
}

/** Version 1 camera-preview mod API. Hosts depend on this contract, not on a provider package. */
export interface CameraPreview {
  element: HTMLElement;
  /** Initially inactive. Hosts deactivate detached/hidden previews and destroy on a sensor change. */
  setActive(on: boolean): void;
  destroy(): void;
}
