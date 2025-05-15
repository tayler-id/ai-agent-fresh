# Local YouTube Transcript API Server

This server allows your Node.js agent to fetch YouTube video transcripts reliably using the `youtube-transcript-api` Python library.

## Setup

1. **Install Python dependencies:**
   ```sh
   pip install flask youtube-transcript-api
   ```

2. **Run the server:**
   ```sh
   python youtube_transcript_server.py
   ```
   The server will start on `http://localhost:8765`.

## Usage

- The server exposes a GET endpoint:
  ```
  http://localhost:8765/transcript?video_id=VIDEO_ID
  ```
  Example:
  ```
  http://localhost:8765/transcript?video_id=iG9CE55wbtY
  ```

- The response will be:
  ```json
  {
    "transcript": "Full transcript text here..."
  }
  ```
  or an error message if no transcript is available.

## Integration

- The Node.js agent should extract the video ID from the YouTube URL and call this endpoint to fetch the transcript.
- This approach avoids YouTube API rate limits and OAuth requirements for most public videos.

## Notes

- This server must be running locally for the agent to fetch transcripts.
- For private or region-locked videos, transcript availability may still be limited.
