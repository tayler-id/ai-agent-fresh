import { YoutubeTranscript } from 'youtube-transcript-plus';
import { invokeMcpTool } from './mcpClient.js';

export async function fetchTranscript(url) {
  const videoIdMatch = url.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/);
  const videoId = videoIdMatch?.[1];
  if (!videoId) throw new Error('Invalid YouTube URL');

  // /* 1️⃣ try MCP first */
  // try {
  //   const mcp = await invokeMcpTool('get_youtube_video_transcript', { url });
  //   if (mcp?.transcript) return mcp.transcript;
  // } catch (_) {/* ignore and fall through */}

  /* 2️⃣ fallback to local library */
  try {
    const segments = await YoutubeTranscript.fetchTranscript(videoId);
    if (segments?.length) return segments.map(s => s.text).join(' ');
    throw new Error('No transcript segments found');
  } catch (err) {
    // Provide more detailed error messages if possible
    if (err.message && err.message.includes('Could not retrieve transcript')) {
      throw new Error('No captions available for this video (captions are disabled or not provided by the uploader).');
    }
    if (err.message && err.message.includes('Video unavailable')) {
      throw new Error('Video is private, deleted, or restricted.');
    }
    if (err.message && err.message.includes('429')) {
      throw new Error('YouTube rate limit reached. Please try again later.');
    }
    // Fallback to generic error
    throw new Error('Transcript not found via MCP or local fallback. Reason: ' + (err.message || 'Unknown error'));
  }
}
