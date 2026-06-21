import coreURL from '@ffmpeg/core?url';
import wasmURL from '@ffmpeg/core/wasm?url';
import { getVideoDurationSeconds } from './durations';

export const VIDEO_COMPRESSION_THRESHOLD_BYTES = 45 * 1024 * 1024;
const TARGET_VIDEO_BYTES = 42 * 1024 * 1024;

export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function compressVideoForUpload(
  file: File,
  onProgress?: (progress: number) => void,
): Promise<File> {
  const objectUrl = URL.createObjectURL(file);
  let ffmpeg: import('@ffmpeg/ffmpeg').FFmpeg | null = null;
  let inputName = '';
  let outputName = '';

  try {
    const duration = await getVideoDurationSeconds(objectUrl);
    const [{ FFmpeg }, { fetchFile }] = await Promise.all([
      import('@ffmpeg/ffmpeg'),
      import('@ffmpeg/util'),
    ]);

    ffmpeg = new FFmpeg();
    const progressHandler = ({ progress }: { progress: number }) => {
      onProgress?.(Math.min(92, Math.max(5, Math.round(progress * 87 + 5))));
    };
    ffmpeg.on('progress', progressHandler);
    onProgress?.(2);
    await ffmpeg.load({ coreURL, wasmURL });

    const extension = file.name.split('.').pop()?.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'video';
    const token = crypto.randomUUID();
    inputName = `input-${token}.${extension}`;
    outputName = `compressed-${token}.mp4`;
    await ffmpeg.writeFile(inputName, await fetchFile(file));

    const targetKbps = calculateVideoBitrateKbps(duration, TARGET_VIDEO_BYTES);
    await encode(ffmpeg, inputName, outputName, targetKbps);
    let output = await readOutput(ffmpeg, outputName);

    if (output.byteLength > VIDEO_COMPRESSION_THRESHOLD_BYTES) {
      const adjustedKbps = Math.max(
        120,
        Math.floor(targetKbps * (TARGET_VIDEO_BYTES / output.byteLength) * 0.88),
      );
      await ffmpeg.deleteFile(outputName);
      await encode(ffmpeg, inputName, outputName, adjustedKbps);
      output = await readOutput(ffmpeg, outputName);
    }

    if (output.byteLength > VIDEO_COMPRESSION_THRESHOLD_BYTES) {
      throw new Error(
        `The compressed video is still ${formatFileSize(output.byteLength)}. Shorten the video or export it at a lower resolution.`,
      );
    }

    onProgress?.(100);
    const outputFileName = `${file.name.replace(/\.[^.]+$/, '') || 'video'}-compressed.mp4`;
    return new File([output], outputFileName, { type: 'video/mp4', lastModified: Date.now() });
  } catch (error) {
    if (error instanceof Error && error.message.includes('compressed video')) throw error;
    throw new Error(
      `Video compression failed. ${error instanceof Error ? error.message : 'Try an MP4 file or a shorter video.'}`,
    );
  } finally {
    URL.revokeObjectURL(objectUrl);
    if (ffmpeg) {
      try {
        if (inputName) await ffmpeg.deleteFile(inputName);
        if (outputName) await ffmpeg.deleteFile(outputName);
      } catch {
        // FFmpeg may already have released its in-memory filesystem.
      }
      ffmpeg.terminate();
    }
  }
}

function calculateVideoBitrateKbps(durationSeconds: number, targetBytes: number): number {
  const availableBits = targetBytes * 8 * 0.94;
  return Math.max(120, Math.min(5_000, Math.floor(availableBits / durationSeconds / 1_000)));
}

async function encode(
  ffmpeg: import('@ffmpeg/ffmpeg').FFmpeg,
  inputName: string,
  outputName: string,
  bitrateKbps: number,
) {
  const exitCode = await ffmpeg.exec([
    '-i',
    inputName,
    '-map',
    '0:v:0',
    '-vf',
    'scale=1280:-2:force_original_aspect_ratio=decrease',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-b:v',
    `${bitrateKbps}k`,
    '-maxrate',
    `${Math.max(180, Math.round(bitrateKbps * 1.15))}k`,
    '-bufsize',
    `${Math.max(360, Math.round(bitrateKbps * 2))}k`,
    '-pix_fmt',
    'yuv420p',
    '-an',
    '-movflags',
    '+faststart',
    outputName,
  ]);

  if (exitCode !== 0) throw new Error(`FFmpeg stopped with code ${exitCode}.`);
}

async function readOutput(ffmpeg: import('@ffmpeg/ffmpeg').FFmpeg, outputName: string) {
  const output = await ffmpeg.readFile(outputName);
  if (typeof output === 'string') throw new Error('FFmpeg returned an invalid video file.');
  return new Uint8Array(output);
}
