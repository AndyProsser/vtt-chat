#!/usr/bin/env node

import {
  Room,
  RoomEvent,
  AudioSource,
  LocalAudioTrack,
  AudioFrame,
  AudioStream,
  TrackPublishOptions,
  TrackSource,
} from '@livekit/rtc-node'

const config = {
  apiBase: process.env.VOG_API_BASE || 'http://localhost:8080',
  livekitUrl: process.env.VOG_LIVEKIT_URL || 'ws://localhost:7880',
  minFrames: Number(process.env.VOG_MIN_FRAMES || 5),
  waitTimeoutMs: Number(process.env.VOG_WAIT_TIMEOUT_MS || 15000),
}

async function api(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(config.apiBase + path, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  const text = await response.text()
  const data = text ? JSON.parse(text) : null

  if (!response.ok) {
    throw new Error(`${method} ${path} failed ${response.status}: ${text}`)
  }

  return data
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitFor(condition, label, timeoutMs = config.waitTimeoutMs, intervalMs = 100) {
  const started = Date.now()

  while (Date.now() - started < timeoutMs) {
    if (await condition()) return
    await delay(intervalMs)
  }

  throw new Error(`Timed out waiting for ${label}`)
}

function makeToneFrame(
  sampleRate = 48000,
  channels = 1,
  durationMs = 20,
  freq = 440,
  gain = 0.2,
  phaseState = { value: 0 }
) {
  const samplesPerChannel = Math.floor((sampleRate * durationMs) / 1000)
  const data = new Int16Array(samplesPerChannel * channels)

  for (let i = 0; i < samplesPerChannel; i += 1) {
    const sample = Math.round(Math.sin(phaseState.value) * 32767 * gain)
    phaseState.value += (2 * Math.PI * freq) / sampleRate

    for (let channel = 0; channel < channels; channel += 1) {
      data[i * channels + channel] = sample
    }
  }

  return new AudioFrame(data, sampleRate, channels, samplesPerChannel)
}

function startAudioPump(source, frequency = 440) {
  let stopped = false
  const phase = { value: 0 }

  const loop = (async () => {
    while (!stopped) {
      await source.captureFrame(makeToneFrame(48000, 1, 20, frequency, 0.25, phase))
      await delay(20)
    }
  })()

  return async () => {
    stopped = true
    await loop.catch(() => undefined)
  }
}

class Monitor {
  constructor(room) {
    this.subscribed = []
    this.unsubscribed = []
    this.framesByParticipant = new Map()
    this.readers = new Map()

    room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      this.subscribed.push({
        trackSid: publication.sid,
        participant: participant.identity,
        at: Date.now(),
      })

      const stream = new AudioStream(track, 48000, 1)
      const reader = stream.getReader()
      this.readers.set(publication.sid, reader)
      ;(async () => {
        while (true) {
          const { done } = await reader.read()
          if (done) break

          this.framesByParticipant.set(
            participant.identity,
            (this.framesByParticipant.get(participant.identity) || 0) + 1
          )
        }
      })().catch(() => undefined)
    })

    room.on(RoomEvent.TrackUnsubscribed, (_track, publication, participant) => {
      this.unsubscribed.push({
        trackSid: publication.sid,
        participant: participant.identity,
        at: Date.now(),
      })

      const reader = this.readers.get(publication.sid)
      if (reader) {
        reader.cancel().catch(() => undefined)
        this.readers.delete(publication.sid)
      }
    })
  }

  framesFrom(identity) {
    return this.framesByParticipant.get(identity) || 0
  }

  subsFrom(identity) {
    return this.subscribed.filter((entry) => entry.participant === identity).length
  }

  unsubsFrom(identity) {
    return this.unsubscribed.filter((entry) => entry.participant === identity).length
  }
}

async function connectRoom(userToken, sessionId, roomId, channel = 'room') {
  const body = channel === 'voice_of_god' ? { sessionId, channel } : { sessionId, roomId, channel }

  const tokenResponse = await api('/api/livekit/token', {
    method: 'POST',
    token: userToken,
    body,
  })

  const room = new Room()
  await room.connect(config.livekitUrl, tokenResponse.token, { autoSubscribe: true })

  return { room, monitor: new Monitor(room), tokenResponse }
}

async function publishSyntheticMic(room, trackName, frequency = 440) {
  const source = new AudioSource(48000, 1)
  const track = LocalAudioTrack.createAudioTrack(trackName, source)

  await room.localParticipant.publishTrack(
    track,
    new TrackPublishOptions({ source: TrackSource.SOURCE_MICROPHONE })
  )

  const stopPump = startAudioPump(source, frequency)

  return {
    async stop() {
      await stopPump()
      await track.close(true).catch(() => undefined)
      await source.close().catch(() => undefined)
      await room.disconnect().catch(() => undefined)
    },
  }
}

async function runVerification() {
  const suffix = String(Date.now()).slice(-6)

  const users = {
    dm: await api('/api/auth/login', {
      method: 'POST',
      body: { username: `vogdm${suffix}`, role: 'DM' },
    }),
    p1: await api('/api/auth/login', {
      method: 'POST',
      body: { username: `vogp1${suffix}`, role: 'PLAYER' },
    }),
    p2: await api('/api/auth/login', {
      method: 'POST',
      body: { username: `vogp2${suffix}`, role: 'PLAYER' },
    }),
  }

  const session = await api('/api/session', {
    method: 'POST',
    token: users.dm.token,
    body: { name: `Voice Of God Verify ${suffix}` },
  })

  await api(`/api/session/${session.id}/join`, { method: 'POST', token: users.dm.token })
  await api(`/api/session/${session.id}/join`, { method: 'POST', token: users.p1.token })
  await api(`/api/session/${session.id}/join`, { method: 'POST', token: users.p2.token })

  const roomsResponse = await api(`/api/rooms/${session.id}`, { token: users.dm.token })
  const mainRoom = roomsResponse.rooms.find((room) => room.name === 'Main Room')
  const greenRoom = roomsResponse.rooms.find((room) => room.name === 'Green Room')

  if (!mainRoom || !greenRoom) {
    throw new Error('Default rooms missing')
  }

  await api(`/api/rooms/${mainRoom.id}/join`, { method: 'POST', token: users.dm.token })
  await api(`/api/rooms/${mainRoom.id}/join`, { method: 'POST', token: users.p1.token })

  await api(`/api/rooms/${greenRoom.id}/move-user`, {
    method: 'POST',
    token: users.dm.token,
    body: {
      sessionId: session.id,
      targetUserId: users.p2.user.id,
    },
  })

  const p1Room = await connectRoom(users.p1.token, session.id, mainRoom.id, 'room')
  const p2Room = await connectRoom(users.p2.token, session.id, greenRoom.id, 'room')
  const dmMainRoom = await connectRoom(users.dm.token, session.id, mainRoom.id, 'room')
  const dmMainPublisher = await publishSyntheticMic(dmMainRoom.room, 'dm-main', 440)

  await waitFor(
    () => p1Room.monitor.framesFrom(users.dm.user.id) >= config.minFrames,
    'player 1 main-room hears DM'
  )

  await delay(1500)

  const offState = {
    player1MainFrames: p1Room.monitor.framesFrom(users.dm.user.id),
    player2GreenFrames: p2Room.monitor.framesFrom(users.dm.user.id),
    player2GreenSubscriptions: p2Room.monitor.subsFrom(users.dm.user.id),
  }

  await api('/api/audio/voice-of-god', {
    method: 'POST',
    token: users.dm.token,
    body: { sessionId: session.id, enabled: true },
  })

  const p1Vog = await connectRoom(users.p1.token, session.id, null, 'voice_of_god')
  const p2Vog = await connectRoom(users.p2.token, session.id, null, 'voice_of_god')
  const dmVogRoom = await connectRoom(users.dm.token, session.id, null, 'voice_of_god')
  const dmVogPublisher = await publishSyntheticMic(dmVogRoom.room, 'dm-vog', 660)

  await waitFor(
    () => p1Vog.monitor.framesFrom(users.dm.user.id) >= config.minFrames,
    'player 1 voice-of-god hears DM'
  )
  await waitFor(
    () => p2Vog.monitor.framesFrom(users.dm.user.id) >= config.minFrames,
    'player 2 voice-of-god hears DM'
  )

  const onState = {
    player1VogFrames: p1Vog.monitor.framesFrom(users.dm.user.id),
    player2VogFrames: p2Vog.monitor.framesFrom(users.dm.user.id),
  }

  const vogBeforeSwitch = {
    p1Frames: p1Vog.monitor.framesFrom(users.dm.user.id),
    p2Frames: p2Vog.monitor.framesFrom(users.dm.user.id),
    p1Unsubs: p1Vog.monitor.unsubsFrom(users.dm.user.id),
    p2Unsubs: p2Vog.monitor.unsubsFrom(users.dm.user.id),
  }

  await dmMainPublisher.stop()

  const dmGreenRoom = await connectRoom(users.dm.token, session.id, greenRoom.id, 'room')
  const dmGreenPublisher = await publishSyntheticMic(dmGreenRoom.room, 'dm-green', 550)

  await waitFor(
    () => p1Vog.monitor.framesFrom(users.dm.user.id) >= vogBeforeSwitch.p1Frames + config.minFrames,
    'player 1 voice-of-god continues after room switch'
  )
  await waitFor(
    () => p2Vog.monitor.framesFrom(users.dm.user.id) >= vogBeforeSwitch.p2Frames + config.minFrames,
    'player 2 voice-of-god continues after room switch'
  )
  await waitFor(
    () => p2Room.monitor.framesFrom(users.dm.user.id) >= config.minFrames,
    'player 2 selected-room hears DM after switch'
  )

  const switchState = {
    p1VogFrameDelta: p1Vog.monitor.framesFrom(users.dm.user.id) - vogBeforeSwitch.p1Frames,
    p2VogFrameDelta: p2Vog.monitor.framesFrom(users.dm.user.id) - vogBeforeSwitch.p2Frames,
    p1VogUnsubDelta: p1Vog.monitor.unsubsFrom(users.dm.user.id) - vogBeforeSwitch.p1Unsubs,
    p2VogUnsubDelta: p2Vog.monitor.unsubsFrom(users.dm.user.id) - vogBeforeSwitch.p2Unsubs,
  }

  const p1RoomBeforeDisable = p1Room.monitor.framesFrom(users.dm.user.id)
  const p2RoomBeforeDisable = p2Room.monitor.framesFrom(users.dm.user.id)
  const p1VogBeforeDisable = p1Vog.monitor.framesFrom(users.dm.user.id)
  const p2VogBeforeDisable = p2Vog.monitor.framesFrom(users.dm.user.id)

  await api('/api/audio/voice-of-god', {
    method: 'POST',
    token: users.dm.token,
    body: { sessionId: session.id, enabled: false },
  })
  await dmVogPublisher.stop()

  await delay(2000)

  const tailAt2s = {
    p1: p1Vog.monitor.framesFrom(users.dm.user.id) - p1VogBeforeDisable,
    p2: p2Vog.monitor.framesFrom(users.dm.user.id) - p2VogBeforeDisable,
  }

  await delay(2000)

  const finalDisabledState = {
    player1MainRoomDelta: p1Room.monitor.framesFrom(users.dm.user.id) - p1RoomBeforeDisable,
    player2GreenRoomDelta: p2Room.monitor.framesFrom(users.dm.user.id) - p2RoomBeforeDisable,
    player1VogDeltaAfter4s: p1Vog.monitor.framesFrom(users.dm.user.id) - p1VogBeforeDisable,
    player2VogDeltaAfter4s: p2Vog.monitor.framesFrom(users.dm.user.id) - p2VogBeforeDisable,
    player1VogUnsubs: p1Vog.monitor.unsubsFrom(users.dm.user.id),
    player2VogUnsubs: p2Vog.monitor.unsubsFrom(users.dm.user.id),
  }

  await dmGreenPublisher.stop()

  return {
    ok: true,
    sessionId: session.id,
    matrix: {
      voiceOfGodOff_selectedRoomOnly: {
        passed: offState.player2GreenFrames === 0 && offState.player2GreenSubscriptions === 0,
        evidence: offState,
      },
      voiceOfGodOn_dmHeardInAllRooms: {
        passed:
          onState.player1VogFrames >= config.minFrames &&
          onState.player2VogFrames >= config.minFrames,
        evidence: onState,
      },
      roomSwitchWhileVoiceOfGodOn_uninterruptedGlobalVoice: {
        passed:
          switchState.p1VogFrameDelta >= config.minFrames &&
          switchState.p2VogFrameDelta >= config.minFrames &&
          switchState.p1VogUnsubDelta === 0 &&
          switchState.p2VogUnsubDelta === 0,
        evidence: switchState,
      },
      voiceOfGodDisable_behavior: {
        passed:
          finalDisabledState.player2GreenRoomDelta >= config.minFrames &&
          finalDisabledState.player1MainRoomDelta <= 1 &&
          finalDisabledState.player1VogDeltaAfter4s <= 3 &&
          finalDisabledState.player2VogDeltaAfter4s <= 3,
        evidence: {
          tailAt2s,
          finalAt4s: finalDisabledState,
        },
      },
    },
  }
}

async function main() {
  try {
    const summary = await runVerification()
    console.log(JSON.stringify(summary, null, 2))
  } catch (error) {
    console.error('VERIFY_FAILURE')
    console.error(error && error.stack ? error.stack : String(error))
    process.exit(1)
  }
}

void main()
