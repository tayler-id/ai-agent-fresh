import { YoutubeTranscript } from 'youtube-transcript-plus';

export async function fetchTranscript(url) {
  const videoIdMatch = url.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/);
  const videoId = videoIdMatch?.[1];
  if (!videoId) throw new Error('Invalid YouTube URL');

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
    throw new Error('Transcript not found. Reason: ' + (err.message || 'Unknown error'));
  }
}
