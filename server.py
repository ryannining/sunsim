from flask import Flask, send_from_directory, request, jsonify
import requests
from datetime import datetime, timedelta
import json

app = Flask(__name__)

# Cache storage
cache = {}
CACHE_DURATION = timedelta(hours=24)

def generate_cache_key(params):
    # Sort params to ensure consistent keys regardless of parameter order
    sorted_params = sorted(params.items())
    return json.dumps(sorted_params)

def get_cached_response(cache_key):
    if cache_key in cache:
        data, timestamp = cache[cache_key]
        if datetime.now() - timestamp < CACHE_DURATION:
            return data
        else:
            del cache[cache_key]
    return None

@app.route('/')
def serve_index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('.', path)

@app.route('/api/horizons', methods=['GET'])
def proxy_horizons():
    base_url = 'https://ssd.jpl.nasa.gov/api/horizons.api'
    params = request.args.to_dict()
    
    # Check cache first
    cache_key = generate_cache_key(params)
    cached_response = get_cached_response(cache_key)
    
    if cached_response:
        return cached_response, 200
    
    # If not in cache, fetch from API
    try:
        response = requests.get(base_url, params=params)
        if response.status_code == 200:
            # Store in cache
            cache[cache_key] = (response.text, datetime.now())
        return response.text, response.status_code
    except requests.RequestException as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=3100)
