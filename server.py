import base64
import json
import os
from pathlib import Path
from flask import Flask, jsonify, request, send_from_directory
from dotenv import load_dotenv
from google import genai
from google.genai import types

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / '.env')

app = Flask(__name__, static_folder=str(ROOT), static_url_path='')
API_KEY = os.getenv('GEMINI_API_KEY', '').strip()
MODEL = os.getenv('GEMMA_MODEL', 'gemma-4-26b-a4b-it').strip()


def ai_client():
    if not API_KEY:
        return None
    return genai.Client(api_key=API_KEY)


def extract_json(text):
    text = (text or '').strip()
    try:
        return json.loads(text)
    except Exception:
        pass
    start, end = text.find('{'), text.rfind('}')
    if start >= 0 and end > start:
        try:
            return json.loads(text[start:end + 1])
        except Exception:
            return None
    return None


@app.get('/api/health')
def health():
    return jsonify({'ok': True, 'gemmaConfigured': bool(API_KEY), 'model': MODEL})


@app.post('/api/analyze-incident')
def analyze_incident():
    if not API_KEY:
        return jsonify({
            'ok': False,
            'configured': False,
            'message': 'Gemma is not configured. Add GEMINI_API_KEY to .env.'
        }), 503

    data = request.get_json(silent=True) or {}
    image_data = data.get('imageData')
    image_mime = data.get('imageMime', 'image/jpeg')
    incident_type = data.get('type', 'Other')
    description = data.get('description', '')
    location = data.get('location', 'Unknown')
    care = data.get('care', 'standard')

    prompt = f'''You are Nivara, a disaster-intelligence decision-support assistant.
Analyze the reported incident using the text, location, user assistance need, and optional image.
Do NOT claim certainty, predict casualties, or give engineering-grade safety guarantees. This is a prototype assessment that requires human verification.
Return ONLY valid JSON with these keys:
{{
  "title": "short incident title",
  "risk": "LOW|MODERATE|HIGH|CRITICAL",
  "confidence": 0-100,
  "summary": "1-2 sentence evidence-based summary",
  "evidence": ["specific visible/reported evidence", "another evidence point"],
  "actions": ["immediate practical action", "another action"],
  "escalation": "WHO/WHAT should be alerted next",
  "verification": "what a human responder should verify"
}}
Incident type: {incident_type}
Description: {description}
Location: {location}
Assistance mode: {care}
'''

    contents = [prompt]
    if image_data:
        try:
            raw = image_data.split(',', 1)[1] if ',' in image_data else image_data
            image_bytes = base64.b64decode(raw)
            contents.append(types.Part.from_bytes(data=image_bytes, mime_type=image_mime))
        except Exception:
            return jsonify({'ok': False, 'message': 'The uploaded image could not be decoded.'}), 400

    try:
        client = ai_client()
        response = client.models.generate_content(
            model=MODEL,
            contents=contents,
            config=types.GenerateContentConfig(temperature=0.2)
        )
        raw_text = getattr(response, 'text', '') or ''
        parsed = extract_json(raw_text)
        if not parsed:
            parsed = {
                'title': f'{incident_type} assessment',
                'risk': 'MODERATE',
                'confidence': 60,
                'summary': raw_text[:800],
                'evidence': [],
                'actions': ['Verify the scene with a trained responder before taking high-risk action.'],
                'escalation': 'Local emergency/responder team as appropriate.',
                'verification': 'Human verification required.'
            }
        return jsonify({'ok': True, 'configured': True, 'model': MODEL, 'analysis': parsed})
    except Exception as exc:
        return jsonify({'ok': False, 'message': f'Gemma analysis failed: {type(exc).__name__}: {exc}'}), 502


@app.post('/api/analyze-scenario')
def analyze_scenario():
    if not API_KEY:
        return jsonify({'ok': False, 'configured': False, 'message': 'Gemma is not configured. Add GEMINI_API_KEY to .env.'}), 503
    data = request.get_json(silent=True) or {}
    prompt = f"""You are Nivara, a disaster-intelligence decision-support assistant.
Analyze a hypothetical disaster scenario for planning. This is NOT a forecast. Do not claim certainty, casualty predictions, or engineering-grade guarantees.
Return ONLY valid JSON with keys: summary (short paragraph), priorities (array of 3 practical verification/response priorities).
Scenario type: {data.get('type','Flood')}
Hazard intensity: {data.get('v',6)}/10
Exposure: {data.get('exposure','Medium')}
Prototype projected risk: {data.get('risk',72)}/100
Approximate affected zones: {data.get('zones',3)}
"""
    try:
        client = ai_client()
        response = client.models.generate_content(
            model=MODEL, contents=prompt,
            config=types.GenerateContentConfig(temperature=0.2)
        )
        parsed = extract_json(getattr(response, 'text', '') or '')
        if not parsed:
            parsed = {'summary': 'Use the simulation as a planning prompt and verify changing conditions with official sources and responders.', 'priorities': ['Verify the highest-risk locations first.', 'Check vulnerable-person and access requests.', 'Reassess routes and safe-zone availability.']}
        return jsonify({'ok': True, 'configured': True, 'model': MODEL, 'briefing': parsed})
    except Exception as exc:
        return jsonify({'ok': False, 'message': f'Gemma scenario briefing failed: {type(exc).__name__}: {exc}'}), 502


@app.get('/')
def index():
    return send_from_directory(ROOT, 'index.html')


if __name__ == '__main__':
    app.run(host='127.0.0.1', port=int(os.getenv('PORT', '5000')), debug=False)
