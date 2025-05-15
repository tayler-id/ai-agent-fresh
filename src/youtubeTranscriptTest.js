import { YoutubeTranscript } from 'youtube-transcript-plus';

async function test() {
  const videoId = '0sIws94A1U0'; // New test video ID
  try {
    const segments = await YoutubeTranscript.fetchTranscript(videoId);
    if (segments?.length) {
      console.log('Transcript fetched successfully. First 3 segments:');
      console.log(segments.slice(0, 3));
    } else {
      console.error('No transcript segments found');
    }
  } catch (err) {
    console.error('Error fetching transcript:', err.message);
  }
}

test();
