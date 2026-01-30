// @ts-check
import { multiaddr } from "@multiformats/multiaddr";
import { enable, disable } from "@libp2p/logger";
import { PUBSUB_PEER_DISCOVERY, PUBSUB_AUDIO } from "./constants";
import { update, getPeerTypes, getAddresses, getPeerDetails } from "./utils.js";
import { createNewLibp2p } from "./utils.js";
import { fromString, toString } from "uint8arrays";

const App = async () => {

  const libp2p = await createNewLibp2p();

  let sourceBuffer;
  let queue = [];
  let isBufferReady = false;
  let isAppending = false;
  //  globalThis.libp2p = libp2p;

  function appendNextChunk() {
    if (!isBufferReady || !sourceBuffer || isAppending || queue.length === 0 || sourceBuffer.updating) return;
    const chunk = queue.shift();
    if (!chunk) return;

    try {
      isAppending = true;
      sourceBuffer.appendBuffer(chunk);
    } catch (e) {
      console.warn("appendBuffer failed:", e);
    } finally {
      isAppending = false;
    }
  }

  console.log('start listening')

  const audio = document.getElementById("player");
  const mediaSource = new MediaSource();
  audio.src = URL.createObjectURL(mediaSource);

  mediaSource.addEventListener("sourceopen", () => {
    console.log("MediaSource opened");
    try {
      sourceBuffer = mediaSource.addSourceBuffer('audio/webm; codecs="opus"');
    } catch (e) {
      console.error("Failed to create SourceBuffer:", e);
      return;
    }

    sourceBuffer.mode = "sequence";
    sourceBuffer.addEventListener("updateend", appendNextChunk);
    isBufferReady = true;
  });


  await libp2p.services.pubsub.subscribe(PUBSUB_AUDIO);
  libp2p.services.pubsub.addEventListener("message", (evt) => {
    if (evt.detail.topic !== PUBSUB_AUDIO) return;
 //   console.log("Received audio chunk via pubsub", evt.detail);
 // tracking
    const chunk = evt.detail.data; // Uint8Array
    if (!isBufferReady || !sourceBuffer) {
      queue.push(chunk);
      return;
    }
    queue.push(chunk);
    appendNextChunk();
  });
  // node2 publishes "news" every second
  // working
  setInterval(() => {
    const peerList = libp2p.services.pubsub.getSubscribers(PUBSUB_AUDIO)
      .map(peerId => {
        const el = document.createElement('li')
        el.textContent = peerId.toString()
        return el
      })

    console.log('🙋‍♀️🙋🙋🏻‍♂👷subscribers:', peerList)
    //   libp2p.services.pubsub
    //   .publish(PUBSUB_AUDIO, fromString("Bird bird bird, bird is the word!"))
    //  .catch((err) => {
    //    console.error(err);
    //  });
  }, 10000);


  libp2p.services.pubsub.subscribe(PUBSUB_AUDIO);
  


  const DOM = {
    startstreaming: () => document.getElementById("startStream"),
    stopstreaming: () => document.getElementById("stopStream"),
    nodePeerId: () => document.getElementById("output-node-peer-id"),
    nodeStatus: () => document.getElementById("output-node-status"),
    nodePeerCount: () => document.getElementById("output-peer-count"),
    nodePeerTypes: () => document.getElementById("output-peer-types"),
    nodePeerDetails: () => document.getElementById("output-peer-details"),
    nodeAddressCount: () => document.getElementById("output-address-count"),
    nodeAddresses: () => document.getElementById("output-addresses"),

    inputMultiaddr: () => document.getElementById("input-multiaddr"),
    connectButton: () => document.getElementById("button-connect"),
    loggingButtonEnable: () => document.getElementById("button-logging-enable"),
    loggingButtonDisable: () =>
      document.getElementById("button-logging-disable"),
    outputQuery: () => document.getElementById("output"),
  };

  update(DOM.nodePeerId(), libp2p.peerId.toString());
  update(DOM.nodeStatus(), "Online");
  update(DOM.outputQuery(), "test");

  libp2p.addEventListener("peer:connect", (event) => { });
  libp2p.addEventListener("peer:disconnect", (event) => { });

  setInterval(() => {
    update(DOM.nodePeerCount(), libp2p.getConnections().length);
    update(DOM.nodePeerTypes(), getPeerTypes(libp2p));
    update(DOM.nodeAddressCount(), libp2p.getMultiaddrs().length);
    update(DOM.nodeAddresses(), getAddresses(libp2p));
    update(DOM.nodePeerDetails(), getPeerDetails(libp2p));
  }, 1000);

  /*
  DOM.stopStreaming().onclick = async (e) => {
    recorder.stop();
    stream.getTracks().forEach((track) => track.stop()); // stop microphone
    console.log("🎙️ Recording stopped and stream closed");
  };
  */
  DOM.startstreaming().onclick = async (e) => {
    libp2p.services.pubsub.subscribe(PUBSUB_AUDIO);
    libp2p.services.pubsub.addEventListener("message", (evt) => {
      if (evt.detail.topic !== "browser-peer-discovery") {
        console.log("sender  audio chunk to", evt.detail);
        // evt.detail.data is a Uint8Array of the audio chunk
      }
    });

    setInterval(() => {
      const peerList = libp2p.services.pubsub.getSubscribers(PUBSUB_AUDIO)
        .map(peerId => {
          const el = document.createElement('li')
          el.textContent = peerId.toString()
          return el
        })

      console.log('🙋‍♀️🙋🙋🏻‍♂👷subscribers:', peerList)
    }, 1000);

    console.log("start streaming");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream, {
      mimeType: "audio/webm;codecs=opus",
      audioBitsPerSecond: 64000, // adjust quality (32k–128k typical)
    });

    recorder.ondataavailable = async (e) => {
      if (e.data.size > 0 && libp2p.services.pubsub.getSubscribers(PUBSUB_AUDIO).length >= 2) {
        // Publish audio chunk to PUBSUB_AUDIO topic
        if (e.data.size === 0) return;

        const arrayBuffer = await e.data.arrayBuffer();
        const uint8 = new Uint8Array(arrayBuffer);

        if (libp2p.services.pubsub.getSubscribers(PUBSUB_AUDIO).length >= 2) {
          try {
            await libp2p.services.pubsub.publish(PUBSUB_AUDIO, uint8);
         //   console.log("Published audio chunk", uint8.byteLength);
         // tracking
          } catch (err) {
            console.error("Error publishing audio chunk:", err);
          }
        }
      }
    };

    recorder.start(250); // send small chunks every 250ms
    console.log("Streaming microphone via WebSocket...");
  };

  DOM.loggingButtonEnable().onclick = (e) => {
    enable("*,*:debug");
  };
  DOM.loggingButtonDisable().onclick = (e) => {
    disable();
  };

  DOM.connectButton().onclick = async (e) => {
    e.preventDefault();
    let maddr = multiaddr(DOM.inputMultiaddr().value);

    console.log(maddr);
    try {
      await libp2p.dial(maddr);
    } catch (e) {
      console.log(e);
    }
  };
};

App().catch((err) => {
  console.error(err); // eslint-disable-line no-console
});
