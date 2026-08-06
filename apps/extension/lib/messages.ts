/** Messages exchanged between the popup and the background worker. */

export interface CaptureThreadRequest {
  type: "capture-reddit-thread";
  url: string;
}

export type CaptureThreadResponse =
  | { ok: false; error: string }
  | { ok: true; reused: boolean };
