# Jam

Jam is a self-hosted synchronized audio listening server. It streams audio to multiple concurrent listeners from a single synchronized audio source, synchronized in real time via WebSockets and broadcast over a continuous chunked MP3 HTTP stream.

## Features

### Synchronized Audio Broadcast
- Single room broadcast: all connected listeners receive the same continuous, synchronized audio stream (128 kbps 44.1 kHz stereo CBR MP3).
- Low-latency buffer: listeners receive a short buffer ring backlog upon connection and track the live broadcast head.
- Silence generator: plays seamless looped silence frames when the queue is idle, maintaining client stream connections without disconnection.
- Auto-pause on empty room: automatically pauses playback when zero listeners are present and resumes when a listener rejoins.

### Audio Pipeline & Transcoding
- Resolution via yt-dlp: extracts direct media stream URLs without requiring third-party API keys or quotas.
- Transcoding via ffmpeg: transcodes audio streams to MP3 on the fly.
- Gapless prefetching: automatically spawns the next track's encoder ahead of time to allow gapless playback transitions.

### Queue & Playback Rules
- Shared FIFO queue: tracks play sequentially in the order queued.
- Per-user queue limit: users can queue up to a configurable number of waiting songs (default: 5, controlled by `MAX_QUEUE_PER_USER`).
- Track validation: enforces maximum track length (`MAX_TRACK_SECONDS`), rejects live streams, and blocks duplicate songs that are currently playing or already queued.
- Queue cooldown: enforces a minimum delay between consecutive queue submissions per user (`ENQUEUE_COOLDOWN_MS`).
- Requester playback control: the user who queued the currently playing track can pause and resume playback room-wide.
- Song removal: users can remove their own waiting songs from the queue at any time. Removing their own currently playing song triggers an immediate skip.
- Democratic skip voting: non-requester listeners can vote to skip the current track. A skip occurs when a strict majority (`floor(N / 2) + 1`) of active room listeners vote to skip.

### User History
- Append-only event tracking in SQLite.
- Tracks play count, song metadata, and timestamp for each user.
- Queryable with search filtering, pagination, and top-played aggregations.

### Authentication & Authorization
- Invite-only registration: new user registration requires a shared secret `INVITE_CODE`.
- Session management: cookie-backed session storage in SQLite with sliding window expiration and automatic cleanup of expired sessions.
- Rate limiting: in-memory sliding window rate limiters protect authentication and search endpoints.

### REST & WebSocket API
- `POST /api/play`: programmatic endpoint to add a track to the queue using a Bearer token (`API_TOKEN`). Requires that the specified user exists in the database and is currently connected to the room as an active listener.
- `POST /api/queue`: queues a song using session authentication by video ID, URL, or history ID.
- `DELETE /api/queue/:itemId`: removes a waiting song owned by the authenticated user.
- `PUT /api/playback`: toggles room-wide pause/resume state (allowed only for the current song requester).
- `PUT /api/skip-vote`: casts or withdraws a skip vote for the currently playing track.
- `GET /api/search`: queries YouTube video results via yt-dlp with server-side caching.
- `GET /stream`: continuous chunked HTTP MP3 audio stream for active listeners.
- `GET /ws`: WebSocket endpoint providing real-time room state synchronization (track metadata, position, queue, listeners, votes).

## Prerequisites

- Bun (>= 1.2.0)
- ffmpeg (installed in system PATH or configured via `FFMPEG_PATH`)
- yt-dlp (installed in system PATH or configured via `YTDLP_PATH`)

## Configuration

Configuration is loaded from environment variables or a `.env` file in the project root:

| Variable | Default | Description |
| --- | --- | --- |
| `INVITE_CODE` | (required) | Secret token required to register new user accounts |
| `PUBLIC_ORIGIN` | (required) | Canonical origin URL (e.g. `http://localhost:3000`) |
| `API_TOKEN` | (optional) | Shared Bearer token for programmatic access via `/api/play` |
| `HOST` | `127.0.0.1` | Network interface to bind the HTTP and WebSocket server |
| `PORT` | `3000` | Port number to bind the server |
| `DB_PATH` | `./data/app.db` | Filesystem path to SQLite database |
| `MAX_QUEUE_PER_USER` | `5` | Maximum number of songs a single user can have waiting in the queue |
| `MAX_TRACK_SECONDS` | `1200` | Maximum track duration allowed (in seconds) |
| `ENQUEUE_COOLDOWN_MS` | `2000` | Minimum milliseconds required between queue submissions per user |
| `SESSION_TTL_DAYS` | `30` | Session lifetime in days |
| `LISTENER_GRACE_MS` | `12000` | Disconnect grace period before dropping presence and votes |
| `STREAM_LEAD_SECONDS` | `3` | Broadcast lead buffer in seconds |
| `PREFETCH_SECONDS` | `20` | Seconds before track end to trigger next track prefetch |
| `YTDLP_PATH` | `""` | Optional explicit path to `yt-dlp` executable |
| `FFMPEG_PATH` | `""` | Optional explicit path to `ffmpeg` executable |
| `YTDLP_COOKIES_PATH` | `""` | Optional path to cookies file for `yt-dlp` |
| `YTDLP_JS_RUNTIME` | `""` | Optional JavaScript runtime passed to `yt-dlp` |
| `YTDLP_EXTRA_ARGS` | `--extractor-args youtube:player_client=android` | Extra CLI flags passed to `yt-dlp` |

## Getting Started

1. Clone the repository and install dependencies:
```bash
bun install
```

2. Create and configure environment variables:
```bash
cp .env.example .env
```
Edit `.env` to set `INVITE_CODE`, `PUBLIC_ORIGIN`, and optionally `API_TOKEN`.

3. Verify environment and binary dependencies:
```bash
bun run doctor
```

4. Build the application:
```bash
bun run build
```

5. Start the server:
```bash
bun start
```

For development with hot reloading:
```bash
bun run dev
```

## Programmatic API Usage

### Enqueue via API (`POST /api/play`)

The `/api/play` endpoint allows external scripts, bots, or tools to queue tracks on behalf of a user.

Requirements:
- Header: `Authorization: Bearer <API_TOKEN>`
- Body: JSON object with `url` (YouTube video URL or 11-character video ID) and `user` (username).
- Preconditions: The user must exist in the database and must currently be joined as an active listener in the room.

Example request:
```bash
curl -X POST http://127.0.0.1:3000/api/play \
  -H "Authorization: Bearer <API_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "user": "alice"}'
```

Successful response (`200 OK`):
```json
{
  "ok": true,
  "success": true,
  "item": {
    "itemId": "c6a1b2d3-...",
    "videoId": "dQw4w9WgXcQ",
    "title": "Track Title",
    "channel": "Channel Name",
    "durationSec": 213,
    "seedArgb": -1234567,
    "requestedBy": {
      "id": 1,
      "displayName": "Alice"
    },
    "queuedAt": 1740000000000
  }
}
```

Error responses:
- `401 UNAUTHENTICATED`: Missing or invalid Bearer token, or `API_TOKEN` not configured.
- `400 VALIDATION`: Missing `url` or `user` fields, or invalid video ID.
- `404 NOT_FOUND`: Specified username does not exist in the database.
- `409 NOT_LISTENING`: Specified user is not currently in the room.
- `409 QUEUE_FULL`: User has reached the maximum allowed waiting tracks (`MAX_QUEUE_PER_USER`).
- `409 DUPLICATE`: The track is already currently playing or waiting in the queue.
- `422 TOO_LONG`: Track duration exceeds `MAX_TRACK_SECONDS`.
- `429 RATE_LIMITED`: Submission made too quickly within the cooldown period.

## Management Scripts

- `bun run adduser`: Interactively create a user account.
- `bun run reset-password`: Reset a user's password directly in the database.
- `bun run backup`: Create a point-in-time backup of the SQLite database using WAL checkpointing.
- `bun run yt-smoke`: Test yt-dlp extraction against YouTube endpoints.
- `bun run stream-test`: Verify ffmpeg streaming and silence frame generation.
- `bun test`: Run the test suite.
- `bun run typecheck`: Run TypeScript type checking across the project.
