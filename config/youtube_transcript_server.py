from flask import Flask, request, jsonify
from youtube_transcript_api import YouTubeTranscriptApi, TranscriptsDisabled, NoTranscriptFound

app = Flask(__name__)

@app.route('/transcript', methods=['GET'])
def get_transcript():
    video_id = request.args.get('video_id')
    if not video_id:
        return jsonify({'error': 'Missing video_id parameter'}), 400
    try:
        transcript = YouTubeTranscriptApi.get_transcript(video_id)
        text = ' '.join([seg['text'] for seg in transcript])
        return jsonify({'transcript': text})
    except TranscriptsDisabled:
        return jsonify({'error': 'Transcripts are disabled for this video.'}), 404
    except NoTranscriptFound:
        return jsonify({'error': 'No transcript found for this video.'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(port=8765)
