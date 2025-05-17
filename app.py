import os
from flask import Flask, request, jsonify, render_template, send_from_directory
from openai import OpenAI
import json

app = Flask(__name__, static_folder='static', template_folder='templates')

# OpenAI API 키 설정 (Replit Secrets에서 가져옴)
OPENAI_API_KEY = os.environ.get('OPENAI_API_KEY')
openai_client = OpenAI(api_key=OPENAI_API_KEY)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/static/<path:path>')
def serve_static(path):
    return send_from_directory('static', path)

@app.route('/api/chat', methods=['POST'])
def chat():
    if not OPENAI_API_KEY:
        return jsonify({"error": "OpenAI API 키가 설정되지 않았습니다."}), 500
    
    data = request.json
    user_message = data.get('message', '')
    
    if not user_message:
        return jsonify({"error": "메시지가 없습니다."}), 400
    
    try:
        # OpenAI API 호출
        response = openai_client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": "너는 신한은행 네트워크 전문가로서 정확하고 친절하게 답변해줘."},
                {"role": "user", "content": user_message}
            ]
        )
        
        # 응답 추출
        bot_reply = response.choices[0].message.content
        
        return jsonify({"reply": bot_reply})
    
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)