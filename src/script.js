import platform from 'platform'
import 'alpinejs'
import './style.css'

const iceServers = [
  { urls: 'stun://stun.stunprotocol.org' },
  { urls: 'stun://stun.services.mozilla.com' }
]

const ipfsOptions = {
  repo: String(Math.random() + Date.now()),
  config: {
    Addresses: {
      "Swarm": ['/dns4/agile-chamber-63538.herokuapp.com/tcp/443/wss/p2p-webrtc-star/'], 
      "Bootstrap": [] 
    }
  }
}

let ipfs

function root() {
  return {
    mode: 'microphone',
    modes: ['microphone', 'speaker'],

    async init() {
      ipfs = await Ipfs.create(ipfsOptions)
    },

    async tabChanged(tab) {
      const emoji = tab == 'microphone' ? '🎙' : '🔊'
      document.title = emoji + document.title.substr(2)
    }
  }
}

function microphone() {
  const STATES = {
    IDLE: 1,
    CONNECTING: 2,
    LOOKING_FOR_RECEIVERS: 3,
    STREAMING: 4
  }
  const constraints = {
    audio: {
      autoGainControl: false,
      channelCount: 2,
      echoCancellation: false,
      latency: 0,
      noiseSuppression: false,
      sampleRate: 48000,
      sampleSize: 16,
      volume: 1.0
    },
    video: false
  }
  let localStream, peerConnection, session, localDescription

  return {
    STATES,
    state: STATES.IDLE,
    stateIcon: 'help',
    target: '',

    setState(newState) {
      this.state = newState
      switch (newState) {
        case STATES.IDLE:
          this.stateIcon = 'help'
          document.getElementById('streaming').checked = false
          break;
        case STATES.CONNECTING:
          this.stateIcon = 'public'
          break;
        case STATES.LOOKING_FOR_RECEIVERS:
          this.stateIcon = 'search'
          break;
        case STATES.STREAMING:
          this.stateIcon = 'mic_none'
          break;
      }
    },

    applyStreamStatus(shouldStream) {
      if (shouldStream) {
        this.startStreaming()
      } else {
        this.stopStreaming()
      }
    },
    async startStreaming() {
      this.setState(STATES.CONNECTING)

      const self = this
      try {
        localStream = await navigator.mediaDevices.getUserMedia(constraints)
        peerConnection = new RTCPeerConnection({ iceServers });
        peerConnection.onicecandidate = async (e) => {
          if (e.candidate === null) {
            let gotAnswer = false
            await ipfs.pubsub.subscribe('webmic', async ({ data }) => {
              if (gotAnswer) return
              const obj = JSON.parse(data)
              if (obj.type == 'answer') {
                gotAnswer = true
                self.target = `${obj.platform.name} (${obj.platform.os.family})`
                peerConnection.setRemoteDescription(new RTCSessionDescription(obj))
                self.setState(STATES.STREAMING)
                await ipfs.pubsub.unsubscribe('webmic')
              }
            })
            const sendOffer = async () => {
              if (gotAnswer) return
              const offer = peerConnection.localDescription.toJSON()
              offer.platform = platform
              await ipfs.pubsub.publish('webmic', JSON.stringify(offer))
              setTimeout(sendOffer, 2000)
            }
            sendOffer()
            self.setState(STATES.LOOKING_FOR_RECEIVERS)
          }
        }
        peerConnection.oniceconnectionstatechange = async () => {
          if (peerConnection.iceConnectionState == 'disconnected') {
            await self.stopStreaming()
          }
        }
        const audioTracks = localStream.getAudioTracks();
        if (audioTracks.length > 0) {
          console.log(`Using Audio device: ${audioTracks[0].label}`)
        }
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream))
        session = await peerConnection.createOffer()
        localDescription = await peerConnection.setLocalDescription(session)
      } catch(error) {
        console.error(error)
      }
    },
  
    async stopStreaming() {
      await ipfs.pubsub.unsubscribe('webmic')
      this.isStreaming = false
      localStream.getTracks().forEach(track => track.stop())
      peerConnection.close()
      this.setState(STATES.IDLE)
    }
  }
}

function speaker() {
  const STATES = {
    IDLE: 1,
    CONNECTING: 2,
    LOOKING_FOR_SENDERS: 3,
    LISTENING: 4
  }
  const audioElement = document.querySelector('audio');
  let peerConnection

  return {
    STATES,
    state: STATES.IDLE,
    stateIcon: 'help',
    source: '',

    setState(newState) {
      this.state = newState
      switch (newState) {
        case STATES.IDLE:
          this.stateIcon = 'help'
          document.getElementById('listening').checked = false
          break;
        case STATES.CONNECTING:
          this.stateIcon = 'public'
          break;
        case STATES.LOOKING_FOR_SENDERS:
          this.stateIcon = 'search'
          break;
        case STATES.LISTENING:
          this.stateIcon = 'volume_up'
          break;
      }
    },

    applyListenStatus(shouldListen) {
      if (shouldListen) {
        this.startListening()
      } else {
        this.stopListening()
      }
    },

    async startListening() {
      this.setState(STATES.CONNECTING)
      const self = this
      try {
        peerConnection = new RTCPeerConnection({ iceServers });
        peerConnection.onicecandidate = async (e) => {
          if (e.candidate === null) {
            const offer = peerConnection.localDescription.toJSON()
            offer.platform = platform
            await ipfs.pubsub.publish('webmic', JSON.stringify(offer))
          }
        }
        peerConnection.ontrack = (e) => {
          audioElement.srcObject = e.streams[0]
          audioElement.play()
          self.setState(STATES.LISTENING)
        }
        peerConnection.oniceconnectionstatechange = async () => {
          if (peerConnection.iceConnectionState == 'disconnected') {
            await self.stopListening()
          }
        }
        await ipfs.pubsub.subscribe('webmic', async ({ data }) => {
          const obj = JSON.parse(data)
          if (obj.type == 'offer') {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(obj))
            const description = peerConnection.createAnswer()
            peerConnection.setLocalDescription(description)
            self.source = `${obj.platform.name} (${obj.platform.os.family})`
            await ipfs.pubsub.unsubscribe('webmic')
          }
        })
        this.setState(STATES.LOOKING_FOR_SENDERS)
      } catch(error) {
        console.error(error)
      }
    },
    async stopListening() {
      await ipfs.pubsub.unsubscribe('webmic')
      audioElement.srcObject = null
      peerConnection.close()
      this.setState(STATES.IDLE)
    }
  }
}

export { root, microphone, speaker }