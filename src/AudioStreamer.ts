import { Libp2p } from "@libp2p/interface";
import { Stream } from "@libp2p/interface";
import { pipe } from "it-pipe";
import { lpStream, LPStream } from "it-length-prefixed";

export class AudioP2P {
  private audioCtx: AudioContext | null = null;
  private nextStartTime: number = 0;

  constructor(private libp2p: Libp2p) {}

  /**
   * 初始化接收端監聽
   */
  public async setupReceiver() {
    await this.libp2p.handle("/audio/1.0.0", async ({ stream }) => {
      console.log("收到音訊撥號");
      await this.receiveAudio(stream);
    });
  }

  /**
   * 撥號給特定 Peer 並開始傳送
   */
  public async dialAndStream(peerId: any, track: MediaStreamTrack) {
    const stream = await this.libp2p.dialProtocol(peerId, "/audio/1.0.0");
    const lp = lpStream(stream);

    const encoder = new AudioEncoder({
      output: (chunk: EncodedAudioChunk) => {
        const data = new Uint8Array(chunk.byteLength);
        chunk.copyTo(data);
        lp.write(data).catch(console.error);
      },
      error: (e) => console.error("Encoder Error:", e),
    });

    encoder.configure({
      codec: "opus",
      sampleRate: 48000,
      numberOfChannels: 1,
      bitrate: 32000,
    });

    // 使用 MediaStreamTrackProcessor 讀取麥克風數據
    // @ts-ignore (部分 TS 版本尚未定義此 API)
    const processor = new MediaStreamTrackProcessor({ track });
    const reader = processor.readable.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      encoder.encode(value);
      value.close();
    }
  }

  /**
   * 接收數據並播放
   */
  private async receiveAudio(stream: Stream) {
    if (!this.audioCtx) this.audioCtx = new AudioContext({ sampleRate: 48000 });
    const lp = lpStream(stream);

    const decoder = new AudioDecoder({
      output: (audioData: AudioData) => this.playFrame(audioData),
      error: (e) => console.error("Decoder Error:", e),
    });

    decoder.configure({
      codec: "opus",
      sampleRate: 48000,
      numberOfChannels: 1,
    });

    try {
      for await (const data of lp.source) {
        const chunk = new EncodedAudioChunk({
          type: "key",
          timestamp: performance.now(),
          data: data.subarray(),
        });
        decoder.decode(chunk);
      }
    } catch (err) {
      console.warn("串流中斷", err);
    }
  }

  /**
   * 將 AudioData 渲染至 AudioContext
   */
  private playFrame(audioData: AudioData) {
    if (!this.audioCtx) return;

    const buffer = this.audioCtx.createBuffer(
      audioData.numberOfChannels,
      audioData.numberOfFrames,
      audioData.sampleRate,
    );

    for (let i = 0; i < audioData.numberOfChannels; i++) {
      audioData.copyTo(buffer.getChannelData(i), { planeIndex: i });
    }

    const source = this.audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audioCtx.destination);

    const now = this.audioCtx.currentTime;
    // 50ms 緩衝以應對 Relay 造成的延遲抖動
    this.nextStartTime = Math.max(this.nextStartTime, now + 0.05);
    source.start(this.nextStartTime);
    this.nextStartTime += buffer.duration;

    audioData.close();
  }
}
